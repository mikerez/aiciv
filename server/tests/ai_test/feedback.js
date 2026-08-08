'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');

function sparse(values) {
    const result = [];
    for (let index = 0; index < values.length; index++) {
        const value = Number(values[index]);
        if (Number.isFinite(value) && Math.abs(value) > 0.000001) {
            result.push(`${index}:${value.toFixed(6)}`);
        }
    }
    return result.join(',');
}

function targetForSlots(slots, correctSlot, explicit = null) {
    const target = new Float32Array(72);
    for (const slot of slots) target[slot] = slot === correctSlot ? 0.9 : -0.9;
    if (explicit) for (const [slot, value] of Object.entries(explicit)) target[Number(slot)] = Number(value);
    return target;
}

class FeedbackLibrary {
    constructor(directory = path.join(root, 'ai_player')) {
        this.directory = directory;
        this.entries = {strategy: [], action: [], economics: []};
        this.known = {strategy: new Set(), action: new Set(), economics: new Set()};
        for (const kind of Object.keys(this.entries)) this.loadKnown(kind);
    }

    filename(kind) { return path.join(this.directory, `${kind}-feedback.situations`); }

    loadKnown(kind) {
        const filename = this.filename(kind);
        if (!fs.existsSync(filename)) return;
        for (const line of fs.readFileSync(filename, 'utf8').split('\n')) {
            if (line && line[0] !== '#' && line.includes('|')) this.known[kind].add(this.key(line));
        }
    }

    key(machineRow) {
        const encodedDecision = machineRow.split('|').slice(0, 4).join('|');
        return crypto.createHash('sha256').update(encodedDecision).digest('hex');
    }

    add(kind, {input, slots, correctSlot, explicitTarget = null, scenario, turn,
        observed, expected, candidates, opinion}) {
        const target = targetForSlots(slots, correctSlot, explicitTarget);
        const description = `${scenario} turn ${turn}: expected ${expected}; observed ${observed}`;
        const row = `${correctSlot}|${slots.join(',')}|${sparse(input)}|${sparse(target)}|${description}`;
        const key = this.key(row);
        if (this.known[kind].has(key)) return false;
        this.known[kind].add(key);
        this.entries[kind].push({
            row,
            comments: [
                `Feedback scenario: ${scenario}, simulated turn ${turn}.`,
                `Policy opinion: ${opinion}`,
                `Observed model decision: ${observed}. Expected decision: ${expected}.`,
                `The browser encoded this exact production input; candidate order was: ${candidates.join(' | ')}.`,
                `Output slots ${slots.join(',')} score those declared alternatives; output[${correctSlot}] is the required alternative.`,
            ],
        });
        return true;
    }

    write() {
        const counts = {};
        for (const kind of Object.keys(this.entries)) {
            const filename = this.filename(kind);
            if (!fs.existsSync(filename)) {
                fs.writeFileSync(filename,
                    '# AI Civ runtime feedback situations v1\n'
                    + '# Generated from long-horizon JS + PHP integration scenarios.\n'
                    + '# Each comment identifies the game state, policy expectation, observed decision, and exact candidate order.\n');
            }
            if (this.entries[kind].length) {
                let body = '';
                for (const entry of this.entries[kind]) {
                    body += '\n' + entry.comments.map(comment => '# ' + comment).join('\n') + '\n' + entry.row + '\n';
                }
                fs.appendFileSync(filename, body);
            }
            counts[kind] = this.entries[kind].length;
            this.entries[kind] = [];
        }
        return counts;
    }
}

function candidateText(candidate) {
    if (!candidate) return 'none';
    let text = candidate.command || candidate.unitTypeId || 'idle';
    if (candidate.building) text += ':' + candidate.building;
    if (candidate.target) text += `@${candidate.target.i},${candidate.target.j}`;
    if (candidate.state) text += `:${candidate.state}`;
    return text;
}

function bestActionCandidate(context, scenario, actionResult) {
    const ai = context.aiPlayer;
    const unitIndex = ai.lastActionUnitIndices[0];
    const unit = unitIndex === undefined ? null : context._units[unitIndex];
    const candidates = ai.lastActionCandidates || [];
    if (!unit || !candidates.length) return null;
    const matching = predicate => candidates.findIndex(predicate);
    let expected = -1;
    let reason = scenario.opinion;

    if (unit.unitTypeId === 'settlers') {
        const build = matching(candidate => candidate.command === 'build_city');
        const score = ai.cityPlotScore(unit.coord.i, unit.coord.j, scenario.playerId);
        if (build >= 0 && score >= 0.40) expected = build;
        else {
            let bestScore = -Infinity;
            candidates.forEach((candidate, index) => {
                if (candidate.command !== 'goto' || !candidate.target) return;
                const value = ai.cityPlotScore(candidate.target.i, candidate.target.j, scenario.playerId);
                if (value > bestScore) { bestScore = value; expected = index; }
            });
        }
    } else if (unit.unitTypeId === 'worker') {
        const planned = scenario.expect.modifier;
        const directOrder = ['build_improvement', 'irrigate', 'chop_forest', 'road_to'];
        expected = matching(candidate => {
            if (!directOrder.includes(candidate.command) || !candidate.target
                || candidate.target.i !== unit.coord.i || candidate.target.j !== unit.coord.j) return false;
            if (!planned) return candidate.command !== 'road_to' || candidate.state === 'road';
            if (planned.name === 'irrigation') return candidate.command === 'irrigate';
            if (planned.name === 'chop_forest') return candidate.command === 'chop_forest';
            if (planned.name === 'road') return candidate.command === 'road_to' && candidate.state === 'road';
            return candidate.command === 'build_improvement' && candidate.building === planned.name;
        });
        if (expected < 0) {
            let bestScore = -Infinity;
            candidates.forEach((candidate, index) => {
                if (candidate.command !== 'goto' || !candidate.target) return;
                const job = ai.workerTileJobScore(candidate.target.i, candidate.target.j, scenario.playerId);
                const score = job ? job.score : -Infinity;
                if (score > bestScore) { bestScore = score; expected = index; }
            });
        }
    } else if (unit.type === 2) {
        expected = matching(candidate => candidate.command === 'attack');
        if (expected < 0 && (scenario.name.includes('defend') || scenario.name.includes('hill'))) {
            expected = matching(candidate => candidate.command === 'wait' && candidate.state === 'fortified');
        }
        if (expected < 0) {
            const enemy = ai.nearestEnemyCoord(unit.coord, scenario.playerId);
            let bestDistance = Infinity;
            candidates.forEach((candidate, index) => {
                if (candidate.command !== 'goto' || !candidate.target || !enemy) return;
                const distance = Math.abs(candidate.target.i - enemy.i) + Math.abs(candidate.target.j - enemy.j);
                if (distance < bestDistance) { bestDistance = distance; expected = index; }
            });
        }
    }
    if (expected < 0) return null;
    const observed = actionResult.commands && actionResult.commands[0]
        ? actionResult.commands[0].record : -1;
    return {unit, expected, observed, candidates, reason};
}

function bestEconomicsCandidate(context, scenario, economicsResult) {
    const ai = context.aiPlayer;
    const candidates = ai.lastEconomicsCandidates || [];
    if (!candidates.length) return null;
    const own = context._units;
    const military = own.filter(unit => unit.type === 2).length;
    const workers = own.filter(unit => unit.unitTypeId === 'worker').length;
    const settlers = own.filter(unit => unit.unitTypeId === 'settlers').length;
    let wanted;
    if (military === 0 || scenario.name.includes('war') || scenario.name.includes('attack') || scenario.name.includes('defend')) {
        wanted = ['warrior', 'slinger', 'archer'];
    } else if (scenario.name.includes('worker') && workers === 0) {
        wanted = ['worker'];
    } else if (scenario.name.includes('expand') && settlers === 0) {
        wanted = ['settlers'];
    } else {
        wanted = ['warrior', 'slinger', 'archer', 'worker', 'settlers'];
    }
    let expected = -1;
    for (const id of wanted) {
        expected = candidates.findIndex(candidate => candidate.unitTypeId === id);
        if (expected >= 0) break;
    }
    if (expected < 0) return null;
    const observed = economicsResult.decisions && economicsResult.decisions[0]
        ? economicsResult.decisions[0].record : -1;
    return {expected, observed, candidates, wanted};
}

function collectDecisionFeedback(library, context, scenario, turn, result) {
    let added = 0;
    const technologyByScenario = {
        worker_improves_copper_hill: 68,
        worker_improves_cattle: 69,
        worker_builds_irrigation: 71,
    };
    const technologySlot = technologyByScenario[scenario.name];
    const technologySlots = [68, 69, 70, 71];
    const observedTechnology = technologySlots.reduce((best, slot) =>
        result.strategy.output[slot] > result.strategy.output[best] ? slot : best, technologySlots[0]);
    if (technologySlot !== undefined && observedTechnology !== technologySlot) {
        const labels = ['Mining', 'Animal Husbandry', 'Masonry', 'Irrigation'];
        added += library.add('strategy', {
            input: result.strategy.input, slots: technologySlots, correctSlot: technologySlot,
            scenario: scenario.name, turn,
            observed: labels[observedTechnology - 68], expected: labels[technologySlot - 68],
            candidates: labels, opinion: scenario.opinion
                + ' Technology priority should follow the visible City/Settler terrain and resource context.',
        }) ? 1 : 0;
    }
    const action = bestActionCandidate(context, scenario, result.action);
    if (action && action.observed !== action.expected) {
        added += library.add('action', {
            input: result.action.input, slots: action.candidates.map((_, index) => index), correctSlot: action.expected,
            scenario: scenario.name, turn,
            observed: candidateText(action.candidates[action.observed]), expected: candidateText(action.candidates[action.expected]),
            candidates: action.candidates.map(candidateText), opinion: action.reason,
        }) ? 1 : 0;
    }
    const economicsRelevant = scenario.name === 'produce_first_military'
        || scenario.name === 'developed_civilization_at_war';
    const economics = economicsRelevant ? bestEconomicsCandidate(context, scenario, result.economics) : null;
    if (economics && economics.observed !== economics.expected) {
        added += library.add('economics', {
            input: result.economics.input, slots: economics.candidates.map((_, index) => index), correctSlot: economics.expected,
            scenario: scenario.name, turn,
            observed: candidateText(economics.candidates[economics.observed]), expected: candidateText(economics.candidates[economics.expected]),
            candidates: economics.candidates.map(candidateText), opinion: scenario.opinion,
        }) ? 1 : 0;
    }
    return added;
}

module.exports = {FeedbackLibrary, candidateText, collectDecisionFeedback};

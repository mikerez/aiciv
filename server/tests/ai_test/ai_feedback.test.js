#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const {spawnSync} = require('node:child_process');
const {FeedbackLibrary} = require('./feedback');
const {runScenario} = require('./runner');
const {scenarios} = require('./scenarios');

const root = path.resolve(__dirname, '../../..');
const modelDirectory = path.join(root, 'ai_player');
const rounds = Math.max(1, Number(process.env.AICIV_AI_FEEDBACK_ROUNDS || 50));
const startRound = Math.max(0, Number(process.env.AICIV_AI_FEEDBACK_START || 0));
const finalValidation = process.env.AICIV_AI_FEEDBACK_FINAL_VALIDATION !== '0';
const readOnly = process.env.AICIV_AI_FEEDBACK_READONLY === '1';

function run(command, args) {
    const result = spawnSync(command, args, {cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
    if (result.status !== 0) {
        throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
    }
    return result.stdout;
}

function synchronizeRawModels() {
    const baseline = {};
    for (const kind of ['strategy', 'action', 'economics']) {
        const compressed = fs.readFileSync(path.join(modelDirectory, `${kind}.db.gz`));
        baseline[kind] = zlib.gunzipSync(compressed);
        fs.writeFileSync(path.join(modelDirectory, `${kind}.db`), baseline[kind]);
    }
    return baseline;
}

function trainChangedModels(counts, baseline) {
    for (const kind of ['strategy', 'action', 'economics']) {
        if (!counts[kind]) continue;
        fs.writeFileSync(path.join(modelDirectory, `${kind}.db`), baseline[kind]);
        const output = run(path.join(modelDirectory, 'train_ai_player'),
            ['20', '0.001', kind, '--resume', '--skip-tests']);
        const summary = output.split('\n').filter(line => line.includes('loss=') || line.includes('accuracy=')).slice(-2);
        console.log(`  retrained ${kind}: ${summary.join(' | ')}`);
        const raw = fs.readFileSync(path.join(modelDirectory, `${kind}.db`));
        fs.writeFileSync(path.join(modelDirectory, `${kind}.db.gz`), zlib.gzipSync(raw, {level: 9}));
    }
}

function printResult(prefix, result) {
    const status = result.failures.length ? 'FAIL' : 'PASS';
    console.log(`${prefix} ${result.scenario}: ${status}; feedback=${result.feedbackAdded}`);
    for (const failure of result.failures) console.log(`  condition: ${failure}`);
    if (result.failures.length && process.env.AICIV_AI_FEEDBACK_TRACE === '1') {
        for (const step of result.trace) {
            console.log(`  turn ${step.turn}: action=${step.action || 'none'}; economics=${step.economics || 'none'}`);
        }
    }
}

function existingFeedbackCounts() {
    const counts = {};
    for (const kind of ['strategy', 'action', 'economics']) {
        const filename = path.join(modelDirectory, `${kind}-feedback.situations`);
        counts[kind] = fs.existsSync(filename)
            ? fs.readFileSync(filename, 'utf8').split('\n').filter(line => line && line[0] !== '#' && line.includes('|')).length
            : 0;
    }
    return counts;
}

async function main() {
    const baseline = synchronizeRawModels();
    const library = new FeedbackLibrary(modelDirectory);
    const existing = existingFeedbackCounts();
    if (!readOnly && Object.values(existing).some(Boolean)) {
        console.log(`Training existing feedback: strategy=${existing.strategy}, action=${existing.action}, economics=${existing.economics}`);
        trainChangedModels(existing, baseline);
    }
    let passCount = 0;
    const pendingCounts = {strategy: 0, action: 0, economics: 0};
    const failureFrequency = new Map();

    for (let offset = 0; offset < rounds; offset++) {
        const round = startRound + offset;
        const variant = Math.floor(round / 10);
        const scenario = scenarios(variant)[round % 10];
        const result = await runScenario(scenario, {modelDirectory, feedback: readOnly ? null : library});
        printResult(`[feedback ${offset + 1}/${rounds}, case ${round + 1}]`, result);
        if (!result.failures.length) passCount++;
        for (const failure of result.failures) {
            const key = `${scenario.name}: ${failure}`;
            failureFrequency.set(key, (failureFrequency.get(key) || 0) + 1);
        }
        const counts = readOnly ? {strategy: 0, action: 0, economics: 0} : library.write();
        for (const kind of Object.keys(pendingCounts)) pendingCounts[kind] += counts[kind];
        if ((offset + 1) % 10 === 0 || offset + 1 === rounds) {
            trainChangedModels(pendingCounts, baseline);
            for (const kind of Object.keys(pendingCounts)) pendingCounts[kind] = 0;
        }
    }

    console.log(`Feedback passes during learning: ${passCount}/${rounds}`);
    if (failureFrequency.size) {
        console.log('Observed long-horizon failures:');
        for (const [failure, count] of [...failureFrequency].sort((a, b) => b[1] - a[1])) {
            console.log(`  ${count}x ${failure}`);
        }
    }

    if (!finalValidation) return;
    let finalPasses = 0;
    const finalFailures = [];
    for (const scenario of scenarios(Math.floor(rounds / 10))) {
        const result = await runScenario(scenario, {modelDirectory});
        printResult('[final]', result);
        if (!result.failures.length) finalPasses++;
        else finalFailures.push(...result.failures.map(failure => `${scenario.name}: ${failure}`));
    }
    console.log(`Final scenario pass rate: ${finalPasses}/10`);
    assert.equal(finalFailures.length, 0,
        'AI integration conditions still failing:\n' + finalFailures.join('\n'));
}

main().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});

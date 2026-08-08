'use strict';

const {
    bootstrap, gameDatabaseId, resetDatabase, rows, setPlayerState, sql,
} = require('../test_client');
const {createBrowserClient, loadAiModels, localUnit, runClientTurn} = require('../browser_client');
const {collectDecisionFeedback} = require('./feedback');

function databaseMetrics(gameId, scenario) {
    const gameDbId = gameDatabaseId(gameId);
    const units = rows(`SELECT owner_id,unit_type_id,unit_class,i,j,health,properties_json
        FROM server_game_units WHERE game_id=${gameDbId} AND deleted_at IS NULL`);
    const own = units.filter(row => Number(row[0]) === scenario.playerId);
    const enemy = units.filter(row => Number(row[0]) === scenario.enemyId);
    const modifiers = {};
    for (const [i, j, encoded] of rows(`SELECT i,j,modifiers_json FROM server_game_map WHERE game_id=${gameDbId}`)) {
        modifiers[`${i}:${j}`] = JSON.parse(encoded || '{}');
    }
    return {
        own,
        enemy,
        cities: own.filter(row => Number(row[2]) === 3).length,
        military: own.filter(row => Number(row[2]) === 2).length,
        enemyHealth: enemy.reduce((sum, row) => sum + Number(row[5] || 0), 0),
        modifiers,
    };
}

function configureRelations(gameDbId, scenario, context) {
    const relation = scenario.relations[scenario.playerId]
        && scenario.relations[scenario.playerId][scenario.enemyId];
    if (!relation) return;
    sql(`INSERT INTO server_game_relations
        (game_id,player_a,player_b,relation_status,player_a_status,player_b_status,revision)
        VALUES (${gameDbId},${scenario.playerId},${scenario.enemyId},'war','enemy','enemy',1)
        ON DUPLICATE KEY UPDATE relation_status='war',player_a_status='enemy',player_b_status='enemy'`);
    context.serverGame.relationPreferencesByPlayer[scenario.playerId] = {[scenario.enemyId]: 'enemy'};
}

async function setupScenario(scenario, modelDirectory) {
    resetDatabase();
    const gameId = `ai-feedback-${scenario.name}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const fixture = await bootstrap({
        playerId: scenario.playerId,
        gameId,
        size: scenario.size,
        tiles: scenario.tiles,
        units: scenario.units,
        players: [scenario.playerId],
    });
    const localUnits = scenario.units.map(definition => localUnit(definition, fixture.unitIds[definition.client_key]));
    const unitsByUser = {};
    for (const local of localUnits) {
        if (!unitsByUser[local.team]) unitsByUser[local.team] = [];
        unitsByUser[local.team].push(local);
    }
    const context = createBrowserClient({
        size: scenario.size,
        playerId: scenario.playerId,
        gameId,
        tiles: scenario.tiles,
        units: localUnits,
        unitsByUser,
        technologies: scenario.technologies,
        relations: scenario.relations,
        serverTurn: fixture.result.turn,
    });
    context._game_state.money = scenario.money;
    context._game_state.food = scenario.food;
    context._game_state.lastMoneyIncome = 5;
    context._game_state.lastScienceIncome = 2;
    setPlayerState(gameDatabaseId(gameId), scenario.playerId, {
        money: scenario.money,
        food: scenario.food,
        lastMoneyIncome: 5,
        lastScienceIncome: 2,
        openTechnologies: context._game_state.openTechnologies,
    });
    configureRelations(gameDatabaseId(gameId), scenario, context);
    loadAiModels(context, modelDirectory);
    context.aiPlayer.log = function() {};
    context.serverGame.log = function() {};
    return {context, gameId};
}

function conditionFailures(scenario, history) {
    const failures = [];
    const expected = scenario.expect || {};
    const final = history[history.length - 1];
    const first = history[0];
    const byTurn = (predicate, turn) => history.some(item => item.turn <= turn && predicate(item));
    if (expected.cityMin && !byTurn(item => item.metrics.cities >= expected.cityMin, expected.cityBy || scenario.turns)) {
        failures.push(`City count did not reach ${expected.cityMin} by turn ${expected.cityBy || scenario.turns}`);
    }
    if (expected.productionSelectedBy && !byTurn(item => item.productionSelected, expected.productionSelectedBy)) {
        failures.push(`no City production was selected by turn ${expected.productionSelectedBy}`);
    }
    if (expected.militaryMin && !byTurn(item => item.metrics.military >= expected.militaryMin, expected.militaryBy || scenario.turns)) {
        failures.push(`military count did not reach ${expected.militaryMin} by turn ${expected.militaryBy || scenario.turns}`);
    }
    if (expected.modifier) {
        const key = `${expected.modifier.i}:${expected.modifier.j}`;
        if (!byTurn(item => item.metrics.modifiers[key] && item.metrics.modifiers[key][expected.modifier.name],
            expected.improvementBy || scenario.turns)) {
            failures.push(`${expected.modifier.name} was not completed at ${key} by turn ${expected.improvementBy || scenario.turns}`);
        }
    }
    if (expected.anyImprovement) {
        const hasImprovement = Object.values(final.metrics.modifiers).some(modifier =>
            Object.keys(modifier).some(name => !['road', 'irrigation'].includes(name) && modifier[name]));
        if (!hasImprovement) failures.push('no non-road terrain improvement was completed');
    }
    if (expected.enemyDamageBy && !byTurn(item => item.metrics.enemyHealth < first.metrics.enemyHealth, expected.enemyDamageBy)) {
        failures.push(`visible enemy took no damage by turn ${expected.enemyDamageBy}`);
    }
    if (expected.attackBy && !byTurn(item => item.attackOrdered, expected.attackBy)) {
        failures.push(`no attack command was issued by turn ${expected.attackBy}`);
    }
    if (expected.defend) {
        const escaped = history.find(item => item.defenderDistance > expected.defend.radius);
        if (escaped) failures.push(`City defender left its defensive radius on turn ${escaped.turn}`);
    }
    if (expected.hold) {
        const movedEarly = history.find(item => item.turn <= expected.holdTurns && !item.hillHeld);
        if (movedEarly) failures.push(`hill defender abandoned defensive terrain on turn ${movedEarly.turn}`);
    }
    return failures;
}

async function runScenario(scenario, options = {}) {
    const {context, gameId} = await setupScenario(scenario, options.modelDirectory);
    const initial = databaseMetrics(gameId, scenario);
    const defender = context._units.find(unit => unit.type === 2);
    const history = [{turn: 0, metrics: initial, productionSelected: false, attackOrdered: false,
        defenderDistance: 0, hillHeld: true}];
    let feedbackAdded = 0;
    for (let turn = 1; turn <= scenario.turns; turn++) {
        const result = await context.aiPlayer.runFullTurnAI(scenario.playerId);
        const actionDescription = result.action.commands.map(command => {
            const unit = context._units[command.unitIndex];
            return `${unit ? unit.unitTypeId : 'unknown'}#${unit ? unit.serverId : '?'}:${command.command}`
                + (command.building ? `:${command.building}` : '')
                + (command.target ? `@${command.target.i},${command.target.j}` : '')
                + (command.failureReason ? ` rejected=${command.failureReason}` : '');
        }).join(',');
        if (options.feedback && turn <= 8) {
            feedbackAdded += collectDecisionFeedback(options.feedback, context, scenario, turn, result);
        }
        await new Promise(resolve => setImmediate(resolve));
        const turnResult = await runClientTurn(context);
        let resolvedTurn = turnResult.result.resolved_turn;
        if (resolvedTurn == null) {
            const opponent = await context.serverGame.request('make_turn', {
                player_id: scenario.enemyId,
                turn: turnResult.result.submitted_turn,
                commands: [],
                actions: [],
                player_state: {},
                relations: {},
                include_updates: false,
            });
            resolvedTurn = opponent.resolved_turn;
        }
        await context.serverGame.loadUpdates(scenario.playerId, {hidden: true});
        const metrics = databaseMetrics(gameId, scenario);
        const productionSelected = context._units.some(unit => unit.type === 3 && unit.production);
        const attackOrdered = result.action.commands.some(command => command.command === 'attack' && !command.failureReason);
        const currentDefender = defender && context._units.find(unit => unit.serverId === defender.serverId);
        const defend = scenario.expect.defend;
        const hold = scenario.expect.hold;
        history.push({
            turn,
            metrics,
            productionSelected,
            attackOrdered,
            defenderDistance: currentDefender && defend
                ? Math.max(Math.abs(currentDefender.coord.i - defend.i), Math.abs(currentDefender.coord.j - defend.j)) : 0,
            hillHeld: !hold || !!(currentDefender && currentDefender.coord.i === hold.i && currentDefender.coord.j === hold.j),
            resolvedTurn,
            action: actionDescription,
            economics: result.economics.decisions.map(decision => decision.unitTypeId || 'none').join(','),
        });
    }
    return {
        scenario: scenario.name,
        opinion: scenario.opinion,
        failures: conditionFailures(scenario, history),
        feedbackAdded,
        final: history[history.length - 1],
        trace: history.slice(1).map(item => ({turn: item.turn, action: item.action, economics: item.economics})),
    };
}

module.exports = {runScenario};

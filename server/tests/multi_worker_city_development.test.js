#!/usr/bin/env node
'use strict';

const {
    assert, resetDatabase, bootstrap, mapTiles, unit, city, rows, sql,
    setPlayerState, gameDatabaseId,
} = require('./test_client');
const {createBrowserClient, localUnit, runClientTurn} = require('./browser_client');

function serverTiles(gameDbId) {
    const result = {};
    for (const [i, j, terrain, modifiers] of rows(
        `SELECT i,j,terrain_tex,modifiers_json FROM server_game_map WHERE game_id=${gameDbId}`
    )) {
        result[`${i}:${j}`] = {terrain: Number(terrain), modifiers: JSON.parse(modifiers)};
    }
    return result;
}

(async () => {
    resetDatabase();
    const playerId = 81776;
    const gameId = 'worker-1776-city-development';
    const size = 14;
    const tiles = mapTiles(size, 2);
    const at = (i, j) => tiles.find(tile => tile.i === i && tile.j === j);

    // Worker 1776-like fixture: the City works a forest and two fields. A
    // completed Farm beside those fields is the only irrigation source.
    at(7, 6).terrain_tex = 6;
    at(6, 5).modifiers = {farm:true};
    const citizens = [
        {coord:{i:6, j:6}},
        {coord:{i:7, j:6}},
        {coord:{i:7, j:5}},
        {coord:{i:8, j:6}},
    ];
    const capital = city({
        client_key:'worker-1776-city', owner_id:playerId, i:6, j:6,
        properties: {
            cityPopulation:4,
            cityFoodStored:1000,
            cityProperties:{productionPerTurn:10, productionStored:0},
            lastCityIncome:{food:0, production:10, money:10},
            economy:{citizens, foodStored:1000, lastIncome:{food:0, production:10, money:10}},
            production:null,
            productionDisabled:true,
        },
    });
    const workerDefinition = unit({
        client_key:'worker-1776', owner_id:playerId, i:6, j:7, state:'automate',
        properties:{automationMode:'automate'},
    });
    const fixture = await bootstrap({
        playerId, gameId, size, tiles, units:[capital, workerDefinition],
    });
    const localUnits = [capital, workerDefinition].map(definition => {
        const local = localUnit(definition, fixture.unitIds[definition.client_key]);
        if (definition.unit_type_id === 'worker') local.automationMode = 'automate';
        return local;
    });
    const client = createBrowserClient({
        size, playerId, gameId, tiles, units:localUnits,
        technologies:['Bronze Working', 'Irrigation'],
        serverTurn:fixture.result.turn,
    });
    const gameDbId = gameDatabaseId(gameId);
    const openTechnologies = {};
    Object.keys(client._game_state.openTechnologies).forEach(name => { openTechnologies[name] = true; });
    setPlayerState(gameDbId, playerId, {
        food:5000, money:5000, scienceRate:0, openTechnologies,
    });
    client._game_state.food = 5000;
    client._game_state.money = 5000;

    const commandHistory = [];
    let forestChoppedTurn = null;
    let irrigationBuiltTurn = null;
    const turnLimit = 45;
    for (let turn = 1; turn <= turnLimit; turn++) {
        const worker = client._units_by_user[playerId].find(item => item.serverId
            === fixture.unitIds['worker-1776']);
        assert.ok(worker, `turn ${turn}: Worker remains present after synchronization`);
        assert.equal(worker.automationMode, 'automate',
            `turn ${turn}: Worker retains Automate across movement and builds`);
        const workerIndex = client._units.indexOf(worker);
        const forestOptions = client.currentGame.workerAutomationOptionsAt(workerIndex, 7, 6, localUnits[0]);
        const forestTerrain = client._map_terrain_tex[7][6];

        const {submission} = await runClientTurn(client);
        const workerCommand = submission.commands.find(command => command.unit_id === worker.serverId);
        const workerBuilds = submission.actions.filter(action => action.type === 'build'
            && action.worker_unit_id === worker.serverId);
        commandHistory.push({
            turn,
            worker:{i:worker.coord.i, j:worker.coord.j},
            forestTerrain,
            forestOptions,
            command:workerCommand && workerCommand.command,
            state:workerCommand && workerCommand.payload && workerCommand.payload.state,
            modifier:workerCommand && workerCommand.payload && workerCommand.payload.modifier,
            builds:workerBuilds.map(action => action.building_type),
            decision:worker.lastAutomationDecision && worker.lastAutomationDecision.action,
            target:worker.lastAutomationDecision && worker.lastAutomationDecision.target,
        });

        const current = serverTiles(gameDbId);
        if ((current['7:6'].terrain & 0x0f) !== 6 && forestChoppedTurn === null) {
            forestChoppedTurn = turn;
        }
        if ((current['7:6'].modifiers.irrigation || current['8:6'].modifiers.irrigation)
            && irrigationBuiltTurn === null) {
            irrigationBuiltTurn = turn;
        }
        if (forestChoppedTurn !== null && irrigationBuiltTurn !== null) break;
    }

    const final = serverTiles(gameDbId);
    assert.notEqual(final['7:6'].terrain & 0x0f, 6,
        `worked forest must be chopped; history=${JSON.stringify(commandHistory)}`);
    assert.ok(final['7:6'].modifiers.irrigation || final['8:6'].modifiers.irrigation,
        `Worker must spread irrigation from the neighboring Farm onto worked land; history=${JSON.stringify(commandHistory)}`);
    assert.ok(forestChoppedTurn < irrigationBuiltTurn,
        `Worker must finish chopping before its next irrigation project; history=${JSON.stringify(commandHistory)}`);
    const firstDecision = commandHistory.find(entry => entry.decision);
    assert.equal(firstDecision && firstDecision.decision, 'chop_forest',
        `worked forest must be the first project before generic citizen roads; history=${JSON.stringify(commandHistory)}`);
    assert.ok(commandHistory.slice(0, forestChoppedTurn).every(entry =>
        entry.decision === 'chop_forest'),
        `Worker must not abandon the saved chop after arriving; history=${JSON.stringify(commandHistory)}`);
    assert.ok(commandHistory.some(entry => entry.command === 'build'
        && entry.modifier === 'chop_forest'),
        `the client must submit the completed chop to PHP; history=${JSON.stringify(commandHistory)}`);
    assert.ok(commandHistory.some(entry => entry.builds.includes('irrigation')),
        'the client must submit completed irrigation to PHP');

    if (process.env.AICIV_WORKER_TRACE) console.log(JSON.stringify(commandHistory, null, 2));
    console.log(`PASS Worker city development chopped forest on turn ${forestChoppedTurn} `
        + `and spread Farm-fed irrigation on turn ${irrigationBuiltTurn}`);
})().catch(error => { console.error(error); process.exitCode = 1; });

#!/usr/bin/env node
'use strict';

const {
    assert, resetDatabase, bootstrap, mapTiles, unit, city, sql, value, gameDatabaseId,
} = require('./test_client');
const {createBrowserClient, localUnit, runClientTurn} = require('./browser_client');

function tileAt(tiles, i, j) {
    return tiles.find(tile => tile.i === i && tile.j === j);
}

function cityDefinition(playerId, key, i, j, citizens) {
    return city({
        client_key: key, owner_id: playerId, i, j,
        properties: {
            cityPopulation: Math.max(1, citizens.length),
            cityFoodStored: 5000,
            cityProperties: {productionPerTurn: 5, productionStored: 0},
            production: null,
            productionDisabled: true,
            lastCityIncome: {food: 3, production: 0, money: 3, foodConsumption: citizens.length},
            economy: {
                citizens: citizens.map(coord => ({coord, income: {food: 1, production: 1, money: 0}})),
                lastIncome: {food: 3, production: 0, money: 3},
            },
        },
    });
}

function mapModifiers(gameDbId, i, j) {
    return JSON.parse(value(
        `SELECT modifiers_json FROM server_game_map WHERE game_id=${gameDbId} AND i=${i} AND j=${j}`
    ));
}

function roadConnected(gameDbId, from, to, allowUnroadedTarget = false) {
    const rows = require('./test_client').rows(
        `SELECT i,j,modifiers_json FROM server_game_map WHERE game_id=${gameDbId}`
    );
    const modifiers = new Map(rows.map(([i, j, encoded]) => [`${i}:${j}`, JSON.parse(encoded)]));
    const queue = [from];
    const visited = new Set();
    const directions = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1]];
    while (queue.length) {
        const point = queue.shift();
        const key = `${point.i}:${point.j}`;
        if (visited.has(key) || !modifiers.has(key)) continue;
        const origin = point.i === from.i && point.j === from.j;
        const target = point.i === to.i && point.j === to.j;
        if (!origin && !(target && allowUnroadedTarget) && !modifiers.get(key).road) continue;
        visited.add(key);
        if (target) return true;
        for (const [di, dj] of directions) queue.push({i: point.i + di, j: point.j + dj});
    }
    return false;
}

async function setupScenario(name, configure) {
    resetDatabase();
    const playerId = 7600 + Number(name);
    const gameId = `multi-worker-priority-${name}`;
    const size = 12;
    const tiles = mapTiles(size, 2);
    const units = [];
    const scenario = {playerId, gameId, size, tiles, units};
    configure(scenario);
    const workerDefinition = unit({
        client_key: `worker-${name}`, owner_id: playerId,
        i: scenario.worker.i, j: scenario.worker.j,
        state: 'automate', properties: {automationMode: 'automate'},
    });
    units.push(workerDefinition);
    const fixture = await bootstrap({playerId, gameId, size, tiles, units});
    const localUnits = units.map(definition => localUnit(definition, fixture.unitIds[definition.client_key]));
    const client = createBrowserClient({
        size, playerId, gameId, tiles, units: localUnits, serverTurn: fixture.result.turn,
    });
    const worker = localUnits.find(item => item.unitTypeId === 'worker');
    worker.automationMode = 'automate';
    const workerIndex = localUnits.indexOf(worker);
    const gameDbId = gameDatabaseId(gameId);
    for (const tile of tiles.filter(item => item.resource_type)) {
        sql(`INSERT INTO server_game_visibility `
            + `(game_id,player_id,i,j,visibility_level,resource_visible,revision) VALUES `
            + `(${gameDbId},${playerId},${tile.i},${tile.j},2,1,1) `
            + `ON DUPLICATE KEY UPDATE visibility_level=2,resource_visible=1`);
    }
    sql(`UPDATE server_game_players SET state_json=JSON_SET(state_json,'$.food',5000,'$.money',5000) `
        + `WHERE game_id=${gameDbId} AND player_id=${playerId}`);
    client._game_state.food = 5000;
    client._game_state.money = 5000;
    assert.equal(client.currentGame.autoRouteWorker(workerIndex), true, `priority ${name} must find work`);
    assert.equal(worker.automationPriority, Number(name), `priority ${name} must be selected first`);
    return {client, worker, gameDbId, fixture, scenario};
}

async function advanceUntil(test, predicate, limit = 180) {
    for (let turn = 1; turn <= limit; turn++) {
        await runClientTurn(test.client);
        if (predicate()) return turn;
    }
    assert.fail(`priority ${test.worker.automationPriority} did not complete within ${limit} turns`);
}

(async () => {
    const priority1 = await setupScenario('1', scenario => {
        scenario.worker = {i: 4, j: 4};
        scenario.units.push(cityDefinition(scenario.playerId, 'city-1', 4, 4, [{i:4,j:4}]));
        Object.assign(tileAt(scenario.tiles, 6, 4), {terrain_tex: 5, resource_type: 34, modifiers: {mine:true}});
        Object.assign(tileAt(scenario.tiles, 4, 5), {terrain_tex: 2, resource_type: 2});
    });
    await advanceUntil(priority1, () => mapModifiers(priority1.gameDbId, 6, 4).road);

    const priority2 = await setupScenario('2', scenario => {
        scenario.worker = {i: 4, j: 4};
        scenario.units.push(cityDefinition(scenario.playerId, 'city-2', 4, 4,
            [{i:4,j:4}, {i:5,j:4}, {i:4,j:5}]));
        Object.assign(tileAt(scenario.tiles, 5, 4), {terrain_tex: 2, resource_type: 2});
        tileAt(scenario.tiles, 4, 5).modifiers = {workshop:true};
    });
    await advanceUntil(priority2, () => mapModifiers(priority2.gameDbId, 5, 4).pasture);

    const priority3 = await setupScenario('3', scenario => {
        scenario.worker = {i: 4, j: 4};
        scenario.units.push(cityDefinition(scenario.playerId, 'city-3', 4, 4,
            [{i:4,j:4}, {i:5,j:4}, {i:4,j:5}]));
        tileAt(scenario.tiles, 5, 4).modifiers = {workshop:true};
    });
    await advanceUntil(priority3, () => mapModifiers(priority3.gameDbId, 5, 4).road);

    const priority4 = await setupScenario('4', scenario => {
        scenario.worker = {i: 4, j: 4};
        scenario.units.push(cityDefinition(scenario.playerId, 'city-4a', 4, 4,
            [{i:4,j:4}, {i:5,j:4}]));
        scenario.units.push(cityDefinition(scenario.playerId, 'city-4b', 9, 9, [{i:9,j:9}]));
        tileAt(scenario.tiles, 5, 4).terrain_tex = 5;
    });
    await advanceUntil(priority4, () => mapModifiers(priority4.gameDbId, 5, 4).workshop);

    const priority5 = await setupScenario('5', scenario => {
        scenario.worker = {i: 3, j: 3};
        scenario.units.push(cityDefinition(scenario.playerId, 'city-5a', 3, 3, [{i:3,j:3}]));
        scenario.units.push(cityDefinition(scenario.playerId, 'city-5b', 8, 8,
            [{i:8,j:8}, {i:8,j:7}]));
        tileAt(scenario.tiles, 8, 7).terrain_tex = 5;
    });
    await advanceUntil(priority5, () => roadConnected(
        priority5.gameDbId, {i:3,j:3}, {i:8,j:8}, true
    ));

    const priority6 = await setupScenario('6', scenario => {
        scenario.worker = {i: 3, j: 3};
        scenario.units.push(cityDefinition(scenario.playerId, 'city-6a', 3, 3, [{i:3,j:3}]));
        scenario.units.push(cityDefinition(scenario.playerId, 'city-6b', 8, 8,
            [{i:8,j:8}, {i:8,j:7}]));
        for (const point of [{i:4,j:4}, {i:5,j:5}, {i:6,j:6}, {i:7,j:7}]) {
            tileAt(scenario.tiles, point.i, point.j).modifiers = {road:true};
        }
        tileAt(scenario.tiles, 8, 7).terrain_tex = 5;
    });
    await advanceUntil(priority6, () => mapModifiers(priority6.gameDbId, 8, 7).workshop);

    console.log('PASS six multi-turn Worker priorities choose the correct task and complete it through real JS, PHP, and MySQL');
})().catch(error => { console.error(error); process.exitCode = 1; });

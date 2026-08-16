#!/usr/bin/env node
'use strict';

const {assert, resetDatabase, bootstrap, mapTiles, unit, value} = require('./test_client');
const {serverGame} = require('../../server_game.js');

(async () => {
    resetDatabase();
    const playerId = 7991;
    const worker = unit({
        client_key: 'persistent-worker', owner_id: playerId, i: 4, j: 4,
        state: 'ready', properties: {},
    });
    const explorer = unit({
        client_key: 'persistent-explorer', owner_id: playerId, unit_type_id: 'explorer',
        unit_class: 1, name: 'Explorer', i: 5, j: 5, speed: 2, state: 'ready', properties: {},
    });
    const fixture = await bootstrap({
        playerId, gameId: 'set-unit-automation', size: 10,
        tiles: mapTiles(10), units: [worker, explorer],
    });
    const workerId = fixture.unitIds['persistent-worker'];
    const explorerId = fixture.unitIds['persistent-explorer'];

    const enabled = await serverGame.request('set_unit_automation', {
        player_id: playerId, unit_id: workerId, automation_mode: 'automate',
    });
    assert.equal(enabled.automation_mode, 'automate');
    assert.equal(JSON.parse(value(
        `SELECT properties_json FROM server_game_units WHERE id=${workerId}`
    )).automationMode, 'automate', 'Automate must persist before End Turn');

    const cleared = await serverGame.request('set_unit_automation', {
        player_id: playerId, unit_id: workerId, automation_mode: null,
    });
    assert.equal(cleared.automation_mode, null);
    assert.equal(JSON.parse(value(
        `SELECT properties_json FROM server_game_units WHERE id=${workerId}`
    )).automationMode, undefined, 'clearing automation must persist');

    const exploring = await serverGame.request('set_unit_automation', {
        player_id: playerId, unit_id: explorerId, automation_mode: 'explore',
    });
    assert.equal(exploring.automation_mode, 'explore');
    assert.equal(JSON.parse(value(
        `SELECT properties_json FROM server_game_units WHERE id=${explorerId}`
    )).automationMode, 'explore', 'Explore must survive reload and authoritative updates');

    const repaired = await serverGame.request('repair_worker_automation', {
        player_id: 0, unit_ids: [workerId], confirm: 'REPAIR_WORKER_AUTOMATION',
    });
    assert.deepEqual(repaired.repaired_unit_ids, [workerId]);
    assert.equal(JSON.parse(value(
        `SELECT properties_json FROM server_game_units WHERE id=${workerId}`
    )).automationMode, 'automate', 'the maintenance action repairs affected live Workers only');

    console.log('PASS Worker automation mode persists immediately through real PHP and MySQL');
})().catch(error => { console.error(error); process.exitCode = 1; });

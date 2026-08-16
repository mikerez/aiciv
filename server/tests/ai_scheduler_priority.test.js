#!/usr/bin/env node
'use strict';

const {assert, serverGame, resetDatabase, bootstrap, mapTiles, unit, city, sql, value} = require('./test_client');

(async () => {
    resetDatabase();
    sql("INSERT INTO game_users (id,login,email,password_hash,status,user_type,online,last_online_at,parent_id) "
        + "VALUES (9000,'aiciv_global_ai',NULL,'test','active','ai',1,UTC_TIMESTAMP(),NULL)");
    const units = [
        city({client_key: 'ai-city', owner_id: 9000, i: 4, j: 4,
            properties: {cityPopulation: 1, cityFoodStored: 1000, aiLastServedTurn: 0}}),
    ];
    for (let n = 0; n < 9; n++) {
        units.push(unit({client_key: 'ai-worker-' + n, owner_id: 9000,
            unit_type_id: 'worker', unit_class: 1, name: 'Worker', i: 4 + n % 3,
            j: 5 + Math.floor(n / 3), properties: {aiLastServedTurn: 1}}));
    }
    for (let n = 0; n < 24; n++) {
        units.push(unit({client_key: 'never-served-archer-' + n, owner_id: 9000,
            unit_type_id: 'archer', unit_class: 2, name: 'Archer', i: 2 + n % 6, j: 1 + Math.floor(n / 6),
            properties: {}}));
    }
    await bootstrap({playerId: 7001, players: [7001, 9000], units, tiles: mapTiles(10), size: 10});
    sql('UPDATE server_game_players SET account_user_id=9000 WHERE player_id=9000');
    sql("UPDATE server_games SET turn_number=1000, turn_started_at=UTC_TIMESTAMP(), "
        + "turn_deadline_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 60 SECOND)");

    const cityId = Number(value("SELECT id FROM server_game_units WHERE client_key='ai-city'"));
    const workerIds = sql("SELECT id FROM server_game_units WHERE unit_type_id='worker' ORDER BY id")
        .trim().split(/\s+/).filter(Boolean).map(Number);
    const first = await serverGame.request('claim_ai_batch', {
        player_id: 7001, client_key: 'node-scheduler-test', include_snapshot: false,
    });
    assert.equal(first.unit_ids.length, 8,
        'the native contributor leases the model full width for nearby Workers');
    assert.ok(first.unit_ids.every(id => workerIds.includes(Number(id))),
        'stateful Workers outrank inactive military and are grouped together');
    await serverGame.request('submit_ai_batch', {
        player_id: 7001, client_key: 'node-scheduler-test', lease_token: first.lease_token, turn: first.turn,
        commands: first.unit_ids.map(id => ({unit_id: id, command: 'hold', path: [], payload: {}})),
        actions: [],
    });

    const second = await serverGame.request('claim_ai_batch', {
        player_id: 7001, client_key: 'scheduler-browser', include_snapshot: false,
    });
    assert.equal(second.unit_ids.length, 1, 'the final overdue Worker receives the next lease');
    assert.ok(workerIds.includes(Number(second.unit_ids[0])));
    await serverGame.request('submit_ai_batch', {
        player_id: 7001, client_key: 'scheduler-browser', lease_token: second.lease_token, turn: second.turn,
        commands: second.unit_ids.map(id => ({unit_id: id, command: 'hold', path: [], payload: {}})),
        actions: [],
    });
    const third = await serverGame.request('claim_ai_batch', {
        player_id: 7001, client_key: 'scheduler-browser', include_snapshot: false,
    });
    assert.deepEqual(third.unit_ids, [cityId],
        'the overdue City is serviced after the higher-frequency Worker queue');
    await serverGame.request('submit_ai_batch', {
        player_id: 7001, client_key: 'scheduler-browser', lease_token: third.lease_token, turn: third.turn,
        commands: [{unit_id: cityId, command: 'hold', path: [], payload: {}}], actions: [],
    });
    const military = await serverGame.request('claim_ai_batch', {
        player_id: 7001, client_key: 'node-military-test', include_snapshot: false,
    });
    assert.equal(military.unit_ids.length, 8,
        'inactive military still accumulates enough debt and uses a full native batch');
    console.log('PASS weighted AI service debt advances Workers without starving other objects');
})().catch(error => { console.error(error); process.exitCode = 1; });

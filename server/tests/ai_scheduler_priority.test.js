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
        unit({client_key: 'recent-mature-settler', owner_id: 9000,
            unit_type_id: 'settlers', unit_class: 0, name: 'Settlers', i: 8, j: 8,
            properties: {aiSettlerTurns: 40, aiLastServedTurn: 999}}),
    ];
    for (let n = 0; n < 9; n++) {
        units.push(unit({client_key: 'ai-worker-' + n, owner_id: 9000,
            unit_type_id: 'worker', unit_class: 1, name: 'Worker', i: 4 + n % 3,
            j: 5 + Math.floor(n / 3),
            state: n === 0 ? 'mine' : 'automate',
            properties: n === 0 ? {
                aiLastServedTurn: 1000,
                automationMode: 'automate',
                clientImprovementTurnsLeft: 1,
                clientImprovementState: 'mine',
                sharedAiTask: {kind: 'worker', mode: 'automate', action: 'mine', turns_left: 1},
            } : {aiLastServedTurn: 1}}));
    }
    for (let n = 0; n < 24; n++) {
        units.push(unit({client_key: 'delayed-archer-' + n, owner_id: 9000,
            unit_type_id: 'archer', unit_class: 2, name: 'Archer', i: 2 + n % 6, j: 1 + Math.floor(n / 6),
            properties: {aiLastServedTurn: 400}}));
    }
    await bootstrap({playerId: 7001, players: [7001, 9000], units, tiles: mapTiles(10), size: 10});
    sql('UPDATE server_game_players SET account_user_id=9000 WHERE player_id=9000');
    sql("UPDATE server_games SET turn_number=1000, turn_started_at=UTC_TIMESTAMP(), "
        + "turn_deadline_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 60 SECOND)");

    const cityId = Number(value("SELECT id FROM server_game_units WHERE client_key='ai-city'"));
    const settlerId = Number(value(
        "SELECT id FROM server_game_units WHERE client_key='recent-mature-settler'"
    ));
    const workerIds = sql("SELECT id FROM server_game_units WHERE unit_type_id='worker' ORDER BY id")
        .trim().split(/\s+/).filter(Boolean).map(Number);
    const activeWorkerId = Number(value("SELECT id FROM server_game_units WHERE client_key='ai-worker-0'"));
    const first = await serverGame.request('claim_ai_batch', {
        player_id: 7001, client_key: 'growth-scheduler-test', include_snapshot: false,
    });
    assert.deepEqual(first.unit_ids, [cityId],
        'a recently serviced mature Settler cannot monopolize a City growth turn');
    await serverGame.request('submit_ai_batch', {
        player_id: 7001, client_key: 'growth-scheduler-test', lease_token: first.lease_token, turn: first.turn,
        commands: first.unit_ids.map(id => ({unit_id: id, command: 'hold', path: [], payload: {}})),
        actions: [],
    });

    const second = await serverGame.request('claim_ai_batch', {
        player_id: 7001, client_key: 'node-scheduler-test', include_snapshot: false,
    });
    assert.equal(second.unit_ids.length, 8,
        'the native contributor then leases the model full width for nearby Workers');
    assert.ok(second.unit_ids.every(id => workerIds.includes(Number(id))),
        'stateful Workers outrank inactive military and are grouped together');
    assert.ok(second.unit_ids.includes(activeWorkerId),
        'a current Worker project is included in the first Worker batch');
    assert.equal(second.unit_ids.some(id => value(
        `SELECT unit_type_id FROM server_game_units WHERE id=${id}`
    ) === 'settlers'), false,
    'a recently serviced mature Settler cannot starve overdue Workers');
    await serverGame.request('submit_ai_batch', {
        player_id: 7001, client_key: 'node-scheduler-test', lease_token: second.lease_token, turn: second.turn,
        commands: second.unit_ids.map(id => ({unit_id: id, command: 'hold', path: [], payload: {}})),
        actions: [],
    });
    const third = await serverGame.request('claim_ai_batch', {
        player_id: 7001, client_key: 'scheduler-browser', include_snapshot: false,
    });
    assert.equal(third.unit_ids.length, 1, 'the final overdue Worker receives the next lease');
    assert.ok(workerIds.includes(Number(third.unit_ids[0])));
    await serverGame.request('submit_ai_batch', {
        player_id: 7001, client_key: 'scheduler-browser', lease_token: third.lease_token, turn: third.turn,
        commands: third.unit_ids.map(id => ({unit_id: id, command: 'hold', path: [], payload: {}})),
        actions: [],
    });
    sql(`UPDATE server_game_units SET properties_json=JSON_SET(properties_json,
        '$.aiLastServedTurn',999,
        '$.sharedAiTask',JSON_OBJECT('kind','settler','mode','settle',
            'target',JSON_OBJECT('i',8,'j',9))) WHERE id=${settlerId}`);
    const mission = await serverGame.request('claim_ai_batch', {
        player_id: 7001, client_key: 'node-settler-scheduler-test', include_snapshot: false,
    });
    assert.deepEqual(mission.unit_ids, [settlerId],
        'an active settlement mission receives its next atomic move after one turn');
    await serverGame.request('submit_ai_batch', {
        player_id: 7001, client_key: 'node-settler-scheduler-test',
        lease_token: mission.lease_token, turn: mission.turn,
        commands: [{unit_id: settlerId, command: 'hold', path: [], payload: {}}],
        actions: [],
    });

    const military = await serverGame.request('claim_ai_batch', {
        player_id: 7001, client_key: 'node-military-test', include_snapshot: false,
    });
    assert.equal(military.unit_ids.length, 8,
        'inactive military still accumulates enough debt and uses a full native batch');
    console.log('PASS weighted AI service debt advances active missions without starving other objects');
})().catch(error => { console.error(error); process.exitCode = 1; });

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
        unit({client_key: 'ai-worker', owner_id: 9000, unit_type_id: 'worker', unit_class: 1,
            name: 'Worker', i: 5, j: 4, properties: {aiLastServedTurn: 1}}),
    ];
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
    const workerId = Number(value("SELECT id FROM server_game_units WHERE client_key='ai-worker'"));
    const first = await serverGame.request('claim_ai_batch', {
        player_id: 7001, client_key: 'scheduler-browser', include_snapshot: false,
    });
    assert.deepEqual(first.unit_ids, [cityId],
        'a long-neglected City must outrank never-serviced military units');
    await serverGame.request('submit_ai_batch', {
        player_id: 7001, client_key: 'scheduler-browser', lease_token: first.lease_token, turn: first.turn,
        commands: [{unit_id: cityId, command: 'hold', path: [], payload: {}}], actions: [],
    });

    const second = await serverGame.request('claim_ai_batch', {
        player_id: 7001, client_key: 'scheduler-browser', include_snapshot: false,
    });
    assert.equal(second.unit_ids.includes(workerId), false,
        'never-serviced military units must not remain behind a newer Worker');
    assert.equal(second.unit_ids.length, 2,
        'browser contributors retain their short two-unit lease');
    await serverGame.request('submit_ai_batch', {
        player_id: 7001, client_key: 'scheduler-browser', lease_token: second.lease_token, turn: second.turn,
        commands: second.unit_ids.map(id => ({unit_id: id, command: 'hold', path: [], payload: {}})),
        actions: [],
    });
    const nativeBatch = await serverGame.request('claim_ai_batch', {
        player_id: 7001, client_key: 'node-scheduler-test', include_snapshot: false,
    });
    assert.equal(nativeBatch.unit_ids.length, 4,
        'the native contributor amortizes one snapshot over four military objects within the turn deadline');
    console.log('PASS AI service debt is fair across development and military objects');
})().catch(error => { console.error(error); process.exitCode = 1; });

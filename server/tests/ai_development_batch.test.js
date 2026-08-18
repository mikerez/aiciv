#!/usr/bin/env node
'use strict';

const {assert, serverGame, resetDatabase, bootstrap, mapTiles, unit, city, sql, value} = require('./test_client');

(async () => {
    resetDatabase();
    sql("INSERT INTO game_users (id,login,email,password_hash,status,user_type,online,last_online_at,parent_id) "
        + "VALUES (9000,'aiciv_global_ai',NULL,'test','active','ai',1,UTC_TIMESTAMP(),NULL)");
    const units = [
        unit({client_key: 'ai-settler-1', owner_id: 9000, unit_type_id: 'settlers', unit_class: 0,
            name: 'Settlers', i: 3, j: 3, properties: {}}),
        unit({client_key: 'ai-settler-2', owner_id: 9000, unit_type_id: 'settlers', unit_class: 0,
            name: 'Settlers', i: 4, j: 3, properties: {aiSettlerTurns: 4}}),
    ];
    for (let n = 0; n < 12; n++) {
        units.push(unit({client_key: 'ai-archer-' + n, owner_id: 9000, unit_type_id: 'archer',
            unit_class: 2, name: 'Archer', i: 2 + (n % 4), j: 2 + Math.floor(n / 4)}));
    }
    await bootstrap({playerId: 7001, players: [7001, 9000], units, tiles: mapTiles(10), size: 10});
    sql('UPDATE server_game_players SET account_user_id=9000 WHERE player_id=9000');

    const first = await serverGame.request('claim_ai_batch', {
        player_id: 7001, client_key: 'development-browser', include_snapshot: true,
    });
    const leasedTypes = first.unit_ids.map(id => value(`SELECT unit_type_id FROM server_game_units WHERE id=${id}`));
    assert.equal(leasedTypes[0], 'settlers', 'a cityless AI leases a Settler before military units');
    assert.deepEqual(leasedTypes, ['settlers'],
        'only one first-city Settler is leased so concurrent clients cannot found from stale snapshots');
    assert.equal(Number(value("SELECT JSON_EXTRACT(properties_json,'$.aiSettlerTurns') FROM server_game_units "
        + "WHERE client_key='ai-settler-1'")), 20, 'legacy stateless Settlers are matured once');
    assert.equal(Number(value("SELECT JSON_EXTRACT(properties_json,'$.aiSettlerTurns') FROM server_game_units "
        + "WHERE client_key='ai-settler-2'")), 20, 'all legacy Settlers are matured by the one-time migration');
    assert.equal(value("SELECT JSON_UNQUOTE(JSON_EXTRACT(state_json,'$.aiSettlerAgeMigration20260812')) "
        + "FROM server_game_players WHERE player_id=9000"), 'true', 'the migration is marked complete');

    const settlerId = Number(first.unit_ids[0]);
    await serverGame.request('submit_ai_batch', {
        player_id: 7001, client_key: 'development-browser', lease_token: first.lease_token, turn: first.turn,
        commands: [{unit_id: settlerId, command: 'hold', path: [], payload: {}}],
        actions: [{type: 'build_city', settler_unit_id: settlerId}],
    });
    assert.equal(Number(value('SELECT COUNT(*) FROM server_game_units WHERE owner_id=9000 AND unit_class=3')), 1,
        'leased Settler build action creates an authoritative city');
    assert.equal(Number(value("SELECT COUNT(*) FROM server_game_units WHERE owner_id=9000 "
        + "AND unit_type_id='worker' AND deleted_at IS NULL AND health>0")), 2,
        'a new Barbarian City receives two automated support Workers');
    assert.equal(Number(value("SELECT COUNT(*) FROM server_game_units WHERE owner_id=9000 "
        + "AND unit_type_id='worker' AND state='automate' "
        + "AND JSON_UNQUOTE(JSON_EXTRACT(properties_json,'$.automationMode'))='automate'")), 2,
        'new support Workers immediately enter persistent automation');

    const cityId = Number(value('SELECT id FROM server_game_units WHERE owner_id=9000 AND unit_class=3'));
    const second = await serverGame.request('claim_ai_batch', {
        player_id: 7001, client_key: 'settlement-browser', include_snapshot: false,
    });
    const remainingSettlerId = Number(value(
        "SELECT id FROM server_game_units WHERE owner_id=9000 AND unit_type_id='settlers' AND deleted_at IS NULL"
    ));
    assert.deepEqual(second.unit_ids, [remainingSettlerId],
        'the remaining mature Settler is serviced before routine City and Worker work');
    await serverGame.request('submit_ai_batch', {
        player_id: 7001, client_key: 'settlement-browser', lease_token: second.lease_token, turn: second.turn,
        commands: [{unit_id: remainingSettlerId, command: 'hold', path: [], payload: {}}], actions: [],
    });
    assert.equal(Number(value(`SELECT JSON_UNQUOTE(JSON_EXTRACT(properties_json,'$.aiLastServedTurn'))
        FROM server_game_units WHERE id=${remainingSettlerId}`)), second.turn,
        'a completed Settler decision records fair-scheduling service state');

    const third = await serverGame.request('claim_ai_batch', {
        player_id: 7001, client_key: 'economics-browser', include_snapshot: true,
    });
    assert.deepEqual(third.unit_ids, [cityId],
        'the overdue idle AI city receives an atomic Economics lease');
    const submitted = await serverGame.request('submit_ai_batch', {
        player_id: 7001, client_key: 'economics-browser', lease_token: third.lease_token, turn: third.turn,
        commands: [{unit_id: cityId, command: 'hold', path: [], payload: {}}],
        actions: [{type: 'select_production', city_unit_id: cityId, unit_type_id: 'warrior'}],
    });
    assert.equal(submitted.accepted, true);
    assert.equal(value(`SELECT unit_type_id FROM productions WHERE city_unit_id=${cityId}`), 'warrior',
        'leased city Economics action starts server production');

    const fourth = await serverGame.request('claim_ai_batch', {
        player_id: 7001, client_key: 'worker-browser', include_snapshot: false,
    });
    const fourthTypes = fourth.unit_ids.map(id => value(`SELECT unit_type_id FROM server_game_units WHERE id=${id}`));
    assert.deepEqual(fourthTypes, ['worker', 'worker'],
        'new support Workers receive their first automation lease');
    await serverGame.request('submit_ai_batch', {
        player_id: 7001, client_key: 'worker-browser', lease_token: fourth.lease_token, turn: fourth.turn,
        commands: fourth.unit_ids.map(unitId => ({unit_id: unitId, command: 'hold', path: [], payload: {}})),
        actions: [],
    });
    console.log('PASS shared AI prioritizes Settlers, persists age, builds Cities, and leases idle Cities');
})().catch(error => { console.error(error); process.exitCode = 1; });

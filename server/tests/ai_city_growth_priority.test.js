#!/usr/bin/env node
'use strict';

const {
    assert, serverGame, resetDatabase, bootstrap, mapTiles, city, sql, value, gameDatabaseId,
} = require('./test_client');

(async () => {
    resetDatabase();
    sql("INSERT INTO game_users (id,login,email,password_hash,status,user_type,online,last_online_at,parent_id) "
        + "VALUES (9000,'aiciv_global_ai',NULL,'test','active','ai',1,UTC_TIMESTAMP(),NULL)");
    await bootstrap({
        playerId: 7001,
        players: [7001, 9000],
        size: 10,
        tiles: mapTiles(10),
        units: [city({
            client_key: 'growing-barbarian-city', owner_id: 9000, i: 5, j: 5,
            properties: {
                cityPopulation: 1,
                cityFoodStored: 120,
                cityProperties: {productionPerTurn: 5, productionStored: 0},
                aiLastServedTurn: 0,
            },
        })],
    });
    const gameId = gameDatabaseId('test-ai_city_growth_priority');
    const cityId = Number(value("SELECT id FROM server_game_units WHERE client_key='growing-barbarian-city'"));
    sql('UPDATE server_game_players SET account_user_id=9000, '
        + "state_json=JSON_OBJECT('aiSettlerAgeMigration20260812',true,"
        + "'aiCityWorkerSupportMigration20260818',true) WHERE player_id=9000");
    sql("UPDATE server_games SET turn_number=100, turn_started_at=UTC_TIMESTAMP(), "
        + "turn_deadline_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 60 SECOND)");
    sql(`INSERT INTO productions
        (game_id,city_unit_id,player_id,unit_type_id,production_points,production_cost,queue_json,selected_at)
        VALUES (${gameId},${cityId},9000,'warrior',0,20,'["warrior"]',UTC_TIMESTAMP())`);

    const batch = await serverGame.request('claim_ai_batch', {
        player_id: 7001, client_key: 'growth-priority-test', include_snapshot: true,
    });
    assert.deepEqual(batch.unit_ids, [cityId],
        'a growth-ready Barbarian City is leased while its production is incomplete');
    const submitted = await serverGame.request('submit_ai_batch', {
        player_id: 7001,
        client_key: 'growth-priority-test',
        lease_token: batch.lease_token,
        turn: batch.turn,
        leased_unit_ids: batch.unit_ids,
        commands: [{unit_id: cityId, command: 'hold', path: [], payload: {}}],
        actions: [{type: 'grow_city', city_unit_id: cityId, food_stored: 120}],
    });
    assert.equal(submitted.accepted, true);
    assert.equal(Number(value("SELECT JSON_EXTRACT(properties_json,'$.cityPopulation') "
        + `FROM server_game_units WHERE id=${cityId}`)), 2, 'the leased City spends food and grows');
    assert.equal(Number(value("SELECT JSON_EXTRACT(properties_json,'$.cityFoodStored') "
        + `FROM server_game_units WHERE id=${cityId}`)), 0, 'growth subtracts the authoritative food cost');
    console.log('PASS stored Barbarian city food is scheduled and converted into population');
})().catch(error => { console.error(error); process.exitCode = 1; });

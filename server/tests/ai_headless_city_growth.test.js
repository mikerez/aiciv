#!/usr/bin/env node
'use strict';

const {
    assert, serverGame, resetDatabase, bootstrap, mapTiles, city, sql, value, gameDatabaseId,
} = require('./test_client');
const {NativeInference, BrowserAiRuntime} = require('../../ai_player/ai_player');

(async () => {
    resetDatabase();
    sql("INSERT INTO game_users (id,login,email,password_hash,status,user_type,online,last_online_at,parent_id) "
        + "VALUES (9000,'aiciv_global_ai',NULL,'test','active','ai',1,UTC_TIMESTAMP(),NULL)");
    await bootstrap({
        playerId: 7001, players: [7001, 9000], size: 10, tiles: mapTiles(10),
        units: [city({
            client_key: 'headless-growing-city', owner_id: 9000, i: 5, j: 5,
            properties: {
                cityPopulation: 1, cityFoodStored: 120,
                cityProperties: {productionPerTurn: 5, productionStored: 0},
                aiLastServedTurn: 0,
            },
        })],
    });
    const gameId = gameDatabaseId('test-ai_headless_city_growth');
    const cityId = Number(value("SELECT id FROM server_game_units WHERE client_key='headless-growing-city'"));
    sql("UPDATE server_game_players SET account_user_id=9000, "
        + "state_json=JSON_OBJECT('aiSettlerAgeMigration20260812',true,"
        + "'aiCityWorkerSupportMigration20260818',true) WHERE player_id=9000");
    sql("UPDATE server_games SET turn_number=100, turn_started_at=UTC_TIMESTAMP(), "
        + "turn_deadline_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 60 SECOND)");
    sql(`INSERT INTO productions
        (game_id,city_unit_id,player_id,unit_type_id,production_points,production_cost,queue_json,selected_at)
        VALUES (${gameId},${cityId},9000,'warrior',0,20,'["warrior"]',UTC_TIMESTAMP())`);

    const batch = await serverGame.request('claim_ai_batch', {
        player_id: 7001, client_key: 'headless-city-growth-test', include_snapshot: true,
    });
    assert.deepEqual(batch.unit_ids, [cityId]);
    const native = new NativeInference();
    await native.start();
    try {
        const runtime = new BrowserAiRuntime(batch.snapshot, batch.ai_player_id, 'test', native, () => {});
        runtime.setServerTurn(batch.turn);
        runtime.activateSnapshot(batch.ai_player_id, batch.snapshot);
        const submission = await runtime.prepareUnit(
            batch.ai_player_id, batch.snapshot, cityId, null, true
        );
        assert.ok(submission);
        assert.equal(submission.actions.some(action => action.type === 'grow_city'
            && Number(action.city_unit_id) === cityId), true,
        'the headless City adapter emits grow_city from authoritative stored food');
    }
    finally {
        native.stop();
    }
    console.log('PASS headless contributor turns a growth-ready City lease into grow_city');
    process.exit(0);
})().catch(error => { console.error(error); process.exitCode = 1; });

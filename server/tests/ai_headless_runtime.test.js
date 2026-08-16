#!/usr/bin/env node
'use strict';

const {assert, serverGame, resetDatabase, bootstrap, mapTiles, unit, city, sql, value} = require('./test_client');
const {NativeInference, BrowserAiRuntime} = require('../../ai_player/ai_player');

(async () => {
    resetDatabase();
    sql("INSERT INTO game_users (id,login,email,password_hash,status,user_type,online,last_online_at,parent_id) "
        + "VALUES (9000,'aiciv_global_ai',NULL,'test','active','ai',1,UTC_TIMESTAMP(),NULL)");
    await bootstrap({
        playerId: 7001,
        players: [7001, 9000],
        units: [
            unit({client_key: 'headless-worker', owner_id: 9000, i: 5, j: 5}),
            city({
                client_key: 'headless-city', owner_id: 9000, i: 6, j: 5,
                properties: {
                    cityPopulation: 1,
                    cityFoodStored: 0,
                    cityProperties: {productionPerTurn: 2, productionStored: 0},
                    production: {unitTypeId: 'warrior', productionPoints: 0},
                },
            }),
        ],
        tiles: mapTiles(8),
    });
    sql('UPDATE server_game_players SET account_user_id=9000 WHERE player_id=9000');
    sql('UPDATE server_games SET turn_deadline_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND)');
    await serverGame.request('make_turn', {
        player_id: 7001, turn: 0, commands: [], actions: [], player_state: {}, relations: {},
    });
    const turn = Number(value('SELECT turn_number FROM server_games'));
    const cityId = Number(value("SELECT id FROM server_game_units WHERE owner_id=9000 AND unit_class=3"));
    const gameDbId = Number(value("SELECT id FROM server_games WHERE game_key='test-ai_headless_runtime'"));
    sql(`INSERT INTO productions
        (game_id,city_unit_id,player_id,unit_type_id,production_points,production_cost,queue_json,selected_at)
        VALUES (${gameDbId},${cityId},9000,'warrior',0,20,'[\"warrior\"]',UTC_TIMESTAMP())`);
    const batch = await serverGame.request('claim_ai_batch', {
        player_id: 7001, client_key: 'headless-runtime-test', include_snapshot: true,
    });
    assert.equal(batch.unit_ids.length, 1);
    assert.equal(batch.snapshot.map_size, 8, 'full snapshots declare the authoritative world size');
    assert.equal(batch.snapshot.units.find(row => Number(row.id) === Number(batch.unit_ids[0])).unit_type_id,
        'worker', 'the regression exercises the rule-driven Worker path');

    // Rebase the small fixture into a nonzero window of a larger world. The
    // headless runtime must preserve local coordinates exactly as a browser does.
    batch.snapshot.map_size = 300;
    batch.snapshot.map_origin = {i: 100, j: 100};
    for (const row of batch.snapshot.units) {
        row.world_i = Number(row.i) + 100;
        row.world_j = Number(row.j) + 100;
    }
    for (const collection of [batch.snapshot.tiles, batch.snapshot.visibility]) {
        for (const row of collection || []) {
            row.world_i = Number(row.i) + 100;
            row.world_j = Number(row.j) + 100;
        }
    }

    const native = new NativeInference();
    await native.start();
    try {
        const runtime = new BrowserAiRuntime(batch.snapshot, batch.ai_player_id, 'test', native, () => {});
        assert.equal(runtime.context._world_map_size, 300);
        runtime.setServerTurn(turn);
        const strategy = await runtime.prepareStrategy(batch.ai_player_id, batch.snapshot, native);
        assert.ok(runtime.context.aiPlayer.lastStrategyContext.contextTiles > 0,
            'Strategy reads terrain around a City in a nonzero map window');
        runtime.activateSnapshot(batch.ai_player_id, batch.snapshot);
        const submission = await runtime.prepareUnit(
            batch.ai_player_id, batch.snapshot, batch.unit_ids[0], strategy.maxMilitaryFocus, true
        );
        assert.ok(submission);
        assert.equal(submission.commands.length, 1);
        assert.equal(Number(submission.commands[0].unit_id), Number(batch.unit_ids[0]));
        assert.ok(['move', 'hold', 'wait', 'fortify', 'set_state'].includes(submission.commands[0].command));
    }
    finally {
        native.stop();
    }
    console.log('PASS headless runtime converts a PHP lease snapshot into one browser-compatible AI command');
})().catch(error => { console.error(error); process.exitCode = 1; });

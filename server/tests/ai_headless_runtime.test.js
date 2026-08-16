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
            unit({
                client_key: 'headless-worker', owner_id: 9000, i: 5, j: 5,
                state: 'automate', properties: {
                    automationMode: 'automate',
                    sharedAiTask: {
                        kind: 'worker', mode: 'automate', state: 'automate',
                        action: 'mine', target: {i: 7, j: 5}, turns_left: null,
                    },
                },
            }),
            city({
                client_key: 'headless-city', owner_id: 9000, i: 6, j: 5,
                properties: {
                    cityPopulation: 2,
                    cityFoodStored: 0,
                    cityProperties: {productionPerTurn: 2, productionStored: 0},
                    production: {unitTypeId: 'warrior', productionPoints: 0},
                    economy: {citizens: [
                        {coord: {i: 6, j: 5}, income: {food: 2, production: 1, money: 1}},
                        {coord: {i: 6, j: 6}, income: {food: 2, production: 1, money: 0}},
                    ]},
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
        if (row.properties && row.properties.sharedAiTask && row.properties.sharedAiTask.target) {
            row.properties.sharedAiTask.target.i += 100;
            row.properties.sharedAiTask.target.j += 100;
        }
        const citizens = row.properties && row.properties.economy
            && row.properties.economy.citizens;
        for (const citizen of citizens || []) {
            citizen.worldCoord = {
                i: Number(citizen.coord.i) + 100,
                j: Number(citizen.coord.j) + 100,
            };
        }
    }
    for (const collection of [batch.snapshot.tiles, batch.snapshot.visibility]) {
        for (const row of collection || []) {
            row.world_i = Number(row.i) + 100;
            row.world_j = Number(row.j) + 100;
        }
    }
    const snapshotCity = batch.snapshot.units.find(row => Number(row.id) === cityId);
    const expectedCitizenCoords = snapshotCity.properties.economy.citizens.map(citizen => [
        Number(citizen.coord.i), Number(citizen.coord.j),
    ]);

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
        const loadedCity = runtime.context._units.find(row => Number(row.serverId) === cityId);
        assert.ok(loadedCity, 'the headless runtime loads the owned City');
        assert.deepEqual(
            Array.from(runtime.context._current_game.cityCitizenCoords(loadedCity), point => [point.i, point.j]),
            expectedCitizenCoords,
            'the headless Worker policy sees the City citizen plots in local map coordinates'
        );
        const submission = await runtime.prepareUnit(
            batch.ai_player_id, batch.snapshot, batch.unit_ids[0], strategy.maxMilitaryFocus, true
        );
        assert.ok(submission);
        assert.equal(submission.commands.length, 1);
        assert.equal(Number(submission.commands[0].unit_id), Number(batch.unit_ids[0]));
        assert.equal(submission.commands[0].command, 'move',
            'a persisted Worker target becomes an atomic movement command');
        assert.ok(submission.commands[0].path.length > 0,
            'the Worker movement command retains its generated route');
    }
    finally {
        native.stop();
    }
    console.log('PASS headless runtime converts a PHP lease snapshot into one browser-compatible AI command');
})().catch(error => { console.error(error); process.exitCode = 1; });

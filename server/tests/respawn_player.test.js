#!/usr/bin/env node
'use strict';

const {
    assert, serverGame, resetDatabase, bootstrap, mapTiles, unit, city, value,
    gameDatabaseId, expectRequestError,
} = require('./test_client');

(async () => {
    resetDatabase();
    const playerId = 7001;
    const enemyId = 7002;
    const tiles = mapTiles(16, 2);
    tiles.find(tile => tile.i === 3 && tile.j === 3).modifiers = {
        road: true, irrigation: true, irrigationCityFood: true,
    };
    tiles.find(tile => tile.i === 4 && tile.j === 4).modifiers = {
        road: true, farm: true,
    };
    const owned = [
        city({client_key: 'old-city', owner_id: playerId, i: 3, j: 3}),
        unit({client_key: 'old-worker', owner_id: playerId, i: 4, j: 4}),
        unit({
            client_key: 'old-road', owner_id: playerId, unit_type_id: 'building_road',
            unit_class: 4, name: 'Road', can_move: false, i: 4, j: 4,
        }),
        unit({
            client_key: 'old-farm', owner_id: playerId, unit_type_id: 'building_farm',
            unit_class: 4, name: 'Farm', can_move: false, i: 4, j: 4,
        }),
    ];
    const fixture = await bootstrap({
        gameId: 'test-forced-respawn', playerId, size: 16, tiles,
        players: [playerId, enemyId],
        units: owned.concat([unit({
            client_key: 'enemy-guard', owner_id: enemyId, unit_type_id: 'warrior',
            unit_class: 2, name: 'Warrior', i: 12, j: 12,
        })]),
    });
    await serverGame.request('select_production', {
        player_id: playerId, city_unit_id: fixture.unitIds['old-city'], unit_type_id: 'warrior',
    });
    await expectRequestError('respawn_player', {
        player_id: playerId, preferred_i: 10, preferred_j: 10,
    }, 'respawn_not_required');

    const response = await serverGame.request('respawn_player', {
        player_id: playerId, preferred_i: 10, preferred_j: 10, force_respawn: true,
    });
    const gameDbId = gameDatabaseId(fixture.gameId);
    assert.equal(Number(value(
        `SELECT COUNT(*) FROM server_game_units WHERE game_id=${gameDbId} AND owner_id=${playerId}`
    )), 4, 'forced respawn leaves exactly one Settler and three Explorers');
    assert.equal(Number(value(
        `SELECT COUNT(*) FROM server_game_units WHERE game_id=${gameDbId} AND owner_id=${enemyId}`
    )), 1, 'forced respawn never removes another civilization');
    assert.equal(Number(value(`SELECT COUNT(*) FROM productions WHERE game_id=${gameDbId}`)), 0,
        'deleting the old City removes its production queue');
    assert.deepEqual(JSON.parse(value(
        `SELECT modifiers_json FROM server_game_map WHERE game_id=${gameDbId} AND i=3 AND j=3`
    )), {}, 'old City-center road and irrigation are removed');
    assert.deepEqual(JSON.parse(value(
        `SELECT modifiers_json FROM server_game_map WHERE game_id=${gameDbId} AND i=4 AND j=4`
    )), {}, 'all owned terrain improvements are removed');
    assert.ok(response.deleted_units >= 4);
    assert.ok(response.snapshot && !response.snapshot.respawn_required);
    console.log('PASS respawn_player requires explicit force and atomically replaces the full civilization');
})().catch(error => { console.error(error); process.exitCode = 1; });

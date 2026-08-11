#!/usr/bin/env node
'use strict';
const {assert, serverGame, resetDatabase, bootstrap, mapTiles, unit} = require('./test_client');

function assertCompleteWindow(response, originI, originJ) {
    assert.deepEqual(response.map_origin, {i: originI, j: originJ});
    assert.equal(response.map_window_size, 100);
    assert.equal(response.tiles.length, 10000, 'a shifted window must not contain black/missing cells');
    const coordinates = new Set(response.tiles.map(tile => `${tile.i}:${tile.j}`));
    for (let i = 0; i < 100; i++) for (let j = 0; j < 100; j++) {
        assert(coordinates.has(`${i}:${j}`), `missing local Tile ${i}:${j}`);
    }
    const corner = response.tiles.find(tile => tile.i === 0 && tile.j === 0);
    assert.equal(corner.world_i, originI);
    assert.equal(corner.world_j, originJ);
}

(async () => {
    resetDatabase();
    const fixture = await bootstrap({
        gameId: 'test-map-window', size: 120, tiles: mapTiles(120),
        units: [unit({owner_id: 7001, i: 109, j: 109})],
    });
    const first = await serverGame.request('load_full', {
        player_id: fixture.playerId, include_map: true, map_origin_i: 0, map_origin_j: 0,
    });
    assertCompleteWindow(first, 0, 0);
    assert(first.units.some(item => item.owner_id === 7001 && item.world_i === 109 && item.world_j === 109),
        'owned units outside the loaded terrain window must retain authoritative world coordinates');

    const shifted = await serverGame.request('load_full', {
        player_id: fixture.playerId, include_map: true, map_origin_i: 20, map_origin_j: 20,
    });
    assertCompleteWindow(shifted, 20, 20);
    const selected = shifted.units.find(item => item.owner_id === 7001);
    assert.equal(selected.world_i - shifted.map_origin.i, 89);
    assert.equal(selected.world_j - shifted.map_origin.j, 89);

    const aligned = await serverGame.request('load_full', {
        player_id: fixture.playerId, include_map: true, map_origin_i: 17, map_origin_j: 19,
    });
    assertCompleteWindow(aligned, 10, 10);
    console.log('PASS real JS requests load complete aligned 100x100 windows without black zones');
})().catch(error => { console.error(error); process.exitCode = 1; });

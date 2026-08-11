#!/usr/bin/env node
'use strict';
const {assert, serverGame, resetDatabase, bootstrap, mapTiles, unit, value, expectRequestError} = require('./test_client');

(async () => {
    resetDatabase();
    const tiles = mapTiles(10);
    const settlers = [];
    for (let terrain = 0; terrain < 8; terrain++) {
        tiles.find(tile => tile.i === terrain + 1 && tile.j === 3).terrain_tex = terrain;
        settlers.push(unit({
            client_key: `settler-${terrain}`, unit_type_id: 'settlers', unit_class: 0,
            name: 'Settlers', texture: 256, i: terrain + 1, j: 3,
        }));
    }
    const fixture = await bootstrap({size: 10, tiles, units: settlers});
    const names = [];
    for (let terrain = 0; terrain < 8; terrain++) {
        const settlerId = fixture.unitIds[`settler-${terrain}`];
        const body = {player_id: fixture.playerId, settler_unit_id: settlerId};
        if (terrain === 0) {
            await expectRequestError('build_city', body, 'city_tile_invalid');
            assert.equal(Number(value(`SELECT COUNT(*) FROM server_game_units WHERE id=${settlerId} AND deleted_at IS NULL`)), 1);
            continue;
        }
        const response = await serverGame.request('build_city', body);
        assert.equal(response.request, 'build_city');
        assert.equal(response.city.unit_type_id, 'city');
        names.push(response.city.name);
        assert.equal(Number(value(`SELECT COUNT(*) FROM server_game_units WHERE id=${settlerId} AND deleted_at IS NOT NULL`)), 1);
        assert.equal(Number(value(`SELECT COUNT(*) FROM server_game_units WHERE owner_id=${fixture.playerId} AND unit_class=3 AND i=${terrain + 1} AND j=3 AND deleted_at IS NULL`)), 1);
        assert.equal(response.tile.modifiers.road, true);
        assert.equal(response.tile.modifiers.irrigation, true);
    }
    assert.equal(new Set(names).size, names.length, 'each City receives the next unused civilization name');
    assert.ok(names.every(name => name && name !== 'City'), 'civilization City names replace the generic label');
    console.log('PASS build_city rejects water and founds a persisted city on every land terrain type');
})().catch(error => { console.error(error); process.exitCode = 1; });

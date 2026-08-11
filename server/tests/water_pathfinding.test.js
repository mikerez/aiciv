#!/usr/bin/env node
'use strict';

const {
    assert, resetDatabase, bootstrap, mapTiles, unit, value, gameDatabaseId,
} = require('./test_client');
const {Coord, createBrowserClient, localUnit, runClientTurn} = require('./browser_client');

function random(seed) {
    let state = seed >>> 0;
    return () => {
        state = (1664525*state + 1013904223) >>> 0;
        return state/0x100000000;
    };
}

(async () => {
    for (let scenario=0; scenario<10; scenario++) {
        resetDatabase();
        const rng = random(0x5ea00000+scenario);
        const size = 20;
        const tiles = mapTiles(size, 0);
        for (const tile of tiles) {
            const inChannel = Math.abs(tile.i-tile.j) <= 1;
            if (!inChannel && rng() < 0.38) tile.terrain_tex = rng() < 0.5 ? 2 : 5;
        }
        const barrier = 5 + scenario%9;
        tiles.find(tile => tile.i === barrier && tile.j === barrier).terrain_tex = 5;
        for (const point of [{i:barrier,j:barrier-1}, {i:barrier+1,j:barrier}]) {
            tiles.find(tile => tile.i === point.i && tile.j === point.j).terrain_tex = 0;
        }
        const definition = unit({
            client_key:`galley-${scenario}`, owner_id:7400+scenario,
            unit_type_id:'galley', unit_class:2, name:'Galley', nature:'water',
            i:2, j:2, speed:3, attack:2, defense:2,
        });
        const fixture = await bootstrap({
            playerId:7400+scenario, gameId:`water-path-${scenario}`, size, tiles, units:[definition],
        });
        const local = localUnit(definition, fixture.unitIds[definition.client_key]);
        const client = createBrowserClient({
            size, playerId:fixture.playerId, gameId:fixture.gameId, tiles, units:[local],
            serverTurn:fixture.result.turn,
        });
        const destination = new Coord(17,17);
        const path = client.currentGame.buildPath(0, destination);
        assert.ok(path.length > 0 && path.length <= 21,
            `scenario ${scenario}: water-heavy route must remain close to the 15-step direct route`);
        assert.deepEqual([path[path.length-1].i, path[path.length-1].j], [17,17],
            `scenario ${scenario}: route must reach its water destination`);
        assert.equal(new Set(path.map(point => `${point.i}:${point.j}`)).size, path.length,
            `scenario ${scenario}: route must not contain loops`);
        let previous = new Coord(2,2);
        for (const point of path) {
            assert.equal(client._map_terrain_tex[point.i][point.j]&0x0f, 0,
                `scenario ${scenario}: a ship route must not cross land`);
            assert.ok(client.control.pathDistance(previous.i, previous.j, point.i, point.j) === 1,
                `scenario ${scenario}: route steps must be adjacent`);
            previous = point;
        }
        client.currentGame.assignPath(0, path);
        const expected = path[Math.min(path.length, 3)-1];
        const {result} = await runClientTurn(client);
        assert.equal((result.rejected_movements || []).length, 0,
            `scenario ${scenario}: PHP must accept the JS-generated atomic water path`);
        const gameDbId = gameDatabaseId(fixture.gameId);
        assert.equal(Number(value(`SELECT i FROM server_game_units WHERE game_id=${gameDbId} AND id=${fixture.unitIds[definition.client_key]}`)), expected.i);
        assert.equal(Number(value(`SELECT j FROM server_game_units WHERE game_id=${gameDbId} AND id=${fixture.unitIds[definition.client_key]}`)), expected.j);
    }
    console.log('PASS 10 water-heavy routes are loop-free, terrain-valid, and accepted by real PHP movement validation');
})().catch(error => { console.error(error); process.exitCode = 1; });

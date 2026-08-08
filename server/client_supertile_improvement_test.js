const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const removed = [];
const context = {
    console,
    _map_size: 3,
    _fulldraw: 0,
    _textures: [],
    _map_terrain_tex: [
        [0x36, 0x36, 2],
        [0x76, 0x76, 2],
        [2, 2, 2],
    ],
    _map_terrain_bit: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    _map_terrain_mod: [
        [{}, {}, {}],
        [{}, { road: true, cottage: true, cottageAge: 155, cottageStage: 'hamlet' }, {}],
        [{}, {}, {}],
    ],
    _economics: {
        registerTerrainImprovement() {},
        removeTerrainImprovementUnitsAt(i, j, modifier) { removed.push([i, j, modifier]); },
    },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('map.js', 'utf8') + ';globalThis.mapEngine=_map;', context);

assert.deepEqual(JSON.parse(JSON.stringify(context.mapEngine.splitSupertileAt(1, 1))), [
    { i: 0, j: 0 }, { i: 0, j: 1 }, { i: 1, j: 0 }, { i: 1, j: 1 },
]);
assert.equal(context._map_terrain_tex[1][0], 0x36);
assert.equal(context._map_terrain_tex[1][1], 0x36);

assert.equal(context.mapEngine.addMine(1, 1), true);
assert.equal(context._map_terrain_mod[1][1].road, true, 'road must coexist with the replacement');
assert.equal(context._map_terrain_mod[1][1].mine, true);
assert.equal(context._map_terrain_mod[1][1].cottage, false);
assert.equal(context._map_terrain_mod[1][1].cottageAge, undefined);
assert.deepEqual(removed, [[1, 1, 'cottage']]);

console.log('PASS supertile splitting and primary improvement replacement');

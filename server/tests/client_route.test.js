#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

global._map_size = 12;
global._map_terrain_tex = Array.from({length: _map_size}, () => Array(_map_size).fill(2));
global._map_terrain_mod = Array.from({length: _map_size}, () => Array.from({length: _map_size}, () => ({})));
global._game = {canUnitEnterTile: () => true};
global._units = [{}];
const source = fs.readFileSync(path.join(__dirname, '..', '..', 'control.js'), 'utf8')
    .replace('const _control =', 'global._control =');
vm.runInThisContext(source, {filename: 'control.js'});

function route(from, to) {
    const points = [];
    _control.mapLine(from.i, from.j, to.i, to.j, (i, j, ni, nj) => points.push([ni, nj]), 0, 30);
    return points;
}

for (let n=2; n<=8; n++) _map_terrain_mod[n][n].road = true;
let points = route({i: 1, j: 1}, {i: 8, j: 8});
assert.deepEqual(points.slice(0, 3), [[2,2], [3,3], [4,4]], 'Goto sticks to a road that advances toward the destination');

const backwardDetour = [[6,6], [5,6], [5,7], [6,8], [7,9], [8,10], [9,10], [10,10]];
for (const [i, j] of backwardDetour) _map_terrain_mod[i][j].road = true;
points = route({i: 6, j: 6}, {i: 10, j: 10});
assert.deepEqual(points, [[7,7], [8,8], [9,9], [10,10]],
    'Goto does not follow a longer road backward and around before returning to the clicked Tile');

for (let i=0; i<_map_size; i++) for (let j=0; j<_map_size; j++) _map_terrain_mod[i][j] = {};
_map_terrain_tex[2][2] = 5;
points = route({i: 1, j: 1}, {i: 5, j: 5});
assert.notDeepEqual(points[0], [2,2], 'Goto avoids rocks when an advancing field step is available');
assert.deepEqual(points[points.length - 1], [5,5], 'terrain avoidance still reaches the requested destination');

console.log('PASS client Goto favors advancing roads and avoids hills or rocks when a better advancing Tile exists');

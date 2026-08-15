#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');

global.Coord = class Coord {
    constructor(i, j) { this.i = i; this.j = j; }
};
global._map_size = 100;
const matrix = (makeValue) => Array.from({length: 100}, (_, i) =>
    Array.from({length: 100}, (_, j) => makeValue(i, j)));
global._map_terrain_tex = matrix(() => 2);
global._map_terrain_bit = matrix(() => 0x1234);
global._map_resource = matrix(() => ({type: 0, hidden: true}));
global._map_terrain_mod = matrix(() => ({}));
_map_terrain_tex[50][50] = 0x35;
_map_resource[50][50] = {type: 34, hidden: false};
_map_terrain_mod[50][50] = {road: true, mine: true};
global._units_by_user = {
    7: [{
        coord: new Coord(50, 50),
        gotoCoord: new Coord(70, 70),
        gotoPath: [new Coord(51, 51), new Coord(70, 70)],
        worldCoord: new Coord(50, 50),
        arrivalEffect: {from: new Coord(49, 49)},
    }],
};
global._map_terrain_bit_by_user = {7: _map_terrain_bit};
global._map_resource_visibility_by_user = {7: matrix(() => true)};

const {serverGame} = require('../../server_game.js');
serverGame.updateServerClock({map_size: 300});

assert.equal(serverGame.setMapWindowOrigin(23, 38, true), true);
assert.deepEqual(serverGame.mapWindowParameters(), {
    map_origin_i: 20, map_origin_j: 30, map_window_size: 100,
});
assert.deepEqual(_units_by_user[7][0].coord, new Coord(30, 20));
assert.deepEqual(
    [_units_by_user[7][0].gotoCoord.i, _units_by_user[7][0].gotoCoord.j],
    [50, 40]
);
assert.deepEqual(
    [_units_by_user[7][0].gotoPath[1].i, _units_by_user[7][0].gotoPath[1].j],
    [50, 40]
);
assert.deepEqual(serverGame.localToWorld(new Coord(30, 20)), new Coord(50, 50));
assert.deepEqual(serverGame.worldToLocal(new Coord(50, 50)), new Coord(30, 20));
assert.equal(_map_terrain_tex[30][20], 0x35, 'overlapping terrain must transfer into the shifted window');
assert.deepEqual(_map_resource[30][20], {type: 34, hidden: false});
assert.deepEqual(_map_terrain_mod[30][20], {road: true, mine: true});
assert.equal(_map_terrain_tex[99][99], 0, 'only the newly exposed strip starts empty before its response is applied');
assert.equal(serverGame.mapWindowTargetForWorld(new Coord(70, 80)), null,
    'a selected unit in the central 80x80 area must not shift the window');
assert.deepEqual(serverGame.mapWindowTargetForWorld(new Coord(115, 80)), {i: 30, j: 30},
    'a selected unit within ten Tiles of the right edge shifts by ten Tiles');

const payload = serverGame.serializableProperties(_units_by_user[7][0]);
assert.equal(payload.worldCoord, undefined, 'authoritative world coordinates are client-only state');
assert.equal(payload.arrivalEffect, undefined, 'arrival animation is client-only state');

console.log('PASS JS map-window shifting is edge-triggered and transfers overlapping terrain without a black reset');

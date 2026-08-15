#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');

global.Coord = class Coord {
    constructor(i, j) { this.i = i; this.j = j; }
};
global._map_size = 100;
global._cell_width = 200;
global._cell_height = 200;
global._ratio = 2;
global._screenOffsetX = 5000;
global._screenOffsetY = 1000;
global.xy1toi = (x, y) => (x*2 + _screenOffsetX*2*_ratio + y*2 + _screenOffsetY*2*_ratio)/2/_cell_height;
global.xy1toj = (x, y) => (x*2 + _screenOffsetX*2*_ratio - y*2 - _screenOffsetY*2*_ratio)/2/_cell_width;
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
    }, {
        type: 3,
        coord: new Coord(5, 5),
        worldCoord: new Coord(5, 5),
        economy: {citizens: [{coord: new Coord(6, 5), worldCoord: {i: 6, j: 5}}]},
    }],
};
global._map_terrain_bit_by_user = {7: _map_terrain_bit};
global._map_resource_visibility_by_user = {7: matrix(() => true)};

const {serverGame} = require('../../server_game.js');
serverGame.updateServerClock({map_size: 300});
serverGame.updateServerClock({map_origin: {i: 200, j: 200}});
assert.deepEqual(serverGame.mapWindowParameters(), {
    map_origin_i: 0, map_origin_j: 0, map_window_size: 100,
}, 'generic and possibly stale responses must not move the loaded map window');

const worldCenterBeforeShift = {
    i: serverGame.viewportCenterLocal().i,
    j: serverGame.viewportCenterLocal().j,
};
assert.equal(serverGame.setMapWindowOrigin(23, 38, true), true);
assert.deepEqual(serverGame.mapWindowParameters(), {
    map_origin_i: 20, map_origin_j: 30, map_window_size: 100,
});
assert.deepEqual(_units_by_user[7][0].coord, new Coord(30, 20));
assert.equal(_units_by_user[7][0].outsideMapWindow, false);
assert.deepEqual(_units_by_user[7][1].coord, new Coord(-15, -25));
assert.equal(_units_by_user[7][1].outsideMapWindow, true,
    'an owned City outside the loaded window remains stored but is not renderable');
assert.deepEqual(_units_by_user[7][1].economy.citizens[0].coord, new Coord(-14, -25),
    'City citizen coordinates follow their authoritative world position across window shifts');
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
const worldCenterAfterShift = serverGame.viewportCenterLocal();
assert.equal(worldCenterAfterShift.i + 20, worldCenterBeforeShift.i,
    'window shifting must keep the same world i coordinate at screen center');
assert.equal(worldCenterAfterShift.j + 30, worldCenterBeforeShift.j,
    'window shifting must keep the same world j coordinate at screen center');
assert.equal(_map_terrain_tex[30][20], 0x35, 'overlapping terrain must transfer into the shifted window');
assert.deepEqual(_map_resource[30][20], {type: 34, hidden: false});
assert.deepEqual(_map_terrain_mod[30][20], {road: true, mine: true});
assert.equal(_map_terrain_tex[99][99], 0, 'only the newly exposed strip starts empty before its response is applied');
assert.equal(serverGame.mapWindowTargetForViewportCenter(new Coord(50, 50)), null,
    'a viewport centered inside the central 60x60 area must not shift the window');
assert.deepEqual(serverGame.mapWindowTargetForViewportCenter(new Coord(19, 50)), {i: 10, j: 30},
    'a viewport center within twenty Tiles of the i-min border shifts left');
assert.deepEqual(serverGame.mapWindowTargetForViewportCenter(new Coord(20, 50)), {i: 10, j: 30},
    'a viewport center exactly twenty Tiles from the i-min border shifts left');
assert.deepEqual(serverGame.mapWindowTargetForViewportCenter(new Coord(80, 50)), {i: 30, j: 30},
    'a viewport center within twenty Tiles of the i-max border shifts right');
assert.deepEqual(serverGame.mapWindowTargetForViewportCenter(new Coord(50, 19)), {i: 20, j: 20},
    'a viewport center within twenty Tiles of the j-min border shifts up');
assert.deepEqual(serverGame.mapWindowTargetForViewportCenter(new Coord(50, 80)), {i: 20, j: 40},
    'a viewport center within twenty Tiles of the j-max border shifts down');
assert.deepEqual(serverGame.mapWindowTargetForViewportCenter(new Coord(5, 95)), {i: 0, j: 50},
    'a viewport center beyond two margins catches up by multiple ten-Tile steps');
assert.equal(serverGame.responseMatchesCurrentMapWindow({map_origin: {i: 20, j: 30}}), true);
assert.equal(serverGame.responseMatchesCurrentMapWindow({map_origin: {i: 10, j: 30}}), false,
    'a delayed sparse response for an old origin must be rejected');

const visibleTerrainReference = _map_terrain_tex;
const visibleFogReference = _map_terrain_bit;
const visibleUnitCoord = new Coord(_units_by_user[7][0].coord.i, _units_by_user[7][0].coord.j);
const visibleOffset = {x: _screenOffsetX, y: _screenOffsetY};
serverGame.setHiddenMapWindowOrigin(170, 180);
assert.deepEqual(serverGame.mapWindowParameters(), {
    map_origin_i: 170, map_origin_j: 180, map_window_size: 100,
});
assert.equal(_map_terrain_tex, visibleTerrainReference,
    'a hidden snapshot origin must not shift visible terrain matrices');
assert.equal(_map_terrain_bit, visibleFogReference,
    'a hidden snapshot origin must not shift visible fog matrices');
assert.deepEqual(_units_by_user[7][0].coord, visibleUnitCoord,
    'a hidden snapshot origin must not relocate visible units');
assert.deepEqual({x: _screenOffsetX, y: _screenOffsetY}, visibleOffset,
    'a hidden snapshot origin must not move the visible camera');
serverGame.setHiddenMapWindowOrigin(20, 30);

const payload = serverGame.serializableProperties(_units_by_user[7][0]);
assert.equal(payload.worldCoord, undefined, 'authoritative world coordinates are client-only state');
assert.equal(payload.arrivalEffect, undefined, 'arrival animation is client-only state');

const fs = require('node:fs');
assert.doesNotMatch(fs.readFileSync('game_prehistory.js', 'utf8'), /ensureMapWindowForSelectedUnit/,
    'unit selection must no longer trigger map-window loading');
assert.match(fs.readFileSync('screen.js', 'utf8'), /completedFullDraw[\s\S]*ensureMapWindowForViewport/,
    'completed camera drawing must trigger viewport-center window checks');
assert.match(fs.readFileSync('screen.js', 'utf8'), /start_j \+ width_j - 1/,
    'map drawing must start at the final in-range visible column');
assert.doesNotMatch(fs.readFileSync('screen.js', 'utf8'), /for \([^\n]*j=start_j \+ width_j;/,
    'map drawing must never read the column after its visible range');
assert.match(fs.readFileSync('screen.js', 'utf8'), /Map render failed; scheduling a clean redraw/,
    'a partial failed WebGL frame must schedule a clean full redraw');
assert.match(fs.readFileSync('index.html', 'utf8'), /visibilitychange[\s\S]*resumeGameInputAndDrawing/,
    'returning to an idle browser must cancel stale pointer input and redraw terrain');
assert.match(fs.readFileSync('index.html', 'utf8'), /webglcontextrestored[\s\S]*restoreContext/,
    'a browser-evicted WebGL context must restore terrain textures');

console.log('PASS JS map-window shifting follows the viewport center and preserves overlapping terrain');

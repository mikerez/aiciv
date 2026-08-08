#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const arrows = [];
const sandbox = {
    console,
    Coord: class Coord {
        constructor(i, j) { this.i = i; this.j = j; }
    },
    _units: [
        {coord: {i: 10, j: 10}, type: 2, can_move: true, gotoPath: [{i: 11, j: 10}, {i: 12, j: 11}]},
        {coord: {i: 20, j: 20}, type: 2, can_move: true, gotoPath: [{i: 20, j: 19}]},
        {coord: {i: 30, j: 30}, type: 2, can_move: true, gotoPath: [], gotoCoord: {i: 32, j: 30}},
    ],
    _selection: 2,
    _map_size: 100,
    _game: {canUnitEnterTile() { return true; }},
    _draw: {
        clear() { return {}; },
        drawArrow(ctx, fromX, fromY, toX, toY) { arrows.push({fromX, fromY, toX, toY}); },
    },
    x1toX: value => value,
    y1toY: value => value,
    ijtox1: (i, j) => i * 10 + j,
    ijtoy1: (i, j) => i * 10 - j,
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('control.js', 'utf8') + '\nglobalThis.control = _control;', sandbox);
const before = JSON.stringify(sandbox._units);
sandbox.control.drawMovementOrders({});
assert.equal(arrows.length, 5, 'persisted steps and a destination-only route should be redrawn');
assert.equal(JSON.stringify(sandbox._units), before, 'redrawing orders must not consume or change routes');
const arrowsBeforeSelection = arrows.length;
assert.equal(sandbox.control.forceDrawSelectedMovementOrder(), true,
    'selecting a unit with a destination must force route drawing');
assert.equal(arrows.length, arrowsBeforeSelection + 2, 'selected destination should repaint both arrow steps');

const routeBeforePreview = JSON.stringify(sandbox._units[0]);
const arrowsBeforePreview = arrows.length;
const previewPath = sandbox.control.drawGotoPreview(10, 10, 13, 10, 0);
assert.equal(previewPath.length, 3, 'Goto hover preview must calculate the path to the current pointer Tile');
assert.ok(arrows.length > arrowsBeforePreview, 'Goto hover preview must paint arrows immediately');
assert.equal(JSON.stringify(sandbox._units[0]), routeBeforePreview,
    'Goto hover preview must not overwrite the unit route before destination click');

sandbox.control.drawGoto(10, 10, 13, 10, 0);
assert.equal(sandbox._units[0].gotoPath.length, 3, 'committed Goto must still save the calculated route');
assert.deepEqual(
    JSON.parse(JSON.stringify(sandbox._units[0].gotoCoord)),
    {i: 13, j: 10},
    'committed Goto must retain the final destination'
);

const index = fs.readFileSync('index.html', 'utf8');
assert.match(index, /function applySecondaryMapAction\(coord\)[\s\S]*?_selection != -1[\s\S]*?drawCommandPathPreview\(coord\)[\s\S]*?return;[\s\S]*?_menu_tile\.show\(coord\.i, coord\.j\)/,
    'secondary map action must assign a selected unit route and show Tile details otherwise');
assert.match(index, /drawCommandPathPreview\(coord\);[\s\S]*?commitCommandPath\(coord\);[\s\S]*?configureSelectedMovementIntent\(coord\)/,
    'right-click and drag movement must commit the path after drawing its preview');
const validation = index.indexOf('!forcedByTimeout && _current_game.canEndTurnWithCurrentSelection');
const capture = index.indexOf('_server_game.captureTurn(_current_user)');
assert.ok(validation >= 0 && validation < capture, 'manual idle validation must happen before capture consumes paths');
assert.match(index, /if \(_authenticated_player_id == null\) \{[\s\S]*makeTurnAnimated\(!!forcedByTimeout\)/,
    'only non-authoritative clients may execute speculative local movement');
assert.match(index, /unitSelected && _control\.forceDrawSelectedMovementOrder/,
    'unit selection must explicitly repaint an existing Goto route');
const menu = fs.readFileSync('menu_unit.js', 'utf8');
const prehistory = fs.readFileSync('game_prehistory.js', 'utf8');
assert.match(menu, /data-menu-option="unit_identity"/, 'Action panel must include unit identity');
assert.match(prehistory, /Unit ID:.*serverId/s, 'Action panel identity must use authoritative serverId');
assert.match(prehistory, /drawCommandPathPreview\(coord\)[\s\S]*?drawGotoPreview/,
    'Goto command mode must use the non-mutating realtime preview renderer');
const serverGame = fs.readFileSync('server_game.js', 'utf8');
assert.match(serverGame, /atomic_movement_rejected|showServerErrorPopup/,
    'server turn failures must be routed to the immediate client popup');
assert.match(serverGame, /applyRejectedMovements\(submission\.playerId, result\.rejected_movements/,
    'individually rejected movements must clear their client-owned routes');
assert.match(serverGame, /isTerminalBuildError[\s\S]*clearRejectedWorkerBuild/,
    'terminal build conflicts must clear the Worker build state');
assert.match(serverGame, /window\.alert\(lines\.join/,
    'the movement rejection popup must be visible without opening a debug menu');
assert.match(serverGame, /action: 'report_cli_error'/,
    'client request failures must be sent to the dedicated report endpoint');
assert.match(serverGame, /async showServerErrorPopup\(error\)[\s\S]*await this\.reportClientError\(error\)[\s\S]*window\.alert/,
    'the client report must finish or time out before the error popup is shown');
const phpServer = fs.readFileSync('server_game.php', 'utf8');
assert.match(phpServer, /completeReadyProductionsForPlayer[\s\S]*\(\$result\['status'\] \?\? ''\) === 'PAUSE'/,
    'the batched server completion pass must pause full-stack City production');
const layer = fs.readFileSync('game_prehistory.js', 'utf8');
assert.match(layer, /const _tile_movable_unit_limit = 5/,
    'client and server movement must use the five-unit Tile limit');
assert.match(layer, /stack\.count < _tile_movable_unit_limit[\s\S]*movingUnit\.type == 2 && stack\.hasVisibleForeignDefender/,
    'client pathfinding must block a sixth ordinary unit without blocking military attacks');
assert.match(layer, /serverVisibilityByUser[\s\S]*hasVisibleForeignDefender = true/,
    'an unseen foreign unit must not create a client-side attack exception');

function classMethod(source, name) {
    const start = source.indexOf('    ' + name + '(');
    assert.ok(start >= 0, 'missing class method ' + name);
    const brace = source.indexOf('{', start);
    let depth = 0;
    for (let index = brace; index < source.length; index++) {
        if (source[index] === '{') depth++;
        if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1).trim();
    }
    throw new Error('unterminated class method ' + name);
}

const moving = {team: 7, type: 2, can_move: true, health: 100, coord: {i: 1, j: 1}};
const friendlyStack = Array.from({length: 5}, () => (
    {team: 7, type: 2, can_move: true, health: 100, coord: {i: 2, j: 1}}
));
const enemy = {
    team: 8,
    type: 2,
    can_move: true,
    health: 100,
    coord: {i: 2, j: 1},
    serverVisibilityByUser: {7: false},
};
const stackSandbox = {_current_user: 7, _units: [moving], _units_by_user: {7: [moving, ...friendlyStack], 8: [enemy]}};
vm.createContext(stackSandbox);
vm.runInContext('globalThis.rules = new class {' + classMethod(layer, 'tileUnitStackState') + '};', stackSandbox);
let stack = stackSandbox.rules.tileUnitStackState(moving, 2, 1);
assert.equal(stack.count, 5, 'five friendly movable units must fill the Tile');
assert.equal(stack.hasVisibleForeignDefender, false, 'an unseen enemy must not enable attacking a full Tile');
enemy.serverVisibilityByUser[7] = true;
stack = stackSandbox.rules.tileUnitStackState(moving, 2, 1);
assert.equal(stack.count, 6, 'a visible enemy is included in the Tile occupancy');
assert.equal(stack.hasVisibleForeignDefender, true, 'a visible enemy must enable the military attack exception');
console.log('PASS timeout bypass, authoritative movement, and all-unit route redraw are wired');

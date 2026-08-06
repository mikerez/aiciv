#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function Coord(i, j) { this.i = i; this.j = j; }
function Unit(type, texture, coord) {
    this.type = type;
    this.texture = texture;
    this.coord = coord;
    this.gotoPath = [];
    this.pendingServerPath = [];
}

const localUnit = new Unit(2, 258, new Coord(4, 4));
localUnit.serverId = 12;
localUnit.team = 7;
localUnit.can_move = true;
localUnit.speed = 1;
localUnit.gotoPath = [new Coord(5, 4), new Coord(6, 4)];
localUnit.gotoCoord = new Coord(6, 4);
localUnit.pendingServerPath = localUnit.gotoPath.slice();

const context = {
    console,
    Date,
    JSON,
    Math,
    Promise,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Unit,
    Coord,
    _units_by_user: {7: [localUnit]},
    _units: [localUnit],
    _current_user: 7,
    _selection: 0,
    localStorage: {
        values: {},
        getItem(key) { return this.values[key] || null; },
        setItem(key, value) { this.values[key] = value; },
        removeItem(key) { delete this.values[key]; },
    },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('server_game.js', 'utf8') + '\nglobalThis.serverGame = _server_game;', context);
const game = context.serverGame;
const liveListReference = context._units_by_user[7];
game.awaitingTurnByPlayer[7] = 3;
game.applyVisibilityUpdates = function() {};
game.log = function() {};

const submission = game.captureTurn(7);
assert.deepEqual(
    JSON.parse(JSON.stringify(submission.commands[0].path)),
    [{i: 5, j: 4}],
    'captureTurn must submit only one atomic segment for a speed-one unit'
);
assert.equal(localUnit.gotoPath.length, 2, 'capturing a turn must not consume the client-owned route');
localUnit.gotoPath = [];
localUnit.gotoCoord = null;

function update(turn, i, j, properties) {
    game.applyUnitUpdates(7, {
        turn,
        units: [{
            id: 12, client_key: 'route-unit', owner_id: 7, unit_type_id: 'warrior',
            unit_class: 2, name: 'Warrior', texture: 258, can_move: true, nature: 'land',
            i, j, attack: 2, defense: 1, speed: 1, view_range: 2,
            state: 'ready', health: 100, max_health: 100, experience: 1,
            move_penalty: 0, properties,
        }],
        owned_unit_ids: [12],
        visible_enemy_ids: [],
        visibility: [],
    });
}

update(3, 4, 4, {gotoPath: [], gotoCoord: null, pendingServerPath: []});
assert.equal(context._units_by_user[7], liveListReference,
    'initial synchronization must reconcile the existing list instead of replacing it with an empty list');
assert.equal(context._units[0].gotoPath.length, 2,
    'an unresolved-turn snapshot must restore the browser-persisted local route');

delete game.awaitingTurnByPlayer[7];
update(4, 5, 4, {gotoPath: [], gotoCoord: null, pendingServerPath: []});
assert.deepEqual(
    context._units[0].gotoPath.map(point => [point.i, point.j]),
    [[6, 4]],
    'an authoritative atomic move must trim only the reached route step'
);
update(5, 6, 4, {});
assert.equal(context._units[0].gotoPath.length, 0,
    'the client route must clear after its final destination is reached');
context._units[0].gotoPath = [new Coord(7, 4)];
context._units[0].gotoCoord = new Coord(7, 4);
game.saveClientRoutes(7);
assert.equal(game.cancelClientRouteForCombat(7, 12), true);
assert.equal(context._units[0].gotoPath.length, 0,
    'an authoritative combat result must end the attacker client route');
context._units[0].gotoPath = [new Coord(7, 4)];
context._units[0].gotoCoord = new Coord(7, 4);
game.applyUnitUpdates(91, {
    units: [{
        id: 12, client_key: 'route-unit', owner_id: 7, unit_type_id: 'warrior',
        unit_class: 2, name: 'Warrior', texture: 258, can_move: true, nature: 'land',
        i: 6, j: 4, attack: 2, defense: 1, speed: 1, view_range: 2,
        state: 'ready', health: 100, max_health: 100, experience: 1,
        move_penalty: 0, properties: {},
    }],
    visibility: [],
}, { pruneForeignUnits: false, preserveExistingForeignUnits: true });
assert.equal(context._units_by_user[7], liveListReference,
    'hidden-player synchronization must retain the displayed player list object');
assert.equal(context._units_by_user[7][0].gotoPath.length, 1,
    'hidden-player synchronization must not mutate a displayed foreign unit route');
const enemy = new Unit(2, 258, new Coord(8, 8));
enemy.serverId = 88;
enemy.team = 9;
context._units_by_user[9] = [enemy];
const enemyListReference = context._units_by_user[9];
game.applyUnitUpdates(7, {
    units: [], owned_unit_ids: [12], visible_enemy_ids: [], visibility: [],
});
assert.equal(context._units_by_user[9], enemyListReference,
    'fog synchronization must retain the foreign owner array');
assert.equal(context._units_by_user[9][0], enemy,
    'fog synchronization must retain the foreign unit object');
assert.equal(enemy.serverVisibilityByUser[7], false,
    'fog synchronization should change visibility state instead of deleting the unit');
console.log('PASS server snapshots preserve and trim the client-owned route');

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
    _map_size: 100,
    _map_origin_i: 0,
    _map_origin_j: 0,
    _map: {
        roads: new Set(),
        hasRoad(i, j) { return this.roads.has(i + ':' + j); },
    },
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
const indexedRoutes = game.indexClientRoutes([
    {server_id: 12, client_key: 'route-unit', path: [{i: 5, j: 4}]},
]);
assert.equal(game.storedClientRoute(7, localUnit, 12, 'route-unit', indexedRoutes).server_id, 12,
    'route synchronization must use the prebuilt route index');
assert.equal(game.normalizeClientRoutePath({i: 1, j: 1}, [
    {i: 2, j: 1}, {i: 3, j: 1}, {i: 2, j: 1}, {i: 4, j: 1},
]).length, 2, 'route normalization must stop at a cycle');
assert.equal(game.normalizeClientRoutePath({i: 1, j: 1}, Array.from(
    {length: 1000}, (_, index) => ({i: index + 2, j: 1})
)).length, 30, 'route normalization must cap persisted routes at the engine limit');
const liveListReference = context._units_by_user[7];
game.awaitingTurnByPlayer[7] = 3;
game.applyVisibilityUpdates = function() {};
game.log = function() {};
game.setOneTurnMessage(7, 'old message', 4);
assert.equal(game.clearOneTurnMessageAfterQuietTurn(7, 4, false), false,
    'a message remains visible during its originating turn');
assert.equal(game.clearOneTurnMessageAfterQuietTurn(7, 5, true), false,
    'a new message prevents quiet-turn clearing');
assert.equal(game.clearOneTurnMessageAfterQuietTurn(7, 5, false), true,
    'the next quiet resolved turn clears the previous message');

const submission = game.captureTurn(7);
assert.deepEqual(
    JSON.parse(JSON.stringify(submission.commands[0].path)),
    [{i: 5, j: 4}],
    'captureTurn must submit only one atomic segment for a speed-one unit'
);
context._map.roads.add('4:4');
context._map.roads.add('5:4');
context._map.roads.add('6:4');
const roadSubmission = game.captureTurn(7);
assert.deepEqual(
    JSON.parse(JSON.stringify(roadSubmission.commands[0].path)),
    [{i: 5, j: 4}, {i: 6, j: 4}],
    'captureTurn must submit two connected-road steps for a speed-one unit'
);
assert.equal(localUnit.gotoPath.length, 2, 'capturing a turn must not consume the client-owned route');
localUnit.move_penalty = 2;
const penaltySubmission = game.captureTurn(7);
assert.equal(penaltySubmission.commands[0].command, 'hold',
    'the client must hold instead of submitting movement while a move penalty is active');
assert.equal(localUnit.gotoPath.length, 2,
    'holding for a move penalty must preserve the remaining route');
game.applyRejectedMovements(7, [{
    unit_id: 12, reason: 'unit_has_move_penalty', move_penalty: 2,
}]);
assert.equal(localUnit.gotoPath.length, 2,
    'a stale-client move-penalty rejection must not cancel the remaining route');
localUnit.move_penalty = 0;
localUnit.gotoPath = [];
localUnit.gotoCoord = null;

function update(turn, i, j, properties, unitType = 'warrior', state = 'ready') {
    game.applyUnitUpdates(7, {
        turn,
        units: [{
            id: 12, client_key: 'route-unit', owner_id: 7, unit_type_id: unitType,
            unit_class: unitType == 'worker' ? 1 : 2, name: unitType == 'worker' ? 'Worker' : 'Warrior', texture: 258, can_move: true, nature: 'land',
            i, j, attack: 2, defense: 1, speed: 1, view_range: 2,
            state, health: 100, max_health: 100, experience: 1,
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
assert.equal(
    JSON.stringify(context._units[0].gotoPath.map(point => [point.i, point.j])),
    JSON.stringify([[6, 4]]),
    'an authoritative atomic move must trim only the reached route step'
);
update(5, 6, 4, {});
assert.equal(context._units[0].gotoPath.length, 0,
    'the client route must clear after its final destination is reached');
context._units[0].unitTypeId = 'worker';
context._units[0].type = 1;
context._units[0].automationMode = null;
context._units[0].state = 'ready';
update(5, 6, 4, {automationMode: 'road_to'}, 'worker', 'ready');
assert.equal(context._units[0].automationMode, null,
    'an orphan Road-to mode without a route or active road build must be cleared');
context._units[0].unitTypeId = 'explorer';
context._units[0].type = 1;
context._units[0].automationMode = null;
context._units[0].state = 'ready';
update(5, 6, 4, {automationMode: 'explore'}, 'explorer', 'ready');
assert.equal(context._units[0].automationMode, 'explore',
    'an authoritative Explorer automation mode must survive reload and route completion');
const explorerSubmission = game.captureTurn(7);
assert.equal(explorerSubmission.commands[0].payload.automation_mode, 'explore');
assert.equal(explorerSubmission.commands[0].payload.automation_diagnostic.unit_type_id, 'explorer');
context._units[0].unitTypeId = 'worker';
context._units[0].type = 1;
context._units[0].state = 'cottage';
context._units[0].clientImprovementTurnsLeft = 2;
game.saveClientRoutes(7);
update(6, 6, 4, {}, 'worker', 'ready');
assert.equal(context._units[0].state, 'cottage',
    'an older server snapshot must not erase a newly selected improvement command');
assert.equal(context._units[0].clientImprovementTurnsLeft, 2,
    'an older server snapshot must preserve the local improvement countdown');
const storedImprovement = JSON.parse(context.localStorage.values[game.clientRouteStorageKey(7)])[0];
assert.equal(storedImprovement.improvement_state, 'cottage',
    'reload persistence must include the improvement command, not only its countdown');
context._units[0].state = 'fortification';
context._units[0].clientImprovementTurnsLeft = 1;
context._units[0].clientImprovementState = 'fortification';
game.saveClientRoutes(7);
update(7, 6, 4, {clientImprovementTurnsLeft: 1}, 'worker', 'ready');
assert.equal(context._units[0].state, 'ready',
    'authoritative ready state must clear an orphan countdown with no matching improvement type');
assert.equal(context._units[0].clientImprovementTurnsLeft, undefined,
    'an orphan server countdown must not restart a completed Fortification');
context._units[0].state = 'road_to';
context._units[0].automationMode = 'road_to';
context._units[0].gotoPath = [new Coord(7, 4)];
context._units[0].gotoCoord = new Coord(7, 4);
delete context._units[0].clientImprovementTurnsLeft;
delete context._units[0].clientImprovementState;
game.saveClientRoutes(7);
update(7, 6, 4, {
    clientImprovementTurnsLeft: 3,
    clientImprovementState: 'workshop',
}, 'worker', 'workshop');
assert.equal(context._units[0].state, 'road_to',
    'a newly selected Road-to route must override stale server Workshop metadata');
assert.equal(context._units[0].clientImprovementTurnsLeft, undefined,
    'Road-to must not inherit an obsolete Workshop countdown');
context._units[0].automationMode = null;
context._units[0].gotoPath = [];
context._units[0].gotoCoord = null;
context._units[0].state = 'fortification';
context._units[0].clientImprovementTurnsLeft = 0;
context._units[0].clientImprovementState = 'fortification';
game.saveClientRoutes(7);
update(8, 6, 4, {
    clientImprovementTurnsLeft: 0,
    clientImprovementState: 'fortification',
}, 'worker', 'fortification');
assert.equal(context._units[0].clientImprovementTurnsLeft, 0,
    'a completed Fortification countdown must remain completed after synchronization');
assert.equal(context._units[0].pendingImmediateBuild, true,
    'a completed but unconfirmed Fortification must be retried after synchronization');
context._units[0].unitTypeId = 'warrior';
context._units[0].type = 2;
context._units[0].state = 'ready';
delete context._units[0].clientImprovementTurnsLeft;
game.saveClientRoutes(7);
context._units[0].gotoPath = [new Coord(7, 4)];
context._units[0].gotoCoord = new Coord(7, 4);
game.saveClientRoutes(7);
assert.equal(game.cancelClientRouteForCombat(7, 12), true);
assert.equal(context._units[0].gotoPath.length, 0,
    'an authoritative combat result must end the attacker client route');
context._units[0].gotoPath = [new Coord(7, 4)];
context._units[0].gotoCoord = new Coord(7, 4);
game.applyUnitUpdates(7, {
    units: [{
        id: 12, client_key: 'route-unit', owner_id: 7, unit_type_id: 'warrior',
        unit_class: 2, name: 'Warrior', texture: 258, can_move: true, nature: 'land',
        i: 99, j: 99, attack: 2, defense: 1, speed: 1, view_range: 2,
        state: 'ready', health: 100, max_health: 100, experience: 1,
        move_penalty: 0, properties: {},
    }],
    owned_unit_ids: [12], visible_enemy_ids: [], visibility: [],
}, {reconcileClientRoutes: false});
assert.equal(context._units[0].gotoPath.length, 0,
    'snapshot route isolation must not reconcile an old local route against another map window');
context._units[0].coord = new Coord(6, 4);
context._units[0].worldCoord = new Coord(106, 154);
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

const city = new Unit(3, 259, new Coord(0, 0));
city.serverId = 90;
city.team = 7;
context._units_by_user[7].push(city);
context._map_origin_i = 100;
context._map_origin_j = 150;
game.applyUnitUpdates(7, {
    units: [{
        id: 90, client_key: 'world-city', owner_id: 7, unit_type_id: 'city',
        unit_class: 3, name: 'World City', texture: 259, can_move: false, nature: 'land',
        i: 120, j: 180, world_i: 120, world_j: 180,
        attack: 0, defense: 8, speed: 0, view_range: 3,
        state: 'ready', health: 100, max_health: 100, experience: 1, move_penalty: 0,
        properties: {economy: {citizens: [{coord: {i: 121, j: 180}, income: {food: 1}}]}},
    }],
    owned_unit_ids: [12, 90], visible_enemy_ids: [], visibility: [],
});
assert.deepEqual(
    {i: city.coord.i, j: city.coord.j}, {i: 20, j: 30},
    'server world coordinates must map once into the current local window'
);
assert.deepEqual(
    {i: city.economy.citizens[0].coord.i, j: city.economy.citizens[0].coord.j}, {i: 21, j: 30},
    'server City citizen world coordinates must map into the same local window'
);
assert.deepEqual(JSON.parse(JSON.stringify(city.economy.citizens[0].worldCoord)), {i: 121, j: 180});

context._map_origin_i = 0;
context._map_origin_j = 0;
context._units_by_user[7].splice(1);
context._units[0].unitTypeId = 'worker';
context._units[0].type = 1;
context._units[0].coord = new Coord(4, 4);
context._units[0].worldCoord = new Coord(4, 4);
context._units[0].state = 'road_to';
context._units[0].automationMode = 'road_to';
context._units[0].gotoPath = [new Coord(5, 4), new Coord(6, 4)];
context._units[0].gotoCoord = new Coord(6, 4);
context._units[0].serverRevision = 20;
game.applyUnitUpdates(7, {
    revision: 19,
    units: [{
        id: 12, client_key: 'route-unit', owner_id: 7, unit_type_id: 'worker',
        unit_class: 1, name: 'Worker', texture: 258, can_move: true, nature: 'land',
        i: 3, j: 4, attack: 0, defense: 1, speed: 1, view_range: 2,
        state: 'ready', health: 100, max_health: 100, experience: 1, move_penalty: 0,
        revision: 19, properties: {},
    }],
    owned_unit_ids: [12], visible_enemy_ids: [], visibility: [],
});
assert.deepEqual({i: context._units[0].coord.i, j: context._units[0].coord.j}, {i: 4, j: 4},
    'an older unit snapshot must not move a Worker backward');
assert.equal(context._units[0].gotoPath.length, 2,
    'an older unit snapshot must not erase a persistent Road-to route');
assert.equal(context._units[0].automationMode, 'road_to');
console.log('PASS server snapshots preserve routes and ignore stale Worker positions');

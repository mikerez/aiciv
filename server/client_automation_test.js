#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let routeRenewals = 0;
const patrol = {
    serverId: 11, serverClientKey: 'patrol', team: 7, type: 2,
    unitTypeId: 'warrior', can_move: true, speed: 1, state: 'patrol', gotoPath: [], coord: {i: 4, j: 4},
};
const worker = {
    serverId: 12, serverClientKey: 'worker', team: 7, type: 1,
    unitTypeId: 'worker', can_move: true, speed: 1, state: 'cottage', gotoPath: [], coord: {i: 5, j: 5},
};
const units = [patrol, worker];
const sandbox = {
    console, Date, JSON, Math, Promise, setTimeout, clearTimeout, setInterval, clearInterval,
    _units: units,
    _units_by_user: {7: units},
    _game_state_by_user: {7: {}},
    _current_game: {
        applyAutoRoutingRules() {
            routeRenewals++;
            patrol.gotoPath = [{i: 5, j: 4}];
        },
    },
    _authenticated_player_id: undefined,
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('server_game.js', 'utf8') + '\nglobalThis.serverGame = _server_game;', sandbox);
const submission = sandbox.serverGame.captureTurn(7);

assert.equal(routeRenewals, 1, 'automatic routes must be renewed before an authoritative capture');
assert.equal(submission.commands[0].command, 'move');
assert.deepEqual(JSON.parse(JSON.stringify(submission.commands[0].path)), [{i: 5, j: 4}]);
assert.equal(submission.commands[1].command, 'build', 'an active Worker improvement must use immediate build');
assert.equal(submission.commands[1].payload.modifier, 'cottage');
console.log('PASS Patrol/Automate renewal and immediate Worker build capture');

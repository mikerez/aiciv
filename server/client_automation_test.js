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
const firstSubmission = sandbox.serverGame.captureTurn(7);

assert.equal(routeRenewals, 1, 'automatic routes must be renewed before an authoritative capture');
assert.equal(firstSubmission.commands[0].command, 'move');
assert.deepEqual(JSON.parse(JSON.stringify(firstSubmission.commands[0].path)), [{i: 5, j: 4}]);
assert.equal(firstSubmission.commands[1].command, 'set_state', 'first improvement turn only persists Worker state');
assert.equal(firstSubmission.actions.length, 0, 'first improvement turn must not contact the build endpoint');
assert.equal(worker.clientImprovementTurnsLeft, 1);
const secondSubmission = sandbox.serverGame.captureTurn(7);
assert.equal(secondSubmission.commands[1].command, 'hold', 'completed client countdown uses the action batch');
assert.equal(secondSubmission.actions.length, 1, 'second improvement turn submits one build request');
assert.equal(secondSubmission.actions[0].type, 'build');
assert.equal(secondSubmission.actions[0].building_type, 'cottage');
const chopper = {unitTypeId: 'worker', state: 'chop_forest'};
assert.equal(sandbox.serverGame.advanceImprovementCountdown(chopper, 'chop_forest'), false);
assert.equal(chopper.clientImprovementTurnsLeft, 3);
assert.equal(sandbox.serverGame.advanceImprovementCountdown(chopper, 'chop_forest'), false);
assert.equal(sandbox.serverGame.advanceImprovementCountdown(chopper, 'chop_forest'), false);
assert.equal(sandbox.serverGame.advanceImprovementCountdown(chopper, 'chop_forest'), true,
    'jungle chopping must complete on the fourth client turn');
const layer = fs.readFileSync('game_prehistory.js', 'utf8');
assert.match(layer, /startAutomatedWorkerAction\(k, action\)[\s\S]*?beginImprovement\(k, action, true\)/,
    'Worker automation must start the same delayed improvement state as manual commands');
assert.match(layer, /pendingImmediateBuild[\s\S]*?isImprovementState\(_units\[k\]\.state\)/,
    'Worker automation must not reset an active improvement countdown');
assert.doesNotMatch(layer, /primaryModifiers = \['irrigation'[\s\S]*?modifiers\[primaryModifiers\[modifierIndex\]\]/,
    'Worker commands may replace an existing primary improvement');
assert.match(layer, /canBuildIrrigation\(k\)[\s\S]*?openedResourceImprovementForTile\(i, j\)/,
    'irrigation must not be offered over an opened resource requiring another improvement');
const map = fs.readFileSync('map.js', 'utf8');
assert.match(map, /replacePrimaryTerrainModifier\(i, j, modifier\)/,
    'client terrain mutations must replace the previous primary improvement');
const php = fs.readFileSync('server_game.php', 'utf8');
assert.match(php, /function serverReplacePrimaryImprovement[\s\S]*?\$name === \$replacement/,
    'server terrain mutations must replace the previous primary improvement');
assert.match(php, /\$modifier === 'road' \? ':road' : ':improvement'/,
    'road and primary improvements must use separate occupancy keys');
assert.match(php, /function resetRejectedImprovementUnit[\s\S]*?SET state = 'ready'/,
    'the server must persist ready state after a rejected improvement');
console.log('PASS Patrol/Automate renewal and delayed transactional Worker builds');

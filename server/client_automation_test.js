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
assert.equal(worker.clientImprovementTurnsLeft, 4);
for (let turnsLeft = 3; turnsLeft >= 1; turnsLeft--) {
    const waitingSubmission = sandbox.serverGame.captureTurn(7);
    assert.equal(waitingSubmission.commands[1].command, 'set_state');
    assert.equal(waitingSubmission.actions.length, 0);
    assert.equal(worker.clientImprovementTurnsLeft, turnsLeft);
}
const fifthSubmission = sandbox.serverGame.captureTurn(7);
assert.equal(fifthSubmission.commands[1].command, 'hold', 'completed client countdown uses the action batch');
assert.equal(fifthSubmission.actions.length, 1, 'fifth Cottage turn submits one build request');
assert.equal(fifthSubmission.actions[0].type, 'build');
assert.equal(fifthSubmission.actions[0].building_type, 'cottage');
const retrySubmission = sandbox.serverGame.captureTurn(7);
assert.equal(retrySubmission.actions.length, 1,
    'a pending improvement must be retried until PHP confirms it');
assert.equal(retrySubmission.actions[0].building_type, 'cottage');
sandbox.serverGame.applyTurnActionResults(7, retrySubmission.actions, [{
    client_action_id: retrySubmission.actions[0].client_action_id,
    type: 'build', ok: true, duplicate_skipped: true,
}], false);
assert.equal(worker.pendingImmediateBuild, true,
    'a duplicate/skipped turn must not falsely complete the improvement');
const confirmedSubmission = sandbox.serverGame.captureTurn(7);
assert.equal(confirmedSubmission.actions.length, 1,
    'a duplicate/skipped improvement must be submitted on the following turn');
sandbox.serverGame.applyTurnActionResults(7, confirmedSubmission.actions, [{
    client_action_id: confirmedSubmission.actions[0].client_action_id,
    type: 'build', ok: true, result: {status: 'BUILT'},
}], false);
assert.equal(worker.state, 'ready', 'only an authoritative build result clears the Worker state');
assert.equal(worker.pendingImmediateBuild, false, 'confirmed build clears the pending retry marker');
assert.equal(worker.clientImprovementTurnsLeft, undefined, 'confirmed build clears the countdown');
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
assert.match(layer, /\(!hasPrimary \|\| replaceWorkshopForFood\)[\s\S]*?!modifiers\.irrigation[\s\S]*?this\.canBuildIrrigation/,
    'automation must preserve primary improvements except a Workshop replaced for food recovery');
assert.match(layer, /replaceWorkshopForFood = preferred == 'farm' && modifiers\.workshop[\s\S]*?!this\.workerCityAllowsWorkshop/,
    'only a food-deficit City may replace its Workshop with Irrigation');
assert.match(layer, /Finish prepared Irrigation before preparing another Tile/,
    'automation must finish prepared Farm or Cottage Tiles even before citizen assignment');
assert.match(layer, /_prehistory_unit_sprites[\s\S]*?vocabularyText\('production\.option',[\s\S]*?attack: unitType\.attack[\s\S]*?defense: unitType\.defense[\s\S]*?speed: unitType\.speed/,
    'city production rows must include the actual unit sprite and A/D/S characteristics');
assert.match(layer, /vocabularyText\('production\.option',[\s\S]*?food: this\.unitFoodUpkeep\(unitType\.id\)[\s\S]*?gold: this\.unitGoldUpkeep\(unitType\.id\)/,
    'city production rows must show authoritative per-turn food and gold upkeep');
assert.match(layer, /irrigationConnectedToWater\(originI, originJ\)[\s\S]*?return this\.irrigationConnectedToWater\(i, j\)/,
    'JS must reject disconnected Irrigation before starting a Worker countdown');
const costs = fs.readFileSync('menu_costs.js', 'utf8');
const vocabulary = fs.readFileSync('vocabulary_EN.js', 'utf8');
assert.match(costs, /cost\.unit_upkeep[\s\S]*?cost\.improvement_upkeep[\s\S]*?common\.overall/,
    'the Costs window must group unit and improvement upkeep with totals');
assert.match(costs, /lastCityIncome[\s\S]*?workshopFoodCost/,
    'the Costs window must adjust current City food from the authoritative Workshop charge');
assert.match(costs, /cost\.city_balances[\s\S]*?cost\.balance_food_production_gold/,
    'the Costs window must show per-City food, production, and gold balances');
assert.match(costs, /name == 'workshop'[\s\S]*?cityIsProducing\(workshopCity\)/,
    'the Costs window must charge Workshop food only for actively producing parent Cities');
assert.match(vocabulary, /'cost\.unit_upkeep': 'Unit upkeep'[\s\S]*?'cost\.improvement_upkeep': 'Improvement upkeep'/,
    'Costs window labels must be defined in the vocabulary');
assert.match(vocabulary, /'production\.option': '\{name\} \(\{cost\}\) \{attack\}\/\{defense\}\/\{speed\} \| Costs F:\{food\} G:\{gold\}'/,
    'City production rows must show A/D/S and food/gold upkeep costs');
assert.match(layer, /remaining > 0[\s\S]*?perTurn <= 0[\s\S]*?return null/,
    'zero-production Cities must report a paused queue instead of fake remaining turns');
assert.match(layer, /production\.paused_status/,
    'the City production status must visibly identify a paused queue');
assert.match(layer, /productionText[\s\S]*?'\\n' \+ economyText[\s\S]*?idleProductionText \+ '\\n' \+ idleEconomyText/,
    'active and idle City production labels must end before the economy details');
assert.match(layer, /road: \{food:0, production:1, gold:0\}[\s\S]*?fortification: \{food:0, production:2, gold:0\}[\s\S]*?workshop: \{food:2, production:0, gold:0\}/,
    'client improvement costs must match server economy costs');
assert.doesNotMatch(layer, /Producing:/,
    'city production status must not include the redundant Production label');
assert.match(fs.readFileSync('index.html', 'utf8'), /loadTexture\('nets\.png[^']*', 872\)/,
    'Nets must use a texture slot that is not overwritten by Village');
console.log('PASS Patrol/Automate renewal and delayed transactional Worker builds');

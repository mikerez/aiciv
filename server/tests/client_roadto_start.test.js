#!/usr/bin/env node
'use strict';

const {assert, mapTiles, unit} = require('./test_client');
const {Coord, createBrowserClient, localUnit} = require('./browser_client');

const playerId = 71465;
const workerDefinition = unit({
    client_key:'worker-1465', owner_id:playerId, i:4, j:4,
});
const worker = localUnit(workerDefinition, 1465);
const client = createBrowserClient({
    size:64,
    playerId,
    gameId:'client-roadto-start-1465',
    tiles:mapTiles(64, 2),
    units:[worker],
});
const destination = new Coord(52, 52);
const persistedModes = [];
client.serverGame.persistUnitAutomationMode = function(unit, mode) {
    persistedModes.push({unit, mode});
    return Promise.resolve(null);
};
client._selection = 0;
client.currentGame.doCommand('road_to');
assert.equal(worker.state, 'ready',
    'selecting Road-to must not persist an incomplete destinationless Worker state');
assert.equal(worker.automationMode, undefined);
assert.equal(persistedModes.length, 0,
    'Road-to automation must not reach PHP until a valid destination exists');

assert.equal(client.currentGame.assignRoadToDestination(0, destination), true,
    'a distant Road-to command must accept a useful partial land route');
assert.equal(worker.state, 'road_to');
assert.equal(worker.automationMode, 'road_to');
assert.equal(worker.roadToBuilding, true,
    'Road-to must immediately start building on the current non-road Tile');
assert.equal(worker.clientImprovementTurnsLeft, 6,
    'the first Road-to Tile must start the normal six-turn countdown');
assert.equal(persistedModes.length, 1);
assert.equal(persistedModes[0].mode, 'road_to',
    'the complete Road-to order must persist after its route and build state are ready');
assert.deepEqual(
    {i:worker.roadToDestination.i, j:worker.roadToDestination.j},
    {i:destination.i, j:destination.j},
    'Road-to must remember the final destination independently of its first segment'
);
assert.ok(worker.gotoPath.length > 0 && worker.gotoPath.length <= 30,
    'the first segment must fit the bounded client route');
assert.notDeepEqual(
    {i:worker.gotoCoord.i, j:worker.gotoCoord.j},
    {i:destination.i, j:destination.j},
    'this regression requires a destination beyond the first route segment'
);

client.serverGame.saveClientRoutes(playerId);
const stored = JSON.parse(client.localStorage.getItem(client.serverGame.clientRouteStorageKey(playerId)))[0];
assert.deepEqual(stored.road_to_destination, {i:destination.i, j:destination.j},
    'reload persistence must retain the final Road-to destination');

// Reproduce the live failure: an AI pass demoted the Worker immediately before
// captureTurn(), so activeWorkerModifier() did not start the road countdown.
worker.state = 'automate';
worker.automationMode = 'automate';
const recoveredSubmission = client.serverGame.captureTurn(playerId);
const recoveredCommand = recoveredSubmission.commands.find(command => command.unit_id === worker.serverId);
assert.equal(worker.state, 'road_to');
assert.equal(worker.automationMode, 'road_to');
assert.equal(worker.clientImprovementTurnsLeft, 5,
    'turn capture must restore Road-to and advance its first road countdown');
assert.equal(recoveredCommand.command, 'set_state');
assert.equal(recoveredCommand.payload.state, 'road_to');
assert.equal(recoveredCommand.payload.automation_mode, 'road_to');

const firstSegmentEnd = worker.gotoCoord;
worker.coord = new Coord(firstSegmentEnd.i, firstSegmentEnd.j);
worker.gotoPath = [];
worker.gotoCoord = null;
worker.roadToBuilding = true;
client.currentGame.completeRoadToBuild(worker, true);
assert.equal(worker.automationMode, 'road_to');
assert.ok(worker.gotoPath.length > 0,
    'completing the last road in one segment must plan the next segment');
assert.deepEqual(
    {i:worker.roadToDestination.i, j:worker.roadToDestination.j},
    {i:destination.i, j:destination.j}
);

console.log('PASS Worker 1465-style distant Road-to starts immediately and continues by segments');

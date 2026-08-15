#!/usr/bin/env node
'use strict';

const {assert, mapTiles, unit, city} = require('./test_client');
const {createBrowserClient, localUnit} = require('./browser_client');

const playerId = 7902;
const capitalDefinition = city({client_key: 'capital', owner_id: playerId, i: 5, j: 5});
const workerDefinition = unit({
    client_key: 'worker', owner_id: playerId, i: 15, j: 15,
    state: 'automate', properties: {automationMode: 'automate'},
});
const client = createBrowserClient({
    size: 20,
    playerId,
    gameId: 'client-worker-automation',
    tiles: mapTiles(20),
    units: [
        localUnit(capitalDefinition, 1),
        localUnit(workerDefinition, 2),
    ],
});
const worker = client._units[1];
worker.automationMode = 'automate';

assert.equal(client.currentGame.autoRouteWorker(1), true);
assert.deepEqual(
    {i: worker.gotoCoord.i, j: worker.gotoCoord.j},
    {i: 5, j: 5},
    'a distant automated Worker routes back to its nearest owned City'
);
assert.equal(worker.automateTarget, undefined, 'return routing is not recorded as a remote work target');

worker.gotoPath = [];
worker.gotoCoord = null;
worker.suppressAutomationMenu = true;
client._selection = 1;
const actionMenu = {
    style: {display: 'block'},
    querySelector() { return null; },
    querySelectorAll() { return []; },
};
client.document = {
    body: {classList: {contains() { return false; }}},
    getElementById(id) { return id === 'foreground' ? actionMenu : null; },
};
client.currentGame.applyMenuRules();
assert.equal(actionMenu.style.display, 'none', 'automatic completion keeps the Worker menu suppressed');
client.currentGame.showActionMenuForSelection();
assert.equal(actionMenu.style.display, 'block', 'an explicit Worker selection reopens the action menu');
assert.equal(worker.suppressAutomationMenu, undefined);

const citylessWorker = localUnit(workerDefinition, 3);
const cityless = createBrowserClient({
    size: 20, playerId, gameId: 'client-worker-no-city', tiles: mapTiles(20), units: [citylessWorker],
});
citylessWorker.automationMode = 'automate';
assert.equal(cityless.currentGame.autoRouteWorker(0), false);
assert.equal(citylessWorker.gotoCoord, null, 'an automated Worker without an owned City does not wander');

const farmTiles = mapTiles(12, 0);
for (const tile of farmTiles) tile.terrain_tex = 0;
for (const point of [
    {i: 5, j: 5, terrain: 2},
    {i: 4, j: 5, terrain: 6},
    {i: 6, j: 5, terrain: 2},
    {i: 6, j: 6, terrain: 7},
]) {
    farmTiles.find(tile => tile.i === point.i && tile.j === point.j).terrain_tex = point.terrain;
}
const farmCity = localUnit(city({client_key: 'farm-city', owner_id: playerId, i: 5, j: 5}), 4);
farmCity.lastCityIncome = {food: 0, grossFood: 1, production: 10, money: 3, foodConsumption: 1};
farmCity.economy = {citizens: [{coord: {i: 6, j: 5}}], lastIncome: farmCity.lastCityIncome};
const farmWorker = localUnit(unit({
    client_key: 'farm-worker', owner_id: playerId, i: 4, j: 5,
    state: 'automate', properties: {automationMode: 'automate'},
}), 5);
const farmClient = createBrowserClient({
    size: 12, playerId, gameId: 'client-worker-farm-priority',
    tiles: farmTiles, units: [farmCity, farmWorker],
});
farmWorker.automationMode = 'automate';
assert.equal(farmClient.currentGame.workerAutomationOptionsAt(1, 6, 5, farmCity).join(','), 'irrigate',
    'an open field is irrigated before it becomes a Farm target');
assert.equal(farmClient.currentGame.workerAutomationOptionsAt(1, 6, 6, farmCity).join(','), 'irrigate',
    'a river Tile is irrigated before it becomes a Farm target');
assert.equal(farmClient.currentGame.workerAutomationOptionsAt(1, 4, 5).join(','), 'chop_forest',
    'the competing forest remains a valid chopping target');
assert.equal(farmClient.currentGame.autoRouteWorker(1), true);
assert.equal(farmWorker.automateBuild, 'irrigate',
    'Farm preparation outranks chopping nearby forest');

const balancedTiles = mapTiles(12, 0);
for (const tile of balancedTiles) tile.terrain_tex = 0;
for (const point of [
    {i: 5, j: 5, terrain: 2, modifiers: {}},
    {i: 4, j: 5, terrain: 6, modifiers: {}},
    {i: 6, j: 5, terrain: 2, modifiers: {farm: true, road: true}},
    {i: 6, j: 6, terrain: 7, modifiers: {}},
]) {
    const tile = balancedTiles.find(item => item.i === point.i && item.j === point.j);
    tile.terrain_tex = point.terrain;
    tile.modifiers = point.modifiers;
}
const balancedCity = localUnit(city({
    client_key: 'balanced-city', owner_id: playerId, i: 5, j: 5,
}), 6);
balancedCity.lastCityIncome = {food: 3, grossFood: 5, production: 1, money: 0, foodConsumption: 2};
balancedCity.economy = {citizens: [{coord: {i: 6, j: 6}}], lastIncome: balancedCity.lastCityIncome};
const balancedWorker = localUnit(unit({
    client_key: 'balanced-worker', owner_id: playerId, i: 4, j: 5,
    state: 'automate', properties: {automationMode: 'automate'},
}), 7);
const balancedClient = createBrowserClient({
    size: 12, playerId, gameId: 'client-worker-balanced-farms',
    tiles: balancedTiles, units: [balancedCity, balancedWorker],
});
balancedWorker.automationMode = 'automate';
assert.equal(balancedClient.currentGame.workerCityNeedsGenericFarm(balancedCity), false,
    'a food-positive City with its minimum Farm does not demand another generic Farm');
assert.equal(balancedClient.currentGame.autoRouteWorker(1), true);
assert.equal(balancedWorker.automateBuild, 'workshop',
    'a City with low production prioritizes a Workshop over more Farms and chopping');

const metalTiles = mapTiles(12, 2);
const ironTile = metalTiles.find(tile => tile.i === 6 && tile.j === 5);
ironTile.terrain_tex = 1;
ironTile.resource_type = 34;
const metalCity = localUnit(city({
    client_key: 'metal-city', owner_id: playerId, i: 5, j: 5,
}), 8);
const metalWorker = localUnit(unit({
    client_key: 'metal-worker', owner_id: playerId, i: 5, j: 5,
    state: 'automate', properties: {automationMode: 'automate'},
}), 9);
const metalClient = createBrowserClient({
    size: 12, playerId, gameId: 'client-worker-resource-road',
    tiles: metalTiles, units: [metalCity, metalWorker],
});
metalWorker.automationMode = 'automate';
assert.equal(metalClient.currentGame.workerAutomationOptionsAt(1, 6, 5).join(','), 'mine',
    'a resource-bearing sand Tile supports its required Mine');
assert.equal(metalClient.currentGame.autoRouteWorker(1), true);
assert.equal(metalWorker.automateBuild, 'mine',
    'an automated Worker improves an unimproved resource before connecting it');
assert.equal(metalWorker.automationPriority, 2);

const replacementTiles = mapTiles(12, 0);
for (const point of [{i:5,j:5}, {i:6,j:5}]) {
    const mapTile = replacementTiles.find(tile => tile.i === point.i && tile.j === point.j);
    mapTile.terrain_tex = 2;
    if (point.i === 6) mapTile.modifiers = {cottage:true, road:true};
}
const replacementCity = localUnit(city({
    client_key:'replacement-city', owner_id:playerId, i:5, j:5,
}), 10);
replacementCity.lastCityIncome = {food:3, production:0, money:5, foodConsumption:1};
replacementCity.economy = {citizens:[{coord:{i:6,j:5}}], lastIncome:replacementCity.lastCityIncome};
const replacementWorker = localUnit(unit({
    client_key:'replacement-worker', owner_id:playerId, i:6, j:5,
    state:'automate', properties:{automationMode:'automate'},
}), 11);
const replacementClient = createBrowserClient({
    size:12, playerId, gameId:'client-worker-replacement', tiles:replacementTiles,
    units:[replacementCity, replacementWorker],
});
replacementWorker.automationMode = 'automate';
assert.equal(replacementClient.currentGame.autoRouteWorker(1), true);
assert.equal(replacementWorker.state, 'workshop',
    'when no untouched productive Tile exists, a low-production City replaces Cottage with Workshop');

console.log('PASS automated Worker menu, City bounds, citizen improvements, and resource priority');

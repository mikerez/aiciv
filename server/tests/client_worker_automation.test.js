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

assert.equal(client.currentGame.unitFoodUpkeep('worker'), 1);
assert.equal(client.currentGame.unitFoodUpkeep('warrior'), 4);
assert.equal(client.currentGame.unitFoodUpkeep('knight'), 12);
assert.equal(client.currentGame.unitGoldUpkeep('knight'), 12);
const fortificationUpkeep = client.currentGame.terrainImprovementUpkeep().fortification;
assert.equal(fortificationUpkeep.food, 0);
assert.equal(fortificationUpkeep.production, 2);
assert.equal(fortificationUpkeep.gold, 0);

assert.equal(client.currentGame.autoRouteWorker(1), true);
assert.deepEqual(
    {i: worker.gotoCoord.i, j: worker.gotoCoord.j},
    {i: 5, j: 5},
    'a distant automated Worker routes back to its nearest owned City'
);
assert.equal(worker.automateTarget, undefined, 'return routing is not recorded as a remote work target');

worker.gotoPath = [];
worker.gotoCoord = null;
client._selection = 1;
const actionMenu = {
    style: {display: 'none'},
    querySelector() { return null; },
    querySelectorAll() { return []; },
};
client.document = {
    body: {classList: {contains() { return false; }}},
    getElementById(id) { return id === 'foreground' ? actionMenu : null; },
};
client.currentGame.applyMenuRules();
assert.equal(actionMenu.style.display, 'block', 'a server refresh restores the selected Worker menu');
client.currentGame.dismissActionMenu();
client.currentGame.applyMenuRules();
assert.equal(actionMenu.style.display, 'none', 'only explicit menu dismissal keeps the selected Worker menu hidden');
client.currentGame.showActionMenuForSelection();
assert.equal(actionMenu.style.display, 'block', 'an explicit Worker selection reopens the action menu');

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
assert.equal(balancedWorker.automateBuild, 'irrigate',
    'a City preserves its two-food reserve before adding a low-production Workshop');

const aksumTiles = mapTiles(14, 2);
for (const point of [
    {i:5,j:5}, {i:5,j:6}, {i:6,j:5}, {i:6,j:7}, {i:7,j:5}, {i:7,j:6},
]) {
    aksumTiles.find(tile => tile.i === point.i && tile.j === point.j).modifiers = {
        workshop:true, road:true,
    };
}
aksumTiles.find(tile => tile.i === 7 && tile.j === 7).modifiers = {irrigation:true};
const aksumCity = localUnit(city({
    client_key:'aksum-balance-city', owner_id:playerId, i:6, j:6,
    properties:{
        cityPopulation:13,
        lastCityIncome:{food:17,grossFood:34,production:32,grossProduction:51,money:9,
            foodConsumption:13,workshopFoodCost:0,productionActive:false},
        economy:{citizens:[{coord:{i:6,j:6}}],lastIncome:{food:17,production:32,money:9}},
    },
}), 2666);
const aksumWorker = localUnit(unit({
    client_key:'aksum-balance-worker',owner_id:playerId,i:6,j:5,
    state:'automate',properties:{automationMode:'automate'},
}), 2725);
const aksumClient = createBrowserClient({
    size:14,playerId,gameId:'client-worker-aksum-balance',tiles:aksumTiles,
    units:[aksumCity,aksumWorker],
});
aksumWorker.automationMode = 'automate';
const aksumCounts = aksumClient.currentGame.workerCityImprovementCounts(aksumCity);
assert.equal(aksumCounts.workshop, 6);
assert.equal(aksumCounts.foodSupport, 1);
assert.equal(aksumClient.currentGame.workerCityAllowsWorkshop(aksumCity, aksumWorker), false,
    'Aksum cannot add a seventh Workshop from an idle-production food snapshot');
assert.deepEqual(
    Array.from(aksumClient.currentGame.workerCityImprovementPriorities(aksumCity, aksumWorker)),
    ['farm','cottage'],
    'Aksum must restore food infrastructure before considering another Workshop'
);
assert.equal(aksumClient.currentGame.autoRouteWorker(1), true);
assert.equal(aksumWorker.automateBuild, 'farm',
    'Aksum Worker completes prepared Irrigation as a Farm');
assert.deepEqual({i:aksumWorker.gotoCoord.i,j:aksumWorker.gotoCoord.j},{i:7,j:7});

const concurrentTiles = mapTiles(14, 2);
concurrentTiles.find(tile => tile.i === 5 && tile.j === 5).modifiers = {workshop:true};
concurrentTiles.find(tile => tile.i === 7 && tile.j === 7).modifiers = {farm:true};
const concurrentCity = localUnit(city({
    client_key:'concurrent-workshop-city',owner_id:playerId,i:6,j:6,
    properties:{
        cityPopulation:6,
        lastCityIncome:{food:14,production:3,money:2,workshopFoodCost:0,productionActive:false},
        economy:{citizens:[{coord:{i:7,j:7}}],lastIncome:{food:14,production:3,money:2}},
    },
}), 2670);
const committedWorkshopWorker = localUnit(unit({
    client_key:'committed-workshop-worker',owner_id:playerId,i:5,j:6,
    state:'automate',properties:{automationMode:'automate'},
}), 2671);
committedWorkshopWorker.automationMode = 'automate';
committedWorkshopWorker.automateBuild = 'workshop';
committedWorkshopWorker.automateTarget = {i:5,j:6};
const concurrentWorkshopWorker = localUnit(unit({
    client_key:'concurrent-workshop-worker',owner_id:playerId,i:6,j:5,
    state:'automate',properties:{automationMode:'automate'},
}), 2672);
concurrentWorkshopWorker.automationMode = 'automate';
const concurrentClient = createBrowserClient({
    size:14,playerId,gameId:'client-worker-concurrent-workshop-balance',tiles:concurrentTiles,
    units:[concurrentCity,committedWorkshopWorker,concurrentWorkshopWorker],
});
const concurrentCounts = concurrentClient.currentGame.workerCityImprovementCounts(concurrentCity);
assert.equal(concurrentCounts.pendingWorkshop, 1,
    'a Workshop already selected by another Worker is included in City planning');
assert.equal(
    concurrentClient.currentGame.workerCityAllowsWorkshop(
        concurrentCity, concurrentWorkshopWorker, concurrentCounts
    ),
    false,
    'a second Worker cannot bypass the food-support ratio using a simultaneous Workshop order'
);

const starvingWorkshopTiles = mapTiles(12, 0);
Object.assign(starvingWorkshopTiles.find(tile => tile.i === 5 && tile.j === 5), {
    terrain_tex:2, modifiers:{irrigation:true, road:true, irrigationCityFood:true},
});
Object.assign(starvingWorkshopTiles.find(tile => tile.i === 5 && tile.j === 4), {
    terrain_tex:2, modifiers:{workshop:true, road:true},
});
Object.assign(starvingWorkshopTiles.find(tile => tile.i === 6 && tile.j === 5), {
    terrain_tex:0, modifiers:{},
});
const starvingWorkshopCity = localUnit(city({
    client_key:'worker-1465-city', owner_id:playerId, i:5, j:5,
    properties:{
        cityPopulation:19,
        lastCityIncome:{food:-35, grossFood:48, production:0, grossProduction:51,
            money:11, foodConsumption:83, workshopFoodCost:64, productionActive:true},
        economy:{citizens:[{coord:{i:5,j:4}}], lastIncome:{food:-35,production:0,money:11}},
    },
}), 1464);
const starvingWorkshopWorker = localUnit(unit({
    client_key:'worker-1465', owner_id:playerId, i:4, j:4,
    state:'automate', properties:{automationMode:'automate'},
}), 1465);
const starvingWorkshopClient = createBrowserClient({
    size:12, playerId, gameId:'client-worker-1465-food-recovery',
    tiles:starvingWorkshopTiles, units:[starvingWorkshopCity, starvingWorkshopWorker],
});
starvingWorkshopWorker.automationMode = 'automate';
assert.deepEqual(
    Array.from(starvingWorkshopClient.currentGame.workerCityImprovementPriorities(starvingWorkshopCity)),
    ['farm', 'cottage'],
    'a zero-food City excludes Workshops regardless of low production'
);
assert.equal(
    starvingWorkshopClient.currentGame.workerAutomationOptionsAt(
        1, 5, 4, starvingWorkshopCity, true
    )[0],
    'irrigate',
    'Worker 1465 conditions allow a Workshop beside the irrigation chain to be replaced'
);
starvingWorkshopClient.currentGame.workerReplacementRandom = () => 0.10;
assert.equal(starvingWorkshopClient.currentGame.autoRouteWorker(1), true);
assert.equal(starvingWorkshopWorker.automateBuild, 'irrigate',
    'Worker 1465 conditions spread Irrigation instead of adding another Workshop');
assert.deepEqual(
    {i:starvingWorkshopWorker.gotoCoord.i, j:starvingWorkshopWorker.gotoCoord.j},
    {i:5,j:4},
    'Worker 1465 routes to the adjacent Workshop selected for food recovery'
);

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
metalWorker.coord = {i: 6, j: 5};
assert.equal(
    metalClient.currentGame.workerTileBuildingMenuOptions(1).join(','),
    'fortification,mine',
    'a resource Tile exposes Fortification as well as its matching improvement'
);
metalWorker.coord = {i: 5, j: 5};
assert.equal(metalClient.currentGame.autoRouteWorker(1), true);
assert.equal(metalWorker.automateBuild, 'mine',
    'an automated Worker improves an unimproved resource before connecting it');
assert.equal(metalWorker.automationPriority, 2);

const replacementTiles = mapTiles(12, 0);
for (const point of [{i:5,j:5}, {i:5,j:4}, {i:6,j:5}]) {
    const mapTile = replacementTiles.find(tile => tile.i === point.i && tile.j === point.j);
    mapTile.terrain_tex = 2;
    if (point.i === 5 && point.j === 4) mapTile.modifiers = {farm:true,road:true};
    if (point.i === 6) mapTile.modifiers = {cottage:true, road:true};
}
const replacementCity = localUnit(city({
    client_key:'replacement-city', owner_id:playerId, i:5, j:5,
}), 10);
replacementCity.lastCityIncome = {food:6, production:0, money:5, foodConsumption:1};
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
replacementClient.currentGame.workerReplacementRandom = () => 0.10;
assert.equal(replacementClient.currentGame.autoRouteWorker(1), true);
assert.equal(replacementWorker.state, 'workshop',
    'when no untouched productive Tile exists, a low-production City replaces Cottage with Workshop');
replacementClient._map_terrain_mod[6][5] = {hamlet:true, road:true};
assert.equal(replacementClient.currentGame.tileHasPrimaryImprovement(6, 5), true,
    'an evolved Hamlet remains a protected primary improvement');
assert.equal(replacementClient.currentGame.workerActionReplacesImprovement(6, 5, 'workshop'), true,
    'changing an evolved Hamlet is classified as replacement work');

const rejectedReplacementCity = localUnit(city({
    client_key:'rejected-replacement-city', owner_id:playerId, i:5, j:5,
}), 110);
rejectedReplacementCity.lastCityIncome = replacementCity.lastCityIncome;
rejectedReplacementCity.economy = {
    citizens:[{coord:{i:6,j:5}}], lastIncome:replacementCity.lastCityIncome,
};
const rejectedReplacementWorker = localUnit(unit({
    client_key:'rejected-replacement-worker', owner_id:playerId, i:6, j:5,
    state:'automate', properties:{automationMode:'automate'},
}), 111);
const rejectedReplacementClient = createBrowserClient({
    size:12, playerId, gameId:'client-worker-replacement-roll-rejected',
    tiles:replacementTiles,
    units:[rejectedReplacementCity, rejectedReplacementWorker],
});
rejectedReplacementWorker.automationMode = 'automate';
let rejectedReplacementRolls = 0;
rejectedReplacementClient.currentGame.workerReplacementRandom = () => {
    rejectedReplacementRolls++;
    return 0.80;
};
assert.equal(rejectedReplacementClient.currentGame.autoRouteWorker(1), false,
    'the 80% replacement-rejected branch leaves the established Cottage unchanged');
assert.equal(rejectedReplacementWorker.state, 'automate');
assert.equal(rejectedReplacementRolls, 1,
    'one random roll gates the whole replacement stage, independent of candidate count');

const blockedReplacementTiles = replacementTiles.map(tile => ({
    ...tile, modifiers:{...(tile.modifiers || {})},
}));
const blockedCitizenTile = blockedReplacementTiles.find(tile => tile.i === 5 && tile.j === 4);
blockedCitizenTile.terrain_tex = 0;
blockedCitizenTile.modifiers = {};
const blockedReplacementCity = localUnit(city({
    client_key:'blocked-replacement-city', owner_id:playerId, i:5, j:5,
}), 112);
blockedReplacementCity.lastCityIncome = replacementCity.lastCityIncome;
blockedReplacementCity.economy = {
    citizens:[{coord:{i:6,j:5}}, {coord:{i:5,j:4}}],
    lastIncome:replacementCity.lastCityIncome,
};
const blockedReplacementWorker = localUnit(unit({
    client_key:'blocked-replacement-worker', owner_id:playerId, i:6, j:5,
    state:'automate', properties:{automationMode:'automate'},
}), 113);
const blockedReplacementClient = createBrowserClient({
    size:12, playerId, gameId:'client-worker-replacement-unimproved-citizen',
    tiles:blockedReplacementTiles,
    units:[blockedReplacementCity, blockedReplacementWorker],
});
blockedReplacementWorker.automationMode = 'automate';
let blockedReplacementRolls = 0;
blockedReplacementClient.currentGame.workerReplacementRandom = () => {
    blockedReplacementRolls++;
    return 0;
};
assert.equal(blockedReplacementClient.currentGame.autoRouteWorker(1), false,
    'an unimproved citizen-worked Tile forbids every established-improvement replacement');
assert.equal(blockedReplacementWorker.state, 'automate');
assert.equal(blockedReplacementRolls, 0,
    'the replacement roll is not consumed while a citizen-worked Tile is unimproved');

const remoteWorkTiles = mapTiles(14, 0);
for (let step=3; step<=9; step++) {
    const corridor = remoteWorkTiles.find(tile => tile.i === step && tile.j === step);
    corridor.terrain_tex = 2;
    corridor.modifiers = {fortification:true, road:true};
}
Object.assign(remoteWorkTiles.find(tile => tile.i === 3 && tile.j === 2), {
    terrain_tex:2, modifiers:{cottage:true, road:true},
});
Object.assign(remoteWorkTiles.find(tile => tile.i === 9 && tile.j === 8), {
    terrain_tex:6, modifiers:{},
});
const localReplacementCity = localUnit(city({
    client_key:'local-replacement-city', owner_id:playerId, i:3, j:3,
    properties:{
        cityPopulation:1,
        lastCityIncome:{food:5,production:0,money:5,foodConsumption:1},
        economy:{citizens:[{coord:{i:3,j:2}}],lastIncome:{food:5,production:0,money:5}},
    },
}), 114);
const remoteWorkCity = localUnit(city({
    client_key:'remote-work-city', owner_id:playerId, i:9, j:9,
    properties:{
        cityPopulation:1,
        economy:{citizens:[{coord:{i:9,j:8}}]},
    },
}), 115);
const remoteWorkWorker = localUnit(unit({
    client_key:'remote-work-worker', owner_id:playerId, i:3, j:2,
    state:'automate', properties:{automationMode:'automate'},
}), 116);
const remoteWorkClient = createBrowserClient({
    size:14, playerId, gameId:'client-worker-remote-work-before-replacement',
    tiles:remoteWorkTiles,
    units:[localReplacementCity, remoteWorkCity, remoteWorkWorker],
});
remoteWorkWorker.automationMode = 'automate';
remoteWorkClient.currentGame.workerReplacementRandom = () => 0;
assert.equal(remoteWorkClient.currentGame.autoRouteWorker(2), true);
assert.equal(remoteWorkWorker.automateBuild, 'chop_forest',
    'useful untouched work at another owned City is selected before local replacement');
assert.deepEqual(
    {i:remoteWorkWorker.gotoCoord.i,j:remoteWorkWorker.gotoCoord.j},
    {i:9,j:8},
    'the Worker routes to the other City rather than replacing its local Cottage'
);

const fortifiedTiles = mapTiles(12, 2);
const fortifiedTile = fortifiedTiles.find(tile => tile.i === 6 && tile.j === 5);
fortifiedTile.modifiers = {fortification:true};
const fortifiedWorker = localUnit(unit({
    client_key:'fortified-worker', owner_id:playerId, i:6, j:5,
}), 12);
const fortifiedClient = createBrowserClient({
    size:12, playerId, gameId:'client-worker-fortification-protection',
    tiles:fortifiedTiles, units:[fortifiedWorker],
});
assert.equal(fortifiedClient.currentGame.canBuildIrrigation(0), false,
    'a Worker cannot replace a Fortification with Irrigation');
assert.equal(fortifiedClient.currentGame.canBuildWorkerTileBuilding(0, 'workshop'), false,
    'a Worker cannot replace a Fortification with a primary improvement');
assert.equal(fortifiedClient.currentGame.canBuildRoad(0), true,
    'a Road may coexist with an existing Fortification');
fortifiedClient._map_terrain_tex[6][5] = 6;
assert.equal(fortifiedClient.currentGame.canChopForest(0), false,
    'a Worker cannot destroy a Fortification by chopping its forest Tile');

const preparedTiles = mapTiles(12, 0);
for (const point of [{i:5,j:5}, {i:5,j:4}, {i:6,j:5}]) {
    preparedTiles.find(tile => tile.i === point.i && tile.j === point.j).terrain_tex = 2;
}
preparedTiles.find(tile => tile.i === 6 && tile.j === 5).modifiers = {irrigation:true};
const preparedCity = localUnit(city({
    client_key:'prepared-city', owner_id:playerId, i:5, j:5,
    properties:{
        cityPopulation:1,
        lastCityIncome:{food:0, production:0, money:0, foodConsumption:1},
        economy:{citizens:[{coord:{i:5,j:5}}], lastIncome:{food:0, production:0, money:0}},
    },
}), 13);
const preparedWorker = localUnit(unit({
    client_key:'prepared-worker', owner_id:playerId, i:5, j:4,
    state:'automate', properties:{automationMode:'automate'},
}), 14);
const preparedClient = createBrowserClient({
    size:12, playerId, gameId:'client-worker-prepared-irrigation', tiles:preparedTiles,
    units:[preparedCity, preparedWorker],
});
preparedWorker.automationMode = 'automate';
assert.equal(preparedClient.currentGame.autoRouteWorker(1), true,
    'automation must find prepared Irrigation outside the current citizen list');
assert.deepEqual({i:preparedWorker.gotoCoord.i, j:preparedWorker.gotoCoord.j}, {i:6,j:5});
assert.ok(['farm', 'cottage'].includes(preparedWorker.automateBuild),
    'prepared Irrigation must become Farm or Cottage instead of remaining Irrigation');

const liveLikeTiles = mapTiles(14, 2);
for (const point of [{i:6,j:5}, {i:6,j:6}, {i:6,j:7}, {i:7,j:7}]) {
    liveLikeTiles.find(tile => tile.i === point.i && tile.j === point.j).modifiers = {
        irrigation:true, road:true,
    };
}
const liveLikeCity = localUnit(city({
    client_key:'worker-2430-city', owner_id:playerId, i:5, j:6,
    properties:{
        cityPopulation:17,
        lastCityIncome:{food:18, grossFood:49, production:0, grossProduction:5,
            money:2, foodConsumption:21},
        economy:{citizens:[{coord:{i:6,j:5}}, {coord:{i:6,j:6}}, {coord:{i:6,j:7}}],
            lastIncome:{food:18, production:0, money:2}},
    },
}), 21);
const liveLikeWorker = localUnit(unit({
    client_key:'worker-2430', owner_id:playerId, i:7, j:6,
    state:'automate', properties:{automationMode:'automate'},
}), 22);
const liveLikeClient = createBrowserClient({
    size:14, playerId, gameId:'client-worker-2430-farm', tiles:liveLikeTiles,
    units:[liveLikeCity, liveLikeWorker],
});
liveLikeWorker.automationMode = 'automate';
assert.equal(liveLikeClient.currentGame.autoRouteWorker(1), true);
assert.equal(liveLikeWorker.automateBuild, 'farm',
    'Worker 2430 conditions choose Farm on nearby prepared Irrigation despite high City food');
assert.equal(Math.max(Math.abs(liveLikeWorker.gotoCoord.i-liveLikeWorker.coord.i),
    Math.abs(liveLikeWorker.gotoCoord.j-liveLikeWorker.coord.j)), 1,
    'Worker 2430 conditions choose an adjacent prepared Farm Tile');
const liveLikeSubmission = liveLikeClient.serverGame.captureTurn(playerId);
const liveLikeCommand = liveLikeSubmission.commands.find(command => command.unit_id === 22);
assert.equal(liveLikeCommand.payload.automation_mode, 'automate',
    'an ordinary player Worker sends its persistent automation mode to PHP');
assert.equal(liveLikeCommand.payload.worker_automation_decision.decision.action, 'farm',
    'an ordinary player Worker sends its selected Farm decision for server diagnostics');

const disconnectedTiles = mapTiles(12, 2);
disconnectedTiles.find(tile => tile.i == 6 && tile.j == 6).modifiers = {road:true};
Object.assign(disconnectedTiles.find(tile => tile.i == 8 && tile.j == 6), {
    terrain_tex:5, resource_type:34, modifiers:{mine:true},
});
const disconnectedCity = localUnit(city({
    client_key:'disconnected-city', owner_id:playerId, i:6, j:6,
    properties:{cityPopulation:2, economy:{citizens:[{coord:{i:6,j:6}}]}},
}), 23);
const disconnectedWorker = localUnit(unit({
    client_key:'disconnected-worker', owner_id:playerId, i:4, j:3,
    state:'automate', properties:{automationMode:'automate'},
}), 24);
const disconnectedClient = createBrowserClient({
    size:12, playerId, gameId:'client-worker-disconnected-road', tiles:disconnectedTiles,
    units:[disconnectedCity, disconnectedWorker],
});
disconnectedWorker.automationMode = 'automate';
assert.equal(disconnectedClient.currentGame.autoRouteWorker(1), true);
assert.equal(disconnectedWorker.lastAutomationDecision.action, 'connect_road');
assert.ok(disconnectedWorker.gotoPath.length > 0,
    'disconnected Worker receives a path back to the City road network');
const disconnectedSubmission = disconnectedClient.serverGame.captureTurn(playerId);
const disconnectedCommand = disconnectedSubmission.commands.find(command => command.unit_id === 24);
assert.equal(disconnectedCommand.command, 'move',
    'captureTurn must preserve and submit the automated return route');
assert.ok(disconnectedCommand.path.length > 0,
    'the submitted automated return route contains an atomic movement');

disconnectedWorker.gotoPath = [];
disconnectedWorker.gotoCoord = {i:8, j:6};
disconnectedWorker.automateBuild = 'connect_road';
disconnectedWorker.automateTarget = {i:8, j:6};
disconnectedClient.currentGame.applyAutoRoutingRules();
assert.ok(disconnectedWorker.gotoPath.length > 0,
    'Automate recovers an orphan destination by selecting a fresh route');
assert.equal(disconnectedWorker.lastAutomationDecision.choice, 'dispatch');

const cityOnlyTiles = mapTiles(10, 2);
cityOnlyTiles.find(tile => tile.i == 5 && tile.j == 5).modifiers = {road:true, irrigation:true};
const cityOnlyCity = localUnit(city({
    client_key:'city-only-city', owner_id:playerId, i:5, j:5,
    properties:{cityPopulation:1, economy:{citizens:[{coord:{i:5,j:5}}]}},
}), 25);
const cityOnlyWorker = localUnit(unit({
    client_key:'city-only-worker', owner_id:playerId, i:4, j:5,
    state:'automate', properties:{automationMode:'automate'},
}), 26);
const cityOnlyClient = createBrowserClient({
    size:10, playerId, gameId:'client-worker-city-tile', tiles:cityOnlyTiles,
    units:[cityOnlyCity, cityOnlyWorker],
});
cityOnlyWorker.automationMode = 'automate';
assert.equal(cityOnlyClient.currentGame.autoRouteWorker(1), true,
    'a population-one City Worker bootstraps an ordinary nearby Tile');
assert.notDeepEqual(cityOnlyWorker.automateTarget, {i:5, j:5},
    'Worker automation never targets the City Tile for an improvement');
assert.notEqual(cityOnlyWorker.lastAutomationDecision.choice, 'idle_no_available_work',
    'a City-only citizen assignment must not leave its Worker idle');

const islandTiles = mapTiles(10, 0);
for (const point of [{i:5,j:5,terrain:2}, {i:5,j:4,terrain:6}, {i:4,j:5,terrain:6}]) {
    islandTiles.find(tile => tile.i === point.i && tile.j === point.j).terrain_tex = point.terrain;
}
const islandCity = localUnit(city({
    client_key:'island-city', owner_id:playerId, i:5, j:5,
    properties:{cityPopulation:1, economy:{citizens:[{coord:{i:5,j:5}}]}},
}), 27);
const islandWorker = localUnit(unit({
    client_key:'island-worker', owner_id:playerId, i:5, j:5,
    state:'automate', properties:{automationMode:'automate'},
}), 28);
const islandClient = createBrowserClient({
    size:10, playerId, gameId:'client-worker-island-bootstrap', tiles:islandTiles,
    units:[islandCity, islandWorker],
});
islandWorker.automationMode = 'automate';
assert.equal(islandClient.currentGame.autoRouteWorker(1), true,
    'a Worker sharing its population-one City finds reachable forest work');
assert.equal(islandWorker.automateBuild, 'chop_forest');
assert.ok(islandWorker.gotoPath.length > 0,
    'the bootstrap Worker routes off its City Tile instead of holding');

const stagedTiles = mapTiles(12, 0);
for (const point of [{i:5,j:5}, {i:5,j:4}, {i:6,j:5}, {i:6,j:6}]) {
    stagedTiles.find(tile => tile.i === point.i && tile.j === point.j).terrain_tex = 2;
}
stagedTiles.find(tile => tile.i === 6 && tile.j === 6).modifiers = {irrigation:true};
const stagedCity = localUnit(city({
    client_key:'staged-city', owner_id:playerId, i:5, j:5,
    properties:{
        cityPopulation:2,
        lastCityIncome:{food:0, production:8, money:3, foodConsumption:2},
        economy:{citizens:[{coord:{i:6,j:5}}], lastIncome:{food:0, production:8, money:3}},
    },
}), 17);
const stagedWorker = localUnit(unit({
    client_key:'staged-worker', owner_id:playerId, i:5, j:4,
    state:'automate', properties:{automationMode:'automate'},
}), 18);
const stagedClient = createBrowserClient({
    size:12, playerId, gameId:'client-worker-finish-prepared-first', tiles:stagedTiles,
    units:[stagedCity, stagedWorker],
});
stagedWorker.automationMode = 'automate';
assert.equal(stagedClient.currentGame.autoRouteWorker(1), true);
assert.deepEqual({i:stagedWorker.gotoCoord.i, j:stagedWorker.gotoCoord.j}, {i:6,j:6});
assert.equal(stagedWorker.automateBuild, 'farm',
    'automation finishes a prepared Farm before irrigating another citizen Tile');

const reservingWorker = localUnit(unit({
    client_key:'stale-reservation', owner_id:playerId, i:4, j:4,
    state:'automate', properties:{automationMode:'automate'},
}), 19);
const candidateWorker = localUnit(unit({
    client_key:'reservation-candidate', owner_id:playerId, i:5, j:4,
    state:'automate', properties:{automationMode:'automate'},
}), 20);
const reservationClient = createBrowserClient({
    size:12, playerId, gameId:'client-worker-stale-reservation', tiles:stagedTiles,
    units:[stagedCity, reservingWorker, candidateWorker],
});
reservingWorker.automationMode = 'automate';
reservingWorker.automateTarget = {i:6,j:5};
candidateWorker.automationMode = 'automate';
assert.equal(reservationClient.currentGame.workerAutomationTargetReserved(2, 6, 5), false,
    'an idle Worker cannot reserve an abandoned automation target');
assert.equal(reservingWorker.automateTarget, undefined,
    'stale target state is removed while reservations are checked');

const dryTiles = mapTiles(12, 2);
const dryCity = localUnit(city({
    client_key:'dry-city', owner_id:playerId, i:5, j:5,
    properties:{
        cityPopulation:1,
        lastCityIncome:{food:5, production:0, money:2, foodConsumption:1},
        economy:{citizens:[{coord:{i:6,j:5}}], lastIncome:{food:5, production:0, money:2}},
    },
}), 15);
const dryWorker = localUnit(unit({
    client_key:'dry-worker', owner_id:playerId, i:6, j:5,
    state:'automate', properties:{automationMode:'automate'},
}), 16);
const dryClient = createBrowserClient({
    size:12, playerId, gameId:'client-worker-dry-irrigation', tiles:dryTiles,
    units:[dryCity, dryWorker],
});
dryWorker.automationMode = 'automate';
assert.equal(dryClient.currentGame.canBuildIrrigation(1), false,
    'the client rejects Irrigation when no fresh-water or irrigation route exists');
assert.notEqual(dryClient.currentGame.workerAutomationOptionsAt(1, 6, 5, dryCity)[0], 'irrigate',
    'automation does not spend turns on disconnected Irrigation');
dryClient.serverGame.serverTurn = 20;
dryWorker.state = 'irrigate';
dryWorker.automationCommandAction = 'irrigation';
dryWorker.automationCommandTarget = {i:6,j:5};
dryWorker.automationCommandDeadline = 20;
dryClient.currentGame.applyAutoRoutingRules();
assert.equal(dryWorker.state, 'workshop',
    'a timed-out Irrigation command is replaced by a different supported Worker action');
assert.equal(dryWorker.automationSkipNextAction, undefined,
    'the one-shot command exclusion clears after a different action is selected');

const resourceChainTiles = mapTiles(14, 2);
resourceChainTiles.find(tile => tile.i === 4 && tile.j === 4).modifiers = {farm:true, road:true};
const chainResource = resourceChainTiles.find(tile => tile.i === 9 && tile.j === 6);
chainResource.resource_type = 7;
chainResource.modifiers = {road:true};
const resourceChainCity = localUnit(city({
    client_key:'resource-chain-city', owner_id:playerId, i:6, j:6,
    properties:{
        cityPopulation:2,
        lastCityIncome:{food:0,production:5,money:2,foodConsumption:2},
        economy:{citizens:[{coord:{i:9,j:6}}],lastIncome:{food:0,production:5,money:2}},
    },
}), 41);
const resourceChainWorker = localUnit(unit({
    client_key:'resource-chain-worker',owner_id:playerId,i:9,j:6,
    state:'automate',properties:{automationMode:'automate'},
}), 42);
const resourceChainClient = createBrowserClient({
    size:14,playerId,gameId:'client-worker-resource-irrigation-chain',
    tiles:resourceChainTiles,units:[resourceChainCity,resourceChainWorker],
});
resourceChainWorker.automationMode = 'automate';
const firstChainTile = resourceChainClient.currentGame.nextResourceIrrigationChainTile(9, 6);
assert.ok(firstChainTile, 'automation finds an irrigable frontier toward disconnected Rice');
assert.notDeepEqual({i:firstChainTile.i,j:firstChainTile.j}, {i:9,j:6},
    'the disconnected Rice is not incorrectly treated as immediately irrigable');
assert.equal(resourceChainClient.currentGame.autoRouteWorker(1), true);
assert.equal(resourceChainWorker.automateBuild, 'irrigate',
    'the Worker starts an Irrigation-chain segment before attempting the Rice Farm');
assert.deepEqual(
    {i:resourceChainWorker.gotoCoord.i,j:resourceChainWorker.gotoCoord.j},
    {i:firstChainTile.i,j:firstChainTile.j},
    'the automated route targets the currently server-valid Irrigation frontier'
);

const shiftedTiles = mapTiles(12, 2);
shiftedTiles.find(tile => tile.i === 6 && tile.j === 5).modifiers = {irrigation:true, road:true};
const shiftedCity = localUnit(city({
    client_key:'shifted-city', owner_id:playerId, i:5,j:5,
    properties:{
        cityPopulation:3,
        lastCityIncome:{food:0,production:4,money:2,foodConsumption:3},
        economy:{citizens:[{coord:{i:6,j:5}}],lastIncome:{food:0,production:4,money:2}},
    },
}), 31);
const shiftedWorker = localUnit(unit({
    client_key:'shifted-worker',owner_id:playerId,i:4,j:5,
    state:'ready',properties:{automationMode:'automate'},
}), 32);
const shiftedClient = createBrowserClient({
    size:12,playerId,gameId:'client-worker-shifted-window',tiles:shiftedTiles,
    units:[shiftedCity,shiftedWorker],
});
shiftedWorker.automationMode = 'automate';
assert.equal(shiftedClient.currentGame.autoRouteWorker(1), true);
assert.equal(shiftedWorker.automateBuild, 'farm',
    'a Worker in a shifted map window converts prepared Irrigation into a Farm');

console.log('PASS automated Worker menu, City bounds, citizen improvements, and resource priority');

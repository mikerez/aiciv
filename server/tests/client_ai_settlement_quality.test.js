#!/usr/bin/env node
'use strict';

const {assert, mapTiles, unit, city} = require('./test_client');
const {createBrowserClient, loadAiModels, localUnit} = require('./browser_client');

const playerId = 9000;

function makeClient(settlerTerrain) {
    const tiles = mapTiles(18, 2);
    tiles.find(tile => tile.i === 8 && tile.j === 8).terrain_tex = settlerTerrain;
    const capital = localUnit(city({
        client_key: 'barbarian-capital', owner_id: playerId, i: 1, j: 1,
    }), 1);
    const settler = localUnit(unit({
        client_key: 'barbarian-settler', owner_id: playerId, unit_type_id: 'settlers',
        unit_class: 0, name: 'Settlers', texture: 256, i: 8, j: 8,
        properties: {aiSettlerTurns: 20},
    }), 2);
    const client = createBrowserClient({
        size: 18, playerId, gameId: 'client-ai-settlement-quality', tiles, units: [capital, settler],
    });
    loadAiModels(client);
    return {client, settler};
}

const hillCase = makeClient(4);
const redirected = hillCase.client.aiPlayer.applySettlerExpansionPolicy(1, playerId);
assert.equal(redirected.command, 'goto', 'an aged Settler does not found a City on hills');
assert.equal(
    hillCase.client.aiPlayer.terrainTypeAt(redirected.target.i, redirected.target.j), 2,
    'the Settler redirects to a grass center'
);
assert.ok(
    hillCase.client.aiPlayer.settlementDistanceToOwnCity(
        redirected.target.i, redirected.target.j, playerId
    ) >= 7,
    'the selected grass center keeps seven hex steps from an established City'
);

const grassCase = makeClient(2);
const founded = grassCase.client.aiPlayer.applySettlerExpansionPolicy(1, playerId);
assert.equal(founded.command, 'build_city', 'an aged Settler founds on adequately spaced grass');
const pending = grassCase.client.serverGame.pendingTurnActionsByPlayer[playerId] || [];
assert.equal(pending.some(action => action.type === 'build_city'), true,
    'the settlement decision queues an authoritative build_city action');

const batchTiles = mapTiles(18, 2);
const batchClient = createBrowserClient({
    size: 18, playerId, gameId: 'client-ai-settlement-batch', tiles: batchTiles,
    units: [
        localUnit(city({client_key:'batch-capital', owner_id:playerId, i:1, j:1}), 1),
        localUnit(unit({client_key:'batch-settler-1', owner_id:playerId, unit_type_id:'settlers',
            unit_class:0, name:'Settlers', texture:256, i:8, j:8,
            properties:{aiSettlerTurns:20}}), 2),
        localUnit(unit({client_key:'batch-settler-2', owner_id:playerId, unit_type_id:'settlers',
            unit_class:0, name:'Settlers', texture:256, i:9, j:8,
            properties:{aiSettlerTurns:20}}), 3),
    ],
});
loadAiModels(batchClient);
batchClient.aiPlayer.beginSettlementPlanning();
const firstBatchDecision = batchClient.aiPlayer.applySettlerExpansionPolicy(1, playerId);
const secondBatchDecision = batchClient.aiPlayer.applySettlerExpansionPolicy(2, playerId);
batchClient.aiPlayer.endSettlementPlanning();
assert.equal(firstBatchDecision.command, 'build_city', 'the first batch Settler reserves its current site');
assert.equal(secondBatchDecision.command, 'goto',
    'a later batch Settler does not found beside the reserved City site');
const reservedDistance = batchClient.aiPlayer.settlementDistanceToOwnCity(
    secondBatchDecision.target.i, secondBatchDecision.target.j, playerId
);
const di = secondBatchDecision.target.i - 8;
const dj = secondBatchDecision.target.j - 8;
const distanceFromReserved = di * dj >= 0
    ? Math.max(Math.abs(di), Math.abs(dj)) : Math.abs(di) + Math.abs(dj);
assert.ok(reservedDistance >= 7 && distanceFromReserved >= 7,
    'the second batch destination remains seven hex steps from existing and reserved Cities');

const fogTiles = mapTiles(24, 2);
const fogCapital = localUnit(city({
    client_key:'fog-capital', owner_id:playerId, i:10, j:10,
}), 1);
const fogSettler = localUnit(unit({
    client_key:'fog-settler', owner_id:playerId, unit_type_id:'settlers', unit_class:0,
    name:'Settlers', texture:256, i:10, j:10, properties:{aiSettlerTurns:20},
}), 2);
const fogClient = createBrowserClient({
    size:24, playerId, gameId:'client-ai-settlement-fog', tiles:fogTiles,
    units:[fogCapital, fogSettler],
});
loadAiModels(fogClient);
const fogBits = fogClient._map_terrain_bit_by_user[playerId];
for (let i=0; i<24; i++) for (let j=0; j<24; j++) fogBits[i][j] &= ~0x4000;
let fogDecision = null;
for (let turn=0; turn<10; turn++) {
    for (let di=-2; di<=2; di++) for (let dj=-2; dj<=2; dj++) {
        const i = fogSettler.coord.i + di;
        const j = fogSettler.coord.j + dj;
        if (i>=0 && j>=0 && i<24 && j<24) fogBits[i][j] |= 0x4000;
    }
    fogSettler.gotoPath = [];
    fogSettler.gotoCoord = null;
    fogSettler.pendingServerPath = [];
    fogDecision = fogClient.aiPlayer.applySettlerExpansionPolicy(1, playerId);
    if (fogDecision.command === 'build_city') break;
    assert.equal(fogDecision.command, 'goto',
        'a Settler near its City explores outward when no final site is visible');
    fogSettler.coord = new fogClient.Coord(fogDecision.target.i, fogDecision.target.j);
}
assert.equal(fogDecision.command, 'build_city',
    'staged visible-land exploration reaches a valid City site within ten decisions');
assert.ok(fogClient.aiPlayer.settlementDistanceToOwnCity(
    fogSettler.coord.i, fogSettler.coord.j, playerId
) >= 7, 'the explored City site satisfies minimum spacing');

const blockedTiles = mapTiles(14, 2);
const blockedSettler = localUnit(unit({
    client_key:'blocked-settler', owner_id:playerId, unit_type_id:'settlers', unit_class:0,
    name:'Settlers', texture:256, i:3, j:3, properties:{aiSettlerTurns:20},
}), 2);
const blockedUnits = [
    localUnit(city({client_key:'blocked-capital', owner_id:playerId, i:1, j:1}), 1),
    blockedSettler,
];
for (let n=0; n<5; n++) {
    blockedUnits.push(localUnit(unit({
        client_key:'blocked-occupant-'+n, owner_id:playerId, unit_type_id:'warrior',
        unit_class:2, name:'Warrior', i:8, j:8,
    }), 10+n));
}
const blockedClient = createBrowserClient({
    size:14, playerId, gameId:'client-ai-settlement-blocked',
    tiles:blockedTiles, units:blockedUnits,
});
loadAiModels(blockedClient);
const partialPath = blockedClient.currentGame.buildPath(1, new blockedClient.Coord(8, 8));
assert.ok(partialPath.length > 0,
    'the generic pathfinder exposes a partial route toward a full destination Tile');
assert.equal(blockedClient.aiPlayer.pathReachesCoord(partialPath, new blockedClient.Coord(8, 8)), false,
    'the settlement adapter distinguishes a partial route from a completed route');
const reachable = blockedClient.aiPlayer.bestSettlementRoute(1, playerId, 7);
assert.ok(reachable && blockedClient.aiPlayer.pathReachesCoord(reachable.path, reachable.coord),
    'settlement planning selects only a destination its route can reach');
assert.notDeepEqual([reachable.coord.i, reachable.coord.j], [8, 8],
    'a full destination Tile is not retained as a settlement mission');

const blockedFog = blockedClient._map_terrain_bit_by_user[playerId];
for (let i=0; i<14; i++) for (let j=0; j<14; j++) blockedFog[i][j] &= ~0x4000;
blockedFog[8][8] |= 0x4000;
const exploration = blockedClient.aiPlayer.bestSettlementExplorationRoute(1, playerId);
assert.ok(exploration && blockedClient.aiPlayer.pathReachesCoord(
    exploration.path, exploration.coord
), 'partial exploration persists its reachable endpoint as the next mission waypoint');
assert.notDeepEqual([exploration.coord.i, exploration.coord.j], [8, 8],
    'partial exploration never persists the inaccessible requested coordinate');
assert.ok(blockedClient.aiPlayer.settlementDistanceToOwnCity(
    exploration.coord.i, exploration.coord.j, playerId
) > blockedClient.aiPlayer.settlementDistanceToOwnCity(3, 3, playerId),
'the reachable exploration waypoint advances away from existing Cities');

console.log('PASS Barbarian Settlers reject poor centers and found adequately spaced grass Cities');

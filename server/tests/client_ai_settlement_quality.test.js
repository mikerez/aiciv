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

console.log('PASS Barbarian Settlers reject poor centers and found adequately spaced grass Cities');

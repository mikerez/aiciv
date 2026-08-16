#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const {mapTiles, city} = require('./tests/test_client');
const {createBrowserClient, localUnit} = require('./tests/browser_client');

const playerId = 61465;
const definition = city({client_key:'aksum',owner_id:playerId,i:5,j:5});
const cityUnit = localUnit(definition, 1464);
cityUnit.production = {unitTypeId:'settlers',productionPoints:0};
cityUnit.productionQueue = ['settlers'];
cityUnit.cityProperties = {productionPerTurn:0,productionStored:0};
const client = createBrowserClient({
    size:12,playerId,gameId:'client-city-production-status',tiles:mapTiles(12),units:[cityUnit],
});

assert.equal(client.currentGame.productionTurnsLeft(cityUnit), null,
    'Aksum conditions with P=0 must report paused production, not a fake 20-turn estimate');
cityUnit.cityProperties.productionPerTurn = 2;
assert.equal(client.currentGame.productionTurnsLeft(cityUnit), 10,
    'a 20-point Settler with P=2 must report ten turns');
cityUnit.production.productionPoints = 10;
assert.equal(client.currentGame.productionTurnsLeft(cityUnit), 5,
    'stored production points must reduce the remaining estimate');

console.log('PASS City production status pauses at P=0 and estimates only real production');

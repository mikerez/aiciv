#!/usr/bin/env node
'use strict';

const {assert, mapTiles, unit} = require('./test_client');
const {createBrowserClient, localUnit} = require('./browser_client');

const playerId = 7918;
const tiles = mapTiles(12, 2);
tiles.find(tile => tile.i === 6 && tile.j === 5).terrain_tex = 1;
tiles.find(tile => tile.i === 7 && tile.j === 5).modifiers = {farm:true};
tiles.find(tile => tile.i === 8 && tile.j === 5).terrain_tex = 0;
const worker = localUnit(unit({
    client_key:'sand-irrigation-worker', owner_id:playerId, i:6, j:5,
}), 33);
const client = createBrowserClient({
    size:12, playerId, gameId:'client-worker-sand-irrigation', tiles, units:[worker],
});

assert.equal(client.currentGame.canBuildIrrigation(0), true,
    'sand can receive Irrigation next to a completed Farm');
client._map_terrain_tex[9][5] = 2 << 4;
assert.equal(client.currentGame.canBuildIrrigation(0), true,
    'a completed Farm remains a source if unrelated shallow water touches deep sea');
delete client._map_terrain_mod[7][5].farm;
assert.equal(client.currentGame.canBuildIrrigation(0), false,
    'deep-sea-connected shallow water is not a source without the Farm');

console.log('PASS client Irrigation treats Farm as a source and rejects deep-sea water alone');

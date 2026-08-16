#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const {Coord, Unit, createBrowserClient} = require('./browser_client');

const explorer = new Unit(1, 260, new Coord(10, 10));
Object.assign(explorer, {
    serverId: 1267,
    team: 7,
    unitTypeId: 'explorer',
    state: 'explore',
    automationMode: 'explore',
    speed: 2,
});
const remoteCity = new Unit(3, 264, new Coord(-8, 39));
Object.assign(remoteCity, {
    serverId: 9001,
    team: 8,
    unitTypeId: 'city',
    can_move: false,
    outsideMapWindow: true,
    worldCoord: new Coord(190, 239),
});

const client = createBrowserClient({
    size: 20,
    playerId: 7,
    gameId: 'explorer-window-regression',
    tiles: [],
    units: [explorer],
    unitsByUser: {7: [explorer], 8: [remoteCity]},
});

assert.doesNotThrow(() => client.currentGame.nearestCityOrSettlerExploreTarget(0),
    'Explorer routing must skip a City outside the loaded map window');
assert.doesNotThrow(() => client.serverGame.captureTurn(7),
    'an off-window target must never abort End Turn capture');

console.log('PASS Explorer automation ignores Cities and Settlers outside the loaded map window');

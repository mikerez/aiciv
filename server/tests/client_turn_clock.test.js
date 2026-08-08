#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');

global._map_size = 8;
const {serverGame} = require('../../server_game.js');

const serverDeadline = Date.now() + 4000;
serverGame.updateServerClock({turn: 12, revision: 4, deadline_at: new Date(serverDeadline).toISOString()});
assert.ok(serverGame.deadlineAt <= serverDeadline - 700, 'client keeps a network margin before the PHP deadline');
assert.ok(serverGame.deadlineAt > Date.now(), 'a future server deadline remains playable');

const synchronizedDeadline = serverGame.deadlineAt;
serverGame.awaitingTurnByPlayer[7001] = 11;
serverGame.timerMode = 'waiting';
serverGame.timerId = setInterval(() => {}, 10000);
assert.equal(serverGame.finishAwaitingTurn(7001, 12), true);
assert.equal(serverGame.deadlineAt, synchronizedDeadline,
    'finishing the previous turn must preserve the authoritative next-turn deadline');
assert.equal(serverGame.timerId, null);

console.log('PASS client turn clock preserves the PHP deadline and submits with a network margin');

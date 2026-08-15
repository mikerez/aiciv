#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');

const prompt = {style: {display: 'none'}, textContent: ''};
global.document = {getElementById(id) { return id === 'respawnPrompt' ? prompt : null; }};
global._current_user = 7;
global._map_size = 100;
global._map_origin_i = 20;
global._map_origin_j = 30;
global._fulldraw = 0;
global.drawScene = function() {};

const {serverGame} = require('../server_game.js');
let submittedPlayer = null;
serverGame.submitRespawn = async function(playerId) { submittedPlayer = playerId; };

serverGame.beginRespawnSelection(7, true, false);
assert.equal(prompt.style.display, 'block');
assert.equal(prompt.textContent, 'Click on minimap to select respawn point');
serverGame.applyRespawnStatus(7, {respawn_required: false}, false);
assert.equal(serverGame.isRespawnSelecting(7), true,
    'ordinary polling must not cancel a manually requested respawn');
assert.equal(serverGame.selectRespawnPoint(7, {i: 12, j: 13}), true);
assert.equal(submittedPlayer, 7, 'a minimap selection immediately submits respawn');
assert.deepEqual(serverGame.respawnSelectionForPlayer(7), {i: 12, j: 13});
assert.equal(prompt.textContent, 'Respawning civilization...');

delete serverGame.respawnByPlayer[7];
serverGame.beginRespawnSelection(7, false, false);
serverGame.applyRespawnStatus(7, {respawn_required: false}, false);
assert.equal(serverGame.isRespawnSelecting(7), false);
assert.equal(prompt.style.display, 'none');
console.log('PASS client respawn selection persists, prompts, and submits only after a minimap point');

#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = {
    console,
    Coord: class Coord { constructor(i, j) { this.i = i; this.j = j; } },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('ai.js', 'utf8') + '\nglobalThis.aiPlayer = _ai_player;', context,
    {filename: 'ai.js'});

const ai = context.aiPlayer;
ai.lastActionUnitIndices = [3];
ai.lastActionCandidates = [
    {command: 'wait', target: {i: 4, j: 4}, state: 'waiting'},
    {command: 'goto', target: {i: 8, j: 8}},
];
const action = ai.decodeActionOutput(new Float32Array([-0.8, -0.2]))[0];
assert.equal(action.command, 'wait', 'all-negative action scores must fall back to wait');

ai.lastEconomicsCityIndices = [5];
ai.lastEconomicsCandidates = [
    {unitTypeId: null},
    {unitTypeId: 'worker'},
    {unitTypeId: 'explorer'},
];
const economics = ai.decodeEconomicsOutput(new Float32Array([-0.9, -0.4, -0.6]))[0];
assert.equal(economics.unitTypeId, null,
    'all-negative Economics scores must defer to deterministic production policy');
console.log('PASS AI does not execute non-positive model choices');

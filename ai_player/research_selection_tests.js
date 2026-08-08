#!/usr/bin/env node

const fs = require('fs');
const vm = require('vm');

const context = vm.createContext({ console });
vm.runInContext(fs.readFileSync('game.js', 'utf8'), context, { filename: 'game.js' });
vm.runInContext('this.GameStateForTest = GameState;', context);
vm.runInContext(fs.readFileSync('ai.js', 'utf8'), context, { filename: 'ai.js' });
vm.runInContext('this.aiPlayerForTest = _ai_player;', context);

function assert(condition, message)
{
    if (!condition) {
        throw new Error(message);
    }
}

context._user_types = { 0: 'ai', 1: 'human' };
context._current_user = 0;
let state = new context.GameStateForTest();
assert(state.currentResearch === null, 'new AI state must start without research');
assert(state.ensureResearchSelected() === false, 'AI without Strategy research must block turn processing');
assert(state.currentResearch === null, 'AI harness must not default to Mining or another table entry');

state.setResearch('Animal Husbandry');
assert(state.ensureResearchSelected() === true, 'AI with a valid Strategy selection must proceed');
assert(state.currentResearch === 'Animal Husbandry', 'valid Strategy research must be preserved');

context._current_user = 1;
state = new context.GameStateForTest();
assert(state.ensureResearchSelected() === false, 'human without research must still be prompted');
assert(state.currentResearch === null, 'human prompt must not silently choose a technology');

context._current_user = 0;
vm.runInContext('_game_state = new GameState();', context);
context.aiPlayerForTest.decodeStrategyOutput = function() {
    return {
        type: 'resist_strongest_civ',
        slot: 4,
        record: 0,
        confidence: 0.9,
        focuses: [],
        maxMilitaryFocus: null,
        maxWorkerFocus: null,
        productionDemands: { settlers: 0.25, worker: 0.25, explorer: 0.15, military: 0.35 },
        technologyPriorities: [
            { name: 'Animal Husbandry', priority: 0.9 },
            { name: 'Mining', priority: -0.5 },
            { name: 'Masonry', priority: -0.6 },
            { name: 'Irrigation', priority: -0.7 },
        ],
        scienceRate: 1,
    };
};
vm.runInContext("_game_state.setResearch('Mining');", context);
context.aiPlayerForTest.applyStrategyOutput(new Float32Array(72), 0);
assert(vm.runInContext('_game_state.currentResearch', context) === 'Animal Husbandry',
    'Strategy must replace legacy zero-progress Mining with its model choice');

vm.runInContext("_game_state.currentResearch = 'Mining'; _game_state.technologyProgress.Mining = 1;", context);
context.aiPlayerForTest.applyStrategyOutput(new Float32Array(72), 0);
assert(vm.runInContext('_game_state.currentResearch', context) === 'Mining',
    'Strategy must preserve research after science has been invested');

console.log('Research selection harness tests: 5/5 passed');

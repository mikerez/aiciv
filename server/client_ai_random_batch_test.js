const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const predictableMath = Object.create(Math);
predictableMath.random = () => 0.5;
const context = {console, Math: predictableMath};
vm.createContext(context);
vm.runInContext(fs.readFileSync('ai.js', 'utf8') + ';globalThis.aiPlayer=_ai_player;', context);

const records = Array.from({length: 12}, (_, index) => ({index}));
assert.deepEqual(
    JSON.parse(JSON.stringify(context.aiPlayer.rotatingBatch(records, 'action', 7, 8))).map(row => row.index),
    [6, 7, 8, 9, 10, 11, 0, 1],
    'the first browser AI batch starts at a random list position and wraps'
);
assert.deepEqual(
    JSON.parse(JSON.stringify(context.aiPlayer.rotatingBatch(records, 'action', 7, 8))).map(row => row.index),
    [2, 3, 4, 5, 6, 7, 8, 9],
    'later batches continue rotating from the randomized start'
);

console.log('PASS AI batches start randomly and continue rotating');

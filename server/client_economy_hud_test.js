const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const nodes = { foodCounterValue: { textContent: '' }, goldCounterValue: { textContent: '' } };
const context = {
    console: { debug() {} },
    document: { getElementById(id) { return nodes[id] || null; } },
    _current_user: 7,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('economics.js', 'utf8') + ';globalThis.economics=_economics;', context);
context.economics.updateCounters({ food: 44, money: 900 }, 7, 'human');
assert.equal(nodes.foodCounterValue.textContent, 44);
assert.equal(nodes.goldCounterValue.textContent, 900);
assert.equal(context.economics.hudHistory[0].playerId, 7);
assert.equal(context.economics.hudHistory[0].source, 'human');

const serverSource = fs.readFileSync('server_game.js', 'utf8');
assert.match(serverSource, /isHiddenSnapshotActive\(\)/);
assert.match(serverSource, /!hiddenSnapshot/);
assert.match(fs.readFileSync('multiplayer.js', 'utf8'), /hidden-snapshot-restore/);
console.log('PASS economy HUD ownership and diagnostics');

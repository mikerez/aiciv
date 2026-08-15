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
assert.equal(nodes.foodCounterValue.textContent, '44');
assert.equal(nodes.goldCounterValue.textContent, '900');
assert.equal(context.economics.hudHistory[0].playerId, 7);
assert.equal(context.economics.hudHistory[0].source, 'human');

context._authenticated_player_id = 7;
context._server_game = {};
const authoritativeState = {
    food: 18, money: 27, serverEconomyLoaded: false,
    lastGrossMoneyIncome: 4, lastMaintenance: 1, lastTechnologyExpense: 0,
    lastAvailableMoney: 3, lastScienceIncome: 0, lastAccountIncome: 3,
};
context.economics.updateCounters(authoritativeState, 7, 'before-server');
assert.equal(nodes.foodCounterValue.textContent, '44', 'HUD must wait for an authoritative server economy state');
authoritativeState.serverEconomyLoaded = true;
context.economics.updateCounters(authoritativeState, 7, 'server');
assert.equal(nodes.foodCounterValue.textContent, '18');
assert.equal(nodes.goldCounterValue.textContent, '27');
const balanceBefore = authoritativeState.money;
context.economics.processTurnIncome(authoritativeState, 99, 0);
assert.equal(authoritativeState.money, balanceBefore, 'authenticated JS must not calculate treasury changes');

const serverSource = fs.readFileSync('server_game.js', 'utf8');
assert.match(serverSource, /isHiddenSnapshotActive\(\)/);
assert.match(serverSource, /!hiddenSnapshot/);
assert.doesNotMatch(serverSource, /_city_economy\.processCities\(this\.serverTurn\)/,
    'server capture must not run local City accounting');
assert.match(fs.readFileSync('game.js', 'utf8'), /processOfflineCities\(\)/,
    'client-side City balance calculation must be named and confined to offline turns');
assert.match(serverSource, /serverEconomyLoaded = true/,
    'only a server player-state response unlocks economy counters');
assert.match(fs.readFileSync('multiplayer.js', 'utf8'), /hidden-snapshot-restore/);
console.log('PASS economy HUD ownership and diagnostics');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    document: {
        cookie: 'aiciv_player_id=7',
        getElementById() { return null; },
    },
};
vm.createContext(sandbox);

vm.runInContext(`
class GameState {}
const _map_size = 2;
const _map_terrain_tex = [[11, 12], [13, 14]];
var _map_terrain_bit = [[101, 102], [103, 104]];
const _map_resource = [[{type: 1, hidden: false}, {type: 2, hidden: true}], [{type: 3, hidden: false}, {type: 4, hidden: true}]];
const _map_terrain_mod = [[{road: true}, {}], [{mine: true}, {}]];
var _units_by_user = {7: [{team: 7, name: 'Human settler'}]};
var _units = _units_by_user[7];
var _game_state_by_user = {7: new GameState()};
var _game_state = _game_state_by_user[7];
var _selection = 0;
var _fulldraw = 9;
var _current_game = { applyMenuRules() {} };
var spriteRefreshes = 0;
const _map = {
    prepareTerrainModifierSprites() { spriteRefreshes++; },
    prepareResourceSprites() { spriteRefreshes++; },
};
var submitted = null;
var hiddenTransitions = [];
const _server_game = {
    serverTurn: 3,
    hiddenActions: false,
    setHiddenActions(value) { this.hiddenActions = value; hiddenTransitions.push(value); },
    async fetchFullPlayer(playerId, includeMap) {
        if (includeMap !== false) throw new Error('AI snapshot must be fog-filtered');
        return {turn: 3, playerId};
    },
    applyFullSnapshot(playerId) {
        _units_by_user[playerId] = [{team: playerId, name: 'AI settler', gotoPath: []}];
        _units = _units_by_user[playerId];
        if (!_game_state_by_user[playerId]) _game_state_by_user[playerId] = new GameState();
        _game_state = _game_state_by_user[playerId];
        _map_terrain_tex[0][0] = 77;
        _map_terrain_mod[0][0] = {irrigation: true};
        _map_resource[0][0] = {type: 9, hidden: false};
    },
    async waitForHiddenActions() {},
    captureTurn(playerId) { return {playerId, turn: 3, commands: [], playerState: {}}; },
    async submitTurn(submission, options) {
        submitted = {submission, options};
        return {resolved_turn: null};
    },
    log(message) { throw new Error(message); },
};
var workerCalls = [];
const _ai_player = {
    lastStrategyObjectIds: [], lastStrategyContext: null, lastStrategyFocuses: [],
    lastStrategyMilitaryFocus: null, lastStrategyWorkerFocus: null,
    lastStrategyProductionDemands: null, lastTacticsGroupIds: [],
    lastActionUnitIndices: [], lastActionRecordSummaries: [], lastEconomicsCityIndices: [],
    async ensureBackgroundModelsLoaded() {},
    buildStrategyInput() { this.lastStrategyObjectIds = [{team: 91}]; return new Float32Array(4); },
    decodeStrategyOutput() {
        return {focuses: [], maxMilitaryFocus: {}, maxWorkerFocus: {}, productionDemands: {military: 1}};
    },
    buildEconomicsInput() { this.lastEconomicsCityIndices = []; return new Float32Array(4); },
    buildActionInput() { this.lastActionUnitIndices = [0]; return new Float32Array(4); },
    advanceSettlerTurnCounters() {},
    async inferBackground(kind) {
        workerCalls.push(kind);
        await new Promise(resolve => setTimeout(resolve, 5));
        return new Float32Array(72);
    },
    log() {}, applyStrategyOutput() {}, applyEconomicsOutput() {},
    applyActionOutput(output, playerId) {
        if (_current_user !== playerId) throw new Error('AI output applied outside AI context');
        _units[0].gotoPath = [{i: 1, j: 1}];
    },
    applyAiReasoningWorkarounds() {},
};
`, sandbox);

const multiplayerSource = fs.readFileSync('multiplayer.js', 'utf8') + '\nglobalThis.__multiplayer = _multiplayer;';
assert.doesNotMatch(multiplayerSource, /_units_by_user\s*=(?!=)/,
    'hidden AI must never replace the global unit collection');
vm.runInContext(multiplayerSource, sandbox, {filename: 'multiplayer.js'});

(async () => {
    vm.runInContext(`
        _multiplayer.configureControlledPlayers([
            {player_id: 7, user_type: 'human', parent_id: null},
            {player_id: 91, user_type: 'ai', parent_id: 7},
        ]);
        globalThis.__humanUnitsReference = _units_by_user;
        globalThis.__humanBitsReference = _map_terrain_bit;
    `, sandbox);

    const hiddenTurn = sandbox.__multiplayer.runHiddenAiTurn(3);
    await new Promise(resolve => setTimeout(resolve, 1));
    assert.equal(vm.runInContext('_current_user', sandbox), 7,
        'worker inference must not leave the client switched to its hidden AI');
    await hiddenTurn;

    assert.equal(sandbox.submitted.submission.playerId, 91);
    assert.equal(sandbox.submitted.options.hidden, true);
    assert.equal(sandbox.submitted.options.deferUpdates, true);
    assert.equal(sandbox.submitted.options.deferPolling, true);
    assert.equal(Array.from(sandbox.workerCalls).join(','), 'strategy,economics,action');
    assert.equal(vm.runInContext('_current_user', sandbox), 7);
    assert.equal(vm.runInContext('_selection', sandbox), 0);
    assert.equal(vm.runInContext('_units_by_user', sandbox), sandbox.__humanUnitsReference);
    assert.equal(vm.runInContext('_map_terrain_bit', sandbox), sandbox.__humanBitsReference);
    assert.equal(vm.runInContext('_map_terrain_tex[0][0]', sandbox), 11);
    assert.equal(vm.runInContext('_map_terrain_mod[0][0].road', sandbox), true);
    assert.equal(vm.runInContext('_map_resource[0][0].type', sandbox), 1);
    assert.equal(vm.runInContext('_fulldraw', sandbox), 9);
    assert.ok(vm.runInContext('spriteRefreshes', sandbox) >= 2);
    console.log('PASS hidden AI infers in background and restores the human client context before awaits');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

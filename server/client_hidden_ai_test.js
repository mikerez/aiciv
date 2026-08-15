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
class Coord { constructor(i,j) { this.i=i; this.j=j; } }
const _map_size = 2;
var _map_origin_i = 0;
var _map_origin_j = 0;
var _map_terrain_tex = [[11, 12], [13, 14]];
var _map_terrain_bit = [[101, 102], [103, 104]];
var _map_resource = [[{type: 1, hidden: false}, {type: 2, hidden: true}], [{type: 3, hidden: false}, {type: 4, hidden: true}]];
var _map_terrain_mod = [[{road: true}, {}], [{mine: true}, {}]];
var _units_by_user = {7: [{team: 7, name: 'Human settler'}]};
var _units = _units_by_user[7];
var _game_state_by_user = {7: new GameState()};
var _game_state = _game_state_by_user[7];
var _selection = 0;
var _fulldraw = 9;
var _turn_in_progress = false;
var _current_game = { applyMenuRules() {} };
var spriteRefreshes = 0;
const _map = {
    prepareTerrainModifierSprites() { spriteRefreshes++; },
    prepareResourceSprites() { spriteRefreshes++; },
};
var submitted = null;
var submissions = [];
var claimed = false;
var hiddenTransitions = [];
var hiddenSnapshotOptions = null;
const _server_game = {
    serverTurn: 3,
    deadlineAt: Date.now() + 2000,
    hiddenActions: false,
    setHiddenActions(value) { this.hiddenActions = value; hiddenTransitions.push(value); },
    async fetchFullPlayer(playerId, includeMap) {
        if (includeMap !== false) throw new Error('AI snapshot must be fog-filtered');
        return {turn: 3, playerId};
    },
    applyFullSnapshot(playerId, snapshot, options) {
        hiddenSnapshotOptions = options;
        _units_by_user[playerId] = [{serverId:91, team: playerId, name: 'AI settler', type:0, gotoPath: []}];
        _units = _units_by_user[playerId];
        if (!_game_state_by_user[playerId]) _game_state_by_user[playerId] = new GameState();
        _game_state = _game_state_by_user[playerId];
        _map_terrain_tex[0][0] = 77;
        _map_terrain_mod[0][0] = {irrigation: true};
        _map_resource[0][0] = {type: 9, hidden: false};
    },
    async waitForHiddenActions() {},
    async claimAiBatch() {
        if (claimed) return {turn:3, ai_player_id:91, unit_ids:[]};
        claimed = true;
        return {turn:3, ai_player_id:91, lease_token:'lease', unit_ids:[91], snapshot:{turn:3}};
    },
    async submitAiBatch(batch, submission) {
        submitted = {batch, submission}; submissions.push({batch, submission}); return {ok:true};
    },
    findUnit() { return {unit:_units[0], index:0, list:_units}; },
    captureTurn(playerId) { return {playerId, turn: 3, commands: [{unit_id:91, command:'hold'}], actions:[], playerState: {}}; },
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
    lastStrategyProductionDemands: null,
    lastActionUnitIndices: [], lastActionRecordSummaries: [], lastEconomicsCityIndices: [],
    async ensureBackgroundModelsLoaded() {},
    buildStrategyInput() { this.lastStrategyObjectIds = [{team: 91}]; return new Float32Array(4); },
    decodeStrategyOutput() {
        return {focuses: [], maxMilitaryFocus: {}, maxWorkerFocus: {}, productionDemands: {military: 1}};
    },
    buildEconomicsInput() { this.lastEconomicsCityIndices = []; return new Float32Array(4); },
    buildActionInputForUnit() { this.lastActionUnitIndices = [0]; return new Float32Array(4); },
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
};
`, sandbox);

const multiplayerSource = fs.readFileSync('multiplayer.js', 'utf8') + '\nglobalThis.__multiplayer = _multiplayer;';
assert.doesNotMatch(multiplayerSource, /_units_by_user\s*=(?!=)/,
    'hidden AI must never replace the global unit collection');
vm.runInContext(multiplayerSource, sandbox, {filename: 'multiplayer.js'});
assert.equal(vm.runInContext(`_multiplayer.workerHasPersistentRoadTo({
    unitTypeId:'worker', state:'road_to', automationMode:'road_to',
    roadToDestination:{i:8,j:9}, gotoPath:[]
})`, sandbox), true, 'AI scheduling must recognize a saved Road-to destination as active');
assert.equal(vm.runInContext(`_multiplayer.workerHasPersistentRoadTo({
    unitTypeId:'worker', state:'road_to', automationMode:'road_to', gotoPath:[]
})`, sandbox), false, 'a destinationless stale Road-to mode must remain recoverable by Automate');

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

    assert.equal(sandbox.submitted.batch.ai_player_id, 91);
    assert.equal(sandbox.submissions.length, 1);
    assert.equal(Array.from(sandbox.workerCalls).join(','), 'action');
    assert.equal(vm.runInContext('_current_user', sandbox), 7);
    assert.equal(vm.runInContext('_selection', sandbox), 0);
    assert.equal(vm.runInContext('_units_by_user', sandbox), sandbox.__humanUnitsReference);
    assert.equal(vm.runInContext('_map_terrain_bit', sandbox), sandbox.__humanBitsReference);
    assert.equal(vm.runInContext('_map_terrain_tex[0][0]', sandbox), 11);
    assert.equal(vm.runInContext('_map_terrain_mod[0][0].road', sandbox), true);
    assert.equal(vm.runInContext('_map_resource[0][0].type', sandbox), 1);
    assert.equal(vm.runInContext('_fulldraw', sandbox), 9,
        'restoring a hidden AI snapshot must preserve the visible draw state');
    assert.equal(vm.runInContext('spriteRefreshes', sandbox), 0,
        'hidden AI must not rebuild visible terrain sprite buffers');
    assert.equal(vm.runInContext('hiddenSnapshotOptions.reconcileClientRoutes', sandbox), false,
        'hidden AI snapshots must not reconcile routes from browser storage');
    const serverGameSource = fs.readFileSync('server_game.js', 'utf8');
    assert.match(serverGameSource,
        /applyLandscapeUpdates\(playerId, result\.tiles \|\| \[\], \{\s*prepareSprites: !this\.hiddenActions/,
        'hidden full snapshots must explicitly suppress visible sprite preparation');
    const handoff = vm.runInContext(`(() => {
        var savedUnits = _units;
        var savedGame = _current_game;
        var worker = {
            unitTypeId:'worker', coord:new Coord(0,0), state:'automate',
            sharedAiTask:{kind:'worker',mode:'automate',action:'mine',target:{i:1,j:0}}
        };
        _units = [worker];
        _current_game = {
            buildPath(){ return [new Coord(1,0)]; },
            assignPath(k,path){ _units[k].gotoPath=path; _units[k].gotoCoord=path[path.length-1]; }
        };
        var resumed = _multiplayer.resumeSharedAiWorkerTask(0);
        var result = {resumed:resumed, action:worker.automateBuild, pathLength:worker.gotoPath.length};
        _units = savedUnits;
        _current_game = savedGame;
        return result;
    })()`, sandbox);
    assert.deepEqual(JSON.parse(JSON.stringify(handoff)), {
        resumed: true, action: 'mine', pathLength: 1,
    }, 'a second browser resumes the Worker target persisted by the first browser');

    const batchResult = await vm.runInContext(`(async () => {
        var nextId = 1000;
        var claims = 0;
        var submittedObjects = 0;
        var submitCalls = 0;
        _server_game.serverTurn = 4;
        _server_game.deadlineAt = Date.now() + 10000;
        _turn_in_progress = false;
        _server_game.claimAiBatch = async function() {
            claims++;
            var ids = [];
            for (var n=0; n<8; n++) ids.push(nextId++);
            return {turn:4, ai_player_id:91, lease_token:'lease-'+claims,
                unit_ids:ids, snapshot:{turn:4}};
        };
        _server_game.submitAiBatch = async function(batch, submission) {
            submitCalls++;
            submittedObjects += submission.commands.length;
            return {ok:true};
        };
        _multiplayer.prepareAiUnitOrder = async function(aiId, snapshot, unitId) {
            return {commands:[{unit_id:unitId, command:'hold'}], actions:[]};
        };
        var result = await _multiplayer.startBackgroundAiTurn(4);
        return {claims:claims, submitCalls:submitCalls, submitted:submittedObjects, result:result};
    })()`, sandbox);
    assert.deepEqual(JSON.parse(JSON.stringify(batchResult)), {
        claims: 1, submitCalls: 4, submitted: 8, result: {batches: 1, objects: 8},
    }, 'one browser turn must submit one 8-object model cycle in deadline-safe chunks');

    const retryResult = await vm.runInContext(`(async () => {
        var claims = 0;
        _server_game.serverTurn = 5;
        _server_game.deadlineAt = Date.now() + 10000;
        _turn_in_progress = true;
        await _multiplayer.startBackgroundAiTurn(5);
        _turn_in_progress = false;
        _server_game.claimAiBatch = async function() {
            claims++;
            if (claims > 1) return {turn:5, ai_player_id:91, unit_ids:[]};
            return {turn:5, ai_player_id:91, lease_token:'retry',
                unit_ids:[2000], snapshot:{turn:5}};
        };
        var result = await _multiplayer.startBackgroundAiTurn(5);
        return {claims:claims, result:result};
    })()`, sandbox);
    assert.deepEqual(JSON.parse(JSON.stringify(retryResult)), {
        claims: 2, result: {batches: 1, objects: 1},
    }, 'a completed blocked run must be restartable during the same server turn');
    console.log('PASS hidden AI infers in background and restores the human client context before awaits');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

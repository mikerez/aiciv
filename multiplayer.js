function multiplayerCookiePlayerId()
{
    var match = document.cookie.match(/(?:^|;\s*)aiciv_player_id=(\d+)/);
    return match ? parseInt(match[1], 10) : null;
}

var _authenticated_player_id = multiplayerCookiePlayerId();
var _user_ids = _authenticated_player_id == null ? [0, 1] : [_authenticated_player_id];
var _current_user = _user_ids[0];
var current_user = _current_user;
var _hidden_ai_user_id = null;
var _user_types = _authenticated_player_id == null ? { 0: 'ai', 1: 'ai' } : {};
if (_authenticated_player_id != null) _user_types[_authenticated_player_id] = 'human';
var _selection_by_user = {};
_selection_by_user[_current_user] = -1;
var _map_terrain_bit_by_user = {};
var _map_resource_visibility_by_user = {};

const _multiplayer = new class
{
    constructor()
    {
        this.defaultUsers = _user_ids.slice();
        this.humanUserId = _authenticated_player_id;
        this.hiddenAiUserId = null;
        this.hiddenTurnRunning = false;
        this.backgroundAiTurn = null;
        this.backgroundAiPromise = null;
        this.hiddenSnapshotDepth = 0;
    }

    configureControlledPlayers(players)
    {
        if (_authenticated_player_id == null) return;
        var humanId = _authenticated_player_id;
        var aiId = null;
        _user_types = {};
        for (var n=0; n < (players || []).length; n++) {
            var playerId = parseInt(players[n].player_id, 10);
            _user_types[playerId] = players[n].user_type || 'human';
            if (_user_types[playerId] == 'human' && playerId == humanId) humanId = playerId;
            if (_user_types[playerId] == 'ai' && parseInt(players[n].parent_id, 10) == humanId && aiId == null) {
                aiId = playerId;
            }
        }
        _user_types[humanId] = 'human';
        _user_ids = aiId == null ? [humanId] : [humanId, aiId];
        this.humanUserId = humanId;
        this.hiddenAiUserId = aiId;
        _hidden_ai_user_id = aiId;
        for (var index=0; index < _user_ids.length; index++) this.ensureUser(_user_ids[index]);
    }

    initUsers(userIds)
    {
        _user_ids = _authenticated_player_id == null && userIds && userIds.length
            ? userIds.slice() : this.defaultUsers.slice();
        for (var n=0; n < _user_ids.length; n++) {
            this.ensureUser(_user_ids[n]);
        }
        this.setCurrentUser(_user_ids[0], false);
    }

    ensureUser(userId)
    {
        if (_units_by_user[userId] == undefined) {
            _units_by_user[userId] = [];
        }
        if (_selection_by_user[userId] == undefined) {
            _selection_by_user[userId] = -1;
        }
        if (_game_state_by_user[userId] == undefined) {
            _game_state_by_user[userId] = new GameState();
        }
        if (_map_terrain_bit_by_user[userId] == undefined && typeof _map_terrain_bit !== 'undefined') {
            _map_terrain_bit_by_user[userId] = this.cloneVisibilityFrom(_map_terrain_bit);
        }
        if (_map_resource_visibility_by_user[userId] == undefined && typeof _map_resource !== 'undefined') {
            _map_resource_visibility_by_user[userId] = this.createResourceVisibility();
        }
    }

    initMapVisibility()
    {
        for (var n=0; n < _user_ids.length; n++) {
            var userId = _user_ids[n];
            this.ensureUser(userId);
            _map_terrain_bit_by_user[userId] = this.cloneVisibilityFrom(_map_terrain_bit);
            this.clearVisibility(_map_terrain_bit_by_user[userId], true);
            _map_resource_visibility_by_user[userId] = this.createResourceVisibility();
        }
        this.setCurrentUser(_current_user, false);
    }

    cloneVisibilityFrom(source)
    {
        var result = new Array(_map_size);
        for (var i=0; i < _map_size; i++) {
            result[i] = new Array(_map_size);
            for (var j=0; j < _map_size; j++) {
                result[i][j] = source && source[i] ? source[i][j] : 0xFF;
            }
        }
        return result;
    }

    clearVisibility(bits, keepSeen)
    {
        for (var i=0; i < _map_size; i++) {
            for (var j=0; j < _map_size; j++) {
                // Preserve terrain cost/shadow bits and optionally old seen memory.
                var terrainBits = bits[i][j] & 0x80FF;
                var seenBits = keepSeen ? (bits[i][j] & 0x4000) : 0;
                bits[i][j] = terrainBits | seenBits;
            }
        }
    }

    createResourceVisibility()
    {
        var result = new Array(_map_size);
        for (var i=0; i < _map_size; i++) {
            result[i] = new Array(_map_size);
            for (var j=0; j < _map_size; j++) {
                result[i][j] = false;
            }
        }
        return result;
    }

    isResourceVisible(i, j, userId = _current_user)
    {
        var visibility = _map_resource_visibility_by_user[userId];
        return !!(visibility && visibility[i] && visibility[i][j]);
    }

    setResourceVisible(i, j, userId = _current_user)
    {
        this.ensureUser(userId);
        if (i < 0 || i >= _map_size || j < 0 || j >= _map_size) {
            return false;
        }
        _map_resource_visibility_by_user[userId][i][j] = true;
        return true;
    }

    setCurrentUser(userId, preserveCurrentSelection = true)
    {
        if (preserveCurrentSelection) {
            _selection_by_user[_current_user] = _selection;
        }
        this.ensureUser(userId);
        _current_user = userId;
        current_user = userId;
        _units = _units_by_user[userId];
        _game_state = _game_state_by_user[userId];
        _selection = _selection_by_user[userId] == undefined ? -1 : _selection_by_user[userId];
        if (_map_terrain_bit_by_user[userId] != undefined) {
            _map_terrain_bit = _map_terrain_bit_by_user[userId];
        }
        this.rebuildCurrentVisibility();
        if (typeof _current_game !== 'undefined' && _current_game && _current_game.applyMenuRules) {
            _current_game.applyMenuRules();
        }
        _fulldraw = 1;
    }

    nextUserId()
    {
        var index = _user_ids.indexOf(_current_user);
        if (index == -1) {
            return _user_ids[0];
        }
        return _user_ids[(index + 1) % _user_ids.length];
    }

    async endCurrentUserTurn()
    {
        _selection_by_user[_current_user] = _selection;
        this.setCurrentUser(this.nextUserId(), false);
        if (typeof _current_game !== 'undefined' && _current_game && _current_game.selectNextUnitWithoutTask) {
            _current_game.selectNextUnitWithoutTask();
        }
        this.centerActiveUserView();
        this.redrawActiveUserOverlay();
        this.updateTurnLabel();
        if (typeof _server_game !== 'undefined') {
            if (!_server_game.isAwaitingResolution(_current_user)) {
                _server_game.startTurnTimer(_current_user, false);
            }
            else {
                _server_game.updateWaitingUi(_current_user);
            }
            if (_server_game.initialized) {
                try {
                    await _server_game.loadUpdates(_current_user);
                }
                catch (error) {
                    _server_game.log('Could not load next player state: ' + error.message);
                }
            }
        }
        await this.prepareCurrentAiTurn();
    }

    cloneNumberGrid(source, fallback)
    {
        var result = new Array(_map_size);
        for (var i=0; i < _map_size; i++) {
            result[i] = new Array(_map_size);
            for (var j=0; j < _map_size; j++) {
                result[i][j] = source && source[i] && source[i][j] != undefined ? source[i][j] : fallback;
            }
        }
        return result;
    }

    cloneObjectGrid(source, fallback)
    {
        var result = new Array(_map_size);
        for (var i=0; i < _map_size; i++) {
            result[i] = new Array(_map_size);
            for (var j=0; j < _map_size; j++) {
                var value = source && source[i] ? source[i][j] : null;
                result[i][j] = Object.assign({}, value || fallback);
            }
        }
        return result;
    }

    restoreGrid(target, source)
    {
        for (var i=0; i < _map_size; i++) {
            for (var j=0; j < _map_size; j++) target[i][j] = source[i][j];
        }
    }

    captureClientContext()
    {
        return {
            units: _units,
            currentUser: _current_user,
            publicCurrentUser: current_user,
            gameState: _game_state,
            selection: _selection,
            terrainBits: _map_terrain_bit,
            terrainTextures: this.cloneNumberGrid(_map_terrain_tex, 0),
            terrainModifiers: this.cloneObjectGrid(_map_terrain_mod, {}),
            resources: this.cloneObjectGrid(_map_resource, { type: 0, hidden: true }),
            fullDraw: _fulldraw,
        };
    }

    isHiddenSnapshotActive()
    {
        return this.hiddenSnapshotDepth > 0;
    }

    activateHiddenPlayer(aiId)
    {
        this.ensureUser(aiId);
        _current_user = aiId;
        current_user = aiId;
        _units = _units_by_user[aiId];
        if (_game_state_by_user[aiId] == undefined) _game_state_by_user[aiId] = new GameState();
        _game_state = _game_state_by_user[aiId];
        _selection = -1;
        _map_terrain_bit_by_user[aiId] = this.cloneNumberGrid(null, 0xFF);
        _map_resource_visibility_by_user[aiId] = this.createResourceVisibility();
        _map_terrain_bit = _map_terrain_bit_by_user[aiId];
        for (var i=0; i < _map_size; i++) {
            for (var j=0; j < _map_size; j++) {
                _map_terrain_tex[i][j] = 0;
                _map_terrain_mod[i][j] = {};
                _map_resource[i][j] = { type: 0, hidden: true };
            }
        }
    }

    restoreClientContext(context)
    {
        _units = context.units;
        _current_user = context.currentUser;
        current_user = context.publicCurrentUser;
        _game_state = context.gameState;
        _selection = context.selection;
        _map_terrain_bit = context.terrainBits;
        this.restoreGrid(_map_terrain_tex, context.terrainTextures);
        this.restoreGrid(_map_terrain_mod, context.terrainModifiers);
        this.restoreGrid(_map_resource, context.resources);
        if (_map.prepareTerrainModifierSprites) _map.prepareTerrainModifierSprites();
        if (_map.prepareResourceSprites) _map.prepareResourceSprites();
        if (typeof _current_game != 'undefined' && _current_game && _current_game.applyMenuRules) {
            _current_game.applyMenuRules();
        }
        _fulldraw = context.fullDraw;
    }

    clonePlain(value)
    {
        return value == undefined ? value : JSON.parse(JSON.stringify(value));
    }

    captureAiAdapterState()
    {
        return {
            lastStrategyObjectIds: this.clonePlain(_ai_player.lastStrategyObjectIds),
            lastStrategyContext: this.clonePlain(_ai_player.lastStrategyContext),
            lastStrategyFocuses: this.clonePlain(_ai_player.lastStrategyFocuses),
            lastStrategyMilitaryFocus: this.clonePlain(_ai_player.lastStrategyMilitaryFocus),
            lastStrategyWorkerFocus: this.clonePlain(_ai_player.lastStrategyWorkerFocus),
            lastStrategyProductionDemands: this.clonePlain(_ai_player.lastStrategyProductionDemands),
            lastTacticsGroupIds: this.clonePlain(_ai_player.lastTacticsGroupIds),
            lastActionUnitIndices: this.clonePlain(_ai_player.lastActionUnitIndices),
            lastActionRecordSummaries: this.clonePlain(_ai_player.lastActionRecordSummaries),
            lastEconomicsCityIndices: this.clonePlain(_ai_player.lastEconomicsCityIndices),
        };
    }

    restoreAiAdapterState(state)
    {
        if (!state) return;
        for (var key in state) _ai_player[key] = this.clonePlain(state[key]);
    }

    withHiddenSnapshot(aiId, snapshot, callback)
    {
        var context = this.captureClientContext();
        var previousHidden = _server_game.hiddenActions;
        _server_game.setHiddenActions(true);
        this.hiddenSnapshotDepth++;
        try {
            this.activateHiddenPlayer(aiId);
            _server_game.applyFullSnapshot(aiId, snapshot, {
                pruneForeignUnits: false,
                preserveExistingForeignUnits: true,
            });
            return callback();
        }
        finally {
            this.restoreClientContext(context);
            this.hiddenSnapshotDepth--;
            _server_game.setHiddenActions(previousHidden);
        }
    }

    async prepareHiddenAiPlan(expectedTurn)
    {
        var aiId = this.hiddenAiUserId;
        await _ai_player.ensureBackgroundModelsLoaded();
        var snapshot = await _server_game.fetchFullPlayer(aiId, false);
        var snapshotTurn = snapshot.turn == undefined ? _server_game.serverTurn : parseInt(snapshot.turn, 10);
        if (expectedTurn != undefined && snapshotTurn != expectedTurn) return null;

        var strategyStage = this.withHiddenSnapshot(aiId, snapshot, function() {
            return {
                input: _ai_player.buildStrategyInput(aiId),
                adapter: _multiplayer.captureAiAdapterState(),
            };
        });
        var strategyOutput = await _ai_player.inferBackground('strategy', strategyStage.input);

        var inputStage = this.withHiddenSnapshot(aiId, snapshot, function() {
            _multiplayer.restoreAiAdapterState(strategyStage.adapter);
            var strategyDecision = _ai_player.decodeStrategyOutput(strategyOutput, aiId);
            _ai_player.lastStrategyFocuses = strategyDecision.focuses;
            _ai_player.lastStrategyMilitaryFocus = strategyDecision.maxMilitaryFocus;
            _ai_player.lastStrategyWorkerFocus = strategyDecision.maxWorkerFocus;
            _ai_player.lastStrategyProductionDemands = strategyDecision.productionDemands;
            var tacticsInput = _ai_player.buildTacticsInput(aiId, strategyDecision.maxMilitaryFocus);
            var economicsInput = _ai_player.buildEconomicsInput(aiId, strategyDecision.productionDemands);
            _ai_player.advanceSettlerTurnCounters(aiId);
            var actionInput = _ai_player.buildActionInput(
                aiId,
                strategyDecision.maxMilitaryFocus,
                strategyDecision.maxWorkerFocus
            );
            return {
                strategyDecision: strategyDecision,
                tacticsInput: tacticsInput,
                economicsInput: economicsInput,
                actionInput: actionInput,
                adapter: _multiplayer.captureAiAdapterState(),
            };
        });
        var outputs = await Promise.all([
            _ai_player.inferBackground('tactics', inputStage.tacticsInput),
            _ai_player.inferBackground('economics', inputStage.economicsInput),
            _ai_player.inferBackground('action', inputStage.actionInput),
        ]);
        return {
            ownerTeam: aiId,
            turn: snapshotTurn,
            snapshot: snapshot,
            adapter: inputStage.adapter,
            strategyOutput: strategyOutput,
            tacticsOutput: outputs[0],
            economicsOutput: outputs[1],
            actionOutput: outputs[2],
        };
    }

    async applyAndSubmitHiddenAiPlan(plan)
    {
        if (!plan || plan.turn != _server_game.serverTurn) return null;
        var aiId = plan.ownerTeam;
        var submission = this.withHiddenSnapshot(aiId, plan.snapshot, function() {
            _multiplayer.restoreAiAdapterState(plan.adapter);
            _ai_player.log('U' + aiId + ' background AI turn applying worker results');
            _ai_player.applyStrategyOutput(plan.strategyOutput, aiId);
            _ai_player.applyTacticsOutput(plan.tacticsOutput, aiId);
            _ai_player.applyEconomicsOutput(plan.economicsOutput, aiId);
            _ai_player.advanceSettlerTurnCounters(aiId);
            _ai_player.applyActionOutput(plan.actionOutput, aiId);
            _ai_player.applyAiReasoningWorkarounds(aiId);
            return _server_game.captureTurn(aiId);
        });
        await _server_game.waitForHiddenActions();
        if (plan.turn != _server_game.serverTurn) return null;
        return await _server_game.submitTurn(submission, {
            hidden: true,
            deferUpdates: true,
            deferPolling: true,
        });
    }

    startBackgroundAiTurn(expectedTurn)
    {
        var aiId = this.hiddenAiUserId;
        if (aiId == null || typeof _ai_player == 'undefined') return Promise.resolve(null);
        if (this.backgroundAiPromise && this.backgroundAiTurn == expectedTurn) return this.backgroundAiPromise;
        this.backgroundAiTurn = expectedTurn;
        this.hiddenTurnRunning = true;
        var self = this;
        this.backgroundAiPromise = this.prepareHiddenAiPlan(expectedTurn)
            .then(function(plan) { return self.applyAndSubmitHiddenAiPlan(plan); })
            .catch(function(error) {
                _server_game.log('Hidden AI background turn failed: ' + error.message);
                return null;
            })
            .finally(function() { self.hiddenTurnRunning = false; });
        return this.backgroundAiPromise;
    }

    async runHiddenAiTurn(expectedTurn)
    {
        return await this.startBackgroundAiTurn(expectedTurn);
    }

    async submitHumanAndHiddenAiTurn(humanSubmission)
    {
        var hiddenTurn = this.startBackgroundAiTurn(humanSubmission.turn);
        // The human atomic commands must enter the current server turn without
        // waiting for model inference, which can outlast the five-second window.
        var humanTurn = _server_game.submitTurn(humanSubmission, {
            deferUpdates: true,
            deferPolling: true,
        });
        var settled = await Promise.allSettled([humanTurn, hiddenTurn]);
        if (settled[0].status == 'rejected') throw settled[0].reason;
        var result = settled[0].value;
        var update = await _server_game.loadUpdates(this.humanUserId);
        if (update.turn <= result.submitted_turn) {
            _server_game.pollForResolution(this.humanUserId, result.submitted_turn);
        }
        return result;
    }

    async prepareCurrentAiTurn()
    {
        if (_user_types[_current_user] != 'ai' || typeof _ai_player === 'undefined') {
            return false;
        }
        if (typeof appendConsoleLog === 'function') {
            appendConsoleLog('Preparing AI user ' + _current_user);
        }
        var button = document.getElementById('endTurnButton');
        if (button) {
            button.textContent = 'Preparing AI User ' + _current_user + '...';
        }
        try {
            var userId = _current_user;
            _ai_player.statusCallback = function(message) {
                if (button && _current_user == userId) {
                    button.textContent = message;
                }
            };
            var result = await this.withTimeout(
                _ai_player.runFullTurnAI(_current_user),
                180000,
                'AI preparation timed out while loading models'
            );
            if (typeof console !== 'undefined' && console.log) {
                console.log('AI turn prepared for user ' + _current_user, result);
            }
            if (typeof appendConsoleLog === 'function') {
                appendConsoleLog('AI user ' + _current_user + ' ready; click End Turn to execute visible movement');
            }
        }
        catch (error) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('AI turn failed for user ' + _current_user, error);
            }
            if (button) {
                button.textContent = 'AI User ' + _current_user + ' not ready';
            }
            if (typeof appendConsoleLog === 'function') {
                appendConsoleLog('AI user ' + _current_user + ' failed: ' + error.message);
            }
            if (typeof _game !== 'undefined' && _game.sleep) {
                await _game.sleep(900);
            }
        }
        finally {
            if (typeof _ai_player !== 'undefined') {
                _ai_player.statusCallback = null;
            }
        }
        this.redrawActiveUserOverlay();
        _fulldraw = 1;
        if (typeof drawScene === 'function' && (typeof _in_drawing === 'undefined' || !_in_drawing)) {
            drawScene(0);
        }
        this.updateTurnLabel();
        return true;
    }

    prepareInitialAiTurn()
    {
        if (_user_types[_current_user] != 'ai') {
            return;
        }
        var self = this;
        setTimeout(function() {
            self.prepareCurrentAiTurn();
        }, 200);
    }

    async withTimeout(promise, timeoutMs, message)
    {
        var timeoutId = null;
        var timeout = new Promise(function(resolve, reject) {
            timeoutId = setTimeout(function() {
                reject(new Error(message));
            }, timeoutMs);
        });
        try {
            return await Promise.race([promise, timeout]);
        }
        finally {
            clearTimeout(timeoutId);
        }
    }

    rebuildCurrentVisibility()
    {
        if (_map_terrain_bit == undefined) {
            return;
        }
        this.clearVisibility(_map_terrain_bit, true);
        if (typeof _map === 'undefined' || !_map.openMap) {
            return;
        }
        for (var k=0; k < _units.length; k++) {
            _map.openMap(_units[k].coord.i, _units[k].coord.j);
        }
        if (_map.prepareResourceSprites) {
            _map.prepareResourceSprites();
        }
    }

    centerActiveUserView()
    {
        if (typeof _current_game !== 'undefined' && _current_game && _current_game.centerViewOnStartingUnits) {
            _current_game.centerViewOnStartingUnits();
        }
    }

    activeUserUnits()
    {
        return _units_by_user[_current_user] || [];
    }

    redrawActiveUserOverlay()
    {
        if (typeof _game !== 'undefined' && _game && _game.redrawControlZones) {
            _game.redrawControlZones();
        }
    }

    updateTurnLabel(remainingSeconds)
    {
        var button = document.getElementById('endTurnButton');
        if (button) {
            if (remainingSeconds == undefined && typeof _server_game != 'undefined') {
                remainingSeconds = _server_game.lastRemainingSeconds;
            }
            var label = _authenticated_player_id == null
                ? ((_user_types[_current_user] == 'ai' ? 'End AI User ' : 'End User ') + _current_user + ' Turn')
                : 'End Turn';
            if (typeof _server_game !== 'undefined' && _server_game.isAwaitingResolution(_current_user)) {
                label = 'Waiting';
                button.disabled = true;
            }
            button.textContent = label + ' (' + Math.max(0, remainingSeconds == undefined ? 5 : remainingSeconds) + 's)';
        }
    }
}();

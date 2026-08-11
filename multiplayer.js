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
            if (_user_types[playerId] == 'ai' && aiId == null) {
                aiId = playerId;
            }
        }
        _user_types[humanId] = 'human';
        _user_ids = [humanId];
        this.humanUserId = humanId;
        this.hiddenAiUserId = aiId;
        _hidden_ai_user_id = aiId;
        this.ensureUser(humanId);
        if (aiId != null) this.ensureUser(aiId);
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
        if (typeof _economics != 'undefined') _economics.updateCounters(_game_state, userId, 'set-current-user');
        _selection = _selection_by_user[userId] == undefined ? -1 : _selection_by_user[userId];
        if (typeof _multi_selection != 'undefined') _multi_selection = [];
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
            mapOriginI: _map_origin_i,
            mapOriginJ: _map_origin_j,
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
        if (typeof _server_game != 'undefined' && _server_game.setMapWindowOrigin) {
            _server_game.setMapWindowOrigin(context.mapOriginI, context.mapOriginJ, false);
        }
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
        if (typeof _economics != 'undefined') {
            _economics.updateCounters(_game_state, _current_user, 'hidden-snapshot-restore');
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
            lastStrategyProductionDemands: this.clonePlain(_ai_player.lastStrategyProductionDemands),
            lastActionUnitIndices: this.clonePlain(_ai_player.lastActionUnitIndices),
            lastActionRecordSummaries: this.clonePlain(_ai_player.lastActionRecordSummaries),
            lastActionCandidates: this.clonePlain(_ai_player.lastActionCandidates),
            lastEconomicsCityIndices: this.clonePlain(_ai_player.lastEconomicsCityIndices),
            lastEconomicsCandidates: this.clonePlain(_ai_player.lastEconomicsCandidates),
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

    async prepareAiUnitOrder(aiId, snapshot, unitId, strategyFocus)
    {
        var stage = this.withHiddenSnapshot(aiId, snapshot, function() {
            return {
                input: _ai_player.buildActionInputForUnit(aiId, unitId, strategyFocus),
                adapter: _multiplayer.captureAiAdapterState(),
                hasUnit: _ai_player.lastActionUnitIndices.length > 0,
            };
        });
        if (!stage.hasUnit) return null;
        var output = await _ai_player.inferBackground('action', stage.input);
        return this.withHiddenSnapshot(aiId, snapshot, function() {
            _multiplayer.restoreAiAdapterState(stage.adapter);
            var found = _server_game.findUnit(aiId, Number(unitId), null);
            var automatic = found && found.unit
                && ['automate', 'road_to', 'explore', 'patrol'].indexOf(
                    found.unit.automationMode || found.unit.state
                ) != -1;
            if (!automatic) _ai_player.applyActionOutput(output, aiId);
            if (found && found.unit) _multiplayer.routeExcessMilitaryToStrategicResource(found.unit);
            return _server_game.captureTurn(aiId, [unitId]);
        });
    }

    routeExcessMilitaryToStrategicResource(unit)
    {
        if (!unit || unit.type != 2 || unit.guardResource || !unit.coord
            || typeof _resource_types == 'undefined' || typeof _current_game == 'undefined') return false;
        var strategicIds = { copper: true, iron: true, gold: true, gems: true, diamonds: true };
        var best = null;
        for (var i=0; i<_map_size; i++) {
            for (var j=0; j<_map_size; j++) {
                var resource = _map_resource[i] && _map_resource[i][j];
                var definition = resource && resource.type ? _resource_types[resource.type] : null;
                if (!definition || !strategicIds[definition.id]) continue;
                var distance = Math.abs(i-unit.coord.i) + Math.abs(j-unit.coord.j);
                if (!best || distance < best.distance) best = { i: i, j: j, distance: distance };
            }
        }
        if (!best || best.distance <= 1) {
            unit.state = 'fortified';
            unit.gotoPath = [];
            unit.gotoCoord = null;
            return !!best;
        }
        var unitIndex = _units.indexOf(unit);
        if (unitIndex < 0) return false;
        var path = _current_game.buildPath(unitIndex, new Coord(best.i, best.j));
        if (!path.length) return false;
        _current_game.assignPath(unitIndex, path);
        unit.state = 'ready';
        return true;
    }

    async contributeAiBatches(expectedTurn)
    {
        var aiId = this.hiddenAiUserId;
        if (aiId == null || typeof _ai_player == 'undefined') return null;
        await _ai_player.ensureBackgroundModelsLoaded();
        var snapshot = null;
        var batches = 0;
        while (_server_game.serverTurn == expectedTurn
            && !_turn_in_progress && Date.now() + 350 < _server_game.deadlineAt) {
            // Every lease can come from a different 100x100 world sector.
            var batch = await _server_game.claimAiBatch(true);
            if (batch.turn != expectedTurn || !batch.unit_ids || !batch.unit_ids.length) break;
            if (batch.snapshot) snapshot = batch.snapshot;
            if (!snapshot) break;
            aiId = Number(batch.ai_player_id);
            this.hiddenAiUserId = aiId;
            var commands = [];
            var actions = [];
            for (var n=0; n < batch.unit_ids.length; n++) {
                if (_server_game.serverTurn != expectedTurn || _turn_in_progress) break;
                var submission = await this.prepareAiUnitOrder(
                    aiId, snapshot, batch.unit_ids[n], _ai_player.lastStrategyMilitaryFocus
                );
                if (!submission) continue;
                commands = commands.concat(submission.commands || []);
                actions = actions.concat(submission.actions || []);
                // Stream small chunks so useful work reaches a six-second turn
                // even when eight Action inferences cannot all finish in time.
                if (commands.length >= 2) {
                    await _server_game.submitAiBatch(batch, { commands: commands, actions: actions });
                    commands = [];
                    actions = [];
                }
            }
            if (commands.length || actions.length) {
                await _server_game.submitAiBatch(batch, { commands: commands, actions: actions });
            }
            batches++;
            await new Promise(function(resolve) { setTimeout(resolve, 0); });
        }
        return { batches: batches };
    }

    startBackgroundAiTurn(expectedTurn)
    {
        var aiId = this.hiddenAiUserId;
        if (aiId == null || typeof _ai_player == 'undefined') return Promise.resolve(null);
        if (this.backgroundAiPromise && this.backgroundAiTurn == expectedTurn) return this.backgroundAiPromise;
        this.backgroundAiTurn = expectedTurn;
        this.hiddenTurnRunning = true;
        var self = this;
        this.backgroundAiPromise = this.contributeAiBatches(expectedTurn)
            .catch(function(error) {
                _server_game.log('Shared AI contribution failed: ' + error.message);
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
        // Shared AI work is opportunistic and must never delay the human turn.
        var result = await _server_game.submitTurn(humanSubmission, {
            deferUpdates: true,
            deferPolling: true,
        });
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

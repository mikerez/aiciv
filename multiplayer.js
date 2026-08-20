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
        this.backgroundAiObjectLimit = 8;
        this.backgroundAiSubmitChunkSize = 2;
        this.backgroundAiProcessedByTurn = {};
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
            terrainTextures: _map_terrain_tex,
            terrainModifiers: _map_terrain_mod,
            resources: _map_resource,
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
        _map_terrain_tex = this.cloneNumberGrid(null, 0);
        _map_terrain_mod = this.cloneObjectGrid(null, {});
        _map_resource = this.cloneObjectGrid(null, { type: 0, hidden: true });
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
        if (typeof _server_game != 'undefined' && _server_game.setHiddenMapWindowOrigin) {
            _server_game.setHiddenMapWindowOrigin(context.mapOriginI, context.mapOriginJ);
        }
        _units = context.units;
        _current_user = context.currentUser;
        current_user = context.publicCurrentUser;
        _game_state = context.gameState;
        _selection = context.selection;
        _map_terrain_bit = context.terrainBits;
        _map_terrain_tex = context.terrainTextures;
        _map_terrain_mod = context.terrainModifiers;
        _map_resource = context.resources;
        if (typeof _current_game != 'undefined' && _current_game && _current_game.applyMenuRules) {
            _current_game.applyMenuRules();
        }
        if (typeof _economics != 'undefined') {
            _economics.updateCounters(_game_state, _current_user, 'hidden-snapshot-restore');
        }
        // Hidden snapshots do not touch renderer preparation. Preserve the
        // draw state so each AI object cannot trigger a full WebGL clear.
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

    sharedAiWorkerTarget(task)
    {
        if (!task || !task.target || task.target.i == undefined || task.target.j == undefined) return null;
        return new Coord(Number(task.target.i)-_map_origin_i, Number(task.target.j)-_map_origin_j);
    }

    sharedAiSettlerTarget(task)
    {
        if (!task || task.kind != 'settler' || task.mode != 'settle'
            || !task.target || task.target.i == undefined || task.target.j == undefined) return null;
        return new Coord(Number(task.target.i)-_map_origin_i, Number(task.target.j)-_map_origin_j);
    }

    resumeSharedAiSettlerTask(k)
    {
        var settler = _units[k];
        var target = settler && this.sharedAiSettlerTarget(settler.sharedAiTask);
        if (!settler || settler.unitTypeId != 'settlers' || !target) return null;
        if (settler.coord.i == target.i && settler.coord.j == target.j) {
            delete settler.sharedAiTask;
            return null;
        }
        if (target.i < 0 || target.j < 0 || target.i >= _map_size || target.j >= _map_size) {
            delete settler.sharedAiTask;
            return null;
        }
        var path = _current_game.buildPath(k, target);
        if (!path || !path.length) {
            delete settler.sharedAiTask;
            return null;
        }
        settler.state = 'ready';
        _current_game.assignPath(k, path);
        return {target: target, pathLength: path.length};
    }

    sharedAiSettlerTask(unit, decision, submission)
    {
        if (!unit || unit.unitTypeId != 'settlers') return null;
        var founded = (submission.actions || []).some(function(action) {
            return action && action.type == 'build_city'
                && Number(action.settler_unit_id) == Number(unit.serverId);
        });
        if (founded || !decision || decision.command != 'goto' || !decision.target) return null;
        return {
            kind: 'settler',
            mode: 'settle',
            target: {
                i: Number(decision.target.i)+_map_origin_i,
                j: Number(decision.target.j)+_map_origin_j,
            },
        };
    }

    resumeSharedAiWorkerTask(k)
    {
        var worker = _units[k];
        var task = worker && worker.sharedAiTask;
        if (!worker || worker.unitTypeId != 'worker' || !task || task.kind != 'worker') return false;
        worker.automationMode = task.mode == 'road_to' ? 'road_to' : 'automate';
        var target = this.sharedAiWorkerTarget(task);
        var action = task.action || null;
        if (!target && !action) return false;
        var atTarget = target && worker.coord.i == target.i && worker.coord.j == target.j;
        if (atTarget && action && Number.isFinite(Number(task.turns_left))) {
            var countdownState = action == 'irrigation' ? 'irrigate'
                : action == 'connect_road' ? 'road' : action;
            worker.state = countdownState;
            worker.clientImprovementState = action == 'connect_road' ? 'road' : action;
            worker.clientImprovementTurnsLeft = Math.max(0, Number(task.turns_left));
            worker.automationCommandAction = worker.clientImprovementState;
            worker.automationCommandTarget = new Coord(target.i, target.j);
            return true;
        }
        if (atTarget && action) {
            var buildAction = action == 'irrigation' ? 'irrigate'
                : action == 'connect_road' ? 'road' : action;
            return !!(_current_game.startAutomatedWorkerAction
                && _current_game.startAutomatedWorkerAction(k, buildAction));
        }
        if (!target || target.i < 0 || target.j < 0 || target.i >= _map_size || target.j >= _map_size) {
            return false;
        }
        var path = action == 'connect_road' && _current_game.buildRoadPath
            ? _current_game.buildRoadPath(k, target) : _current_game.buildPath(k, target);
        if (!path || !path.length) return false;
        worker.automateBuild = action;
        worker.automateTarget = new Coord(target.i, target.j);
        _current_game.assignPath(k, path);
        if (action == 'connect_road') {
            worker.state = 'road_to';
            worker.automationMode = 'road_to';
            worker.resumeAutomationAfterRoadTo = true;
            if (_current_game.prepareRoadToTurn) _current_game.prepareRoadToTurn(k);
        }
        return true;
    }

    sharedAiWorkerTask(unit, submission)
    {
        if (!unit || unit.unitTypeId != 'worker') return null;
        var completedBuild = (submission.actions || []).some(function(action) {
            return action && action.type == 'build' && Number(action.worker_unit_id) == Number(unit.serverId);
        });
        if (completedBuild) return null;
        var target = unit.automateTarget || unit.automationCommandTarget
            || unit.roadToFollowupTarget || unit.gotoCoord || null;
        var action = unit.automationCommandAction || unit.automateBuild
            || _server_game.activeWorkerModifier(unit) || null;
        if (action == 'irrigate') action = 'irrigation';
        var task = {
            kind: 'worker',
            mode: unit.automationMode == 'road_to' ? 'road_to' : 'automate',
            state: unit.state || 'automate',
            action: action,
            target: target ? {i:Number(target.i)+_map_origin_i, j:Number(target.j)+_map_origin_j} : null,
            turns_left: Number.isFinite(Number(unit.clientImprovementTurnsLeft))
                ? Math.max(0, Number(unit.clientImprovementTurnsLeft)) : null,
            city_id: unit.lastAutomationDecision && unit.lastAutomationDecision.city_id != undefined
                ? unit.lastAutomationDecision.city_id : null,
        };
        return task;
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
                reconcileClientRoutes: false,
            });
            return callback();
        }
        finally {
            this.restoreClientContext(context);
            this.hiddenSnapshotDepth--;
            _server_game.setHiddenActions(previousHidden);
        }
    }

    workerHasPersistentRoadTo(unit)
    {
        return !!(unit && unit.unitTypeId == 'worker'
            && (unit.automationMode == 'road_to' || unit.state == 'road_to')
            && (unit.roadToBuilding || unit.roadToDestination
                || (unit.gotoPath && unit.gotoPath.length) || unit.gotoCoord != undefined
                || unit.pendingImmediateBuild
                || Number.isFinite(Number(unit.clientImprovementTurnsLeft))));
    }

    async prepareAiUnitOrder(aiId, snapshot, unitId, strategyFocus, snapshotAlreadyActive)
    {
        var buildStage = function() {
            var found = _server_game.findUnit(aiId, Number(unitId), null);
            var unit = found && found.unit;
            if (!unit) return {hasUnit: false};
            if (unit.type == 3) {
                return {
                    kind: 'city',
                    input: _ai_player.buildEconomicsInputForCity(
                        aiId, unitId, _ai_player.lastStrategyProductionDemands
                    ),
                    adapter: _multiplayer.captureAiAdapterState(),
                    hasUnit: true,
                };
            }
            var kind = unit.unitTypeId == 'settlers' ? 'settler'
                : unit.unitTypeId == 'worker' ? 'worker'
                    : unit.unitTypeId == 'explorer' ? 'explorer' : 'action';
            return {
                kind: kind,
                input: _ai_player.buildActionInputForUnit(aiId, unitId, strategyFocus),
                adapter: _multiplayer.captureAiAdapterState(),
                // Civilian policies are rule-driven and remain valid even when
                // the Action model has no candidate for the unit's current state.
                hasUnit: kind != 'action' || _ai_player.lastActionUnitIndices.length > 0,
            };
        };
        var stage = snapshotAlreadyActive ? buildStage()
            : this.withHiddenSnapshot(aiId, snapshot, buildStage);
        if (!stage.hasUnit) return null;
        var output = null;
        if (stage.kind == 'action' || stage.kind == 'city') {
            output = await _ai_player.inferBackground(stage.kind == 'city' ? 'economics' : 'action', stage.input);
        }
        var finishOrder = function() {
            _multiplayer.restoreAiAdapterState(stage.adapter);
            var found = _server_game.findUnit(aiId, Number(unitId), null);
            if (!found || !found.unit) return null;
            var unit = found.unit;
            var decision = {kind: stage.kind, command: 'hold'};
            if (stage.kind == 'city') {
                var economics = _ai_player.applyEconomicsOutput(output, aiId);
                if (!unit.production) _ai_player.applyDevelopmentProductionPolicies(aiId);
                decision.command = unit.production ? 'produce_' + unit.production.unitTypeId : 'idle';
                decision.model = economics;
            }
            else if (stage.kind == 'settler') {
                var resumedSettlement = _multiplayer.resumeSharedAiSettlerTask(found.index);
                if (resumedSettlement) {
                    decision = {
                        kind: 'settler', applied: true, command: 'goto',
                        target: resumedSettlement.target,
                        pathLength: resumedSettlement.pathLength,
                        persistentMission: true,
                        description: 'Settler #' + (unit.serverId || unitId)
                            + ' resumes City destination '
                            + _ai_player.coordText(resumedSettlement.target),
                    };
                }
                else {
                    var settlerPolicy = _ai_player.applySettlerExpansionPolicy(found.index, aiId);
                    decision = Object.assign({kind: 'settler'}, settlerPolicy);
                }
            }
            else if (stage.kind == 'worker') {
                var persistentRoadTo = _multiplayer.workerHasPersistentRoadTo(unit);
                if (persistentRoadTo) {
                    unit.automationMode = 'road_to';
                    unit.state = 'road_to';
                    if (_current_game.prepareRoadToTurn) {
                        _current_game.prepareRoadToTurn(found.index);
                    }
                }
                else {
                    unit.automationMode = 'automate';
                }
                if (!persistentRoadTo && !_ai_player.civilianPolicyHasActiveTask(unit)) {
                    unit.state = 'automate';
                    if (!_multiplayer.resumeSharedAiWorkerTask(found.index)
                        && _current_game.autoRouteAutomate) _current_game.autoRouteAutomate(found.index);
                }
                decision.command = persistentRoadTo
                    ? (unit.roadToBuilding ? 'build_road' : 'road_to')
                    : unit.automateBuild || (unit.gotoPath && unit.gotoPath.length ? 'goto' : 'automate');
            }
            else if (stage.kind == 'explorer') {
                unit.automationMode = 'explore';
                if (!_ai_player.civilianPolicyHasActiveTask(unit)) {
                    unit.state = 'explore';
                    if (_current_game.autoRouteExplore) _current_game.autoRouteExplore(found.index);
                }
                decision.command = unit.gotoPath && unit.gotoPath.length ? 'goto' : 'explore';
            }
            else {
                decision.model = _ai_player.applyActionOutput(output, aiId);
            }
            var forceMission = null;
            if (unit.type == 2) {
                // One strongest unit stays in each City. Other forces retain a
                // model-selected attack/move, or receive a persistent roaming
                // mission when Action would otherwise leave them idle.
                if (_multiplayer.isAssignedCityDefender(unit, aiId)) {
                    var defenderIndex = _units.indexOf(unit);
                    if (_current_game.clearUnitPath) _current_game.clearUnitPath(defenderIndex);
                    else {
                        unit.gotoPath = [];
                        unit.gotoCoord = null;
                    }
                    unit.automationMode = null;
                    unit.state = 'fortified';
                    forceMission = {mode: 'city_defense', destination: unit.coord};
                }
                else if (!(unit.gotoPath && unit.gotoPath.length)) {
                    forceMission = _multiplayer.assignIdleMilitaryMission(unit, aiId);
                }
            }
            var submission = _server_game.captureTurn(aiId, [unitId]);
            var command = submission.commands && submission.commands[0];
            if (command && forceMission) {
                command.payload = command.payload || {};
                command.payload.automation_mode = forceMission.mode == 'city_defense' ? null : 'patrol';
                command.payload.ai_force_mission = {
                    mode: forceMission.mode,
                    destination: forceMission.destination ? {
                        i: Number(forceMission.destination.i)+_map_origin_i,
                        j: Number(forceMission.destination.j)+_map_origin_j,
                    } : null,
                };
            }
            if (command && (stage.kind == 'settler' || stage.kind == 'city')) {
                command.payload = command.payload || {};
                if (stage.kind == 'settler') {
                    command.payload.shared_ai_task = _multiplayer.sharedAiSettlerTask(
                        unit, decision, submission
                    );
                }
                command.payload.ai_development_decision = {
                    player_id: aiId,
                    unit_id: unit.serverId || Number(unitId),
                    unit_type_id: unit.unitTypeId,
                    state: unit.state,
                    command: command.command,
                    decision: decision,
                    queued_actions: (submission.actions || []).map(function(action) {
                        return {type: action.type, unit_type_id: action.unit_type_id || null};
                    }),
                    position: unit.worldCoord || unit.coord,
                };
            }
            if (unit.unitTypeId == 'worker'
                && ['automate', 'road_to'].indexOf(unit.automationMode || unit.state) != -1) {
                if (command) {
                    command.payload = command.payload || {};
                    command.payload.shared_ai_task = _multiplayer.sharedAiWorkerTask(unit, submission);
                    command.payload.ai_worker_decision = {
                        player_id: aiId,
                        unit_id: unit.serverId || Number(unitId),
                        mode: unit.automationMode || unit.state,
                        state: unit.state,
                        command: command.command,
                        path: command.path || [],
                        decision: unit.lastAutomationDecision || {
                            choice: unit.roadToBuilding ? 'building_road'
                                : unit.automateBuild ? 'continuing_' + unit.automateBuild
                                    : unit.gotoPath && unit.gotoPath.length
                                        ? 'continuing_route' : 'idle',
                            action: unit.automateBuild || unit.automationCommandAction || null,
                            target: unit.automateTarget || unit.automationCommandTarget
                                || unit.gotoCoord || null,
                            path_length: unit.gotoPath ? unit.gotoPath.length : 0,
                        },
                    };
                }
            }
            return submission;
        };
        return snapshotAlreadyActive ? finishOrder()
            : this.withHiddenSnapshot(aiId, snapshot, finishOrder);
    }

    militaryDefenseScore(unit)
    {
        if (!unit) return -Infinity;
        var healthRatio = Math.max(0, Number(unit.health == undefined ? 100 : unit.health))
            / Math.max(1, Number(unit.maxHealth == undefined ? 100 : unit.maxHealth));
        return Math.max(0, Number(unit.defense) || 0) * 4
            + Math.max(0, Number(unit.attack) || 0)
            + Math.max(0, Number(unit.experience) || 1)
            + healthRatio * 2;
    }

    isAssignedCityDefender(unit, ownerTeam)
    {
        if (!unit || unit.type != 2 || !unit.coord) return false;
        var cityFound = false;
        var best = null;
        for (var k=0; k<_units.length; k++) {
            var candidate = _units[k];
            if (!candidate || !candidate.coord || (candidate.team || 0) != ownerTeam) continue;
            if (candidate.coord.i != unit.coord.i || candidate.coord.j != unit.coord.j) continue;
            if (candidate.type == 3) cityFound = true;
            if (candidate.type != 2 || candidate.health === 0 || candidate.pendingDisband) continue;
            var score = this.militaryDefenseScore(candidate);
            var id = Number(candidate.serverId == undefined ? k : candidate.serverId);
            if (!best || score > best.score || (score == best.score && id < best.id)) {
                best = {unit: candidate, score: score, id: id};
            }
        }
        return cityFound && best && best.unit === unit;
    }

    assignIdleMilitaryMission(unit, ownerTeam)
    {
        if (!unit || unit.type != 2 || !unit.can_move || !unit.coord
            || typeof _current_game == 'undefined') return null;
        var k = _units.indexOf(unit);
        if (k < 0) return null;
        var turn = typeof _server_game != 'undefined' ? Number(_server_game.serverTurn) || 0 : 0;
        var id = Number(unit.serverId == undefined ? k : unit.serverId);
        var preferExplore = ((id + Math.floor(turn / 8)) & 1) == 0;
        var mode = null;
        var route = null;

        if (preferExplore && _current_game.nearestHiddenLandTarget) {
            route = _current_game.nearestHiddenLandTarget(k);
            if (route && route.path && route.path.length) {
                _current_game.assignPath(k, route.path);
                mode = 'explore';
            }
        }
        if (!(unit.gotoPath && unit.gotoPath.length) && _current_game.autoRoutePatrol) {
            _current_game.autoRoutePatrol(k);
            if (unit.gotoPath && unit.gotoPath.length) mode = 'patrol';
        }
        if (!(unit.gotoPath && unit.gotoPath.length) && !preferExplore
            && _current_game.nearestHiddenLandTarget) {
            route = _current_game.nearestHiddenLandTarget(k);
            if (route && route.path && route.path.length) {
                _current_game.assignPath(k, route.path);
                mode = 'explore';
            }
        }
        if (!(unit.gotoPath && unit.gotoPath.length)
            && this.routeExcessMilitaryToStrategicResource(unit)) {
            mode = 'strategic_resource';
        }

        unit.automationMode = 'patrol';
        unit.state = 'patrol';
        unit.aiForceMission = mode || 'patrol_wait';
        if (unit.gotoCoord && _current_game.configureMovementIntent) {
            _current_game.configureMovementIntent(k, unit.gotoCoord);
        }
        return {
            mode: unit.aiForceMission,
            destination: unit.gotoCoord || unit.coord,
        };
    }

    routeExcessMilitaryToStrategicResource(unit)
    {
        if (!unit || unit.type != 2 || !unit.coord
            || typeof _resource_types == 'undefined' || typeof _current_game == 'undefined') return false;
        if (unit.guardResource) {
            var guardTarget = unit.guardResource;
            var guardDistance = Math.max(
                Math.abs(unit.coord.i-guardTarget.i), Math.abs(unit.coord.j-guardTarget.j)
            );
            if (guardDistance <= 1) {
                unit.state = 'fortified';
                unit.gotoPath = [];
                unit.gotoCoord = null;
                return true;
            }
            var guardIndex = _units.indexOf(unit);
            if (guardIndex < 0) return false;
            var guardPath = _current_game.buildPath(
                guardIndex, new Coord(guardTarget.i, guardTarget.j)
            );
            if (!guardPath.length) return false;
            _current_game.assignPath(guardIndex, guardPath);
            unit.state = 'ready';
            return true;
        }
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
        var processed = this.backgroundAiProcessedByTurn[expectedTurn] || 0;
        while (_server_game.serverTurn == expectedTurn
            && !_turn_in_progress && Date.now() + 1500 < _server_game.deadlineAt) {
            if (processed >= this.backgroundAiObjectLimit) break;
            // Every lease can come from a different 100x100 world sector.
            var batch = await _server_game.claimAiBatch(true);
            if (batch.turn != expectedTurn || !batch.unit_ids || !batch.unit_ids.length) break;
            if (batch.snapshot) snapshot = batch.snapshot;
            if (!snapshot) break;
            aiId = Number(batch.ai_player_id);
            this.hiddenAiUserId = aiId;
            var batchSubmission = {commands: [], actions: []};
            var submitChunk = async function() {
                if (!batchSubmission.commands.length && !batchSubmission.actions.length) return true;
                var response = await _server_game.submitAiBatch(batch, batchSubmission);
                batchSubmission = {commands: [], actions: []};
                return !response || response.accepted !== false;
            };
            for (var n=0; n < batch.unit_ids.length; n++) {
                if (_server_game.serverTurn != expectedTurn
                    || _turn_in_progress || Date.now() + 1500 >= _server_game.deadlineAt
                    || processed >= this.backgroundAiObjectLimit) break;
                processed++;
                this.backgroundAiProcessedByTurn[expectedTurn] = processed;
                var submission = await this.prepareAiUnitOrder(
                    aiId, snapshot, batch.unit_ids[n], _ai_player.lastStrategyMilitaryFocus
                );
                if (!submission) continue;
                Array.prototype.push.apply(batchSubmission.commands, submission.commands || []);
                Array.prototype.push.apply(batchSubmission.actions, submission.actions || []);
                if (batchSubmission.commands.length >= this.backgroundAiSubmitChunkSize
                    || Date.now() + 1500 >= _server_game.deadlineAt) {
                    if (!await submitChunk()) break;
                }
                // Yield between neural decisions so map rendering and input stay responsive.
                await new Promise(function(resolve) { setTimeout(resolve, 0); });
            }
            await submitChunk();
            batches++;
            await new Promise(function(resolve) { setTimeout(resolve, 0); });
        }
        return { batches: batches, objects: processed };
    }

    startBackgroundAiTurn(expectedTurn)
    {
        var aiId = this.hiddenAiUserId;
        if (aiId == null || typeof _ai_player == 'undefined') return Promise.resolve(null);
        if (this.backgroundAiPromise && this.backgroundAiTurn == expectedTurn) return this.backgroundAiPromise;
        if (this.backgroundAiTurn != expectedTurn) {
            this.backgroundAiProcessedByTurn = {};
            this.backgroundAiProcessedByTurn[expectedTurn] = 0;
        }
        this.backgroundAiTurn = expectedTurn;
        this.hiddenTurnRunning = true;
        var self = this;
        var promise = this.contributeAiBatches(expectedTurn)
            .catch(function(error) {
                _server_game.log('Shared AI contribution failed: ' + error.message);
                return null;
            })
            .finally(function() {
                self.hiddenTurnRunning = false;
                if (self.backgroundAiPromise === promise) self.backgroundAiPromise = null;
            });
        this.backgroundAiPromise = promise;
        return promise;
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
            button.textContent = vocabularyText('message.preparing_ai', {id: _current_user});
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
                button.textContent = vocabularyText('message.ai_not_ready', {id: _current_user});
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
                ? vocabularyText(_user_types[_current_user] == 'ai' ? 'turn.end_ai_user' : 'turn.end_user', {id: _current_user})
                : vocabularyText('hud.end_turn');
            if (typeof _server_game !== 'undefined' && _server_game.isAwaitingResolution(_current_user)) {
                label = vocabularyText('common.waiting');
                button.disabled = true;
            }
            button.textContent = vocabularyText('hud.turn_seconds', {
                action: label,
                seconds: Math.max(0, remainingSeconds == undefined ? 5 : remainingSeconds)
            });
        }
    }
}();

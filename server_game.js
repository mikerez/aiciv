var _server_game_secret = 'cbc6e026e751525dfcd0e42b9542e5d7817ef925c2d0830427817d0e5f0bd0ca';
var _client_turn_timeout_ms = 5000;
var _server_turn_grace_ms = 0;
var _client_update_poll_ms = 2000;

const _server_game = new class
{
    constructor()
    {
        this.endpoint = 'server_game.php';
        this.gameId = 'aiciv-default';
        this.serverTurn = 0;
        this.serverRevision = 0;
        this.unitRevisionByPlayer = {};
        this.landscapeRevisionByPlayer = {};
        this.eventIdByPlayer = {};
        this.civilizationsByPlayer = {};
        this.initialized = false;
        this.clientUnitSequence = 1;
        this.deadlineAt = null;
        this.timerId = null;
        this.timerMode = null;
        this.timerEndTurn = null;
        this.pollIds = {};
        this.syncedPlayers = {};
        this.awaitingTurnByPlayer = {};
        this.localGameStartedAt = Date.now();
        this.sessionEnded = false;
        this.controlledPlayers = [];
        this.hiddenActions = false;
        this.pendingHiddenActions = [];
        this.productionCompletionByCity = {};
        this.productionPauseUntilTurnByCity = {};
        this.healingRequestedTurnByPlayer = {};
        this.pendingTurnActionsByPlayer = {};
        this.nextTurnActionId = 1;
        this.lastRemainingSeconds = 5;
    }

    setEndTurnCallback(callback)
    {
        this.timerEndTurn = callback;
    }

    setHiddenActions(hidden)
    {
        this.hiddenActions = !!hidden;
    }

    trackHiddenAction(promise)
    {
        this.pendingHiddenActions.push(promise);
        return promise;
    }

    async waitForHiddenActions()
    {
        while (this.pendingHiddenActions.length) {
            var pending = this.pendingHiddenActions.splice(0);
            await Promise.allSettled(pending);
        }
    }

    copyDiagnosticParameters(body)
    {
        try {
            return JSON.parse(JSON.stringify(body || {}));
        }
        catch (error) {
            return { serialization_error: error.message || 'Request parameters could not be serialized.' };
        }
    }

    attachRequestErrorContext(error, action, body)
    {
        if (!error || error.clientReportContext) return error;
        error.clientReportContext = {
            sourceRequestType: action,
            requestParameters: this.copyDiagnosticParameters(body),
        };
        return error;
    }

    diagnosticCommand(error)
    {
        var context = error && error.clientReportContext ? error.clientReportContext : {};
        var parameters = context.requestParameters || {};
        var details = error && error.response && error.response.error
            ? (error.response.error.details || {}) : {};
        var command = null;
        if (Array.isArray(parameters.commands) && details.command_index != undefined) {
            command = parameters.commands[Number(details.command_index)] || null;
        }
        var unitId = details.unit_id;
        if (unitId == undefined && command) unitId = command.unit_id;
        if (unitId == undefined) {
            unitId = parameters.worker_unit_id != undefined ? parameters.worker_unit_id
                : parameters.settler_unit_id != undefined ? parameters.settler_unit_id
                : parameters.city_unit_id;
        }
        var unsuccessfulAction = command ? command.command : context.sourceRequestType;
        if (command && command.payload && command.payload.modifier) {
            unsuccessfulAction += ':' + command.payload.modifier;
        }
        else if (parameters.building_type) unsuccessfulAction += ':' + parameters.building_type;

        var destination = null;
        if (details.i != undefined && details.j != undefined) {
            destination = { i: Number(details.i), j: Number(details.j) };
        }
        else if (command && Array.isArray(command.path) && command.path.length) {
            var last = command.path[command.path.length - 1];
            destination = { i: Number(last.i), j: Number(last.j) };
        }
        else if (parameters.i != undefined && parameters.j != undefined) {
            destination = { i: Number(parameters.i), j: Number(parameters.j) };
        }
        else if (unitId != undefined && unitId != null && this.findUnitAnyOwner) {
            var found = this.findUnitAnyOwner(Number(unitId), null);
            if (found && found.unit && found.unit.coord) {
                destination = { i: Number(found.unit.coord.i), j: Number(found.unit.coord.j) };
            }
        }
        return {
            unitId: unitId == undefined || unitId == null ? null : Number(unitId),
            unsuccessfulAction: unsuccessfulAction || 'unknown',
            destination: destination,
        };
    }

    async reportClientError(error)
    {
        if (!error || error.clientErrorReported) return null;
        error.clientErrorReported = true;
        var context = error.clientReportContext || {};
        var command = this.diagnosticCommand(error);
        var responseError = error.response && error.response.error ? error.response.error : {};
        var report = {
            action: 'report_cli_error',
            secret: _server_game_secret,
            game_id: this.gameId,
            user_id: typeof _authenticated_player_id == 'undefined' ? undefined : _authenticated_player_id,
            player_id: context.requestParameters && context.requestParameters.player_id != undefined
                ? context.requestParameters.player_id
                : (typeof _current_user == 'undefined' ? null : _current_user),
            source_request_type: context.sourceRequestType || 'unknown',
            request_parameters: context.requestParameters || {},
            error_message: error.message || String(error),
            error_code: error.code || responseError.code || '',
            error_stack: error.stack || '',
            response_error: responseError,
            unit_id: command.unitId,
            unsuccessful_action: command.unsuccessfulAction,
            destination_point: command.destination,
            client: {
                reported_at: new Date().toISOString(),
                page_url: typeof location == 'undefined' ? '' : location.href,
                user_agent: typeof navigator == 'undefined' ? '' : navigator.userAgent,
                server_turn: this.serverTurn,
                server_revision: this.serverRevision,
            },
        };
        var controller = typeof AbortController == 'undefined' ? null : new AbortController();
        var timeout = controller ? setTimeout(function() { controller.abort(); }, 4000) : null;
        try {
            var response = await fetch(this.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(report),
                cache: 'no-store',
                signal: controller ? controller.signal : undefined,
            });
            var result = await response.json();
            if (response.ok && result.ok) error.clientReportNumber = result.report_number;
            return result;
        }
        catch (reportError) {
            if (typeof console != 'undefined' && console.warn) {
                console.warn('Client error report could not be sent:', reportError.message);
            }
            return null;
        }
        finally {
            if (timeout) clearTimeout(timeout);
        }
    }

    async request(action, body)
    {
        var requestBody = body || {};
        var payload = Object.assign({
            action: action,
            secret: _server_game_secret,
            game_id: this.gameId,
            user_id: typeof _authenticated_player_id == 'undefined' ? undefined : _authenticated_player_id,
        }, requestBody);
        try {
            var response = await fetch(this.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(payload),
                cache: 'no-store',
            });
            var responseText = await response.text();
            var result;
            try {
                result = JSON.parse(responseText);
            }
            catch (parseError) {
                throw new Error('Server returned HTTP ' + response.status + ': ' + responseText.substring(0, 500));
            }
            if (!response.ok || !result.ok) {
                var responseCode = result.error ? result.error.code : 'request_failed';
                if (response.status === 401 && (responseCode === 'session_replaced'
                    || responseCode === 'session_expired' || responseCode === 'invalid_session'
                    || responseCode === 'authentication_required' || responseCode === 'account_unavailable')) {
                    this.endBrowserSession(responseCode);
                }
                var requestError = new Error(result.error ? result.error.message : 'Server game request failed');
                requestError.code = responseCode;
                requestError.response = result;
                throw requestError;
            }
            this.updateServerClock(result);
            return result;
        }
        catch (error) {
            this.attachRequestErrorContext(error, action, requestBody);
            await this.reportClientError(error);
            throw error;
        }
    }

    endBrowserSession(reason)
    {
        if (this.sessionEnded) return;
        this.sessionEnded = true;
        this.stopTurnTimer(true);
        Object.keys(this.pollIds).forEach(function(playerId) {
            clearTimeout(this.pollIds[playerId]);
        }, this);
        this.pollIds = {};
        document.cookie = 'aiciv_player_id=; Path=/game/; Max-Age=0; SameSite=Lax; Secure';
        var loginUrl = reason === 'logout'
            ? 'login.html'
            : 'login.html?error=' + encodeURIComponent(reason || 'invalid_session');
        window.location.replace(loginUrl);
    }

    async logout(button)
    {
        if (this.sessionEnded) return;
        if (button) {
            button.disabled = true;
            button.textContent = 'Logging Out...';
        }
        try {
            var response = await fetch('api.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ action: 'logout', secret: _server_game_secret }),
                cache: 'no-store',
            });
            var result = await response.json();
            if (response.status === 401) {
                this.endBrowserSession('logout');
                return;
            }
            if (!response.ok || !result.ok) {
                throw new Error(result.error ? result.error.message : 'Logout failed');
            }
            this.endBrowserSession('logout');
        }
        catch (error) {
            if (button) {
                button.disabled = false;
                button.textContent = 'Log Out';
            }
            this.log('Logout failed: ' + error.message);
        }
    }

    updateServerClock(result)
    {
        if (result.map_size != undefined && result.map_size != _map_size) {
            throw new Error('Server map size ' + result.map_size + ' does not match client map size ' + _map_size);
        }
        if (result.turn != undefined) this.serverTurn = result.turn;
        if (result.revision != undefined) this.serverRevision = Math.max(this.serverRevision, result.revision);
        if (result.turn_seconds_remaining != undefined && isFinite(Number(result.turn_seconds_remaining))) {
            var remainingMs = Math.max(0, Math.min(
                _client_turn_timeout_ms,
                Number(result.turn_seconds_remaining) * 1000
            ));
            this.deadlineAt = Date.now() + remainingMs;
        }
        else if (result.deadline_at) {
            var parsedDeadline = new Date(result.deadline_at).getTime() - _server_turn_grace_ms;
            var fallbackMs = isFinite(parsedDeadline)
                ? parsedDeadline - Date.now()
                : _client_turn_timeout_ms;
            this.deadlineAt = Date.now() + Math.max(0, Math.min(_client_turn_timeout_ms, fallbackMs));
        }
    }

    ensureClientKey(unit, ownerId)
    {
        if (!unit.serverClientKey) {
            unit.serverClientKey = 'u' + ownerId + '-' + Date.now().toString(36) + '-' + this.clientUnitSequence++;
        }
        return unit.serverClientKey;
    }

    clientRouteStorageKey(playerId)
    {
        return 'aiciv.client_routes.' + this.gameId + '.' + playerId;
    }

    loadClientRoutes(playerId)
    {
        if (typeof localStorage == 'undefined') return [];
        try {
            var routes = JSON.parse(localStorage.getItem(this.clientRouteStorageKey(playerId)) || '[]');
            return Array.isArray(routes) ? routes : [];
        }
        catch (error) {
            return [];
        }
    }

    storedClientRoute(playerId, unit)
    {
        var routes = this.loadClientRoutes(playerId);
        for (var n=0; n < routes.length; n++) {
            if ((unit.serverId && routes[n].server_id == unit.serverId)
                || (unit.serverClientKey && routes[n].client_key == unit.serverClientKey)) {
                return routes[n];
            }
        }
        return null;
    }

    saveClientRoutes(playerId)
    {
        if (typeof localStorage == 'undefined' || typeof _units_by_user == 'undefined') return;
        var list = _units_by_user[playerId] || [];
        var routes = [];
        for (var n=0; n < list.length; n++) {
            var unit = list[n];
            if (!unit.gotoPath || !unit.gotoPath.length) continue;
            routes.push({
                server_id: unit.serverId || null,
                client_key: unit.serverClientKey || null,
                origin: unit.coord ? { i: unit.coord.i, j: unit.coord.j } : null,
                path: unit.gotoPath.map(function(point) { return { i: point.i, j: point.j }; }),
                destination: unit.gotoCoord
                    ? { i: unit.gotoCoord.i, j: unit.gotoCoord.j }
                    : { i: unit.gotoPath[unit.gotoPath.length - 1].i, j: unit.gotoPath[unit.gotoPath.length - 1].j },
            });
        }
        try {
            if (routes.length) localStorage.setItem(this.clientRouteStorageKey(playerId), JSON.stringify(routes));
            else localStorage.removeItem(this.clientRouteStorageKey(playerId));
        }
        catch (error) {
        }
    }

    serializableProperties(unit)
    {
        var excluded = {
            coord: true, serverId: true, serverClientKey: true, team: true, type: true, unitTypeId: true,
            name: true, texture: true, can_move: true, nature: true, attack: true, defense: true, speed: true,
            viewRange: true, state: true, health: true, maxHealth: true, experience: true, move_penalty: true,
            gotoPath: true, gotoCoord: true, pendingServerPath: true, pendingImmediateBuild: true,
        };
        var result = {};
        for (var key in unit) {
            if (excluded[key] || typeof unit[key] == 'function') continue;
            try {
                result[key] = JSON.parse(JSON.stringify(unit[key]));
            }
            catch (error) {
            }
        }
        return result;
    }

    serializeUnit(unit, ownerId)
    {
        return {
            client_key: this.ensureClientKey(unit, ownerId),
            owner_id: ownerId,
            unit_type_id: unit.unitTypeId || 'unknown',
            unit_class: unit.type == undefined ? 0 : unit.type,
            name: unit.name || '',
            texture: unit.texture || 0,
            can_move: unit.can_move !== false,
            nature: unit.nature || 'land',
            i: unit.coord.i,
            j: unit.coord.j,
            attack: unit.attack || 0,
            defense: unit.defense || 0,
            speed: unit.speed == undefined ? 1 : unit.speed,
            view_range: unit.viewRange == undefined ? 2 : unit.viewRange,
            state: unit.state || 'ready',
            health: unit.health == undefined ? 100 : unit.health,
            max_health: unit.maxHealth == undefined ? 100 : unit.maxHealth,
            experience: unit.experience == undefined ? 1 : unit.experience,
            move_penalty: unit.move_penalty || 0,
            properties: this.serializableProperties(unit),
        };
    }

    captureTurn(playerId)
    {
        var list = _units_by_user[playerId] || [];
        if (_units === list && typeof _city_economy != 'undefined') {
            _city_economy.processCities(this.serverTurn);
        }
        // Registered clients do not run local turn rules before submission. Renew
        // persistent automatic routes while this player's unit list is active.
        if (_units === list && typeof _current_game != 'undefined' && _current_game.applyAutoRoutingRules) {
            _current_game.applyAutoRoutingRules();
        }
        var commands = [];
        for (var k=0; k < list.length; k++) {
            var unit = list[k];
            var command = {
                unit_id: unit.serverId || undefined,
                client_key: this.ensureClientKey(unit, playerId),
                command: 'hold',
                path: [],
                payload: {},
            };
            var route = unit.gotoPath;
            var movementLimit = Math.max(0, Math.floor(Number(unit.speed) || 0));
            if (unit.can_move && movementLimit > 0 && route && route.length) {
                command.command = 'move';
                command.path = route.slice(0, movementLimit).map(function(point) {
                    return { i: point.i, j: point.j };
                });
                command.payload.client_path_source = 'client_goto_path';
                if (unit.attackTargetOwnerId != undefined && unit.attackTargetOwnerId != null) {
                    command.payload.attack_owner_id = unit.attackTargetOwnerId;
                    unit.attackTargetOwnerId = null;
                }
            }
            else if (unit.pendingImmediateBuild) {
                command.command = 'hold';
            }
            else if (unit.state && unit.state != 'ready') {
                var completedModifier = this.activeWorkerModifier(unit);
                if (completedModifier) {
                    command.command = 'build';
                    command.payload = { modifier: completedModifier };
                }
                else {
                    command.command = 'set_state';
                    command.payload = { state: unit.state };
                }
            }
            if (unit.type == 3) {
                command.payload.city_food_stored = unit.economy
                    ? Math.max(0, Number(unit.economy.foodStored) || 0)
                    : Math.max(0, Number(unit.cityFoodStored) || 0);
            }
            commands.push(command);
        }
        this.queueCityHealing(playerId);
        this.saveClientRoutes(playerId);
        return {
            playerId: playerId,
            turn: this.serverTurn,
            commands: commands,
            actions: this.drainTurnActions(playerId),
            playerState: typeof _game_state_by_user != 'undefined' && _game_state_by_user[playerId]
                ? JSON.parse(JSON.stringify(_game_state_by_user[playerId])) : {},
            // Production clients never bootstrap terrain or units. PHP owns both.
            bootstrap: null,
        };
    }

    queueCityHealing(playerId)
    {
        if (this.healingRequestedTurnByPlayer[playerId] === this.serverTurn) return;
        this.healingRequestedTurnByPlayer[playerId] = this.serverTurn;
        var requests = this.cityHealingRequests(playerId);
        for (var n=0; n < requests.length; n++) {
            this.queueTurnAction(playerId, 'heal_units', requests[n], 'heal:' + requests[n].city_unit_id);
        }
    }

    cityHealingRequests(playerId)
    {
        var list = _units_by_user[playerId] || [];
        var requests = [];
        for (var cityIndex=0; cityIndex < list.length; cityIndex++) {
            var city = list[cityIndex];
            if (city.type != 3 || !city.serverId || !city.coord || Number(city.health) <= 0) continue;
            var unitIds = [];
            for (var unitIndex=0; unitIndex < list.length; unitIndex++) {
                var unit = list[unitIndex];
                if (!unit.serverId || !unit.can_move || unit.type == 3 || !unit.coord) continue;
                var health = unit.health == undefined ? 100 : Number(unit.health);
                var maximum = unit.maxHealth == undefined ? 100 : Number(unit.maxHealth);
                if (health <= 0 || health >= maximum) continue;
                if (unit.coord.i == city.coord.i && unit.coord.j == city.coord.j) unitIds.push(unit.serverId);
            }
            if (!unitIds.length) continue;
            requests.push({
                player_id: playerId,
                city_unit_id: city.serverId,
                unit_ids: unitIds,
            });
        }
        return requests;
    }

    queueTurnAction(playerId, type, payload, replaceKey)
    {
        if (!this.pendingTurnActionsByPlayer[playerId]) this.pendingTurnActionsByPlayer[playerId] = [];
        var actions = this.pendingTurnActionsByPlayer[playerId];
        if (replaceKey) {
            for (var n=actions.length - 1; n >= 0; n--) {
                if (actions[n].replace_key === replaceKey) actions.splice(n, 1);
            }
        }
        var action = Object.assign({
            client_action_id: this.nextTurnActionId++,
            type: type,
        }, payload || {});
        if (replaceKey) action.replace_key = replaceKey;
        actions.push(action);
        return action;
    }

    drainTurnActions(playerId)
    {
        var actions = this.pendingTurnActionsByPlayer[playerId] || [];
        this.pendingTurnActionsByPlayer[playerId] = [];
        return actions;
    }

    activeWorkerModifier(unit)
    {
        if (unit.unitTypeId != 'worker') return null;
        if (unit.state == 'road') return 'road';
        if (unit.state == 'irrigate') return 'irrigation';
        if (unit.state == 'chop_forest') return 'chop_forest';
        if (['fortification', 'pasture', 'farm', 'plantation', 'camp', 'fishing_boats',
            'quarry', 'winery', 'cottage', 'workshop', 'mine'].indexOf(unit.state) != -1) return unit.state;
        return null;
    }

    applyUnitIdMap(mapping)
    {
        if (!mapping) return;
        for (var userId in _units_by_user) {
            var list = _units_by_user[userId] || [];
            for (var k=0; k < list.length; k++) {
                if (mapping[list[k].serverClientKey] != undefined) {
                    list[k].serverId = mapping[list[k].serverClientKey];
                }
            }
        }
    }

    async showServerErrorPopup(error)
    {
        await this.reportClientError(error);
        var responseError = error && error.response && error.response.error
            ? error.response.error : null;
        var details = responseError && responseError.details ? responseError.details : {};
        var lines = [responseError ? responseError.message : (error.message || 'Server request failed.')];
        if (details.unit_id != undefined && details.unit_id != null) lines.push('Unit ID: ' + details.unit_id);
        if (details.reason) lines.push('Reason: ' + String(details.reason).replaceAll('_', ' '));
        if (details.speed_limit != undefined && details.steps != undefined) {
            lines.push('Requested steps: ' + details.steps + ', allowed: ' + details.speed_limit);
        }
        if (details.validation && details.validation.stopped && details.validation.stopped.reason) {
            lines.push('Path error: ' + String(details.validation.stopped.reason).replaceAll('_', ' '));
        }
        if (error && error.clientReportNumber) lines.push('Client report: #' + error.clientReportNumber);
        if (typeof window != 'undefined' && typeof window.alert == 'function') window.alert(lines.join('\n'));
    }

    applyRejectedMovements(playerId, rejected)
    {
        rejected = Array.isArray(rejected) ? rejected : [];
        var changed = false;
        var needsFullSync = false;
        for (var n=0; n < rejected.length; n++) {
            var rejection = rejected[n] || {};
            var unitId = rejection.unit_id;
            if (unitId != undefined && unitId != null) {
                changed = this.cancelClientRouteForCombat(playerId, unitId) || changed;
            }
            if (rejection.reason == 'owned_unit_not_found') needsFullSync = true;
            this.log('Movement rejected for unit ' + (unitId == undefined ? '?' : unitId)
                + ': ' + String(rejection.reason || 'invalid movement').replaceAll('_', ' '));
        }
        if (needsFullSync) this.unitRevisionByPlayer[playerId] = 0;
        if (changed) this.saveClientRoutes(playerId);
        return rejected.length > 0;
    }

    clearRejectedWorkerBuild(playerId, unitId)
    {
        var found = this.findUnit(playerId, unitId, null);
        if (!found) return false;
        found.unit.state = 'ready';
        found.unit.pendingImmediateBuild = false;
        delete found.unit.road_turns_left;
        delete found.unit.irrigation_turns_left;
        delete found.unit.building_turns_left;
        return true;
    }

    isTerminalBuildError(error)
    {
        return !!(error && ['tile_already_built', 'building_not_supported', 'invalid_building_type',
            'worker_not_found', 'tile_not_found'].indexOf(error.code) != -1);
    }

    async submitTurn(submission, options)
    {
        options = Object.assign({ hidden: false, deferUpdates: false, deferPolling: false }, options || {});
        if (!options.hidden) {
            this.awaitingTurnByPlayer[submission.playerId] = submission.turn;
            this.startAwaitingCountdown(submission.playerId);
            this.updateWaitingUi(submission.playerId);
        }
        await this.waitForHiddenActions();
        var body = {
            player_id: submission.playerId,
            turn: submission.turn,
            commands: submission.commands,
            actions: submission.actions || [],
            player_state: submission.playerState,
            since_unit_revision: this.unitRevisionByPlayer[submission.playerId] || 0,
            since_landscape_revision: this.landscapeRevisionByPlayer[submission.playerId] || 0,
            since_event_id: this.eventIdByPlayer[submission.playerId] || 0,
            include_updates: true,
        };
        if (submission.bootstrap) body.bootstrap = submission.bootstrap;
        try {
            var result = await this.request('make_turn', body);
            this.initialized = true;
            this.applyUnitIdMap(result.unit_id_map);
            this.applyRejectedMovements(submission.playerId, result.rejected_movements || []);
            this.applyCombatUnitUpdates(result.combat_units || [], false);
            this.applyTurnActionResults(submission.playerId, submission.actions || [], result.action_results || []);
            if (!options.hidden) this.awaitingTurnByPlayer[submission.playerId] = result.submitted_turn;
            if (result.updates) await this.applyCombinedUpdates(submission.playerId, result.updates, options);
            if (!options.deferUpdates && !result.updates) {
                await this.loadUpdates(submission.playerId, { hidden: options.hidden });
            }
            if (result.resolved_turn == null && !options.hidden && !options.deferPolling) {
                this.pollForResolution(submission.playerId, result.submitted_turn);
            }
            else if (result.resolved_turn != null && !options.hidden) {
                this.finishAwaitingTurn(submission.playerId, result.turn);
            }
            return result;
        }
        catch (error) {
            if (error && error.code == 'atomic_movement_rejected') {
                var details = error.response && error.response.error ? error.response.error.details : null;
                this.applyRejectedMovements(submission.playerId, details ? [details] : []);
                this.unitRevisionByPlayer[submission.playerId] = 0;
                try {
                    await this.loadUpdates(submission.playerId, { hidden: options.hidden });
                }
                catch (syncError) {
                    this.log('Movement rejection resync failed: ' + syncError.message);
                }
            }
            if (!options.hidden) {
                delete this.awaitingTurnByPlayer[submission.playerId];
                this.stopAwaitingCountdown();
                await this.showServerErrorPopup(error);
            }
            this.log('Server turn failed: ' + error.message);
            throw error;
        }
    }

    applyTurnActionResults(playerId, submittedActions, results)
    {
        var byId = {};
        for (var n=0; n < submittedActions.length; n++) {
            byId[String(submittedActions[n].client_action_id)] = submittedActions[n];
        }
        for (var resultIndex=0; resultIndex < results.length; resultIndex++) {
            var result = results[resultIndex] || {};
            var action = byId[String(result.client_action_id)] || {};
            var unitId = action.worker_unit_id || action.settler_unit_id || action.city_unit_id;
            var found = unitId ? this.findUnit(playerId, Number(unitId), null) : null;
            if (action.type == 'build' && found) {
                found.unit.pendingImmediateBuild = false;
                if (result.ok) found.unit.state = 'ready';
            }
            if (action.type == 'build_city' && found) found.unit.serverActionPending = false;
            if (action.type == 'grow_city' && found) {
                found.unit.growthPending = false;
                if (!result.ok && found.unit.economy) {
                    found.unit.economy.foodStored += Math.max(0, Number(action.food_stored) || 0);
                    found.unit.cityFoodStored = found.unit.economy.foodStored;
                }
            }
            if (result.ok) continue;
            if (action.type == 'build' && found) this.clearRejectedWorkerBuild(playerId, Number(unitId));
            if (action.type == 'build') this.landscapeRevisionByPlayer[playerId] = 0;
            if (action.type == 'select_production' || action.type == 'remove_production') {
                this.unitRevisionByPlayer[playerId] = 0;
            }
            var error = result.error || {};
            this.log('Batched ' + (action.type || result.type || 'action') + ' rejected: '
                + (error.message || error.code || 'unknown error'));
        }
    }

    buildImprovement(worker, modifier)
    {
        if (!worker || !worker.serverId) return Promise.reject(new Error('Worker has no authoritative server id'));
        worker.pendingImmediateBuild = true;
        this.queueTurnAction(worker.team, 'build', {
            worker_unit_id: worker.serverId,
            building_type: modifier,
        }, 'build:' + worker.serverId);
        return Promise.resolve({ queued: true });
    }

    growCity(city, foodStored)
    {
        if (!city || !city.serverId) return Promise.reject(new Error('City has no authoritative server id'));
        this.queueTurnAction(city.team, 'grow_city', {
            city_unit_id: city.serverId,
            food_stored: foodStored,
        }, 'grow:' + city.serverId);
        return Promise.resolve({ queued: true });
    }

    buildCity(settler)
    {
        if (!settler || !settler.serverId) return Promise.reject(new Error('Settler has no authoritative server id'));
        this.queueTurnAction(settler.team, 'build_city', {
            settler_unit_id: settler.serverId,
        }, 'build_city:' + settler.serverId);
        return Promise.resolve({ queued: true });
    }

    selectProduction(city, unitTypeId)
    {
        if (!city || !city.serverId) return Promise.reject(new Error('City has no authoritative server id'));
        this.queueTurnAction(city.team, 'select_production', {
            city_unit_id: city.serverId,
            unit_type_id: unitTypeId == null || unitTypeId == 'none' ? null : unitTypeId,
        });
        return Promise.resolve({ queued: true });
    }

    removeProduction(city, queueIndex)
    {
        if (!city || !city.serverId) return Promise.reject(new Error('City has no authoritative server id'));
        this.queueTurnAction(city.team, 'remove_production', {
            city_unit_id: city.serverId,
            queue_index: queueIndex,
        });
        return Promise.resolve({ queued: true });
    }

    pollForResolution(playerId, submittedTurn)
    {
        if (this.pollIds[playerId]) clearTimeout(this.pollIds[playerId]);
        var self = this;
        var poll = async function() {
            try {
                var result = await self.loadUpdates(playerId);
                if (result && result.turn > submittedTurn) return;
            }
            catch (error) {
                self.log('Server update poll failed: ' + error.message);
            }
            self.pollIds[playerId] = setTimeout(poll, _client_update_poll_ms);
        };
        this.pollIds[playerId] = setTimeout(poll, _client_update_poll_ms);
    }

    async loadUpdates(playerId, options)
    {
        options = Object.assign({ hidden: this.hiddenActions }, options || {});
        var unitSince = this.unitRevisionByPlayer[playerId] || 0;
        var landscapeSince = this.landscapeRevisionByPlayer[playerId] || 0;
        var result = await this.request('load_update', {
            player_id: playerId,
            since_unit_revision: unitSince,
            since_landscape_revision: landscapeSince,
            since_event_id: this.eventIdByPlayer[playerId] || 0,
            complete_ready_productions: true,
        });
        await this.applyCombinedUpdates(playerId, result, options);
        return result;
    }

    async applyCombinedUpdates(playerId, result, options)
    {
        options = Object.assign({ hidden: this.hiddenActions }, options || {});
        await this.applyEventUpdates(playerId, {
            events: result.events || [],
            civilizations: result.civilizations || [],
        }, options);
        this.eventIdByPlayer[playerId] = result.last_event_id || this.eventIdByPlayer[playerId] || 0;
        // Combat events were animated above while defeated units still existed locally.
        this.applyUnitUpdates(playerId, Object.assign({}, result, { events: [] }));
        this.unitRevisionByPlayer[playerId] = result.revision;
        this.finishAwaitingTurn(playerId, result.turn);
        this.applyLandscapeUpdates(playerId, result.tiles || []);
        this.landscapeRevisionByPlayer[playerId] = result.revision;
        if (!options.hidden) {
            if (typeof _game != 'undefined' && _game.redrawControlZones) {
                _game.redrawControlZones();
            }
            _fulldraw = 1;
        }
        return result;
    }

    isAwaitingResolution(playerId)
    {
        return this.awaitingTurnByPlayer[playerId] != undefined;
    }

    finishAwaitingTurn(playerId, authoritativeTurn)
    {
        var submittedTurn = this.awaitingTurnByPlayer[playerId];
        if (submittedTurn == undefined || authoritativeTurn <= submittedTurn) return false;
        delete this.awaitingTurnByPlayer[playerId];
        // The waiting countdown and playable-turn countdown share timerId. Stop
        // the old owner before exposing the resolved turn, otherwise it can render
        // the deleted pending turn as NaN and expire without starting a new turn.
        this.stopAwaitingCountdown();
        if (this.pollIds[playerId]) {
            clearTimeout(this.pollIds[playerId]);
            delete this.pollIds[playerId];
        }
        if (typeof _current_user != 'undefined' && _current_user == playerId) {
            var button = document.getElementById('endTurnButton');
            if (button) button.disabled = false;
            if (typeof _multiplayer != 'undefined') _multiplayer.updateTurnLabel();
            if (typeof _turn_in_progress == 'undefined' || !_turn_in_progress) {
                this.startTurnTimer(playerId, false);
            }
            if (typeof _multiplayer != 'undefined' && _multiplayer.startBackgroundAiTurn) {
                _multiplayer.startBackgroundAiTurn(authoritativeTurn);
            }
        }
        return true;
    }

    stopAwaitingCountdown()
    {
        if (this.timerMode != 'waiting') return;
        if (this.timerId) clearInterval(this.timerId);
        this.timerId = null;
        this.timerMode = null;
        this.deadlineAt = null;
    }

    updateWaitingUi(playerId)
    {
        if (typeof _current_user != 'undefined' && _current_user != playerId) return;
        if (!this.isAwaitingResolution(playerId)) return;
        var button = document.getElementById('endTurnButton');
        if (button) {
            button.disabled = true;
            button.textContent = 'Waiting (' + this.lastRemainingSeconds + 's)';
        }
    }

    startAwaitingCountdown(playerId)
    {
        this.stopTurnTimer(false);
        this.deadlineAt = Date.now() + _client_turn_timeout_ms;
        this.timerMode = 'waiting';
        var self = this;
        var update = function() {
            var remaining = Math.max(0, Math.ceil((self.deadlineAt - Date.now()) / 1000));
            self.lastRemainingSeconds = remaining;
            self.updateWaitingUi(playerId);
            if (remaining <= 0) {
                clearInterval(self.timerId);
                self.timerId = null;
                self.timerMode = null;
            }
        };
        update();
        this.timerId = setInterval(update, 250);
        this.updateWaitingUi(playerId);
    }

    async initializePlayer(playerId)
    {
        var result = await this.loadFullPlayer(playerId, true);
        this.controlledPlayers = result.controlled_players || [];
        if (typeof _multiplayer != 'undefined' && _multiplayer.configureControlledPlayers) {
            _multiplayer.configureControlledPlayers(this.controlledPlayers);
        }
        this.initialized = true;
        if (typeof _multiplayer != 'undefined') {
            _multiplayer.setCurrentUser(playerId, false);
            _multiplayer.centerActiveUserView();
            _multiplayer.updateTurnLabel();
            if (_multiplayer.startBackgroundAiTurn) {
                _multiplayer.startBackgroundAiTurn(this.serverTurn);
            }
        }
        if (typeof _birdsview != 'undefined' && _birdsview.build) _birdsview.build();
        _fulldraw = 1;
        return result;
    }

    async loadFullPlayer(playerId, includeMap)
    {
        var result = await this.fetchFullPlayer(playerId, includeMap);
        this.applyFullSnapshot(playerId, result);
        return result;
    }

    async fetchFullPlayer(playerId, includeMap)
    {
        return await this.request('load_full', {
            player_id: playerId,
            include_map: includeMap !== false,
        });
    }

    applyFullSnapshot(playerId, result, options)
    {
        options = Object.assign({
            pruneForeignUnits: true,
            preserveExistingForeignUnits: false,
        }, options || {});
        // Reconcile into the live collections. Replacing the whole object makes
        // render callbacks briefly observe an empty world during full/AI sync.
        if (_units_by_user[playerId] == undefined) _units_by_user[playerId] = [];
        _units = _units_by_user[playerId];
        this.syncedPlayers[playerId] = true;
        _map_terrain_bit_by_user[playerId] = _multiplayer.cloneVisibilityFrom(_map_terrain_bit);
        _multiplayer.clearVisibility(_map_terrain_bit_by_user[playerId], false);
        _map_resource_visibility_by_user[playerId] = _multiplayer.createResourceVisibility();
        this.applyUnitUpdates(playerId, Object.assign({}, result, { events: [] }), options);
        this.applyLandscapeUpdates(playerId, result.tiles || []);
        this.unitRevisionByPlayer[playerId] = result.revision || 0;
        this.landscapeRevisionByPlayer[playerId] = result.revision || 0;
        this.eventIdByPlayer[playerId] = result.last_event_id || 0;
        if (!this.hiddenActions) this.updateCivilizations(playerId, result.civilizations || []);
    }

    async applyEventUpdates(playerId, result, options)
    {
        options = Object.assign({ hidden: false }, options || {});
        if (!options.hidden) this.updateCivilizations(playerId, result.civilizations || []);
        var events = result.events || [];
        for (var index=0; index < events.length; index++) {
            var event = events[index];
            var attackerBefore = event.payload ? event.payload.attacker_before : null;
            if (attackerBefore && attackerBefore.owner_id == playerId
                && (event.payload.combat_kind == 'unit_attack'
                    || event.payload.combat_kind == 'city_attack'
                    || event.payload.combat_kind == 'city_capture')) {
                this.cancelClientRouteForCombat(playerId, event.unit_id);
            }
            if (!options.hidden) this.log(event.message);
            if (!options.hidden && typeof _game_state_by_user != 'undefined' && _game_state_by_user[playerId]) {
                _game_state_by_user[playerId].oneTurnMessage = event.message;
            }
            if (!options.hidden && event.payload && (event.payload.combat_kind == 'unit_attack'
                || event.payload.combat_kind == 'city_attack'
                || event.payload.combat_kind == 'city_capture')
                && typeof _game_events != 'undefined' && _game_events.playCombat) {
                await _game_events.playCombat(event);
            }
            if (event.payload) {
                this.applyCombatUnitUpdates([
                    event.payload.attacker_after,
                    event.payload.defender_after,
                ], true);
            }
        }
    }

    applyCombatUnitUpdates(snapshots, removeDestroyed)
    {
        snapshots = snapshots || [];
        var changed = false;
        for (var index=0; index < snapshots.length; index++) {
            var snapshot = snapshots[index];
            if (!snapshot || !snapshot.id) continue;
            var found = this.findUnitAnyOwner(snapshot.id, null);
            if (!found) continue;
            var unit = found.unit;
            if (snapshot.health != undefined) unit.health = Number(snapshot.health);
            if (snapshot.max_health != undefined) unit.maxHealth = Number(snapshot.max_health);
            if (snapshot.experience != undefined) unit.experience = Number(snapshot.experience);
            if (snapshot.i != undefined && snapshot.j != undefined) {
                unit.coord = new Coord(Number(snapshot.i), Number(snapshot.j));
            }
            changed = true;
            if (removeDestroyed && (snapshot.deleted || Number(snapshot.health) <= 0)) {
                if (typeof _military != 'undefined' && _military.updateSelectionAfterRemove) {
                    _military.updateSelectionAfterRemove(found.list, unit.team, found.index);
                }
                found.list.splice(found.index, 1);
            }
        }
        if (changed && typeof _fulldraw != 'undefined') _fulldraw = 1;
        return changed;
    }

    cancelClientRouteForCombat(playerId, serverId)
    {
        var found = this.findUnit(playerId, serverId, null);
        if (!found) return false;
        found.unit.gotoPath = [];
        found.unit.gotoCoord = null;
        found.unit.pendingServerPath = [];
        this.saveClientRoutes(playerId);
        return true;
    }

    updateCivilizations(playerId, civilizations)
    {
        this.civilizationsByPlayer[playerId] = civilizations;
        if (typeof _military != 'undefined') {
            for (var n=0; n < civilizations.length; n++) {
                var otherId = parseInt(civilizations[n].player_id, 10);
                if (otherId == playerId) continue;
                if (String(civilizations[n].relation).toLowerCase() == 'war') {
                    _military.setWar(playerId, otherId);
                }
                else if (_military.setNeutral) {
                    _military.setNeutral(playerId, otherId);
                }
            }
        }
        if (typeof _civilizations_menu != 'undefined' && _civilizations_menu.update) {
            _civilizations_menu.update(civilizations, playerId);
        }
    }

    findUnit(ownerId, serverId, clientKey)
    {
        var list = _units_by_user[ownerId] || [];
        for (var k=0; k < list.length; k++) {
            if ((serverId && list[k].serverId == serverId) || (clientKey && list[k].serverClientKey == clientKey)) {
                return { list: list, index: k, unit: list[k] };
            }
        }
        return null;
    }

    findUnitAnyOwner(serverId, clientKey)
    {
        for (var ownerId in _units_by_user) {
            var found = this.findUnit(ownerId, serverId, clientKey);
            if (found) return found;
        }
        return null;
    }

    setUnitVisibilityForViewer(unit, viewerId, visible)
    {
        if (!unit) return;
        if (!unit.serverVisibilityByUser) unit.serverVisibilityByUser = {};
        unit.serverVisibilityByUser[viewerId] = !!visible;
    }

    applyUnitUpdates(viewerId, result, options)
    {
        options = Object.assign({
            pruneForeignUnits: true,
            preserveExistingForeignUnits: false,
        }, options || {});
        if (result.player_state && typeof _game_state_by_user != 'undefined') {
            if (!_game_state_by_user[viewerId]) _game_state_by_user[viewerId] = new GameState();
            Object.assign(_game_state_by_user[viewerId], result.player_state);
            _game_state_by_user[viewerId].grantAllTechnologies();
            if (_current_user == viewerId) _game_state = _game_state_by_user[viewerId];
        }
        var updates = result.units || [];
        if (!this.syncedPlayers[viewerId]) {
            // Add authoritative records first; stale bootstrap records are pruned
            // below without exposing an empty collection to the renderer.
            this.syncedPlayers[viewerId] = true;
        }
        for (var n=0; n < updates.length; n++) {
            var update = updates[n];
            if (_units_by_user[update.owner_id] == undefined) _units_by_user[update.owner_id] = [];
            var found = this.findUnit(update.owner_id, update.id, update.client_key)
                || this.findUnitAnyOwner(update.id, update.client_key);
            if (update.owner_id != viewerId && found) {
                this.setUnitVisibilityForViewer(found.unit, viewerId, true);
            }
            if (update.owner_id != viewerId && options.preserveExistingForeignUnits
                && found && found.list === _units_by_user[update.owner_id]) {
                continue;
            }
            if (update.deleted) {
                if (found) found.list.splice(found.index, 1);
                continue;
            }
            if (found && found.list !== _units_by_user[update.owner_id]) {
                var transferredUnit = found.unit;
                var destinationList = _units_by_user[update.owner_id];
                // Add before removing so ownership transfer never leaves the
                // object absent from all renderable collections.
                destinationList.push(transferredUnit);
                if (typeof _military != 'undefined' && _military.updateSelectionAfterRemove) {
                    _military.updateSelectionAfterRemove(found.list, transferredUnit.team, found.index);
                }
                found.list.splice(found.index, 1);
                found = {
                    list: destinationList,
                    index: destinationList.length - 1,
                    unit: transferredUnit,
                };
            }
            var unit = found ? found.unit : new Unit(update.unit_class, update.texture, new Coord(update.i, update.j));
            if (!found) _units_by_user[update.owner_id].push(unit);
            if (update.owner_id != viewerId) this.setUnitVisibilityForViewer(unit, viewerId, true);
            var ownUnit = update.owner_id == viewerId;
            var storedRoute = ownUnit ? this.storedClientRoute(viewerId, unit) : null;
            var localGotoPath = ownUnit && unit.gotoPath && unit.gotoPath.length
                ? unit.gotoPath.map(function(point) { return new Coord(point.i, point.j); })
                : storedRoute && storedRoute.path
                    ? storedRoute.path.map(function(point) { return new Coord(point.i, point.j); }) : [];
            var localGotoCoord = ownUnit && unit.gotoCoord
                ? new Coord(unit.gotoCoord.i, unit.gotoCoord.j)
                : storedRoute && storedRoute.destination
                    ? new Coord(storedRoute.destination.i, storedRoute.destination.j) : null;
            var localRouteOrigin = ownUnit && found && unit.coord
                ? new Coord(unit.coord.i, unit.coord.j)
                : storedRoute && storedRoute.origin
                    ? new Coord(storedRoute.origin.i, storedRoute.origin.j) : null;
            unit.serverId = update.id;
            unit.serverClientKey = update.client_key || unit.serverClientKey;
            unit.team = update.owner_id;
            unit.type = update.unit_class;
            unit.unitTypeId = update.unit_type_id;
            unit.name = update.name;
            unit.texture = update.texture;
            unit.can_move = update.can_move;
            unit.nature = update.nature;
            unit.coord = new Coord(update.i, update.j);
            unit.attack = update.attack;
            unit.defense = update.defense;
            unit.speed = update.speed;
            unit.viewRange = update.view_range;
            unit.state = update.state;
            unit.health = update.health;
            unit.maxHealth = update.max_health;
            unit.experience = update.experience;
            unit.move_penalty = update.move_penalty;
            var properties = update.properties || {};
            for (var key in properties) {
                if (key == 'gotoPath' || key == 'gotoCoord' || key == 'pendingServerPath') continue;
                unit[key] = properties[key];
            }
            if (ownUnit && localGotoPath.length) {
                var reachedIndex = -1;
                var originUnchanged = localRouteOrigin
                    && localRouteOrigin.i == unit.coord.i && localRouteOrigin.j == unit.coord.j;
                if (!originUnchanged) {
                    for (var routeIndex=0; routeIndex < localGotoPath.length; routeIndex++) {
                        if (localGotoPath[routeIndex].i == unit.coord.i
                            && localGotoPath[routeIndex].j == unit.coord.j) {
                            reachedIndex = routeIndex;
                            break;
                        }
                    }
                }
                unit.gotoPath = originUnchanged ? localGotoPath : localGotoPath.slice(reachedIndex + 1);
                unit.gotoCoord = unit.gotoPath.length ? localGotoCoord : null;
                unit.pendingServerPath = [];
                if (!originUnchanged && reachedIndex < 0) {
                    unit.gotoPath = [];
                    unit.gotoCoord = null;
                    this.log('Unit #' + update.id + ' route stopped because its server position left the client route.');
                }
            }
            else if (ownUnit) {
                unit.gotoPath = [];
                unit.gotoCoord = null;
                unit.pendingServerPath = [];
            }
            else {
                unit.gotoPath = [];
                unit.gotoCoord = null;
                unit.pendingServerPath = [];
            }
            if (unit.type == 3 && typeof _city_economy != 'undefined') {
                _city_economy.ensureCity(unit);
                if (properties.cityFoodStored != undefined) {
                    unit.economy.foodStored = Math.max(0, Number(properties.cityFoodStored) || 0);
                    unit.economy.foodLoadedFromServer = true;
                }
            }
        }
        var ownedUnitIds = {};
        var serverOwnedIds = result.owned_unit_ids || [];
        for (var ownIdIndex=0; ownIdIndex < serverOwnedIds.length; ownIdIndex++) {
            ownedUnitIds[serverOwnedIds[ownIdIndex]] = true;
        }
        if (result.owned_unit_ids && _units_by_user[viewerId]) {
            var ownUnits = _units_by_user[viewerId];
            for (var ownIndex=ownUnits.length-1; ownIndex >= 0; ownIndex--) {
                if (!ownUnits[ownIndex].serverId || !ownedUnitIds[ownUnits[ownIndex].serverId]) {
                    ownUnits.splice(ownIndex, 1);
                }
            }
        }
        if (options.pruneForeignUnits && Array.isArray(result.visible_enemy_ids)) {
            var visibleEnemyIds = {};
            var serverVisibleIds = result.visible_enemy_ids;
            for (var visibleIndex=0; visibleIndex < serverVisibleIds.length; visibleIndex++) {
                visibleEnemyIds[serverVisibleIds[visibleIndex]] = true;
            }
            for (var ownerId in _units_by_user) {
                if (parseInt(ownerId, 10) == viewerId) continue;
                var enemyList = _units_by_user[ownerId] || [];
                for (var enemyIndex=0; enemyIndex < enemyList.length; enemyIndex++) {
                    if (!enemyList[enemyIndex].serverId) continue;
                    this.setUnitVisibilityForViewer(
                        enemyList[enemyIndex], viewerId, !!visibleEnemyIds[enemyList[enemyIndex].serverId]
                    );
                }
            }
        }
        this.saveClientRoutes(viewerId);
        this.applyVisibilityUpdates(viewerId, result.visibility || []);
        var events = result.events || [];
        for (var e=0; e < events.length; e++) {
            this.log(events[e].message);
            if (typeof _game_state_by_user != 'undefined' && _game_state_by_user[viewerId]) {
                _game_state_by_user[viewerId].oneTurnMessage = events[e].message;
            }
        }
        if (typeof _current_user != 'undefined' && _current_user == viewerId) {
            _units = _units_by_user[viewerId];
            if (_selection >= _units.length) _selection = -1;
        }
    }

    applyVisibilityUpdates(playerId, updates)
    {
        if (_map_terrain_bit_by_user[playerId] == undefined) {
            _map_terrain_bit_by_user[playerId] = _multiplayer.cloneVisibilityFrom(_map_terrain_bit);
            _multiplayer.clearVisibility(_map_terrain_bit_by_user[playerId], false);
        }
        if (_map_resource_visibility_by_user[playerId] == undefined) {
            _map_resource_visibility_by_user[playerId] = _multiplayer.createResourceVisibility();
        }
        var bits = _map_terrain_bit_by_user[playerId];
        for (var n=0; n < updates.length; n++) {
            var update = updates[n];
            var i = parseInt(update.i, 10);
            var j = parseInt(update.j, 10);
            bits[i][j] &= 0xF0FF;
            bits[i][j] |= 0x4000;
            if (parseInt(update.visibility_level, 10) >= 2) bits[i][j] |= 0x0500;
            else bits[i][j] |= 0x0100;
            if (update.resource_visible) _map_resource_visibility_by_user[playerId][i][j] = true;
        }
        if (_current_user == playerId) _map_terrain_bit = bits;
    }

    applyLandscapeUpdates(playerId, tiles)
    {
        for (var n=0; n < tiles.length; n++) {
            var tile = tiles[n];
            _map_terrain_tex[tile.i][tile.j] = tile.terrain_tex;
            var visibilityBits = _map_terrain_bit_by_user[playerId]
                ? (_map_terrain_bit_by_user[playerId][tile.i][tile.j] & 0x7F00) : 0;
            if (_map_terrain_bit_by_user[playerId]) {
                _map_terrain_bit_by_user[playerId][tile.i][tile.j] = (tile.terrain_bits & 0x80FF) | visibilityBits;
            }
            _map_terrain_mod[tile.i][tile.j] = tile.modifiers || {};
            if (_map_resource[tile.i][tile.j] == undefined) _map_resource[tile.i][tile.j] = { type: 0, hidden: true };
            if (tile.resource_visible) {
                _map_resource[tile.i][tile.j].type = tile.resource_type;
                _map_resource[tile.i][tile.j].hidden = false;
            }
        }
        if (_map.prepareTerrainModifierSprites) _map.prepareTerrainModifierSprites();
        if (_map.prepareResourceSprites) _map.prepareResourceSprites();
    }

    startTurnTimer(playerId, forceRestart)
    {
        if (this.isAwaitingResolution(playerId)) {
            if (this.timerMode != 'waiting' || !this.timerId) this.startAwaitingCountdown(playerId);
            this.updateWaitingUi(playerId);
            return;
        }
        if (this.timerId) clearInterval(this.timerId);
        this.timerId = null;
        this.timerMode = 'turn';
        var now = Date.now();
        if (forceRestart || !this.deadlineAt || this.deadlineAt <= now) {
            this.deadlineAt = now + _client_turn_timeout_ms;
        }
        var self = this;
        var expired = false;
        var update = function() {
            var remaining = Math.max(0, Math.ceil((self.deadlineAt - Date.now()) / 1000));
            self.lastRemainingSeconds = remaining;
            if (typeof _multiplayer != 'undefined') _multiplayer.updateTurnLabel(remaining);
            if (remaining <= 0 && !expired) {
                expired = true;
                clearInterval(self.timerId);
                if (self.timerEndTurn) self.timerEndTurn(true);
            }
        };
        update();
        this.timerId = setInterval(update, 250);
    }

    stopTurnTimer(showZero)
    {
        if (this.timerId) clearInterval(this.timerId);
        this.timerId = null;
        this.timerMode = null;
        if (showZero) {
            this.lastRemainingSeconds = 0;
            if (typeof _multiplayer != 'undefined') _multiplayer.updateTurnLabel(0);
        }
    }

    log(message)
    {
        if (typeof appendConsoleLog == 'function') appendConsoleLog(message);
        if (typeof console != 'undefined' && console.log) console.log(message);
    }
}();

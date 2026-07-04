var _user_ids = [0, 1];
var _current_user = 0;
var current_user = 0;
var _user_types = { 0: 'ai', 1: 'ai' };
var _selection_by_user = { 0: -1, 1: -1 };
var _map_terrain_bit_by_user = {};
var _map_resource_visibility_by_user = {};

const _multiplayer = new class
{
    constructor()
    {
        this.defaultUsers = [0, 1];
    }

    initUsers(userIds)
    {
        _user_ids = userIds && userIds.length ? userIds.slice() : this.defaultUsers.slice();
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
        await this.prepareCurrentAiTurn();
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

    updateTurnLabel()
    {
        var button = document.getElementById('endTurnButton');
        if (button) {
            var prefix = _user_types[_current_user] == 'ai' ? 'End AI User ' : 'End User ';
            button.textContent = prefix + _current_user + ' Turn';
        }
    }
}();

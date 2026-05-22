

_screen.loadTexture('settler.png', 256);
_screen.loadTexture('worker.png', 257, 'explorer.png');
_screen.loadTexture('warrior.png', 258);
_screen.loadTexture('city.png', 259, 'factory.png');

// game settings
_start_game_settlers = 2;
_start_game_workers = 2;
_start_game_point = new Coord(0,0);
// game state
_prehistory_command_mode = null;


_city = new Unit(3, 256+3);
_city.can_move = false;

const _game_prehistory = new class
{

    applyMovementRules()
    {
        for (var k=0; k < _units.length; k++) {
            // PREHISTORY-MOVE-001, rules/prehostory.md: non-moving units must not keep movement orders.
            if (!_units[k].can_move) {
                _units[k].gotoCoord = null;
                _units[k].gotoPath = [];
            }

            // PREHISTORY-MOVE-002, rules/prehostory.md: movable units keep the preview path for base movement processing.
            if (_units[k].can_move && _units[k].gotoPath == undefined) {
                _units[k].gotoPath = [];
            }
        }
    }

    applyUnitStateRules()
    {
        for (var k=0; k < _units.length; k++) {
            // PREHISTORY-UNIT-001, rules/prehostory.md: settlers are movable units.
            if (_units[k].type == 0) {
                _units[k].can_move = true;
            }

            // PREHISTORY-UNIT-002, rules/prehostory.md: workers are movable units.
            if (_units[k].type == 1) {
                _units[k].can_move = true;
            }

            // PREHISTORY-UNIT-003, rules/prehostory.md: cities are non-moving units.
            if (_units[k].type == 3) {
                _units[k].can_move = false;
            }

            // PREHISTORY-UNIT-004, rules/prehostory.md: every unit must have a movement path queue.
            if (_units[k].gotoPath == undefined) {
                _units[k].gotoPath = [];
            }

            // PREHISTORY-UNIT-005, rules/prehostory.md: every unit has an explicit layer state.
            if (_units[k].state == undefined) {
                _units[k].state = 'ready';
            }
        }
    }

    applyBuildingStateRules(command)
    {
        // PREHISTORY-BUILD-001, rules/prehostory.md: selected settler can build a city with command b.
        if (command == 'b') {
            if (_selection != -1 && _units[_selection].type == 0) {
                _game.make_unit(_city, _units[_selection].coord);

                // PREHISTORY-BUILD-002, rules/prehostory.md: building a city consumes the settler.
                _game.del_unit(_selection);
                _selection = -1;
            }
        }

        for (var k=0; k < _units.length; k++) {
            // PREHISTORY-BUILD-002, rules/prehostory.md: city units remain non-moving after construction.
            if (_units[k].type == 3) {
                _units[k].can_move = false;
            }
        }
    }

    applyMenuRules()
    {
        var menu = document.getElementById('foreground');
        if (!menu) {
            return;
        }

        var options = menu.querySelectorAll('[data-menu-option]');
        for (var n=0; n < options.length; n++) {
            // PREHISTORY-MENU-001, rules/prehostory.md: hide all options before applying selected unit rules.
            options[n].style.display = 'none';
        }

        // PREHISTORY-MENU-001, rules/prehostory.md: if no unit is selected, unit action menu options stay hidden.
        if (_selection == -1 || _units[_selection] == undefined) {
            return;
        }

        var unit = _units[_selection];
        var show = function(name) {
            var element = menu.querySelector('[data-menu-option="' + name + '"]');
            if (element) {
                element.style.display = '';
            }
        };

        // PREHISTORY-MENU-002, rules/prehostory.md: movable units show movement-related commands.
        if (unit.can_move) {
            show('goto');
            show('fortificate');
            show('destroy');
            show('wait');
            show('explore');
            show('patrol');
            show('automate');
        }

        // PREHISTORY-MENU-003, rules/prehostory.md: settlers show the city building command.
        if (unit.type == 0) {
            show('road');
            show('irrigate');
            show('chop_forest');
            show('buildings');
            show('build_city');
        }

        // PREHISTORY-MENU-004, rules/prehostory.md: cities show building management options and hide movement commands.
        if (unit.type == 3) {
            show('buildings');
            show('build_city');
            show('build_fabric');
            show('build_tank');
            show('build_city_2');
            show('build_fabric_2');
            show('build_tank_2');
        }
    }

    setUnitState(k, state)
    {
        if (k == -1 || _units[k] == undefined) {
            return;
        }
        _units[k].state = state;
        _units[k].gotoCoord = null;
        _units[k].gotoPath = [];
        if (state != 'chop_forest') {
            _units[k].chop_turns_left = undefined;
        }
    }

    prepareManualMovement(k)
    {
        if (k == -1 || _units[k] == undefined || !_units[k].can_move) {
            return;
        }
        // PREHISTORY-STATE-007, rules/prehostory.md: manual movement clears any modified unit state.
        this.setUnitState(k, 'ready');
        this.applyMenuRules();
    }

    buildPath(k, target)
    {
        var path = [];
        if (k == -1 || _units[k] == undefined || target == undefined) {
            return path;
        }
        _control.mapLine(_units[k].coord.i, _units[k].coord.j, target.i, target.j, function(i, j, ni, nj, arrow_num) {
            path.push(new Coord(ni, nj));
        }, k, 30);
        return path;
    }

    assignPath(k, path)
    {
        if (k == -1 || _units[k] == undefined || path.length == 0) {
            return;
        }
        _units[k].gotoPath = path;
        _units[k].gotoCoord = path[path.length - 1];
    }

    autoRouteExplore(k)
    {
        for (var r=1; r < 20; r++) {
            for (var di=-r; di <= r; di++) {
                for (var dj=-r; dj <= r; dj++) {
                    var i = _units[k].coord.i + di;
                    var j = _units[k].coord.j + dj;
                    if (i < 0 || i >= _map_size || j < 0 || j >= _map_size) {
                        continue;
                    }
                    if ((_map_terrain_tex[i][j]&0x0F) == 0) {
                        continue;
                    }
                    if ((_map_terrain_bit[i][j]&0x4000) == 0) {
                        var path = this.buildPath(k, new Coord(i, j));
                        if (path.length) {
                            this.assignPath(k, path);
                            return;
                        }
                    }
                }
            }
        }
        this.autoRouteAutomate(k);
    }

    autoRoutePatrol(k)
    {
        if (_units[k].patrolOrigin == undefined) {
            _units[k].patrolOrigin = new Coord(_units[k].coord.i, _units[k].coord.j);
            _units[k].patrolStep = 0;
        }
        var offsets = [[4,0], [0,4], [-4,0], [0,-4]];
        for (var n=0; n < offsets.length; n++) {
            var step = (_units[k].patrolStep + n) % offsets.length;
            var target = _units[k].patrolOrigin.add(offsets[step][0], offsets[step][1]);
            var path = this.buildPath(k, target);
            if (path.length) {
                _units[k].patrolStep = step + 1;
                this.assignPath(k, path);
                return;
            }
        }
    }

    autoRouteAutomate(k)
    {
        for (var n=0; n < 20; n++) {
            var target = _game.random_point(0, _units[k].coord.add(-8, -8), _units[k].coord.add(8, 8));
            var path = this.buildPath(k, target);
            if (path.length) {
                this.assignPath(k, path);
                return;
            }
        }
    }

    applyAutoRoutingRules()
    {
        for (var k=0; k < _units.length; k++) {
            if (!_units[k].can_move || _units[k].gotoPath.length || _units[k].gotoCoord != undefined) {
                continue;
            }
            // PREHISTORY-AUTO-001, rules/prehostory.md: explore routes toward unseen land.
            if (_units[k].state == 'explore') {
                this.autoRouteExplore(k);
            }
            // PREHISTORY-AUTO-002, rules/prehostory.md: patrol routes around its patrol origin.
            if (_units[k].state == 'patrol') {
                this.autoRoutePatrol(k);
            }
            // PREHISTORY-AUTO-003, rules/prehostory.md: automate chooses a nearby available land route.
            if (_units[k].state == 'automate') {
                this.autoRouteAutomate(k);
            }
        }
    }

    applyForestChoppingRules()
    {
        for (var k=0; k < _units.length; k++) {
            // PREHISTORY-CHOP-001, rules/prehostory.md: only settlers in chop_forest state can chop.
            if (_units[k].state != 'chop_forest' || _units[k].type != 0) {
                continue;
            }

            var i = _units[k].coord.i;
            var j = _units[k].coord.j;
            var terrain = _map_terrain_tex[i][j];

            // PREHISTORY-CHOP-002 and PREHISTORY-CHOP-003, rules/prehostory.md: chopping requires forest terrain.
            if (!this.isChoppableForestTerrain(terrain)) {
                // PREHISTORY-CHOP-006, rules/prehostory.md: cancel chop order outside forest.
                _units[k].state = 'ready';
                _units[k].chop_turns_left = undefined;
                continue;
            }

            // PREHISTORY-CHOP-004, rules/prehostory.md: chopping duration is the forest wildity level in D bits.
            if (_units[k].chop_turns_left == undefined) {
                _units[k].chop_turns_left = (terrain>>4)&0x3;
            }
            if (_units[k].chop_turns_left > 0) {
                --_units[k].chop_turns_left;
            }

            if (_units[k].chop_turns_left == 0) {
                // PREHISTORY-CHOP-005 and PREHISTORY-CHOP-008, rules/prehostory.md: completed chopping converts forest to base terrain.
                _map_terrain_tex[i][j] = this.choppedForestTerrain(terrain);
                _map_terrain_bit[i][j] &= 0xFFF0;
                _units[k].state = 'ready';
                _units[k].chop_turns_left = undefined;
                _fulldraw = 1;
            }
        }
    }

    isChoppableForestTerrain(terrain)
    {
        // PREHISTORY-CHOP-003, rules/prehostory.md: base forest tiles and forested hill variants can be chopped.
        return (terrain&0x0F) == 6 || terrain == 4+(1<<4) || terrain == 4+((1+4)<<4);
    }

    choppedForestTerrain(terrain)
    {
        // PREHISTORY-CHOP-008, rules/prehostory.md: hill forest variants preserve their hill base after chopping.
        if (terrain == 4+(1<<4)) {
            return 4;
        }
        if (terrain == 4+((1+4)<<4)) {
            return 4+(4<<4);
        }
        return 2;
    }

    canChopForest(k)
    {
        if (k == -1 || _units[k] == undefined || _units[k].type != 0) {
            return false;
        }
        var i = _units[k].coord.i;
        var j = _units[k].coord.j;
        // PREHISTORY-CHOP-007, rules/prehostory.md: chop_forest state starts only on forest terrain.
        return this.isChoppableForestTerrain(_map_terrain_tex[i][j]);
    }

    centerViewOnStartingUnits()
    {
        if (_units.length == 0) {
            return;
        }

        var x = 0;
        var y = 0;
        for (var k=0; k < _units.length; k++) {
            x += ijtox(_units[k].coord.i, _units[k].coord.j);
            y += ijtoy(_units[k].coord.i, _units[k].coord.j);
        }

        // PREHISTORY-VIEW-001, rules/prehostory.md: center start view on the initial unit cluster.
        _screenOffsetX = x/_units.length/2/_ratio;
        _screenOffsetY = y/_units.length/2/_ratio;
    }

    centerViewOnUnit(k)
    {
        if (k == -1 || _units[k] == undefined) {
            return;
        }

        _screenOffsetX = ijtox(_units[k].coord.i, _units[k].coord.j)/2/_ratio;
        _screenOffsetY = ijtoy(_units[k].coord.i, _units[k].coord.j)/2/_ratio;
        _fulldraw = 1;
    }

    unitHasTask(unit)
    {
        // PREHISTORY-TURN-005, rules/prehostory.md: route, target, or modified state counts as a task.
        if (unit.gotoPath != undefined && unit.gotoPath.length) {
            return true;
        }
        if (unit.state != undefined && unit.state != 'ready') {
            return true;
        }
        if (unit.chop_turns_left != undefined) {
            return true;
        }
        if (unit.gotoCoord != undefined) {
            return true;
        }
        return false;
    }

    collectUnitTaskStates()
    {
        var taskStates = [];
        for (var k=0; k < _units.length; k++) {
            taskStates[k] = this.unitHasTask(_units[k]);
        }
        return taskStates;
    }

    selectUnitThatFinishedTask(taskStatesBefore)
    {
        if (taskStatesBefore == undefined) {
            return false;
        }

        for (var k=0; k < _units.length; k++) {
            // PREHISTORY-TURN-006, rules/prehostory.md: a unit that just finished its task is selected first.
            if (taskStatesBefore[k] && _units[k].can_move && !this.unitHasTask(_units[k])) {
                _selection = k;
                this.centerViewOnUnit(k);
                this.applyMenuRules();
                return true;
            }
        }
        return false;
    }

    selectNextUnitWithoutTask()
    {
        var start = _selection == -1 ? 0 : _selection + 1;
        for (var offset=0; offset < _units.length; offset++) {
            var k = (start + offset) % _units.length;

            // PREHISTORY-TURN-004, rules/prehostory.md: select and center the next movable unit without a task.
            if (_units[k].can_move && !this.unitHasTask(_units[k])) {
                _selection = k;
                this.centerViewOnUnit(k);
                this.applyMenuRules();
                return;
            }
        }
        _selection = -1;
        this.applyMenuRules();
    }

    handleMapClick(coord)
    {
        if (_prehistory_command_mode == 'goto' && _selection != -1 && _units[_selection] != undefined && _units[_selection].can_move) {
            var path = this.buildPath(_selection, coord);
            this.assignPath(_selection, path);
            _prehistory_command_mode = null;
            _draw.clear();
            return true;
        }
        return false;
    }

    previewMapCommand(coord)
    {
        if (_prehistory_command_mode == 'goto' && _selection != -1 && _units[_selection] != undefined && _units[_selection].can_move) {
            _control.drawGoto(_units[_selection].coord.i, _units[_selection].coord.j, coord.i, coord.j, _selection);
            return true;
        }
        return false;
    }

    drawUnitStateLetters(ctx)
    {
        ctx.font = 'bold 26px Courier New';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineWidth = 4;
        for (var k=0; k < _units.length; k++) {
            var letter = this.unitStateLetter(_units[k]);
            if (!letter) {
                continue;
            }
            var x = x1toX(ijtox1(_units[k].coord.i, _units[k].coord.j));
            var y = y1toY(ijtoy1(_units[k].coord.i, _units[k].coord.j)) - 26;
            ctx.strokeText(letter, x, y);
            ctx.fillText(letter, x, y);
        }
    }

    unitStateLetter(unit)
    {
        if (unit.state == 'fortified') return 'F';
        if (unit.state == 'waiting') return 'W';
        if (unit.state == 'road') return 'R';
        if (unit.state == 'irrigate') return 'I';
        if (unit.state == 'chop_forest') return 'C';
        if (unit.state == 'explore') return 'E';
        if (unit.state == 'patrol') return 'P';
        if (unit.state == 'automate') return 'A';
        return '';
    }

    applyTurnProcessingRules()
    {
        // PREHISTORY-TURN-001, rules/prehostory.md: apply layer movement rules before base turn processing.
        this.applyMovementRules();
        var taskStatesBefore = this.collectUnitTaskStates();

        // PREHISTORY-AUTO-004, rules/prehostory.md: auto-routes are refreshed when a unit has no active route.
        this.applyAutoRoutingRules();

        // PREHISTORY-CHOP-001..006, rules/prehostory.md: process active forest chopping orders.
        this.applyForestChoppingRules();

        // PREHISTORY-TURN-002, rules/prehostory.md: base turn processing handles map, terrain, movement, and overlays.
        _game.makeTurn();

        // PREHISTORY-TURN-003, rules/prehostory.md: re-apply layer state rules after base turn processing.
        this.applyUnitStateRules();
        this.applyBuildingStateRules();
        if (!this.selectUnitThatFinishedTask(taskStatesBefore)) {
            this.selectNextUnitWithoutTask();
        }
        // PREHISTORY-MENU-005, rules/prehostory.md: menu visibility follows turn state changes.
        this.applyMenuRules();
    }

    makeTurn()
    {
        this.applyTurnProcessingRules();
    }

    startGame()
    {
        _start_game_point = _game.random_point();
        _game.make_unit(_city, _start_game_point);
        this.applyUnitStateRules();

        for(var k=0; k < _start_game_settlers; k++) {
            var point = _game.random_point(0, _start_game_point.add(-5,-5), _start_game_point.add(5,5));
            _game.add_unit(new Unit(0, 256+0, point));
        }
        for(var k=0; k < _start_game_workers; k++) {
            var point = _game.random_point(0, _start_game_point.add(-5,-5), _start_game_point.add(5,5));
            _game.add_unit(new Unit(1, 256+1, point));
        }

        this.centerViewOnStartingUnits();

        this.applyUnitStateRules();
        this.applyTurnProcessingRules();
        this.applyMenuRules();
    }

    doCommand(command)
    {
        if (command == 'goto' && _selection != -1 && _units[_selection].can_move) {
            _prehistory_command_mode = 'goto';
            this.setUnitState(_selection, 'ready');
            this.applyMenuRules();
            return;
        }
        if (command == 'fortificate' && _selection != -1 && _units[_selection].can_move) {
            this.setUnitState(_selection, 'fortified');
            _units[_selection].move_penalty = Math.max(_units[_selection].move_penalty, 1);
        }
        if (command == 'wait' && _selection != -1 && _units[_selection].can_move) {
            this.setUnitState(_selection, 'waiting');
        }
        if ((command == 'road' || command == 'irrigate') && _selection != -1
            && _units[_selection].type == 0) {
            this.setUnitState(_selection, command);
        }
        if (command == 'chop_forest' && this.canChopForest(_selection)) {
            this.setUnitState(_selection, command);
        }
        if ((command == 'explore' || command == 'patrol' || command == 'automate') && _selection != -1
            && _units[_selection].can_move) {
            this.setUnitState(_selection, command);
        }
        this.applyBuildingStateRules(command);
        // PREHISTORY-MENU-005, rules/prehostory.md: menu visibility follows command state changes.
        this.applyMenuRules();
    }
}

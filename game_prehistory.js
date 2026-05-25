const _resource_types = [
    null,
    { id: 'bananas', name: 'Bananas', texture: 801, sprite: 'resource_bananas.png', gives: 'food from tropical forest and grass tiles', terrains: [6, 2], chance: 0.012 },
    { id: 'cattle', name: 'Cattle', texture: 802, sprite: 'resource_cattle.png', gives: 'food and production from grassland herds', terrains: [2], chance: 0.012 },
    { id: 'copper', name: 'Copper', texture: 803, sprite: 'resource_copper.png', gives: 'early metal production and trade value', terrains: [4, 5], chance: 0.010 },
    { id: 'crabs', name: 'Crabs', texture: 804, sprite: 'resource_crabs.png', gives: 'food from coastal water and river grass', terrains: [0, 7], chance: 0.010 },
    { id: 'deer', name: 'Deer', texture: 805, sprite: 'resource_deer.png', gives: 'food and hides from forest or snow edge tiles', terrains: [6, 3], chance: 0.010 },
    { id: 'fish', name: 'Fish', texture: 806, sprite: 'resource_fish.png', gives: 'food from water tiles', terrains: [0], chance: 0.012 },
    { id: 'rice', name: 'Rice', texture: 807, sprite: 'resource_rice.png', gives: 'food from wet grass and river grass', terrains: [2, 7], chance: 0.012 },
    { id: 'sheep', name: 'Sheep', texture: 808, sprite: 'resource_sheep.png', gives: 'food and wool from grass or hills', terrains: [2, 4], chance: 0.012 },
    { id: 'stone', name: 'Stone', texture: 809, sprite: 'resource_stone.png', gives: 'production support for early buildings and construction', terrains: [4, 5], chance: 0.012 },
    { id: 'wheat', name: 'Wheat', texture: 810, sprite: 'resource_wheat.png', gives: 'food support for city growth', terrains: [2, 7], chance: 0.012 },
    { id: 'amber', name: 'Amber', texture: 811, sprite: 'resource_amber.png', gives: 'luxury and trade value from forested lands', terrains: [6, 3], chance: 0.007 },
    { id: 'citrus', name: 'Citrus', texture: 812, sprite: 'resource_citrus.png', gives: 'food and luxury from warm grass or forest', terrains: [2, 6], chance: 0.008 },
    { id: 'cotton', name: 'Cotton', texture: 815, sprite: 'resource_cotton.png', gives: 'luxury and textile value from open land', terrains: [2, 1], chance: 0.008 },
    { id: 'dyes', name: 'Dyes', texture: 816, sprite: 'resource_dyes.png', gives: 'luxury and trade colorants from forests or grass', terrains: [6, 2], chance: 0.008 },
    { id: 'diamonds', name: 'Diamonds', texture: 817, sprite: 'resource_diamonds.png', gives: 'high-value luxury from hills and rocks', terrains: [4, 5], chance: 0.005 },
    { id: 'furs', name: 'Furs', texture: 818, sprite: 'resource_furs.png', gives: 'luxury from cold terrain and forests', terrains: [3, 6], chance: 0.007 },
    { id: 'gypsum', name: 'Gypsum', texture: 819, sprite: 'resource_gypsum.png', gives: 'construction material from desert, hills, and rocks', terrains: [1, 4, 5], chance: 0.008 },
    { id: 'honey', name: 'Honey', texture: 820, sprite: 'resource_honey.png', gives: 'food and luxury from forest and grass', terrains: [6, 2], chance: 0.008 },
    { id: 'incense', name: 'Incense', texture: 821, sprite: 'resource_incense.png', gives: 'luxury and ceremonial trade value', terrains: [1, 4], chance: 0.007 },
    { id: 'ivory', name: 'Ivory', texture: 822, sprite: 'resource_ivory.png', gives: 'luxury and strategic animal material', terrains: [2, 6], chance: 0.006 },
    { id: 'marble', name: 'Marble', texture: 823, sprite: 'resource_marble.png', gives: 'luxury stone and building production value', terrains: [4, 5], chance: 0.007 },
    { id: 'olives', name: 'Olives', texture: 825, sprite: 'resource_olives.png', gives: 'food and luxury from grass or hills', terrains: [2, 4], chance: 0.008 },
    { id: 'pearls', name: 'Pearls', texture: 826, sprite: 'resource_pearls.png', gives: 'luxury from water tiles', terrains: [0], chance: 0.006 },
    { id: 'salt', name: 'Salt', texture: 827, sprite: 'resource_salt.png', gives: 'food preservation and trade value', terrains: [1, 0, 4], chance: 0.008 },
    { id: 'silk', name: 'Silk', texture: 828, sprite: 'resource_silk.png', gives: 'luxury textile value from forest regions', terrains: [6], chance: 0.006 },
    { id: 'silver', name: 'Silver', texture: 829, sprite: 'resource_silver.png', gives: 'precious metal commerce and trade value', terrains: [4, 5], chance: 0.007 },
    { id: 'spices', name: 'Spices', texture: 830, sprite: 'resource_spices.png', gives: 'luxury and food trade value', terrains: [6, 2], chance: 0.008 },
    { id: 'sugar', name: 'Sugar', texture: 831, sprite: 'resource_sugar.png', gives: 'food and luxury from wet grass or river grass', terrains: [2, 7], chance: 0.008 },
    { id: 'tea', name: 'Tea', texture: 832, sprite: 'resource_tea.png', gives: 'luxury from hills or forest', terrains: [4, 6], chance: 0.007 },
    { id: 'turtles', name: 'Turtles', texture: 834, sprite: 'resource_turtles.png', gives: 'food and luxury from water tiles', terrains: [0], chance: 0.006 },
    { id: 'whales', name: 'Whales', texture: 835, sprite: 'resource_whales.png', gives: 'food, production, and luxury from water tiles', terrains: [0], chance: 0.005 },
    { id: 'wine', name: 'Wine', texture: 836, sprite: 'resource_wine.png', gives: 'luxury and culture value from grass or hills', terrains: [2, 4], chance: 0.007 },
    { id: 'horses', name: 'Horses', texture: 837, sprite: 'resource_horses.png', gives: 'strategic animal resource for horse units', terrains: [2, 1], chance: 0.010 },
    { id: 'iron', name: 'Iron', texture: 838, sprite: 'resource_iron.png', gives: 'strategic metal for iron weapons and units', terrains: [4, 5], chance: 0.009 },
    { id: 'gold', name: 'Gold', texture: 844, sprite: 'resource_gold.png', gives: 'commerce and trade value', terrains: [4, 5, 1], chance: 0.007 },

    // Resources below are known only from medieval or later play and are disabled in prehistory.
    // not known in the Old World before the medieval era.
    // { id: 'cocoa', name: 'Cocoa', texture: 813, sprite: 'resource_cocoa.png', gives: 'luxury and trade value from forest tiles', terrains: [6], chance: 0.007 },
    // widespread coffee use is medieval or later.
    // { id: 'coffee', name: 'Coffee', texture: 814, sprite: 'resource_coffee.png', gives: 'luxury and commerce from hills or forest', terrains: [4, 6], chance: 0.007 },
    // advanced extraction/use is outside prehistory.
    // { id: 'mercury', name: 'Mercury', texture: 824, sprite: 'resource_mercury.png', gives: 'rare scientific and trade material', terrains: [4, 5], chance: 0.005 },
    // not known in the Old World before the medieval era.
    // { id: 'tobacco', name: 'Tobacco', texture: 833, sprite: 'resource_tobacco.png', gives: 'luxury and commerce from grass or forest', terrains: [2, 6], chance: 0.007 },
    // gunpowder resource belongs after pre-medieval play.
    // { id: 'niter', name: 'Niter', texture: 839, sprite: 'resource_niter.png', gives: 'strategic resource for gunpowder units', terrains: [1, 4, 5], chance: 0.007 },
    // industrial fuel belongs after the medieval era.
    // { id: 'coal', name: 'Coal', texture: 840, sprite: 'resource_coal.png', gives: 'strategic fuel for industry and railways', terrains: [4, 5], chance: 0.007 },
    // modern strategic fuel belongs after the medieval era.
    // { id: 'oil', name: 'Oil', texture: 841, sprite: 'resource_oil.png', gives: 'strategic fuel for modern units and industry', terrains: [0, 1, 5], chance: 0.006 },
    // industrial metal belongs after the medieval era.
    // { id: 'aluminum', name: 'Aluminum', texture: 842, sprite: 'resource_aluminum.png', gives: 'strategic metal for advanced units and construction', terrains: [4, 5], chance: 0.006 },
    // modern nuclear resource belongs after the medieval era.
    // { id: 'uranium', name: 'Uranium', texture: 843, sprite: 'resource_uranium.png', gives: 'strategic late-game energy and weapon resource', terrains: [4, 5, 1], chance: 0.004 },
];

_screen.loadTexture('settler.png', 256);
_screen.loadTexture('explorer.png', 257);
_screen.loadTexture('warrior.png', 258);
_screen.loadTexture('city.png', 259);
_screen.loadTexture('Slinger.png', 260);
_screen.loadTexture('Archers.png', 261);
_screen.loadTexture('Spearman.png', 262);
_screen.loadTexture('Horseman.png', 263);
_screen.loadTexture('Chariot.png', 264);
_screen.loadTexture('WarElephant.png', 265);
_screen.loadTexture('unit_catapult.png', 266);
_screen.loadTexture('unit_trebuchet.png', 267);
_screen.loadTexture('unit_galley.png', 268);
_screen.loadTexture('unit_galleon.png', 269);
_screen.loadTexture('worker.png', 270);
_screen.loadTexture('blue.png', 900);
_screen.loadTexture('green.png', 901);
_screen.loadTexture('yellow.png', 902);
_screen.loadTexture('magenta.png', 903);
_screen.loadTexture('orange.png', 904);

const _prehistory_unit_types = [
    new UnitType('settlers', 'Settlers', 0, 256, 0, 1, 1, 2, null, 20, null),
    new UnitType('worker', 'Worker', 1, 270, 0, 1, 1, 2, null, 20, null),
    new UnitType('explorer', 'Explorer', 1, 257, 0, 1, 2, 4, null, 15, null),
    new UnitType('warrior', 'Warrior', 2, 258, 2, 1, 1, 2, null, 20, null),
    new UnitType('slinger', 'Slinger', 2, 260, 2, 1, 1, 2, 'Archery', 25, null),
    new UnitType('archor', 'Archor', 2, 261, 3, 1, 1, 2, 'Archery', 35, null),
    new UnitType('spearman', 'Spearman', 2, 262, 2, 3, 1, 2, 'Bronze Working', 35, 'Copper'),
    new UnitType('horseman', 'Horseman', 2, 263, 4, 2, 3, 3, 'Horseback Riding', 50, 'Horses'),
    new UnitType('chariot', 'Chariot', 2, 264, 3, 2, 2, 3, 'Wheel', 45, 'Horses'),
    new UnitType('elephant', 'Elephant', 2, 265, 5, 4, 2, 3, 'Horseback Riding', 70, 'Ivory'),
    new UnitType('catapult', 'Catapult', 2, 266, 5, 1, 1, 2, 'Construction', 60, null),
    new UnitType('trebuchet', 'Trebuchet', 2, 267, 7, 1, 1, 2, 'Engineering', 80, null),
    new UnitType('galley', 'Galley', 2, 268, 2, 2, 2, 3, 'Sailing', 40, null, true, 'water'),
    new UnitType('galleon', 'Galleon', 2, 269, 5, 4, 3, 4, 'Navigation', 90, null, true, 'water'),
];

// game settings
_start_game_settlers = 1;
_start_game_explorers = 1;
_start_game_workers = 1;
_start_game_point = new Coord(0,0);
// game state
_prehistory_command_mode = null;


_city = new Unit(new UnitType('city', 'City', 3, 259, 0, 8, 0, 3, null, 0, null, false));
_city.can_move = false;
_city.cityProperties = new CityProperties(5);

const _game_prehistory = new class
{
    constructor()
    {
        this.unitTypes = _prehistory_unit_types;
        this.unitTypesById = {};
        for (var k=0; k < this.unitTypes.length; k++) {
            this.unitTypesById[this.unitTypes[k].id] = this.unitTypes[k];
        }
    }

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
            if (_units[k].type == 0 || _units[k].type == 1 || _units[k].type == 2) {
                _units[k].can_move = true;
            }

            // PREHISTORY-UNIT-003, rules/prehostory.md: cities are non-moving units.
            if (_units[k].type == 3) {
                _units[k].can_move = false;
                if (_units[k].cityProperties == null) {
                    _units[k].cityProperties = new CityProperties(5);
                }
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
        // PREHISTORY-BUILD-001, rules/prehostory.md: selected settler can build a city.
        if (command == 'build_city') {
            if (_selection != -1 && _units[_selection].type == 0) {
                _game.make_unit(_city, _units[_selection].coord);
                _units[_units.length - 1].team = _units[_selection].team;
                if (typeof _city_economy !== 'undefined') {
                    _city_economy.ensureCity(_units[_units.length - 1]);
                }

                // PREHISTORY-BUILD-002, rules/prehostory.md: building a city consumes the settler.
                _game.del_unit(_selection);
                _selection = -1;
            }
        }

        if (command && command.indexOf('produce_unit:') == 0) {
            this.setCityProduction(_selection, command.substring('produce_unit:'.length));
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
            var elements = menu.querySelectorAll('[data-menu-option="' + name + '"]');
            for (var i=0; i < elements.length; i++) {
                elements[i].style.display = '';
            }
        };

        this.updateCityProductionMenu(menu, unit);

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
        if (unit.unitTypeId == 'settlers') {
            show('build_city');
        }

        // PREHISTORY-MENU-006, rules/prehostory.md: workers show terrain improvement commands.
        if (unit.unitTypeId == 'worker') {
            if (this.canBuildRoad(_selection)) {
                show('road');
            }
            if (this.canBuildIrrigation(_selection)) {
                show('irrigate');
            }
            show('chop_forest');
        }

        // PREHISTORY-MENU-004, rules/prehostory.md: cities show building management options and hide movement commands.
        if (unit.type == 3) {
            show('city_production_status');
            show('city_production_options');
            show('buildings');
            show('build_city_hall');
            show('build_fabric');
            show('build_tank');
            show('build_city_2');
            show('build_fabric_2');
            show('build_tank_2');
        }
    }

    isWaterUnitType(unitType)
    {
        return unitType != undefined && unitType.nature == "water";
    }

    isWaterTerrain(i, j)
    {
        if (i < 0 || i >= _map_size || j < 0 || j >= _map_size) {
            return false;
        }
        return (_map_terrain_tex[i][j]&0x0F) == 0;
    }

    isSeasideCity(city)
    {
        if (city == undefined || city.type != 3) {
            return false;
        }
        for (var di=-1; di <= 1; di++) {
            for (var dj=-1; dj <= 1; dj++) {
                if ((di != 0 || dj != 0) && this.isWaterTerrain(city.coord.i + di, city.coord.j + dj)) {
                    return true;
                }
            }
        }
        return false;
    }

    canCityProduceUnit(city, unitType)
    {
        if (!this.isWaterUnitType(unitType)) {
            return true;
        }
        // PREHISTORY-BUILD-007, rules/prehostory.md: water units can be produced only in seaside cities.
        return this.isSeasideCity(city);
    }

    canUnitEnterTile(k, i, j)
    {
        if (k == -1 || _units[k] == undefined || i < 0 || i >= _map_size || j < 0 || j >= _map_size) {
            return false;
        }
        var isWater = this.isWaterTerrain(i, j);
        var unitType = this.unitTypesById[_units[k].unitTypeId];
        if (this.isWaterUnitType(unitType)) {
            // PREHISTORY-MOVE-004, rules/prehostory.md: water units move only on water.
            return isWater;
        }
        // PREHISTORY-MOVE-005, rules/prehostory.md: land units cannot move onto water.
        return !isWater;
    }

    setCityProduction(k, unitTypeId)
    {
        if (k == -1 || _units[k] == undefined || _units[k].type != 3 || this.unitTypesById[unitTypeId] == undefined) {
            return;
        }
        var unitType = this.unitTypesById[unitTypeId];
        if (!this.canCityProduceUnit(_units[k], unitType)) {
            return;
        }
        _units[k].production = new CityProductionState(unitTypeId);
    }

    productionTurnsLeft(city)
    {
        if (city == undefined || city.production == null) {
            return 0;
        }
        var unitType = this.unitTypesById[city.production.unitTypeId];
        if (!unitType) {
            return 0;
        }
        if (typeof _city_economy !== 'undefined') {
            _city_economy.ensureCity(city);
        }
        var perTurn = city.cityProperties ? city.cityProperties.productionPerTurn : 5;
        return Math.max(1, Math.ceil((unitType.productionCost - city.production.productionPoints)/Math.max(1, perTurn)));
    }

    updateCityProductionMenu(menu, unit)
    {
        var status = menu.querySelector('[data-menu-option="city_production_status"]');
        if (status) {
            if (unit.type == 3 && unit.production != null && this.unitTypesById[unit.production.unitTypeId] != undefined) {
                var unitType = this.unitTypesById[unit.production.unitTypeId];
                var economyText = '';
                if (typeof _city_economy !== 'undefined') {
                    _city_economy.ensureCity(unit);
                    economyText = ' F:' + unit.economy.lastIncome.food + ' P:' + unit.economy.lastIncome.production + ' M:' + unit.economy.lastIncome.money + ' Growth:' + unit.economy.turnsToNewCitizen;
                }
                status.textContent = 'Producing: ' + unitType.name + ' (' + this.productionTurnsLeft(unit) + ' turns)' + economyText;
            }
            else if (unit.type == 3) {
                if (typeof _city_economy !== 'undefined') {
                    _city_economy.ensureCity(unit);
                    status.textContent = 'Producing: none F:' + unit.economy.lastIncome.food + ' P:' + unit.economy.lastIncome.production + ' M:' + unit.economy.lastIncome.money + ' Growth:' + unit.economy.turnsToNewCitizen;
                }
                else {
                    status.textContent = 'Producing: none';
                }
            }
            else {
                status.textContent = '';
            }
        }

        var options = menu.querySelector('[data-menu-option="city_production_options"]');
        if (!options) {
            return;
        }
        options.innerHTML = '';
        if (unit.type != 3) {
            return;
        }

        for (var k=0; k < this.unitTypes.length; k++) {
            var unitType = this.unitTypes[k];
            if (!this.canCityProduceUnit(unit, unitType)) {
                continue;
            }
            var link = document.createElement('a');
            link.setAttribute('data-menu-command', 'produce_unit:' + unitType.id);
            link.style.display = 'block';
            link.style.cursor = 'pointer';
            link.style.marginBottom = '4px';
            link.onmouseover = function() { this.style.backgroundColor = 'orange'; };
            link.onmouseout = function() { this.style.backgroundColor = ''; };
            link.textContent = unitType.name + ' (' + unitType.productionCost + ')';
            options.appendChild(link);
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
        if (state != 'road') {
            _units[k].road_turns_left = undefined;
        }
        if (state != 'irrigate') {
            _units[k].irrigation_turns_left = undefined;
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

    applyTerrainModifierRules()
    {
        for (var k=0; k < _units.length; k++) {
            // PREHISTORY-ROAD-001, rules/prehostory.md: only workers in road state can build roads.
            if (_units[k].state != 'road' || _units[k].unitTypeId != 'worker') {
                continue;
            }

            var i = _units[k].coord.i;
            var j = _units[k].coord.j;
            var terrain = _map_terrain_tex[i][j];

            // PREHISTORY-ROAD-002, rules/prehostory.md: roads are land terrain modifiers and cannot be built on water.
            if (!this.canBuildRoad(k)) {
                _units[k].state = 'ready';
                _units[k].road_turns_left = undefined;
                continue;
            }

            // PREHISTORY-ROAD-003, rules/prehostory.md: road building cost is two times terrain wildity.
            if (_units[k].road_turns_left == undefined) {
                _units[k].road_turns_left = 2*((terrain>>4)&0x3);
            }
            if (_units[k].road_turns_left > 0) {
                --_units[k].road_turns_left;
            }

            if (_units[k].road_turns_left == 0) {
                // PREHISTORY-ROAD-004, rules/prehostory.md: completed road building sets the road modifier on the tile.
                _map.addRoad(i, j);
                _units[k].state = 'ready';
                _units[k].road_turns_left = undefined;
                _fulldraw = 1;
            }
        }

        for (var k=0; k < _units.length; k++) {
            // PREHISTORY-IRRIGATION-001, rules/prehostory.md: only workers in irrigate state can build irrigation.
            if (_units[k].state != 'irrigate' || _units[k].unitTypeId != 'worker') {
                continue;
            }

            var i = _units[k].coord.i;
            var j = _units[k].coord.j;
            var terrain = _map_terrain_tex[i][j];

            // PREHISTORY-IRRIGATION-002, rules/prehostory.md: irrigation is a land terrain modifier and cannot be built on water.
            if (!this.canBuildIrrigation(k)) {
                _units[k].state = 'ready';
                _units[k].irrigation_turns_left = undefined;
                continue;
            }

            // PREHISTORY-IRRIGATION-003, rules/prehostory.md: irrigation takes at least one turn based on terrain wildity.
            if (_units[k].irrigation_turns_left == undefined) {
                _units[k].irrigation_turns_left = Math.max(1, (terrain>>4)&0x3);
            }
            if (_units[k].irrigation_turns_left > 0) {
                --_units[k].irrigation_turns_left;
            }

            if (_units[k].irrigation_turns_left == 0) {
                // PREHISTORY-IRRIGATION-004, rules/prehostory.md: completed irrigation sets the irrigation modifier on the tile.
                _map.addIrrigation(i, j);
                _units[k].state = 'ready';
                _units[k].irrigation_turns_left = undefined;
                _fulldraw = 1;
            }
        }
    }

    applyForestChoppingRules()
    {
        for (var k=0; k < _units.length; k++) {
            // PREHISTORY-CHOP-001, rules/prehostory.md: only workers in chop_forest state can chop.
            if (_units[k].state != 'chop_forest' || _units[k].unitTypeId != 'worker') {
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

            // PREHISTORY-CHOP-004, rules/prehostory.md: chopping duration is forest wildity plus two turns under current processing timing.
            if (_units[k].chop_turns_left == undefined) {
                _units[k].chop_turns_left = ((terrain>>4)&0x3) + 2;
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
        if (k == -1 || _units[k] == undefined || _units[k].unitTypeId != 'worker') {
            return false;
        }
        var i = _units[k].coord.i;
        var j = _units[k].coord.j;
        // PREHISTORY-CHOP-007, rules/prehostory.md: chop_forest state starts only on forest terrain.
        return this.isChoppableForestTerrain(_map_terrain_tex[i][j]);
    }

    canBuildRoad(k)
    {
        if (k == -1 || _units[k] == undefined || _units[k].unitTypeId != 'worker') {
            return false;
        }
        var i = _units[k].coord.i;
        var j = _units[k].coord.j;
        var terrainType = _map_terrain_tex[i][j]&0x0F;
        // PREHISTORY-ROAD-002, rules/prehostory.md: roads are land terrain modifiers and cannot be built on water.
        if (terrainType == 0) {
            return false;
        }
        // PREHISTORY-ROAD-005, rules/prehostory.md: mixed grass-water roads require Construction.
        if (terrainType == 7 && !_game_state.isTechnologyOpen('Construction')) {
            return false;
        }
        return true;
    }

    hasTerrainWaterSourceFlag(i, j)
    {
        var terrain = _map_terrain_tex[i][j];
        var terrainType = terrain&0x0F;
        // PREHISTORY-IRRIGATION-009, rules/prehostory.md: A marks water-source terrain for water-related tiles.
        return (terrain&0x80) != 0 && (terrainType == 0 || terrainType == 7);
    }

    isSeaConnectedWaterSource(i, j)
    {
        var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (var d=0; d < dirs.length; d++) {
            var ni = i + dirs[d][0];
            var nj = j + dirs[d][1];
            if (ni < 0 || ni >= _map_size || nj < 0 || nj >= _map_size) {
                continue;
            }
            var terrain = _map_terrain_tex[ni][nj];
            var terrainType = terrain&0x0F;
            var depth = (terrain>>4)&0x3;
            // PREHISTORY-IRRIGATION-007, rules/prehostory.md: water beside cardinal deep water belongs to sea and is not an irrigation source.
            if (terrainType == 0 && depth > 1) {
                return true;
            }
        }
        return false;
    }

    isIrrigationWaterSource(i, j)
    {
        var terrain = _map_terrain_tex[i][j];
        var terrainType = terrain&0x0F;
        var depth = (terrain>>4)&0x3;
        // PREHISTORY-IRRIGATION-005 and PREHISTORY-IRRIGATION-009, rules/prehostory.md: shallow water, mixed grass-water, and A-marked water sources are candidates.
        return this.hasTerrainWaterSourceFlag(i, j) || (terrainType == 0 && depth <= 1) || terrainType == 7;
    }

    hasIrrigationSourceNear(i, j)
    {
        for (var di=-1; di <= 1; di++) {
            for (var dj=-1; dj <= 1; dj++) {
                if (di == 0 && dj == 0) {
                    continue;
                }
                var ni = i + di;
                var nj = j + dj;
                if (ni < 0 || ni >= _map_size || nj < 0 || nj >= _map_size) {
                    continue;
                }
                var sourceTerrain = _map_terrain_tex[ni][nj];
                var sourceType = sourceTerrain&0x0F;
                // PREHISTORY-IRRIGATION-005 and PREHISTORY-IRRIGATION-009, rules/prehostory.md: mixed grass-water and A-marked water sources are already local sources.
                if (sourceType == 7 || this.hasTerrainWaterSourceFlag(ni, nj)) {
                    return true;
                }
                if (this.isIrrigationWaterSource(ni, nj) && !this.isSeaConnectedWaterSource(ni, nj)) {
                    return true;
                }
                // PREHISTORY-IRRIGATION-006, rules/prehostory.md: irrigation can extend from neighboring irrigation.
                if (_map.hasIrrigation(ni, nj)) {
                    return true;
                }
            }
        }
        return false;
    }

    canBuildIrrigation(k)
    {
        if (k == -1 || _units[k] == undefined || _units[k].unitTypeId != 'worker') {
            return false;
        }
        var i = _units[k].coord.i;
        var j = _units[k].coord.j;
        var terrainType = _map_terrain_tex[i][j]&0x0F;
        // PREHISTORY-IRRIGATION-002 and PREHISTORY-IRRIGATION-008, rules/prehostory.md: irrigation can be built only on grass terrain.
        if (terrainType != 2) {
            return false;
        }
        if (_map.hasIrrigation(i, j)) {
            return false;
        }
        return this.hasIrrigationSourceNear(i, j);
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
        if (unit.road_turns_left != undefined) {
            return true;
        }
        if (unit.irrigation_turns_left != undefined) {
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

    makeTurn()
    {
        _game.applyTurnProcessingRules(this);
    }

    startGame()
    {
        _start_game_point = _game.random_point();
        this.applyUnitStateRules();

        for(var k=0; k < _start_game_settlers; k++) {
            var point = _game.random_point(0, _start_game_point.add(-5,-5), _start_game_point.add(5,5));
            _game.createUnit(this.unitTypesById['settlers'], point, 0, 0);
        }
        for(var k=0; k < _start_game_explorers; k++) {
            var point = _game.random_point(0, _start_game_point.add(-5,-5), _start_game_point.add(5,5));
            _game.createUnit(this.unitTypesById['explorer'], point, 0, 0);
        }
        for(var k=0; k < _start_game_workers; k++) {
            var point = _game.random_point(0, _start_game_point.add(-5,-5), _start_game_point.add(5,5));
            _game.createUnit(this.unitTypesById['worker'], point, 0, 0);
        }

        this.centerViewOnStartingUnits();

        this.applyUnitStateRules();
        _game.makeTurn(false);
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
        if (command == 'road' && this.canBuildRoad(_selection)) {
            this.setUnitState(_selection, command);
        }
        if (command == 'irrigate' && this.canBuildIrrigation(_selection)) {
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

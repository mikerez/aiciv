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
    { id: 'gems', name: 'Gems', texture: 845, sprite: 'resource_gems.png', gives: 'valuable minerals for luxury and trade', terrains: [4, 5], chance: 0.006 },

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

const _resource_improvement_requirements = _economics.resourceImprovementRequirements();

_screen.loadTexture('settler.png', 256);
_screen.loadTexture('explorer.png', 257);
_screen.loadTexture('Warior.png', 258);
_screen.loadTexture('city.png', 259);
_screen.loadTexture('slinger.png', 260);
_screen.loadTexture('Archer.png', 261);
_screen.loadTexture('Spearman.png', 262);
_screen.loadTexture('Horseman.png', 263);
_screen.loadTexture('Chariot.png', 264);
_screen.loadTexture('WarElephant.png', 265);
_screen.loadTexture('unit_catapult.png', 266);
_screen.loadTexture('Trebuchet.png', 267);
_screen.loadTexture('unit_galley.png', 268);
_screen.loadTexture('unit_galleon.png', 269);
_screen.loadTexture('worker.png', 270);
_screen.loadTexture('WorkBoat.png', 271);
_screen.loadTexture('Frigate.png', 272);
_screen.loadTexture('Knight.png', 273);
_screen.loadTexture('Pikeman.png', 274);
_screen.loadTexture('Longbow.png', 275);
_screen.loadTexture('Fencer.png', 276);
_screen.loadTexture('Swordsman.png', 277);
_screen.loadTexture('Trireme.png', 278);
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
    new UnitType('archer', 'Archer', 2, 261, 3, 1, 1, 2, 'Archery', 35, null),
    new UnitType('spearman', 'Spearman', 2, 262, 2, 3, 1, 2, 'Bronze Working', 35, 'Copper'),
    new UnitType('horseman', 'Horseman', 2, 263, 4, 2, 2, 3, 'Horseback Riding', 50, 'Horses'),
    new UnitType('chariot', 'Chariot', 2, 264, 3, 2, 2, 3, 'Wheel', 45, 'Horses'),
    new UnitType('elephant', 'Elephant', 2, 265, 5, 4, 2, 3, 'Horseback Riding', 70, 'Ivory'),
    new UnitType('catapult', 'Catapult', 2, 266, 5, 1, 1, 2, 'Construction', 60, null),
    new UnitType('trebuchet', 'Trebuchet', 2, 267, 7, 1, 1, 2, 'Engineering', 80, null),
    new UnitType('galley', 'Galley', 2, 268, 2, 2, 2, 3, 'Sailing', 40, null, true, 'water'),
    new UnitType('galleon', 'Galleon', 2, 269, 5, 4, 3, 4, 'Navigation', 90, null, true, 'water'),
    new UnitType('workboat', 'WorkBoat', 1, 271, 0, 1, 2, 3, 'Sailing', 30, null, true, 'water'),
    new UnitType('frigate', 'Frigate', 2, 272, 6, 5, 3, 4, 'Shipbuilding', 100, 'Iron', true, 'water'),
    new UnitType('knight', 'Knight', 2, 273, 6, 5, 2, 3, 'Engineering', 85, 'Horses'),
    new UnitType('pikeman', 'Pikeman', 2, 274, 4, 6, 1, 2, 'Iron Working', 55, 'Iron'),
    new UnitType('longbow', 'Longbow', 2, 275, 5, 3, 1, 3, 'Archery', 55, null),
    new UnitType('fencer', 'Fencer', 2, 276, 4, 3, 2, 2, 'Bronze Working', 45, null),
    new UnitType('swordsman', 'Swordsman', 2, 277, 7, 5, 1, 2, 'Iron Working', 75, 'Iron'),
    new UnitType('trireme', 'Trireme', 2, 278, 1, 1, 2, 3, 'Sailing', 30, null, true, 'water'),
];

// game settings
_start_game_settlers = 1;
_start_game_explorers = 3;
_start_game_workers = 0;
_start_game_point = new Coord(0,0);
_temporary_test_start_distance = 10;
_temporary_test_start_base = null;
const _tile_movable_unit_limit = 5;
// game state
_prehistory_command_mode = null;
_prehistory_action_menu_dismissed = false;


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
                var settler = _units[_selection];
                if (typeof _server_game !== 'undefined' && settler.serverId) {
                    if (settler.serverActionPending) return;
                    settler.serverActionPending = true;
                    _selection = -1;
                    var hiddenBuildCity = _server_game.hiddenActions;
                    _server_game.buildCity(settler).catch(function(error) {
                        settler.serverActionPending = false;
                        if (typeof _server_game !== 'undefined' && !hiddenBuildCity) {
                            _server_game.log('Build City rejected: ' + error.message);
                            return _server_game.loadUpdates(settler.team);
                        }
                    });
                    return;
                }
                this.removeDestroyedCityAt(_units[_selection].coord);
                _game.make_unit(_city, _units[_selection].coord);
                _units[_units.length - 1].team = _units[_selection].team;
                // PREHISTORY-BUILD-009, rules/prehostory.md: a built city starts with road and irrigation on its tile.
                _map.addRoad(_units[_units.length - 1].coord.i, _units[_units.length - 1].coord.j);
                _map.addIrrigation(
                    _units[_units.length - 1].coord.i,
                    _units[_units.length - 1].coord.j,
                    this.hasFreshWaterNear(_units[_units.length - 1].coord.i, _units[_units.length - 1].coord.j)
                );
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

    usesCompactActionMenu()
    {
        return document.body && document.body.classList && document.body.classList.contains('phone-ui');
    }

    dismissActionMenu()
    {
        if (!this.usesCompactActionMenu()) {
            return;
        }
        _prehistory_action_menu_dismissed = true;
        var menu = document.getElementById('foreground');
        if (menu) {
            menu.style.display = 'none';
        }
    }

    showActionMenuForSelection()
    {
        _prehistory_action_menu_dismissed = false;
        this.applyMenuRules();
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
            if (this.usesCompactActionMenu()) {
                menu.style.display = 'none';
                _prehistory_action_menu_dismissed = false;
            }
            return;
        }

        // PREHISTORY-MENU-011, rules/prehostory.md: an issued order dismisses the whole action panel until selection occurs again.
        if (this.usesCompactActionMenu() && _prehistory_action_menu_dismissed) {
            menu.style.display = 'none';
            return;
        }
        if (this.usesCompactActionMenu()) {
            menu.style.display = 'block';
        }

        var unit = _units[_selection];
        var show = function(name) {
            var elements = menu.querySelectorAll('[data-menu-option="' + name + '"]');
            for (var i=0; i < elements.length; i++) {
                elements[i].style.display = '';
            }
        };

        this.updateCityProductionMenu(menu, unit);
        this.updateUnitFeatureMenu(menu, unit);
        show('unit_identity');

        // PREHISTORY-MENU-002, rules/prehostory.md: movable units show movement-related commands.
        if (unit.can_move) {
            show('unit_features');
            show('goto');
            if (unit.unitTypeId != 'worker') {
                show('fortificate');
            }
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
            var buildings = this.workerTileBuildingMenuOptions(_selection);
            for (var b=0; b < buildings.length; b++) {
                show(buildings[b]);
            }
            if (this.canBuildRoad(_selection)) {
                show('road');
            }
            if (this.canUseRoadTo(_selection)) {
                show('road_to');
            }
            if (this.canBuildIrrigation(_selection)) {
                show('irrigate');
            }
            if (this.canChopForest(_selection)) {
                show('chop_forest');
            }
        }
        if (unit.unitTypeId == 'workboat' && this.canBuildNetwork(_selection)) {
            show('network');
        }

        // PREHISTORY-MENU-004, rules/prehostory.md: cities show building management options and hide movement commands.
        if (unit.type == 3) {
            show('city_production_status');
            show('city_production_queue');
            show('city_production_options');
        }
    }

    updateUnitFeatureMenu(menu, unit)
    {
        var identity = menu.querySelector('[data-menu-option="unit_identity"]');
        if (identity) {
            var group = this.commandSelectionIndices();
            identity.textContent = group.length > 1
                ? 'Selected military units: ' + group.length
                : 'Unit ID: ' + (unit && unit.serverId != undefined && unit.serverId != null ? unit.serverId : 'pending');
        }
        var features = menu.querySelector('[data-menu-option="unit_features"]');
        if (!features) {
            return;
        }
        if (!unit || !unit.can_move) {
            features.textContent = '';
            return;
        }
        var unitType = this.unitTypesById[unit.unitTypeId] || unit;
        var attack = unit.attack != undefined ? unit.attack : (unitType.attack || 0);
        var defense = unit.defense != undefined ? unit.defense : (unitType.defense || 0);
        var speed = unit.speed != undefined ? unit.speed : (unitType.speed || 0);
        var maxHealth = unit.maxHealth || 100;
        var health = unit.health == undefined ? maxHealth : unit.health;
        var experience = unit.experience == undefined ? 1 : unit.experience;
        features.textContent = 'A:' + attack + ' D:' + defense + ' Steps:' + speed
            + ' HP:' + health + '/' + maxHealth + ' XP:' + experience;
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

    canBuildNetwork(k)
    {
        if (k == -1 || !_units[k] || _units[k].unitTypeId != 'workboat') return false;
        var i = _units[k].coord.i;
        var j = _units[k].coord.j;
        return this.isWaterTerrain(i, j)
            && _game_state.isTechnologyOpen('Sailing')
            && !_map.hasTerrainModifier(i, j, 'network');
    }

    transportCapacity(unitTypeId)
    {
        return unitTypeId == 'galley' ? 2 : (unitTypeId == 'frigate' ? 4 : 0);
    }

    transportStateAt(i, j, team, movingUnit)
    {
        var result = { capacity: 0, passengers: 0 };
        var lists = typeof _units_by_user != 'undefined' ? _units_by_user : { current: _units };
        var seen = [];
        for (var ownerId in lists) {
            var list = lists[ownerId] || [];
            for (var n=0; n < list.length; n++) {
                var unit = list[n];
                if (!unit || unit === movingUnit || seen.indexOf(unit) != -1 || !unit.coord
                    || unit.health <= 0 || unit.coord.i != i || unit.coord.j != j) continue;
                seen.push(unit);
                var unitTeam = unit.team == undefined ? parseInt(ownerId, 10) : unit.team;
                if (unitTeam != team) continue;
                result.capacity += this.transportCapacity(unit.unitTypeId);
                var type = this.unitTypesById[unit.unitTypeId];
                if (unit.can_move !== false && unit.type != 3 && !this.isWaterUnitType(type)) result.passengers++;
            }
        }
        return result;
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
        // PREHISTORY-BUILD-008, rules/prehostory.md: technology-required units need their technology opened before production.
        if (unitType.technologyRequired && !_game_state.isTechnologyOpen(unitType.technologyRequired)) {
            return false;
        }
        if (!this.cityHasProductionResources(city, unitType.id)) {
            return false;
        }
        if (!this.isWaterUnitType(unitType)) return true;
        // PREHISTORY-BUILD-007, rules/prehostory.md: water units can be produced only in seaside cities.
        return this.isSeasideCity(city);
    }

    productionResourceRequirements()
    {
        // Mirrored by serverProductionResourceRequirements() in server_game.php.
        return {
            horseman: ['horses'],
            knight: ['horses', 'iron'],
            chariot: ['horses'],
            elephant: ['ivory'],
            spearman: ['copper'],
            pikeman: ['iron'],
            swordsman: ['iron'],
        };
    }

    connectedRoadResources(city)
    {
        var found = {};
        if (!city || !city.coord) return found;
        var directions = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1]];
        var queue = [{ i: city.coord.i, j: city.coord.j }];
        var visited = {};
        while (queue.length) {
            var point = queue.shift();
            var key = point.i + ':' + point.j;
            if (visited[key] || point.i < 0 || point.j < 0 || point.i >= _map_size || point.j >= _map_size) continue;
            var isOrigin = point.i == city.coord.i && point.j == city.coord.j;
            var modifiers = _map_terrain_mod[point.i] && _map_terrain_mod[point.i][point.j];
            if (!isOrigin && (!modifiers || !modifiers.road)) continue;
            visited[key] = true;
            var resourceState = _map_resource[point.i] && _map_resource[point.i][point.j];
            var resourceVisible = !_map.isResourceVisible || _map.isResourceVisible(point.i, point.j);
            if (resourceState && resourceState.type && resourceVisible && _resource_types[resourceState.type]) {
                found[_resource_types[resourceState.type].id] = true;
            }
            for (var n=0; n < directions.length; n++) {
                queue.push({ i: point.i + directions[n][0], j: point.j + directions[n][1] });
            }
        }
        return found;
    }

    cityHasProductionResources(city, unitTypeId)
    {
        var required = this.productionResourceRequirements()[unitTypeId] || [];
        if (!required.length) return true;
        var connected = this.connectedRoadResources(city);
        for (var n=0; n < required.length; n++) {
            if (!connected[required[n]]) return false;
        }
        return true;
    }

    tileUnitStackState(movingUnit, i, j)
    {
        var state = { count: 0, hasVisibleForeignDefender: false };
        var movingTeam = movingUnit.team == undefined ? _current_user : movingUnit.team;
        var lists = typeof _units_by_user != 'undefined' ? _units_by_user : { current: _units };
        var seen = [];
        for (var ownerId in lists) {
            var list = lists[ownerId] || [];
            for (var n=0; n < list.length; n++) {
                var occupant = list[n];
                if (!occupant || seen.indexOf(occupant) != -1 || !occupant.coord
                    || occupant.health <= 0 || occupant.coord.i != i || occupant.coord.j != j) continue;
                seen.push(occupant);
                var occupantTeam = occupant.team == undefined ? parseInt(ownerId, 10) : occupant.team;
                var isForeign = occupantTeam != movingTeam;
                if (isForeign && (occupant.hiddenOnMap || (occupant.serverVisibilityByUser
                    && Object.prototype.hasOwnProperty.call(occupant.serverVisibilityByUser, movingTeam)
                    && occupant.serverVisibilityByUser[movingTeam] === false))) continue;
                var isMovable = occupant.can_move !== false && occupant.type != 3;
                if (isMovable) state.count++;
                if (isForeign && (isMovable || occupant.type == 3)) {
                    state.hasVisibleForeignDefender = true;
                }
            }
        }
        return state;
    }

    canUnitEnterTile(k, i, j)
    {
        if (k == -1 || _units[k] == undefined || i < 0 || i >= _map_size || j < 0 || j >= _map_size) {
            return false;
        }
        var isWater = this.isWaterTerrain(i, j);
        var unitType = this.unitTypesById[_units[k].unitTypeId];
        var terrainAllowed;
        if (this.isWaterUnitType(unitType)) {
            // PREHISTORY-MOVE-004, rules/prehostory.md: water units move only on water.
            terrainAllowed = isWater;
        }
        else {
            var startsOnWater = this.isWaterTerrain(_units[k].coord.i, _units[k].coord.j);
            if (!isWater) {
                // A carried land unit can always disembark onto adjacent land.
                terrainAllowed = true;
            }
            else if (!startsOnWater) {
                var team = _units[k].team == undefined ? _current_user : _units[k].team;
                var transport = this.transportStateAt(i, j, team, _units[k]);
                terrainAllowed = transport.passengers < transport.capacity;
            }
            else {
                // Water-to-water movement belongs to the carrying ship.
                terrainAllowed = false;
            }
        }
        if (!terrainAllowed) return false;
        // PREHISTORY-MOVE-006: a full Tile blocks ordinary movement, but never
        // prevents a military unit from issuing an attack against its occupants.
        var movingUnit = _units[k];
        var stack = this.tileUnitStackState(movingUnit, i, j);
        return stack.count < _tile_movable_unit_limit
            || (movingUnit.type == 2 && stack.hasVisibleForeignDefender);
    }

    setCityProduction(k, unitTypeId)
    {
        if (k == -1 || _units[k] == undefined || _units[k].type != 3) {
            return;
        }
        var city = _units[k];
        if (unitTypeId == null || unitTypeId == 'none') {
            city.productionQueue = [];
            city.production = null;
            city.productionDisabled = true;
            this.sendCityProductionSelection(city, null);
            return;
        }
        if (this.unitTypesById[unitTypeId] == undefined) {
            return;
        }
        if (typeof _game !== 'undefined' && _game.canStartCityProduction && !_game.canStartCityProduction(_units[k], unitTypeId)) {
            return;
        }
        var unitType = this.unitTypesById[unitTypeId];
        if (!this.canCityProduceUnit(_units[k], unitType)) {
            return;
        }
        if (city.cityProperties == null) {
            city.cityProperties = new CityProperties();
        }
        city.cityProperties.productionStored = 0;
        if (!Array.isArray(city.productionQueue)) {
            city.productionQueue = city.production ? [city.production.unitTypeId] : [];
        }
        city.productionQueue.push(unitTypeId);
        if (city.production == null) {
            city.production = new CityProductionState(unitTypeId);
            city.production.productionPoints = 0;
        }
        city.productionDisabled = false;
        this.sendCityProductionSelection(city, unitTypeId);
    }

    removeCityProduction(city, queueIndex)
    {
        if (!city || !Array.isArray(city.productionQueue)
            || queueIndex < 0 || queueIndex >= city.productionQueue.length) {
            return;
        }
        var removedCurrent = queueIndex == 0;
        city.productionQueue.splice(queueIndex, 1);
        if (city.productionQueue.length) {
            var accumulated = !removedCurrent && city.production ? city.production.productionPoints : 0;
            city.production = new CityProductionState(city.productionQueue[0]);
            city.production.productionPoints = accumulated;
        }
        else {
            city.production = null;
        }
        if (typeof _server_game === 'undefined' || !city.serverId) return;
        _server_game.removeProduction(city, queueIndex).catch(function(error) {
            _server_game.log('Production removal rejected: ' + error.message);
            _server_game.unitRevisionByPlayer[city.team] = 0;
            return _server_game.loadUpdates(city.team);
        });
    }

    sendCityProductionSelection(city, unitTypeId)
    {
        if (typeof _server_game === 'undefined' || !city || !city.serverId) return;
        var hiddenProduction = _server_game.hiddenActions;
        _server_game.selectProduction(city, unitTypeId).catch(function(error) {
            if (!hiddenProduction) {
                _server_game.log('Production selection rejected: ' + error.message);
                _server_game.unitRevisionByPlayer[city.team] = 0;
                return _server_game.loadUpdates(city.team);
            }
        });
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
                    economyText = ' Pop:' + unit.economy.citizens.length + ' F:' + unit.economy.lastIncome.food + ' P:' + unit.economy.lastIncome.production + ' M:' + unit.economy.lastIncome.money + ' Eat:' + unit.economy.foodConsumption + ' Growth:' + unit.economy.turnsToNewCitizen;
                }
                status.textContent = 'Producing: ' + unitType.name + ' (' + this.productionTurnsLeft(unit) + ' turns)' + economyText;
            }
            else if (unit.type == 3) {
                if (typeof _city_economy !== 'undefined') {
                    _city_economy.ensureCity(unit);
                    status.textContent = 'Producing: ' + (unit.productionDisabled ? 'none' : 'none selected') + ' Pop:' + unit.economy.citizens.length + ' F:' + unit.economy.lastIncome.food + ' P:' + unit.economy.lastIncome.production + ' M:' + unit.economy.lastIncome.money + ' Eat:' + unit.economy.foodConsumption + ' Growth:' + unit.economy.turnsToNewCitizen;
                }
                else {
                    status.textContent = 'Producing: none';
                }
            }
            else {
                status.textContent = '';
            }
        }

        var queueElement = menu.querySelector('[data-menu-option="city_production_queue"]');
        if (queueElement) {
            queueElement.innerHTML = '';
            var queue = unit.type == 3 && Array.isArray(unit.productionQueue)
                ? unit.productionQueue
                : unit.type == 3 && unit.production ? [unit.production.unitTypeId] : [];
            if (unit.type == 3) {
                var queueTitle = document.createElement('div');
                queueTitle.textContent = queue.length ? 'Backlog:' : 'Backlog: empty';
                queueElement.appendChild(queueTitle);
                for (var queueIndex=0; queueIndex < queue.length; queueIndex++) {
                    var queuedType = this.unitTypesById[queue[queueIndex]];
                    var row = document.createElement('div');
                    row.style.cursor = 'context-menu';
                    row.style.whiteSpace = 'nowrap';
                    row.textContent = (queueIndex + 1) + '. '
                        + (queuedType ? queuedType.name : queue[queueIndex])
                        + (queueIndex == 0 ? ' (current)' : '');
                    row.setAttribute('data-production-queue-index', queueIndex);
                    row.addEventListener('contextmenu', function(event) {
                        event.preventDefault();
                        event.stopPropagation();
                        var index = parseInt(this.getAttribute('data-production-queue-index'), 10);
                        _current_game.removeCityProduction(unit, index);
                        _current_game.applyMenuRules();
                    });
                    queueElement.appendChild(row);
                }
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

        var none = document.createElement('a');
        none.setAttribute('data-menu-command', 'produce_unit:none');
        none.style.display = 'block';
        none.style.cursor = 'pointer';
        none.style.marginBottom = '6px';
        none.onmouseover = function() { this.style.backgroundColor = 'orange'; };
        none.onmouseout = function() { this.style.backgroundColor = ''; };
        none.textContent = 'Clear backlog';
        options.appendChild(none);

        if (typeof _game_state !== 'undefined' && _game_state && _game_state.money < 0) {
            var blocked = document.createElement('div');
            blocked.style.marginTop = '6px';
            blocked.style.color = 'darkred';
            blocked.textContent = 'Production blocked: negative money account';
            options.appendChild(blocked);
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

    setUnitState(k, state, preserveAutomation = false)
    {
        if (k == -1 || _units[k] == undefined) {
            return;
        }
        _units[k].state = state;
        _units[k].gotoCoord = null;
        _units[k].gotoPath = [];
        _units[k].pendingServerPath = [];
        if (!preserveAutomation && state != 'explore' && state != 'patrol' && state != 'automate') {
            _units[k].automationMode = null;
        }
        if (state != 'chop_forest') {
            _units[k].chop_turns_left = undefined;
        }
        if (state != 'road') {
            _units[k].road_turns_left = undefined;
        }
        if (state != 'irrigate') {
            _units[k].irrigation_turns_left = undefined;
        }
        if (!this.workerTileBuildingDefinitions[state]) {
            _units[k].building_turns_left = undefined;
        }
        if (typeof _server_game != 'undefined') _server_game.saveClientRoutes(_current_user);
    }

    prepareManualMovement(k)
    {
        if (k == -1 || _units[k] == undefined || !_units[k].can_move) {
            return;
        }
        // PREHISTORY-STATE-007, rules/prehostory.md: manual movement clears any modified unit state.
        var indices = this.commandSelectionIndices();
        for (var n=0; n < indices.length; n++) this.setUnitState(indices[n], 'ready');
        this.applyMenuRules();
    }

    commandSelectionIndices()
    {
        if (typeof _multi_selection != 'undefined' && _multi_selection.length) {
            var selected = _multi_selection.filter(function(index) {
                return _units[index] && _units[index].type == 2 && _units[index].can_move;
            });
            if (selected.length) return selected;
        }
        return _selection != -1 && _units[_selection] ? [_selection] : [];
    }

    hasMilitaryGroupSelection()
    {
        return typeof _multi_selection != 'undefined' && this.commandSelectionIndices().length > 1;
    }

    drawCommandPathPreview(coord)
    {
        var indices = this.commandSelectionIndices();
        if (indices.length > 1) _control.drawGotoGroup(indices, coord.i, coord.j);
        else if (indices.length == 1) {
            var k = indices[0];
            _control.drawGoto(_units[k].coord.i, _units[k].coord.j, coord.i, coord.j, k);
        }
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
        _units[k].pendingServerPath = [];
        if (typeof _server_game != 'undefined') _server_game.saveClientRoutes(_current_user);
    }

    visibleForeignOwnersAt(movingUnit, coord)
    {
        var owners = [];
        if (!movingUnit || !coord || typeof _units_by_user == 'undefined') return owners;
        var movingTeam = movingUnit.team == undefined ? _current_user : Number(movingUnit.team);
        for (var ownerId in _units_by_user) {
            var list = _units_by_user[ownerId] || [];
            for (var n=0; n < list.length; n++) {
                var occupant = list[n];
                if (!occupant || !occupant.coord || Number(occupant.health) <= 0
                    || occupant.coord.i != coord.i || occupant.coord.j != coord.j) continue;
                var occupantTeam = occupant.team == undefined ? Number(ownerId) : Number(occupant.team);
                if (occupantTeam == movingTeam || occupant.hiddenOnMap) continue;
                if (occupant.serverVisibilityByUser
                    && Object.prototype.hasOwnProperty.call(occupant.serverVisibilityByUser, movingTeam)
                    && occupant.serverVisibilityByUser[movingTeam] === false) continue;
                if (owners.indexOf(occupantTeam) == -1) owners.push(occupantTeam);
            }
        }
        return owners;
    }

    movementRelation(ownerId, otherId)
    {
        if (typeof _server_game != 'undefined' && _server_game.directionalRelation) {
            return _server_game.directionalRelation(ownerId, otherId);
        }
        if (typeof _military != 'undefined' && _military.isAtWar(ownerId, otherId)) return 'enemy';
        return 'neutral';
    }

    configureMovementIntent(k, coord)
    {
        var unit = _units[k];
        if (!unit || !coord) return;
        unit.interactionIntent = null;
        unit.interactionTargetOwnerId = null;
        unit.attackTargetOwnerId = null;
        var ownerId = unit.team == undefined ? _current_user : Number(unit.team);
        var foreignOwners = this.visibleForeignOwnersAt(unit, coord);
        if (!foreignOwners.length) return;

        var enemyOwner = null;
        var neutralOwner = null;
        for (var n=0; n < foreignOwners.length; n++) {
            var relation = this.movementRelation(ownerId, foreignOwners[n]);
            if (relation == 'enemy' || relation == 'war') enemyOwner = foreignOwners[n];
            else if (relation != 'friend' && neutralOwner == null) neutralOwner = foreignOwners[n];
        }
        if (enemyOwner != null) {
            unit.interactionIntent = 'attack';
            unit.interactionTargetOwnerId = enemyOwner;
        }
        else if (neutralOwner != null && typeof _military != 'undefined' && _military.isMilitary(unit)) {
            var attack = window.confirm(
                'Neutral civilization occupies the destination.\n\nOK: attack\nCancel: move to the same tile peacefully'
            );
            unit.interactionIntent = attack ? 'attack' : 'coexist';
            unit.interactionTargetOwnerId = neutralOwner;
        }
        else {
            // Friendly occupants and civilian movement always coexist peacefully.
            unit.interactionIntent = 'coexist';
            unit.interactionTargetOwnerId = foreignOwners[0];
        }
        if (typeof _server_game != 'undefined') _server_game.saveClientRoutes(_current_user);
    }

    configureSelectedMovementIntent(coord)
    {
        var indices = this.commandSelectionIndices();
        for (var n=0; n < indices.length; n++) this.configureMovementIntent(indices[n], coord);
    }

    nearestHiddenLandTarget(k)
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
                            return { target: new Coord(i, j), path: path };
                        }
                    }
                }
            }
        }
        return null;
    }

    nearestCityOrSettlerExploreTarget(k)
    {
        var best = null;
        var bestDistance = Infinity;
        var lists = [];
        if (typeof _units_by_user != 'undefined') {
            for (var userId in _units_by_user) {
                lists.push(_units_by_user[userId]);
            }
        }
        else {
            lists.push(_units);
        }
        for (var listIndex=0; listIndex < lists.length; listIndex++) {
            var list = lists[listIndex] || [];
            for (var n=0; n < list.length; n++) {
                var targetUnit = list[n];
                if (targetUnit == undefined || (targetUnit.type != 3 && targetUnit.unitTypeId != 'settlers')) {
                    continue;
                }
                if ((_map_terrain_bit[targetUnit.coord.i][targetUnit.coord.j]&0x4000) == 0) {
                    continue;
                }
                var distance = Math.abs(targetUnit.coord.i - _units[k].coord.i)
                    + Math.abs(targetUnit.coord.j - _units[k].coord.j);
                if (distance <= 3) {
                    continue;
                }
                if (distance >= bestDistance) {
                    continue;
                }
                var path = this.buildPath(k, targetUnit.coord);
                if (!path.length) {
                    continue;
                }
                bestDistance = distance;
                best = { target: new Coord(targetUnit.coord.i, targetUnit.coord.j), path: path };
            }
        }
        return best;
    }

    autoRouteExplore(k)
    {
        // PREHISTORY-AUTO-001, rules/prehostory.md: Explore splits routing between nearby black area and nearest city/settler.
        var preferHidden = Math.random() < 0.5;
        var first = preferHidden ? this.nearestHiddenLandTarget(k) : this.nearestCityOrSettlerExploreTarget(k);
        var second = preferHidden ? this.nearestCityOrSettlerExploreTarget(k) : this.nearestHiddenLandTarget(k);
        var route = first || second;
        if (route && route.path.length) {
            this.assignPath(k, route.path);
            return;
        }
        this.autoRouteAutomate(k);
    }

    autoRoutePatrol(k)
    {
        var enemyRoute = this.nearestVisiblePatrolEnemy(k);
        if (enemyRoute) {
            this.assignPath(k, enemyRoute.path);
            return;
        }
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

    nearestVisiblePatrolEnemy(k)
    {
        var patrol = _units[k];
        if (!patrol || patrol.type != 2 || typeof _military == 'undefined') return null;
        var best = null;
        var lists = typeof _units_by_user != 'undefined' ? _units_by_user : { 0: _units };
        for (var ownerId in lists) {
            var list = lists[ownerId] || [];
            for (var n=0; n < list.length; n++) {
                var target = list[n];
                if (!target || !target.coord || target.health === 0 || target.hiddenOnMap) continue;
                var targetTeam = target.team == undefined ? parseInt(ownerId, 10) : target.team;
                if (!_military.isAtWar(patrol.team || 0, targetTeam)) continue;
                var visible = typeof _map_terrain_bit == 'undefined'
                    || ((_map_terrain_bit[target.coord.i][target.coord.j] & 0x0400) != 0);
                if (!visible) continue;
                var path = this.buildPath(k, target.coord);
                if (!path.length || (best && path.length >= best.path.length)) continue;
                best = { target: new Coord(target.coord.i, target.coord.j), path: path };
            }
        }
        return best;
    }

    workerAutomationOptionsAt(k, i, j)
    {
        if (k == -1 || !_units[k] || _units[k].unitTypeId != 'worker') return [];
        var original = _units[k].coord;
        _units[k].coord = new Coord(i, j);
        try {
            var available = this.workerTileBuildingMenuOptions(k);
            var resourceImprovement = this.openedResourceImprovementForTile(i, j);
            var priority = [];
            if (resourceImprovement && available.indexOf(resourceImprovement) != -1) {
                priority.push(resourceImprovement);
            }
            if (this.canBuildIrrigation(k)) priority.push('irrigate');
            var order = ['mine', 'farm', 'pasture', 'plantation', 'camp', 'fishing_boats',
                'quarry', 'winery', 'cottage', 'workshop', 'fortification'];
            for (var n=0; n < order.length; n++) {
                if (available.indexOf(order[n]) != -1 && priority.indexOf(order[n]) == -1) {
                    priority.push(order[n]);
                }
            }
            if (this.canBuildRoad(k)) priority.push('road');
            if (this.canChopForest(k)) priority.push('chop_forest');
            return priority;
        }
        finally {
            _units[k].coord = original;
        }
    }

    autoRouteWorker(k)
    {
        // PREHISTORY-AUTO-006, rules/prehostory.md: an automated Worker searches its 5x5 neighborhood.
        var currentOptions = this.workerAutomationOptionsAt(k, _units[k].coord.i, _units[k].coord.j);
        if (currentOptions.length) {
            this.setUnitState(k, currentOptions[0], true);
            return true;
        }
        var best = null;
        for (var di=-2; di <= 2; di++) {
            for (var dj=-2; dj <= 2; dj++) {
                if (di == 0 && dj == 0) continue;
                var i = _units[k].coord.i + di;
                var j = _units[k].coord.j + dj;
                if (i < 0 || i >= _map_size || j < 0 || j >= _map_size) continue;
                var options = this.workerAutomationOptionsAt(k, i, j);
                if (!options.length) continue;
                var path = this.buildPath(k, new Coord(i, j));
                if (!path.length) continue;
                var candidate = { path: path, action: options[0] };
                if (!best || candidate.path.length < best.path.length) best = candidate;
            }
        }
        if (!best) return false;
        _units[k].automateBuild = best.action;
        this.assignPath(k, best.path);
        return true;
    }

    autoRouteAutomate(k)
    {
        if (_units[k].unitTypeId == 'worker' && this.autoRouteWorker(k)) {
            return;
        }
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
            // PREHISTORY-AUTO-001, rules/prehostory.md: explore alternates between nearby fog and nearest known city.
            var mode = _units[k].automationMode || _units[k].state;
            if (mode == 'explore') {
                _units[k].state = 'explore';
                this.autoRouteExplore(k);
            }
            // PREHISTORY-AUTO-002, rules/prehostory.md: patrol routes around its patrol origin.
            if (mode == 'patrol') {
                _units[k].state = 'patrol';
                this.autoRoutePatrol(k);
            }
            // PREHISTORY-AUTO-003, rules/prehostory.md: automate chooses a nearby available land route.
            if (mode == 'automate') {
                _units[k].state = 'automate';
                this.autoRouteAutomate(k);
            }
        }
    }

    applyTerrainModifierRules()
    {
        for (var k=0; k < _units.length; k++) {
            if (_units[k].state == 'road_to' && _units[k].unitTypeId == 'worker'
                && (!(_units[k].gotoPath && _units[k].gotoPath.length) && _units[k].gotoCoord == undefined)) {
                _units[k].state = 'ready';
            }
        }

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

            // PREHISTORY-IRRIGATION-003, rules/prehostory.md: irrigation takes twice the terrain wildity, with a minimum of two turns.
            if (_units[k].irrigation_turns_left == undefined) {
                _units[k].irrigation_turns_left = Math.max(2, 2*((terrain>>4)&0x3));
            }
            if (_units[k].irrigation_turns_left > 0) {
                --_units[k].irrigation_turns_left;
            }

            if (_units[k].irrigation_turns_left == 0) {
                // PREHISTORY-IRRIGATION-004, rules/prehostory.md: completed irrigation sets the irrigation modifier on the tile.
                _map.addIrrigation(i, j);
                this.enableNeighborCityIrrigationFood(i, j);
                _units[k].state = 'ready';
                _units[k].irrigation_turns_left = undefined;
                _fulldraw = 1;
            }
        }

        for (var k=0; k < _units.length; k++) {
            var building = this.workerTileBuildingDefinitions[_units[k].state];
            // PREHISTORY-WORKER-BUILDING-001, rules/prehostory.md: only workers in a tile-building state can build worker buildings.
            if (!building || _units[k].unitTypeId != 'worker') {
                continue;
            }

            var i = _units[k].coord.i;
            var j = _units[k].coord.j;

            // PREHISTORY-WORKER-BUILDING-003, rules/prehostory.md: worker building can progress only while supported on the current tile.
            if (!this.canBuildWorkerTileBuilding(k, _units[k].state)) {
                _units[k].state = 'ready';
                _units[k].building_turns_left = undefined;
                continue;
            }

            if (_units[k].building_turns_left == undefined) {
                _units[k].building_turns_left = building.turns;
            }
            if (_units[k].building_turns_left > 0) {
                --_units[k].building_turns_left;
            }

            if (_units[k].building_turns_left == 0) {
                building.apply(i, j);
                _units[k].state = 'ready';
                _units[k].building_turns_left = undefined;
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
            if (!this.canChopForest(k)) {
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
                this.addChopProductionToNearestCity(_units[k], 10);
                // PREHISTORY-CHOP-005 and PREHISTORY-CHOP-008, rules/prehostory.md: completed chopping converts forest to base terrain.
                _map_terrain_tex[i][j] = this.choppedForestTerrain(terrain);
                _map_terrain_bit[i][j] &= 0xFFF0;
                _units[k].state = 'ready';
                _units[k].chop_turns_left = undefined;
                _fulldraw = 1;
            }
        }
    }

    addChopProductionToNearestCity(worker, production)
    {
        if (!worker || production <= 0) {
            return false;
        }
        var city = this.findNearestOwnedCity(worker.coord, worker.team);
        if (!city) {
            return false;
        }
        if (city.cityProperties == null) {
            city.cityProperties = new CityProperties();
        }
        city.cityProperties.productionStored = 0;
        // PREHISTORY-CHOP-010 and MAIN-CITY-004, rules: chopping adds production to the nearest city account.
        if (city.production != null) {
            city.production.productionPoints += production;
        }
        // Production is credited only to an active task; idle Cities store none.
        return true;
    }

    findNearestOwnedCity(coord, team)
    {
        var best = null;
        var bestDistance = Infinity;
        for (var k=0; k < _units.length; k++) {
            var city = _units[k];
            if (!city || city.type != 3 || city.team != team || !city.coord) continue;
            var distance = this.hexDistance(city.coord.i - coord.i, city.coord.j - coord.j);
            if (distance < bestDistance) {
                best = city;
                bestDistance = distance;
            }
        }
        return best;
    }

    removeDestroyedCityAt(coord)
    {
        if (!coord) return false;
        for (var k=_units.length - 1; k >= 0; k--) {
            var unit = _units[k];
            if (unit && unit.unitTypeId == 'destroyed_city' && unit.coord
                && unit.coord.i == coord.i && unit.coord.j == coord.j) {
                _units.splice(k, 1);
                return true;
            }
        }
        return false;
    }

    findFirstCityInRange(coord, radius, team)
    {
        for (var r=0; r <= radius; r++) {
            for (var di=-r; di <= r; di++) {
                for (var dj=-r; dj <= r; dj++) {
                    if (Math.max(Math.abs(di), Math.abs(dj)) != r) {
                        continue;
                    }
                    var i = coord.i + di;
                    var j = coord.j + dj;
                    for (var k=0; k < _units.length; k++) {
                        if (_units[k].type == 3 && _units[k].team == team && _units[k].coord.i == i && _units[k].coord.j == j) {
                            return _units[k];
                        }
                    }
                }
            }
        }
        return null;
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

    isCityTile(i, j)
    {
        for (var k=0; k < _units.length; k++) {
            if (_units[k] == undefined || _units[k].coord == undefined) {
                continue;
            }
            if ((_units[k].type == 3 || _units[k].unitTypeId == 'city')
                && _units[k].coord.i == i && _units[k].coord.j == j) {
                return true;
            }
        }
        return false;
    }

    canChopForest(k)
    {
        if (k == -1 || _units[k] == undefined || _units[k].unitTypeId != 'worker') {
            return false;
        }
        // PREHISTORY-CHOP-009, rules/prehostory.md: chopping requires Bronze Working.
        if (!_game_state.isTechnologyOpen('Bronze Working')) {
            return false;
        }
        var i = _units[k].coord.i;
        var j = _units[k].coord.j;
        // PREHISTORY-CHOP-012, rules/prehostory.md: Workers cannot chop on city tiles.
        if (this.isCityTile(i, j)) {
            return false;
        }
        // PREHISTORY-CHOP-007, rules/prehostory.md: chop_forest state starts only on forest terrain.
        return this.isChoppableForestTerrain(_map_terrain_tex[i][j]);
    }

    canBuildRoad(k)
    {
        if (k == -1 || _units[k] == undefined || _units[k].unitTypeId != 'worker') {
            return false;
        }
        // PREHISTORY-ROAD-006, rules/prehostory.md: workers cannot build roads before Wheel.
        if (!_game_state.isTechnologyOpen('Wheel')) {
            return false;
        }
        return this.canBuildRoadAt(_units[k].coord.i, _units[k].coord.j);
    }

    canUseRoadTo(k)
    {
        if (k == -1 || _units[k] == undefined || _units[k].unitTypeId != 'worker') {
            return false;
        }
        // PREHISTORY-ROAD-007, rules/prehostory.md: Road-to uses the same technology requirement as road building.
        return _game_state.isTechnologyOpen('Wheel');
    }

    canBuildRoadAt(i, j, allowExisting = false)
    {
        if (i < 0 || i >= _map_size || j < 0 || j >= _map_size) {
            return false;
        }
        // PREHISTORY-ROAD-009, rules/prehostory.md: Workers cannot build roads on city tiles.
        if (this.isCityTile(i, j)) {
            return false;
        }
        if (!allowExisting && _map.hasRoad(i, j)) {
            return false;
        }
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

    afterUnitMoved(k, fromCoord, toCoord)
    {
        if (k == -1 || _units[k] == undefined || _units[k].unitTypeId != 'worker' || _units[k].state != 'road_to') {
            return;
        }
        // PREHISTORY-ROAD-008, rules/prehostory.md: Road-to lays road on each supported path tile while moving.
        if (fromCoord && this.canBuildRoadAt(fromCoord.i, fromCoord.j)) {
            _map.addRoad(fromCoord.i, fromCoord.j);
        }
        if (toCoord && this.canBuildRoadAt(toCoord.i, toCoord.j)) {
            _map.addRoad(toCoord.i, toCoord.j);
        }
    }

    afterUnitRouteUpdated(k)
    {
        if (k == -1 || _units[k] == undefined) {
            return;
        }
        if (!(_units[k].gotoPath && _units[k].gotoPath.length) && _units[k].gotoCoord == undefined) {
            if (_units[k].state == 'road_to') {
                _units[k].state = 'ready';
            }
            else if (_units[k].state == 'explore') {
                this.autoRouteExplore(k);
            }
            else if (_units[k].state == 'patrol') {
                this.autoRoutePatrol(k);
            }
            else if (_units[k].state == 'automate') {
                this.autoRouteAutomate(k);
            }
        }
    }

    hasTerrainWaterSourceFlag(i, j)
    {
        var terrain = _map_terrain_tex[i][j];
        // PREHISTORY-IRRIGATION-009, rules/prehostory.md: A marks local water-source terrain.
        return (terrain&0x80) != 0;
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
                // PREHISTORY-IRRIGATION-005 and PREHISTORY-IRRIGATION-009, rules/prehostory.md: mixed grass-water and A-marked land or water sources are already local sources.
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

    hasFreshWaterNear(i, j)
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
                // PREHISTORY-IRRIGATION-012, rules/prehostory.md: fresh water is neighboring water without nearby deep water.
                if (this.isIrrigationWaterSource(ni, nj) && !this.isSeaConnectedWaterSource(ni, nj)) {
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
        // PREHISTORY-IRRIGATION-010, rules/prehostory.md: workers cannot build irrigation before Irrigation.
        if (!_game_state.isTechnologyOpen('Irrigation')) {
            return false;
        }
        var i = _units[k].coord.i;
        var j = _units[k].coord.j;
        // PREHISTORY-IRRIGATION-013, rules/prehostory.md: Workers cannot build irrigation on city tiles.
        if (this.isCityTile(i, j)) {
            return false;
        }
        var terrainType = _map_terrain_tex[i][j]&0x0F;
        // PREHISTORY-IRRIGATION-002 and PREHISTORY-IRRIGATION-008, rules/prehostory.md: irrigation can be built only on grass terrain.
        if (terrainType != 2) {
            return false;
        }
        if (_map.hasIrrigation(i, j)) {
            return false;
        }
        // Connectivity is authoritative server work. The client deliberately
        // allows the request; PHP returns IMPOSSIBLE when no irrigation route
        // reaches fresh water.
        return true;
    }

    enableNeighborCityIrrigationFood(i, j)
    {
        for (var k=0; k < _units.length; k++) {
            if (_units[k].type != 3) {
                continue;
            }
            var di = Math.abs(_units[k].coord.i - i);
            var dj = Math.abs(_units[k].coord.j - j);
            if (Math.max(di, dj) <= 1) {
                // PREHISTORY-IRRIGATION-011, rules/prehostory.md: worker irrigation next to a city activates the city-tile irrigation food bonus.
                _map.enableIrrigationCityFood(_units[k].coord.i, _units[k].coord.j);
                if (typeof _city_economy !== 'undefined') {
                    _city_economy.ensureCity(_units[k]);
                }
            }
        }
    }

    workerTileBuildingDefinitions = {
        pasture: {
            technology: 'Animal Husbandry',
            turns: 2,
            requiresResourceImprovement: true,
            apply: function(i, j) { return _map.addPasture(i, j); }
        },
        farm: {
            technology: 'Irrigation',
            turns: 2,
            requiresResourceImprovement: true,
            apply: function(i, j) { return _map.addFarm(i, j); }
        },
        plantation: {
            technology: 'Pottery',
            turns: 3,
            requiresResourceImprovement: true,
            apply: function(i, j) { return _map.addPlantation(i, j); }
        },
        camp: {
            technology: 'Animal Husbandry',
            turns: 2,
            requiresResourceImprovement: true,
            apply: function(i, j) { return _map.addCamp(i, j); }
        },
        fishing_boats: {
            technology: 'Sailing',
            turns: 2,
            waterOnly: true,
            requiresResourceImprovement: true,
            apply: function(i, j) { return _map.addFishingBoats(i, j); }
        },
        quarry: {
            technology: 'Masonry',
            turns: 3,
            requiresResourceImprovement: true,
            apply: function(i, j) { return _map.addQuarry(i, j); }
        },
        winery: {
            technology: 'Pottery',
            turns: 3,
            requiresResourceImprovement: true,
            apply: function(i, j) { return _map.addWinery(i, j); }
        },
        fortification: {
            technology: 'Construction',
            turns: 3,
            apply: function(i, j) { return _map.addFortification(i, j); }
        },
        cottage: {
            technology: 'Masonry',
            turns: 2,
            apply: function(i, j) { return _map.addCottage(i, j); }
        },
        workshop: {
            technology: 'Construction',
            turns: 3,
            apply: function(i, j) { return _map.addWorkshop(i, j); }
        },
        mine: {
            technology: 'Mining',
            turns: 3,
            terrainTypes: [4, 5],
            apply: function(i, j) { return _map.addMine(i, j); }
        }
    };

    canBuildWorkerTileBuilding(k, buildingName)
    {
        if (k == -1 || _units[k] == undefined || _units[k].unitTypeId != 'worker') {
            return false;
        }
        var building = this.workerTileBuildingDefinitions[buildingName];
        if (!building || !_game_state.isTechnologyOpen(building.technology)) {
            return false;
        }
        var i = _units[k].coord.i;
        var j = _units[k].coord.j;
        if (i < 0 || i >= _map_size || j < 0 || j >= _map_size) {
            return false;
        }
        // PREHISTORY-WORKER-BUILDING-010, rules/prehostory.md: Workers cannot build tile buildings on city tiles.
        if (this.isCityTile(i, j)) {
            return false;
        }
        var isWater = this.isWaterTerrain(i, j);
        if (building.waterOnly && !isWater) {
            return false;
        }
        if (!building.waterOnly && isWater) {
            return false;
        }
        if (building.terrainTypes && building.terrainTypes.indexOf(_map_terrain_tex[i][j]&0x0F) == -1) {
            return false;
        }
        var resourceImprovement = this.openedResourceImprovementForTile(i, j);
        if (resourceImprovement && buildingName != 'fortification' && buildingName != resourceImprovement) {
            return false;
        }
        if (building.requiresResourceImprovement && !this.hasOpenedResourceForImprovement(i, j, buildingName)) {
            return false;
        }
        // PREHISTORY-WORKER-BUILDING-003, rules/prehostory.md: supported worker buildings cannot duplicate an existing modifier.
        return !_map.hasTerrainModifier(i, j, buildingName);
    }

    workerTileBuildingMenuOptions(k)
    {
        if (k == -1 || _units[k] == undefined || _units[k].unitTypeId != 'worker') {
            return [];
        }
        var i = _units[k].coord.i;
        var j = _units[k].coord.j;
        var resourceImprovement = this.openedResourceImprovementForTile(i, j);
        if (resourceImprovement) {
            // PREHISTORY-WORKER-BUILDING-007: a resource Tile exposes its matching
            // economic improvement; Fortification remains a separate defence command.
            return this.canBuildWorkerTileBuilding(k, resourceImprovement) ? [resourceImprovement] : [];
        }
        var order = ['fortification', 'pasture', 'farm', 'plantation', 'camp', 'fishing_boats', 'quarry', 'winery', 'cottage', 'workshop', 'mine'];
        var result = [];
        for (var n=0; n < order.length; n++) {
            if (this.canBuildWorkerTileBuilding(k, order[n])) {
                result.push(order[n]);
            }
        }
        return result;
    }

    openedResourceImprovementForTile(i, j)
    {
        if (i < 0 || i >= _map_size || j < 0 || j >= _map_size) {
            return null;
        }
        var resourceState = _map_resource[i][j];
        if (!resourceState || !resourceState.type || !_resource_types[resourceState.type]) {
            return null;
        }
        if (_map.isResourceVisible && !_map.isResourceVisible(i, j)) {
            return null;
        }
        if (!_map.isResourceVisible && resourceState.hidden) {
            return null;
        }
        var resource = _resource_types[resourceState.type];
        return _resource_improvement_requirements[resource.id] || null;
    }

    hasOpenedResourceForImprovement(i, j, buildingName)
    {
        // PREHISTORY-WORKER-BUILDING-005, rules/prehostory.md: resource improvements require the matching opened resource on the worker tile.
        return this.openedResourceImprovementForTile(i, j) == buildingName;
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
        if (unit.building_turns_left != undefined) {
            return true;
        }
        if (unit.gotoCoord != undefined) {
            return true;
        }
        return false;
    }

    canEndTurnWithCurrentSelection()
    {
        if (typeof _user_types !== 'undefined' && _user_types[_current_user] == 'ai') {
            return true;
        }
        if (_selection == -1 || _units[_selection] == undefined) {
            return true;
        }
        var unit = _units[_selection];
        if (!unit.can_move) {
            return true;
        }
        // PREHISTORY-TURN-008, rules/prehostory.md: the selected idle movable unit must be given a task before End Turn can proceed.
        if (!this.unitHasTask(unit)) {
            this.showActionMenuForSelection();
            return false;
        }
        return true;
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
                this.showActionMenuForSelection();
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

            // PREHISTORY-TURN-007, rules/prehostory.md: cities without production are selected before movable unit prompts.
            if (_units[k].type == 3 && _units[k].production == null && !_units[k].productionDisabled) {
                _selection = k;
                this.centerViewOnUnit(k);
                this.showActionMenuForSelection();
                return;
            }
        }
        for (var offset=0; offset < _units.length; offset++) {
            var k = (start + offset) % _units.length;

            // PREHISTORY-TURN-004, rules/prehostory.md: select and center the next movable unit without a task.
            if (_units[k].can_move && !this.unitHasTask(_units[k])) {
                _selection = k;
                this.centerViewOnUnit(k);
                this.showActionMenuForSelection();
                return;
            }
        }
        _selection = -1;
        this.applyMenuRules();
    }

    handleMapClick(coord)
    {
        if ((_prehistory_command_mode == 'goto' || _prehistory_command_mode == 'road_to') && _selection != -1 && _units[_selection] != undefined && _units[_selection].can_move) {
            var commandIndices = this.commandSelectionIndices();
            for (var commandIndex=0; commandIndex < commandIndices.length; commandIndex++) {
                var selectedIndex = commandIndices[commandIndex];
                var path = this.buildPath(selectedIndex, coord);
                this.assignPath(selectedIndex, path);
                this.configureMovementIntent(selectedIndex, coord);
            }
            if (_prehistory_command_mode == 'road_to' && _units[_selection].unitTypeId == 'worker') {
                _units[_selection].state = 'road_to';
                if (this.canBuildRoadAt(_units[_selection].coord.i, _units[_selection].coord.j)) {
                    _map.addRoad(_units[_selection].coord.i, _units[_selection].coord.j);
                }
            }
            _prehistory_command_mode = null;
            _draw.clear();
            this.dismissActionMenu();
            return true;
        }
        return false;
    }

    hasPendingMapCommand()
    {
        return (_prehistory_command_mode == 'goto' || _prehistory_command_mode == 'road_to')
            && _selection != -1 && _units[_selection] != undefined && _units[_selection].can_move;
    }

    previewMapCommand(coord)
    {
        if ((_prehistory_command_mode == 'goto' || _prehistory_command_mode == 'road_to') && _selection != -1 && _units[_selection] != undefined && _units[_selection].can_move) {
            this.drawCommandPathPreview(coord);
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
            if (_units[k].hiddenOnMap) {
                continue;
            }
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
        if (unit.state == 'fortification') return 'F';
        if (unit.state == 'waiting') return 'W';
        if (unit.state == 'road') return 'R';
        if (unit.state == 'road_to') return 'J';
        if (unit.state == 'irrigate') return 'I';
        if (unit.state == 'chop_forest') return 'C';
        if (unit.state == 'pasture') return 'P';
        if (unit.state == 'farm') return 'Y';
        if (unit.state == 'plantation') return 'N';
        if (unit.state == 'camp') return 'K';
        if (unit.state == 'fishing_boats') return 'O';
        if (unit.state == 'network') return 'X';
        if (unit.state == 'quarry') return 'Q';
        if (unit.state == 'winery') return 'V';
        if (unit.state == 'cottage') return 'H';
        if (unit.state == 'workshop') return 'S';
        if (unit.state == 'mine') return 'M';
        if (unit.state == 'explore') return 'E';
        if (unit.state == 'patrol') return 'P';
        if (unit.state == 'automate') return 'A';
        return '';
    }

    makeTurn(forceEndTurn = false)
    {
        return _game.applyTurnProcessingRules(this, forceEndTurn);
    }

    async makeTurnAnimated(forceEndTurn = false)
    {
        return await _game.applyTurnProcessingRulesAnimated(this, forceEndTurn);
    }

    isValidStartingLand(coord)
    {
        return coord && coord.i >= 0 && coord.i < _map_size && coord.j >= 0 && coord.j < _map_size && (_map_terrain_tex[coord.i][coord.j]&0x0F) != 0;
    }

    randomStartingUnitPoint()
    {
        var candidates = [];
        for (var di=-5; di <= 5; di++) {
            for (var dj=-5; dj <= 5; dj++) {
                var coord = _start_game_point.add(di, dj);
                if (this.isValidStartingLand(coord)) {
                    candidates.push(coord);
                }
            }
        }
        if (candidates.length) {
            return candidates[Math.floor(Math.random()*candidates.length)];
        }
        if (this.isValidStartingLand(_start_game_point)) {
            return _start_game_point;
        }
        return _game.random_point(0, new Coord(8, 8), new Coord(_map_size - 9, _map_size - 9));
    }

    temporaryCivilizationStartPoint(userIndex)
    {
        // Temporary coexistence/combat test placement. The original independent
        // random placement remains below in startGame, commented out for easy restore.
        if (userIndex == 0 || _temporary_test_start_base == null) {
            _temporary_test_start_base = _game.random_point(
                0,
                new Coord(8, 8),
                new Coord(_map_size - 9 - _temporary_test_start_distance, _map_size - 9)
            );
            return _temporary_test_start_base;
        }

        var offsets = [
            new Coord(_temporary_test_start_distance, 0),
            new Coord(0, _temporary_test_start_distance),
            new Coord(-_temporary_test_start_distance, 0),
            new Coord(0, -_temporary_test_start_distance),
            new Coord(_temporary_test_start_distance, _temporary_test_start_distance)
        ];
        for (var n=0; n < offsets.length; n++) {
            var target = _temporary_test_start_base.add(offsets[n].i, offsets[n].j);
            if (this.isValidStartingLand(target)) {
                return target;
            }
            for (var radius=1; radius <= 6; radius++) {
                for (var di=-radius; di <= radius; di++) {
                    for (var dj=-radius; dj <= radius; dj++) {
                        var candidate = target.add(di, dj);
                        if (this.isValidStartingLand(candidate)) {
                            return candidate;
                        }
                    }
                }
            }
        }
        return _game.random_point(0, new Coord(8, 8), new Coord(_map_size - 9, _map_size - 9));
    }

    startGame()
    {
        if (typeof _multiplayer !== 'undefined') {
            _multiplayer.initUsers([0, 1]);
        }
        if (typeof _military !== 'undefined' && _military.setNeutralForUsers) {
            _military.setNeutralForUsers(typeof _user_ids !== 'undefined' ? _user_ids : [0, 1]);
        }

        var users = typeof _user_ids !== 'undefined' ? _user_ids : [0];
        _temporary_test_start_base = null;
        for (var u=0; u < users.length; u++) {
            var userId = users[u];
            if (typeof _multiplayer !== 'undefined') {
                _multiplayer.setCurrentUser(userId, false);
            }
            // Initial coordinates and units are provisioned by PHP during registration.
            // Browser-side random placement and initial unit creation are intentionally disabled.
            this.applyUnitStateRules();
        }

        if (typeof _multiplayer !== 'undefined') {
            _multiplayer.setCurrentUser(users[0], false);
            _multiplayer.updateTurnLabel();
        }
        this.centerViewOnStartingUnits();
        this.applyMenuRules();
    }

    doCommand(command)
    {
        var commandIndices = this.commandSelectionIndices();
        if (command == 'goto' && commandIndices.length) {
            _prehistory_command_mode = 'goto';
            for (var gotoIndex=0; gotoIndex < commandIndices.length; gotoIndex++) {
                this.setUnitState(commandIndices[gotoIndex], 'ready');
            }
            this.applyMenuRules();
            if (!this.usesCompactActionMenu() && typeof _last_hover_coord !== 'undefined' && _last_hover_coord) {
                this.drawCommandPathPreview(_last_hover_coord);
            }
            return;
        }
        if (command == 'road_to' && this.canUseRoadTo(_selection)) {
            _prehistory_command_mode = 'road_to';
            this.setUnitState(_selection, 'road_to');
            this.applyMenuRules();
            if (!this.usesCompactActionMenu() && typeof _last_hover_coord !== 'undefined' && _last_hover_coord) {
                _control.drawGoto(_units[_selection].coord.i, _units[_selection].coord.j, _last_hover_coord.i, _last_hover_coord.j, _selection);
            }
            return;
        }
        if (command == 'fortificate' && commandIndices.length) {
            for (var fortifyIndex=0; fortifyIndex < commandIndices.length; fortifyIndex++) {
                var fortifiedUnitIndex = commandIndices[fortifyIndex];
                this.setUnitState(fortifiedUnitIndex, 'fortified');
                _units[fortifiedUnitIndex].move_penalty = Math.max(_units[fortifiedUnitIndex].move_penalty, 1);
            }
        }
        if ((command == 'fortification' || command == 'pasture' || command == 'farm' || command == 'plantation'
            || command == 'camp' || command == 'fishing_boats' || command == 'quarry' || command == 'winery'
            || command == 'cottage' || command == 'workshop' || command == 'mine')
            && this.canBuildWorkerTileBuilding(_selection, command)) {
            this.setUnitState(_selection, command);
            if (typeof _server_game != 'undefined' && _units[_selection].serverId) {
                _server_game.buildImprovement(_units[_selection], command).catch(function() {});
            }
        }
        if (command == 'network' && this.canBuildNetwork(_selection)) {
            var workBoat = _units[_selection];
            this.setUnitState(_selection, 'network');
            if (typeof _server_game != 'undefined' && workBoat.serverId) {
                _server_game.buildImprovement(workBoat, 'network').catch(function() {});
            }
            else {
                _map.addNetwork(workBoat.coord.i, workBoat.coord.j);
                workBoat.state = 'ready';
            }
        }
        if (command == 'wait' && commandIndices.length) {
            for (var waitIndex=0; waitIndex < commandIndices.length; waitIndex++) {
                this.setUnitState(commandIndices[waitIndex], 'waiting');
            }
        }
        if (command == 'road' && this.canBuildRoad(_selection)) {
            this.setUnitState(_selection, command);
            if (typeof _server_game != 'undefined' && _units[_selection].serverId) {
                _server_game.buildImprovement(_units[_selection], 'road').catch(function() {});
            }
        }
        if (command == 'irrigate' && this.canBuildIrrigation(_selection)) {
            this.setUnitState(_selection, command);
            if (typeof _server_game != 'undefined' && _units[_selection].serverId) {
                _server_game.buildImprovement(_units[_selection], 'irrigation').catch(function() {});
            }
        }
        if (command == 'chop_forest' && this.canChopForest(_selection)) {
            this.setUnitState(_selection, command);
        }
        if ((command == 'explore' || command == 'patrol' || command == 'automate') && commandIndices.length) {
            for (var autoIndex=0; autoIndex < commandIndices.length; autoIndex++) {
                var automatedUnitIndex = commandIndices[autoIndex];
                this.setUnitState(automatedUnitIndex, command);
                _units[automatedUnitIndex].automationMode = command;
                if (command == 'explore') this.autoRouteExplore(automatedUnitIndex);
                if (command == 'patrol') this.autoRoutePatrol(automatedUnitIndex);
                if (command == 'automate') this.autoRouteAutomate(automatedUnitIndex);
            }
        }
        this.applyBuildingStateRules(command);
        // PREHISTORY-MENU-005, rules/prehostory.md: menu visibility follows command state changes.
        this.applyMenuRules();
    }
}

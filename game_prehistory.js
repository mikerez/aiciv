const _resource_types = [
    null,
    { id: 'bananas', texture: 801, sprite: 'resource_bananas.png', terrains: [6, 2], chance: 0.012 },
    { id: 'cattle', texture: 802, sprite: 'resource_cattle.png', terrains: [2], chance: 0.012 },
    { id: 'copper', texture: 803, sprite: 'resource_copper.png', terrains: [4, 5], chance: 0.020 },
    { id: 'crabs', texture: 804, sprite: 'resource_crabs.png', terrains: [0, 7], chance: 0.010 },
    { id: 'deer', texture: 805, sprite: 'resource_deer.png', terrains: [6, 3], chance: 0.010 },
    { id: 'fish', texture: 806, sprite: 'resource_fish.png', terrains: [0], chance: 0.012 },
    { id: 'rice', texture: 807, sprite: 'resource_rice.png', terrains: [2, 7], chance: 0.012 },
    { id: 'sheep', texture: 808, sprite: 'resource_sheep.png', terrains: [2, 4], chance: 0.012 },
    { id: 'stone', texture: 809, sprite: 'resource_stone.png', terrains: [4, 5], chance: 0.024 },
    { id: 'wheat', texture: 810, sprite: 'resource_wheat.png', terrains: [2, 7], chance: 0.012 },
    { id: 'amber', texture: 811, sprite: 'resource_amber.png', terrains: [6, 3], chance: 0.007 },
    { id: 'citrus', texture: 812, sprite: 'resource_citrus.png', terrains: [2, 6], chance: 0.008 },
    { id: 'cotton', texture: 815, sprite: 'resource_cotton.png', terrains: [2, 1], chance: 0.008 },
    { id: 'dyes', texture: 816, sprite: 'resource_dyes.png', terrains: [6, 2], chance: 0.008 },
    { id: 'diamonds', texture: 817, sprite: 'resource_diamonds.png', terrains: [4, 5], chance: 0.005 },
    { id: 'furs', texture: 818, sprite: 'resource_furs.png', terrains: [3, 6], chance: 0.007 },
    { id: 'gypsum', texture: 819, sprite: 'resource_gypsum.png', terrains: [1, 4, 5], chance: 0.008 },
    { id: 'honey', texture: 820, sprite: 'resource_honey.png', terrains: [6, 2], chance: 0.008 },
    { id: 'incense', texture: 821, sprite: 'resource_incense.png', terrains: [1, 4], chance: 0.007 },
    { id: 'ivory', texture: 822, sprite: 'resource_ivory.png', terrains: [2, 6], chance: 0.003 },
    { id: 'marble', texture: 823, sprite: 'resource_marble.png', terrains: [4, 5], chance: 0.014 },
    { id: 'olives', texture: 825, sprite: 'resource_olives.png', terrains: [2, 4], chance: 0.008 },
    { id: 'pearls', texture: 826, sprite: 'resource_pearls.png', terrains: [0], chance: 0.006 },
    { id: 'salt', texture: 827, sprite: 'resource_salt.png', terrains: [1, 0, 4], chance: 0.008 },
    { id: 'silk', texture: 828, sprite: 'resource_silk.png', terrains: [6], chance: 0.006 },
    { id: 'silver', texture: 829, sprite: 'resource_silver.png', terrains: [4, 5], chance: 0.007 },
    { id: 'spices', texture: 830, sprite: 'resource_spices.png', terrains: [6, 2], chance: 0.008 },
    { id: 'sugar', texture: 831, sprite: 'resource_sugar.png', terrains: [2, 7], chance: 0.008 },
    { id: 'tea', texture: 832, sprite: 'resource_tea.png', terrains: [4, 6], chance: 0.007 },
    { id: 'turtles', texture: 834, sprite: 'resource_turtles.png', terrains: [0], chance: 0.006 },
    { id: 'whales', texture: 835, sprite: 'resource_whales.png', terrains: [0], chance: 0.005 },
    { id: 'wine', texture: 836, sprite: 'resource_wine.png', terrains: [2, 4], chance: 0.007 },
    { id: 'horses', texture: 837, sprite: 'resource_horses.png', terrains: [2, 1, 7], chance: 0.010 },
    { id: 'iron', texture: 838, sprite: 'resource_iron.png', terrains: [1, 4, 5], chance: 0.020 },
    { id: 'gold', texture: 844, sprite: 'resource_gold.png', terrains: [4, 5, 1], chance: 0.007 },
    { id: 'gems', texture: 845, sprite: 'resource_gems.png', terrains: [4, 5], chance: 0.006 },

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

const _resource_categories = {
    bananas:['food','crop'], cattle:['food','production','animal'], copper:['production','money','mineral'],
    crabs:['food'], deer:['food','production','animal'], fish:['food'], rice:['food','crop'],
    sheep:['food','production','animal'], stone:['production','stone'], wheat:['food','crop'],
    amber:['money'], citrus:['food','money','crop'], cotton:['money','crop'], dyes:['money'],
    diamonds:['production','money','mineral'], furs:['money','animal'], gypsum:['production','stone'],
    honey:['food','money'], incense:['money'], ivory:['production','money','animal'],
    marble:['production','money','stone'], olives:['food','money','crop'], pearls:['money'],
    salt:['food','money'], silk:['money'], silver:['production','money','mineral'],
    spices:['food','money','crop'], sugar:['food','money','crop'], tea:['money','crop'],
    turtles:['food','money'], whales:['food','production','money','animal'], wine:['food','money','crop'],
    horses:['production','animal'], iron:['production','mineral'], gold:['money','mineral'],
    gems:['production','money','mineral']
};
for (var resourceVocabularyIndex=1; resourceVocabularyIndex < _resource_types.length; resourceVocabularyIndex++) {
    var resourceVocabulary = _resource_types[resourceVocabularyIndex];
    if (!resourceVocabulary) continue;
    resourceVocabulary.name = vocabularyResourceName(resourceVocabulary.id);
    resourceVocabulary.gives = vocabularyText('resource_description.' + resourceVocabulary.id);
    resourceVocabulary.categories = _resource_categories[resourceVocabulary.id] || [];
}

const _resource_improvement_requirements = _economics.resourceImprovementRequirements();
const _prehistory_unit_sprite_version = '?v=20260812b';

_screen.loadTexture('settler.png', 256);
_screen.loadTexture('explorer.png', 257);
_screen.loadTexture('Warior.png' + _prehistory_unit_sprite_version, 258);
_screen.loadTexture('City.png' + _prehistory_unit_sprite_version, 259);
_screen.loadTexture('slinger.png' + _prehistory_unit_sprite_version, 260);
_screen.loadTexture('Archer.png' + _prehistory_unit_sprite_version, 261);
_screen.loadTexture('Spearman.png' + _prehistory_unit_sprite_version, 262);
_screen.loadTexture('Horseman.png' + _prehistory_unit_sprite_version, 263);
_screen.loadTexture('Chariot.png' + _prehistory_unit_sprite_version, 264);
_screen.loadTexture('WarElephant.png', 265);
_screen.loadTexture('Catapult.png' + _prehistory_unit_sprite_version, 266);
_screen.loadTexture('Trebuchet.png' + _prehistory_unit_sprite_version, 267);
_screen.loadTexture('Galley.png' + _prehistory_unit_sprite_version, 268);
_screen.loadTexture('Galleon.png' + _prehistory_unit_sprite_version, 269);
_screen.loadTexture('worker.png', 270);
_screen.loadTexture('Workboat.png' + _prehistory_unit_sprite_version, 271);
_screen.loadTexture('Frigate.png' + _prehistory_unit_sprite_version, 272);
_screen.loadTexture('Knight.png', 273);
_screen.loadTexture('Pikeman.png' + _prehistory_unit_sprite_version, 274);
_screen.loadTexture('Longbow.png' + _prehistory_unit_sprite_version, 275);
_screen.loadTexture('Fencer.png', 276);
_screen.loadTexture('Swordman.png' + _prehistory_unit_sprite_version, 277);
_screen.loadTexture('Trireme.png' + _prehistory_unit_sprite_version, 278);
_screen.loadTexture('blue.png', 900);
_screen.loadTexture('green.png', 901);
_screen.loadTexture('yellow.png', 902);
_screen.loadTexture('magenta.png', 903);
_screen.loadTexture('orange.png', 904);

const _prehistory_unit_types = [
    new UnitType('settlers', vocabularyUnitName('settlers'), 0, 256, 0, 1, 1, 2, null, 20, null),
    new UnitType('worker', vocabularyUnitName('worker'), 1, 270, 0, 1, 1, 2, null, 20, null),
    new UnitType('explorer', vocabularyUnitName('explorer'), 1, 257, 0, 1, 2, 4, null, 15, null),
    new UnitType('warrior', vocabularyUnitName('warrior'), 2, 258, 2, 1, 1, 2, null, 20, null),
    new UnitType('slinger', vocabularyUnitName('slinger'), 2, 260, 2, 1, 1, 2, 'Archery', 25, null),
    new UnitType('archer', vocabularyUnitName('archer'), 2, 261, 3, 1, 1, 2, 'Archery', 35, null),
    new UnitType('spearman', vocabularyUnitName('spearman'), 2, 262, 2, 3, 1, 2, 'Bronze Working', 35, 'Copper or Iron'),
    new UnitType('horseman', vocabularyUnitName('horseman'), 2, 263, 4, 2, 2, 3, 'Horseback Riding', 50, 'Horses'),
    new UnitType('chariot', vocabularyUnitName('chariot'), 2, 264, 3, 2, 2, 3, 'Wheel', 45, 'Horses and Copper'),
    new UnitType('elephant', vocabularyUnitName('elephant'), 2, 265, 5, 4, 2, 3, 'Horseback Riding', 70, 'Ivory and Copper'),
    new UnitType('catapult', vocabularyUnitName('catapult'), 2, 266, 5, 1, 1, 2, 'Construction', 60, 'Copper or Iron'),
    new UnitType('trebuchet', vocabularyUnitName('trebuchet'), 2, 267, 7, 1, 1, 2, 'Engineering', 80, null),
    new UnitType('galley', vocabularyUnitName('galley'), 2, 268, 2, 2, 2, 3, 'Sailing', 40, null, true, 'water'),
    new UnitType('galleon', vocabularyUnitName('galleon'), 2, 269, 5, 4, 3, 4, 'Navigation', 90, 'Copper', true, 'water'),
    new UnitType('workboat', vocabularyUnitName('workboat'), 1, 271, 0, 1, 2, 3, 'Sailing', 30, null, true, 'water'),
    new UnitType('frigate', vocabularyUnitName('frigate'), 2, 272, 6, 5, 3, 4, 'Shipbuilding', 100, 'Iron', true, 'water'),
    new UnitType('knight', vocabularyUnitName('knight'), 2, 273, 6, 5, 2, 3, 'Engineering', 85, 'Horses'),
    new UnitType('pikeman', vocabularyUnitName('pikeman'), 2, 274, 4, 6, 1, 2, 'Iron Working', 55, 'Iron'),
    new UnitType('longbow', vocabularyUnitName('longbow'), 2, 275, 5, 3, 1, 3, 'Archery', 55, null),
    new UnitType('fencer', vocabularyUnitName('fencer'), 2, 276, 4, 3, 2, 2, 'Bronze Working', 45, 'Copper or Iron'),
    new UnitType('swordsman', vocabularyUnitName('swordsman'), 2, 277, 7, 5, 1, 2, 'Iron Working', 75, 'Iron'),
    new UnitType('trireme', vocabularyUnitName('trireme'), 2, 278, 1, 1, 2, 3, 'Sailing', 30, null, true, 'water'),
];

function prehistoryCityBuildingType(id, name, productionCost, sprite)
{
    var type = new UnitType(id, name, 4, 0, 0, 0, 0, 0, null, productionCost, null, false, 'land');
    type.cityBuilding = true;
    type.sprite = sprite;
    return type;
}

const _prehistory_city_building_types = [
    prehistoryCityBuildingType('lazaret', 'Lazaret', 60, 'lazaret.png'),
    prehistoryCityBuildingType('stable', 'Stable', 50, 'stable.png'),
    prehistoryCityBuildingType('shooting_range', 'Shooting-range', 50, 'shooting.png'),
    prehistoryCityBuildingType('barracks', 'Barracks', 50, 'baraks.png'),
    prehistoryCityBuildingType('port', 'Port', 60, 'port.png'),
    prehistoryCityBuildingType('market', 'Market', 50, 'market.png'),
];

const _prehistory_unit_sprites = {
    settlers: 'settler.png',
    worker: 'worker.png',
    explorer: 'explorer.png',
    warrior: 'Warior.png',
    slinger: 'slinger.png',
    archer: 'Archer.png',
    spearman: 'Spearman.png',
    horseman: 'Horseman.png',
    chariot: 'Chariot.png',
    elephant: 'WarElephant.png',
    catapult: 'Catapult.png',
    trebuchet: 'Trebuchet.png',
    galley: 'Galley.png',
    galleon: 'Galleon.png',
    workboat: 'Workboat.png',
    frigate: 'Frigate.png',
    knight: 'Knight.png',
    pikeman: 'Pikeman.png',
    longbow: 'Longbow.png',
    fencer: 'Fencer.png',
    swordsman: 'Swordman.png',
    trireme: 'Trireme.png',
};

function prehistoryUnitSpriteUrl(unitTypeId)
{
    var filename = _prehistory_unit_sprites[unitTypeId];
    return filename ? 'images/' + filename + _prehistory_unit_sprite_version : '';
}

function prehistoryProductionSpriteUrl(unitType)
{
    if (unitType && unitType.cityBuilding && unitType.sprite) {
        return 'images/' + unitType.sprite + '?v=20260815a';
    }
    return prehistoryUnitSpriteUrl(unitType && unitType.id ? unitType.id : unitType);
}

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


_city = new Unit(new UnitType('city', vocabularyUnitName('city'), 3, 259, 0, 8, 0, 3, null, 0, null, false));
_city.can_move = false;
_city.cityProperties = new CityProperties(5);

const _game_prehistory = new class
{
    constructor()
    {
        this.unitTypes = _prehistory_unit_types;
        this.cityBuildingTypes = _prehistory_city_building_types;
        this.unitTypesById = {};
        for (var k=0; k < this.unitTypes.length; k++) {
            this.unitTypesById[this.unitTypes[k].id] = this.unitTypes[k];
        }
        for (var buildingIndex=0; buildingIndex < this.cityBuildingTypes.length; buildingIndex++) {
            this.unitTypesById[this.cityBuildingTypes[buildingIndex].id] = this.cityBuildingTypes[buildingIndex];
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
                var cityI = _units[_selection].coord.i;
                var cityJ = _units[_selection].coord.j;
                _map.splitSupertileAt(cityI, cityJ);
                if (this.isChoppableForestTerrain(_map_terrain_tex[cityI][cityJ])) {
                    _map_terrain_tex[cityI][cityJ] = this.choppedForestTerrain(_map_terrain_tex[cityI][cityJ]);
                    _map_terrain_bit[cityI][cityJ] &= 0xFFF0;
                }
                this.removeDestroyedCityAt(_units[_selection].coord);
                _game.make_unit(_city, _units[_selection].coord);
                _units[_units.length - 1].team = _units[_selection].team;
                _units[_units.length - 1].cityFoodStored = 1;
                // PREHISTORY-BUILD-009, rules/prehostory.md: a built city starts with road and irrigation on its tile.
                _map.addRoad(_units[_units.length - 1].coord.i, _units[_units.length - 1].coord.j);
                _map.addIrrigation(
                    _units[_units.length - 1].coord.i,
                    _units[_units.length - 1].coord.j,
                    this.hasFreshWaterNear(_units[_units.length - 1].coord.i, _units[_units.length - 1].coord.j)
                );
                if (typeof _city_economy !== 'undefined') {
                    _city_economy.ensureCity(_units[_units.length - 1]);
                    _units[_units.length - 1].economy.foodStored = 1;
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
        _prehistory_action_menu_dismissed = true;
        var menu = document.getElementById('foreground');
        if (menu) {
            menu.style.display = 'none';
        }
    }

    showActionMenuForSelection()
    {
        _prehistory_action_menu_dismissed = false;
        this.applyMenuRules(true);
    }

    captureSelectedCityMenu()
    {
        if (_selection == -1 || !_units[_selection] || _units[_selection].type != 3) return null;
        var city = _units[_selection];
        return {
            serverId: city.serverId || null,
            clientKey: city.serverClientKey || null,
            reference: city,
        };
    }

    restoreSelectedCityMenu(saved)
    {
        if (!saved) return false;
        for (var k=0; k < _units.length; k++) {
            var city = _units[k];
            if (!city || city.type != 3) continue;
            if ((saved.serverId && city.serverId == saved.serverId)
                || (saved.clientKey && city.serverClientKey == saved.clientKey)
                || (!saved.serverId && !saved.clientKey && city === saved.reference)) {
                _selection = k;
                if (typeof _selection_by_user != 'undefined') _selection_by_user[_current_user] = k;
                this.showActionMenuForSelection();
                return true;
            }
        }
        return false;
    }

    applyMenuRules(showSuppressedAutomation)
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
            menu.style.display = 'none';
            _prehistory_action_menu_dismissed = false;
            return;
        }

        var unit = _units[_selection];
        if (menu.setAttribute) {
            menu.setAttribute('data-city-production-menu', unit.type == 3 ? 'true' : 'false');
        }
        // PREHISTORY-MENU-011, rules/prehostory.md: an issued order or unrelated map click
        // dismisses the whole action panel until a unit or city is explicitly selected again.
        if (_prehistory_action_menu_dismissed) {
            menu.style.display = 'none';
            return;
        }
        // A server refresh may rebuild selected-unit state, but it must not inherit a transient hidden style.
        menu.style.display = 'block';

        var show = function(name) {
            var elements = menu.querySelectorAll('[data-menu-option="' + name + '"]');
            for (var i=0; i < elements.length; i++) {
                elements[i].style.display = '';
            }
        };

        this.updateCityProductionMenu(menu, unit);
        this.updateUnitFeatureMenu(menu, unit);
        if (unit.type != 3) show('unit_identity');

        // PREHISTORY-MENU-002, rules/prehostory.md: movable units show movement-related commands.
        if (unit.can_move) {
            show('unit_features');
            show('goto');
            if (unit.unitTypeId != 'worker') {
                show('fortificate');
            }
            show('disband');
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
            show('city_optimization');
            show('city_built_buildings');
        }
        if (typeof decorateUnitActionMenu === 'function') decorateUnitActionMenu(menu);
    }

    updateUnitFeatureMenu(menu, unit)
    {
        var identity = menu.querySelector('[data-menu-option="unit_identity"]');
        if (identity) {
            var group = this.commandSelectionIndices();
            identity.textContent = group.length > 1
                ? vocabularyText('unit.selected_military', {count: group.length})
                : vocabularyText('unit.id', {id: unit && unit.serverId != undefined && unit.serverId != null
                    ? unit.serverId : vocabularyText('unit.pending')});
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
        features.textContent = vocabularyText('unit.health_experience', {
            features: vocabularyText('unit.features', {attack: attack, defense: defense, speed: speed}),
            health: health, maxHealth: maxHealth, experience: experience
        });
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
        return this.canBuildNetworkAt(_units[k].coord.i, _units[k].coord.j);
    }

    canBuildNetworkAt(i, j)
    {
        if (i < 0 || i >= _map_size || j < 0 || j >= _map_size) return false;
        var terrain = _map_terrain_tex[i][j];
        return this.isWaterTerrain(i, j) && ((terrain >> 4) & 0x03) <= 1
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
        if (unitType.cityBuilding) {
            return !this.cityHasBuilding(city, unitType.id)
                && !this.cityBuildingIsQueued(city, unitType.id);
        }
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

    cityBuildings(city)
    {
        if (!city || city.type != 3) return [];
        var list = typeof _units_by_user != 'undefined' && _units_by_user[city.team]
            ? _units_by_user[city.team] : _units;
        var cityId = Number(city.serverId) || 0;
        var result = [];
        for (var k=0; k < list.length; k++) {
            var building = list[k];
            if (!building || building.type != 4 || !building.cityBuilding
                || Number(building.health) <= 0) continue;
            var sameParent = cityId > 0 && Number(building.parentCityId) == cityId;
            var sameLocalCity = !cityId && building.coord && city.coord
                && building.coord.i == city.coord.i && building.coord.j == city.coord.j;
            if (sameParent || sameLocalCity) result.push(building);
        }
        result.sort(function(a, b) {
            return String(a.name || a.unitTypeId).localeCompare(String(b.name || b.unitTypeId));
        });
        return result;
    }

    cityHasBuilding(city, buildingTypeId)
    {
        var buildings = this.cityBuildings(city);
        for (var k=0; k < buildings.length; k++) {
            if (buildings[k].unitTypeId == buildingTypeId) return true;
        }
        return false;
    }

    cityBuildingIsQueued(city, buildingTypeId)
    {
        var queue = city && Array.isArray(city.productionQueue) ? city.productionQueue : [];
        return queue.indexOf(buildingTypeId) != -1;
    }

    cityHealingPercent(city)
    {
        return 10 + (this.cityHasBuilding(city, 'lazaret') ? 10 : 0);
    }

    producedUnitExperience(city, unitType)
    {
        if (!unitType || unitType.cityBuilding) return 1;
        var mounted = ['horseman', 'chariot', 'knight', 'elephant'].indexOf(unitType.id) != -1;
        var ranged = ['slinger', 'archer', 'longbow'].indexOf(unitType.id) != -1;
        var melee = ['warrior', 'spearman', 'pikeman', 'fencer', 'swordsman'].indexOf(unitType.id) != -1;
        var trained = (mounted && this.cityHasBuilding(city, 'stable'))
            || (ranged && this.cityHasBuilding(city, 'shooting_range'))
            || (melee && this.cityHasBuilding(city, 'barracks'))
            || (unitType.nature == 'water' && this.cityHasBuilding(city, 'port'));
        return trained ? 1.1 : 1;
    }

    unitGoldUpkeep(unitTypeId)
    {
        if (['knight', 'trebuchet', 'frigate'].indexOf(unitTypeId) != -1) return 12;
        if (['pikeman', 'swordsman', 'longbow'].indexOf(unitTypeId) != -1) return 6;
        return 0;
    }

    unitFoodUpkeep(unitTypeId)
    {
        var base = 1;
        if (['knight', 'pikeman', 'swordsman', 'trebuchet', 'frigate', 'elephant']
            .indexOf(unitTypeId) != -1) base = 3;
        else if (['horseman', 'chariot', 'catapult', 'galley', 'galleon']
            .indexOf(unitTypeId) != -1) base = 2;
        var unitType = this.unitTypesById[unitTypeId];
        return unitType && unitType.type == 2 ? base*4 : base;
    }

    terrainImprovementUpkeep()
    {
        return {
            road: {food:0, production:1, gold:0},
            irrigation: {food:0, production:0, gold:0},
            pasture: {food:0, production:0, gold:0},
            fortification: {food:0, production:2, gold:0},
            cottage: {food:0, production:0, gold:0},
            workshop: {food:2, production:0, gold:0},
            mine: {food:0, production:0, gold:0},
            farm: {food:0, production:0, gold:0},
            plantation: {food:0, production:0, gold:0},
            camp: {food:0, production:0, gold:0},
            fishing_boats: {food:0, production:0, gold:0},
            quarry: {food:0, production:0, gold:0},
            winery: {food:0, production:0, gold:0},
            network: {food:0, production:1, gold:0},
        };
    }

    productionResourceRequirements()
    {
        // Mirrored by serverProductionResourceRequirements() in server_game.php.
        return {
            horseman: ['horses'],
            knight: ['horses', 'iron'],
            chariot: ['horses', 'copper'],
            elephant: ['ivory', 'copper'],
            galleon: ['copper'],
            frigate: ['iron'],
            spearman: [['copper', 'iron']],
            fencer: [['copper', 'iron']],
            catapult: [['copper', 'iron']],
            longbow: [['copper', 'iron']],
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
                var resourceName = _resource_types[resourceState.type].id;
                if ((resourceName != 'copper' && resourceName != 'iron') || (modifiers && modifiers.mine)) {
                    found[resourceName] = true;
                }
            }
            for (var n=0; n < directions.length; n++) {
                queue.push({ i: point.i + directions[n][0], j: point.j + directions[n][1] });
            }
        }
        return found;
    }

    cityRoadConnectedToAnotherCity(city)
    {
        if (!city || !city.coord) return false;
        var directions = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1]];
        var queue = [{i:city.coord.i, j:city.coord.j}];
        var visited = {};
        while (queue.length) {
            var point = queue.shift();
            var key = point.i + ':' + point.j;
            if (visited[key] || point.i < 0 || point.j < 0
                || point.i >= _map_size || point.j >= _map_size) continue;
            var origin = point.i == city.coord.i && point.j == city.coord.j;
            var modifiers = _map_terrain_mod[point.i] && _map_terrain_mod[point.i][point.j];
            if (!origin && (!modifiers || !modifiers.road)) continue;
            visited[key] = true;
            for (var unitIndex=0; unitIndex < _units.length; unitIndex++) {
                var other = _units[unitIndex];
                if (!origin && other && other !== city && other.type == 3 && other.team == city.team
                    && other.coord && other.coord.i == point.i && other.coord.j == point.j) return true;
            }
            for (var direction=0; direction < directions.length; direction++) {
                queue.push({i:point.i + directions[direction][0], j:point.j + directions[direction][1]});
            }
        }
        return false;
    }

    cityHasProductionResources(city, unitTypeId)
    {
        var required = this.productionResourceRequirements()[unitTypeId] || [];
        if (!required.length) return true;
        var connected = this.connectedRoadResources(city);
        for (var n=0; n < required.length; n++) {
            var alternatives = Array.isArray(required[n]) ? required[n] : [required[n]];
            var satisfied = false;
            for (var a=0; a < alternatives.length; a++) {
                if (connected[alternatives[a]]) {
                    satisfied = true;
                    break;
                }
            }
            if (!satisfied) return false;
        }
        return true;
    }

    tileUnitStackState(movingUnit, i, j)
    {
        var state = { count: 0, hasVisibleForeignDefender: false, hasOwnedCity: false };
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
                if (!isForeign && occupant.type == 3) state.hasOwnedCity = true;
                if (isForeign && (isMovable || occupant.type == 3)) {
                    state.hasVisibleForeignDefender = true;
                }
            }
        }
        return state;
    }

    canUnitEnterTile(k, i, j, traversalOptions)
    {
        if (k == -1 || _units[k] == undefined || i < 0 || i >= _map_size || j < 0 || j >= _map_size) {
            return false;
        }
        var isWater = this.isWaterTerrain(i, j);
        // Road-to is construction routing, not ordinary transport movement.
        // A carried Worker may cross water with a ship, but can never lay road there.
        if (traversalOptions && traversalOptions.landOnly && isWater) return false;
        var unitType = this.unitTypesById[_units[k].unitTypeId];
        var movingUnit = _units[k];
        var terrain = _map_terrain_tex[i][j];
        var maximumRock = (terrain&0x0F) == 5 && ((terrain>>4)&0x03) == 3;
        if (maximumRock && ['horseman', 'chariot', 'knight', 'elephant'].indexOf(movingUnit.unitTypeId) != -1) {
            return false;
        }
        var startsOnWater = this.isWaterTerrain(movingUnit.coord.i, movingUnit.coord.j);
        var stack = this.tileUnitStackState(movingUnit, i, j);
        var terrainAllowed;
        if (this.isWaterUnitType(unitType)) {
            // A ship may use its own City as a harbor, but it cannot attack land from water.
            terrainAllowed = isWater || stack.hasOwnedCity;
        }
        else {
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
        if (startsOnWater && !isWater && stack.hasVisibleForeignDefender) return false;
        // PREHISTORY-MOVE-006: a full Tile blocks ordinary movement, but never
        // prevents a military unit from issuing an attack against its occupants.
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
        var remaining = Math.max(0, unitType.productionCost
            - (Number(city.production.productionPoints) || 0));
        var perTurn = Number(city.cityProperties && city.cityProperties.productionPerTurn);
        if (remaining > 0 && (!Number.isFinite(perTurn) || perTurn <= 0)) return null;
        return Math.max(1, Math.ceil(remaining/perTurn));
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
                    var grossFood = unit.economy.lastGrossIncome
                        ? unit.economy.lastGrossIncome.food : unit.economy.lastIncome.food;
                    economyText = vocabularyText('production.city_economy', {
                        population: unit.economy.citizens.length, food: grossFood,
                        production: unit.economy.lastIncome.production, money: unit.economy.lastIncome.money,
                        consumption: unit.economy.foodConsumption, growth: unit.economy.turnsToNewCitizen
                    });
                }
                var turnsLeft = this.productionTurnsLeft(unit);
                var productionText = turnsLeft == null
                    ? vocabularyText('production.paused_status', {
                        name: vocabularyUnitName(unitType.id, unitType.name)
                    })
                    : vocabularyText('production.status', {
                        name: vocabularyUnitName(unitType.id, unitType.name), turns: turnsLeft
                    });
                status.textContent = productionText
                    + (economyText ? '\n' + economyText.replace(/^\s+/, '') : '');
            }
            else if (unit.type == 3) {
                if (typeof _city_economy !== 'undefined') {
                    _city_economy.ensureCity(unit);
                    var idleGrossFood = unit.economy.lastGrossIncome
                        ? unit.economy.lastGrossIncome.food : unit.economy.lastIncome.food;
                    var idleProductionText = unit.productionDisabled
                        ? vocabularyText('common.none') : vocabularyText('production.none_selected');
                    var idleEconomyText = vocabularyText('production.city_economy', {
                            population: unit.economy.citizens.length, food: idleGrossFood,
                            production: unit.economy.lastIncome.production, money: unit.economy.lastIncome.money,
                            consumption: unit.economy.foodConsumption, growth: unit.economy.turnsToNewCitizen
                        });
                    status.textContent = idleProductionText + '\n' + idleEconomyText.replace(/^\s+/, '');
                }
                else {
                    status.textContent = vocabularyText('common.none');
                }
            }
            else {
                status.textContent = '';
            }
            if (unit.type == 3) {
                status.textContent += vocabularyText('production.focus', {focus: unit.cityOptimization || 'balanced'});
            }
            status.style.whiteSpace = 'pre-line';
            status.style.minHeight = '';
        }

        var queueElement = menu.querySelector('[data-menu-option="city_production_queue"]');
        if (queueElement) {
            queueElement.innerHTML = '';
            var queue = unit.type == 3 && Array.isArray(unit.productionQueue)
                ? unit.productionQueue
                : unit.type == 3 && unit.production ? [unit.production.unitTypeId] : [];
            if (unit.type == 3) {
                var queueTitle = document.createElement('div');
                queueTitle.textContent = queue.length ? vocabularyText('production.backlog') : vocabularyText('production.backlog_empty');
                queueElement.appendChild(queueTitle);
                for (var queueIndex=0; queueIndex < queue.length; queueIndex++) {
                    var queuedType = this.unitTypesById[queue[queueIndex]];
                    var row = document.createElement('div');
                    row.style.cursor = 'context-menu';
                    row.style.whiteSpace = 'nowrap';
                    var removeIcon = typeof createUnitActionIcon === 'function'
                        ? createUnitActionIcon('produce_unit:none', vocabularyText('command.clear_backlog')) : null;
                    if (removeIcon) row.appendChild(removeIcon);
                    var queueText = document.createElement('span');
                    queueText.textContent = (queueIndex + 1) + '. '
                        + (queuedType ? vocabularyUnitName(queuedType.id, queuedType.name) : queue[queueIndex])
                        + (queueIndex == 0 ? vocabularyText('production.current_suffix') : '');
                    row.appendChild(queueText);
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

        var builtElement = menu.querySelector('[data-menu-option="city_built_buildings"]');
        if (builtElement) {
            builtElement.innerHTML = '';
            if (unit.type == 3) {
                var completedBuildings = this.cityBuildings(unit);
                if (completedBuildings.length) {
                    var builtTitle = document.createElement('div');
                    builtTitle.style.fontWeight = 'bold';
                    builtTitle.textContent = vocabularyText('production.built_buildings');
                    builtElement.appendChild(builtTitle);
                    for (var builtIndex=0; builtIndex < completedBuildings.length; builtIndex++) {
                        var built = completedBuildings[builtIndex];
                        var builtType = this.unitTypesById[built.unitTypeId];
                        var builtRow = document.createElement('div');
                        builtRow.style.display = 'flex';
                        builtRow.style.alignItems = 'center';
                        builtRow.style.gap = '6px';
                        var builtImage = document.createElement('img');
                        builtImage.className = 'unit-action-icon';
                        builtImage.src = prehistoryProductionSpriteUrl(builtType);
                        builtImage.alt = '';
                        builtRow.appendChild(builtImage);
                        var builtName = document.createElement('span');
                        builtName.textContent = vocabularyUnitName(
                            built.unitTypeId, builtType ? builtType.name : built.name
                        );
                        builtRow.appendChild(builtName);
                        builtElement.appendChild(builtRow);
                    }
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
        none.textContent = vocabularyText('command.clear_backlog');
        options.appendChild(none);

        if (typeof _game_state !== 'undefined' && _game_state && _game_state.money < 0) {
            var blocked = document.createElement('div');
            blocked.style.marginTop = '6px';
            blocked.style.color = 'darkred';
            blocked.textContent = vocabularyText('production.blocked_money');
            options.appendChild(blocked);
            return;
        }

        var productionState = typeof _game_state_by_user !== 'undefined'
            && _game_state_by_user[unit.team] ? _game_state_by_user[unit.team] : _game_state;
        var availableGold = productionState ? Number(productionState.money || 0) : 0;

        for (var k=0; k < this.unitTypes.length; k++) {
            var unitType = this.unitTypes[k];
            if (!this.canCityProduceUnit(unit, unitType)) {
                continue;
            }
            if (availableGold < this.unitGoldUpkeep(unitType.id)) {
                continue;
            }
            var link = document.createElement('a');
            link.setAttribute('data-menu-command', 'produce_unit:' + unitType.id);
            link.style.display = 'flex';
            link.style.alignItems = 'center';
            link.style.gap = '6px';
            link.style.minHeight = '34px';
            link.style.cursor = 'pointer';
            link.style.marginBottom = '4px';
            link.style.padding = '2px 0';
            link.onmouseover = function() { this.style.backgroundColor = 'orange'; };
            link.onmouseout = function() { this.style.backgroundColor = ''; };
            var image = document.createElement('img');
            image.className = 'unit-action-icon';
            image.src = prehistoryProductionSpriteUrl(unitType);
            image.alt = unitType.name;
            image.title = vocabularyUnitName(unitType.id, unitType.name);
            image.style.width = '44px';
            image.style.height = '33px';
            image.style.objectFit = 'contain';
            image.style.flex = '0 0 auto';
            var description = document.createElement('span');
            description.style.lineHeight = '1.15';
            description.textContent = vocabularyText('production.option', {
                name: vocabularyUnitName(unitType.id, unitType.name), cost: unitType.productionCost,
                attack: unitType.attack, defense: unitType.defense, speed: unitType.speed,
                food: this.unitFoodUpkeep(unitType.id), gold: this.unitGoldUpkeep(unitType.id)
            });
            link.appendChild(image);
            link.appendChild(description);
            options.appendChild(link);
        }

        for (var buildingIndex=0; buildingIndex < this.cityBuildingTypes.length; buildingIndex++) {
            var buildingType = this.cityBuildingTypes[buildingIndex];
            if (!this.canCityProduceUnit(unit, buildingType)) continue;
            var buildingLink = document.createElement('a');
            buildingLink.setAttribute('data-menu-command', 'produce_unit:' + buildingType.id);
            buildingLink.style.display = 'flex';
            buildingLink.style.alignItems = 'center';
            buildingLink.style.gap = '6px';
            buildingLink.style.minHeight = '34px';
            buildingLink.style.cursor = 'pointer';
            buildingLink.style.marginBottom = '4px';
            buildingLink.style.padding = '2px 0';
            buildingLink.onmouseover = function() { this.style.backgroundColor = 'orange'; };
            buildingLink.onmouseout = function() { this.style.backgroundColor = ''; };
            var buildingImage = document.createElement('img');
            buildingImage.className = 'unit-action-icon';
            buildingImage.src = prehistoryProductionSpriteUrl(buildingType);
            buildingImage.alt = '';
            buildingImage.title = vocabularyUnitName(buildingType.id, buildingType.name);
            buildingImage.style.width = '44px';
            buildingImage.style.height = '33px';
            buildingImage.style.objectFit = 'contain';
            buildingImage.style.flex = '0 0 auto';
            var buildingDescription = document.createElement('span');
            buildingDescription.style.lineHeight = '1.15';
            buildingDescription.textContent = vocabularyText('production.building_option', {
                name: vocabularyUnitName(buildingType.id, buildingType.name),
                cost: buildingType.productionCost
            });
            buildingLink.appendChild(buildingImage);
            buildingLink.appendChild(buildingDescription);
            options.appendChild(buildingLink);
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
        if (state != 'road_to') delete _units[k].resumeAutomationAfterRoadTo;
        if (state != 'road_to') delete _units[k].roadToDestination;
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
        if (!this.isImprovementState(state)) {
            _units[k].clientImprovementTurnsLeft = undefined;
            _units[k].clientImprovementState = undefined;
            _units[k].pendingImmediateBuild = false;
            delete _units[k].automationCommandAction;
            delete _units[k].automationCommandTarget;
            delete _units[k].automationCommandDeadline;
        }
        if (typeof _server_game != 'undefined') _server_game.saveClientRoutes(_current_user);
    }

    isImprovementState(state)
    {
        return state == 'road' || state == 'irrigate' || state == 'chop_forest' || state == 'network'
            || this.workerTileBuildingDefinitions[state] != undefined;
    }

    beginImprovement(k, state, preserveAutomation = false)
    {
        if (k == -1 || !_units[k]) return false;
        this.setUnitState(k, state, preserveAutomation);
        _units[k].clientImprovementTurnsLeft = this.improvementBuildTurns(state);
        _units[k].clientImprovementState = state == 'irrigate' ? 'irrigation' : state;
        if (typeof _server_game != 'undefined') _server_game.saveClientRoutes(_current_user);
        return true;
    }

    improvementBuildTurns(state)
    {
        if (state == 'chop_forest') return 4;
        if (state == 'farm' || state == 'cottage') return 5;
        return 6;
    }

    prepareManualMovement(k)
    {
        if (k == -1 || _units[k] == undefined || !_units[k].can_move) {
            return;
        }
        // PREHISTORY-STATE-007, rules/prehostory.md: manual movement clears any modified unit state.
        var indices = this.commandSelectionIndices();
        for (var n=0; n < indices.length; n++) {
            var unit = _units[indices[n]];
            this.setUnitState(indices[n], 'ready');
            if (typeof _server_game != 'undefined' && _server_game.persistUnitAutomationMode) {
                _server_game.persistUnitAutomationMode(unit, null);
            }
        }
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
        if (!coord) return;
        var indices = this.commandSelectionIndices();
        var previewKey = _prehistory_command_mode + ':' + Math.round(coord.i) + ':' + Math.round(coord.j)
            + ':' + indices.map(function(index) {
                var unit = _units[index];
                return (unit.serverId == undefined ? index : unit.serverId) + '@'
                    + Math.round(unit.coord.i) + ':' + Math.round(unit.coord.j);
            }).join(',');
        if (this.commandPathPreviewKey == previewKey) return;
        this.commandPathPreviewKey = previewKey;
        if (indices.length > 1) _control.drawGotoGroupPreview(indices, coord.i, coord.j);
        else if (indices.length == 1) {
            var k = indices[0];
            var traversalOptions = _prehistory_command_mode == 'road_to' ? {landOnly:true} : null;
            _control.drawGotoPreview(
                _units[k].coord.i, _units[k].coord.j, coord.i, coord.j, k, null, traversalOptions
            );
        }
    }

    commitCommandPath(coord)
    {
        if (!coord) return;
        this.commandPathPreviewKey = null;
        var indices = this.commandSelectionIndices();
        for (var n=0; n < indices.length; n++) {
            var k = indices[n];
            if (_prehistory_command_mode == 'road_to') {
                this.assignRoadToDestination(k, coord);
            }
            else {
                this.assignPath(k, this.buildPath(k, coord));
            }
        }
    }

    buildPath(k, target, traversalOptions)
    {
        var path = [];
        if (k == -1 || _units[k] == undefined || target == undefined) {
            return path;
        }
        _control.mapLine(_units[k].coord.i, _units[k].coord.j, target.i, target.j, function(i, j, ni, nj, arrow_num) {
            path.push(new Coord(ni, nj));
        }, k, 30, traversalOptions);
        return path;
    }

    buildRoadPath(k, target, allowPartial = false)
    {
        var path = this.buildPath(k, target, {landOnly:true});
        if (allowPartial) return path;
        var destination = path.length ? path[path.length - 1] : null;
        return destination && destination.i == target.i && destination.j == target.j ? path : [];
    }

    assignRoadToDestination(k, target)
    {
        if (k == -1 || !_units[k] || _units[k].unitTypeId != 'worker' || !target) return false;
        var unit = _units[k];
        var destination = new Coord(Math.round(target.i), Math.round(target.j));
        var sameTile = unit.coord.i == destination.i && unit.coord.j == destination.j;
        var path = sameTile ? [] : this.buildRoadPath(k, destination, true);
        if (!sameTile && !path.length) {
            unit.state = 'ready';
            unit.automationMode = null;
            unit.roadToBuilding = false;
            delete unit.roadToDestination;
            if (typeof _server_game != 'undefined') _server_game.saveClientRoutes(_current_user);
            return false;
        }
        this.clearUnitPath(k);
        unit.roadToDestination = destination;
        if (path.length) this.assignPath(k, path);
        unit.state = 'road_to';
        unit.automationMode = 'road_to';
        unit.roadToBuilding = false;
        this.prepareRoadToTurn(k);
        if (typeof _server_game != 'undefined') {
            _server_game.saveClientRoutes(_current_user);
            if (_server_game.persistUnitAutomationMode) {
                _server_game.persistUnitAutomationMode(unit, 'road_to');
            }
        }
        return true;
    }

    clearUnitPath(k)
    {
        if (k == -1 || !_units[k]) return;
        _units[k].gotoPath = [];
        _units[k].gotoCoord = null;
        _units[k].pendingServerPath = [];
    }

    ensureRoadToLandPath(k)
    {
        var unit = _units[k];
        if (!unit || unit.unitTypeId != 'worker') return false;
        var path = unit.gotoPath || [];
        var containsWater = false;
        for (var n=0; n < path.length; n++) {
            if (this.isWaterTerrain(path[n].i, path[n].j)) {
                containsWater = true;
                break;
            }
        }
        if (!containsWater) return true;
        var target = unit.roadToDestination || unit.gotoCoord || path[path.length - 1];
        var replacement = target ? this.buildRoadPath(k, target, true) : [];
        this.clearUnitPath(k);
        if (!replacement.length) return false;
        this.assignPath(k, replacement);
        return true;
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
        var pathSearches = 0;
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
                        if (pathSearches++ >= 8) return null;
                        var path = this.buildPath(k, new Coord(i, j), {
                            pathMaximumExpanded: 384,
                            pathMaximumMilliseconds: 3,
                        });
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
        var candidates = [];
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
                var targetCoord = targetUnit.coord;
                if (!targetCoord || targetUnit.outsideMapWindow
                    || !Number.isFinite(Number(targetCoord.i)) || !Number.isFinite(Number(targetCoord.j))
                    || targetCoord.i < 0 || targetCoord.i >= _map_size
                    || targetCoord.j < 0 || targetCoord.j >= _map_size
                    || !_map_terrain_bit[targetCoord.i]
                    || _map_terrain_bit[targetCoord.i][targetCoord.j] == undefined) {
                    continue;
                }
                if ((_map_terrain_bit[targetCoord.i][targetCoord.j]&0x4000) == 0) {
                    continue;
                }
                var distance = Math.abs(targetCoord.i - _units[k].coord.i)
                    + Math.abs(targetCoord.j - _units[k].coord.j);
                if (distance <= 3) {
                    continue;
                }
                candidates.push({target:new Coord(targetCoord.i, targetCoord.j), distance:distance});
            }
        }
        candidates.sort(function(a, b) { return a.distance-b.distance; });
        for (var candidateIndex=0; candidateIndex<Math.min(4, candidates.length); candidateIndex++) {
            var candidate = candidates[candidateIndex];
            var path = this.buildPath(k, candidate.target, {
                pathMaximumExpanded: 384,
                pathMaximumMilliseconds: 3,
            });
            if (path.length) return {target:candidate.target, path:path};
        }
        return null;
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
            return true;
        }
        this.autoRouteAutomate(k);
        if (_units[k].gotoPath && _units[k].gotoPath.length) return true;

        // Keep Explore active if no fog or city route is currently reachable.
        // A deterministic adjacent fallback prevents repeated random failures
        // from turning a persistent Explore order into Hold forever.
        var turn = typeof _server_game != 'undefined' ? _server_game.serverTurn : 0;
        var offset = ((_units[k].serverId || k) + turn) % 8;
        var directions = [[1,0],[1,1],[0,1],[-1,0],[-1,-1],[0,-1],[-1,1],[1,-1]];
        for (var n=0; n<directions.length; n++) {
            var direction = directions[(offset+n)%directions.length];
            var target = _units[k].coord.add(direction[0], direction[1]);
            var path = this.buildPath(k, target);
            if (!path.length) continue;
            this.assignPath(k, path);
            return true;
        }
        return false;
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

    workerAutomationOptionsAt(k, i, j, cityOrAllowGenericFarm = true, allowReplacement = false)
    {
        if (k == -1 || !_units[k] || _units[k].unitTypeId != 'worker') return [];
        var original = _units[k].coord;
        _units[k].coord = new Coord(i, j);
        try {
            var available = this.workerTileBuildingMenuOptions(k);
            var resourceImprovement = this.openedResourceImprovementForTile(i, j);
            if (resourceImprovement && available.indexOf(resourceImprovement) != -1
                && (allowReplacement
                    || !this.workerActionReplacesImprovement(i, j, resourceImprovement))) {
                return [resourceImprovement];
            }
            var modifiers = _map_terrain_mod[i] && _map_terrain_mod[i][j]
                ? _map_terrain_mod[i][j] : {};
            var primary = ['irrigation', 'pasture', 'farm', 'plantation', 'camp', 'fishing_boats',
                'quarry', 'winery', 'cottage', 'hamlet', 'village', 'workshop',
                'fortification', 'mine'];
            var hasPrimary = false;
            for (var n=0; n < primary.length; n++) {
                if (modifiers[primary[n]]) {
                    hasPrimary = true;
                    break;
                }
            }
            var terrainType = _map_terrain_tex[i][j] & 0x0F;
            if (!hasPrimary && this.canChopForest(k)) return ['chop_forest'];
            var priorities = cityOrAllowGenericFarm && typeof cityOrAllowGenericFarm == 'object'
                ? this.workerCityImprovementPriorities(cityOrAllowGenericFarm, _units[k])
                : cityOrAllowGenericFarm ? ['farm', 'workshop', 'cottage'] : ['workshop', 'cottage'];
            if (modifiers.irrigation) {
                for (var preparedIndex=0; preparedIndex < priorities.length; preparedIndex++) {
                    var prepared = priorities[preparedIndex];
                    if ((prepared == 'farm' || prepared == 'cottage')
                        && available.indexOf(prepared) != -1
                        && (allowReplacement
                            || !this.workerActionReplacesImprovement(i, j, prepared))) return [prepared];
                }
            }
            for (var priorityIndex=0; priorityIndex < priorities.length; priorityIndex++) {
                var preferred = priorities[priorityIndex];
                if (modifiers[preferred]) continue;
                if (available.indexOf(preferred) != -1
                    && (allowReplacement
                        || !this.workerActionReplacesImprovement(i, j, preferred))) return [preferred];
                var replaceWorkshopForFood = preferred == 'farm' && modifiers.workshop
                    && typeof cityOrAllowGenericFarm == 'object'
                    && !this.workerCityAllowsWorkshop(cityOrAllowGenericFarm, _units[k]);
                if ((preferred == 'farm' || preferred == 'cottage')
                    && (!hasPrimary || replaceWorkshopForFood)
                    && !modifiers.irrigation && this.canBuildIrrigation(k)
                    && (this.isIrrigationWaterSource(i, j) || this.hasIrrigationSourceNear(i, j))
                    && (allowReplacement || !this.workerActionReplacesImprovement(i, j, 'irrigate'))) {
                    return ['irrigate'];
                }
            }
            if (!hasPrimary && (terrainType == 4 || terrainType == 5)
                && available.indexOf('mine') != -1
                && (allowReplacement || !this.workerActionReplacesImprovement(i, j, 'mine'))) return ['mine'];
            return [];
        }
        finally {
            _units[k].coord = original;
        }
    }

    irrigationChainTileAllowed(i, j)
    {
        if (i < 0 || i >= _map_size || j < 0 || j >= _map_size || this.isCityTile(i, j)) {
            return false;
        }
        var terrainType = _map_terrain_tex[i][j]&0x0F;
        if (terrainType != 1 && terrainType != 2 && terrainType != 7) return false;
        var modifiers = _map_terrain_mod[i][j] || {};
        if (modifiers.fortification) return false;
        var resourceImprovement = this.openedResourceImprovementForTile(i, j);
        if (resourceImprovement && resourceImprovement != 'farm') return false;
        var blocking = ['pasture', 'plantation', 'camp', 'fishing_boats', 'quarry',
            'winery', 'cottage', 'workshop', 'mine'];
        for (var n=0; n < blocking.length; n++) {
            if (modifiers[blocking[n]]) return false;
        }
        return true;
    }

    nextResourceIrrigationChainTile(targetI, targetJ, maximumDistance = 12)
    {
        if (!_game_state.isTechnologyOpen('Irrigation')
            || this.openedResourceImprovementForTile(targetI, targetJ) != 'farm'
            || !this.irrigationChainTileAllowed(targetI, targetJ)) return null;
        var queue = [{i:targetI, j:targetJ, distance:0}];
        var visited = {};
        var queued = {};
        queued[targetI + ':' + targetJ] = true;
        var directions = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1]];
        for (var cursor=0; cursor < queue.length; cursor++) {
            var point = queue[cursor];
            var key = point.i + ':' + point.j;
            if (visited[key] || !this.irrigationChainTileAllowed(point.i, point.j)) continue;
            visited[key] = true;
            if (this.canBuildIrrigationAt(point.i, point.j)) {
                return new Coord(point.i, point.j);
            }
            if (point.distance >= maximumDistance) continue;
            for (var n=0; n < directions.length; n++) {
                var ni = point.i + directions[n][0];
                var nj = point.j + directions[n][1];
                var neighborKey = ni + ':' + nj;
                if (queued[neighborKey] || !this.irrigationChainTileAllowed(ni, nj)) continue;
                queued[neighborKey] = true;
                queue.push({i:ni, j:nj, distance:point.distance + 1});
            }
        }
        return null;
    }

    hexDistance(di, dj)
    {
        return di*dj >= 0 ? Math.max(Math.abs(di), Math.abs(dj)) : Math.abs(di) + Math.abs(dj);
    }

    workerCityNeedsGenericFarm(city)
    {
        if (!city || !city.coord) return false;
        if (typeof _city_economy != 'undefined') _city_economy.ensureCity(city);
        var population = Math.max(1, Number(city.cityPopulation)
            || (city.economy && city.economy.citizens ? city.economy.citizens.length : 1));
        var desiredFarmCount = Math.max(1, Math.ceil(population / 5));
        var foodSurplus = city.lastCityIncome && city.lastCityIncome.food != undefined
            ? Number(city.lastCityIncome.food)
            : city.economy && city.economy.lastIncome
                ? Number(city.economy.lastIncome.food) : 0;
        if (!Number.isFinite(foodSurplus)) foodSurplus = 0;

        var counts = this.workerCityImprovementCounts(city);
        var foodSupport = counts.foodSupport + counts.pendingFoodSupport;
        var workshopSupport = Math.ceil((counts.workshop + counts.pendingWorkshop) / 2);
        return foodSupport < Math.max(desiredFarmCount, workshopSupport)
            || (foodSurplus <= 1 && foodSupport < desiredFarmCount);
    }

    workerCityImprovementCounts(city)
    {
        var counts = {
            farm: 0, irrigation: 0, foodSupport: 0, cottage: 0, workshop: 0,
            pendingFoodSupport: 0, pendingWorkshop: 0,
        };
        if (!city || !city.coord) return counts;
        for (var di=-5; di <= 5; di++) {
            for (var dj=-5; dj <= 5; dj++) {
                if (this.hexDistance(di, dj) > 5) continue;
                var i = city.coord.i + di;
                var j = city.coord.j + dj;
                if (i < 0 || i >= _map_size || j < 0 || j >= _map_size) continue;
                var tileCity = this.nearestOwnedCityForWorker({team: city.team, coord: new Coord(i, j)});
                if (tileCity !== city) continue;
                var modifiers = _map_terrain_mod[i] && _map_terrain_mod[i][j]
                    ? _map_terrain_mod[i][j] : {};
                if (modifiers.farm) counts.farm++;
                if (modifiers.irrigation && (i != city.coord.i || j != city.coord.j)) counts.irrigation++;
                if (modifiers.farm || (modifiers.irrigation
                    && (i != city.coord.i || j != city.coord.j))) counts.foodSupport++;
                if (modifiers.cottage) counts.cottage++;
                if (modifiers.workshop) counts.workshop++;
            }
        }
        var pendingWorkshopTiles = {};
        var pendingFoodTiles = {};
        for (var k=0; k < _units.length; k++) {
            var worker = _units[k];
            if (!worker || worker.unitTypeId != 'worker' || !worker.coord
                || Number(worker.team) != Number(city.team)) continue;
            var action = worker.automateBuild || worker.clientImprovementState
                || (worker.state == 'irrigate' ? 'irrigation' : worker.state);
            var target = worker.automateTarget || worker.coord;
            if (!target) continue;
            var targetCity = this.nearestOwnedCityForWorker({team: worker.team, coord: target});
            if (targetCity !== city) continue;
            var key = target.i + ':' + target.j;
            var targetModifiers = _map_terrain_mod[target.i] && _map_terrain_mod[target.i][target.j]
                ? _map_terrain_mod[target.i][target.j] : {};
            if (action == 'workshop' && !targetModifiers.workshop) pendingWorkshopTiles[key] = true;
            if ((action == 'farm' || action == 'irrigation' || action == 'irrigate')
                && !targetModifiers.farm && !targetModifiers.irrigation) pendingFoodTiles[key] = true;
        }
        counts.pendingWorkshop = Object.keys(pendingWorkshopTiles).length;
        counts.pendingFoodSupport = Object.keys(pendingFoodTiles).length;
        return counts;
    }

    workerCityImprovementPriorities(city, worker)
    {
        if (!city) return ['workshop', 'farm', 'cottage'];
        var income = city.lastCityIncome || (city.economy && city.economy.lastIncome) || {};
        var population = Math.max(1, Number(city.cityPopulation)
            || (city.economy && city.economy.citizens ? city.economy.citizens.length : 1));
        var hasFoodBalance = income.food != undefined && Number.isFinite(Number(income.food));
        var food = Number(income.food);
        var production = Number(income.production);
        var money = Number(income.money);
        if (!Number.isFinite(food)) food = 0;
        if (!Number.isFinite(production)) production = 0;
        if (!Number.isFinite(money)) money = 0;
        var counts = this.workerCityImprovementCounts(city);
        // A City with no food surplus must recover food before adding another
        // Workshop. Farms remain uncapped during the emergency because the
        // authoritative balance can include upkeep from many legacy Workshops.
        if ((hasFoodBalance && food <= 0) || !this.workerCityAllowsWorkshop(city, worker, counts)) {
            return ['farm', 'cottage'];
        }
        var scores = {
            // Low production receives extra weight so a weak City establishes
            // Workshops before filling every suitable Tile with Farms.
            workshop: (Math.max(0, 5-production)*2 + 2)/(counts.workshop+1),
            farm: (Math.max(0, 2-food) + Math.max(0, population-2)*0.25 + 1)/(counts.farm+1),
            cottage: (Math.max(0, 2-money) + 1)/(counts.cottage+1),
        };
        var targetCount = Math.max(1, Math.ceil(population/2));
        return ['farm', 'cottage', 'workshop'].filter(function(action) {
            return counts[action] < targetCount;
        }).sort(function(a, b) {
            if (scores[a] != scores[b]) return scores[b]-scores[a];
            return ['workshop', 'farm', 'cottage'].indexOf(a)
                - ['workshop', 'farm', 'cottage'].indexOf(b);
        });
    }

    workerCityAllowsWorkshop(city, worker, counts)
    {
        if (!city) return true;
        counts = counts || this.workerCityImprovementCounts(city);
        var workerAlreadyPending = worker && (worker.automateBuild == 'workshop'
            || worker.clientImprovementState == 'workshop' || worker.state == 'workshop');
        var additionalWorkshop = workerAlreadyPending ? 0 : 1;
        var futureWorkshops = counts.workshop + counts.pendingWorkshop + additionalWorkshop;
        var futureFoodSupport = counts.foodSupport + counts.pendingFoodSupport;
        // PREHISTORY-AUTO-010B: every two Workshops require at least one
        // completed or pending non-city Farm/Irrigation support Tile.
        var requiredFoodSupport = futureWorkshops <= 1 ? 0 : Math.ceil(futureWorkshops/2);
        if (futureFoodSupport < requiredFoodSupport) return false;
        var income = city.lastCityIncome || (city.economy && city.economy.lastIncome) || {};
        var food = Number(income.food);
        if (income.food == undefined || !Number.isFinite(food)) return true;
        var population = Math.max(1, Number(city.cityPopulation)
            || (city.economy && city.economy.citizens ? city.economy.citizens.length : 1));
        var reserve = Math.max(2, Math.ceil(population/4));
        var reportedWorkshopCost = Number(income.workshopFoodCost);
        if (!Number.isFinite(reportedWorkshopCost)) reportedWorkshopCost = 0;
        var projectedFood = food + reportedWorkshopCost - futureWorkshops*2;
        return projectedFood >= reserve;
    }

    tileHasRoadRequiredImprovement(i, j)
    {
        if (i < 0 || i >= _map_size || j < 0 || j >= _map_size) return false;
        var modifiers = _map_terrain_mod[i][j] || {};
        var improvements = ['irrigation', 'pasture', 'farm', 'plantation', 'camp',
            'fishing_boats', 'quarry', 'winery', 'fortification', 'cottage', 'hamlet',
            'village', 'workshop', 'mine'];
        for (var n=0; n < improvements.length; n++) {
            if (modifiers[improvements[n]]) return true;
        }
        return false;
    }

    tileHasPrimaryImprovement(i, j)
    {
        return this.tileHasRoadRequiredImprovement(i, j);
    }

    workerReplaceableImprovementAt(i, j)
    {
        if (i < 0 || i >= _map_size || j < 0 || j >= _map_size) return null;
        var modifiers = _map_terrain_mod[i][j] || {};
        var improvements = ['pasture', 'farm', 'plantation', 'camp', 'fishing_boats',
            'quarry', 'winery', 'cottage', 'hamlet', 'village', 'workshop', 'mine'];
        for (var n=0; n < improvements.length; n++) {
            if (modifiers[improvements[n]]) return improvements[n];
        }
        return null;
    }

    workerActionReplacesImprovement(i, j, action)
    {
        var existing = this.workerReplaceableImprovementAt(i, j);
        if (!existing) return false;
        var normalized = action == 'irrigate' ? 'irrigation' : action;
        return normalized != existing;
    }

    cityHasUnimprovedCitizenPlot(city)
    {
        var citizenCoords = this.cityCitizenCoords(city);
        for (var n=0; n < citizenCoords.length; n++) {
            var coord = citizenCoords[n];
            if (this.isCityTile(coord.i, coord.j)) continue;
            if (!this.tileHasPrimaryImprovement(coord.i, coord.j)) return true;
        }
        return false;
    }

    workerReplacementRandom()
    {
        return Math.random();
    }

    ownedCitiesForWorker(worker)
    {
        return _units.filter(function(unit) {
            return unit && unit.type == 3 && unit.coord
                && !unit.outsideMapWindow
                && Number(unit.team) == Number(worker.team)
                && unit.coord.i >= 0 && unit.coord.i < _map_size
                && unit.coord.j >= 0 && unit.coord.j < _map_size;
        });
    }

    nearestOwnedCityForWorker(worker)
    {
        var cities = this.ownedCitiesForWorker(worker);
        var nearest = null;
        var nearestDistance = Infinity;
        for (var n=0; n < cities.length; n++) {
            var distance = this.hexDistance(
                worker.coord.i-cities[n].coord.i, worker.coord.j-cities[n].coord.j
            );
            if (distance < nearestDistance) {
                nearest = cities[n];
                nearestDistance = distance;
            }
        }
        return nearest;
    }

    workerSupportCount(city)
    {
        if (!city || !city.coord) return 0;
        var count = 0;
        for (var k=0; k<_units.length; k++) {
            var worker = _units[k];
            if (!worker || worker.unitTypeId != 'worker' || !worker.coord
                || Number(worker.team) != Number(city.team)) continue;
            var supportCoord = worker.gotoCoord && worker.gotoPath && worker.gotoPath.length
                ? worker.gotoCoord : worker.coord;
            if (this.hexDistance(supportCoord.i-city.coord.i, supportCoord.j-city.coord.j) <= 5) count++;
        }
        return count;
    }

    underservedCityForWorker(worker, nearestCity)
    {
        if (!worker || !nearestCity) return nearestCity;
        var nearestSupport = this.workerSupportCount(nearestCity);
        // A City keeps its first two local Workers. Additional idle Workers may
        // support a visible City with a smaller local workforce.
        if (nearestSupport <= 2) return nearestCity;
        var cities = this.ownedCitiesForWorker(worker);
        var best = nearestCity;
        var bestSupport = nearestSupport;
        var bestPopulation = Math.max(1, Number(nearestCity.cityPopulation) || 1);
        var bestDistance = this.hexDistance(
            worker.coord.i-nearestCity.coord.i, worker.coord.j-nearestCity.coord.j
        );
        for (var n=0; n<cities.length; n++) {
            var city = cities[n];
            var support = this.workerSupportCount(city);
            var population = Math.max(1, Number(city.cityPopulation) || 1);
            var distance = this.hexDistance(worker.coord.i-city.coord.i, worker.coord.j-city.coord.j);
            if (support < bestSupport
                || (support == bestSupport && population < bestPopulation)
                || (support == bestSupport && population == bestPopulation && distance < bestDistance)) {
                best = city;
                bestSupport = support;
                bestPopulation = population;
                bestDistance = distance;
            }
        }
        return bestSupport < nearestSupport ? best : nearestCity;
    }

    cityCitizenCoords(city)
    {
        if (!city) return [];
        if ((!city.economy || !Array.isArray(city.economy.citizens)
            || !city.economy.citizens.length) && typeof _city_economy != 'undefined') {
            _city_economy.ensureCity(city);
        }
        var citizens = city.economy && Array.isArray(city.economy.citizens)
            ? city.economy.citizens : [];
        var found = {};
        var result = [];
        for (var n=0; n < citizens.length; n++) {
            var coord = citizens[n] && citizens[n].coord;
            if (!coord || coord.i < 0 || coord.i >= _map_size || coord.j < 0 || coord.j >= _map_size) continue;
            var key = coord.i + ':' + coord.j;
            if (found[key]) continue;
            found[key] = true;
            result.push(new Coord(coord.i, coord.j));
        }
        return result;
    }

    workerAutomationCandidate(k, i, j, action, priority, city, followupAction)
    {
        var worker = _units[k];
        if (!worker || !action || i < 0 || i >= _map_size || j < 0 || j >= _map_size) return null;
        // City Tiles can carry automatic road/irrigation modifiers but Workers
        // cannot build or replace improvements there.
        if (action != 'connect_road' && this.isCityTile(i, j)) return null;
        if ((i != worker.coord.i || j != worker.coord.j)
            && this.workerAutomationTargetReserved(k, i, j)) return null;
        var normalizedAction = action == 'irrigate' ? 'irrigation' : action;
        if (worker.automationSkipNextAction == normalizedAction) return null;
        if (this.workerAutomationActionBlocked(k, i, j, action)) return null;
        return {
            path: i == worker.coord.i && j == worker.coord.j ? [] : null,
            workerIndex: k,
            distance: this.hexDistance(i-worker.coord.i, j-worker.coord.j),
            target: new Coord(i, j),
            action: action,
            priority: priority,
            city: city,
            followupAction: followupAction,
        };
    }

    bestWorkerAutomationCandidate(candidates)
    {
        candidates.sort(function(a, b) {
            if (a.distance != b.distance) return a.distance-b.distance;
            if (a.target.i != b.target.i) return a.target.i-b.target.i;
            return a.target.j-b.target.j;
        });
        for (var n=0; n<candidates.length; n++) {
            var candidate = candidates[n];
            if (candidate.path == null) {
                if (this.workerAutomationPathBudget <= 0) return null;
                this.workerAutomationPathBudget--;
                candidate.path = this.buildPath(candidate.workerIndex, candidate.target, {
                    pathMaximumExpanded: 384,
                    pathMaximumMilliseconds: 3,
                });
                if (!candidate.path.length) continue;
            }
            return candidate;
        }
        return null;
    }

    dispatchWorkerAutomationCandidate(k, candidate)
    {
        if (!candidate) return false;
        var worker = _units[k];
        var intermediateResourceIrrigation = candidate.action == 'irrigate'
            && candidate.resourceTarget
            && (candidate.target.i != candidate.resourceTarget.i
                || candidate.target.j != candidate.resourceTarget.j);
        var foodRecoveryFollowup = candidate.action == 'irrigate' && !intermediateResourceIrrigation
            && candidate.city
            && !this.workerCityAllowsWorkshop(candidate.city, worker) ? 'farm' : null;
        this.recordWorkerAutomationDecision(k, 'dispatch', {
            action: candidate.action,
            priority: candidate.priority,
            target: candidate.target,
            pathLength: candidate.path.length,
            cityId: candidate.city ? candidate.city.serverId : null,
            followupAction: candidate.followupAction || null,
            resourceTarget: candidate.resourceTarget || null,
        });
        var normalizedAction = candidate.action == 'irrigate' ? 'irrigation' : candidate.action;
        if (worker.automationSkipNextAction
            && worker.automationSkipNextAction != normalizedAction) {
            delete worker.automationSkipNextAction;
        }
        worker.automationPriority = candidate.priority;
        if (candidate.action == 'connect_road') {
            return this.startAutomatedRoadConnection(
                k, candidate.city, candidate.target, candidate.followupAction
            );
        }
        if (foodRecoveryFollowup) {
            worker.automationFollowupAction = foodRecoveryFollowup;
            worker.automationFollowupTarget = new Coord(candidate.target.i, candidate.target.j);
        }
        else {
            delete worker.automationFollowupAction;
            delete worker.automationFollowupTarget;
        }
        if (!candidate.path.length) {
            delete worker.automateBuild;
            delete worker.automateTarget;
            return this.startAutomatedWorkerAction(k, candidate.action);
        }
        worker.automateBuild = candidate.action;
        worker.automateTarget = new Coord(candidate.target.i, candidate.target.j);
        this.assignPath(k, candidate.path);
        return true;
    }

    workerRoadConnectedToCity(city, targetI, targetJ, allowUnroadedTarget = false)
    {
        if (!city || !city.coord) return false;
        var targetKey = targetI + ':' + targetJ;
        var queue = [new Coord(city.coord.i, city.coord.j)];
        var visited = {};
        var directions = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1]];
        for (var cursor=0; cursor < queue.length; cursor++) {
            var point = queue[cursor];
            if (point.i < 0 || point.i >= _map_size || point.j < 0 || point.j >= _map_size) continue;
            var key = point.i + ':' + point.j;
            if (visited[key]) continue;
            var origin = point.i == city.coord.i && point.j == city.coord.j;
            var target = key == targetKey;
            if (!origin && !target && (!_map_terrain_mod[point.i][point.j]
                || !_map_terrain_mod[point.i][point.j].road)) continue;
            if (target && !allowUnroadedTarget && !origin
                && (!_map_terrain_mod[point.i][point.j]
                    || !_map_terrain_mod[point.i][point.j].road)) continue;
            visited[key] = true;
            if (target) return true;
            for (var n=0; n < directions.length; n++) {
                queue.push(new Coord(point.i + directions[n][0], point.j + directions[n][1]));
            }
        }
        return false;
    }

    startAutomatedRoadConnection(k, city, target, followupAction)
    {
        var worker = _units[k];
        if (!worker || !city || !target || !this.canUseRoadTo(k)) return false;
        var startsConnected = this.workerRoadConnectedToCity(city, worker.coord.i, worker.coord.j);
        worker.roadToFollowupAction = followupAction;
        worker.roadToFollowupTarget = new Coord(target.i, target.j);
        if (!startsConnected) {
            var returnPath = this.buildRoadPath(k, city.coord);
            if (!returnPath.length) return false;
            worker.automateBuild = 'connect_road';
            worker.automateTarget = new Coord(target.i, target.j);
            this.assignPath(k, returnPath);
            return true;
        }
        var roadPath = this.buildRoadPath(k, target);
        if (!roadPath.length) return false;
        worker.state = 'road_to';
        worker.automationMode = 'road_to';
        worker.resumeAutomationAfterRoadTo = true;
        worker.automateBuild = 'connect_road';
        worker.automateTarget = new Coord(target.i, target.j);
        this.assignPath(k, roadPath);
        this.prepareRoadToTurn(k);
        return true;
    }

    autoRouteWorker(k)
    {
        var worker = _units[k];
        this.workerAutomationPathBudget = 12;
        var nearestCity = this.nearestOwnedCityForWorker(worker);
        if (!nearestCity) {
            this.recordWorkerAutomationDecision(k, 'idle_no_owned_city');
            return false;
        }
        var supportCity = this.underservedCityForWorker(worker, nearestCity);
        if (supportCity && supportCity !== nearestCity) {
            var supportPath = this.buildPath(k, supportCity.coord, {
                pathMaximumExpanded: 768,
                pathMaximumMilliseconds: 6,
            });
            if (supportPath.length) {
                worker.automationPriority = 0;
                delete worker.automateBuild;
                delete worker.automateTarget;
                this.assignPath(k, supportPath);
                this.recordWorkerAutomationDecision(k, 'rebalance_to_underserved_city', {
                    priority: 0, target: supportCity.coord, pathLength: supportPath.length,
                    cityId: supportCity.serverId,
                    localWorkers: this.workerSupportCount(supportCity),
                });
                return true;
            }
        }
        // PREHISTORY-AUTO-016: authoritative movement synchronization can finish
        // a route without calling afterUnitRouteUpdated(). Consume the saved
        // project before recalculating work, so arrival at forest starts chopping.
        if (worker.automateBuild && worker.automateTarget
            && worker.coord.i == worker.automateTarget.i
            && worker.coord.j == worker.automateTarget.j) {
            var arrivedAction = worker.automateBuild;
            var arrivedActionAllowed = arrivedAction == 'chop_forest'
                ? this.canChopForest(k)
                : arrivedAction == 'irrigate'
                    ? this.canBuildIrrigation(k)
                    : this.canBuildWorkerTileBuilding(k, arrivedAction);
            if (arrivedAction == 'workshop' && !this.workerCityAllowsWorkshop(nearestCity, worker)) {
                arrivedActionAllowed = false;
            }
            if (arrivedActionAllowed) {
                this.recordWorkerAutomationDecision(k, 'start_arrived_project', {
                    action: arrivedAction,
                    target: worker.automateTarget,
                    cityId: nearestCity.serverId,
                });
                delete worker.automateBuild;
                delete worker.automateTarget;
                return this.startAutomatedWorkerAction(k, arrivedAction);
            }
            delete worker.automateBuild;
            delete worker.automateTarget;
        }
        var nearestCityDistance = this.hexDistance(
            worker.coord.i-nearestCity.coord.i, worker.coord.j-nearestCity.coord.j
        );
        if (nearestCityDistance > 5) {
            var returnPath = this.buildPath(k, nearestCity.coord);
            if (!returnPath.length) return false;
            worker.automationPriority = 0;
            delete worker.automateBuild;
            delete worker.automateTarget;
            this.assignPath(k, returnPath);
            this.recordWorkerAutomationDecision(k, 'return_to_nearest_city', {
                priority: 0, target: nearestCity.coord, pathLength: returnPath.length,
                cityId: nearestCity.serverId,
            });
            return true;
        }
        var candidates = [];
        var citizenCoords = this.cityCitizenCoords(nearestCity);

        // Priority 1: connect an already improved resource in this City's region.
        for (var di=-4; di <= 4; di++) {
            for (var dj=-4; dj <= 4; dj++) {
                var i = nearestCity.coord.i + di;
                var j = nearestCity.coord.j + dj;
                if (i < 0 || i >= _map_size || j < 0 || j >= _map_size) continue;
                var resourceAction = this.openedResourceImprovementForTile(i, j);
                var modifiers = _map_terrain_mod[i][j] || {};
                if (!resourceAction || !modifiers[resourceAction]
                    || this.workerRoadConnectedToCity(nearestCity, i, j) || !this.canUseRoadTo(k)) continue;
                var resourceRoad = this.workerAutomationCandidate(
                    k, i, j, 'connect_road', 1, nearestCity, null
                );
                if (resourceRoad) candidates.push(resourceRoad);
            }
        }
        var best = this.bestWorkerAutomationCandidate(candidates);
        if (best) return this.dispatchWorkerAutomationCandidate(k, best);

        // Priority 2: build the required improvement on an opened resource.
        candidates = [];
        for (var resourceDi=-4; resourceDi <= 4; resourceDi++) {
            for (var resourceDj=-4; resourceDj <= 4; resourceDj++) {
                var resourceI = nearestCity.coord.i + resourceDi;
                var resourceJ = nearestCity.coord.j + resourceDj;
                if (resourceI < 0 || resourceI >= _map_size || resourceJ < 0 || resourceJ >= _map_size) continue;
                var required = this.openedResourceImprovementForTile(resourceI, resourceJ);
                if (!required || (_map_terrain_mod[resourceI][resourceJ] || {})[required]) continue;
                var resourceOptions = this.workerAutomationOptionsAt(k, resourceI, resourceJ, nearestCity);
                var resourceTargetI = resourceI;
                var resourceTargetJ = resourceJ;
                if (!resourceOptions.length && required == 'farm') {
                    // PREHISTORY-AUTO-017: extend Irrigation one legal segment at a
                    // time toward a disconnected Farm resource, then revisit it.
                    var irrigationStep = this.nextResourceIrrigationChainTile(resourceI, resourceJ);
                    if (irrigationStep) {
                        resourceOptions = ['irrigate'];
                        resourceTargetI = irrigationStep.i;
                        resourceTargetJ = irrigationStep.j;
                    }
                }
                if (!resourceOptions.length) continue;
                var resourceBuild = this.workerAutomationCandidate(
                    k, resourceTargetI, resourceTargetJ, resourceOptions[0], 2, nearestCity, null
                );
                if (resourceBuild) resourceBuild.resourceTarget = new Coord(resourceI, resourceJ);
                if (resourceBuild) candidates.push(resourceBuild);
            }
        }
        best = this.bestWorkerAutomationCandidate(candidates);
        if (best) return this.dispatchWorkerAutomationCandidate(k, best);

        // Priority 3: connect an improved Tile currently assigned to a citizen.
        candidates = [];
        for (var connectedIndex=0; connectedIndex < citizenCoords.length; connectedIndex++) {
            var connectedCoord = citizenCoords[connectedIndex];
            if (!this.tileHasRoadRequiredImprovement(connectedCoord.i, connectedCoord.j)
                || this.workerRoadConnectedToCity(nearestCity, connectedCoord.i, connectedCoord.j)
                || !this.canUseRoadTo(k)) continue;
            var citizenRoad = this.workerAutomationCandidate(
                k, connectedCoord.i, connectedCoord.j, 'connect_road', 3, nearestCity, null
            );
            if (citizenRoad) candidates.push(citizenRoad);
        }
        best = this.bestWorkerAutomationCandidate(candidates);
        if (best) return this.dispatchWorkerAutomationCandidate(k, best);

        // Finish prepared Irrigation before preparing another Tile. Otherwise a
        // City can accumulate Irrigation forever without completing any Farms.
        candidates = [];
        for (var preparedDi=-4; preparedDi <= 4; preparedDi++) {
            for (var preparedDj=-4; preparedDj <= 4; preparedDj++) {
                var preparedI = nearestCity.coord.i + preparedDi;
                var preparedJ = nearestCity.coord.j + preparedDj;
                if (preparedI < 0 || preparedI >= _map_size
                    || preparedJ < 0 || preparedJ >= _map_size) continue;
                var preparedModifiers = _map_terrain_mod[preparedI][preparedJ] || {};
                if (!preparedModifiers.irrigation) continue;
                var preparedOptions = this.workerAutomationOptionsAt(
                    k, preparedI, preparedJ, nearestCity
                ).filter(function(action) { return action != 'irrigate'; });
                if (!preparedOptions.length) continue;
                var preparedBuild = this.workerAutomationCandidate(
                    k, preparedI, preparedJ, preparedOptions[0], 4, nearestCity, null
                );
                if (preparedBuild) candidates.push(preparedBuild);
            }
        }
        best = this.bestWorkerAutomationCandidate(candidates);
        if (best) return this.dispatchWorkerAutomationCandidate(k, best);

        // Priority 4: improve a Tile already assigned to this City's citizen.
        candidates = [];
        for (var workedIndex=0; workedIndex < citizenCoords.length; workedIndex++) {
            var workedCoord = citizenCoords[workedIndex];
            var workedOptions = this.workerAutomationOptionsAt(
                k, workedCoord.i, workedCoord.j, nearestCity
            );
            if (!workedOptions.length) continue;
            var workedBuild = this.workerAutomationCandidate(
                k, workedCoord.i, workedCoord.j, workedOptions[0], 4, nearestCity, null
            );
            if (workedBuild) candidates.push(workedBuild);
        }
        best = this.bestWorkerAutomationCandidate(candidates);
        if (best) return this.dispatchWorkerAutomationCandidate(k, best);

        // Priority 4b: bootstrap a small City whose only citizen is on the City
        // Tile. Without this pass every ordinary nearby Tile was ignored until
        // population growth assigned a second citizen, leaving its Worker idle.
        candidates = [];
        for (var bootstrapDi=-4; bootstrapDi <= 4; bootstrapDi++) {
            for (var bootstrapDj=-4; bootstrapDj <= 4; bootstrapDj++) {
                var bootstrapI = nearestCity.coord.i + bootstrapDi;
                var bootstrapJ = nearestCity.coord.j + bootstrapDj;
                if (bootstrapI < 0 || bootstrapI >= _map_size
                    || bootstrapJ < 0 || bootstrapJ >= _map_size
                    || this.isCityTile(bootstrapI, bootstrapJ)
                    || this.tileHasPrimaryImprovement(bootstrapI, bootstrapJ)) continue;
                var bootstrapOptions = this.workerAutomationOptionsAt(
                    k, bootstrapI, bootstrapJ, nearestCity
                );
                if (!bootstrapOptions.length) continue;
                var bootstrapBuild = this.workerAutomationCandidate(
                    k, bootstrapI, bootstrapJ, bootstrapOptions[0], 4.5, nearestCity, null
                );
                if (bootstrapBuild) candidates.push(bootstrapBuild);
            }
        }
        best = this.bestWorkerAutomationCandidate(candidates);
        if (best) return this.dispatchWorkerAutomationCandidate(k, best);

        var cities = this.ownedCitiesForWorker(worker);
        // Priority 5: road-connect another owned City to the current nearest City.
        candidates = [];
        for (var cityIndex=0; cityIndex < cities.length; cityIndex++) {
            var otherCity = cities[cityIndex];
            if (otherCity === nearestCity
                || this.workerRoadConnectedToCity(
                    nearestCity, otherCity.coord.i, otherCity.coord.j, true
                )
                || !this.canUseRoadTo(k)) continue;
            var cityRoad = this.workerAutomationCandidate(
                k, otherCity.coord.i, otherCity.coord.j, 'connect_road', 5, nearestCity, null
            );
            if (cityRoad) candidates.push(cityRoad);
        }
        best = this.bestWorkerAutomationCandidate(candidates);
        if (best) return this.dispatchWorkerAutomationCandidate(k, best);

        // Priority 6: help another City whose citizen works an unimproved Tile.
        candidates = [];
        for (var helpCityIndex=0; helpCityIndex < cities.length; helpCityIndex++) {
            var helpCity = cities[helpCityIndex];
            if (helpCity === nearestCity) continue;
            var helpCoords = this.cityCitizenCoords(helpCity);
            for (var helpIndex=0; helpIndex < helpCoords.length; helpIndex++) {
                var helpCoord = helpCoords[helpIndex];
                if (this.tileHasPrimaryImprovement(helpCoord.i, helpCoord.j)) continue;
                var helpOptions = this.workerAutomationOptionsAt(k, helpCoord.i, helpCoord.j, helpCity);
                if (!helpOptions.length) continue;
                var helpBuild = this.workerAutomationCandidate(
                    k, helpCoord.i, helpCoord.j, helpOptions[0], 6, helpCity, null
                );
                if (helpBuild) candidates.push(helpBuild);
            }
        }
        best = this.bestWorkerAutomationCandidate(candidates);
        if (best) return this.dispatchWorkerAutomationCandidate(k, best);

        // Priority 6b: before considering any replacement, search untouched
        // Tiles belonging to every other owned City. This also gives a Worker
        // useful work when its nearest City has no non-destructive task left.
        candidates = [];
        for (var remoteCityIndex=0; remoteCityIndex < cities.length; remoteCityIndex++) {
            var remoteCity = cities[remoteCityIndex];
            if (remoteCity === nearestCity) continue;
            for (var remoteDi=-4; remoteDi <= 4; remoteDi++) {
                for (var remoteDj=-4; remoteDj <= 4; remoteDj++) {
                    var remoteI = remoteCity.coord.i + remoteDi;
                    var remoteJ = remoteCity.coord.j + remoteDj;
                    if (remoteI < 0 || remoteI >= _map_size
                        || remoteJ < 0 || remoteJ >= _map_size
                        || this.isCityTile(remoteI, remoteJ)
                        || this.tileHasPrimaryImprovement(remoteI, remoteJ)) continue;
                    var tileCity = this.nearestOwnedCityForWorker({
                        team: worker.team,
                        coord: new Coord(remoteI, remoteJ),
                    });
                    if (tileCity !== remoteCity) continue;
                    var remoteOptions = this.workerAutomationOptionsAt(
                        k, remoteI, remoteJ, remoteCity
                    );
                    if (!remoteOptions.length) continue;
                    var remoteBuild = this.workerAutomationCandidate(
                        k, remoteI, remoteJ, remoteOptions[0], 6.5, remoteCity, null
                    );
                    if (remoteBuild) candidates.push(remoteBuild);
                }
            }
        }
        best = this.bestWorkerAutomationCandidate(candidates);
        if (best) return this.dispatchWorkerAutomationCandidate(k, best);

        // Priority 7: replacing an established improvement is the final
        // fallback. Any unimproved worked Tile blocks replacement globally,
        // and one roll gates the whole automation cycle so many candidate
        // Tiles cannot raise the configured 20% probability.
        var hasUnimprovedCitizenPlot = cities.some(function(city) {
            return this.cityHasUnimprovedCitizenPlot(city);
        }, this);
        var replacementAllowed = !hasUnimprovedCitizenPlot
            && this.workerReplacementRandom() < 0.20;
        if (replacementAllowed) {
            candidates = [];
            for (var replacementCityIndex=0;
                replacementCityIndex < cities.length; replacementCityIndex++) {
                var replacementCity = cities[replacementCityIndex];
                for (var replacementDi=-4; replacementDi <= 4; replacementDi++) {
                    for (var replacementDj=-4; replacementDj <= 4; replacementDj++) {
                        var replacementI = replacementCity.coord.i + replacementDi;
                        var replacementJ = replacementCity.coord.j + replacementDj;
                        if (replacementI < 0 || replacementI >= _map_size
                            || replacementJ < 0 || replacementJ >= _map_size
                            || this.isCityTile(replacementI, replacementJ)
                            || !this.workerReplaceableImprovementAt(replacementI, replacementJ)) continue;
                        var replacementTileCity = this.nearestOwnedCityForWorker({
                            team: worker.team,
                            coord: new Coord(replacementI, replacementJ),
                        });
                        if (replacementTileCity !== replacementCity) continue;
                        var replacementOptions = this.workerAutomationOptionsAt(
                            k, replacementI, replacementJ, replacementCity, true
                        );
                        var replacementAction = null;
                        for (var replacementOptionIndex=0;
                            replacementOptionIndex < replacementOptions.length;
                            replacementOptionIndex++) {
                            if (this.workerActionReplacesImprovement(
                                replacementI, replacementJ,
                                replacementOptions[replacementOptionIndex]
                            )) {
                                replacementAction = replacementOptions[replacementOptionIndex];
                                break;
                            }
                        }
                        if (!replacementAction) continue;
                        var replacementBuild = this.workerAutomationCandidate(
                            k, replacementI, replacementJ, replacementAction,
                            7, replacementCity, null
                        );
                        if (replacementBuild) candidates.push(replacementBuild);
                    }
                }
            }
            best = this.bestWorkerAutomationCandidate(candidates);
            if (best) return this.dispatchWorkerAutomationCandidate(k, best);
        }
        // A one-shot exclusion must not leave a Worker idle forever when no
        // alternative command is currently available.
        delete worker.automationSkipNextAction;
        delete worker.automationPriority;
        this.recordWorkerAutomationDecision(k, 'idle_no_available_work', {
            cityId: nearestCity.serverId,
            replacementBlockedByCitizen: hasUnimprovedCitizenPlot,
            replacementRollAllowed: replacementAllowed,
        });
        return false;
    }

    recordWorkerAutomationDecision(k, choice, details)
    {
        var unit = _units[k];
        if (!unit || unit.unitTypeId != 'worker') return null;
        details = details || {};
        var point = function(coord) {
            return coord && coord.i != undefined && coord.j != undefined
                ? {i:Number(coord.i), j:Number(coord.j)} : null;
        };
        unit.lastAutomationDecision = {
            choice: choice,
            action: details.action || unit.automateBuild || unit.automationCommandAction || null,
            priority: details.priority == undefined ? unit.automationPriority : details.priority,
            origin: point(unit.coord),
            target: point(details.target || unit.automateTarget || unit.automationCommandTarget || unit.gotoCoord),
            path_length: details.pathLength == undefined
                ? (unit.gotoPath ? unit.gotoPath.length : 0) : details.pathLength,
            city_id: details.cityId == undefined ? null : details.cityId,
            followup_action: details.followupAction || unit.roadToFollowupAction || null,
            turn: typeof _server_game != 'undefined' ? Number(_server_game.serverTurn) || 0 : 0,
        };
        return unit.lastAutomationDecision;
    }

    workerAutomationActionBlocked(k, i, j, action)
    {
        var unit = _units[k];
        if (!unit || !unit.automationBlockedActions) return false;
        if (action == 'irrigate') action = 'irrigation';
        var key = i + ':' + j + ':' + action;
        var untilTurn = Number(unit.automationBlockedActions[key]);
        var currentTurn = typeof _server_game != 'undefined' ? Number(_server_game.serverTurn) || 0 : 0;
        if (!Number.isFinite(untilTurn) || untilTurn <= currentTurn) {
            delete unit.automationBlockedActions[key];
            return false;
        }
        return true;
    }

    workerAutomationTargetReserved(k, i, j)
    {
        for (var n=0; n < _units.length; n++) {
            if (n == k || !_units[n] || _units[n].unitTypeId != 'worker'
                || _units[n].automationMode != 'automate') continue;
            var other = _units[n];
            var target = other.automateTarget || other.automationCommandTarget;
            if (!target) continue;
            var active = !!(other.pendingImmediateBuild || other.automationCommandAction
                || this.isImprovementState(other.state)
                || (other.gotoPath && other.gotoPath.length)
                || other.gotoCoord != undefined);
            if (!active) {
                delete other.automateBuild;
                delete other.automateTarget;
                continue;
            }
            if (target.i == i && target.j == j) return true;
        }
        return false;
    }

    startAutomatedWorkerAction(k, action)
    {
        if (!_units[k] || _units[k].pendingImmediateBuild) return true;
        var unit = _units[k];
        var normalizedAction = action == 'irrigate' ? 'irrigation' : action;
        unit.automationCommandAction = normalizedAction;
        unit.automationCommandTarget = new Coord(unit.coord.i, unit.coord.j);
        var currentTurn = typeof _server_game != 'undefined'
            ? Number(_server_game.serverTurn) || 0 : 0;
        unit.automationCommandDeadline = currentTurn + 12;
        this.beginImprovement(k, action, true);
        return true;
    }

    timeoutAutomatedWorkerCommand(k)
    {
        var unit = _units[k];
        if (!unit || unit.unitTypeId != 'worker' || unit.automationMode != 'automate'
            || unit.pendingImmediateBuild || !unit.automationCommandAction) return false;
        var currentTurn = typeof _server_game != 'undefined'
            ? Number(_server_game.serverTurn) || 0 : 0;
        if (currentTurn < Number(unit.automationCommandDeadline || Infinity)) return false;
        var target = unit.automationCommandTarget || unit.coord;
        if (!unit.automationBlockedActions) unit.automationBlockedActions = {};
        unit.automationBlockedActions[target.i + ':' + target.j + ':' + unit.automationCommandAction]
            = currentTurn + 20;
        unit.automationSkipNextAction = unit.automationCommandAction;
        this.recordWorkerAutomationDecision(k, 'command_timeout', {
            action: unit.automationCommandAction, target: target,
        });
        this.setUnitState(k, 'ready', true);
        unit.automationMode = 'automate';
        delete unit.automateBuild;
        delete unit.automateTarget;
        delete unit.automationCommandAction;
        delete unit.automationCommandTarget;
        delete unit.automationCommandDeadline;
        return true;
    }

    completeAutomatedWorkerCommand(unit, succeeded)
    {
        if (!unit || unit.unitTypeId != 'worker') return false;
        var followup = unit.automationFollowupAction;
        var followupTarget = unit.automationFollowupTarget;
        if (!succeeded && unit.automationCommandAction) {
            unit.automationSkipNextAction = unit.automationCommandAction;
        }
        delete unit.automationCommandAction;
        delete unit.automationCommandTarget;
        delete unit.automationCommandDeadline;
        delete unit.automationFollowupAction;
        delete unit.automationFollowupTarget;
        if (succeeded && followup && followupTarget && unit.coord
            && unit.coord.i == followupTarget.i && unit.coord.j == followupTarget.j) {
            var index = _units.indexOf(unit);
            if (index != -1 && this.workerTileBuildingMenuOptions(index).indexOf(followup) != -1) {
                return this.startAutomatedWorkerAction(index, followup);
            }
        }
        return true;
    }

    autoRouteAutomate(k)
    {
        if (_units[k].unitTypeId == 'worker') {
            this.autoRouteWorker(k);
            return;
        }
        if (_units[k].unitTypeId == 'workboat') {
            this.autoRouteWorkBoat(k);
            return;
        }
        for (var n=0; n < 4; n++) {
            var target = _game.random_point(0, _units[k].coord.add(-8, -8), _units[k].coord.add(8, 8));
            var path = this.buildPath(k, target, {
                pathMaximumExpanded: 384,
                pathMaximumMilliseconds: 3,
            });
            if (path.length) {
                this.assignPath(k, path);
                return;
            }
        }
    }

    workBoatAutomationTargetReserved(k, i, j)
    {
        for (var n=0; n < _units.length; n++) {
            if (n == k || !_units[n] || _units[n].unitTypeId != 'workboat'
                || _units[n].automationMode != 'automate' || !_units[n].automateTarget) continue;
            if (_units[n].automateTarget.i == i && _units[n].automateTarget.j == j) return true;
        }
        return false;
    }

    workBoatAutomationCandidate(k, i, j, priority)
    {
        var workBoat = _units[k];
        if (!workBoat || !this.canBuildNetworkAt(i, j)
            || this.workBoatAutomationTargetReserved(k, i, j)) return null;
        return {
            target: new Coord(i, j),
            path: i == workBoat.coord.i && j == workBoat.coord.j ? [] : null,
            workerIndex: k,
            distance: this.hexDistance(i-workBoat.coord.i, j-workBoat.coord.j),
            priority: priority,
        };
    }

    autoRouteWorkBoat(k)
    {
        var workBoat = _units[k];
        if (!workBoat || workBoat.unitTypeId != 'workboat') return false;
        this.workerAutomationPathBudget = 12;
        var candidates = [];
        // Visible water resources are improved before ordinary worked water Tiles.
        for (var i=0; i<_map_size; i++) {
            for (var j=0; j<_map_size; j++) {
                var resource = _map_resource[i] && _map_resource[i][j];
                if (!resource || !resource.type || (_map.isResourceVisible
                    && !_map.isResourceVisible(i, j))) continue;
                var resourceCandidate = this.workBoatAutomationCandidate(k, i, j, 1);
                if (resourceCandidate) candidates.push(resourceCandidate);
            }
        }
        var best = this.bestWorkerAutomationCandidate(candidates);
        if (!best) {
            candidates = [];
            var cities = this.ownedCitiesForWorker(workBoat);
            for (var cityIndex=0; cityIndex<cities.length; cityIndex++) {
                var citizenCoords = this.cityCitizenCoords(cities[cityIndex]);
                for (var citizenIndex=0; citizenIndex<citizenCoords.length; citizenIndex++) {
                    var coord = citizenCoords[citizenIndex];
                    var citizenCandidate = this.workBoatAutomationCandidate(k, coord.i, coord.j, 2);
                    if (citizenCandidate) candidates.push(citizenCandidate);
                }
            }
            best = this.bestWorkerAutomationCandidate(candidates);
        }
        if (!best) {
            delete workBoat.automationPriority;
            delete workBoat.automateBuild;
            delete workBoat.automateTarget;
            return false;
        }
        workBoat.automationPriority = best.priority;
        if (!best.path.length) {
            delete workBoat.automateBuild;
            delete workBoat.automateTarget;
            this.beginImprovement(k, 'network', true);
            return true;
        }
        workBoat.automateBuild = 'network';
        workBoat.automateTarget = new Coord(best.target.i, best.target.j);
        this.assignPath(k, best.path);
        return true;
    }

    applyAutoRoutingRules()
    {
        var automaticRoutesStarted = 0;
        var automaticRouteLimit = 4;
        for (var k=0; k < _units.length; k++) {
            if (!_units[k].can_move || _units[k].outsideMapWindow) continue;
            if (_units[k].unitTypeId == 'worker'
                && (_units[k].roadToBuilding || _units[k].roadToDestination)
                && (_units[k].automationMode != 'road_to' || _units[k].state != 'road_to')) {
                // Road-to is a persistent client order. An AI pass or stale
                // server state cannot demote it while its destination exists.
                _units[k].automationMode = 'road_to';
                _units[k].state = 'road_to';
            }
            this.timeoutAutomatedWorkerCommand(k);
            if (_units[k].unitTypeId == 'worker'
                && (_units[k].automationMode == 'automate' || _units[k].state == 'automate')
                && (!(_units[k].gotoPath && _units[k].gotoPath.length))
                && _units[k].gotoCoord != undefined) {
                this.recordWorkerAutomationDecision(k, 'recover_stale_destination', {
                    target: _units[k].gotoCoord,
                });
                this.clearUnitPath(k);
                delete _units[k].automateBuild;
                delete _units[k].automateTarget;
            }
            // A completed server-side chop may arrive before the saved client
            // task is reconciled. Clear it as soon as the Tile is no longer forest.
            if (_units[k].unitTypeId == 'worker' && _units[k].state == 'chop_forest'
                && !this.canChopForest(k)) {
                this.setUnitState(k, 'ready', true);
            }
            var mode = _units[k].automationMode || _units[k].state;
            if (mode == 'road_to' && _units[k].unitTypeId == 'worker') {
                if (this.prepareRoadToTurn(k)) continue;
            }
            if (_units[k].pendingImmediateBuild
                || this.isImprovementState(_units[k].state)
                || _units[k].gotoPath.length || _units[k].gotoCoord != undefined) {
                continue;
            }
            if (automaticRoutesStarted >= automaticRouteLimit) continue;
            // PREHISTORY-AUTO-001, rules/prehostory.md: explore alternates between nearby fog and nearest known city.
            if (mode == 'explore') {
                automaticRoutesStarted++;
                _units[k].state = 'explore';
                this.autoRouteExplore(k);
            }
            // PREHISTORY-AUTO-002, rules/prehostory.md: patrol routes around its patrol origin.
            if (mode == 'patrol') {
                automaticRoutesStarted++;
                _units[k].state = 'patrol';
                this.autoRoutePatrol(k);
            }
            // PREHISTORY-AUTO-003, rules/prehostory.md: automate chooses a nearby available land route.
            if (mode == 'automate') {
                automaticRoutesStarted++;
                _units[k].state = 'automate';
                this.autoRouteAutomate(k);
            }
        }
    }

    applyTerrainModifierRules()
    {
        for (var k=0; k < _units.length; k++) {
            if (_units[k].state == 'road_to' && _units[k].unitTypeId == 'worker'
                && !_units[k].roadToBuilding
                && (!(_units[k].gotoPath && _units[k].gotoPath.length) && _units[k].gotoCoord == undefined)
                && _map.hasRoad(_units[k].coord.i, _units[k].coord.j)) {
                _units[k].state = 'ready';
                _units[k].automationMode = null;
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

            // PREHISTORY-ROAD-003, rules/prehostory.md: every improvement takes six client turns.
            if (_units[k].road_turns_left == undefined) {
                _units[k].road_turns_left = 6;
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

            // PREHISTORY-IRRIGATION-003, rules/prehostory.md: every improvement takes six client turns.
            if (_units[k].irrigation_turns_left == undefined) {
                _units[k].irrigation_turns_left = 6;
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

        for (var k=0; k < _units.length; k++) {
            if (_units[k].state != 'network' || _units[k].unitTypeId != 'workboat') continue;
            if (!this.canBuildNetwork(k)) {
                _units[k].state = 'ready';
                _units[k].building_turns_left = undefined;
                continue;
            }
            if (_units[k].building_turns_left == undefined) _units[k].building_turns_left = 6;
            if (_units[k].building_turns_left > 0) --_units[k].building_turns_left;
            if (_units[k].building_turns_left == 0) {
                _map.addNetwork(_units[k].coord.i, _units[k].coord.j);
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

            // PREHISTORY-CHOP-004, rules/prehostory.md: jungle chopping takes four client turns.
            if (_units[k].chop_turns_left == undefined) {
                _units[k].chop_turns_left = 4;
            }
            if (_units[k].chop_turns_left > 0) {
                --_units[k].chop_turns_left;
            }

            if (_units[k].chop_turns_left == 0) {
                this.addChopProductionToNearestCity(_units[k], 10);
                // PREHISTORY-CHOP-005 and PREHISTORY-CHOP-008, rules/prehostory.md: completed chopping converts forest to base terrain.
                _map.splitSupertileAt(i, j);
                terrain = _map_terrain_tex[i][j];
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
        return (terrain&0x0F) == 6 || ((terrain&0x0F) == 4 && (terrain&0x10) != 0);
    }

    choppedForestTerrain(terrain)
    {
        // PREHISTORY-CHOP-008, rules/prehostory.md: hill forest variants preserve their hill base after chopping.
        if ((terrain&0x0F) == 4 && (terrain&0x10) != 0) return terrain & ~0x10;
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
        if (_map.hasTerrainModifier(i, j, 'fortification')) return false;
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
        // PREHISTORY-ROAD-008: captureTurn performs a delayed authoritative
        // road build at the reached Tile before this route can continue.
        this.prepareRoadToTurn(k);
    }

    prepareRoadToTurn(k)
    {
        var unit = _units[k];
        if (!unit || unit.unitTypeId != 'worker'
            || (unit.automationMode || unit.state) != 'road_to') return false;
        unit.state = 'road_to';
        unit.automationMode = 'road_to';
        if (unit.pendingImmediateBuild || unit.roadToBuilding) return true;
        if (!this.ensureRoadToLandPath(k)) {
            unit.state = 'ready';
            unit.automationMode = null;
            delete unit.roadToDestination;
            return false;
        }
        if ((!unit.gotoPath || !unit.gotoPath.length) && unit.gotoCoord
            && (unit.coord.i != unit.gotoCoord.i || unit.coord.j != unit.gotoCoord.j)) {
            var rebuiltRoadPath = this.buildRoadPath(
                k, unit.roadToDestination || unit.gotoCoord, true
            );
            if (rebuiltRoadPath.length) this.assignPath(k, rebuiltRoadPath);
        }
        if ((!unit.gotoPath || !unit.gotoPath.length) && unit.roadToDestination
            && (unit.coord.i != unit.roadToDestination.i
                || unit.coord.j != unit.roadToDestination.j)) {
            var nextRoadPath = this.buildRoadPath(k, unit.roadToDestination, true);
            if (nextRoadPath.length) this.assignPath(k, nextRoadPath);
        }
        if (this.canBuildRoadAt(unit.coord.i, unit.coord.j)) {
            unit.roadToBuilding = true;
            unit.clientImprovementTurnsLeft = this.improvementBuildTurns('road');
            if (typeof _server_game != 'undefined') _server_game.saveClientRoutes(_current_user);
            return true;
        }
        var hasRoute = unit.gotoPath && unit.gotoPath.length;
        if (!hasRoute && unit.gotoCoord == undefined) {
            if (unit.resumeAutomationAfterRoadTo) {
                unit.state = 'automate';
                unit.automationMode = 'automate';
                delete unit.resumeAutomationAfterRoadTo;
            }
            else {
                unit.state = 'ready';
                unit.automationMode = null;
            }
        }
        return false;
    }

    completeRoadToBuild(unitOrIndex, succeeded)
    {
        var unit = typeof unitOrIndex == 'object' ? unitOrIndex : _units[unitOrIndex];
        if (!unit || unit.automationMode != 'road_to') return false;
        unit.pendingImmediateBuild = false;
        unit.roadToBuilding = false;
        delete unit.clientImprovementTurnsLeft;
        delete unit.clientImprovementState;
        if (!succeeded) {
            if (unit.resumeAutomationAfterRoadTo) {
                unit.state = 'automate';
                unit.automationMode = 'automate';
                delete unit.resumeAutomationAfterRoadTo;
            }
            else {
                unit.state = 'ready';
                unit.automationMode = null;
            }
            unit.gotoPath = [];
            unit.gotoCoord = null;
            delete unit.roadToDestination;
            return true;
        }
        if ((unit.gotoPath && unit.gotoPath.length) || (unit.gotoCoord
            && (unit.coord.i != unit.gotoCoord.i || unit.coord.j != unit.gotoCoord.j))) {
            unit.state = 'road_to';
        }
        else if (unit.roadToDestination
            && (unit.coord.i != unit.roadToDestination.i
                || unit.coord.j != unit.roadToDestination.j)) {
            var continuedIndex = _units.indexOf(unit);
            var continuedPath = continuedIndex == -1 ? []
                : this.buildRoadPath(continuedIndex, unit.roadToDestination, true);
            if (continuedPath.length) this.assignPath(continuedIndex, continuedPath);
            unit.state = 'road_to';
        }
        else if (unit.resumeAutomationAfterRoadTo) {
            delete unit.roadToDestination;
            unit.state = 'automate';
            unit.automationMode = 'automate';
            delete unit.resumeAutomationAfterRoadTo;
            var followup = unit.roadToFollowupAction;
            var target = unit.roadToFollowupTarget;
            var index = _units.indexOf(unit);
            if (followup && target && index != -1 && unit.coord
                && unit.coord.i == target.i && unit.coord.j == target.j
                && this.workerTileBuildingMenuOptions(index).indexOf(followup) != -1) {
                delete unit.roadToFollowupAction;
                delete unit.roadToFollowupTarget;
                delete unit.automateBuild;
                delete unit.automateTarget;
                this.startAutomatedWorkerAction(index, followup);
                return true;
            }
            delete unit.roadToFollowupAction;
            delete unit.roadToFollowupTarget;
        }
        else {
            unit.state = 'ready';
            unit.automationMode = null;
            delete unit.roadToDestination;
        }
        return true;
    }

    afterUnitRouteUpdated(k)
    {
        if (k == -1 || _units[k] == undefined) {
            return;
        }
        if (!(_units[k].gotoPath && _units[k].gotoPath.length) && _units[k].gotoCoord == undefined) {
            if (_units[k].state == 'road_to') {
                this.prepareRoadToTurn(k);
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
        // PREHISTORY-IRRIGATION-014, rules/prehostory.md: a completed Farm is
        // itself a local irrigation source, even without an older water chain.
        if (_map.hasTerrainModifier(i, j, 'farm')) return true;
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
                // PREHISTORY-IRRIGATION-006 and PREHISTORY-IRRIGATION-014,
                // rules/prehostory.md: irrigation can extend through irrigation,
                // and a completed Farm is itself a local source.
                if (_map.hasIrrigation(ni, nj) || _map.hasTerrainModifier(ni, nj, 'farm')) {
                    return true;
                }
            }
        }
        return false;
    }

    irrigationConnectedToWater(originI, originJ)
    {
        var queue = [new Coord(originI, originJ)];
        var visited = {};
        var directions = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1]];
        for (var cursor=0; cursor < queue.length; cursor++) {
            var point = queue[cursor];
            if (point.i < 0 || point.i >= _map_size || point.j < 0 || point.j >= _map_size) continue;
            var key = point.i + ':' + point.j;
            if (visited[key]) continue;
            var origin = point.i == originI && point.j == originJ;
            if (!origin && !_map.hasIrrigation(point.i, point.j)
                && !_map.hasTerrainModifier(point.i, point.j, 'farm')) continue;
            visited[key] = true;
            var terrainType = _map_terrain_tex[point.i][point.j]&0x0F;
            if (this.isIrrigationWaterSource(point.i, point.j)
                && (terrainType != 0 || !this.isSeaConnectedWaterSource(point.i, point.j))) return true;
            for (var n=0; n < directions.length; n++) {
                var ni = point.i + directions[n][0];
                var nj = point.j + directions[n][1];
                if (ni < 0 || ni >= _map_size || nj < 0 || nj >= _map_size) continue;
                var neighborType = _map_terrain_tex[ni][nj]&0x0F;
                if (this.isIrrigationWaterSource(ni, nj)
                    && (neighborType != 0 || !this.isSeaConnectedWaterSource(ni, nj))) return true;
                if (_map.hasIrrigation(ni, nj) || _map.hasTerrainModifier(ni, nj, 'farm')) {
                    queue.push(new Coord(ni, nj));
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
        return this.canBuildIrrigationAt(_units[k].coord.i, _units[k].coord.j);
    }

    canBuildIrrigationAt(i, j)
    {
        // PREHISTORY-IRRIGATION-010, rules/prehostory.md: workers cannot build irrigation before Irrigation.
        if (!_game_state.isTechnologyOpen('Irrigation')) {
            return false;
        }
        if (i < 0 || i >= _map_size || j < 0 || j >= _map_size) return false;
        if (_map.hasTerrainModifier(i, j, 'fortification')) return false;
        // PREHISTORY-IRRIGATION-013, rules/prehostory.md: Workers cannot build irrigation on city tiles.
        if (this.isCityTile(i, j)) {
            return false;
        }
        var terrainType = _map_terrain_tex[i][j]&0x0F;
        // PREHISTORY-IRRIGATION-002 and PREHISTORY-IRRIGATION-008,
        // rules/prehostory.md: irrigation supports sand, grass, and river grass.
        if (terrainType != 1 && terrainType != 2 && terrainType != 7) {
            return false;
        }
        if (_map.hasIrrigation(i, j)) {
            return false;
        }
        // PREHISTORY-WORKER-BUILDING-007: an opened resource reserves its Tile
        // for the matching resource improvement rather than generic irrigation.
        var resourceImprovement = this.openedResourceImprovementForTile(i, j);
        if (resourceImprovement && resourceImprovement != 'farm') {
            return false;
        }
        // Mirror PHP's irrigation-network search so disconnected requests are
        // rejected before a Worker spends turns repeating them.
        return this.irrigationConnectedToWater(i, j);
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
            turns: 6,
            requiresResourceImprovement: true,
            apply: function(i, j) { return _map.addPasture(i, j); }
        },
        farm: {
            technology: 'Irrigation',
            turns: 5,
            terrainTypes: [2, 7],
            requiresIrrigation: true,
            apply: function(i, j) { return _map.addFarm(i, j); }
        },
        plantation: {
            technology: 'Pottery',
            turns: 6,
            requiresResourceImprovement: true,
            apply: function(i, j) { return _map.addPlantation(i, j); }
        },
        camp: {
            technology: 'Animal Husbandry',
            turns: 6,
            requiresResourceImprovement: true,
            apply: function(i, j) { return _map.addCamp(i, j); }
        },
        fishing_boats: {
            technology: 'Sailing',
            turns: 6,
            waterOnly: true,
            requiresResourceImprovement: true,
            apply: function(i, j) { return _map.addFishingBoats(i, j); }
        },
        quarry: {
            technology: 'Masonry',
            turns: 6,
            requiresResourceImprovement: true,
            apply: function(i, j) { return _map.addQuarry(i, j); }
        },
        winery: {
            technology: 'Pottery',
            turns: 6,
            requiresResourceImprovement: true,
            apply: function(i, j) { return _map.addWinery(i, j); }
        },
        fortification: {
            technology: 'Construction',
            turns: 6,
            apply: function(i, j) { return _map.addFortification(i, j); }
        },
        cottage: {
            technology: 'Masonry',
            turns: 5,
            requiresIrrigation: true,
            apply: function(i, j) { return _map.addCottage(i, j); }
        },
        workshop: {
            technology: 'Construction',
            turns: 6,
            apply: function(i, j) { return _map.addWorkshop(i, j); }
        },
        mine: {
            technology: 'Mining',
            turns: 6,
            terrainTypes: [1, 4, 5],
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
        var modifiers = _map_terrain_mod[i] && _map_terrain_mod[i][j]
            ? _map_terrain_mod[i][j] : {};
        if (modifiers.fortification && buildingName != 'fortification') return false;
        var resourceImprovement = this.openedResourceImprovementForTile(i, j);
        if (buildingName == 'mine' && (_map_terrain_tex[i][j]&0x0F) == 1
            && resourceImprovement != 'mine') return false;
        if (resourceImprovement && buildingName != 'fortification' && buildingName != resourceImprovement) {
            return false;
        }
        if (building.requiresResourceImprovement && !this.hasOpenedResourceForImprovement(i, j, buildingName)) {
            return false;
        }
        if (building.requiresIrrigation && !modifiers.irrigation) return false;
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
        var result = [];
        if (this.canBuildWorkerTileBuilding(k, 'fortification')) {
            result.push('fortification');
        }
        var resourceImprovement = this.openedResourceImprovementForTile(i, j);
        if (resourceImprovement) {
            // PREHISTORY-WORKER-BUILDING-007: a resource Tile exposes its matching
            // economic improvement; Fortification remains a separate defence command.
            if (this.canBuildWorkerTileBuilding(k, resourceImprovement)
                && result.indexOf(resourceImprovement) == -1) {
                result.push(resourceImprovement);
            }
            if (resourceImprovement == 'farm' && this.canBuildIrrigation(k)) {
                result.push('irrigate');
            }
            return result;
        }
        var order = ['pasture', 'farm', 'plantation', 'camp', 'fishing_boats', 'quarry', 'winery', 'cottage', 'workshop', 'mine'];
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
        if (unit.clientImprovementTurnsLeft != undefined) {
            return true;
        }
        if (unit.automationMode == 'automate' || unit.automationMode == 'road_to') {
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
                if (_prehistory_command_mode == 'road_to') {
                    this.assignRoadToDestination(selectedIndex, coord);
                }
                else {
                    this.assignPath(selectedIndex, this.buildPath(selectedIndex, coord));
                }
                this.configureMovementIntent(selectedIndex, coord);
            }
            if (_prehistory_command_mode == 'road_to' && _units[_selection].unitTypeId == 'worker'
                && (_units[_selection].gotoPath.length || _units[_selection].roadToBuilding)) {
                _units[_selection].state = 'road_to';
                _units[_selection].automationMode = 'road_to';
                this.prepareRoadToTurn(_selection);
            }
            _prehistory_command_mode = null;
            this.commandPathPreviewKey = null;
            _control.drawMovementOrders(_draw.clear());
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
        if (command.indexOf('optimize_city:') == 0 && _selection != -1) {
            var city = _units[_selection];
            var optimization = command.substring('optimize_city:'.length);
            if (city && city.type == 3 && typeof _city_economy != 'undefined'
                && _city_economy.optimizeCity(city, optimization)) {
                if (typeof _server_game != 'undefined' && city.serverId) {
                    _server_game.optimizeCity(city, optimization);
                }
                this.applyMenuRules();
                return;
            }
        }
        if (command == 'disband' && commandIndices.length) {
            var disbandIndices = commandIndices.slice().sort(function(a, b) { return b - a; });
            var deletedImmediately = false;
            for (var disbandIndex=0; disbandIndex < disbandIndices.length; disbandIndex++) {
                var unitIndex = disbandIndices[disbandIndex];
                var unit = _units[unitIndex];
                if (!unit || !unit.can_move) continue;
                if (typeof _server_game !== 'undefined' && unit.serverId) {
                    _server_game.disbandUnit(unit);
                }
                else {
                    _game.del_unit(unitIndex);
                    deletedImmediately = true;
                }
            }
            // Server disbanding is queued until End Turn, so keep the unit and
            // its action menu selected. Offline units are deleted immediately.
            if (deletedImmediately) {
                if (typeof clearGameSelection == 'function') clearGameSelection();
                else {
                    _selection = -1;
                    if (typeof _multi_selection != 'undefined') _multi_selection = [];
                }
            }
            this.applyMenuRules();
            return;
        }
        if (command == 'goto' && commandIndices.length) {
            _prehistory_command_mode = 'goto';
            this.commandPathPreviewKey = null;
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
            this.commandPathPreviewKey = null;
            // Commit the state only after a destination is chosen. Persisting a
            // destinationless Road-to lets an incoming update erase the command.
            this.applyMenuRules();
            if (!this.usesCompactActionMenu() && typeof _last_hover_coord !== 'undefined' && _last_hover_coord) {
                this.drawCommandPathPreview(_last_hover_coord);
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
        var workerBuildingCommand = command == 'fortification' || command == 'pasture' || command == 'farm'
            || command == 'plantation'
            || command == 'camp' || command == 'fishing_boats' || command == 'quarry' || command == 'winery'
            || command == 'cottage' || command == 'workshop' || command == 'mine';
        if (workerBuildingCommand) {
            if (this.canBuildWorkerTileBuilding(_selection, command)) this.beginImprovement(_selection, command);
            else this.showUnavailableWorkerCommand(command);
        }
        if (command == 'network' && this.canBuildNetwork(_selection)) {
            var workBoat = _units[_selection];
            this.beginImprovement(_selection, 'network');
        }
        if (command == 'wait' && commandIndices.length) {
            for (var waitIndex=0; waitIndex < commandIndices.length; waitIndex++) {
                this.setUnitState(commandIndices[waitIndex], 'waiting');
            }
        }
        if (command == 'road' && this.canBuildRoad(_selection)) {
            this.beginImprovement(_selection, command);
        }
        if (command == 'irrigate' && this.canBuildIrrigation(_selection)) {
            this.beginImprovement(_selection, command);
        }
        if (command == 'chop_forest' && this.canChopForest(_selection)) {
            this.beginImprovement(_selection, command);
        }
        if ((command == 'explore' || command == 'patrol' || command == 'automate') && commandIndices.length) {
            for (var autoIndex=0; autoIndex < commandIndices.length; autoIndex++) {
                var automatedUnitIndex = commandIndices[autoIndex];
                this.setUnitState(automatedUnitIndex, command);
                _units[automatedUnitIndex].automationMode = command;
                if (typeof _server_game != 'undefined' && _server_game.persistUnitAutomationMode) {
                    _server_game.persistUnitAutomationMode(_units[automatedUnitIndex], command);
                }
                if (command == 'explore') this.autoRouteExplore(automatedUnitIndex);
                if (command == 'patrol') this.autoRoutePatrol(automatedUnitIndex);
                if (command == 'automate') {
                    this.autoRouteAutomate(automatedUnitIndex);
                }
            }
        }
        this.applyBuildingStateRules(command);
        // PREHISTORY-MENU-005, rules/prehostory.md: menu visibility follows command state changes.
        this.applyMenuRules();
    }

    showUnavailableWorkerCommand(command)
    {
        var unit = _selection != -1 ? _units[_selection] : null;
        var unitId = unit ? (unit.serverId || unit.serverClientKey || '?') : '?';
        var message = vocabularyText('message.worker_command_unavailable', {
            command: vocabularyCommandName(command), id: unitId
        });
        if (typeof _server_game != 'undefined' && _server_game.setOneTurnMessage) {
            _server_game.setOneTurnMessage(_current_user, message);
        }
        else if (typeof _one_turn_message != 'undefined') _one_turn_message = message;
        if (typeof _server_game != 'undefined' && _server_game.log) _server_game.log(message);
        if (typeof _server_game != 'undefined' && _server_game.reportHandledClientError) {
            _server_game.reportHandledClientError('worker_command', {
                player_id: _current_user,
                unit_id: unit && unit.serverId != undefined ? unit.serverId : null,
                command: command,
                i: unit && unit.coord ? unit.coord.i : null,
                j: unit && unit.coord ? unit.coord.j : null,
            }, message, 'worker_command_unavailable');
        }
    }
}

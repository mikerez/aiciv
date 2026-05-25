class Coord
{
    constructor(i, j)
    {
        this.i = i
        this.j = j
    }

    add(i, j)
    {
        var res = new Coord(this.i + i, this.j + j);
        return res;
    }
}

class Unit
{
    constructor(type, texture, coord = new Coord(0,0))
    {
        if (type instanceof UnitType) {
            this.type = type.type;
            this.unitTypeId = type.id;
            this.name = type.name;
            this.texture = type.texture;
            this.attack = type.attack;
            this.defense = type.defense;
            this.speed = type.speed;
            this.viewRange = type.viewRange;
            this.technologyRequired = type.technologyRequired;
            this.productionCost = type.productionCost;
            this.resourceRequired = type.resourceRequired;
            this.can_move = type.canMove;
            this.nature = type.nature;
        }
        else {
            this.type = type;
            this.texture = texture;
            this.can_move = true;
        }
        this.coord = coord;
        this.gotoCoord = null;
        this.gotoPath = [];
        this.move_penalty = 0;  // wait after difficult landshaft
        this.odd_move = 0;
        this.productionPoints = 0;
        this.cityProperties = null;
        this.production = null;
        this.team = 0;
    }

    setGoto(i, j)
    {
        this.gotoCoord = Coord(i,j);
    }

}

class UnitType
{
    constructor(id, name, type, texture, attack, defense, speed, viewRange, technologyRequired, productionCost, resourceRequired, canMove = true, nature = "land")
    {
        this.id = id;
        this.name = name;
        this.type = type;
        this.texture = texture;
        this.attack = attack;
        this.defense = defense;
        this.speed = speed;
        this.viewRange = viewRange;
        this.technologyRequired = technologyRequired;
        this.productionCost = productionCost;
        this.resourceRequired = resourceRequired;
        this.canMove = canMove;
        this.nature = nature;
    }
}

class CityProperties
{
    constructor(productionPerTurn = 5)
    {
        this.productionPerTurn = productionPerTurn;
    }
}

class CityProductionState
{
    constructor(unitTypeId)
    {
        this.unitTypeId = unitTypeId;
        this.productionPoints = 0;
    }
}

const _technology_table = {
    'Mining': { cost: 20, prerequired: [] },
    'Pottery': { cost: 20, prerequired: [] },
    'Animal Husbandry': { cost: 20, prerequired: [] },
    'Sailing': { cost: 20, prerequired: [] },
    'Masonry': { cost: 35, prerequired: ['Mining'] },
    'Bronze Working': { cost: 40, prerequired: ['Mining'] },
    'Irrigation': { cost: 35, prerequired: ['Pottery'] },
    'Writing': { cost: 40, prerequired: ['Pottery'] },
    'Archery': { cost: 35, prerequired: ['Animal Husbandry'] },
    'Wheel': { cost: 35, prerequired: ['Animal Husbandry'] },
    'Astronomy': { cost: 65, prerequired: ['Sailing', 'Writing'] },
    'Currency': { cost: 60, prerequired: ['Writing'] },
    'Horseback Riding': { cost: 60, prerequired: ['Animal Husbandry', 'Wheel'] },
    'Iron Working': { cost: 70, prerequired: ['Bronze Working'] },
    'Shipbuilding': { cost: 65, prerequired: ['Sailing', 'Bronze Working'] },
    'Mathematics': { cost: 60, prerequired: ['Writing'] },
    'Navigation': { cost: 90, prerequired: ['Sailing', 'Astronomy'] },
    'Construction': { cost: 85, prerequired: ['Masonry', 'Mathematics'] },
    'Engineering': { cost: 120, prerequired: ['Construction', 'Iron Working'] },
};

class GameState
{
    constructor()
    {
        this.openTechnologies = {};
        this.currentResearch = null;
        this.technologyProgress = {};
        this.science = 0;
        this.scienceRate = 0;
        this.lastScienceIncome = 0;
        this.money = 0;
        this.lastMoneyIncome = 0;
    }

    openTechnology(name)
    {
        this.openTechnologies[name] = true;
        if (typeof updateTechnologyMenu === 'function') {
            updateTechnologyMenu();
        }
    }

    isTechnologyOpen(name)
    {
        return this.openTechnologies[name] == true;
    }

    technologyCost(name)
    {
        return _technology_table[name] ? _technology_table[name].cost : 0;
    }

    technologyPrerequired(name)
    {
        return _technology_table[name] ? _technology_table[name].prerequired : [];
    }

    technologyProgressValue(name)
    {
        return this.technologyProgress[name] || 0;
    }

    canResearch(name)
    {
        // TECHNOLOGY-MENU-004, rules/technology.md: only unopened technologies with open prerequisites can be selected.
        if (!_technology_table[name] || this.isTechnologyOpen(name)) {
            return false;
        }
        var prerequired = this.technologyPrerequired(name);
        for (var k=0; k < prerequired.length; k++) {
            if (!this.isTechnologyOpen(prerequired[k])) {
                return false;
            }
        }
        return true;
    }

    setResearch(name)
    {
        // TECHNOLOGY-STATE-004, rules/technology.md: player clicks choose the current research target.
        if (!this.canResearch(name)) {
            return false;
        }
        this.currentResearch = name;
        if (this.technologyProgress[name] == undefined) {
            this.technologyProgress[name] = 0;
        }
        if (typeof updateTechnologyMenu === 'function') {
            updateTechnologyMenu();
        }
        return true;
    }

    setScienceRate(rate)
    {
        this.scienceRate = Math.max(0, Math.min(100, Math.round(rate || 0)));
        if (typeof updateTechnologyMenu === 'function') {
            updateTechnologyMenu();
        }
    }

    processMoneyIncome(moneyIncome)
    {
        // TECHNOLOGY-MENU-005 and CITY-TURN-004, rules/technology.md and rules/city.md: science rate dedicates city money to research.
        this.lastMoneyIncome = moneyIncome || 0;
        var scienceIncome = Math.floor(this.lastMoneyIncome * this.scienceRate / 100);
        this.lastScienceIncome = scienceIncome;
        this.money += this.lastMoneyIncome - scienceIncome;
        this.addScience(scienceIncome);
    }

    addScience(points)
    {
        // TECHNOLOGY-RESEARCH-001 and TECHNOLOGY-RESEARCH-002, rules/technology.md: dedicated money becomes science and opens completed technology.
        points = points || 0;
        this.science += points;
        if (this.currentResearch != null && this.canResearch(this.currentResearch)) {
            var name = this.currentResearch;
            this.technologyProgress[name] = (this.technologyProgress[name] || 0) + points;
            if (this.technologyProgress[name] >= this.technologyCost(name)) {
                this.currentResearch = null;
                var wasOpen = this.isTechnologyOpen(name);
                this.openTechnology(name);
                if (!wasOpen && points > 0 && typeof showMainMenu === 'function') {
                    // TECHNOLOGY-MENU-007, rules/technology.md: open the technology menu when research discovers a technology.
                    showMainMenu('technology');
                }
            }
        }
        if (typeof updateTechnologyMenu === 'function') {
            updateTechnologyMenu();
        }
    }
}

const _units = Array();

var _selection = -1;

var _mark = 1;  // for drawStroke algorithm

var _game_state = new GameState();

const _team_colors = ['blue', 'green', 'yellow', 'magenta', 'orange'];
const _team_color_textures = [900, 901, 902, 903, 904];
const _team_color_strokes = [
    'rgba(50,120,255,0.35)',
    'rgba(30,190,80,0.35)',
    'rgba(245,210,40,0.4)',
    'rgba(220,55,220,0.35)',
    'rgba(245,135,35,0.35)'
];

const _game = new class
{

    add_unit(unit)
    {
        _units.push(unit);
        if (unit.type == 3 && typeof _city_economy !== 'undefined') {
            _city_economy.ensureCity(unit);
        }
    }

    del_unit(k)
    {
        _units.splice(k, 1);
    }

    make_unit(make_from, set_coord)
    {
        var unit = new Unit()
        Object.assign(unit, make_from);
        var coord = new Coord()
        Object.assign(coord, set_coord);
        unit.coord = coord;
        _units.push(unit);
    }

    createUnit(unitType, coord, productionPoints = 0, team = 0)
    {
        var unit = new Unit(unitType, unitType.texture, coord);
        unit.productionPoints = productionPoints;
        unit.team = team;
        if (unit.type == 3 && unit.cityProperties == null) {
            unit.cityProperties = new CityProperties();
        }
        this.add_unit(unit);
        if (unit.type == 3 && typeof _city_economy !== 'undefined') {
            _city_economy.ensureCity(unit);
        }
        return unit;
    }

    random_point(not_type = 0, from = new Coord(0,0), to = new Coord(_map_size-1,_map_size-1))
    {
        var minI = Math.max(0, Math.min(from.i, to.i));
        var maxI = Math.min(_map_size - 1, Math.max(from.i, to.i));
        var minJ = Math.max(0, Math.min(from.j, to.j));
        var maxJ = Math.min(_map_size - 1, Math.max(from.j, to.j));
        if (minI > maxI || minJ > maxJ) {
            minI = 0;
            maxI = _map_size - 1;
            minJ = 0;
            maxJ = _map_size - 1;
        }

        var fallback = new Coord(minI, minJ);
        var hasFallback = false;
        for (var i=minI; i <= maxI; i++) {
            for (var j=minJ; j <= maxJ; j++) {
                if ((_map_terrain_tex[i][j]&0xF) != not_type) {
                    fallback = new Coord(i, j);
                    hasFallback = true;
                    break;
                }
            }
            if (hasFallback) {
                break;
            }
        }

        for (var k=0; k < 1000; k++) {
            var i = minI + Math.floor(Math.random() * (maxI - minI + 1));
            var j = minJ + Math.floor(Math.random() * (maxJ - minJ + 1));
            if ((_map_terrain_tex[i][j]&0xF) != not_type) {
                return new Coord(i, j);
            }
        }

        return fallback;
    }

    canUnitEnterTile(k, i, j)
    {
        if (i < 0 || i >= _map_size || j < 0 || j >= _map_size) {
            return false;
        }
        if (typeof _current_game != "undefined" && _current_game && _current_game.canUnitEnterTile) {
            return _current_game.canUnitEnterTile(k, i, j);
        }
        return (_map_terrain_tex[i][j]&0x0F) != 0;
    }

    makeTurn(drawControlZones = true)
    {
        for (var k=0; k < _units.length; k++) {
            _map.closeMap(_units[k].coord.i, _units[k].coord.j);
        }

        for (var k=0; k < _units.length; k++) {
            if ((_units[k].gotoPath.length || _units[k].gotoCoord != undefined) && _units[k].move_penalty == 0) {
//console.log("goto: " + k + " (" + _units[k].coord.i + "," + _units[k].coord.j + ") to (" + _units[k].gotoCoord.i + "," + _units[k].gotoCoord.j + ")");
                var prev = _units[k].coord;
                var steps = Math.max(1, _units[k].speed || 1);
                for (var step=0; step < steps; step++) {
                    if (_units[k].gotoPath.length) {
                        var nextCoord = _units[k].gotoPath.shift();
                        if (this.canUnitEnterTile(k, nextCoord.i, nextCoord.j)) {
                            _units[k].coord = nextCoord;
                        }
                        else {
                            _units[k].gotoPath = [];
                            _units[k].gotoCoord = null;
                            break;
                        }
                    }
                    else {
                        _control.mapLine(_units[k].coord.i, _units[k].coord.j, _units[k].gotoCoord.i, _units[k].gotoCoord.j, function(i, j, ni, nj, arrow_num) {
                            _units[k].coord = new Coord(ni, nj);
                        }, k, 1);
                    }
                    if (_units[k].gotoPath.length == 0 && _units[k].gotoCoord != undefined
                        && _units[k].coord.i == _units[k].gotoCoord.i && _units[k].coord.j == _units[k].gotoCoord.j) {
                        _units[k].gotoCoord = null;
                        break;
                    }
                    if (_units[k].gotoPath.length == 0 && _units[k].gotoCoord == undefined) {
                        break;
                    }
                }
                if (_units[k].coord != prev) {
                    _units[k].move_penalty = (_map_terrain_tex[_units[k].coord.i][_units[k].coord.j]>>4)&0x3;
//console.log(_units[k].move_penalty)
                }
            }

            _map.openMap(_units[k].coord.i, _units[k].coord.j);
            if (_map.revealResourcesForUnit && _map.revealResourcesForUnit(_units[k])) {
                _fulldraw = 1;
            }

            if (_units[k].move_penalty) {
                --_units[k].move_penalty;
            }
        }

        if (drawControlZones) {
            this.redrawControlZones();
        }
    }

    redrawControlZones()
    {
        var ctx = _draw.clear();
        for (var k=0; k < _units.length; k++) {
            var strokeStyle = _team_color_strokes[_units[k].team % _team_color_strokes.length];
            _draw.drawStroke(ctx, _units[k].coord.i+1, _units[k].coord.j, _mark, strokeStyle);
            _draw.drawStroke(ctx, _units[k].coord.i+1, _units[k].coord.j, _mark, strokeStyle);
            _draw.drawStroke(ctx, _units[k].coord.i, _units[k].coord.j+1, _mark, strokeStyle);
            _draw.drawStroke(ctx, _units[k].coord.i, _units[k].coord.j+1, _mark, strokeStyle);
            _draw.drawStroke(ctx, _units[k].coord.i-1, _units[k].coord.j, _mark, strokeStyle);
            _draw.drawStroke(ctx, _units[k].coord.i-1, _units[k].coord.j, _mark, strokeStyle);
            _draw.drawStroke(ctx, _units[k].coord.i, _units[k].coord.j-1, _mark, strokeStyle);
            _draw.drawStroke(ctx, _units[k].coord.i, _units[k].coord.j-1, _mark, strokeStyle);
        }
        ++_mark;
    }

    processCityProduction(layer)
    {
        if (!layer || !layer.unitTypesById) {
            return;
        }
        for (var k=0; k < _units.length; k++) {
            var city = _units[k];
            if (city.type != 3 || city.production == null) {
                continue;
            }
            var unitType = layer.unitTypesById[city.production.unitTypeId];
            if (!unitType) {
                city.production = null;
                continue;
            }
            if (layer.canCityProduceUnit && !layer.canCityProduceUnit(city, unitType)) {
                city.production = null;
                continue;
            }
            if (city.cityProperties == null) {
                city.cityProperties = new CityProperties();
            }
            city.production.productionPoints += city.cityProperties.productionPerTurn;
            if (city.production.productionPoints >= unitType.productionCost) {
                this.createUnit(unitType, city.coord, city.production.productionPoints, city.team);
                city.production = null;
                _fulldraw = 1;
            }
        }
    }

    applyTurnProcessingRules(layer)
    {
        if (!layer) {
            this.makeTurn(false);
            return;
        }

        if (layer.applyMovementRules) {
            layer.applyMovementRules();
        }
        var taskStatesBefore = layer.collectUnitTaskStates ? layer.collectUnitTaskStates() : undefined;

        if (layer.applyAutoRoutingRules) {
            layer.applyAutoRoutingRules();
        }
        if (layer.applyTerrainModifierRules) {
            layer.applyTerrainModifierRules();
        }
        if (layer.applyForestChoppingRules) {
            layer.applyForestChoppingRules();
        }

        this.makeTurn(false);
        if (typeof _city_economy !== 'undefined') {
            _city_economy.processCities();
        }
        this.processCityProduction(layer);

        if (layer.applyUnitStateRules) {
            layer.applyUnitStateRules();
        }
        if (layer.applyBuildingStateRules) {
            layer.applyBuildingStateRules();
        }
        if (layer.selectUnitThatFinishedTask && !layer.selectUnitThatFinishedTask(taskStatesBefore) && layer.selectNextUnitWithoutTask) {
            layer.selectNextUnitWithoutTask();
        }
        else if (!layer.selectUnitThatFinishedTask && layer.selectNextUnitWithoutTask) {
            layer.selectNextUnitWithoutTask();
        }
        if (layer.applyMenuRules) {
            layer.applyMenuRules();
        }
        this.redrawControlZones();
    }

    doCommand(command)
    {
    }

}

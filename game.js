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
    }

    setGoto(i, j)
    {
        this.gotoCoord = Coord(i,j);
    }

}

class UnitType
{
    constructor(id, name, type, texture, attack, defense, speed, viewRange, technologyRequired, productionCost, resourceRequired, canMove = true)
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

class GameState
{
    constructor()
    {
        this.openTechnologies = {};
    }

    openTechnology(name)
    {
        this.openTechnologies[name] = true;
    }

    isTechnologyOpen(name)
    {
        return this.openTechnologies[name] == true;
    }
}

const _units = Array();

var _selection = -1;

var _mark = 1;  // for drawStroke algorithm

var _game_state = new GameState();

const _game = new class
{

    add_unit(unit)
    {
        _units.push(unit);
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

    createUnit(unitType, coord, productionPoints = 0)
    {
        var unit = new Unit(unitType, unitType.texture, coord);
        unit.productionPoints = productionPoints;
        if (unit.type == 3 && unit.cityProperties == null) {
            unit.cityProperties = new CityProperties();
        }
        this.add_unit(unit);
        return unit;
    }

    random_point(not_type = 0, from = new Coord(0,0), to = new Coord(_map_size-1,_map_size-1))
    {
        var i;
        var j;

        for (var k=0; k < 1000; k++) {
            i = Math.floor(Math.random() * _map_size);
            j = Math.floor(Math.random() * _map_size);
            if (i >= from.i && i <= to.i && j >= from.j && j <= to.j && (_map_terrain_tex[i][j]&0xF) != not_type) {
                break;
            }
        }

        var point = new Coord(i, j);
        return point;
    }

    makeTurn()
    {
        for (k=0; k < _units.length; k++) {
            _map.closeMap(_units[k].coord.i, _units[k].coord.j);
        }

        for (k=0; k < _units.length; k++) {
            if ((_units[k].gotoPath.length || _units[k].gotoCoord != undefined) && _units[k].move_penalty == 0) {
//console.log("goto: " + k + " (" + _units[k].coord.i + "," + _units[k].coord.j + ") to (" + _units[k].gotoCoord.i + "," + _units[k].gotoCoord.j + ")");
                var prev = _units[k].coord;
                if (_units[k].gotoPath.length) {
                    _units[k].coord = _units[k].gotoPath.shift();
                }
                else {
                    _control.mapLine(_units[k].coord.i, _units[k].coord.j, _units[k].gotoCoord.i, _units[k].gotoCoord.j, function(i, j, ni, nj, arrow_num) {
                        _units[k].coord = new Coord(ni, nj);
                    }, k, 1);
                }
                if (_units[k].coord != prev) {
                    _units[k].move_penalty = (_map_terrain_tex[_units[k].coord.i][_units[k].coord.j]>>4)&0x3;
//console.log(_units[k].move_penalty)
                }

                if (_units[k].gotoPath.length == 0 && _units[k].gotoCoord != undefined
                    && _units[k].coord.i == _units[k].gotoCoord.i && _units[k].coord.j == _units[k].gotoCoord.j) {
                    _units[k].gotoCoord = null;
                }
            }

            _map.openMap(_units[k].coord.i, _units[k].coord.j);

            if (_units[k].move_penalty) {
                --_units[k].move_penalty;
            }
        }

        var ctx = _draw.clear();
        for (var k=0; k < _units.length; k++) {
            _draw.drawStroke(ctx, _units[k].coord.i+1, _units[k].coord.j, _mark);
            _draw.drawStroke(ctx, _units[k].coord.i+1, _units[k].coord.j, _mark);
            _draw.drawStroke(ctx, _units[k].coord.i, _units[k].coord.j+1, _mark);
            _draw.drawStroke(ctx, _units[k].coord.i, _units[k].coord.j+1, _mark);
            _draw.drawStroke(ctx, _units[k].coord.i-1, _units[k].coord.j, _mark);
            _draw.drawStroke(ctx, _units[k].coord.i-1, _units[k].coord.j, _mark);
            _draw.drawStroke(ctx, _units[k].coord.i, _units[k].coord.j-1, _mark);
            _draw.drawStroke(ctx, _units[k].coord.i, _units[k].coord.j-1, _mark);
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
            if (city.cityProperties == null) {
                city.cityProperties = new CityProperties();
            }
            city.production.productionPoints += city.cityProperties.productionPerTurn;
            if (city.production.productionPoints >= unitType.productionCost) {
                this.createUnit(unitType, city.coord, city.production.productionPoints);
                city.production = null;
                _fulldraw = 1;
            }
        }
    }

    applyTurnProcessingRules(layer)
    {
        if (!layer) {
            this.makeTurn();
            return;
        }

        if (layer.applyMovementRules) {
            layer.applyMovementRules();
        }
        var taskStatesBefore = layer.collectUnitTaskStates ? layer.collectUnitTaskStates() : undefined;

        if (layer.applyAutoRoutingRules) {
            layer.applyAutoRoutingRules();
        }
        if (layer.applyForestChoppingRules) {
            layer.applyForestChoppingRules();
        }

        this.makeTurn();
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
    }

    doCommand(command)
    {
    }

}

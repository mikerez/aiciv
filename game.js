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
        this.type = type;
        this.texture = texture;
        this.coord = coord;
        this.gotoCoord = null;
        this.move_penalty = 0;  // wait after difficult landshaft
        this.odd_move = 0;
        this.can_move = true;
    }

    setGoto(i, j)
    {
        this.gotoCoord = Coord(i,j);
    }

}

const _units = Array();

var _selection = -1;

var _mark = 1;  // for drawStroke algorithm

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
            if (_units[k].gotoCoord != undefined && _units[k].move_penalty == 0) {
//console.log("goto: " + k + " (" + _units[k].coord.i + "," + _units[k].coord.j + ") to (" + _units[k].gotoCoord.i + "," + _units[k].gotoCoord.j + ")");
                var prev = _units[k].coord;
                _control.mapLine(_units[k].coord.i, _units[k].coord.j, _units[k].gotoCoord.i, _units[k].gotoCoord.j, function(i, j, ni, nj, arrow_num) {
                    _units[k].odd_move = 1-_units[k].odd_move;
                    _units[k].coord = new Coord(ni, nj);
                }, k, 1);
                if (_units[k].coord != prev) {
                    _units[k].move_penalty = (_map_terrain_tex[_units[k].coord.i][_units[k].coord.j]>>4)&0x3;
//console.log(_units[k].move_penalty)
                }

                if (_units[k].coord == _units[k].gotoCoord) {
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
            if (_units[k].can_move) {
                continue;
            }
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

    doCommand(command)
    {
    }

}

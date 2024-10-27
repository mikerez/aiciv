var _mark = 1;

const _game = new class
{
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
        for (k=0; k < _units.length; k++) {
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
}

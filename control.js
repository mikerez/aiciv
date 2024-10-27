const _control = new class
{
    mapLine(i1, j1, i2, j2, func, k, limit)
    {
        if (Math.round(i1) < 0 || Math.round(i1) > _map_size || Math.round(j1) < 0 || Math.round(j1) > _map_size
         || Math.round(i2) < 0 || Math.round(i2) > _map_size || Math.round(j2) < 0 || Math.round(j2) > _map_size) {
           return;
        }

        i1 = Math.round(i1);
        i2 = Math.round(i2);
        j1 = Math.round(j1);
        j2 = Math.round(j2);

        var i = i1, pi = i1;//, pmi = 0;
        var j = j1, pj = j1;//, pmj = 0;
        var odd = _units[k].odd_move;
        while ((i != i2 || j != j2) && limit > 0) {
            var di = i2-i;
            var dj = j2-j;
            var pi = i;
            var pj = j;

            var mi = (di > 0 ? 1 : (di < 0 ? -1 : 0));
            var mj = (dj > 0 ? 1 : (dj < 0 ? -1 : 0));
            if ((mi == mj || mi == -mj) && /*pmi == mi && pmj == mj*/++_units[k].step_randomizer%2==0) {  // if moving diagonal, move the direction first where distance is more
//console.log(mi + " " + mj + " " + pmi + " " + pmj)
                if (dj > 0 && di > dj || dj < 0 && di < dj) {
                    mj = 0;
                }
                if (di > 0 && dj > di || di < 0 && dj < di) {
                    mi = 0;
                }
            }
            if (mi == -mj && odd) {  // forbidden diagonal
                if (++_units[k].step_randomizer%2==0) {
                    mi = 0;
                }
                else {
                    mj = 0;
                }
            }
//                    pmi = mi
//                    pmj = mj
            i += mi
            j += mj

            if (Math.round(i) < 0 || Math.round(i) > _map_size || Math.round(j) < 0 || Math.round(j) > _map_size
                 || (_map_terrain_tex[Math.round(i)][Math.round(j)]&0x0F) == 0 /*water*/) {
                break;
            }
            func(Math.round(pi), Math.round(pj), Math.round(i), Math.round(j), mi==1&&mj==1?0:mi==1&&mj==0?1:mi==1&&mj==-1?2:mi==0&&mj==-1?3:mi==-1&&mj==-1?4:mi==-1&&mj==0?5:mi==-1&&mj==1?6:7);
            --limit;
            odd = 1-odd;
        }
    }

    drawGoto(i1, j1, i2, j2, k)
    {
        var ctx = _draw.clear();
        _units[k].step_randomizer = 0;
        this.mapLine(i1, j1, i2, j2, function(i, j, ni, nj, arrow_num) {
//console.log(":::" + i + ":" + j)
//                    _screen.drawSprite(ijtox1(i,j), ijtoy1(i,j), 514+arrow_num, _screenZoom);
            var ix = arrow_num==0?10:arrow_num==1?5:arrow_num==2?0:arrow_num==3?-5:arrow_num==4?-10:arrow_num==5?-5:arrow_num==6?0:(5);
            var iy = arrow_num==0?0:arrow_num==1?5:arrow_num==2?10:arrow_num==3?5:arrow_num==4?0:arrow_num==5?-5:arrow_num==6?-10:(-5);
            _draw.drawArrow(ctx, x1toX(ijtox1(i,j))+5-ix, y1toY(ijtoy1(i,j))+5-iy, x1toX(ijtox1(i,j))+5+ix, y1toY(ijtoy1(i,j))+5+iy);
        }, k, 30)
        _units[k].step_randomizer = 0;
    }

    click(x, y)
    {
        for (k=0; k < _units.length; k++) {
            if (x > ijtox1(_units[k].coord.i,_units[k].coord.j)-10 && x < ijtox1(_units[k].coord.i,_units[k].coord.j) + 200
             && y > ijtoy1(_units[k].coord.i,_units[k].coord.j)-10 && y < ijtoy1(_units[k].coord.i,_units[k].coord.j) + 150) {
                _selection = k;
//                        _redraw = 1;
                break;
            }
        }                
    }
}

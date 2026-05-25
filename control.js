const _control = new class
{
    arrowNum(mi, mj)
    {
        return mi==1&&mj==1?0:mi==1&&mj==0?1:mi==1&&mj==-1?2:mi==0&&mj==-1?3:mi==-1&&mj==-1?4:mi==-1&&mj==0?5:mi==-1&&mj==1?6:7;
    }

    addCandidate(candidates, i, j, mi, mj, i2, j2)
    {
        if (mi == 0 && mj == 0) {
            return;
        }
        // PREHISTORY-MOVE-006, rules/prehostory.md: vertical diagonal movement is not available.
        if (mi == -mj) {
            return;
        }
        for (var n=0; n < candidates.length; n++) {
            if (candidates[n].mi == mi && candidates[n].mj == mj) {
                return;
            }
        }
        var ni = i + mi;
        var nj = j + mj;
        candidates.push({
            mi: mi,
            mj: mj,
            ni: ni,
            nj: nj,
            score: (i2 - ni)*(i2 - ni) + (j2 - nj)*(j2 - nj)
        });
    }

    nextStepCandidates(i, j, i2, j2)
    {
        var di = i2-i;
        var dj = j2-j;
        var abs_di = Math.abs(di);
        var abs_dj = Math.abs(dj);
        var mi = (di > 0 ? 1 : (di < 0 ? -1 : 0));
        var mj = (dj > 0 ? 1 : (dj < 0 ? -1 : 0));
        var candidates = [];

        this.addCandidate(candidates, i, j, mi, mj, i2, j2);
        if (abs_di >= abs_dj) {
            this.addCandidate(candidates, i, j, mi, 0, i2, j2);
            this.addCandidate(candidates, i, j, 0, mj, i2, j2);
        }
        else {
            this.addCandidate(candidates, i, j, 0, mj, i2, j2);
            this.addCandidate(candidates, i, j, mi, 0, i2, j2);
        }

        candidates.sort(function(a, b) { return a.score - b.score; });
        return candidates.slice(0, 2);
    }

    mapLine(i1, j1, i2, j2, func, k, limit)
    {
        if (Math.round(i1) < 0 || Math.round(i1) >= _map_size || Math.round(j1) < 0 || Math.round(j1) >= _map_size
         || Math.round(i2) < 0 || Math.round(i2) >= _map_size || Math.round(j2) < 0 || Math.round(j2) >= _map_size) {
           return;
        }

        i1 = Math.round(i1);
        i2 = Math.round(i2);
        j1 = Math.round(j1);
        j2 = Math.round(j2);

        var i = i1, pi = i1;//, pmi = 0;
        var j = j1, pj = j1;//, pmj = 0;
        while ((i != i2 || j != j2) && limit > 0) {
            var pi = i;
            var pj = j;
            var candidates = this.nextStepCandidates(i, j, i2, j2);
            var step = null;

            for (var c=0; c < candidates.length; c++) {
                if (Math.round(candidates[c].ni) < 0 || Math.round(candidates[c].ni) >= _map_size
                 || Math.round(candidates[c].nj) < 0 || Math.round(candidates[c].nj) >= _map_size
                 || (typeof _game != "undefined" && !_game.canUnitEnterTile(k, Math.round(candidates[c].ni), Math.round(candidates[c].nj)))) {
                    continue;
                }
                step = candidates[c];
                break;
            }
            if (step == null) {
                break;
            }
            i = step.ni;
            j = step.nj;

            func(Math.round(pi), Math.round(pj), Math.round(i), Math.round(j), this.arrowNum(step.mi, step.mj));
            --limit;
        }
    }

    drawGoto(i1, j1, i2, j2, k)
    {
        var ctx = _draw.clear();
        var path = [];
        this.mapLine(i1, j1, i2, j2, function(i, j, ni, nj, arrow_num) {
//console.log(":::" + i + ":" + j)
//                    _screen.drawSprite(ijtox1(i,j), ijtoy1(i,j), 514+arrow_num, _screenZoom);
            path.push(new Coord(ni, nj));
            if (arrow_num == 2 || arrow_num == 6) {
                return;
            }
            var ix = arrow_num==0?10:arrow_num==1?5:arrow_num==2?0:arrow_num==3?-5:arrow_num==4?-10:arrow_num==5?-5:arrow_num==6?0:(5);
            var iy = arrow_num==0?0:arrow_num==1?5:arrow_num==2?10:arrow_num==3?5:arrow_num==4?0:arrow_num==5?-5:arrow_num==6?-10:(-5);
            _draw.drawArrow(ctx, x1toX(ijtox1(i,j))+5-ix, y1toY(ijtoy1(i,j))+5-iy, x1toX(ijtox1(i,j))+5+ix, y1toY(ijtoy1(i,j))+5+iy);
        }, k, 30)
        _units[k].gotoPath = path;
        _units[k].gotoCoord = path.length ? path[path.length - 1] : null;
    }

    click(x, y, coord, preferCity)
    {
        _selection = -1;
        var topHit = -1;
        var cityHit = -1;
        var tileI = coord ? Math.round(coord.i) : null;
        var tileJ = coord ? Math.round(coord.j) : null;
        for (var k=_units.length - 1; k >= 0; k--) {
            var unitX = ijtox1(_units[k].coord.i, _units[k].coord.j);
            var unitY = ijtoy1(_units[k].coord.i, _units[k].coord.j);
            var unitHalfWidth = 220/_screenZoom;
            var unitHalfHeight = 160/_screenZoom;
            var spriteHit = x >= unitX - unitHalfWidth && x <= unitX + unitHalfWidth
             && y >= unitY - unitHalfHeight && y <= unitY + unitHalfHeight;
            var tileHit = coord && _units[k].coord.i == tileI && _units[k].coord.j == tileJ;
            if (spriteHit || tileHit) {
                if (_units[k].type == 3 && cityHit == -1) {
                    cityHit = k;
                }
                if (_units[k].type != 3 && topHit == -1) {
                    topHit = k;
                }
                if (topHit == -1) {
                    topHit = k;
                }
            }
        }
        _selection = preferCity && cityHit != -1 ? cityHit : topHit;
        return _selection != -1;
    }
}

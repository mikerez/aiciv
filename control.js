const _control = new class
{
    pathHeapPush(heap, node)
    {
        var index = heap.length;
        heap.push(node);
        while (index > 0) {
            var parent = Math.floor((index - 1) / 2);
            if (heap[parent].f < node.f
                || (heap[parent].f == node.f && heap[parent].g <= node.g)) break;
            heap[index] = heap[parent];
            index = parent;
        }
        heap[index] = node;
    }

    pathHeapPop(heap)
    {
        if (!heap.length) return null;
        var first = heap[0];
        var last = heap.pop();
        if (!heap.length) return first;
        var index = 0;
        while (true) {
            var left = index * 2 + 1;
            if (left >= heap.length) break;
            var right = left + 1;
            var child = right < heap.length
                && (heap[right].f < heap[left].f
                    || (heap[right].f == heap[left].f && heap[right].g < heap[left].g))
                ? right : left;
            if (heap[child].f > last.f
                || (heap[child].f == last.f && heap[child].g >= last.g)) break;
            heap[index] = heap[child];
            index = child;
        }
        heap[index] = last;
        return first;
    }

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
        var oldDistance = Math.abs(i2 - i) + Math.abs(j2 - j);
        var nextDistance = Math.abs(i2 - ni) + Math.abs(j2 - nj);
        var correctDirection = Math.abs(i2 - ni) <= Math.abs(i2 - i)
            && Math.abs(j2 - nj) <= Math.abs(j2 - j)
            && nextDistance < oldDistance;
        var terrainPenalty = 0;
        if (typeof _map_terrain_tex != 'undefined' && _map_terrain_tex[ni]) {
            var terrain = Number(_map_terrain_tex[ni][nj]) & 0x0f;
            if (terrain == 4) terrainPenalty = 0.8;
            else if (terrain == 5) terrainPenalty = 2.5;
        }
        var road = typeof _map_terrain_mod != 'undefined' && _map_terrain_mod[ni]
            && _map_terrain_mod[ni][nj] && _map_terrain_mod[ni][nj].road;
        candidates.push({
            mi: mi,
            mj: mj,
            ni: ni,
            nj: nj,
            correctDirection: correctDirection,
            road: !!road,
            score: nextDistance + terrainPenalty - (road && correctDirection ? 1.4 : 0)
        });
    }

    nextStepCandidates(i, j, i2, j2)
    {
        var candidates = [];
        for (var mi=-1; mi <= 1; mi++) {
            for (var mj=-1; mj <= 1; mj++) {
                this.addCandidate(candidates, i, j, mi, mj, i2, j2);
            }
        }

        candidates.sort(function(a, b) {
            if (a.correctDirection != b.correctDirection) return a.correctDirection ? -1 : 1;
            return a.score - b.score;
        });
        return candidates;
    }

    pathDistance(i1, j1, i2, j2)
    {
        var di = i2-i1;
        var dj = j2-j1;
        return di*dj >= 0 ? Math.max(Math.abs(di), Math.abs(dj)) : Math.abs(di)+Math.abs(dj);
    }

    pathStepCost(i, j, ni, nj)
    {
        var fromRoad = typeof _map_terrain_mod != 'undefined' && _map_terrain_mod[i]
            && _map_terrain_mod[i][j] && _map_terrain_mod[i][j].road;
        var toRoad = typeof _map_terrain_mod != 'undefined' && _map_terrain_mod[ni]
            && _map_terrain_mod[ni][nj] && _map_terrain_mod[ni][nj].road;
        if (fromRoad && toRoad) return 0.45;
        var terrain = typeof _map_terrain_tex != 'undefined' && _map_terrain_tex[ni]
            ? Number(_map_terrain_tex[ni][nj])&0x0f : 2;
        if (terrain == 5) return 3;
        if (terrain == 4) return 1.8;
        return 1;
    }

    findPath(i1, j1, i2, j2, k, limit, traversalOptions)
    {
        i1 = Math.round(i1); j1 = Math.round(j1);
        i2 = Math.round(i2); j2 = Math.round(j2);
        limit = Math.max(0, Math.floor(Number(limit) || 0));
        if (i1 < 0 || i1 >= _map_size || j1 < 0 || j1 >= _map_size
            || i2 < 0 || i2 >= _map_size || j2 < 0 || j2 >= _map_size || !limit) return [];

        traversalOptions = traversalOptions || {};
        var directions = [[1,1],[1,0],[0,-1],[-1,-1],[-1,0],[0,1]];
        var startKey = i1 + ':' + j1;
        var targetKey = i2 + ':' + j2;
        var records = {};
        var open = [];
        var start = {i:i1, j:j1, key:startKey, g:0, steps:0,
            f:this.pathDistance(i1,j1,i2,j2)*0.45, parent:null};
        records[startKey] = start;
        this.pathHeapPush(open, start);
        var best = start;
        var expanded = 0;
        var requestedMaximum = Number(traversalOptions.pathMaximumExpanded);
        var maximumExpanded = Number.isFinite(requestedMaximum)
            ? Math.max(32, Math.min(1536, Math.floor(requestedMaximum)))
            : Math.min(_map_size*_map_size, Math.max(128, Math.min(1024, limit*limit*2)));
        var requestedMilliseconds = Number(traversalOptions.pathMaximumMilliseconds);
        var maximumMilliseconds = Number.isFinite(requestedMilliseconds)
            ? Math.max(1, Math.min(12, requestedMilliseconds)) : 6;
        var startedAt = Date.now();
        while (open.length && expanded++ < maximumExpanded) {
            if ((expanded & 63) == 0 && Date.now()-startedAt >= maximumMilliseconds) break;
            var current = this.pathHeapPop(open);
            if (!current || current.closed || records[current.key] !== current) continue;
            current.closed = true;
            var currentDistance = this.pathDistance(current.i, current.j, i2, j2);
            var bestDistance = this.pathDistance(best.i, best.j, i2, j2);
            if (currentDistance < bestDistance
                || (currentDistance == bestDistance && current.g < best.g)) best = current;
            if (current.key == targetKey) {
                best = current;
                break;
            }
            if (current.steps >= limit) continue;
            for (var directionIndex=0; directionIndex < directions.length; directionIndex++) {
                var ni = current.i + directions[directionIndex][0];
                var nj = current.j + directions[directionIndex][1];
                if (ni < 0 || ni >= _map_size || nj < 0 || nj >= _map_size) continue;
                if (typeof _game != 'undefined'
                    && !_game.canUnitEnterTile(k, ni, nj, traversalOptions)) continue;
                var nextKey = ni + ':' + nj;
                var nextG = current.g + this.pathStepCost(current.i, current.j, ni, nj);
                var existing = records[nextKey];
                if (existing && existing.g <= nextG && existing.steps <= current.steps+1) continue;
                var next = {i:ni, j:nj, key:nextKey, g:nextG, steps:current.steps+1,
                    f:nextG + this.pathDistance(ni,nj,i2,j2)*0.45, parent:current};
                records[nextKey] = next;
                this.pathHeapPush(open, next);
            }
        }
        var result = [];
        while (best && best.parent) {
            result.push({i:best.i, j:best.j});
            best = best.parent;
        }
        result.reverse();
        return result;
    }

    mapLine(i1, j1, i2, j2, func, k, limit, traversalOptions)
    {
        if (Math.round(i1) < 0 || Math.round(i1) >= _map_size || Math.round(j1) < 0 || Math.round(j1) >= _map_size
         || Math.round(i2) < 0 || Math.round(i2) >= _map_size || Math.round(j2) < 0 || Math.round(j2) >= _map_size) {
           return;
        }

        i1 = Math.round(i1); j1 = Math.round(j1);
        var path = this.findPath(i1, j1, i2, j2, k, limit, traversalOptions);
        var i = i1;
        var j = j1;
        for (var pathIndex=0; pathIndex < path.length; pathIndex++) {
            var next = path[pathIndex];
            func(i, j, next.i, next.j, this.arrowNum(next.i-i, next.j-j));
            i = next.i;
            j = next.j;
        }
    }

    drawGoto(i1, j1, i2, j2, k, existingContext)
    {
        var ctx = existingContext || _draw.clear();
        var path = this.drawGotoPath(ctx, i1, j1, i2, j2, k);
        _units[k].gotoPath = path;
        _units[k].gotoCoord = path.length ? path[path.length - 1] : null;
        _units[k].pendingServerPath = [];
        if (typeof _server_game != 'undefined') _server_game.saveClientRoutes(_current_user);
    }

    drawGotoPath(ctx, i1, j1, i2, j2, k, traversalOptions)
    {
        var path = [];
        this.mapLine(i1, j1, i2, j2, function(i, j, ni, nj, arrow_num) {
            path.push(new Coord(ni, nj));
            _control.drawMovementArrow(ctx, i, j, arrow_num);
        }, k, 30, traversalOptions);
        return path;
    }

    drawGotoPreview(i1, j1, i2, j2, k, existingContext, traversalOptions)
    {
        var ctx = existingContext || _draw.clear();
        if (!existingContext) this.drawMovementOrders(ctx);
        var previewOptions = Object.assign({}, traversalOptions || {}, {
            pathMaximumExpanded: 256,
            pathMaximumMilliseconds: 2,
        });
        return this.drawGotoPath(ctx, i1, j1, i2, j2, k, previewOptions);
    }

    drawGotoGroup(indices, i2, j2)
    {
        var ctx = _draw.clear();
        indices = Array.isArray(indices) ? indices : [];
        for (var n=0; n < indices.length; n++) {
            var k = indices[n];
            if (!_units[k] || !_units[k].can_move || _units[k].type != 2) continue;
            this.drawGoto(_units[k].coord.i, _units[k].coord.j, i2, j2, k, ctx);
        }
    }

    drawGotoGroupPreview(indices, i2, j2)
    {
        var ctx = _draw.clear();
        this.drawMovementOrders(ctx);
        indices = Array.isArray(indices) ? indices : [];
        for (var n=0; n < indices.length; n++) {
            var k = indices[n];
            if (!_units[k] || !_units[k].can_move || _units[k].type != 2) continue;
            this.drawGotoPreview(_units[k].coord.i, _units[k].coord.j, i2, j2, k, ctx);
        }
    }

    drawMovementArrow(ctx, i, j, arrow_num)
    {
        if (arrow_num == 2 || arrow_num == 6) return;
        var ix = arrow_num==0?10:arrow_num==1?5:arrow_num==2?0:arrow_num==3?-5:arrow_num==4?-10:arrow_num==5?-5:arrow_num==6?0:5;
        var iy = arrow_num==0?0:arrow_num==1?5:arrow_num==2?10:arrow_num==3?5:arrow_num==4?0:arrow_num==5?-5:arrow_num==6?-10:-5;
        _draw.drawArrow(
            ctx,
            x1toX(ijtox1(i,j))+5-ix,
            y1toY(ijtoy1(i,j))+5-iy,
            x1toX(ijtox1(i,j))+5+ix,
            y1toY(ijtoy1(i,j))+5+iy
        );
    }

    drawMovementOrders(ctx)
    {
        if (!ctx || typeof _units === 'undefined') return;
        for (var k=0; k < _units.length; k++) {
            var unit = _units[k];
            this.drawMovementOrder(ctx, unit, k);
        }
    }

    drawMovementOrder(ctx, unit, k)
    {
        if (!ctx || !unit || !unit.coord) return false;
        if (unit.coord.i < -30 || unit.coord.i >= _map_size + 30
            || unit.coord.j < -30 || unit.coord.j >= _map_size + 30) return false;
        var path = unit.gotoPath && unit.gotoPath.length
            ? unit.gotoPath : unit.pendingServerPath;
        if (path && path.length) {
            var from = unit.coord;
            var visited = {};
            visited[Math.round(Number(from.i)) + ':' + Math.round(Number(from.j))] = true;
            // Generated routes are at most 30 steps. Never let corrupted saved
            // state turn one overlay redraw into thousands of canvas operations.
            var maximum = Math.min(path.length, 30);
            for (var n=0; n < maximum; n++) {
                var to = path[n];
                if (!to || !Number.isFinite(Number(to.i)) || !Number.isFinite(Number(to.j))) break;
                var di = Math.round(Number(to.i)) - Math.round(Number(from.i));
                var dj = Math.round(Number(to.j)) - Math.round(Number(from.j));
                if ((di == 0 && dj == 0) || Math.abs(di) > 1 || Math.abs(dj) > 1 || di == -dj) break;
                var key = Math.round(Number(to.i)) + ':' + Math.round(Number(to.j));
                if (visited[key]) break;
                this.drawMovementArrow(ctx, from.i, from.j, this.arrowNum(to.i - from.i, to.j - from.j));
                visited[key] = true;
                from = to;
            }
            return true;
        }
        // Rendering must never invoke pathfinding. Destination-only state can be
        // repaired by command processing without blocking a canvas redraw.
        return false;
    }

    forceDrawSelectedMovementOrder()
    {
        if (_selection == -1 || !_units[_selection]) return false;
        var unit = _units[_selection];
        var hasDestination = (unit.gotoPath && unit.gotoPath.length)
            || (unit.pendingServerPath && unit.pendingServerPath.length) || unit.gotoCoord;
        if (!hasDestination) return false;
        if (typeof _game !== 'undefined' && _game.redrawControlZones) {
            _game.redrawControlZones();
        }
        else {
            this.drawMovementOrder(_draw.clear(), unit, _selection);
        }
        return true;
    }

    click(x, y, coord, preferCity, deferredStackPoint)
    {
        var previousSelection = _selection;
        var topHit = -1;
        var cityHit = -1;
        var tileI = coord ? Math.round(coord.i) : null;
        var tileJ = coord ? Math.round(coord.j) : null;
        var tileUnits = [];
        var spriteUnits = [];
        for (var k=_units.length - 1; k >= 0; k--) {
            if (!_units[k] || !_units[k].coord || _units[k].hiddenOnMap || _units[k].outsideMapWindow
                || (_units[k].health != undefined && Number(_units[k].health) <= 0)
                || (!_units[k].can_move && _units[k].type != 3)) continue;
            var unitX = ijtox1(_units[k].coord.i, _units[k].coord.j);
            var unitY = ijtoy1(_units[k].coord.i, _units[k].coord.j);
            var unitHalfWidth = 220/_screenZoom;
            var unitHalfHeight = 160/_screenZoom;
            var spriteHit = x >= unitX - unitHalfWidth && x <= unitX + unitHalfWidth
             && y >= unitY - unitHalfHeight && y <= unitY + unitHalfHeight;
            var tileHit = coord && _units[k].coord.i == tileI && _units[k].coord.j == tileJ;
            if (tileHit) tileUnits.push(k);
            if (spriteHit) spriteUnits.push(k);
        }
        // Exact Tile occupants take priority over overlapping neighboring
        // sprites. This keeps stack selection tied to the clicked map Tile.
        var hitUnits = tileUnits.length ? tileUnits : spriteUnits;
        for (var hitIndex=0; hitIndex < hitUnits.length; hitIndex++) {
            var unitIndex = hitUnits[hitIndex];
            if (_units[unitIndex].type == 3 && cityHit == -1) cityHit = unitIndex;
            if (_units[unitIndex].type != 3 && topHit == -1) topHit = unitIndex;
        }
        if (topHit == -1 && hitUnits.length) topHit = hitUnits[0];
        if (topHit != -1) {
            // A City is the primary object of a shared Tile. The stack menu can
            // then select one unit or the military group explicitly.
            _selection = cityHit != -1 && tileUnits.length > 1
                ? cityHit : (preferCity && cityHit != -1 ? cityHit : topHit);
            if (typeof _multi_selection != 'undefined') _multi_selection = [];
        }
        else {
            _selection = previousSelection;
        }
        if (typeof _unit_stack_menu != 'undefined') {
            if (tileUnits.length > 1 && deferredStackPoint && _unit_stack_menu.deferPhoneTap) {
                _unit_stack_menu.deferPhoneTap(tileUnits, { i: tileI, j: tileJ }, deferredStackPoint);
            }
            else if (tileUnits.length > 1) _unit_stack_menu.show(tileUnits, { i: tileI, j: tileJ });
            else _unit_stack_menu.hide();
        }
        return topHit != -1;
    }
}

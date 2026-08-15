const _birdsview = new class
{
    constructor()
    {
        this.size = 50;
        this.channels = 4;
        this.values = new Float32Array(this.size * this.size * this.channels);
        this.strategyValues = new Float32Array(this.size * this.size);
        this.dirty = true;
        this.lastBuiltTurn = -1;
        this.lastLayout = null;
    }

    index(x, y)
    {
        return (y * this.size + x) * this.channels;
    }

    markDirty()
    {
        this.dirty = true;
    }

    terrainType(i, j)
    {
        if (typeof _map_terrain_tex == 'undefined' || !_map_terrain_tex[i]) {
            return 0;
        }
        return _map_terrain_tex[i][j] & 0x0F;
    }

    terrainHeightSignal(i, j)
    {
        if (typeof _map_terrain_tex == 'undefined' || !_map_terrain_tex[i]) {
            return 0;
        }
        var tex = _map_terrain_tex[i][j];
        var type = tex & 0x0F;
        var depth = (tex >> 4) & 0x03;
        var waterSource = (tex >> 6) & 0x01;
        if (type == 0) {
            return -0.90 - depth * 0.08;
        }
        if (type == 1) {
            return -0.16 + depth * 0.03;
        }
        if (type == 2) {
            return 0.12 + waterSource * 0.06 + depth * 0.02;
        }
        if (type == 3) {
            return 0.02 + depth * 0.02;
        }
        if (type == 4) {
            return 0.48 + depth * 0.08;
        }
        if (type == 5) {
            return 0.78 + depth * 0.07;
        }
        if (type == 6) {
            return 0.28 + depth * 0.03;
        }
        if (type == 7) {
            return 0.04 + waterSource * 0.08;
        }
        return 0;
    }

    resourceType(i, j)
    {
        if (typeof _map_resource == 'undefined' || !_map_resource[i]) {
            return 0;
        }
        var state = _map_resource[i][j];
        if (!state || !state.type) {
            return 0;
        }
        return Math.max(0, Math.min(63, state.type | 0));
    }

    encodeResources(resourceIds)
    {
        var packed = 0;
        var scale = 1;
        for (var k = 0; k < 4; k++) {
            var id = resourceIds[k] || 0;
            packed += id / scale;
            scale *= 64;
        }
        return packed;
    }

    collectUnitsByCell()
    {
        var control = [];
        var presence = [];
        for (var y = 0; y < this.size; y++) {
            control[y] = [];
            presence[y] = [];
            for (var x = 0; x < this.size; x++) {
                control[y][x] = {};
                presence[y][x] = {};
            }
        }
        if (typeof _units_by_user == 'undefined' || typeof _map_size == 'undefined' || _map_size <= 0) {
            return { control: control, presence: presence };
        }
        for (var userId in _units_by_user) {
            var list = _units_by_user[userId] || [];
            for (var k = 0; k < list.length; k++) {
                var unit = list[k];
                if (!unit || !unit.coord || unit.coord.i < 0 || unit.coord.j < 0
                    || unit.coord.i >= _map_size || unit.coord.j >= _map_size) {
                    continue;
                }
                var x = Math.max(0, Math.min(this.size - 1, Math.floor(unit.coord.i * this.size / _map_size)));
                var y = Math.max(0, Math.min(this.size - 1, Math.floor(unit.coord.j * this.size / _map_size)));
                var team = unit.team || parseInt(userId, 10) || 0;
                var attack = unit.type == 2 ? Math.max(0, unit.attack || 0) : 0;
                control[y][x][team] = (control[y][x][team] || 0) + attack;
                presence[y][x][team] = (presence[y][x][team] || 0) + 1;
            }
        }
        return { control: control, presence: presence };
    }

    strongestTeam(controlCell, presenceCell)
    {
        var bestTeam = -1;
        var bestWeight = -1;
        for (var key in controlCell) {
            var weight = controlCell[key] || 0;
            if (weight > bestWeight) {
                bestWeight = weight;
                bestTeam = parseInt(key, 10);
            }
        }
        if (bestTeam >= 0 && bestWeight > 0) {
            return { team: bestTeam, military: bestWeight };
        }
        var bestPresence = 0;
        for (var presenceKey in presenceCell) {
            var count = presenceCell[presenceKey] || 0;
            if (count > bestPresence) {
                bestPresence = count;
                bestTeam = parseInt(presenceKey, 10);
            }
        }
        return { team: bestPresence > 0 ? bestTeam : -1, military: 0 };
    }

    build()
    {
        this.values.fill(0);
        this.strategyValues.fill(0);
        if (typeof _map_size == 'undefined' || _map_size <= 0 || typeof _map_terrain_tex == 'undefined') {
            this.dirty = false;
            return this.values;
        }

        var unitCells = this.collectUnitsByCell();
        for (var by = 0; by < this.size; by++) {
            var j0 = Math.floor(by * _map_size / this.size);
            var j1 = Math.max(j0 + 1, Math.floor((by + 1) * _map_size / this.size));
            j1 = Math.min(_map_size, j1);
            for (var bx = 0; bx < this.size; bx++) {
                var i0 = Math.floor(bx * _map_size / this.size);
                var i1 = Math.max(i0 + 1, Math.floor((bx + 1) * _map_size / this.size));
                i1 = Math.min(_map_size, i1);
                var terrainSum = 0;
                var tileCount = 0;
                var resources = [];
                for (var i = i0; i < i1; i++) {
                    for (var j = j0; j < j1; j++) {
                        terrainSum += this.terrainHeightSignal(i, j);
                        tileCount++;
                        var resource = this.resourceType(i, j);
                        if (resource && resources.indexOf(resource) == -1 && resources.length < 4) {
                            resources.push(resource);
                        }
                    }
                }

                var strongest = this.strongestTeam(unitCells.control[by][bx], unitCells.presence[by][bx]);
                var base = this.index(bx, by);
                var height = tileCount ? terrainSum / tileCount : 0;
                var resourcePacked = this.encodeResources(resources);
                this.values[base + 0] = strongest.team;
                this.values[base + 1] = strongest.military;
                this.values[base + 2] = height;
                this.values[base + 3] = resourcePacked;

                var controlSignal = strongest.team >= 0 ? (strongest.team + 1) / 16.0 : 0;
                var forceSignal = Math.min(1, strongest.military / 30.0);
                var resourceSignal = resources.length ? Math.min(1, resources[0] / 48.0) : 0;
                this.strategyValues[by * this.size + bx] = Math.max(-1, Math.min(1,
                    height * 0.60 + controlSignal * 0.18 + forceSignal * 0.17 + resourceSignal * 0.05));
            }
        }
        this.dirty = false;
        this.lastBuiltTurn++;
        return this.values;
    }

    ensureBuilt()
    {
        if (this.dirty) {
            this.build();
        }
    }

    strategyInputValues()
    {
        this.ensureBuilt();
        return this.strategyValues;
    }

    teamColor(team)
    {
        var colors = [
            [50, 120, 255],
            [30, 190, 80],
            [245, 210, 40],
            [220, 55, 220],
            [245, 135, 35],
        ];
        if (team < 0) {
            return null;
        }
        return colors[team % colors.length];
    }

    terrainColor(height)
    {
        if (height < -0.35) {
            var sea = Math.max(0, Math.min(1, (-height - 0.35) / 0.65));
            return [20, 70 + Math.floor(50 * sea), 150 + Math.floor(65 * sea)];
        }
        if (height < -0.05) {
            return [190, 170, 80];
        }
        if (height < 0.20) {
            return [70, 155, 75];
        }
        if (height < 0.40) {
            return [30, 105, 55];
        }
        if (height < 0.70) {
            return [125, 95, 55];
        }
        return [155, 145, 125];
    }

    draw(ctx)
    {
        if (!ctx) {
            return;
        }
        this.ensureBuilt();
        var layout = this.layoutForCanvas(ctx.canvas);
        this.lastLayout = layout;
        var cell = layout.cell;
        var sourceWidth = layout.sourceWidth;
        var rotatedSize = layout.rotatedSize;
        var halfCell = cell / 2;
        ctx.save();
        ctx.globalAlpha = 0.80;
        for (var y = 0; y < this.size; y++) {
            for (var x = 0; x < this.size; x++) {
                var base = this.index(x, y);
                var color = this.terrainColor(this.values[base + 2]);
                var team = this.values[base + 0] | 0;
                var teamColor = this.teamColor(team);
                if (teamColor) {
                    color = [
                        Math.floor(color[0] * 0.58 + teamColor[0] * 0.42),
                        Math.floor(color[1] * 0.58 + teamColor[1] * 0.42),
                        Math.floor(color[2] * 0.58 + teamColor[2] * 0.42),
                    ];
                }
                ctx.fillStyle = 'rgb(' + color[0] + ',' + color[1] + ',' + color[2] + ')';
                var sourceX = x * cell + halfCell - layout.sourceCenter;
                var sourceY = y * cell + halfCell - layout.sourceCenter;
                var screenPoint = this.sourceToScreenPoint(sourceX, sourceY, {
                    centerX: layout.centerX,
                    centerY: layout.centerY,
                });
                var cx = screenPoint.x;
                var cy = screenPoint.y;
                if (cx < layout.clipLeft || cx > layout.clipRight
                    || cy < layout.clipTop || cy > layout.clipBottom) {
                    continue;
                }
                var radius = cell / Math.SQRT2 + 0.35;
                ctx.beginPath();
                ctx.moveTo(cx, cy - radius);
                ctx.lineTo(cx + radius, cy);
                ctx.lineTo(cx, cy + radius);
                ctx.lineTo(cx - radius, cy);
                ctx.closePath();
                ctx.fill();
            }
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.65)';
        ctx.lineWidth = 1;
        ctx.strokeRect(layout.clipLeft - 0.5, layout.clipTop - 0.5,
            layout.clipRight - layout.clipLeft + 1, layout.clipBottom - layout.clipTop + 1);
        this.drawCurrentViewStroke(ctx, layout);
        this.drawRespawnSelection(ctx, layout);
        ctx.restore();
    }

    layoutForCanvas(canvas)
    {
        var preferredCell = (typeof document != 'undefined' && document.body
            && document.body.classList.contains('mobile-ui')) ? 4 : 3;
        var visible = this.visibleCanvasRect(canvas);
        var margin = 12;
        var availableWidth = Math.max(1, visible.right-visible.left-margin*2);
        var availableHeight = Math.max(1, visible.bottom-visible.top-margin*2);
        var fittingCell = Math.floor(Math.min(availableWidth, availableHeight)
            * Math.SQRT2 / this.size);
        var cell = Math.max(1, Math.min(preferredCell, fittingCell));
        var sourceWidth = this.size * cell;
        var rotatedSize = Math.ceil(sourceWidth * Math.SQRT2);
        var clipSize = rotatedSize * 0.5;
        var clipLeft = visible.left + margin;
        var clipBottom = visible.bottom - margin;
        var clipTop = clipBottom - clipSize;
        if (clipTop < visible.top + margin) {
            clipTop = visible.top + margin;
            clipBottom = clipTop + clipSize;
        }
        var clipRight = clipLeft + clipSize;
        var x0 = clipLeft - rotatedSize * 0.25;
        var y0 = clipTop - rotatedSize * 0.25;
        return {
            cell: cell,
            sourceWidth: sourceWidth,
            sourceCenter: sourceWidth / 2,
            rotatedSize: rotatedSize,
            x0: x0,
            y0: y0,
            centerX: x0 + rotatedSize / 2,
            centerY: y0 + rotatedSize / 2,
            clipLeft: clipLeft,
            clipRight: clipRight,
            clipTop: clipTop,
            clipBottom: clipBottom,
        };
    }

    screenPointToMapCoord(x, y, canvas)
    {
        var layout = this.lastLayout || this.layoutForCanvas(canvas);
        if (x < layout.clipLeft || x > layout.clipRight
            || y < layout.clipTop || y > layout.clipBottom) return null;
        var rotatedX = x - layout.centerX;
        var rotatedY = layout.centerY - y;
        var sourceX = (rotatedX - rotatedY) / Math.SQRT2;
        var sourceY = (rotatedX + rotatedY) / Math.SQRT2;
        var i = Math.floor((sourceX + layout.sourceCenter) * _map_size / layout.sourceWidth);
        var j = Math.floor((sourceY + layout.sourceCenter) * _map_size / layout.sourceWidth);
        if (i < 0 || j < 0 || i >= _map_size || j >= _map_size) return null;
        return new Coord(i, j);
    }

    centerViewAt(coord)
    {
        if (!coord || typeof _screenOffsetX == 'undefined') return false;
        _screenOffsetX = ijtox(coord.i, coord.j) / 2 / _ratio;
        _screenOffsetY = ijtoy(coord.i, coord.j) / 2 / _ratio;
        if (typeof _draw != 'undefined' && _draw.clear) _draw.clear();
        if (typeof _fulldraw != 'undefined') _fulldraw = 1;
        if (typeof drawScene == 'function') drawScene(0);
        return true;
    }

    drawRespawnSelection(ctx, layout)
    {
        if (typeof _server_game == 'undefined' || !_server_game.respawnSelectionForPlayer) return;
        var coord = _server_game.respawnSelectionForPlayer(
            typeof _current_user == 'undefined' ? 0 : _current_user
        );
        if (!coord) return;
        var point = this.mapCoordToRotatedPoint(coord.i + 0.5, coord.j + 0.5, layout);
        ctx.save();
        ctx.beginPath();
        ctx.rect(layout.clipLeft, layout.clipTop,
            layout.clipRight - layout.clipLeft, layout.clipBottom - layout.clipTop);
        ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,1)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    drawCurrentViewStroke(ctx, layout)
    {
        if (typeof _canvas == 'undefined' || typeof _map_size == 'undefined'
            || typeof xy1toi == 'undefined' || typeof xy1toj == 'undefined'
            || typeof Xtox1 == 'undefined' || typeof Ytoy1 == 'undefined') {
            return;
        }
        var visible = this.visibleCanvasRect(_canvas);
        var screenCorners = [
            { x: visible.left, y: visible.top },
            { x: visible.right, y: visible.top },
            { x: visible.right, y: visible.bottom },
            { x: visible.left, y: visible.bottom },
        ];
        var points = [];
        for (var n = 0; n < screenCorners.length; n++) {
            var corner = screenCorners[n];
            var mapI = xy1toi(Xtox1(corner.x), Ytoy1(corner.y));
            var mapJ = xy1toj(Xtox1(corner.x), Ytoy1(corner.y));
            points.push(this.mapCoordToRotatedPoint(mapI, mapJ, layout));
        }

        ctx.save();
        ctx.beginPath();
        ctx.rect(layout.clipLeft, layout.clipTop, layout.clipRight - layout.clipLeft, layout.clipBottom - layout.clipTop);
        ctx.clip();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (var k = 1; k < points.length; k++) {
            ctx.lineTo(points[k].x, points[k].y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.stroke();
        ctx.restore();
    }

    mapCoordToRotatedPoint(i, j, layout)
    {
        var sourceX = (i / Math.max(1, _map_size)) * layout.sourceWidth - layout.sourceCenter;
        var sourceY = (j / Math.max(1, _map_size)) * layout.sourceWidth - layout.sourceCenter;
        return this.sourceToScreenPoint(sourceX, sourceY, layout);
    }

    sourceToScreenPoint(sourceX, sourceY, layout)
    {
        var rotatedX = (sourceX + sourceY) / Math.SQRT2;
        var rotatedY = (-sourceX + sourceY) / Math.SQRT2;
        return {
            x: layout.centerX + rotatedX,
            // User birdsview is screen-oriented: invert final screen Y after rotation.
            y: layout.centerY - rotatedY,
        };
    }

    visibleCanvasRect(canvas)
    {
        if (typeof window == 'undefined' || !canvas || !canvas.getBoundingClientRect) {
            return { left: 0, top: 0, right: canvas ? canvas.width : 0, bottom: canvas ? canvas.height : 0 };
        }
        var rect = canvas.getBoundingClientRect();
        var scaleX = rect.width ? canvas.width / rect.width : 1;
        var scaleY = rect.height ? canvas.height / rect.height : 1;
        var left = Math.max(0, Math.min(canvas.width, -rect.left * scaleX));
        var top = Math.max(0, Math.min(canvas.height, -rect.top * scaleY));
        var right = Math.max(left, Math.min(canvas.width, (window.innerWidth - rect.left) * scaleX));
        var bottom = Math.max(top, Math.min(canvas.height, (window.innerHeight - rect.top) * scaleY));
        return { left: left, top: top, right: right, bottom: bottom };
    }
};

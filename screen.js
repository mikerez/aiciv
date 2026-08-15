const _screen = new class
{
//var desiredCSSWidth = 400;
//var desiredCSSHeight = 300;
//var devicePixelRatio = window.devicePixelRatio || 1;

//canvas.width  = (desiredCSSWidth  * devicePixelRatio)/1.05;
//canvas.height = (desiredCSSHeight * devicePixelRatio)/1.05;
//Math.floor
//canvas.style.width  = desiredCSSWidth  + "px";
//canvas.style.height = desiredCSSHeight + "px";

//        const ratio = window.devicePixelRatio;
//        canvas.width = canvas.getBoundingClientRect().width * ratio;
//        canvas.height = canvas.getBoundingClientRect().height * ratio;

    init()
    {
        if (!_gl) {
            console.error("WebGL not supported, falling back on experimental-webgl");
            _gl = _canvas.getContext("experimental-webgl");
        }

        if (!_gl) {
            console.error("Your browser does not support WebGL");
        }

        this.shaderProgram = this.initShaderProgram();
        this.programInfo = {
            program: this.shaderProgram,
            attribLocations: {
                vertexPosition: _gl.getAttribLocation(this.shaderProgram, 'aVertexPosition'),
                textureCoord: _gl.getAttribLocation(this.shaderProgram, 'aTextureCoord'),
            },
            uniformLocations: {
                sampler: _gl.getUniformLocation(this.shaderProgram, 'uSampler'),
                brightness: _gl.getUniformLocation(this.shaderProgram, 'uBrightness'),
            },
        };
        this.positionBuffer = _gl.createBuffer();
        this.textureCoordBuffer = _gl.createBuffer();
        _gl.bindBuffer(_gl.ARRAY_BUFFER, this.textureCoordBuffer);
        _gl.bufferData(_gl.ARRAY_BUFFER, new Float32Array([
            0.0, 0.0,
            0.0, 1.0,
            1.0, 0.0,
            1.0, 1.0,
        ]), _gl.STATIC_DRAW);
        this.contextLost = false;
    }

    constructor()
    {
        this.textureSources = {};
        this.textureDimensions = {};
        this.contextLost = false;
        // we need to put this persistent vars somewhere

        // Vertex shader program
        this.vsSource = `
            attribute vec2 aVertexPosition;
            attribute vec2 aTextureCoord;
            varying highp vec2 vTextureCoord;
            uniform mat4 uProjectionMatrix;
            void main(void) {
                gl_Position = vec4(aVertexPosition, 0.0, 1);
                vTextureCoord = aTextureCoord;
            }
        `;

        // Fragment shader program
        this.fsSource = `
            varying highp vec2 vTextureCoord;
            uniform sampler2D uSampler;
            uniform mediump float uBrightness;
            void main(void) {
                gl_FragColor = texture2D(uSampler, vTextureCoord);
                gl_FragColor.rgb = gl_FragColor.rgb * uBrightness;
            }
        `;
    }

    loadShader(type, source)
    {
        const shader = _gl.createShader(type);
        _gl.shaderSource(shader, source);
        _gl.compileShader(shader);
        if (!_gl.getShaderParameter(shader, _gl.COMPILE_STATUS)) {
            console.error('An error occurred compiling the shaders: ' + _gl.getShaderInfoLog(shader));
            _gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    initShaderProgram()
    {
        const vertexShader = this.loadShader(_gl.VERTEX_SHADER, this.vsSource);
        const fragmentShader = this.loadShader(_gl.FRAGMENT_SHADER, this.fsSource);

        const shaderProgram = _gl.createProgram();
        _gl.attachShader(shaderProgram, vertexShader);
        _gl.attachShader(shaderProgram, fragmentShader);
        _gl.linkProgram(shaderProgram);

        if (!_gl.getProgramParameter(shaderProgram, _gl.LINK_STATUS)) {
            console.error('Unable to initialize the shader program: ' + _gl.getProgramInfoLog(shaderProgram));
            return null;
        }

        return shaderProgram;
    }

    loadTexture(url, id, fallbackUrl, ready)
    {
        this.textureSources[id] = {url: url, id: id, fallbackUrl: fallbackUrl};
        var self = this;
        function onLoadImage(image, texture) {
            const internalFormat = _gl.RGBA;
            const srcFormat = _gl.RGBA;
            const srcType = _gl.UNSIGNED_BYTE;
            _gl.bindTexture(_gl.TEXTURE_2D, texture);
            _gl.texImage2D(_gl.TEXTURE_2D, 0, internalFormat, srcFormat, srcType, image);
            self.textureDimensions[id] = {width: image.width, height: image.height};
//                    if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
//                        _gl.generateMipmap(_gl.TEXTURE_2D);
//                    } else {
                _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_WRAP_S, _gl.CLAMP_TO_EDGE);
                _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_WRAP_T, _gl.CLAMP_TO_EDGE);
                _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_MIN_FILTER, _gl.LINEAR);
//                    }
            _gl.blendFunc(_gl.SRC_ALPHA, _gl.ONE_MINUS_SRC_ALPHA);
            _gl.enable(_gl.BLEND);
            if (ready) ready();
        }

        _textures[id] = _gl.createTexture();
        const image = new Image();
        image.onload = function() { onLoadImage(image, _textures[id]); }
        image.onerror = function() {
            if (fallbackUrl) {
                image.onerror = null;
                image.src = "images/" + fallbackUrl;
            }
            else if (ready) ready();
        }
        image.src = "images/" + url;
    }

    restoreContext()
    {
        this.init();
        var sources = Object.keys(this.textureSources).map(function(id) {
            return this.textureSources[id];
        }, this);
        var remaining = sources.length;
        var redrawn = false;
        var redraw = function() {
            if (redrawn || --remaining > 0) return;
            redrawn = true;
            if (typeof _fulldraw != 'undefined') _fulldraw = 1;
            if (typeof drawScene == 'function') requestAnimationFrame(function() { drawScene(0); });
        };
        for (var n=0; n<sources.length; n++) {
            this.loadTexture(sources[n].url, sources[n].id, sources[n].fallbackUrl, redraw);
        }
        if (!sources.length) {
            remaining = 1;
            redraw();
        }
        // A missing image must not prevent recovery of all other terrain.
        setTimeout(function() {
            if (redrawn) return;
            remaining = 1;
            redraw();
        }, 2000);
    }

//            isPowerOf2(value) {
//                return (value & (value - 1)) == 0;
//            }

    bindTextureCoordinates()
    {
        _gl.bindBuffer(_gl.ARRAY_BUFFER, this.textureCoordBuffer);
        _gl.vertexAttribPointer(this.programInfo.attribLocations.textureCoord, 2, _gl.FLOAT, false, 0, 0);
        _gl.enableVertexAttribArray(this.programInfo.attribLocations.textureCoord);
    }

    terrainTextureId(encodedTerrain)
    {
        var exact = Number(encodedTerrain) & 0xff;
        if (_textures[exact] !== undefined) return exact;

        // A is both the water-source flag and an optional alternate image bit.
        // Most terrain sets do not provide separate A-marked sprites.
        var withoutAlternative = exact & ~0x80;
        if (_textures[withoutAlternative] !== undefined) return withoutAlternative;

        // Keep drawing a valid base Tile if an unsupported supertile
        // combination reaches the client.
        var withoutSupertile = exact & 0x3f;
        if (_textures[withoutSupertile] !== undefined) return withoutSupertile;
        var terrainType = exact & 0x0f;
        return _textures[terrainType] !== undefined ? terrainType : 0;
    }

    setPositionBuffer(positions)
    {
        _gl.bindBuffer(_gl.ARRAY_BUFFER, this.positionBuffer);
        _gl.bufferData(_gl.ARRAY_BUFFER, new Float32Array(positions), _gl.DYNAMIC_DRAW);
        _gl.vertexAttribPointer(this.programInfo.attribLocations.vertexPosition, 2, _gl.FLOAT, false, 0, 0);
        _gl.enableVertexAttribArray(this.programInfo.attribLocations.vertexPosition);
    }

    tileBrightness(i, j)
    {
        var brightness = 0.5*((_map_terrain_bit[i][j]>>14)&1)+0.1*((_map_terrain_bit[i][j]>>8)&0x5)-((_map_terrain_bit[i][j]>>15)&1)*0.1;
        if (brightness > 0.85) {
            brightness = 0.85;
        }
        if (brightness < 0) {
            brightness = 0;
        }
        return brightness;
    }

    drawTerrainModifierSprites(start_i, start_j, height_i, width_j)
    {
        if (!_map.terrainModifierSprites) {
            return;
        }
        for (var k=0; k < _map.terrainModifierSprites.length; k++) {
            var modifier = _map.terrainModifierSprites[k];
            if (modifier.i < start_i || modifier.i >= start_i + height_i
                || modifier.j < start_j || modifier.j >= start_j + width_j) {
                continue;
            }
            var brightness = this.tileBrightness(modifier.i, modifier.j);
            this.drawSpriteWithBrightness(ijtox1(modifier.i, modifier.j), ijtoy1(modifier.i, modifier.j), modifier.texture, _screenZoom, brightness);
        }
    }

    foregroundSpritesByTile(units, start_i, start_j, height_i, width_j, citizenTiles)
    {
        var result = {};
        function tileAt(i, j) {
            var key = i + ':' + j;
            if (!result[key]) result[key] = {cities:[], improvements:[], roads:[], citizens:[], units:[]};
            return result[key];
        }
        var modifiers = _map.terrainModifierSprites || [];
        for (var modifierIndex=0; modifierIndex < modifiers.length; modifierIndex++) {
            var modifier = modifiers[modifierIndex];
            if (modifier.i < start_i || modifier.i >= start_i + height_i
                || modifier.j < start_j || modifier.j >= start_j + width_j) continue;
            var layer = modifier.modifier == 'road' || modifier.texture == 850
                ? 'roads' : 'improvements';
            tileAt(modifier.i, modifier.j)[layer].push(modifier);
        }
        for (var unitIndex=0; unitIndex < units.length; unitIndex++) {
            var unit = units[unitIndex];
            if (!unit || !unit.coord) continue;
            var i = Math.round(unit.coord.i);
            var j = Math.round(unit.coord.j);
            if (i < start_i || i >= start_i + height_i
                || j < start_j || j >= start_j + width_j) continue;
            tileAt(i, j)[unit.type == 3 ? 'cities' : 'units'].push(unit);
        }
        citizenTiles = citizenTiles || [];
        for (var citizenIndex=0; citizenIndex<citizenTiles.length; citizenIndex++) {
            var citizen = citizenTiles[citizenIndex];
            if (!citizen || citizen.i < start_i || citizen.i >= start_i + height_i
                || citizen.j < start_j || citizen.j >= start_j + width_j) continue;
            tileAt(citizen.i, citizen.j).citizens.push(citizen);
        }
        return result;
    }

    drawForegroundUnit(unit)
    {
        var visualCoord = typeof _draw !== 'undefined' && _draw.unitArrivalVisualCoord
            ? _draw.unitArrivalVisualCoord(unit) : unit.coord;
        this.drawSprite(ijtox1(visualCoord.i, visualCoord.j), ijtoy1(visualCoord.i, visualCoord.j),
            unit.texture, _screenZoom);
        var teamTexture = _team_color_textures[(unit.team || 0) % _team_color_textures.length];
        this.drawSprite(ijtox1(visualCoord.i, visualCoord.j), ijtoy1(visualCoord.i, visualCoord.j),
            teamTexture, _screenZoom);
    }

    drawForegroundSprites(units, start_i, start_j, height_i, width_j, citizenTiles)
    {
        var byTile = this.foregroundSpritesByTile(
            units, start_i, start_j, height_i, width_j, citizenTiles
        );
        for (var i=start_i; i < start_i + height_i; i++) {
            for (var j=start_j + width_j - 1; j >= start_j; j--) {
                var tile = byTile[i + ':' + j];
                if (!tile) continue;
                for (var cityIndex=0; cityIndex < tile.cities.length; cityIndex++) {
                    this.drawForegroundUnit(tile.cities[cityIndex]);
                }
                for (var improvementIndex=0; improvementIndex < tile.improvements.length; improvementIndex++) {
                    var improvement = tile.improvements[improvementIndex];
                    this.drawSpriteWithBrightness(ijtox1(i, j), ijtoy1(i, j), improvement.texture,
                        _screenZoom, this.tileBrightness(i, j));
                }
                for (var roadIndex=0; roadIndex < tile.roads.length; roadIndex++) {
                    var road = tile.roads[roadIndex];
                    this.drawSpriteWithBrightness(ijtox1(i, j), ijtoy1(i, j), road.texture,
                        _screenZoom, this.tileBrightness(i, j));
                }
                if (typeof _city_economy != 'undefined') {
                    for (var citizenIndex=0; citizenIndex<tile.citizens.length; citizenIndex++) {
                        var citizen = tile.citizens[citizenIndex];
                        _city_economy.drawYieldCompositionMap(
                            ijtox1(i, j), ijtoy1(i, j), citizen.income
                        );
                    }
                }
                for (var unitIndex=0; unitIndex < tile.units.length; unitIndex++) {
                    this.drawForegroundUnit(tile.units[unitIndex]);
                }
            }
        }
    }

    drawResourceSprites(start_i, start_j, height_i, width_j)
    {
        if (!_map.resourceSprites) {
            return;
        }
        for (var k=0; k < _map.resourceSprites.length; k++) {
            var resource = _map.resourceSprites[k];
            if (resource.i < start_i || resource.i >= start_i + height_i
                || resource.j < start_j || resource.j >= start_j + width_j) {
                continue;
            }
            var brightness = this.tileBrightness(resource.i, resource.j);
            this.drawSpriteWithBrightness(ijtox1(resource.i, resource.j), ijtoy1(resource.i, resource.j), resource.texture, _screenZoom, brightness);
        }
    }

    drawSpriteWithBrightness(x, y, type, zoom, brightness)
    {
        var positions = [
            1/_canvas.width*(-220/zoom+x),  1/_canvas.height*(160/zoom-y),
            1/_canvas.width*(-220/zoom+x), 1/_canvas.height*(-160/zoom-y),
            1/_canvas.width*(220/zoom+x),  1/_canvas.height*(160/zoom-y),
            1/_canvas.width*(220/zoom+x), 1/_canvas.height*(-160/zoom-y),
        ];
        this.setPositionBuffer(positions);

        _gl.activeTexture(_gl.TEXTURE0);
        _gl.bindTexture(_gl.TEXTURE_2D, _textures[type]);
        _gl.uniform1i(this.programInfo.uniformLocations.sampler, 0);
        _gl.uniform1f(this.programInfo.uniformLocations.brightness, brightness);

        _gl.drawArrays(_gl.TRIANGLE_STRIP, 0, 4);
    }

    drawSprite(x, y, type, zoom)
    {
        var positions = [
            1/_canvas.width*(-220/zoom+x),  1/_canvas.height*(160/zoom-y),
            1/_canvas.width*(-220/zoom+x), 1/_canvas.height*(-160/zoom-y),
            1/_canvas.width*(220/zoom+x),  1/_canvas.height*(160/zoom-y),
            1/_canvas.width*(220/zoom+x), 1/_canvas.height*(-160/zoom-y),
        ];
        this.setPositionBuffer(positions);

        _gl.activeTexture(_gl.TEXTURE0);
        //Math.floor(3.5-((i-3)*(i-3)+(j-3)*(j-3))/5.5)<0?0:Math.floor(3.5-((i-3)*(i-3)+(j-3)*(j-3))/5.5)>3?3:Math.floor(3.5-((i-3)*(i-3)+(j-3)*(j-3))/5.5)
        _gl.bindTexture(_gl.TEXTURE_2D, _textures[type]);
        _gl.uniform1i(this.programInfo.uniformLocations.sampler, 0);
        _gl.uniform1f(this.programInfo.uniformLocations.brightness, 1.0);

        _gl.drawArrays(_gl.TRIANGLE_STRIP, 0, 4);
    }

    drawSpriteSized(x, y, type, zoom, width, height, brightness = 1.0)
    {
        var halfWidth = width/2/zoom;
        var halfHeight = height/2/zoom;
        var positions = [
            1/_canvas.width*(-halfWidth+x),  1/_canvas.height*(halfHeight-y),
            1/_canvas.width*(-halfWidth+x), 1/_canvas.height*(-halfHeight-y),
            1/_canvas.width*(halfWidth+x),  1/_canvas.height*(halfHeight-y),
            1/_canvas.width*(halfWidth+x), 1/_canvas.height*(-halfHeight-y),
        ];
        this.setPositionBuffer(positions);

        _gl.activeTexture(_gl.TEXTURE0);
        _gl.bindTexture(_gl.TEXTURE_2D, _textures[type]);
        _gl.uniform1i(this.programInfo.uniformLocations.sampler, 0);
        _gl.uniform1f(this.programInfo.uniformLocations.brightness, brightness);

        _gl.drawArrays(_gl.TRIANGLE_STRIP, 0, 4);
    }

    drawTerrainSupertile(x, y, type, zoom, brightness)
    {
        var dimensions = this.textureDimensions[type] || {width: 420, height: 310};
        var terrainWidth = Math.max(420, dimensions.width);
        var terrainHeight = Math.max(310, dimensions.height);
        var positions = [
            1/_canvas.width*(-terrainWidth/zoom+x),  1/_canvas.height*(terrainHeight/zoom-y),
            1/_canvas.width*(-terrainWidth/zoom+x), 1/_canvas.height*(-terrainHeight/zoom-y),
            1/_canvas.width*(terrainWidth/zoom+x),  1/_canvas.height*(terrainHeight/zoom-y),
            1/_canvas.width*(terrainWidth/zoom+x), 1/_canvas.height*(-terrainHeight/zoom-y),
        ];
        this.setPositionBuffer(positions);

        _gl.activeTexture(_gl.TEXTURE0);
        _gl.bindTexture(_gl.TEXTURE_2D, _textures[type]);
        _gl.uniform1i(this.programInfo.uniformLocations.sampler, 0);
        _gl.uniform1f(this.programInfo.uniformLocations.brightness, brightness);

        _gl.drawArrays(_gl.TRIANGLE_STRIP, 0, 4);
    }
}

function drawSelectionStroke()
{
    const canvasSelection = document.getElementById("canvasSelection");
    if (!canvasSelection) {
        return;
    }

    const ctx = canvasSelection.getContext("2d");
    ctx.clearRect(0, 0, canvasSelection.width, canvasSelection.height);
    if (_selection == -1 || _units[_selection] == undefined
        || _units[_selection].outsideMapWindow) {
        return;
    }

    var x = x1toX(ijtox1(_units[_selection].coord.i, _units[_selection].coord.j));
    var y = y1toY(ijtoy1(_units[_selection].coord.i, _units[_selection].coord.j));
    var radiusX = 79/_screenZoom;
    var radiusY = 55/_screenZoom;

    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.setLineDash([10, 6]);
    ctx.lineDashOffset = _step%2 ? 0 : 8;
    ctx.beginPath();
    ctx.ellipse(x, y + 5/_screenZoom, radiusX, radiusY, 0, 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();
}

function isUnitVisibleToCurrentUser(unit)
{
    if (!unit || unit.hiddenOnMap || unit.outsideMapWindow || !unit.coord) {
        return false;
    }
    var team = unit.team || 0;
    if (typeof _current_user == 'undefined' || team == _current_user) {
        return true;
    }
    if (unit.serverVisibilityByUser
        && Object.prototype.hasOwnProperty.call(unit.serverVisibilityByUser, _current_user)
        && !unit.serverVisibilityByUser[_current_user]) {
        return false;
    }
    if (typeof _ai_player !== 'undefined' && _ai_player.isTileFullyVisibleByUser) {
        return _ai_player.isTileFullyVisibleByUser(unit.coord.i, unit.coord.j, _current_user);
    }
    if (typeof _map_terrain_bit == 'undefined' || !_map_terrain_bit[unit.coord.i]) {
        return false;
    }
    return (_map_terrain_bit[unit.coord.i][unit.coord.j] & 0x0400) != 0;
}

function visibleUnitsForCurrentUser()
{
    if (typeof _units_by_user == 'undefined') {
        return _units || [];
    }
    var result = [];
    for (var userId in _units_by_user) {
        var list = _units_by_user[userId] || [];
        for (var k=0; k < list.length; k++) {
            if (isUnitVisibleToCurrentUser(list[k])) {
                result.push(list[k]);
            }
        }
    }
    return result;
}

function drawScene(loop)
{
    try {
        drawSceneFrame(loop);
    }
    catch (error) {
        _in_drawing = 0;
        _fulldraw = 1;
        if (typeof console != 'undefined' && console.error) {
            console.error('Map render failed; scheduling a clean redraw.', error);
        }
        var now = Date.now();
        if ((!_screen.lastRenderErrorAt || now-_screen.lastRenderErrorAt > 10000)
            && typeof _server_game != 'undefined' && _server_game.reportHandledClientError) {
            _screen.lastRenderErrorAt = now;
            _server_game.reportHandledClientError('draw_scene', {
                map_origin_i: typeof _map_origin_i == 'undefined' ? null : _map_origin_i,
                map_origin_j: typeof _map_origin_j == 'undefined' ? null : _map_origin_j,
                screen_zoom: typeof _screenZoom == 'undefined' ? null : _screenZoom,
            }, error && error.message ? error.message : String(error), 'map_render_failed');
        }
        setTimeout(function() {
            if (!_in_drawing) drawScene(loop ? 1 : 0);
        }, 50);
    }
}

function drawSceneFrame(loop)
{
    if (_screen.contextLost || (_gl.isContextLost && _gl.isContextLost())) {
        if (loop) setTimeout(drawScene, 700, 1);
        return;
    }
    if (typeof _multiplayer != 'undefined' && _multiplayer.isHiddenSnapshotActive
        && _multiplayer.isHiddenSnapshotActive()) {
        if (loop) setTimeout(drawScene, 50, 1);
        return;
    }
    const startTime = performance.now();
    if (loop && !_fulldraw) {
        drawSelectionStroke();
        _step++;
        setTimeout(drawScene, 700, 1);
        return;
    }
    _in_drawing = 1;
//            _gl.viewport(0, 0, _canvas.width*ratio, _canvas.height*ratio);
    var completedFullDraw = !!_fulldraw;
    if (_fulldraw) {
        _gl.clearColor(0.2, 0.2, 0.2, 0.2);
        _gl.clear(_gl.COLOR_BUFFER_BIT/* | _gl.DEPTH_BUFFER_BIT*/);

        _gl.useProgram(_screen.programInfo.program);
    }

    // this is const for all sprites
    _screen.bindTextureCoordinates();
    // Project screen corners into map coordinates. This avoids desktop-only cutoff
    // multipliers that underdraw on narrow mobile viewports.
    var screenCorners = [
        new Coord(xy1toi(Xtox1(0), Ytoy1(0)), xy1toj(Xtox1(0), Ytoy1(0))),
        new Coord(xy1toi(Xtox1(_canvas.width), Ytoy1(0)), xy1toj(Xtox1(_canvas.width), Ytoy1(0))),
        new Coord(xy1toi(Xtox1(0), Ytoy1(_canvas.height)), xy1toj(Xtox1(0), Ytoy1(_canvas.height))),
        new Coord(xy1toi(Xtox1(_canvas.width), Ytoy1(_canvas.height)), xy1toj(Xtox1(_canvas.width), Ytoy1(_canvas.height))),
    ];
    var minI = screenCorners[0].i;
    var maxI = screenCorners[0].i;
    var minJ = screenCorners[0].j;
    var maxJ = screenCorners[0].j;
    for (var c=1; c < screenCorners.length; c++) {
        minI = Math.min(minI, screenCorners[c].i);
        maxI = Math.max(maxI, screenCorners[c].i);
        minJ = Math.min(minJ, screenCorners[c].j);
        maxJ = Math.max(maxJ, screenCorners[c].j);
    }
    var cullPadding = 8;
    var start_i = Math.max(0, Math.floor(minI) - cullPadding);
    var start_j = Math.max(0, Math.floor(minJ) - cullPadding);
    var end_i = Math.min(_map_size - 1, Math.ceil(maxI) + cullPadding);
    var end_j = Math.min(_map_size - 1, Math.ceil(maxJ) + cullPadding);
    var height_i = Math.max(0, end_i - start_i + 1);
    var width_j = Math.max(0, end_j - start_j + 1);
    WIDTH=1/_canvas.width
    HEIGHT=1/_canvas.height
    STARTX=220/_screenZoom
    STARTY=160/_screenZoom
    for (i=start_i; i < start_i + height_i; ++i) {
        for (j=start_j + width_j - 1; j >= start_j; --j) {
//                    if (j >= 0 && i >= 0 && j < _map_size && i < _map_size) 
{
//                    x = i*200+j*200;
//                    y = i*200-j*200;
//////////////                        _step++;
                if (/*_map_terrain_tex[i][j]==(0+(1<<4))&&_step%2 ||*/ _fulldraw) {
                    var supertileAnchor = _map.supertileAnchorAt(i, j);
                    var supertileTextureId = supertileAnchor
                        ? ((_map_terrain_tex[supertileAnchor.i][supertileAnchor.j] & 0x3f) | 0x40)
                        : -1;
                    if (supertileAnchor && _textures[supertileTextureId] !== undefined) {
                        // The lower-left cell is drawn last in this painter order, so one
                        // supersprite replaces all four ordinary cells without being covered.
                        if (i == supertileAnchor.i + 1 && j == supertileAnchor.j) {
                            var oppositeI = supertileAnchor.i + 1;
                            var oppositeJ = supertileAnchor.j + 1;
                            var supertileX = (ijtox1(supertileAnchor.i, supertileAnchor.j)
                                + ijtox1(oppositeI, oppositeJ)) / 2;
                            var supertileY = (ijtoy1(supertileAnchor.i, supertileAnchor.j)
                                + ijtoy1(oppositeI, oppositeJ)) / 2 + 10*_ratio;
                            var supertileBrightness = Math.min(
                                _screen.tileBrightness(supertileAnchor.i, supertileAnchor.j),
                                _screen.tileBrightness(supertileAnchor.i, oppositeJ),
                                _screen.tileBrightness(oppositeI, supertileAnchor.j),
                                _screen.tileBrightness(oppositeI, oppositeJ)
                            );
                            _screen.drawTerrainSupertile(supertileX, supertileY,
                                supertileTextureId, _screenZoom, supertileBrightness);
                        }
                        continue;
                    }
                    // - _map_view[0]* /*20*/0*sqrt2
                    // - _map_view[1]* /*20*/0*sqrt2 

        // inlined drawSprite
        var positions = [
            WIDTH*(-STARTX+ijtox1(i,j)),  HEIGHT*(STARTY-ijtoy1(i,j)),
            WIDTH*(-STARTX+ijtox1(i,j)), HEIGHT*(-STARTY-ijtoy1(i,j)),
            WIDTH*(STARTX+ijtox1(i,j)),  HEIGHT*(STARTY-ijtoy1(i,j)),
            WIDTH*(STARTX+ijtox1(i,j)), HEIGHT*(-STARTY-ijtoy1(i,j)),
        ];
        _screen.setPositionBuffer(positions);

        _gl.activeTexture(_gl.TEXTURE0);
        //Math.floor(3.5-((i-3)*(i-3)+(j-3)*(j-3))/5.5)<0?0:Math.floor(3.5-((i-3)*(i-3)+(j-3)*(j-3))/5.5)>3?3:Math.floor(3.5-((i-3)*(i-3)+(j-3)*(j-3))/5.5)
        var terrainTextureId = _screen.terrainTextureId(_map_terrain_tex[i][j]);
        _gl.bindTexture(_gl.TEXTURE_2D, _textures[terrainTextureId]);
        _gl.uniform1i(_screen.programInfo.uniformLocations.sampler, 0);  // there is another same place!!!
        _gl.uniform1f(_screen.programInfo.uniformLocations.brightness, _screen.tileBrightness(i, j));

        _gl.drawArrays(_gl.TRIANGLE_STRIP, 0, 4);


//                            _screen.drawSprite(ijtox1(i,j), ijtoy1(i,j), /*(_map_terrain_tex[i][j]==(0+(1<<4))&&_step%2)?8<<4:*/_map_terrain_tex[i][j]&~(4<<4), _screenZoom);
//, 1.0-(_map_terrain_bit>>8)
                }
            }
        }
    }

    if (_fulldraw) {
        _screen.drawResourceSprites(start_i, start_j, height_i, width_j);
        var citizenTiles = typeof _city_economy !== 'undefined'
            ? _city_economy.citizenTilesMapData(start_i, start_j, height_i, width_j) : [];
        var visibleUnits = visibleUnitsForCurrentUser();
        _screen.drawForegroundSprites(visibleUnits, start_i, start_j, height_i, width_j, citizenTiles);
    }
    var labelCanvas = document.getElementById('canvasOwnerLabels');
    if (labelCanvas && typeof _draw !== 'undefined' && _draw.drawUnitOwnerLabels) {
        var labelContext = labelCanvas.getContext('2d');
        labelContext.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
        _draw.drawUnitOwnerLabels(labelContext);
        if (_draw.drawUnitArrivalEffects) {
            _draw.drawUnitArrivalEffects(labelContext);
        }
        if (_draw.drawUnitStatusLines) {
            _draw.drawUnitStatusLines(labelContext);
        }
    }
    var ctx2D = document.getElementById("canvas2D").getContext("2d");
    if (typeof _draw !== 'undefined' && _draw.drawTechnologyStatus) {
        _draw.drawTechnologyStatus(ctx2D);
    }
    if (typeof _birdsview !== 'undefined' && _birdsview.draw) {
        _birdsview.draw(ctx2D);
    }
    if (typeof _current_game !== 'undefined' && _current_game.drawUnitStateLetters) {
        _current_game.drawUnitStateLetters(ctx2D);
    }
    drawSelectionStroke();

    if (_fulldraw) {
        const endTime = performance.now();
        const executionTime = endTime - startTime;
        const foregroundDiv = document.getElementById('foreground');
//                foregroundDiv.textContent = '<br>FPS: ' + (1000 / executionTime).toFixed(2);
    }

    _step++;
//            _redraw = 0;
    _fulldraw = 0;
    if (loop) {
        setTimeout(drawScene, 700, 1);
    }
    _in_drawing = 0;
    if (completedFullDraw && typeof _server_game != 'undefined'
        && _server_game.ensureMapWindowForViewport) {
        _server_game.ensureMapWindowForViewport();
    }
}

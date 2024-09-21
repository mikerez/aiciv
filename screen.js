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
            alert("Your browser does not support WebGL");
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
    }

    constructor()
    {
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
                gl_FragColor = gl_FragColor * uBrightness;
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

    loadTexture(url, id)
    {
                function onLoadImage(image, texture) {
            const internalFormat = _gl.RGBA;
            const srcFormat = _gl.RGBA;
            const srcType = _gl.UNSIGNED_BYTE;
            _gl.bindTexture(_gl.TEXTURE_2D, texture);
            _gl.texImage2D(_gl.TEXTURE_2D, 0, internalFormat, srcFormat, srcType, image);
//                    if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
//                        _gl.generateMipmap(_gl.TEXTURE_2D);
//                    } else {
                _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_WRAP_S, _gl.CLAMP_TO_EDGE);
                _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_WRAP_T, _gl.CLAMP_TO_EDGE);
                _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_MIN_FILTER, _gl.LINEAR);
//                    }
            _gl.blendFunc(_gl.SRC_ALPHA, _gl.ONE_MINUS_SRC_ALPHA);
            _gl.enable(_gl.BLEND);
        }

        _textures[id] = _gl.createTexture();
        const image = new Image();
        image.onload = function() { onLoadImage(image, _textures[id]); }
        image.src = "images/" + url;
    }

//            isPowerOf2(value) {
//                return (value & (value - 1)) == 0;
//            }

    drawSprite(x, y, type, zoom)
    {
                var positionBuffer = _gl.createBuffer();
        _gl.bindBuffer(_gl.ARRAY_BUFFER, positionBuffer);
        var positions = [
            1/_canvas.width*(-220/zoom+x),  1/_canvas.height*(160/zoom-y),
            1/_canvas.width*(-220/zoom+x), 1/_canvas.height*(-160/zoom-y),
            1/_canvas.width*(220/zoom+x),  1/_canvas.height*(160/zoom-y),
            1/_canvas.width*(220/zoom+x), 1/_canvas.height*(-160/zoom-y),
        ];
        _gl.bufferData(_gl.ARRAY_BUFFER, new Float32Array(positions), _gl.STATIC_DRAW);

        _gl.bindBuffer(_gl.ARRAY_BUFFER, positionBuffer);
        _gl.vertexAttribPointer(this.programInfo.attribLocations.vertexPosition, 2, _gl.FLOAT, false, 0, 0);
        _gl.enableVertexAttribArray(this.programInfo.attribLocations.vertexPosition);

        _gl.activeTexture(_gl.TEXTURE0);
        //Math.floor(3.5-((i-3)*(i-3)+(j-3)*(j-3))/5.5)<0?0:Math.floor(3.5-((i-3)*(i-3)+(j-3)*(j-3))/5.5)>3?3:Math.floor(3.5-((i-3)*(i-3)+(j-3)*(j-3))/5.5)
        _gl.bindTexture(_gl.TEXTURE_2D, _textures[type]);
        _gl.uniform1i(this.programInfo.uniformLocations.sampler, 0);
        _gl.uniform1f(this.programInfo.uniformLocations.brightness, 1.0);

        _gl.drawArrays(_gl.TRIANGLE_STRIP, 0, 4);
    }

    drawSprite1(x, y, type, zoom)
    {
        var positionBuffer = _gl.createBuffer();
        _gl.bindBuffer(_gl.ARRAY_BUFFER, positionBuffer);
        var positions = [
            1/_canvas.width*(-420/zoom+x),  1/_canvas.height*(310/zoom-y),
            1/_canvas.width*(-420/zoom+x), 1/_canvas.height*(-310/zoom-y),
            1/_canvas.width*(420/zoom+x),  1/_canvas.height*(310/zoom-y),
            1/_canvas.width*(420/zoom+x), 1/_canvas.height*(-310/zoom-y),
        ];
        _gl.bufferData(_gl.ARRAY_BUFFER, new Float32Array(positions), _gl.STATIC_DRAW);

        _gl.bindBuffer(_gl.ARRAY_BUFFER, positionBuffer);
        _gl.vertexAttribPointer(_screen.programInfo.attribLocations.vertexPosition, 2, _gl.FLOAT, false, 0, 0);
        _gl.enableVertexAttribArray(_screen.programInfo.attribLocations.vertexPosition);

        _gl.activeTexture(_gl.TEXTURE0);
        //Math.floor(3.5-((i-3)*(i-3)+(j-3)*(j-3))/5.5)<0?0:Math.floor(3.5-((i-3)*(i-3)+(j-3)*(j-3))/5.5)>3?3:Math.floor(3.5-((i-3)*(i-3)+(j-3)*(j-3))/5.5)
        _gl.bindTexture(_gl.TEXTURE_2D, _textures[type]);
        _gl.uniform1i(_screen.programInfo.uniformLocations.sampler, 0);
        _gl.uniform1f(this.programInfo.uniformLocations.brightness, 1.0);

        _gl.drawArrays(_gl.TRIANGLE_STRIP, 0, 4);
    }
}

function drawScene(loop)
{
    const startTime = performance.now();
    if (loop) {
        _fulldraw = 1;
    }
    _in_drawing = 1;
//            _gl.viewport(0, 0, _canvas.width*ratio, _canvas.height*ratio);
    if (_fulldraw) {
        _gl.clearColor(0.2, 0.2, 0.2, 0.2);
        _gl.clear(_gl.COLOR_BUFFER_BIT/* | _gl.DEPTH_BUFFER_BIT*/);

        _gl.useProgram(_screen.programInfo.program);
    }

    // this is const for all sprites
    this.textureCoordBuffer = _gl.createBuffer();
    _gl.bindBuffer(_gl.ARRAY_BUFFER, this.textureCoordBuffer);
    const textureCoordinates = [
        0.0,  0.0,
        0.0,  1.0,
        1.0,  0.0,
        1.0,  1.0,
    ];
    _gl.bufferData(_gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), _gl.STATIC_DRAW);
    _gl.bindBuffer(_gl.ARRAY_BUFFER, this.textureCoordBuffer);
    _gl.vertexAttribPointer(_screen.programInfo.attribLocations.textureCoord, 2, _gl.FLOAT, false, 0, 0);
    _gl.enableVertexAttribArray(_screen.programInfo.attribLocations.textureCoord);
    //
    var start_i = Math.round(xytoi(_screenOffsetX*2*_ratio, _screenOffsetY*2*_ratio) - _canvas.width/2*2*_ratio/_cell_height*_screenZoom) - 1;
    var start_j = Math.round(xytoj(_screenOffsetX*2*_ratio, _screenOffsetY*2*_ratio) - _canvas.width/2*2*_ratio/_cell_height*_screenZoom);
    var height_i = Math.round(_canvas.width/2*2/_cell_height*_screenZoom*2.6);
    var width_j = Math.round(_canvas.height/2*2/_cell_width*_screenZoom*3.6)+1;
    if (start_i < 0) {
        start_i = 0;
    }
    if (start_j < 0) {
        start_j = 0;
    }
    if (start_i + height_i >= _map_size) {
        height_i = _map_size - start_i - 1
    }
    if (start_j + width_j >= _map_size) {
        width_j = _map_size - start_j - 1
    }
    WIDTH=1/_canvas.width
    HEIGHT=1/_canvas.height
    STARTX=220/_screenZoom
    STARTY=160/_screenZoom
    for (i=start_i; i < start_i + height_i; ++i) {
        for (j=start_j + width_j; j >= start_j; --j) {
//                    if (j >= 0 && i >= 0 && j < _map_size && i < _map_size) 
{
//                         alert(i)
//                         alert(j)
//                    x = i*200+j*200;
//                    y = i*200-j*200;
//////////////                        _step++;
                if (/*_map_terrain_tex[i][j]==(0+(1<<4))&&_step%2 ||*/ _fulldraw) {
                    // - _map_view[0]* /*20*/0*sqrt2
                    // - _map_view[1]* /*20*/0*sqrt2 

        // inlined drawSprite
        var positionBuffer = _gl.createBuffer();
        _gl.bindBuffer(_gl.ARRAY_BUFFER, positionBuffer);
        var positions = [
            WIDTH*(-STARTX+ijtox1(i,j)),  HEIGHT*(STARTY-ijtoy1(i,j)),
            WIDTH*(-STARTX+ijtox1(i,j)), HEIGHT*(-STARTY-ijtoy1(i,j)),
            WIDTH*(STARTX+ijtox1(i,j)),  HEIGHT*(STARTY-ijtoy1(i,j)),
            WIDTH*(STARTX+ijtox1(i,j)), HEIGHT*(-STARTY-ijtoy1(i,j)),
        ];
        _gl.bufferData(_gl.ARRAY_BUFFER, new Float32Array(positions), _gl.STATIC_DRAW);

        _gl.bindBuffer(_gl.ARRAY_BUFFER, positionBuffer);
        _gl.vertexAttribPointer(_screen.programInfo.attribLocations.vertexPosition, 2, _gl.FLOAT, false, 0, 0);
        _gl.enableVertexAttribArray(_screen.programInfo.attribLocations.vertexPosition);

        _gl.activeTexture(_gl.TEXTURE0);
        //Math.floor(3.5-((i-3)*(i-3)+(j-3)*(j-3))/5.5)<0?0:Math.floor(3.5-((i-3)*(i-3)+(j-3)*(j-3))/5.5)>3?3:Math.floor(3.5-((i-3)*(i-3)+(j-3)*(j-3))/5.5)
//                if (_textures[_map_terrain_tex[i][j]/*&~(4<<4)*/] === undefined) alert("Undefined struct " + (_map_terrain_tex[i][j]/*&~(4<<4*/));
        _gl.bindTexture(_gl.TEXTURE_2D, _textures[_map_terrain_tex[i][j]/*&~(4<<4)*/]);
        _gl.uniform1i(_screen.programInfo.uniformLocations.sampler, 0);
        _gl.uniform1f(_screen.programInfo.uniformLocations.brightness, 1.0-(_map_terrain_bit[i][j]>>8)*0.1);

        _gl.drawArrays(_gl.TRIANGLE_STRIP, 0, 4);


//                            _screen.drawSprite(ijtox1(i,j), ijtoy1(i,j), /*(_map_terrain_tex[i][j]==(0+(1<<4))&&_step%2)?8<<4:*/_map_terrain_tex[i][j]&~(4<<4), _screenZoom);
                    if (((_map_terrain_tex[i][j]>>4)&4) /*&& ((_map_terrain_tex[i-1][j]>>4)&4) == 0 && ((_map_terrain_tex[i][j-1]>>4)&4) == 0*/) {
                        _screen.drawSprite1(ijtox1(i,j) - _cell_width/_screenZoom/3, ijtoy1(i,j) - _cell_height/_screenZoom/10, _map_terrain_tex[i][j], _screenZoom);
                    }
//, 1.0-(_map_terrain_bit>>8)
                }
            }
        }
    }

    if (_selection != -1) {
        _screen.drawSprite(ijtox1(_units[_selection].coord.i,_units[_selection].coord.j), ijtoy1(_units[_selection].coord.i,_units[_selection].coord.j),
                           _step%2?512:513, _screenZoom);
        _screen.drawSprite(ijtox1(_units[_selection].i,_units[_selection].j), ijtoy1(_units[_selection].i,_units[_selection].j),
                           _units[_selection].texture, _screenZoom);
    }

    if (_fulldraw) {
        for (k=0; k < _units.length; k++) {
            _screen.drawSprite(ijtox1(_units[k].coord.i,_units[k].coord.j), ijtoy1(_units[k].coord.i,_units[k].coord.j),
                               _units[k].texture, _screenZoom);
        }
    }

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
}

const _map = new class
{
    init()
    {
        for (var i=0; i < _map_size; i++) {
            _map_terrain_tex[i] = new Array(_map_size);
            _map_terrain_bit[i] = new Array(_map_size);
        }

        for (var i=0; i < _map_size; i++) {
            for (var j=0; j<_map_size; j++) {
                _map_terrain_tex[i][j] = 0;
                _map_terrain_bit[i][j] = 0xFF;
            }
        }
    }

    genMap(num, msteps, mwidth, mbranch, min_x, min_y, max_x, max_y, type, op)
    {
        for (var pass=0; pass<num; pass++) {
            var steps = Math.round(Math.random()*msteps)+msteps
            var rnd1 = Math.random();
            var rnd2 = Math.random();
            var bj = Math.round(xytoj(min_x + rnd1*(max_x-min_x), min_y + rnd2*(max_y-min_y)))
            var bi = Math.round(xytoi(min_x + rnd1*(max_x-min_x), min_y + rnd2*(max_y-min_y)))
            for (var branch=0; branch < mbranch + Math.round(Math.random()*1); branch++) {
                var width = Math.round(Math.random()*mwidth)+mwidth
                var dir_j = (Math.random()-0.5)/3;
                var dir_i = (Math.random()-0.5)/3;
                var j1 = bj;
                var i1 = bi;
                for (var step=0; step < steps; step++) {
                    j1 += dir_j;
                    i1 += dir_i;
                    dir_j += (Math.random()-0.5)/3;
                    dir_i += (Math.random()-0.5)/3;
                    var j = j1;
                    var i = i1;
                    width = mwidth + Math.round(Math.random()*1);
                    if (width < 0) width = mwidth;
                    for (var r=0; r < width; r++) {
                        j += dir_i;
                        i += dir_j;
                        var x = ijtox(i,j)
                        var y = ijtoy(i,j)
                        var ri = Math.round(i)
                        var rj = Math.round(j)
                        if (rj >= 0 && rj < _map_size && Math.round(i) >= 0 && Math.round(i) < _map_size
                           && x >= min_x && y >= min_y && x < max_x && y < max_y) {
                            if (op == 0) {  // just set
                                _map_terrain_tex[ri][rj] = type;
                            }
                            else
                            if (op == 1 && (_map_terrain_tex[ri][rj]&0x0F)) {  // no water
                                _map_terrain_tex[ri][rj] = type;
                            }
                            else
                            if (op == 2 && (_map_terrain_tex[ri][rj]>>4) != 1) {  // mod terrain heights
                                var was = _map_terrain_tex[ri][rj]>>4
                                _map_terrain_tex[ri][rj] &= 0x0F;
                                _map_terrain_tex[ri][rj] |= (was==0?3:(was-1))<<4;
                            }
                        }
                    }
                }
            }
        }
    }

    fixMap()
    {
        for (var i=1; i < _map_size-1; i++) {
            for (var j=1; j < _map_size-1; j++) {
                // sand near to water
                if (_map_terrain_tex[i][j] == 0 && _map_terrain_tex[i+1][j] == 2 && ijtoy(i,j) > _map_view[1]+(_map_view[3]-_map_view[1])/3 && ijtoy(i,j) < _map_view[3]-(_map_view[3]-_map_view[1])/3) _map_terrain_tex[i+1][j] = 1;
                if (_map_terrain_tex[i][j] == 0 && _map_terrain_tex[i][j+1] == 2 && ijtoy(i,j) > _map_view[1]+(_map_view[3]-_map_view[1])/3 && ijtoy(i,j) < _map_view[3]-(_map_view[3]-_map_view[1])/3) _map_terrain_tex[i][j+1] = 1;
                if (_map_terrain_tex[i][j] == 0 && _map_terrain_tex[i-1][j] == 2 && ijtoy(i,j) > _map_view[1]+(_map_view[3]-_map_view[1])/3 && ijtoy(i,j) < _map_view[3]-(_map_view[3]-_map_view[1])/3) _map_terrain_tex[i-1][j] = 1;
                if (_map_terrain_tex[i][j] == 0 && _map_terrain_tex[i][j-1] == 2 && ijtoy(i,j) > _map_view[1]+(_map_view[3]-_map_view[1])/3 && ijtoy(i,j) < _map_view[3]-(_map_view[3]-_map_view[1])/3) _map_terrain_tex[i][j-1] = 1;
                // shallow water near to land
                if (_map_terrain_tex[i][j] == 0 && _map_terrain_tex[i+1][j] != 0) _map_terrain_tex[i][j] = 0+(1<<4);
                if (_map_terrain_tex[i][j] == 0 && _map_terrain_tex[i][j+1] != 0) _map_terrain_tex[i][j] = 0+(1<<4);
                if (_map_terrain_tex[i][j] == 0 && _map_terrain_tex[i-1][j] != 0) _map_terrain_tex[i][j] = 0+(1<<4);
                if (_map_terrain_tex[i][j] == 0 && _map_terrain_tex[i][j-1] != 0) _map_terrain_tex[i][j] = 0+(1<<4);
            }
        }
    }

    enhMap()
    {
        for (var i=0; i < _map_size-1; i++) {
            for (var j=0; j < _map_size-1; j++) {
                for (var k=0; k < 16; k++) {
                    for (var l=0; l < 4; l++) {
                        if (_textures[k+((l+4)<<4)] !== undefined
                         && (_map_terrain_tex[i][j]&0x3F) == k+(l<<4) && (_map_terrain_tex[i+1][j]&0x3F) == k+(l<<4)
                         && (_map_terrain_tex[i][j+1]&0x3F) == k+(l<<4) && (_map_terrain_tex[i+1][j+1]&0x3F) == k+(l<<4)
                         /*&& (_map_terrain_tex[i][j]&0x30)+(_map_terrain_tex[i+1][j]&0x30)+(_map_terrain_tex[i][j+1]&0x30)+(_map_terrain_tex[i+1][j+1]&0x30) < 0xC0*/) {
//                                     _map_terrain_tex[i][j] = k+((l+4)<<4);
                             _map_terrain_tex[i+1][j] = k+((l+4)<<4);
//                                     _map_terrain_tex[i][j+1] = k+((l+4)<<4);
                             _map_terrain_tex[i+1][j+1] = k+((l+4)<<4);
if ((_map_terrain_tex[i+1][j]&0xF)==4) {  // shadows
    if ((_map_terrain_tex[i+2][j+1]&0xF)!=4) _map_terrain_bit[i+2][j+1] |= 1<<8;
    if ((_map_terrain_tex[i+1][j+2]&0xF)!=4) _map_terrain_bit[i+1][j+2] |= 1<<8;
    if ((_map_terrain_tex[i+2][j+2]&0xF)!=4) _map_terrain_bit[i+2][j+2] |= 1<<8;
}
                        }
                    }
                }
                if (_map_terrain_tex[i][j]==4+((1+4)<<4) && Math.random() > 0.5) {
                    _map_terrain_tex[i][j] |= 8<<4;
                }
                if (_map_terrain_tex[i][j]==4+((4)<<4) && Math.random() > 0.5) {
                    _map_terrain_tex[i][j] |= 8<<4;
                }
                if (_map_terrain_tex[i][j]==2+((2+4)<<4) && Math.random() > 0.5) {
//                            _map_terrain_tex[i][j] |= 8<<4;
                }

                if ((_map_terrain_tex[i][j]&0x0F) != 0) {
                    _map_terrain_bit[i][j] &= 0xFFF0;
                    _map_terrain_bit[i][j] |= (_map_terrain_tex[i][j]>>4)&0x3;
                }
            }
        }
    }

    gen()
    {
        this.genMap(10, 20, 30, 10, _map_view[0], _map_view[1], _map_view[2], _map_view[3], 2, 0);  // grass
        this.genMap(14, 10, 5, 5, _map_view[0], _map_view[1]+(_map_view[3]-_map_view[1])/3, _map_view[2], _map_view[3]-(_map_view[3]-_map_view[1])/3, 1, 1);  // sand
        this.genMap(20, 2, 5, 2, _map_view[0], _map_view[1]+(_map_view[3]-_map_view[1])/3, _map_view[2], _map_view[3]-(_map_view[3]-_map_view[1])/3, 5, 1);  // rocks
        this.genMap(10, 10, 5, 5, _map_view[0], _map_view[1], _map_view[2], _map_view[3], 4, 1);  // hills
        this.genMap(20, 10, 10, 5, _map_view[0], _map_view[1], _map_view[2], _map_view[3], 6, 1);  // forest
        this.genMap(10, 10, 10, 5, _map_view[0], _map_view[1], _map_view[2], _map_view[1]+(_map_view[3]-_map_view[1])/10, 3, 1);  // snow
        this.genMap(10, 10, 10, 5, _map_view[0], _map_view[3]-(_map_view[3]-_map_view[1])/10, _map_view[2], _map_view[3], 3, 1);  // snow
        this.fixMap();  // before mod tiles
        this.genMap(30, 20, 5, 5, _map_view[0], _map_view[1], _map_view[2], _map_view[3], -1, 2);  // mods
        this.genMap(10, 20, 1, 1, _map_view[0], _map_view[1], _map_view[2], _map_view[3], 0+(1<<4), 0);  // wide rivers
        this.genMap(6, 10, 1, 1, _map_view[0], _map_view[1]+(_map_view[3]-_map_view[1])/10, _map_view[2], _map_view[3]-(_map_view[3]-_map_view[1])/10, 7+(3<<4), 1);  // narrow rivers
        this.enhMap();
    }
}

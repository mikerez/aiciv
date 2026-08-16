const _map = new class
{
    init()
    {
        for (var i=0; i < _map_size; i++) {
            _map_terrain_tex[i] = new Array(_map_size);
            _map_terrain_bit[i] = new Array(_map_size);
            _map_resource[i] = new Array(_map_size);
            _map_terrain_mod[i] = new Array(_map_size);
        }

        for (var i=0; i < _map_size; i++) {
            for (var j=0; j<_map_size; j++) {
                _map_terrain_tex[i][j] = 0;  // see _textures
                _map_terrain_bit[i][j] = 0xFF;  // {1'shadow,1'map_open,2'rsv,4'map_seen,4'turn_possible,4'height_cost}
                _map_resource[i][j] = { type: 0, hidden: true };
                _map_terrain_mod[i][j] = {
                    road: false,
                    irrigation: false,
                    irrigationCityFood: false,
                    pasture: false,
                    fortification: false,
                    cottage: false,
                    cottageAge: 0,
                    workshop: false,
                    mine: false,
                    farm: false,
                    plantation: false,
                    camp: false,
                    fishing_boats: false,
                    quarry: false,
                    winery: false,
                    network: false
                };
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
                                _map_terrain_tex[ri][rj] |= (was==0?3:(was-1))<<4;  //hz
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
                // make some sand near to water
                if (_map_terrain_tex[i][j] == 0 && _map_terrain_tex[i+1][j] == 2 && ijtoy(i,j) > _map_view[1]+(_map_view[3]-_map_view[1])/3 && ijtoy(i,j) < _map_view[3]-(_map_view[3]-_map_view[1])/3) _map_terrain_tex[i+1][j] = 1;
                if (_map_terrain_tex[i][j] == 0 && _map_terrain_tex[i][j+1] == 2 && ijtoy(i,j) > _map_view[1]+(_map_view[3]-_map_view[1])/3 && ijtoy(i,j) < _map_view[3]-(_map_view[3]-_map_view[1])/3) _map_terrain_tex[i][j+1] = 1;
                if (_map_terrain_tex[i][j] == 0 && _map_terrain_tex[i-1][j] == 2 && ijtoy(i,j) > _map_view[1]+(_map_view[3]-_map_view[1])/3 && ijtoy(i,j) < _map_view[3]-(_map_view[3]-_map_view[1])/3) _map_terrain_tex[i-1][j] = 1;
                if (_map_terrain_tex[i][j] == 0 && _map_terrain_tex[i][j-1] == 2 && ijtoy(i,j) > _map_view[1]+(_map_view[3]-_map_view[1])/3 && ijtoy(i,j) < _map_view[3]-(_map_view[3]-_map_view[1])/3) _map_terrain_tex[i][j-1] = 1;
                // make shallow water near to land
                if (_map_terrain_tex[i][j] == 0 && _map_terrain_tex[i+1][j] != 0) _map_terrain_tex[i][j] = 0+(1<<4);
                if (_map_terrain_tex[i][j] == 0 && _map_terrain_tex[i][j+1] != 0) _map_terrain_tex[i][j] = 0+(1<<4);
                if (_map_terrain_tex[i][j] == 0 && _map_terrain_tex[i-1][j] != 0) _map_terrain_tex[i][j] = 0+(1<<4);
                if (_map_terrain_tex[i][j] == 0 && _map_terrain_tex[i][j-1] != 0) _map_terrain_tex[i][j] = 0+(1<<4);
            }
        }
    }

    enhMap()  // replace non-overlapping 2x2 repeated terrain with one supertile
    {
        for (var i=0; i < _map_size-1; i++) {
            for (var j=0; j < _map_size-1; j++) {
                for (var k=0; k < 16; k++) {
                    for (var l=0; l < 4; l++) {
                        if (_textures[k+((l+4)<<4)] !== undefined
                         && (_map_terrain_tex[i][j]&0x40) == 0 && (_map_terrain_tex[i+1][j]&0x40) == 0
                         && (_map_terrain_tex[i][j+1]&0x40) == 0 && (_map_terrain_tex[i+1][j+1]&0x40) == 0
                         && (_map_terrain_tex[i][j]&0x3F) == k+(l<<4) && (_map_terrain_tex[i+1][j]&0x3F) == k+(l<<4)
                         && (_map_terrain_tex[i][j+1]&0x3F) == k+(l<<4) && (_map_terrain_tex[i+1][j+1]&0x3F) == k+(l<<4)
                         /*&& (_map_terrain_tex[i][j]&0x30)+(_map_terrain_tex[i+1][j]&0x30)+(_map_terrain_tex[i][j+1]&0x30)+(_map_terrain_tex[i+1][j+1]&0x30) < 0xC0*/) {
//                                     _map_terrain_tex[i][j] = k+((l+4)<<4);
                             _map_terrain_tex[i+1][j] |= 0x40;
//                                     _map_terrain_tex[i][j+1] = k+((l+4)<<4);
                             _map_terrain_tex[i+1][j+1] |= 0x40;
if ((_map_terrain_tex[i+1][j]&0xF)==4) {  // make shadows of big mountains
    if (i+2 < _map_size && j+1 < _map_size && (_map_terrain_tex[i+2][j+1]&0xF)!=4) _map_terrain_bit[i+2][j+1] |= 1<<15;
    if (i+1 < _map_size && j+2 < _map_size && (_map_terrain_tex[i+1][j+2]&0xF)!=4) _map_terrain_bit[i+1][j+2] |= 1<<15;
    if (i+2 < _map_size && j+2 < _map_size && (_map_terrain_tex[i+2][j+2]&0xF)!=4) _map_terrain_bit[i+2][j+2] |= 1<<15;
}
                        }
                    }
                }
                // alternative tiles
                if (_map_terrain_tex[i][j]==4+((1+4)<<4) && Math.random() > 0.5) {
                    _map_terrain_tex[i][j] |= 8<<4;
                }
                if (_map_terrain_tex[i][j]==4+((4)<<4) && Math.random() > 0.5) {
                    _map_terrain_tex[i][j] |= 8<<4;
                }
                if (_map_terrain_tex[i][j]==2+((2+4)<<4) && Math.random() > 0.5) {
//                            _map_terrain_tex[i][j] |= 8<<4;
                }

                if ((_map_terrain_tex[i][j]&0x0F) != 0) {  // not water
                    _map_terrain_bit[i][j] &= 0xFFF0;
                    _map_terrain_bit[i][j] |= (_map_terrain_tex[i][j]>>4)&0x3;  // penalty
                }
            }
        }
    }

    supertileAnchorAt(i, j)
    {
        if (i < 0 || i >= _map_size || j < 0 || j >= _map_size) return null;
        var isLowerTile = (_map_terrain_tex[i][j] & 0x40) != 0;
        var candidates = isLowerTile
            ? [[i - 1, j], [i - 1, j - 1], [i, j], [i, j - 1]]
            : [[i, j], [i, j - 1], [i - 1, j], [i - 1, j - 1]];
        for (var n=0; n < candidates.length; n++) {
            var ai = candidates[n][0];
            var aj = candidates[n][1];
            if (ai < 0 || aj < 0 || ai + 1 >= _map_size || aj + 1 >= _map_size) continue;
            var topLeft = _map_terrain_tex[ai][aj];
            var topRight = _map_terrain_tex[ai][aj + 1];
            var bottomLeft = _map_terrain_tex[ai + 1][aj];
            var bottomRight = _map_terrain_tex[ai + 1][aj + 1];
            var base = topLeft & 0x3F;
            if ((bottomLeft & 0x40) == 0 || (bottomRight & 0x40) == 0) continue;
            if ((topRight & 0x3F) != base || (bottomLeft & 0x3F) != base || (bottomRight & 0x3F) != base) continue;
            return { i: ai, j: aj };
        }
        return null;
    }

    splitSupertileAt(i, j)
    {
        var anchor = this.supertileAnchorAt(i, j);
        if (!anchor) return [];
        var changed = [];
        for (var di=0; di <= 1; di++) {
            for (var dj=0; dj <= 1; dj++) {
                var ti = anchor.i + di;
                var tj = anchor.j + dj;
                if ((_map_terrain_tex[ti][tj] & 0x40) != 0) {
                    _map_terrain_tex[ti][tj] &= ~0x40;
                }
                changed.push({ i: ti, j: tj });
            }
        }
        _fulldraw = 1;
        return changed;
    }

    prepareTerrainModifierSprites()
    {
        this.terrainModifierSprites = [];
        for (var i=0; i < _map_size; i++) {
            for (var j=0; j < _map_size; j++) {
                if (_map_terrain_mod[i][j].road) {
                    this.terrainModifierSprites.push({ i: i, j: j, texture: 850, modifier: 'road' });
                }
                if (_map_terrain_mod[i][j].irrigation) {
                    this.terrainModifierSprites.push({ i: i, j: j, texture: 851 });
                }
                if (_map_terrain_mod[i][j].pasture) {
                    this.terrainModifierSprites.push({ i: i, j: j, texture: 852 });
                }
                if (_map_terrain_mod[i][j].fortification) {
                    this.terrainModifierSprites.push({ i: i, j: j, texture: 853 });
                }
                if (_map_terrain_mod[i][j].cottage) {
                    var cottageAge = _map_terrain_mod[i][j].cottageAge || 0;
                    var cottageStage = this.cottageStage(cottageAge);
                    this.terrainModifierSprites.push({
                        i: i, j: j,
                        texture: cottageStage == 'village' ? 870 : (cottageStage == 'hamlet' ? 869 : 854)
                    });
                }
                if (_map_terrain_mod[i][j].workshop) {
                    this.terrainModifierSprites.push({ i: i, j: j, texture: 855 });
                }
                if (_map_terrain_mod[i][j].mine) {
                    this.terrainModifierSprites.push({ i: i, j: j, texture: 856 });
                }
                if (_map_terrain_mod[i][j].farm) {
                    this.terrainModifierSprites.push({ i: i, j: j, texture: 857 });
                }
                if (_map_terrain_mod[i][j].plantation) {
                    this.terrainModifierSprites.push({ i: i, j: j, texture: 858 });
                }
                if (_map_terrain_mod[i][j].camp) {
                    this.terrainModifierSprites.push({ i: i, j: j, texture: 859 });
                }
                if (_map_terrain_mod[i][j].fishing_boats) {
                    this.terrainModifierSprites.push({ i: i, j: j, texture: 866 });
                }
                if (_map_terrain_mod[i][j].quarry) {
                    this.terrainModifierSprites.push({ i: i, j: j, texture: 867 });
                }
                if (_map_terrain_mod[i][j].winery) {
                    this.terrainModifierSprites.push({ i: i, j: j, texture: 868 });
                }
                if (_map_terrain_mod[i][j].network) {
                    this.terrainModifierSprites.push({ i: i, j: j, texture: 872 });
                }
            }
        }
    }

    addTerrainModifier(i, j, modifier)
    {
        if (i < 0 || i >= _map_size || j < 0 || j >= _map_size || _map_terrain_mod[i][j][modifier]) {
            return false;
        }
        if (modifier != 'road') this.replacePrimaryTerrainModifier(i, j, modifier);
        _map_terrain_mod[i][j][modifier] = true;
        this.prepareTerrainModifierSprites();
        if (typeof _economics !== 'undefined' && _economics.registerTerrainImprovement) {
            _economics.registerTerrainImprovement(modifier, i, j);
        }
        return true;
    }

    primaryTerrainModifiers()
    {
        return ['irrigation', 'pasture', 'fortification', 'cottage', 'workshop', 'mine', 'farm',
            'plantation', 'camp', 'fishing_boats', 'quarry', 'winery', 'network'];
    }

    replacePrimaryTerrainModifier(i, j, replacement)
    {
        var modifiers = _map_terrain_mod[i][j];
        var primary = this.primaryTerrainModifiers();
        for (var n=0; n < primary.length; n++) {
            var modifier = primary[n];
            if (modifier == replacement || !modifiers[modifier]) continue;
            // Fortification cannot be erased as a replacement side effect.
            if (modifier == 'fortification') continue;
            modifiers[modifier] = false;
            if (typeof _economics !== 'undefined' && _economics.removeTerrainImprovementUnitsAt) {
                _economics.removeTerrainImprovementUnitsAt(i, j, modifier);
            }
        }
        delete modifiers.cottageAge;
        delete modifiers.cottageStage;
        modifiers.irrigationCityFood = false;
    }

    hasTerrainModifier(i, j, modifier)
    {
        return i >= 0 && i < _map_size && j >= 0 && j < _map_size && _map_terrain_mod[i][j][modifier];
    }

    addRoad(i, j)
    {
        if (i < 0 || i >= _map_size || j < 0 || j >= _map_size || (_map_terrain_tex[i][j]&0x0F) == 0) {
            return false;
        }
        if (_map_terrain_mod[i][j].road) {
            return false;
        }
        _map_terrain_mod[i][j].road = true;
        this.prepareTerrainModifierSprites();
        if (typeof _economics !== 'undefined' && _economics.registerTerrainImprovement) {
            _economics.registerTerrainImprovement('road', i, j);
        }
        return true;
    }

    hasRoad(i, j)
    {
        return i >= 0 && i < _map_size && j >= 0 && j < _map_size && _map_terrain_mod[i][j].road;
    }

    addIrrigation(i, j, enablesFood = true)
    {
        if (i < 0 || i >= _map_size || j < 0 || j >= _map_size || (_map_terrain_tex[i][j]&0x0F) == 0) {
            return false;
        }
        if (_map_terrain_mod[i][j].irrigation) {
            if (enablesFood) {
                _map_terrain_mod[i][j].irrigationCityFood = true;
            }
            return false;
        }
        this.replacePrimaryTerrainModifier(i, j, 'irrigation');
        _map_terrain_mod[i][j].irrigation = true;
        _map_terrain_mod[i][j].irrigationCityFood = enablesFood;
        this.prepareTerrainModifierSprites();
        if (typeof _economics !== 'undefined' && _economics.registerTerrainImprovement) {
            _economics.registerTerrainImprovement('irrigation', i, j);
        }
        return true;
    }

    enableIrrigationCityFood(i, j)
    {
        if (i < 0 || i >= _map_size || j < 0 || j >= _map_size || !_map_terrain_mod[i][j].irrigation) {
            return false;
        }
        _map_terrain_mod[i][j].irrigationCityFood = true;
        return true;
    }

    hasIrrigation(i, j)
    {
        return i >= 0 && i < _map_size && j >= 0 && j < _map_size && _map_terrain_mod[i][j].irrigation;
    }

    addPasture(i, j)
    {
        return this.addTerrainModifier(i, j, 'pasture');
    }

    addFortification(i, j)
    {
        if (!this.addTerrainModifier(i, j, 'fortification')) return false;
        _map_terrain_mod[i][j].fortificationDefensePercent = 100;
        return true;
    }

    addCottage(i, j)
    {
        if (!this.addTerrainModifier(i, j, 'cottage')) {
            return false;
        }
        _map_terrain_mod[i][j].cottageAge = -1;
        this.prepareTerrainModifierSprites();
        return true;
    }

    addWorkshop(i, j)
    {
        return this.addTerrainModifier(i, j, 'workshop');
    }

    addMine(i, j)
    {
        return this.addTerrainModifier(i, j, 'mine');
    }

    addFarm(i, j)
    {
        return this.addTerrainModifier(i, j, 'farm');
    }

    addPlantation(i, j)
    {
        return this.addTerrainModifier(i, j, 'plantation');
    }

    addCamp(i, j)
    {
        return this.addTerrainModifier(i, j, 'camp');
    }

    addFishingBoats(i, j)
    {
        return this.addTerrainModifier(i, j, 'fishing_boats');
    }

    addNetwork(i, j)
    {
        return this.addTerrainModifier(i, j, 'network');
    }

    addQuarry(i, j)
    {
        return this.addTerrainModifier(i, j, 'quarry');
    }

    addWinery(i, j)
    {
        return this.addTerrainModifier(i, j, 'winery');
    }

    cottageStage(age)
    {
        if (age >= 6000) return 'village';
        if (age >= 1000) return 'hamlet';
        return 'cottage';
    }

    processTerrainModifierTurns()
    {
        var changed = false;
        for (var i=0; i < _map_size; i++) {
            for (var j=0; j < _map_size; j++) {
                if (_map_terrain_mod[i][j].cottage) {
                    var previousAge = _map_terrain_mod[i][j].cottageAge || 0;
                    _map_terrain_mod[i][j].cottageAge = previousAge + 1;
                    if (this.cottageStage(previousAge)
                        != this.cottageStage(_map_terrain_mod[i][j].cottageAge)) changed = true;
                }
            }
        }
        if (changed) {
            this.prepareTerrainModifierSprites();
            _fulldraw = 1;
        }
    }

    genResources()
    {
        for (var i=0; i < _map_size; i++) {
            for (var j=0; j < _map_size; j++) {
                var resourceId = this.randomResourceForTile(i, j);
                _map_resource[i][j] = { type: resourceId, hidden: resourceId != 0 };
            }
        }
        this.prepareResourceSprites();
    }

    randomResourceForTile(i, j)
    {
        var terrainType = _map_terrain_tex[i][j]&0x0F;
        for (var resourceId=1; resourceId < _resource_types.length; resourceId++) {
            var resource = _resource_types[resourceId];
            if (resource.terrains.indexOf(terrainType) != -1 && Math.random() < resource.chance) {
                return resourceId;
            }
        }
        return 0;
    }

    prepareResourceSprites()
    {
        this.resourceSprites = [];
        for (var i=0; i < _map_size; i++) {
            for (var j=0; j < _map_size; j++) {
                var resourceState = _map_resource[i][j];
                var resourceId = resourceState ? resourceState.type : 0;
                if (resourceId && this.isResourceVisible(i, j) && _resource_types[resourceId] != undefined) {
                    this.resourceSprites.push({ i: i, j: j, texture: _resource_types[resourceId].texture });
                }
            }
        }
    }

    isResourceVisible(i, j)
    {
        if (typeof _multiplayer !== 'undefined' && _multiplayer.isResourceVisible) {
            return _multiplayer.isResourceVisible(i, j);
        }
        var resourceState = _map_resource[i] ? _map_resource[i][j] : null;
        return !!(resourceState && !resourceState.hidden);
    }

    setResourceVisible(i, j)
    {
        if (typeof _multiplayer !== 'undefined' && _multiplayer.setResourceVisible) {
            return _multiplayer.setResourceVisible(i, j);
        }
        if (_map_resource[i] && _map_resource[i][j]) {
            _map_resource[i][j].hidden = false;
            return true;
        }
        return false;
    }

    revealResourcesForUnit(unit)
    {
        if (unit == undefined) {
            return false;
        }
        var canRevealLand = unit.unitTypeId == 'explorer';
        var canRevealWater = unit.unitTypeId == 'galley' || unit.unitTypeId == 'galleon';
        if (!canRevealLand && !canRevealWater) {
            return false;
        }

        var i = unit.coord.i;
        var j = unit.coord.j;
        if (i < 0 || i >= _map_size || j < 0 || j >= _map_size) {
            return false;
        }
        var resourceState = _map_resource[i][j];
        if (!resourceState || !resourceState.type || this.isResourceVisible(i, j)) {
            return false;
        }
        var isWaterTile = (_map_terrain_tex[i][j]&0x0F) == 0;
        if ((isWaterTile && canRevealWater) || (!isWaterTile && canRevealLand)) {
            this.setResourceVisible(i, j);
            this.prepareResourceSprites();
            return true;
        }
        return false;
    }

    gen()
    {
        this.genMap(14, 20, 32, 10, _map_view[0], _map_view[1], _map_view[2], _map_view[3], 2, 0);  // grass
        this.genMap(10, 10, 4, 4, _map_view[0], _map_view[1]+(_map_view[3]-_map_view[1])/3, _map_view[2], _map_view[3]-(_map_view[3]-_map_view[1])/3, 1, 1);  // sand
        this.genMap(24, 12, 6, 10, _map_view[0], _map_view[1], _map_view[2], _map_view[3], 4, 1);  // hills
        this.genMap(56, 12, 12, 6, _map_view[0], _map_view[1], _map_view[2], _map_view[3], 6, 1);  // forest
        this.genMap(20, 2, 4, 2, _map_view[0], _map_view[1]+(_map_view[3]-_map_view[1])/3, _map_view[2], _map_view[3]-(_map_view[3]-_map_view[1])/3, 5, 1);  // rocks
        this.genMap(10, 10, 10, 5, _map_view[0], _map_view[1], _map_view[2], _map_view[1]+(_map_view[3]-_map_view[1])/10, 3, 1);  // snow
        this.genMap(10, 10, 10, 5, _map_view[0], _map_view[3]-(_map_view[3]-_map_view[1])/10, _map_view[2], _map_view[3], 3, 1);  // snow
        this.fixMap();  // before mod tiles
        this.genMap(16, 20, 4, 4, _map_view[0], _map_view[1], _map_view[2], _map_view[3], -1, 2);  // mods
        this.genMap(10, 20, 1, 1, _map_view[0], _map_view[1], _map_view[2], _map_view[3], 0+(1<<4), 0);  // wide rivers
        this.genMap(6, 10, 1, 1, _map_view[0], _map_view[1]+(_map_view[3]-_map_view[1])/10, _map_view[2], _map_view[3]-(_map_view[3]-_map_view[1])/10, 7+(3<<4), 1);  // narrow rivers
        this.addRockClusters(Math.max(8, Math.round(_map_size/8)));
        this.enhMap();
        this.prepareTerrainModifierSprites();
        this.genResources();
    }

    addRockClusters(count)
    {
        for (var cluster=0; cluster<count; cluster++) {
            var centerI = 8 + Math.floor(Math.random()*Math.max(1, _map_size-16));
            var centerJ = 8 + Math.floor(Math.random()*Math.max(1, _map_size-16));
            if ((_map_terrain_tex[centerI][centerJ]&0x0F) == 0) {
                cluster--;
                continue;
            }
            var radius = 5 + Math.floor(Math.random()*5);
            for (var di=-radius; di<=radius; di++) {
                for (var dj=-radius; dj<=radius; dj++) {
                    var i = centerI + di;
                    var j = centerJ + dj;
                    if (i < 0 || j < 0 || i >= _map_size || j >= _map_size) continue;
                    var distance = Math.sqrt(di*di + dj*dj);
                    if (distance > radius || Math.random() > 0.88-distance/(radius*3)) continue;
                    var height = distance <= radius*0.28 ? 3 : (distance <= radius*0.62 ? 2 : 1);
                    _map_terrain_tex[i][j] = 5 | (height<<4) | (Math.random() < (height == 3 ? 0.20 : 0.09) ? 0x80 : 0);
                }
            }
            _map_terrain_tex[centerI][centerJ] = 5 | (3<<4) | (Math.random() < 0.30 ? 0x80 : 0);
        }
    }

    closeMap(i1, j1)
    {
        for(var x=0; x < 5; x = x + 1) {
            for(var y=0; y < 5; y = y + 1) {
                var i = i1 - 2 + x;
                var j = j1 - 2 + y;
                if (i < 0 || i >= _map_size || j < 0 || j >= _map_size) {
                    continue;
                }
                _map_terrain_bit[i][j] &= 0xF0FF;
            }
        }
    }

    openMap(i2, j2)
    {
        for(var x=0; x < 5; x = x + 1) {
            for(var y=0; y < 5; y = y + 1) {
                var i = i2 - 2 + x;
                var j = j2 - 2 + y;
                if (i < 0 || i >= _map_size || j < 0 || j >= _map_size) {
                    continue;
                }
                _map_terrain_bit[i][j] |= 0x4000;  // seen
                if (x > 0 && x < 4 && y > 0 && y < 4) {
                    _map_terrain_bit[i][j] |= 0x0500;  // close view
                }
                else {
                    _map_terrain_bit[i][j] |= 0x0100;  // far view, must be in mask of number 0x500
                }
            }
        }
    }

}

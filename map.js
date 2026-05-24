const _resource_types = [
    null,
    { id: 'bananas', name: 'Bananas', texture: 801, sprite: 'resource_bananas.png', gives: 'food from tropical forest and grass tiles', terrains: [6, 2], chance: 0.012 },
    { id: 'cattle', name: 'Cattle', texture: 802, sprite: 'resource_cattle.png', gives: 'food and production from grassland herds', terrains: [2], chance: 0.012 },
    { id: 'copper', name: 'Copper', texture: 803, sprite: 'resource_copper.png', gives: 'early metal production and trade value', terrains: [4, 5], chance: 0.010 },
    { id: 'crabs', name: 'Crabs', texture: 804, sprite: 'resource_crabs.png', gives: 'food from coastal water and river grass', terrains: [0, 7], chance: 0.010 },
    { id: 'deer', name: 'Deer', texture: 805, sprite: 'resource_deer.png', gives: 'food and hides from forest or snow edge tiles', terrains: [6, 3], chance: 0.010 },
    { id: 'fish', name: 'Fish', texture: 806, sprite: 'resource_fish.png', gives: 'food from water tiles', terrains: [0], chance: 0.012 },
    { id: 'rice', name: 'Rice', texture: 807, sprite: 'resource_rice.png', gives: 'food from wet grass and river grass', terrains: [2, 7], chance: 0.012 },
    { id: 'sheep', name: 'Sheep', texture: 808, sprite: 'resource_sheep.png', gives: 'food and wool from grass or hills', terrains: [2, 4], chance: 0.012 },
    { id: 'stone', name: 'Stone', texture: 809, sprite: 'resource_stone.png', gives: 'production support for early buildings and construction', terrains: [4, 5], chance: 0.012 },
    { id: 'wheat', name: 'Wheat', texture: 810, sprite: 'resource_wheat.png', gives: 'food support for city growth', terrains: [2, 7], chance: 0.012 },
    { id: 'amber', name: 'Amber', texture: 811, sprite: 'resource_amber.png', gives: 'luxury and trade value from forested lands', terrains: [6, 3], chance: 0.007 },
    { id: 'citrus', name: 'Citrus', texture: 812, sprite: 'resource_citrus.png', gives: 'food and luxury from warm grass or forest', terrains: [2, 6], chance: 0.008 },
    { id: 'cocoa', name: 'Cocoa', texture: 813, sprite: 'resource_cocoa.png', gives: 'luxury and trade value from forest tiles', terrains: [6], chance: 0.007 },
    { id: 'coffee', name: 'Coffee', texture: 814, sprite: 'resource_coffee.png', gives: 'luxury and commerce from hills or forest', terrains: [4, 6], chance: 0.007 },
    { id: 'cotton', name: 'Cotton', texture: 815, sprite: 'resource_cotton.png', gives: 'luxury and textile value from open land', terrains: [2, 1], chance: 0.008 },
    { id: 'dyes', name: 'Dyes', texture: 816, sprite: 'resource_dyes.png', gives: 'luxury and trade colorants from forests or grass', terrains: [6, 2], chance: 0.008 },
    { id: 'diamonds', name: 'Diamonds', texture: 817, sprite: 'resource_diamonds.png', gives: 'high-value luxury from hills and rocks', terrains: [4, 5], chance: 0.005 },
    { id: 'furs', name: 'Furs', texture: 818, sprite: 'resource_furs.png', gives: 'luxury from cold terrain and forests', terrains: [3, 6], chance: 0.007 },
    { id: 'gypsum', name: 'Gypsum', texture: 819, sprite: 'resource_gypsum.png', gives: 'construction material from desert, hills, and rocks', terrains: [1, 4, 5], chance: 0.008 },
    { id: 'honey', name: 'Honey', texture: 820, sprite: 'resource_honey.png', gives: 'food and luxury from forest and grass', terrains: [6, 2], chance: 0.008 },
    { id: 'incense', name: 'Incense', texture: 821, sprite: 'resource_incense.png', gives: 'luxury and ceremonial trade value', terrains: [1, 4], chance: 0.007 },
    { id: 'ivory', name: 'Ivory', texture: 822, sprite: 'resource_ivory.png', gives: 'luxury and strategic animal material', terrains: [2, 6], chance: 0.006 },
    { id: 'marble', name: 'Marble', texture: 823, sprite: 'resource_marble.png', gives: 'luxury stone and building production value', terrains: [4, 5], chance: 0.007 },
    { id: 'mercury', name: 'Mercury', texture: 824, sprite: 'resource_mercury.png', gives: 'rare scientific and trade material', terrains: [4, 5], chance: 0.005 },
    { id: 'olives', name: 'Olives', texture: 825, sprite: 'resource_olives.png', gives: 'food and luxury from grass or hills', terrains: [2, 4], chance: 0.008 },
    { id: 'pearls', name: 'Pearls', texture: 826, sprite: 'resource_pearls.png', gives: 'luxury from water tiles', terrains: [0], chance: 0.006 },
    { id: 'salt', name: 'Salt', texture: 827, sprite: 'resource_salt.png', gives: 'food preservation and trade value', terrains: [1, 0, 4], chance: 0.008 },
    { id: 'silk', name: 'Silk', texture: 828, sprite: 'resource_silk.png', gives: 'luxury textile value from forest regions', terrains: [6], chance: 0.006 },
    { id: 'silver', name: 'Silver', texture: 829, sprite: 'resource_silver.png', gives: 'precious metal commerce and trade value', terrains: [4, 5], chance: 0.007 },
    { id: 'spices', name: 'Spices', texture: 830, sprite: 'resource_spices.png', gives: 'luxury and food trade value', terrains: [6, 2], chance: 0.008 },
    { id: 'sugar', name: 'Sugar', texture: 831, sprite: 'resource_sugar.png', gives: 'food and luxury from wet grass or river grass', terrains: [2, 7], chance: 0.008 },
    { id: 'tea', name: 'Tea', texture: 832, sprite: 'resource_tea.png', gives: 'luxury from hills or forest', terrains: [4, 6], chance: 0.007 },
    { id: 'tobacco', name: 'Tobacco', texture: 833, sprite: 'resource_tobacco.png', gives: 'luxury and commerce from grass or forest', terrains: [2, 6], chance: 0.007 },
    { id: 'turtles', name: 'Turtles', texture: 834, sprite: 'resource_turtles.png', gives: 'food and luxury from water tiles', terrains: [0], chance: 0.006 },
    { id: 'whales', name: 'Whales', texture: 835, sprite: 'resource_whales.png', gives: 'food, production, and luxury from water tiles', terrains: [0], chance: 0.005 },
    { id: 'wine', name: 'Wine', texture: 836, sprite: 'resource_wine.png', gives: 'luxury and culture value from grass or hills', terrains: [2, 4], chance: 0.007 },
    { id: 'horses', name: 'Horses', texture: 837, sprite: 'resource_horses.png', gives: 'strategic animal resource for horse units', terrains: [2, 1], chance: 0.010 },
    { id: 'iron', name: 'Iron', texture: 838, sprite: 'resource_iron.png', gives: 'strategic metal for iron weapons and units', terrains: [4, 5], chance: 0.009 },
    { id: 'niter', name: 'Niter', texture: 839, sprite: 'resource_niter.png', gives: 'strategic resource for gunpowder units', terrains: [1, 4, 5], chance: 0.007 },
    { id: 'coal', name: 'Coal', texture: 840, sprite: 'resource_coal.png', gives: 'strategic fuel for industry and railways', terrains: [4, 5], chance: 0.007 },
    { id: 'oil', name: 'Oil', texture: 841, sprite: 'resource_oil.png', gives: 'strategic fuel for modern units and industry', terrains: [0, 1, 5], chance: 0.006 },
    { id: 'aluminum', name: 'Aluminum', texture: 842, sprite: 'resource_aluminum.png', gives: 'strategic metal for advanced units and construction', terrains: [4, 5], chance: 0.006 },
    { id: 'uranium', name: 'Uranium', texture: 843, sprite: 'resource_uranium.png', gives: 'strategic late-game energy and weapon resource', terrains: [4, 5, 1], chance: 0.004 },
    { id: 'gold', name: 'Gold', texture: 844, sprite: 'resource_gold.png', gives: 'commerce and trade value', terrains: [4, 5, 1], chance: 0.007 },
];

const _map = new class
{
    init()
    {
        for (var i=0; i < _map_size; i++) {
            _map_terrain_tex[i] = new Array(_map_size);
            _map_terrain_bit[i] = new Array(_map_size);
            _map_resource[i] = new Array(_map_size);
        }

        for (var i=0; i < _map_size; i++) {
            for (var j=0; j<_map_size; j++) {
                _map_terrain_tex[i][j] = 0;  // see _textures
                _map_terrain_bit[i][j] = 0xFF;  // {1'shadow,1'map_open,2'rsv,4'map_seen,4'turn_possible,4'height_cost}
                _map_resource[i][j] = 0;
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
    if ((_map_terrain_tex[i+2][j+1]&0xF)!=4) _map_terrain_bit[i+2][j+1] |= 1<<15;
    if ((_map_terrain_tex[i+1][j+2]&0xF)!=4) _map_terrain_bit[i+1][j+2] |= 1<<15;
    if ((_map_terrain_tex[i+2][j+2]&0xF)!=4) _map_terrain_bit[i+2][j+2] |= 1<<15;
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

    genResources()
    {
        for (var i=0; i < _map_size; i++) {
            for (var j=0; j < _map_size; j++) {
                _map_resource[i][j] = this.randomResourceForTile(i, j);
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
                var resourceId = _map_resource[i][j];
                if (resourceId && _resource_types[resourceId] != undefined) {
                    this.resourceSprites.push({ i: i, j: j, texture: _resource_types[resourceId].texture });
                }
            }
        }
    }

    gen()
    {
        this.genMap(14, 20, 32, 10, _map_view[0], _map_view[1], _map_view[2], _map_view[3], 2, 0);  // grass
        this.genMap(10, 10, 4, 4, _map_view[0], _map_view[1]+(_map_view[3]-_map_view[1])/3, _map_view[2], _map_view[3]-(_map_view[3]-_map_view[1])/3, 1, 1);  // sand
        this.genMap(12, 2, 4, 2, _map_view[0], _map_view[1]+(_map_view[3]-_map_view[1])/3, _map_view[2], _map_view[3]-(_map_view[3]-_map_view[1])/3, 5, 1);  // rocks
        this.genMap(14, 12, 6, 5, _map_view[0], _map_view[1], _map_view[2], _map_view[3], 4, 1);  // hills
        this.genMap(30, 12, 12, 6, _map_view[0], _map_view[1], _map_view[2], _map_view[3], 6, 1);  // forest
        this.genMap(10, 10, 10, 5, _map_view[0], _map_view[1], _map_view[2], _map_view[1]+(_map_view[3]-_map_view[1])/10, 3, 1);  // snow
        this.genMap(10, 10, 10, 5, _map_view[0], _map_view[3]-(_map_view[3]-_map_view[1])/10, _map_view[2], _map_view[3], 3, 1);  // snow
        this.fixMap();  // before mod tiles
        this.genMap(16, 20, 4, 4, _map_view[0], _map_view[1], _map_view[2], _map_view[3], -1, 2);  // mods
        this.genMap(10, 20, 1, 1, _map_view[0], _map_view[1], _map_view[2], _map_view[3], 0+(1<<4), 0);  // wide rivers
        this.genMap(6, 10, 1, 1, _map_view[0], _map_view[1]+(_map_view[3]-_map_view[1])/10, _map_view[2], _map_view[3]-(_map_view[3]-_map_view[1])/10, 7+(3<<4), 1);  // narrow rivers
        this.enhMap();
        this.genResources();
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

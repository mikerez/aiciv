const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function pngSize(path) {
    const data = fs.readFileSync(path);
    assert.equal(data.toString('ascii', 1, 4), 'PNG');
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

assert.deepEqual(pngSize('images/forest_wildity0_supertile-01000110.png'), { width: 440, height: 360 });
assert.deepEqual(pngSize('images/water_depth0_supertile-01000000.png'), { width: 420, height: 310 });
assert.deepEqual(pngSize('images/button.png'), { width: 520, height: 208 });

const size = 6;
const terrain = Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, () => i < 2 ? 0 : (i >= 3 && i < 5 ? 6 : 2))
);
const context = {
    console,
    Math,
    _map_size: size,
    _textures: [],
    _map_terrain_tex: terrain,
    _map_terrain_bit: Array.from({ length: size }, () => Array(size).fill(0)),
};
context._textures[0x40] = {};
context._textures[0x46] = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync('map.js', 'utf8') + ';globalThis.mapEngine=_map;', context);
context.mapEngine.enhMap();

for (const row of [1, 4]) {
    assert.deepEqual(terrain[row].map(value => (value & 0x40) !== 0),
        [true, true, true, true, true, true], 'each repeated pair must become a supertile lower row');
}
for (const row of [0, 2, 3, 5]) {
    assert.equal(terrain[row].some(value => (value & 0x40) !== 0), false,
        'supertile groups must not overlap neighboring rows');
}
assert.deepEqual(JSON.parse(JSON.stringify(context.mapEngine.supertileAnchorAt(1, 0))), { i: 0, j: 0 });
assert.deepEqual(JSON.parse(JSON.stringify(context.mapEngine.supertileAnchorAt(1, 2))), { i: 0, j: 2 });
assert.deepEqual(JSON.parse(JSON.stringify(context.mapEngine.supertileAnchorAt(4, 5))), { i: 3, j: 4 });

const html = fs.readFileSync('index.html', 'utf8');
const terrainSprites = Array.from(html.matchAll(
    /_screen\.loadTexture\('([^']+-([01]{8})\.png)',\s*0b([01]{8})\);/g
));
assert.equal(terrainSprites.length, 47, 'all used byte-indexed terrain sprites must use binary filenames');
const terrainIds = new Set();
for (const match of terrainSprites) {
    assert.equal(match[2], match[3], `${match[1]} must match its registered binary texture id`);
    assert.equal(fs.existsSync('images/' + match[1]), true, `${match[1]} must exist`);
    terrainIds.add(match[3]);
}
assert.equal(terrainIds.size, terrainSprites.length, 'each terrain encoding must have one explicit filename');
const screen = fs.readFileSync('screen.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
assert.match(index, /setTextureRenderDimensions\(0b01000110, 440, 360\)/);
assert.match(index, /setTextureCacheVersion\(0b01000110, '20260816a'\)/);
assert.match(screen, /i == supertileAnchor\.i \+ 1 && j == supertileAnchor\.j/);
assert.match(screen, /drawTerrainSupertile\(x, y, type, zoom, brightness\)[\s\S]*?textureRenderDimensions\[type\][\s\S]*?Math\.max\(420, dimensions\.width\)[\s\S]*?Math\.max\(310, dimensions\.height\)/);
assert.match(screen, /_screen\.drawTerrainSupertile\(supertileX, supertileY/);
assert.match(screen, /var supertileX = \(ijtox1[\s\S]*?\/ 2;/,
    'supertile x center must use its original calculated anchor');
assert.match(screen, /var supertileY = \(ijtoy1[\s\S]*?\/ 2 - 10\*_ratio;/,
    'supertile y center must shift 5 CSS pixels up in doubled backing coordinates');

console.log('PASS large forest/water supertiles and enlarged button assets');

const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const terrainSprites = Array.from(html.matchAll(
    /_screen\.loadTexture\('([^']+-([01]{8})\.png)',\s*0b([01]{8})\);/g
));

assert.equal(terrainSprites.length, 47,
    'all used byte-indexed terrain sprites must use binary filenames');
const filenames = new Set();
const textureIds = new Set();
for (const match of terrainSprites) {
    const filename = match[1];
    const filenameBits = match[2];
    const textureBits = match[3];
    assert.equal(filenameBits, textureBits,
        `${filename} must match its registered binary texture ID`);
    assert.equal(fs.existsSync('images/' + filename), true, `${filename} must exist`);
    filenames.add(filename);
    textureIds.add(textureBits);
}
assert.equal(filenames.size, terrainSprites.length, 'terrain filenames must be unique');
assert.equal(textureIds.size, terrainSprites.length, 'terrain texture IDs must be unique');

console.log('PASS 47 terrain sprite filenames match their 8-bit texture IDs');

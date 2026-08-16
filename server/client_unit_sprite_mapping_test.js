#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('game_prehistory.js', 'utf8');
const mappings = [
    ['City.png', 259], ['Archer.png', 261], ['Catapult.png', 266],
    ['Chariot.png', 264], ['Frigate.png', 272], ['Galleon.png', 269],
    ['Galley.png', 268], ['Horseman.png', 263], ['Longbow.png', 275],
    ['Pikeman.png', 274], ['slinger.png', 260], ['Spearman.png', 262],
    ['Swordman.png', 277], ['Trebuchet.png', 267], ['Trireme.png', 278],
    ['Warior.png', 258], ['Workboat.png', 271],
];

for (const [file, texture] of mappings) {
    assert.ok(fs.existsSync('images/' + file), 'missing requested image images/' + file);
    assert.ok(source.includes(`_screen.loadTexture('${file}' + _prehistory_unit_sprite_version, ${texture});`),
        `${file} must be wired to texture ${texture} with cache invalidation`);
}
assert.doesNotMatch(source, /_screen\.loadTexture\('(city\.png|unit_galley\.png|unit_galleon\.png)'/,
    'old City, Galley, and Galleon sprite files must not remain wired');
assert.match(source, /galley:\s*'Galley\.png'/);
assert.match(source, /galleon:\s*'Galleon\.png'/);
assert.match(source, /function prehistoryUnitSpriteUrl\(unitTypeId\)[\s\S]*?_prehistory_unit_sprite_version/,
    'City production sprite resolver must use the shared cache version');
assert.match(source, /image\.src = prehistoryUnitSpriteUrl\(unitType\.id\)/,
    'City production rows must use the shared unit sprite resolver');

for (const [unitTypeId, file] of [
    ['warrior', 'Warior.png'], ['slinger', 'slinger.png'],
    ['archer', 'Archer.png'], ['spearman', 'Spearman.png'],
    ['horseman', 'Horseman.png'], ['chariot', 'Chariot.png'],
    ['catapult', 'Catapult.png'], ['trebuchet', 'Trebuchet.png'],
    ['galley', 'Galley.png'], ['galleon', 'Galleon.png'],
    ['workboat', 'Workboat.png'], ['frigate', 'Frigate.png'],
    ['pikeman', 'Pikeman.png'], ['longbow', 'Longbow.png'],
    ['swordsman', 'Swordman.png'], ['trireme', 'Trireme.png'],
]) {
    assert.match(source, new RegExp(`${unitTypeId}:\\s*'${file.replace('.', '\\.')}''?`.replace("''?", "'")),
        `${unitTypeId} City production row must use ${file}`);
}

console.log('PASS all requested replacement unit sprites are wired and versioned');

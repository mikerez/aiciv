const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('game_prehistory.js', 'utf8');
const expected = [
    ['workboat', 'WorkBoat', 1, 271, 0, 1, 2, 3, 'Sailing', 30, 'water'],
    ['frigate', 'Frigate', 2, 272, 6, 5, 3, 4, 'Shipbuilding', 100, 'water'],
    ['knight', 'Knight', 2, 273, 6, 5, 2, 3, 'Engineering', 85, 'land'],
    ['pikeman', 'Pikeman', 2, 274, 4, 6, 1, 2, 'Iron Working', 55, 'land'],
    ['longbow', 'Longbow', 2, 275, 5, 3, 1, 3, 'Archery', 55, 'land'],
    ['fencer', 'Fencer', 2, 276, 4, 3, 2, 2, 'Bronze Working', 45, 'land'],
    ['swordsman', 'Swordsman', 2, 277, 7, 5, 1, 2, 'Iron Working', 75, 'land'],
    ['trireme', 'Trireme', 2, 278, 1, 1, 2, 3, 'Sailing', 30, 'water'],
];

for (const [id, name, unitClass, texture, attack, defense, speed, view, technology, cost, nature] of expected) {
    const resource = id === 'frigate' || id === 'pikeman' || id === 'swordsman' ? "'Iron'"
        : id === 'knight' ? "'Horses'"
        : id === 'fencer' ? "'Copper or Iron'" : 'null';
    const natureArguments = nature === 'water' ? ", true, 'water'" : '';
    const definition = `new UnitType('${id}', vocabularyUnitName('${id}'), ${unitClass}, ${texture}, ${attack}, ${defense}, ${speed}, ${view}, '${technology}', ${cost}, ${resource}${natureArguments})`;
    assert.ok(source.includes(definition), `missing client definition for ${id}`);
    const imageName = id === 'workboat' ? 'Workboat' : id === 'swordsman' ? 'Swordman' : name;
    const plain = `_screen.loadTexture('${imageName}.png', ${texture});`;
    const versioned = `_screen.loadTexture('${imageName}.png' + _prehistory_unit_sprite_version, ${texture});`;
    assert.ok(source.includes(plain) || source.includes(versioned), `missing texture for ${id}`);
}

for (const [unitTypeId, requirement] of [
    ['chariot', "['horses', 'copper']"],
    ['elephant', "['ivory', 'copper']"],
    ['galleon', "['copper']"],
    ['frigate', "['iron']"],
]) {
    assert.ok(source.includes(`${unitTypeId}: ${requirement}`),
        `missing client production resources for ${unitTypeId}`);
}

console.log('PASS new client unit definitions and textures');

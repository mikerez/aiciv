#!/usr/bin/env node
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const context = {
    console,
    _map_terrain_tex: [[0, 0], [0, 6]],
    _map_terrain_mod: [[{}, {}], [{}, {}]],
    _units_by_user: {},
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('military.js', 'utf8') + '\nglobalThis.military = _military;', context);

const unit = type => ({ unitTypeId: type, type: 2, coord: { i: 1, j: 1 }, health: 100,
    maxHealth: 100, experience: 1, defense: 4, can_move: true });
let result = context.military.battleChanceInputs(unit('knight'), unit('pikeman'));
assert.equal(result.landscapeBonus, 0.5);
assert.equal(result.unitBonus, 0.3);
result = context.military.battleChanceInputs(unit('trebuchet'), unit('elephant'));
assert.equal(result.unitBonus, -0.15);
result = context.military.battleChanceInputs(unit('warrior'), unit('horseman'));
assert.equal(result.landscapeBonus, 0, 'mounted forest bonus is +50% forest and -50% mounted penalty');

console.log('PASS client combat bonus table');

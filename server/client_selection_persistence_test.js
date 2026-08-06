#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const sandbox = {
    console,
    _selection: 0,
    _screenZoom: 2,
    _units: [
        {coord: {i: 2, j: 2}, type: 1, gotoPath: [{i: 3, j: 2}]},
        {coord: {i: 5, j: 5}, type: 1, gotoPath: []},
    ],
    ijtox1: (i, j) => i*100 + j,
    ijtoy1: (i, j) => i*100 - j,
    _unit_stack_menu: {hide() {}, show() {}},
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('control.js', 'utf8') + '\nglobalThis.control = _control;', sandbox);

const routeBefore = JSON.stringify(sandbox._units[0].gotoPath);
const emptyHit = sandbox.control.click(9000, 9000, {i: 20, j: 20}, false, null);
assert.equal(emptyHit, false);
assert.equal(vm.runInContext('_selection', sandbox), 0, 'empty map click must preserve selection');
assert.equal(JSON.stringify(sandbox._units[0].gotoPath), routeBefore, 'empty map click must preserve Goto');

const unitHit = sandbox.control.click(505, 495, {i: 5, j: 5}, false, null);
assert.equal(unitHit, true);
assert.equal(vm.runInContext('_selection', sandbox), 1, 'clicking another unit must select it');
console.log('PASS empty-map click preserves selection and Goto while unit clicks still select');

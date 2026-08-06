const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const sandbox = {_map_size: 100, console};
vm.createContext(sandbox);
const source = fs.readFileSync('birdsview.js', 'utf8') + '\nglobalThis.__birdsview = _birdsview;';
vm.runInContext(source, sandbox, {filename: 'birdsview.js'});

const layout = {centerX: 100, centerY: 100, sourceWidth: 100, sourceCenter: 50};
const positiveRotatedY = sandbox.__birdsview.sourceToScreenPoint(0, 20, layout);
const negativeRotatedY = sandbox.__birdsview.sourceToScreenPoint(0, -20, layout);
assert(positiveRotatedY.y < layout.centerY, 'positive rotated Y must draw above center after screen-Y inversion');
assert(negativeRotatedY.y > layout.centerY, 'negative rotated Y must draw below center after screen-Y inversion');

const mapPoint = sandbox.__birdsview.mapCoordToRotatedPoint(50, 70, layout);
assert.equal(mapPoint.y, positiveRotatedY.y, 'viewport stroke and terrain cells must use the same flipped transform');
console.log('PASS birdsview terrain and viewport stroke invert final screen-space Y');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const sandbox = {
    _map_size: 100,
    console,
    window: {innerWidth: 1500, innerHeight: 1000},
    document: {body: {classList: {contains() { return false; }}}},
};
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

const shiftedCanvas = {
    width: 1500,
    height: 1000,
    getBoundingClientRect() {
        return {left:0, top:-850, width:1500, height:1000};
    },
};
const shiftedVisible = sandbox.__birdsview.visibleCanvasRect(shiftedCanvas);
const shiftedLayout = sandbox.__birdsview.layoutForCanvas(shiftedCanvas);
assert(shiftedLayout.clipTop >= shiftedVisible.top,
    'a vertically shifted canvas must keep the minimap below its visible top edge');
assert(shiftedLayout.clipBottom <= shiftedVisible.bottom,
    'a vertically shifted canvas must keep the minimap above its visible bottom edge');
console.log('PASS birdsview terrain and viewport stroke invert final screen-space Y');

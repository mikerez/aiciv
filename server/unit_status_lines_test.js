#!/usr/bin/env node
const fs = require('fs');
const vm = require('vm');

const units = [
    { can_move: true, health: 75, maxHealth: 100, experience: 1, coord: { i: 1, j: 1 } },
    { can_move: true, health: 50, maxHealth: 100, experience: 1.2, coord: { i: 2, j: 2 } },
    { can_move: true, health: 10, maxHealth: 100, experience: 2, coord: { i: 3, j: 3 } },
    { can_move: false, health: 100, maxHealth: 100, experience: 2, coord: { i: 4, j: 4 } },
];
const context = {
    console,
    document: { body: { classList: { contains: () => false } } },
    _screenZoom: 2,
    visibleUnitsForCurrentUser: () => units,
    ijtox1: (i, j) => (i + j) * 100,
    ijtoy1: (i, j) => (i - j) * 100,
    x1toX: value => value,
    y1toY: value => value,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('draw.js', 'utf8') + '\nglobalThis.draw = _draw;', context);

const lines = [];
const canvasContext = {
    save() {},
    restore() {},
    fillRect(x, y, width, height) {
        lines.push({ x, y, width, height, color: this.fillStyle });
    },
};
context.draw.drawUnitStatusLines(canvasContext);

if (lines.length !== 6) throw new Error('only three movable units should draw two lines each');
if (lines.some(line => line.height !== 2)) throw new Error('status lines must be exactly two pixels high');
if (lines[0].color !== '#00b83e' || lines[0].width !== 75) throw new Error('75% HP must be green');
if (lines[1].color !== '#1687ff' || lines[1].width !== 50) throw new Error('50% XP must be blue');
if (lines[2].color !== '#ffd400' || lines[2].width !== 50) throw new Error('50% HP must be yellow');
if (lines[3].color !== '#9b36d6' || lines[3].width !== 60) throw new Error('60% XP must be purple');
if (lines[4].color !== '#e02020' || lines[4].width !== 10) throw new Error('10% HP must be red');
if (lines[5].color !== '#9b36d6' || lines[5].width !== 100) throw new Error('full XP must be purple');
if (lines[0].y !== -44) throw new Error('HP line must start just below the nickname baseline');
if (lines[1].y !== lines[0].y + 2) throw new Error('XP line must be directly below HP line');
console.log('PASS movable unit HP and XP lines use the requested widths, positions, and colors');

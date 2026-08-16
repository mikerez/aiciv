#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const context = {
    console,
    _map: {terrainModifierSprites: [
        {i:4, j:5, texture:851, modifier:'irrigation'},
        {i:4, j:5, texture:850, modifier:'road'},
    ]},
    _draw: {unitArrivalVisualCoord(unit) { return unit.coord; }},
    _city_economy: {
        drawYieldCompositionMap() { calls.push('citizen'); },
    },
    _screenZoom: 1,
    _team_color_textures: [900, 901],
    ijtox1(i, j) { return i*100+j; },
    ijtoy1(i, j) { return i*100-j; },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('screen.js', 'utf8') + '\nglobalThis.testScreen = _screen;', context);

const calls = [];
context.testScreen.tileBrightness = () => 1;
context.testScreen.drawSprite = (x, y, texture) => calls.push(texture);
context.testScreen.drawSpriteWithBrightness = (x, y, texture) => calls.push(texture);
context.testScreen.drawForegroundSprites([
    {type:1, texture:200, team:1, coord:{i:4, j:5}},
    {type:3, texture:100, team:0, coord:{i:4, j:5}},
], 0, 0, 10, 10, [{i:4, j:5, income:{food:2, production:1, money:0}}]);

assert.deepStrictEqual(calls, [100, 900, 851, 850, 'citizen', 200, 901],
    'one Tile must draw City, improvement, road, citizen plot, then other units');
console.log('PASS per-Tile sprite schedule draws citizen plots before movable units');

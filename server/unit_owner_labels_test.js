#!/usr/bin/env node
const fs = require('fs');
const vm = require('vm');

const fills = [];
const context = {
    console,
    document: { body: { classList: { contains: () => false } } },
    _current_user: 4,
    _screenZoom: 2,
    _server_game: { civilizationsByPlayer: { 4: [
        { player_id: 4, player_name: 'Alice' },
        { player_id: 9, player_name: 'AI Player 9' },
    ] } },
    visibleUnitsForCurrentUser: () => [
        { team: 4, coord: { i: 10, j: 11 }, unitTypeId: 'city' },
        { team: 4, coord: { i: 10, j: 11 }, unitTypeId: 'warrior' },
        { team: 9, coord: { i: 12, j: 13 }, unitTypeId: 'explorer' },
    ],
    ijtox1: (i, j) => i + j,
    ijtoy1: (i, j) => i - j,
    x1toX: value => value,
    y1toY: value => value,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('draw.js', 'utf8') + '\nglobalThis.draw = _draw;', context);

const canvasContext = {
    save() {}, restore() {},
    strokeText() { throw new Error('owner labels must not use thick stroke text'); },
    fillText(text, x, y, width) { fills.push({ text, x, y, width, font: this.font }); },
};
context.draw.drawUnitOwnerLabels(canvasContext);

if (fills.length !== 4) throw new Error('same-owner stack must render one shared two-pass label');
if (fills[0].text !== 'Alice' || fills[1].text !== 'Alice') throw new Error('human username was not rendered');
if (fills[2].text !== 'AI Player 9' || fills[3].text !== 'AI Player 9') throw new Error('AI player name was not rendered');
if (fills.some(entry => /bold/i.test(entry.font || ''))) throw new Error('owner label font must use regular weight');
console.log('PASS owner labels render small regular-weight usernames once per same-owner stack');

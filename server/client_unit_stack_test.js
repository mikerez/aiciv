const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function element(tagName) {
    const listeners = {};
    const attributes = {};
    const value = {
        tagName,
        style: {},
        children: [],
        textContent: '',
        appendChild(child) { this.children.push(child); },
        addEventListener(name, callback) { listeners[name] = callback; },
        setAttribute(name, attribute) { attributes[name] = String(attribute); },
        getAttribute(name) { return attributes[name]; },
        trigger(name) {
            listeners[name]({preventDefault() {}, stopPropagation() {}});
        },
    };
    Object.defineProperty(value, 'innerHTML', {
        set() { value.children = []; },
        get() { return ''; },
    });
    return value;
}

const body = element('body');
body.classList = {contains(name) { return name === 'phone-ui'; }};
const sandbox = {
    console,
    document: {body, createElement: element},
    _units: [
        {serverId: 10, type: 0, name: 'Settlers', health: 100, coord: {i: 4, j: 5}},
        {serverId: 11, type: 1, name: 'Explorer', health: 80, coord: {i: 4, j: 5}},
    ],
    _selection: 0,
    _multi_selection: [],
    _selection_by_user: {7: 0},
    _current_user: 7,
    _current_game: {showActionMenuForSelection() {}},
    _fulldraw: 0,
    drawScene() {},
};
vm.createContext(sandbox);
const source = fs.readFileSync('menu_stack.js', 'utf8') + '\nglobalThis.__unitStack = _unit_stack_menu;';
vm.runInContext(source, sandbox, {filename: 'menu_stack.js'});

const menu = sandbox.__unitStack;
menu.show([0, 1], {i: 4, j: 5});
assert.equal(menu.button.style.display, 'block');
assert.equal(menu.button.textContent, 'Units (2)');
assert.equal(menu.panel.style.display, 'block');
assert.equal(menu.button.getAttribute('aria-expanded'), 'true');

menu.button.trigger('click');
assert.equal(menu.panel.style.display, 'none');
assert.equal(menu.button.getAttribute('aria-expanded'), 'false');

menu.button.trigger('click');
assert.equal(menu.panel.style.display, 'block');
sandbox._units.unshift({serverId: 99, type: 4, hiddenOnMap: true, health: 100, coord: {i: 4, j: 5}});
menu.panel.children[2].trigger('click');
assert.equal(vm.runInContext('_selection', sandbox), 2,
    'a stale button must resolve the Explorer by stable identity after array indices shift');
assert.equal(menu.panel.style.display, 'none');
assert.equal(menu.button.getAttribute('aria-expanded'), 'false');

menu.hide();
assert.equal(menu.panel.style.display, 'none');
assert.equal(menu.button.style.display, 'none');

menu.deferPhoneTap([0, 1], {i: 4, j: 5}, {x: 100, y: 100});
assert.equal(menu.panel.style.display, 'none', 'touch start must not open the stack panel');
assert.equal(menu.finishDeferredPhoneTap(true), true, 'a completed stationary tap should open the panel');
assert.equal(menu.panel.style.display, 'block');

menu.deferPhoneTap([0, 1], {i: 4, j: 5}, {x: 100, y: 100});
menu.updateDeferredPhoneTap({x: 130, y: 100}, 12);
assert.equal(menu.finishDeferredPhoneTap(true), false, 'a drag must not open the stack panel');
assert.equal(menu.panel.style.display, 'none');

menu.deferPhoneTap([0, 1], {i: 4, j: 5}, {x: 100, y: 100});
assert.equal(menu.finishDeferredPhoneTap(false), false, 'touch cancellation must not open the stack panel');
assert.equal(menu.panel.style.display, 'none');

sandbox._units.splice(0, sandbox._units.length,
    {serverId: 20, type: 2, name: 'Warrior', health: 100, coord: {i: 7, j: 8}},
    {serverId: 21, type: 3, name: 'City', health: 100, coord: {i: 7, j: 8}},
    {serverId: 22, type: 2, name: 'Archer', health: 100, coord: {i: 7, j: 8}},
    {serverId: 23, type: 1, name: 'Worker', health: 100, coord: {i: 7, j: 8}},
    {serverId: 24, type: 4, name: 'Road', health: 100, hiddenOnMap: true, coord: {i: 7, j: 8}});
menu.show([0, 1, 2, 3], {i: 7, j: 8});
assert.equal(menu.panel.children[2].children[0].textContent, 'CITY', 'City must be first in the stack');
sandbox._units.splice(0, 4,
    sandbox._units[3], sandbox._units[2], sandbox._units[1], sandbox._units[0]);
menu.panel.children[1].trigger('click');
assert.deepEqual(Array.from(vm.runInContext('_multi_selection', sandbox)), [1, 3]);
assert.equal(vm.runInContext('_selection', sandbox), 1);
assert.equal(menu.liveIndicesAt({i: 7, j: 8}).length, 4,
    'hidden terrain improvements must not enter the selection stack');

const controlSource = fs.readFileSync('control.js', 'utf8');
assert.match(controlSource, /cityHit != -1 && tileUnits\.length > 1/);
assert.match(controlSource, /var hitUnits = tileUnits\.length \? tileUnits : spriteUnits/,
    'exact Tile occupants must override intersecting neighboring sprites');
assert.match(controlSource, /drawGotoGroup\(indices, i2, j2\)/);
const gameSource = fs.readFileSync('game_prehistory.js', 'utf8');
assert.match(gameSource, /commandSelectionIndices\(\)/);
assert.match(gameSource, /for \(var gotoIndex=0; gotoIndex < commandIndices\.length/);
const menuSource = fs.readFileSync('menu_unit.js', 'utf8');
assert.ok(menuSource.indexOf('city_production_queue') > menuSource.indexOf('</font>'), 'backlog belongs below City commands');
const serverSource = fs.readFileSync('server_game.js', 'utf8');
assert.match(serverSource, /selectedIdentity[\s\S]*selectionIndex\(_units, selectedIdentity\)/,
    'authoritative synchronization must restore primary selection by stable identity');
assert.match(serverSource, /groupIdentities[\s\S]*selectionIndex\(_units, groupIdentities\[groupIndex\]\)/,
    'authoritative synchronization must restore group selection by stable identity');
console.log('PASS stack taps, City priority, military Select all, group routing, and backlog order');

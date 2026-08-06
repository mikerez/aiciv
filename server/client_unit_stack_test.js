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
        {type: 0, name: 'Settlers', health: 100},
        {type: 1, name: 'Explorer', health: 80},
    ],
    _selection: 0,
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
menu.panel.children[2].trigger('click');
assert.equal(vm.runInContext('_selection', sandbox), 1);
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
console.log('PASS phone unit-stack selector opens on taps and stays hidden during drags');

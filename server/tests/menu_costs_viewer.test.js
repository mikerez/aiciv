#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function element() {
    return {
        style:{}, children:[], attributes:{}, textContent:'', innerHTML:'',
        addEventListener() {},
        appendChild(child) { this.children.push(child); return child; },
        setAttribute(name, value) { this.attributes[name] = String(value); },
    };
}

const context = {
    console, Number, String, Math, Map,
    document:{
        body:{appendChild() {}},
        createElement:element,
    },
    vocabularyText:key => key,
    vocabularyUnitName:id => id,
    vocabularyCommandName:name => name,
    _authenticated_player_id:23,
    _current_user:999,
    _units_by_user:{23:[],999:[{unitTypeId:'warrior',can_move:true,type:2,health:100}]},
    _current_game:{
        unitTypes:[],
        terrainImprovementUpkeep() { return {}; },
    },
};
vm.createContext(context);
const source = fs.readFileSync(path.join(__dirname, '..', '..', 'menu_costs.js'), 'utf8');
vm.runInContext(source + ';globalThis.testCostsMenu=_costs_menu;', context, {filename:'menu_costs.js'});

assert.equal(context.testCostsMenu.viewerPlayerId(), 23,
    'the logged-in civilization wins over the temporary hidden-AI current user');
context.testCostsMenu.refresh();
assert.equal(context.testCostsMenu.panel.attributes['data-player-id'], '23',
    'the rendered Costs panel records the authenticated civilization');

context._authenticated_player_id = null;
assert.equal(context.testCostsMenu.viewerPlayerId(), 999,
    'the local AI demo continues to use its active civilization');
console.log('PASS Costs menu remains bound to the authenticated civilization during hidden AI work');

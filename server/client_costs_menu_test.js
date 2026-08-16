#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
    constructor(tag) {
        this.tag = tag;
        this.children = [];
        this.style = {};
        this.textContent = '';
        this.className = '';
    }
    appendChild(child) { this.children.push(child); }
    addEventListener() {}
    setAttribute() {}
    set innerHTML(_value) { this.children = []; }
}

const producingCity = {
    type:3, serverId:10, team:1, name:'Forge', health:100, coord:{i:2,j:2}, cityPopulation:2,
    production:{unitTypeId:'warrior'}, productionQueue:['warrior'],
    lastCityIncome:{food:5, production:4, money:2, workshopFoodCost:0},
};
const idleCity = {
    type:3, serverId:11, team:1, name:'Rest', health:100, coord:{i:6,j:6}, cityPopulation:1,
    production:null, productionQueue:[],
    lastCityIncome:{food:1, production:3, money:1, workshopFoodCost:2},
};
const stalledCity = {
    type:3, serverId:12, team:1, name:'Stalled', health:100, coord:{i:9,j:9}, cityPopulation:3,
    production:{unitTypeId:'settlers'}, productionQueue:['settlers'],
    cityProperties:{productionPerTurn:0},
    lastCityIncome:{food:-1, production:0, money:1, workshopFoodCost:2},
};
const units = [
    producingCity,
    idleCity,
    stalledCity,
    {type:4, team:1, health:100, can_move:false, unitTypeId:'building_workshop',
        improvementType:'workshop', parentCityId:10, coord:{i:2,j:3}},
    {type:4, team:1, health:100, can_move:false, unitTypeId:'building_workshop',
        improvementType:'workshop', parentCityId:11, coord:{i:6,j:5}},
    {type:4, team:1, health:100, can_move:false, unitTypeId:'building_workshop',
        improvementType:'workshop', parentCityId:12, coord:{i:9,j:8}},
];
const context = {
    console,
    document:{createElement:tag => new Element(tag), body:new Element('body')},
    _current_user:1,
    _units_by_user:{1:units},
    _current_game:{
        unitTypes:[],
        unitFoodUpkeep() { return 0; },
        unitGoldUpkeep() { return 0; },
        terrainImprovementUpkeep() { return {workshop:{food:2,production:0,gold:0}}; },
    },
    _city_economy:{
        cityIsProducing(city) {
            return !!(city.production && city.production.unitTypeId)
                && Number(city.lastCityIncome && city.lastCityIncome.production) > 0;
        },
        hexDistance(di, dj) { return Math.max(Math.abs(di), Math.abs(dj)); },
    },
    vocabularyText:key => key,
    vocabularyUnitName:id => id,
    vocabularyCommandName:id => id,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('menu_costs.js', 'utf8')
    + '\nglobalThis.costsMenu = _costs_menu;', context, {filename:'menu_costs.js'});

context.costsMenu.refresh();
const rows = context.costsMenu.panel.children
    .filter(element => element.className.indexOf('costs-row') !== -1)
    .map(element => element.children.map(cell => cell.textContent));
assert(rows.some(row => row[0] === 'Forge #10' && row[2] === 'warrior' && row[3] === '+3/+4/+2'),
    'an active City balance must include its currently active Workshop food charge');
assert(rows.some(row => row[0] === 'Rest #11' && row[2] === 'common.none' && row[3] === '+3/+3/+1'),
    'an idle City balance must remove the Workshop charge recorded during earlier production');
assert(rows.some(row => row[0] === 'Stalled #12' && row[2] === 'settlers' && row[3] === '+1/0/+1'),
    'a P=0 queue must remove its previously recorded Workshop charge');
assert(rows.some(row => row[0] === 'workshop' && row[1] === '1/3' && row[3] === '2/0/0'),
    'Workshop upkeep totals must count only active parent Cities');

console.log('PASS Costs menu City balances and conditional Workshop upkeep');

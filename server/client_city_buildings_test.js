#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const {mapTiles, city} = require('./tests/test_client');
const {createBrowserClient, localUnit} = require('./tests/browser_client');

const playerId = 61501;
const firstCity = localUnit(city({client_key:'city-a',owner_id:playerId,i:3,j:3}), 1001);
const secondCity = localUnit(city({client_key:'city-b',owner_id:playerId,i:5,j:3}), 1002);
const stable = localUnit({
    client_key:'stable-a',owner_id:playerId,unit_type_id:'stable',unit_class:4,
    name:'Stable',texture:0,can_move:false,nature:'land',i:3,j:3,attack:0,defense:0,
    speed:0,view_range:0,state:'built',health:100,max_health:100,experience:1,
    properties:{cityBuilding:true,parentCityId:1001,hiddenOnMap:true},
}, 1101);
const lazaret = localUnit({
    client_key:'lazaret-a',owner_id:playerId,unit_type_id:'lazaret',unit_class:4,
    name:'Lazaret',texture:0,can_move:false,nature:'land',i:3,j:3,attack:0,defense:0,
    speed:0,view_range:0,state:'built',health:100,max_health:100,experience:1,
    properties:{cityBuilding:true,parentCityId:1001,hiddenOnMap:true},
}, 1102);

const tiles = mapTiles(10);
for (const tile of tiles) {
    if ((tile.i === 3 || tile.i === 4 || tile.i === 5) && tile.j === 3) {
        tile.modifiers = {road:true};
    }
}
const client = createBrowserClient({
    size:10,playerId,gameId:'client-city-buildings',tiles,
    units:[firstCity,secondCity,stable,lazaret],
});

assert.deepEqual(Array.from(client.currentGame.cityBuildingTypes, type => type.id),
    ['lazaret','stable','shooting_range','barracks','port','market']);
for (const type of client.currentGame.cityBuildingTypes) {
    assert.ok(fs.existsSync(`images/${type.sprite}`), `missing pulled sprite ${type.sprite}`);
}
assert.equal(client.currentGame.cityHasBuilding(firstCity, 'stable'), true);
assert.equal(client.currentGame.canCityProduceUnit(firstCity, client.currentGame.unitTypesById.stable), false,
    'completed buildings must not be offered twice');
assert.equal(client.currentGame.canCityProduceUnit(firstCity, client.currentGame.unitTypesById.market), true,
    'unbuilt city buildings remain available');
assert.equal(client.currentGame.producedUnitExperience(firstCity, client.currentGame.unitTypesById.horseman), 1.1,
    'Stable gives mounted units 10% starting XP');
assert.equal(client.currentGame.producedUnitExperience(firstCity, client.currentGame.unitTypesById.archer), 1,
    'Stable does not train archers');
assert.equal(client.currentGame.cityHealingPercent(firstCity), 20,
    'Lazaret raises per-turn city healing to 20%');
assert.equal(client.currentGame.cityRoadConnectedToAnotherCity(firstCity), true,
    'continuous roads connect owned Cities for Market food');

const menuSource = fs.readFileSync('menu_unit.js', 'utf8');
assert.ok(menuSource.indexOf('data-menu-option="city_built_buildings"')
    > menuSource.indexOf('data-menu-option="city_production_queue"'),
    'completed buildings section must be the last city action list section');

console.log('PASS City building menu, sprites, duplicate checks, healing, XP, and road connection');

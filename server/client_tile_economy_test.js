const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = {
    console,
    Coord: function Coord(i, j) { this.i = i; this.j = j; },
    _map_size: 2,
    _current_user: 0,
    _units: [],
    _units_by_user: { 0: [] },
    _map_terrain_tex: [[1, 0x81], [2, 2]],
    _map_terrain_mod: [[{}, { irrigation: true }], [{ workshop: true }, {}]],
    _map_resource: [[{ type: 0 }, { type: 0 }], [{ type: 1 }, { type: 2 }]],
    _resource_types: [null, { id: 'amber', name: 'Amber' }, { id: 'gems', name: 'Gems' }],
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('economics.js', 'utf8') + ';globalThis.economics=_economics;', context);
vm.runInContext(fs.readFileSync('city.js', 'utf8') + ';globalThis.cityEconomy=_city_economy;', context);

assert.deepEqual(JSON.parse(JSON.stringify(context.cityEconomy.tileIncomeAt(0, 0))), { food: 0, production: 1, money: 0 });
assert.equal(context.cityEconomy.tileIncomeAt(0, 1).food, 4);
assert.equal(context.cityEconomy.tileIncomeAt(1, 0).money, 1);
assert.equal(context.cityEconomy.tileIncomeAt(1, 0).production, 4);
assert.equal(context.cityEconomy.tileIncomeAt(1, 1).money, 2);
assert.equal(context.economics.resourceYield('wine', { winery: true }).money, 2);
assert.equal(context.economics.resourceYield('bananas', { plantation: true }).money, 2);
assert.equal(context.economics.maintenanceCost({ economicClass: 'terrain_improvement', improvementType: 'workshop' }), 0);
context._map_terrain_tex[0][0] = 2;
context._map_terrain_mod[0][0] = {farm: true};
context._map_resource[0][0] = {type: 1};
assert.deepEqual(JSON.parse(JSON.stringify(context.cityEconomy.tileIncomeAt(0, 0))),
    {food: 5, production: 0, money: 0}, 'Farm gives exactly five food and no gold');
context._map_terrain_tex[0][0] = 0;
context._map_terrain_mod[0][0] = {};
context._map_resource[0][0] = { type: 3 };
context._resource_types[3] = { id: 'fish', name: 'Fish' };
assert.equal(context.cityEconomy.tileIncomeAt(0, 0).food, 3, 'shallow Fish Tile gives three food');
context._map_terrain_mod[0][0] = { network: true };
assert.equal(context.cityEconomy.tileIncomeAt(0, 0).food, 5, 'Nets raise Fish and Turtles to five food');
context._map_terrain_tex[1][0] = 6;
context._map_terrain_mod[1][0] = { camp: true };
context._map_resource[1][0] = { type: 4 };
context._resource_types[4] = { id: 'deer', name: 'Deer' };
const deerCamp = context.cityEconomy.tileIncomeAt(1, 0);
assert.ok(deerCamp.food > 0 && deerCamp.production > 0 && deerCamp.money > 0,
    'Deer with Camp gives all three income types');
const nearby = context.cityEconomy.economicTileCandidates({ coord: { i: 0, j: 0 } });
assert.ok(!nearby.some(coord => coord.i == 1 && coord.j == 0),
    'an adjacent improved Tile is disconnected without a road on that Tile');
context._map_terrain_mod[1][0].road = true;
const connected = context.cityEconomy.economicTileCandidates({ coord: { i: 0, j: 0 } });
assert.ok(connected.some(coord => coord.i == 1 && coord.j == 0),
    'an adjacent improved Tile contributes after its road connects to the City');
context._map_size = 4;
context._map_terrain_tex = Array.from({length: 4}, () => Array(4).fill(2));
context._map_terrain_mod = Array.from({length: 4}, () => Array.from({length: 4}, () => ({})));
context._map_resource = Array.from({length: 4}, () => Array.from({length: 4}, () => ({type: 0})));
context._map_terrain_mod[1][1] = {road: true};
context._map_terrain_mod[1][2] = {road: true};
context._map_terrain_mod[1][3] = {pasture: true};
const roadEndpoint = context.cityEconomy.economicTileCandidates({coord: {i: 1, j: 1}});
assert.ok(roadEndpoint.some(coord => coord.i == 1 && coord.j == 3),
    'a Pasture directly beside the connected road is a workable endpoint');
const foodYield = {food: 5, production: 1, money: 0};
const productionYield = {food: 1, production: 5, money: 0};
const goldYield = {food: 1, production: 1, money: 4};
assert.ok(context.cityEconomy.tileOptimizationScore(foodYield, 'food')
    > context.cityEconomy.tileOptimizationScore(productionYield, 'food'));
assert.ok(context.cityEconomy.tileOptimizationScore(productionYield, 'production')
    > context.cityEconomy.tileOptimizationScore(foodYield, 'production'));
assert.ok(context.cityEconomy.tileOptimizationScore(goldYield, 'gold')
    > context.cityEconomy.tileOptimizationScore(foodYield, 'gold'));
assert.ok(context.cityEconomy.tileOptimizationScore({food: 3, production: 3, money: 3}, 'balanced')
    > context.cityEconomy.tileOptimizationScore({food: 0, production: 5, money: 0}, 'balanced'));
context._map_terrain_tex[1][1] = 7;
context._map_terrain_mod[1][1] = {};
context._map_resource[1][1] = {type: 0};
const accountingCity = {type: 3, team: 0, serverId: 77, coord: {i: 1, j: 1}};
context._units.push(accountingCity);
assert.equal(context.cityEconomy.tileIncomeAt(1, 1).money, 0, 'a river City center gives no gold');
context._units.push(
    {type: 4, team: 0, coord: {i: 0, j: 1}, improvementType: 'road', parentCityId: 77, health: 100},
    {type: 4, team: 0, coord: {i: 1, j: 0}, improvementType: 'fortification', parentCityId: 77, health: 100}
);
assert.deepEqual(JSON.parse(JSON.stringify(context.cityEconomy.infrastructureCosts(accountingCity))), {
    roads: 1, workshops: 0, networks: 0, fortifications: 1,
}, 'client accounting assigns one Road and one Fortification to their parent City');
console.log('PASS mirrored client tile economy rules');

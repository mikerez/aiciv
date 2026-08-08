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
assert.ok(nearby.some(coord => coord.i == 1 && coord.j == 0),
    'an adjacent Tile is workable without a road');
const foodYield = {food: 5, production: 1, money: 0};
const productionYield = {food: 1, production: 5, money: 0};
const goldYield = {food: 1, production: 1, money: 4};
assert.ok(context.cityEconomy.tileOptimizationScore(foodYield, 'food')
    > context.cityEconomy.tileOptimizationScore(productionYield, 'food'));
assert.ok(context.cityEconomy.tileOptimizationScore(productionYield, 'production')
    > context.cityEconomy.tileOptimizationScore(foodYield, 'production'));
assert.ok(context.cityEconomy.tileOptimizationScore(goldYield, 'gold')
    > context.cityEconomy.tileOptimizationScore(foodYield, 'gold'));
console.log('PASS mirrored client tile economy rules');

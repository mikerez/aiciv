const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = {
    console,
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
assert.equal(context.cityEconomy.tileIncomeAt(0, 0).food, 5, 'Network adds 50% to combined water food and rounds upward');
console.log('PASS mirrored client tile economy rules');

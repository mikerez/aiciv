#!/usr/bin/env node
'use strict';

const {assert, mapTiles, unit, city} = require('./test_client');
const {createBrowserClient, localUnit} = require('./browser_client');

const playerId = 7901;
const definitions = [
    unit({client_key: 'worker', owner_id: playerId, i: 3, j: 3}),
    city({client_key: 'city', owner_id: playerId, i: 3, j: 3}),
    unit({
        client_key: 'workshop', owner_id: playerId, unit_type_id: 'building_workshop',
        unit_class: 4, name: 'Workshop', can_move: false, i: 3, j: 3,
    }),
];
const units = definitions.map((definition, index) => localUnit(definition, index + 1));
const client = createBrowserClient({
    size: 8, playerId, gameId: 'client-selection', tiles: mapTiles(8), units,
});
client._screenZoom = 1;
let shown = null;
client._unit_stack_menu = {
    show(indices) { shown = indices.slice(); },
    hide() {},
};

assert.equal(client.control.click(0, 0, {i: 3, j: 3}, false, null), true);
assert.equal(client._selection, 1, 'a City remains the primary selectable object in a mixed stack');
assert.deepEqual(Array.from(shown).sort(), [0, 1], 'terrain improvements are omitted from the stack menu');

client._units[1].hiddenOnMap = true;
client._selection = -1;
shown = null;
assert.equal(client.control.click(0, 0, {i: 3, j: 3}, false, null), true);
assert.equal(client._selection, 0, 'the movable unit is selected instead of its improvement');
assert.equal(shown, null, 'one movable unit plus an improvement does not open a stack menu');

console.log('PASS map selection ignores terrain improvements while preserving Cities and movable units');

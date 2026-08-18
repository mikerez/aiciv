#!/usr/bin/env node
'use strict';

const {assert, mapTiles, unit, city} = require('./test_client');
const {createBrowserClient, localUnit} = require('./browser_client');

const playerId = 9000;
const definitions = [
    city({client_key: 'developed-city', owner_id: playerId, i: 5, j: 5}),
    city({client_key: 'underserved-city', owner_id: playerId, i: 17, j: 17}),
];
for (let n = 0; n < 4; n++) {
    definitions.push(unit({
        client_key: 'cluster-worker-' + n, owner_id: playerId,
        unit_type_id: 'worker', unit_class: 1, name: 'Worker',
        i: 5 + (n % 2), j: 5 + Math.floor(n / 2), state: 'automate',
        properties: {automationMode: 'automate'},
    }));
}
const client = createBrowserClient({
    size: 24,
    playerId,
    gameId: 'client-worker-city-rebalance',
    tiles: mapTiles(24),
    units: definitions.map((definition, index) => localUnit(definition, index + 1)),
});
for (let index = 2; index < client._units.length; index++) {
    client._units[index].automationMode = 'automate';
    client.currentGame.autoRouteWorker(index);
}

const underserved = client._units[1];
const developed = client._units[0];
assert.equal(client.currentGame.workerSupportCount(underserved), 2,
    'only two Workers are assigned to an unsupported City');
assert.equal(client.currentGame.workerSupportCount(developed), 2,
    'the established City retains two local Workers');
assert.equal(client._units.slice(2).filter(worker => worker.gotoCoord && worker.gotoPath.length
    && client.currentGame.hexDistance(
        worker.gotoCoord.i - underserved.coord.i, worker.gotoCoord.j - underserved.coord.j
    ) <= 5).length, 2,
    'planned destinations prevent the next Worker from duplicating support routes');

console.log('PASS automated Workers rebalance two-per-City without moving the whole cluster');

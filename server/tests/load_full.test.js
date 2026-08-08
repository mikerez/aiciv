#!/usr/bin/env node
'use strict';
const {assert, serverGame, resetDatabase, bootstrap, unit, value} = require('./test_client');

(async () => {
    resetDatabase();
    const fixture = await bootstrap({players: [7001, 7002], units: [
        unit({client_key: 'unit-1', owner_id: 7001, i: 3, j: 3}),
        unit({client_key: 'visible-enemy', owner_id: 7002, unit_type_id: 'warrior', unit_class: 2, i: 4, j: 3}),
        unit({client_key: 'hidden-enemy', owner_id: 7002, unit_type_id: 'warrior', unit_class: 2, i: 7, j: 7}),
    ]});
    const response = await serverGame.request('load_full', {player_id: fixture.playerId, include_map: true});
    assert.equal(response.request, 'load_full');
    assert.equal(response.tiles.length, 64);
    assert.ok(response.units.some(unit => unit.client_key === 'unit-1'));
    assert.ok(response.units.some(unit => unit.client_key === 'visible-enemy'));
    assert.ok(!response.units.some(unit => unit.client_key === 'hidden-enemy'));
    assert.equal(Number(value('SELECT COUNT(*) FROM server_game_map')), 64);
    assert.equal(Number(value('SELECT COUNT(*) FROM server_game_units WHERE deleted_at IS NULL')), 3);
    console.log('PASS load_full returns persisted map/state while filtering enemy units through server fog of war');
})().catch(error => { console.error(error); process.exitCode = 1; });

#!/usr/bin/env node
'use strict';
const {assert, serverGame, resetDatabase, bootstrap, city, unit, value, expectRequestError} = require('./test_client');

(async () => {
    resetDatabase();
    const fixture = await bootstrap({units: [
        city({client_key: 'capital'}),
        unit({client_key: 'warrior', unit_type_id: 'warrior', unit_class: 2}),
    ]});
    const warriorId = fixture.unitIds.warrior;
    const response = await serverGame.request('disband_unit', {
        player_id: fixture.playerId, unit_id: warriorId,
    });
    assert.equal(response.unit.state, 'disbanded');
    assert.equal(Number(value(`SELECT health FROM server_game_units WHERE id=${warriorId}`)), 0);
    assert.equal(Number(value(`SELECT deleted_at IS NOT NULL FROM server_game_units WHERE id=${warriorId}`)), 1);
    await expectRequestError('disband_unit', {
        player_id: fixture.playerId, unit_id: fixture.unitIds.capital,
    }, 'unit_cannot_be_disbanded');
    console.log('PASS disband_unit deletes movable units and protects cities/buildings');
})().catch(error => { console.error(error); process.exitCode = 1; });

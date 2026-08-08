#!/usr/bin/env node
'use strict';
const {assert, serverGame, resetDatabase, bootstrap, city, unit, value, expectRequestError} = require('./test_client');

(async () => {
    resetDatabase();
    const fixture = await bootstrap({units: [city({client_key: 'capital'}), unit({client_key: 'guard', i: 4, j: 4})]});
    const cityId = fixture.unitIds.capital;
    await serverGame.request('select_production', {
        player_id: fixture.playerId, city_unit_id: cityId, unit_type_id: 'warrior',
    });
    await serverGame.request('select_production', {
        player_id: fixture.playerId, city_unit_id: cityId, unit_type_id: 'explorer',
    });
    assert.deepEqual(JSON.parse(value(`SELECT queue_json FROM productions WHERE city_unit_id=${cityId}`)), ['warrior', 'explorer']);
    assert.equal(value(`SELECT unit_type_id FROM productions WHERE city_unit_id=${cityId}`), 'warrior');
    await expectRequestError('select_production', {
        player_id: fixture.playerId, city_unit_id: cityId, unit_type_id: 'not-a-unit',
    }, 'invalid_unit_type');
    const idle = await serverGame.request('select_production', {
        player_id: fixture.playerId, city_unit_id: cityId, unit_type_id: null,
    });
    assert.equal(Number(value(`SELECT COUNT(*) FROM productions WHERE city_unit_id=${cityId}`)), 0);
    assert.equal(idle.city.properties.productionDisabled, true);
    console.log('PASS select_production appends backlog items, rejects unknown units, and supports idle cities');
})().catch(error => { console.error(error); process.exitCode = 1; });

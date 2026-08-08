#!/usr/bin/env node
'use strict';
const {assert, serverGame, resetDatabase, bootstrap, city, unit, value, expectRequestError} = require('./test_client');

(async () => {
    resetDatabase();
    const fixture = await bootstrap({units: [
        city({client_key: 'capital', i: 3, j: 3}),
        unit({client_key: 'inside', unit_type_id: 'warrior', unit_class: 2, i: 3, j: 3, health: 35}),
        unit({client_key: 'outside', unit_type_id: 'warrior', unit_class: 2, i: 4, j: 3, health: 35}),
    ]});
    const cityId = fixture.unitIds.capital;
    const insideId = fixture.unitIds.inside;
    const outsideId = fixture.unitIds.outside;
    await expectRequestError('heal_units', {
        player_id: fixture.playerId, city_unit_id: cityId, unit_ids: [outsideId],
    }, 'unit_not_in_city');
    const response = await serverGame.request('heal_units', {
        player_id: fixture.playerId, city_unit_id: cityId, unit_ids: [insideId],
    });
    assert.equal(response.status, 'HEALED');
    assert.equal(Number(value(`SELECT health FROM server_game_units WHERE id=${insideId}`)), 45);
    const duplicate = await serverGame.request('heal_units', {
        player_id: fixture.playerId, city_unit_id: cityId, unit_ids: [insideId],
    });
    assert.equal(duplicate.status, 'ALREADY_HEALED');
    assert.equal(Number(value(`SELECT health FROM server_game_units WHERE id=${insideId}`)), 45);
    console.log('PASS heal_units heals 10%, rejects units outside the city, and runs once per turn');
})().catch(error => { console.error(error); process.exitCode = 1; });

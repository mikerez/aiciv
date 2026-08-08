#!/usr/bin/env node
'use strict';
const {assert, serverGame, resetDatabase, bootstrap, city, unit, sql, value, expectRequestError} = require('./test_client');

(async () => {
    resetDatabase();
    const fixture = await bootstrap({units: [city({client_key: 'capital'}), unit({client_key: 'guard', i: 4, j: 4})]});
    const cityId = fixture.unitIds.capital;
    const properties = {
        cityPopulation: 1, cityFoodStored: 35,
        cityProperties: {productionPerTurn: 5, productionStored: 0},
        production: null, productionDisabled: false,
    };
    sql(`UPDATE server_game_units SET properties_json='${JSON.stringify(properties)}' WHERE id=${cityId}`);
    const response = await serverGame.request('grow_city', {
        player_id: fixture.playerId, city_unit_id: cityId, food_stored: 999,
    });
    assert.equal(response.growth_cost, 30);
    const stored = JSON.parse(value(`SELECT properties_json FROM server_game_units WHERE id=${cityId}`));
    assert.equal(stored.cityPopulation, 2);
    assert.equal(stored.cityFoodStored, 5, 'server uses authoritative stored food, not the client claim');
    await expectRequestError('grow_city', {
        player_id: fixture.playerId, city_unit_id: cityId, food_stored: 1000,
    }, 'insufficient_city_food');
    await expectRequestError('grow_city', {
        player_id: fixture.playerId, city_unit_id: cityId, food_stored: -1,
    }, 'invalid_food_stored');
    assert.equal(JSON.parse(value(`SELECT properties_json FROM server_game_units WHERE id=${cityId}`)).cityPopulation, 2);
    console.log('PASS grow_city verifies capacity, authoritative food, cost subtraction, and invalid requests');
})().catch(error => { console.error(error); process.exitCode = 1; });

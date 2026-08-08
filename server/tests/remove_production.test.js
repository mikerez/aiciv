#!/usr/bin/env node
'use strict';
const {assert, serverGame, resetDatabase, bootstrap, city, unit, sql, value, expectRequestError} = require('./test_client');

(async () => {
    resetDatabase();
    const fixture = await bootstrap({units: [city({client_key: 'capital'}), unit({client_key: 'guard', i: 4, j: 4})]});
    const cityId = fixture.unitIds.capital;
    for (const unitType of ['warrior', 'explorer', 'settlers']) {
        await serverGame.request('select_production', {
            player_id: fixture.playerId, city_unit_id: cityId, unit_type_id: unitType,
        });
    }
    sql(`UPDATE productions SET production_points=7 WHERE city_unit_id=${cityId}`);
    const middle = await serverGame.request('remove_production', {
        player_id: fixture.playerId, city_unit_id: cityId, queue_index: 1,
    });
    assert.equal(middle.removed_unit_type_id, 'explorer');
    assert.deepEqual(JSON.parse(value(`SELECT queue_json FROM productions WHERE city_unit_id=${cityId}`)), ['warrior', 'settlers']);
    assert.equal(Number(value(`SELECT production_points FROM productions WHERE city_unit_id=${cityId}`)), 7);
    const first = await serverGame.request('remove_production', {
        player_id: fixture.playerId, city_unit_id: cityId, queue_index: 0,
    });
    assert.equal(first.removed_unit_type_id, 'warrior');
    assert.equal(Number(value(`SELECT production_points FROM productions WHERE city_unit_id=${cityId}`)), 0);
    await expectRequestError('remove_production', {
        player_id: fixture.playerId, city_unit_id: cityId, queue_index: 9,
    }, 'invalid_queue_index');
    console.log('PASS remove_production removes any backlog position and resets points only for the active item');
})().catch(error => { console.error(error); process.exitCode = 1; });

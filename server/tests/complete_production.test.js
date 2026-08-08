#!/usr/bin/env node
'use strict';
const {assert, serverGame, resetDatabase, bootstrap, city, unit, sql, value, expectRequestError} = require('./test_client');

(async () => {
    resetDatabase();
    const stack = [city({client_key: 'capital'})];
    for (let index = 0; index < 5; index++) {
        stack.push(unit({client_key: `stack-${index}`, unit_type_id: 'warrior', unit_class: 2}));
    }
    const fixture = await bootstrap({units: stack});
    const cityId = fixture.unitIds.capital;
    await serverGame.request('select_production', {
        player_id: fixture.playerId, city_unit_id: cityId, unit_type_id: 'warrior',
    });
    await expectRequestError('complete_production', {
        player_id: fixture.playerId, city_unit_id: cityId,
    }, 'insufficient_production_points');
    sql(`UPDATE productions SET production_points=20 WHERE city_unit_id=${cityId}`);
    const paused = await serverGame.request('complete_production', {
        player_id: fixture.playerId, city_unit_id: cityId,
    });
    assert.equal(paused.status, 'PAUSE');
    assert.equal(paused.pause_reason, 'unit_stack_full');
    sql(`UPDATE server_game_units SET deleted_at=UTC_TIMESTAMP(), health=0 WHERE game_id=(SELECT game_id FROM productions WHERE city_unit_id=${cityId}) AND unit_class<>3`);
    const response = await serverGame.request('complete_production', {
        player_id: fixture.playerId, city_unit_id: cityId,
    });
    assert.equal(response.unit.unit_type_id, 'warrior');
    assert.equal(response.unit.health, 100);
    assert.equal(response.unit.experience, 1);
    assert.equal(Number(value(`SELECT COUNT(*) FROM productions WHERE city_unit_id=${cityId}`)), 0);
    assert.equal(Number(value(`SELECT COUNT(*) FROM server_game_units WHERE owner_id=${fixture.playerId} AND unit_type_id='warrior' AND deleted_at IS NULL`)), 1);
    console.log('PASS complete_production enforces points and stack limits, then persists a correctly initialized unit');
})().catch(error => { console.error(error); process.exitCode = 1; });

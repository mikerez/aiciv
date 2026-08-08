#!/usr/bin/env node
'use strict';
const {assert, serverGame, pipeExchange, resetDatabase, bootstrap, expectRequestError} = require('./test_client');

(async () => {
    resetDatabase();
    const fixture = await bootstrap();
    const forbidden = pipeExchange({
        action: 'load_full', secret: 'wrong-secret', game_id: fixture.gameId, player_id: fixture.playerId,
    });
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body.error.code, 'application_not_allowed');
    await expectRequestError('not_a_request', {player_id: fixture.playerId}, 'unknown_action');
    await expectRequestError('build', {
        player_id: fixture.playerId, worker_unit_id: fixture.unitIds['unit-1'], building_type: 'unknown',
    }, 'invalid_building_type');
    console.log('PASS request validation rejects invalid secrets, action names, and command payloads');
})().catch(error => { console.error(error); process.exitCode = 1; });

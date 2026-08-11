#!/usr/bin/env node
'use strict';
const {assert, serverGame, resetDatabase, bootstrap, value, expectRequestError} = require('./test_client');

(async () => {
    resetDatabase();
    const fixture = await bootstrap();
    await expectRequestError('reset_game', {player_id: fixture.playerId, confirm: 'wrong'}, 'reset_confirmation_required');
    global._map_size = 100;
    const response = await serverGame.request('reset_game', {player_id: fixture.playerId, confirm: 'RESET'});
    assert.equal(response.turn, 0);
    assert.equal(response.map_size, 300);
    assert.equal(Number(value('SELECT COUNT(*) FROM server_games')), 1);
    assert.equal(Number(value('SELECT COUNT(*) FROM server_game_map')), 90000);
    assert.equal(Number(value('SELECT COUNT(*) FROM server_game_orders')), 0);
    assert.equal(Number(value('SELECT COUNT(*) FROM server_game_events')), 0);
    assert.equal(Number(value('SELECT COUNT(*) FROM server_game_submissions')), 0);
    console.log('PASS reset_game requires confirmation and recreates a clean 300x300 world without gameplay history');
})().catch(error => { console.error(error); process.exitCode = 1; });

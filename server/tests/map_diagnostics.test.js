#!/usr/bin/env node
'use strict';
const {assert, serverGame, resetDatabase, bootstrap} = require('./test_client');

(async () => {
    resetDatabase();
    const fixture = await bootstrap();
    const response = await serverGame.request('map_diagnostics', {player_id: fixture.playerId});
    assert.equal(response.diagnostics.stored_tiles, 64);
    assert.equal(response.diagnostics.map_size, 8);
    assert.ok(response.diagnostics.terrain_type_counts['2'] >= 1);
    console.log('PASS map_diagnostics executes against the test database and reports stored map quality');
})().catch(error => { console.error(error); process.exitCode = 1; });

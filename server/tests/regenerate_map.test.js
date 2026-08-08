#!/usr/bin/env node
'use strict';
const {assert, serverGame, resetDatabase, bootstrap, unit, value, gameDatabaseId} = require('./test_client');

(async () => {
    resetDatabase();
    const fixture = await bootstrap({size: 20, units: [unit({client_key: 'worker'})]});
    const gameDbId = gameDatabaseId(fixture.gameId);
    const response = await serverGame.request('regenerate_map', {player_id: fixture.playerId});
    assert.equal(response.regenerated, true);
    assert.equal(response.diagnostics.stored_tiles, 400);
    assert.equal(Number(value(`SELECT COUNT(*) FROM server_game_map WHERE game_id=${gameDbId}`)), 400);
    assert.equal(Number(value(`SELECT COUNT(*) FROM server_game_units WHERE game_id=${gameDbId} AND deleted_at IS NULL`)), 1);
    assert.ok(Number(value(`SELECT (terrain_tex & 15) FROM server_game_map m JOIN server_game_units u ON u.game_id=m.game_id AND u.i=m.i AND u.j=m.j WHERE u.id=${fixture.unitIds.worker}`)) > 0,
        'preserved units are repositioned onto land');
    console.log('PASS regenerate_map replaces only terrain and repositions preserved units on the regenerated world');
})().catch(error => { console.error(error); process.exitCode = 1; });

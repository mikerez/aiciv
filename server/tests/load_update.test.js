#!/usr/bin/env node
'use strict';
const {assert, serverGame, resetDatabase, bootstrap, sql} = require('./test_client');

(async () => {
    resetDatabase();
    const fixture = await bootstrap();
    sql("UPDATE server_game_units SET health=73, revision=20 WHERE client_key='unit-1'; UPDATE server_game_map SET terrain_tex=4, revision=20 WHERE i=2 AND j=2; UPDATE server_games SET revision=20;");
    const response = await serverGame.request('load_update', {
        player_id: fixture.playerId, since_unit_revision: 1, since_landscape_revision: 1, since_event_id: 0,
    });
    assert.equal(response.request, 'load_update');
    assert.ok(response.units.some(unit => unit.client_key === 'unit-1' && unit.health === 73));
    assert.ok(response.tiles.some(tile => tile.i === 2 && tile.j === 2 && (tile.terrain_tex & 15) === 4));
    console.log('PASS load_update combines authoritative unit, landscape, visibility, event, and economy deltas');
})().catch(error => { console.error(error); process.exitCode = 1; });

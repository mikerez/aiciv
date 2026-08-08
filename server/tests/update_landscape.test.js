#!/usr/bin/env node
'use strict';
const {assert, serverGame, resetDatabase, bootstrap, unit, sql} = require('./test_client');

(async () => {
    resetDatabase();
    const fixture = await bootstrap({units: [unit({
        client_key: 'unit-1', unit_type_id: 'explorer', name: 'Explorer', i: 3, j: 3,
    })]});
    sql("UPDATE server_game_map SET terrain_tex=133, resource_type=34, modifiers_json='{\"road\":true}', revision=31 WHERE i=3 AND j=3; UPDATE server_games SET revision=31;");
    const response = await serverGame.request('update_landscape', {player_id: fixture.playerId, since_revision: 2});
    const tile = response.tiles.find(tile => tile.i === 3 && tile.j === 3);
    assert.equal(tile.terrain_tex, 133);
    assert.equal(tile.resource_type, 34);
    assert.equal(tile.modifiers.road, true);
    console.log('PASS update_landscape returns persisted terrain, resource, and modifier revisions');
})().catch(error => { console.error(error); process.exitCode = 1; });

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
    assert.equal(Number(value(`SELECT COUNT(*) FROM server_game_units WHERE game_id=${gameDbId} AND owner_id=${fixture.playerId} AND deleted_at IS NULL`)), 1);
    const globalAiId = Number(value("SELECT id FROM game_users WHERE login='aiciv_global_ai'"));
    const guardedResources = Number(value(`SELECT COUNT(*) FROM server_game_map WHERE game_id=${gameDbId} AND resource_type IN (3,15,34,35,36)`));
    assert.equal(Number(value(`SELECT COUNT(*) FROM server_game_units WHERE game_id=${gameDbId} AND owner_id=${globalAiId} AND unit_type_id='settlers'`)), guardedResources * 5);
    assert.equal(Number(value(`SELECT COUNT(*) FROM server_game_units WHERE game_id=${gameDbId} AND owner_id=${globalAiId} AND unit_type_id='explorer'`)), guardedResources * 5);
    assert.equal(Number(value(`SELECT COUNT(*) FROM server_game_units WHERE game_id=${gameDbId} AND owner_id=${globalAiId} AND unit_type_id='archer'`)), guardedResources * 10);
    assert.equal(Number(value(`SELECT COUNT(*) FROM server_game_units WHERE game_id=${gameDbId} AND owner_id=${globalAiId} AND unit_type_id='worker'`)), guardedResources);
    assert.ok(Number(value(`SELECT COALESCE(MAX(unit_count),0) FROM (SELECT COUNT(*) unit_count FROM server_game_units WHERE game_id=${gameDbId} AND can_move=1 AND deleted_at IS NULL GROUP BY i,j) stacks`)) <= 5,
        'resource guards respect the five-unit Tile limit');
    assert.ok(Number(value(`SELECT (terrain_tex & 15) FROM server_game_map m JOIN server_game_units u ON u.game_id=m.game_id AND u.i=m.i AND u.j=m.j WHERE u.id=${fixture.unitIds.worker}`)) > 0,
        'preserved units are repositioned onto land');
    assert.ok(Number(value(`SELECT COUNT(*) FROM server_game_map WHERE game_id=${gameDbId} AND resource_type=33`)) >= 6,
        'generated worlds enforce a playable Horses minimum');
    console.log('PASS regenerate_map replaces only terrain and repositions preserved units on the regenerated world');
})().catch(error => { console.error(error); process.exitCode = 1; });

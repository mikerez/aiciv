#!/usr/bin/env node
'use strict';

const {
    assert, serverGame, resetDatabase, bootstrap, mapTiles, unit, value, gameDatabaseId,
} = require('./test_client');

(async () => {
    resetDatabase();
    const size = 24;
    const tiles = mapTiles(size, 4);
    for (const tile of tiles) {
        tile.terrain_tex = (tile.i + tile.j) % 3 === 0 ? 5 : ((tile.i + tile.j) % 3 === 1 ? 4 : 1);
    }
    const fixture = await bootstrap({
        gameId: 'hotfix-strategic-resources', size, tiles,
        units: [unit({client_key: 'human-worker', i: 12, j: 12})],
    });
    const gameDbId = gameDatabaseId(fixture.gameId);
    const first = await serverGame.request('hotfix_strategic_resources', {
        player_id: fixture.playerId, confirm: 'HOTFIX_STRATEGIC_RESOURCES',
    });
    assert.equal(first.new_resources.length, 10);
    assert.equal(first.new_guard_units, 210);
    assert.equal(first.automated_workers, 10);
    assert.equal(first.ai_food, 100000000);
    assert.equal(first.ai_gold, 100000000);
    for (const resourceType of [3, 15, 34, 35, 36]) {
        assert.equal(Number(value(
            `SELECT COUNT(*) FROM server_game_map WHERE game_id=${gameDbId}
             AND resource_type=${resourceType}
             AND JSON_EXTRACT(modifiers_json,'$.strategic_hotfix_20260812')=${resourceType}`
        )), 2, `resource ${resourceType} must receive two hotfix deposits`);
    }
    const aiId = Number(first.ai_player_id);
    assert.equal(Number(value(
        `SELECT COUNT(*) FROM server_game_units WHERE game_id=${gameDbId} AND owner_id=${aiId}
         AND unit_type_id='worker' AND state='automate' AND deleted_at IS NULL
         AND JSON_UNQUOTE(JSON_EXTRACT(properties_json,'$.automationMode'))='automate'`
    )), 10, 'all hotfix AI Workers must persist in Automate mode');
    assert.ok(Number(value(
        `SELECT COALESCE(MAX(unit_count),0) FROM (
           SELECT COUNT(*) unit_count FROM server_game_units WHERE game_id=${gameDbId}
           AND deleted_at IS NULL AND can_move=1 GROUP BY i,j
         ) stacks`
    )) <= 5, 'hotfix guards must respect the Tile stack limit');

    const second = await serverGame.request('hotfix_strategic_resources', {
        player_id: fixture.playerId, confirm: 'HOTFIX_STRATEGIC_RESOURCES',
    });
    assert.equal(second.new_resources.length, 0);
    assert.equal(second.new_guard_units, 0);
    assert.equal(Number(value(
        `SELECT COUNT(*) FROM server_game_units WHERE game_id=${gameDbId} AND owner_id=${aiId}
         AND deleted_at IS NULL`
    )), 210, 'repeating the hotfix must not duplicate guards');
    console.log('PASS strategic-resource hotfix is funded, guarded, automated, and idempotent');
})().catch(error => { console.error(error); process.exitCode = 1; });

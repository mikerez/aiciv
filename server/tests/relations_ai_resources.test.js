#!/usr/bin/env node
'use strict';
const {assert, serverGame, resetDatabase, bootstrap, mapTiles, unit, city, value} = require('./test_client');

(async () => {
    resetDatabase();
    const tiles = mapTiles(8);
    tiles.find(tile => tile.i === 4 && tile.j === 4).resource_type = 34;
    const fixture = await bootstrap({
        gameId: 'test-relations-ai-resources', players: [7001, 7002], tiles,
        units: [
            unit({client_key: 'human-unit', owner_id: 7001, i: 1, j: 1}),
            city({client_key: 'resource-city', owner_id: 7002, i: 4, j: 3}),
        ],
    });

    await serverGame.request('make_turn', {
        player_id: 7002, turn: fixture.result.turn, commands: [], actions: [], player_state: {}, relations: {},
    });
    const aiId = Number(value("SELECT id FROM game_users WHERE login='aiciv_global_ai'"));
    assert(aiId > 0);
    assert.equal(value(`SELECT relation_status FROM server_game_relations
        WHERE player_a=LEAST(${aiId},7002) AND player_b=GREATEST(${aiId},7002)`), 'war');
    assert.equal(Number(value("SELECT COUNT(*) FROM server_game_events WHERE event_type='ai_resource_war'")), 2,
        'AI resource-defense war is reported to both civilizations');

    const first = await serverGame.request('make_turn', {
        player_id: 7001, turn: 1, commands: [], actions: [], player_state: {}, relations: {7002: 'friend'},
    });
    assert.equal(first.resolved_turn, null);
    await serverGame.request('make_turn', {
        player_id: 7002, turn: 1, commands: [], actions: [], player_state: {}, relations: {},
    });
    assert.equal(value(`SELECT player_a_status FROM server_game_relations WHERE player_a=7001 AND player_b=7002`),
        'friend');
    assert.equal(Number(value("SELECT COUNT(*) FROM server_game_events WHERE event_type='relation_changed' "
        + "AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.source_player_id'))='7001'")), 2,
        'the relation update is reported to both interested players');

    console.log('PASS directional relations emit events and global AI defends strategic resources');
})().catch(error => { console.error(error); process.exitCode = 1; });

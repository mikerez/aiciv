#!/usr/bin/env node
'use strict';
const {assert, serverGame, resetDatabase, bootstrap, value, rows, expectRequestError} = require('./test_client');

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
    const strategicCounts = Object.fromEntries(rows(
        `SELECT resource_type,COUNT(*) FROM server_game_map m JOIN server_games g ON g.id=m.game_id
         WHERE resource_type IN (3,15,34,35,36)
           AND i+j >= g.map_size/2 AND i+j < g.map_size*1.5
           AND CAST(i AS SIGNED)-CAST(j AS SIGNED) >= -CAST(g.map_size AS SIGNED)/2
           AND CAST(i AS SIGNED)-CAST(j AS SIGNED) < CAST(g.map_size AS SIGNED)/2
         GROUP BY resource_type`
    ).map(([type, count]) => [Number(type), Number(count)]));
    for (const resourceType of [3, 15, 34, 35, 36]) {
        assert.ok((strategicCounts[resourceType] || 0) >= 10,
            `new 300x300 maps require at least ten playable deposits of strategic resource ${resourceType}`);
    }
    const guardedDeposits = Number(value(
        `SELECT COUNT(*) FROM server_game_map m JOIN server_games g ON g.id=m.game_id
         WHERE resource_type IN (3,15,34,35,36)
           AND i+j >= g.map_size/2 AND i+j < g.map_size*1.5
           AND CAST(i AS SIGNED)-CAST(j AS SIGNED) >= -CAST(g.map_size AS SIGNED)/2
           AND CAST(i AS SIGNED)-CAST(j AS SIGNED) < CAST(g.map_size AS SIGNED)/2`
    ));
    const aiId = Number(value("SELECT id FROM game_users WHERE login='aiciv_global_ai'"));
    assert.equal(Number(value(
        `SELECT COUNT(*) FROM server_game_units WHERE owner_id=${aiId} AND unit_type_id='archer' AND deleted_at IS NULL`
    )), guardedDeposits * 10, 'every generated protected deposit receives ten AI archers');
    assert.equal(Number(value(
        `SELECT COUNT(*) FROM server_game_units WHERE owner_id=${aiId} AND unit_type_id='explorer' AND deleted_at IS NULL`
    )), guardedDeposits * 5, 'every generated protected deposit receives five AI explorers');
    const aiFood = Number(value(`SELECT JSON_EXTRACT(state_json,'$.food') FROM server_game_players WHERE player_id=${aiId}`));
    const aiUnits = Number(value(`SELECT COUNT(*) FROM server_game_units WHERE owner_id=${aiId} AND deleted_at IS NULL`));
    assert.ok(aiFood >= aiUnits * 5000, 'generated AI guards receive persistent food reserves');
    console.log('PASS reset_game requires confirmation and recreates a clean 300x300 world without gameplay history');
})().catch(error => { console.error(error); process.exitCode = 1; });

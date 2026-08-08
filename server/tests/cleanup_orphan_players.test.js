#!/usr/bin/env node
'use strict';
const {assert, serverGame, resetDatabase, bootstrap, unit, sql, value, gameDatabaseId} = require('./test_client');

(async () => {
    resetDatabase();
    const fixture = await bootstrap({players: [7001, 7002], units: [
        unit({client_key: 'kept', owner_id: 7001}),
        unit({client_key: 'orphan', owner_id: 7002, i: 4}),
    ]});
    const gameDbId = gameDatabaseId(fixture.gameId);
    sql("INSERT INTO game_users (login,password_hash,status,user_type) VALUES ('integration_human','unused','active','human')");
    const accountId = Number(value("SELECT id FROM game_users WHERE login='integration_human'"));
    sql(`UPDATE server_game_players SET account_user_id=${accountId} WHERE game_id=${gameDbId} AND player_id=7001`);
    const preview = await serverGame.request('cleanup_orphan_players', {player_id: 7001});
    assert.equal(preview.removed, false);
    assert.deepEqual(preview.orphan_players.map(player => player.player_id), [7002]);
    assert.equal(Number(value(`SELECT COUNT(*) FROM server_game_players WHERE game_id=${gameDbId}`)), 2);
    const response = await serverGame.request('cleanup_orphan_players', {
        player_id: 7001, confirm: 'REMOVE_ORPHANS',
    });
    assert.equal(response.removed, true);
    assert.equal(Number(value(`SELECT COUNT(*) FROM server_game_players WHERE game_id=${gameDbId} AND player_id=7002`)), 0);
    assert.equal(Number(value(`SELECT COUNT(*) FROM server_game_units WHERE game_id=${gameDbId} AND owner_id=7002`)), 0);
    assert.equal(Number(value(`SELECT COUNT(*) FROM server_game_players WHERE game_id=${gameDbId} AND player_id=7001`)), 1);
    console.log('PASS cleanup_orphan_players previews and removes only unregistered/test owners and their rows');
})().catch(error => { console.error(error); process.exitCode = 1; });

#!/usr/bin/env node
'use strict';

const {assert, serverGame, resetDatabase, bootstrap, mapTiles, unit, sql, value} = require('./test_client');

(async () => {
    resetDatabase();
    sql("INSERT INTO game_users (id,login,email,password_hash,status,user_type,online,last_online_at,parent_id) "
        + "VALUES (9000,'aiciv_global_ai',NULL,'test','active','ai',1,UTC_TIMESTAMP(),NULL)");
    const fixture = await bootstrap({
        playerId: 7001, players: [7001, 9000], size: 12, tiles: mapTiles(12, 2),
        units: [unit({
            client_key:'advance-warrior', owner_id:9000, unit_type_id:'warrior',
            unit_class:2, name:'Warrior', i:4, j:4,
        })],
    });
    sql('UPDATE server_game_players SET account_user_id=9000 WHERE player_id=9000');
    sql("UPDATE server_games SET turn_number=40, turn_started_at=UTC_TIMESTAMP(), "
        + "turn_deadline_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 60 SECOND)");

    const early = await serverGame.request('advance_ai_turn', {player_id:0});
    assert.equal(early.resolved_turn, null, 'the contributor cannot resolve a live turn early');
    assert.equal(early.turn, 40);

    const unitId = Number(value("SELECT id FROM server_game_units WHERE client_key='advance-warrior'"));
    const gameKey = fixture.gameId.replaceAll("'", "''");
    sql(`INSERT INTO server_game_orders
        (game_id,turn_number,player_id,unit_id,command_name,path_json,payload_json,submitted_at)
        SELECT id,40,9000,${unitId},'move','[{"i":5,"j":5}]','{}',UTC_TIMESTAMP()
        FROM server_games WHERE game_key='${gameKey}'`);
    sql("UPDATE server_games SET turn_deadline_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) "
        + `WHERE game_key='${gameKey}'`);

    const expired = await serverGame.request('advance_ai_turn', {player_id:0});
    assert.equal(expired.resolved_turn, 40, 'the contributor resolves the expired turn');
    assert.equal(expired.turn, 41, 'the authoritative turn advances exactly once');
    assert.equal(Number(value(`SELECT i FROM server_game_units WHERE id=${unitId}`)), 5,
        'normal authoritative movement is applied during contributor resolution');
    assert.equal(Number(value(`SELECT j FROM server_game_units WHERE id=${unitId}`)), 5);

    const duplicate = await serverGame.request('advance_ai_turn', {player_id:0});
    assert.equal(duplicate.resolved_turn, null, 'a repeated contributor poll does not resolve twice');
    assert.equal(duplicate.turn, 41);
    console.log('PASS standalone AI advances expired turns through the authoritative resolver');
})().catch(error => { console.error(error); process.exitCode = 1; });

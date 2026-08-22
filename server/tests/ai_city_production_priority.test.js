#!/usr/bin/env node
'use strict';

const {
    assert, serverGame, resetDatabase, bootstrap, mapTiles, city, unit, sql, value, gameDatabaseId,
} = require('./test_client');

(async () => {
    resetDatabase();
    sql("INSERT INTO game_users (id,login,email,password_hash,status,user_type,online,last_online_at,parent_id) "
        + "VALUES (9000,'aiciv_global_ai',NULL,'test','active','ai',1,UTC_TIMESTAMP(),NULL)");
    const units = [city({
        client_key:'ready-production-city', owner_id:9000, i:5, j:5,
        properties:{cityPopulation:2, cityFoodStored:0, aiLastServedTurn:99},
    })];
    for (let n=0; n<16; n++) units.push(unit({
        client_key:'overdue-warrior-'+n, owner_id:9000, unit_type_id:'warrior',
        unit_class:2, name:'Warrior', i:1+n%4, j:1+Math.floor(n/4),
        properties:{aiLastServedTurn:0},
    }));
    const fixture = await bootstrap({
        playerId:7001, players:[7001,9000], size:12, tiles:mapTiles(12,2), units,
    });
    sql('UPDATE server_game_players SET account_user_id=9000 WHERE player_id=9000');
    sql("UPDATE server_games SET turn_number=100,turn_started_at=UTC_TIMESTAMP(),"
        + "turn_deadline_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 60 SECOND)");
    const gameId = gameDatabaseId(fixture.gameId);
    const cityId = Number(value(
        "SELECT id FROM server_game_units WHERE client_key='ready-production-city'"
    ));
    sql(`INSERT INTO productions
        (game_id,city_unit_id,player_id,unit_type_id,production_points,production_cost,queue_json,selected_at)
        VALUES (${gameId},${cityId},9000,'settlers',20,20,'["settlers"]',UTC_TIMESTAMP())`);

    const batch = await serverGame.request('claim_ai_batch', {
        player_id:0, client_key:'node-production-priority', include_snapshot:true,
    });
    assert.deepEqual(batch.unit_ids, [cityId],
        'fully funded City production outranks overdue routine military units');
    await serverGame.request('submit_ai_batch', {
        player_id:0, client_key:'node-production-priority', lease_token:batch.lease_token,
        turn:batch.turn, leased_unit_ids:batch.unit_ids,
        commands:[{unit_id:cityId, command:'produce', path:[], payload:{}}], actions:[],
    });
    sql(`UPDATE server_games SET turn_deadline_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND)
        WHERE id=${gameId}`);
    const resolution = await serverGame.request('advance_ai_turn', {player_id:0});
    assert.equal(resolution.resolved_turn, 100);
    assert.equal(Number(value("SELECT COUNT(*) FROM server_game_units WHERE game_id=" + gameId
        + " AND owner_id=9000 AND unit_type_id='settlers' AND deleted_at IS NULL AND health>0")), 1,
    'authoritative turn resolution creates the fully funded Settler');
    console.log('PASS production-ready Barbarian Cities complete before routine army scheduling');
})().catch(error => { console.error(error); process.exitCode = 1; });

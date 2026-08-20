#!/usr/bin/env node
'use strict';

const {
    assert, serverGame, resetDatabase, bootstrap, mapTiles, unit, city, sql, value,
} = require('./test_client');

(async () => {
    resetDatabase();
    sql("INSERT INTO game_users (id,login,email,password_hash,status,user_type,online,last_online_at,parent_id) "
        + "VALUES (9000,'aiciv_global_ai',NULL,'test','active','ai',1,UTC_TIMESTAMP(),NULL)");
    const units = [
        city({client_key: 'barbarian-capital', owner_id: 9000, i: 1, j: 1}),
        unit({
            client_key: 'barbarian-recapturer', owner_id: 9000,
            unit_type_id: 'warrior', unit_class: 2, name: 'Warrior',
            i: 5, j: 6, state: 'fortified', properties: {aiLastServedTurn: 999},
        }),
        city({client_key: 'empty-enemy-city', owner_id: 7002, i: 5, j: 5}),
        unit({
            client_key: 'barbarian-adjacent-fighter', owner_id: 9000,
            unit_type_id: 'warrior', unit_class: 2, name: 'Warrior',
            i: 8, j: 8, state: 'patrol', properties: {aiLastServedTurn: 999, automationMode: 'patrol'},
        }),
        unit({
            client_key: 'visible-enemy-fighter', owner_id: 7002,
            unit_type_id: 'warrior', unit_class: 2, name: 'Warrior', i: 9, j: 8,
        }),
    ];
    for (let n = 0; n < 12; n++) {
        units.push(unit({
            client_key: 'overdue-worker-' + n, owner_id: 9000,
            unit_type_id: 'worker', unit_class: 1, name: 'Worker',
            i: 2 + n % 4, j: 2 + Math.floor(n / 4), state: 'automate',
            properties: {aiLastServedTurn: 1},
        }));
    }
    const fixture = await bootstrap({
        playerId: 7001, players: [7001, 7002, 9000], units,
        tiles: mapTiles(10), size: 10,
    });
    sql('UPDATE server_game_players SET account_user_id=9000 WHERE player_id=9000');
    sql("UPDATE server_games SET turn_number=1000, turn_started_at=UTC_TIMESTAMP(), "
        + "turn_deadline_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 60 SECOND)");
    const gameId = Number(value("SELECT id FROM server_games WHERE game_key='"
        + fixture.gameId.replaceAll("'", "''") + "'"));
    const warriorId = Number(value("SELECT id FROM server_game_units WHERE client_key='barbarian-recapturer'"));
    const adjacentFighterId = Number(value(
        "SELECT id FROM server_game_units WHERE client_key='barbarian-adjacent-fighter'"
    ));
    sql(`INSERT INTO server_game_relations
        (game_id,player_a,player_b,relation_status,player_a_status,player_b_status,revision)
        VALUES (${gameId},9000,7002,'war','enemy','enemy',1)`);
    sql(`INSERT INTO server_game_visibility
        (game_id,player_id,i,j,visibility_level,resource_visible,revision)
        VALUES (${gameId},9000,5,5,2,0,1)
        ON DUPLICATE KEY UPDATE visibility_level=2,revision=revision+1`);
    sql(`INSERT INTO server_game_visibility
        (game_id,player_id,i,j,visibility_level,resource_visible,revision)
        VALUES (${gameId},9000,9,8,2,0,1)
        ON DUPLICATE KEY UPDATE visibility_level=2,revision=revision+1`);

    const batch = await serverGame.request('claim_ai_batch', {
        player_id: 7001, client_key: 'node-capture-priority', include_snapshot: false,
    });
    assert.ok(batch.unit_ids.includes(warriorId),
        'a Warrior adjacent to a visible empty enemy City must be leased before routine overdue work');
    assert.ok(batch.unit_ids.includes(adjacentFighterId),
        'a military unit adjacent to any visible wartime enemy must share the urgent combat lease');
    console.log('PASS global AI scheduler immediately leases adjacent Barbarian combat units');
})().catch(error => { console.error(error); process.exitCode = 1; });

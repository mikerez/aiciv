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
            client_key: 'mature-expansion-settler', owner_id: 9000,
            unit_type_id: 'settlers', unit_class: 0, name: 'Settlers', i: 8, j: 8,
            properties: {aiSettlerTurns: 20, aiLastServedTurn: 999},
        }),
    ];
    for (let n = 0; n < 12; n++) {
        units.push(unit({
            client_key: 'active-worker-' + n, owner_id: 9000,
            unit_type_id: 'worker', unit_class: 1, name: 'Worker',
            i: 2 + n % 4, j: 3 + Math.floor(n / 4), state: 'mine',
            properties: {
                aiLastServedTurn: 1,
                automationMode: 'automate',
                clientImprovementTurnsLeft: 2,
                clientImprovementState: 'mine',
                sharedAiTask: {kind: 'worker', mode: 'automate', action: 'mine', turns_left: 2},
            },
        }));
    }
    await bootstrap({
        playerId: 7001, players: [7001, 9000], units,
        tiles: mapTiles(12), size: 12,
    });
    sql('UPDATE server_game_players SET account_user_id=9000 WHERE player_id=9000');
    sql("UPDATE server_game_players SET state_json=JSON_OBJECT('aiSettlerAgeMigration20260812',true) "
        + 'WHERE player_id=9000');
    sql("UPDATE server_games SET turn_number=1000, turn_started_at=UTC_TIMESTAMP(), "
        + "turn_deadline_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 60 SECOND)");

    const settlerId = Number(value(
        "SELECT id FROM server_game_units WHERE client_key='mature-expansion-settler'"
    ));
    const batch = await serverGame.request('claim_ai_batch', {
        player_id: 7001, client_key: 'node-settler-expansion', include_snapshot: true,
    });
    assert.deepEqual(batch.unit_ids, [settlerId],
        'a mature Settler must receive an atomic lease before routine Worker projects');
    const submitted = await serverGame.request('submit_ai_batch', {
        player_id: 7001,
        client_key: 'node-settler-expansion',
        lease_token: batch.lease_token,
        turn: batch.turn,
        leased_unit_ids: batch.unit_ids,
        commands: [{unit_id: settlerId, command: 'hold', path: [], payload: {}}],
        actions: [{type: 'build_city', settler_unit_id: settlerId}],
    });
    assert.equal(submitted.accepted, true);
    assert.equal(Number(value(
        'SELECT COUNT(*) FROM server_game_units WHERE owner_id=9000 AND unit_class=3 '
        + 'AND deleted_at IS NULL AND health>0'
    )), 2, 'the prioritized Settler can found the next authoritative City');
    console.log('PASS mature Barbarian Settlers expand before the routine Worker queue');
})().catch(error => { console.error(error); process.exitCode = 1; });

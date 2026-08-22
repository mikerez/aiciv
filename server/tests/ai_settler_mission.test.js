#!/usr/bin/env node
'use strict';

const {
    assert, serverGame, resetDatabase, bootstrap, mapTiles, unit, city, sql, value,
} = require('./test_client');
const {BrowserAiRuntime} = require('../../ai_player/ai_player');

(async () => {
    resetDatabase();
    sql("INSERT INTO game_users (id,login,email,password_hash,status,user_type,online,last_online_at,parent_id) "
        + "VALUES (9000,'aiciv_global_ai',NULL,'test','active','ai',1,UTC_TIMESTAMP(),NULL)");
    await bootstrap({
        playerId: 7001,
        players: [7001, 9000],
        size: 20,
        tiles: mapTiles(20, 2),
        units: [
            city({
                client_key: 'mission-capital', owner_id: 9000, i: 1, j: 1,
                properties: {aiLastServedTurn: 999},
            }),
            unit({
                client_key: 'mission-settler', owner_id: 9000,
                unit_type_id: 'settlers', unit_class: 0, name: 'Settlers',
                i: 5, j: 5, properties: {
                    aiSettlerTurns: 20,
                    aiLastServedTurn: 0,
                    sharedAiTask: {
                        kind: 'settler', mode: 'settle', target: {i: 5, j: 8},
                    },
                },
            }),
        ],
    });
    sql('UPDATE server_game_players SET account_user_id=9000 WHERE player_id=9000');
    sql("UPDATE server_game_players SET state_json=JSON_OBJECT('aiSettlerAgeMigration20260812',true) "
        + 'WHERE player_id=9000');
    sql("UPDATE server_games SET turn_number=100, turn_started_at=UTC_TIMESTAMP(), "
        + "turn_deadline_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 60 SECOND)");
    const settlerId = Number(value(
        "SELECT id FROM server_game_units WHERE client_key='mission-settler'"
    ));
    const native = {infer() { throw new Error('Settler policy must not invoke a neural model.'); }};
    let founded = false;

    for (let step = 0; step < 7 && !founded; step++) {
        const turn = Number(value('SELECT turn_number FROM server_games'));
        sql(`UPDATE server_game_units SET properties_json=JSON_SET(properties_json,
            '$.aiLastServedTurn',${turn - 20}) WHERE id=${settlerId}`);
        const batch = await serverGame.request('claim_ai_batch', {
            player_id: 7001,
            client_key: 'node-settler-mission-' + step,
            include_snapshot: true,
        });
        assert.equal(batch.unit_ids.includes(settlerId), true,
            'the mature mission Settler remains eligible on every simulated lease');

        // Construct a fresh runtime every turn. This is the important boundary:
        // no JS route survives, only the destination returned by PHP does.
        const runtime = new BrowserAiRuntime(batch.snapshot, batch.ai_player_id, 'test', native, () => {});
        runtime.activateSnapshot(batch.ai_player_id, batch.snapshot);
        const loaded = runtime.context.serverGame.findUnit(9000, settlerId, null).unit;
        loaded.serverActionPending = true;
        runtime.activateSnapshot(batch.ai_player_id, batch.snapshot);
        assert.equal(loaded.serverActionPending, false,
            'an authoritative headless snapshot clears a stale request-owned pending flag');

        const submission = await runtime.prepareUnit(
            batch.ai_player_id, batch.snapshot, settlerId, null, true
        );
        const command = submission.commands[0];
        assert.ok(command, 'the mission produces an atomic Settler command');
        const buildCity = submission.actions.some(action => action.type === 'build_city');
        if (!buildCity) {
            assert.equal(command.command, 'move');
            assert.deepEqual(JSON.parse(JSON.stringify(command.payload.shared_ai_task)), {
                kind: 'settler', mode: 'settle', target: {i: 5, j: 8},
            }, 'every stateless lease returns the same world destination');
        }

        await serverGame.request('submit_ai_batch', {
            player_id: 7001,
            client_key: 'node-settler-mission-' + step,
            lease_token: batch.lease_token,
            turn: batch.turn,
            leased_unit_ids: batch.unit_ids,
            commands: submission.commands,
            actions: submission.actions,
        });
        founded = buildCity;
        if (founded) break;

        sql('UPDATE server_games SET turn_deadline_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND)');
        await serverGame.request('make_turn', {
            player_id: 7001,
            turn: batch.turn,
            commands: [], actions: [], player_state: {}, relations: {},
        });
        assert.deepEqual(JSON.parse(value(
            `SELECT JSON_EXTRACT(properties_json,'$.sharedAiTask')
             FROM server_game_units WHERE id=${settlerId}`
        )), {
            kind: 'settler', mode: 'settle', target: {i: 5, j: 8},
        }, 'PHP persists the destination but no route');
    }

    assert.equal(founded, true, 'the stateless contributor founds the mission City within seven turns');
    assert.equal(Number(value(
        'SELECT COUNT(*) FROM server_game_units WHERE owner_id=9000 AND unit_class=3 '
        + 'AND deleted_at IS NULL AND health>0'
    )), 2, 'the completed Settler mission creates a second authoritative City');
    console.log('PASS a stateless shared-AI Settler follows one destination and founds a City');
})().catch(error => { console.error(error); process.exitCode = 1; });

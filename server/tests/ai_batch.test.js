#!/usr/bin/env node
'use strict';

const {assert, serverGame, resetDatabase, bootstrap, mapTiles, unit, sql, value} = require('./test_client');

(async () => {
    resetDatabase();
    sql("INSERT INTO game_users (id,login,email,password_hash,status,user_type,online,last_online_at,parent_id) "
        + "VALUES (9000,'aiciv_global_ai',NULL,'test','active','ai',1,UTC_TIMESTAMP(),NULL)");
    const units = [];
    for (let n = 0; n < 16; n++) {
        units.push(unit({
            client_key: 'global-ai-' + n, owner_id: 9000,
            unit_type_id: n % 4 === 0 ? 'worker' : 'archer',
            unit_class: n % 4 === 0 ? 1 : 2,
            name: n % 4 === 0 ? 'Worker' : 'Archer',
            i: 1 + Math.floor(n / 4), j: 1 + (n % 4),
        }));
    }
    const fixture = await bootstrap({
        playerId: 7001, players: [7001, 9000], units,
        tiles: mapTiles(8),
    });
    sql(`UPDATE server_game_players SET account_user_id=9000 WHERE player_id=9000`);
    sql(`UPDATE server_games SET turn_deadline_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND)`);
    await serverGame.request('make_turn', {
        player_id: 7001, turn: 0, commands: [], actions: [], player_state: {}, relations: {},
    });
    const turn = Number(value('SELECT turn_number FROM server_games'));

    const first = await serverGame.request('claim_ai_batch', {
        player_id: 7001, client_key: 'browser-a', include_snapshot: true,
    });
    const second = await serverGame.request('claim_ai_batch', {
        player_id: 7001, client_key: 'browser-b', include_snapshot: false,
    });
    assert.equal(first.unit_ids.length, 8);
    assert.equal(second.unit_ids.length, 8);
    assert.equal(first.ai_player_id, 9000);
    assert.ok(first.snapshot && first.snapshot.units.length >= 16);
    assert.equal(first.unit_ids.filter(id => second.unit_ids.includes(id)).length, 0,
        'concurrent browsers receive disjoint AI units');

    for (const [clientKey, batch] of [['browser-a', first], ['browser-b', second]]) {
        for (let offset = 0; offset < 8; offset += 4) {
            const submitted = await serverGame.request('submit_ai_batch', {
                player_id: 7001, client_key: clientKey, lease_token: batch.lease_token, turn,
                commands: batch.unit_ids.slice(offset, offset + 4)
                    .map(id => ({unit_id: id, command: 'hold', path: [], payload: {}})),
                actions: [],
            });
            assert.equal(submitted.accepted, true);
            assert.equal(submitted.orders_stored, 4);
        }
    }
    assert.equal(Number(value(`SELECT COUNT(*) FROM server_game_orders WHERE turn_number=${turn} AND player_id=9000`)), 16);
    assert.equal(Number(value(`SELECT COUNT(*) FROM server_game_submissions WHERE turn_number=${turn} AND player_id=9000`)), 0,
        'AI contributions do not become turn-blocking submissions');

    const resolved = await serverGame.request('make_turn', {
        player_id: 7001, turn, commands: [], actions: [], player_state: {}, relations: {},
    });
    assert.equal(resolved.resolved_turn, turn,
        'the only human can resolve the turn without waiting for the global AI');
    console.log('PASS global AI batches lease disjoint units and never block the human turn');
})().catch(error => { console.error(error); process.exitCode = 1; });

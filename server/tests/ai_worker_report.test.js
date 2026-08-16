#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
    assert, serverGame, resetDatabase, bootstrap, mapTiles, unit, sql, value,
} = require('./test_client');

(async () => {
    resetDatabase();
    sql("INSERT INTO game_users (id,login,email,password_hash,status,user_type,online,last_online_at,parent_id) "
        + "VALUES (9000,'aiciv_global_ai',NULL,'test','active','ai',1,UTC_TIMESTAMP(),NULL)");
    const worker = unit({
        client_key: 'reported-ai-worker', owner_id: 9000, i: 3, j: 3,
        state: 'automate', properties: {automationMode: 'automate'},
    });
    const fixture = await bootstrap({
        playerId: 7001, players: [7001, 9000], units: [worker], tiles: mapTiles(8),
    });
    sql('UPDATE server_game_players SET account_user_id=9000 WHERE player_id=9000');
    const batch = await serverGame.request('claim_ai_batch', {
        player_id: 7001, client_key: 'worker-report-client', include_snapshot: true,
    });
    assert.deepEqual(batch.unit_ids, [fixture.unitIds['reported-ai-worker']]);
    const result = await serverGame.request('submit_ai_batch', {
        player_id: 7001, client_key: 'worker-report-client', lease_token: batch.lease_token,
        turn: batch.turn,
        commands: [{
            unit_id: fixture.unitIds['reported-ai-worker'], command: 'hold', path: [],
            payload: {shared_ai_task: {
                kind: 'worker', mode: 'automate', state: 'mine', action: 'mine',
                target: {i: 4, j: 3}, turns_left: 5,
            }, ai_worker_decision: {
                mode: 'automate', state: 'automate', command: 'hold',
                decision: {
                    choice: 'dispatch', action: 'mine', priority: 2,
                    origin: {i: 3, j: 3}, target: {i: 4, j: 3}, path_length: 1,
                },
            }},
        }], actions: [],
    });
    assert.equal(result.accepted, true);
    const files = fs.readdirSync(process.env.AICIV_TEST_REPORT_DIR).filter(name => name.endsWith('.rtp'));
    assert.equal(files.length, 1);
    const report = JSON.parse(fs.readFileSync(path.join(process.env.AICIV_TEST_REPORT_DIR, files[0]), 'utf8'));
    assert.equal(report.source_request_type, 'ai_worker_automation');
    assert.equal(report.error_code, 'AI_WORKER_DECISION');
    assert.equal(report.unit_id, fixture.unitIds['reported-ai-worker']);
    assert.equal(report.request_parameters.decision.action, 'mine');
    assert.deepEqual(report.destination_point, {i: 4, j: 3});
    const storedPayload = JSON.parse(value(
        `SELECT payload_json FROM server_game_orders WHERE unit_id=${fixture.unitIds['reported-ai-worker']}`
    ));
    assert.equal(storedPayload.ai_worker_decision, undefined,
        'diagnostic reasoning must not become persistent gameplay order state');
    assert.deepEqual(storedPayload.shared_ai_task, {
        kind: 'worker', mode: 'automate', state: 'mine', action: 'mine',
        target: {i: 4, j: 3}, turns_left: 5,
    }, 'the shared Worker continuation survives in the authoritative turn order');

    sql('UPDATE server_games SET turn_deadline_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND)');
    await serverGame.request('make_turn', {
        player_id: 7001, turn: batch.turn, commands: [], actions: [], player_state: {}, relations: {},
    });
    const persistedTask = JSON.parse(value(
        `SELECT JSON_EXTRACT(properties_json,'$.sharedAiTask') FROM server_game_units
         WHERE id=${fixture.unitIds['reported-ai-worker']}`
    ));
    assert.deepEqual(persistedTask, {
        kind: 'worker', mode: 'automate', action: 'mine', state: 'mine',
        target: {i: 4, j: 3}, turns_left: 5,
    }, 'another browser can load and resume the AI Worker task after turn resolution');
    console.log('PASS automated AI Worker reasoning is written to one structured RTP report');
})().catch(error => { console.error(error); process.exitCode = 1; });

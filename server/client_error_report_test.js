#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const sequence = [];
const requests = [];
const sandbox = {
    console,
    AbortController,
    setTimeout,
    clearTimeout,
    _authenticated_player_id: 7,
    _current_user: 7,
    location: {href: 'https://softmaximite.com/game/'},
    navigator: {userAgent: 'client-report-test'},
    window: {alert() { sequence.push('popup'); }},
    fetch: async (url, options) => {
        const body = JSON.parse(options.body);
        requests.push(body);
        if (body.action === 'report_cli_error') {
            sequence.push('report');
            return {ok: true, status: 201, async json() { return {ok: true, report_number: 17}; }};
        }
        sequence.push('source');
        return {
            ok: false,
            status: 422,
            async text() {
                return JSON.stringify({
                    ok: false,
                    error: {
                        code: 'atomic_movement_rejected',
                        message: 'Movement failed',
                        details: {command_index: 0, unit_id: 42, reason: 'unit_stack_full', i: 8, j: 9},
                    },
                });
            },
        };
    },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('server_game.js', 'utf8') + '\nglobalThis.game = _server_game;', sandbox);

(async () => {
    let failure;
    try {
        await sandbox.game.request('make_turn', {
            player_id: 7,
            commands: [{unit_id: 42, command: 'move', path: [{i: 8, j: 9}], payload: {}}],
        });
    }
    catch (error) {
        failure = error;
    }
    assert.ok(failure, 'the failed source request must reject');
    assert.equal(failure.clientReportNumber, 17);
    assert.deepEqual(sequence, ['source', 'report'], 'the report must be sent before error handling continues');
    const report = requests[1];
    assert.equal(report.source_request_type, 'make_turn');
    assert.equal(report.unit_id, 42);
    assert.equal(report.unsuccessful_action, 'move');
    assert.deepEqual(report.destination_point, {i: 8, j: 9});
    assert.equal(report.request_parameters.commands[0].unit_id, 42);
    await sandbox.game.showServerErrorPopup(failure);
    assert.deepEqual(sequence, ['source', 'report', 'popup']);
    console.log('PASS client error report precedes popup and contains request, unit, action, and destination');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {assert, serverGame, resetDatabase} = require('./test_client');

(async () => {
    resetDatabase();
    const response = await serverGame.request('report_cli_error', {
        player_id: 7001, source_request_type: 'make_turn', error_message: 'integration failure',
        error_code: 'test_error', unit_id: 44, unsuccessful_action: 'move', destination_point: {i: 2, j: 3},
    });
    assert.equal(response.request, 'report_cli_error');
    const reportPath = path.join(process.env.AICIV_TEST_REPORT_DIR, path.basename(response.report_file));
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.equal(report.error_message, 'integration failure');
    assert.equal(report.unit_id, 44);
    assert.deepEqual(report.destination_point, {i: 2, j: 3});
    console.log('PASS report_cli_error writes one structured RTP report in the isolated runtime directory');
})().catch(error => { console.error(error); process.exitCode = 1; });

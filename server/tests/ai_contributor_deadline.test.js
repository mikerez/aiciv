#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const {AiContributor} = require('../../ai_player/ai_player');

(async () => {
    const contributor = Object.create(AiContributor.prototype);
    contributor.advanceTimer = null;
    contributor.advanceDeadline = null;
    contributor.advancePromise = null;
    contributor.stopped = false;
    contributor.native = {stop() {}};
    contributor.log = () => {};
    let calls = 0;
    contributor.api = {
        async advanceTurn() {
            calls++;
            return {resolved_turn: 7, turn: 8, deadline_at: null};
        },
    };

    const deadline = new Date(Date.now() + 30).toISOString();
    contributor.scheduleTurnAdvance(deadline);
    contributor.scheduleTurnAdvance(deadline);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(calls, 1, 'one deadline schedules exactly one authoritative advance request');

    contributor.scheduleTurnAdvance(new Date(Date.now() + 100).toISOString());
    contributor.stop();
    await new Promise(resolve => setTimeout(resolve, 140));
    assert.equal(calls, 1, 'stopping the contributor cancels its pending deadline request');
    console.log('PASS contributor deadline timer advances independently from inference');
})().catch(error => { console.error(error); process.exitCode = 1; });

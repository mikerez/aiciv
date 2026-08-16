#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const {createBrowserClient, loadAiModels} = require('../server/tests/browser_client');
const {NativeInference, parseArguments} = require('./ai_player');

function deterministicInput(width, seed)
{
    const result = new Float32Array(width);
    let state = seed >>> 0;
    for (let index = 0; index < width; index++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        if ((state & 7) < 3) result[index] = ((state >>> 8) / 0xffffff) * 2 - 1;
    }
    return result;
}

(async () => {
    const context = createBrowserClient({size: 12, playerId: 1, tiles: [], units: []});
    const browser = loadAiModels(context);
    const native = new NativeInference();
    await native.start();
    try {
        for (const [kind, width, seed] of [
            ['strategy', 3524, 0x51a7],
            ['action', 1024, 0xac71],
            ['economics', 1024, 0xec01],
        ]) {
            const input = deterministicInput(width, seed);
            const expected = browser.inferCPU(browser.models[kind], input);
            const actual = await native.infer(kind, input);
            assert.equal(actual.length, 72);
            let maximumDifference = 0;
            for (let index = 0; index < actual.length; index++) {
                maximumDifference = Math.max(maximumDifference, Math.abs(actual[index] - expected[index]));
            }
            assert.ok(maximumDifference < 2e-4,
                `${kind} native/browser maximum difference ${maximumDifference}`);
            console.log(`PASS ${kind} native inference matches browser (max delta ${maximumDifference})`);
        }
        assert.equal(parseArguments(['--once', '--poll-ms', '400']).maxClaims, 1);
        console.log('PASS headless AI command-line options');
    }
    finally {
        native.stop();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const {runScenario} = require('./runner');
const {developmentScenario} = require('./scenarios');

const root = path.resolve(__dirname, '../../..');

async function main() {
    for (let variant = 0; variant < 2; variant++) {
        const result = await runScenario(developmentScenario(variant), {
            modelDirectory: path.join(root, 'ai_player'),
        });
        const final = result.final.metrics;
        console.log(`variant ${variant}: cities=${final.cities}, military=${final.military}, workers=${final.workers}, improvements=${final.improvements}, explored=${final.explored}`);
        if (result.failures.length) {
            for (const failure of result.failures) console.error(`  ${failure}`);
            for (const step of result.trace.filter(item => item.turn % 10 === 0)) {
                console.error(`  turn ${step.turn}: ${JSON.stringify(step.metrics)} policies=${JSON.stringify(step.policies)}`);
            }
        }
        assert.deepEqual(result.failures, []);
    }
}

main().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});

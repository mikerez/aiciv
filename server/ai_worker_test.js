#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const zlib = require('node:zlib');

let posted = null;
const sandbox = {
    console,
    Float32Array,
    Uint8Array,
    DataView,
    Math,
    self: {
        postMessage(message) { posted = message; },
    },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('ai_worker.js', 'utf8'), sandbox, { filename: 'ai_worker.js' });

const modelBuffer = zlib.gunzipSync(fs.readFileSync('ai_player/action.db.gz'));
const arrayBuffer = modelBuffer.buffer.slice(modelBuffer.byteOffset, modelBuffer.byteOffset + modelBuffer.byteLength);
const model = vm.runInContext('parseModel', sandbox)('action', 'action.db', arrayBuffer);
assert.equal(model.inputWidth, 1024);
assert.equal(model.outputWidth, 72);
const output = vm.runInContext('inferCPU', sandbox)(model, new Float32Array(1024));
assert.equal(output.length, 72);
for (const value of output) assert.ok(Number.isFinite(value));

vm.runInContext('models.action = globalThis.__actionModel', Object.assign(sandbox, { __actionModel: model }));
sandbox.self.onmessage({ data: { type: 'infer', requestId: 9, kind: 'action', input: new Float32Array(1024).buffer } });
setImmediate(() => {
    assert.equal(posted.type, 'result');
    assert.equal(posted.requestId, 9);
    assert.equal(new Float32Array(posted.output).length, 72);
    console.log('PASS AI worker parses and infers a trained FP32 model');
});

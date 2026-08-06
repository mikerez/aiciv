'use strict';

const models = {};
const layerCount = 8;
const outputWidth = 72;
const headerBytes = 72;

function hasModelMagic(buffer)
{
    if (!buffer || buffer.byteLength < 8) return false;
    var bytes = new Uint8Array(buffer, 0, 7);
    return bytes[0] == 65 && bytes[1] == 73 && bytes[2] == 67 && bytes[3] == 73
        && bytes[4] == 86 && bytes[5] == 65 && bytes[6] == 73;
}

function isGzipBuffer(buffer)
{
    if (!buffer || buffer.byteLength < 2) return false;
    var bytes = new Uint8Array(buffer, 0, 2);
    return bytes[0] == 0x1f && bytes[1] == 0x8b;
}

async function fetchModelBuffer(kind, url)
{
    var response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) throw new Error('Failed to load ' + kind + ' model: HTTP ' + response.status);
    var buffer = await response.arrayBuffer();
    if (hasModelMagic(buffer)) return buffer;
    if (isGzipBuffer(buffer) && typeof DecompressionStream != 'undefined') {
        var stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
        var decoded = await new Response(stream).arrayBuffer();
        if (hasModelMagic(decoded)) return decoded;
    }
    if (url.indexOf('.db.gz') >= 0) {
        var fallback = await fetch(url.replace('.db.gz', '.db'), { cache: 'force-cache' });
        if (fallback.ok) {
            var raw = await fallback.arrayBuffer();
            if (hasModelMagic(raw)) return raw;
        }
    }
    throw new Error('Could not decode ' + kind + ' model');
}

function parseModel(kind, url, buffer)
{
    var view = new DataView(buffer);
    var magic = '';
    for (var i = 0; i < 7; i++) magic += String.fromCharCode(view.getUint8(i));
    var version = view.getUint32(8, true);
    var width = view.getUint32(12, true);
    var count = view.getUint32(16, true);
    var activation = view.getUint32(20, true);
    var layout = view.getUint32(24, true);
    var inputWidth = view.getUint32(28, true);
    var modelOutputWidth = view.getUint32(32, true);
    if (magic != 'AICIVAI' || version != 2 || count != layerCount || activation != 1
        || layout != 1 || width != inputWidth || modelOutputWidth != outputWidth) {
        throw new Error('Unsupported AI model header in ' + url);
    }
    var widths = [inputWidth];
    for (var n = 0; n < count; n++) widths.push(view.getUint32(36 + n * 4, true));
    if (widths[widths.length - 1] != outputWidth) throw new Error('AI model output width mismatch');

    var offset = headerBytes;
    var layers = [];
    for (var layer = 0; layer < count; layer++) {
        var inWidth = widths[layer];
        var outWidth = widths[layer + 1];
        var weightCount = inWidth * outWidth;
        var weights = new Float32Array(buffer, offset, weightCount);
        offset += weightCount * 4;
        var bias = new Float32Array(buffer, offset, outWidth);
        offset += outWidth * 4;
        layers.push({ inputWidth: inWidth, outputWidth: outWidth, weights: weights, bias: bias });
    }
    if (offset != buffer.byteLength) throw new Error('AI model size mismatch in ' + url);
    return { kind: kind, inputWidth: inputWidth, outputWidth: outputWidth, layers: layers };
}

function inferCPU(model, input)
{
    if (input.length != model.inputWidth) {
        throw new Error(model.kind + ' input width is ' + input.length + ', expected ' + model.inputWidth);
    }
    var current = input;
    for (var layer = 0; layer < model.layers.length; layer++) {
        var layerData = model.layers[layer];
        var next = new Float32Array(layerData.outputWidth);
        for (var out = 0; out < layerData.outputWidth; out++) {
            var sum = layerData.bias[out];
            var row = out * layerData.inputWidth;
            for (var col = 0; col < layerData.inputWidth; col++) {
                sum += layerData.weights[row + col] * current[col];
            }
            next[out] = Math.tanh(sum);
        }
        current = next;
    }
    return current;
}

self.onmessage = async function(event) {
    var message = event.data || {};
    try {
        if (message.type == 'init') {
            var entries = Object.entries(message.modelUrls || {});
            await Promise.all(entries.map(async function(entry) {
                var buffer = await fetchModelBuffer(entry[0], entry[1]);
                models[entry[0]] = parseModel(entry[0], entry[1], buffer);
            }));
            self.postMessage({ type: 'ready' });
            return;
        }
        if (message.type == 'infer') {
            var model = models[message.kind];
            if (!model) throw new Error('AI worker model is not loaded: ' + message.kind);
            var output = inferCPU(model, new Float32Array(message.input));
            self.postMessage({ type: 'result', requestId: message.requestId, output: output.buffer }, [output.buffer]);
        }
    }
    catch (error) {
        self.postMessage({
            type: 'error',
            requestId: message.requestId == undefined ? 0 : message.requestId,
            message: error && error.message ? error.message : String(error),
        });
    }
};

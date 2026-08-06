const _ai_player = new class
{
    constructor()
    {
        this.width = 1024;
        this.strategyInputWidth = 3524;
        this.outputWidth = 72;
        this.layerCount = 8;
        this.headerBytes = 72;
        this.models = {};
        this.device = null;
        this.pipeline = null;
        this.bindGroupLayout = null;
        this.gpuReady = false;
        this.statusCallback = null;
        this.defaultModelUrls = {
            strategy: 'ai_player/strategy.db.gz?v=20260712a',
            tactics: 'ai_player/tactics.db.gz?v=20260625k',
            action: 'ai_player/action.db.gz?v=20260804a',
            economics: 'ai_player/economics.db.gz?v=20260711b',
        };
        this.defaultModelsLoaded = false;
        this.defaultModelLoadPromise = null;
        this.backgroundWorker = null;
        this.backgroundWorkerReady = false;
        this.backgroundWorkerLoadPromise = null;
        this.backgroundWorkerRequests = new Map();
        this.backgroundWorkerRequestId = 1;
        this.strategyDecisionLabels = [
            'resist_strongest_civ',
            'improve_friendship',
            'declare_war_on_weak_neighbor',
            'research_food_technology',
            'research_production_technology',
            'research_naval_technology',
            'focus_anti_mounted_units',
            'protect_expansion_point',
        ];
        this.tacticsCommandLabels = [
            'attack',
            'defend',
            'flank',
            'retreat',
            'reinforce',
            'siege',
            'capture',
            'hold',
        ];
        this.actionCommandLabels = [
            'goto',
            'wait',
            'build_city',
            'road_to',
            'irrigate',
            'chop_forest',
            'build_improvement',
            'attack',
        ];
        this.economicsProductionLabels = [
            'settlers',
            'explorer',
            'worker',
            'warrior',
            'slinger',
            'archer',
            'spearman',
            'none',
            'chariot',
            'elephant',
            'catapult',
            'trebuchet',
            'galley',
            'galleon',
        ];
        this.productionDemandLabels = ['settlers', 'worker', 'explorer', 'military'];
        this.lastActionUnitIndices = [];
        this.lastEconomicsCityIndices = [];
        this.lastStrategyProductionDemands = null;
        this.strategyTechnologyLabels = ['Mining', 'Animal Husbandry', 'Masonry', 'Irrigation'];
        this.settlerBuildCityTurnLimit = 20;
        // Settlement gate used after the Action model says "build city".
        // The score must remain a true site-quality threshold; old settlers should
        // route to a better candidate instead of settling arbitrary land.
        this.settlerGoodCityPlotThreshold = 0.38;
        this.settlerAgedCityPlotThreshold = 0.30;
        this.settlerFirstCityPlotThreshold = 0.30;
    }

    log(message)
    {
        if (typeof appendConsoleLog === 'function') {
            appendConsoleLog(message);
        }
        else if (typeof console !== 'undefined' && console.log) {
            console.log(message);
        }
    }

    fmt(value)
    {
        if (value == undefined || isNaN(value)) {
            return 'n/a';
        }
        return Number(value).toFixed(2);
    }

    coordText(coord)
    {
        if (!coord) {
            return 'none';
        }
        return '(' + Math.round(coord.i) + ',' + Math.round(coord.j) + ')';
    }

    focusText(focus)
    {
        if (!focus) {
            return 'focus none';
        }
        return 'focus[x=' + this.fmt(focus.x)
            + ', y=' + this.fmt(focus.y)
            + ', attack=' + this.fmt(focus.militaryPriority)
            + ', defense=' + this.fmt(focus.defensePriority)
            + ', civ=' + focus.civilizationId + ']';
    }

    unitSummary(k)
    {
        if (k == undefined || typeof _units == 'undefined' || !_units[k]) {
            return 'unit#' + k + ' missing';
        }
        var unit = _units[k];
        return 'unit#' + k + ' ' + (unit.unitTypeId || unit.name || unit.type)
            + ' at ' + this.coordText(unit.coord)
            + ' state=' + (unit.state || 'ready');
    }

    citySummary(k)
    {
        if (k == undefined || typeof _units == 'undefined' || !_units[k]) {
            return 'city#' + k + ' missing';
        }
        var city = _units[k];
        return 'city#' + k + ' at ' + this.coordText(city.coord)
            + ' production=' + (city.production && city.production.unitTypeId ? city.production.unitTypeId : 'none');
    }

    async initWebGPU()
    {
        if (this.gpuReady) {
            return true;
        }
        if (!navigator.gpu) {
            return false;
        }
        var adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            return false;
        }
        this.device = await adapter.requestDevice();
        this.bindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
            ],
        });
        var shader = this.device.createShaderModule({ code: this.matmulShader() });
        this.pipeline = this.device.createComputePipeline({
            layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
            compute: { module: shader, entryPoint: 'main' },
        });
        this.gpuReady = true;
        return true;
    }

    matmulShader()
    {
        return `
            const WIDTH: u32 = 1024u;

            @group(0) @binding(0) var<storage, read> input_vector: array<f32>;
            @group(0) @binding(1) var<storage, read> weights: array<f32>;
            @group(0) @binding(2) var<storage, read> bias: array<f32>;
            @group(0) @binding(3) var<storage, read_write> output_vector: array<f32>;

            fn activate(x: f32) -> f32 {
                let clipped = clamp(x, -10.0, 10.0);
                let e2 = exp(2.0 * clipped);
                return (e2 - 1.0) / (e2 + 1.0);
            }

            @compute @workgroup_size(64)
            fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
                let row = global_id.x;
                if (row >= WIDTH) {
                    return;
                }

                var sum = bias[row];
                for (var col: u32 = 0u; col < WIDTH; col = col + 1u) {
                    sum = sum + weights[row * WIDTH + col] * input_vector[col];
                }
                output_vector[row] = activate(sum);
            }
        `;
    }

    setStatus(message)
    {
        if (this.statusCallback) {
            this.statusCallback(message);
        }
        if (typeof console !== 'undefined' && console.log) {
            console.log(message);
        }
    }

    async loadDefaultModels(useWebGPU = false)
    {
        this.setStatus('AI: loading strategy model');
        await this.loadModel('strategy', this.defaultModelUrls.strategy, useWebGPU);
        this.setStatus('AI: loading tactics model');
        await this.loadModel('tactics', this.defaultModelUrls.tactics, useWebGPU);
        this.setStatus('AI: loading action model');
        await this.loadModel('action', this.defaultModelUrls.action, useWebGPU);
        this.setStatus('AI: loading economics model');
        await this.loadModel('economics', this.defaultModelUrls.economics, useWebGPU);
        this.defaultModelsLoaded = true;
        this.setStatus('AI: models loaded');
        return true;
    }

    async ensureDefaultModelsLoaded(useWebGPU = false)
    {
        if (this.defaultModelsLoaded) {
            return true;
        }
        if (!this.defaultModelLoadPromise) {
            this.defaultModelLoadPromise = this.loadDefaultModels(useWebGPU);
        }
        return await this.defaultModelLoadPromise;
    }

    ensureBackgroundModelsLoaded()
    {
        if (this.backgroundWorkerReady) return Promise.resolve(true);
        if (this.backgroundWorkerLoadPromise) return this.backgroundWorkerLoadPromise;
        if (typeof Worker == 'undefined') {
            return Promise.reject(new Error('Web Workers are not supported by this browser'));
        }

        var self = this;
        this.backgroundWorkerLoadPromise = new Promise(function(resolve, reject) {
            var worker = new Worker('ai_worker.js?v=20260805a');
            self.backgroundWorker = worker;
            self.backgroundWorkerRequests.set(0, { resolve: resolve, reject: reject });
            worker.onmessage = function(event) {
                var message = event.data || {};
                if (message.type == 'ready') {
                    self.backgroundWorkerReady = true;
                    var loading = self.backgroundWorkerRequests.get(0);
                    self.backgroundWorkerRequests.delete(0);
                    if (loading) loading.resolve(true);
                    return;
                }
                if (message.type == 'result' || message.type == 'error') {
                    var pending = self.backgroundWorkerRequests.get(message.requestId);
                    self.backgroundWorkerRequests.delete(message.requestId);
                    if (!pending) return;
                    if (message.type == 'error') pending.reject(new Error(message.message || 'AI worker failed'));
                    else pending.resolve(new Float32Array(message.output));
                }
            };
            worker.onerror = function(event) {
                var error = new Error(event.message || 'AI worker failed');
                self.backgroundWorkerReady = false;
                self.backgroundWorkerRequests.forEach(function(pending) { pending.reject(error); });
                self.backgroundWorkerRequests.clear();
            };
            worker.postMessage({ type: 'init', modelUrls: self.defaultModelUrls });
        });
        return this.backgroundWorkerLoadPromise;
    }

    async inferBackground(kind, input)
    {
        await this.ensureBackgroundModelsLoaded();
        if (!(input instanceof Float32Array)) {
            throw new Error('Background AI input must be a Float32Array');
        }
        var requestId = this.backgroundWorkerRequestId++;
        var transferableInput = new Float32Array(input);
        var self = this;
        var result = new Promise(function(resolve, reject) {
            self.backgroundWorkerRequests.set(requestId, { resolve: resolve, reject: reject });
        });
        this.backgroundWorker.postMessage({
            type: 'infer',
            requestId: requestId,
            kind: kind,
            input: transferableInput.buffer,
        }, [transferableInput.buffer]);
        return await result;
    }

    async loadModel(kind, url, useWebGPU = true)
    {
        var response = await fetch(url, { cache: 'force-cache' });
        if (!response.ok) {
            throw new Error('Failed to load AI model ' + kind + ' from ' + url + ': HTTP ' + response.status);
        }
        var buffer = await this.readModelBufferWithProgress(kind, response);
        buffer = await this.decodeModelBuffer(kind, url, buffer);
        this.setStatus('AI: parsing ' + kind + ' model');
        var model = this.parseModel(kind, url, buffer);
        if (false && useWebGPU && await this.initWebGPU()) {
            this.setStatus('AI: uploading ' + kind + ' model to GPU');
            this.uploadModelToGPU(model);
        }
        this.models[kind] = model;
        return model;
    }

    async readModelBufferWithProgress(kind, response)
    {
        var contentLength = parseInt(response.headers.get('Content-Length') || '0', 10);
        if (!response.body || !response.body.getReader) {
            return await response.arrayBuffer();
        }
        var reader = response.body.getReader();
        var chunks = [];
        var received = 0;
        var nextReport = 0;
        while (true) {
            var read = await reader.read();
            if (read.done) {
                break;
            }
            chunks.push(read.value);
            received += read.value.byteLength;
            if (!contentLength || received >= nextReport) {
                if (contentLength) {
                    var percent = Math.floor(received * 100 / contentLength);
                    this.setStatus('AI: loading ' + kind + ' model ' + percent + '%');
                    nextReport = received + Math.max(512 * 1024, contentLength / 20);
                }
                else {
                    this.setStatus('AI: loading ' + kind + ' model ' + Math.floor(received / 1024 / 1024) + ' MB');
                    nextReport = received + 1024 * 1024;
                }
            }
        }

        var buffer = new Uint8Array(received);
        var offset = 0;
        for (var k = 0; k < chunks.length; k++) {
            buffer.set(chunks[k], offset);
            offset += chunks[k].byteLength;
        }
        return buffer.buffer;
    }

    hasModelMagic(buffer)
    {
        if (!buffer || buffer.byteLength < 8) {
            return false;
        }
        var view = new Uint8Array(buffer, 0, 7);
        return view[0] == 65 && view[1] == 73 && view[2] == 67 && view[3] == 73
            && view[4] == 86 && view[5] == 65 && view[6] == 73;
    }

    isGzipBuffer(buffer)
    {
        if (!buffer || buffer.byteLength < 2) {
            return false;
        }
        var view = new Uint8Array(buffer, 0, 2);
        return view[0] == 0x1f && view[1] == 0x8b;
    }

    async decodeModelBuffer(kind, url, buffer)
    {
        if (this.hasModelMagic(buffer)) {
            return buffer;
        }
        if (this.isGzipBuffer(buffer) && typeof DecompressionStream != 'undefined') {
            this.setStatus('AI: decompressing ' + kind + ' model');
            var stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
            var decoded = await new Response(stream).arrayBuffer();
            if (this.hasModelMagic(decoded)) {
                return decoded;
            }
        }
        if (url.indexOf('.db.gz') >= 0) {
            var fallbackUrl = url.replace('.db.gz', '.db');
            this.setStatus('AI: loading raw fallback ' + kind + ' model');
            var response = await fetch(fallbackUrl, { cache: 'force-cache' });
            if (response.ok) {
                var fallback = await this.readModelBufferWithProgress(kind, response);
                if (this.hasModelMagic(fallback)) {
                    return fallback;
                }
            }
        }
        throw new Error('AI model ' + kind + ' could not be decoded from ' + url);
    }

    parseModel(kind, url, buffer)
    {
        var view = new DataView(buffer);
        var magic = '';
        for (var i = 0; i < 7; i++) {
            magic += String.fromCharCode(view.getUint8(i));
        }
        if (magic != 'AICIVAI') {
            throw new Error('Bad AI model magic in ' + url);
        }
        var version = view.getUint32(8, true);
        var width = view.getUint32(12, true);
        var layerCount = view.getUint32(16, true);
        var activation = view.getUint32(20, true);
        var weightLayout = view.getUint32(24, true);
        if (version != 2 || layerCount != this.layerCount || activation != 1 || weightLayout != 1) {
            throw new Error('Unsupported AI model header in ' + url);
        }

        var inputWidth = view.getUint32(28, true);
        var outputWidth = view.getUint32(32, true);
        if (width != inputWidth || outputWidth != this.outputWidth) {
            throw new Error('Unsupported AI model dimensions in ' + url);
        }
        var layerWidths = [inputWidth];
        for (var lw = 0; lw < layerCount; lw++) {
            layerWidths.push(view.getUint32(36 + lw * 4, true));
        }
        if (layerWidths[layerWidths.length - 1] != outputWidth) {
            throw new Error('AI model output width mismatch in ' + url);
        }

        var offset = this.headerBytes;
        var layers = [];
        for (var layer = 0; layer < this.layerCount; layer++) {
            var inWidth = layerWidths[layer];
            var outWidth = layerWidths[layer + 1];
            var floatsPerWeights = inWidth * outWidth;
            var floatsPerBias = outWidth;
            var weights = new Float32Array(buffer, offset, floatsPerWeights);
            offset += floatsPerWeights * 4;
            var bias = new Float32Array(buffer, offset, floatsPerBias);
            offset += floatsPerBias * 4;
            layers.push({ inputWidth: inWidth, outputWidth: outWidth, weights: weights, bias: bias });
        }
        if (offset != buffer.byteLength) {
            throw new Error('AI model size mismatch in ' + url);
        }
        return {
            kind: kind,
            url: url,
            buffer: buffer,
            width: width,
            inputWidth: inputWidth,
            outputWidth: outputWidth,
            layerWidths: layerWidths,
            layerCount: layerCount,
            layers: layers,
            gpuLayers: null,
            gpuBindGroups: null,
            inputBuffers: null,
            readBuffer: null,
            gpu: false,
        };
    }

    uploadModelToGPU(model)
    {
        var usageRead = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
        model.gpuLayers = [];
        for (var i = 0; i < model.layers.length; i++) {
            var layer = model.layers[i];
            var weightsBuffer = this.device.createBuffer({
                size: layer.weights.byteLength,
                usage: usageRead,
            });
            var biasBuffer = this.device.createBuffer({
                size: layer.bias.byteLength,
                usage: usageRead,
            });
            this.device.queue.writeBuffer(weightsBuffer, 0, layer.weights);
            this.device.queue.writeBuffer(biasBuffer, 0, layer.bias);
            model.gpuLayers.push({ weights: weightsBuffer, bias: biasBuffer });
        }

        var vectorBytes = this.width * 4;
        model.inputBuffers = [
            this.device.createBuffer({
                size: vectorBytes,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
            }),
            this.device.createBuffer({
                size: vectorBytes,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
            }),
        ];
        model.readBuffer = this.device.createBuffer({
            size: vectorBytes,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });

        model.gpuBindGroups = [];
        for (var layerIndex = 0; layerIndex < model.gpuLayers.length; layerIndex++) {
            var inputIndex = layerIndex % 2;
            var outputIndex = 1 - inputIndex;
            model.gpuBindGroups.push(this.device.createBindGroup({
                layout: this.bindGroupLayout,
                entries: [
                    { binding: 0, resource: { buffer: model.inputBuffers[inputIndex] } },
                    { binding: 1, resource: { buffer: model.gpuLayers[layerIndex].weights } },
                    { binding: 2, resource: { buffer: model.gpuLayers[layerIndex].bias } },
                    { binding: 3, resource: { buffer: model.inputBuffers[outputIndex] } },
                ],
            }));
        }
        model.gpu = true;
    }

    zeroInput(width = this.width)
    {
        return new Float32Array(width);
    }

    clamp(value, minValue, maxValue)
    {
        return Math.max(minValue, Math.min(maxValue, value));
    }

    normalizedCoord(value)
    {
        if (typeof _map_size == 'undefined' || _map_size <= 1) {
            return 0;
        }
        return this.clamp((value / (_map_size - 1)) * 2 - 1, -1, 1);
    }

    denormalizedCoord(value)
    {
        if (typeof _map_size == 'undefined' || _map_size <= 1) {
            return 0;
        }
        return Math.round(this.clamp((value + 1) * 0.5, 0, 1) * (_map_size - 1));
    }

    normalizeCount(value, scale)
    {
        return this.clamp((value || 0) / Math.max(1, scale), -1, 1);
    }

    terrainTypeAt(i, j)
    {
        if (typeof _map_terrain_tex == 'undefined' || i < 0 || j < 0 || i >= _map_size || j >= _map_size) {
            return 0;
        }
        return _map_terrain_tex[i][j] & 0x0F;
    }

    terrainRawAt(i, j)
    {
        if (typeof _map_terrain_tex == 'undefined' || i < 0 || j < 0 || i >= _map_size || j >= _map_size) {
            return 0;
        }
        return _map_terrain_tex[i][j];
    }

    hasTerrainWaterSourceAt(i, j)
    {
        var terrain = this.terrainRawAt(i, j);
        return (terrain & 0x80) != 0;
    }

    hasLandWaterSourceAt(i, j)
    {
        return this.hasTerrainWaterSourceAt(i, j) && this.terrainTypeAt(i, j) != 0;
    }

    unitTypeIndex(unit)
    {
        if (unit == undefined) {
            return 0;
        }
        if (typeof _current_game != 'undefined' && _current_game && _current_game.unitTypes) {
            for (var k = 0; k < _current_game.unitTypes.length; k++) {
                if (_current_game.unitTypes[k].id == unit.unitTypeId) {
                    return k + 1;
                }
            }
        }
        return (unit.type || 0) + 1;
    }

    unitStateCode(unit)
    {
        var order = ['ready', 'waiting', 'fortified', 'fortification', 'road', 'road_to', 'irrigate',
            'chop_forest', 'pasture', 'farm', 'plantation', 'camp', 'fishing_boats', 'quarry',
            'winery', 'cottage', 'workshop', 'mine', 'explore', 'patrol', 'automate'];
        var state = unit && unit.state ? unit.state : 'ready';
        var index = order.indexOf(state);
        return index < 0 ? 0 : index / Math.max(1, order.length - 1);
    }

    actionImmediateSignal(k)
    {
        if (typeof _current_game == 'undefined' || !_current_game || typeof _units == 'undefined' || !_units[k]) {
            return 0;
        }
        var unit = _units[k];
        if (unit.type == 2) {
            var ownerTeam = unit.team || 0;
            for (var n = 0; n < _units.length; n++) {
                if (!_units[n] || (_units[n].team || 0) == ownerTeam || _units[n].type == 3) {
                    continue;
                }
                var distance = Math.max(Math.abs(_units[n].coord.i - unit.coord.i), Math.abs(_units[n].coord.j - unit.coord.j));
                if (distance <= 1) {
                    return 0.70;
                }
            }
            var terrain = this.terrainTypeAt(unit.coord.i, unit.coord.j);
            if (terrain == 4 || terrain == 5) {
                return 0.50;
            }
            return 0;
        }
        if (unit.unitTypeId != 'worker') {
            return 0;
        }
        if (_current_game.workerTileBuildingMenuOptions && _current_game.workerTileBuildingMenuOptions(k).length) {
            return 0.80;
        }
        if (_current_game.canBuildIrrigation && _current_game.canBuildIrrigation(k)) {
            return 0.60;
        }
        if (_current_game.canChopForest && _current_game.canChopForest(k)) {
            return 0.45;
        }
        if (_current_game.canBuildRoad && _current_game.canBuildRoad(k)) {
            return 0.30;
        }
        if (_current_game.canUseRoadTo && _current_game.canUseRoadTo(k)) {
            return 0.20;
        }
        return 0;
    }

    relationToTeam(ownerTeam, otherTeam)
    {
        if (ownerTeam == otherTeam) {
            return 1;
        }
        if (typeof _military !== 'undefined' && _military.isAtWar) {
            return _military.isAtWar(ownerTeam, otherTeam) ? -1 : 0.4;
        }
        return -1;
    }

    argmax(values, begin, count)
    {
        var bestIndex = 0;
        var bestValue = -Infinity;
        for (var k = 0; k < count; k++) {
            var value = values[begin + k];
            if (value > bestValue) {
                bestValue = value;
                bestIndex = k;
            }
        }
        return { index: bestIndex, slot: begin + bestIndex, value: bestValue };
    }

    argmaxSlots(values, slots)
    {
        var bestIndex = slots.length ? slots[0] : 0;
        var bestValue = -Infinity;
        for (var k = 0; k < slots.length; k++) {
            var index = slots[k];
            var value = values[index];
            if (value > bestValue) {
                bestValue = value;
                bestIndex = index;
            }
        }
        return { index: bestIndex, slot: bestIndex, value: bestValue };
    }

    bestObjectCommand(output, labels)
    {
        var best = { record: 0, index: 0, slot: 0, value: -Infinity };
        for (var record = 0; record < 8; record++) {
            var local = this.argmax(output, record * 8, Math.min(8, labels.length));
            if (local.value > best.value) {
                best = { record: record, index: local.index, slot: local.slot, value: local.value };
            }
        }
        return best;
    }

    bestStrategyCommand(output)
    {
        var best = { record: 0, index: 0, slot: 4, value: -Infinity };
        for (var record = 0; record < 8; record++) {
            var base = record * 8;
            var local = this.argmax(output, base + 4, 4);
            if (local.value > best.value) {
                best = { record: record, index: local.index + 4, slot: local.slot, value: local.value };
            }
        }
        return best;
    }

    sortedUnits(filter)
    {
        var result = [];
        if (typeof _units == 'undefined') {
            return result;
        }
        for (var k = 0; k < _units.length; k++) {
            if (!filter || filter(_units[k], k)) {
                result.push({ unit: _units[k], index: k });
            }
        }
        return result;
    }

    activeUserId()
    {
        return typeof _current_user != 'undefined' ? _current_user : 0;
    }

    visibilityBitsForUser(userId)
    {
        if (typeof _map_terrain_bit_by_user != 'undefined' && _map_terrain_bit_by_user[userId]) {
            return _map_terrain_bit_by_user[userId];
        }
        if (userId == this.activeUserId() && typeof _map_terrain_bit != 'undefined') {
            return _map_terrain_bit;
        }
        return null;
    }

    isTileSeenByUser(i, j, userId = this.activeUserId())
    {
        if (i < 0 || j < 0 || typeof _map_size == 'undefined' || i >= _map_size || j >= _map_size) {
            return false;
        }
        var bits = this.visibilityBitsForUser(userId);
        if (!bits) {
            return true;
        }
        return !!(bits[i] && (bits[i][j] & 0x4000) != 0);
    }

    isTileFullyVisibleByUser(i, j, userId = this.activeUserId())
    {
        if (i < 0 || j < 0 || typeof _map_size == 'undefined' || i >= _map_size || j >= _map_size) {
            return false;
        }
        var bits = this.visibilityBitsForUser(userId);
        if (!bits) {
            return true;
        }
        return !!(bits[i] && (bits[i][j] & 0x0400) != 0);
    }

    allUnitRecords(filter)
    {
        var result = [];
        if (typeof _units_by_user != 'undefined') {
            for (var userId in _units_by_user) {
                var list = _units_by_user[userId] || [];
                for (var k = 0; k < list.length; k++) {
                    if (list[k] && list[k].economicClass == 'terrain_improvement') {
                        continue;
                    }
                    if (!filter || filter(list[k], k, parseInt(userId, 10))) {
                        result.push({ unit: list[k], index: k, userId: parseInt(userId, 10) });
                    }
                }
            }
            return result;
        }
        return this.sortedUnits(filter).map(function(record) {
            record.userId = record.unit.team || 0;
            return record;
        });
    }

    visibleUnitRecords(viewerUserId = this.activeUserId(), filter = null)
    {
        var self = this;
        return this.allUnitRecords(function(unit, index, userId) {
            if (!unit || !unit.coord) {
                return false;
            }
            if ((unit.team || 0) != viewerUserId
                && !self.isTileFullyVisibleByUser(unit.coord.i, unit.coord.j, viewerUserId)) {
                return false;
            }
            return !filter || filter(unit, index, userId);
        });
    }

    teamSet(ownerTeam = this.activeUserId())
    {
        var teams = {};
        teams[ownerTeam] = true;
        var records = this.visibleUnitRecords(ownerTeam);
        for (var k = 0; k < records.length; k++) {
            teams[records[k].unit.team || 0] = true;
        }
        return Object.keys(teams).map(function(value) { return parseInt(value, 10); }).sort(function(a, b) { return a - b; });
    }

    technologyNames()
    {
        if (typeof _technology_table == 'undefined') {
            return [];
        }
        return Object.keys(_technology_table);
    }

    firstResearchable(names)
    {
        if (typeof _game_state == 'undefined') {
            return null;
        }
        for (var k = 0; k < names.length; k++) {
            if (_game_state.canResearch(names[k])) {
                return names[k];
            }
        }
        return null;
    }

    // Unified input: 8 object records * 120 FP32 + 64 generic situation FP32.
    // IDs are stored separately in last* arrays and are never written into model input.
    buildStrategyInput(ownerTeam = 0)
    {
        var input = this.zeroInput(this.strategyInputWidth);
        var teams = this.teamSet(ownerTeam);
        var records = this.visibleUnitRecords(ownerTeam);
        var units = records.map(function(record) { return record.unit; });
        this.lastStrategyObjectIds = [];

        for (var t = 0; t < Math.min(4, teams.length); t++) {
            var team = teams[t];
            var summaryBase = t * 120;
            var teamUnits = units.filter(function(unit) { return (unit.team || 0) == team; });
            var cities = teamUnits.filter(function(unit) { return unit.type == 3; });
            var military = teamUnits.filter(function(unit) { return unit.type == 2; });
            var population = 0;
            var food = 0;
            var production = 0;
            var money = 0;
            for (var c = 0; c < cities.length; c++) {
                var city = cities[c];
                if (typeof _city_economy != 'undefined') {
                    _city_economy.ensureCity(city);
                }
                population += city.economy ? city.economy.citizens.length : 1;
                food += city.economy ? city.economy.lastIncome.food : 0;
                production += city.economy ? city.economy.lastIncome.production : 0;
                money += city.economy ? city.economy.lastIncome.money : 0;
            }
            var strength = this.totalMilitaryStrength(military);
            this.lastStrategyObjectIds[t] = { kind: 'civilization', team: team };
            input[summaryBase + 0] = this.relationToTeam(ownerTeam, team);
            input[summaryBase + 1] = this.normalizeCount(population, 40);
            input[summaryBase + 2] = this.normalizeCount(cities.length, 12);
            input[summaryBase + 3] = this.normalizeCount(strength, 100);
            input[summaryBase + 4] = team == ownerTeam && typeof _game_state != 'undefined' ? this.normalizeCount(_game_state.lastScienceIncome, 50) : 0;
            input[summaryBase + 5] = this.normalizeCount(money, 50);
            input[summaryBase + 6] = this.normalizeCount(food, 50);
            input[summaryBase + 7] = this.normalizeCount(production, 50);
            input[summaryBase + 8] = this.techRatioForTeam(team, ownerTeam);
            input[summaryBase + 9] = team == ownerTeam ? 0 : this.normalizeCount(strength, 100);
            input[summaryBase + 10] = team == ownerTeam ? 1 : 0;
            input[summaryBase + 11] = this.averageDistanceToTeam(ownerTeam, team);
            input[summaryBase + 12] = this.normalizeCount(military.filter(function(unit) { return unit.nature == 'water'; }).length, 16);
            input[summaryBase + 13] = team == ownerTeam ? this.knownMapRatioForUser(ownerTeam) : 0;
            if (team == ownerTeam) {
                var workerTarget = this.smallestOwnCityWorkerTarget(ownerTeam);
                if (workerTarget) {
                    input[summaryBase + 14] = this.normalizedCoord(workerTarget.coord.i);
                    input[summaryBase + 15] = this.normalizedCoord(workerTarget.coord.j);
                    input[summaryBase + 16] = this.normalizeCount(workerTarget.population, 24);
                    input[summaryBase + 17] = this.normalizeCount(this.countIdleWorkers(ownerTeam), 8);
                    input[summaryBase + 18] = this.normalizeCount(this.countFriendlyWorkersNear(workerTarget.coord, ownerTeam, 3), 4);
                    input[summaryBase + 19] = 1;
                }
            }
        }

        for (var f = 0; f < Math.min(4, teams.length); f++) {
            var forceTeam = teams[f];
            var forceBase = (4 + f) * 120;
            var forceUnits = units.filter(function(unit) { return (unit.team || 0) == forceTeam && unit.type == 2; });
            var center = this.weightedMilitaryCenter(forceUnits);
            this.lastStrategyObjectIds[4 + f] = { kind: 'force', team: forceTeam };
            input[forceBase + 0] = this.relationToTeam(ownerTeam, forceTeam);
            input[forceBase + 1] = center.x;
            input[forceBase + 2] = center.y;
            input[forceBase + 3] = this.normalizeCount(center.landStrength, 100);
            input[forceBase + 4] = this.normalizeCount(center.navalStrength, 100);
            input[forceBase + 5] = this.normalizeCount(center.mobility, 30);
            input[forceBase + 6] = 0;
            input[forceBase + 7] = forceTeam == ownerTeam ? 0 : this.normalizeCount(center.landStrength + center.navalStrength, 100);
            input[forceBase + 8] = this.normalizeCount(forceUnits.length, 32);
            input[forceBase + 10] = center.x;
            input[forceBase + 11] = center.y;
        }

        this.fillGenericSituation(input, ownerTeam, 0);
        input[960 + 16] = this.techFamilyProgress(['Pottery', 'Irrigation']);
        input[960 + 17] = this.techFamilyProgress(['Mining', 'Masonry', 'Construction', 'Engineering']);
        input[960 + 18] = this.techFamilyProgress(['Archery', 'Bronze Working', 'Iron Working', 'Horseback Riding']);
        input[960 + 19] = this.techFamilyProgress(['Sailing', 'Shipbuilding', 'Navigation', 'Astronomy']);
        input[960 + 20] = this.normalizeCount(this.countUnitsByType(ownerTeam, 'settlers'), 8);
        input[960 + 21] = this.normalizeCount(this.countUnitsByType(ownerTeam, 'worker'), 8);
        input[960 + 22] = this.normalizeCount(this.countMilitary(ownerTeam), 64);
        input[960 + 23] = this.normalizeCount(this.sortedUnits(function(unit) {
            return (unit.team || 0) == ownerTeam && unit.type == 3;
        }).length, 16);
        var cityContext = this.strategyCityContextStats(ownerTeam);
        this.lastStrategyContext = cityContext;
        input[960 + 24] = cityContext.hills;
        input[960 + 25] = cityContext.mountains;
        input[960 + 26] = cityContext.grass;
        input[960 + 27] = cityContext.water;
        input[960 + 28] = cityContext.animalResources;
        input[960 + 29] = cityContext.stoneResources;
        input[960 + 30] = cityContext.cropResources;
        input[960 + 31] = this.openedTechnologyRate();
        input[960 + 32] = cityContext.contextTiles;
        input[960 + 33] = cityContext.flatLand;
        input[960 + 34] = cityContext.freshWater;
        input[960 + 35] = cityContext.forest;
        input[960 + 36] = cityContext.desertSnow;
        input[960 + 37] = cityContext.resourceTiles;
        input[960 + 38] = cityContext.mineralResources;
        input[960 + 39] = cityContext.cityAnchor;
        input[960 + 40] = cityContext.settlerAnchor;
        input[960 + 41] = this.clamp((typeof _game_state != 'undefined' ? _game_state.money : 0) / 50, 0, 1);
        input[960 + 42] = this.normalizeCount(typeof _game_state != 'undefined' ? _game_state.lastAccountIncome : 0, 50);
        input[960 + 43] = this.normalizeCount(typeof _game_state != 'undefined' ? _game_state.lastMaintenance : 0, 50);
        this.fillStrategyBirdsviewInput(input);
        return input;
    }

    fillStrategyBirdsviewInput(input)
    {
        if (!input || input.length < this.strategyInputWidth || typeof _birdsview == 'undefined' || !_birdsview.strategyInputValues) {
            return;
        }
        var birdsview = _birdsview.strategyInputValues();
        for (var k = 0; k < Math.min(2500, birdsview.length); k++) {
            input[1024 + k] = birdsview[k];
        }
    }

    buildTacticsInput(ownerTeam = 0, focusPoints = null)
    {
        var input = this.zeroInput();
        var strategyFocus = this.strategyFocusForForwarding(focusPoints);
        var troops = this.visibleUnitRecords(ownerTeam, function(unit) { return unit.type == 2; }).slice(0, 8);
        this.lastTacticsGroupIds = [];
        for (var n = 0; n < troops.length; n++) {
            var unit = troops[n].unit;
            var base = n * 120;
            this.lastTacticsGroupIds[n] = { unitIndex: troops[n].index, team: unit.team || 0 };
            input[base + 0] = this.relationToTeam(ownerTeam, unit.team || 0);
            input[base + 1] = this.unitTypeIndex(unit) / 32;
            input[base + 2] = 1 / 16;
            input[base + 3] = this.normalizedCoord(unit.coord.i);
            input[base + 4] = this.normalizedCoord(unit.coord.j);
            input[base + 5] = unit.gotoPath && unit.gotoPath.length ? this.normalizedCoord(unit.gotoPath[0].i - unit.coord.i) : 0;
            input[base + 6] = unit.gotoPath && unit.gotoPath.length ? this.normalizedCoord(unit.gotoPath[0].j - unit.coord.j) : 0;
            input[base + 7] = 1;
            input[base + 8] = this.normalizeCount(unit.attack || 0, 10);
            input[base + 9] = this.normalizeCount(unit.defense || 0, 10);
            input[base + 10] = this.normalizeCount(unit.speed || 0, 5);
            input[base + 11] = this.normalizeCount(unit.viewRange || 0, 8);
            input[base + 12] = this.terrainTypeAt(unit.coord.i, unit.coord.j) / 8;
            input[base + 13] = typeof _map != 'undefined' && _map.hasRoad && _map.hasRoad(unit.coord.i, unit.coord.j) ? 1 : 0;
            input[base + 14] = unit.team == ownerTeam ? 0 : this.normalizeCount((unit.attack || 0) + (unit.defense || 0), 20);
            this.encodeLocalMapWindow(input, base + 16, unit.coord, ownerTeam);
        }

        this.fillGenericSituation(input, ownerTeam, 0);
        input[960 + 20] = this.militaryBalance(ownerTeam);
        input[960 + 21] = this.normalizeCount(this.countMilitary(ownerTeam), 64);
        input[960 + 22] = this.normalizeCount(this.countEnemyMilitary(ownerTeam), 64);
        input[960 + 23] = strategyFocus.x;
        input[960 + 24] = strategyFocus.y;
        input[960 + 25] = strategyFocus.militaryPriority;
        input[960 + 26] = strategyFocus.defensePriority;
        return input;
    }

    buildActionInput(ownerTeam = 0, strategyFocus = null, workerFocus = null)
    {
        var input = this.zeroInput();
        var forwardedFocus = this.strategyFocusForForwarding(strategyFocus);
        var forwardedWorkerFocus = this.strategyFocusForForwarding(workerFocus);
        var records = this.actionUnitRecords(ownerTeam);
        this.lastActionUnitIndices = [];
        this.lastActionRecordSummaries = [];
        for (var n = 0; n < records.length; n++) {
            var unit = records[n].unit;
            var base = n * 120;
            this.lastActionUnitIndices[n] = records[n].index;
            this.lastActionRecordSummaries[n] = this.unitSummary(records[n].index);
            input[base + 0] = this.unitTypeIndex(unit) / 32;
            input[base + 1] = this.unitStateCode(unit);
            input[base + 2] = this.normalizedCoord(unit.coord.i);
            input[base + 3] = this.normalizedCoord(unit.coord.j);
            input[base + 4] = 1;
            input[base + 5] = this.normalizeCount(unit.speed || 0, 5);
            input[base + 6] = this.relationToTeam(ownerTeam, unit.team || 0);
            input[base + 7] = this.unitHasTask(unit) ? 1 : 0;
            input[base + 8] = this.actionImmediateSignal(records[n].index);
            input[base + 9] = this.terrainTypeAt(unit.coord.i, unit.coord.j) / 8;
            input[base + 10] = this.resourceSignalAt(unit.coord.i, unit.coord.j, ownerTeam);
            input[base + 11] = unit.unitTypeId == 'worker'
                ? this.nearbyWorkerJobSignal(records[n].index, ownerTeam)
                : this.nearbyResourceScore(unit.coord, ownerTeam, 2);
            input[base + 12] = this.hasFreshWaterNearTile(unit.coord.i, unit.coord.j) ? 1 : 0;
            input[base + 13] = this.cityPlotScore(unit.coord.i, unit.coord.j, ownerTeam);
            input[base + 14] = this.normalizeCount(unit.aiSettlerTurns || 0, this.settlerBuildCityTurnLimit);
            input[base + 15] = this.nearestFriendlyCityDistanceSignal(unit.coord, ownerTeam);
            this.encodeLocalMapWindow(input, base + 16, unit.coord, ownerTeam);
            if (this.isMilitaryUnit(unit)) {
                var relativeFocus = this.strategyFocusRelativeToCoord(forwardedFocus, unit.coord);
                input[base + 97] = relativeFocus.x;
                input[base + 98] = relativeFocus.y;
                input[base + 99] = relativeFocus.militaryPriority;
                input[base + 100] = relativeFocus.defensePriority;
            }
            else if (unit.unitTypeId == 'worker') {
                var relativeWorkerFocus = this.strategyFocusRelativeToCoord(forwardedWorkerFocus, unit.coord);
                input[base + 97] = relativeWorkerFocus.x;
                input[base + 98] = relativeWorkerFocus.y;
                input[base + 99] = 0;
                input[base + 100] = relativeWorkerFocus.defensePriority;
                input[base + 101] = this.normalizeCount(this.countFriendlyWorkersNear(unit.coord, ownerTeam, 4, unit), 2);
            }
        }
        this.fillGenericSituation(input, ownerTeam, 0);
        return input;
    }

    actionUnitRecords(ownerTeam = 0)
    {
        var self = this;
        var all = this.sortedUnits(function(unit) {
            return unit && unit.type != 3 && (unit.team || 0) == ownerTeam
                && unit.coord && self.isTileSeenByUser(unit.coord.i, unit.coord.j, ownerTeam);
        });
        var selected = [];
        var used = {};
        function addWhere(predicate) {
            for (var n = 0; n < all.length && selected.length < 8; n++) {
                var record = all[n];
                if (used[record.index] || !predicate(record.unit, record.index)) {
                    continue;
                }
                selected.push(record);
                used[record.index] = true;
            }
        }

        // The Action engine has only 8 records. Workers need explicit priority
        // because otherwise early settlers/explorers can occupy all slots and the
        // model never receives any worker input to command.
        addWhere(function(unit) { return unit.unitTypeId == 'worker' && !self.unitHasTask(unit); });
        addWhere(function(unit) { return unit.unitTypeId == 'settlers' && !self.unitHasTask(unit); });
        addWhere(function(unit) { return unit.type == 2 && !self.unitHasTask(unit); });
        addWhere(function(unit) { return unit.unitTypeId == 'explorer' && !self.unitHasTask(unit); });
        addWhere(function(unit) { return !self.unitHasTask(unit); });
        addWhere(function(unit) { return unit.unitTypeId == 'worker'; });
        addWhere(function() { return true; });
        return selected;
    }

    isMilitaryUnit(unit)
    {
        return unit && unit.type == 2;
    }

    strategyFocusForForwarding(strategyFocus = null)
    {
        var focus = strategyFocus || this.lastStrategyMilitaryFocus;
        if (!focus) {
            return { x: 0, y: 0, militaryPriority: 0, defensePriority: 0 };
        }
        return {
            x: this.clamp(focus.x || 0, -1, 1),
            y: this.clamp(focus.y || 0, -1, 1),
            militaryPriority: this.clamp(focus.militaryPriority || 0, -1, 1),
            defensePriority: this.clamp(focus.defensePriority || 0, -1, 1),
        };
    }

    strategyFocusRelativeToCoord(strategyFocus, coord)
    {
        var focus = this.strategyFocusForForwarding(strategyFocus);
        if (!coord) {
            return { x: 0, y: 0, militaryPriority: focus.militaryPriority, defensePriority: focus.defensePriority };
        }
        var focusI = this.denormalizedCoord(focus.x);
        var focusJ = this.denormalizedCoord(focus.y);
        return {
            x: this.clamp((focusI - coord.i) / 4, -1, 1),
            y: this.clamp((focusJ - coord.j) / 4, -1, 1),
            militaryPriority: focus.militaryPriority,
            defensePriority: focus.defensePriority,
        };
    }

    buildEconomicsInput(ownerTeam = 0, productionDemands = null)
    {
        var input = this.zeroInput();
        var demands = this.normalizedProductionDemands(productionDemands || this.lastStrategyProductionDemands || this.heuristicProductionDemands(ownerTeam));
        var cities = this.freeCityRecords(ownerTeam).slice(-8);
        var allCities = this.sortedUnits(function(unit) {
            return (unit.team || 0) == ownerTeam && unit.type == 3;
        });
        var self = this;
        var idleMovable = this.sortedUnits(function(unit) {
            return (unit.team || 0) == ownerTeam && unit.can_move && !self.unitHasTask(unit);
        }).length;
        var military = this.countMilitary(ownerTeam);
        var enemyMilitary = this.countEnemyMilitary(ownerTeam);

        this.lastEconomicsCityIndices = [];
        for (var n = 0; n < cities.length; n++) {
            var record = cities[n];
            var city = record.unit;
            if (typeof _city_economy != 'undefined') {
                _city_economy.ensureCity(city);
            }
            var base = n * 120;
            this.lastEconomicsCityIndices[n] = record.index;
            input[base + 0] = this.normalizedCoord(city.coord.i);
            input[base + 1] = this.normalizedCoord(city.coord.j);
            input[base + 2] = this.normalizeCount(city.economy ? city.economy.citizens.length : 1, 20);
            input[base + 3] = this.normalizeCount(city.economy ? city.economy.lastIncome.food : 0, 20);
            input[base + 4] = this.normalizeCount(city.economy ? city.economy.lastIncome.production : 0, 20);
            input[base + 5] = this.normalizeCount(city.economy ? city.economy.lastIncome.money : 0, 20);
            input[base + 6] = this.normalizeCount(city.economy ? city.economy.foodStored : 0, 50);
            input[base + 7] = this.normalizeCount(city.economy ? city.economy.foodConsumption : 0, 20);
            input[base + 8] = this.normalizeCount(city.economy ? city.economy.turnsToNewCitizen : 0, 20);
            input[base + 9] = this.normalizeCount(city.cityProperties ? city.cityProperties.productionStored : 0, 100);
            input[base + 10] = this.isFrontierCity(city, ownerTeam) ? 1 : 0;
            input[base + 11] = _current_game && _current_game.isSeasideCity && _current_game.isSeasideCity(city) ? 1 : 0;
            input[base + 12] = this.normalizeCount(this.cityGarrisonStrength(city, ownerTeam), 30);
            input[base + 13] = city.production == null ? 1 : 0;
            input[base + 14] = this.cityLegalProductionCount(city);
            input[base + 15] = this.cityEconomicRole(city, ownerTeam);
            this.encodeEconomicsTileWindow(input, base + 16, city.coord, ownerTeam);
            this.encodeCityProductionLegality(input, base + 97, city);
        }
        this.fillGenericSituation(input, ownerTeam, 0);
        input[960 + 1] = this.normalizeCount(allCities.length, 16);
        input[960 + 2] = this.normalizeCount(cities.length, 8);
        input[960 + 5] = this.normalizeCount(military, 32);
        input[960 + 6] = this.normalizeCount(enemyMilitary, 32);
        input[960 + 14] = this.normalizeCount(idleMovable, 16);
        input[960 + 15] = this.normalizeCount(this.countUnitsByType(ownerTeam, 'worker'), 8);
        input[960 + 16] = this.openedTechnologyRate();
        input[960 + 20] = demands.settlers;
        input[960 + 21] = demands.worker;
        input[960 + 22] = demands.explorer;
        input[960 + 23] = demands.military;
        input[960 + 24] = this.normalizeCount(typeof _game_state != 'undefined' ? _game_state.money : 0, 200);
        input[960 + 25] = this.normalizeCount(typeof _game_state != 'undefined' ? _game_state.lastAccountIncome : 0, 50);
        input[960 + 26] = this.normalizeCount(typeof _game_state != 'undefined' ? _game_state.lastMaintenance : 0, 50);
        var workerEconomy = this.economicsWorkerSignals(ownerTeam, allCities);
        for (var technologyIndex = 0; technologyIndex < workerEconomy.technologies.length; technologyIndex++) {
            input[960 + 27 + technologyIndex] = workerEconomy.technologies[technologyIndex];
            input[960 + 35 + technologyIndex] = workerEconomy.opportunities[technologyIndex];
            input[960 + 43 + technologyIndex] = workerEconomy.technologies[technologyIndex]
                * workerEconomy.opportunities[technologyIndex];
        }
        return input;
    }

    economicsWorkerSignals(ownerTeam, cityRecords = null)
    {
        // Economics slots 27..34 are individual technology flags. Slots 35..42
        // contain matching raw job opportunities, independent of technology, so
        // the model must learn that both signals are required before a Worker is useful.
        var technologies = [
            'Wheel',
            'Bronze Working',
            'Irrigation',
            'Animal Husbandry',
            'Mining',
            'Masonry',
            'Pottery',
            'Construction',
        ];
        var result = {
            technologies: new Array(technologies.length).fill(0),
            opportunities: new Array(technologies.length).fill(0),
        };
        for (var technologyIndex = 0; technologyIndex < technologies.length; technologyIndex++) {
            result.technologies[technologyIndex] = typeof _game_state != 'undefined'
                && _game_state.isTechnologyOpen(technologies[technologyIndex]) ? 1 : 0;
        }
        var cities = cityRecords || this.sortedUnits(function(unit) {
            return (unit.team || 0) == ownerTeam && unit.type == 3;
        });
        var seenTiles = {};
        var counts = new Array(technologies.length).fill(0);
        for (var cityIndex = 0; cityIndex < cities.length; cityIndex++) {
            var city = cities[cityIndex].unit || cities[cityIndex];
            if (!city || !city.coord) {
                continue;
            }
            for (var di = -4; di <= 4; di++) {
                for (var dj = -4; dj <= 4; dj++) {
                    var i = city.coord.i + di;
                    var j = city.coord.j + dj;
                    var key = i + ',' + j;
                    if (seenTiles[key] || i < 0 || j < 0 || i >= _map_size || j >= _map_size
                        || !this.isTileSeenByUser(i, j, ownerTeam)) {
                        continue;
                    }
                    seenTiles[key] = true;
                    var tile = this.economicsWorkerOpportunityAt(i, j);
                    for (var kind = 0; kind < counts.length; kind++) {
                        if (tile[kind]) {
                            counts[kind]++;
                        }
                    }
                }
            }
        }
        for (var opportunityIndex = 0; opportunityIndex < counts.length; opportunityIndex++) {
            result.opportunities[opportunityIndex] = this.normalizeCount(counts[opportunityIndex], 16);
        }
        return result;
    }

    economicsWorkerOpportunityAt(i, j)
    {
        var result = new Array(8).fill(0);
        if (typeof _current_game == 'undefined' || !_current_game || typeof _map == 'undefined' || !_map) {
            return result;
        }
        var terrain = this.terrainTypeAt(i, j);
        var isWater = terrain == 0;
        var isCity = _current_game.isCityTile && _current_game.isCityTile(i, j);
        if (isCity || isWater) {
            return result;
        }
        var hasModifier = function(name) {
            return _map.hasTerrainModifier && _map.hasTerrainModifier(i, j, name);
        };
        var resourceImprovement = _current_game.openedResourceImprovementForTile
            ? _current_game.openedResourceImprovementForTile(i, j) : null;

        result[0] = !_map.hasRoad || !_map.hasRoad(i, j); // Wheel -> road.
        result[1] = _current_game.isChoppableForestTerrain
            && _current_game.isChoppableForestTerrain(_map_terrain_tex[i][j]) ? 1 : 0; // Bronze Working -> chop.
        result[2] = terrain == 2 && (!_map.hasIrrigation || !_map.hasIrrigation(i, j))
            && _current_game.hasIrrigationSourceNear && _current_game.hasIrrigationSourceNear(i, j) ? 1 : 0;
        result[3] = (resourceImprovement == 'pasture' && !hasModifier('pasture'))
            || (resourceImprovement == 'camp' && !hasModifier('camp')) ? 1 : 0;
        result[4] = (terrain == 4 || terrain == 5) && !hasModifier('mine') ? 1 : 0;
        result[5] = (resourceImprovement == 'quarry' && !hasModifier('quarry'))
            || (!resourceImprovement && !hasModifier('cottage')) ? 1 : 0;
        result[6] = (resourceImprovement == 'plantation' && !hasModifier('plantation'))
            || (resourceImprovement == 'winery' && !hasModifier('winery')) ? 1 : 0;
        result[7] = !resourceImprovement && (!hasModifier('workshop') || !hasModifier('fortification')) ? 1 : 0;
        return result;
    }

    freeCityRecords(ownerTeam)
    {
        return this.sortedUnits(function(unit) {
            return (unit.team || 0) == ownerTeam && unit.type == 3 && unit.production == null;
        });
    }

    countUnitsByType(ownerTeam, unitTypeId)
    {
        return this.sortedUnits(function(unit) {
            return (unit.team || 0) == ownerTeam && unit.unitTypeId == unitTypeId;
        }).length;
    }

    countIdleWorkers(ownerTeam)
    {
        var self = this;
        return this.sortedUnits(function(unit) {
            return (unit.team || 0) == ownerTeam && unit.unitTypeId == 'worker' && !self.unitHasTask(unit);
        }).length;
    }

    cityPopulationForAI(city)
    {
        if (!city) {
            return 0;
        }
        if (typeof _city_economy != 'undefined') {
            _city_economy.ensureCity(city);
        }
        return city.economy && city.economy.citizens ? city.economy.citizens.length : 1;
    }

    smallestOwnCityWorkerTarget(ownerTeam)
    {
        var cities = this.sortedUnits(function(unit) {
            return (unit.team || 0) == ownerTeam && unit.type == 3 && unit.coord;
        });
        var best = null;
        for (var n = 0; n < cities.length; n++) {
            var city = cities[n].unit;
            var population = this.cityPopulationForAI(city);
            var workerCount = this.countFriendlyWorkersNear(city.coord, ownerTeam, 3);
            var score = population * 10 + workerCount * 3;
            if (!best || score < best.score) {
                best = { coord: city.coord, population: population, workers: workerCount, score: score };
            }
        }
        return best;
    }

    countFriendlyWorkersNear(coord, ownerTeam, radius, excludeUnit = null)
    {
        if (!coord) {
            return 0;
        }
        var count = 0;
        var records = this.visibleUnitRecords(ownerTeam, function(unit) {
            return (unit.team || 0) == ownerTeam && unit.unitTypeId == 'worker' && unit.coord;
        });
        for (var n = 0; n < records.length; n++) {
            var unit = records[n].unit;
            if (excludeUnit && unit === excludeUnit) {
                continue;
            }
            if (Math.max(Math.abs(unit.coord.i - coord.i), Math.abs(unit.coord.j - coord.j)) <= radius) {
                count++;
            }
        }
        return count;
    }

    knownMapRatioForUser(userId)
    {
        if (typeof _map_size == 'undefined') {
            return 0;
        }
        var seen = 0;
        var total = _map_size * _map_size;
        for (var i = 0; i < _map_size; i++) {
            for (var j = 0; j < _map_size; j++) {
                if (this.isTileSeenByUser(i, j, userId)) {
                    seen++;
                }
            }
        }
        return total ? seen / total : 0;
    }

    cityEconomicRole(city, ownerTeam)
    {
        if (!city || !city.economy) {
            return 0;
        }
        var food = city.economy.lastIncome.food || 0;
        var production = city.economy.lastIncome.production || 0;
        var money = city.economy.lastIncome.money || 0;
        var total = Math.max(1, food + production + money);
        return this.clamp((production - food) / total, -1, 1);
    }

    fillGenericSituation(input, ownerTeam, base = 0)
    {
        var b = 960 + base;
        var idleMovable = this.sortedUnits(function(unit) {
            return (unit.team || 0) == ownerTeam && unit.can_move;
        }).length;
        input[b + 0] = ownerTeam / 16;
        input[b + 1] = this.normalizeCount(this.sortedUnits(function(unit) { return (unit.team || 0) == ownerTeam && unit.type == 3; }).length, 16);
        input[b + 2] = this.normalizeCount(this.sortedUnits(function(unit) { return (unit.team || 0) == ownerTeam; }).length, 64);
        input[b + 3] = this.knownMapRatioForUser(ownerTeam);
        input[b + 4] = this.normalizeCount(this.countMilitary(ownerTeam), 64);
        input[b + 5] = this.normalizeCount(this.countEnemyMilitary(ownerTeam), 64);
        input[b + 6] = this.normalizeCount(typeof _game_state != 'undefined' ? _game_state.money : 0, 200);
        input[b + 7] = this.normalizeCount(typeof _game_state != 'undefined' ? _game_state.lastMoneyIncome : 0, 50);
        input[b + 8] = this.normalizeCount(typeof _game_state != 'undefined' ? _game_state.lastScienceIncome : 0, 50);
        input[b + 9] = typeof _game_state != 'undefined' ? (_game_state.scienceRate || 0) / 100 : 0;
        input[b + 10] = typeof _game_state != 'undefined' && _game_state.currentResearch
            ? this.normalizeCount(_game_state.technologyProgressValue(_game_state.currentResearch), _game_state.technologyCost(_game_state.currentResearch))
            : 0;
        input[b + 11] = this.normalizeCount(this.countResources('food', ownerTeam), 50);
        input[b + 12] = this.normalizeCount(this.countResources('production', ownerTeam), 50);
        input[b + 13] = this.normalizeCount(idleMovable, 32);
        input[b + 14] = this.normalizeCount(this.countUnitsByType(ownerTeam, 'settlers'), 8);
        input[b + 15] = this.normalizeCount(this.countUnitsByType(ownerTeam, 'worker'), 8);
    }

    techRatioForTeam(team, ownerTeam)
    {
        if (team != ownerTeam || typeof _game_state == 'undefined') {
            return 0;
        }
        var names = this.technologyNames();
        if (!names.length) {
            return 0;
        }
        var open = 0;
        for (var k = 0; k < names.length; k++) {
            if (_game_state.isTechnologyOpen(names[k])) {
                open++;
            }
        }
        return open / names.length;
    }

    cityLegalProductionCount(city)
    {
        var count = 0;
        if (!_current_game || !_current_game.unitTypes) {
            return 0;
        }
        for (var n = 0; n < Math.min(8, this.economicsProductionLabels.length); n++) {
            var unitType = _current_game.unitTypesById ? _current_game.unitTypesById[this.economicsProductionLabels[n]] : null;
            if (unitType && (!_current_game.canCityProduceUnit || _current_game.canCityProduceUnit(city, unitType))) {
                count++;
            }
        }
        return this.normalizeCount(count, 8);
    }

    encodeEconomicsTileWindow(input, base, coord, ownerTeam)
    {
        var n = 0;
        for (var di = -4; di <= 4; di++) {
            for (var dj = -4; dj <= 4; dj++) {
                input[base + n] = this.economicsTileSignal(coord.i + di, coord.j + dj, ownerTeam);
                n++;
            }
        }
    }

    economicsTileSignal(i, j, ownerTeam)
    {
        if (i < 0 || j < 0 || i >= _map_size || j >= _map_size || !this.isSeen(i, j, ownerTeam)) {
            return -0.2;
        }
        var terrain = this.terrainTypeAt(i, j);
        var signal = terrain / 16;
        signal += this.resourceSignalAt(i, j, ownerTeam) * 0.35;
        if (this.hasLandWaterSourceAt(i, j)) {
            signal += 0.18;
            if (terrain == 4 || terrain == 5) {
                signal += 0.08;
            }
        }
        if (typeof _map != 'undefined' && _map.hasRoad && _map.hasRoad(i, j)) signal += 0.08;
        if (typeof _map != 'undefined' && _map.hasIrrigation && _map.hasIrrigation(i, j)) signal += 0.12;
        if (typeof _map_terrain_mod != 'undefined' && _map_terrain_mod[i] && _map_terrain_mod[i][j]) {
            var mod = _map_terrain_mod[i][j];
            if (mod.mine || mod.workshop) signal += 0.12;
            if (mod.cottage || mod.hamlet || mod.village) signal += 0.12;
            if (mod.farm || mod.pasture || mod.plantation || mod.camp || mod.fishing_boats || mod.quarry || mod.winery) signal += 0.10;
        }
        return this.clamp(signal, -1, 1);
    }

    isFrontierCity(city, ownerTeam)
    {
        var enemy = this.nearestEnemyCoord(city ? city.coord : null, ownerTeam);
        if (!city || !enemy) {
            return false;
        }
        return Math.abs(city.coord.i - enemy.i) + Math.abs(city.coord.j - enemy.j) <= 12;
    }

    encodeCityProductionLegality(input, base, city)
    {
        var maxSlots = Math.min(this.economicsProductionLabels.length, 960 - base);
        for (var n = 0; n < maxSlots; n++) {
            var unitTypeId = this.economicsProductionLabels[n];
            var unitType = _current_game && _current_game.unitTypesById ? _current_game.unitTypesById[unitTypeId] : null;
            input[base + n] = unitType && (!_current_game.canCityProduceUnit || _current_game.canCityProduceUnit(city, unitType)) ? 1 : 0;
        }
    }

    decodeStrategyOutput(output, ownerTeam = this.activeUserId())
    {
        var best = this.bestStrategyCommand(output);
        var focuses = this.decodeStrategyFocusOutputs(output);
        var maxMilitaryFocus = this.maxMilitaryStrategyFocus(focuses);
        var maxWorkerFocus = this.maxWorkerStrategyFocus(focuses, ownerTeam);
        var productionDemands = this.strategyProductionDemandsFromOutput(output);
        var technologyPriorities = this.strategyTechnologyPrioritiesFromOutput(output);
        var scienceRate = this.strategyScienceRateFromOutput(output);
        return {
            type: this.strategyDecisionLabels[best.index],
            slot: best.slot,
            record: best.record,
            object: this.lastStrategyObjectIds ? this.lastStrategyObjectIds[best.record] : null,
            confidence: best.value,
            focuses: focuses,
            maxMilitaryFocus: maxMilitaryFocus,
            maxWorkerFocus: maxWorkerFocus,
            productionDemands: productionDemands,
            technologyPriorities: technologyPriorities,
            scienceRate: scienceRate,
            raw: best,
        };
    }

    strategyProductionDemandsFromOutput(output)
    {
        var settlers = this.clamp(output[64] || 0, 0, 1);
        var worker = this.clamp(output[65] || 0, 0, 1);
        var explorer = this.clamp(output[66] || 0, 0, 1);
        var military = this.clamp(1 - settlers - worker - explorer, 0, 1);
        return this.normalizedProductionDemands({
            settlers: settlers,
            worker: worker,
            explorer: explorer,
            military: military,
        });
    }

    strategyScienceRateFromOutput(output)
    {
        return this.clamp(output[67] || 0, 0, 1);
    }

    normalizedProductionDemands(demands)
    {
        demands = demands || {};
        var result = {
            settlers: this.clamp(demands.settlers || 0, 0, 1),
            worker: this.clamp(demands.worker || 0, 0, 1),
            explorer: this.clamp(demands.explorer || 0, 0, 1),
            military: this.clamp(demands.military || 0, 0, 1),
        };
        var sum = result.settlers + result.worker + result.explorer + result.military;
        if (sum <= 0.01) {
            return { settlers: 0.25, worker: 0.25, explorer: 0.15, military: 0.35 };
        }
        result.settlers /= sum;
        result.worker /= sum;
        result.explorer /= sum;
        result.military /= sum;
        return result;
    }

    productionDemandText(demands)
    {
        demands = this.normalizedProductionDemands(demands);
        return 'production demand settlers=' + this.fmt(demands.settlers)
            + ', worker=' + this.fmt(demands.worker)
            + ', explorer=' + this.fmt(demands.explorer)
            + ', military=' + this.fmt(demands.military);
    }

    strategyContextText()
    {
        var c = this.lastStrategyContext;
        if (!c) {
            return 'strategy context none';
        }
        return 'strategy context hills=' + this.fmt(c.hills)
            + ', mountains=' + this.fmt(c.mountains)
            + ', grass=' + this.fmt(c.grass)
            + ', water=' + this.fmt(c.water)
            + ', forest=' + this.fmt(c.forest)
            + ', fresh=' + this.fmt(c.freshWater)
            + ', animals=' + this.fmt(c.animalResources)
            + ', stone=' + this.fmt(c.stoneResources)
            + ', crops=' + this.fmt(c.cropResources)
            + ', minerals=' + this.fmt(c.mineralResources)
            + ', resources=' + this.fmt(c.resourceTiles)
            + ', city=' + this.fmt(c.cityAnchor)
            + ', settler=' + this.fmt(c.settlerAnchor);
    }

    strategyTechnologyPrioritiesFromOutput(output)
    {
        var result = [];
        for (var k = 0; k < this.strategyTechnologyLabels.length; k++) {
            result.push({
                name: this.strategyTechnologyLabels[k],
                priority: this.clamp(output[68 + k] || 0, -1, 1),
            });
        }
        result.sort(function(a, b) { return b.priority - a.priority; });
        return result;
    }

    technologyPriorityText(priorities)
    {
        if (!priorities || !priorities.length) {
            return 'technology priorities none';
        }
        return 'technology priorities ' + priorities.map(function(item) {
            return item.name + '=' + this.fmt(item.priority);
        }, this).join(', ');
    }

    decodeStrategyFocusOutputs(output)
    {
        var focuses = [];
        for (var record = 0; record < 8; record++) {
            var base = record * 8;
            var object = this.lastStrategyObjectIds ? this.lastStrategyObjectIds[record] : null;
            focuses.push({
                record: record,
                civilizationId: object && object.team != undefined ? object.team : record,
                x: this.clamp(output[base + 0] || 0, -1, 1),
                y: this.clamp(output[base + 1] || 0, -1, 1),
                militaryPriority: this.clamp(output[base + 2] || 0, -1, 1),
                defensePriority: this.clamp(output[base + 3] || 0, -1, 1),
            });
        }
        return focuses;
    }

    maxMilitaryStrategyFocus(focuses)
    {
        var best = null;
        for (var n = 0; n < focuses.length; n++) {
            if (!best || focuses[n].militaryPriority > best.militaryPriority) {
                best = focuses[n];
            }
        }
        return best || { record: -1, civilizationId: null, x: 0, y: 0, militaryPriority: 0, defensePriority: 0 };
    }

    maxWorkerStrategyFocus(focuses, ownerTeam = this.activeUserId())
    {
        var best = null;
        for (var n = 0; n < focuses.length; n++) {
            var object = this.lastStrategyObjectIds ? this.lastStrategyObjectIds[focuses[n].record] : null;
            if (!object || object.kind != 'civilization' || object.team != ownerTeam) {
                continue;
            }
            if (!best || focuses[n].defensePriority > best.defensePriority) {
                best = focuses[n];
            }
        }
        if (!best || best.defensePriority < 0.25) {
            return { record: -1, civilizationId: ownerTeam, x: 0, y: 0, militaryPriority: 0, defensePriority: 0 };
        }
        return best;
    }

    // Decoder 1/3: strategy output to game-state-level plan, research, and production focus.
    applyStrategyOutput(output, ownerTeam = 0)
    {
        var decision = this.decodeStrategyOutput(output, ownerTeam);
        if (typeof _game_state == 'undefined') {
            return decision;
        }
        _game_state.aiStrategy = decision;
        _game_state.aiStrategyFocus = decision.maxMilitaryFocus;
        _game_state.aiWorkerFocus = decision.maxWorkerFocus;
        _game_state.aiProductionDemands = decision.productionDemands;
        this.lastStrategyFocuses = decision.focuses;
        this.lastStrategyMilitaryFocus = decision.maxMilitaryFocus;
        this.lastStrategyWorkerFocus = decision.maxWorkerFocus;
        this.lastStrategyProductionDemands = decision.productionDemands;
        var applied = [];
        this.log('U' + ownerTeam + ' Strategy parse: record ' + decision.record
            + ' slot ' + decision.slot
            + ' -> ' + decision.type
            + ' confidence=' + this.fmt(decision.confidence)
            + '; ' + this.focusText(decision.maxMilitaryFocus)
            + '; worker ' + this.focusText(decision.maxWorkerFocus)
            + '; ' + this.productionDemandText(decision.productionDemands)
            + '; science rate=' + Math.round(decision.scienceRate * 100) + '%'
            + '; ' + this.strategyContextText()
            + '; ' + this.technologyPriorityText(decision.technologyPriorities));

        if (_game_state.setScienceRate) {
            var modelScienceRate = Math.round(decision.scienceRate * 100);
            if (_game_state.scienceRate != modelScienceRate) {
                _game_state.setScienceRate(modelScienceRate);
                applied.push('science funding model rate -> ' + modelScienceRate + '%');
            }
        }

        var researchApplied = false;
        var currentResearchValid = _game_state.currentResearch
            && _game_state.canResearch(_game_state.currentResearch);
        var currentResearchProgress = currentResearchValid && _game_state.technologyProgressValue
            ? _game_state.technologyProgressValue(_game_state.currentResearch) : 0;
        if (!currentResearchValid || currentResearchProgress <= 0) {
            // Replace only an unstarted target. This clears legacy/default Mining
            // while preserving any technology that already has accumulated science.
            var previousResearch = currentResearchValid ? _game_state.currentResearch : null;
            _game_state.currentResearch = null;
            if (this.setResearchFromStrategyTechnology(decision.technologyPriorities)) {
                applied.push('research model technology priority -> ' + _game_state.currentResearch);
                researchApplied = true;
            }
            else if (previousResearch) {
                _game_state.currentResearch = previousResearch;
            }
        }

        if (!researchApplied && decision.type == 'research_food_technology') {
            if (this.setResearchFromList(['Irrigation', 'Pottery'])) {
                applied.push('research food path -> ' + _game_state.currentResearch);
            }
        }
        else if (!researchApplied && decision.type == 'research_production_technology') {
            if (this.setResearchFromList(['Mining', 'Masonry', 'Construction', 'Engineering'])) {
                applied.push('research production path -> ' + _game_state.currentResearch);
            }
        }
        else if (!researchApplied && decision.type == 'research_naval_technology') {
            if (this.setResearchFromList(['Sailing', 'Shipbuilding', 'Navigation', 'Astronomy'])) {
                applied.push('research naval path -> ' + _game_state.currentResearch);
            }
        }
        else if (decision.type == 'focus_anti_mounted_units') {
            if (this.setProductionFocus(ownerTeam, ['spearman', 'warrior', 'archer'])) {
                applied.push('city production focus -> spearman/warrior/archer');
            }
        }
        else if (decision.type == 'protect_expansion_point') {
            _game_state.aiStrategy.target = this.findExpansionTarget(ownerTeam);
            applied.push('expansion target -> ' + this.coordText(_game_state.aiStrategy.target));
            if (this.setProductionFocus(ownerTeam, ['settlers', 'warrior', 'explorer'])) {
                applied.push('city production focus -> settlers/warrior/explorer');
            }
        }
        else if (decision.type == 'declare_war_on_weak_neighbor') {
            _game_state.aiStrategy.target_civ_id = this.weakestEnemyTeam(ownerTeam);
            applied.push('target civ -> ' + _game_state.aiStrategy.target_civ_id);
        }
        else if (decision.type == 'resist_strongest_civ') {
            _game_state.aiStrategy.target_civ_id = this.strongestEnemyTeam(ownerTeam);
            applied.push('resist civ -> ' + _game_state.aiStrategy.target_civ_id);
        }
        else if (decision.type == 'improve_friendship') {
            _game_state.aiStrategy.target_civ_id = this.closestNeutralTeam(ownerTeam);
            applied.push('befriend civ -> ' + _game_state.aiStrategy.target_civ_id);
        }
        this.log('U' + ownerTeam + ' Strategy apply: ' + (applied.length ? applied.join('; ') : 'no direct game-state change'));
        return decision;
    }

    decodeTacticsOutput(output)
    {
        var best = this.bestObjectCommand(output, this.tacticsCommandLabels);
        return {
            command: this.tacticsCommandLabels[best.index],
            slot: best.slot,
            record: best.record,
            group: this.lastTacticsGroupIds ? this.lastTacticsGroupIds[best.record] : null,
            confidence: best.value,
            target: null,
            raw: best,
        };
    }

    // Decoder 2/3: tactics output to group-level movement/state orders for military units.
    applyTacticsOutput(output, ownerTeam = 0)
    {
        var decision = this.decodeTacticsOutput(output);
        if (typeof _game_state != 'undefined') {
            _game_state.aiTactics = decision;
        }
        this.log('U' + ownerTeam + ' Tactics parse: record ' + decision.record
            + ' slot ' + decision.slot
            + ' -> ' + decision.command
            + ' confidence=' + this.fmt(decision.confidence));
        var units = this.sortedUnits(function(unit) {
            return (unit.team || 0) == ownerTeam && unit.type == 2 && unit.can_move;
        });
        var target = this.tacticsTargetForDecision(decision, ownerTeam);
        var applied = [];
        for (var n = 0; n < units.length; n++) {
            var k = units[n].index;
            if (this.unitHasTask(_units[k])) {
                continue;
            }
            if (decision.command == 'hold' || decision.command == 'defend') {
                if (_current_game && _current_game.setUnitState) {
                    _current_game.setUnitState(k, decision.command == 'hold' ? 'waiting' : 'fortified');
                    applied.push(this.unitSummary(k) + ' -> ' + _units[k].state);
                }
                continue;
            }
            if (decision.command == 'retreat') {
                target = this.nearestFriendlyCityCoord(_units[k].coord, ownerTeam) || target;
            }
            if (target && _current_game && _current_game.buildPath && _current_game.assignPath) {
                var path = _current_game.buildPath(k, target);
                if (path.length) {
                    _current_game.assignPath(k, path);
                    applied.push(this.unitSummary(k) + ' path to ' + this.coordText(path[path.length - 1]) + ' steps=' + path.length);
                }
            }
        }
        this.log('U' + ownerTeam + ' Tactics apply: ' + (applied.length ? applied.join('; ') : 'no military orders applied'));
        _fulldraw = 1;
        return decision;
    }

    decodeActionOutput(output)
    {
        var commands = [];
        for (var record = 0; record < 8; record++) {
            var base = record * 8;
            var unitIndex = this.lastActionUnitIndices[record];
            var unit = unitIndex != undefined && typeof _units != 'undefined' ? _units[unitIndex] : null;
            var legal = this.actionLegalCommandIndices(unit).map(function(index) { return base + index; });
            var best = this.argmaxSlots(output, legal);
            var commandIndex = best.slot - base;
            commands.push({
                record: record,
                unitIndex: unitIndex,
                command: this.actionCommandLabels[commandIndex],
                slot: best.slot,
                confidence: best.value,
                legalCommands: legal.map(function(slot) { return this.actionCommandLabels[slot - base]; }, this),
                target: null,
                aux: 0,
                priority: output[64] || 0,
            });
        }
        return commands;
    }

    actionLegalCommandIndices(unit)
    {
        if (!unit) {
            return [0, 1];
        }
        if (unit.unitTypeId == 'settlers') {
            return [0, 1, 2];
        }
        if (unit.unitTypeId == 'worker') {
            var commands = [0, 1];
            if (typeof _current_game != 'undefined' && _current_game) {
                if ((_current_game.canBuildRoad && _current_game.canBuildRoad(this.unitIndex(unit)))
                    || (_current_game.canUseRoadTo && _current_game.canUseRoadTo(this.unitIndex(unit)))) {
                    commands.push(3);
                }
                if (_current_game.canBuildIrrigation && _current_game.canBuildIrrigation(this.unitIndex(unit))) {
                    commands.push(4);
                }
                if (_current_game.canChopForest && _current_game.canChopForest(this.unitIndex(unit))) {
                    commands.push(5);
                }
                if (_current_game.workerTileBuildingMenuOptions
                    && _current_game.workerTileBuildingMenuOptions(this.unitIndex(unit)).length) {
                    commands.push(6);
                }
            }
            return commands;
        }
        if (unit.unitTypeId == 'explorer') {
            return [0, 1];
        }
        if (unit.type == 2) {
            return [0, 1, 7];
        }
        return [0, 1];
    }

    chooseWorkerTileBuildingForAI(k, buildings)
    {
        if (!buildings || !buildings.length || typeof _units == 'undefined' || !_units[k]) {
            return null;
        }
        var unit = _units[k];
        var terrain = this.terrainTypeAt(unit.coord.i, unit.coord.j);
        if (typeof _current_game != 'undefined' && _current_game && _current_game.openedResourceImprovementForTile) {
            var resourceBuilding = _current_game.openedResourceImprovementForTile(unit.coord.i, unit.coord.j);
            if (resourceBuilding && buildings.indexOf(resourceBuilding) != -1) {
                return resourceBuilding;
            }
        }
        var preferred = [];
        if (terrain == 4 || terrain == 5) {
            preferred.push('mine');
        }
        if (terrain == 2 || terrain == 7) {
            preferred.push('cottage');
        }
        preferred.push('workshop');
        preferred.push('fortification');
        for (var n = 0; n < preferred.length; n++) {
            if (buildings.indexOf(preferred[n]) != -1) {
                return preferred[n];
            }
        }
        return buildings[0];
    }

    workerGotoTarget(k, ownerTeam)
    {
        var unit = _units[k];
        if (!unit || unit.unitTypeId != 'worker' || !unit.coord) {
            return null;
        }
        var best = null;
        var bestScore = -Infinity;
        var radius = 6;
        for (var di = -radius; di <= radius; di++) {
            for (var dj = -radius; dj <= radius; dj++) {
                if (di == 0 && dj == 0) {
                    continue;
                }
                var i = unit.coord.i + di;
                var j = unit.coord.j + dj;
                if (i < 0 || j < 0 || i >= _map_size || j >= _map_size || !this.isTileSeenByUser(i, j, ownerTeam)) {
                    continue;
                }
                if (typeof _game != 'undefined' && _game.canUnitEnterTile && !_game.canUnitEnterTile(k, i, j)) {
                    continue;
                }
                var job = this.workerTileJobScore(i, j, ownerTeam);
                if (!job || job.score <= 0) {
                    continue;
                }
                var pathDistance = Math.max(Math.abs(di), Math.abs(dj));
                var cityDistance = this.nearestFriendlyCityTileDistance(new Coord(i, j), ownerTeam);
                var cityScore = cityDistance == null ? 0 : this.clamp((8 - cityDistance) / 8, 0, 1);
                var score = job.score + cityScore * 0.85 - pathDistance * 0.18;
                if (score > bestScore) {
                    bestScore = score;
                    best = new Coord(i, j);
                    best.workerJob = job.name;
                    best.workerJobScore = score;
                }
            }
        }
        return best;
    }

    nearbyWorkerJobSignal(k, ownerTeam)
    {
        // Action input[11] for Workers summarizes the strongest legal job on a
        // nearby tile. This includes empty-terrain jobs such as mines and cottages.
        var target = this.workerGotoTarget(k, ownerTeam);
        return target ? this.clamp((target.workerJobScore || 0) / 8, 0, 1) : 0;
    }

    workerStrategyTargetForUnit(unit, ownerTeam)
    {
        var focus = this.strategyFocusForForwarding(this.lastStrategyWorkerFocus);
        if (!unit || unit.unitTypeId != 'worker' || focus.defensePriority < 0.25) {
            return null;
        }
        var focusCoord = new Coord(this.denormalizedCoord(focus.x), this.denormalizedCoord(focus.y));
        return this.nearestUnitCoord(focusCoord, function(candidate) {
            return (candidate.team || 0) == ownerTeam && candidate.type == 3;
        }, ownerTeam);
    }

    workerTileJobScore(i, j, ownerTeam)
    {
        var terrain = this.terrainTypeAt(i, j);
        var isWater = terrain == 0;
        if (this.isCityTileForAI(i, j, ownerTeam)) {
            return null;
        }
        var resourceJob = this.openedResourceImprovementForTileAI(i, j, ownerTeam);
        if (resourceJob && this.canWorkerBuildNamedTileJob(i, j, resourceJob)) {
            return { name: resourceJob, score: 6.0 + this.resourceSignalAt(i, j, ownerTeam) };
        }
        if (!isWater && this.canResearchOrHas('Irrigation') && terrain == 2
            && !(typeof _map != 'undefined' && _map.hasIrrigation && _map.hasIrrigation(i, j))
            && this.hasFreshWaterNearTile(i, j)) {
            return { name: 'irrigate', score: 4.4 };
        }
        if (!isWater && this.canResearchOrHas('Bronze Working') && this.isChoppableForestAt(i, j)
            && this.resourceSignalAt(i, j, ownerTeam) <= 0) {
            return { name: 'chop_forest', score: 3.9 };
        }
        if (!isWater && this.canWorkerBuildNamedTileJob(i, j, 'mine') && (terrain == 4 || terrain == 5)) {
            return { name: 'mine', score: 3.7 };
        }
        if (!isWater && this.canWorkerBuildNamedTileJob(i, j, 'cottage') && (terrain == 2 || terrain == 7)) {
            return { name: 'cottage', score: 3.2 };
        }
        if (!isWater && this.canWorkerBuildNamedTileJob(i, j, 'workshop')) {
            return { name: 'workshop', score: 2.6 };
        }
        if (!isWater && this.canResearchOrHas('Wheel')
            && !(typeof _map != 'undefined' && _map.hasRoad && _map.hasRoad(i, j))) {
            return { name: 'road', score: 1.8 };
        }
        return null;
    }

    canWorkerBuildNamedTileJob(i, j, building)
    {
        if (this.isCityTileForAI(i, j)) {
            return false;
        }
        var terrain = this.terrainTypeAt(i, j);
        var isWater = terrain == 0;
        if (building == 'pasture') return !isWater && this.canResearchOrHas('Animal Husbandry') && !this.hasTileModifier(i, j, building);
        if (building == 'farm') return !isWater && this.canResearchOrHas('Irrigation') && !this.hasTileModifier(i, j, building);
        if (building == 'plantation') return !isWater && this.canResearchOrHas('Pottery') && !this.hasTileModifier(i, j, building);
        if (building == 'camp') return !isWater && this.canResearchOrHas('Animal Husbandry') && !this.hasTileModifier(i, j, building);
        if (building == 'fishing_boats') return isWater && this.canResearchOrHas('Sailing') && !this.hasTileModifier(i, j, building);
        if (building == 'quarry') return !isWater && this.canResearchOrHas('Masonry') && !this.hasTileModifier(i, j, building);
        if (building == 'winery') return !isWater && this.canResearchOrHas('Pottery') && !this.hasTileModifier(i, j, building);
        if (building == 'fortification') return !isWater && this.canResearchOrHas('Construction') && !this.hasTileModifier(i, j, building);
        if (building == 'cottage') return !isWater && this.canResearchOrHas('Masonry') && !this.hasTileModifier(i, j, building);
        if (building == 'workshop') return !isWater && this.canResearchOrHas('Construction') && !this.hasTileModifier(i, j, building);
        if (building == 'mine') return !isWater && this.canResearchOrHas('Mining') && (terrain == 4 || terrain == 5) && !this.hasTileModifier(i, j, building);
        return false;
    }

    isCityTileForAI(i, j, ownerTeam = null)
    {
        if (typeof _units == 'undefined') {
            return false;
        }
        for (var k = 0; k < _units.length; k++) {
            var unit = _units[k];
            if (!unit || !unit.coord || (unit.type != 3 && unit.unitTypeId != 'city')) {
                continue;
            }
            if (ownerTeam != null && (unit.team || 0) != ownerTeam) {
                continue;
            }
            if (unit.coord.i == i && unit.coord.j == j) {
                return true;
            }
        }
        return false;
    }

    openedResourceImprovementForTileAI(i, j, ownerTeam)
    {
        if (typeof _current_game != 'undefined' && _current_game && _current_game.openedResourceImprovementForTile) {
            return _current_game.openedResourceImprovementForTile(i, j);
        }
        if (typeof _map_resource == 'undefined' || typeof _resource_types == 'undefined'
            || !_map_resource[i] || !_map_resource[i][j] || !_map_resource[i][j].type
            || !this.isResourceVisible(i, j, ownerTeam)) {
            return null;
        }
        var resource = _resource_types[_map_resource[i][j].type];
        var id = resource ? resource.id : '';
        if (/cattle|sheep|horses/.test(id)) return 'pasture';
        if (/deer|furs|ivory|amber|honey/.test(id)) return 'camp';
        if (/rice|wheat/.test(id)) return 'farm';
        if (/bananas|citrus|cotton|dyes|incense|olives|silk|spices|sugar|tea/.test(id)) return 'plantation';
        if (/crabs|fish|pearls|turtles|whales/.test(id)) return 'fishing_boats';
        if (/stone|gypsum|marble|salt/.test(id)) return 'quarry';
        if (/wine/.test(id)) return 'winery';
        if (/copper|diamonds|silver|iron|gold|gems/.test(id)) return 'mine';
        return null;
    }

    hasTileModifier(i, j, modifier)
    {
        return typeof _map != 'undefined' && _map.hasTerrainModifier
            ? _map.hasTerrainModifier(i, j, modifier)
            : !!(typeof _map_terrain_mod != 'undefined' && _map_terrain_mod[i] && _map_terrain_mod[i][j] && _map_terrain_mod[i][j][modifier]);
    }

    canResearchOrHas(name)
    {
        return typeof _game_state == 'undefined' || !_game_state || !_game_state.isTechnologyOpen
            || _game_state.isTechnologyOpen(name);
    }

    isChoppableForestAt(i, j)
    {
        if (typeof _current_game != 'undefined' && _current_game && _current_game.isChoppableForestTerrain
            && typeof _map_terrain_tex != 'undefined') {
            return _current_game.isChoppableForestTerrain(_map_terrain_tex[i][j]);
        }
        var raw = this.terrainRawAt(i, j);
        return (raw & 0x0F) == 6 || raw == 4 + (1 << 4) || raw == 4 + ((1 + 4) << 4);
    }

    nearestFriendlyCityTileDistance(coord, ownerTeam)
    {
        var city = this.nearestFriendlyCityCoord(coord, ownerTeam);
        if (!city || !coord) {
            return null;
        }
        return Math.abs(city.i - coord.i) + Math.abs(city.j - coord.j);
    }

    // Decoder 3/3: action output to concrete unit commands.
    applyActionOutput(output, ownerTeam = 0)
    {
        var commands = this.decodeActionOutput(output);
        if (typeof _game_state != 'undefined') {
            _game_state.aiAction = commands;
        }
        this.log('U' + ownerTeam + ' Action parse: ' + commands.length + ' command records');
        if (this.lastActionRecordSummaries && this.lastActionRecordSummaries.length) {
            this.log('U' + ownerTeam + ' Action input records: ' + this.lastActionRecordSummaries.join('; '));
        }
        for (var n = 0; n < commands.length; n++) {
            var command = commands[n];
            var prefix = 'U' + ownerTeam + ' Action r' + command.record + ': ';
            if (command.unitIndex == undefined) {
                this.log(prefix + 'no unit assigned -> ' + command.command + ' confidence=' + this.fmt(command.confidence));
                continue;
            }
            this.log(prefix + this.unitSummary(command.unitIndex)
                + ' engine command=' + command.command
                + ' score=' + this.fmt(command.confidence)
                + ' legal=' + command.legalCommands.join('/'));
            var k = command.unitIndex;
            if (k == undefined || !_units[k] || (_units[k].team || 0) != ownerTeam) {
                this.log(prefix + 'skipped: unit missing or belongs to another user');
                continue;
            }
            if (this.applyUnitCommand(k, command)) {
                this.log(prefix + 'applied ' + command.command
                    + (command.target ? ' target=' + this.coordText(command.target) : '')
                    + (command.pathLength != undefined ? ' pathSteps=' + command.pathLength : '')
                    + (command.appliedState ? ' state=' + command.appliedState : '')
                    + (command.selectedTarget && command.selectedTarget.workerJob ? ' workerJob=' + command.selectedTarget.workerJob : ''));
            }
            else {
                this.log(prefix + 'not applied: ' + (command.failureReason || 'game rule rejected command'));
            }
        }
        _fulldraw = 1;
        return commands;
    }

    decodeEconomicsOutput(output)
    {
        var decisions = [];
        for (var record = 0; record < 8; record++) {
            var base = record * 8;
            var best = this.argmax(output, base, Math.min(8, this.economicsProductionLabels.length));
            decisions.push({
                record: record,
                cityIndex: this.lastEconomicsCityIndices[record],
                unitTypeId: this.economicsProductionLabels[best.index],
                slot: best.slot,
                confidence: best.value,
                priority: output[64] || 0,
            });
        }
        return decisions;
    }

    applyEconomicsOutput(output, ownerTeam = 0)
    {
        var decisions = this.decodeEconomicsOutput(output);
        var applied = [];
        if (typeof _game_state != 'undefined') {
            _game_state.aiEconomics = decisions;
        }
        this.log('U' + ownerTeam + ' Economics parse: ' + decisions.length + ' city command records');
        for (var n = 0; n < decisions.length; n++) {
            var decision = decisions[n];
            var prefix = 'U' + ownerTeam + ' Economics r' + decision.record + ': ';
            this.log(prefix + this.citySummary(decision.cityIndex)
                + ' engine production=' + decision.unitTypeId
                + ' confidence=' + this.fmt(decision.confidence));
            if (decision.confidence < -0.95) {
                this.log(prefix + 'skipped: confidence below -0.95');
                continue;
            }
            if (this.applyCityProductionDecision(decision, ownerTeam)) {
                applied.push(decision);
                this.log(prefix + 'applied production=' + decision.unitTypeId);
            }
            else {
                this.log(prefix + 'not applied: ' + (decision.failureReason || 'city cannot use this production now'));
            }
        }
        if (applied.length == 0) {
            applied = this.applyEconomicsHeuristic(ownerTeam);
            if (applied.length) {
                for (var a = 0; a < applied.length; a++) {
                    this.log('U' + ownerTeam + ' Economics heuristic: city#' + applied[a].cityIndex
                        + ' -> ' + applied[a].unitTypeId);
                }
            }
            else {
                this.log('U' + ownerTeam + ' Economics heuristic: nothing applied');
            }
        }
        _fulldraw = 1;
        return applied;
    }

    decodeEconomicsCityIndex(encodedCityId, record)
    {
        var decoded = Math.round((encodedCityId || 0) * 10000) - 1000;
        if (decoded >= 0 && typeof _units != 'undefined' && decoded < _units.length) {
            return decoded;
        }
        return this.lastEconomicsCityIndices[record];
    }

    applyCityProductionDecision(decision, ownerTeam)
    {
        if (typeof _current_game == 'undefined' || !_current_game || !_current_game.setCityProduction) {
            decision.failureReason = 'game production API unavailable';
            return false;
        }
        var k = decision.cityIndex;
        if (k == undefined || !_units[k] || _units[k].type != 3 || (_units[k].team || 0) != ownerTeam || _units[k].production != null) {
            decision.failureReason = k == undefined || !_units[k]
                ? 'city record has no city'
                : (_units[k].type != 3
                    ? 'record is not a city'
                    : ((_units[k].team || 0) != ownerTeam
                        ? 'city belongs to another user'
                        : 'city is already producing ' + (_units[k].production ? _units[k].production.unitTypeId : 'something')));
            return false;
        }
        var policyChoice = this.productionPolicyChoice(ownerTeam, decision.unitTypeId);
        if (policyChoice && policyChoice != decision.unitTypeId) {
            decision.policyOriginalUnitTypeId = decision.unitTypeId;
            decision.unitTypeId = policyChoice;
        }
        if (decision.unitTypeId == 'none') {
            _current_game.setCityProduction(k, 'none');
            return _units[k].production == null;
        }
        if (typeof _game_state != 'undefined' && _game_state && _game_state.money < 0) {
            decision.failureReason = 'negative money account blocks unit production';
            return false;
        }
        var unitType = _current_game.unitTypesById ? _current_game.unitTypesById[decision.unitTypeId] : null;
        if (!unitType || (_current_game.canCityProduceUnit && !_current_game.canCityProduceUnit(_units[k], unitType))) {
            decision.failureReason = !unitType ? 'unknown unit type' : 'city cannot produce ' + decision.unitTypeId;
            return false;
        }
        _current_game.setCityProduction(k, unitType.id);
        return _units[k].production != null;
    }

    buildEconomicsHeuristicOutput(ownerTeam = 0, productionDemands = null)
    {
        var output = new Float32Array(this.outputWidth);
        var demands = this.normalizedProductionDemands(productionDemands || this.lastStrategyProductionDemands || this.heuristicProductionDemands(ownerTeam));
        var cities = this.freeCityRecords(ownerTeam).slice(-8);
        this.lastEconomicsCityIndices = [];
        for (var n = 0; n < cities.length; n++) {
            var city = cities[n].unit;
            var base = n * 8;
            this.lastEconomicsCityIndices[n] = cities[n].index;
            for (var s = 0; s < Math.min(8, this.economicsProductionLabels.length); s++) {
                output[base + s] = -0.5;
            }
            var choice = (typeof _game_state != 'undefined' && _game_state && _game_state.money < 0)
                ? 'none'
                : this.chooseCityProduction(city, ownerTeam, demands);
            var labelIndex = this.economicsProductionLabels.indexOf(choice);
            if (labelIndex >= 0 && labelIndex < 8) {
                output[base + labelIndex] = 0.9;
                output[64] = 0.8;
            }
        }
        return output;
    }

    applyEconomicsHeuristic(ownerTeam = 0, productionDemands = null)
    {
        var output = this.buildEconomicsHeuristicOutput(ownerTeam, productionDemands);
        var decisions = this.decodeEconomicsOutput(output);
        var applied = [];
        for (var n = 0; n < decisions.length; n++) {
            if (this.applyCityProductionDecision(decisions[n], ownerTeam)) {
                applied.push(decisions[n]);
            }
        }
        if (typeof _game_state != 'undefined') {
            _game_state.aiEconomicsHeuristic = applied;
        }
        return applied;
    }

    heuristicProductionDemands(ownerTeam)
    {
        var cityCount = this.sortedUnits(function(unit) { return (unit.team || 0) == ownerTeam && unit.type == 3; }).length;
        var workerCount = this.countUnitsByType(ownerTeam, 'worker');
        var explorerCount = this.countUnitsByType(ownerTeam, 'explorer');
        var militaryCount = this.countMilitary(ownerTeam);
        var enemyMilitary = this.countEnemyMilitary(ownerTeam);
        var settlers = cityCount < 4 ? 0.45 : 0.15;
        var worker = workerCount < Math.max(1, cityCount) ? 0.45 : 0.15;
        var explorer = explorerCount < 1 && this.knownMapRatioForUser(ownerTeam) < 0.25
            && workerCount >= Math.max(1, cityCount) && militaryCount >= Math.max(1, cityCount) ? 0.25 : 0.03;
        var military = enemyMilitary > militaryCount || militaryCount < Math.max(1, cityCount) ? 0.65 : 0.30;
        return this.normalizedProductionDemands({
            settlers: settlers,
            worker: worker,
            explorer: explorer,
            military: military,
        });
    }

    chooseCityProduction(city, ownerTeam, productionDemands = null)
    {
        if (typeof _game_state != 'undefined' && _game_state && _game_state.money < 0) {
            return 'none';
        }
        var demands = this.normalizedProductionDemands(productionDemands || this.lastStrategyProductionDemands || this.heuristicProductionDemands(ownerTeam));
        var cityCount = this.sortedUnits(function(unit) { return (unit.team || 0) == ownerTeam && unit.type == 3; }).length;
        var workerCount = this.countUnitsByType(ownerTeam, 'worker');
        var explorerCount = this.countUnitsByType(ownerTeam, 'explorer');
        var militaryCount = this.countMilitary(ownerTeam);
        var enemyMilitary = this.countEnemyMilitary(ownerTeam);
        var candidates = [];

        if (demands.worker >= 0.25 || workerCount < cityCount) {
            candidates.push('worker');
        }
        if (demands.military >= 0.25 || enemyMilitary > militaryCount || militaryCount < Math.max(1, cityCount)) {
            candidates.push('spearman', 'warrior', 'slinger');
        }
        if (demands.settlers >= 0.30 || cityCount < 3) {
            candidates.push('settlers');
        }
        if (explorerCount < 1 && workerCount >= Math.max(1, cityCount) && militaryCount >= Math.max(1, cityCount)
            && (demands.explorer >= 0.35 || this.knownMapRatioForUser(ownerTeam) < 0.25)) {
            candidates.push('explorer');
        }
        var priorityOrder = [
            { key: 'settlers', value: demands.settlers, ids: ['settlers'] },
            { key: 'worker', value: demands.worker, ids: ['worker'] },
            { key: 'explorer', value: demands.explorer, ids: ['explorer'] },
            { key: 'military', value: demands.military, ids: ['warrior', 'slinger', 'archer', 'spearman'] },
        ].sort(function(a, b) { return b.value - a.value; });
        for (var p = 0; p < priorityOrder.length; p++) {
            candidates = candidates.concat(priorityOrder[p].ids);
        }
        candidates.push('warrior', 'slinger', 'archer', 'worker', 'settlers');
        for (var n = 0; n < candidates.length; n++) {
            var unitType = _current_game && _current_game.unitTypesById ? _current_game.unitTypesById[candidates[n]] : null;
            if (unitType && (!_current_game.canCityProduceUnit || _current_game.canCityProduceUnit(city, unitType))) {
                return unitType.id;
            }
        }
        return null;
    }

    productionPolicyChoice(ownerTeam, requestedUnitTypeId)
    {
        // The Economics model owns production policy. Runtime legality checks
        // may reject a command, but must not silently replace one unit type with another.
        return requestedUnitTypeId;
    }

    async infer(kind, input)
    {
        var model = this.models[kind];
        if (!model) {
            throw new Error('AI model is not loaded: ' + kind);
        }
        if (!(input instanceof Float32Array) || input.length != model.inputWidth) {
            throw new Error('AI input for ' + kind + ' must be Float32Array(' + model.inputWidth + ')');
        }
        if (model.gpu && this.gpuReady) {
            return await this.inferGPU(model, input);
        }
        return this.inferCPU(model, input);
    }

    async runStrategyAI(ownerTeam = 0)
    {
        var input = this.buildStrategyInput(ownerTeam);
        var output = await this.infer('strategy', input);
        var decision = this.applyStrategyOutput(output, ownerTeam);
        return { input: input, output: output, decision: decision };
    }

    async runTacticsAI(ownerTeam = 0, focusPoints = null)
    {
        var input = this.buildTacticsInput(ownerTeam, focusPoints);
        var output = await this.infer('tactics', input);
        var decision = this.applyTacticsOutput(output, ownerTeam);
        return { input: input, output: output, decision: decision };
    }

    async runActionAI(ownerTeam = 0)
    {
        this.advanceSettlerTurnCounters(ownerTeam);
        var input = this.buildActionInput(ownerTeam, this.lastStrategyMilitaryFocus, this.lastStrategyWorkerFocus);
        var output = await this.infer('action', input);
        var commands = this.applyActionOutput(output, ownerTeam);
        var workaroundCommands = this.applyAiReasoningWorkarounds(ownerTeam);
        return { input: input, output: output, commands: commands, workaroundCommands: workaroundCommands };
    }

    async runEconomicsAI(ownerTeam = 0, productionDemands = null)
    {
        var demands = this.normalizedProductionDemands(productionDemands || this.lastStrategyProductionDemands || this.heuristicProductionDemands(ownerTeam));
        var input = this.buildEconomicsInput(ownerTeam, demands);
        var output = null;
        var usedModel = false;
        if (this.models.economics) {
            output = await this.infer('economics', input);
            usedModel = true;
        }
        else {
            output = this.buildEconomicsHeuristicOutput(ownerTeam, demands);
        }
        var decisions = this.applyEconomicsOutput(output, ownerTeam);
        return { input: input, output: output, decisions: decisions, usedModel: usedModel };
    }

    async runFullTurnAI(ownerTeam = this.activeUserId())
    {
        if (typeof _multiplayer != 'undefined' && _multiplayer && _current_user != ownerTeam) {
            var previousUser = _current_user;
            _multiplayer.setCurrentUser(ownerTeam, true);
            try {
                return await this.runFullTurnAI(ownerTeam);
            }
            finally {
                if (_current_user != previousUser) {
                    _multiplayer.setCurrentUser(previousUser, true);
                }
            }
        }
        await this.ensureDefaultModelsLoaded(false);
        this.log('U' + ownerTeam + ' AI turn analysis started');

        var strategyInput = this.buildStrategyInput(ownerTeam);
        var strategyOutput = await this.infer('strategy', strategyInput);
        var strategyDecision = this.applyStrategyOutput(strategyOutput, ownerTeam);

        var tacticsInput = this.buildTacticsInput(ownerTeam, strategyDecision.maxMilitaryFocus);
        var tacticsOutput = await this.infer('tactics', tacticsInput);
        var tacticsDecision = this.applyTacticsOutput(tacticsOutput, ownerTeam);

        var economicsInput = this.buildEconomicsInput(ownerTeam, strategyDecision.productionDemands);
        var economicsOutput = this.models.economics
            ? await this.infer('economics', economicsInput)
            : this.buildEconomicsHeuristicOutput(ownerTeam, strategyDecision.productionDemands);
        var economicsDecisions = this.applyEconomicsOutput(economicsOutput, ownerTeam);

        this.advanceSettlerTurnCounters(ownerTeam);
        var actionInput = this.buildActionInput(ownerTeam, strategyDecision.maxMilitaryFocus, strategyDecision.maxWorkerFocus);
        var actionOutput = await this.infer('action', actionInput);
        var actionCommands = this.applyActionOutput(actionOutput, ownerTeam);
        var fallbackCommands = this.applyAiReasoningWorkarounds(ownerTeam);

        var result = {
            ownerTeam: ownerTeam,
            strategy: { input: strategyInput, output: strategyOutput, decision: strategyDecision },
            tactics: { input: tacticsInput, output: tacticsOutput, decision: tacticsDecision },
            economics: { input: economicsInput, output: economicsOutput, decisions: economicsDecisions, usedModel: !!this.models.economics },
            action: { input: actionInput, output: actionOutput, commands: actionCommands },
            fallbackCommands: fallbackCommands,
        };
        if (typeof _game_state != 'undefined') {
            _game_state.aiLastTurn = result;
        }
        if (typeof _current_game != 'undefined' && _current_game && _current_game.applyMenuRules) {
            _current_game.applyMenuRules();
        }
        this.log('U' + ownerTeam + ' AI turn analysis finished');
        _fulldraw = 1;
        return result;
    }

    // AI reasoning workarounds
    //
    // These are deliberately explicit patches around neural-network reasoning gaps.
    // The models are small and trained on a compact handcrafted situation library, so
    // they can leave strategically important units idle even when the game has an
    // obvious rule-level expectation. Keep such fixes here, numbered and commented,
    // so they remain visible as temporary policy guards rather than hidden AI logic.
    //
    // Workaround 1: settler expansion must not stall. If a settler reaches a good
    // city plot, force it to build a city. Otherwise it routes to the best nearby
    // settlement candidate; age alone is not a reason to settle bad land.
    //
    // Workaround 2: if a settler did not build a city and has no movement route
    // after Action decoding, assign a random legal move. Random movement is crude,
    // but it is better than a stationary settler because moving reveals map data and
    // gives future turns new settlement candidates.
    applyAiReasoningWorkarounds(ownerTeam = this.activeUserId())
    {
        var commands = [];
        if (typeof _current_game == 'undefined' || !_current_game || !_current_game.buildPath || !_current_game.assignPath) {
            return commands;
        }
        for (var k = 0; k < _units.length; k++) {
            var unit = _units[k];
            if (!unit || (unit.team || 0) != ownerTeam || !unit.can_move) {
                continue;
            }
            if (unit.unitTypeId == 'settlers' && !this.unitHasRoute(unit)) {
                var buildCity = this.workaroundForceSettlerBuildCity(k, ownerTeam);
                if (buildCity) {
                    commands.push(buildCity);
                    continue;
                }
                var bestMove = this.routeSettlerToBestCityPlot(k, ownerTeam);
                if (bestMove) {
                    commands.push(bestMove);
                    continue;
                }
                var randomMove = this.workaroundRandomMoveIdleSettler(k, ownerTeam);
                if (randomMove) {
                    commands.push(randomMove);
                    continue;
                }
            }
            if (this.unitHasTask(unit)) {
                continue;
            }
            var command = this.fallbackCommandForUnit(k, ownerTeam);
            if (command) {
                commands.push(command);
            }
        }
        if (commands.length && typeof console !== 'undefined' && console.log) {
            console.log('AI fallback orders for user ' + ownerTeam, commands);
        }
        if (commands.length) {
            this.log('U' + ownerTeam + ' AI workaround apply: ' + commands.map(function(command) {
                return 'unit#' + command.unitIndex + ' ' + command.command
                    + (command.target ? ' target=(' + command.target.i + ',' + command.target.j + ')' : '')
                    + ' [' + (command.workaround || command.source || 'ai') + ']';
            }).join('; '));
        }
        return commands;
    }

    ensureVisibleAiOrders(ownerTeam = this.activeUserId())
    {
        return this.applyAiReasoningWorkarounds(ownerTeam);
    }

    fallbackCommandForUnit(k, ownerTeam)
    {
        var unit = _units[k];
        if (!unit) {
            return null;
        }
        if (unit.unitTypeId == 'settlers') {
            return this.workaroundForceSettlerBuildCity(k, ownerTeam)
                || this.routeSettlerToBestCityPlot(k, ownerTeam)
                || this.workaroundRandomMoveIdleSettler(k, ownerTeam);
        }

        if (unit.unitTypeId == 'worker') {
            var workerTarget = this.workerGotoTarget(k, ownerTeam);
            if (workerTarget && _current_game.buildPath && _current_game.assignPath) {
                var workerPath = _current_game.buildPath(k, workerTarget);
                if (workerPath.length) {
                    _current_game.assignPath(k, workerPath);
                    if (_current_game.setUnitState) {
                        _current_game.setUnitState(k, 'ready');
                    }
                    return {
                        unitIndex: k,
                        command: 'goto',
                        target: workerPath[workerPath.length - 1],
                        source: 'worker_job_target',
                        workerJob: workerTarget.workerJob
                    };
                }
            }
            return null;
        }

        var target = this.fallbackExploreTarget(unit, ownerTeam);
        if (!target) {
            return null;
        }
        var path = _current_game.buildPath(k, target);
        if (!path.length) {
            return null;
        }
        _current_game.assignPath(k, path);
        if (unit.state == undefined || unit.state == 'ready') {
            unit.state = unit.unitTypeId == 'explorer' ? 'explore' : 'ready';
        }
        return { unitIndex: k, command: 'goto', target: path[path.length - 1], source: 'fallback' };
    }

    workaroundForceSettlerBuildCity(k, ownerTeam)
    {
        var unit = _units[k];
        if (!unit || unit.unitTypeId != 'settlers' || !this.shouldSettlerBuildCity(k, ownerTeam)) {
            return null;
        }
        var target = new Coord(unit.coord.i, unit.coord.j);
        var previousSelection = typeof _selection == 'undefined' ? -1 : _selection;
        _selection = k;
        _current_game.doCommand('build_city');
        _selection = previousSelection;
        return {
            unitIndex: k,
            command: 'build_city',
            target: target,
            source: 'ai_reasoning_workaround',
            workaround: '1_settler_build_city_by_good_plot_or_turn_limit'
        };
    }

    workaroundRandomMoveIdleSettler(k, ownerTeam)
    {
        var unit = _units[k];
        if (!unit || unit.unitTypeId != 'settlers' || this.unitHasRoute(unit)) {
            return null;
        }
        for (var attempt = 0; attempt < 32; attempt++) {
            var radius = 2 + Math.floor(Math.random() * 7);
            var di = Math.floor(Math.random() * (radius * 2 + 1)) - radius;
            var dj = Math.floor(Math.random() * (radius * 2 + 1)) - radius;
            if (di == 0 && dj == 0) {
                continue;
            }
            var target = new Coord(
                Math.round(this.clamp(unit.coord.i + di, 0, _map_size - 1)),
                Math.round(this.clamp(unit.coord.j + dj, 0, _map_size - 1))
            );
            if (target.i == unit.coord.i && target.j == unit.coord.j) {
                continue;
            }
            if (typeof _game != 'undefined' && _game.canUnitEnterTile && !_game.canUnitEnterTile(k, target.i, target.j)) {
                continue;
            }
            var path = _current_game.buildPath(k, target);
            if (!path.length) {
                continue;
            }
            if (_current_game.setUnitState) {
                _current_game.setUnitState(k, 'ready');
            }
            _current_game.assignPath(k, path);
            return {
                unitIndex: k,
                command: 'goto',
                target: path[path.length - 1],
                source: 'ai_reasoning_workaround',
                workaround: '2_random_move_idle_settler'
            };
        }
        return null;
    }

    bestSettlementTargetForSettler(k, ownerTeam, radius = 6)
    {
        var unit = _units[k];
        if (!unit || unit.unitTypeId != 'settlers') {
            return null;
        }
        var currentScore = this.cityPlotScore(unit.coord.i, unit.coord.j, ownerTeam);
        var best = null;
        var bestScore = -1;
        for (var di = -radius; di <= radius; di++) {
            for (var dj = -radius; dj <= radius; dj++) {
                if (di == 0 && dj == 0) {
                    continue;
                }
                var i = unit.coord.i + di;
                var j = unit.coord.j + dj;
                if (i < 0 || j < 0 || i >= _map_size || j >= _map_size || !this.isTileSeenByUser(i, j, ownerTeam)) {
                    continue;
                }
                if (this.terrainTypeAt(i, j) == 0) {
                    continue;
                }
                var score = this.cityPlotScore(i, j, ownerTeam);
                if (score < this.settlerGoodCityPlotThreshold || score < currentScore + 0.04) {
                    continue;
                }
                if (score > bestScore) {
                    bestScore = score;
                    best = new Coord(i, j);
                }
            }
        }
        return best;
    }

    routeSettlerToBestCityPlot(k, ownerTeam)
    {
        var unit = _units[k];
        if (!unit || unit.unitTypeId != 'settlers' || this.unitHasRoute(unit)
            || typeof _current_game == 'undefined' || !_current_game || !_current_game.buildPath || !_current_game.assignPath) {
            return null;
        }
        var target = this.bestSettlementTargetForSettler(k, ownerTeam);
        if (!target) {
            return null;
        }
        var path = _current_game.buildPath(k, target);
        if (!path.length) {
            return null;
        }
        if (_current_game.setUnitState) {
            _current_game.setUnitState(k, 'ready');
        }
        _current_game.assignPath(k, path);
        return {
            unitIndex: k,
            command: 'goto',
            target: path[path.length - 1],
            source: 'settlement_score'
        };
    }

    advanceSettlerTurnCounters(ownerTeam)
    {
        if (typeof _units == 'undefined') {
            return;
        }
        for (var k = 0; k < _units.length; k++) {
            var unit = _units[k];
            if (unit && (unit.team || 0) == ownerTeam && unit.unitTypeId == 'settlers') {
                unit.aiSettlerTurns = Math.min(this.settlerBuildCityTurnLimit, (unit.aiSettlerTurns || 0) + 1);
            }
        }
    }

    hasFriendlyCity(ownerTeam)
    {
        for (var k = 0; k < _units.length; k++) {
            if (_units[k] && (_units[k].team || 0) == ownerTeam && _units[k].type == 3) {
                return true;
            }
        }
        return false;
    }

    fallbackExploreTarget(unit, ownerTeam)
    {
        var preferHidden = Math.random() < 0.5;
        var first = preferHidden ? this.nearbyHiddenExploreTarget(unit, ownerTeam) : this.nearestCityOrSettlerExploreTarget(unit, ownerTeam);
        var second = preferHidden ? this.nearestCityOrSettlerExploreTarget(unit, ownerTeam) : this.nearbyHiddenExploreTarget(unit, ownerTeam);
        return first || second || new Coord(
            Math.round(this.clamp(unit.coord.i + (Math.random() < 0.5 ? -6 : 6), 0, _map_size - 1)),
            Math.round(this.clamp(unit.coord.j + (Math.random() < 0.5 ? -6 : 6), 0, _map_size - 1))
        );
    }

    nearbyHiddenExploreTarget(unit, ownerTeam)
    {
        var best = null;
        var bestScore = -Infinity;
        for (var radius = 4; radius <= 16; radius += 4) {
            for (var di = -radius; di <= radius; di++) {
                for (var dj = -radius; dj <= radius; dj++) {
                    if (Math.max(Math.abs(di), Math.abs(dj)) != radius) {
                        continue;
                    }
                    var i = unit.coord.i + di;
                    var j = unit.coord.j + dj;
                    if (i < 0 || j < 0 || i >= _map_size || j >= _map_size) {
                        continue;
                    }
                    if (typeof _game != 'undefined' && _game.canUnitEnterTile && !_game.canUnitEnterTile(this.unitIndex(unit), i, j)) {
                        continue;
                    }
                    var unseenBonus = this.isTileSeenByUser(i, j, ownerTeam) ? 0 : 100;
                    var distance = Math.abs(di) + Math.abs(dj);
                    var score = unseenBonus + radius - distance * 0.1 + Math.random() * 0.01;
                    if (score > bestScore) {
                        bestScore = score;
                        best = new Coord(i, j);
                    }
                }
            }
            if (best && bestScore >= 100) {
                return best;
            }
        }
        if (best) {
            return best;
        }
        return null;
    }

    nearestCityOrSettlerExploreTarget(unit, ownerTeam)
    {
        var target = this.nearestUnitCoordForViewer(unit.coord, ownerTeam, function(candidate) {
            return candidate.type == 3 || candidate.unitTypeId == 'settlers';
        });
        return target;
    }

    unitIndex(unit)
    {
        for (var k = 0; k < _units.length; k++) {
            if (_units[k] === unit) {
                return k;
            }
        }
        return -1;
    }

    civilianRetreatTargetFromStrategyFocus(unit, ownerTeam)
    {
        var focus = this.strategyFocusForForwarding(null);
        if (!unit || unit.type == 2 || focus.militaryPriority < 0.35) {
            return null;
        }
        var focusI = this.denormalizedCoord(focus.x);
        var focusJ = this.denormalizedCoord(focus.y);
        var awayI = unit.coord.i - focusI;
        var awayJ = unit.coord.j - focusJ;
        var distance = Math.max(Math.abs(awayI), Math.abs(awayJ));
        if (distance > 10) {
            return null;
        }
        if (awayI == 0 && awayJ == 0) {
            awayI = Math.random() < 0.5 ? 1 : -1;
            awayJ = Math.random() < 0.5 ? 1 : -1;
        }
        var directions = [
            [Math.sign(awayI), Math.sign(awayJ)],
            [Math.sign(awayI), 0],
            [0, Math.sign(awayJ)],
            [Math.sign(awayI), -Math.sign(awayJ)],
            [-Math.sign(awayI), Math.sign(awayJ)],
        ];
        for (var attempt = 0; attempt < directions.length; attempt++) {
            var direction = directions[attempt];
            if (direction[0] == 0 && direction[1] == 0) {
                continue;
            }
            var target = new Coord(
                Math.round(this.clamp(unit.coord.i + direction[0] * 8, 0, _map_size - 1)),
                Math.round(this.clamp(unit.coord.j + direction[1] * 8, 0, _map_size - 1))
            );
            if (target.i == unit.coord.i && target.j == unit.coord.j) {
                continue;
            }
            var k = this.unitIndex(unit);
            if (typeof _game != 'undefined' && _game.canUnitEnterTile && !_game.canUnitEnterTile(k, target.i, target.j)) {
                continue;
            }
            return target;
        }
        return null;
    }

    async inferGPU(model, input)
    {
        this.device.queue.writeBuffer(model.inputBuffers[0], 0, input);
        var encoder = this.device.createCommandEncoder();
        var pass = encoder.beginComputePass();
        pass.setPipeline(this.pipeline);
        for (var layer = 0; layer < model.layerCount; layer++) {
            pass.setBindGroup(0, model.gpuBindGroups[layer]);
            pass.dispatchWorkgroups(16);
        }
        pass.end();
        var finalBuffer = model.inputBuffers[model.layerCount % 2];
        encoder.copyBufferToBuffer(finalBuffer, 0, model.readBuffer, 0, this.width * 4);
        this.device.queue.submit([encoder.finish()]);

        await model.readBuffer.mapAsync(GPUMapMode.READ);
        var mapped = model.readBuffer.getMappedRange();
        var output = new Float32Array(mapped).slice();
        model.readBuffer.unmap();
        return output;
    }

    inferCPU(model, input)
    {
        var current = new Float32Array(input);
        for (var layer = 0; layer < model.layerCount; layer++) {
            var layerData = model.layers[layer];
            var weights = layerData.weights;
            var bias = layerData.bias;
            var next = new Float32Array(layerData.outputWidth);
            for (var out = 0; out < layerData.outputWidth; out++) {
                var sum = bias[out];
                var row = out * layerData.inputWidth;
                for (var col = 0; col < layerData.inputWidth; col++) {
                    sum += weights[row + col] * current[col];
                }
                next[out] = Math.tanh(sum);
            }
            current = next;
        }
        return current;
    }

    knownMapRatio()
    {
        if (typeof _map_terrain_bit == 'undefined') {
            return 0;
        }
        var seen = 0;
        var total = _map_size * _map_size;
        for (var i = 0; i < _map_size; i++) {
            for (var j = 0; j < _map_size; j++) {
                if ((_map_terrain_bit[i][j] & 0x4000) != 0) {
                    seen++;
                }
            }
        }
        return total ? seen / total : 0;
    }

    isSeen(i, j, userId = this.activeUserId())
    {
        return this.isTileSeenByUser(i, j, userId);
    }

    countMilitary(team)
    {
        return this.visibleUnitRecords(team, function(unit) {
            return unit.type == 2 && (unit.team || 0) == team;
        }).length;
    }

    countEnemyMilitary(ownerTeam)
    {
        return this.visibleUnitRecords(ownerTeam, function(unit) {
            return unit.type == 2 && (unit.team || 0) != ownerTeam;
        }).length;
    }

    totalMilitaryStrength(units)
    {
        var total = 0;
        for (var k = 0; k < units.length; k++) {
            total += (units[k].attack || 0) + (units[k].defense || 0);
        }
        return total;
    }

    weightedMilitaryCenter(units)
    {
        var sumI = 0;
        var sumJ = 0;
        var weight = 0;
        var landStrength = 0;
        var navalStrength = 0;
        var mobility = 0;
        for (var k = 0; k < units.length; k++) {
            var unit = units[k];
            var strength = Math.max(1, (unit.attack || 0) + (unit.defense || 0));
            sumI += unit.coord.i * strength;
            sumJ += unit.coord.j * strength;
            weight += strength;
            mobility += unit.speed || 0;
            if (unit.nature == 'water') {
                navalStrength += strength;
            }
            else {
                landStrength += strength;
            }
        }
        if (weight == 0) {
            return { x: 0, y: 0, landStrength: 0, navalStrength: 0, mobility: 0 };
        }
        return {
            x: this.normalizedCoord(sumI / weight),
            y: this.normalizedCoord(sumJ / weight),
            landStrength: landStrength,
            navalStrength: navalStrength,
            mobility: mobility,
        };
    }

    averageDistanceToTeam(ownerTeam, otherTeam)
    {
        var own = this.visibleUnitRecords(ownerTeam, function(unit) { return (unit.team || 0) == ownerTeam; });
        var other = this.visibleUnitRecords(ownerTeam, function(unit) { return (unit.team || 0) == otherTeam; });
        if (!own.length || !other.length || ownerTeam == otherTeam) {
            return 0;
        }
        var best = _map_size * 2;
        for (var a = 0; a < own.length; a++) {
            for (var b = 0; b < other.length; b++) {
                var d = Math.abs(own[a].unit.coord.i - other[b].unit.coord.i)
                    + Math.abs(own[a].unit.coord.j - other[b].unit.coord.j);
                best = Math.min(best, d);
            }
        }
        return this.normalizeCount(best, _map_size * 2);
    }

    techFamilyProgress(names)
    {
        if (typeof _game_state == 'undefined' || !names.length) {
            return 0;
        }
        var opened = 0;
        for (var k = 0; k < names.length; k++) {
            if (_game_state.isTechnologyOpen(names[k])) {
                opened++;
            }
        }
        return opened / names.length;
    }

    openedTechnologyRate()
    {
        if (typeof _game_state == 'undefined') {
            return 0;
        }
        var names = this.technologyNames();
        if (!names.length) {
            return 0;
        }
        var opened = 0;
        for (var k = 0; k < names.length; k++) {
            if (_game_state.isTechnologyOpen(names[k])) {
                opened++;
            }
        }
        return opened / names.length;
    }

    strategyCityContextStats(ownerTeam)
    {
        var stats = {
            hills: 0,
            mountains: 0,
            grass: 0,
            water: 0,
            flatLand: 0,
            forest: 0,
            freshWater: 0,
            desertSnow: 0,
            animalResources: 0,
            stoneResources: 0,
            mineralResources: 0,
            cropResources: 0,
            contextTiles: 0,
            resourceTiles: 0,
            cityAnchor: 0,
            settlerAnchor: 0,
        };
        if (typeof _units == 'undefined' || typeof _map_size == 'undefined') {
            return stats;
        }
        var counts = { tiles: 0, resources: 0 };
        var seen = {};
        var cityCount = 0;
        for (var k = 0; k < _units.length; k++) {
            var city = _units[k];
            if (!city || city.type != 3 || (city.team || 0) != ownerTeam || !city.coord) {
                continue;
            }
            cityCount++;
            stats.cityAnchor = 1;
            this.addStrategyContextRingStats(stats, counts, seen, city.coord, ownerTeam, 2);
        }
        if (cityCount == 0) {
            for (var n = 0; n < _units.length; n++) {
                var settler = _units[n];
                if (!settler || settler.unitTypeId != 'settlers' || (settler.team || 0) != ownerTeam || !settler.coord) {
                    continue;
                }
                stats.settlerAnchor = 1;
                this.addStrategyContextRingStats(stats, counts, seen, settler.coord, ownerTeam, 2);
            }
        }
        if (counts.tiles > 0) {
            stats.contextTiles = this.normalizeCount(counts.tiles, 25);
            stats.hills = this.clamp(stats.hills / counts.tiles, 0, 1);
            stats.mountains = this.clamp(stats.mountains / counts.tiles, 0, 1);
            stats.grass = this.clamp(stats.grass / counts.tiles, 0, 1);
            stats.water = this.clamp(stats.water / counts.tiles, 0, 1);
            stats.flatLand = this.clamp(stats.flatLand / counts.tiles, 0, 1);
            stats.forest = this.clamp(stats.forest / counts.tiles, 0, 1);
            stats.freshWater = this.clamp(stats.freshWater / counts.tiles, 0, 1);
            stats.desertSnow = this.clamp(stats.desertSnow / counts.tiles, 0, 1);
        }
        if (counts.resources > 0) {
            stats.resourceTiles = this.normalizeCount(counts.resources, 8);
            stats.animalResources = this.clamp(stats.animalResources / counts.resources, 0, 1);
            stats.stoneResources = this.clamp(stats.stoneResources / counts.resources, 0, 1);
            stats.mineralResources = this.clamp(stats.mineralResources / counts.resources, 0, 1);
            stats.cropResources = this.clamp(stats.cropResources / counts.resources, 0, 1);
        }
        return stats;
    }

    addStrategyContextRingStats(stats, counts, seen, coord, ownerTeam, radius)
    {
        for (var di = -radius; di <= radius; di++) {
            for (var dj = -radius; dj <= radius; dj++) {
                var i = coord.i + di;
                var j = coord.j + dj;
                if (i < 0 || j < 0 || i >= _map_size || j >= _map_size || !this.isTileSeenByUser(i, j, ownerTeam)) {
                    continue;
                }
                var key = i + ',' + j;
                if (seen[key]) {
                    continue;
                }
                seen[key] = true;
                counts.tiles++;
                var terrain = this.terrainTypeAt(i, j);
                if (terrain == 4) {
                    stats.hills++;
                }
                else if (terrain == 5) {
                    stats.mountains++;
                }
                else if (terrain == 2 || terrain == 6 || terrain == 7) {
                    stats.grass++;
                }
                if (terrain != 0 && terrain != 4 && terrain != 5) {
                    stats.flatLand++;
                }
                if (terrain == 6) {
                    stats.forest++;
                }
                if (terrain == 1 || terrain == 3) {
                    stats.desertSnow++;
                }
                if (terrain == 0 || terrain == 7 || this.hasLandWaterSourceAt(i, j)) {
                    stats.water++;
                }
                if (terrain == 7 || this.hasLandWaterSourceAt(i, j) || this.hasFreshWaterNearTile(i, j)) {
                    stats.freshWater++;
                }
                var resourceKind = this.strategyResourceKindAt(i, j, ownerTeam);
                if (resourceKind) {
                    counts.resources++;
                    if (resourceKind == 'animal') {
                        stats.animalResources++;
                    }
                    else if (resourceKind == 'stone') {
                        stats.stoneResources++;
                    }
                    else if (resourceKind == 'mineral') {
                        stats.mineralResources++;
                    }
                    else if (resourceKind == 'crop') {
                        stats.cropResources++;
                    }
                }
            }
        }
    }

    strategyResourceKindAt(i, j, ownerTeam)
    {
        if (typeof _map_resource == 'undefined' || !_map_resource[i] || !_map_resource[i][j]
            || !_map_resource[i][j].type || !this.isResourceVisible(i, j, ownerTeam)
            || typeof _resource_types == 'undefined') {
            return null;
        }
        var resource = _resource_types[_map_resource[i][j].type];
        if (!resource) {
            return null;
        }
        var text = (resource.id || '') + ' ' + (resource.name || '') + ' ' + (resource.gives || '');
        if (/cattle|sheep|deer|horse|ivory|elephant|furs|herd|animal/i.test(text)) {
            return 'animal';
        }
        if (/stone|marble|gypsum|quarry|masonry/i.test(text)) {
            return 'stone';
        }
        if (/copper|iron|niter|coal|oil|aluminum|uranium|metal|mining|mine/i.test(text)) {
            return 'mineral';
        }
        if (/wheat|rice|bananas|sugar|crop|farm|food/i.test(text)) {
            return 'crop';
        }
        return null;
    }

    currentResearchIndex()
    {
        if (typeof _game_state == 'undefined' || !_game_state.currentResearch) {
            return 0;
        }
        var names = this.technologyNames();
        var index = names.indexOf(_game_state.currentResearch);
        return index < 0 ? 0 : (index + 1) / Math.max(1, names.length);
    }

    isResourceVisible(i, j, userId = this.activeUserId())
    {
        if (typeof _multiplayer != 'undefined' && _multiplayer.isResourceVisible) {
            return _multiplayer.isResourceVisible(i, j, userId);
        }
        if (userId == this.activeUserId() && typeof _map != 'undefined' && _map.isResourceVisible) {
            return _map.isResourceVisible(i, j);
        }
        var state = typeof _map_resource != 'undefined' && _map_resource[i] ? _map_resource[i][j] : null;
        return !!(state && !state.hidden);
    }

    countResources(kind, userId = this.activeUserId())
    {
        if (typeof _map_resource == 'undefined' || typeof _resource_types == 'undefined') {
            return 0;
        }
        var total = 0;
        for (var i = 0; i < _map_size; i++) {
            for (var j = 0; j < _map_size; j++) {
                var state = _map_resource[i][j];
                if (!state || !this.isResourceVisible(i, j, userId) || !state.type || !_resource_types[state.type]) {
                    continue;
                }
                var resource = _resource_types[state.type];
                if (kind == 'food' && /food|herd|wheat|fish|rice|cattle|sheep/i.test(resource.gives)) {
                    total++;
                }
                if (kind == 'production' && /production|metal|stone|construction|weapons/i.test(resource.gives)) {
                    total++;
                }
            }
        }
        return total;
    }

    hasOpenedResourceId(id, userId = this.activeUserId())
    {
        if (typeof _map_resource == 'undefined' || typeof _resource_types == 'undefined') {
            return false;
        }
        for (var i = 0; i < _map_size; i++) {
            for (var j = 0; j < _map_size; j++) {
                var state = _map_resource[i][j];
                if (state && this.isResourceVisible(i, j, userId) && state.type && _resource_types[state.type] && _resource_types[state.type].id == id) {
                    return true;
                }
            }
        }
        return false;
    }

    encodeMapRegions(input, base, userId = this.activeUserId())
    {
        if (typeof _map_terrain_tex == 'undefined') {
            return;
        }
        var regions = [
            [0, 0], [1, 0], [0, 1], [1, 1],
            [0, 2], [1, 2], [0, 3], [1, 3],
        ];
        for (var r = 0; r < regions.length; r++) {
            var startI = Math.floor(regions[r][0] * _map_size / 2);
            var endI = Math.floor((regions[r][0] + 1) * _map_size / 2);
            var startJ = Math.floor(regions[r][1] * _map_size / 4);
            var endJ = Math.floor((regions[r][1] + 1) * _map_size / 4);
            var counts = this.regionCounts(startI, endI, startJ, endJ, userId);
            var offset = base + r * 16;
            input[offset + 0] = this.normalizedCoord((startI + endI) / 2);
            input[offset + 1] = this.normalizedCoord((startJ + endJ) / 2);
            input[offset + 2] = counts.land / Math.max(1, counts.total);
            input[offset + 3] = counts.water / Math.max(1, counts.total);
            input[offset + 4] = this.normalizeCount(counts.resources, 20);
            input[offset + 5] = this.normalizeCount(counts.hills + counts.rocks, counts.total);
            input[offset + 6] = this.normalizeCount(counts.grass, counts.total);
            input[offset + 13] = this.normalizeCount(counts.unseen, counts.total);
        }
    }

    regionCounts(startI, endI, startJ, endJ, userId = this.activeUserId())
    {
        var counts = { total: 0, land: 0, water: 0, resources: 0, hills: 0, rocks: 0, grass: 0, unseen: 0 };
        for (var i = startI; i < endI; i++) {
            for (var j = startJ; j < endJ; j++) {
                counts.total++;
                if (!this.isSeen(i, j, userId)) {
                    counts.unseen++;
                    continue;
                }
                var terrain = this.terrainTypeAt(i, j);
                if (terrain == 0) {
                    counts.water++;
                }
                else {
                    counts.land++;
                }
                if (this.hasLandWaterSourceAt(i, j)) {
                    counts.resources++;
                }
                if (terrain == 2) {
                    counts.grass++;
                }
                if (terrain == 4) {
                    counts.hills++;
                }
                if (terrain == 5) {
                    counts.rocks++;
                }
                if (typeof _map_resource != 'undefined' && _map_resource[i][j] && this.isResourceVisible(i, j, userId) && _map_resource[i][j].type) {
                    counts.resources++;
                }
            }
        }
        return counts;
    }

    cityGarrisonStrength(city, ownerTeam)
    {
        var strength = 0;
        var records = this.visibleUnitRecords(ownerTeam, function(unit) { return (unit.team || 0) == ownerTeam; });
        for (var k = 0; k < records.length; k++) {
            var unit = records[k].unit;
            if ((unit.team || 0) == ownerTeam && unit.type == 2
                && Math.abs(unit.coord.i - city.coord.i) <= 1
                && Math.abs(unit.coord.j - city.coord.j) <= 1) {
                strength += (unit.attack || 0) + (unit.defense || 0);
            }
        }
        return strength;
    }

    defaultFocusPoints(ownerTeam)
    {
        var points = [];
        var enemyCity = this.nearestEnemyCityCoord(this.averageOwnCoord(ownerTeam), ownerTeam);
        var enemyUnit = this.nearestEnemyCoord(this.averageOwnCoord(ownerTeam), ownerTeam);
        var ownCity = this.nearestFriendlyCityCoord(this.averageOwnCoord(ownerTeam), ownerTeam);
        if (enemyCity) points.push(enemyCity);
        if (enemyUnit) points.push(enemyUnit);
        if (ownCity) points.push(ownCity);
        while (points.length < 3) {
            points.push(this.averageOwnCoord(ownerTeam) || new Coord(Math.floor(_map_size / 2), Math.floor(_map_size / 2)));
        }
        return points;
    }

    encodeTacticsFocusPoint(input, base, point, ownerTeam)
    {
        input[base + 0] = this.normalizedCoord(point.i);
        input[base + 1] = this.normalizedCoord(point.j);
        var terrainCounts = new Array(8).fill(0);
        var total = 0;
        var roads = 0;
        var rivers = 0;
        var enemy = 0;
        var friendly = 0;
        for (var di = -5; di < 5; di++) {
            for (var dj = -5; dj < 5; dj++) {
                var i = point.i + di;
                var j = point.j + dj;
                if (i < 0 || j < 0 || i >= _map_size || j >= _map_size) {
                    continue;
                }
                total++;
                if (!this.isSeen(i, j, ownerTeam)) {
                    continue;
                }
                var terrain = this.terrainTypeAt(i, j);
                terrainCounts[terrain] = (terrainCounts[terrain] || 0) + 1;
                if (terrain == 7) rivers++;
                if (typeof _map != 'undefined' && _map.hasRoad && _map.hasRoad(i, j)) roads++;
            }
        }
        for (var t = 0; t < 8; t++) {
            input[base + 2 + t] = terrainCounts[t] / Math.max(1, total);
        }
        input[base + 10] = roads / Math.max(1, total);
        input[base + 11] = rivers / Math.max(1, total);
        input[base + 12] = input[base + 2 + 4];
        input[base + 13] = input[base + 2 + 6];
        var records = this.visibleUnitRecords(ownerTeam);
        for (var k = 0; k < records.length; k++) {
            var unit = records[k].unit;
            if (Math.abs(unit.coord.i - point.i) <= 5 && Math.abs(unit.coord.j - point.j) <= 5) {
                if ((unit.team || 0) == ownerTeam) friendly++; else enemy++;
            }
        }
        input[base + 15] = this.normalizeCount(enemy, 20);
        input[base + 16] = this.normalizeCount(friendly, 20);
    }

    militaryBalance(ownerTeam)
    {
        var own = 0;
        var enemy = 0;
        var records = this.visibleUnitRecords(ownerTeam, function(unit) { return unit.type == 2; });
        for (var k = 0; k < records.length; k++) {
            var unit = records[k].unit;
            if (unit.type != 2) {
                continue;
            }
            var strength = (unit.attack || 0) + (unit.defense || 0);
            if ((unit.team || 0) == ownerTeam) own += strength; else enemy += strength;
        }
        return this.clamp((own - enemy) / Math.max(1, own + enemy), -1, 1);
    }

    encodeLocalMapWindow(input, base, coord, ownerTeam)
    {
        var n = 0;
        for (var di = -4; di <= 4; di++) {
            for (var dj = -4; dj <= 4; dj++) {
                var i = coord.i + di;
                var j = coord.j + dj;
                input[base + n] = this.packLocalTile(i, j, ownerTeam);
                n++;
            }
        }
    }

    packLocalTile(i, j, ownerTeam)
    {
        if (i < 0 || j < 0 || i >= _map_size || j >= _map_size) {
            return -1;
        }
        if (!this.isSeen(i, j, ownerTeam)) {
            return -0.2;
        }
        var terrain = this.terrainTypeAt(i, j) / 8;
        var resource = 0;
        if (typeof _map_resource != 'undefined' && _map_resource[i][j] && this.isResourceVisible(i, j, ownerTeam) && _map_resource[i][j].type) {
            resource = 0.1;
        }
        var road = typeof _map != 'undefined' && _map.hasRoad && _map.hasRoad(i, j) ? 0.1 : 0;
        var irrigation = typeof _map != 'undefined' && _map.hasIrrigation && _map.hasIrrigation(i, j) ? 0.1 : 0;
        var waterSource = this.hasLandWaterSourceAt(i, j) ? 0.12 : 0;
        var unitSignal = 0;
        var records = this.visibleUnitRecords(ownerTeam);
        for (var k = 0; k < records.length; k++) {
            var unit = records[k].unit;
            if (unit.coord.i == i && unit.coord.j == j) {
                unitSignal = (unit.team || 0) == ownerTeam ? 0.15 : -0.15;
                break;
            }
        }
        return this.clamp(terrain + resource + road + irrigation + waterSource + unitSignal, -1, 1);
    }

    resourceSignalAt(i, j, ownerTeam = this.activeUserId())
    {
        if (typeof _map_resource == 'undefined' || i < 0 || j < 0 || i >= _map_size || j >= _map_size) {
            return 0;
        }
        var state = _map_resource[i][j];
        if (!state || !state.type || !this.isResourceVisible(i, j, ownerTeam)) {
            return 0;
        }
        var resource = typeof _resource_types != 'undefined' ? _resource_types[state.type] : null;
        if (!resource) {
            return 0.25;
        }
        if (/food|wheat|fish|rice|cattle|sheep|deer|bananas|sugar|honey/i.test(resource.gives || resource.id || '')) {
            return 0.8;
        }
        if (/production|metal|stone|construction|weapons|horses|iron|copper/i.test(resource.gives || resource.id || '')) {
            return 0.6;
        }
        if (/commerce|trade|luxury|gold|silver|diamonds/i.test(resource.gives || resource.id || '')) {
            return 0.5;
        }
        return 0.35;
    }

    nearbyResourceScore(coord, ownerTeam = this.activeUserId(), radius = 2)
    {
        if (!coord || typeof _map_resource == 'undefined') {
            return 0;
        }
        var score = 0;
        for (var di = -radius; di <= radius; di++) {
            for (var dj = -radius; dj <= radius; dj++) {
                if (di == 0 && dj == 0) {
                    continue;
                }
                var distance = Math.max(Math.abs(di), Math.abs(dj));
                var signal = this.resourceSignalAt(coord.i + di, coord.j + dj, ownerTeam);
                if (signal > 0) {
                    score += signal / Math.max(1, distance);
                }
            }
        }
        return this.clamp(score / 4, 0, 1);
    }

    hasFreshWaterNearTile(i, j)
    {
        if (typeof _current_game != 'undefined' && _current_game && _current_game.hasFreshWaterNear) {
            return _current_game.hasFreshWaterNear(i, j);
        }
        if (typeof _map_terrain_tex == 'undefined') {
            return false;
        }
        for (var di = -1; di <= 1; di++) {
            for (var dj = -1; dj <= 1; dj++) {
                if (di == 0 && dj == 0) {
                    continue;
                }
                var ni = i + di;
                var nj = j + dj;
                if (ni < 0 || nj < 0 || ni >= _map_size || nj >= _map_size) {
                    continue;
                }
                var terrain = _map_terrain_tex[ni][nj];
                var type = terrain & 0x0F;
                var depth = (terrain >> 4) & 0x03;
                if (this.hasLandWaterSourceAt(ni, nj) || type == 7 || (type == 0 && depth <= 1)) {
                    return true;
                }
            }
        }
        return false;
    }

    nearestFriendlyCityDistanceSignal(coord, ownerTeam)
    {
        var city = this.nearestFriendlyCityCoord(coord, ownerTeam);
        if (!city || !coord) {
            return 1;
        }
        return this.normalizeCount(Math.abs(city.i - coord.i) + Math.abs(city.j - coord.j), Math.max(1, _map_size));
    }

    cityPlotScore(i, j, ownerTeam = this.activeUserId())
    {
        if (typeof _map_terrain_tex == 'undefined' || i < 0 || j < 0 || i >= _map_size || j >= _map_size) {
            return 0;
        }
        var terrain = this.terrainTypeAt(i, j);
        if (terrain == 0) {
            return 0;
        }
        var score = 0;
        if (terrain == 2) score += 3.0;      // grass
        else if (terrain == 7) score += 3.5; // river/grasswater
        else if (terrain == 6) score += 1.4; // forest/jungle needs support
        else if (terrain == 4) score += 2.0; // hills
        else if (terrain == 5) score += 1.5; // rocks/mountains
        else if (terrain == 1) score += 1.0; // desert
        else if (terrain == 3) score += 0.8; // snow
        else score += 1.2;

        var resource = this.resourceSignalAt(i, j, ownerTeam);
        var nearbyResource = this.nearbyResourceScore(new Coord(i, j), ownerTeam, 2);
        var landWaterSource = this.hasLandWaterSourceAt(i, j);
        var freshWater = this.hasFreshWaterNearTile(i, j);
        score += resource * 2.2;
        score += nearbyResource * 2.0;
        if (landWaterSource) {
            score += terrain == 5 || terrain == 4 ? 0.8 : 1.8;
        }
        if (freshWater) {
            score += 1.5;
        }
        var nearestCity = this.nearestFriendlyCityCoord(new Coord(i, j), ownerTeam);
        if (nearestCity) {
            var distance = Math.abs(nearestCity.i - i) + Math.abs(nearestCity.j - j);
            if (distance <= 4) {
                score -= 3.0;
            }
            else if (distance >= 10) {
                score += 0.7;
            }
        }
        var normalized = this.clamp(score / 10.0, 0, 1);
        if (terrain == 6 && resource == 0 && nearbyResource < 0.10 && !landWaterSource && !freshWater) {
            normalized = Math.min(normalized, this.settlerGoodCityPlotThreshold - 0.01);
        }
        return normalized;
    }

    shouldSettlerBuildCity(k, ownerTeam = this.activeUserId())
    {
        var unit = _units[k];
        if (!unit || unit.unitTypeId != 'settlers') {
            return false;
        }
        var terrain = this.terrainTypeAt(unit.coord.i, unit.coord.j);
        if (!this.isSettlerBuildableTerrain(unit.coord.i, unit.coord.j, ownerTeam)) {
            return false;
        }
        var score = this.cityPlotScore(unit.coord.i, unit.coord.j, ownerTeam);
        if (score >= this.settlerGoodCityPlotThreshold) {
            return true;
        }
        if (!this.hasFriendlyCity(ownerTeam) && score >= this.settlerFirstCityPlotThreshold) {
            return true;
        }
        if ((unit.aiSettlerTurns || 0) >= this.settlerBuildCityTurnLimit
            && score >= this.settlerAgedCityPlotThreshold
            && terrain != 1 && terrain != 3) {
            return true;
        }
        return false;
    }

    isSettlerBuildableTerrain(i, j, ownerTeam)
    {
        var terrain = this.terrainTypeAt(i, j);
        if (terrain == 0 || terrain == 5) {
            return false;
        }
        var resource = this.resourceSignalAt(i, j, ownerTeam);
        var nearbyResource = this.nearbyResourceScore(new Coord(i, j), ownerTeam, 2);
        var freshWater = this.hasFreshWaterNearTile(i, j) || this.hasLandWaterSourceAt(i, j);
        if ((terrain == 1 || terrain == 3) && resource <= 0 && nearbyResource < 0.20 && !freshWater) {
            return false;
        }
        if (terrain == 6 && resource <= 0 && nearbyResource < 0.16 && !freshWater) {
            return false;
        }
        return true;
    }

    unitHasTask(unit)
    {
        return !!(unit && ((unit.gotoPath && unit.gotoPath.length) || unit.gotoCoord != undefined
            || (unit.state != undefined && unit.state != 'ready')
            || unit.chop_turns_left != undefined || unit.road_turns_left != undefined
            || unit.irrigation_turns_left != undefined || unit.building_turns_left != undefined));
    }

    unitHasRoute(unit)
    {
        return !!(unit && ((unit.gotoPath && unit.gotoPath.length) || unit.gotoCoord != undefined));
    }

    setResearchFromList(names)
    {
        var name = this.firstResearchable(names);
        if (name && _game_state.setResearch) {
            _game_state.setResearch(name);
            return true;
        }
        return false;
    }

    setResearchFromStrategyTechnology(priorities)
    {
        if (typeof _game_state == 'undefined' || !priorities) {
            return false;
        }
        for (var k = 0; k < priorities.length; k++) {
            var name = priorities[k].name;
            if (this.setResearchFromTechnologyName(name)) {
                return true;
            }
        }
        return false;
    }

    setResearchFromTechnologyName(name, visited = null)
    {
        if (typeof _game_state == 'undefined' || !_game_state || !_game_state.canResearch || !_game_state.setResearch) {
            return false;
        }
        if (!name) {
            return false;
        }
        if (_game_state.canResearch(name)) {
            return _game_state.setResearch(name);
        }
        if (_game_state.isTechnologyOpen && _game_state.isTechnologyOpen(name)) {
            return false;
        }
        if (!visited) {
            visited = {};
        }
        if (visited[name]) {
            return false;
        }
        visited[name] = true;
        var prerequired = _game_state.technologyPrerequired ? _game_state.technologyPrerequired(name) : [];
        for (var k = 0; k < prerequired.length; k++) {
            var prereq = prerequired[k];
            if (_game_state.isTechnologyOpen && _game_state.isTechnologyOpen(prereq)) {
                continue;
            }
            if (this.setResearchFromTechnologyName(prereq, visited)) {
                return true;
            }
        }
        return false;
    }

    setProductionFocus(ownerTeam, unitTypeIds)
    {
        if (typeof _current_game == 'undefined' || !_current_game || !_current_game.setCityProduction) {
            return false;
        }
        var changed = false;
        for (var k = 0; k < _units.length; k++) {
            if (_units[k].type != 3 || (_units[k].team || 0) != ownerTeam || _units[k].production != null) {
                continue;
            }
            for (var n = 0; n < unitTypeIds.length; n++) {
                var unitType = _current_game.unitTypesById ? _current_game.unitTypesById[unitTypeIds[n]] : null;
                if (unitType && (!_current_game.canCityProduceUnit || _current_game.canCityProduceUnit(_units[k], unitType))) {
                    _current_game.setCityProduction(k, unitType.id);
                    changed = true;
                    break;
                }
            }
        }
        return changed;
    }

    findExpansionTarget(ownerTeam)
    {
        if (typeof _game == 'undefined' || !_game.random_point) {
            return null;
        }
        var center = this.averageOwnCoord(ownerTeam) || new Coord(Math.floor(_map_size / 2), Math.floor(_map_size / 2));
        return _game.random_point(0, center.add(-10, -10), center.add(10, 10));
    }

    strongestEnemyTeam(ownerTeam)
    {
        return this.enemyTeamByStrength(ownerTeam, true);
    }

    weakestEnemyTeam(ownerTeam)
    {
        return this.enemyTeamByStrength(ownerTeam, false);
    }

    enemyTeamByStrength(ownerTeam, strongest)
    {
        var teams = this.teamSet(ownerTeam);
        var bestTeam = null;
        var bestValue = strongest ? -Infinity : Infinity;
        for (var t = 0; t < teams.length; t++) {
            if (teams[t] == ownerTeam) {
                continue;
            }
            var strength = this.totalMilitaryStrength(this.visibleUnitRecords(ownerTeam, function(unit) {
                return (unit.team || 0) == teams[t] && unit.type == 2;
            }).map(function(record) { return record.unit; }));
            if ((strongest && strength > bestValue) || (!strongest && strength < bestValue)) {
                bestValue = strength;
                bestTeam = teams[t];
            }
        }
        return bestTeam;
    }

    closestNeutralTeam(ownerTeam)
    {
        var teams = this.teamSet(ownerTeam);
        var bestTeam = null;
        var bestDistance = Infinity;
        for (var t = 0; t < teams.length; t++) {
            if (teams[t] == ownerTeam) {
                continue;
            }
            var distance = this.averageDistanceToTeam(ownerTeam, teams[t]);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestTeam = teams[t];
            }
        }
        return bestTeam;
    }

    tacticsTargetForDecision(decision, ownerTeam)
    {
        if (decision.target && (decision.target.i != Math.round((_map_size - 1) / 2) || decision.target.j != Math.round((_map_size - 1) / 2))) {
            return decision.target;
        }
        var origin = this.averageOwnCoord(ownerTeam);
        if (decision.command == 'capture' || decision.command == 'siege') {
            return this.nearestEnemyCityCoord(origin, ownerTeam);
        }
        if (decision.command == 'retreat' || decision.command == 'reinforce') {
            return this.nearestFriendlyCityCoord(origin, ownerTeam);
        }
        return this.nearestEnemyCoord(origin, ownerTeam);
    }

    averageOwnCoord(ownerTeam)
    {
        var sumI = 0;
        var sumJ = 0;
        var count = 0;
        var records = this.visibleUnitRecords(ownerTeam, function(unit) { return (unit.team || 0) == ownerTeam; });
        for (var k = 0; k < records.length; k++) {
            var unit = records[k].unit;
            if ((unit.team || 0) == ownerTeam) {
                sumI += unit.coord.i;
                sumJ += unit.coord.j;
                count++;
            }
        }
        return count ? new Coord(Math.round(sumI / count), Math.round(sumJ / count)) : null;
    }

    nearestEnemyCoord(origin, ownerTeam)
    {
        return this.nearestUnitCoord(origin, function(unit) { return (unit.team || 0) != ownerTeam && unit.type != 3; }, ownerTeam);
    }

    foreignOwnerAtCoord(coord, ownerTeam)
    {
        if (!coord) return null;
        var records = this.visibleUnitRecords(ownerTeam, function(unit) {
            return (unit.team || 0) != ownerTeam && unit.coord
                && unit.coord.i == coord.i && unit.coord.j == coord.j;
        });
        return records.length ? (records[0].unit.team || 0) : null;
    }

    nearestEnemyCityCoord(origin, ownerTeam)
    {
        return this.nearestUnitCoord(origin, function(unit) { return (unit.team || 0) != ownerTeam && unit.type == 3; }, ownerTeam);
    }

    nearestFriendlyCityCoord(origin, ownerTeam)
    {
        return this.nearestUnitCoord(origin, function(unit) { return (unit.team || 0) == ownerTeam && unit.type == 3; }, ownerTeam);
    }

    nearestOtherFriendlyCityCoord(origin, ownerTeam)
    {
        return this.nearestUnitCoord(origin, function(unit) {
            return (unit.team || 0) == ownerTeam && unit.type == 3
                && (!origin || unit.coord.i != origin.i || unit.coord.j != origin.j);
        }, ownerTeam);
    }

    nearestUnitCoordForViewer(origin, viewerUserId, filter)
    {
        return this.nearestUnitCoord(origin, filter, viewerUserId);
    }

    nearestUnitCoord(origin, filter, viewerUserId = this.activeUserId())
    {
        if (!origin) {
            return null;
        }
        var best = null;
        var bestDistance = Infinity;
        var records = this.visibleUnitRecords(viewerUserId, filter);
        for (var k = 0; k < records.length; k++) {
            var unit = records[k].unit;
            if (!filter(unit)) {
                continue;
            }
            var distance = Math.abs(unit.coord.i - origin.i) + Math.abs(unit.coord.j - origin.j);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = unit.coord;
            }
        }
        return best ? new Coord(best.i, best.j) : null;
    }

    decodeActionUnitIndex(encodedUnitId, record)
    {
        var decoded = Math.round((encodedUnitId || 0) * 10000) - 1000;
        if (decoded >= 0 && typeof _units != 'undefined' && decoded < _units.length) {
            return decoded;
        }
        return this.lastActionUnitIndices[record];
    }

    applyUnitCommand(k, command)
    {
        if (typeof _current_game == 'undefined' || !_current_game || !_units[k]) {
            command.failureReason = 'game or unit is unavailable';
            return false;
        }
        var unit = _units[k];
        if (command.command == 'wait') {
            if (_current_game.setUnitState && unit.can_move) {
                var terrain = this.terrainTypeAt(unit.coord.i, unit.coord.j);
                if (unit.type == 2 && (terrain == 4 || terrain == 5)) {
                    _current_game.setUnitState(k, 'fortified');
                    command.target = new Coord(unit.coord.i, unit.coord.j);
                    command.appliedState = 'fortified';
                    return true;
                }
                _current_game.setUnitState(k, 'waiting');
                command.target = new Coord(unit.coord.i, unit.coord.j);
                command.appliedState = 'waiting';
                return true;
            }
            command.failureReason = 'unit cannot wait now';
        }
        if (command.command == 'build_city') {
            command.target = new Coord(unit.coord.i, unit.coord.j);
            if (unit.unitTypeId == 'settlers' && this.shouldSettlerBuildCity(k, unit.team || 0)) {
                var previousSelection = typeof _selection == 'undefined' ? -1 : _selection;
                _selection = k;
                _current_game.doCommand('build_city');
                _selection = previousSelection;
                command.appliedState = 'city built';
                return true;
            }
            command.failureReason = unit.unitTypeId == 'settlers'
                ? 'settler is not on an accepted city plot yet'
                : 'only settlers can build city';
        }
        if (command.command == 'irrigate' && _current_game.canBuildIrrigation && _current_game.canBuildIrrigation(k)) {
            _current_game.setUnitState(k, 'irrigate');
            command.target = new Coord(unit.coord.i, unit.coord.j);
            command.appliedState = 'irrigate';
            return true;
        }
        if (command.command == 'irrigate') {
            command.failureReason = 'irrigation is not available on this tile';
        }
        if (command.command == 'chop_forest' && _current_game.canChopForest && _current_game.canChopForest(k)) {
            _current_game.setUnitState(k, 'chop_forest');
            command.target = new Coord(unit.coord.i, unit.coord.j);
            command.appliedState = 'chop_forest';
            return true;
        }
        if (command.command == 'chop_forest') {
            command.failureReason = 'forest chopping is not available on this tile';
        }
        if (command.command == 'goto' && unit.unitTypeId == 'settlers' && this.shouldSettlerBuildCity(k, unit.team || 0)) {
            var previousSelectionForGotoBuild = typeof _selection == 'undefined' ? -1 : _selection;
            command.target = new Coord(unit.coord.i, unit.coord.j);
            _selection = k;
            _current_game.doCommand('build_city');
            _selection = previousSelectionForGotoBuild;
            command.appliedState = 'city built';
            return true;
        }
        if (command.command == 'build_improvement' && _current_game.workerTileBuildingMenuOptions) {
            var buildings = _current_game.workerTileBuildingMenuOptions(k);
            command.availableBuildings = buildings.slice();
            if (buildings.length) {
                var building = this.chooseWorkerTileBuildingForAI(k, buildings);
                _current_game.setUnitState(k, building);
                command.target = new Coord(unit.coord.i, unit.coord.j);
                command.appliedState = building;
                return true;
            }
            command.failureReason = 'no supported worker improvement on this tile';
        }
        if (command.command == 'road_to' && unit.unitTypeId == 'worker'
            && _current_game.canBuildRoad && _current_game.canBuildRoad(k)) {
            _current_game.setUnitState(k, 'road');
            command.target = new Coord(unit.coord.i, unit.coord.j);
            command.appliedState = 'road';
            return true;
        }
        if ((command.command == 'goto' || command.command == 'road_to' || command.command == 'attack') && unit.can_move) {
            var target = command.target;
            if (!target && command.command == 'goto') {
                if (unit.unitTypeId == 'worker') {
                    // A Worker goto follows the local job encoded in input[11]
                    // before considering a Strategy city-relocation suggestion.
                    target = this.workerGotoTarget(k, unit.team || 0)
                        || this.workerStrategyTargetForUnit(unit, unit.team || 0);
                }
                else if (unit.unitTypeId == 'settlers') {
                    target = this.civilianRetreatTargetFromStrategyFocus(unit, unit.team || 0)
                        || this.bestSettlementTargetForSettler(k, unit.team || 0)
                        || this.nearbyHiddenExploreTarget(unit, unit.team || 0);
                }
                else {
                    target = this.fallbackExploreTarget(unit, unit.team || 0);
                }
            }
            if (!target && command.command == 'road_to') {
                target = this.nearestOtherFriendlyCityCoord(unit.coord, unit.team || 0)
                    || this.nearestFriendlyCityCoord(unit.coord, unit.team || 0);
            }
            if (command.command == 'attack') {
                target = this.nearestEnemyCoord(unit.coord, unit.team || 0) || target;
                unit.attackTargetOwnerId = this.foreignOwnerAtCoord(target, unit.team || 0);
            }
            command.selectedTarget = target;
            if (target && _current_game.buildPath && _current_game.assignPath) {
                var path = _current_game.buildPath(k, target);
                if (path.length) {
                    command.target = path[path.length - 1];
                    command.pathLength = path.length;
                    if (command.command == 'road_to' && _current_game.canUseRoadTo && _current_game.canUseRoadTo(k)) {
                        _current_game.setUnitState(k, 'road_to');
                        command.appliedState = 'road_to';
                    }
                    else if (_current_game.setUnitState) {
                        _current_game.setUnitState(k, 'ready');
                        command.appliedState = 'ready';
                    }
                    _current_game.assignPath(k, path);
                    return true;
                }
                command.failureReason = 'no legal path to ' + this.coordText(target);
            }
            else {
                command.failureReason = target ? 'path builder unavailable' : 'no target found';
            }
        }
        else if (command.command == 'goto' || command.command == 'road_to' || command.command == 'attack') {
            command.failureReason = 'unit cannot move';
        }
        return false;
    }
}();

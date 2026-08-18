const _ai_player = new class
{
    constructor()
    {
        this.baseInputWidth = 1024;
        this.strategyInputWidth = 3524;
        this.width = this.baseInputWidth;
        this.outputWidth = 72;
        this.layerCount = 8;
        this.hiddenLayerWidths = [536, 448, 368, 288, 208, 176, 176];
        this.headerBytes = 72;
        this.models = {};
        this.device = null;
        this.pipeline = null;
        this.bindGroupLayout = null;
        this.gpuReady = false;
        this.statusCallback = null;
        this.defaultModelUrls = {
            strategy: 'ai_player/strategy.db.gz?v=20260808b',
            action: 'ai_player/action.db.gz?v=20260808b',
            economics: 'ai_player/economics.db.gz?v=20260808b',
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
        this.productionDemandLabels = ['settlers', 'worker', 'explorer', 'military'];
        this.lastActionUnitIndices = [];
        this.lastActionCandidates = [];
        this.lastEconomicsCityIndices = [];
        this.lastEconomicsCandidates = [];
        this.lastStrategyProductionDemands = null;
        this.batchSize = 8;
        this.batchCursors = {};
        this.actionCandidateCursors = {};
        this.forcedActionUnitServerId = null;
        this.collectSettlementPlans = false;
        this.plannedSettlementCoords = [];
        this.forcedEconomicsCityServerId = null;
        this.economicsCandidateCursors = {};
        this.strategyTechnologyLabels = ['Mining', 'Animal Husbandry', 'Masonry', 'Irrigation'];
        this.settlerBuildCityTurnLimit = 20;
        this.barrenCityPlotSignalCap = 0.37;
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
                { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
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
            struct LayerParams {
                input_width: u32,
                output_width: u32,
            };

            @group(0) @binding(0) var<storage, read> input_vector: array<f32>;
            @group(0) @binding(1) var<storage, read> weights: array<f32>;
            @group(0) @binding(2) var<storage, read> bias: array<f32>;
            @group(0) @binding(3) var<storage, read_write> output_vector: array<f32>;
            @group(0) @binding(4) var<uniform> params: LayerParams;

            fn activate(x: f32) -> f32 {
                let clipped = clamp(x, -10.0, 10.0);
                let e2 = exp(2.0 * clipped);
                return (e2 - 1.0) / (e2 + 1.0);
            }

            @compute @workgroup_size(64)
            fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
                let row = global_id.x;
                if (row >= params.output_width) {
                    return;
                }

                var sum = bias[row];
                for (var col: u32 = 0u; col < params.input_width; col = col + 1u) {
                    sum = sum + weights[row * params.input_width + col] * input_vector[col];
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

    async loadDefaultModels(useWebGPU = true)
    {
        this.setStatus('AI: loading strategy model');
        await this.loadModel('strategy', this.defaultModelUrls.strategy, useWebGPU);
        this.setStatus('AI: loading action model');
        await this.loadModel('action', this.defaultModelUrls.action, useWebGPU);
        this.setStatus('AI: loading economics model');
        await this.loadModel('economics', this.defaultModelUrls.economics, useWebGPU);
        this.defaultModelsLoaded = true;
        this.setStatus('AI: models loaded');
        return true;
    }

    async ensureDefaultModelsLoaded(useWebGPU = true)
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
            return this.ensureDefaultModelsLoaded(false);
        }

        var self = this;
        this.backgroundWorkerLoadPromise = new Promise(function(resolve, reject) {
            var worker = new Worker('ai_worker.js?v=20260807a');
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
        if (!this.backgroundWorkerReady || !this.backgroundWorker) {
            return await this.infer(kind, input);
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
        if (useWebGPU && await this.initWebGPU()) {
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
        var expectedInputWidth = kind == 'strategy' ? this.strategyInputWidth : this.baseInputWidth;
        if (version != 2 || width != expectedInputWidth || layerCount != this.layerCount || activation != 1 || weightLayout != 1) {
            throw new Error('Unsupported AI model header in ' + url);
        }

        var inputWidth = view.getUint32(28, true);
        var outputWidth = view.getUint32(32, true);
        if (inputWidth != expectedInputWidth || outputWidth != this.outputWidth) {
            throw new Error('Unsupported AI model dimensions in ' + url);
        }
        var layerWidths = [inputWidth];
        for (var lw = 0; lw < layerCount; lw++) {
            layerWidths.push(view.getUint32(36 + lw * 4, true));
        }
        if (layerWidths[layerWidths.length - 1] != outputWidth) {
            throw new Error('AI model output width mismatch in ' + url);
        }
        for (var hidden = 0; hidden < this.hiddenLayerWidths.length; hidden++) {
            if (layerWidths[hidden + 1] != this.hiddenLayerWidths[hidden]) {
                throw new Error('Unsupported AI model hidden layer widths in ' + url);
            }
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
            var paramsBuffer = this.device.createBuffer({
                size: 8,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(paramsBuffer, 0, new Uint32Array([layer.inputWidth, layer.outputWidth]));
            model.gpuLayers.push({ weights: weightsBuffer, bias: biasBuffer, params: paramsBuffer });
        }

        var vectorWidth = Math.max.apply(null, model.layerWidths);
        var vectorBytes = vectorWidth * 4;
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
            size: model.outputWidth * 4,
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
                    { binding: 4, resource: { buffer: model.gpuLayers[layerIndex].params } },
                ],
            }));
        }
        model.gpu = true;
    }

    zeroInput(kind = 'base')
    {
        return new Float32Array(kind == 'strategy' ? this.strategyInputWidth : this.baseInputWidth);
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
            'winery', 'cottage', 'workshop', 'mine', 'explore', 'patrol', 'automate', 'network'];
        var state = unit && unit.state ? unit.state : 'ready';
        var index = order.indexOf(state);
        return index < 0 ? 0 : index / Math.max(1, order.length - 1);
    }

    unitStateIndex(state)
    {
        var order = ['ready', 'waiting', 'fortified', 'fortification', 'road', 'road_to', 'irrigate',
            'chop_forest', 'pasture', 'farm', 'plantation', 'camp', 'fishing_boats', 'quarry',
            'winery', 'cottage', 'workshop', 'mine', 'explore', 'patrol', 'automate', 'network'];
        var index = order.indexOf(state || 'ready');
        return index < 0 ? 0 : index;
    }

    visibleUnitAtForViewer(i, j, viewerUserId)
    {
        var records = this.visibleUnitRecords(viewerUserId, function(unit) {
            return unit && unit.coord && unit.coord.i == i && unit.coord.j == j;
        });
        return records.length ? records[0].unit : null;
    }

    actionImmediateSignal(k)
    {
        if (typeof _current_game == 'undefined' || !_current_game || typeof _units == 'undefined' || !_units[k]) {
            return 0;
        }
        var unit = _units[k];
        if (unit.type == 2) {
            var ownerTeam = unit.team || 0;
            var visible = this.visibleUnitRecords(ownerTeam);
            for (var n = 0; n < visible.length; n++) {
                var other = visible[n].unit;
                if (!other || (other.team || 0) == ownerTeam || other.type == 3) {
                    continue;
                }
                var distance = Math.max(Math.abs(other.coord.i - unit.coord.i), Math.abs(other.coord.j - unit.coord.j));
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
        if (unit.unitTypeId == 'workboat') {
            return _current_game.canBuildNetwork && _current_game.canBuildNetwork(k) ? 0.80 : 0;
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
        return ownerTeam == otherTeam ? 1 : -1;
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

    rotatingBatch(records, kind, ownerTeam, limit = this.batchSize)
    {
        var key = kind + ':' + ownerTeam;
        if (!records.length || records.length <= limit) {
            this.batchCursors[key] = 0;
            return records.slice(0, limit);
        }
        if (this.batchCursors[key] == undefined) {
            // Start each client at a different point, then rotate fairly from there.
            this.batchCursors[key] = Math.floor(Math.random() * records.length);
        }
        var start = this.batchCursors[key] % records.length;
        var selected = [];
        for (var n = 0; n < limit; n++) {
            selected.push(records[(start + n) % records.length]);
        }
        this.batchCursors[key] = (start + selected.length) % records.length;
        return selected;
    }

    strategyTeamBatch(teams, ownerTeam)
    {
        var others = teams.filter(function(team) { return team != ownerTeam; });
        var selected = [ownerTeam];
        return selected.concat(this.rotatingBatch(others, 'strategy-teams', ownerTeam, 3));
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

    allUnitRecords(filter)
    {
        var result = [];
        if (typeof _units_by_user != 'undefined') {
            for (var userId in _units_by_user) {
                var list = _units_by_user[userId] || [];
                for (var k = 0; k < list.length; k++) {
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
            if (!unit || !unit.coord || !self.isTileSeenByUser(unit.coord.i, unit.coord.j, viewerUserId)) {
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
        var input = this.zeroInput('strategy');
        var teams = this.strategyTeamBatch(this.teamSet(ownerTeam), ownerTeam);
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
        input[960 + 25] = cityContext.rocks;
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
        input[960 + 42] = this.clamp((typeof _game_state != 'undefined' ? _game_state.lastMoneyIncome : 0) / 50, -1, 1);
        input[960 + 43] = 0;
        this.encodeStrategyBirdsview(input, ownerTeam);
        return input;
    }

    strategyTerrainHeight(rawTerrain)
    {
        var type = rawTerrain & 0x0F;
        var level = (rawTerrain >> 4) & 0x03;
        if (type == 0) return -0.45 - level * 0.12;
        if (type == 4) return 0.45 + level * 0.10;
        if (type == 5) return 0.70 + level * 0.08;
        if (type == 6) return 0.30 + level * 0.08;
        return level * 0.06;
    }

    encodeStrategyBirdsview(input, ownerTeam)
    {
        if (input.length < this.strategyInputWidth || typeof _map_size == 'undefined'
            || typeof _map_terrain_tex == 'undefined') {
            return;
        }
        var size = 50;
        var cellCount = size * size;
        var height = new Float32Array(cellCount);
        var resources = new Float32Array(cellCount);
        var tiles = new Uint16Array(cellCount);
        var controller = new Int16Array(cellCount);
        var military = new Float32Array(cellCount);
        controller.fill(-1);

        for (var i = 0; i < _map_size; i++) {
            for (var j = 0; j < _map_size; j++) {
                if (!this.isTileSeenByUser(i, j, ownerTeam)) continue;
                var x = Math.min(size - 1, Math.floor(i * size / _map_size));
                var y = Math.min(size - 1, Math.floor(j * size / _map_size));
                var cell = y * size + x;
                height[cell] += this.strategyTerrainHeight(_map_terrain_tex[i][j]);
                tiles[cell]++;
                var state = typeof _map_resource != 'undefined' && _map_resource[i] ? _map_resource[i][j] : null;
                if (state && state.type && this.isResourceVisible(i, j, ownerTeam)) {
                    resources[cell] = Math.max(resources[cell], this.clamp(Number(state.type) / 48, 0, 1));
                }
            }
        }

        var records = this.visibleUnitRecords(ownerTeam);
        for (var n = 0; n < records.length; n++) {
            var unit = records[n].unit;
            var ux = Math.min(size - 1, Math.floor(unit.coord.i * size / _map_size));
            var uy = Math.min(size - 1, Math.floor(unit.coord.j * size / _map_size));
            var unitCell = uy * size + ux;
            var strength = unit.type == 2 ? Math.max(1, (unit.attack || 0) + (unit.defense || 0)) : 0;
            if (controller[unitCell] < 0 || strength >= military[unitCell]) {
                controller[unitCell] = unit.team || 0;
            }
            military[unitCell] += strength;
        }

        for (var cellIndex = 0; cellIndex < cellCount; cellIndex++) {
            var averageHeight = tiles[cellIndex] ? height[cellIndex] / tiles[cellIndex] : 0;
            var controlSignal = controller[cellIndex] >= 0 ? (controller[cellIndex] + 1) / 16 : 0;
            var forceSignal = this.clamp(military[cellIndex] / 30, 0, 1);
            var cellX = cellIndex % size;
            var cellY = Math.floor(cellIndex / size);
            var regionX = Math.min(1, Math.floor(cellX * 2 / size));
            var regionY = Math.min(3, Math.floor(cellY * 4 / size));
            var regionStartX = Math.floor(regionX * size / 2);
            var regionEndX = Math.floor((regionX + 1) * size / 2);
            var regionStartY = Math.floor(regionY * size / 4);
            var regionEndY = Math.floor((regionY + 1) * size / 4);
            var regionCells = (regionEndX - regionStartX) * (regionEndY - regionStartY);
            input[1024 + cellIndex] = this.clamp(
                averageHeight * 0.60 + controlSignal * 0.18 + forceSignal * 0.17 + resources[cellIndex] * 0.05,
                -1, 1
            ) / Math.max(1, regionCells);
        }
    }

    buildActionInput(ownerTeam = 0, strategyFocus = null)
    {
        var input = this.zeroInput();
        var forwardedFocus = this.strategyFocusForForwarding(strategyFocus);
        var records = this.actionUnitRecords(ownerTeam);
        this.lastActionUnitIndices = [];
        this.lastActionRecordSummaries = [];
        this.lastActionCandidates = [];
        if (records.length) {
            var record = records[0];
            var candidates = this.actionCandidatesForUnit(record.index, ownerTeam, forwardedFocus);
            this.lastActionUnitIndices[0] = record.index;
            this.lastActionRecordSummaries[0] = this.unitSummary(record.index);
            this.lastActionCandidates = candidates;
            for (var n = 0; n < candidates.length; n++) {
                this.encodeActionCandidate(input, n * 120, record.index, candidates[n], ownerTeam, forwardedFocus);
            }
        }
        this.fillGenericSituation(input, ownerTeam, 0);
        return input;
    }

    buildActionInputForUnit(ownerTeam, unitServerId, strategyFocus = null)
    {
        this.forcedActionUnitServerId = Number(unitServerId);
        try {
            return this.buildActionInput(ownerTeam, strategyFocus);
        }
        finally {
            this.forcedActionUnitServerId = null;
        }
    }

    encodeActionCandidate(input, base, k, candidate, ownerTeam, strategyFocus)
    {
        var unit = _units[k];
        var target = candidate.target || unit.coord;
        var relativeFocus = this.strategyFocusRelativeToCoord(strategyFocus, unit.coord);
        input[base + 0] = this.unitTypeIndex(unit) / 32;
        input[base + 1] = this.unitStateCode(unit);
        input[base + 2] = this.actionImmediateSignal(k);
        input[base + 3] = this.nearbyOwnedUnitDensity(unit.coord, ownerTeam, 'worker', 4);
        input[base + 4] = this.unitHasTask(unit) ? 1 : 0;
        input[base + 5] = this.actionCommandLabels.indexOf(candidate.command) / 7;
        input[base + 6] = this.clamp((target.i - unit.coord.i) / 4, -1, 1);
        input[base + 7] = this.clamp((target.j - unit.coord.j) / 4, -1, 1);
        input[base + 8] = this.normalizeCount(candidate.path ? candidate.path.length : 0, 12);
        input[base + 9] = this.terrainTypeAt(target.i, target.j) / 8;
        input[base + 10] = this.resourceSignalAt(target.i, target.j, ownerTeam);
        input[base + 11] = this.cityPlotScore(target.i, target.j, ownerTeam);
        input[base + 12] = candidate.targetRelation || 0;
        input[base + 13] = this.unitStateIndex(candidate.state || candidate.building || 'ready') / 20;
        input[base + 14] = relativeFocus.militaryPriority;
        input[base + 15] = this.normalizeCount(this.tileFoodYieldAt(target.i, target.j, ownerTeam), 8);
        input[base + 16] = this.normalizeCount(unit.aiSettlerTurns || 0, this.settlerBuildCityTurnLimit);
        input[base + 17] = this.nearbyResourceScore(target, ownerTeam, 2);
        input[base + 18] = this.hasFreshWaterNearTile(target.i, target.j) ? 1 : 0;
        input[base + 19] = relativeFocus.defensePriority;
        input[base + 20] = this.clamp(input[base + 6] * relativeFocus.x + input[base + 7] * relativeFocus.y, -1, 1);
        input[base + 21] = this.packLocalTile(target.i, target.j, ownerTeam);
        this.encodeLocalMapWindow(input, base + 22, target, ownerTeam);
    }

    actionCandidatesForUnit(k, ownerTeam, strategyFocus)
    {
        var unit = typeof _units != 'undefined' ? _units[k] : null;
        if (!unit || !unit.coord) {
            return [];
        }
        var pool = [];
        var current = new Coord(unit.coord.i, unit.coord.j);
        pool.push({ command: 'wait', target: current, state: 'waiting', targetRelation: 1 });
        if (unit.type == 2) {
            pool.push({ command: 'wait', target: current, state: 'fortified', targetRelation: 1 });
        }
        if (unit.unitTypeId == 'settlers' && this.terrainTypeAt(unit.coord.i, unit.coord.j) != 0) {
            pool.push({ command: 'build_city', target: current, targetRelation: 1 });
        }
        if (unit.unitTypeId == 'worker' && typeof _current_game != 'undefined' && _current_game) {
            if (_current_game.canBuildRoad && _current_game.canBuildRoad(k)) {
                pool.push({ command: 'road_to', target: current, state: 'road', targetRelation: 1 });
            }
            if (_current_game.canBuildIrrigation && _current_game.canBuildIrrigation(k)) {
                pool.push({ command: 'irrigate', target: current, state: 'irrigate', targetRelation: 1 });
            }
            if (_current_game.canChopForest && _current_game.canChopForest(k)) {
                pool.push({ command: 'chop_forest', target: current, state: 'chop_forest', targetRelation: 1 });
            }
            if (_current_game.workerTileBuildingMenuOptions) {
                var buildings = _current_game.workerTileBuildingMenuOptions(k);
                for (var b = 0; b < buildings.length; b++) {
                    pool.push({ command: 'build_improvement', target: current, building: buildings[b], state: buildings[b], targetRelation: 1 });
                }
            }
        }
        if (unit.unitTypeId == 'workboat' && typeof _current_game != 'undefined' && _current_game
            && _current_game.canBuildNetwork && _current_game.canBuildNetwork(k)) {
            pool.push({ command: 'build_improvement', target: current, building: 'network', state: 'network', targetRelation: 1 });
        }
        if (unit.can_move && typeof _current_game != 'undefined' && _current_game && _current_game.buildPath) {
            for (var di = -4; di <= 4; di++) {
                for (var dj = -4; dj <= 4; dj++) {
                    if (di == 0 && dj == 0) continue;
                    var i = unit.coord.i + di;
                    var j = unit.coord.j + dj;
                    if (!this.isTileSeenByUser(i, j, ownerTeam)) continue;
                    var target = new Coord(i, j);
                    var path = _current_game.buildPath(k, target);
                    if (!path.length) continue;
                    var targetUnit = this.visibleUnitAtForViewer(i, j, ownerTeam);
                    var enemy = targetUnit && (targetUnit.team || 0) != ownerTeam;
                    var adjacentEnemy = enemy && Math.max(Math.abs(di), Math.abs(dj)) <= 1;
                    pool.push({
                        command: adjacentEnemy && unit.type == 2 ? 'attack' : 'goto',
                        target: target,
                        path: path,
                        targetRelation: enemy ? -1 : (targetUnit ? 1 : 0),
                    });
                    if (unit.unitTypeId == 'worker' && targetUnit && targetUnit.type == 3
                        && (targetUnit.team || 0) == ownerTeam
                        && _current_game.canUseRoadTo && _current_game.canUseRoadTo(k)) {
                        pool.push({ command: 'road_to', target: target, path: path, state: 'road_to', targetRelation: 1 });
                    }
                }
            }
        }
        var wait = pool[0];
        var choices = pool.slice(1);
        var urgent = choices.filter(function(candidate) { return candidate.command == 'attack'; });
        choices = choices.filter(function(candidate) { return candidate.command != 'attack'; });
        var preferred = [];
        if (unit.unitTypeId == 'worker') {
            preferred = choices.filter(function(candidate) {
                if (candidate.command != 'goto' || !candidate.target) return false;
                var job = this.workerTileJobScore(candidate.target.i, candidate.target.j, ownerTeam);
                candidate.workerJobScore = job ? job.score : 0;
                return candidate.workerJobScore > 0;
            }, this).sort(function(a, b) { return b.workerJobScore - a.workerJobScore; }).slice(0, 3);
        }
        else if (unit.unitTypeId == 'settlers') {
            preferred = choices.filter(function(candidate) {
                return candidate.command == 'goto' && candidate.target;
            }).sort(function(a, b) {
                return this.cityPlotScore(b.target.i, b.target.j, ownerTeam)
                    - this.cityPlotScore(a.target.i, a.target.j, ownerTeam);
            }.bind(this)).slice(0, 2);
        }
        if (preferred.length) {
            choices = choices.filter(function(candidate) { return preferred.indexOf(candidate) == -1; });
        }
        var key = ownerTeam + ':' + k;
        var start = choices.length ? (this.actionCandidateCursors[key] || 0) % choices.length : 0;
        var result = [wait];
        for (var urgentIndex = 0; urgentIndex < Math.min(7, urgent.length); urgentIndex++) {
            result.push(urgent[urgentIndex]);
        }
        for (var preferredIndex = 0; preferredIndex < preferred.length && result.length < 8; preferredIndex++) {
            result.push(preferred[preferredIndex]);
        }
        for (var n = 0; n < Math.min(8 - result.length, choices.length); n++) {
            result.push(choices[(start + n) % choices.length]);
        }
        var rotatingCount = Math.max(0, 8 - 1 - urgent.length - preferred.length);
        if (choices.length > rotatingCount) {
            this.actionCandidateCursors[key] = (start + rotatingCount) % choices.length;
        }
        return result;
    }

    nearbyOwnedUnitDensity(coord, ownerTeam, unitTypeId, radius)
    {
        var count = 0;
        var records = this.visibleUnitRecords(ownerTeam, function(unit) {
            return unit && (unit.team || 0) == ownerTeam && unit.unitTypeId == unitTypeId;
        });
        for (var n = 0; n < records.length; n++) {
            var candidate = records[n].unit;
            if (Math.max(Math.abs(candidate.coord.i - coord.i), Math.abs(candidate.coord.j - coord.j)) <= radius) count++;
        }
        return this.normalizeCount(Math.max(0, count - 1), 4);
    }

    actionUnitRecords(ownerTeam = 0)
    {
        var self = this;
        var all = this.sortedUnits(function(unit) {
            return unit && unit.type != 3 && (unit.team || 0) == ownerTeam
                && unit.coord && self.isTileSeenByUser(unit.coord.i, unit.coord.j, ownerTeam)
                && (self.forcedActionUnitServerId == null
                    || Number(unit.serverId) == self.forcedActionUnitServerId);
        });
        if (this.forcedActionUnitServerId != null) return all.slice(0, 1);
        var selected = [];
        var used = {};
        function addWhere(predicate) {
            for (var n = 0; n < all.length; n++) {
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
        addWhere(function(unit, index) { return unit.type == 2 && self.actionImmediateSignal(index) >= 0.70; });
        addWhere(function(unit) { return unit.unitTypeId == 'worker' && !self.unitHasTask(unit); });
        addWhere(function(unit) { return unit.unitTypeId == 'settlers' && !self.unitHasTask(unit); });
        addWhere(function(unit) { return unit.type == 2 && !self.unitHasTask(unit); });
        addWhere(function(unit) { return unit.unitTypeId == 'explorer' && !self.unitHasTask(unit); });
        addWhere(function(unit) { return !self.unitHasTask(unit); });
        selected.sort(function(a, b) {
            function priority(unit) {
                if (unit.type == 2 && self.actionImmediateSignal(_units.indexOf(unit)) >= 0.70) return 0;
                if (!self.unitHasTask(unit) && unit.unitTypeId == 'worker') return 1;
                if (!self.unitHasTask(unit) && unit.unitTypeId == 'settlers') return 2;
                if (!self.unitHasTask(unit) && unit.type == 2) return 3;
                if (!self.unitHasTask(unit) && unit.unitTypeId == 'explorer') return 4;
                return 5;
            }
            return priority(a.unit) - priority(b.unit) || a.index - b.index;
        });
        return this.rotatingBatch(selected, 'action', ownerTeam, 1);
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
        var demands = this.normalizedProductionDemands(productionDemands || this.lastStrategyProductionDemands);
        var freeCities = this.freeCityRecords(ownerTeam);
        var cities = this.rotatingBatch(freeCities, 'economics', ownerTeam, 1);
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
        this.lastEconomicsCandidates = [];
        if (cities.length) {
            var record = cities[0];
            var city = record.unit;
            if (typeof _city_economy != 'undefined') {
                _city_economy.ensureCity(city);
            }
            var candidates = this.economicsCandidatesForCity(record.index, ownerTeam);
            this.lastEconomicsCityIndices[0] = record.index;
            this.lastEconomicsCandidates = candidates;
            for (var n = 0; n < candidates.length; n++) {
                this.encodeEconomicsCandidate(input, n * 120, record.index, candidates[n], ownerTeam, demands,
                    military, enemyMilitary);
            }
        }
        this.fillGenericSituation(input, ownerTeam, 0);
        input[960 + 1] = this.normalizeCount(allCities.length, 16);
        input[960 + 2] = this.normalizeCount(freeCities.length, 8);
        input[960 + 5] = this.normalizeCount(military, 32);
        input[960 + 6] = this.normalizeCount(enemyMilitary, 32);
        input[960 + 14] = this.normalizeCount(idleMovable, 16);
        input[960 + 15] = this.normalizeCount(this.countUnitsByType(ownerTeam, 'worker'), 8);
        input[960 + 16] = this.openedTechnologyRate();
        input[960 + 20] = demands.settlers;
        input[960 + 21] = demands.worker;
        input[960 + 22] = demands.explorer;
        input[960 + 23] = demands.military;
        input[960 + 24] = this.clamp((typeof _game_state != 'undefined' ? _game_state.money : 0) / 200, -1, 1);
        input[960 + 25] = this.clamp((typeof _game_state != 'undefined' ? _game_state.lastMoneyIncome : 0) / 50, -1, 1);
        input[960 + 26] = this.normalizeCount(this.sortedUnits(function(unit) {
            return (unit.team || 0) == ownerTeam && unit.type != 3;
        }).length, 64);
        this.encodeEconomicsWorkerSignals(input, ownerTeam, allCities);
        return input;
    }

    economicsCandidatesForCity(k, ownerTeam)
    {
        var city = typeof _units != 'undefined' ? _units[k] : null;
        var choices = [];
        if (city && typeof _current_game != 'undefined' && _current_game && _current_game.unitTypes) {
            for (var n = 0; n < _current_game.unitTypes.length; n++) {
                var unitType = _current_game.unitTypes[n];
                if (!_current_game.canCityProduceUnit || _current_game.canCityProduceUnit(city, unitType)) {
                    choices.push({ unitTypeId: unitType.id });
                }
            }
        }
        var key = ownerTeam + ':' + k;
        var start = choices.length ? (this.economicsCandidateCursors[key] || 0) % choices.length : 0;
        var result = [{ unitTypeId: null }];
        for (var c = 0; c < Math.min(7, choices.length); c++) {
            result.push(choices[(start + c) % choices.length]);
        }
        if (choices.length > 7) {
            this.economicsCandidateCursors[key] = (start + 7) % choices.length;
        }
        return result;
    }

    encodeEconomicsCandidate(input, base, k, candidate, ownerTeam, demands, military, enemyMilitary)
    {
        var city = _units[k];
        var unitType = candidate.unitTypeId && _current_game && _current_game.unitTypesById
            ? _current_game.unitTypesById[candidate.unitTypeId] : null;
        var typeIndex = unitType ? this.unitTypeIndex({ unitTypeId: unitType.id, type: unitType.type }) : 0;
        input[base + 0] = typeIndex / 32;
        input[base + 1] = unitType ? unitType.type / 3 : -1;
        input[base + 2] = this.normalizeCount(unitType ? unitType.attack : 0, 10);
        input[base + 3] = this.normalizeCount(unitType ? unitType.defense : 0, 10);
        input[base + 4] = this.normalizeCount(unitType ? unitType.speed : 0, 5);
        input[base + 5] = this.normalizeCount(unitType ? unitType.viewRange : 0, 5);
        input[base + 6] = this.normalizeCount(unitType ? unitType.productionCost : 0, 100);
        input[base + 7] = unitType && unitType.nature == 'water' ? 1 : 0;
        input[base + 8] = candidate.unitTypeId ? this.normalizeCount(this.countUnitsByType(ownerTeam, candidate.unitTypeId), 8) : 0;
        input[base + 9] = this.economicsDemandForUnitType(unitType, demands);
        input[base + 10] = this.normalizeCount(city.economy ? city.economy.citizens.length : 1, 20);
        input[base + 11] = this.normalizeCount(city.economy ? city.economy.lastIncome.food : 0, 20);
        input[base + 12] = this.normalizeCount(city.economy ? city.economy.lastIncome.production : 0, 20);
        input[base + 13] = this.normalizeCount(city.economy ? city.economy.lastIncome.money : 0, 20);
        input[base + 14] = this.isFrontierCity(city, ownerTeam) ? 1 : 0;
        input[base + 15] = _current_game && _current_game.isSeasideCity && _current_game.isSeasideCity(city) ? 1 : 0;
        input[base + 16] = this.normalizeCount(this.cityGarrisonStrength(city, ownerTeam), 30);
        input[base + 17] = this.normalizeCount(military, 32);
        input[base + 18] = this.normalizeCount(enemyMilitary, 32);
        input[base + 19] = this.economicsEnemyPressure(ownerTeam, 'mounted');
        input[base + 20] = this.economicsEnemyPressure(ownerTeam, unitType && unitType.nature == 'water' ? 'naval' : 'city');
        input[base + 21] = this.economicsCandidateContext(unitType, city, ownerTeam);
        this.encodeEconomicsTileWindow(input, base + 22, city.coord, ownerTeam);
    }

    economicsDemandForUnitType(unitType, demands)
    {
        if (!unitType) return this.clamp(-(typeof _game_state != 'undefined' ? _game_state.lastMoneyIncome || 0 : 0) / 20, 0, 1);
        if (unitType.id == 'settlers') return demands.settlers;
        if (unitType.id == 'worker' || unitType.id == 'workboat') return demands.worker;
        if (unitType.id == 'explorer') return demands.explorer;
        return demands.military;
    }

    economicsEnemyPressure(ownerTeam, kind)
    {
        var mounted = ['horseman', 'chariot', 'knight'];
        var siege = ['catapult', 'trebuchet'];
        var count = this.visibleUnitRecords(ownerTeam, function(unit) {
            if (!unit || (unit.team || 0) == ownerTeam) return false;
            if (kind == 'mounted') return mounted.indexOf(unit.unitTypeId) != -1;
            if (kind == 'naval') return unit.nature == 'water' && unit.type == 2;
            if (kind == 'siege') return siege.indexOf(unit.unitTypeId) != -1;
            return unit.type == 3;
        }).length;
        return this.normalizeCount(count, 8);
    }

    economicsCandidateContext(unitType, city, ownerTeam)
    {
        if (!unitType) {
            var delta = typeof _game_state != 'undefined' ? _game_state.lastMoneyIncome || 0 : 0;
            return this.clamp(-delta / 20, 0, 1);
        }
        if (unitType.id == 'worker') return this.economicsImprovementOpportunity(city, ownerTeam, false);
        if (unitType.id == 'workboat') return this.economicsImprovementOpportunity(city, ownerTeam, true);
        if (unitType.id == 'pikeman' || unitType.id == 'spearman') return this.economicsEnemyPressure(ownerTeam, 'mounted');
        if (unitType.id == 'catapult' || unitType.id == 'trebuchet') return this.economicsEnemyPressure(ownerTeam, 'city');
        if (unitType.nature == 'water') return this.economicsEnemyPressure(ownerTeam, 'naval');
        return this.isFrontierCity(city, ownerTeam) ? 1 : 0;
    }

    economicsImprovementOpportunity(city, ownerTeam, waterOnly)
    {
        if (!city || !city.coord) return 0;
        var count = 0;
        for (var di = -4; di <= 4; di++) {
            for (var dj = -4; dj <= 4; dj++) {
                var i = city.coord.i + di;
                var j = city.coord.j + dj;
                if (i < 0 || j < 0 || i >= _map_size || j >= _map_size || !this.isTileSeenByUser(i, j, ownerTeam)) continue;
                if (waterOnly) {
                    if (this.terrainTypeAt(i, j) == 0 && !this.hasTileModifier(i, j, 'network')) count++;
                }
                else if (this.workerTileJobScore(i, j, ownerTeam)) count++;
            }
        }
        return this.normalizeCount(count, 8);
    }

    encodeEconomicsWorkerSignals(input, ownerTeam, cities)
    {
        var technologyNames = [
            'Wheel', 'Bronze Working', 'Irrigation', 'Animal Husbandry',
            'Mining', 'Masonry', 'Pottery', 'Construction'
        ];
        var technology = technologyNames.map(function(name) {
            return typeof _game_state != 'undefined' && _game_state.isTechnologyOpen(name) ? 1 : 0;
        });
        var plots = new Array(8).fill(0);
        var jobSignal = {
            road: 0,
            chop_forest: 1,
            irrigate: 2,
            farm: 2,
            pasture: 3,
            camp: 3,
            mine: 4,
            cottage: 5,
            quarry: 5,
            plantation: 6,
            winery: 6,
            workshop: 7,
            fortification: 7,
        };
        var seen = {};
        for (var c = 0; c < cities.length; c++) {
            var city = cities[c].unit;
            if (!city || !city.coord) continue;
            for (var di = -4; di <= 4; di++) {
                for (var dj = -4; dj <= 4; dj++) {
                    var i = city.coord.i + di;
                    var j = city.coord.j + dj;
                    var key = i + ':' + j;
                    if (seen[key] || i < 0 || j < 0 || i >= _map_size || j >= _map_size
                        || !this.isTileSeenByUser(i, j, ownerTeam)) continue;
                    seen[key] = true;
                    var job = this.workerTileJobScore(i, j, ownerTeam);
                    var signal = job ? jobSignal[job.name] : undefined;
                    if (signal != undefined) plots[signal]++;
                }
            }
        }
        for (var n = 0; n < 8; n++) {
            input[960 + 27 + n] = technology[n];
            input[960 + 35 + n] = this.normalizeCount(plots[n], 8);
            input[960 + 43 + n] = technology[n] * input[960 + 35 + n];
        }
    }

    freeCityRecords(ownerTeam)
    {
        var forcedId = this.forcedEconomicsCityServerId;
        return this.sortedUnits(function(unit) {
            return (unit.team || 0) == ownerTeam && unit.type == 3 && unit.production == null
                && (forcedId == null || Number(unit.serverId) == forcedId);
        });
    }

    buildEconomicsInputForCity(ownerTeam, cityServerId, productionDemands = null)
    {
        this.forcedEconomicsCityServerId = Number(cityServerId);
        try {
            return this.buildEconomicsInput(ownerTeam, productionDemands);
        }
        finally {
            this.forcedEconomicsCityServerId = null;
        }
    }

    countUnitsByType(ownerTeam, unitTypeId)
    {
        return this.sortedUnits(function(unit) {
            return (unit.team || 0) == ownerTeam && unit.unitTypeId == unitTypeId;
        }).length;
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
        // Object IDs are kept in last* ID arrays and must never enter model FP32 input.
        input[b + 0] = 0;
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
        for (var n = 0; n < _current_game.unitTypes.length; n++) {
            var unitType = _current_game.unitTypes[n];
            if (unitType && (!_current_game.canCityProduceUnit || _current_game.canCityProduceUnit(city, unitType))) {
                count++;
            }
        }
        return this.normalizeCount(count, _current_game.unitTypes.length);
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

    decodeStrategyOutput(output)
    {
        var best = this.bestStrategyCommand(output);
        var focuses = this.decodeStrategyFocusOutputs(output);
        var maxMilitaryFocus = this.maxMilitaryStrategyFocus(focuses);
        var productionDemands = this.strategyProductionDemandsFromOutput(output);
        var technologyPriorities = this.strategyTechnologyPrioritiesFromOutput(output);
        return {
            type: this.strategyDecisionLabels[best.index],
            slot: best.slot,
            record: best.record,
            object: this.lastStrategyObjectIds ? this.lastStrategyObjectIds[best.record] : null,
            confidence: best.value,
            focuses: focuses,
            maxMilitaryFocus: maxMilitaryFocus,
            productionDemands: productionDemands,
            scienceRate: this.clamp(output[67] || 0, 0, 1),
            technologyPriorities: technologyPriorities,
            raw: best,
        };
    }

    strategyProductionDemandsFromOutput(output)
    {
        var settlers = this.clamp(output[64] || 0, 0, 1);
        var worker = this.clamp(output[65] || 0, 0, 1);
        var explorer = this.clamp(output[66] || 0, 0, 1);
        return this.normalizedProductionDemands({
            settlers: settlers,
            worker: worker,
            explorer: explorer,
            military: Math.max(0, 1 - settlers - worker - explorer),
        });
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
            + ', rocks=' + this.fmt(c.rocks)
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

    // Decoder 1/3: strategy output to game-state-level plan, research, and production focus.
    applyStrategyOutput(output, ownerTeam = 0)
    {
        var decision = this.decodeStrategyOutput(output);
        if (typeof _game_state == 'undefined') {
            return decision;
        }
        _game_state.aiStrategy = decision;
        _game_state.aiStrategyFocus = decision.maxMilitaryFocus;
        _game_state.aiProductionDemands = decision.productionDemands;
        this.lastStrategyFocuses = decision.focuses;
        this.lastStrategyMilitaryFocus = decision.maxMilitaryFocus;
        this.lastStrategyProductionDemands = decision.productionDemands;
        var applied = [];
        this.log('U' + ownerTeam + ' Strategy parse: record ' + decision.record
            + ' slot ' + decision.slot
            + ' -> ' + decision.type
            + ' confidence=' + this.fmt(decision.confidence)
            + '; ' + this.focusText(decision.maxMilitaryFocus)
            + '; ' + this.productionDemandText(decision.productionDemands)
            + '; science=' + this.fmt(decision.scienceRate)
            + '; ' + this.strategyContextText()
            + '; ' + this.technologyPriorityText(decision.technologyPriorities));

        var researchApplied = false;
        if (_game_state.setScienceRate) {
            _game_state.setScienceRate(decision.scienceRate * 100);
            applied.push('science funding -> ' + _game_state.scienceRate + '%');
        }
        if ((!_game_state.currentResearch || !_game_state.canResearch(_game_state.currentResearch))
            && this.setResearchFromStrategyTechnology(decision.technologyPriorities)) {
            applied.push('research model technology priority -> ' + _game_state.currentResearch);
            researchApplied = true;
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
            _game_state.aiStrategy.military_unit_focus = 'anti_mounted';
            applied.push('military unit focus -> anti_mounted');
        }
        else if (decision.type == 'protect_expansion_point') {
            _game_state.aiStrategy.target = new Coord(
                this.denormalizedCoord(decision.maxMilitaryFocus.x),
                this.denormalizedCoord(decision.maxMilitaryFocus.y)
            );
            applied.push('expansion target -> ' + this.coordText(_game_state.aiStrategy.target));
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

    decodeActionOutput(output)
    {
        if (!this.lastActionCandidates.length || this.lastActionUnitIndices[0] == undefined) {
            return [];
        }
        var slots = [];
        for (var n = 0; n < this.lastActionCandidates.length; n++) slots.push(n);
        var best = this.argmaxSlots(output, slots);
        if (!(best.value > 0)) {
            for (var waitSlot = 0; waitSlot < this.lastActionCandidates.length; waitSlot++) {
                if (this.lastActionCandidates[waitSlot].command == 'wait') {
                    best = {slot: waitSlot, value: best.value};
                    break;
                }
            }
        }
        var candidate = this.lastActionCandidates[best.slot];
        return [{
            record: best.slot,
            unitIndex: this.lastActionUnitIndices[0],
            command: candidate.command,
            target: candidate.target ? new Coord(candidate.target.i, candidate.target.j) : null,
            path: candidate.path || null,
            building: candidate.building || null,
            state: candidate.state || null,
            slot: best.slot,
            confidence: best.value,
            legalCommands: this.lastActionCandidates.map(function(item) {
                return item.command + (item.target ? '@' + item.target.i + ',' + item.target.j : '');
            }),
            priority: output[64] || 0,
        }];
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
        if (/copper|diamonds|silver|iron|gold/.test(id)) return 'mine';
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
        if (!this.lastEconomicsCandidates.length || this.lastEconomicsCityIndices[0] == undefined) return [];
        var best = this.argmax(output, 0, this.lastEconomicsCandidates.length);
        var candidate = best.value > 0
            ? this.lastEconomicsCandidates[best.index] : this.lastEconomicsCandidates[0];
        return [{
            record: best.value > 0 ? best.index : 0,
            cityIndex: this.lastEconomicsCityIndices[0],
            unitTypeId: candidate.unitTypeId,
            slot: best.slot,
            confidence: best.value,
            legalProduction: this.lastEconomicsCandidates.map(function(item) { return item.unitTypeId || 'none'; }),
            priority: output[64] || 0,
        }];
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
            if (this.applyCityProductionDecision(decision, ownerTeam)) {
                applied.push(decision);
                this.log(prefix + 'applied production=' + decision.unitTypeId);
            }
            else {
                this.log(prefix + 'not applied: ' + (decision.failureReason || 'city cannot use this production now'));
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
        if (decision.unitTypeId == null) {
            decision.appliedState = 'idle';
            return true;
        }
        var unitType = _current_game.unitTypesById ? _current_game.unitTypesById[decision.unitTypeId] : null;
        if (!unitType || (_current_game.canCityProduceUnit && !_current_game.canCityProduceUnit(_units[k], unitType))) {
            decision.failureReason = !unitType ? 'unknown unit type' : 'city cannot produce ' + decision.unitTypeId;
            return false;
        }
        _current_game.setCityProduction(k, unitType.id);
        return _units[k].production != null;
    }

    async infer(kind, input)
    {
        var model = this.models[kind];
        if (!model) {
            throw new Error('AI model is not loaded: ' + kind);
        }
        if (!(input instanceof Float32Array) || input.length != model.layerWidths[0]) {
            throw new Error('AI input for ' + kind + ' must be Float32Array(' + model.layerWidths[0] + ')');
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

    async runActionAI(ownerTeam = 0)
    {
        this.advanceSettlerTurnCounters(ownerTeam);
        var input = this.buildActionInput(ownerTeam, this.lastStrategyMilitaryFocus);
        var output = await this.infer('action', input);
        var commands = this.applyActionOutput(output, ownerTeam);
        return { input: input, output: output, commands: commands };
    }

    async runEconomicsAI(ownerTeam = 0, productionDemands = null)
    {
        var demands = this.normalizedProductionDemands(productionDemands || this.lastStrategyProductionDemands);
        var input = this.buildEconomicsInput(ownerTeam, demands);
        var output = await this.infer('economics', input);
        var decisions = this.applyEconomicsOutput(output, ownerTeam);
        return { input: input, output: output, decisions: decisions, usedModel: true };
    }

    civilianPolicyHasActiveTask(unit)
    {
        if (!unit) return false;
        if (unit.pendingImmediateBuild || unit.serverActionPending || unit.pendingDisband) return true;
        if (unit.roadToBuilding || unit.roadToDestination) return true;
        if ((unit.gotoPath && unit.gotoPath.length) || unit.gotoCoord != undefined) return true;
        if (unit.chop_turns_left != undefined || unit.road_turns_left != undefined
            || unit.irrigation_turns_left != undefined || unit.building_turns_left != undefined
            || unit.clientImprovementTurnsLeft != undefined) return true;
        return !!(typeof _current_game != 'undefined' && _current_game.isImprovementState
            && _current_game.isImprovementState(unit.state));
    }

    applyPersistentCivilianPolicies(ownerTeam)
    {
        var applied = [];
        if (typeof _units == 'undefined' || typeof _current_game == 'undefined') return applied;
        for (var k = 0; k < _units.length; k++) {
            var unit = _units[k];
            if (!unit || (unit.team || 0) != ownerTeam || !unit.can_move) continue;
            if (unit.unitTypeId == 'worker') {
                if (unit.automationMode == 'road_to' && this.civilianPolicyHasActiveTask(unit)) continue;
                unit.automationMode = 'automate';
                if (!this.civilianPolicyHasActiveTask(unit)) {
                    unit.state = 'automate';
                    if (_current_game.autoRouteAutomate) _current_game.autoRouteAutomate(k);
                    applied.push('Worker #' + (unit.serverId || k) + ' -> Automate');
                }
            }
            else if (unit.unitTypeId == 'explorer') {
                unit.automationMode = 'explore';
                if (!this.civilianPolicyHasActiveTask(unit)) {
                    unit.state = 'explore';
                    if (_current_game.autoRouteExplore) _current_game.autoRouteExplore(k);
                    applied.push('Explorer #' + (unit.serverId || k) + ' -> Explore');
                }
            }
        }
        return applied;
    }

    settlementDistanceToOwnCity(i, j, ownerTeam)
    {
        var best = Infinity;
        if (typeof _units == 'undefined') return best;
        for (var k = 0; k < _units.length; k++) {
            var city = _units[k];
            if (!city || city.type != 3 || (city.team || 0) != ownerTeam || !city.coord) continue;
            var di = city.coord.i - i;
            var dj = city.coord.j - j;
            var distance = di * dj >= 0 ? Math.max(Math.abs(di), Math.abs(dj)) : Math.abs(di) + Math.abs(dj);
            best = Math.min(best, distance);
        }
        if (this.collectSettlementPlans) {
            for (var n = 0; n < this.plannedSettlementCoords.length; n++) {
                var planned = this.plannedSettlementCoords[n];
                var pdi = planned.i - i;
                var pdj = planned.j - j;
                var plannedDistance = pdi * pdj >= 0
                    ? Math.max(Math.abs(pdi), Math.abs(pdj)) : Math.abs(pdi) + Math.abs(pdj);
                best = Math.min(best, plannedDistance);
            }
        }
        return best;
    }

    beginSettlementPlanning()
    {
        this.collectSettlementPlans = true;
        this.plannedSettlementCoords = [];
    }

    endSettlementPlanning()
    {
        this.collectSettlementPlans = false;
        this.plannedSettlementCoords = [];
    }

    reserveSettlementCoord(coord)
    {
        if (!this.collectSettlementPlans || !coord) return;
        this.plannedSettlementCoords.push(new Coord(coord.i, coord.j));
    }

    bestSettlementRoute(k, ownerTeam, minimumSpacing)
    {
        var unit = _units[k];
        var best = null;
        for (var di = -10; di <= 10; di++) {
            for (var dj = -10; dj <= 10; dj++) {
                var i = unit.coord.i + di;
                var j = unit.coord.j + dj;
                if (i < 0 || j < 0 || i >= _map_size || j >= _map_size
                    || !this.isTileSeenByUser(i, j, ownerTeam) || !this.isPreferredCityCenter(i, j)
                    || this.settlementDistanceToOwnCity(i, j, ownerTeam) < minimumSpacing) continue;
                var path = di == 0 && dj == 0 ? [] : _current_game.buildPath(k, new Coord(i, j));
                if ((di != 0 || dj != 0) && !path.length) continue;
                var plotScore = this.cityPlotScore(i, j, ownerTeam);
                var score = plotScore - path.length * 0.008;
                if (!best || score > best.score) {
                    best = {coord: new Coord(i, j), path: path, plotScore: plotScore, score: score};
                }
            }
        }
        return best;
    }

    isPreferredCityCenter(i, j)
    {
        var terrain = this.terrainTypeAt(i, j);
        return terrain == 2 || terrain == 7;
    }

    applySettlerExpansionPolicies(ownerTeam)
    {
        var applied = [];
        if (typeof _units == 'undefined' || typeof _current_game == 'undefined') return applied;
        this.beginSettlementPlanning();
        var cityCount = this.sortedUnits(function(unit) {
            return unit && unit.type == 3 && (unit.team || 0) == ownerTeam;
        }).length;
        try {
            for (var k = 0; k < _units.length; k++) {
                var settler = _units[k];
                if (!settler || settler.unitTypeId != 'settlers' || (settler.team || 0) != ownerTeam
                    || this.civilianPolicyHasActiveTask(settler)) continue;
                var decision = this.applySettlerExpansionPolicy(k, ownerTeam, cityCount);
                if (!decision.applied) continue;
                applied.push(decision.description);
            }
        }
        finally {
            this.endSettlementPlanning();
        }
        return applied;
    }

    applySettlerExpansionPolicy(k, ownerTeam, plannedCityCount = null)
    {
        var settler = typeof _units != 'undefined' ? _units[k] : null;
        if (!settler || settler.unitTypeId != 'settlers' || (settler.team || 0) != ownerTeam) {
            return {applied: false, reason: 'not_an_owned_settler'};
        }
        if (this.civilianPolicyHasActiveTask(settler)) {
            return {applied: false, reason: 'active_task'};
        }
        var cityCount = plannedCityCount;
        if (cityCount == null) {
            cityCount = this.sortedUnits(function(unit) {
                return unit && unit.type == 3 && (unit.team || 0) == ownerTeam;
            }).length;
        }
        var minimumSpacing = cityCount ? 7 : 0;
        var currentScore = this.cityPlotScore(settler.coord.i, settler.coord.j, ownerTeam);
        var spacing = this.settlementDistanceToOwnCity(settler.coord.i, settler.coord.j, ownerTeam);
        var age = Math.max(0, Number(settler.aiSettlerTurns) || 0);
        var threshold = cityCount ? 0.40 : 0.28;
        var agedThreshold = age >= 10 ? threshold - 0.08 : threshold;
        var mustSettle = age >= this.settlerBuildCityTurnLimit;
        if (this.isPreferredCityCenter(settler.coord.i, settler.coord.j)
            && spacing >= minimumSpacing && (mustSettle || currentScore >= agedThreshold)) {
            var build = {command: 'build_city'};
            if (this.applyUnitCommand(k, build)) {
                this.reserveSettlementCoord(settler.coord);
                return {
                    applied: true, command: 'build_city', score: currentScore, age: age,
                    description: 'Settler #' + (settler.serverId || k) + ' -> Build City at '
                        + this.coordText(settler.coord) + ' score=' + this.fmt(currentScore)
                        + (mustSettle ? ' age-limit' : ''),
                };
            }
        }
        var target = this.bestSettlementRoute(k, ownerTeam, minimumSpacing);
        if (target && target.path.length) {
            settler.state = 'ready';
            _current_game.assignPath(k, target.path);
            this.reserveSettlementCoord(target.coord);
            return {
                applied: true, command: 'goto', target: target.coord, score: target.plotScore,
                pathLength: target.path.length, age: age,
                description: 'Settler #' + (settler.serverId || k) + ' -> '
                    + this.coordText(target.coord) + ' score=' + this.fmt(target.plotScore),
            };
        }
        return {applied: false, reason: 'no_legal_settlement_route', score: currentScore, age: age};
    }

    firstAvailableProduction(city, ids)
    {
        if (!city || typeof _current_game == 'undefined') return null;
        for (var n = 0; n < ids.length; n++) {
            var type = _current_game.unitTypesById ? _current_game.unitTypesById[ids[n]] : null;
            if (!type) continue;
            if (_current_game.canCityProduceUnit && !_current_game.canCityProduceUnit(city, type)) continue;
            if (typeof _game != 'undefined' && _game.canStartCityProduction
                && !_game.canStartCityProduction(city, type.id)) continue;
            return type.id;
        }
        return null;
    }

    applyDevelopmentProductionPolicies(ownerTeam)
    {
        var applied = [];
        if (typeof _units == 'undefined' || typeof _current_game == 'undefined') return applied;
        var cities = this.sortedUnits(function(unit) {
            return unit && unit.type == 3 && (unit.team || 0) == ownerTeam;
        });
        var military = this.countMilitary(ownerTeam);
        var workers = this.countUnitsByType(ownerTeam, 'worker');
        var settlers = this.countUnitsByType(ownerTeam, 'settlers');
        var targetCities = 3;
        var militaryCap = Math.max(4, cities.length*2);
        for (var n = 0; n < cities.length; n++) {
            var record = cities[n];
            var city = record.unit;
            if (city.production != null) continue;
            var choice = null;
            var workerOpportunity = this.economicsImprovementOpportunity(city, ownerTeam, false);
            if (military < 1) {
                choice = this.firstAvailableProduction(city, ['warrior', 'slinger', 'archer']);
                if (choice) military++;
            }
            if (!choice && workers < Math.max(1, Math.ceil(cities.length / 2)) && workerOpportunity > 0) {
                choice = this.firstAvailableProduction(city, ['worker']);
                if (choice) workers++;
            }
            if (!choice && cities.length + settlers < targetCities) {
                choice = this.firstAvailableProduction(city, ['settlers']);
                if (choice) settlers++;
            }
            if (!choice && military < Math.min(cities.length, militaryCap)) {
                choice = this.firstAvailableProduction(city, ['warrior', 'slinger', 'archer']);
                if (choice) military++;
            }
            if (!choice && workers < cities.length && workerOpportunity > 0) {
                choice = this.firstAvailableProduction(city, ['worker']);
                if (choice) workers++;
            }
            if (!choice && military < militaryCap) {
                choice = this.firstAvailableProduction(city, ['warrior', 'slinger', 'archer', 'fencer']);
                if (choice) military++;
            }
            if (!choice) continue;
            _current_game.setCityProduction(record.index, choice);
            if (city.production) {
                applied.push('City #' + (city.serverId || record.index) + ' -> ' + choice);
            }
        }
        return applied;
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
        await this.ensureDefaultModelsLoaded(true);
        this.log('U' + ownerTeam + ' AI turn analysis started');

        var civilianPolicies = this.applyPersistentCivilianPolicies(ownerTeam);
        var settlerPolicies = this.applySettlerExpansionPolicies(ownerTeam);
        if (civilianPolicies.length || settlerPolicies.length) {
            this.log('U' + ownerTeam + ' Civilian policy: '
                + civilianPolicies.concat(settlerPolicies).join('; '));
        }

        var strategyInput = this.buildStrategyInput(ownerTeam);
        var strategyOutput = await this.infer('strategy', strategyInput);
        var strategyDecision = this.applyStrategyOutput(strategyOutput, ownerTeam);

        var productionPolicies = this.applyDevelopmentProductionPolicies(ownerTeam);
        if (productionPolicies.length) {
            this.log('U' + ownerTeam + ' Development production: ' + productionPolicies.join('; '));
        }

        var economicsInput = this.buildEconomicsInput(ownerTeam, strategyDecision.productionDemands);
        var economicsOutput = await this.infer('economics', economicsInput);
        var economicsDecisions = this.applyEconomicsOutput(economicsOutput, ownerTeam);

        this.advanceSettlerTurnCounters(ownerTeam);
        var actionInput = this.buildActionInput(ownerTeam, strategyDecision.maxMilitaryFocus);
        var actionOutput = await this.infer('action', actionInput);
        var actionCommands = this.applyActionOutput(actionOutput, ownerTeam);

        var result = {
            ownerTeam: ownerTeam,
            strategy: { input: strategyInput, output: strategyOutput, decision: strategyDecision },
            economics: { input: economicsInput, output: economicsOutput, decisions: economicsDecisions, usedModel: true },
            action: { input: actionInput, output: actionOutput, commands: actionCommands },
            policies: {
                civilians: civilianPolicies,
                settlers: settlerPolicies,
                production: productionPolicies,
            },
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

    async inferGPU(model, input)
    {
        this.device.queue.writeBuffer(model.inputBuffers[0], 0, input);
        var encoder = this.device.createCommandEncoder();
        var pass = encoder.beginComputePass();
        pass.setPipeline(this.pipeline);
        for (var layer = 0; layer < model.layerCount; layer++) {
            pass.setBindGroup(0, model.gpuBindGroups[layer]);
            pass.dispatchWorkgroups(Math.ceil(model.layers[layer].outputWidth / 64));
        }
        pass.end();
        var finalBuffer = model.inputBuffers[model.layerCount % 2];
        encoder.copyBufferToBuffer(finalBuffer, 0, model.readBuffer, 0, model.outputWidth * 4);
        this.device.queue.submit([encoder.finish()]);

        await model.readBuffer.mapAsync(GPUMapMode.READ);
        var mapped = model.readBuffer.getMappedRange();
        var output = new Float32Array(mapped).slice(0, model.outputWidth);
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
            rocks: 0,
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
            stats.rocks = this.clamp(stats.rocks / counts.tiles, 0, 1);
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
                    stats.rocks++;
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
        var categories = resource.categories || [];
        if (categories.indexOf('animal') != -1) return 'animal';
        if (categories.indexOf('stone') != -1) return 'stone';
        if (categories.indexOf('mineral') != -1) return 'mineral';
        if (categories.indexOf('crop') != -1) return 'crop';
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
                if (kind == 'food' && (resource.categories || []).indexOf('food') != -1) {
                    total++;
                }
                if (kind == 'production' && (resource.categories || []).indexOf('production') != -1) {
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
        var categories = resource.categories || [];
        if (categories.indexOf('food') != -1) {
            return 0.8;
        }
        if (categories.indexOf('production') != -1) {
            return 0.6;
        }
        if (categories.indexOf('money') != -1) {
            return 0.5;
        }
        return 0.35;
    }

    tileFoodYieldAt(i, j, ownerTeam = this.activeUserId())
    {
        if (typeof _map_terrain_tex == 'undefined' || i < 0 || j < 0 || i >= _map_size || j >= _map_size) {
            return 0;
        }
        var rawTerrain = _map_terrain_tex[i][j];
        var terrain = rawTerrain & 0x0F;
        var baseFood = [2, 0, 2, 0, 1, 0, 1, 3][terrain] || 0;
        if (terrain == 0 && ((rawTerrain >> 4) & 0x03) > 1) baseFood = 1;
        if ((rawTerrain & 0x80) != 0 && terrain != 0) {
            baseFood = terrain == 1 ? 2 : baseFood + 1;
        }
        var income = { food: baseFood, production: 0, money: 0 };
        var resourceState = typeof _map_resource != 'undefined' && _map_resource[i]
            ? _map_resource[i][j] : null;
        if (resourceState && resourceState.type && this.isResourceVisible(i, j, ownerTeam)
            && typeof _resource_types != 'undefined' && _resource_types[resourceState.type]
            && typeof _economics != 'undefined' && _economics.resourceYield) {
            var resourceIncome = _economics.resourceYield(_resource_types[resourceState.type].id,
                typeof _map_terrain_mod != 'undefined' && _map_terrain_mod[i] ? _map_terrain_mod[i][j] : null);
            income.food += resourceIncome.food || 0;
        }
        var modifiers = typeof _map_terrain_mod != 'undefined' && _map_terrain_mod[i]
            ? _map_terrain_mod[i][j] : null;
        if (typeof _economics != 'undefined' && _economics.applyImprovementYieldMultipliers) {
            income = _economics.applyImprovementYieldMultipliers(income, modifiers, false, terrain,
                (rawTerrain & 0x80) != 0);
        }
        return Math.max(0, Number(income.food) || 0);
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
        else if (terrain == 5) score += 1.5; // rocks
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
            normalized = Math.min(normalized, this.barrenCityPlotSignalCap);
        }
        return normalized;
    }

    unitHasTask(unit)
    {
        return !!(unit && ((unit.gotoPath && unit.gotoPath.length) || unit.gotoCoord != undefined
            || (unit.state != undefined && unit.state != 'ready')
            || unit.automationMode || unit.pendingImmediateBuild || unit.serverActionPending
            || unit.chop_turns_left != undefined || unit.road_turns_left != undefined
            || unit.irrigation_turns_left != undefined || unit.building_turns_left != undefined));
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

    nearestFriendlyCityCoord(origin, ownerTeam)
    {
        return this.nearestUnitCoord(origin, function(unit) { return (unit.team || 0) == ownerTeam && unit.type == 3; }, ownerTeam);
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
            var waitState = command.state == 'fortified' ? 'fortified' : 'waiting';
            if (_current_game.setUnitState && unit.can_move
                && (waitState != 'fortified' || unit.type == 2)) {
                _current_game.setUnitState(k, waitState);
                command.target = new Coord(unit.coord.i, unit.coord.j);
                command.appliedState = waitState;
                return true;
            }
            command.failureReason = 'engine-selected wait state is not legal for this unit';
            return false;
        }
        if (command.command == 'build_city') {
            command.target = new Coord(unit.coord.i, unit.coord.j);
            if (unit.unitTypeId == 'settlers') {
                var previousSelection = typeof _selection == 'undefined' ? -1 : _selection;
                _selection = k;
                _current_game.doCommand('build_city');
                _selection = previousSelection;
                command.appliedState = 'city built';
                return true;
            }
            command.failureReason = 'only settlers can build city';
            return false;
        }
        if (command.command == 'irrigate' && _current_game.canBuildIrrigation && _current_game.canBuildIrrigation(k)) {
            if (_current_game.beginImprovement) _current_game.beginImprovement(k, 'irrigate');
            else _current_game.setUnitState(k, 'irrigate');
            command.target = new Coord(unit.coord.i, unit.coord.j);
            command.appliedState = 'irrigate';
            return true;
        }
        if (command.command == 'irrigate') {
            command.failureReason = 'irrigation is not available on this tile';
            return false;
        }
        if (command.command == 'chop_forest' && _current_game.canChopForest && _current_game.canChopForest(k)) {
            if (_current_game.beginImprovement) _current_game.beginImprovement(k, 'chop_forest');
            else _current_game.setUnitState(k, 'chop_forest');
            command.target = new Coord(unit.coord.i, unit.coord.j);
            command.appliedState = 'chop_forest';
            return true;
        }
        if (command.command == 'chop_forest') {
            command.failureReason = 'forest chopping is not available on this tile';
            return false;
        }
        if (command.command == 'build_improvement' && command.building == 'network'
            && unit.unitTypeId == 'workboat' && _current_game.canBuildNetwork && _current_game.canBuildNetwork(k)) {
            var previousNetworkSelection = typeof _selection == 'undefined' ? -1 : _selection;
            _selection = k;
            _current_game.doCommand('network');
            _selection = previousNetworkSelection;
            command.target = new Coord(unit.coord.i, unit.coord.j);
            command.appliedState = 'network';
            return true;
        }
        if (command.command == 'build_improvement' && _current_game.workerTileBuildingMenuOptions) {
            var buildings = _current_game.workerTileBuildingMenuOptions(k);
            command.availableBuildings = buildings.slice();
            if (command.building && buildings.indexOf(command.building) != -1) {
                if (_current_game.beginImprovement) _current_game.beginImprovement(k, command.building);
                else _current_game.setUnitState(k, command.building);
                command.target = new Coord(unit.coord.i, unit.coord.j);
                command.appliedState = command.building;
                return true;
            }
            command.failureReason = 'engine-selected worker improvement is not legal on this tile';
            return false;
        }
        if (command.command == 'build_improvement') {
            command.failureReason = 'worker improvement API is unavailable';
            return false;
        }
        if (command.command == 'road_to' && command.state == 'road' && unit.unitTypeId == 'worker'
            && _current_game.canBuildRoad && _current_game.canBuildRoad(k)) {
            if (_current_game.beginImprovement) _current_game.beginImprovement(k, 'road');
            else _current_game.setUnitState(k, 'road');
            command.target = new Coord(unit.coord.i, unit.coord.j);
            command.appliedState = 'road';
            return true;
        }
        if ((command.command == 'goto' || command.command == 'road_to' || command.command == 'attack') && unit.can_move) {
            var target = command.target;
            if (command.command == 'attack') {
                var targetUnit = target ? this.visibleUnitAtForViewer(target.i, target.j, unit.team || 0) : null;
                if (!targetUnit || (targetUnit.team || 0) == (unit.team || 0)) {
                    command.failureReason = 'engine-selected attack target is no longer an enemy';
                    return false;
                }
                unit.interactionIntent = 'attack';
                unit.interactionTargetOwnerId = targetUnit.team || 0;
                unit.attackTargetOwnerId = targetUnit.team || 0;
            }
            command.selectedTarget = target;
            if (target && _current_game.buildPath && _current_game.assignPath) {
                var path = _current_game.buildPath(k, target);
                if (path.length) {
                    command.target = path[path.length - 1];
                    command.pathLength = path.length;
                    if (command.command == 'road_to' && command.state == 'road_to'
                        && _current_game.canUseRoadTo && _current_game.canUseRoadTo(k)) {
                        _current_game.setUnitState(k, 'road_to');
                        command.appliedState = 'road_to';
                    }
                    else if (command.command == 'road_to') {
                        command.failureReason = 'engine-selected road-to route is not legal';
                        return false;
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

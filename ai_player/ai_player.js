#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {spawn} = require('node:child_process');
const {
    createBrowserClient,
} = require('../server/tests/browser_client');

const root = path.resolve(__dirname, '..');
const requestMagic = 0x51434941;
const responseMagic = 0x52434941;
const engineIds = {strategy: 0, action: 1, economics: 2};
const engineWidths = {strategy: 3524, action: 1024, economics: 1024};

function sleep(milliseconds)
{
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function exactFloatBuffer(input)
{
    const output = Buffer.allocUnsafe(input.length * 4);
    for (let index = 0; index < input.length; index++) output.writeFloatLE(Number(input[index]) || 0, index * 4);
    return output;
}

class NativeInference
{
    constructor(options = {})
    {
        this.executable = options.executable || path.join(__dirname, 'inference_worker');
        this.modelDirectory = options.modelDirectory || __dirname;
        this.child = null;
        this.buffer = Buffer.alloc(0);
        this.pending = new Map();
        this.nextRequestId = 1;
        this.readyPromise = null;
        this.readyResolve = null;
        this.readyReject = null;
    }

    start()
    {
        if (this.readyPromise) return this.readyPromise;
        this.readyPromise = new Promise((resolve, reject) => {
            this.readyResolve = resolve;
            this.readyReject = reject;
        });
        this.child = spawn(this.executable, [this.modelDirectory], {stdio: ['pipe', 'pipe', 'pipe']});
        this.child.stdout.on('data', chunk => this.consume(chunk));
        this.child.stderr.on('data', chunk => process.stderr.write('[native-ai] ' + chunk.toString()));
        this.child.on('error', error => this.fail(error));
        this.child.on('exit', (code, signal) => {
            if (code !== 0 || signal) this.fail(new Error(`inference worker exited (${code ?? signal})`));
        });
        return this.readyPromise;
    }

    consume(chunk)
    {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        while (this.buffer.length >= 16) {
            const magic = this.buffer.readUInt32LE(0);
            const requestId = this.buffer.readUInt32LE(4);
            const status = this.buffer.readUInt32LE(8);
            const width = this.buffer.readUInt32LE(12);
            if (magic !== responseMagic) return this.fail(new Error('invalid native AI response magic'));
            const bytes = 16 + width * 4;
            if (this.buffer.length < bytes) return;
            const frame = this.buffer.subarray(16, bytes);
            this.buffer = this.buffer.subarray(bytes);
            if (requestId === 0 && width === 0 && status === 0) {
                this.readyResolve(true);
                continue;
            }
            const pending = this.pending.get(requestId);
            this.pending.delete(requestId);
            if (!pending) continue;
            if (status !== 0) {
                pending.reject(new Error(`native inference failed with status ${status}`));
                continue;
            }
            const output = new Float32Array(width);
            for (let index = 0; index < width; index++) output[index] = frame.readFloatLE(index * 4);
            pending.resolve(output);
        }
    }

    fail(error)
    {
        if (this.readyReject) this.readyReject(error);
        for (const pending of this.pending.values()) pending.reject(error);
        this.pending.clear();
    }

    async infer(kind, input)
    {
        await this.start();
        if (!(kind in engineIds)) throw new Error(`unknown AI engine ${kind}`);
        if (!input || input.length !== engineWidths[kind]) {
            throw new Error(`${kind} input width ${input ? input.length : 0}, expected ${engineWidths[kind]}`);
        }
        const requestId = this.nextRequestId++;
        const header = Buffer.allocUnsafe(16);
        header.writeUInt32LE(requestMagic, 0);
        header.writeUInt32LE(requestId, 4);
        header.writeUInt32LE(engineIds[kind], 8);
        header.writeUInt32LE(input.length, 12);
        const result = new Promise((resolve, reject) => this.pending.set(requestId, {resolve, reject}));
        this.child.stdin.write(Buffer.concat([header, exactFloatBuffer(input)]));
        return await result;
    }

    stop()
    {
        if (!this.child) return;
        this.child.stdin.end();
        this.child = null;
    }
}

class ServerApi
{
    constructor(options)
    {
        this.endpoint = options.endpoint;
        this.secret = options.secret;
        this.gameId = options.gameId;
        this.clientKey = options.clientKey;
        this.timeoutMs = options.timeoutMs || 20000;
    }

    async request(action, fields = {})
    {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(Object.assign({
                    action,
                    secret: this.secret,
                    game_id: this.gameId,
                    player_id: 0,
                    client_key: this.clientKey,
                }, fields)),
                signal: controller.signal,
            });
            const text = await response.text();
            let result;
            try { result = JSON.parse(text); }
            catch (_error) { throw new Error(`${action} returned HTTP ${response.status}: ${text.slice(0, 300)}`); }
            if (!response.ok || !result.ok) {
                const error = new Error(result.error ? result.error.message : `${action} failed with HTTP ${response.status}`);
                error.code = result.error && result.error.code;
                error.response = result;
                throw error;
            }
            return result;
        }
        finally {
            clearTimeout(timeout);
        }
    }

    claim()
    {
        return this.request('claim_ai_batch', {include_snapshot: true});
    }

    submit(batch, submission)
    {
        return this.request('submit_ai_batch', {
            lease_token: batch.lease_token,
            turn: batch.turn,
            leased_unit_ids: batch.unit_ids || [],
            commands: submission.commands || [],
            actions: submission.actions || [],
        });
    }
}

function evaluate(context, filename, exportExpression)
{
    const source = fs.readFileSync(path.join(root, filename), 'utf8');
    vm.runInContext(source + (exportExpression || ''), context, {filename});
}

class BrowserAiRuntime
{
    constructor(snapshot, aiId, gameId, nativeInference, log)
    {
        const size = Number(snapshot.map_window_size) || 100;
        this.context = createBrowserClient({
            size,
            playerId: aiId,
            gameId,
            tiles: snapshot.tiles || [],
            units: [],
            serverTurn: snapshot.turn || 0,
        });
        const context = this.context;
        context._world_map_size = Math.max(size, Number(snapshot.map_size) || size);
        context.document.cookie = 'aiciv_player_id=0';
        context.document.querySelectorAll = () => [];
        context._turn_in_progress = 0;
        context.appendConsoleLog = message => log(String(message));
        evaluate(context, 'military.js', '\nglobalThis.realMilitary=_military;');
        evaluate(context, 'multiplayer.js', '\nglobalThis.realMultiplayer=_multiplayer;');
        evaluate(context, 'ai.js', '\nglobalThis.aiPlayer=_ai_player;');
        context.aiPlayer.ensureDefaultModelsLoaded = async () => true;
        context.aiPlayer.ensureBackgroundModelsLoaded = async () => true;
        context.aiPlayer.infer = (kind, input) => nativeInference.infer(kind, input);
        context.aiPlayer.inferBackground = (kind, input) => nativeInference.infer(kind, input);
        context.serverGame.reportClientError = async () => null;
        context.serverGame.hiddenActions = true;
        context.realMultiplayer.humanUserId = 0;
        context.realMultiplayer.hiddenAiUserId = aiId;
    }

    setServerTurn(turn)
    {
        this.context.serverGame.serverTurn = Number(turn) || 0;
    }

    setWorldSize(snapshot)
    {
        this.context._world_map_size = Math.max(
            this.context._map_size, Number(snapshot && snapshot.map_size) || this.context._map_size
        );
    }

    async prepareStrategy(aiId, snapshot, nativeInference)
    {
        const context = this.context;
        const input = context.realMultiplayer.withHiddenSnapshot(aiId, snapshot,
            () => context.aiPlayer.buildStrategyInput(aiId));
        const output = await nativeInference.infer('strategy', input);
        return context.realMultiplayer.withHiddenSnapshot(aiId, snapshot,
            () => context.aiPlayer.applyStrategyOutput(output, aiId));
    }

    activateSnapshot(aiId, snapshot)
    {
        const context = this.context;
        context.serverGame.setHiddenActions(true);
        context.realMultiplayer.activateHiddenPlayer(aiId);
        context.serverGame.applyFullSnapshot(aiId, snapshot, {
            pruneForeignUnits: false,
            preserveExistingForeignUnits: true,
            reconcileClientRoutes: false,
        });
    }

    async prepareUnit(aiId, snapshot, unitId, strategyFocus, snapshotAlreadyActive = false)
    {
        return await this.context.realMultiplayer.prepareAiUnitOrder(
            aiId, snapshot, unitId, strategyFocus, snapshotAlreadyActive
        );
    }

    diagnoseUnit(aiId, snapshot, unitId)
    {
        const context = this.context;
        return context.realMultiplayer.withHiddenSnapshot(aiId, snapshot, () => {
            const found = context.serverGame.findUnit(aiId, Number(unitId), null);
            if (!found || !found.unit) return {found: false};
            const unit = found.unit;
            context.aiPlayer.forcedActionUnitServerId = Number(unitId);
            let records;
            try { records = context.aiPlayer.actionUnitRecords(aiId); }
            finally { context.aiPlayer.forcedActionUnitServerId = null; }
            const i = Number(unit.coord.i);
            const j = Number(unit.coord.j);
            const bits = context._map_terrain_bit_by_user[aiId];
            return {
                found: true,
                local: [i, j],
                outside: !!unit.outsideMapWindow,
                seen: context.aiPlayer.isTileSeenByUser(i, j, aiId),
                terrainBits: bits && bits[i] ? Number(bits[i][j]) : null,
                forcedRecords: records.length,
                mapOrigin: [Number(context._map_origin_i), Number(context._map_origin_j)],
                worldSize: Number(context._world_map_size),
            };
        });
    }
}

class AiContributor
{
    constructor(options)
    {
        this.options = options;
        this.native = new NativeInference(options);
        this.api = new ServerApi(options);
        this.runtime = null;
        this.runtimeAiId = null;
        this.strategyTurn = null;
        this.strategyAiId = null;
        this.strategyFocus = null;
        this.stopped = false;
        this.acceptedBatches = 0;
    }

    log(message)
    {
        const stamp = new Date().toISOString();
        process.stdout.write(`[${stamp}] ${message}\n`);
    }

    ensureRuntime(batch)
    {
        if (this.runtime && this.runtimeAiId === Number(batch.ai_player_id)) return this.runtime;
        this.runtimeAiId = Number(batch.ai_player_id);
        this.runtime = new BrowserAiRuntime(
            batch.snapshot, this.runtimeAiId, this.options.gameId, this.native,
            message => this.log(message)
        );
        return this.runtime;
    }

    async processBatch(batch)
    {
        const aiId = Number(batch.ai_player_id);
        const runtime = this.ensureRuntime(batch);
        runtime.setWorldSize(batch.snapshot);
        runtime.setServerTurn(batch.turn);
        if (this.strategyTurn === null || this.strategyAiId !== aiId
            || Number(batch.turn) - this.strategyTurn >= this.options.strategyInterval) {
            const strategy = await runtime.prepareStrategy(aiId, batch.snapshot, this.native);
            this.strategyTurn = Number(batch.turn);
            this.strategyAiId = aiId;
            this.strategyFocus = strategy && strategy.maxMilitaryFocus;
            this.log(`turn ${batch.turn}: strategy prepared for AI ${aiId}`);
        }

        runtime.activateSnapshot(aiId, batch.snapshot);
        const combined = {commands: [], actions: []};
        for (const unitId of batch.unit_ids || []) {
            const snapshotUnit = (batch.snapshot.units || []).find(unit => Number(unit.id) === Number(unitId));
            if (!snapshotUnit) {
                this.log(`turn ${batch.turn}: leased unit ${unitId} is absent from the AI snapshot`);
            }
            const submission = await runtime.prepareUnit(
                aiId, batch.snapshot, unitId, this.strategyFocus, true
            );
            if (!submission) {
                this.log(`turn ${batch.turn}: unit ${unitId}`
                    + `${snapshotUnit ? ` ${snapshotUnit.unit_type_id}@${snapshotUnit.world_i},${snapshotUnit.world_j}` : ''}`
                    + ' produced no legal submission; adapter='
                    + JSON.stringify(runtime.diagnoseUnit(aiId, batch.snapshot, unitId)));
                continue;
            }
            combined.commands.push(...(submission.commands || []));
            combined.actions.push(...(submission.actions || []));
        }
        // captureTurn() drains every queued action in the hidden snapshot, not
        // only actions for its selected object. Keep one current action per
        // leased object so unrelated City queues cannot precede and displace a
        // Worker's completed build in the bounded server batch.
        const leasedIds = new Set((batch.unit_ids || []).map(Number));
        const leasedActions = new Map();
        for (const action of combined.actions) {
            if (!action || typeof action !== 'object') continue;
            const objectId = Number(action.worker_unit_id
                ?? action.settler_unit_id ?? action.city_unit_id ?? 0);
            if (!leasedIds.has(objectId)) continue;
            leasedActions.set(`${String(action.type || '')}:${objectId}`, action);
        }
        combined.actions = Array.from(leasedActions.values());
        const response = await this.api.submit(batch, combined);
        const commandText = combined.commands.map(command => {
            const destination = command.path && command.path.length
                ? command.path[command.path.length - 1] : null;
            return `#${command.unit_id}:${command.command}`
                + (destination ? `->${destination.i},${destination.j}` : '');
        }).join(', ') || 'none';
        const actionText = combined.actions.map(action => action.type).join(', ') || 'none';
        this.log(`turn ${batch.turn}: accepted=${response.accepted !== false}`
            + ` orders=${response.orders_stored || 0} commands=[${commandText}] actions=[${actionText}]`);
        if (response.accepted !== false) this.acceptedBatches++;
        return response;
    }

    async run()
    {
        await this.native.start();
        this.log(`native models loaded; contributing to ${this.options.endpoint}`);
        let claims = 0;
        let failures = 0;
        while (!this.stopped) {
            if (this.options.maxClaims && claims >= this.options.maxClaims) break;
            if (this.options.maxBatches && this.acceptedBatches >= this.options.maxBatches) break;
            try {
                claims++;
                const batch = await this.api.claim();
                failures = 0;
                if (batch.unit_ids && batch.unit_ids.length && batch.snapshot) {
                    await this.processBatch(batch);
                    if (this.options.cycleMs) await sleep(this.options.cycleMs);
                }
                else {
                    this.log(`turn ${batch.turn}: no unleased AI objects`);
                    await sleep(this.options.pollMs + Math.floor(Math.random() * 250));
                }
            }
            catch (error) {
                failures++;
                this.log(`contribution error${error.code ? ` ${error.code}` : ''}: ${error.message}`);
                await sleep(Math.min(10000, this.options.pollMs * Math.pow(2, Math.min(failures, 4))));
            }
        }
        this.native.stop();
        this.log(`stopped after ${claims} claims and ${this.acceptedBatches} accepted batches`);
    }

    stop()
    {
        this.stopped = true;
    }
}

function parseArguments(argv)
{
    const configuredSecretFile = process.env.AICIV_SECRET_FILE || '';
    const options = {
        endpoint: process.env.AICIV_SERVER_URL || 'https://13.60.223.71/server_game.php',
        gameId: process.env.AICIV_GAME_ID || 'aiciv-default',
        secret: process.env.AICIV_SECRET || '',
        pollMs: 1000,
        cycleMs: Math.max(0, Number(process.env.AICIV_CYCLE_MS) || 250),
        timeoutMs: Math.max(5000, Number(process.env.AICIV_REQUEST_TIMEOUT_MS) || 120000),
        strategyInterval: Math.max(1, Number(process.env.AICIV_STRATEGY_INTERVAL) || 8),
        maxClaims: 0,
        maxBatches: 0,
        executable: path.join(__dirname, 'inference_worker'),
        modelDirectory: __dirname,
        clientKey: 'node-' + os.hostname().slice(0, 30) + '-' + crypto.randomBytes(8).toString('hex'),
    };
    for (let index = 0; index < argv.length; index++) {
        const argument = argv[index];
        if (argument === '--endpoint') options.endpoint = argv[++index];
        else if (argument === '--game-id') options.gameId = argv[++index];
        else if (argument === '--poll-ms') options.pollMs = Math.max(250, Number(argv[++index]) || 1000);
        else if (argument === '--cycle-ms') options.cycleMs = Math.max(0, Number(argv[++index]) || 0);
        else if (argument === '--timeout-ms') options.timeoutMs = Math.max(5000, Number(argv[++index]) || 120000);
        else if (argument === '--strategy-interval') {
            options.strategyInterval = Math.max(1, Number(argv[++index]) || 8);
        }
        else if (argument === '--max-claims') options.maxClaims = Math.max(0, Number(argv[++index]) || 0);
        else if (argument === '--max-batches') options.maxBatches = Math.max(0, Number(argv[++index]) || 0);
        else if (argument === '--once') options.maxClaims = 1;
        else if (argument === '--help') options.help = true;
        else throw new Error(`unknown argument ${argument}`);
    }
    if (!options.secret) {
        const secretPath = configuredSecretFile || path.join(root, 'api_secret');
        if (fs.existsSync(secretPath)) options.secret = fs.readFileSync(secretPath, 'utf8').trim();
    }
    return options;
}

function usage()
{
    return [
        'Usage: node ai_player/ai_player.js [options]',
        '  --endpoint URL       server_game.php endpoint',
        '  --game-id ID         game key (default aiciv-default)',
        '  --poll-ms N          idle/error polling interval (default 1000)',
        '  --cycle-ms N         delay after a successful lease (default 250)',
        '  --timeout-ms N       HTTP request timeout (default 120000)',
        '  --strategy-interval N  turns between Strategy refreshes (default 8)',
        '  --once               make one lease claim and exit',
        '  --max-claims N       stop after N lease claims',
        '  --max-batches N      stop after N accepted non-empty batches',
        '',
        'AICIV_SECRET may provide the application secret. AICIV_SECRET_FILE selects its file;',
        'otherwise ../api_secret is used.',
    ].join('\n');
}

async function main()
{
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
        console.log(usage());
        return;
    }
    if (!options.secret) throw new Error('AICIV_SECRET or api_secret is required');
    const contributor = new AiContributor(options);
    process.on('SIGINT', () => contributor.stop());
    process.on('SIGTERM', () => contributor.stop());
    await contributor.run();
}

if (require.main === module) {
    main().catch(error => {
        console.error(error.stack || error.message || error);
        process.exitCode = 1;
    });
}

module.exports = {NativeInference, ServerApi, BrowserAiRuntime, AiContributor, parseArguments};

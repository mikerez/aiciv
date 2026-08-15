#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const directory = __dirname;
const rxPath = process.env.AICIV_TEST_PIPE_RX || path.join(directory, 'pipe.rx');
const txPath = process.env.AICIV_TEST_PIPE_TX || path.join(directory, 'pipe.tx');

function pipeExchange(payload) {
    fs.writeFileSync(rxPath, JSON.stringify(payload) + '\n');
    const encoded = fs.readFileSync(txPath, 'utf8');
    const envelope = JSON.parse(encoded);
    if (!envelope.transport_ok) {
        throw new Error('PHP transport failed: ' + (envelope.stderr || envelope.stdout || envelope.exit_code));
    }
    return envelope;
}

function createPipeFetch() {
    return async function(_url, options) {
        const envelope = pipeExchange(JSON.parse(options.body));
        const responseText = JSON.stringify(envelope.body);
        return {
            ok: envelope.status >= 200 && envelope.status < 300,
            status: envelope.status,
            text: async () => responseText,
            json: async () => envelope.body,
        };
    };
}

global.fetch = createPipeFetch();

global._map_size = 8;
const {serverGame} = require('../../server_game.js');
serverGame.reportClientError = async function() { return null; };
serverGame.endpoint = 'pipe://server_game.php';

function mysqlArguments() {
    return [
        '--protocol=TCP',
        '-h', process.env.AICIV_TEST_DB_HOST || '127.0.0.1',
        '-u', process.env.AICIV_TEST_DB_USER || 'aiciv_test',
        '--batch', '--raw', '--skip-column-names',
        process.env.AICIV_TEST_DB_NAME || 'softmaxi_game_test',
    ];
}

function sql(statement) {
    const result = spawnSync('mysql', mysqlArguments(), {
        input: statement,
        encoding: 'utf8',
        env: Object.assign({}, process.env, {MYSQL_PWD: process.env.AICIV_TEST_DB_PASSWORD || 'aiciv_test'}),
    });
    if (result.status !== 0) {
        throw new Error('MySQL failed: ' + result.stderr + '\nSQL: ' + statement);
    }
    return result.stdout.trim();
}

function rows(statement) {
    const output = sql(statement);
    return output === '' ? [] : output.split('\n').map(line => line.split('\t'));
}

function value(statement) {
    const result = rows(statement);
    return result.length ? result[0][0] : null;
}

function resetDatabase() {
    sql(`SET FOREIGN_KEY_CHECKS=0;
         DELETE FROM productions;
         DELETE FROM server_game_events;
         DELETE FROM server_game_ai_leases;
         DELETE FROM server_game_orders;
         DELETE FROM server_game_relations;
         DELETE FROM server_game_submissions;
         DELETE FROM server_game_visibility;
         DELETE FROM server_game_units;
         DELETE FROM server_game_map;
         DELETE FROM server_game_players;
         DELETE FROM server_games;
         DELETE FROM game_user_sessions;
         DELETE FROM game_users;
         SET FOREIGN_KEY_CHECKS=1;`);
    serverGame.serverTurn = 0;
    serverGame.serverRevision = 0;
    serverGame.unitRevisionByPlayer = {};
    serverGame.landscapeRevisionByPlayer = {};
    serverGame.eventIdByPlayer = {};
    serverGame.appliedSnapshotRevisionByPlayer = {};
    serverGame.seenEventIdsByPlayer = {};
    serverGame.pendingTurnActionsByPlayer = {};
    serverGame.nextTurnActionId = 1;
}

function tile(i, j, terrainType = 2, options = {}) {
    return {
        i, j,
        terrain_tex: terrainType | ((options.depth || 0) << 4) | (options.waterSource ? 0x80 : 0),
        terrain_bits: options.terrainBits === undefined ? 0 : options.terrainBits,
        resource_type: options.resourceType || 0,
        modifiers: options.modifiers || {},
    };
}

function mapTiles(size, terrainType = 2) {
    const result = [];
    for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) result.push(tile(i, j, terrainType));
    return result;
}

function unit(overrides = {}) {
    return Object.assign({
        client_key: 'unit-1', owner_id: 7001, unit_type_id: 'worker', unit_class: 1,
        name: 'Worker', texture: 270, can_move: true, nature: 'land', i: 3, j: 3,
        attack: 0, defense: 1, speed: 1, view_range: 2, state: 'ready',
        health: 100, max_health: 100, experience: 1, move_penalty: 0, properties: {},
    }, overrides);
}

function city(overrides = {}) {
    return unit(Object.assign({
        client_key: 'city-1', unit_type_id: 'city', unit_class: 3, name: 'City', texture: 259,
        can_move: false, attack: 0, defense: 8, speed: 0, view_range: 3,
        properties: {
            cityPopulation: 1,
            cityFoodStored: 0,
            cityProperties: {productionPerTurn: 5, productionStored: 0},
            production: null,
            productionDisabled: false,
        },
    }, overrides));
}

function setPlayerState(gameDbId, playerId, state) {
    sql(`UPDATE server_game_players SET state_json='${JSON.stringify(state).replaceAll("'", "''")}' `
        + `WHERE game_id=${Number(gameDbId)} AND player_id=${Number(playerId)}`);
}

async function bootstrap(options = {}) {
    const playerId = options.playerId || 7001;
    const gameId = options.gameId || ('test-' + path.basename(process.argv[1], '.test.js'));
    const size = options.size || 8;
    global._map_size = size;
    serverGame.gameId = gameId;
    const result = await serverGame.request('make_turn', {
        player_id: playerId,
        turn: 0,
        commands: [], actions: [], player_state: {}, relations: {}, include_updates: true,
        bootstrap: {
            map_size: size,
            tiles: options.tiles || mapTiles(size),
            units: options.units || [unit({owner_id: playerId})],
            players: options.players || [playerId],
        },
    });
    return {result, playerId, gameId, size, unitIds: result.unit_id_map || {}};
}

async function expectRequestError(action, body, code) {
    await assert.rejects(
        () => serverGame.request(action, body),
        error => error && error.code === code
    );
}

function gameDatabaseId(gameId) {
    return Number(value("SELECT id FROM server_games WHERE game_key='" + gameId.replaceAll("'", "''") + "'"));
}

module.exports = {
    assert, serverGame, pipeExchange, createPipeFetch, sql, rows, value, resetDatabase,
    tile, mapTiles, unit, city, setPlayerState, bootstrap, expectRequestError, gameDatabaseId,
};

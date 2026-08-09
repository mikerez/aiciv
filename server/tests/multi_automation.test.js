#!/usr/bin/env node
'use strict';

const {
    assert, resetDatabase, bootstrap, mapTiles, unit, rows, sql, setPlayerState, gameDatabaseId,
} = require('./test_client');
const {createBrowserClient, localUnit, runClientTurn} = require('./browser_client');

const resources = [
    {id: 1, terrain: 6, improvement: 'plantation'},
    {id: 2, terrain: 2, improvement: 'pasture'},
    {id: 3, terrain: 4, improvement: 'mine'},
    {id: 5, terrain: 6, improvement: 'camp'},
    {id: 7, terrain: 2, improvement: 'farm'},
    {id: 9, terrain: 5, improvement: 'quarry'},
    {id: 32, terrain: 2, improvement: 'winery'},
];

function random(seed) {
    let state = seed >>> 0;
    return () => {
        state = (1664525 * state + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function shuffledPositions(rng) {
    const positions = [];
    for (let i = 4; i <= 8; i++) for (let j = 4; j <= 8; j++) positions.push({i, j});
    for (let n = positions.length - 1; n > 0; n--) {
        const swap = Math.floor(rng() * (n + 1));
        [positions[n], positions[swap]] = [positions[swap], positions[n]];
    }
    return positions;
}

function modifiersByPoint(gameDbId) {
    const result = {};
    for (const [i, j, encoded] of rows(
        `SELECT i,j,modifiers_json FROM server_game_map WHERE game_id=${gameDbId}`
    )) result[`${i}:${j}`] = JSON.parse(encoded);
    return result;
}

(async () => {
    for (let scenario = 0; scenario < 10; scenario++) {
        resetDatabase();
        const rng = random(0xa17c0000 + scenario);
        const size = 12;
        const tiles = mapTiles(size, 2);
        const positions = shuffledPositions(rng);
        const targets = resources.map((resource, index) => Object.assign({}, resource, positions[index]));
        for (const target of targets) {
            const mapTile = tiles.find(item => item.i === target.i && item.j === target.j);
            mapTile.terrain_tex = target.terrain;
            mapTile.resource_type = target.id;
        }

        const start = positions[resources.length];
        const workers = [unit({
            client_key: `auto-${scenario}`,
            owner_id: 7100 + scenario,
            i: start.i,
            j: start.j,
            state: 'automate',
            properties: {automationMode: 'automate'},
        })];
        const fixture = await bootstrap({
            playerId: 7100 + scenario,
            gameId: `multi-automation-${scenario}`,
            size,
            tiles,
            units: workers,
        });
        const localWorkers = workers.map(worker => {
            const local = localUnit(worker, fixture.unitIds[worker.client_key]);
            local.automationMode = 'automate';
            return local;
        });
        const client = createBrowserClient({
            size,
            playerId: fixture.playerId,
            gameId: fixture.gameId,
            tiles,
            units: localWorkers,
            serverTurn: fixture.result.turn,
        });
        const gameDbId = gameDatabaseId(fixture.gameId);
        for (const target of targets) {
            sql(`INSERT INTO server_game_visibility `
                + `(game_id, player_id, i, j, visibility_level, resource_visible, revision) `
                + `VALUES (${gameDbId}, ${fixture.playerId}, ${target.i}, ${target.j}, 1, 1, 1) `
                + `ON DUPLICATE KEY UPDATE visibility_level=GREATEST(visibility_level, 1), `
                + `resource_visible=1, revision=revision+1`);
        }
        setPlayerState(gameDbId, fixture.playerId, {food: 5000, money: 0});
        client._game_state.food = 5000;
        const buildStart = new Map();
        const completed = new Set();
        const submittedBuilds = [];
        for (let turn = 1; turn <= 100 && completed.size < targets.length; turn++) {
            const {submission} = await runClientTurn(client);
            for (const command of submission.commands) {
                if (command.command !== 'set_state') continue;
                const modifier = command.payload.state === 'irrigate'
                    ? 'irrigation' : command.payload.state;
                if (modifier) {
                    const key = `${command.unit_id}:${modifier}`;
                    if (!buildStart.has(key)) buildStart.set(key, turn);
                }
            }
            for (const action of submission.actions.filter(item => item.type === 'build')) {
                submittedBuilds.push({turn, worker: action.worker_unit_id, building: action.building_type});
                const key = `${action.worker_unit_id}:${action.building_type}`;
                assert.equal(turn - buildStart.get(key), 1,
                    `scenario ${scenario}: ${action.building_type} must consume exactly two client turns`);
                buildStart.delete(key);
            }
            const state = modifiersByPoint(gameDbId);
            targets.forEach((target, index) => {
                if (state[`${target.i}:${target.j}`] && state[`${target.i}:${target.j}`][target.improvement]) {
                    completed.add(index);
                }
            });
            for (const worker of client._units_by_user[fixture.playerId].filter(item => item.unitTypeId === 'worker')) {
                assert.equal(worker.automationMode, 'automate',
                    `scenario ${scenario}: Automate must persist after movement/build updates`);
                if (worker.state === 'chop_forest') {
                    const terrain = client._map_terrain_tex[worker.coord.i][worker.coord.j];
                    assert.ok(client.currentGame.isChoppableForestTerrain(terrain),
                        `scenario ${scenario}: Worker must leave chop_forest immediately after PHP chops its Tile`);
                }
            }
        }

        const finalState = modifiersByPoint(gameDbId);
        const missing = targets.filter(target => !finalState[`${target.i}:${target.j}`][target.improvement]);
        const finalWorkerIndex = client._units.findIndex(item => item.unitTypeId === 'worker');
        const missingDiagnostics = missing.map(item => ({
            resource: client._map_resource[item.i][item.j],
            options: client.currentGame.workerAutomationOptionsAt(finalWorkerIndex, item.i, item.j),
            path: client.currentGame.buildPath(finalWorkerIndex, new client.Coord(item.i, item.j)),
            canEnter: client.currentGame.canUnitEnterTile(finalWorkerIndex, item.i, item.j),
        }));
        assert.equal(completed.size, targets.length,
            `scenario ${scenario}: Automate must improve every resource Tile in the randomized 10x10 region; missing ${JSON.stringify(missing)}; diagnostics ${JSON.stringify(missingDiagnostics)}; builds ${JSON.stringify(submittedBuilds)}; workers ${JSON.stringify(client._units.filter(item => item.unitTypeId === 'worker').map(item => ({i: item.coord.i, j: item.coord.j, state: item.state, target: item.automateTarget})))}`);
    }
    console.log('PASS 10 randomized multi-turn Worker Automate scenarios use real JS, PHP, and MySQL');
})().catch(error => { console.error(error); process.exitCode = 1; });

#!/usr/bin/env node
'use strict';

const {
    assert, resetDatabase, bootstrap, mapTiles, unit, city, rows, sql, setPlayerState, gameDatabaseId,
} = require('./test_client');
const {createBrowserClient, localUnit, runClientTurn} = require('./browser_client');

const resources = [
    {id: 1, terrain: 6, improvement: 'plantation'},
    {id: 2, terrain: 2, improvement: 'pasture'},
    {id: 3, terrain: 4, improvement: 'mine'},
    {id: 5, terrain: 6, improvement: 'camp'},
    {id: 7, terrain: 2|0x80, improvement: 'farm'},
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
    for (let i = 4; i <= 8; i++) for (let j = 4; j <= 8; j++) {
        if (i !== 6 || j !== 6) positions.push({i, j});
    }
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

function roadConnected(state, cityI, cityJ, targetI, targetJ) {
    const queue = [{i: cityI, j: cityJ}];
    const visited = new Set();
    const directions = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1]];
    while (queue.length) {
        const point = queue.shift();
        const key = `${point.i}:${point.j}`;
        if (visited.has(key) || !state[key]) continue;
        const origin = point.i === cityI && point.j === cityJ;
        if (!origin && !state[key].road) continue;
        visited.add(key);
        if (point.i === targetI && point.j === targetJ) return true;
        for (const [di, dj] of directions) queue.push({i: point.i + di, j: point.j + dj});
    }
    return false;
}

(async () => {
    const scenarioCount = Math.max(1, Number(process.env.AICIV_AUTOMATION_SCENARIOS || 10));
    const turnLimit = Math.max(1, Number(process.env.AICIV_AUTOMATION_TURN_LIMIT || 500));
    for (let scenario = 0; scenario < scenarioCount; scenario++) {
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
        const capital = city({
            client_key: `capital-${scenario}`,
            owner_id: 7100 + scenario,
            i: 6,
            j: 6,
            properties: {
                cityPopulation: 1,
                cityFoodStored: 10000,
                cityProperties: {productionPerTurn: 0, productionStored: 0},
                production: null,
                productionDisabled: true,
            },
        });
        const workers = [unit({
            client_key: `auto-${scenario}`,
            owner_id: 7100 + scenario,
            i: start.i,
            j: start.j,
            state: 'automate',
            properties: {
                automationMode: 'automate',
                guardResource: {i: targets[0].i, j: targets[0].j, type: targets[0].id},
            },
        })];
        const fixture = await bootstrap({
            playerId: 7100 + scenario,
            gameId: `multi-automation-${scenario}`,
            size,
            tiles,
            units: [capital].concat(workers),
        });
        const localUnits = [capital].concat(workers).map(definition => {
            const local = localUnit(definition, fixture.unitIds[definition.client_key]);
            if (definition.unit_type_id == 'worker') local.automationMode = 'automate';
            return local;
        });
        const client = createBrowserClient({
            size,
            playerId: fixture.playerId,
            gameId: fixture.gameId,
            tiles,
            units: localUnits,
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
        const immediateRoadFollowups = new Set();
        const submittedBuilds = [];
        for (let turn = 1; turn <= turnLimit && completed.size < targets.length; turn++) {
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
                if (action.building_type !== 'road') {
                    const expectedWait = action.building_type === 'farm' ? 4 : 5;
                    assert.equal(turn - buildStart.get(key), expectedWait,
                        `scenario ${scenario}: ${action.building_type} must consume its configured client turns`);
                }
                buildStart.delete(key);
            }
            for (const worker of client._units_by_user[fixture.playerId].filter(item => item.unitTypeId === 'worker')) {
                const resourceTarget = targets.find(target => target.i === worker.coord.i && target.j === worker.coord.j);
                if (resourceTarget && worker.state === resourceTarget.improvement) {
                    immediateRoadFollowups.add(resourceTarget.id);
                }
            }
            const state = modifiersByPoint(gameDbId);
            targets.forEach((target, index) => {
                if (state[`${target.i}:${target.j}`] && state[`${target.i}:${target.j}`][target.improvement]
                    && roadConnected(state, 6, 6, target.i, target.j)) {
                    completed.add(index);
                }
            });
            for (const worker of client._units_by_user[fixture.playerId].filter(item => item.unitTypeId === 'worker')) {
                assert.ok(worker.automationMode === 'automate'
                    || (worker.automationMode === 'road_to' && worker.resumeAutomationAfterRoadTo),
                    `scenario ${scenario}: automatic Road-to must retain its resume-Automate marker`);
                assert.ok(client.currentGame.hexDistance(worker.coord.i - 6, worker.coord.j - 6) <= 5,
                    `scenario ${scenario}: automated Worker must remain in its owned City's work radius`);
                if (worker.state === 'chop_forest') {
                    const terrain = client._map_terrain_tex[worker.coord.i][worker.coord.j];
                    assert.ok(client.currentGame.isChoppableForestTerrain(terrain),
                        `scenario ${scenario}: Worker must leave chop_forest immediately after PHP chops its Tile`);
                }
            }
        }

        const finalState = modifiersByPoint(gameDbId);
        const missing = targets.filter(target => !finalState[`${target.i}:${target.j}`][target.improvement]
            || !roadConnected(finalState, 6, 6, target.i, target.j));
        const finalWorkerIndex = client._units.findIndex(item => item.unitTypeId === 'worker');
        const missingDiagnostics = missing.map(item => ({
            resource: client._map_resource[item.i][item.j],
            options: client.currentGame.workerAutomationOptionsAt(finalWorkerIndex, item.i, item.j),
            path: client.currentGame.buildPath(finalWorkerIndex, new client.Coord(item.i, item.j)),
            canEnter: client.currentGame.canUnitEnterTile(finalWorkerIndex, item.i, item.j),
        }));
        assert.equal(completed.size, targets.length,
            `scenario ${scenario}: Automate must improve and road-connect every resource Tile in the randomized City work region; missing ${JSON.stringify(missing)}; diagnostics ${JSON.stringify(missingDiagnostics)}; builds ${JSON.stringify(submittedBuilds)}; workers ${JSON.stringify(client._units.filter(item => item.unitTypeId === 'worker').map(item => ({i: item.coord.i, j: item.coord.j, state: item.state, target: item.automateTarget})))}`);
        assert.ok(immediateRoadFollowups.has(1),
            `scenario ${scenario}: a Worker finishing the Banana road must immediately begin Plantation`);
        assert.ok(immediateRoadFollowups.has(32),
            `scenario ${scenario}: a Worker finishing the Wine road must immediately begin Winery`);
    }
    console.log(`PASS ${scenarioCount} randomized multi-turn resource-guard Worker Automate scenarios build improvements and connecting roads through real JS, PHP, and MySQL`);
})().catch(error => { console.error(error); process.exitCode = 1; });

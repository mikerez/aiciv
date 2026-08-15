#!/usr/bin/env node
'use strict';

const {
    assert, resetDatabase, bootstrap, mapTiles, unit, city, rows, setPlayerState, gameDatabaseId,
} = require('./test_client');
const {Coord, createBrowserClient, localUnit, runClientTurn} = require('./browser_client');

function random(seed) {
    let state = seed >>> 0;
    return () => {
        state = (1103515245 * state + 12345) >>> 0;
        return state / 0x100000000;
    };
}

function roadPoints(gameDbId) {
    return new Set(rows(
        `SELECT i,j FROM server_game_map WHERE game_id=${gameDbId} AND JSON_EXTRACT(modifiers_json,'$.road') = true`
    ).map(([i, j]) => `${i}:${j}`));
}

(async () => {
    resetDatabase();
    const waterShortcutTiles = mapTiles(8, 2);
    waterShortcutTiles.find(mapTile => mapTile.i === 1 && mapTile.j === 1).modifiers = {road: true};
    waterShortcutTiles.find(mapTile => mapTile.i === 2 && mapTile.j === 1).terrain_tex = 0;
    const shortcutWorkerDefinition = unit({
        client_key: 'roadto-water-worker', owner_id: 7199, i: 1, j: 1,
        state: 'road_to', properties: {automationMode: 'road_to'},
    });
    const frigateDefinition = unit({
        client_key: 'roadto-water-frigate', owner_id: 7199, unit_type_id: 'frigate',
        unit_class: 2, name: 'Frigate', nature: 'water', i: 2, j: 1,
        attack: 5, defense: 5, speed: 3,
    });
    const shortcutFixture = await bootstrap({
        playerId: 7199, gameId: 'multi-roadto-water-shortcut', size: 8,
        tiles: waterShortcutTiles, units: [shortcutWorkerDefinition, frigateDefinition],
    });
    const shortcutWorker = localUnit(
        shortcutWorkerDefinition, shortcutFixture.unitIds[shortcutWorkerDefinition.client_key]
    );
    const frigate = localUnit(frigateDefinition, shortcutFixture.unitIds[frigateDefinition.client_key]);
    shortcutWorker.state = 'road_to';
    shortcutWorker.automationMode = 'road_to';
    const shortcutClient = createBrowserClient({
        size: 8, playerId: shortcutFixture.playerId, gameId: shortcutFixture.gameId,
        tiles: waterShortcutTiles, units: [shortcutWorker, frigate], serverTurn: shortcutFixture.result.turn,
    });
    const ordinaryPath = shortcutClient.currentGame.buildPath(0, new Coord(4, 1));
    assert.ok(ordinaryPath.some(point => point.i === 2 && point.j === 1),
        'ordinary Goto may embark a Worker onto a friendly Frigate');
    const roadPath = shortcutClient.currentGame.buildRoadPath(0, new Coord(4, 1));
    assert.ok(roadPath.length > 0, 'Road-to must find the available land detour');
    assert.ok(roadPath.every(point => (waterShortcutTiles.find(
        mapTile => mapTile.i === point.i && mapTile.j === point.j
    ).terrain_tex & 0x0f) !== 0), 'Road-to route must contain no water Tiles');
    shortcutClient.currentGame.assignPath(0, roadPath);
    const shortcutSubmission = shortcutClient.serverGame.captureTurn(shortcutFixture.playerId);
    const workerMove = shortcutSubmission.commands.find(
        command => command.unit_id === shortcutWorker.serverId && command.command === 'move'
    );
    assert.equal(workerMove.payload.road_to, true,
        'Road-to atomic movement must be marked for authoritative PHP validation');
    const rejectedWaterMove = await shortcutClient.serverGame.request('make_turn', {
            player_id: shortcutFixture.playerId, turn: shortcutFixture.result.turn,
            commands: [{
                unit_id: shortcutWorker.serverId, command: 'move',
                path: [{i: 2, j: 1}], payload: {road_to: true},
            }], actions: [], player_state: {}, relations: {}, include_updates: true,
        });
    assert.equal(
        rejectedWaterMove.rejected_movements[0].validation.stopped.reason,
        'road_to_water_forbidden',
        'PHP must reject a Road-to water step even when a friendly Frigate is present'
    );

    for (let scenario = 0; scenario < 10; scenario++) {
        resetDatabase();
        const rng = random(0x70ad0000 + scenario);
        const size = 12;
        const tiles = mapTiles(size, 2);
        for (const mapTile of tiles) {
            mapTile.terrain_tex = 1 + Math.floor(rng() * 6);
        }
        tiles.find(mapTile => mapTile.i === 1 && mapTile.j === 1).terrain_tex = 2;
        const start = {i: 2 + Math.floor(rng() * 3), j: 2 + Math.floor(rng() * 3)};
        let destination = {i: 7 + Math.floor(rng() * 3), j: 7 + Math.floor(rng() * 3)};
        if (scenario % 2) destination = {i: destination.i, j: 2 + Math.floor(rng() * 3)};
        const workerDefinition = unit({
            client_key: `roadto-${scenario}`,
            owner_id: 7200 + scenario,
            i: start.i,
            j: start.j,
            state: 'road_to',
            properties: {automationMode: 'road_to'},
        });
        const cityDefinition = city({
            client_key: `roadto-city-${scenario}`,
            owner_id: 7200 + scenario,
            i: 1,
            j: 1,
            properties: {
                cityPopulation: 1,
                cityFoodStored: 1000,
                cityProperties: {productionPerTurn: 0, productionStored: 0},
                production: null,
                productionDisabled: true,
            },
        });
        const fixture = await bootstrap({
            playerId: 7200 + scenario,
            gameId: `multi-roadto-${scenario}`,
            size,
            tiles,
            units: [workerDefinition, cityDefinition],
        });
        const worker = localUnit(workerDefinition, fixture.unitIds[workerDefinition.client_key]);
        const localCity = localUnit(cityDefinition, fixture.unitIds[cityDefinition.client_key]);
        worker.state = 'road_to';
        worker.automationMode = 'road_to';
        const client = createBrowserClient({
            size,
            playerId: fixture.playerId,
            gameId: fixture.gameId,
            tiles,
            units: [worker, localCity],
            serverTurn: fixture.result.turn,
        });
        const route = client.currentGame.buildRoadPath(0, new Coord(destination.i, destination.j));
        assert.ok(route.length >= 3, `scenario ${scenario}: randomized Road-to route must be non-trivial`);
        let previous = start;
        for (const point of route) {
            const di = point.i - previous.i;
            const dj = point.j - previous.j;
            assert.ok(Math.max(Math.abs(di), Math.abs(dj)) === 1 && di !== -dj,
                `scenario ${scenario}: route must use legal contiguous map steps`);
            previous = point;
        }
        assert.deepEqual([previous.i, previous.j], [destination.i, destination.j]);
        worker.gotoPath = [];
        worker.gotoCoord = new Coord(destination.i, destination.j);
        worker.roadToBuilding = true;
        client.currentGame.completeRoadToBuild(worker, true);
        assert.equal(worker.state, 'road_to',
            `scenario ${scenario}: a temporarily unroutable Road-to destination must survive a completed road`);
        assert.equal(worker.automationMode, 'road_to');
        client.currentGame.assignPath(0, route);
        client.currentGame.prepareRoadToTurn(0);
        const expected = new Set([`${start.i}:${start.j}`, ...route.map(point => `${point.i}:${point.j}`)]);
        const startedAt = new Map();
        const gameDbId = gameDatabaseId(fixture.gameId);
        setPlayerState(gameDbId, fixture.playerId, {food: 5000, money: 5000});
        client._game_state.food = 5000;
        client._game_state.money = 5000;
        let turns = 0;

        while (turns < 180) {
            turns++;
            const before = roadPoints(gameDbId);
            const {submission} = await runClientTurn(client);
            for (const command of submission.commands) {
                if (command.command === 'set_state' && command.payload.state === 'road_to') {
                    const point = `${worker.coord.i}:${worker.coord.j}`;
                    if (!startedAt.has(point)) startedAt.set(point, turns);
                }
            }
            for (const action of submission.actions.filter(item => item.type === 'build')) {
                assert.equal(action.building_type, 'road');
                const point = `${worker.coord.i}:${worker.coord.j}`;
                assert.equal(turns - startedAt.get(point), 5,
                    `scenario ${scenario}: road at ${point} must consume exactly six client turns`);
                assert.ok(!before.has(point), `scenario ${scenario}: road must not exist before completion`);
            }
            const built = roadPoints(gameDbId);
            if ([...expected].every(point => built.has(point))
                && worker.state === 'ready' && !worker.automationMode) break;
        }

        const built = roadPoints(gameDbId);
        assert.deepEqual([...built].sort(), [...expected].sort(),
            `scenario ${scenario}: Road-to must build only its selected route`);
        assert.equal(worker.coord.i, destination.i);
        assert.equal(worker.coord.j, destination.j);
        assert.equal(turns, route.length * 7 + 6,
            `scenario ${scenario}: every route step needs one move plus a six-turn road build`);
    }
    console.log('PASS water transport exclusion and 10 randomized multi-turn Road-to scenarios use real JS, PHP, and MySQL');
})().catch(error => { console.error(error); process.exitCode = 1; });

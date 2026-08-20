#!/usr/bin/env node
'use strict';

const {
    assert, serverGame, resetDatabase, bootstrap, mapTiles, city, value,
} = require('./test_client');

function setTile(tiles, i, j, terrain, modifiers) {
    const tile = tiles.find(candidate => candidate.i === i && candidate.j === j);
    tile.terrain_tex = terrain;
    tile.modifiers = modifiers || {};
}

function setResource(tiles, i, j, resourceType) {
    tiles.find(candidate => candidate.i === i && candidate.j === j).resource_type = resourceType;
}

async function optimize(mode) {
    resetDatabase();
    const tiles = mapTiles(9, 1);
    setTile(tiles, 4, 4, 1, {});
    setTile(tiles, 4, 5, 2, {road: true, irrigation: true, farm: true});
    setTile(tiles, 5, 4, 1, {road: true, workshop: true});
    setTile(tiles, 3, 4, 7, {});
    const fixture = await bootstrap({
        size: 9,
        tiles,
        units: [city({client_key: 'capital', i: 4, j: 4})],
    });
    const response = await serverGame.request('make_turn', {
        player_id: fixture.playerId,
        turn: fixture.result.turn,
        commands: [],
        actions: [{
            client_action_id: 'optimize-' + mode,
            type: 'optimize_city',
            city_unit_id: fixture.unitIds.capital,
            optimization: mode,
        }],
        player_state: {}, relations: {}, include_updates: true,
    });
    const action = response.action_results.find(result => result.client_action_id === 'optimize-' + mode);
    assert.equal(action.ok, true, mode + ' optimization should be accepted');
    assert.equal(action.result.optimization, mode);
    const returnedCitizen = action.result.city.properties.economy.citizens[0];
    const properties = JSON.parse(value(
        `SELECT properties_json FROM server_game_units WHERE id=${fixture.unitIds.capital}`
    ));
    return {
        returned: [Number(returnedCitizen.coord.i), Number(returnedCitizen.coord.j)],
        stored: [
            Number(properties.economy.citizens[0].coord.i),
            Number(properties.economy.citizens[0].coord.j),
        ],
        mode: properties.cityOptimization,
    };
}

async function optimizePastureEndpoint() {
    resetDatabase();
    const tiles = mapTiles(9, 1);
    setTile(tiles, 4, 4, 2, {road: true});
    setTile(tiles, 4, 5, 2, {road: true});
    setTile(tiles, 4, 6, 2, {pasture: true});
    setResource(tiles, 4, 6, 2); // Cattle: Pasture raises this plot to six food.
    const fixture = await bootstrap({
        size: 9,
        tiles,
        units: [city({client_key: 'pasture-city', i: 4, j: 4})],
    });
    const response = await serverGame.request('make_turn', {
        player_id: fixture.playerId,
        turn: fixture.result.turn,
        commands: [],
        actions: [{
            client_action_id: 'optimize-pasture-endpoint',
            type: 'optimize_city',
            city_unit_id: fixture.unitIds['pasture-city'],
            optimization: 'food',
        }],
        player_state: {}, relations: {}, include_updates: true,
    });
    const action = response.action_results.find(
        result => result.client_action_id === 'optimize-pasture-endpoint'
    );
    assert.equal(action.ok, true, 'Pasture endpoint optimization should be accepted');
    const citizen = action.result.city.properties.economy.citizens[0];
    assert.deepEqual([Number(citizen.coord.i), Number(citizen.coord.j)], [4, 6],
        'food optimization should assign a citizen to the Pasture beside the connected road');
}

async function optimizeBalancedSurvival() {
    resetDatabase();
    const tiles = mapTiles(9, 1);
    setTile(tiles, 4, 4, 2, {}); // Grass: two food, balanced score eight.
    setTile(tiles, 5, 4, 5, {}); // Rocks: three production, balanced score nine.
    const fixture = await bootstrap({
        size: 9,
        tiles,
        units: [city({client_key: 'survival-city', i: 4, j: 4})],
    });
    const response = await serverGame.request('make_turn', {
        player_id: fixture.playerId,
        turn: fixture.result.turn,
        commands: [],
        actions: [{
            client_action_id: 'optimize-survival',
            type: 'optimize_city',
            city_unit_id: fixture.unitIds['survival-city'],
            optimization: 'balanced',
        }],
        player_state: {}, relations: {}, include_updates: true,
    });
    const action = response.action_results.find(
        result => result.client_action_id === 'optimize-survival'
    );
    assert.equal(action.ok, true);
    const citizen = action.result.city.properties.economy.citizens[0];
    assert.deepEqual([Number(citizen.coord.i), Number(citizen.coord.j)], [4, 4],
        'balanced assignment feeds population one instead of choosing zero-food Rocks');
}

(async () => {
    const expected = {
        food: [4, 5],
        production: [5, 4],
        gold: [3, 4],
        balanced: [4, 5],
    };
    for (const mode of Object.keys(expected)) {
        const result = await optimize(mode);
        assert.deepEqual(result.returned, expected[mode], mode + ' should return its best worked Tile');
        assert.deepEqual(result.stored, expected[mode], mode + ' should persist its best worked Tile');
        assert.equal(result.mode, mode, mode + ' should persist its optimization mode');
    }
    await optimizePastureEndpoint();
    await optimizeBalancedSurvival();
    console.log('PASS optimize_city reallocates, returns, and persists authoritative citizen plots for every focus');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

#!/usr/bin/env node
'use strict';
const {assert, serverGame, resetDatabase, bootstrap, mapTiles, unit, city, rows, value, sql, gameDatabaseId} = require('./test_client');

(async () => {
    resetDatabase();
    const size = 16;
    const tiles = mapTiles(size);
    for (const tile of tiles) {
        if (tile.i < 8) tile.terrain_tex = tile.i;
    }
    const specs = [];
    for (let terrain = 0; terrain < 8; terrain++) {
        specs.push(unit({client_key: `land-${terrain}`, unit_type_id: 'explorer', name: 'Explorer', i: terrain, j: 1, speed: 1}));
        specs.push(unit({client_key: `water-${terrain}`, unit_type_id: 'trireme', unit_class: 2, name: 'Trireme', nature: 'water', i: terrain, j: 3, attack: 1, speed: 1}));
        specs.push(unit({client_key: `hold-${terrain}`, unit_type_id: 'explorer', name: 'Explorer', i: terrain, j: 5}));
        specs.push(unit({client_key: `wait-${terrain}`, unit_type_id: 'explorer', name: 'Explorer', i: terrain, j: 6}));
        specs.push(unit({client_key: `fortify-${terrain}`, unit_type_id: 'warrior', unit_class: 2, name: 'Warrior', i: terrain, j: 7, attack: 2}));
        specs.push(unit({client_key: `state-${terrain}`, unit_type_id: 'explorer', name: 'Explorer', i: terrain, j: 8}));
        specs.push(unit({client_key: `chop-${terrain}`, i: terrain, j: 9}));
        specs.push(city({client_key: `produce-${terrain}`, i: terrain, j: 11}));
    }
    specs.push(unit({client_key: 'stack-filler', unit_type_id: 'warrior', unit_class: 2,
        name: 'Warrior', i: 9, j: 3, speed: 1}));
    specs.push(unit({client_key: 'stack-mover', unit_type_id: 'elephant', unit_class: 2,
        name: 'Elephant', i: 10, j: 1, speed: 2, attack: 5, defense: 4}));
    specs.push(unit({client_key: 'automated-worker', i: 12, j: 1,
        state: 'automate', properties: {automationMode: 'automate'}}));
    for (let index = 0; index < 4; index++) {
        specs.push(unit({client_key: `stack-target-${index}`, unit_type_id: 'warrior',
            unit_class: 2, name: 'Warrior', i: 10, j: 3}));
    }
    specs.push(city({client_key: 'capital', i: 14, j: 14}));
    const fixture = await bootstrap({size, tiles, units: specs});
    const gameDbId = gameDatabaseId(fixture.gameId);
    sql(`UPDATE server_game_players SET state_json=JSON_SET(state_json,'$.food',100000,'$.money',100000)
         WHERE game_id=${gameDbId} AND player_id=${fixture.playerId}`);
    const commands = [];
    for (let terrain = 0; terrain < 8; terrain++) {
        commands.push({unit_id: fixture.unitIds[`land-${terrain}`], command: 'move', path: [{i: terrain, j: 2}], payload: {}});
        commands.push({unit_id: fixture.unitIds[`water-${terrain}`], command: 'move', path: [{i: terrain, j: 4}], payload: {}});
        commands.push({unit_id: fixture.unitIds[`hold-${terrain}`], command: 'hold', path: [], payload: {}});
        commands.push({unit_id: fixture.unitIds[`wait-${terrain}`], command: 'wait', path: [], payload: {}});
        commands.push({unit_id: fixture.unitIds[`fortify-${terrain}`], command: 'fortify', path: [], payload: {}});
        commands.push({unit_id: fixture.unitIds[`state-${terrain}`], command: 'set_state', path: [], payload: {state: 'patrol'}});
        commands.push({unit_id: fixture.unitIds[`chop-${terrain}`], command: 'build', path: [], payload: {modifier: 'chop_forest'}});
        commands.push({unit_id: fixture.unitIds[`produce-${terrain}`], command: 'produce', path: [], payload: {unit_type_id: 'warrior'}});
    }
    commands.push({unit_id: fixture.unitIds['stack-filler'], command: 'move',
        path: [{i: 10, j: 3}], payload: {}});
    commands.push({
        unit_id: fixture.unitIds['stack-mover'], command: 'move',
        path: [{i: 10, j: 2}, {i: 10, j: 3}], payload: {},
    });
    commands.push({
        unit_id: fixture.unitIds['automated-worker'], command: 'move',
        path: [{i: 12, j: 2}], payload: {automation_mode: 'automate'},
    });
    const response = await serverGame.request('make_turn', {
        player_id: fixture.playerId, turn: fixture.result.turn, commands,
        actions: [{
            client_action_id: 'optimize-capital', type: 'optimize_city',
            city_unit_id: fixture.unitIds.capital, optimization: 'production',
        }, {
            client_action_id: 'balance-capital', type: 'optimize_city',
            city_unit_id: fixture.unitIds.capital, optimization: 'balanced',
        }],
        player_state: {}, relations: {}, include_updates: true,
    });
    assert.equal(response.request, 'make_turn');
    assert.equal(response.rejected_movements.length, 8, 'one land/water nature mismatch is expected for every terrain type');

    const positions = new Map(rows("SELECT client_key,i,j,state FROM server_game_units WHERE deleted_at IS NULL").map(row => [row[0], row]));
    for (let terrain = 0; terrain < 8; terrain++) {
        assert.equal(Number(positions.get(`land-${terrain}`)[2]), terrain === 0 ? 1 : 2, `land movement on terrain ${terrain}`);
        assert.equal(Number(positions.get(`water-${terrain}`)[2]), terrain === 0 ? 4 : 3, `water movement on terrain ${terrain}`);
        assert.equal(positions.get(`hold-${terrain}`)[3], 'ready');
        assert.equal(positions.get(`wait-${terrain}`)[3], 'waiting');
        assert.equal(positions.get(`fortify-${terrain}`)[3], 'fortified');
        assert.equal(positions.get(`state-${terrain}`)[3], 'patrol');
    }
    assert.equal(Number(value("SELECT (terrain_tex & 15) FROM server_game_map WHERE i=6 AND j=9")), 2,
        'forest chopping changes forest to grass');
    for (const terrain of [0, 1, 2, 3, 4, 5, 7]) {
        assert.equal(Number(value(`SELECT (terrain_tex & 15) FROM server_game_map WHERE i=${terrain} AND j=9`)), terrain);
    }
    assert.deepEqual(
        positions.get('stack-mover').slice(1, 3).map(Number),
        [10, 2],
        'a multi-step move stops at the last available Tile before a full destination stack'
    );
    assert.deepEqual(positions.get('automated-worker').slice(1, 3).map(Number), [12, 2]);
    assert.equal(positions.get('automated-worker')[3], 'ready',
        'movement completion leaves the visible Worker state ready');
    assert.equal(
        JSON.parse(value(`SELECT properties_json FROM server_game_units WHERE id=${fixture.unitIds['automated-worker']}`)).automationMode,
        'automate',
        'movement completion preserves the separate persistent Worker automation mode'
    );
    assert.equal(response.action_results[0].ok, true);
    assert.equal(response.action_results[0].result.optimization, 'production');
    assert.equal(response.action_results[1].ok, true);
    assert.equal(response.action_results[1].result.optimization, 'balanced');
    assert.equal(JSON.parse(value(`SELECT properties_json FROM server_game_units WHERE id=${fixture.unitIds.capital}`)).cityOptimization, 'balanced');
    console.log('PASS make_turn executes all unit commands across 8 terrain types and persists batched city actions');
})().catch(error => { console.error(error); process.exitCode = 1; });

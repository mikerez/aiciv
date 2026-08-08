#!/usr/bin/env node
'use strict';
const {assert, serverGame, resetDatabase, bootstrap, mapTiles, unit, city, rows, value} = require('./test_client');

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
    specs.push(city({client_key: 'capital', i: 14, j: 14}));
    const fixture = await bootstrap({size, tiles, units: specs});
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
    const response = await serverGame.request('make_turn', {
        player_id: fixture.playerId, turn: fixture.result.turn, commands,
        actions: [{
            client_action_id: 'optimize-capital', type: 'optimize_city',
            city_unit_id: fixture.unitIds.capital, optimization: 'production',
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
    assert.equal(response.action_results[0].ok, true);
    assert.equal(response.action_results[0].result.optimization, 'production');
    assert.equal(JSON.parse(value(`SELECT properties_json FROM server_game_units WHERE id=${fixture.unitIds.capital}`)).cityOptimization, 'production');
    console.log('PASS make_turn executes all unit commands across 8 terrain types and persists batched city actions');
})().catch(error => { console.error(error); process.exitCode = 1; });

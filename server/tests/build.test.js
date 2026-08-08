#!/usr/bin/env node
'use strict';
const {assert, serverGame, resetDatabase, bootstrap, mapTiles, unit, sql, value, expectRequestError, gameDatabaseId} = require('./test_client');

const definitions = {
    road: {valid: [1,2,3,4,5,6,7]},
    irrigation: {valid: [2]},
    pasture: {valid: [1,2,3,4,5,6,7], resource: 2},
    fortification: {valid: [1,2,3,4,5,6,7]},
    cottage: {valid: [1,2,3,4,5,6,7]},
    workshop: {valid: [1,2,3,4,5,6,7]},
    mine: {valid: [4,5], resource: 34},
    farm: {valid: [1,2,3,4,5,6,7], resource: 7},
    plantation: {valid: [1,2,3,4,5,6,7], resource: 1},
    camp: {valid: [1,2,3,4,5,6,7], resource: 5},
    fishing_boats: {valid: [0], resource: 6},
    quarry: {valid: [1,2,3,4,5,6,7], resource: 9},
    winery: {valid: [1,2,3,4,5,6,7], resource: 32},
    network: {valid: [0], resource: 6, workboat: true},
};

(async () => {
    resetDatabase();
    const tiles = mapTiles(8);
    tiles.find(tile => tile.i === 3 && tile.j === 4).terrain_tex = 0;
    const fixture = await bootstrap({tiles, units: [
        unit({client_key: 'builder', i: 3, j: 3}),
        unit({client_key: 'boat', unit_type_id: 'workboat', name: 'WorkBoat', nature: 'water', i: 3, j: 3}),
    ]});
    const gameDbId = gameDatabaseId(fixture.gameId);

    for (const [modifier, definition] of Object.entries(definitions)) {
        for (let terrain = 0; terrain < 8; terrain++) {
            const workerId = definition.workboat ? fixture.unitIds.boat : fixture.unitIds.builder;
            const unitType = definition.workboat ? 'workboat' : 'worker';
            const nature = definition.workboat ? 'water' : 'land';
            const resource = definition.resource || 0;
            sql(`DELETE FROM server_game_units WHERE game_id=${gameDbId} AND unit_class=4;
                 UPDATE server_game_map SET terrain_tex=${terrain}, resource_type=${resource}, modifiers_json='{}' WHERE game_id=${gameDbId} AND i=3 AND j=3;
                 UPDATE server_game_map SET terrain_tex=0, resource_type=0, modifiers_json='{}' WHERE game_id=${gameDbId} AND i=3 AND j=4;
                 INSERT INTO server_game_visibility
                    (game_id,player_id,i,j,visibility_level,resource_visible,revision)
                 VALUES (${gameDbId},${fixture.playerId},3,3,2,${resource ? 1 : 0},0)
                 ON DUPLICATE KEY UPDATE visibility_level=2,resource_visible=${resource ? 1 : 0};
                 UPDATE server_game_units SET unit_type_id='${unitType}', nature='${nature}', i=3, j=3, state='${modifier}', deleted_at=NULL, health=100 WHERE id=${workerId};`);
            const body = {player_id: fixture.playerId, worker_unit_id: workerId, building_type: modifier};
            if (definition.valid.includes(terrain)) {
                const response = await serverGame.request('build', body);
                assert.ok(['BUILT', 'ALREADY_BUILT'].includes(response.status), `${modifier} on terrain ${terrain}`);
                assert.equal(Number(value(`SELECT COUNT(*) FROM server_game_units WHERE game_id=${gameDbId} AND unit_type_id='building_${modifier}' AND deleted_at IS NULL`)), 1);
                assert.equal(value(`SELECT state FROM server_game_units WHERE id=${workerId}`), 'ready');
            } else {
                await expectRequestError('build', body, 'building_not_supported');
                assert.equal(Number(value(`SELECT COUNT(*) FROM server_game_units WHERE game_id=${gameDbId} AND unit_class=4 AND deleted_at IS NULL`)), 0);
            }
        }
    }

    sql(`DELETE FROM server_game_units WHERE game_id=${gameDbId} AND unit_class=4;
         UPDATE server_game_map SET terrain_tex=2, resource_type=18, modifiers_json='{}' WHERE game_id=${gameDbId} AND i=3 AND j=3;
         UPDATE server_game_map SET terrain_tex=0, resource_type=0, modifiers_json='{}' WHERE game_id=${gameDbId} AND i=3 AND j=4;
         UPDATE server_game_visibility SET resource_visible=0 WHERE game_id=${gameDbId} AND player_id=${fixture.playerId} AND i=3 AND j=3;
         UPDATE server_game_units SET unit_type_id='worker', nature='land', i=3, j=3, state='irrigate', deleted_at=NULL, health=100 WHERE id=${fixture.unitIds.builder};`);
    const hiddenResourceBuild = await serverGame.request('build', {
        player_id: fixture.playerId,
        worker_unit_id: fixture.unitIds.builder,
        building_type: 'irrigation',
    });
    assert.equal(hiddenResourceBuild.status, 'BUILT', 'a hidden Honey resource must not block irrigation');

    sql(`DELETE FROM server_game_units WHERE game_id=${gameDbId} AND unit_class=4;
         UPDATE server_game_map SET modifiers_json='{}' WHERE game_id=${gameDbId} AND i=3 AND j=3;
         UPDATE server_game_visibility SET resource_visible=1 WHERE game_id=${gameDbId} AND player_id=${fixture.playerId} AND i=3 AND j=3;
         UPDATE server_game_units SET state='irrigate' WHERE id=${fixture.unitIds.builder};`);
    await expectRequestError('build', {
        player_id: fixture.playerId,
        worker_unit_id: fixture.unitIds.builder,
        building_type: 'irrigation',
    }, 'building_not_supported');
    console.log('PASS build validates every immediate improvement against all 8 terrain types and verifies MySQL state');
})().catch(error => { console.error(error); process.exitCode = 1; });

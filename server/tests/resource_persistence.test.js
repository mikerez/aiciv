#!/usr/bin/env node
'use strict';

const {
    assert, serverGame, resetDatabase, bootstrap, mapTiles, unit, rows, gameDatabaseId,
} = require('./test_client');

function resourceSnapshot(gameDbId) {
    return rows(`SELECT i,j,resource_type FROM server_game_map WHERE game_id=${gameDbId} ORDER BY i,j`)
        .map(row => row.join(':'));
}

(async () => {
    resetDatabase();
    const playerId = 7350;
    const tiles = mapTiles(12, 2);
    for (const resource of [
        {i:2,j:2,type:1}, {i:3,j:3,type:32}, {i:5,j:5,type:34},
        {i:7,j:7,type:35}, {i:8,j:5,type:3},
    ]) tiles.find(tile => tile.i === resource.i && tile.j === resource.j).resource_type = resource.type;
    const fixture = await bootstrap({
        playerId, gameId: 'resource-persistence', size: 12, tiles,
        units: [unit({client_key:'explorer', owner_id:playerId, unit_type_id:'explorer', i:1, j:1})],
    });
    const gameDbId = gameDatabaseId(fixture.gameId);
    const before = resourceSnapshot(gameDbId);
    let turn = Number(fixture.result.turn) || 0;
    for (let step=0; step<12; step++) {
        const result = await serverGame.request('make_turn', {
            player_id: playerId,
            turn,
            commands: [{
                unit_id: fixture.unitIds.explorer,
                command: 'hold', path: [], payload: {},
            }],
            actions: [], player_state: {}, relations: {},
        });
        turn = Number(result.turn) || turn+1;
        assert.deepEqual(resourceSnapshot(gameDbId), before,
            `turn ${step+1}: turn processing must not create, remove, or relocate resources`);
    }
    console.log('PASS resources remain immutable through repeated real PHP turn processing');
})().catch(error => { console.error(error); process.exitCode = 1; });

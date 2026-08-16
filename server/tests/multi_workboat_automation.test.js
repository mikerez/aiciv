#!/usr/bin/env node
'use strict';

const {
    assert, resetDatabase, bootstrap, mapTiles, unit, city, sql, value, gameDatabaseId,
} = require('./test_client');
const {createBrowserClient, localUnit, runClientTurn} = require('./browser_client');

(async () => {
    resetDatabase();
    const playerId = 7650;
    const gameId = 'multi-workboat-automation';
    const size = 10;
    const tiles = mapTiles(size, 0);
    tiles.find(tile => tile.i === 2 && tile.j === 2).terrain_tex = 2;
    const resourceTile = tiles.find(tile => tile.i === 5 && tile.j === 3);
    resourceTile.resource_type = 6;
    const citizenTarget = {i:3, j:3};
    const cityDefinition = city({
        client_key:'port', owner_id:playerId, i:2, j:2,
        properties:{
            cityPopulation:1, cityFoodStored:5000,
            cityProperties:{productionPerTurn:5, productionStored:0},
            production:null, productionDisabled:true,
            economy:{citizens:[{coord:citizenTarget, income:{food:1, production:0, money:0}}]},
        },
    });
    const boatDefinition = unit({
        client_key:'automatic-workboat', owner_id:playerId, unit_type_id:'workboat',
        name:'WorkBoat', texture:271, nature:'water', speed:2, i:2, j:3,
        state:'automate', properties:{automationMode:'automate'},
    });
    const fixture = await bootstrap({playerId, gameId, size, tiles, units:[cityDefinition, boatDefinition]});
    const localCity = localUnit(cityDefinition, fixture.unitIds.port);
    const workBoat = localUnit(boatDefinition, fixture.unitIds['automatic-workboat']);
    workBoat.automationMode = 'automate';
    const client = createBrowserClient({
        size, playerId, gameId, tiles, units:[localCity, workBoat], serverTurn:fixture.result.turn,
    });
    const gameDbId = gameDatabaseId(gameId);
    sql(`INSERT INTO server_game_visibility
         (game_id,player_id,i,j,visibility_level,resource_visible,revision)
         VALUES (${gameDbId},${playerId},5,3,2,1,1)
         ON DUPLICATE KEY UPDATE visibility_level=2,resource_visible=1;
         UPDATE server_game_players SET state_json=JSON_SET(state_json,'$.food',5000,'$.money',5000)
         WHERE game_id=${gameDbId} AND player_id=${playerId}`);
    client._game_state.food = 5000;
    client._game_state.money = 5000;

    assert.equal(client.currentGame.autoRouteWorkBoat(1), true);
    assert.equal(workBoat.automationPriority, 1, 'a visible water resource outranks a nearer citizen Tile');
    assert.deepEqual({i:workBoat.gotoCoord.i, j:workBoat.gotoCoord.j}, {i:5,j:3});

    const started = new Map();
    const builtOrder = [];
    for (let turn=1; turn<=80; turn++) {
        const {submission} = await runClientTurn(client);
        for (const command of submission.commands) {
            if (command.unit_id !== workBoat.serverId || command.command !== 'set_state'
                || command.payload.state !== 'network') continue;
            const key = `${workBoat.coord.i}:${workBoat.coord.j}`;
            if (!started.has(key)) started.set(key, turn);
        }
        for (const action of submission.actions.filter(item =>
            item.type === 'build' && item.worker_unit_id === workBoat.serverId)) {
            assert.equal(action.building_type, 'network');
            const key = `${workBoat.coord.i}:${workBoat.coord.j}`;
            assert.equal(turn-started.get(key), 5, 'Nets must consume six client turns');
            builtOrder.push(key);
        }
        const resourceModifiers = JSON.parse(value(
            `SELECT modifiers_json FROM server_game_map WHERE game_id=${gameDbId} AND i=5 AND j=3`
        ));
        const citizenModifiers = JSON.parse(value(
            `SELECT modifiers_json FROM server_game_map WHERE game_id=${gameDbId} AND i=3 AND j=3`
        ));
        if (resourceModifiers.network && citizenModifiers.network) break;
    }
    assert.deepEqual(builtOrder, ['5:3', '3:3'],
        'WorkBoat Automate must build resource Nets first and citizen-Tile Nets second');
    console.log('PASS WorkBoat Automate builds Nets on resource and citizen water Tiles through real JS, PHP, and MySQL');
})().catch(error => { console.error(error); process.exitCode = 1; });

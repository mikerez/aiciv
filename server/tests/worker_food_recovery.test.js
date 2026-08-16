#!/usr/bin/env node
'use strict';

const {
    assert, serverGame, resetDatabase, bootstrap, mapTiles, unit, city,
    sql, value, setPlayerState, gameDatabaseId,
} = require('./test_client');
const {createBrowserClient, localUnit, runClientTurn} = require('./browser_client');

(async () => {
    resetDatabase();
    const playerId = 81465;
    const gameId = 'worker-1465-food-recovery';
    const size = 12;
    const tiles = mapTiles(size, 0);
    const at = (i, j) => tiles.find(tile => tile.i === i && tile.j === j);
    Object.assign(at(5, 5), {
        terrain_tex:2, modifiers:{irrigation:true, irrigationCityFood:true, road:true},
    });
    Object.assign(at(5, 4), {terrain_tex:2, modifiers:{workshop:true, road:true}});
    Object.assign(at(6, 5), {terrain_tex:0, modifiers:{}});

    const capital = city({
        client_key:'worker-1465-city', owner_id:playerId, i:5, j:5,
        properties:{
            cityPopulation:3,
            cityFoodStored:500,
            cityProperties:{productionPerTurn:4,productionStored:0},
            production:null,
            lastCityIncome:{food:-2,grossFood:3,production:0,grossProduction:4,money:1,
                foodConsumption:5,workshopFoodCost:2,productionActive:true},
            economy:{citizens:[{coord:{i:5,j:4}}],lastIncome:{food:-2,production:0,money:1}},
        },
    });
    const workerDefinition = unit({
        client_key:'worker-1465', owner_id:playerId, i:4, j:4, state:'automate',
        properties:{automationMode:'automate'},
    });
    const workshopDefinition = unit({
        client_key:'worker-1465-workshop', owner_id:playerId,
        unit_type_id:'building_workshop', unit_class:4, name:'Workshop', can_move:false,
        i:5, j:4, attack:0, defense:0, speed:0, view_range:0,
        properties:{economicClass:'terrain_improvement',improvementType:'workshop'},
    });
    const definitions = [capital, workerDefinition, workshopDefinition];
    const fixture = await bootstrap({playerId, gameId, size, tiles, units:definitions});
    const gameDbId = gameDatabaseId(gameId);
    sql(`UPDATE server_game_units SET properties_json=JSON_SET(properties_json,
         '$.parentCityId',${fixture.unitIds['worker-1465-city']})
         WHERE id=${fixture.unitIds['worker-1465-workshop']}`);

    const localUnits = definitions.map(definition =>
        localUnit(definition, fixture.unitIds[definition.client_key]));
    const worker = localUnits.find(item => item.unitTypeId === 'worker');
    worker.automationMode = 'automate';
    const client = createBrowserClient({
        size, playerId, gameId, tiles, units:localUnits,
        technologies:['Irrigation', 'Construction'], serverTurn:fixture.result.turn,
    });
    const openTechnologies = {};
    Object.keys(client._game_state.openTechnologies).forEach(name => { openTechnologies[name] = true; });
    setPlayerState(gameDbId, playerId, {
        food:0, money:500, scienceRate:0, openTechnologies,
    });
    client._game_state.food = 0;
    client._game_state.money = 500;
    await serverGame.request('select_production', {
        player_id:playerId, city_unit_id:fixture.unitIds['worker-1465-city'], unit_type_id:'warrior',
    });

    const workerIndex = client._units.indexOf(worker);
    client.currentGame.workerReplacementRandom = () => 0.10;
    assert.equal(client.currentGame.autoRouteWorker(workerIndex), true);
    assert.equal(worker.automateBuild, 'irrigate');
    assert.deepEqual({i:worker.gotoCoord.i,j:worker.gotoCoord.j},{i:5,j:4});

    let irrigationTurn = null;
    let farmTurn = null;
    for (let turn=1; turn<=35; turn++) {
        await runClientTurn(client);
        const modifiers = JSON.parse(value(
            `SELECT modifiers_json FROM server_game_map WHERE game_id=${gameDbId} AND i=5 AND j=4`
        ));
        if (modifiers.irrigation && irrigationTurn === null) irrigationTurn = turn;
        if (modifiers.farm) {
            farmTurn = turn;
            break;
        }
    }
    const finalModifiers = JSON.parse(value(
        `SELECT modifiers_json FROM server_game_map WHERE game_id=${gameDbId} AND i=5 AND j=4`
    ));
    assert.ok(irrigationTurn !== null, 'the Worker must replace the Workshop with Irrigation');
    assert.ok(farmTurn !== null && farmTurn > irrigationTurn,
        'the Worker must convert recovered Irrigation into a Farm on a later turn');
    assert.equal(finalModifiers.workshop, undefined, 'food recovery removes the obsolete Workshop');
    assert.equal(finalModifiers.farm, true, 'food recovery leaves a completed Farm');
    console.log(`PASS Worker food recovery replaced Workshop on turn ${irrigationTurn} and built Farm on turn ${farmTurn}`);
})().catch(error => { console.error(error); process.exitCode = 1; });

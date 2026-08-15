#!/usr/bin/env node
'use strict';

const {
    assert, serverGame, resetDatabase, bootstrap, mapTiles, unit, city, sql, value, gameDatabaseId,
} = require('./test_client');

(async () => {
    resetDatabase();
    const playerId = 7450;
    const tiles = mapTiles(8, 2);
    const water = tiles.find(tile => tile.i === 3 && tile.j === 3);
    water.terrain_tex = 0;
    water.modifiers = {network:true};
    tiles.find(tile => tile.i === 1 && tile.j === 2).modifiers = {workshop:true, road:true};
    tiles.find(tile => tile.i === 2 && tile.j === 1).terrain_tex = 5;
    const cityDefinition = city({
        client_key:'network-city', owner_id:playerId, i:2, j:2,
        properties:{cityPopulation:3, cityFoodStored:100,
            cityProperties:{productionPerTurn:0, productionStored:0}, production:null},
    });
    const networkDefinition = unit({
        client_key:'network-building', owner_id:playerId, unit_type_id:'building_network',
        unit_class:4, name:'Nets', can_move:false, nature:'water', i:3, j:3,
        attack:0, defense:0, speed:0, view_range:0,
        properties:{economicClass:'terrain_improvement', improvementType:'network'},
    });
    const roadDefinition = unit({
        client_key:'road-building', owner_id:playerId, unit_type_id:'building_road',
        unit_class:4, name:'Road', can_move:false, i:2, j:3,
        attack:0, defense:0, speed:0, view_range:0,
        properties:{economicClass:'terrain_improvement', improvementType:'road'},
    });
    const fortDefinition = unit({
        client_key:'fort-building', owner_id:playerId, unit_type_id:'building_fortification',
        unit_class:4, name:'Fortification', can_move:false, i:3, j:2,
        attack:0, defense:0, speed:0, view_range:0,
        properties:{economicClass:'terrain_improvement', improvementType:'fortification'},
    });
    const workshopDefinition = unit({
        client_key:'workshop-building', owner_id:playerId, unit_type_id:'building_workshop',
        unit_class:4, name:'Workshop', can_move:false, i:1, j:2,
        attack:0, defense:0, speed:0, view_range:0,
        properties:{economicClass:'terrain_improvement', improvementType:'workshop'},
    });
    const fixture = await bootstrap({
        playerId, gameId:'network-production-cost', size:8, tiles,
        units:[cityDefinition, networkDefinition, roadDefinition, fortDefinition, workshopDefinition],
    });
    const gameDbId = gameDatabaseId(fixture.gameId);
    sql(`UPDATE server_game_units SET properties_json=JSON_SET(properties_json,'$.parentCityId',${fixture.unitIds['network-city']})
         WHERE id IN (${fixture.unitIds['network-building']},${fixture.unitIds['road-building']},${fixture.unitIds['fort-building']},${fixture.unitIds['workshop-building']});
         UPDATE server_game_players SET state_json=JSON_SET(state_json,'$.food',500,'$.money',0)
         WHERE game_id=${gameDbId} AND player_id=${playerId};`);
    await serverGame.request('make_turn', {
        player_id:playerId, turn:fixture.result.turn, commands:[], actions:[],
        player_state:{}, relations:{},
    });
    const properties = JSON.parse(value(
        `SELECT properties_json FROM server_game_units WHERE id=${fixture.unitIds['network-city']}`
    ));
    assert.equal(Number(properties.lastCityIncome.networkProductionCost), 1,
        'each Nets improvement costs one City production per turn');
    assert.equal(Number(properties.lastCityIncome.roadProductionCost), 1,
        'each non-center Road costs one City production per turn');
    assert.equal(Number(properties.lastCityIncome.fortificationProductionCost), 2,
        'each Fortification costs its nearest City two production per turn');
    assert.equal(Number(properties.lastCityIncome.workshopFoodCost), 0,
        'an idle City does not pay food for its Workshops');
    assert.equal(properties.lastCityIncome.productionActive, false,
        'the authoritative income record identifies an idle City');
    assert.ok(Number(properties.cityProperties.productionPerTurn) > 0,
        'the fixture retains positive production after infrastructure costs');
    await serverGame.request('select_production', {
        player_id:playerId, city_unit_id:fixture.unitIds['network-city'], unit_type_id:'warrior',
    });
    await serverGame.request('make_turn', {
        player_id:playerId, turn:serverGame.serverTurn, commands:[], actions:[],
        player_state:{}, relations:{},
    });
    const producingProperties = JSON.parse(value(
        `SELECT properties_json FROM server_game_units WHERE id=${fixture.unitIds['network-city']}`
    ));
    assert.equal(Number(producingProperties.lastCityIncome.workshopFoodCost), 2,
        'an actively producing City pays two food for each parent Workshop');
    assert.equal(producingProperties.lastCityIncome.productionActive, true,
        'the authoritative income record identifies an actively producing City');
    console.log('PASS infrastructure costs and production-dependent Workshop food upkeep');
})().catch(error => { console.error(error); process.exitCode = 1; });

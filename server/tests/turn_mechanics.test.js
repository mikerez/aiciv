#!/usr/bin/env node
'use strict';
const {assert, serverGame, resetDatabase, bootstrap, mapTiles, unit, city, sql, value, gameDatabaseId} = require('./test_client');

function command(unitId, name, path = [], payload = {}) {
    return {unit_id: unitId, command: name, path, payload};
}

async function finish(turn, playerId, commands = []) {
    return serverGame.request('make_turn', {
        player_id: playerId, turn, commands, actions: [], player_state: {}, relations: {},
    });
}

(async () => {
    resetDatabase();
    let fixture = await bootstrap({gameId: 'test-plan-loot', players: [7001, 7002], units: [
        unit({client_key: 'looter', owner_id: 7001, unit_type_id: 'warrior', unit_class: 2,
            name: 'Warrior', attack: 8, i: 2, j: 2}),
        unit({client_key: 'farm', owner_id: 7002, unit_type_id: 'building_farm', unit_class: 4,
            name: 'Farm', can_move: false, attack: 0, defense: 0, speed: 0, view_range: 0,
            i: 3, j: 3, properties: {economicClass: 'terrain_improvement', improvementType: 'farm'}}),
    ]});
    let gameId = gameDatabaseId(fixture.gameId);
    sql(`UPDATE server_game_map SET modifiers_json='{"farm":true}' WHERE game_id=${gameId} AND i=3 AND j=3;
         UPDATE server_game_players SET state_json=JSON_SET(state_json,'$.money',0,'$.food',200) WHERE game_id=${gameId};`);
    await finish(0, 7002);
    await finish(1, 7001, [command(fixture.unitIds.looter, 'move', [{i:3,j:3}],
        {interaction_intent:'attack', target_owner_id:7002})]);
    await finish(1, 7002);
    assert.equal(Number(value("SELECT COUNT(*) FROM server_game_units WHERE unit_type_id='building_farm'")), 0,
        'an occupying military unit destroys the enemy improvement');
    assert.equal(JSON.parse(value(`SELECT modifiers_json FROM server_game_map WHERE game_id=${gameId} AND i=3 AND j=3`)).farm, undefined);
    let state = JSON.parse(value(`SELECT state_json FROM server_game_players WHERE game_id=${gameId} AND player_id=7001`));
    assert.equal(Number(state.money), 2, 'Farm loot reaches the attacker treasury');
    assert.equal(Number(state.food), 200,
        'Farm loot reaches storage before the newly doubled military food upkeep on both resolved turns');

    resetDatabase();
    fixture = await bootstrap({gameId: 'test-plan-collateral', players: [7001, 7002], units: [
        unit({client_key: 'siege', owner_id: 7001, unit_type_id: 'catapult', unit_class: 2,
            name: 'Catapult', attack: 5, defense: 2, experience: 2, i: 2, j: 2}),
        unit({client_key: 'primary', owner_id: 7002, unit_type_id: 'warrior', unit_class: 2,
            name: 'Primary', attack: 2, defense: 40, i: 3, j: 3}),
        unit({client_key: 'secondary', owner_id: 7002, unit_type_id: 'archer', unit_class: 2,
            name: 'Secondary', attack: 2, defense: 4, i: 3, j: 3}),
    ]});
    gameId = gameDatabaseId(fixture.gameId);
    sql(`UPDATE server_game_players SET state_json=JSON_SET(state_json,'$.money',100,'$.food',200) WHERE game_id=${gameId};`);
    await finish(0, 7002);
    await finish(1, 7001, [command(fixture.unitIds.siege, 'move', [{i:3,j:3}],
        {interaction_intent:'attack', target_owner_id:7002})]);
    await finish(1, 7002);
    assert.equal(Number(value(`SELECT health FROM server_game_units WHERE id=${fixture.unitIds.secondary}`)), 90,
        'a maximum-experience siege unit deals ten percent collateral damage');

    resetDatabase();
    fixture = await bootstrap({gameId: 'test-plan-fort', players: [7001, 7002], units: [
        unit({client_key: 'trebuchet', owner_id: 7001, unit_type_id: 'trebuchet', unit_class: 2,
            name: 'Trebuchet', attack: 7, defense: 2, i: 2, j: 2}),
        unit({client_key: 'guard', owner_id: 7002, unit_type_id: 'warrior', unit_class: 2,
            name: 'Guard', attack: 2, defense: 40, health: 80, i: 3, j: 3}),
        unit({client_key: 'fort', owner_id: 7002, unit_type_id: 'building_fortification', unit_class: 4,
            name: 'Fortification', can_move: false, attack: 0, defense: 0, speed: 0, view_range: 0,
            i: 3, j: 3, properties: {economicClass: 'terrain_improvement', improvementType: 'fortification'}}),
    ]});
    gameId = gameDatabaseId(fixture.gameId);
    sql(`UPDATE server_game_map SET modifiers_json='{"fortification":true,"fortificationDefensePercent":100}'
           WHERE game_id=${gameId} AND i=3 AND j=3;
         UPDATE server_game_players SET state_json=JSON_SET(state_json,'$.money',100,'$.food',200) WHERE game_id=${gameId};`);
    await finish(0, 7002);
    assert.equal(Number(value(`SELECT health FROM server_game_units WHERE id=${fixture.unitIds.guard}`)), 90,
        'friendly units heal ten percent per turn in a Fortification');
    await finish(1, 7001, [command(fixture.unitIds.trebuchet, 'move', [{i:3,j:3}],
        {interaction_intent:'attack', target_owner_id:7002})]);
    await finish(1, 7002);
    let modifiers = JSON.parse(value(`SELECT modifiers_json FROM server_game_map WHERE game_id=${gameId} AND i=3 AND j=3`));
    assert.equal(Number(modifiers.fortificationDefensePercent), 98,
        'Trebuchet attack degrades Fortification defense by two percent');

    resetDatabase();
    const tiles = mapTiles(112);
    tiles.find(tile => tile.i === 106 && tile.j === 106).terrain_tex = 7;
    fixture = await bootstrap({gameId: 'test-plan-city-storage', size: 112, players: [7001, 7002], tiles, units: [
        city({client_key: 'capital', owner_id: 7001, name: 'Capital', i: 5, j: 5,
            properties: {cityPopulation: 1, cityFoodStored: 0, capitalOwnerId: 7001,
                cityProperties: {productionPerTurn: 0, productionStored: 0}, production: null}}),
        city({client_key: 'remote', owner_id: 7001, name: 'Remote', i: 105, j: 105}),
        unit({client_key: 'blocker', owner_id: 7002, unit_type_id: 'warrior', unit_class: 2,
            name: 'Blocker', attack: 2, i: 106, j: 106}),
    ]});
    gameId = gameDatabaseId(fixture.gameId);
    sql(`INSERT INTO server_game_relations(game_id,player_a,player_b,relation_status,player_a_status,player_b_status,revision)
         VALUES (${gameId},7001,7002,'war','enemy','enemy',1);`);
    await finish(0, 7002);
    const remote = JSON.parse(value(`SELECT properties_json FROM server_game_units WHERE id=${fixture.unitIds.remote}`));
    assert.equal(Number(remote.lastCityIncome.grossFood), 2,
        'the occupied high-yield river plot contributes nothing to its enemy City');
    assert.equal(Number(remote.lastCityIncome.storageLossPercent), 90,
        'a size-one City at distance 100 loses ninety percent when transferring income');
    assert.equal(Number(remote.lastCityIncome.storageFood), 0,
        'the remote City transfer loss is applied before civilization storage');

    console.log('PASS looting, siege collateral, Fortification healing/degradation, enemy occupation, and remote-city storage loss');
})().catch(error => { console.error(error); process.exitCode = 1; });

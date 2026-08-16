#!/usr/bin/env node
'use strict';

const {
    assert, serverGame, resetDatabase, bootstrap, city, unit, mapTiles, sql, value,
    expectRequestError, gameDatabaseId,
} = require('./test_client');

(async () => {
    resetDatabase();
    const tiles = mapTiles(8);
    for (const tile of tiles) {
        if ((tile.i === 3 || tile.i === 4 || tile.i === 5) && tile.j === 3) {
            tile.modifiers = {road:true};
        }
    }
    const stack = [
        city({client_key:'capital',i:3,j:3}),
        city({client_key:'market-peer',i:5,j:3}),
    ];
    for (let index = 0; index < 5; index++) {
        stack.push(unit({
            client_key:`guard-${index}`,unit_type_id:'warrior',unit_class:2,
            name:'Warrior',i:3,j:3,health:index === 0 ? 50 : 100,
        }));
    }
    const fixture = await bootstrap({tiles,units:stack});
    const cityId = fixture.unitIds.capital;
    const gameDbId = gameDatabaseId(fixture.gameId);

    async function complete(type, cost) {
        await serverGame.request('select_production', {
            player_id:fixture.playerId,city_unit_id:cityId,unit_type_id:type,
        });
        sql(`UPDATE productions SET production_points=${Number(cost)} WHERE city_unit_id=${cityId}`);
        return serverGame.request('complete_production', {
            player_id:fixture.playerId,city_unit_id:cityId,
        });
    }

    const lazaret = await complete('lazaret', 60);
    assert.equal(lazaret.unit.unit_type_id, 'lazaret');
    assert.equal(lazaret.unit.unit_class, 4);
    assert.equal(lazaret.unit.can_move, false);
    assert.equal(lazaret.unit.properties.cityBuilding, true);
    assert.equal(lazaret.unit.properties.parentCityId, cityId);
    assert.equal(lazaret.unit.properties.hiddenOnMap, true);
    await expectRequestError('select_production', {
        player_id:fixture.playerId,city_unit_id:cityId,unit_type_id:'lazaret',
    }, 'city_building_already_built');

    await serverGame.request('select_production', {
        player_id:fixture.playerId,city_unit_id:cityId,unit_type_id:'market',
    });
    await expectRequestError('select_production', {
        player_id:fixture.playerId,city_unit_id:cityId,unit_type_id:'market',
    }, 'city_building_already_queued');
    await serverGame.request('select_production', {
        player_id:fixture.playerId,city_unit_id:cityId,unit_type_id:null,
    });

    await complete('barracks', 50);
    const firstGuardId = fixture.unitIds['guard-0'];
    sql(`UPDATE server_game_units SET health=0,deleted_at=UTC_TIMESTAMP() WHERE id=${fixture.unitIds['guard-4']}`);
    const warrior = await complete('warrior', 20);
    assert.equal(warrior.unit.experience, 1.1, 'Barracks trains newly produced melee units');

    sql(`UPDATE server_game_units SET last_healed_turn=-1 WHERE id=${cityId}`);
    const healed = await serverGame.request('heal_units', {
        player_id:fixture.playerId,city_unit_id:cityId,unit_ids:[firstGuardId],
    });
    assert.equal(healed.heal_percent, 20);
    assert.equal(Number(value(`SELECT health FROM server_game_units WHERE id=${firstGuardId}`)), 70);

    await complete('market', 50);
    sql(`UPDATE server_game_players SET state_json=JSON_SET(state_json,'$.food',100)
         WHERE game_id=${gameDbId} AND player_id=${fixture.playerId}`);
    await serverGame.request('make_turn', {
        player_id:fixture.playerId,turn:fixture.result.turn,commands:[],actions:[],
        player_state:{},relations:{},include_updates:true,
    });
    const cityProperties = JSON.parse(value(
        `SELECT properties_json FROM server_game_units WHERE id=${cityId}`
    ));
    const playerState = JSON.parse(value(
        `SELECT state_json FROM server_game_players WHERE game_id=${gameDbId} AND player_id=${fixture.playerId}`
    ));
    assert.equal(cityProperties.lastCityIncome.marketFoodTransfer, 1,
        'connected Market transfers one food into its City');
    assert.equal(Number(playerState.food), 100 + Number(playerState.lastGrossFoodIncome)
        - Number(playerState.lastFoodUpkeep) - 1,
        'Market transfer is deducted from global food instead of being generated');

    console.log('PASS City buildings complete through API and apply duplicate, stack, XP, healing, and Market rules');
})().catch(error => { console.error(error); process.exitCode = 1; });

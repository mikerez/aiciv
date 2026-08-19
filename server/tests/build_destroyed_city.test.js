#!/usr/bin/env node
'use strict';

const {
    assert, serverGame, resetDatabase, bootstrap, mapTiles, unit, sql, value, gameDatabaseId,
} = require('./test_client');

(async () => {
    resetDatabase();
    const tiles = mapTiles(8, 1);
    const units = [
        unit({
            client_key:'old-ruin', unit_type_id:'destroyed_city', unit_class:4,
            name:'Destroyed City', texture:871, can_move:false, i:3, j:3,
            attack:0, defense:0, speed:0, view_range:0, state:'destroyed',
            properties:{destroyedCity:true, economicClass:'destroyed_city'},
        }),
        unit({
            client_key:'replacement-settler', unit_type_id:'settlers', unit_class:0,
            name:'Settlers', texture:256, i:3, j:3,
        }),
    ];
    const fixture = await bootstrap({size:8, tiles, units, players:[7001]});
    const gameDbId = gameDatabaseId(fixture.gameId);
    sql(`DELETE FROM server_game_submissions WHERE game_id=${gameDbId}`);

    const settlerId = fixture.unitIds['replacement-settler'];
    const ruinId = fixture.unitIds['old-ruin'];
    const response = await serverGame.request('make_turn', {
        player_id:fixture.playerId,
        turn:fixture.result.turn,
        commands:[],
        actions:[{
            client_action_id:'replace-ruin', type:'build_city', settler_unit_id:settlerId,
        }],
        player_state:{food:100, money:100}, relations:{}, include_updates:true,
    });
    const result = response.action_results.find(item => item.client_action_id === 'replace-ruin');
    assert.equal(result.ok, true, 'the authoritative replacement action succeeds');
    assert.equal(Number(value(
        `SELECT COUNT(*) FROM server_game_units WHERE id=${ruinId}`
    )), 0, 'the old destroyed City is removed');
    assert.equal(Number(value(
        `SELECT COUNT(*) FROM server_game_units WHERE id=${settlerId}`
    )), 0, 'the Settler is consumed only after replacement City insertion');
    const cityId = Number(value(
        `SELECT id FROM server_game_units WHERE game_id=${gameDbId} AND owner_id=${fixture.playerId} `
        + "AND unit_type_id='city' AND i=3 AND j=3 AND deleted_at IS NULL"
    ));
    assert.ok(cityId > 0, 'the replacement City remains active after same-request turn resolution');
    const properties = JSON.parse(value(`SELECT properties_json FROM server_game_units WHERE id=${cityId}`));
    assert.equal(properties.cityPopulation, 1);
    assert.equal(properties.cityFoodStored, 0,
        'the one-food founding reserve pays the first otherwise-starving turn');
    console.log('PASS building over a destroyed City preserves the replacement through its founding turn');
})().catch(error => { console.error(error); process.exitCode = 1; });

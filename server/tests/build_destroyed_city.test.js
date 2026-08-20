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

    resetDatabase();
    const blockedTiles = mapTiles(8, 2);
    const blockedUnits = [
        unit({
            client_key:'blocked-old-ruin', owner_id:7001,
            unit_type_id:'destroyed_city', unit_class:4,
            name:'Destroyed City', texture:871, can_move:false, i:3, j:3,
            attack:0, defense:0, speed:0, view_range:0, state:'destroyed',
            properties:{destroyedCity:true, economicClass:'destroyed_city'},
        }),
        unit({
            client_key:'blocked-replacement-settler', owner_id:7001,
            unit_type_id:'settlers', unit_class:0, name:'Settlers', texture:256, i:3, j:3,
        }),
    ];
    const blockedCoords = [[3,3],[4,3],[2,3],[3,4],[3,2],[4,4],[2,2]];
    blockedCoords.forEach(([i,j], index) => blockedUnits.push(unit({
        client_key:'blocking-explorer-' + index, owner_id:7002,
        unit_type_id:'explorer', unit_class:0, name:'Explorer', i, j,
    })));
    const blocked = await bootstrap({
        gameId:'test-blocked-destroyed-city', size:8, tiles:blockedTiles,
        units:blockedUnits, players:[7001,7002],
    });
    await serverGame.request('make_turn', {
        player_id:7002, turn:blocked.result.turn, commands:[], actions:[],
        player_state:{}, relations:{},
    });
    const blockedGameId = gameDatabaseId(blocked.gameId);
    sql(`INSERT INTO server_game_relations
        (game_id,player_a,player_b,relation_status,player_a_status,player_b_status,revision)
        VALUES (${blockedGameId},7001,7002,'war','enemy','enemy',1)`);
    const blockedSettlerId = blocked.unitIds['blocked-replacement-settler'];
    let turn = Number(value(`SELECT turn_number FROM server_games WHERE id=${blockedGameId}`));
    const founded = await serverGame.request('make_turn', {
        player_id:7001, turn, commands:[], actions:[{
            client_action_id:'blocked-rebuild', type:'build_city', settler_unit_id:blockedSettlerId,
        }], player_state:{food:100,money:100}, relations:{}, include_updates:true,
    });
    assert.equal(founded.action_results.find(item => item.client_action_id === 'blocked-rebuild').ok, true);
    await serverGame.request('make_turn', {
        player_id:7002, turn, commands:[], actions:[], player_state:{}, relations:{},
    });
    const replacementCityId = Number(value(
        `SELECT id FROM server_game_units WHERE game_id=${blockedGameId} AND owner_id=7001 `
        + "AND unit_type_id='city' AND i=3 AND j=3 AND deleted_at IS NULL"
    ));
    assert.ok(replacementCityId > 0, 'the rebuilt City survives its founding resolution');

    turn = Number(value(`SELECT turn_number FROM server_games WHERE id=${blockedGameId}`));
    await serverGame.request('make_turn', {
        player_id:7001, turn, commands:[], actions:[], player_state:{}, relations:{},
    });
    await serverGame.request('make_turn', {
        player_id:7002, turn, commands:[], actions:[], player_state:{}, relations:{},
    });
    assert.equal(value(`SELECT unit_type_id FROM server_game_units WHERE id=${replacementCityId}`), 'city',
        'an empty normal candidate list falls back to City-center income instead of destroying the City');
    assert.ok(Number(value(
        `SELECT JSON_EXTRACT(properties_json,'$.lastCityIncome.grossFood') `
        + `FROM server_game_units WHERE id=${replacementCityId}`
    )) >= 2, 'the rebuilt grass City receives its center food income');
    console.log('PASS rebuilding a destroyed City retains City-center income across later turns');
})().catch(error => { console.error(error); process.exitCode = 1; });

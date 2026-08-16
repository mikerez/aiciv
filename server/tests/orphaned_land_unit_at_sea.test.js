#!/usr/bin/env node
'use strict';

const {
    assert, serverGame, resetDatabase, bootstrap, mapTiles, unit, value,
} = require('./test_client');

(async () => {
    resetDatabase();
    const tiles = mapTiles(8, 2);
    for (const point of [{i:3,j:2}, {i:4,j:2}]) {
        tiles.find(tile => tile.i === point.i && tile.j === point.j).terrain_tex = 0;
    }
    const fixture = await bootstrap({
        gameId:'orphaned-land-unit-at-sea', players:[7001,7002], tiles,
        units:[
            unit({client_key:'orphan',owner_id:7001,unit_type_id:'warrior',unit_class:2,
                name:'Warrior',nature:'land',i:3,j:2}),
            unit({client_key:'passenger',owner_id:7001,unit_type_id:'warrior',unit_class:2,
                name:'Warrior',nature:'land',i:4,j:2}),
            unit({client_key:'carrier',owner_id:7001,unit_type_id:'galley',unit_class:2,
                name:'Galley',nature:'water',i:4,j:2}),
            unit({client_key:'land-unit',owner_id:7001,unit_type_id:'warrior',unit_class:2,
                name:'Warrior',nature:'land',i:5,j:5}),
        ],
    });
    await serverGame.request('make_turn', {
        player_id:7002, turn:fixture.result.turn, commands:[], actions:[],
        player_state:{}, relations:{},
    });

    assert.equal(Number(value(
        "SELECT COUNT(*) FROM server_game_units WHERE client_key='orphan' AND deleted_at IS NULL"
    )), 0, 'a land unit alone on water is removed in the resolved turn');
    assert.equal(Number(value(
        "SELECT COUNT(*) FROM server_game_units WHERE client_key='passenger' AND deleted_at IS NULL"
    )), 1, 'a land passenger sharing water with its Galley survives');
    assert.equal(Number(value(
        "SELECT COUNT(*) FROM server_game_units WHERE client_key='carrier' AND deleted_at IS NULL"
    )), 1, 'the transport ship survives');
    assert.equal(Number(value(
        "SELECT COUNT(*) FROM server_game_units WHERE client_key='land-unit' AND deleted_at IS NULL"
    )), 1, 'a land unit on land is unaffected');
    assert.equal(Number(value(
        "SELECT COUNT(*) FROM server_game_events WHERE event_type='unit_disbanded_at_sea'"
    )), 1, 'the owner receives one authoritative sea-disband event');
    console.log('PASS orphaned land units at sea are disbanded while transported and land units survive');
})().catch(error => { console.error(error); process.exitCode = 1; });

#!/usr/bin/env node
'use strict';
const {assert, serverGame, resetDatabase, bootstrap, mapTiles, unit, city, sql, value} = require('./test_client');

function command(unitId, name, path = [], payload = {}) {
    return {unit_id: unitId, command: name, path, payload};
}

async function finishTurn(turn, playerId, commands) {
    return serverGame.request('make_turn', {
        player_id: playerId, turn, commands, actions: [], player_state: {}, relations: {},
    });
}

(async () => {
    resetDatabase();
    const tiles = mapTiles(8);
    for (const [i, j] of [[3, 2], [4, 2]]) {
        tiles.find(tile => tile.i === i && tile.j === j).terrain_tex = 0;
    }
    const movement = await bootstrap({gameId: 'test-ship-city', players: [7001, 7002], tiles, units: [
        city({client_key: 'harbor', owner_id: 7001, i: 3, j: 3}),
        unit({client_key: 'ship', owner_id: 7001, unit_type_id: 'galley', unit_class: 2,
            name: 'Galley', nature: 'water', attack: 2, i: 3, j: 2}),
        unit({client_key: 'passenger', owner_id: 7001, unit_type_id: 'warrior', unit_class: 2,
            name: 'Warrior', attack: 2, i: 4, j: 2}),
        unit({client_key: 'carrier', owner_id: 7001, unit_type_id: 'galley', unit_class: 2,
            name: 'Galley', nature: 'water', attack: 2, i: 4, j: 2}),
        unit({client_key: 'land-defender', owner_id: 7002, unit_type_id: 'warrior', unit_class: 2,
            name: 'Warrior', attack: 2, i: 4, j: 3}),
    ]});
    await finishTurn(0, 7002, [command(movement.unitIds['land-defender'], 'hold')]);
    const submitted = await finishTurn(1, 7001, [
        command(movement.unitIds.ship, 'move', [{i: 3, j: 3}]),
        command(movement.unitIds.passenger, 'move', [{i: 4, j: 3}],
            {interaction_intent: 'attack', target_owner_id: 7002}),
    ]);
    assert.equal(submitted.rejected_movements.length, 1);
    assert.equal(submitted.rejected_movements[0].reason, 'amphibious_attack_forbidden');
    await finishTurn(1, 7002, [command(movement.unitIds['land-defender'], 'hold')]);
    assert.equal(Number(value(`SELECT j FROM server_game_units WHERE id=${movement.unitIds.ship}`)), 3,
        'a ship can enter its own City');
    assert.equal(Number(value(`SELECT j FROM server_game_units WHERE id=${movement.unitIds.passenger}`)), 2,
        'a carried land unit cannot attack while disembarking');

    resetDatabase();
    const siege = await bootstrap({gameId: 'test-city-defense', players: [7001, 7002], units: [
        unit({client_key: 'catapult', owner_id: 7001, unit_type_id: 'catapult', unit_class: 2,
            name: 'Catapult', attack: 4, defense: 2, i: 4, j: 3}),
        unit({client_key: 'trebuchet', owner_id: 7001, unit_type_id: 'trebuchet', unit_class: 2,
            name: 'Trebuchet', attack: 5, defense: 2, i: 3, j: 4}),
        city({client_key: 'target-city', owner_id: 7002, i: 4, j: 4}),
        unit({client_key: 'archer', owner_id: 7002, unit_type_id: 'archer', unit_class: 2,
            name: 'Archer', attack: 2, defense: 20, i: 4, j: 4}),
    ]});
    sql("UPDATE server_game_players p JOIN server_games g ON g.id=p.game_id "
        + "SET p.state_json=JSON_SET(p.state_json,'$.money',100) "
        + "WHERE g.game_key='test-city-defense' AND p.player_id=7001");
    await finishTurn(0, 7002, [command(siege.unitIds.archer, 'hold')]);
    await finishTurn(1, 7001, [command(siege.unitIds.catapult, 'move', [{i: 4, j: 4}],
        {interaction_intent: 'attack', target_owner_id: 7002})]);
    await finishTurn(1, 7002, [command(siege.unitIds.archer, 'hold')]);
    let cityProperties = JSON.parse(value(`SELECT properties_json FROM server_game_units WHERE id=${siege.unitIds['target-city']}`));
    assert.equal(cityProperties.cityDefensePercent, 99, 'Catapult reduces City defense by one percent');

    await finishTurn(2, 7001, [command(siege.unitIds.trebuchet, 'move', [{i: 4, j: 4}],
        {interaction_intent: 'attack', target_owner_id: 7002})]);
    await finishTurn(2, 7002, [command(siege.unitIds.archer, 'hold')]);
    cityProperties = JSON.parse(value(`SELECT properties_json FROM server_game_units WHERE id=${siege.unitIds['target-city']}`));
    assert.equal(cityProperties.cityDefensePercent, 98,
        'the next turn repairs to 100 before Trebuchet reduces City defense by two percent');
    assert.ok(Number(value("SELECT COUNT(*) FROM server_game_events WHERE event_type='city_defense_damaged'")) >= 2);

    resetDatabase();
    const respawn = await bootstrap({gameId: 'test-respawn-removes-cities', size: 16, tiles: mapTiles(16), units: [
        city({client_key: 'abandoned-city', owner_id: 7001, i: 3, j: 3}),
    ]});
    assert.equal(respawn.result.respawn_required, true, 'unitless player waits for explicit spawn selection');
    assert.equal(Number(value("SELECT COUNT(*) FROM server_game_units WHERE unit_class=3 AND deleted_at IS NULL")), 1,
        'the old City remains visible during the five-second client selection period');
    const respawned = await serverGame.request('respawn_player', {
        player_id: 7001, preferred_i: 10, preferred_j: 10,
    });
    assert.ok(Math.abs(respawned.spawn.i - 10) <= 2 && Math.abs(respawned.spawn.j - 10) <= 2,
        'server chooses a valid grass tile near the selected spawn point');
    assert.equal(Number(value("SELECT COUNT(*) FROM server_game_units WHERE unit_class=3 AND deleted_at IS NULL")), 0,
        'unitless respawn deletes all surviving Cities');
    assert.equal(Number(value("SELECT COUNT(*) FROM server_game_units WHERE can_move=1 AND deleted_at IS NULL")), 4,
        'unitless respawn creates one Settler and three Explorers');
    assert.ok(respawned.snapshot && !respawned.snapshot.respawn_required);
    console.log('PASS ships use Cities, amphibious attacks are refused, siege defense degrades/repairs, and respawn removes Cities');
})().catch(error => { console.error(error); process.exitCode = 1; });

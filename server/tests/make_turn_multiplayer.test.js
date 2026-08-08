#!/usr/bin/env node
'use strict';
const {assert, serverGame, resetDatabase, bootstrap, mapTiles, unit, city, sql, value} = require('./test_client');

function command(unitId, name, path = [], payload = {}) {
    return {unit_id: unitId, command: name, path, payload};
}

(async () => {
    resetDatabase();
    const fixture = await bootstrap({players: [7001, 7002], units: [
        unit({client_key: 'red', owner_id: 7001, unit_type_id: 'warrior', unit_class: 2, name: 'Warrior', attack: 8, i: 2, j: 2}),
        unit({client_key: 'blue', owner_id: 7002, unit_type_id: 'warrior', unit_class: 2, name: 'Warrior', attack: 2, i: 2, j: 4}),
    ], tiles: mapTiles(8)});
    const red = fixture.unitIds.red;
    const blue = fixture.unitIds.blue;

    const finishBootstrapTurn = await serverGame.request('make_turn', {
        player_id: 7002, turn: 0, commands: [command(blue, 'hold')], actions: [], player_state: {}, relations: {},
    });
    assert.equal(finishBootstrapTurn.resolved_turn, 0);

    sql("UPDATE server_games SET turn_deadline_at=DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 SECOND)");
    const timed = await serverGame.request('make_turn', {
        player_id: 7001, turn: 1, commands: [command(red, 'move', [{i: 2, j: 3}])],
        actions: [], player_state: {}, relations: {},
    });
    assert.equal(timed.resolved_turn, 1, 'the first submission after the deadline resolves the turn');
    assert.equal(Number(value(`SELECT j FROM server_game_units WHERE id=${red}`)), 3);

    const waiting = await serverGame.request('make_turn', {
        player_id: 7001, turn: 2,
        commands: [command(red, 'move', [{i: 2, j: 4}], {interaction_intent: 'attack', target_owner_id: 7002})],
        actions: [], player_state: {}, relations: {},
    });
    assert.equal(waiting.resolved_turn, null);
    assert.equal(Number(value(`SELECT j FROM server_game_units WHERE id=${red}`)), 3, 'orders do not execute before resolution');
    const resolved = await serverGame.request('make_turn', {
        player_id: 7002, turn: 2, commands: [command(blue, 'hold')],
        actions: [], player_state: {}, relations: {},
    });
    assert.equal(resolved.resolved_turn, 2);
    assert.ok(Number(value("SELECT COUNT(*) FROM server_game_events WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.combat_kind'))='unit_attack'")) >= 1);
    assert.equal(value('SELECT relation_status FROM server_game_relations WHERE player_a=7001 AND player_b=7002'), 'war');

    resetDatabase();
    const captureTiles = mapTiles(8);
    const ironTile = captureTiles.find(tile => tile.i === 3 && tile.j === 4);
    ironTile.resource_type = 34;
    ironTile.modifiers = {road: true};
    const capture = await bootstrap({gameId: 'test-captured-city-resources', players: [7001, 7002],
        tiles: captureTiles, units: [
            unit({client_key: 'capturer', owner_id: 7001, unit_type_id: 'warrior', unit_class: 2,
                name: 'Warrior', attack: 8, i: 3, j: 2}),
            city({client_key: 'captured-city', owner_id: 7002, i: 3, j: 3}),
            unit({client_key: 'remote-defender', owner_id: 7002, unit_type_id: 'warrior', unit_class: 2,
                name: 'Warrior', attack: 2, i: 6, j: 6}),
        ]});
    const capturer = capture.unitIds.capturer;
    const capturedCity = capture.unitIds['captured-city'];
    await serverGame.request('make_turn', {
        player_id: 7002, turn: capture.result.turn,
        commands: [command(capturedCity, 'hold')], actions: [], player_state: {}, relations: {},
    });
    await serverGame.request('make_turn', {
        player_id: 7001, turn: 1,
        commands: [command(capturer, 'move', [{i: 3, j: 3}],
            {interaction_intent: 'attack', target_owner_id: 7002})],
        actions: [], player_state: {}, relations: {},
    });
    await serverGame.request('make_turn', {
        player_id: 7002, turn: 1,
        commands: [command(capturedCity, 'hold')], actions: [], player_state: {}, relations: {},
    });
    assert.equal(Number(value(`SELECT owner_id FROM server_game_units WHERE id=${capturedCity}`)), 7001,
        'the empty City is captured');
    assert.equal(Number(value("SELECT resource_visible FROM server_game_visibility v "
        + "JOIN server_games g ON g.id=v.game_id WHERE g.game_key='test-captured-city-resources' "
        + "AND v.player_id=7001 AND v.i=3 AND v.j=4")), 1,
        'the captured City reveals road-connected Iron to its new owner');
    const capturedUpdate = await serverGame.request('load_update', {
        player_id: 7001, since_unit_revision: 0, since_landscape_revision: 0, since_event_id: 0,
    });
    const visibleIron = capturedUpdate.tiles.find(tile => tile.i === 3 && tile.j === 4);
    assert.ok(visibleIron && visibleIron.resource_visible && visibleIron.resource_type === 34,
        'the JS client receives the connected Iron through its normal landscape update');
    sql("UPDATE server_game_players p JOIN server_games g ON g.id=p.game_id "
        + "SET p.state_json=JSON_SET(p.state_json,'$.money',100) "
        + "WHERE g.game_key='test-captured-city-resources' AND p.player_id=7001");
    const pikemanProduction = await serverGame.request('select_production', {
        player_id: 7001, city_unit_id: capturedCity, unit_type_id: 'pikeman',
    });
    assert.equal(pikemanProduction.city.properties.production.unitTypeId, 'pikeman',
        'the captured City can select Pikeman production from its connected Iron');
    console.log('PASS make_turn coordinates two JS clients, timeout resolution, atomic movement, combat, and war persistence');
})().catch(error => { console.error(error); process.exitCode = 1; });

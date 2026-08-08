#!/usr/bin/env node
'use strict';
const {assert, serverGame, resetDatabase, bootstrap, sql} = require('./test_client');

(async () => {
    resetDatabase();
    const fixture = await bootstrap();
    sql("UPDATE server_game_units SET state='waiting', health=41, revision=30 WHERE client_key='unit-1'; UPDATE server_games SET revision=30;");
    const response = await serverGame.request('update_units', {player_id: fixture.playerId, since_revision: 2});
    const worker = response.units.find(unit => unit.client_key === 'unit-1');
    assert.equal(worker.state, 'waiting');
    assert.equal(worker.health, 41);
    assert.ok(response.owned_unit_ids.includes(worker.id));
    console.log('PASS update_units returns changed owned units and ownership indexes from MySQL');
})().catch(error => { console.error(error); process.exitCode = 1; });

#!/usr/bin/env node
'use strict';
const {assert, serverGame, resetDatabase, bootstrap, sql, gameDatabaseId} = require('./test_client');

(async () => {
    resetDatabase();
    const fixture = await bootstrap();
    const gameId = gameDatabaseId(fixture.gameId);
    sql(`INSERT INTO server_game_events (game_id,turn_number,revision,audience_player_id,event_type,i,j,message,payload_json)
         VALUES (${gameId},1,9,${fixture.playerId},'test_event',2,4,'integration event','{\"value\":7}')`);
    const response = await serverGame.request('update_events', {player_id: fixture.playerId, since_event_id: 0});
    assert.equal(response.events.length, 1);
    assert.equal(response.events[0].event_type, 'test_event');
    assert.equal(response.events[0].payload.value, 7);
    assert.equal(response.last_event_id, response.events[0].id);
    console.log('PASS update_events returns only persisted events visible to the requesting player');
})().catch(error => { console.error(error); process.exitCode = 1; });

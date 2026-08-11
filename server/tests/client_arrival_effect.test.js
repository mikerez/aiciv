#!/usr/bin/env node
'use strict';

const {assert, mapTiles, unit} = require('./test_client');
const {createBrowserClient, localUnit} = require('./browser_client');

const playerId = 7460;
const definition = unit({client_key:'arrival', owner_id:playerId, i:2, j:2});
const local = localUnit(definition, 91);
const client = createBrowserClient({
    size:10, playerId, gameId:'client-arrival-effect', tiles:mapTiles(10), units:[local],
});
client.serverGame.applyUnitUpdates(playerId, {
    units:[{
        id:91, client_key:'arrival', owner_id:playerId, unit_type_id:'worker', unit_class:1,
        name:'Worker', texture:270, can_move:true, nature:'land', i:4, j:4, world_i:4, world_j:4,
        attack:0, defense:1, speed:1, view_range:2, state:'ready', health:100,
        max_health:100, experience:1, move_penalty:0, properties:{},
    }],
    owned_unit_ids:[91], visible_enemy_ids:[], visibility:[],
});
assert.ok(local.arrivalEffect, 'an authoritative coordinate change creates an arrival effect');
assert.equal(local.arrivalEffect.duration, 900, 'arrival effect remains visible long enough for the next render');
assert.deepEqual([local.arrivalEffect.from.i, local.arrivalEffect.from.j], [3,3],
    'a multi-step update animates only its final approach direction');
client.serverGame.applyCombatUnitUpdates([{id:91, i:5, j:5, health:95, max_health:100, experience:1.1}], false);
assert.deepEqual([local.arrivalEffect.from.i, local.arrivalEffect.from.j], [4,4],
    'combat snapshots use the same final-step arrival effect');
console.log('PASS authoritative and combat movement updates consistently create final-step arrival effects');

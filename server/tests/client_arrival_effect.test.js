#!/usr/bin/env node
'use strict';

const {assert, mapTiles, unit} = require('./test_client');
const {createBrowserClient, localUnit} = require('./browser_client');
const fs = require('node:fs');
const vm = require('node:vm');

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
assert.equal(local.arrivalEffect.duration, 180, 'arrival effect is five times faster than the previous turn animation');
assert.deepEqual([local.arrivalEffect.from.i, local.arrivalEffect.from.j], [3,3],
    'a multi-step update animates only its final approach direction');
client.serverGame.applyCombatUnitUpdates([{id:91, i:5, j:5, health:95, max_health:100, experience:1.1}], false);
assert.deepEqual([local.arrivalEffect.from.i, local.arrivalEffect.from.j], [4,4],
    'combat snapshots use the same final-step arrival effect');
const drawContext = {console, performance:{now:() => 500}};
vm.createContext(drawContext);
vm.runInContext(fs.readFileSync('draw.js', 'utf8') + ';globalThis.draw=_draw;', drawContext);
const moving = {
    coord:{i:5,j:5},
    arrivalEffect:{from:{i:4,j:4}, startedAt:0, duration:1000},
};
assert.deepEqual(JSON.parse(JSON.stringify(drawContext.draw.unitArrivalVisualCoord(moving, 500))),
    {i:4.5,j:4.5}, 'the complete unit render position must interpolate between source and destination');
const screenSource = fs.readFileSync('screen.js', 'utf8');
assert.match(screenSource,
    /visualCoord =[^;]*unitArrivalVisualCoord[\s\S]*?drawSprite\(ijtox1\(visualCoord\.i, visualCoord\.j\)[\s\S]*?unit\.texture/,
    'WebGL must draw the unit sprite at its interpolated arrival position');
assert.match(screenSource,
    /teamTexture[\s\S]*?drawSprite\(ijtox1\(visualCoord\.i, visualCoord\.j\)[\s\S]*?teamTexture/,
    'the team-color overlay must move with the unit sprite');
assert.doesNotMatch(fs.readFileSync('draw.js', 'utf8'), /drawUnitArrivalEffects\(ctx\)[\s\S]{0,1800}ctx\.arc/,
    'arrival rendering must no longer substitute a moving circle for the unit');
console.log('PASS authoritative movement interpolates the complete WebGL unit and team overlay');

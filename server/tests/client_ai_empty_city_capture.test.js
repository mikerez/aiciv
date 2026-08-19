#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {Coord, Unit, createBrowserClient, loadAiModels} = require('./browser_client');

const root = path.resolve(__dirname, '../..');

function localUnit(unitClass, unitTypeId, ownerId, serverId, i, j) {
    const result = new Unit(unitClass, 258, new Coord(i, j));
    Object.assign(result, {
        serverId, team: ownerId, unitTypeId,
        can_move: unitClass !== 3, nature: 'land',
        attack: unitClass === 2 ? 2 : 0, defense: 1, speed: 1,
        viewRange: 2, state: unitClass === 2 ? 'fortified' : 'ready',
        health: 100, maxHealth: 100, experience: 1,
    });
    return result;
}

(async () => {
    const warrior = localUnit(2, 'warrior', 1, 2378, 5, 5);
    const enemyCity = localUnit(3, 'city', 5, 1373, 5, 4);
    enemyCity.can_move = false;
    const tiles = [];
    for (let i = 0; i < 12; i++) {
        for (let j = 0; j < 12; j++) {
            tiles.push({i, j, terrain_tex: 2, terrain_type: 2, visibility_level: 2});
        }
    }
    const client = createBrowserClient({
        size: 12, playerId: 1, gameId: 'empty-city-capture', tiles,
        units: [warrior], unitsByUser: {1: [warrior], 5: [enemyCity]},
    });
    loadAiModels(client);
    const input = client.aiPlayer.buildActionInputForUnit(1, warrior.serverId, null);
    const candidates = client.aiPlayer.lastActionCandidates;
    const attackSlot = candidates.findIndex(candidate => candidate.command === 'attack'
        && candidate.target.i === enemyCity.coord.i && candidate.target.j === enemyCity.coord.j);
    assert.ok(attackSlot >= 0, 'the empty enemy City must be encoded as a legal attack candidate');

    const output = await client.aiPlayer.infer('action', input);
    const selected = client.aiPlayer.decodeActionOutput(output)[0];
    assert.equal(selected.record, attackSlot,
        'the Action model must choose capture instead of keeping the adjacent Warrior fortified');
    assert.equal(selected.command, 'attack');

    enemyCity.type = 2;
    enemyCity.unitTypeId = 'warrior';
    enemyCity.can_move = true;
    enemyCity.attack = 2;
    enemyCity.defense = 2;
    const combatInput = client.aiPlayer.buildActionInputForUnit(1, warrior.serverId, null);
    const combatCandidates = client.aiPlayer.lastActionCandidates;
    const combatAttackSlot = combatCandidates.findIndex(candidate => candidate.command === 'attack'
        && candidate.target.i === enemyCity.coord.i && candidate.target.j === enemyCity.coord.j);
    assert.ok(combatAttackSlot >= 0,
        'an adjacent visible enemy military unit must be encoded as a legal attack candidate');
    const combatOutput = await client.aiPlayer.infer('action', combatInput);
    const combatSelected = client.aiPlayer.decodeActionOutput(combatOutput)[0];
    assert.equal(combatSelected.record, combatAttackSlot,
        'the Action model must attack an adjacent enemy military unit instead of waiting');
    assert.equal(combatSelected.command, 'attack');

    client.document.cookie = 'aiciv_player_id=1';
    vm.runInContext(fs.readFileSync(path.join(root, 'multiplayer.js'), 'utf8')
        + '\nglobalThis.realMultiplayer = _multiplayer;', client, {filename: 'multiplayer.js'});
    client.aiPlayer.inferBackground = (kind, values) => client.aiPlayer.infer(kind, values);
    let fallbackCalls = 0;
    client.realMultiplayer.routeExcessMilitaryToStrategicResource = function(unit) {
        fallbackCalls++;
        unit.gotoPath = [];
        unit.gotoCoord = null;
        unit.state = 'fortified';
        return true;
    };
    const submission = await client.realMultiplayer.prepareAiUnitOrder(
        1, {}, warrior.serverId, null, true
    );
    assert.equal(fallbackCalls, 0,
        'strategic-resource fallback must not overwrite an Action route');
    assert.equal(submission.commands[0].command, 'move',
        'the final server submission must retain the City attack movement');
    assert.equal(submission.commands[0].payload.interaction_intent, 'attack');
    assert.equal(submission.commands[0].payload.target_owner_id, enemyCity.team);
    console.log('PASS Action model attacks adjacent enemy Cities and military units');
})().catch(error => { console.error(error); process.exitCode = 1; });

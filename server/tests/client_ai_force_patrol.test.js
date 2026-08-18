#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {Coord, Unit, createBrowserClient, loadAiModels} = require('./browser_client');

const root = path.resolve(__dirname, '../..');

function localUnit(unitClass, unitTypeId, serverId, i, j, attack, defense) {
    const unit = new Unit(unitClass, 258, new Coord(i, j));
    Object.assign(unit, {
        serverId, team: 1, unitTypeId, can_move: unitClass !== 3,
        nature: 'land', attack, defense, speed: 1, viewRange: 2,
        state: unitClass === 2 ? 'fortified' : 'ready',
        health: 100, maxHealth: 100, experience: 1,
    });
    return unit;
}

(async () => {
    const city = localUnit(3, 'city', 100, 4, 4, 0, 2);
    const defender = localUnit(2, 'spearman', 101, 4, 4, 2, 5);
    const excess = localUnit(2, 'warrior', 102, 4, 4, 2, 1);
    const field = localUnit(2, 'archer', 104, 10, 10, 3, 1);
    const tiles = [];
    for (let i = 0; i < 18; i++) {
        for (let j = 0; j < 18; j++) {
            const visible = Math.max(Math.abs(i - 4), Math.abs(j - 4)) <= 3
                || Math.max(Math.abs(i - 10), Math.abs(j - 10)) <= 2;
            tiles.push({
                i, j, terrain_tex: 2, terrain_type: 2,
                terrain_bits: visible ? 0x45ff : 0x05ff,
                visibility_level: visible ? 2 : 0,
            });
        }
    }
    const client = createBrowserClient({
        size: 18, playerId: 1, gameId: 'barbarian-force-patrol', tiles,
        units: [city, defender, excess, field], serverTurn: 0,
    });
    loadAiModels(client);
    client.document.cookie = 'aiciv_player_id=1';
    vm.runInContext(fs.readFileSync(path.join(root, 'multiplayer.js'), 'utf8')
        + '\nglobalThis.realMultiplayer = _multiplayer;', client, {filename: 'multiplayer.js'});
    client.aiPlayer.inferBackground = async function() {
        const output = new Float32Array(72);
        output[0] = 1;
        return output;
    };

    const defend = await client.realMultiplayer.prepareAiUnitOrder(1, {}, defender.serverId, null, true);
    assert.equal(defend.commands[0].command, 'set_state');
    assert.equal(defend.commands[0].payload.state, 'fortified');
    assert.equal(defend.commands[0].payload.automation_mode, null,
        'the strongest unit on a City remains its garrison');
    assert.equal(defend.commands[0].payload.ai_force_mission.mode, 'city_defense');

    const deployExcess = await client.realMultiplayer.prepareAiUnitOrder(1, {}, excess.serverId, null, true);
    assert.equal(deployExcess.commands[0].command, 'move',
        'a second military unit on the City is deployed instead of waiting');
    assert.equal(deployExcess.commands[0].payload.automation_mode, 'patrol');
    assert.notEqual(deployExcess.commands[0].payload.ai_force_mission.mode, 'city_defense');

    const deployField = await client.realMultiplayer.prepareAiUnitOrder(1, {}, field.serverId, null, true);
    assert.equal(deployField.commands[0].command, 'move',
        'an idle field force receives an active route');
    assert.equal(deployField.commands[0].payload.automation_mode, 'patrol');
    assert.equal(deployField.commands[0].payload.ai_force_mission.mode, 'explore',
        'the deterministic exploration half routes toward nearby fog');
    console.log('PASS Barbarian garrisons stay while excess and field forces patrol or explore');
})().catch(error => { console.error(error); process.exitCode = 1; });

#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const menu = fs.readFileSync('menu_unit.js', 'utf8');
const prehistory = fs.readFileSync('game_prehistory.js', 'utf8');
const serverClient = fs.readFileSync('server_game.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

const actionIcons = [
    'goto', 'fortificate', 'fortification', 'road', 'road_to', 'pasture', 'farm',
    'plantation', 'camp', 'fishing_boats', 'network', 'quarry', 'winery', 'cottage',
    'workshop', 'mine', 'disband', 'wait', 'irrigate', 'chop_forest', 'build_city',
    'explore', 'patrol', 'automate', 'optimize_food', 'optimize_production',
    'optimize_gold', 'optimize_balanced', 'clear',
];
for (const icon of actionIcons) {
    assert.ok(fs.existsSync(`images/action_${icon}.png`), `missing action icon ${icon}`);
}

const staticCommands = [...menu.matchAll(/data-menu-command="([^"]+)"/g)].map(match => match[1]);
for (const command of staticCommands) {
    const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const keyPattern = command.includes(':') ? `['"]${escaped}['"]` : `\\b${escaped}`;
    assert.match(menu, new RegExp(`${keyPattern}\\s*:\\s*['"]`),
        `static action ${command} needs an icon registry entry`);
}

const unitTypeIds = [...prehistory.matchAll(/new UnitType\('([^']+)'/g)]
    .map(match => match[1]).filter(id => id !== 'city');
for (const unitTypeId of new Set(unitTypeIds)) {
    const escaped = unitTypeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(prehistory, new RegExp(`(?:^|\\n)\\s*${escaped}:\\s*'[^']+\\.png'`, 'm'),
        `unit type ${unitTypeId} needs a production-menu sprite`);
}
assert.match(menu, /command\.indexOf\('produce_unit:'\)[\s\S]*?prehistoryUnitSpriteUrl\(unitTypeId\)/,
    'dynamic production actions must resolve the corresponding unit sprite');
assert.match(prehistory, /if \(_prehistory_action_menu_dismissed\)[\s\S]*?menu\.style\.display = 'none'[\s\S]*?menu\.style\.display = 'block'/,
    'selected menus must recover from transient hidden styles unless explicitly dismissed');
assert.doesNotMatch(prehistory, /suppressAutomationMenu/,
    'unit synchronization must not carry a hidden-menu flag');
assert.doesNotMatch(serverClient, /completedAutomatedWorker[\s\S]{0,240}style\.display\s*=\s*'none'/,
    'automated Worker completion must not hide the selected action menu');
assert.doesNotMatch(index, /if \(deferPhoneStack\) \{\s*if \(_current_game\.dismissActionMenu\)/,
    'phone touchstart must not hide the menu before the gesture is classified');

console.log(`PASS ${actionIcons.length} action icons and ${new Set(unitTypeIds).size} unit production sprites`);

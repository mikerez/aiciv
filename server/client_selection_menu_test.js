#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const screen = fs.readFileSync("screen.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");
const menu = fs.readFileSync("menu_unit.js", "utf8");
const game = fs.readFileSync("game.js", "utf8");
const prehistory = fs.readFileSync("game_prehistory.js", "utf8");

assert.match(screen, /radiusX\s*=\s*79\/_screenZoom/);
assert.match(screen, /radiusY\s*=\s*55\/_screenZoom/);
assert.match(index, /function clearGameSelection\(\)[\s\S]*?_selection\s*=\s*-1/);
assert.match(index, /function clearGameSelection\(\)[\s\S]*?_multi_selection\s*=\s*\[\]/);
assert.match(index, /event\.code\s*===\s*'Escape'[\s\S]*?clearGameSelection\(\)/);
assert.match(menu, /command\.indexOf\('produce_unit:'\)\s*!=\s*0/);
assert.doesNotMatch(menu, /unit-command-key|data-command-key/,
    'Unit action menus must not render keyboard shortcut badges');
assert.doesNotMatch(menu, /menu\.action_options/,
    'Unit action menus must not render the Action options title');
assert.match(menu, /images\/menu\.png\?v=20260814n/,
    'Unit action menus must load the current menu frame');
assert.match(index, /id="foreground"[^>]*top:\s*calc\(50% - 205px\)[^>]*width:\s*300px[^>]*height:\s*410px/,
    'The desktop action panel must be 410px high and vertically centered');
assert.match(index, /images\/button\.png\?v=20260814n/,
    'Main command buttons must load the current button frame');
assert.match(prehistory, /dismissActionMenu\(\)[\s\S]*?_prehistory_action_menu_dismissed\s*=\s*true/,
    'Action-menu dismissal must apply on desktop and phone');
assert.doesNotMatch(prehistory, /dismissActionMenu\(\)[\s\S]{0,180}usesCompactActionMenu/,
    'Desktop action-menu dismissal must not be guarded by compact layout detection');
assert.match(menu, /data-menu-command="disband"[\s\S]*data-command-label="disband"/);
assert.match(fs.readFileSync('vocabulary_EN.js', 'utf8'), /'command\.disband': 'Disband'/);
assert.doesNotMatch(menu, /data-menu-command="destroy"/);
assert.match(game, /\/\* Control-zone color stripes are not currently needed\.[\s\S]*?drawStroke[\s\S]*?\*\//,
    'the obsolete force color-stripe pass should remain commented out');

console.log("PASS selection size, Escape clearing, and persistent phone production menu");

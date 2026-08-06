#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
const inlineScripts = Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))
    .map((match) => match[1])
    .filter((source) => source.trim());
for (const source of inlineScripts) new Function(source);

const downStart = html.indexOf("function handlePointerDown(event)");
const defer = html.indexOf("var deferPhoneMapCommand", downStart);
const normalCommit = html.indexOf("if (_current_game.handleMapClick(coord))", downStart);
assert.ok(defer > downStart && defer < normalCommit,
    "phone Goto must be deferred before the normal touchstart map-click commit");
assert.match(html, /event\.type === 'touchend' && !mapCommandTap\.moved/);
assert.match(html, /commandDx\*commandDx \+ commandDy\*commandDy >= commandDragThreshold\*commandDragThreshold/);
assert.match(html, /_panning_map = 0;[\s\S]*?_pending_phone_map_command_tap/);

const game = fs.readFileSync("game_prehistory.js", "utf8");
assert.match(game, /hasPendingMapCommand\(\)[\s\S]*?_prehistory_command_mode == 'goto'/);
assert.match(game, /!this\.usesCompactActionMenu\(\) && typeof _last_hover_coord/,
    "phone Goto must not assign the previous hover location when its menu command is tapped");

console.log("PASS phone Goto commits the next stationary map tap on touch release");

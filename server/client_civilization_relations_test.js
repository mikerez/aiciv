#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const menu = fs.readFileSync("menu_civilizations.js", "utf8");
const client = fs.readFileSync("server_game.js", "utf8");
const server = fs.readFileSync("server_game.php", "utf8");
const vocabulary = fs.readFileSync("vocabulary_EN.js", "utf8");

assert.match(menu, /civilization\.food_gold.*player\.food.*player\.gold/s,
    "Civilizations panel must show authoritative food and gold");
assert.match(menu, /relationCheckbox\(vocabularyText\('relation\.friend'\).*relationCheckbox\(vocabularyText\('relation\.enemy'\)/s,
    "Civilizations panel must provide Friend and Enemy checkboxes");
assert.match(vocabulary, /'civilization\.food_gold': 'Food: \{food\} \| Gold: \{gold\}'/,
    "Civilization economy labels belong to the vocabulary");
assert.match(menu, /setRelationPreference\(viewerId, targetPlayerId, status\)/,
    "directional checkbox changes must update client relation state");
assert.match(client, /relations: this\.captureRelations\(playerId\)/,
    "End Turn capture must contain directional relations");
assert.match(client, /relations: submission\.relations \|\| \{\}/,
    "make_turn must send directional relations");
assert.match(server, /storePlayerDirectionalRelations\([\s\S]*\$relationPreferences/,
    "PHP must persist End Turn relation preferences");
assert.match(server, /'food' => max\(0,.*'gold' => max\(0,/s,
    "PHP civilization response must include authoritative food and gold");

console.log("PASS directional civilization controls and economy statistics are wired end to end");

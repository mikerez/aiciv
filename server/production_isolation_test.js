#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const php = fs.readFileSync("server_game.php", "utf8");
const layer = fs.readFileSync("game_prehistory.js", "utf8");
const game = fs.readFileSync("game.js", "utf8");

assert.match(php, /SERVER_GAME_SCHEMA_VERSION = 19/,
    "current schema must retain the legacy production-balance migration");
assert.match(php, /UPDATE productions SET production_points = 0/,
    "existing active balances must be reset during migration");
assert.match(php, /\$points = \$existingProduction[\s\S]*?: 0\.0;/,
    "a newly selected first item must start from zero rather than idle storage");
assert.equal((php.match(/\$remaining = 0\.0;/g) || []).length, 2,
    "both production completion paths must discard overflow");
assert.doesNotMatch(php, /productionStored[^\n]*\+\s*\$|productionStored[^\n]*\+=/,
    "PHP must never add to an idle production account");
assert.match(layer, /city\.production\.productionPoints = 0;/,
    "client selection must show a new active item at zero points");
assert.doesNotMatch(layer, /productionPoints = city\.cityProperties\.productionStored|productionStored \+=/,
    "client layer must not roll idle production into a task");
assert.match(game, /city\.production = new CityProductionState\(city\.productionQueue\[0\]\);[\s\S]*?productionPoints = 0;/,
    "offline queue progression must start the next item from zero");
assert.match(layer, /availableGold < this\.unitGoldUpkeep\(unitType\.id\)/,
    "the City production menu must hide units whose one-turn gold upkeep is unaffordable");
assert.match(php, /production_gold_upkeep_required/,
    "the authoritative production endpoint must reject unaffordable gold upkeep");
assert.match(php, /\$points = min\(\$cost, \(float\) \$production\['production_points'\] \+ \$perTurn\)/,
    "ready production must be capped at its cost instead of accumulating hidden overflow");
assert.match(php, /lastMoneyIncome[\s\S]*lastTechnologyExpense[\s\S]*lastAvailableMoney[\s\S]*lastScienceIncome/,
    "turn submissions must preserve every server-authoritative economy summary field");

console.log("PASS production points are isolated to one active backlog item");

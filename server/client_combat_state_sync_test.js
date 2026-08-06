#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class Coord {
    constructor(i, j) { this.i = i; this.j = j; }
}

const attacker = {
    serverId: 101, team: 4, health: 100, maxHealth: 100, experience: 1,
    coord: new Coord(3, 4),
};
const defender = {
    serverId: 202, team: 9, health: 100, maxHealth: 100, experience: 1,
    coord: new Coord(4, 4),
};
const context = {
    console,
    Date,
    JSON,
    Math,
    Promise,
    Coord,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    document: { getElementById() { return null; } },
    window: { location: { replace() {} } },
    _units_by_user: { 4: [attacker], 9: [defender] },
    _fulldraw: 0,
};
vm.createContext(context);
vm.runInContext(
    fs.readFileSync("server_game.js", "utf8") + "\nglobalThis.serverGame = _server_game;",
    context,
    { filename: "server_game.js" }
);

context.serverGame.applyCombatUnitUpdates([
    { id: 101, owner_id: 4, i: 3, j: 4, health: 72, max_health: 100, experience: 1.25, deleted: false },
    { id: 202, owner_id: 9, i: 4, j: 4, health: 8, max_health: 100, experience: 1, deleted: false },
], false);

assert.equal(attacker.health, 72);
assert.equal(attacker.maxHealth, 100);
assert.equal(attacker.experience, 1.25);
assert.equal(defender.health, 8);
assert.equal(defender.maxHealth, 100);
assert.equal(defender.experience, 1);
assert.equal(context._fulldraw, 1);

context.serverGame.applyCombatUnitUpdates([
    { id: 202, owner_id: 9, i: 4, j: 4, health: 0, max_health: 100, experience: 1, deleted: true },
], true);
assert.equal(context._units_by_user[9].length, 0, "defeated defender must be removed after combat animation");

console.log("PASS client applies authoritative HP and XP to both combatants");

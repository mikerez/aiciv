#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const unit = {
    state: "ready",
    defense: 10,
    health: 100,
    maxHealth: 100,
    experience: 1,
    coord: { i: 2, j: 3 },
};
const context = {
    console,
    Math,
    appendConsoleLog() {},
    _units_by_user: {},
    _map_terrain_mod: Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => ({}))),
};
vm.createContext(context);
vm.runInContext(
    fs.readFileSync("military.js", "utf8") + "\nglobalThis.military = _military;",
    context,
    { filename: "military.js" }
);

assert.equal(context.military.defenseStrength(unit), 10);
unit.state = "fortified";
assert.equal(context.military.defenseStrength(unit), 12.5, "fortified state must add 25%");
unit.state = "ready";
context._map_terrain_mod[2][3].fortification = true;
assert.equal(context.military.defenseStrength(unit), 15, "Fortification Tile must add 50%");
unit.state = "fortified";
assert.equal(context.military.defenseStrength(unit), 17.5, "both bonuses must add to 75%");

console.log("PASS fortified unit and Fortification Tile defence bonuses are additive");

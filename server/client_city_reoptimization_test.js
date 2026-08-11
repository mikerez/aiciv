#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class Coord {
    constructor(i, j) { this.i = i; this.j = j; }
}

const size = 5;
const matrix = (factory) => Array.from({length: size}, (_, i) =>
    Array.from({length: size}, (_, j) => factory(i, j)));
const terrain = matrix(() => 1);
const modifiers = matrix(() => ({}));
const resources = matrix(() => ({type: 0, hidden: false}));
terrain[1][2] = 7;
terrain[2][3] = 2;
modifiers[2][3] = {road: true, irrigation: true};

const city = {
    type: 3,
    team: 7,
    coord: new Coord(2, 2),
    cityPopulation: 1,
    cityOptimization: "food",
    cityProperties: {productionPerTurn: 0},
};
const context = {
    console,
    Coord,
    _map_size: size,
    _map_terrain_tex: terrain,
    _map_terrain_mod: modifiers,
    _map_resource: resources,
    _resource_types: [null],
    _units: [city],
    _units_by_user: {7: [city]},
    _fulldraw: 0,
    _map: {prepareTerrainModifierSprites() {}},
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("economics.js", "utf8") + ";globalThis.economics=_economics;", context);
vm.runInContext(
    fs.readFileSync("city.js", "utf8") + ";globalThis.cityEconomy=_city_economy;",
    context
);

const economy = context.cityEconomy;
economy.ensureCity(city);
assert.deepEqual(
    {i: city.economy.citizens[0].coord.i, j: city.economy.citizens[0].coord.j},
    {i: 1, j: 2},
    "the City initially works the better unimproved food Tile"
);

modifiers[2][3] = {road: true, farm: true};
assert.equal(economy.reoptimizeCitiesForTile(2, 3, 7), 1);
assert.deepEqual(
    {i: city.economy.citizens[0].coord.i, j: city.economy.citizens[0].coord.j},
    {i: 2, j: 3},
    "a completed enhancement must move the citizen to the newly superior Tile"
);
assert.equal(city.cityOptimization, "food", "reoptimization must preserve the selected mode");
assert.equal(city.economy.lastGrossIncome.food, 5);
assert.equal(context._fulldraw, 1);

console.log("PASS completed enhancements re-optimize affected City citizen plots");

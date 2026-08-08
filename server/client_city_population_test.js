#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class Coord {
    constructor(i, j) { this.i = i; this.j = j; }
    add(di, dj) { return new Coord(this.i + di, this.j + dj); }
}
const mapSize = 12;
const terrain = Array.from({length: mapSize}, () => Array(mapSize).fill(2));
const modifiers = Array.from({length: mapSize}, () => Array.from({length: mapSize}, () => ({})));
for (let i = 2; i <= 6; i++) modifiers[i][1].road = true;
const context = {
    console,
    Coord,
    _units: [],
    _map_size: mapSize,
    _map_terrain_tex: terrain,
    _map_terrain_mod: modifiers,
    _map: {prepareTerrainModifierSprites() {}},
};
vm.createContext(context);
vm.runInContext(
    fs.readFileSync("city.js", "utf8")
        + "\nglobalThis.cityEconomy = _city_economy; globalThis.CityEconomyStateForTest = CityEconomyState;",
    context,
    {filename: "city.js"}
);

const economy = context.cityEconomy;
economy.updateIncome = function() {};
economy.findBestFreeTile = function() { return null; };
const city = {
    type: 3,
    cityPopulation: 37,
    serverId: 9,
    lastCityIncome: {
        food: -2, grossFood: 35, foodConsumption: 37,
        production: 4, grossProduction: 5, money: -1, grossMoney: 0,
    },
    economy: new context.CityEconomyStateForTest(),
};
city.economy.citizens.push({coord: {i: 1, j: 1}, income: {food: 2, production: 0, money: 0}});

economy.ensureCity(city);
assert.equal(city.cityPopulation, 37, "worked-tile limits must not reduce authoritative population");
assert.equal(economy.citizenGrowthCost(city), 390, "growth must use authoritative population");
assert.equal(economy.foodConsumption(city), 37, "food consumption must use authoritative population");
assert.equal(city.economy.lastIncome.food, -2, "signed authoritative City food must remain visible");
assert.equal(city.economy.lastIncome.money, -1, "signed authoritative Workshop gold cost must remain visible");

const candidateCity = {coord: new Coord(1, 1)};
const candidateKeys = new Set(economy.economicTileCandidates(candidateCity).map((coord) => `${coord.i}:${coord.j}`));
assert(candidateKeys.has("3:1"), "a road-connected Tile must be eligible");
assert(candidateKeys.has("6:1"), "continuous roads must extend the City's economic reach");
assert(candidateKeys.has("2:2"), "an adjacent unroaded Tile must contribute");
assert(!candidateKeys.has("2:3"), "non-adjacent unroaded land must not contribute");
assert(!candidateKeys.has("10:10"), "remote disconnected Tile must not contribute");
modifiers[2][2].network = true;
const networkKeys = new Set(economy.economicTileCandidates(candidateCity).map((coord) => `${coord.i}:${coord.j}`));
assert(networkKeys.has("2:2"), "a nearby Tile with Nets must contribute without a road");

const ruinedCity = {
    type: 3, unitTypeId: "city", name: "City", texture: 602, can_move: false,
    coord: new Coord(2, 2), production: {unitTypeId: "warrior"}, productionQueue: ["warrior"], economy: {},
};
modifiers[2][2] = {road: true, irrigation: true};
assert.equal(economy.cityStarvesToDestroyedCity(ruinedCity), true);
assert.equal(ruinedCity.type, 4);
assert.equal(ruinedCity.unitTypeId, "destroyed_city");
assert.equal(ruinedCity.texture, 869);
assert.equal(ruinedCity.production, null);
assert.equal(modifiers[2][2].road, false, "destroyed City clears its Tile improvements");

console.log("PASS City population, signed income, and economic Tile reach");

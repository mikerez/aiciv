#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = {console};
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
    economy: new context.CityEconomyStateForTest(),
};
city.economy.citizens.push({coord: {i: 1, j: 1}, income: {food: 2, production: 0, money: 0}});

economy.ensureCity(city);
assert.equal(city.cityPopulation, 37, "worked-tile limits must not reduce authoritative population");
assert.equal(economy.citizenGrowthCost(city), 390, "growth must use authoritative population");
assert.equal(economy.foodConsumption(city), 37, "food consumption must use authoritative population");

console.log("PASS City growth and consumption preserve authoritative population");

#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class Coord {
    constructor(i, j) { this.i = i; this.j = j; }
}

const deterministicMath = Object.create(Math);
deterministicMath.random = () => 0.5;
const context = {
    console,
    Math: deterministicMath,
    Coord,
    _selection: -1,
    _selection_by_user: {},
    _units: [],
    _units_by_user: {},
    appendConsoleLog: () => {},
    _city_economy: { updateIncome: () => {} },
};
vm.createContext(context);
vm.runInContext(
    fs.readFileSync("military.js", "utf8") + "\nglobalThis.military = _military;",
    context,
    { filename: "military.js" }
);

function makeUnit(type, team, i, j, options = {}) {
    return Object.assign({
        type,
        unitTypeId: type === 3 ? "city" : (type === 2 ? "warrior" : "settlers"),
        name: type === 3 ? "City" : (type === 2 ? "Warrior" : "Settlers"),
        team,
        coord: new Coord(i, j),
        attack: type === 2 ? 8 : 0,
        defense: type === 3 ? 8 : 1,
        health: 100,
        maxHealth: 100,
        experience: 1,
        gotoPath: [],
        gotoCoord: null,
        move_penalty: 0,
    }, options);
}

function install(attacker, defenders) {
    context._units_by_user = { 0: [attacker], 1: defenders };
    context._units = context._units_by_user[0];
}

const attacker = makeUnit(2, 0, 2, 1);
const city = makeUnit(3, 1, 2, 1, {
    cityPopulation: 2,
    economy: { citizens: [{}, {}] },
});
const settler = makeUnit(0, 1, 2, 1);
install(attacker, [city, settler]);
let result = context.military.resolveAttackOnTile(context._units_by_user[0], 0, new Coord(1, 1), new Coord(2, 1));
assert.equal(result.cityCaptured, true);
assert.equal(attacker.health, 100, "empty City capture must not damage attacker");
assert.equal(city.team, 0, "captured City must change owner");
assert.equal(context._units_by_user[0].includes(city), true, "captured City must move to new owner's list");
assert.equal(context._units_by_user[1].includes(settler), false, "Settler cannot hide in an empty City");

const garrisonAttacker = makeUnit(2, 0, 2, 1);
const garrisonCity = makeUnit(3, 1, 2, 1, {
    cityPopulation: 3,
    economy: { citizens: [{}, {}, {}] },
});
const garrison = makeUnit(2, 1, 2, 1, { defense: 4, health: 1 });
install(garrisonAttacker, [garrisonCity, garrison]);
result = context.military.resolveAttackOnTile(context._units_by_user[0], 0, new Coord(1, 1), new Coord(2, 1));
assert.equal(result.defenderRemoved, true);
assert.equal(result.cityCaptured, true);
assert.equal(garrisonCity.cityPopulation, 2, "garrison death must reduce City population by one");
assert.equal(garrisonCity.economy.citizens.length, 2);
assert.equal(garrisonCity.team, 0);

const stackedAttacker = makeUnit(2, 0, 2, 1);
const stackedCity = makeUnit(3, 1, 2, 1, {
    cityPopulation: 4,
    economy: { citizens: [{}, {}, {}, {}] },
});
const firstGarrison = makeUnit(2, 1, 2, 1, { defense: 40, health: 1 });
const secondGarrison = makeUnit(2, 1, 2, 1, { defense: 4, health: 100 });
install(stackedAttacker, [stackedCity, firstGarrison, secondGarrison]);
result = context.military.resolveAttackOnTile(
    context._units_by_user[0], 0, new Coord(1, 1), new Coord(2, 1)
);
assert.equal(result.defenderRemoved, true);
assert.equal(result.attackerRetreated, true, "attacker must retreat when another garrison remains");
assert.deepEqual([stackedAttacker.coord.i, stackedAttacker.coord.j], [1, 1]);
assert.equal(stackedCity.team, 1, "a City with another defender must not be captured");
assert.equal(stackedCity.cityPopulation, 3);
assert.equal(context._units_by_user[1].includes(secondGarrison), true);

const fieldAttacker = makeUnit(2, 0, 2, 1);
const fieldDefenderA = makeUnit(2, 1, 2, 1, { defense: 40, health: 1 });
const fieldDefenderB = makeUnit(2, 1, 2, 1, { defense: 4, health: 100 });
install(fieldAttacker, [fieldDefenderA, fieldDefenderB]);
result = context.military.resolveAttackOnTile(
    context._units_by_user[0], 0, new Coord(1, 1), new Coord(2, 1)
);
assert.equal(result.attackerRetreated, true, "stacked field defenders also force retreat");
assert.deepEqual([fieldAttacker.coord.i, fieldAttacker.coord.j], [1, 1]);

console.log("PASS client City capture, stacked-defender retreat, population loss, and Settler removal");

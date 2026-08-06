#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class Coord {
    constructor(i, j) { this.i = i; this.j = j; }
}

const city = {serverId: 10, type: 3, team: 4, health: 100, coord: new Coord(2, 2)};
const damaged = {
    serverId: 11, type: 2, team: 4, can_move: true,
    health: 50, maxHealth: 100, coord: new Coord(2, 2),
};
const healthy = {
    serverId: 12, type: 2, team: 4, can_move: true,
    health: 100, maxHealth: 100, coord: new Coord(2, 2),
};
const elsewhere = {
    serverId: 13, type: 2, team: 4, can_move: true,
    health: 40, maxHealth: 100, coord: new Coord(3, 2),
};
const emptyCity = {serverId: 20, type: 3, team: 4, health: 100, coord: new Coord(4, 4)};
const secondDamaged = {
    serverId: 21, type: 2, team: 4, can_move: true,
    health: 70, maxHealth: 100, coord: new Coord(4, 4),
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
    document: {getElementById() { return null; }},
    window: {location: {replace() {}}},
    _units_by_user: {4: [city, damaged, healthy, elsewhere, emptyCity, secondDamaged]},
    _fulldraw: 0,
};
vm.createContext(context);
vm.runInContext(
    fs.readFileSync("server_game.js", "utf8") + "\nglobalThis.serverGame = _server_game;",
    context,
    {filename: "server_game.js"}
);

(async () => {
    context.serverGame.queueCityHealing(4);
    const actions = context.serverGame.drainTurnActions(4);
    assert.equal(actions.length, 2, "each City containing damaged units should add one batched action");
    assert.equal(actions[0].type, "heal_units");
    assert.equal(actions[0].city_unit_id, 10);
    assert.deepEqual(Array.from(actions[0].unit_ids), [11]);
    assert.equal(actions[1].city_unit_id, 20);
    assert.deepEqual(Array.from(actions[1].unit_ids), [21]);
    assert.equal(damaged.health, 50, "health changes only after the authoritative batched response");
    assert.equal(healthy.health, 100);
    assert.equal(elsewhere.health, 40);
    assert.equal(secondDamaged.health, 70);
    console.log("PASS City healing is collected into the End Turn action batch");
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

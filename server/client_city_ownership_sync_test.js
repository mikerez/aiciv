#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class Coord { constructor(i, j) { this.i = i; this.j = j; } }
class Unit { constructor(type, texture, coord) { this.type = type; this.texture = texture; this.coord = coord; } }

const city = { serverId: 42, serverClientKey: "captured-city", team: 1, type: 3, coord: new Coord(2, 2) };
const context = {
    console,
    Date,
    JSON,
    Math,
    Promise,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Coord,
    Unit,
    _map_size: 1,
    _current_user: 0,
    _selection: -1,
    _units_by_user: { 0: [], 1: [city] },
    _units: [],
    _game_state_by_user: {},
    _map_terrain_bit_by_user: { 0: [[0]] },
    _map_resource_visibility_by_user: { 0: [[false]] },
    _map_terrain_bit: [[0]],
    _city_economy: { ensureCity(unit) { unit.economySynchronized = true; } },
    _military: { updateSelectionAfterRemove() {} },
    _multiplayer: {},
};
vm.createContext(context);
vm.runInContext(
    fs.readFileSync("server_game.js", "utf8") + "\nglobalThis.serverGame = _server_game;",
    context,
    { filename: "server_game.js" }
);

context.serverGame.syncedPlayers[0] = true;
context.serverGame.applyUnitUpdates(0, {
    units: [{
        id: 42,
        client_key: "captured-city",
        owner_id: 0,
        unit_class: 3,
        unit_type_id: "city",
        name: "City",
        texture: 259,
        can_move: false,
        nature: "land",
        i: 2,
        j: 2,
        attack: 0,
        defense: 8,
        speed: 0,
        view_range: 3,
        state: "ready",
        health: 100,
        max_health: 100,
        experience: 1,
        move_penalty: 0,
        properties: { cityPopulation: 2 },
        deleted: false,
    }],
    owned_unit_ids: [42],
    visible_enemy_ids: [],
    visibility: [],
    events: [],
});

assert.equal(context._units_by_user[1].length, 0, "old owner list must lose captured City");
assert.equal(context._units_by_user[0].length, 1, "new owner list must receive captured City");
assert.equal(context._units_by_user[0][0], city, "ownership update must move, not duplicate, City object");
assert.equal(city.team, 0);
assert.equal(city.cityPopulation, 2);
assert.equal(city.economySynchronized, true);
console.log("PASS authoritative City ownership update moves existing client object");

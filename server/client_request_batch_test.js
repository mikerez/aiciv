#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const worker = {
    serverId: 11, serverClientKey: "worker-11", team: 7, type: 1, unitTypeId: "worker",
    can_move: true, speed: 1, health: 80, maxHealth: 100, state: "cottage", coord: {i: 3, j: 3},
};
const city = {
    serverId: 12, serverClientKey: "city-12", team: 7, type: 3, unitTypeId: "city",
    can_move: false, health: 100, maxHealth: 100, state: "ready", coord: {i: 3, j: 3},
    economy: {foodStored: 5},
};
const context = {
    console, Date, JSON, Math, Promise,
    setTimeout, clearTimeout, setInterval, clearInterval,
    document: {getElementById() { return null; }},
    window: {location: {replace() {}}},
    _units_by_user: {7: [worker, city]},
    _units: [worker, city],
    _current_user: 7,
    _game_state_by_user: {7: {money: 100}},
    _city_economy: {processCities() {}},
    _current_game: {applyAutoRoutingRules() {}},
    _fulldraw: 0,
};
vm.createContext(context);
vm.runInContext(
    fs.readFileSync("server_game.js", "utf8") + "\nglobalThis.serverGame = _server_game;",
    context,
    {filename: "server_game.js"}
);

(async function() {
    const game = context.serverGame;
    await game.buildImprovement(worker, "cottage");
    await game.selectProduction(city, "warrior");
    const submission = game.captureTurn(7);
    assert.deepEqual(
        Array.from(submission.actions, action => action.type),
        ["build", "select_production", "heal_units"],
        "construction, production, and healing must share the End Turn batch"
    );

    const requests = [];
    game.request = async function(action, body) {
        requests.push({action, body});
        return {
            ok: true, submitted_turn: 4, resolved_turn: 4, turn: 5, revision: 20,
            unit_id_map: {}, rejected_movements: [], combat_units: [],
            action_results: body.actions.map(item => ({
                client_action_id: item.client_action_id, type: item.type, ok: true,
            })),
        };
    };
    game.applyUnitIdMap = function() {};
    game.applyRejectedMovements = function() {};
    game.applyCombatUnitUpdates = function() {};
    await game.submitTurn(submission, {hidden: true, deferUpdates: true, deferPolling: true});
    assert.equal(requests.length, 1, "one logical turn must make one write request");
    assert.equal(requests[0].action, "make_turn");
    assert.equal(requests[0].body.actions.length, 3);
    assert.equal(worker.pendingImmediateBuild, false);
    console.log("PASS frequent turn actions are aggregated into one make_turn request");
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

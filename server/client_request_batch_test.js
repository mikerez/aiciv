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
const warrior = {
    serverId: 13, serverClientKey: "warrior-13", team: 7, type: 2, unitTypeId: "warrior",
    can_move: true, speed: 1, health: 100, maxHealth: 100, state: "ready", coord: {i: 3, j: 3},
    gotoPath: [{i: 4, j: 3}], gotoCoord: {i: 4, j: 3},
    interactionIntent: "coexist", interactionTargetOwnerId: 8,
};
const context = {
    console, Date, JSON, Math, Promise,
    setTimeout, clearTimeout, setInterval, clearInterval,
    document: {getElementById() { return null; }},
    window: {location: {replace() {}}, alerts: [], alert(message) { this.alerts.push(message); }},
    _units_by_user: {7: [worker, city, warrior]},
    _units: [worker, city, warrior],
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
    game.setRelationPreference(7, 8, "friend");
    await game.buildImprovement(worker, "cottage");
    await game.selectProduction(city, "warrior");
    await game.optimizeCity(city, "gold");
    const submission = game.captureTurn(7);
    assert.equal(submission.relations[8], "friend");
    assert.equal(submission.commands[2].payload.interaction_intent, "coexist");
    assert.equal(submission.commands[2].payload.target_owner_id, 8);
    assert.deepEqual(
        Array.from(submission.actions, action => action.type),
        ["build", "select_production", "optimize_city", "heal_units"],
        "construction, production, and healing must share the End Turn batch"
    );

    const requests = [];
    game.request = async function(action, body) {
        requests.push({action, body});
        return {
            ok: true, submitted_turn: 4, resolved_turn: 4, turn: 5, revision: 20,
            unit_id_map: {}, rejected_movements: [], combat_units: [],
            action_results: body.actions.map(item => ({
                client_action_id: item.client_action_id,
                type: item.type,
                ok: item.type != "build",
                error: item.type == "build" ? {
                    code: "building_not_supported",
                    message: "irrigation cannot be built on this terrain.",
                } : undefined,
            })),
            updates: {},
        };
    };
    game.applyUnitIdMap = function() {};
    game.applyRejectedMovements = function() {};
    game.applyCombatUnitUpdates = function() {};
    const responseOrder = [];
    game.applyCombinedUpdates = async function() {
        responseOrder.push("updates");
        worker.state = "irrigate";
        worker.clientImprovementTurnsLeft = 0;
    };
    const applyTurnActionResults = game.applyTurnActionResults.bind(game);
    game.applyTurnActionResults = function(playerId, actions, results, hidden) {
        responseOrder.push("actions");
        return applyTurnActionResults(playerId, actions, results, hidden);
    };
    await game.submitTurn(submission, {hidden: true, deferUpdates: true, deferPolling: true});
    assert.equal(requests.length, 1, "one logical turn must make one write request");
    assert.equal(requests[0].action, "make_turn");
    assert.equal(requests[0].body.actions.length, 4);
    assert.equal(worker.pendingImmediateBuild, false);
    assert.equal(worker.state, "ready", "a rejected build must not restart from a stale unit snapshot");
    assert.equal(worker.clientImprovementTurnsLeft, undefined);
    assert.deepEqual(responseOrder, ["updates", "actions"], "action outcomes must override the response snapshot");
    worker.state = "irrigate";
    worker.pendingImmediateBuild = true;
    game.applyTurnActionResults(7, [{client_action_id: 99, type: "build", worker_unit_id: 11}], [{
        client_action_id: 99, type: "build", ok: true,
        result: {status: "IMPOSSIBLE", reason: "water_not_connected"},
    }]);
    assert.equal(worker.state, "ready");
    assert.equal(worker.pendingImmediateBuild, false);
    assert.match(context.window.alerts[0], /IMPOSSIBLE: water not connected/);
    await game.disbandUnit(warrior);
    const disbandSubmission = game.captureTurn(7);
    assert.ok(disbandSubmission.actions.some(action => action.type == 'disband_unit' && action.unit_id == 13));
    assert.ok(!disbandSubmission.commands.some(command => command.unit_id == 13),
        'a pending Disband action must not also submit an order for the deleted unit');
    console.log("PASS frequent turn actions are aggregated into one make_turn request");
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

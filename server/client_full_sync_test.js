#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const order = [];
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
    document: { getElementById() { return null; } },
    window: { location: { replace() {} } },
    _map_size: 100,
    _fulldraw: 0,
    _current_user: 7,
    _game_events: {
        async playCombat(event) {
            order.push("animate:" + event.id);
        },
    },
};
vm.createContext(context);
const source = fs.readFileSync("server_game.js", "utf8") + "\nglobalThis.serverGame = _server_game;";
vm.runInContext(source, context, { filename: "server_game.js" });
const game = context.serverGame;

game.request = async function(action) {
    order.push("request:" + action);
    if (action === "load_update") {
        return {
            turn: 2,
            revision: 9,
            last_event_id: 44,
            civilizations: [],
            events: [{ id: 44, message: "attack", payload: { combat_kind: "unit_attack" } }],
            units: [],
            tiles: [],
        };
    }
    throw new Error("unexpected action " + action);
};
game.applyUnitUpdates = function(playerId, result) {
    assert.equal(result.events.length, 0, "bundled legacy events must not replay");
    order.push("apply:units");
};
game.applyLandscapeUpdates = function() { order.push("apply:landscape"); };
game.finishAwaitingTurn = function() {};
game.updateCivilizations = function() {};
game.log = function() {};

(async function() {
    await game.loadUpdates(7);
    assert.deepEqual(order, [
        "request:load_update",
        "animate:44",
        "apply:units",
        "apply:landscape",
    ]);
    assert.equal(game.eventIdByPlayer[7], 44);
    order.length = 0;
    await game.applyCombinedUpdates(7, {
        turn: 2, revision: 8, last_event_id: 44, civilizations: [],
        events: [{ id: 44, message: "attack", payload: { combat_kind: "unit_attack" } }],
        units: [], tiles: [],
    });
    assert.deepEqual(order, [],
        "an older concurrent response must neither replay an event nor apply its stale snapshot");
    assert.equal(game.unitRevisionByPlayer[7], 9,
        "a late response must not move the client revision cursor backward");
    let currentWindowReloads = 0;
    game.loadUpdates = async function(playerId, options) {
        ++currentWindowReloads;
        assert.equal(playerId, 7);
        assert.equal(options.retryMapWindow, false,
            "stale-window recovery must retry only once");
        return {current_window: true};
    };
    const recovered = await game.applyCombinedUpdates(7, {
        map_origin: {i: 10, j: 0}, turn: 3, revision: 10,
        last_event_id: 44, civilizations: [], events: [], units: [], tiles: [],
    });
    assert.equal(currentWindowReloads, 1,
        "a bundled turn snapshot for an old map window must trigger a current-window reload");
    assert.equal(recovered.current_window, true);
    console.log("PASS combined updates deduplicate events and reject out-of-order snapshots");
})().catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});

#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const elements = {
    endTurnButton: { textContent: "End Turn (5s)", disabled: false },
};
let labelUpdates = 0;
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
    document: { getElementById: (id) => elements[id] || null },
    _current_user: 7,
    _turn_in_progress: 0,
    _multiplayer: {
        updateTurnLabel: (remaining) => {
            labelUpdates++;
            elements.endTurnButton.textContent = `End Turn (${remaining}s)`;
        },
    },
};
vm.createContext(context);
const source = fs.readFileSync("server_game.js", "utf8") + "\nglobalThis.serverGame = _server_game;";
vm.runInContext(source, context, { filename: "server_game.js" });
const game = context.serverGame;

game.updateServerClock({
    turn: 1,
    deadline_at: new Date(Date.now() + 1000 * 1000).toISOString(),
    turn_seconds_remaining: 4,
});
assert.ok(game.deadlineAt - Date.now() <= 4000, "server remaining seconds must override an invalid long deadline");
game.updateServerClock({
    turn: 1,
    deadline_at: new Date(Date.now() + 1000 * 1000).toISOString(),
});
assert.ok(game.deadlineAt - Date.now() <= 5000, "ISO fallback must be clamped to one client turn");

game.awaitingTurnByPlayer[7] = 12;
game.startTurnTimer(7, false);
assert.notEqual(game.timerId, null, "waiting countdown must run after End Turn");
assert.equal(game.timerMode, "waiting");
assert.equal(elements.endTurnButton.disabled, true);
assert.equal(elements.endTurnButton.textContent, "Waiting (5s)");

assert.equal(game.finishAwaitingTurn(7, 12), false, "same authoritative turn must remain waiting");
assert.equal(game.isAwaitingResolution(7), true);
assert.equal(game.finishAwaitingTurn(7, 13), true, "higher authoritative turn must release waiting state");
assert.equal(game.isAwaitingResolution(7), false);
assert.notEqual(game.timerId, null, "next authoritative turn must start a new countdown");
assert.equal(game.timerMode, "turn");
assert.equal(elements.endTurnButton.disabled, false);
assert.ok(labelUpdates >= 1);

game.stopTurnTimer();

// A response can resolve while endTurn() is still awaiting its request chain.
// The waiting timer must be released so endTurn()'s finally block can start the
// next countdown; it must never run again with a deleted pending-turn value.
context._turn_in_progress = 1;
game.awaitingTurnByPlayer[7] = 20;
game.startAwaitingCountdown(7);
assert.equal(game.finishAwaitingTurn(7, 21), true);
assert.equal(game.timerId, null, "resolved waiting timer must release timerId");
assert.equal(game.timerMode, null);
assert.equal(game.deadlineAt, null, "next turn must receive a fresh deadline");
assert.equal(elements.endTurnButton.textContent.includes("NaN"), false);
context._turn_in_progress = 0;
game.startTurnTimer(7, false);
assert.equal(game.timerMode, "turn");
assert.notEqual(game.timerId, null);
game.stopTurnTimer();
console.log("PASS client End Turn recharges to 5s without duplicate submission");

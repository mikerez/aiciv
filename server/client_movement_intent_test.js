#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function classMethod(source, name) {
    const start = source.indexOf("    " + name + "(");
    assert.ok(start >= 0, "missing class method " + name);
    const brace = source.indexOf("{", start);
    let depth = 0;
    for (let index = brace; index < source.length; index++) {
        if (source[index] === "{") depth++;
        if (source[index] === "}" && --depth === 0) return source.slice(start, index + 1);
    }
    throw new Error("unterminated class method " + name);
}

const source = fs.readFileSync("game_prehistory.js", "utf8");
let relation = "neutral";
let answer = false;
let prompts = 0;
const moving = {team: 7, type: 2, health: 100, coord: {i: 1, j: 1}};
const foreign = {team: 8, type: 2, health: 100, coord: {i: 2, j: 1}, serverVisibilityByUser: {7: true}};
const context = {
    _units: [moving],
    _units_by_user: {7: [moving], 8: [foreign]},
    _current_user: 7,
    _server_game: {
        directionalRelation() { return relation; },
        saveClientRoutes() {},
    },
    _military: {isMilitary(unit) { return unit.type === 2; }},
    window: {confirm() { prompts++; return answer; }},
};
vm.createContext(context);
vm.runInContext(
    "globalThis.rules = new class {" +
    classMethod(source, "visibleForeignOwnersAt") +
    classMethod(source, "movementRelation") +
    classMethod(source, "configureMovementIntent") +
    "};",
    context
);

relation = "friend";
context.rules.configureMovementIntent(0, {i: 2, j: 1});
assert.equal(moving.interactionIntent, "coexist");
assert.equal(prompts, 0, "friendly-only destination must not prompt");

relation = "neutral";
answer = false;
context.rules.configureMovementIntent(0, {i: 2, j: 1});
assert.equal(moving.interactionIntent, "coexist");
assert.equal(prompts, 1, "neutral military destination must prompt once");

answer = true;
context.rules.configureMovementIntent(0, {i: 2, j: 1});
assert.equal(moving.interactionIntent, "attack");
assert.equal(moving.interactionTargetOwnerId, 8);

relation = "enemy";
context.rules.configureMovementIntent(0, {i: 2, j: 1});
assert.equal(moving.interactionIntent, "attack");
assert.equal(prompts, 2, "enemy destination attacks without another prompt");

console.log("PASS movement destinations preserve explicit attack or coexist intent");

#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const screen = fs.readFileSync("screen.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");
const menu = fs.readFileSync("menu_unit.js", "utf8");

assert.match(screen, /radiusX\s*=\s*79\/_screenZoom/);
assert.match(screen, /radiusY\s*=\s*55\/_screenZoom/);
assert.match(index, /event\.code\s*===\s*'Escape'[\s\S]*?_selection\s*=\s*-1/);
assert.match(index, /event\.code\s*===\s*'Escape'[\s\S]*?_multi_selection\s*=\s*\[\]/);
assert.match(menu, /command\.indexOf\('produce_unit:'\)\s*!=\s*0/);

console.log("PASS selection size, Escape clearing, and persistent phone production menu");

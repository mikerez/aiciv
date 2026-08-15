#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Coord {
    constructor(i, j) { this.i = i; this.j = j; }
    add(i, j) { return new Coord(this.i + i, this.j + j); }
}
class UnitType {
    constructor(id, name, unitClass, texture, attack, defense, speed, viewRange) {
        Object.assign(this, {id, name, unitClass, texture, attack, defense, speed, viewRange});
    }
}
class Unit {
    constructor(type, texture, coord) {
        this.type = type && type.unitClass != undefined ? type.unitClass : type;
        this.texture = texture;
        this.coord = coord;
    }
}
class CityProperties { constructor(productionPerTurn) { this.productionPerTurn = productionPerTurn; } }

const size = 20;
const visibility = Array.from({length: size}, () => Array(size).fill(0x4500));
const patrol = {
    team: 1, type: 2, unitTypeId: 'warrior', can_move: true, state: 'patrol',
    coord: new Coord(5, 5), gotoPath: [], gotoCoord: null,
};
const enemy = {
    team: 2, type: 2, unitTypeId: 'warrior', can_move: true, state: 'ready', health: 100,
    coord: new Coord(8, 5), gotoPath: [], gotoCoord: null,
};
const sandbox = {
    console, Math, Coord, UnitType, Unit, CityProperties,
    _screen: {loadTexture() {}},
    _units: [patrol], _units_by_user: {1: [patrol], 2: [enemy]},
    _map_size: size, _map_terrain_bit: visibility,
    _map_terrain_tex: Array.from({length: size}, () => Array(size).fill(2)),
    _map_resource: Array.from({length: size}, () => Array.from({length: size}, () => ({type: 0, hidden: true}))),
    _map: {},
    _game_state: {isTechnologyOpen() { return true; }},
    _game: {random_point() { return new Coord(6, 6); }},
    _military: {isAtWar(a, b) { return (a == 1 && b == 2) || (a == 2 && b == 1); }},
    _control: {
        mapLine(si, sj, ti, tj, callback) {
            let i = si, j = sj;
            while (i != ti || j != tj) {
                const ni = i + Math.sign(ti - i);
                const nj = j + Math.sign(tj - j);
                callback(i, j, ni, nj, 0);
                i = ni; j = nj;
            }
        },
    },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('vocabulary_EN.js', 'utf8'), sandbox);
vm.runInContext(fs.readFileSync('vocabulary.js', 'utf8'), sandbox);
vm.runInContext(fs.readFileSync('economics.js', 'utf8') + '\nglobalThis.economics = _economics;', sandbox);
vm.runInContext(fs.readFileSync('game_prehistory.js', 'utf8') + '\nglobalThis.layer = _game_prehistory;', sandbox);
sandbox.layer.autoRoutePatrol(0);
assert.ok(patrol.gotoPath.length > 0, 'Patrol must route to a visible enemy');
assert.deepEqual(
    {i: patrol.gotoCoord.i, j: patrol.gotoCoord.j},
    {i: enemy.coord.i, j: enemy.coord.j},
    'Patrol route must end on the nearest visible wartime enemy',
);
console.log('PASS Patrol targets the nearest visible enemy at war');

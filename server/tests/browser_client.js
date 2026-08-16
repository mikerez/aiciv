#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
let createPipeFetch = function() {
    return async function() {
        throw new Error('The PHP test pipe transport is not available in this runtime.');
    };
};
try {
    ({createPipeFetch} = require('./test_client'));
}
catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
}

const root = path.resolve(__dirname, '../..');

class Coord {
    constructor(i, j) { this.i = i; this.j = j; }
    add(i, j) { return new Coord(this.i + i, this.j + j); }
}

class UnitType {
    constructor(id, name, type, texture, attack, defense, speed, viewRange,
        technologyRequired, productionCost, resourceRequired, canMove = true, nature = 'land') {
        Object.assign(this, {id, name, type, texture, attack, defense, speed, viewRange,
            technologyRequired, productionCost, resourceRequired, canMove, nature});
    }
}

class Unit {
    constructor(type, texture, coord = new Coord(0, 0)) {
        if (type instanceof UnitType) {
            Object.assign(this, {
                type: type.type, unitTypeId: type.id, name: type.name, texture: type.texture,
                attack: type.attack, defense: type.defense, speed: type.speed,
                viewRange: type.viewRange, can_move: type.canMove, nature: type.nature,
            });
        } else {
            Object.assign(this, {type, texture, can_move: true});
        }
        this.coord = coord;
        this.gotoCoord = null;
        this.gotoPath = [];
        this.pendingServerPath = [];
        this.move_penalty = 0;
        this.health = 100;
        this.maxHealth = 100;
        this.experience = 1;
    }
}

class CityProperties {
    constructor(productionPerTurn = 5) {
        this.productionPerTurn = productionPerTurn;
        this.productionStored = 0;
    }
}

class CityProductionState {
    constructor(unitTypeId) {
        this.unitTypeId = unitTypeId;
        this.productionPoints = 0;
    }
}

class GameState {
    constructor() {
        this.openTechnologies = {};
        this.technologyProgress = {};
        this.currentResearch = null;
        this.scienceRate = 100;
        this.money = 0;
        this.food = 200;
        this.lastMoneyIncome = 0;
        this.lastScienceIncome = 0;
    }
    grantAllTechnologies() {
        for (const name of ['Mining', 'Pottery', 'Animal Husbandry', 'Sailing', 'Masonry',
            'Bronze Working', 'Irrigation', 'Writing', 'Archery', 'Wheel', 'Construction']) {
            this.openTechnologies[name] = true;
        }
    }
    isTechnologyOpen(name) { return this.openTechnologies[name] === true; }
    canResearch(name) {
        if (!technologyTable[name] || this.isTechnologyOpen(name)) return false;
        return technologyTable[name].required.every(required => this.isTechnologyOpen(required));
    }
    setResearch(name) {
        if (!this.canResearch(name)) return false;
        this.currentResearch = name;
        return true;
    }
    setScienceRate(percent) { this.scienceRate = Math.max(0, Math.min(100, Number(percent) || 0)); }
    technologyCost(name) { return technologyTable[name] ? technologyTable[name].cost : 1; }
    technologyProgressValue(name) { return Number(this.technologyProgress[name] || 0); }
}

const technologyTable = {
    Mining: {required: [], cost: 20}, Pottery: {required: [], cost: 20},
    'Animal Husbandry': {required: [], cost: 20}, Sailing: {required: [], cost: 20},
    Irrigation: {required: ['Pottery'], cost: 30}, Masonry: {required: ['Mining'], cost: 30},
    Archery: {required: [], cost: 25}, 'Bronze Working': {required: ['Mining'], cost: 35},
    Wheel: {required: ['Animal Husbandry'], cost: 30}, Construction: {required: ['Masonry'], cost: 45},
    Engineering: {required: ['Construction'], cost: 60}, 'Iron Working': {required: ['Bronze Working'], cost: 50},
    'Horseback Riding': {required: ['Animal Husbandry'], cost: 45},
    Writing: {required: ['Pottery'], cost: 30}, Mathematics: {required: ['Writing'], cost: 45},
    Shipbuilding: {required: ['Sailing'], cost: 45}, Navigation: {required: ['Shipbuilding'], cost: 60},
    Astronomy: {required: ['Navigation'], cost: 80}, Currency: {required: ['Writing'], cost: 45},
};

function matrix(size, create) {
    return Array.from({length: size}, (_, i) =>
        Array.from({length: size}, (_, j) => create(i, j)));
}

function evaluate(context, filename, exportExpression) {
    const source = fs.readFileSync(path.join(root, filename), 'utf8');
    vm.runInContext(source + (exportExpression || ''), context, {filename});
}

function createBrowserClient({size, playerId, gameId, tiles, units, unitsByUser = null,
    technologies = null, relations = {}, serverTurn = 0}) {
    const terrain = matrix(size, () => 2);
    const bits = matrix(size, () => 0x45ff);
    const resources = matrix(size, () => ({type: 0, hidden: false}));
    const modifiers = matrix(size, () => ({}));
    for (const mapTile of tiles) {
        terrain[mapTile.i][mapTile.j] = mapTile.terrain_tex;
        bits[mapTile.i][mapTile.j] = mapTile.terrain_bits || 0x45ff;
        resources[mapTile.i][mapTile.j] = {type: mapTile.resource_type || 0, hidden: false};
        modifiers[mapTile.i][mapTile.j] = Object.assign({}, mapTile.modifiers || {});
    }

    const storage = {};
    const groupedUnits = unitsByUser || units.reduce((result, item) => {
        const owner = item.team === undefined ? playerId : item.team;
        if (!result[owner]) result[owner] = [];
        result[owner].push(item);
        return result;
    }, {});
    if (!groupedUnits[playerId]) groupedUnits[playerId] = [];
    const ownUnits = groupedUnits[playerId];
    const context = {
        console, Date, JSON, Math, Promise, Object, Array, Number, String, Boolean, process,
        setTimeout, clearTimeout, setInterval, clearInterval,
        fetch: createPipeFetch(),
        Coord, Unit, UnitType, CityProperties, CityProductionState, GameState,
        _map_size: size,
        _map_terrain_tex: terrain,
        _map_terrain_bit: bits,
        _map_resource: resources,
        _map_terrain_mod: modifiers,
        _map_terrain_bit_by_user: {[playerId]: bits},
        _map_resource_visibility_by_user: {[playerId]: matrix(size, () => true)},
        _units: ownUnits,
        _units_by_user: groupedUnits,
        _game_state: new GameState(),
        _game_state_by_user: {},
        _current_user: playerId,
        _authenticated_player_id: playerId,
        _selection: -1,
        _multi_selection: [],
        _selection_by_user: {},
        _fulldraw: 0,
        _one_turn_message: '',
        _screen: {loadTexture() {}, drawSprite() {}},
        _draw: {clear() { return {}; }, drawArrow() {}},
        _technology_table: technologyTable,
        _city_economy: {
            queueServerGrowthRequests() {},
            ensureCity(city) {
                const population = Math.max(1, Number(city.cityPopulation
                    || (city.economy && city.economy.citizens && city.economy.citizens.length) || 1));
                if (!city.economy) city.economy = {};
                if (!Array.isArray(city.economy.citizens)) {
                    city.economy.citizens = Array.from({length: population}, () => ({coord: city.coord}));
                }
                if (!city.economy.lastIncome) {
                    const production = Number(city.cityProperties && city.cityProperties.productionPerTurn) || 5;
                    city.economy.lastIncome = {food: population + 2, production, money: 2};
                }
                if (city.economy.foodStored === undefined) city.economy.foodStored = Number(city.cityFoodStored || 0);
                return city.economy;
            },
        },
        _multiplayer: {
            cloneVisibilityFrom(source) { return source.map(row => row.slice()); },
            clearVisibility() {},
            createResourceVisibility() { return matrix(size, () => true); },
            updateTurnLabel() {},
            isResourceVisible(i, j, userId) {
                if (userId === undefined || userId === null) userId = context._current_user;
                return !!(context._map_resource_visibility_by_user[userId]
                    && context._map_resource_visibility_by_user[userId][i]
                    && context._map_resource_visibility_by_user[userId][i][j]);
            },
        },
        _military: {
            isAtWar(a, b) { return relations[a] && relations[a][b] === 'enemy'; },
            relationBetween(a, b) { return a === b ? 'self' : ((relations[a] && relations[a][b]) || 'neutral'); },
            isMilitary(unit) { return unit.type === 2; },
        },
        _unit_stack_menu: {refresh() {}, hide() {}},
        document: {getElementById() { return null; }},
        window: {alert() {}, confirm() { return false; }, location: {replace() {}}},
        localStorage: {
            getItem(key) { return storage[key] || null; },
            setItem(key, value) { storage[key] = String(value); },
            removeItem(key) { delete storage[key]; },
        },
        ijtox() { return 0; }, ijtoy() { return 0; }, x1toX(value) { return value; },
        y1toY(value) { return value; }, ijtox1() { return 0; }, ijtoy1() { return 0; },
        clearGameSelection() {}, appendConsoleLog() {},
    };
    if (technologies === null) context._game_state.grantAllTechnologies();
    else for (const name of technologies) context._game_state.openTechnologies[name] = true;
    context._game_state_by_user[playerId] = context._game_state;
    vm.createContext(context);
    evaluate(context, 'vocabulary_EN.js');
    evaluate(context, 'vocabulary.js');
    evaluate(context, 'economics.js', '\nglobalThis.economics = _economics;');
    context.economics.updateCounters = function() {};
    context.economics.registerTerrainImprovement = function() {};
    context.economics.removeTerrainImprovementUnitsAt = function() {};
    evaluate(context, 'map.js', '\nglobalThis.gameMap = _map;');
    evaluate(context, 'control.js', '\nglobalThis.control = _control;');
    evaluate(context, 'game_prehistory.js', '\nglobalThis.currentGame = _game_prehistory;');
    context._game = context.currentGame;
    context._current_game = context.currentGame;
    context.currentGame.random_point = function(_terrain, min, max) {
        return new Coord(Math.floor((min.i + max.i) / 2), Math.floor((min.j + max.j) / 2));
    };
    evaluate(context, 'server_game.js', '\nglobalThis.serverGame = _server_game;');
    context._server_game = context.serverGame;
    context.serverGame.endpoint = 'pipe://server_game.php';
    context.serverGame.gameId = gameId;
    context.serverGame.serverTurn = Number(serverTurn) || 0;
    context.serverGame.initialized = true;
    context.serverGame.hiddenActions = true;
    context.serverGame.reportClientError = async function() { return null; };
    context.serverGame.log = function() {};
    return context;
}

function exactArrayBuffer(buffer) {
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function loadAiModels(context, modelDirectory = path.join(root, 'ai_player')) {
    evaluate(context, 'ai.js', '\nglobalThis.aiPlayer = _ai_player;');
    for (const kind of ['strategy', 'action', 'economics']) {
        const compressed = fs.readFileSync(path.join(modelDirectory, kind + '.db.gz'));
        const raw = zlib.gunzipSync(compressed);
        const model = context.aiPlayer.parseModel(kind, kind + '.db', exactArrayBuffer(raw));
        context.aiPlayer.models[kind] = model;
    }
    context.aiPlayer.defaultModelsLoaded = true;
    context.aiPlayer.ensureDefaultModelsLoaded = async function() { return true; };
    return context.aiPlayer;
}

function localUnit(definition, serverId) {
    const result = new Unit(definition.unit_class, definition.texture, new Coord(definition.i, definition.j));
    Object.assign(result, {
        serverId,
        serverClientKey: definition.client_key,
        team: definition.owner_id,
        unitTypeId: definition.unit_type_id,
        name: definition.name,
        can_move: definition.can_move,
        nature: definition.nature,
        attack: definition.attack,
        defense: definition.defense,
        speed: definition.speed,
        viewRange: definition.view_range,
        state: definition.state,
        health: definition.health,
        maxHealth: definition.max_health,
        experience: definition.experience,
    }, definition.properties || {});
    return result;
}

async function runClientTurn(context) {
    const submission = context.serverGame.captureTurn(context._current_user);
    const result = await context.serverGame.submitTurn(submission, {
        hidden: true,
        deferUpdates: true,
        deferPolling: true,
    });
    return {submission, result};
}

module.exports = {Coord, Unit, createBrowserClient, loadAiModels, localUnit, runClientTurn};

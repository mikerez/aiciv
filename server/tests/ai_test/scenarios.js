'use strict';

const {tile, unit, city} = require('../test_client');

const PLAYER_ID = 8301;
const ENEMY_ID = 8302;
const SIZE = 14;

function map(terrain = 2, size = SIZE) {
    const tiles = [];
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            tiles.push(tile(i, j, terrain));
        }
    }
    return tiles;
}

function at(tiles, i, j, terrainType, options = {}) {
    const target = tiles.find(item => item.i === i && item.j === j);
    Object.assign(target, tile(i, j, terrainType, options));
    return target;
}

const unitSpecs = {
    settlers: {unit_class: 0, name: 'Settlers', texture: 256, attack: 0, defense: 1, speed: 1, view_range: 2},
    worker: {unit_class: 1, name: 'Worker', texture: 270, attack: 0, defense: 1, speed: 1, view_range: 2},
    explorer: {unit_class: 1, name: 'Explorer', texture: 257, attack: 0, defense: 1, speed: 2, view_range: 4},
    warrior: {unit_class: 2, name: 'Warrior', texture: 258, attack: 2, defense: 1, speed: 1, view_range: 2},
    slinger: {unit_class: 2, name: 'Slinger', texture: 260, attack: 2, defense: 1, speed: 1, view_range: 2},
    archer: {unit_class: 2, name: 'Archer', texture: 261, attack: 3, defense: 1, speed: 1, view_range: 2},
};

function gameUnit(id, owner, i, j, suffix = id) {
    return unit(Object.assign({
        client_key: `${owner}-${suffix}`,
        owner_id: owner,
        unit_type_id: id,
        i, j,
    }, unitSpecs[id]));
}

function gameCity(owner, i, j, suffix, population = 3, production = 6) {
    return city({
        client_key: `${owner}-city-${suffix}`,
        owner_id: owner,
        i, j,
        properties: {
            cityPopulation: population,
            cityFoodStored: 20,
            cityProperties: {productionPerTurn: production, productionStored: 0},
            production: null,
            productionQueue: [],
            productionDisabled: false,
            economy: {
                citizens: Array.from({length: population}, () => ({coord: {i, j}})),
                foodStored: 20,
                lastIncome: {food: population + 2, production, money: 2},
            },
        },
    });
}

function base(name, turns, opinion) {
    return {
        name, turns, opinion, size: SIZE, playerId: PLAYER_ID, enemyId: ENEMY_ID,
        technologies: [], relations: {}, money: 100, food: 300,
    };
}

function scenarios(variant = 0) {
    const shift = variant % 2;
    const result = [];

    {
        const s = base('found_first_city', 10,
            'A Settler already standing on supported grass with fresh water and food must found the first City within ten turns.');
        s.tiles = map();
        at(s.tiles, 6, 6, 2, {waterSource: true, resourceType: 7});
        at(s.tiles, 6, 7, 7, {waterSource: true});
        s.units = [gameUnit('settlers', PLAYER_ID, 6, 6, `settler-${variant}`)];
        s.expect = {cityMin: 1, cityBy: 10, cityTarget: {i: 6, j: 6}};
        result.push(s);
    }
    {
        const s = base('expand_to_second_city', 16,
            'A safe civilization with one City and an active Settler on a strong, spaced plot should reach two Cities.');
        s.tiles = map();
        at(s.tiles, 9, 9, 2, {waterSource: true, resourceType: 10});
        at(s.tiles, 9, 10, 7, {waterSource: true});
        s.units = [gameCity(PLAYER_ID, 3, 3, 'capital'), gameUnit('warrior', PLAYER_ID, 3, 3, 'guard'),
            gameUnit('settlers', PLAYER_ID, 9, 9, `expander-${variant}`)];
        s.expect = {cityMin: 2, cityBy: 16, cityTarget: {i: 9, j: 9}};
        result.push(s);
    }
    {
        const s = base('produce_first_military', 28,
            'An undefended City must select and complete a basic military unit before adding more exploration units.');
        s.tiles = map();
        at(s.tiles, 5, 5, 4, {waterSource: true});
        s.units = [gameCity(PLAYER_ID, 5, 5, 'undefended', 4, 8), gameUnit('explorer', PLAYER_ID, 6, 5, 'only-scout')];
        s.expect = {productionSelectedBy: 3, militaryMin: 1, militaryBy: 28};
        result.push(s);
    }
    {
        const s = base('worker_improves_cattle', 16,
            'A Worker near an owned City should move to opened cattle and complete the matching Pasture.');
        s.technologies = ['Animal Husbandry'];
        s.tiles = map();
        at(s.tiles, 6, 6, 2, {resourceType: 2});
        s.units = [gameCity(PLAYER_ID, 4, 4, 'pasture'), gameUnit('worker', PLAYER_ID, 5, 6, `pasture-worker-${variant}`),
            gameUnit('warrior', PLAYER_ID, 4, 4, 'pasture-guard')];
        s.revealedResources = [{i: 6, j: 6}];
        s.expect = {modifier: {i: 6, j: 6, name: 'pasture'}, improvementBy: 16};
        result.push(s);
    }
    {
        const s = base('worker_improves_copper_hill', 16,
            'A Worker with Mining available should move to a nearby copper hill and complete a Mine.');
        s.technologies = ['Mining'];
        s.tiles = map();
        at(s.tiles, 7, 6, 4, {resourceType: 3});
        s.units = [gameCity(PLAYER_ID, 5, 5, 'mine'), gameUnit('worker', PLAYER_ID, 6, 6, `mine-worker-${variant}`),
            gameUnit('warrior', PLAYER_ID, 5, 5, 'mine-guard')];
        s.revealedResources = [{i: 7, j: 6}];
        s.expect = {modifier: {i: 7, j: 6, name: 'mine'}, improvementBy: 16};
        result.push(s);
    }
    {
        const s = base('worker_builds_irrigation', 14,
            'A Worker on grass next to a fresh-water Tile should finish Irrigation instead of wandering away.');
        s.technologies = ['Pottery', 'Irrigation'];
        s.tiles = map();
        at(s.tiles, 6, 6, 2);
        at(s.tiles, 6, 7, 7, {waterSource: true});
        s.units = [gameCity(PLAYER_ID, 4, 5, 'irrigation'), gameUnit('worker', PLAYER_ID, 6, 6, `irrigation-worker-${variant}`),
            gameUnit('warrior', PLAYER_ID, 4, 5, 'irrigation-guard')];
        s.expect = {modifier: {i: 6, j: 6, name: 'irrigation'}, improvementBy: 14};
        result.push(s);
    }
    {
        const s = base('attack_adjacent_enemy', 6,
            'A military unit at war with an adjacent visible enemy should attack before waiting or changing position.');
        s.tiles = map();
        s.relations = {[PLAYER_ID]: {[ENEMY_ID]: 'enemy'}, [ENEMY_ID]: {[PLAYER_ID]: 'enemy'}};
        s.units = [gameCity(PLAYER_ID, 4, 4, 'attack'), gameUnit('warrior', PLAYER_ID, 6, 6, `attacker-${variant}`),
            gameUnit('warrior', ENEMY_ID, 7, 6, `defender-${variant}`)];
        s.expect = {enemyDamageBy: 6, attackBy: 3};
        result.push(s);
    }
    {
        const s = base('defend_frontier_city', 12,
            'A lone City defender facing nearby enemy force should remain within one Tile of its City until reinforced or attacked.');
        s.tiles = map();
        s.relations = {[PLAYER_ID]: {[ENEMY_ID]: 'enemy'}, [ENEMY_ID]: {[PLAYER_ID]: 'enemy'}};
        s.units = [gameCity(PLAYER_ID, 6, 6, 'frontier', 4, 7), gameUnit('archer', PLAYER_ID, 6, 6, `city-archer-${variant}`),
            gameUnit('warrior', ENEMY_ID, 9, 6, `city-threat-${variant}`)];
        s.expect = {defend: {i: 6, j: 6, radius: 1}, defendTurns: 12};
        result.push(s);
    }
    {
        const s = base('hold_defensive_hill', 10,
            'A ranged or infantry defender already on a hill should exploit its landscape defense while a non-adjacent enemy approaches.');
        s.tiles = map();
        at(s.tiles, 6, 6, 4);
        s.relations = {[PLAYER_ID]: {[ENEMY_ID]: 'enemy'}, [ENEMY_ID]: {[PLAYER_ID]: 'enemy'}};
        s.units = [gameCity(PLAYER_ID, 4, 4, 'hill'), gameUnit('archer', PLAYER_ID, 6, 6, `hill-archer-${variant}`),
            gameUnit('warrior', ENEMY_ID, 9, 6, `hill-threat-${variant}`)];
        s.expect = {hold: {i: 6, j: 6}, holdTurns: 4};
        result.push(s);
    }
    {
        const s = base('developed_civilization_at_war', 32,
            'A developed wartime civilization should expand, improve resources, maintain military production, and engage a visible enemy.');
        s.technologies = ['Mining', 'Pottery', 'Animal Husbandry', 'Irrigation', 'Masonry', 'Archery', 'Bronze Working'];
        s.tiles = map();
        at(s.tiles, 3, 3, 4, {waterSource: true});
        at(s.tiles, 7, 3, 4, {waterSource: true});
        at(s.tiles, 8, 8, 2, {waterSource: true, resourceType: 10});
        at(s.tiles, 5, 7, 4, {resourceType: 3});
        at(s.tiles, 4, 7, 2, {resourceType: 2});
        s.relations = {[PLAYER_ID]: {[ENEMY_ID]: 'enemy'}, [ENEMY_ID]: {[PLAYER_ID]: 'enemy'}};
        s.units = [gameCity(PLAYER_ID, 3, 3, 'developed-a', 5, 8), gameCity(PLAYER_ID, 7, 3, 'developed-b', 4, 7),
            gameUnit('settlers', PLAYER_ID, 8, 8, `developed-settler-${variant}`),
            gameUnit('worker', PLAYER_ID, 5, 6, `developed-worker-${variant}`),
            gameUnit('warrior', PLAYER_ID, 7, 7, `developed-warrior-${variant}`),
            gameUnit('slinger', PLAYER_ID, 6, 7, `developed-slinger-${variant}`),
            gameUnit('warrior', ENEMY_ID, 9, 7, `developed-enemy-a-${variant}`),
            gameUnit('warrior', ENEMY_ID, 10, 8, `developed-enemy-b-${variant}`)];
        s.expect = {cityMin: 3, militaryMin: 3, anyImprovement: true, enemyDamageBy: 32};
        result.push(s);
    }
    return result.map((scenario, index) => {
        if (shift && index % 2 && scenario.tiles) {
            at(scenario.tiles, 2 + index % 5, 10 - index % 4, index % 3 === 0 ? 6 : 4);
        }
        return scenario;
    });
}

function developmentScenario(variant = 0) {
    const size = 20;
    const s = base(`long_development_${variant}`, 120,
        'A civilization starting with one Settler and Explorers must compound into three well-spaced Cities, military, Workers, improvements, and broad exploration.');
    s.size = size;
    s.technologies = ['Mining', 'Pottery', 'Animal Husbandry', 'Irrigation', 'Masonry',
        'Archery', 'Bronze Working', 'Wheel', 'Construction'];
    s.tiles = map(2, size);
    for (let i = 0; i < size; i++) {
        at(s.tiles, i, 0, 0, {depth: 2});
        at(s.tiles, i, size - 1, 0, {depth: 2});
        at(s.tiles, 0, i, 0, {depth: 2});
        at(s.tiles, size - 1, i, 0, {depth: 2});
    }
    for (const [i, j] of [[7, 8], [8, 8], [12, 11], [13, 11], [14, 10]]) {
        at(s.tiles, i, j, 6);
    }
    at(s.tiles, 10, 10, 2, {waterSource: true, resourceType: 7});
    at(s.tiles, 10, 11, 7, {waterSource: true});
    at(s.tiles, 4, 4, 2, {waterSource: true, resourceType: 2});
    at(s.tiles, 4, 5, 7, {waterSource: true});
    at(s.tiles, 15, 15, 2, {waterSource: true, resourceType: 10});
    at(s.tiles, 15, 14, 7, {waterSource: true});
    at(s.tiles, 8, 10, 4, {resourceType: 3});
    at(s.tiles, 13, 14, 4, {resourceType: 9});
    s.units = [
        gameUnit('settlers', PLAYER_ID, 10, 10, `long-settler-${variant}`),
        gameUnit('explorer', PLAYER_ID, 10, 10, `long-explorer-a-${variant}`),
        gameUnit('explorer', PLAYER_ID, 10, 10, `long-explorer-b-${variant}`),
    ];
    s.revealedResources = [
        {i: 10, j: 10}, {i: 4, j: 4}, {i: 15, j: 15}, {i: 8, j: 10}, {i: 13, j: 14},
    ];
    s.money = 100;
    s.food = 500;
    s.expect = {
        cityMin: 3,
        cityBy: 90,
        militaryMin: 3,
        militaryBy: 120,
        workersMin: 2,
        workersBy: 100,
        improvementsMin: 3,
        exploredMin: 180,
        goodCitySites: true,
        minimumCitySpacing: 5,
    };
    return s;
}

module.exports = {PLAYER_ID, ENEMY_ID, SIZE, scenarios, developmentScenario};

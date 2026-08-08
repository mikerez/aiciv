const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

class Coord {
    constructor(i, j) {
        this.i = i;
        this.j = j;
    }
}

const context = {
    console,
    Float32Array,
    Uint8Array,
    ArrayBuffer,
    DataView,
    Math,
    Coord,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('ai.js', 'utf8') + '\nthis.__ai_player = _ai_player;', context);

const ai = context.__ai_player;

function emptyGrid(size, value) {
    return Array.from({ length: size }, () => Array.from({ length: size }, () => value));
}

function setupMap() {
    const size = 7;
    context._map_size = size;
    context._current_user = 0;
    context._map_terrain_tex = emptyGrid(size, 2);
    context._map_resource = emptyGrid(size, null);
    context._resource_types = [
        null,
        { id: 'wheat', gives: 'food wheat' },
        { id: 'stone', gives: 'production stone' },
    ];
    context._map = {
        isResourceVisible() { return true; },
    };
    context._units = [
        { unitTypeId: 'settlers', type: 1, team: 0, can_move: true, coord: new Coord(3, 3), speed: 1, state: 'ready' },
        { unitTypeId: 'city', type: 3, team: 0, coord: new Coord(0, 0) },
    ];
    context._current_game = {
        buildPath(k, target) { return [new Coord(target.i, target.j)]; },
        assignPath(k, path) { context._units[k].gotoPath = path; },
        setUnitState(k, state) { context._units[k].state = state; },
    };
}

function setTile(i, j, terrain, resourceType = 0, waterSource = false) {
    context._map_terrain_tex[i][j] = terrain | (waterSource ? 0x80 : 0);
    context._map_resource[i][j] = resourceType ? { type: resourceType } : null;
}

function assertCoord(coord, i, j, message) {
    assert(coord, message + ': expected coordinate');
    assert.strictEqual(coord.i, i, message + ': i');
    assert.strictEqual(coord.j, j, message + ': j');
}

setupMap();
setTile(3, 3, 6);
context._units[0].aiSettlerTurns = ai.settlerBuildCityTurnLimit;
assert(ai.cityPlotScore(3, 3, 0) < ai.settlerGoodCityPlotThreshold,
    'unsupported jungle score must stay below build threshold');
assert.strictEqual(ai.shouldSettlerBuildCity(0, 0), false,
    'old settler must not build on unsupported jungle');

setupMap();
setTile(3, 3, 6);
setTile(4, 3, 2, 1, true);
const target = ai.bestSettlementTargetForSettler(0, 0, 3);
assertCoord(target, 4, 3, 'settler should target visible grass with resource and water');

const command = ai.routeSettlerToBestCityPlot(0, 0);
assert(command, 'routeSettlerToBestCityPlot should produce a goto command');
assert.strictEqual(command.command, 'goto');
assertCoord(command.target, 4, 3, 'settler goto route should end at best city plot');

context._units[0].gotoPath = undefined;
const fallbackCommands = ai.applyAiReasoningWorkarounds(0);
assert.strictEqual(fallbackCommands.length, 1, 'idle settler fallback should produce one command');
assert.strictEqual(fallbackCommands[0].command, 'goto', 'idle settler fallback should route, not build');
assertCoord(fallbackCommands[0].target, 4, 3, 'idle settler fallback should choose best city plot');

setupMap();
setTile(3, 3, 2, 1, true);
assert(ai.cityPlotScore(3, 3, 0) >= ai.settlerGoodCityPlotThreshold,
    'grass with resource and water must be buildable');
assert.strictEqual(ai.shouldSettlerBuildCity(0, 0), true,
    'settler should build on grass with resource and water');

setupMap();
context._units = [
    { unitTypeId: 'settlers', type: 1, team: 0, can_move: true, coord: new Coord(3, 3), speed: 1, state: 'ready' },
];
setTile(3, 3, 2);
assert(ai.cityPlotScore(3, 3, 0) >= ai.settlerFirstCityPlotThreshold,
    'ordinary grass must be acceptable for the first city');
assert.strictEqual(ai.shouldSettlerBuildCity(0, 0), true,
    'first settler should build on ordinary grass instead of wandering indefinitely');

console.log('settlement score tests passed');

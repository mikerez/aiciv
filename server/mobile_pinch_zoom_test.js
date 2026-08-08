#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const index = fs.readFileSync('index.html', 'utf8');
assert.match(index, /maximum-scale=1\.0, user-scalable=no/,
    'fixed game UI must not be displaced by browser page zoom');
assert.equal((index.match(/touch-action: none/g) || []).length, 2,
    'both interactive canvases must reserve gestures for the map camera');
const wheelHandler = index.indexOf('document.addEventListener("wheel"');
const wheelPrevent = index.indexOf('event.preventDefault();', wheelHandler);
const wheelZoom = index.indexOf('if (event.ctrlKey || _ctrl_pressed)', wheelHandler);
assert.ok(wheelHandler >= 0 && wheelPrevent > wheelHandler && wheelPrevent < wheelZoom,
    'desktop Ctrl+wheel must prevent browser page zoom');
assert.match(index.slice(wheelZoom), /setMapZoomAtPoint\([\s\S]*?event\.deltaY > 0 \? 0\.2 : -0\.2/,
    'desktop Ctrl+wheel must zoom the map around the pointer');
assert.match(index, /if \(useMapPinch\(event\)\) return;/,
    'global touch handlers must route multi-touch gestures to map zoom');
assert.match(index, /_map_pinch\.zoom \* _map_pinch\.distance \/ gesture\.distance/,
    'pinch distance must change the map camera zoom');
assert.match(index, /setMapZoomAtPoint/,
    'pinch zoom must keep its map anchor while updating camera offsets');
console.log('PASS mobile pinch zoom changes only the map camera and preserves fixed UI');

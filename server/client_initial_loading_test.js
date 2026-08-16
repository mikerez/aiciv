const assert = require('node:assert/strict');
const fs = require('node:fs');

const index = fs.readFileSync('index.html', 'utf8');

assert.match(index, /id="gameLoadingOverlay"[^>]*>Loading\.\.\.<\/div>/,
    'the loading message must be visible in the initial HTML');
assert.match(index, /function finishInitialGameLoad\(\)[\s\S]*?centerViewOnStartingUnits\(\)[\s\S]*?drawScene\(1\)[\s\S]*?is-hidden/,
    'loading must finish only after the active user view is centered and redrawn');
assert.match(index, /initializePlayer\(_current_user\)[\s\S]*?finishInitialGameLoad\(\)/,
    'the authoritative player snapshot must finish before the loading overlay is hidden');
assert.match(index, /document\.readyState == 'complete'[\s\S]*?addEventListener\('load'/,
    'the overlay must also wait for the initial browser assets');
assert.match(index, /#gameLoadingOverlay \{[\s\S]*?font: bold 56px/,
    'desktop loading text must be large');
assert.match(index, /body\.phone-ui #gameLoadingOverlay \{ font-size: 38px; \}/,
    'mobile loading text must remain large');

console.log('PASS initial loading overlay waits for player recentering');

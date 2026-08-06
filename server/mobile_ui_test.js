const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync(require('path').join(__dirname, '..', 'mobile_ui.js'), 'utf8');
const indexSource = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');

function classList() {
    const names = new Set();
    return {
        contains(name) { return names.has(name); },
        add(name) { names.add(name); },
        toggle(name, enabled) { enabled ? names.add(name) : names.delete(name); },
    };
}

function runCase(options) {
    const classes = classList();
    const properties = {};
    const actionMenu = { style: {}, dataset: {} };
    const root = {
        dataset: {},
        style: { setProperty(name, value) { properties[name] = value; } },
    };
    const window = {
        screen: { width: options.screenWidth, height: options.screenHeight },
        innerWidth: options.viewportWidth,
        innerHeight: options.viewportHeight,
        visualViewport: {
            width: options.viewportWidth,
            height: options.viewportHeight,
            addEventListener() {},
        },
        matchMedia() { return { matches: options.coarse }; },
        addEventListener() {},
    };
    const context = {
        window,
        document: {
            body: { classList: classes },
            documentElement: root,
            getElementById(id) { return id === 'foreground' ? actionMenu : null; },
        },
        navigator: { userAgent: options.userAgent },
        setTimeout,
        clearTimeout,
    };
    vm.runInNewContext(source, context, { filename: 'mobile_ui.js' });
    return { classes, properties, root, actionMenu };
}

function check(condition, message) {
    if (!condition) throw new Error(message);
}

function checkToolbarFits(result, viewportWidth) {
    const buttonSize = parseInt(result.properties['--phone-button-size'], 10);
    const gap = parseInt(result.properties['--phone-button-gap'], 10);
    check(buttonSize * 5 + gap * 4 <= viewportWidth - 20, 'main toolbar must fit the phone width');
}

function checkActionMenuIsHalfHeight(result, viewportHeight) {
    const buttonSize = parseInt(result.properties['--phone-button-size'], 10);
    const menuHeight = parseInt(result.properties['--phone-action-menu-height'], 10);
    const availableHeight = viewportHeight - buttonSize - 66;
    check(Math.abs(menuHeight - Math.floor(availableHeight / 2)) <= 1, 'action menu should use half its former phone height');
}

function checkUnitStackHeight(result, viewportHeight) {
    const stackY = parseInt(result.properties['--phone-unit-stack-y'], 10);
    const stackHeight = parseInt(result.properties['--phone-unit-stack-height'], 10);
    const available = Math.max(120, viewportHeight - stackY - 52);
    const expected = Math.max(120, Math.min(360, Math.floor(viewportHeight * 0.42), available));
    check(stackHeight === expected, 'unit-stack height should be calculated from the live phone viewport');
}

const phone = runCase({
    screenWidth: 390,
    screenHeight: 844,
    viewportWidth: 390,
    viewportHeight: 760,
    coarse: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
});
check(phone.classes.contains('phone-ui'), 'phone-ui should be active on a phone');
check(phone.classes.contains('mobile-ui'), 'phone should retain touch/mobile behavior');
check(phone.actionMenu.style.display === 'none', 'phone action menu should start hidden');
check(phone.properties['--phone-vw'] === '390px', 'live phone width should be recorded');
check(phone.properties['--phone-vh'] === '760px', 'live phone height should be recorded');
check(parseInt(phone.properties['--phone-button-size'], 10) <= 30, 'phone buttons should be about half the former size');
check(parseInt(phone.properties['--phone-font-size'], 10) <= 16, 'phone font should be scaled down');
check(parseInt(phone.properties['--phone-statistics-y'], 10)
    === parseInt(phone.properties['--phone-button-size'], 10) + 33,
    'phone statistics should use the raised baseline below the toolbar');
check(parseInt(phone.properties['--phone-unit-stack-y'], 10)
    === parseInt(phone.properties['--phone-statistics-y'], 10) + 24,
    'phone unit-stack tab should sit immediately below the white statistics lines');
check(parseInt(phone.properties['--phone-unit-stack-height'], 10) >= 120,
    'phone unit-stack panel should retain a usable vertical height');
checkToolbarFits(phone, 390);
checkActionMenuIsHalfHeight(phone, 760);
checkUnitStackHeight(phone, 760);

const narrowPhone = runCase({
    screenWidth: 320,
    screenHeight: 568,
    viewportWidth: 320,
    viewportHeight: 500,
    coarse: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 12; Mobile)',
});
check(narrowPhone.classes.contains('phone-ui'), 'narrow Android phone should use phone layout');
checkToolbarFits(narrowPhone, 320);
checkActionMenuIsHalfHeight(narrowPhone, 500);
checkUnitStackHeight(narrowPhone, 500);

const landscapePhone = runCase({
    screenWidth: 390,
    screenHeight: 844,
    viewportWidth: 760,
    viewportHeight: 390,
    coarse: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
});
check(landscapePhone.classes.contains('phone-ui'), 'phone layout should remain active after rotation');
check(landscapePhone.properties['--phone-vw'] === '760px', 'landscape viewport width should be recorded');
check(parseFloat(landscapePhone.properties['--phone-ui-scale']) === 0.45, 'short landscape height should constrain UI scale');
checkToolbarFits(landscapePhone, 760);
checkActionMenuIsHalfHeight(landscapePhone, 390);
checkUnitStackHeight(landscapePhone, 390);

const desktop = runCase({
    screenWidth: 1920,
    screenHeight: 1080,
    viewportWidth: 1280,
    viewportHeight: 800,
    coarse: false,
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
});
check(!desktop.classes.contains('phone-ui'), 'desktop must not use phone layout');
check(Object.keys(desktop.properties).length === 0, 'desktop CSS variables must remain untouched');
check(desktop.actionMenu.style.display == undefined, 'desktop action menu visibility must remain untouched');

const touchLaptop = runCase({
    screenWidth: 1920,
    screenHeight: 1080,
    viewportWidth: 1280,
    viewportHeight: 800,
    coarse: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
});
check(!touchLaptop.classes.contains('phone-ui'), 'a coarse-pointer computer must not use phone layout');

const civilizationsPhoneRule = indexSource.match(/body\.phone-ui #civilizations_menu \{([\s\S]*?)\n\s*\}/);
check(civilizationsPhoneRule, 'phone civilizations menu rule should exist');
check(/left:.*!important/.test(civilizationsPhoneRule[1]), 'phone civilizations panel should span from the left inset');
check(/right:.*!important/.test(civilizationsPhoneRule[1]), 'phone civilizations panel should span to the right inset');
check(/top:.*!important/.test(civilizationsPhoneRule[1]), 'phone civilizations panel should use the available top edge');
check(/bottom:.*!important/.test(civilizationsPhoneRule[1]), 'phone civilizations panel should stop above its button');
check(/max-height:\s*none\s*!important/.test(civilizationsPhoneRule[1]), 'phone civilizations panel should not retain the desktop height cap');
check(/width:\s*auto\s*!important/.test(civilizationsPhoneRule[1]), 'phone civilizations panel should override the desktop width');

const unitStackPhoneRule = indexSource.match(/body\.phone-ui #unit_stack_menu \{([\s\S]*?)\n\s*\}/);
check(unitStackPhoneRule, 'phone unit-stack menu rule should exist');
check(/top:.*--phone-unit-stack-y.*40px.*!important/.test(unitStackPhoneRule[1]),
    'phone unit-stack panel should start below its raised tab');
check(/left:.*!important/.test(unitStackPhoneRule[1]) && /right:\s*auto\s*!important/.test(unitStackPhoneRule[1]),
    'phone unit-stack panel should remain left anchored');
check(/bottom:\s*auto\s*!important/.test(unitStackPhoneRule[1]),
    'phone unit-stack panel should expand downward instead of upward from the bottom');
check(/width:\s*min\(240px,\s*calc\(var\(--phone-vw\) \* 0\.5\)\)\s*!important/.test(unitStackPhoneRule[1]),
    'phone unit-stack panel should be half the viewport width');
check(/height:\s*var\(--phone-unit-stack-height\)\s*!important/.test(unitStackPhoneRule[1]),
    'phone unit-stack panel should use its calculated pixel height');
check(/deferPhoneStack\s*=\s*event\.type\s*===\s*'touchstart'/.test(indexSource)
    && /updateDeferredPhoneTap/.test(indexSource)
    && /finishDeferredPhoneTap\(event\.type\s*===\s*'touchend'\)/.test(indexSource),
    'phone unit-stack selection should wait for a confirmed tap instead of opening on touch start');
check(/_pending_phone_action_tap\s*=\s*unitSelected/.test(indexSource)
    && /_pending_phone_action_tap\.moved\s*=\s*true/.test(indexSource)
    && /actionTap[\s\S]*event\.type\s*===\s*'touchend'[\s\S]*showActionMenuForSelection/.test(indexSource),
    'phone action menu should remain deferred until a map touch is confirmed as a tap');

const turnControlsRule = indexSource.match(/#turnControls \{([\s\S]*?)\n\s*\}/);
check(turnControlsRule && /top:\s*0\s*;/.test(turnControlsRule[1]),
    'turn controls should touch the top screen edge');
check(/<div id="turnControls">[\s\S]*id="endTurnButton"/.test(indexSource)
    && !/id="turnTimer"/.test(indexSource),
    'End Turn should contain the counter without a separate counter control');

console.log('mobile_ui_test: phone sizing and desktop isolation passed');

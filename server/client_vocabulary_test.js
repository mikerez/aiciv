#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const languages = ['EN', 'FR', 'DE', 'SP', 'RU', 'IT', 'CH', 'JP'];
const expected = {
    'en-US': ['EN', 'Build City', 'en'],
    'fr-CA': ['FR', 'Fonder une ville', 'fr'],
    'de-DE': ['DE', 'Stadt gründen', 'de'],
    'es-MX': ['SP', 'Fundar ciudad', 'es'],
    'ru-RU': ['RU', 'Основать город', 'ru'],
    'it-IT': ['IT', 'Fonda città', 'it'],
    'zh-CN': ['CH', '建立城市', 'zh'],
    'ja-JP': ['JP', '都市建設', 'ja'],
    'sr-Latn': ['EN', 'Build City', 'en'],
};

function loadVocabulary(locale) {
    const documentElement = {lang: ''};
    const sandbox = {
        navigator: {languages: [locale], language: locale},
        document: {
            documentElement,
            querySelectorAll() { return []; },
        },
    };
    vm.createContext(sandbox);
    for (const language of languages) {
        const filename = `vocabulary_${language}.js`;
        vm.runInContext(fs.readFileSync(filename, 'utf8'), sandbox, {filename});
    }
    vm.runInContext(fs.readFileSync('vocabulary.js', 'utf8'), sandbox, {filename: 'vocabulary.js'});
    return {sandbox, documentElement};
}

for (const [locale, [language, cityCommand, htmlLanguage]] of Object.entries(expected)) {
    const {sandbox, documentElement} = loadVocabulary(locale);
    assert.equal(sandbox._game_vocabulary.language, language, `${locale} language selection`);
    assert.equal(sandbox.vocabularyText('command.build_city'), cityCommand, `${locale} translation`);
    assert.equal(documentElement.lang, htmlLanguage, `${locale} document language`);
    assert.equal(sandbox.vocabularyText('missing.key', null, 'Fallback'), 'Fallback');

    const englishKeys = Object.keys(sandbox._game_vocabulary_packs.EN);
    for (const packLanguage of languages) {
        assert.deepEqual(
            Object.keys(sandbox._game_vocabulary_packs[packLanguage]).sort(),
            englishKeys.slice().sort(),
            `${packLanguage} must retain the complete English fallback key set`,
        );
        for (const key of englishKeys) {
            const placeholders = value => Array.from(String(value).matchAll(/\{([A-Za-z0-9_]+)\}/g), match => match[1]).sort();
            assert.deepEqual(
                placeholders(sandbox._game_vocabulary_packs[packLanguage][key]),
                placeholders(sandbox._game_vocabulary_packs.EN[key]),
                `${packLanguage}.${key} placeholders`,
            );
        }
    }
}

const english = loadVocabulary('en-US').sandbox;
assert.equal(english.vocabularyText('hud.turn_seconds', {action: 'End Turn', seconds: 6}), 'End Turn (6s)');
assert.equal(english.vocabularyUnitName('trebuchet'), 'Trebuchet');
assert.equal(english.vocabularyResourceName('gems'), 'Gems');
assert.equal(english.vocabularyTechnologyName('Bronze Working'), 'Bronze Working');

for (const page of ['index.html', 'login.html', 'register.html']) {
    const html = fs.readFileSync(page, 'utf8');
    const positions = languages.map(language => html.indexOf(`vocabulary_${language}.js`));
    const selector = html.indexOf('vocabulary.js');
    assert.ok(positions.every(position => position >= 0), `${page} must load all language packs`);
    assert.ok(positions.every((position, index) => index === 0 || position > positions[index - 1]),
        `${page} language packs must have deterministic order`);
    assert.ok(selector > positions[positions.length - 1], `${page} selector must load after language packs`);
}

const index = fs.readFileSync('index.html', 'utf8');
assert.match(index, /vocabulary\.js[^>]*>[\s\S]*?menu_unit\.js/,
    'vocabulary must load before active game modules');
for (const page of ['login.html', 'register.html']) {
    const html = fs.readFileSync(page, 'utf8');
    assert.match(html, /vocabulary\.js[^>]*>[\s\S]*?(?:login|register)\.js/,
        `${page} must load vocabulary before its controller`);
}

const layer = fs.readFileSync('game_prehistory.js', 'utf8');
const ai = fs.readFileSync('ai.js', 'utf8');
assert.match(layer, /resourceVocabulary\.categories = _resource_categories/,
    'resources must expose language-neutral AI categories');
assert.doesNotMatch(ai, /resource\.gives/,
    'AI behavior must not parse translated resource descriptions');

console.log('PASS 8 browser-selected language packs, placeholders, fallback, templates, and load order');

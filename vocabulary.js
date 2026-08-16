'use strict';

var _game_vocabulary_packs = typeof _game_vocabulary_packs === 'undefined' ? {} : _game_vocabulary_packs;
var _game_vocabulary_storage_key = 'aiciv_language';

function storedVocabularyLanguage()
{
    try {
        var language = String(localStorage.getItem(_game_vocabulary_storage_key) || '').toUpperCase();
        if (_game_vocabulary_packs[language]) return language;
    }
    catch (error) {}
    return null;
}

function browserVocabularyLanguage()
{
    var supported = {en:'EN', fr:'FR', de:'DE', es:'SP', ru:'RU', it:'IT', zh:'CH', ja:'JP'};
    var requested = [];
    if (typeof navigator !== 'undefined') {
        if (navigator.languages && navigator.languages.length) requested = Array.from(navigator.languages);
        if (navigator.language) requested.push(navigator.language);
    }
    for (var index=0; index < requested.length; ++index) {
        var base = String(requested[index] || '').toLowerCase().split(/[-_]/)[0];
        if (supported[base]) return supported[base];
    }
    return 'EN';
}

var _game_vocabulary = {
    language: storedVocabularyLanguage() || browserVocabularyLanguage(),
    locale: 'en',
    words: {},

    select: function(language)
    {
        language = String(language || 'EN').toUpperCase();
        if (!_game_vocabulary_packs[language]) language = 'EN';
        this.language = language;
        this.locale = {EN:'en',FR:'fr',DE:'de',SP:'es',RU:'ru',IT:'it',CH:'zh',JP:'ja'}[language] || 'en';
        this.words = Object.assign({}, _game_vocabulary_packs.EN || {}, _game_vocabulary_packs[language] || {});
        if (typeof document !== 'undefined') {
            if (document.documentElement) document.documentElement.lang = this.locale;
            this.apply(document);
        }
        try { localStorage.setItem(_game_vocabulary_storage_key, language); } catch (error) {}
        return language;
    },

    text: function(key, parameters, fallback)
    {
        var value = this.words[key];
        if (value == null) value = fallback == null ? key : fallback;
        parameters = parameters || {};
        return String(value).replace(/\{([A-Za-z0-9_]+)\}/g, function(match, name) {
            return parameters[name] == null ? match : String(parameters[name]);
        });
    },

    apply: function(root)
    {
        root = root || (typeof document !== 'undefined' ? document : null);
        if (!root || typeof root.querySelectorAll !== 'function') return;
        var self = this;
        var elements = root.querySelectorAll('[data-vocabulary]');
        for (var index=0; index < elements.length; ++index) {
            elements[index].textContent = self.text(elements[index].getAttribute('data-vocabulary'));
        }
        var titled = root.querySelectorAll('[data-vocabulary-title]');
        for (var titleIndex=0; titleIndex < titled.length; ++titleIndex) {
            titled[titleIndex].title = self.text(titled[titleIndex].getAttribute('data-vocabulary-title'));
        }
    }
};

function vocabularyText(key, parameters, fallback)
{
    return _game_vocabulary.text(key, parameters, fallback);
}

function vocabularyUnitName(unitTypeId, fallback)
{
    return vocabularyText('unit.' + unitTypeId, null, fallback || unitTypeId);
}

function vocabularyResourceName(resourceId, fallback)
{
    return vocabularyText('resource.' + resourceId, null, fallback || resourceId);
}

function vocabularyTechnologyName(technologyId)
{
    return vocabularyText('technology.' + technologyId, null, technologyId);
}

function vocabularyCommandName(commandId)
{
    return vocabularyText('command.' + commandId, null, String(commandId || '').replace(/_/g, ' '));
}

_game_vocabulary.select(_game_vocabulary.language);

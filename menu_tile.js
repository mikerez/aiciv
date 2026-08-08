const _menu_tile = new class
{
    constructor()
    {
        this.element = null;
    }

    terrainName(type)
    {
        return ['Water', 'Sand', 'Grass', 'Snow', 'Hills', 'Mountains', 'Forest', 'Grass with water'][type] || 'Unknown';
    }

    tileDefenseBonus(i, j)
    {
        var terrain = _map_terrain_tex[i][j] || 0;
        var type = terrain & 0x0f;
        var level = (terrain >> 4) & 0x03;
        var hills = type == 4;
        var forest = type == 6 || (hills && (level & 1) != 0);
        var bonus = (hills ? 0.25 : 0) + (forest ? 0.50 : 0);
        if (_map_terrain_mod[i][j] && _map_terrain_mod[i][j].fortification) {
            bonus += _military.fortificationDefenseBonus;
        }
        return Math.round(bonus * 100);
    }

    resourceAt(i, j)
    {
        var state = _map_resource[i] && _map_resource[i][j];
        if (!state || !state.type || state.hidden || !_resource_types[state.type]) return null;
        return _resource_types[state.type];
    }

    suggestedImprovement(i, j, resource)
    {
        if (resource) return _economics.resourceImprovementRequirements()[resource.id] || null;
        if ((_map_terrain_tex[i][j] & 0x0f) == 0) return 'network';
        _economics.ensureState(_game_state);
        return (_game_state.money || 0) <= (_game_state.food || 0) ? 'cottage' : 'workshop';
    }

    ensureElement()
    {
        if (this.element) return this.element;
        var panel = document.createElement('div');
        panel.id = 'tileInfoMenu';
        panel.innerHTML = '<button type="button" class="tile-info-close" title="Close">&times;</button><div class="tile-info-title"></div><div class="tile-info-body"></div>';
        panel.querySelector('.tile-info-close').onclick = this.hide.bind(this);
        document.body.appendChild(panel);
        this.element = panel;
        return panel;
    }

    show(i, j)
    {
        i = Math.round(Number(i));
        j = Math.round(Number(j));
        if (!Number.isFinite(i) || !Number.isFinite(j)) return;
        if (i < 0 || j < 0 || i >= _map_size || j >= _map_size) return;
        var panel = this.ensureElement();
        var terrainType = _map_terrain_tex[i][j] & 0x0f;
        var basic = _city_economy.baseTerrainIncomeAt(i, j);
        var resource = this.resourceAt(i, j);
        var suggestion = this.suggestedImprovement(i, j, resource);
        var projectedModifiers = Object.assign({}, _map_terrain_mod[i][j] || {});
        if (suggestion) projectedModifiers[suggestion] = true;
        var projected = _city_economy.tileIncomeForModifiers(i, j, projectedModifiers);
        var current = _city_economy.tileIncomeAt(i, j);
        panel.querySelector('.tile-info-title').textContent = this.terrainName(terrainType) + ' (' + i + ', ' + j + ')';
        panel.querySelector('.tile-info-body').innerHTML = [
            '<span>Defence <b>+' + this.tileDefenseBonus(i, j) + '%</b></span>',
            '<span>Base <b>Food ' + basic.food + ' / Shields ' + basic.production + ' / Gold ' + basic.money + '</b></span>',
            '<span>Resource <b>' + (resource ? resource.name : 'None') + '</b></span>',
            '<span>Current <b>Food ' + current.food + ' / Shields ' + current.production + ' / Gold ' + current.money + '</b></span>',
            '<span>Suggested <b>' + (suggestion ? suggestion.replace(/_/g, ' ') : 'None') + '</b></span>',
            '<span>After <b>Food ' + projected.food + ' / Shields ' + projected.production + ' / Gold ' + projected.money + '</b></span>'
        ].join('');
        panel.style.display = 'block';
    }

    hide()
    {
        if (this.element) this.element.style.display = 'none';
    }
};

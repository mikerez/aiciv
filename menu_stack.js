const _unit_stack_menu = new class
{
    constructor()
    {
        this.panel = null;
        this.button = null;
        this.expanded = false;
        this.pendingPhoneTap = null;
        this.currentCoord = null;
        this.create();
    }

    create()
    {
        var panel = document.createElement('div');
        panel.id = 'unit_stack_menu';
        panel.style.position = 'fixed';
        panel.style.left = '12px';
        panel.style.top = '92px';
        panel.style.width = '250px';
        panel.style.maxHeight = '55vh';
        panel.style.overflowY = 'auto';
        panel.style.display = 'none';
        panel.style.zIndex = '8';
        panel.style.boxSizing = 'border-box';
        panel.style.padding = '8px';
        panel.style.background = 'rgba(255,255,255,0.5)';
        panel.style.border = '1px solid rgba(25,35,45,0.45)';
        panel.style.borderRadius = '7px';
        panel.style.font = '13px Arial';
        ['mousedown', 'mouseup', 'click', 'touchstart', 'touchmove', 'touchend'].forEach(function(name) {
            panel.addEventListener(name, function(event) { event.stopPropagation(); }, { passive: false });
        });
        var button = document.createElement('button');
        button.id = 'unitStackButton';
        button.type = 'button';
        button.title = vocabularyText('unit.units_at', {i: '', j: ''}).replace(/[, ]+$/, '');
        button.setAttribute('aria-label', vocabularyText('unit.units_at', {i: '', j: ''}).replace(/[, ]+$/, ''));
        button.setAttribute('aria-expanded', 'false');
        button.style.position = 'fixed';
        button.style.left = '12px';
        button.style.bottom = '12px';
        button.style.zIndex = '9';
        button.style.display = 'none';
        button.style.padding = '8px 12px';
        button.style.border = '1px solid rgba(20,35,55,0.65)';
        button.style.borderRadius = '6px';
        button.style.background = 'rgba(255,255,255,0.78)';
        button.style.font = 'bold 13px Arial';
        var self = this;
        button.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            self.setExpanded(!self.expanded);
        });
        document.body.appendChild(panel);
        document.body.appendChild(button);
        this.panel = panel;
        this.button = button;
    }

    isPhone()
    {
        return document.body && document.body.classList && document.body.classList.contains('phone-ui');
    }

    setExpanded(expanded)
    {
        this.expanded = !!expanded;
        if (this.panel) this.panel.style.display = this.expanded ? 'block' : 'none';
        if (this.button) this.button.setAttribute('aria-expanded', this.expanded ? 'true' : 'false');
    }

    hide()
    {
        this.pendingPhoneTap = null;
        this.currentCoord = null;
        this.setExpanded(false);
        if (this.button) this.button.style.display = 'none';
    }

    isVisibleUnit(unit)
    {
        return !!(unit && unit.coord && !unit.hiddenOnMap && !unit.outsideMapWindow
            && (unit.health == undefined || Number(unit.health) > 0)
            && (unit.can_move || unit.type == 3));
    }

    liveIndicesAt(coord)
    {
        var indices = [];
        if (!coord || typeof _units == 'undefined') return indices;
        for (var index=0; index < _units.length; index++) {
            var unit = _units[index];
            if (this.isVisibleUnit(unit)
                && unit.coord.i == Math.round(coord.i) && unit.coord.j == Math.round(coord.j)) {
                indices.push(index);
            }
        }
        return indices;
    }

    unitIdentity(unit)
    {
        return {
            serverId: unit && unit.serverId ? Number(unit.serverId) : null,
            clientKey: unit && unit.serverClientKey ? String(unit.serverClientKey) : null,
            object: unit || null,
        };
    }

    liveIndex(identity, coord)
    {
        var indices = this.liveIndicesAt(coord);
        for (var n=0; n < indices.length; n++) {
            var unit = _units[indices[n]];
            if ((identity.serverId && Number(unit.serverId) == identity.serverId)
                || (identity.clientKey && unit.serverClientKey == identity.clientKey)
                || (!identity.serverId && !identity.clientKey && unit === identity.object)) {
                return indices[n];
            }
        }
        return -1;
    }

    refresh()
    {
        if (!this.currentCoord) return false;
        var coord = { i: this.currentCoord.i, j: this.currentCoord.j };
        var preserveExpanded = this.expanded;
        var indices = this.liveIndicesAt(coord);
        if (indices.length < 2) {
            this.hide();
            return false;
        }
        this.show(indices, coord, preserveExpanded);
        return true;
    }

    deferPhoneTap(indices, coord, point)
    {
        this.hide();
        this.pendingPhoneTap = {
            indices: indices.slice(),
            coord: { i: coord.i, j: coord.j },
            x: point.x,
            y: point.y,
            startedAt: Date.now(),
            moved: false,
        };
    }

    updateDeferredPhoneTap(point, dragThreshold)
    {
        var pending = this.pendingPhoneTap;
        if (!pending) return;
        var dx = point.x - pending.x;
        var dy = point.y - pending.y;
        if (dx*dx + dy*dy >= dragThreshold*dragThreshold) {
            pending.moved = true;
        }
    }

    finishDeferredPhoneTap(confirmedTouchEnd)
    {
        var pending = this.pendingPhoneTap;
        this.pendingPhoneTap = null;
        if (!pending || !confirmedTouchEnd || pending.moved || Date.now() - pending.startedAt > 500) {
            return false;
        }
        this.show(this.liveIndicesAt(pending.coord), pending.coord);
        return true;
    }

    show(indices, coord, preserveExpanded)
    {
        this.pendingPhoneTap = null;
        indices = this.liveIndicesAt(coord);
        if (!this.panel || !indices || indices.length < 2) {
            this.hide();
            return;
        }
        this.currentCoord = { i: Math.round(coord.i), j: Math.round(coord.j) };
        var self = this;
        indices = indices.slice().sort(function(a, b) {
            var aCity = _units[a] && _units[a].type == 3 ? 0 : 1;
            var bCity = _units[b] && _units[b].type == 3 ? 0 : 1;
            return aCity - bCity || a - b;
        });
        if (!preserveExpanded) this.expanded = true;
        this.panel.innerHTML = '';
        var title = document.createElement('div');
        title.textContent = vocabularyText('unit.units_at', {i: Math.round(coord.i), j: Math.round(coord.j)});
        title.style.fontWeight = 'bold';
        title.style.margin = '2px 4px 7px';
        this.panel.appendChild(title);
        var militaryIndices = indices.filter(function(unitIndex) {
            return _units[unitIndex] && _units[unitIndex].type == 2;
        });
        if (militaryIndices.length) {
            var selectAll = document.createElement('button');
            selectAll.type = 'button';
            selectAll.textContent = vocabularyText('command.select_all');
            selectAll.title = vocabularyText('command.select_all_title');
            selectAll.style.width = '100%';
            selectAll.style.margin = '0 0 6px';
            selectAll.style.padding = '6px';
            selectAll.style.border = '1px solid rgba(0,0,0,0.4)';
            selectAll.style.background = 'rgba(225,238,255,0.9)';
            selectAll.addEventListener('click', function(event) {
                event.preventDefault();
                var liveMilitary = self.liveIndicesAt(coord).filter(function(unitIndex) {
                    return _units[unitIndex] && _units[unitIndex].type == 2;
                });
                if (!liveMilitary.length) {
                    self.refresh();
                    return;
                }
                _multi_selection = liveMilitary;
                _selection = liveMilitary[0];
                _selection_by_user[_current_user] = _selection;
                self.show(self.liveIndicesAt(coord), coord, true);
                if (self.isPhone()) self.setExpanded(false);
                if (_current_game.showActionMenuForSelection) _current_game.showActionMenuForSelection();
                _fulldraw = 1;
                drawScene(0);
            });
            this.panel.appendChild(selectAll);
        }
        indices.forEach(function(unitIndex) {
            var unit = _units[unitIndex];
            if (!unit) return;
            var identity = self.unitIdentity(unit);
            var button = document.createElement('button');
            button.type = 'button';
            button.style.display = 'grid';
            button.style.gridTemplateColumns = '28px minmax(0, 1fr) auto';
            button.style.alignItems = 'center';
            button.style.gap = '7px';
            button.style.width = '100%';
            button.style.margin = '3px 0';
            button.style.padding = '6px';
            var groupSelected = typeof _multi_selection != 'undefined' && _multi_selection.indexOf(unitIndex) != -1;
            button.style.border = unitIndex == _selection || groupSelected ? '2px solid #235d9f' : '1px solid rgba(0,0,0,0.3)';
            button.style.background = 'rgba(255,255,255,0.76)';
            button.style.cursor = 'pointer';
            var badge = document.createElement('span');
            badge.textContent = unit.type == 3 ? vocabularyText('unit.city_badge')
                : vocabularyUnitName(unit.unitTypeId, unit.name || unit.unitTypeId || 'U').substring(0, 3).toUpperCase();
            badge.style.font = 'bold 9px Arial';
            badge.style.textAlign = 'center';
            var name = document.createElement('span');
            name.textContent = vocabularyUnitName(unit.unitTypeId, unit.name || unit.unitTypeId || vocabularyText('unit.generic'));
            name.style.textAlign = 'left';
            name.style.overflow = 'hidden';
            name.style.textOverflow = 'ellipsis';
            var health = document.createElement('span');
            health.textContent = Math.round(unit.health == undefined ? 100 : unit.health);
            health.title = vocabularyText('common.health');
            button.appendChild(badge);
            button.appendChild(name);
            button.appendChild(health);
            button.addEventListener('click', function(event) {
                event.preventDefault();
                var liveIndex = self.liveIndex(identity, coord);
                if (liveIndex == -1) {
                    self.refresh();
                    return;
                }
                _multi_selection = [];
                _selection = liveIndex;
                _selection_by_user[_current_user] = liveIndex;
                self.show(self.liveIndicesAt(coord), coord, true);
                if (self.isPhone()) self.setExpanded(false);
                if (_current_game.showActionMenuForSelection) _current_game.showActionMenuForSelection();
                _fulldraw = 1;
                drawScene(0);
            });
            self.panel.appendChild(button);
        });
        if (this.isPhone()) {
            this.button.textContent = vocabularyText('unit.units_count', {count: indices.length});
            this.button.style.display = 'block';
            this.setExpanded(this.expanded);
        }
        else {
            this.button.style.display = 'none';
            this.setExpanded(true);
        }
    }
}();

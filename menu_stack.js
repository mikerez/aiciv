const _unit_stack_menu = new class
{
    constructor()
    {
        this.panel = null;
        this.button = null;
        this.expanded = false;
        this.pendingPhoneTap = null;
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
        button.title = 'Units on selected tile';
        button.setAttribute('aria-label', 'Units on selected tile');
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
        this.setExpanded(false);
        if (this.button) this.button.style.display = 'none';
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
        this.show(pending.indices, pending.coord);
        return true;
    }

    show(indices, coord, preserveExpanded)
    {
        this.pendingPhoneTap = null;
        if (!this.panel || !indices || indices.length < 2) {
            this.hide();
            return;
        }
        var self = this;
        if (!preserveExpanded) this.expanded = true;
        this.panel.innerHTML = '';
        var title = document.createElement('div');
        title.textContent = 'Units at ' + Math.round(coord.i) + ', ' + Math.round(coord.j);
        title.style.fontWeight = 'bold';
        title.style.margin = '2px 4px 7px';
        this.panel.appendChild(title);
        indices.forEach(function(unitIndex) {
            var unit = _units[unitIndex];
            if (!unit) return;
            var button = document.createElement('button');
            button.type = 'button';
            button.style.display = 'grid';
            button.style.gridTemplateColumns = '28px minmax(0, 1fr) auto';
            button.style.alignItems = 'center';
            button.style.gap = '7px';
            button.style.width = '100%';
            button.style.margin = '3px 0';
            button.style.padding = '6px';
            button.style.border = unitIndex == _selection ? '2px solid #235d9f' : '1px solid rgba(0,0,0,0.3)';
            button.style.background = 'rgba(255,255,255,0.76)';
            button.style.cursor = 'pointer';
            var badge = document.createElement('span');
            badge.textContent = unit.type == 3 ? 'CITY' : (unit.name || unit.unitTypeId || 'U').substring(0, 3).toUpperCase();
            badge.style.font = 'bold 9px Arial';
            badge.style.textAlign = 'center';
            var name = document.createElement('span');
            name.textContent = unit.name || unit.unitTypeId || 'Unit';
            name.style.textAlign = 'left';
            name.style.overflow = 'hidden';
            name.style.textOverflow = 'ellipsis';
            var health = document.createElement('span');
            health.textContent = Math.round(unit.health == undefined ? 100 : unit.health);
            health.title = 'Health';
            button.appendChild(badge);
            button.appendChild(name);
            button.appendChild(health);
            button.addEventListener('click', function(event) {
                event.preventDefault();
                _selection = unitIndex;
                _selection_by_user[_current_user] = unitIndex;
                self.show(indices, coord, true);
                if (self.isPhone()) self.setExpanded(false);
                if (_current_game.showActionMenuForSelection) _current_game.showActionMenuForSelection();
                _fulldraw = 1;
                drawScene(0);
            });
            self.panel.appendChild(button);
        });
        if (this.isPhone()) {
            this.button.textContent = 'Units (' + indices.length + ')';
            this.button.style.display = 'block';
            this.setExpanded(this.expanded);
        }
        else {
            this.button.style.display = 'none';
            this.setExpanded(true);
        }
    }
}();

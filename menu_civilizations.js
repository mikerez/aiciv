const _civilizations_menu = new class
{
    constructor()
    {
        this.players = [];
        this.viewerId = null;
        this.panel = null;
        this.button = null;
        this.create();
    }

    create()
    {
        var button = document.createElement('button');
        button.id = 'civilizationsButton';
        button.type = 'button';
        button.title = 'Civilizations';
        button.setAttribute('aria-label', 'Civilizations');
        button.textContent = 'Civs';
        button.style.position = 'fixed';
        button.style.right = '12px';
        button.style.bottom = '12px';
        button.style.zIndex = '9';
        button.style.padding = '8px 12px';
        button.style.border = '1px solid rgba(20,35,55,0.65)';
        button.style.borderRadius = '6px';
        button.style.background = 'rgba(255,255,255,0.78)';
        button.style.font = 'bold 13px Arial';
        var panel = document.createElement('div');
        panel.id = 'civilizations_menu';
        panel.style.position = 'fixed';
        panel.style.right = '12px';
        panel.style.bottom = '52px';
        panel.style.width = 'min(360px, calc(100vw - 24px))';
        panel.style.maxHeight = '62vh';
        panel.style.overflowY = 'auto';
        panel.style.display = 'none';
        panel.style.zIndex = '9';
        panel.style.padding = '10px';
        panel.style.boxSizing = 'border-box';
        panel.style.background = 'rgba(255,255,255,0.82)';
        panel.style.border = '1px solid rgba(20,35,55,0.5)';
        panel.style.borderRadius = '7px';
        panel.style.font = '12px Arial';
        button.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            panel.style.display = panel.style.display == 'none' ? 'block' : 'none';
        });
        ['mousedown', 'mouseup', 'click', 'touchstart', 'touchmove', 'touchend'].forEach(function(name) {
            panel.addEventListener(name, function(event) { event.stopPropagation(); }, { passive: false });
        });
        document.body.appendChild(panel);
        document.body.appendChild(button);
        this.panel = panel;
        this.button = button;
    }

    update(players, viewerId)
    {
        this.players = players || [];
        this.viewerId = viewerId;
        if (!this.panel) return;
        this.panel.innerHTML = '<div style="font:bold 16px Arial;margin:1px 2px 8px">Civilizations</div>';
        for (var index=0; index < this.players.length; index++) {
            var player = this.players[index];
            var row = document.createElement('div');
            row.style.display = 'grid';
            row.style.gridTemplateColumns = '42px minmax(0,1fr)';
            row.style.gap = '9px';
            row.style.padding = '8px 3px';
            row.style.borderTop = index ? '1px solid rgba(0,0,0,0.16)' : '0';
            var coat = document.createElement('div');
            coat.textContent = player.coat && player.coat.mark ? player.coat.mark : 'C';
            coat.title = player.civilization_name + ' coat of arms';
            coat.style.width = '36px';
            coat.style.height = '42px';
            coat.style.display = 'flex';
            coat.style.alignItems = 'center';
            coat.style.justifyContent = 'center';
            coat.style.clipPath = 'polygon(8% 0,92% 0,92% 66%,50% 100%,8% 66%)';
            coat.style.background = 'linear-gradient(90deg,' + player.coat.primary + ' 0 50%,' + player.coat.secondary + ' 50% 100%)';
            coat.style.color = '#fff';
            coat.style.font = 'bold 17px Georgia';
            coat.style.textShadow = '1px 1px 2px #000';
            var details = document.createElement('div');
            var own = player.player_id == viewerId ? ' (you)' : '';
            details.innerHTML = '<div style="font-weight:bold">' + this.escape(player.civilization_name) + own + '</div>'
                + '<div>' + this.escape(player.player_name) + ' - ' + this.escape(player.relation) + '</div>'
                + '<div>Units: ' + player.current_units + ' | Cities: ' + player.current_cities + '</div>'
                + '<div>Killed: ' + player.units_killed + ' | Occupied: ' + player.cities_occupied
                + ' | Destroyed: ' + player.cities_destroyed + '</div>';
            row.appendChild(coat);
            row.appendChild(details);
            this.panel.appendChild(row);
        }
    }

    escape(value)
    {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function(character) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
        });
    }
}();

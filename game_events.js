const _game_events = new class
{
    constructor()
    {
        this.canvas = document.getElementById('canvasEvents');
        this.context = this.canvas ? this.canvas.getContext('2d') : null;
    }

    unitByServerId(serverId)
    {
        for (var ownerId in _units_by_user) {
            var list = _units_by_user[ownerId] || [];
            for (var index=0; index < list.length; index++) {
                if (list[index].serverId == serverId) return list[index];
            }
        }
        return null;
    }

    eventPoint(event, snapshot)
    {
        var i = snapshot ? snapshot.i : event.i;
        var j = snapshot ? snapshot.j : event.j;
        return {
            x: x1toX(ijtox1(i, j)),
            y: y1toY(ijtoy1(i, j)),
        };
    }

    async playCombat(event)
    {
        if (!this.context || !event.payload) return;
        var payload = event.payload;
        var attacker = payload.attacker_before;
        var defender = payload.defender_before;
        if (!attacker || !defender) return;
        var started = performance.now();
        var duration = payload.destroyed_unit_ids && payload.destroyed_unit_ids.length ? 1350 : 950;
        var self = this;
        await new Promise(function(resolve) {
            function frame(now) {
                var progress = Math.min(1, (now - started) / duration);
                self.drawCombatFrame(event, attacker, defender, progress);
                if (progress < 1) requestAnimationFrame(frame);
                else resolve();
            }
            requestAnimationFrame(frame);
        });
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawCombatFrame(event, attacker, defender, progress)
    {
        var ctx = this.context;
        var from = this.eventPoint(event, attacker);
        var to = this.eventPoint(event, defender);
        var target = { x: x1toX(ijtox1(event.i, event.j)), y: y1toY(ijtoy1(event.i, event.j)) };
        var pulse = 0.5 + Math.sin(progress * Math.PI * 8) * 0.5;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineWidth = 4 + pulse * 4;
        ctx.strokeStyle = 'rgba(245, 45, 38, ' + (0.75 - progress * 0.2) + ')';
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
        ctx.setLineDash([10, 7]);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath();
        ctx.arc(to.x, to.y, 32 + pulse * 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        var label = event.payload.combat_kind == 'city_capture'
            ? 'CITY CAPTURE'
            : (event.payload.combat_kind == 'city_attack' ? 'CITY ATTACK' : 'ATTACK');
        if (event.payload.destroyed_unit_ids && event.payload.destroyed_unit_ids.length) label += ' - DESTROYED';
        ctx.fillStyle = 'rgba(0,0,0,0.9)';
        ctx.fillText(label, target.x + 2, target.y - 49 + 2);
        ctx.fillStyle = 'rgba(255,255,255,0.98)';
        ctx.fillText(label, target.x, target.y - 49);
        ctx.restore();
    }
}();

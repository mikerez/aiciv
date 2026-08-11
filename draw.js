const _draw = new class
{
    clear()
    {
        const canvas2D = document.getElementById("canvas2D");
        const ctx = canvas2D.getContext("2d");

// Set text properties
//ctx.font = "48px Arial";
//ctx.fillStyle = "white";
//ctx.fillText("Hello, WebGL!", 10, 50);  // Draws the text on the canvas
//        console.log("::: " + x + "," + y + " => " + " " + xy1toi(x,y) + ":" + xy1toj(x,y))
        ctx.clearRect(0, 0, canvas2D.width, canvas2D.height);
        this.drawTechnologyStatus(ctx);
        if (typeof _birdsview !== 'undefined' && _birdsview.draw) {
            _birdsview.draw(ctx);
        }
        return ctx;
    }

    technologyStatusText()
    {
        if (typeof _game_state === 'undefined' || _game_state == null) {
            return '';
        }
        if (_game_state.researchStatusText) {
            var text = _game_state.researchStatusText();
            if (typeof _military !== 'undefined' && _military.relationStatusText) {
                text += ' | ' + _military.relationStatusText(typeof _current_user === 'undefined' ? 0 : _current_user);
            }
            return text;
        }
        return '';
    }

    drawTechnologyStatus(ctx)
    {
        if (!ctx) {
            return;
        }
        const message = (typeof _one_turn_message !== 'undefined' && _one_turn_message)
            ? _one_turn_message
            : (typeof _game_state !== 'undefined' && _game_state && _game_state.oneTurnMessage)
            ? _game_state.oneTurnMessage
            : '';
        if (!message) {
            return;
        }
        const mobile = document.body && document.body.classList && document.body.classList.contains('mobile-ui');
        const phone = document.body && document.body.classList && document.body.classList.contains('phone-ui');
        const fontSize = phone ? 12 : (mobile ? 19 : 11);
        const x = phone ? 10 : (mobile ? 14 : 10);
        const phoneStatisticsY = phone
            ? parseInt(getComputedStyle(document.documentElement).getPropertyValue('--phone-statistics-y'), 10)
            : 0;
        const y = phone ? (phoneStatisticsY || 57) : (mobile ? 19 : 12);
        const lineGap = phone ? 15 : (mobile ? 23 : 15);
        ctx.save();
        ctx.font = 'bold ' + fontSize + 'px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        const height = y + fontSize;
        ctx.clearRect(0, 0, ctx.canvas.width, height + 8);
        ctx.fillStyle = 'rgba(0,0,0,0.92)';
        ctx.fillText(message, x + 2, y + 2);
        ctx.fillStyle = 'rgba(255,255,255,0.96)';
        ctx.fillText(message, x, y);
        ctx.restore();
    }

    drawUnitArrivalEffects(ctx)
    {
        if (!ctx || typeof visibleUnitsForCurrentUser !== 'function') return;
        var now = typeof performance != 'undefined' ? performance.now() : Date.now();
        var units = visibleUnitsForCurrentUser();
        var active = false;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (var k=0; k<units.length; k++) {
            var effect = units[k] && units[k].arrivalEffect;
            if (!effect || !units[k].coord) continue;
            var age = now - effect.startedAt;
            if (age >= effect.duration) {
                delete units[k].arrivalEffect;
                continue;
            }
            active = true;
            var progress = Math.max(0, Math.min(1, age/effect.duration));
            var fromX = x1toX(ijtox1(effect.from.i, effect.from.j));
            var fromY = y1toY(ijtoy1(effect.from.i, effect.from.j));
            var toX = x1toX(ijtox1(units[k].coord.i, units[k].coord.j));
            var toY = y1toY(ijtoy1(units[k].coord.i, units[k].coord.j));
            var tail = 0.12 + progress*0.88;
            var x = fromX + (toX-fromX)*tail;
            var y = fromY + (toY-fromY)*tail;
            ctx.strokeStyle = 'rgba(255,255,220,' + (0.55*(1-progress)) + ')';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(toX, toY);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,' + (0.35*(1-progress)) + ')';
            ctx.beginPath();
            ctx.arc(x, y, 5 + progress*5, 0, Math.PI*2);
            ctx.fill();
        }
        ctx.restore();
        if (active && !this.arrivalFramePending && typeof requestAnimationFrame == 'function') {
            this.arrivalFramePending = true;
            var self = this;
            requestAnimationFrame(function() {
                self.arrivalFramePending = false;
                if (typeof _fulldraw != 'undefined') _fulldraw = 1;
                if (typeof drawScene == 'function' && (typeof _in_drawing == 'undefined' || !_in_drawing)) drawScene(0);
            });
        }
    }

    drawUnitOwnerLabels(ctx)
    {
        if (!ctx || typeof visibleUnitsForCurrentUser !== 'function') {
            return;
        }
        var viewerId = typeof _current_user === 'undefined' ? 0 : _current_user;
        var civilizations = typeof _server_game !== 'undefined'
            && _server_game.civilizationsByPlayer
            ? (_server_game.civilizationsByPlayer[viewerId] || []) : [];
        var playerNames = {};
        for (var c=0; c < civilizations.length; c++) {
            playerNames[civilizations[c].player_id] = civilizations[c].player_name;
        }

        var units = visibleUnitsForCurrentUser();
        var drawnOwners = {};
        var labelsPerTile = {};
        var mobile = document.body && document.body.classList
            && document.body.classList.contains('mobile-ui');
        var fontSize = mobile ? 11 : 9;
        ctx.save();
        ctx.font = fontSize + 'px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        for (var k=0; k < units.length; k++) {
            var unit = units[k];
            if (!unit || !unit.coord) continue;
            var ownerId = unit.team == undefined ? 0 : unit.team;
            var ownerKey = unit.coord.i + ':' + unit.coord.j + ':' + ownerId;
            if (drawnOwners[ownerKey]) continue;
            drawnOwners[ownerKey] = true;

            var label = playerNames[ownerId];
            if (!label) {
                label = ownerId == viewerId ? 'Player ' + ownerId : 'Player ' + ownerId;
            }
            var tileKey = unit.coord.i + ':' + unit.coord.j;
            var line = labelsPerTile[tileKey] || 0;
            labelsPerTile[tileKey] = line + 1;
            var x = x1toX(ijtox1(unit.coord.i, unit.coord.j));
            var y = y1toY(ijtoy1(unit.coord.i, unit.coord.j))
                - Math.max(42, 92/_screenZoom) - line*(fontSize + 3);
            var maxWidth = Math.max(88, 190/_screenZoom);
            ctx.fillStyle = 'rgba(0,0,0,0.82)';
            ctx.fillText(label, x + 1, y + 1, maxWidth);
            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            ctx.fillText(label, x, y, maxWidth);
        }

        ctx.textBaseline = 'top';
        ctx.font = 'bold ' + fontSize + 'px Arial';
        for (var cityIndex=0; cityIndex < units.length; cityIndex++) {
            var city = units[cityIndex];
            if (!city || !city.coord || city.type != 3) continue;
            var cityX = x1toX(ijtox1(city.coord.i, city.coord.j));
            var cityY = y1toY(ijtoy1(city.coord.i, city.coord.j)) + Math.max(30, 68/_screenZoom);
            var population = Math.max(1, Number(city.cityPopulation) || 1);
            var cityName = city.name && city.name != 'City' ? city.name : 'City';
            var cityLabel = population + ' ' + cityName;
            var cityMaxWidth = Math.max(100, 210/_screenZoom);
            ctx.fillStyle = 'rgba(0,0,0,0.88)';
            ctx.fillText(cityLabel, cityX + 1, cityY + 1, cityMaxWidth);
            ctx.fillStyle = 'rgba(255,255,255,0.96)';
            ctx.fillText(cityLabel, cityX, cityY, cityMaxWidth);
        }
        ctx.restore();
    }

    drawUnitStatusLines(ctx)
    {
        if (!ctx || typeof visibleUnitsForCurrentUser !== 'function') {
            return;
        }

        var units = visibleUnitsForCurrentUser();
        var zoom = Math.max(0.01, Number(_screenZoom) || 1);
        var fullWidth = Math.max(6, Math.round(100/zoom));
        var mobile = document.body && document.body.classList
            && document.body.classList.contains('mobile-ui');
        var fontSize = mobile ? 11 : 9;
        var ownerLineByKey = {};
        var ownerLinesPerTile = {};
        var unitLinesPerOwner = {};
        for (var ownerIndex=0; ownerIndex < units.length; ownerIndex++) {
            var ownerUnit = units[ownerIndex];
            if (!ownerUnit || !ownerUnit.coord) continue;
            var ownerId = ownerUnit.team == undefined ? 0 : ownerUnit.team;
            var ownerKey = ownerUnit.coord.i + ':' + ownerUnit.coord.j + ':' + ownerId;
            if (Object.prototype.hasOwnProperty.call(ownerLineByKey, ownerKey)) continue;
            var tileKey = ownerUnit.coord.i + ':' + ownerUnit.coord.j;
            ownerLineByKey[ownerKey] = ownerLinesPerTile[tileKey] || 0;
            ownerLinesPerTile[tileKey] = ownerLineByKey[ownerKey] + 1;
        }
        ctx.save();
        for (var k=0; k < units.length; k++) {
            var unit = units[k];
            if (!unit || !unit.coord || !unit.can_move || unit.health === 0) {
                continue;
            }

            var maxHealth = Math.max(1, Number(unit.maxHealth) || 100);
            var healthRatio = Math.max(0, Math.min(1,
                (unit.health == undefined ? maxHealth : Number(unit.health) || 0)/maxHealth));
            var experienceRatio = Math.max(0, Math.min(1,
                (unit.experience == undefined ? 1 : Number(unit.experience) || 0)/2));
            var unitOwnerId = unit.team == undefined ? 0 : unit.team;
            var unitOwnerKey = unit.coord.i + ':' + unit.coord.j + ':' + unitOwnerId;
            var ownerLine = ownerLineByKey[unitOwnerKey] || 0;
            var unitLine = unitLinesPerOwner[unitOwnerKey] || 0;
            unitLinesPerOwner[unitOwnerKey] = unitLine + 1;
            var centerX = x1toX(ijtox1(unit.coord.i, unit.coord.j));
            var x = Math.round(centerX - fullWidth/2);
            var labelY = y1toY(ijtoy1(unit.coord.i, unit.coord.j))
                - Math.max(42, 92/zoom) - ownerLine*(fontSize + 3);
            var y = Math.round(labelY + 2 + unitLine*5);
            var healthWidth = healthRatio > 0 ? Math.max(1, Math.round(fullWidth*healthRatio)) : 0;
            var experienceWidth = experienceRatio > 0
                ? Math.max(1, Math.round(fullWidth*experienceRatio)) : 0;

            if (healthWidth) {
                ctx.fillStyle = healthRatio > 0.5 ? '#00b83e'
                    : (healthRatio > 0.1 ? '#ffd400' : '#e02020');
                ctx.fillRect(x, y, healthWidth, 2);
            }
            if (experienceWidth) {
                ctx.fillStyle = experienceRatio < 0.6 ? '#1687ff' : '#9b36d6';
                ctx.fillRect(x, y + 2, experienceWidth, 2);
            }
        }
        ctx.restore();
    }

    drawArrow(ctx, fromX, fromY, toX, toY)
    {
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        const headLength = 15;
        const angle = Math.atan2(toY - fromY, toX - fromX);
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.lineTo(
            toX - headLength * Math.cos(angle - Math.PI / 6),
            toY - headLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(toX, toY);
        ctx.lineTo(
            toX - headLength * Math.cos(angle + Math.PI / 6),
            toY - headLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
    }

    drawStroke(ctx, in_i, in_j, mark, strokeStyle)
    {
        if (in_i-1 < 0 || in_i+1 >= _map_size || in_j-1 < 0 || in_j+1 >= _map_size) {
            return;
        }
        var out_i = -1, out_j = -1;
        if ((_map_terrain_bit[in_i-1][in_j]&0x400) == 0) {
            out_i = in_i-1; out_j = in_j;
        }
        if ((_map_terrain_bit[in_i+1][in_j]&0x400) == 0) {
            out_i = in_i+1; out_j = in_j;
        }
        if ((_map_terrain_bit[in_i][in_j-1]&0x400) == 0) {
            out_i = in_i; out_j = in_j-1;
        }
        if ((_map_terrain_bit[in_i][in_j+1]&0x400) == 0) {
            out_i = in_i; out_j = in_j+1;
        }
        if (out_i == -1 || out_j == -1) {
            return;
        }
        ctx.lineWidth = 5;
        ctx.strokeStyle = strokeStyle || 'rgba(0,150,0,0.3)';
        var i = 0, j = 0;
        var start_i = out_i;
        var start_j = out_j;
        var limit = 0;
        while ((_map_terrain_bit[out_i+i][out_j+j]>>16 != mark || (out_i+i==start_i && out_j+j == start_j)) && ++limit < 5000) {
            _map_terrain_bit[out_i+i][out_j+j] &= 0x0000FFFF;
            _map_terrain_bit[out_i+i][out_j+j] |= mark<<16;

            ctx.beginPath();
            ctx.moveTo(x1toX(ijtox1(out_i,out_j)), y1toY(ijtoy1(out_i,out_j)));
            ctx.lineTo(x1toX(ijtox1(out_i+i,out_j+j)), y1toY(ijtoy1(out_i+i,out_j+j)));
            ctx.stroke();
            out_i = out_i+i;
            out_j = out_j+j;

            var found = 0;
            // try to continue same direction if possible
            if ((i != 0 || j != 0) && in_i+i >= 0 && in_i+i < _map_size && in_j+j >= 0 && in_j+j < _map_size) {
                if ((_map_terrain_bit[out_i+i][out_j+j]&0x400) == 0) {
                    if ((_map_terrain_bit[in_i+i][in_j+j]&0x400) == 0) {
                       _map_terrain_bit[out_i+i][out_j+j] &= 0x0000FFFF;
                       _map_terrain_bit[out_i+i][out_j+j] |= mark<<16;
                    }
                    else {
                        in_i = in_i+i;
                        in_j = in_j+j;
                        found = 1;
                    }
                }
            }

            if (found) {
                continue;
            }

            found = 0;
            // find a straight direction
            for(i=-1; i < 2; i = i + 1) {
                for(j=-1; j < 2; j = j + 1) {
                    if ((i == 0 && j == 0) || in_i+i < 0 || in_i+i >= _map_size || in_j+j < 0 || in_j+j >= _map_size) {
                        continue;
                    }
                    if ((_map_terrain_bit[in_i+i][in_j+j]&0x400) != 0
                        && (_map_terrain_bit[out_i+i][out_j+j]&0x400) == 0
                        && (_map_terrain_bit[out_i+i][out_j+j]>>16 != mark || (limit > 4 && out_i+i==start_i && out_j+j == start_j))) {

                        in_i = in_i+i;
                        in_j = in_j+j;

                        found = 1;
                        break;
                    }
                }
                if (found) break;
            }

            if (found) {
                continue;
            }

            found = 0;
            // try to turn right or left (in_ij keeps same)
            for(i=-1; i < 2; i = i + 1) {
                for(j=-1; j < 2; j = j + 1) {
                    if ((i == 0 && j == 0) || in_i+i < 0 || in_i+i >= _map_size || in_j+j < 0 || in_j+j >= _map_size) {
                        continue;
                    }
                    if (out_i+i >= in_i - 1 && out_i+i <= in_i + 1 && out_j+j >= in_j - 1 && out_j+j <= in_j + 1
                        && (_map_terrain_bit[out_i+i][out_j+j]&0x400) == 0
                        && (_map_terrain_bit[out_i+i][out_j+j]>>16 != mark || (limit > 4 && out_i+i==start_i && out_j+j == start_j))) {

                        in_i = in_i;
                        in_j = in_j;
                        found = 1;
                        break;
                    }
                }
                if (found) break;
            }
            if (!found) {
                break;
            }
        };
    }
}

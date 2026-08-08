const _economics = new class
{
    constructor()
    {
        this.hudHistory = [];
        this.lastHudState = null;
        this.terrainImprovementTextures = {
            road: 850,
            irrigation: 851,
            pasture: 852,
            fortification: 853,
            cottage: 854,
            workshop: 855,
            mine: 856,
            farm: 857,
            plantation: 858,
            camp: 859,
            fishing_boats: 866,
            quarry: 867,
            winery: 868,
            network: 870,
        };
    }

    resourceImprovementRequirements()
    {
        // Mirrored by serverResourceImprovementRequirements() in server_game.php.
        return {
            bananas: 'plantation', cattle: 'pasture', copper: 'mine', crabs: 'fishing_boats',
            deer: 'camp', fish: 'fishing_boats', rice: 'farm', sheep: 'pasture', stone: 'quarry',
            wheat: 'farm', amber: 'camp', citrus: 'plantation', cotton: 'plantation',
            dyes: 'plantation', diamonds: 'mine', furs: 'camp', gypsum: 'quarry', honey: 'camp',
            incense: 'plantation', ivory: 'camp', marble: 'quarry', olives: 'plantation',
            pearls: 'fishing_boats', salt: 'quarry', silk: 'plantation', silver: 'mine',
            spices: 'plantation', sugar: 'plantation', tea: 'plantation', turtles: 'fishing_boats',
            whales: 'fishing_boats', wine: 'winery', horses: 'pasture', iron: 'mine',
            gold: 'mine', gems: 'mine',
        };
    }

    improvementYieldMultipliers()
    {
        // Mirrored by serverImprovementYieldMultipliers() in server_game.php.
        return {
            road: { money: 1.25 },
            irrigation: { food: 1.50 },
            pasture: { food: 1.50, production: 1.25 },
            farm: { food: 1.75 },
            plantation: { food: 1.25 },
            camp: { food: 1.25, production: 1.50 },
            fishing_boats: { food: 1.50, money: 1.50 },
            quarry: { production: 2.00 },
            winery: { food: 1.25 },
            cottage: { money: 2.00 },
            workshop: {},
            mine: { production: 2.00 },
            fortification: {},
            network: { food: 2.00 },
        };
    }

    resourceYield(resourceId, modifiers)
    {
        var table = {
            bananas:[2,0,0], cattle:[2,1,0], copper:[0,2,1], crabs:[2,0,1], deer:[1,1,0],
            fish:[2,0,0], rice:[2,0,0], sheep:[1,1,0], stone:[0,2,0], wheat:[2,0,0],
            amber:[0,0,1], citrus:[1,0,1], cotton:[0,0,1], dyes:[0,0,1], diamonds:[0,0,2],
            furs:[0,1,1], gypsum:[0,2,0], honey:[1,0,1], incense:[0,0,1], ivory:[0,1,1],
            marble:[0,2,1], olives:[1,0,1], pearls:[0,0,1], salt:[1,0,1], silk:[0,0,1],
            silver:[0,0,1], spices:[1,0,1], sugar:[1,0,1], tea:[0,0,1], turtles:[2,0,0],
            whales:[1,1,1], wine:[1,0,1], horses:[0,1,1], iron:[0,2,0], gold:[0,0,2], gems:[0,0,2]
        };
        var values = table[resourceId] || [0,0,0];
        var result = { food: values[0], production: values[1], money: values[2] };
        var required = this.resourceImprovementRequirements()[resourceId];
        if ((required == 'plantation' || required == 'winery') && modifiers && modifiers[required]) {
            result.money = 2;
        }
        if (required == 'camp' && modifiers && modifiers.camp) {
            result.money = Math.max(1, result.money);
        }
        return result;
    }

    applyImprovementYieldMultipliers(income, modifiers, isCityTile, terrainType, hasWaterSource)
    {
        modifiers = modifiers || {};
        if (terrainType == 1 && modifiers.irrigation
            && (!isCityTile || modifiers.irrigationCityFood)) {
            income.food += hasWaterSource ? 2 : 1;
        }
        var table = this.improvementYieldMultipliers();
        for (var improvement in table) {
            if (!modifiers[improvement]) continue;
            if (improvement == 'irrigation' && isCityTile && !modifiers.irrigationCityFood) continue;
            if (improvement == 'irrigation' && terrainType == 1) continue;
            var multipliers = table[improvement];
            if (improvement == 'cottage') {
                var age = modifiers.cottageAge || 0;
                multipliers = { money: age >= 200 ? 4 : (age >= 100 ? 3 : 2) };
            }
            for (var field in multipliers) {
                income[field] = Math.ceil((income[field] || 0) * multipliers[field]);
            }
            if (improvement == 'workshop') income.production = 4;
        }
        // Sand is intentionally barren. Irrigation creates one food, except a
        // sand lake (A bit), which supplies two food or four when irrigated.
        return income;
    }

    ensureState(gameState)
    {
        if (!gameState) {
            return;
        }
        gameState.money = gameState.money || 0;
        gameState.food = gameState.food == undefined ? 200 : gameState.food;
        gameState.lastGrossMoneyIncome = gameState.lastGrossMoneyIncome || 0;
        gameState.lastMaintenance = gameState.lastMaintenance || 0;
        gameState.lastTechnologyExpense = gameState.lastTechnologyExpense || 0;
        gameState.lastAvailableMoney = gameState.lastAvailableMoney || 0;
        gameState.lastAccountIncome = gameState.lastAccountIncome || 0;
        gameState.lastScienceIncome = gameState.lastScienceIncome || 0;
    }

    terrainImprovementUnitId(modifier, i, j)
    {
        return 'terrain_' + modifier + '_' + i + '_' + j;
    }

    findTerrainImprovementUnit(modifier, i, j, team)
    {
        if (typeof _units_by_user == 'undefined') {
            return null;
        }
        var list = _units_by_user[team] || [];
        var id = this.terrainImprovementUnitId(modifier, i, j);
        for (var k=0; k < list.length; k++) {
            if (list[k] && list[k].economicId == id) {
                return list[k];
            }
        }
        return null;
    }

    registerTerrainImprovement(modifier, i, j, team)
    {
        if (i < 0 || i >= _map_size || j < 0 || j >= _map_size || !modifier) {
            return null;
        }
        team = team == undefined ? (typeof _current_user == 'undefined' ? 0 : _current_user) : team;
        if (typeof _units_by_user != 'undefined' && _units_by_user[team] == undefined) {
            _units_by_user[team] = [];
        }
        if (this.findTerrainImprovementUnit(modifier, i, j, team)) {
            return null;
        }
        var unit = new Unit(4, this.terrainImprovementTextures[modifier] || 0, new Coord(i, j));
        unit.unitTypeId = 'building_' + modifier;
        unit.name = modifier.replace(/_/g, ' ');
        unit.can_move = false;
        unit.team = team;
        unit.economicClass = 'terrain_improvement';
        unit.improvementType = modifier;
        unit.economicId = this.terrainImprovementUnitId(modifier, i, j);
        unit.hiddenOnMap = true;
        unit.noControlZone = true;
        unit.noFogReveal = true;
        unit.maintenanceCost = 1;
        if (typeof _units_by_user != 'undefined') {
            _units_by_user[team].push(unit);
            if (typeof _current_user != 'undefined' && team == _current_user) {
                _units = _units_by_user[team];
            }
        }
        else if (typeof _units != 'undefined') {
            _units.push(unit);
        }
        return unit;
    }

    removeTerrainImprovementUnitsAt(i, j, modifier)
    {
        if (typeof _units_by_user == 'undefined') return;
        for (var team in _units_by_user) {
            var list = _units_by_user[team] || [];
            for (var k=list.length - 1; k >= 0; k--) {
                var unit = list[k];
                if (!unit || !unit.coord || unit.coord.i != i || unit.coord.j != j) continue;
                if (unit.economicClass != 'terrain_improvement' || unit.improvementType != modifier) continue;
                list.splice(k, 1);
            }
        }
        if (typeof _current_user != 'undefined' && _units_by_user[_current_user]) {
            _units = _units_by_user[_current_user];
        }
    }

    syncTerrainImprovementUnits(team)
    {
        if (typeof _map_terrain_mod == 'undefined' || typeof _units_by_user == 'undefined') {
            return;
        }
        team = team == undefined ? (typeof _current_user == 'undefined' ? 0 : _current_user) : team;
        var modifiers = Object.keys(this.terrainImprovementTextures);
        for (var i=0; i < _map_size; i++) {
            for (var j=0; j < _map_size; j++) {
                var mod = _map_terrain_mod[i][j];
                if (!mod) {
                    continue;
                }
                for (var m=0; m < modifiers.length; m++) {
                    if (mod[modifiers[m]]) {
                        this.registerTerrainImprovement(modifiers[m], i, j, team);
                    }
                }
            }
        }
    }

    maintenanceCost(unit)
    {
        if (!unit || unit.noMaintenance) {
            return 0;
        }
        if (unit.economicClass == 'terrain_improvement'
            && unit.coord
            && this.isCityTile(unit.coord.i, unit.coord.j, unit.team || 0)) {
            return 0;
        }
        if (unit.economicClass == 'terrain_improvement') {
            // Workshop gold is charged through its parent City's signed income.
            return 0;
        }
        if (unit.maintenanceCost != undefined) {
            return Math.max(0, unit.maintenanceCost);
        }
        if (unit.type == 3 || unit.economicClass == 'terrain_improvement') {
            return 1;
        }
        if (unit.unitTypeId != undefined || unit.type == 0 || unit.type == 1 || unit.type == 2) {
            return 1;
        }
        return 0;
    }

    isCityTile(i, j, team)
    {
        var lists = [];
        if (typeof _units_by_user != 'undefined') {
            if (_units_by_user[team] != undefined) {
                lists.push(_units_by_user[team]);
            }
        }
        else if (typeof _units != 'undefined') {
            lists.push(_units);
        }
        for (var n=0; n < lists.length; n++) {
            var list = lists[n] || [];
            for (var k=0; k < list.length; k++) {
                var unit = list[k];
                if (unit && unit.type == 3 && unit.coord && unit.coord.i == i && unit.coord.j == j) {
                    return true;
                }
            }
        }
        return false;
    }

    countMaintenance(units)
    {
        var total = 0;
        units = units || [];
        for (var k=0; k < units.length; k++) {
            total += this.maintenanceCost(units[k]);
        }
        return total;
    }

    processTurn(grossMoney, gameState, units)
    {
        gameState = gameState || (typeof _game_state == 'undefined' ? null : _game_state);
        units = units || (typeof _units == 'undefined' ? [] : _units);
        if (this.isServerAuthoritative(gameState)) return this.serverEconomyResult(gameState);
        var result = this.processTurnIncome(gameState, grossMoney, this.countMaintenance(units));
        this.applyNegativeBudgetPenalty(gameState, units);
        return result;
    }

    processTurnIncome(gameState, grossMoney, maintenance)
    {
        if (!gameState) {
            return null;
        }
        if (this.isServerAuthoritative(gameState)) return this.serverEconomyResult(gameState);
        this.ensureState(gameState);
        grossMoney = Math.max(0, Math.floor(grossMoney || 0));
        maintenance = Math.max(0, Math.floor(maintenance || 0));
        var preview = this.previewTurnIncome(gameState, grossMoney, maintenance);

        gameState.lastGrossMoneyIncome = grossMoney;
        gameState.lastMaintenance = maintenance;
        gameState.lastTechnologyExpense = preview.technology;
        gameState.lastAvailableMoney = preview.available;
        gameState.lastScienceIncome = preview.science;
        gameState.lastAccountIncome = preview.account;
        gameState.lastMoneyIncome = preview.available;
        gameState.money += preview.account;
        gameState.addScience(preview.science);
        return {
            grossMoney: grossMoney,
            maintenance: maintenance,
            technology: preview.technology,
            available: preview.available,
            science: preview.science,
            account: preview.account,
        };
    }

    isServerAuthoritative(gameState)
    {
        return !!(gameState && typeof _authenticated_player_id != 'undefined'
            && _authenticated_player_id != null && typeof _server_game != 'undefined');
    }

    serverEconomyResult(gameState)
    {
        return {
            grossMoney: Number(gameState.lastGrossMoneyIncome) || 0,
            maintenance: Number(gameState.lastMaintenance) || 0,
            technology: Number(gameState.lastTechnologyExpense) || 0,
            available: Number(gameState.lastAvailableMoney) || 0,
            science: Number(gameState.lastScienceIncome) || 0,
            account: Number(gameState.lastAccountIncome) || 0,
        };
    }

    applyNegativeBudgetPenalty(gameState, units)
    {
        if (!gameState || gameState.money >= 0) {
            return null;
        }
        units = units || (typeof _units == 'undefined' ? [] : _units);
        var index = this.findBudgetPenaltyUnitIndex(units);
        if (index == -1) {
            return null;
        }
        var unit = units[index];
        var label = this.unitLabel(unit);
        this.removeUnitFromList(units, index);
        var message = 'Unit "' + label + '" is destroyed due to lack of funds.';
        gameState.oneTurnMessage = message;
        if (typeof _one_turn_message !== 'undefined') {
            _one_turn_message = message;
        }
        if (typeof appendConsoleLog === 'function') {
            appendConsoleLog(message);
        }
        if (typeof _fulldraw !== 'undefined') {
            _fulldraw = 1;
        }
        return unit;
    }

    findBudgetPenaltyUnitIndex(units)
    {
        if (!units || !units.length) {
            return -1;
        }
        var fallback = -1;
        for (var k=0; k < units.length; k++) {
            if (!units[k] || this.maintenanceCost(units[k]) <= 0) {
                continue;
            }
            if (fallback == -1) {
                fallback = k;
            }
            if (units[k].type != 3 && !units[k].hiddenOnMap) {
                return k;
            }
        }
        return fallback;
    }

    unitLabel(unit)
    {
        if (!unit) {
            return 'unknown';
        }
        var name = unit.name || unit.unitTypeId || ('type ' + unit.type);
        if (unit.coord) {
            name += ' at (' + unit.coord.i + ',' + unit.coord.j + ')';
        }
        return name;
    }

    removeUnitFromList(units, index)
    {
        if (!units || index < 0 || index >= units.length) {
            return;
        }
        if (typeof _game !== 'undefined' && _game && _game.del_unit && units === _units) {
            _game.del_unit(index);
            return;
        }
        units.splice(index, 1);
        if (typeof _selection !== 'undefined' && units === _units) {
            if (_selection == index) {
                _selection = -1;
            }
            else if (_selection > index) {
                --_selection;
            }
        }
    }

    previewTurnIncome(gameState, grossMoney, maintenance)
    {
        if (!gameState) {
            return { grossMoney: 0, maintenance: 0, technology: 0, available: 0, science: 0, account: 0 };
        }
        this.ensureState(gameState);
        grossMoney = Math.max(0, Math.floor(grossMoney == undefined ? gameState.lastGrossMoneyIncome : grossMoney));
        maintenance = Math.max(0, Math.floor(maintenance == undefined ? gameState.lastMaintenance : maintenance));
        var rate = Math.max(0, Math.min(100, Math.round(gameState.scienceRate || 0)));
        var technologyExpense = Math.floor(grossMoney * rate / 100);
        var available = grossMoney - maintenance - technologyExpense;
        return {
            grossMoney: grossMoney,
            maintenance: maintenance,
            technology: technologyExpense,
            available: available,
            science: technologyExpense,
            account: available,
        };
    }

    accountStatusText(gameState)
    {
        gameState = gameState || (typeof _game_state == 'undefined' ? null : _game_state);
        if (!gameState) {
            return '';
        }
        this.ensureState(gameState);
        var preview = this.previewTurnIncome(gameState);
        var delta = preview.account || 0;
        var deltaText = delta >= 0 ? '+' + delta : '' + delta;
        return 'Money: ' + gameState.money
            + ' (' + deltaText + '/turn, income ' + preview.grossMoney
            + ', upkeep ' + preview.maintenance
            + ', technology ' + preview.technology + ')';
    }

    updateCounters(gameState, playerId, source)
    {
        gameState = gameState || (typeof _game_state == 'undefined' ? null : _game_state);
        if (!gameState || typeof document == 'undefined') return;
        if (typeof _authenticated_player_id != 'undefined' && _authenticated_player_id != null
            && !gameState.serverEconomyLoaded) return;
        this.ensureState(gameState);
        var food = document.getElementById('foodCounterValue');
        var gold = document.getElementById('goldCounterValue');
        var next = {
            playerId: playerId == undefined ? (typeof _current_user == 'undefined' ? null : _current_user) : playerId,
            food: Math.floor(gameState.food || 0),
            gold: Math.floor(gameState.money || 0),
            source: source || 'unspecified'
        };
        if (!this.lastHudState || this.lastHudState.playerId != next.playerId
            || this.lastHudState.food != next.food || this.lastHudState.gold != next.gold) {
            this.hudHistory.push(Object.assign({ time: Date.now() }, next));
            if (this.hudHistory.length > 50) this.hudHistory.shift();
            if (typeof console != 'undefined' && console.debug) console.debug('[economy HUD]', next);
            this.lastHudState = next;
        }
        if (food) food.textContent = next.food;
        if (gold) gold.textContent = next.gold;
    }
};

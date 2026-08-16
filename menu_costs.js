const _costs_menu = new class
{
    constructor()
    {
        this.panel = null;
        this.button = null;
        this.create();
    }

    create()
    {
        var button = document.createElement('button');
        button.id = 'costsButton';
        button.type = 'button';
        button.textContent = vocabularyText('menu.costs');
        button.title = vocabularyText('menu.turn_costs');
        var panel = document.createElement('div');
        panel.id = 'costsMenu';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', vocabularyText('menu.turn_costs'));
        var self = this;
        button.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            var opening = panel.style.display != 'block';
            panel.style.display = opening ? 'block' : 'none';
            if (opening) self.refresh();
        });
        ['mousedown', 'mouseup', 'click', 'contextmenu', 'touchstart', 'touchmove', 'touchend']
            .forEach(function(name) {
                panel.addEventListener(name, function(event) { event.stopPropagation(); });
            });
        document.body.appendChild(panel);
        document.body.appendChild(button);
        this.panel = panel;
        this.button = button;
    }

    addTitle(text)
    {
        var title = document.createElement('div');
        title.className = 'costs-title';
        title.textContent = text;
        this.panel.appendChild(title);
    }

    addRow(values, header)
    {
        var row = document.createElement('div');
        row.className = header ? 'costs-row costs-header' : 'costs-row';
        for (var index=0; index < values.length; index++) {
            var cell = document.createElement('span');
            cell.textContent = values[index];
            row.appendChild(cell);
        }
        this.panel.appendChild(row);
    }

    cityIsProducing(city)
    {
        if (typeof _city_economy != 'undefined' && _city_economy.cityIsProducing) {
            return _city_economy.cityIsProducing(city);
        }
        return !!(city && ((Array.isArray(city.productionQueue) && city.productionQueue.length)
            || (city.production && city.production.unitTypeId)));
    }

    parentCityForImprovement(improvement, cities)
    {
        var parentId = Number(improvement && improvement.parentCityId) || 0;
        var best = null;
        var bestDistance = Infinity;
        for (var index=0; index < cities.length; index++) {
            var city = cities[index];
            if (!city || !city.coord || city.team != improvement.team) continue;
            if (parentId && Number(city.serverId) == parentId) return city;
            var di = Number(city.coord.i) - Number(improvement.coord.i);
            var dj = Number(city.coord.j) - Number(improvement.coord.j);
            var distance = typeof _city_economy != 'undefined' && _city_economy.hexDistance
                ? _city_economy.hexDistance(di, dj) : Math.max(Math.abs(di), Math.abs(dj));
            if (distance < bestDistance) {
                best = city;
                bestDistance = distance;
            }
        }
        return best;
    }

    signed(value)
    {
        value = Number(value) || 0;
        return value > 0 ? '+' + value : String(value);
    }

    viewerPlayerId()
    {
        if (typeof _authenticated_player_id != 'undefined'
            && _authenticated_player_id != null
            && Number.isFinite(Number(_authenticated_player_id))) {
            return Number(_authenticated_player_id);
        }
        return typeof _current_user == 'undefined' ? 0 : Number(_current_user);
    }

    cityBalance(city, workshopCount)
    {
        var income = city.lastCityIncome || (city.economy && city.economy.lastIncome) || {};
        var food = Number(income.food) || 0;
        if (city.lastCityIncome) {
            var previousWorkshopCost = Math.max(0, Number(income.workshopFoodCost) || 0);
            var currentWorkshopCost = this.cityIsProducing(city) ? workshopCount*2 : 0;
            food += previousWorkshopCost-currentWorkshopCost;
        }
        return {
            food: food,
            production: Number(income.production) || 0,
            gold: Number(income.money) || 0,
        };
    }

    refresh()
    {
        if (!this.panel || typeof _current_game == 'undefined') return;
        this.panel.innerHTML = '';
        // Hidden AI snapshots temporarily replace _current_user. A visible
        // account menu must remain bound to the authenticated civilization.
        var playerId = this.viewerPlayerId();
        this.panel.setAttribute('data-player-id', String(playerId));
        var list = typeof _units_by_user != 'undefined'
            ? (_units_by_user[playerId] || []) : (typeof _units == 'undefined' ? [] : _units);
        var unitCounts = {};
        var improvementCounts = {};
        var improvementsByType = {};
        var cities = [];
        for (var index=0; index < list.length; index++) {
            var unit = list[index];
            if (!unit || Number(unit.health) <= 0) continue;
            if (unit.type == 3) cities.push(unit);
            if (unit.can_move !== false && unit.type != 3 && unit.unitTypeId) {
                unitCounts[unit.unitTypeId] = (unitCounts[unit.unitTypeId] || 0) + 1;
            }
            var improvement = unit.improvementType
                || (String(unit.unitTypeId || '').indexOf('building_') == 0
                    ? String(unit.unitTypeId).substring(9) : null);
            if (improvement) {
                improvementCounts[improvement] = (improvementCounts[improvement] || 0) + 1;
                if (!improvementsByType[improvement]) improvementsByType[improvement] = [];
                improvementsByType[improvement].push(unit);
            }
        }

        cities.sort(function(a, b) {
            return (Number(a.serverId) || 0)-(Number(b.serverId) || 0)
                || String(a.name || '').localeCompare(String(b.name || ''));
        });
        var workshopCountByCity = new Map();
        var workshops = improvementsByType.workshop || [];
        for (var workshopIndex=0; workshopIndex < workshops.length; workshopIndex++) {
            var parent = this.parentCityForImprovement(workshops[workshopIndex], cities);
            if (parent) workshopCountByCity.set(parent, (workshopCountByCity.get(parent) || 0) + 1);
        }

        this.addTitle(vocabularyText('cost.city_balances'));
        this.addRow([vocabularyText('cost.city'), vocabularyText('cost.population'),
            vocabularyText('cost.producing'), vocabularyText('cost.balance_food_production_gold')], true);
        if (!cities.length) {
            this.addRow([vocabularyText('cost.no_cities'), '0', vocabularyText('common.none'), '0/0/0']);
        }
        for (var cityIndex=0; cityIndex < cities.length; cityIndex++) {
            var city = cities[cityIndex];
            var balance = this.cityBalance(city, workshopCountByCity.get(city) || 0);
            var productionId = city.production && city.production.unitTypeId;
            this.addRow([
                (city.name || vocabularyUnitName('city')) + (city.serverId ? ' #' + city.serverId : ''),
                String(Math.max(1, Number(city.cityPopulation) || 1)),
                productionId ? vocabularyUnitName(productionId) : vocabularyText('common.none'),
                this.signed(balance.food) + '/' + this.signed(balance.production) + '/' + this.signed(balance.gold),
            ]);
        }

        this.addTitle(vocabularyText('cost.unit_upkeep'));
        this.addRow([vocabularyText('common.type'), vocabularyText('common.count'),
            vocabularyText('cost.each_food_gold'), vocabularyText('cost.total_food_gold')], true);
        var totalUnitFood = 0;
        var totalUnitGold = 0;
        var displayedUnits = 0;
        for (var typeIndex=0; typeIndex < _current_game.unitTypes.length; typeIndex++) {
            var unitType = _current_game.unitTypes[typeIndex];
            var count = Number(unitCounts[unitType.id] || 0);
            if (!count) continue;
            var food = _current_game.unitFoodUpkeep(unitType.id);
            var gold = _current_game.unitGoldUpkeep(unitType.id);
            totalUnitFood += food*count;
            totalUnitGold += gold*count;
            displayedUnits += count;
            this.addRow([vocabularyUnitName(unitType.id, unitType.name), String(count), food + '/' + gold,
                (food*count) + '/' + (gold*count)]);
        }
        if (!displayedUnits) this.addRow([vocabularyText('cost.no_units'), '0', '0/0', '0/0']);
        this.addRow([vocabularyText('common.overall'), String(displayedUnits), '-', totalUnitFood + '/' + totalUnitGold], true);

        this.addTitle(vocabularyText('cost.improvement_upkeep'));
        this.addRow([vocabularyText('common.type'), vocabularyText('common.count'),
            vocabularyText('cost.each_food_production_gold'), vocabularyText('cost.total_food_production_gold')], true);
        var definitions = _current_game.terrainImprovementUpkeep();
        var totalFood = 0;
        var totalProduction = 0;
        var totalGold = 0;
        var totalImprovements = 0;
        for (var name in definitions) {
            var cost = definitions[name];
            var improvementCount = Number(improvementCounts[name] || 0);
            var chargedCount = improvementCount;
            if (name == 'workshop') {
                chargedCount = 0;
                var workshopList = improvementsByType[name] || [];
                for (var workshopCostIndex=0; workshopCostIndex < workshopList.length; workshopCostIndex++) {
                    var workshopCity = this.parentCityForImprovement(workshopList[workshopCostIndex], cities);
                    if (workshopCity && this.cityIsProducing(workshopCity)) chargedCount++;
                }
            }
            totalImprovements += improvementCount;
            totalFood += cost.food*chargedCount;
            totalProduction += cost.production*chargedCount;
            totalGold += cost.gold*chargedCount;
            this.addRow([
                vocabularyCommandName(name),
                name == 'workshop' ? chargedCount + '/' + improvementCount : String(improvementCount),
                cost.food + '/' + cost.production + '/' + cost.gold,
                (cost.food*chargedCount) + '/' + (cost.production*chargedCount)
                    + '/' + (cost.gold*chargedCount),
            ]);
        }
        this.addRow([vocabularyText('common.overall'), String(totalImprovements), '-',
            totalFood + '/' + totalProduction + '/' + totalGold], true);
    }

    refreshIfVisible()
    {
        if (this.panel && this.panel.style.display == 'block') this.refresh();
    }
}();

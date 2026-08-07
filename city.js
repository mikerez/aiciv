class CityEconomyState
{
    constructor()
    {
        this.citizens = [];
        this.foodStored = 0;
        this.moneyStored = 0;
        this.lastIncome = { food: 0, production: 0, money: 0 };
        this.lastGrossIncome = { food: 0, production: 0, money: 0 };
        this.foodConsumption = 0;
        this.turnsToNewCitizen = 0;
    }
}

const _city_economy = new class
{
    constructor()
    {
        this.iconTextures = {
            food: 860,
            food5: 861,
            production: 862,
            production5: 863,
            money: 864,
            money5: 865,
        };
        this.tileIncome = {
            0: { food: 2, production: 0, money: 0 },
            1: { food: 0, production: 1, money: 0 },
            2: { food: 2, production: 0, money: 0 },
            3: { food: 0, production: 1, money: 0 },
            4: { food: 1, production: 2, money: 0 },
            5: { food: 0, production: 3, money: 0 },
            6: { food: 1, production: 1, money: 0 },
            7: { food: 3, production: 0, money: 1 },
        };
    }

    init()
    {
        // Economy icons are loaded as WebGL textures by index.html.
    }

    ensureCity(city)
    {
        if (city == undefined || city.type != 3) {
            return;
        }
        if (city.economy == undefined || city.economy == null) {
            city.economy = new CityEconomyState();
        }
        if (city.cityFoodStored != undefined && !city.economy.foodLoadedFromServer) {
            city.economy.foodStored = Math.max(0, Number(city.cityFoodStored) || 0);
            city.economy.foodLoadedFromServer = true;
        }
        var targetPopulation = Math.max(1, Number(city.cityPopulation) || city.economy.citizens.length || 1);
        while (city.economy.citizens.length > targetPopulation) {
            city.economy.citizens.pop();
        }
        while (city.economy.citizens.length < targetPopulation) {
            if (!this.addCitizen(city)) break;
        }
        // The server population can exceed the number of locally assignable
        // worked tiles. Never reduce authoritative population to fit this view.
        city.cityPopulation = targetPopulation;
        this.updateIncome(city);
        if (city.serverId && city.lastCityIncome) {
            var authoritative = city.lastCityIncome;
            city.economy.lastGrossIncome = {
                food: Number(authoritative.grossFood) || 0,
                production: Number(authoritative.grossProduction == undefined
                    ? authoritative.production : authoritative.grossProduction) || 0,
                money: Number(authoritative.grossMoney == undefined
                    ? authoritative.money : authoritative.grossMoney) || 0,
            };
            city.economy.foodConsumption = Number(authoritative.foodConsumption) || targetPopulation;
            city.economy.lastIncome = {
                food: Number(authoritative.food) || 0,
                production: Number(authoritative.production) || 0,
                money: Number(authoritative.money) || 0,
            };
        }
    }

    citizenGrowthCost(city)
    {
        return 20 + Math.max(1, Number(city.cityPopulation) || city.economy.citizens.length || 1)*10;
    }

    foodConsumption(city)
    {
        return Math.max(1, Number(city.cityPopulation) || city.economy.citizens.length || 1);
    }

    addCitizen(city)
    {
        var coord = this.findBestFreeTile(city);
        if (coord == null) {
            return false;
        }
        city.economy.citizens.push({ coord: coord, income: this.tileIncomeAt(coord.i, coord.j) });
        city.cityPopulation = Math.max(Number(city.cityPopulation) || 1, city.economy.citizens.length);
        this.updateIncome(city);
        return true;
    }

    sameCoord(a, b)
    {
        return a && b && a.i == b.i && a.j == b.j;
    }

    isWorked(city, coord)
    {
        for (var c=0; c < city.economy.citizens.length; c++) {
            if (this.sameCoord(city.economy.citizens[c].coord, coord)) {
                return true;
            }
        }
        return false;
    }

    findBestFreeTile(city)
    {
        var best = null;
        var bestKey = '';
        var bestScore = -Infinity;
        var candidates = this.economicTileCandidates(city);
        for (var k=0; k < candidates.length; k++) {
            var coord = candidates[k];
            if (this.isWorked(city, coord)) {
                continue;
            }
            var income = this.tileIncomeAt(coord.i, coord.j);
            var score = income.food*4 + income.production*3 + income.money*2;
            var key = coord.i + ':' + coord.j;
            if (score > bestScore || (score == bestScore && (best == null || key < bestKey))) {
                best = coord;
                bestKey = key;
                bestScore = score;
            }
        }
        return best;
    }

    hexDistance(di, dj)
    {
        return di*dj >= 0 ? Math.max(Math.abs(di), Math.abs(dj)) : Math.abs(di) + Math.abs(dj);
    }

    economicTileCandidates(city)
    {
        var found = {};
        var result = [];
        var add = function(i, j) {
            if (i < 0 || i >= _map_size || j < 0 || j >= _map_size) return false;
            var key = i + ':' + j;
            if (found[key]) return false;
            found[key] = true;
            result.push(new Coord(i, j));
            return true;
        };
        var queue = [new Coord(city.coord.i, city.coord.j)];
        var directions = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1]];
        var visited = {};
        for (var cursor=0; cursor < queue.length; cursor++) {
            var point = queue[cursor];
            if (point.i < 0 || point.i >= _map_size || point.j < 0 || point.j >= _map_size) continue;
            var pointKey = point.i + ':' + point.j;
            if (visited[pointKey]) continue;
            visited[pointKey] = true;
            var origin = point.i == city.coord.i && point.j == city.coord.j;
            if (!origin && (!_map_terrain_mod[point.i][point.j] || !_map_terrain_mod[point.i][point.j].road)) continue;
            add(point.i, point.j);
            for (var n=0; n < directions.length; n++) {
                queue.push(new Coord(point.i + directions[n][0], point.j + directions[n][1]));
            }
        }
        for (var di=-3; di <= 3; di++) {
            for (var dj=-3; dj <= 3; dj++) {
                if (this.hexDistance(di, dj) <= 3) add(city.coord.i + di, city.coord.j + dj);
            }
        }
        return result;
    }

    addIncome(a, b)
    {
        a.food += b.food || 0;
        a.production += b.production || 0;
        a.money += b.money || 0;
    }

    baseTerrainIncomeAt(i, j)
    {
        var terrain = _map_terrain_tex[i][j];
        var terrainType = terrain&0x0F;
        var income = Object.assign({ food: 0, production: 0, money: 0 }, this.tileIncome[terrainType] || {});
        if (terrainType == 0 && ((terrain>>4)&0x03) > 1) income.food = 1;
        // CITY-INCOME-007, rules/city.md: A-marked land terrain contains a local water source.
        if ((terrain&0x80) != 0 && terrainType != 0) {
            if (terrainType == 1) income.food = 2;
            else income.food += 1;
            if (terrainType == 4 || terrainType == 5) {
                income.production += 1;
            }
        }
        return income;
    }

    tileIncomeForModifiers(i, j, modifiers)
    {
        var terrain = _map_terrain_tex[i][j];
        var terrainType = terrain&0x0F;
        var income = this.baseTerrainIncomeAt(i, j);
        var resourceState = _map_resource[i][j];
        if (resourceState && resourceState.type && _resource_types[resourceState.type]) {
            var resource = _resource_types[resourceState.type];
            this.addIncome(income, _economics.resourceYield(resource.id, modifiers));
        }
        return _economics.applyImprovementYieldMultipliers(
            income,
            modifiers,
            this.isCityTile(i, j),
            terrainType,
            (terrain&0x80) != 0
        );
    }

    tileIncomeAt(i, j)
    {
        return this.tileIncomeForModifiers(i, j, _map_terrain_mod[i][j]);
    }

    isCityTile(i, j)
    {
        for (var k=0; k < _units.length; k++) {
            if (_units[k].type == 3 && _units[k].coord.i == i && _units[k].coord.j == j) {
                return true;
            }
        }
        return false;
    }

    parentCityForImprovement(improvement)
    {
        var best = null;
        var bestDistance = Infinity;
        for (var k=0; k < _units.length; k++) {
            var city = _units[k];
            if (!city || city.type != 3 || city.team != improvement.team || !city.coord) continue;
            if (improvement.parentCityId && city.serverId == improvement.parentCityId) return city;
            var distance = this.hexDistance(
                city.coord.i - improvement.coord.i, city.coord.j - improvement.coord.j
            );
            var cityId = Number(city.serverId) || k;
            var bestId = best ? (Number(best.serverId) || _units.indexOf(best)) : Infinity;
            if (distance < bestDistance || (distance == bestDistance && cityId < bestId)) {
                best = city;
                bestDistance = distance;
            }
        }
        return best;
    }

    infrastructureCosts(city)
    {
        var costs = { roads: 0, workshops: 0 };
        for (var k=0; k < _units.length; k++) {
            var improvement = _units[k];
            if (!improvement || improvement.type != 4 || !improvement.coord
                || (improvement.health != undefined && improvement.health <= 0)) continue;
            var type = improvement.improvementType
                || String(improvement.unitTypeId || '').replace(/^building_/, '');
            if (type != 'road' && type != 'workshop') continue;
            if (this.parentCityForImprovement(improvement) !== city) continue;
            if (type == 'road') costs.roads++;
            else costs.workshops++;
        }
        return costs;
    }

    updateIncome(city)
    {
        var total = { food: 0, production: 0, money: 0 };
        for (var c=0; c < city.economy.citizens.length; c++) {
            var citizen = city.economy.citizens[c];
            citizen.income = this.tileIncomeAt(citizen.coord.i, citizen.coord.j);
            this.addIncome(total, citizen.income);
        }
        var infrastructure = this.infrastructureCosts(city);
        city.economy.lastGrossIncome = total;
        city.economy.foodConsumption = this.foodConsumption(city) + infrastructure.workshops;
        city.economy.lastIncome = {
            food: total.food - city.economy.foodConsumption,
            production: Math.max(0, total.production - infrastructure.roads),
            money: total.money - infrastructure.workshops
        };
        city.economy.turnsToNewCitizen = city.economy.lastIncome.food > 0 ? Math.ceil((this.citizenGrowthCost(city) - city.economy.foodStored)/city.economy.lastIncome.food) : 0;
        if (city.cityProperties == null) {
            city.cityProperties = new CityProperties();
        }
        if (!city.serverId || city.cityProperties.productionPerTurn == undefined) {
            city.cityProperties.productionPerTurn = city.economy.lastIncome.production;
        }
    }

    processCities(serverTurn)
    {
        var totalMoneyIncome = 0;
        for (var k=0; k < _units.length; k++) {
            var city = _units[k];
            if (city.type != 3) {
                continue;
            }
            this.ensureCity(city);
            if (serverTurn != undefined) {
                city.lastEconomyServerTurn = serverTurn;
                totalMoneyIncome += city.economy.lastIncome.money;
                if (city.economy.foodStored >= this.citizenGrowthCost(city) && city.serverId
                    && typeof _server_game != 'undefined' && !city.growthPending) {
                    city.growthPending = true;
                    (function(growingCity) {
                        _server_game.growCity(growingCity, growingCity.economy.foodStored).then(function() {
                            growingCity.growthPending = false;
                        }).catch(function(error) {
                            growingCity.growthPending = false;
                            if (_server_game && _server_game.log) _server_game.log('City growth rejected: ' + error.message);
                        });
                    })(city);
                }
                continue;
            }
            if (serverTurn != undefined && city.lastEconomyServerTurn == serverTurn) {
                totalMoneyIncome += city.economy.lastIncome.money;
                continue;
            }
            if (serverTurn != undefined) city.lastEconomyServerTurn = serverTurn;
            city.economy.foodStored += city.economy.lastIncome.food;
            if (serverTurn != undefined && city.economy.foodStored < 0) {
                // Server multiplayer currently authorizes growth only; do not create a
                // client-only starvation result that the next snapshot would undo.
                city.economy.foodStored = 0;
            }
            while (serverTurn == undefined && city.economy.foodStored < 0 && city.economy.citizens.length > 1) {
                city.economy.citizens.pop();
                city.economy.foodStored = 0;
                this.updateIncome(city);
                _fulldraw = 1;
            }
            if (serverTurn == undefined && city.economy.foodStored < 0) {
                if (this.cityStarvesToDestroyedCity(city)) {
                    _fulldraw = 1;
                    continue;
                }
                city.economy.foodStored = 0;
            }
            // CITY-TURN-004, rules/city.md: city money is reported as gross income; economics.js applies upkeep and science split.
            totalMoneyIncome += city.economy.lastIncome.money;
            if (city.economy.foodStored >= this.citizenGrowthCost(city) && city.serverId
                && typeof _server_game != 'undefined') {
                var foodForGrowth = city.economy.foodStored;
                city.economy.foodStored = 0;
                city.cityFoodStored = 0;
                city.growthPending = true;
                (function(growingCity, reportedFood) {
                    _server_game.growCity(growingCity, reportedFood).then(function() {
                        growingCity.growthPending = false;
                    }).catch(function(error) {
                        growingCity.economy.foodStored += reportedFood;
                        growingCity.cityFoodStored = growingCity.economy.foodStored;
                        growingCity.growthPending = false;
                        if (_server_game && _server_game.log) _server_game.log('City growth rejected: ' + error.message);
                    });
                })(city, foodForGrowth);
            }
            else while (city.economy.foodStored >= this.citizenGrowthCost(city)) {
                city.economy.foodStored -= this.citizenGrowthCost(city);
                if (!this.addCitizen(city)) break;
                _fulldraw = 1;
            }
            city.cityFoodStored = city.economy.foodStored;
            this.updateIncome(city);
        }
        return totalMoneyIncome;
    }

    cityStarvesToDestroyedCity(city)
    {
        if (!city || !city.coord) return false;
        city.type = 4;
        city.unitTypeId = 'destroyed_city';
        city.name = 'Destroyed City';
        city.texture = 869;
        city.can_move = false;
        city.attack = 0;
        city.defense = 0;
        city.speed = 0;
        city.viewRange = 0;
        city.state = 'destroyed';
        city.destroyedCity = true;
        city.noControlZone = true;
        city.noFogReveal = true;
        city.production = null;
        city.productionQueue = [];
        city.economy = null;
        if (_map_terrain_mod[city.coord.i] && _map_terrain_mod[city.coord.i][city.coord.j]) {
            var modifiers = _map_terrain_mod[city.coord.i][city.coord.j];
            for (var key in modifiers) {
                modifiers[key] = key == 'cottageAge' ? 0 : false;
            }
            _map.prepareTerrainModifierSprites();
        }
        return true;
    }

    drawYieldCompositionMap(x, y, income)
    {
        this.drawYieldColumnMap(x - 48/_screenZoom, y - 96/_screenZoom, 'food', income.food);
        this.drawYieldColumnMap(x, y - 96/_screenZoom, 'production', income.production);
        this.drawYieldColumnMap(x + 48/_screenZoom, y - 96/_screenZoom, 'money', income.money);
    }

    drawYieldColumnMap(x, y, name, value)
    {
        var count5 = Math.floor(value/5);
        var count1 = value%5;
        var row = 0;
        for (var k=0; k < count5; k++) {
            this.drawIconMap(name + '5', x, y + row*56/_screenZoom);
            row++;
        }
        for (var k=0; k < count1; k++) {
            this.drawIconMap(name, x, y + row*56/_screenZoom);
            row++;
        }
    }

    drawIconMap(name, x, y)
    {
        var texture = this.iconTextures[name];
        if (texture == undefined) {
            return;
        }
        _screen.drawSpriteSized(x, y, texture, _screenZoom, 80, 80, 1.0);
    }

    drawCitizenTilesMap(start_i, start_j, height_i, width_j)
    {
        for (var k=0; k < _units.length; k++) {
            var city = _units[k];
            if (city.type != 3 || !city.economy) {
                continue;
            }
            this.updateIncome(city);
            for (var c=0; c < city.economy.citizens.length; c++) {
                var citizen = city.economy.citizens[c];
                if (citizen.coord.i < start_i || citizen.coord.i >= start_i + height_i || citizen.coord.j < start_j || citizen.coord.j > start_j + width_j) {
                    continue;
                }
                var x = ijtox1(citizen.coord.i, citizen.coord.j);
                var y = ijtoy1(citizen.coord.i, citizen.coord.j);
                this.drawYieldCompositionMap(x, y, citizen.income);
            }
        }
    }
}

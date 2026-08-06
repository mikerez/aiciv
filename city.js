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
            0: { food: 1, production: 0, money: 1 },
            1: { food: 0, production: 1, money: 1 },
            2: { food: 2, production: 0, money: 0 },
            3: { food: 0, production: 1, money: 0 },
            4: { food: 1, production: 2, money: 0 },
            5: { food: 0, production: 3, money: 0 },
            6: { food: 1, production: 1, money: 0 },
            7: { food: 3, production: 0, money: 1 },
        };
        this.resourceIncome = {
            bananas: { food: 2, production: 0, money: 0 },
            cattle: { food: 2, production: 1, money: 0 },
            copper: { food: 0, production: 2, money: 1 },
            crabs: { food: 2, production: 0, money: 1 },
            deer: { food: 1, production: 1, money: 0 },
            fish: { food: 2, production: 0, money: 0 },
            rice: { food: 2, production: 0, money: 0 },
            sheep: { food: 1, production: 1, money: 0 },
            stone: { food: 0, production: 2, money: 0 },
            wheat: { food: 2, production: 0, money: 0 },
            amber: { food: 0, production: 0, money: 2 },
            citrus: { food: 1, production: 0, money: 1 },
            cotton: { food: 0, production: 0, money: 2 },
            dyes: { food: 0, production: 0, money: 2 },
            diamonds: { food: 0, production: 0, money: 3 },
            furs: { food: 0, production: 1, money: 1 },
            gypsum: { food: 0, production: 2, money: 0 },
            honey: { food: 1, production: 0, money: 1 },
            incense: { food: 0, production: 0, money: 2 },
            ivory: { food: 0, production: 1, money: 2 },
            marble: { food: 0, production: 2, money: 1 },
            olives: { food: 1, production: 0, money: 1 },
            pearls: { food: 0, production: 0, money: 3 },
            salt: { food: 1, production: 0, money: 1 },
            silk: { food: 0, production: 0, money: 2 },
            silver: { food: 0, production: 0, money: 2 },
            spices: { food: 1, production: 0, money: 2 },
            sugar: { food: 1, production: 0, money: 1 },
            tea: { food: 0, production: 0, money: 2 },
            turtles: { food: 1, production: 0, money: 2 },
            whales: { food: 1, production: 1, money: 2 },
            wine: { food: 1, production: 0, money: 2 },
            horses: { food: 0, production: 1, money: 1 },
            iron: { food: 0, production: 2, money: 0 },
            gold: { food: 0, production: 0, money: 3 },
            gems: { food: 0, production: 0, money: 3 },
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
        var bestScore = -1;
        for (var radius=0; radius <= 3; radius++) {
            for (var di=-radius; di <= radius; di++) {
                for (var dj=-radius; dj <= radius; dj++) {
                    if (Math.max(Math.abs(di), Math.abs(dj)) != radius) {
                        continue;
                    }
                    var coord = city.coord.add(di, dj);
                    if (coord.i < 0 || coord.i >= _map_size || coord.j < 0 || coord.j >= _map_size || this.isWorked(city, coord)) {
                        continue;
                    }
                    if ((_map_terrain_tex[coord.i][coord.j]&0x0F) == 0) {
                        continue;
                    }
                    var income = this.tileIncomeAt(coord.i, coord.j);
                    var score = income.food*4 + income.production*3 + income.money*2;
                    if (score > bestScore) {
                        best = coord;
                        bestScore = score;
                    }
                }
            }
            if (best != null) {
                return best;
            }
        }
        return best;
    }

    addIncome(a, b)
    {
        a.food += b.food || 0;
        a.production += b.production || 0;
        a.money += b.money || 0;
    }

    tileIncomeAt(i, j)
    {
        var terrain = _map_terrain_tex[i][j];
        var terrainType = terrain&0x0F;
        var income = Object.assign({ food: 0, production: 0, money: 0 }, this.tileIncome[terrainType] || {});
        // CITY-INCOME-007, rules/city.md: A-marked land terrain contains a local water source.
        if ((terrain&0x80) != 0 && terrainType != 0) {
            income.food += 1;
            income.money += 1;
            if (terrainType == 4 || terrainType == 5) {
                income.production += 1;
            }
        }
        if (_map_terrain_mod[i][j].irrigation && (!this.isCityTile(i, j) || _map_terrain_mod[i][j].irrigationCityFood)) {
            income.food += 1;
        }
        if (_map_terrain_mod[i][j].road) {
            income.money += 1;
        }
        if (_map_terrain_mod[i][j].pasture) {
            income.food += 1;
        }
        if (_map_terrain_mod[i][j].farm) {
            income.food += 1;
        }
        if (_map_terrain_mod[i][j].plantation) {
            income.food += 1;
            income.money += 1;
        }
        if (_map_terrain_mod[i][j].camp) {
            income.food += 1;
            income.production += 1;
        }
        if (_map_terrain_mod[i][j].fishing_boats) {
            income.food += 1;
            income.money += 1;
        }
        if (_map_terrain_mod[i][j].quarry) {
            income.production += 2;
        }
        if (_map_terrain_mod[i][j].winery) {
            income.food += 1;
            income.money += 2;
        }
        if (_map_terrain_mod[i][j].cottage) {
            var cottageAge = _map_terrain_mod[i][j].cottageAge || 0;
            income.money += cottageAge >= 20 ? 4 : (cottageAge >= 10 ? 3 : 2);
        }
        if (_map_terrain_mod[i][j].workshop) {
            income.production += 2;
        }
        if (_map_terrain_mod[i][j].mine) {
            income.production += 2;
        }
        var resourceState = _map_resource[i][j];
        if (resourceState && resourceState.type && _resource_types[resourceState.type]) {
            var resource = _resource_types[resourceState.type];
            this.addIncome(income, this.resourceIncome[resource.id] || { food: 0, production: 0, money: 0 });
        }
        return income;
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

    updateIncome(city)
    {
        var total = { food: 0, production: 0, money: 0 };
        for (var c=0; c < city.economy.citizens.length; c++) {
            var citizen = city.economy.citizens[c];
            citizen.income = this.tileIncomeAt(citizen.coord.i, citizen.coord.j);
            this.addIncome(total, citizen.income);
        }
        city.economy.lastGrossIncome = total;
        city.economy.foodConsumption = this.foodConsumption(city);
        city.economy.lastIncome = {
            food: total.food - city.economy.foodConsumption,
            production: total.production,
            money: total.money
        };
        city.economy.turnsToNewCitizen = city.economy.lastIncome.food > 0 ? Math.ceil((this.citizenGrowthCost(city) - city.economy.foodStored)/city.economy.lastIncome.food) : 0;
        if (city.cityProperties == null) {
            city.cityProperties = new CityProperties();
        }
        city.cityProperties.productionPerTurn = Math.max(1, total.production);
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
                if (this.cityStarvesToSettler(k, city)) {
                    k--;
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

    cityStarvesToSettler(k, city)
    {
        if (typeof _current_game === 'undefined' || !_current_game.unitTypesById || !_current_game.unitTypesById['settlers']) {
            return false;
        }
        var coord = new Coord(city.coord.i, city.coord.j);
        var team = city.team || 0;
        _game.del_unit(k);
        var settler = _game.createUnit(_current_game.unitTypesById['settlers'], coord, 0, team);
        if (settler) {
            settler.state = 'ready';
        }
        if (_selection == k) {
            _selection = _units.length - 1;
        }
        else if (_selection > k) {
            _selection--;
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

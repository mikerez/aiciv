const _military = new class
{
    constructor()
    {
        this.defaultHealth = 100;
        this.defaultExperience = 1;
        this.roundExperience = 0.25;
        this.killExperience = 0.75;
        this.fortifiedDefenseBonus = 0.25;
        this.fortificationDefenseBonus = 0.50;
        this.relations = {};
    }

    relationKey(teamA, teamB)
    {
        teamA = parseInt(teamA || 0, 10);
        teamB = parseInt(teamB || 0, 10);
        return teamA < teamB ? teamA + ':' + teamB : teamB + ':' + teamA;
    }

    setWar(teamA, teamB)
    {
        if (teamA != teamB) {
            this.relations[this.relationKey(teamA, teamB)] = 'war';
        }
    }

    setPeace(teamA, teamB)
    {
        if (teamA != teamB) {
            this.relations[this.relationKey(teamA, teamB)] = 'neutral';
        }
    }

    setNeutral(teamA, teamB)
    {
        this.setPeace(teamA, teamB);
    }

    isAtWar(teamA, teamB)
    {
        teamA = parseInt(teamA || 0, 10);
        teamB = parseInt(teamB || 0, 10);
        if (teamA == teamB) {
            return false;
        }
        var relation = this.relations[this.relationKey(teamA, teamB)];
        return relation == 'war';
    }

    relationName(teamA, teamB)
    {
        if (parseInt(teamA || 0, 10) == parseInt(teamB || 0, 10)) {
            return 'self';
        }
        return this.isAtWar(teamA, teamB) ? 'war' : 'neutral';
    }

    setWarForUsers(userIds)
    {
        userIds = userIds || (typeof _user_ids !== 'undefined' ? _user_ids : []);
        for (var a=0; a < userIds.length; a++) {
            for (var b=a + 1; b < userIds.length; b++) {
                this.setWar(userIds[a], userIds[b]);
            }
        }
    }

    setNeutralForUsers(userIds)
    {
        userIds = userIds || (typeof _user_ids !== 'undefined' ? _user_ids : []);
        for (var a=0; a < userIds.length; a++) {
            for (var b=a + 1; b < userIds.length; b++) this.setNeutral(userIds[a], userIds[b]);
        }
    }

    relationStatusText(ownerTeam)
    {
        ownerTeam = ownerTeam == undefined ? (typeof _current_user === 'undefined' ? 0 : _current_user) : ownerTeam;
        var users = typeof _user_ids !== 'undefined' ? _user_ids : [ownerTeam];
        var parts = [];
        for (var n=0; n < users.length; n++) {
            parts.push('U' + users[n] + ':' + this.relationName(ownerTeam, users[n]));
        }
        return 'Relations: ' + parts.join(' ');
    }

    ensureUnit(unit)
    {
        if (!unit) {
            return;
        }
        if (unit.maxHealth == undefined) {
            unit.maxHealth = this.defaultHealth;
        }
        if (unit.health == undefined) {
            unit.health = unit.maxHealth;
        }
        if (unit.experience == undefined) {
            unit.experience = this.defaultExperience;
        }
    }

    unitLists()
    {
        var result = [];
        if (typeof _units_by_user !== 'undefined') {
            for (var userId in _units_by_user) {
                result.push({ userId: parseInt(userId, 10), list: _units_by_user[userId] || [] });
            }
        }
        else if (typeof _units !== 'undefined') {
            result.push({ userId: 0, list: _units });
        }
        return result;
    }

    canFight(unit)
    {
        return !!(unit && !unit.hiddenOnMap && unit.coord && unit.health !== 0);
    }

    isCity(unit)
    {
        return !!(unit && (unit.type == 3 || unit.unitTypeId == 'city'));
    }

    isMilitary(unit)
    {
        return !!(unit && unit.type == 2 && this.canFight(unit));
    }

    enemyUnitsOnTile(coord, attackerTeam)
    {
        var result = [];
        var lists = this.unitLists();
        for (var n=0; n < lists.length; n++) {
            var list = lists[n].list;
            for (var k=0; k < list.length; k++) {
                var unit = list[k];
                if (!this.canFight(unit)) {
                    continue;
                }
                var team = unit.team || lists[n].userId || 0;
                if (!this.isAtWar(attackerTeam, team)) {
                    continue;
                }
                if (unit.coord.i == coord.i && unit.coord.j == coord.j) {
                    this.ensureUnit(unit);
                    result.push({ unit: unit, list: list, index: k, userId: lists[n].userId });
                }
            }
        }
        return result;
    }

    foreignUnitsOnTile(coord, attackerTeam)
    {
        var result = [];
        var lists = this.unitLists();
        for (var n=0; n < lists.length; n++) {
            var list = lists[n].list;
            for (var k=0; k < list.length; k++) {
                var unit = list[k];
                if (!this.canFight(unit)) continue;
                var team = unit.team == undefined ? lists[n].userId : unit.team;
                if (team == attackerTeam || unit.coord.i != coord.i || unit.coord.j != coord.j) continue;
                result.push({ unit: unit, list: list, index: k, userId: lists[n].userId });
            }
        }
        return result;
    }

    attackStrength(unit)
    {
        this.ensureUnit(unit);
        return Math.max(0.25, unit.attack || 0) * Math.max(1, unit.experience || 1);
    }

    defenseStrength(unit)
    {
        this.ensureUnit(unit);
        var healthFactor = Math.max(0.25, (unit.health || this.defaultHealth) / Math.max(1, unit.maxHealth || this.defaultHealth));
        var defenseBonus = unit.state == 'fortified' ? this.fortifiedDefenseBonus : 0;
        if (unit.coord && typeof _map_terrain_mod != 'undefined'
            && _map_terrain_mod[unit.coord.i] && _map_terrain_mod[unit.coord.i][unit.coord.j]
            && _map_terrain_mod[unit.coord.i][unit.coord.j].fortification) {
            defenseBonus += this.fortificationDefenseBonus;
        }
        return Math.max(0.25, unit.defense || 0) * (1 + defenseBonus)
            * Math.max(1, unit.experience || 1) * healthFactor;
    }

    bestDefender(records)
    {
        if (!records.length) {
            return null;
        }
        var best = records[0];
        var bestStrength = this.defenseStrength(best.unit);
        for (var n=1; n < records.length; n++) {
            var strength = this.defenseStrength(records[n].unit);
            if (strength > bestStrength) {
                best = records[n];
                bestStrength = strength;
            }
        }
        return best;
    }

    promoteDefenderToTop(record)
    {
        if (!record || !record.list || record.index < 0 || record.index >= record.list.length) {
            return;
        }
        var top = record.list.length - 1;
        if (record.index == top) {
            return;
        }
        var tmp = record.list[top];
        record.list[top] = record.list[record.index];
        record.list[record.index] = tmp;
        this.updateSelectionAfterSwap(record.list, record.userId, record.index, top);
        record.index = top;
    }

    removeRecord(record)
    {
        if (!record || !record.list || record.index < 0 || record.index >= record.list.length) {
            return;
        }
        record.list.splice(record.index, 1);
        this.updateSelectionAfterRemove(record.list, record.userId, record.index);
    }

    selectedIndexForList(list, userId)
    {
        if (typeof _units !== 'undefined' && list === _units && typeof _selection !== 'undefined') {
            return _selection;
        }
        if (typeof _selection_by_user !== 'undefined' && userId != undefined) {
            return _selection_by_user[userId];
        }
        return -1;
    }

    setSelectedIndexForList(list, userId, value)
    {
        if (typeof _units !== 'undefined' && list === _units && typeof _selection !== 'undefined') {
            _selection = value;
        }
        if (typeof _selection_by_user !== 'undefined' && userId != undefined) {
            _selection_by_user[userId] = value;
        }
    }

    updateSelectionAfterSwap(list, userId, indexA, indexB)
    {
        var selected = this.selectedIndexForList(list, userId);
        if (selected == indexA) {
            this.setSelectedIndexForList(list, userId, indexB);
        }
        else if (selected == indexB) {
            this.setSelectedIndexForList(list, userId, indexA);
        }
    }

    updateSelectionAfterRemove(list, userId, removedIndex)
    {
        var selected = this.selectedIndexForList(list, userId);
        if (selected == removedIndex) {
            this.setSelectedIndexForList(list, userId, -1);
        }
        else if (selected > removedIndex) {
            this.setSelectedIndexForList(list, userId, selected - 1);
        }
    }

    calculateDamage(attacker, defender)
    {
        var attack = this.attackStrength(attacker);
        var defense = this.defenseStrength(defender);
        var attackRoll = attack * (0.75 + Math.random() * 0.5);
        var defenseRoll = defense * (0.75 + Math.random() * 0.5);
        var total = Math.max(0.01, attackRoll + defenseRoll);
        var attackShare = attackRoll / total;
        var defenseShare = defenseRoll / total;
        var defenderDamage = Math.ceil((18 + Math.random() * 22) * (0.65 + 1.35 * attackShare));
        var attackerDamage = Math.ceil((18 + Math.random() * 22) * (0.65 + 1.35 * defenseShare));

        if (attackRoll > defenseRoll * 1.8) {
            defenderDamage += 35;
        }
        if (defenseRoll > attackRoll * 1.8) {
            attackerDamage += 35;
        }

        return {
            attackRoll: attackRoll,
            defenseRoll: defenseRoll,
            attackerDamage: attackerDamage,
            defenderDamage: defenderDamage,
            roundWinner: attackRoll >= defenseRoll ? 'attacker' : 'defender',
        };
    }

    awardExperience(unit, amount)
    {
        this.ensureUnit(unit);
        unit.experience = Math.round(((unit.experience || this.defaultExperience) + amount) * 100) / 100;
    }

    unitLabel(unit)
    {
        return (unit && (unit.name || unit.unitTypeId)) || 'unit';
    }

    logCombat(message)
    {
        if (typeof appendConsoleLog === 'function') {
            appendConsoleLog(message);
        }
        else if (typeof console !== 'undefined' && console.log) {
            console.log(message);
        }
    }

    cityRecordOnTile(records, ownerTeam)
    {
        for (var n=0; n < records.length; n++) {
            if (this.isCity(records[n].unit)
                && (ownerTeam == undefined || (records[n].unit.team || 0) == ownerTeam)) {
                return records[n];
            }
        }
        return null;
    }

    militaryRecords(records, ownerTeam)
    {
        return records.filter(function(record) {
            return _military.isMilitary(record.unit)
                && (ownerTeam == undefined || (record.unit.team || 0) == ownerTeam);
        });
    }

    remainingDefendingRecords(coord, attackerTeam)
    {
        return this.enemyUnitsOnTile(coord, attackerTeam).filter(function(record) {
            return !_military.isCity(record.unit);
        });
    }

    retreatAttacker(attacker, fromCoord)
    {
        if (!attacker || !fromCoord) return false;
        attacker.coord = new Coord(fromCoord.i, fromCoord.j);
        return true;
    }

    reduceCityPopulation(city)
    {
        if (!city) return null;
        var before = city.economy && Array.isArray(city.economy.citizens)
            ? city.economy.citizens.length
            : Math.max(1, city.cityPopulation || 1);
        var after = Math.max(1, before - 1);
        if (city.economy && Array.isArray(city.economy.citizens)) {
            while (city.economy.citizens.length > after) city.economy.citizens.pop();
        }
        city.cityPopulation = after;
        if (typeof _city_economy != 'undefined' && _city_economy.updateIncome) {
            _city_economy.updateIncome(city);
        }
        return { before: before, after: after };
    }

    eliminateCivilianRecord(attacker, record)
    {
        if (!record || !record.unit || this.isCity(record.unit) || this.isMilitary(record.unit)) return false;
        record.unit.health = 0;
        var currentIndex = record.list.indexOf(record.unit);
        if (currentIndex >= 0) {
            this.removeRecord({ list: record.list, index: currentIndex, userId: record.userId });
        }
        this.awardExperience(attacker, this.killExperience);
        this.logCombat('Combat: U' + (attacker.team || 0) + ' ' + this.unitLabel(attacker)
            + ' eliminates U' + (record.unit.team || 0) + ' ' + this.unitLabel(record.unit));
        return true;
    }

    captureCityRecord(attacker, record)
    {
        if (!record || !record.unit || !this.isCity(record.unit)) return false;
        var city = record.unit;
        var oldTeam = city.team || 0;
        var newTeam = attacker.team || 0;
        if (oldTeam == newTeam) return false;
        city.team = newTeam;
        city.health = city.maxHealth || this.defaultHealth;
        if (typeof _units_by_user != 'undefined') {
            var oldList = record.list;
            var currentIndex = oldList.indexOf(city);
            if (_units_by_user[newTeam] == undefined) _units_by_user[newTeam] = [];
            if (oldList !== _units_by_user[newTeam] && currentIndex >= 0) {
                this.updateSelectionAfterRemove(oldList, record.userId, currentIndex);
                oldList.splice(currentIndex, 1);
                _units_by_user[newTeam].push(city);
            }
        }
        this.logCombat('U' + newTeam + ' ' + this.unitLabel(attacker) + ' captures U'
            + oldTeam + ' City at (' + city.coord.i + ',' + city.coord.j + ')');
        return true;
    }

    resolveAttackOnTile(attackerList, attackerIndex, fromCoord, toCoord)
    {
        var attacker = attackerList && attackerList[attackerIndex];
        if (!this.isMilitary(attacker) || !toCoord) {
            return { combat: false };
        }

        this.ensureUnit(attacker);
        var attackerTeam = attacker.team || 0;
        var foreign = this.foreignUnitsOnTile(toCoord, attackerTeam);
        for (var relationIndex=0; relationIndex < foreign.length; relationIndex++) {
            this.setWar(attackerTeam, foreign[relationIndex].unit.team || 0);
        }
        var enemies = this.enemyUnitsOnTile(toCoord, attackerTeam);
        var cityRecord = null;
        for (var cityIndex=0; cityIndex < enemies.length; cityIndex++) {
            if (this.isCity(enemies[cityIndex].unit)) {
                cityRecord = enemies[cityIndex];
                break;
            }
        }
        var cityOwner = cityRecord ? (cityRecord.unit.team || 0) : undefined;
        var defenders = this.militaryRecords(enemies, cityOwner);
        if (!defenders.length && !cityRecord) defenders = this.militaryRecords(enemies);
        var defender = this.bestDefender(defenders);

        if (!defender) {
            var civilianDefender = null;
            for (var civilianIndex=0; civilianIndex < enemies.length; civilianIndex++) {
                if (!this.isCity(enemies[civilianIndex].unit)
                    && !this.isMilitary(enemies[civilianIndex].unit)
                    && (!cityRecord || (enemies[civilianIndex].unit.team || 0) == cityOwner)) {
                    civilianDefender = enemies[civilianIndex];
                    break;
                }
            }
            var civiliansRemoved = civilianDefender
                ? this.eliminateCivilianRecord(attacker, civilianDefender) : false;
            var remainingUnits = this.remainingDefendingRecords(toCoord, attackerTeam);
            var attackerRetreated = civiliansRemoved && remainingUnits.length > 0
                ? this.retreatAttacker(attacker, fromCoord) : false;
            var cityCaptured = !remainingUnits.length ? this.captureCityRecord(attacker, cityRecord) : false;
            if (cityCaptured || civiliansRemoved) {
                attacker.gotoPath = [];
                attacker.gotoCoord = null;
                attacker.move_penalty = Math.max(attacker.move_penalty || 0, 1);
                return {
                    combat: true,
                    attackerRemoved: false,
                    defenderRemoved: civiliansRemoved,
                    cityCaptured: cityCaptured,
                    attackerRetreated: attackerRetreated,
                    attacker: attacker,
                    defender: cityRecord ? cityRecord.unit : null,
                };
            }
            return { combat: false };
        }

        this.promoteDefenderToTop(defender);
        var damage = this.calculateDamage(attacker, defender.unit);
        attacker.health = Math.max(0, Math.round((attacker.health || this.defaultHealth) - damage.attackerDamage));
        defender.unit.health = Math.max(0, Math.round((defender.unit.health || this.defaultHealth) - damage.defenderDamage));

        var attackerDead = attacker.health <= 0;
        var defenderDead = defender.unit.health <= 0;
        if (damage.roundWinner == 'attacker' && !attackerDead) {
            this.awardExperience(attacker, this.roundExperience);
        }
        if (damage.roundWinner == 'defender' && !defenderDead) {
            this.awardExperience(defender.unit, this.roundExperience);
        }
        if (defenderDead && !attackerDead) {
            this.awardExperience(attacker, this.killExperience);
        }
        if (attackerDead && !defenderDead) {
            this.awardExperience(defender.unit, this.killExperience);
        }

        var message = 'Combat: U' + attackerTeam + ' ' + this.unitLabel(attacker)
            + ' attacks U' + (defender.unit.team || 0) + ' ' + this.unitLabel(defender.unit)
            + ' at (' + toCoord.i + ',' + toCoord.j + '), damage A=' + damage.attackerDamage
            + ' D=' + damage.defenderDamage + ', health A=' + attacker.health
            + ' D=' + defender.unit.health;

        if (defenderDead) {
            this.removeRecord(defender);
            message += '; defender lost';
            if (cityRecord && (defender.unit.team || 0) == cityOwner) {
                var population = this.reduceCityPopulation(cityRecord.unit);
                if (population) message += '; city population ' + population.before + '->' + population.after;
            }
        }
        if (attackerDead) {
            this.removeRecord({ list: attackerList, index: attackerIndex });
            message += '; attacker lost';
        }
        if (!attackerDead) {
            attacker.gotoPath = [];
            attacker.gotoCoord = null;
            attacker.move_penalty = Math.max(attacker.move_penalty || 0, 1);
        }

        var cityCaptured = false;
        var attackerRetreated = false;
        var remainingDefenders = defenderDead
            ? this.remainingDefendingRecords(toCoord, attackerTeam) : [];
        if (!attackerDead && fromCoord && (!defenderDead || remainingDefenders.length > 0)) {
            attackerRetreated = this.retreatAttacker(attacker, fromCoord);
            if (remainingDefenders.length) message += '; attacker returned before remaining defenders';
        }
        if (!attackerDead && defenderDead && cityRecord) {
            if (!remainingDefenders.length) {
                cityCaptured = this.captureCityRecord(attacker, cityRecord);
            }
        }

        this.logCombat(message);
        return {
            combat: true,
            attackerRemoved: attackerDead,
            defenderRemoved: defenderDead,
            attacker: attacker,
            defender: defender.unit,
            damage: damage,
            cityCaptured: cityCaptured,
            attackerRetreated: attackerRetreated,
        };
    }
};

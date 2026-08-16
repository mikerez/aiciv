#!/usr/bin/env node
'use strict';

const {
    assert, resetDatabase, bootstrap, mapTiles, unit, city, value, setPlayerState,
    gameDatabaseId,
} = require('./test_client');
const {createBrowserClient, localUnit, runClientTurn} = require('./browser_client');

(async () => {
    resetDatabase();
    const playerId = 82804;
    const gameId = 'worker-2804-resource-irrigation';
    const size = 14;
    const tiles = mapTiles(size, 2);
    const at = (i, j) => tiles.find(tile => tile.i === i && tile.j === j);
    at(4, 4).modifiers = {farm:true, road:true};
    at(9, 6).resource_type = 7; // Rice -> Farm.
    at(9, 6).modifiers = {road:true};

    const capital = city({
        client_key:'resource-chain-city',owner_id:playerId,i:6,j:6,
        properties:{
            cityPopulation:2,cityFoodStored:500,
            cityProperties:{productionPerTurn:8,productionStored:0},
            production:null,productionDisabled:true,
            lastCityIncome:{food:0,grossFood:2,production:8,grossProduction:8,money:2,
                foodConsumption:2},
            economy:{citizens:[{coord:{i:9,j:6}}],foodStored:500,
                lastIncome:{food:0,production:8,money:2}},
        },
    });
    const workerDefinition = unit({
        client_key:'worker-2804',owner_id:playerId,i:9,j:6,state:'automate',
        properties:{automationMode:'automate'},
    });
    const fixture = await bootstrap({
        playerId,gameId,size,tiles,units:[capital,workerDefinition],
    });
    const localUnits = [capital,workerDefinition].map(definition =>
        localUnit(definition, fixture.unitIds[definition.client_key]));
    const worker = localUnits[1];
    worker.automationMode = 'automate';
    const client = createBrowserClient({
        size,playerId,gameId,tiles,units:localUnits,
        technologies:['Irrigation'],serverTurn:fixture.result.turn,
    });
    const openTechnologies = {};
    Object.keys(client._game_state.openTechnologies).forEach(name => { openTechnologies[name] = true; });
    setPlayerState(gameDatabaseId(gameId), playerId, {
        food:5000,money:5000,scienceRate:0,openTechnologies,
    });
    client._game_state.food = 5000;
    client._game_state.money = 5000;

    const history = [];
    let irrigationTiles = 0;
    let farmTurn = null;
    for (let turn=1; turn<=90; turn++) {
        const liveWorker = client._units_by_user[playerId].find(item =>
            item.serverId === fixture.unitIds['worker-2804']);
        assert.ok(liveWorker, `turn ${turn}: Worker remains alive`);
        liveWorker.automationMode = 'automate';
        await runClientTurn(client);
        const modifiers = JSON.parse(value(
            `SELECT modifiers_json FROM server_game_map WHERE game_id=${gameDatabaseId(gameId)} AND i=9 AND j=6`
        ));
        irrigationTiles = Number(value(
            `SELECT COUNT(*) FROM server_game_map WHERE game_id=${gameDatabaseId(gameId)} `
            + `AND JSON_EXTRACT(modifiers_json,'$.irrigation')=true`
        ));
        history.push({
            turn,i:liveWorker.coord.i,j:liveWorker.coord.j,state:liveWorker.state,
            action:liveWorker.lastAutomationDecision && liveWorker.lastAutomationDecision.action,
            target:liveWorker.lastAutomationDecision && liveWorker.lastAutomationDecision.target,
            irrigationTiles,
        });
        if (modifiers.farm) {
            farmTurn = turn;
            break;
        }
    }

    assert.ok(irrigationTiles >= 2,
        `Worker must extend a multi-Tile Irrigation chain; history=${JSON.stringify(history)}`);
    assert.ok(farmTurn !== null,
        `Worker must finish the Farm on disconnected Rice; history=${JSON.stringify(history)}`);
    assert.ok(history.some(entry => entry.action === 'irrigate'),
        'automation diagnostics record Irrigation-chain work');
    console.log(`PASS automated Worker extended ${irrigationTiles} Irrigation Tiles and built Rice Farm on turn ${farmTurn}`);
})().catch(error => { console.error(error); process.exitCode = 1; });

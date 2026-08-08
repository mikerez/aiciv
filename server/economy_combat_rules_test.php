<?php
declare(strict_types=1);

define('SERVER_GAME_LIBRARY_ONLY', true);
require dirname(__DIR__) . '/server_game.php';

function check(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function testUnit(string $type, int $i = 1, int $j = 1): array
{
    return [
        'unit_type_id' => $type, 'unit_class' => 2, 'can_move' => 1,
        'i' => $i, 'j' => $j, 'state' => 'ready', 'health' => 100,
        'max_health' => 100, 'experience' => 1, 'defense_value' => 4,
    ];
}

$plain = ['terrain_tex' => 2, 'resource_type' => 0, 'modifiers_json' => '{}'];
$hill = ['terrain_tex' => 4, 'resource_type' => 0, 'modifiers_json' => '{}'];
$forest = ['terrain_tex' => 6, 'resource_type' => 0, 'modifiers_json' => '{}'];
$tiles = ['1:1' => $hill];
$bonus = serverBattleChanceInputs(testUnit('warrior'), testUnit('spearman'), $tiles);
check(abs($bonus['landscape_bonus'] - 0.25) < 0.0001, 'hills must give 25% defence');
$tiles['1:1'] = $forest;
$bonus = serverBattleChanceInputs(testUnit('warrior'), testUnit('archer'), $tiles, true);
check(abs($bonus['landscape_bonus'] - 0.50) < 0.0001, 'forest must give 50% defence');
check(abs($bonus['building_bonus'] - 0.30) < 0.0001, 'archer must gain 30% city defence');
$bonus = serverBattleChanceInputs(testUnit('knight'), testUnit('pikeman'), $tiles);
check(abs($bonus['unit_bonus'] - 0.30) < 0.0001, 'pikeman must defend 30% better against knight');
$bonus = serverBattleChanceInputs(testUnit('trebuchet'), testUnit('elephant'), $tiles);
check(abs($bonus['unit_bonus'] + 0.15) < 0.0001, 'elephant must defend 15% worse against trebuchet');

check(serverUnitFoodUpkeep(testUnit('warrior')) === 1, 'warrior food upkeep');
check(serverUnitFoodUpkeep(testUnit('horseman')) === 2, 'horseman food upkeep');
check(serverUnitFoodUpkeep(testUnit('knight')) === 3, 'knight food upkeep');
check(serverUnitGoldUpkeep(testUnit('longbow')) === 1, 'longbow gold upkeep');
check(serverUnitGoldUpkeep(testUnit('frigate')) === 2, 'frigate gold upkeep');
$workshop = testUnit('building_workshop');
$workshop['can_move'] = 0;
check(serverUnitGoldUpkeep($workshop) === 0, 'Workshop cost belongs to its parent City, not generic unit upkeep');

$income = serverTileIncome(['terrain_tex' => 2, 'resource_type' => 10, 'modifiers_json' => '{"farm":true}']);
check($income['food'] === 7.0, 'farm must multiply grass plus Wheat food');
$sand = ['terrain_tex' => 1, 'resource_type' => 0, 'modifiers_json' => '{}'];
check(serverTileIncome($sand) === ['food' => 0, 'production' => 1, 'money' => 0], 'plain sand is barren');
check(serverTileIncome(array_replace($sand, ['modifiers_json' => '{"irrigation":true}']))['food'] === 1, 'irrigated sand gives one food');
check(serverTileIncome(array_replace($sand, ['terrain_tex' => 0x81]))['food'] === 2, 'sand lake gives two food');
check(serverTileIncome(array_replace($sand, ['terrain_tex' => 0x81, 'modifiers_json' => '{"irrigation":true}']))['food'] === 4, 'irrigated sand lake gives four food');
check(serverTileIncome(array_replace($plain, ['resource_type' => 11]))['money'] === 1, 'unimproved Amber is capped at one gold');
check(serverTileIncome(array_replace($plain, ['resource_type' => 35]))['money'] === 2, 'unimproved Gold gives two gold');
check(serverTileIncome(array_replace($plain, ['resource_type' => 36]))['money'] === 2, 'unimproved Gems give two gold');
$wine = serverTileIncome(array_replace($plain, ['resource_type' => 32, 'modifiers_json' => '{"winery":true}']));
check($wine['money'] === 2, 'Wine with Winery gives two resource gold');
$deerCamp = serverTileIncome(['terrain_tex' => 6, 'resource_type' => 5, 'modifiers_json' => '{"camp":true}']);
check($deerCamp['food'] > 0 && $deerCamp['production'] > 0 && $deerCamp['money'] > 0,
    'Deer with a Camp gives food, production, and gold');
$workshopIncome = serverTileIncome(array_replace($plain, ['modifiers_json' => '{"workshop":true}']));
check($workshopIncome['production'] === 4, 'Workshop gives exactly four production');
$shallowWater = ['terrain_tex' => 0, 'resource_type' => 0, 'modifiers_json' => '{}'];
check(serverTileIncome($shallowWater)['food'] === 1, 'shallow water gives one food');
check(serverTileIncome(array_replace($shallowWater, ['terrain_tex' => 0x20]))['food'] === 1, 'deep water gives one food');
check(serverTileIncome(array_replace($shallowWater, ['resource_type' => 6]))['food'] === 3, 'shallow Fish gives three food');
check(serverTileIncome(array_replace($shallowWater, ['resource_type' => 30]))['food'] === 3, 'shallow Turtles gives three food');
check(serverTileIncome(array_replace($shallowWater, ['modifiers_json' => '{"network":true}']))['food'] === 2.0,
    'Nets make ordinary shallow water give two food');
check(serverTileIncome(array_replace($shallowWater, ['resource_type' => 6, 'modifiers_json' => '{"network":true}'])) ===
    ['food' => 5, 'production' => 0, 'money' => 2], 'Fish with Nets gives five food and two gold');
check(serverTileIncome(array_replace($shallowWater, ['resource_type' => 30, 'modifiers_json' => '{"network":true}'])) ===
    ['food' => 5, 'production' => 0, 'money' => 2], 'Turtles with Nets gives five food and two gold');
$foodYield = ['food' => 5, 'production' => 1, 'money' => 0];
$productionYield = ['food' => 1, 'production' => 5, 'money' => 0];
$goldYield = ['food' => 1, 'production' => 1, 'money' => 4];
check(serverCityOptimizationScore($foodYield, 'food') > serverCityOptimizationScore($productionYield, 'food'),
    'food optimization prioritizes food');
check(serverCityOptimizationScore($productionYield, 'production') > serverCityOptimizationScore($foodYield, 'production'),
    'production optimization prioritizes production');
check(serverCityOptimizationScore($goldYield, 'gold') > serverCityOptimizationScore($foodYield, 'gold'),
    'gold optimization prioritizes gold');
$cottageBase = array_replace($plain, ['terrain_tex' => 7]);
$cottage99 = serverTileIncome(array_replace($cottageBase, ['modifiers_json' => '{"cottage":true,"cottageAge":99}']));
$cottage100 = serverTileIncome(array_replace($cottageBase, ['modifiers_json' => '{"cottage":true,"cottageAge":100}']));
$cottage200 = serverTileIncome(array_replace($cottageBase, ['modifiers_json' => '{"cottage":true,"cottageAge":200}']));
check($cottage99['money'] === 2.0 && $cottage100['money'] === 3.0 && $cottage200['money'] === 4.0,
    'Cottage stages are 100 and 200 turns');
check(serverResourceImprovementRequirements()['horses'] === 'pasture', 'Horses need Pasture');
check(!serverImprovementMatchesTileResource($plain, 'pasture'), 'Pasture requires an animal resource');
check(serverImprovementMatchesTileResource(array_replace($plain, ['resource_type' => 33]), 'pasture'), 'Horses accept Pasture');
check(!serverImprovementMatchesTileResource(array_replace($plain, ['resource_type' => 33]), 'mine'), 'Horses reject Mine');
check(serverProductionResourceRequirements()['knight'] === ['horses', 'iron'], 'Knight needs Horses and Iron');
check(serverProductionResourceRequirements()['fencer'] === [['copper', 'iron']], 'Fencer needs Copper or Iron');
check(serverProductionResourceRequirements()['catapult'] === [['copper', 'iron']], 'Catapult needs Copper or Iron');
check(serverProductionResourceRequirements()['spearman'] === [['copper', 'iron']], 'Spearman needs Copper or Iron');
$resourceDefinitions = serverResourceDefinitions();
check($resourceDefinitions[9][1] === 0.024, 'Stone generation chance must be elevated');
check($resourceDefinitions[21][1] === 0.014, 'Marble generation chance must be elevated');
check($resourceDefinitions[3][1] === 0.020, 'Copper generation chance must be doubled');
check($resourceDefinitions[34][1] === 0.040, 'Iron generation chance must be doubled');
check($resourceDefinitions[34][0] === [1, 4, 5], 'Iron must be eligible on sand, hills, and stone terrain');
$generatedTiles = generateServerMapTilesCandidate(100, 'iron-minimum-regression');
$playableCopper = count(array_filter($generatedTiles, static fn(array $tile): bool =>
    serverPlayableCoordinate((int) $tile['i'], (int) $tile['j'], 100)
    && (int) $tile['resource_type'] === 3
));
$playableIron = count(array_filter($generatedTiles, static fn(array $tile): bool =>
    serverPlayableCoordinate((int) $tile['i'], (int) $tile['j'], 100)
    && (int) $tile['resource_type'] === 34
));
check($playableCopper >= serverMinimumCopperCount(100), 'generated worlds must contain the minimum playable Copper deposits');
check($playableIron >= serverMinimumIronCount(100), 'generated worlds must contain the minimum playable Iron deposits');

$superTiles = [
    '10:10' => ['i' => 10, 'j' => 10, 'terrain_tex' => 0x36, 'modifiers_json' => '{}'],
    '10:11' => ['i' => 10, 'j' => 11, 'terrain_tex' => 0x36, 'modifiers_json' => '{}'],
    '11:10' => ['i' => 11, 'j' => 10, 'terrain_tex' => 0x76, 'modifiers_json' => '{}'],
    '11:11' => ['i' => 11, 'j' => 11, 'terrain_tex' => 0x76, 'modifiers_json' => '{}'],
];
$splitKeys = serverSplitSupertileAt($superTiles, 11, 11);
check(count($splitKeys) === 4, 'forest supertile must split into four ordinary tiles');
check(array_reduce($superTiles, static fn(bool $ok, array $tile): bool => $ok && $tile['terrain_tex'] === 0x36, true),
    'splitting must clear only the supertile bit');
check(serverChoppedForestTerrain($superTiles['11:11']['terrain_tex']) === 2,
    'the selected forest Tile becomes grass after splitting and chopping');
check(serverChoppedForestTerrain(0x94) === 0x84,
    'chopping a forested hill clears D0 without changing its alternative-view bit');
check(!in_array('road', primaryTerrainImprovementNames(), true), 'road is not a primary improvement');
check(in_array('cottage', primaryTerrainImprovementNames(), true), 'cottage is a replaceable primary improvement');

$roadTiles = [
    '1:1' => array_replace($plain, ['modifiers_json' => '{"road":true}']),
    '2:1' => array_replace($plain, ['modifiers_json' => '{"road":true}']),
    '3:1' => array_replace($plain, ['resource_type' => 33, 'modifiers_json' => '{"road":true}']),
    '4:1' => array_replace($plain, ['resource_type' => 34, 'modifiers_json' => '{}']),
];
$connected = serverConnectedRoadResources($roadTiles, 1, 1);
check(!empty($connected['horses']) && empty($connected['iron']), 'only road-connected resources count');
$city = ['i' => 1, 'j' => 1];
check(serverCityHasProductionResources($roadTiles, $city, 'horseman'), 'Horseman should use connected Horses');
check(!serverCityHasProductionResources($roadTiles, $city, 'knight'), 'Knight should also require connected Iron');
$metalRoadTiles = $roadTiles;
$metalRoadTiles['3:1'] = array_replace($plain, ['resource_type' => 34, 'modifiers_json' => '{"road":true}']);
check(serverCityHasProductionResources($metalRoadTiles, $city, 'fencer'), 'Fencer accepts connected Iron instead of Copper');
check(serverCityHasProductionResources($metalRoadTiles, $city, 'spearman'), 'Spearman accepts connected Iron instead of Copper');
check(serverCityHasProductionResources($metalRoadTiles, $city, 'catapult'), 'Catapult accepts connected Iron instead of Copper');

$economicTiles = [];
for ($i = 10; $i <= 14; ++$i) {
    $economicTiles[$i . ':10'] = array_replace($plain, [
        'i' => $i, 'j' => 10,
        'modifiers_json' => $i === 10 ? '{}' : '{"road":true}',
    ]);
}
$economicTiles['20:20'] = array_replace($plain, [
    'i' => 20, 'j' => 20, 'resource_type' => 35, 'modifiers_json' => '{}',
]);
$economicTiles['10:11'] = array_replace($plain, ['i' => 10, 'j' => 11, 'modifiers_json' => '{}']);
$economicTiles['11:11'] = array_replace($shallowWater, ['i' => 11, 'j' => 11, 'modifiers_json' => '{"network":true}']);
$economicKeys = serverCityEconomicTileKeys(['i' => 10, 'j' => 10], $economicTiles);
check(isset($economicKeys['12:10']), 'road-connected City plot produces');
check(isset($economicKeys['14:10']), 'remote plot produces through a continuous road');
check(isset($economicKeys['10:11']), 'adjacent unroaded land can be worked by the City');
check(isset($economicKeys['11:11']), 'nearby water with Nets contributes without a road');
check(!isset($economicKeys['20:20']), 'remote disconnected plot produces nothing for the City');

$fed = serverCityFoodResolution(3, 2, -1);
check(!$fed['starved'] && $fed['population'] === 3 && $fed['stored_food'] === 1.0, 'stored food prevents starvation');
$starved = serverCityFoodResolution(3, 0, -1);
check($starved['starved'] && $starved['population'] === 2 && !$starved['collapsed'], 'negative City food removes one population');
$collapsed = serverCityFoodResolution(1, 0, -1);
check($collapsed['starved'] && $collapsed['population'] === 0 && $collapsed['collapsed'], 'one-population starvation collapses City');

$interactionUnits = [
    1 => ['owner_id' => 7],
    2 => ['owner_id' => 8],
];
$warRelations = [serverRelationKey(7, 8) => 'war'];
check(!serverPlansAllowCombat([1 => ['interaction_intent'=>'coexist', 'target_owner_id'=>8]], $interactionUnits, 1, 2, $warRelations),
    'explicit coexist suppresses combat against a stationary unit');
check(serverPlansAllowCombat([1 => ['interaction_intent'=>'attack', 'target_owner_id'=>8]], $interactionUnits, 1, 2, []),
    'explicit attack permits combat from neutral state');

$transportUnits = [
    1 => array_replace(testUnit('galley', 2, 2), ['id'=>1, 'owner_id'=>7, 'nature'=>'water']),
    2 => array_replace(testUnit('worker', 2, 2), ['id'=>2, 'owner_id'=>7, 'nature'=>'land']),
    3 => array_replace(testUnit('warrior', 2, 2), ['id'=>3, 'owner_id'=>7, 'nature'=>'land']),
];
check(serverTransportStateAt($transportUnits, 7, 2, 2)['capacity'] === 2, 'Galley carries two units');
check(serverTransportStateAt($transportUnits, 7, 2, 2)['passengers'] === 2, 'Galley passenger count');
$waterTiles = ['1:1'=>['terrain_tex'=>2], '2:2'=>['terrain_tex'=>0], '3:3'=>['terrain_tex'=>2]];
$boarding = array_replace(testUnit('worker', 1, 1), ['id'=>4, 'owner_id'=>7, 'nature'=>'land', 'speed'=>1]);
$diagnostic = null;
check(validatePath($boarding, [['i'=>2,'j'=>2]], $waterTiles, 10, $diagnostic, $transportUnits) === [], 'full Galley rejects another passenger');
unset($transportUnits[3]);
check(count(validatePath($boarding, [['i'=>2,'j'=>2]], $waterTiles, 10, $diagnostic, $transportUnits)) === 1, 'Galley with a free slot accepts boarding');
$carried = array_replace($boarding, ['i'=>2, 'j'=>2]);
check(count(validatePath($carried, [['i'=>3,'j'=>3]], $waterTiles, 10, $diagnostic, $transportUnits)) === 1, 'land unit can disembark');
$roadMover = array_replace(testUnit('warrior', 1, 1), ['id'=>5, 'owner_id'=>7, 'nature'=>'land', 'speed'=>1]);
$roadMovementTiles = [
    '1:1'=>['terrain_tex'=>2, 'modifiers_json'=>'{"road":true}'],
    '2:1'=>['terrain_tex'=>2, 'modifiers_json'=>'{"road":true}'],
    '3:1'=>['terrain_tex'=>2, 'modifiers_json'=>'{"road":true}'],
];
$roadPath = [['i'=>2,'j'=>1], ['i'=>3,'j'=>1]];
check(count(validatePath($roadMover, $roadPath, $roadMovementTiles, 10, $diagnostic)) === 2,
    'speed-one unit moves two steps over a connected road');
check(abs((float) $diagnostic['movement_cost'] - 1.0) < 0.0001,
    'two connected-road steps consume one movement point');
$roadMovementTiles['3:1']['modifiers_json'] = '{}';
check(count(validatePath($roadMover, $roadPath, $roadMovementTiles, 10, $diagnostic)) === 1,
    'leaving a road costs a full movement point and cannot exceed the turn budget');
$transportUnits[1]['start_i'] = 2; $transportUnits[1]['start_j'] = 2;
$transportUnits[1]['i'] = 4; $transportUnits[1]['j'] = 4;
$transportUnits[2]['start_i'] = 2; $transportUnits[2]['start_j'] = 2;
$crews = serverAssignTransportCrews([
    1 => array_replace($transportUnits[1], ['i'=>2, 'j'=>2]),
    2 => $transportUnits[2],
]);
serverMoveTransportCrews($transportUnits, $crews);
check($transportUnits[2]['i'] === 4 && $transportUnits[2]['j'] === 4, 'assigned crew follows resolved ship position');

$irrigationTiles = [
    '1:1' => ['terrain_tex'=>2, 'modifiers_json'=>'{}'],
    '2:1' => ['terrain_tex'=>2, 'modifiers_json'=>'{"irrigation":true}'],
    '3:1' => ['terrain_tex'=>0, 'modifiers_json'=>'{}'],
];
check(serverIrrigationConnectedToWater($irrigationTiles, 1, 1), 'irrigation route reaches shallow fresh water');
$disconnectedIrrigation = $irrigationTiles;
$disconnectedIrrigation['2:1']['modifiers_json'] = '{}';
check(!serverIrrigationConnectedToWater($disconnectedIrrigation, 1, 1), 'missing irrigation link disconnects water');
$seaIrrigation = $irrigationTiles;
$seaIrrigation['4:1'] = ['terrain_tex'=>(2 << 4), 'modifiers_json'=>'{}'];
check(!serverTileIsIrrigationWaterSource($seaIrrigation, 3, 1), 'shallow water touching deep sea is not fresh water');

echo "PASS mirrored economy, resource, upkeep, and combat rules\n";

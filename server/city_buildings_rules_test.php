<?php
declare(strict_types=1);

define('SERVER_GAME_LIBRARY_ONLY', true);
require dirname(__DIR__) . '/server_game.php';

function cityBuildingCheck(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$definitions = serverUnitDefinitions();
foreach (serverCityBuildingTypeIds() as $type) {
    cityBuildingCheck(isset($definitions[$type]), $type . ' must be a production definition');
    cityBuildingCheck($definitions[$type]['class'] === 4, $type . ' must be nonmovable infrastructure');
}
cityBuildingCheck(serverCityHealingPercent([]) === 10.0, 'ordinary City healing remains 10%');
cityBuildingCheck(serverCityHealingPercent(['lazaret' => true]) === 20.0, 'Lazaret adds 10% City healing');
cityBuildingCheck(serverProducedStartingExperience(['stable' => true], 'knight', $definitions['knight']) === 1.10,
    'Stable gives mounted units 10% starting XP');
cityBuildingCheck(serverProducedStartingExperience(['shooting_range' => true], 'archer', $definitions['archer']) === 1.10,
    'Shooting-range gives archers 10% starting XP');
cityBuildingCheck(serverProducedStartingExperience(['barracks' => true], 'swordsman', $definitions['swordsman']) === 1.10,
    'Barracks gives melee units 10% starting XP');
cityBuildingCheck(serverProducedStartingExperience(['port' => true], 'frigate', $definitions['frigate']) === 1.10,
    'Port gives ships 10% starting XP');
cityBuildingCheck(serverProducedStartingExperience(['stable' => true], 'archer', $definitions['archer']) === 1.0,
    'training buildings do not affect unrelated unit classes');

$tiles = [
    '1:1' => ['i' => 1, 'j' => 1, 'terrain_tex' => 2, 'modifiers_json' => '{"road":true}'],
    '2:1' => ['i' => 2, 'j' => 1, 'terrain_tex' => 2, 'modifiers_json' => '{"road":true}'],
    '3:1' => ['i' => 3, 'j' => 1, 'terrain_tex' => 2, 'modifiers_json' => '{"road":true}'],
];
$cities = [
    10 => ['id' => 10, 'owner_id' => 1, 'unit_class' => 3, 'health' => 100, 'i' => 1, 'j' => 1],
    11 => ['id' => 11, 'owner_id' => 1, 'unit_class' => 3, 'health' => 100, 'i' => 3, 'j' => 1],
];
cityBuildingCheck(serverCityRoadConnectedToAnotherCity($cities[10], 10, 1, $cities, $tiles),
    'Market recognizes another owned City through continuous roads');
$tiles['2:1']['modifiers_json'] = '{}';
cityBuildingCheck(!serverCityRoadConnectedToAnotherCity($cities[10], 10, 1, $cities, $tiles),
    'Market rejects a broken road');
cityBuildingCheck(serverMarketFoodTransfer(true, true, 4) === 1,
    'a connected Market transfers exactly one stored food');
cityBuildingCheck(serverMarketFoodTransfer(true, true, 0) === 0,
    'Market cannot create food when global storage is empty');
cityBuildingCheck(serverMarketFoodTransfer(false, true, 4) === 0,
    'a connected City without a Market receives no transfer');

echo "PASS City building definitions, healing, XP, and Market road rules\n";

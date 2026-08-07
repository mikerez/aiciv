<?php
declare(strict_types=1);

define('SERVER_GAME_LIBRARY_ONLY', true);
require dirname(__DIR__) . '/server_game.php';

$definitions = serverUnitDefinitions();
$expected = [
    'workboat' => ['class' => 1, 'texture' => 271, 'attack' => 0, 'defense' => 1, 'speed' => 2, 'view_range' => 3, 'technology' => 'Sailing', 'cost' => 30, 'nature' => 'water'],
    'frigate' => ['class' => 2, 'texture' => 272, 'attack' => 6, 'defense' => 5, 'speed' => 3, 'view_range' => 4, 'technology' => 'Shipbuilding', 'cost' => 100, 'nature' => 'water'],
    'knight' => ['class' => 2, 'texture' => 273, 'attack' => 6, 'defense' => 5, 'speed' => 2, 'view_range' => 3, 'technology' => 'Engineering', 'cost' => 85, 'nature' => 'land'],
    'pikeman' => ['class' => 2, 'texture' => 274, 'attack' => 4, 'defense' => 6, 'speed' => 1, 'view_range' => 2, 'technology' => 'Iron Working', 'cost' => 55, 'nature' => 'land'],
    'longbow' => ['class' => 2, 'texture' => 275, 'attack' => 5, 'defense' => 3, 'speed' => 1, 'view_range' => 3, 'technology' => 'Archery', 'cost' => 55, 'nature' => 'land'],
    'fencer' => ['class' => 2, 'texture' => 276, 'attack' => 4, 'defense' => 3, 'speed' => 2, 'view_range' => 2, 'technology' => 'Bronze Working', 'cost' => 45, 'nature' => 'land'],
    'swordsman' => ['class' => 2, 'texture' => 277, 'attack' => 7, 'defense' => 5, 'speed' => 1, 'view_range' => 2, 'technology' => 'Iron Working', 'cost' => 75, 'nature' => 'land'],
    'trireme' => ['class' => 2, 'texture' => 278, 'attack' => 1, 'defense' => 1, 'speed' => 2, 'view_range' => 3, 'technology' => 'Sailing', 'cost' => 30, 'nature' => 'water'],
];

foreach ($expected as $id => $properties) {
    if (!isset($definitions[$id])) {
        throw new RuntimeException("Missing server unit definition: {$id}");
    }
    foreach ($properties as $property => $value) {
        if (($definitions[$id][$property] ?? null) !== $value) {
            throw new RuntimeException("Wrong {$id}.{$property}");
        }
    }
}

echo "PASS new client/server unit characteristics\n";

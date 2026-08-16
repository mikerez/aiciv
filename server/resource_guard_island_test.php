<?php
declare(strict_types=1);

define('SERVER_GAME_LIBRARY_ONLY', true);
require_once __DIR__ . '/../server_game.php';

function guardTestAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$mapSize = 16;
$tiles = [];
for ($i = 0; $i < $mapSize; ++$i) {
    for ($j = 0; $j < $mapSize; ++$j) {
        $tiles[coordinateKey($i, $j)] = [
            'i' => $i, 'j' => $j, 'terrain_tex' => 0x20,
            'terrain_bits' => 0, 'resource_type' => 0, 'modifiers_json' => '{}',
        ];
    }
}

// Sixteen-Tile mainland with one protected resource.
for ($i = 7; $i <= 10; ++$i) {
    for ($j = 7; $j <= 10; ++$j) $tiles[coordinateKey($i, $j)]['terrain_tex'] = 2;
}
$tiles[coordinateKey(8, 8)]['resource_type'] = 34;

// Separate five-Tile island, large enough for its 21 land guards.
foreach ([[2, 7], [2, 8], [3, 7], [3, 8], [4, 8]] as [$i, $j]) {
    $tiles[coordinateKey($i, $j)]['terrain_tex'] = 2;
}
$tiles[coordinateKey(3, 7)]['resource_type'] = 35;

$units = resourceGuardUnitSpecs(46, array_values($tiles), $mapSize);
$galleys = array_values(array_filter($units, static fn(array $unit): bool => $unit['unit_type_id'] === 'galley'));
guardTestAssert(count($galleys) === 1, 'Only the island resource must receive one Galley.');
$galley = $galleys[0];
$galleyTile = $tiles[coordinateKey((int) $galley['i'], (int) $galley['j'])];
guardTestAssert((((int) $galleyTile['terrain_tex']) & 0x0f) === 0, 'The Galley must be placed on water.');
guardTestAssert(((((int) $galleyTile['terrain_tex']) >> 4) & 0x03) > 1, 'The Galley must be placed on sea water.');
guardTestAssert(($galley['properties']['islandTransport'] ?? false) === true, 'The Galley must be marked as island transport.');
guardTestAssert((int) $galley['properties']['guardResource']['type'] === 35, 'The Galley must belong to the island resource guard.');

$touchesIsland = false;
foreach ([[2, 7], [2, 8], [3, 7], [3, 8], [4, 8]] as [$i, $j]) {
    if (serverHexDistance((int) $galley['i'], (int) $galley['j'], $i, $j) === 1) $touchesIsland = true;
}
guardTestAssert($touchesIsland, 'The Galley must be on the island coast.');

echo "PASS island resource guards receive one coastal Galley; mainland guards do not\n";

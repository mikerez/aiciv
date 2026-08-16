<?php
declare(strict_types=1);

define('SERVER_GAME_LIBRARY_ONLY', true);
require dirname(__DIR__) . '/server_game.php';

function expectSupertile(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$size = 6;
$terrain = [];
for ($i = 0; $i < $size; ++$i) {
    for ($j = 0; $j < $size; ++$j) {
        $terrain[] = $i < 2 ? 0 : ($i >= 3 && $i < 5 ? 6 : 2);
    }
}
$bits = array_fill(0, $size * $size, 0);
$randomState = 17;
serverEnhanceMap($terrain, $bits, $size, $randomState);

foreach ([1, 4] as $row) {
    for ($j = 0; $j < $size; ++$j) {
        expectSupertile(($terrain[$row * $size + $j] & 0x40) !== 0,
            "row {$row}, column {$j} must be a water/forest supertile lower cell");
    }
}
foreach ([0, 2, 3, 5] as $row) {
    for ($j = 0; $j < $size; ++$j) {
        expectSupertile(($terrain[$row * $size + $j] & 0x40) === 0,
            "row {$row}, column {$j} must not overlap a neighboring supertile");
    }
}

echo "PASS PHP water/forest supertile generation\n";

<?php
declare(strict_types=1);

require __DIR__ . '/update_map_supertiles.php';

function expectMapUpdate(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$size = 6;
$rows = [];
for ($i = 0; $i < $size; ++$i) {
    for ($j = 0; $j < $size; ++$j) {
        $terrain = $i < 2 ? 0 : ($i >= 3 && $i < 5 ? 6 : 2);
        $rows[] = ['i' => $i, 'j' => $j, 'terrain_tex' => $terrain];
    }
}
$analysis = debugAnalyzeMapSupertiles($rows, $size, 4);
expectMapUpdate($analysis['blocks_to_add'] === ['water' => 3, 'forest' => 3],
    'the debug updater must partition repeated terrain into six non-overlapping blocks');
expectMapUpdate($analysis['changed_cells'] === 12, 'each block must mark exactly two lower cells');
expectMapUpdate(count($analysis['samples']) === 4, 'sample output must honor the requested limit');

$updated = [];
foreach ($analysis['updates'] as $tile) $updated[$tile['i'] . ':' . $tile['j']] = $tile['terrain_tex'];
expectMapUpdate(isset($updated['1:0'], $updated['1:1'], $updated['1:2'], $updated['1:3']),
    'water lower-row cells must be selected');
expectMapUpdate(isset($updated['4:4'], $updated['4:5']), 'forest lower-row cells must be selected');
expectMapUpdate(!isset($updated['0:0'], $updated['3:0']), 'top cells must remain ordinary terrain');

echo "PASS standalone map supertile updater analysis\n";

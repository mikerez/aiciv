<?php
declare(strict_types=1);

define('SERVER_GAME_LIBRARY_ONLY', true);
require dirname(__DIR__) . '/server_game.php';

/**
 * Analyze a stored map and return the lower-row cells that can be marked as
 * non-overlapping 2x2 water/forest supertiles. The input rows are not modified.
 */
function debugAnalyzeMapSupertiles(array $rows, int $mapSize, int $sampleLimit = 20): array
{
    $terrain = array_fill(0, $mapSize * $mapSize, null);
    $existing = ['water' => 0, 'forest' => 0, 'other' => 0];
    foreach ($rows as $row) {
        $i = (int) $row['i'];
        $j = (int) $row['j'];
        if ($i < 0 || $j < 0 || $i >= $mapSize || $j >= $mapSize) continue;
        $value = (int) $row['terrain_tex'];
        $terrain[$i * $mapSize + $j] = $value;
        if (($value & 0x40) !== 0) {
            $type = $value & 0x0f;
            $existing[$type === 0 ? 'water' : ($type === 6 ? 'forest' : 'other')]++;
        }
    }

    $updates = [];
    $blocks = ['water' => 0, 'forest' => 0];
    $byDepth = ['water' => [0, 0, 0, 0], 'forest' => [0, 0, 0, 0]];
    $samples = [];
    for ($i = 0; $i < $mapSize - 1; ++$i) {
        for ($j = 0; $j < $mapSize - 1; ++$j) {
            $indexes = [
                $i * $mapSize + $j,
                $i * $mapSize + $j + 1,
                ($i + 1) * $mapSize + $j,
                ($i + 1) * $mapSize + $j + 1,
            ];
            $values = array_map(static fn(int $index) => $terrain[$index], $indexes);
            if (in_array(null, $values, true)) continue;
            if (array_filter($values, static fn(int $value): bool => ($value & 0x40) !== 0)) continue;
            $base = $values[0] & 0x3f;
            $type = $base & 0x0f;
            if ($type !== 0 && $type !== 6) continue;
            if (($values[1] & 0x3f) !== $base || ($values[2] & 0x3f) !== $base
                || ($values[3] & 0x3f) !== $base) continue;

            $name = $type === 0 ? 'water' : 'forest';
            $depth = ($base >> 4) & 0x03;
            $blocks[$name]++;
            $byDepth[$name][$depth]++;
            foreach ([2, 3] as $lower) {
                $terrain[$indexes[$lower]] = $values[$lower] | 0x40;
                $updates[] = [
                    'i' => $i + 1,
                    'j' => $j + ($lower === 3 ? 1 : 0),
                    'terrain_tex' => $terrain[$indexes[$lower]],
                ];
            }
            if (count($samples) < $sampleLimit) {
                $samples[] = ['type' => $name, 'depth' => $depth, 'anchor_i' => $i, 'anchor_j' => $j];
            }
        }
    }

    return [
        'existing_super_cells' => $existing,
        'blocks_to_add' => $blocks,
        'blocks_by_depth' => $byDepth,
        'changed_cells' => count($updates),
        'samples' => $samples,
        'updates' => $updates,
    ];
}

function debugApplyMapSupertiles(PDO $db, int $gameId, int $revision, array $updates): int
{
    $changed = 0;
    foreach (array_chunk($updates, 250) as $batch) {
        $pairs = [];
        $values = [$revision, $gameId];
        foreach ($batch as $tile) {
            $pairs[] = '(?, ?)';
            $values[] = (int) $tile['i'];
            $values[] = (int) $tile['j'];
        }
        $statement = $db->prepare(
            'UPDATE server_game_map SET terrain_tex = terrain_tex | 64, revision = ?
             WHERE game_id = ? AND (terrain_tex & 64) = 0 AND (i, j) IN (' . implode(',', $pairs) . ')'
        );
        $statement->execute($values);
        $changed += $statement->rowCount();
    }
    return $changed;
}

function debugRunMapSupertileUpdate(array $options): array
{
    $gameKey = (string) ($options['game'] ?? 'aiciv-default');
    if (!preg_match('/^[A-Za-z0-9_-]{1,80}$/', $gameKey)) {
        throw new InvalidArgumentException('Invalid --game value.');
    }
    $apply = isset($options['apply']);
    $sampleLimit = max(0, min(100, (int) ($options['sample'] ?? 20)));
    $db = serverDatabase();
    if ($apply) $db->beginTransaction();
    try {
        $statement = $db->prepare(
            'SELECT id, map_size, revision FROM server_games WHERE game_key = ?' . ($apply ? ' FOR UPDATE' : '')
        );
        $statement->execute([$gameKey]);
        $game = $statement->fetch();
        if (!$game) throw new RuntimeException("Game {$gameKey} was not found.");

        $statement = $db->prepare(
            'SELECT i, j, terrain_tex FROM server_game_map WHERE game_id = ? ORDER BY i, j'
        );
        $statement->execute([(int) $game['id']]);
        $analysis = debugAnalyzeMapSupertiles($statement->fetchAll(), (int) $game['map_size'], $sampleLimit);
        $revisionBefore = (int) $game['revision'];
        $revisionAfter = $revisionBefore;
        $appliedCells = 0;
        if ($apply && $analysis['changed_cells'] > 0) {
            $revisionAfter++;
            $appliedCells = debugApplyMapSupertiles(
                $db, (int) $game['id'], $revisionAfter, $analysis['updates']
            );
            $statement = $db->prepare(
                'UPDATE server_games SET revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            );
            $statement->execute([$revisionAfter, (int) $game['id']]);
        }
        if ($apply) $db->commit();
        unset($analysis['updates']);
        return array_merge([
            'ok' => true,
            'mode' => $apply ? 'apply' : 'dry-run',
            'game' => $gameKey,
            'map_size' => (int) $game['map_size'],
            'revision_before' => $revisionBefore,
            'revision_after' => $revisionAfter,
            'applied_cells' => $appliedCells,
        ], $analysis);
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

if (PHP_SAPI === 'cli' && realpath((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) {
    try {
        $result = debugRunMapSupertileUpdate(getopt('', ['game:', 'apply', 'sample:']));
        echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), PHP_EOL;
    } catch (Throwable $error) {
        fwrite(STDERR, json_encode([
            'ok' => false,
            'error' => get_class($error),
            'message' => $error->getMessage(),
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL);
        exit(1);
    }
}

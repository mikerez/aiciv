<?php
declare(strict_types=1);

define('SERVER_GAME_LIBRARY_ONLY', true);
require dirname(__DIR__) . '/server_game.php';

if (SERVER_GAME_TURN_SECONDS !== 6) {
    throw new RuntimeException('PHP authoritative timeout must remain 6 seconds.');
}
if (!function_exists('executeClientTurnActions') || !function_exists('combinedPlayerUpdates')) {
    throw new RuntimeException('Batched action and combined update functions are missing.');
}

$serverBatchErrorMode = true;
try {
    serverError(422, 'test_batch_item', 'test item failed', ['item' => 2]);
    throw new RuntimeException('Batch-mode serverError did not throw.');
} catch (ServerGameRequestError $error) {
    if ($error->httpStatus !== 422 || $error->errorCode !== 'test_batch_item'
        || ($error->details['item'] ?? null) !== 2) {
        throw new RuntimeException('Batch item error did not preserve its response data.');
    }
} finally {
    $serverBatchErrorMode = false;
}

echo "PASS PHP batch item failures are isolated and the server timeout remains 6s\n";

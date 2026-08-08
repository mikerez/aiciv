<?php
declare(strict_types=1);

define('SERVER_GAME_LIBRARY_ONLY', true);
require dirname(__DIR__, 2) . '/server_game.php';

$db = serverDatabase();
ensureServerSchema($db);
echo "Server schema " . SERVER_GAME_SCHEMA_VERSION . " ready\n";

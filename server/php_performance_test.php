<?php
declare(strict_types=1);

require_once __DIR__ . '/../php_performance.php';

$directory = sys_get_temp_dir() . '/aiciv-php-performance-' . getmypid();
if (!is_dir($directory)) mkdir($directory, 0700, true);
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['CONTENT_LENGTH'] = '512';
$serverRequestData = [
    'action' => 'make_turn',
    'game_id' => 'performance-test',
    'player_id' => 7,
    'turn' => 42,
    'commands' => [['command' => 'hold'], ['command' => 'move']],
];

phpPerformanceStart('server_game', 'performance-test-request', $directory);
usleep(4000);

register_shutdown_function(static function() use ($directory): void {
    $path = $directory . '/performance.log';
    $lines = is_file($path) ? file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) : [];
    $entry = $lines ? json_decode((string) end($lines), true) : null;
    if (!is_array($entry)
        || ($entry['component'] ?? '') !== 'server_game'
        || ($entry['action'] ?? '') !== 'make_turn'
        || ($entry['command_count'] ?? 0) !== 2
        || ($entry['duration_ms'] ?? 0) < 1
        || ($entry['body_bytes'] ?? 0) !== 512) {
        fwrite(STDERR, "FAIL invalid PHP performance report\n");
        exit(1);
    }
    foreach (glob($directory . '/*') ?: [] as $file) unlink($file);
    if (is_file($directory . '/.performance.lock')) unlink($directory . '/.performance.lock');
    rmdir($directory);
    echo "PASS PHP slow-request execution report\n";
});

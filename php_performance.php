<?php
declare(strict_types=1);

const PHP_PERFORMANCE_THRESHOLD_MS = 1.0;
const PHP_PERFORMANCE_LOG_MAX_BYTES = 4194304;

$phpPerformanceContext = null;

function phpPerformanceRequestMetadata(string $component): array
{
    global $serverRequestData, $apiLogRequestData;
    $request = $component === 'server_game'
        ? ($serverRequestData ?? [])
        : ($apiLogRequestData ?? []);
    if (!is_array($request)) $request = [];
    $metadata = [
        'action' => substr((string) ($request['action'] ?? ''), 0, 80),
        'player_id' => isset($request['player_id']) && is_numeric($request['player_id'])
            ? (int) $request['player_id'] : null,
        'game_id' => substr((string) ($request['game_id'] ?? ''), 0, 80),
        'turn' => isset($request['turn']) && is_numeric($request['turn'])
            ? (int) $request['turn'] : null,
        'command_count' => isset($request['commands']) && is_array($request['commands'])
            ? count($request['commands']) : 0,
    ];
    return array_filter($metadata, static fn($value): bool => $value !== null && $value !== '');
}

function phpPerformanceElapsedMs(): float
{
    global $phpPerformanceContext;
    if (!is_array($phpPerformanceContext)) return 0.0;
    return max(0.0, (hrtime(true) - (int) $phpPerformanceContext['started_ns']) / 1000000.0);
}

function phpPerformanceAddResponseHeaders(): void
{
    if (headers_sent()) return;
    $duration = phpPerformanceElapsedMs();
    $formatted = number_format($duration, 3, '.', '');
    header('Server-Timing: php;dur=' . $formatted);
    header('X-Execution-Time-Ms: ' . $formatted);
}

function phpPerformanceAppend(array $entry, string $directory): void
{
    if (!is_dir($directory) && !@mkdir($directory, 0750, true) && !is_dir($directory)) return;
    $lock = @fopen($directory . '/.performance.lock', 'c');
    if ($lock === false || !@flock($lock, LOCK_EX)) {
        if (is_resource($lock)) @fclose($lock);
        return;
    }
    try {
        $path = $directory . '/performance.log';
        if (is_file($path) && (int) @filesize($path) >= PHP_PERFORMANCE_LOG_MAX_BYTES) {
            @unlink($path . '.1');
            @rename($path, $path . '.1');
        }
        $encoded = json_encode($entry, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($encoded !== false) @file_put_contents($path, $encoded . "\n", FILE_APPEND | LOCK_EX);
    } finally {
        @flock($lock, LOCK_UN);
        @fclose($lock);
    }
}

function phpPerformanceStart(string $component, string $requestId, ?string $directory = null, ?int $startedNs = null): void
{
    global $phpPerformanceContext;
    if (is_array($phpPerformanceContext)) return;
    $phpPerformanceContext = [
        'component' => substr($component, 0, 40),
        'request_id' => substr($requestId, 0, 80),
        'started_ns' => $startedNs ?? hrtime(true),
        'started_memory' => memory_get_usage(true),
        'directory' => $directory ?? (__DIR__ . '/reports'),
    ];
    register_shutdown_function(static function(): void {
        global $phpPerformanceContext;
        if (!is_array($phpPerformanceContext)) return;
        $duration = phpPerformanceElapsedMs();
        if ($duration < PHP_PERFORMANCE_THRESHOLD_MS) return;
        $fatal = error_get_last();
        $fatalTypes = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR];
        $statusValue = http_response_code();
        $status = is_int($statusValue) && $statusValue > 0 ? $statusValue : 200;
        if ($fatal && in_array((int) ($fatal['type'] ?? 0), $fatalTypes, true)) $status = max(500, $status);
        $entry = array_merge([
            'time' => gmdate(DATE_ATOM),
            'component' => $phpPerformanceContext['component'],
            'request_id' => $phpPerformanceContext['request_id'],
            'method' => substr((string) ($_SERVER['REQUEST_METHOD'] ?? ''), 0, 12),
            'status' => $status,
            'duration_ms' => round($duration, 3),
            'threshold_ms' => PHP_PERFORMANCE_THRESHOLD_MS,
            'body_bytes' => max(0, (int) ($_SERVER['CONTENT_LENGTH'] ?? 0)),
            'memory_delta_bytes' => max(0, memory_get_usage(true) - (int) $phpPerformanceContext['started_memory']),
            'peak_memory_bytes' => memory_get_peak_usage(true),
        ], phpPerformanceRequestMetadata((string) $phpPerformanceContext['component']));
        if ($fatal && in_array((int) ($fatal['type'] ?? 0), $fatalTypes, true)) {
            $entry['fatal_error_type'] = (int) $fatal['type'];
            $entry['fatal_error_file'] = basename((string) ($fatal['file'] ?? ''));
            $entry['fatal_error_line'] = (int) ($fatal['line'] ?? 0);
        }
        phpPerformanceAppend($entry, (string) $phpPerformanceContext['directory']);
    });
}

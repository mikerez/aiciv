<?php
declare(strict_types=1);

$serverGameRequestStartedNs = hrtime(true);
require_once __DIR__ . '/game_auth.php';
require_once __DIR__ . '/php_performance.php';

const SERVER_GAME_SCHEMA_VERSION = 20;
const SERVER_GAME_TURN_SECONDS = 6;
const SERVER_GAME_TURN_GRACE_SECONDS = 0;
const SERVER_GAME_DEADLINE_SECONDS = SERVER_GAME_TURN_SECONDS + SERVER_GAME_TURN_GRACE_SECONDS;
const SERVER_GAME_MAX_BODY = 8388608;
const SERVER_GAME_DEFAULT_KEY = 'aiciv-default';
const SERVER_GAME_DEFAULT_MAP_SIZE = 300;
const SERVER_GAME_LOG_MAX_BYTES = 8388608;
const SERVER_GAME_TRACE_EVENT_LIMIT = 200;
const SERVER_GAME_TILE_UNIT_LIMIT = 5;
const SERVER_GAME_INITIAL_HEALTH = 100.0;
const SERVER_GAME_INITIAL_EXPERIENCE = 1.0;
const SERVER_GAME_FORTIFIED_DEFENSE_BONUS = 0.25;
const SERVER_GAME_FORTIFICATION_DEFENSE_BONUS = 0.50;
const SERVER_MAP_ROCK_SEEDS = 32;
const SERVER_MAP_HILL_SEEDS = 24;
const SERVER_MAP_FOREST_SEEDS = 56;
const SERVER_GAME_GLOBAL_AI_LOGIN = 'aiciv_global_ai';
const SERVER_GAME_GLOBAL_AI_CIVILIZATION = 'barbarian';
// Browser contributors use two leased objects. The persistent native contributor
// amortizes one snapshot over the model's complete eight-object input width.
const SERVER_GAME_AI_BATCH_SIZE = 2;
const SERVER_GAME_NATIVE_AI_BATCH_SIZE = 8;
const SERVER_GAME_AI_LEASE_SECONDS = 12;
const SERVER_GAME_AI_RESOURCE_BUDGET = 100000000;
const SERVER_GAME_HOTFIX_DEPOSITS_PER_RESOURCE = 2;

$serverRequestData = [];
$serverTraceData = [];
$serverTraceDropped = 0;
$serverBatchErrorMode = false;

final class ServerGameRequestError extends RuntimeException
{
    public int $httpStatus;
    public string $errorCode;
    public array $details;

    public function __construct(int $httpStatus, string $errorCode, string $message, array $details = [])
    {
        parent::__construct($message);
        $this->httpStatus = $httpStatus;
        $this->errorCode = $errorCode;
        $this->details = $details;
    }
}

if (!defined('SERVER_GAME_LIBRARY_ONLY')) {
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');

    $requestId = bin2hex(random_bytes(8));
    header('X-Request-Id: ' . $requestId);
    $performanceDirectory = getenv('AICIV_TEST_MODE') === '1'
        ? (getenv('AICIV_TEST_REPORT_DIR') ?: null)
        : null;
    phpPerformanceStart('server_game', $requestId, $performanceDirectory, $serverGameRequestStartedNs);
}

function serverRespond(int $status, array $body): void
{
    global $requestId;
    if (isset($body['deadline_at']) && is_string($body['deadline_at'])) {
        $deadline = strtotime($body['deadline_at']);
        $body['turn_seconds_remaining'] = $deadline === false
            ? SERVER_GAME_TURN_SECONDS
            : max(0, min(SERVER_GAME_TURN_SECONDS, $deadline - time() - SERVER_GAME_TURN_GRACE_SECONDS));
    }
    if (getenv('AICIV_TEST_MODE') === '1') {
        $body['_test_http_status'] = $status;
    }
    $body['request_id'] = $requestId;
    appendServerGameLog($status, $body);
    $encoded = json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    http_response_code($status);
    phpPerformanceAddResponseHeaders();
    echo $encoded === false ? '{}' : $encoded;
    exit;
}

function sanitizeServerLog($value, string $key = '')
{
    if (in_array(strtolower($key), ['secret', 'password', 'access_token', 'token', 'authorization'], true)) {
        return '[redacted]';
    }
    if (is_array($value)) {
        if (count($value) > 250) {
            return [
                '_truncated_array' => true,
                'count' => count($value),
                'first_items' => sanitizeServerLog(array_slice($value, 0, 20), $key),
            ];
        }
        $result = [];
        foreach ($value as $childKey => $childValue) {
            $result[$childKey] = sanitizeServerLog($childValue, (string) $childKey);
        }
        return $result;
    }
    return is_string($value) && strlen($value) > 2000
        ? substr($value, 0, 2000) . '[truncated]'
        : $value;
}

function writeClientErrorReport(array $data): array
{
    global $requestId;
    $directory = getenv('AICIV_TEST_REPORT_DIR') ?: (__DIR__ . '/reports');
    if (!is_dir($directory) && !@mkdir($directory, 0750, true) && !is_dir($directory)) {
        throw new RuntimeException('Client report directory could not be created.');
    }
    $lock = @fopen($directory . '/.report.lock', 'c');
    if ($lock === false || !flock($lock, LOCK_EX)) {
        if (is_resource($lock)) fclose($lock);
        throw new RuntimeException('Client report sequence could not be locked.');
    }
    try {
        $sequencePath = $directory . '/.report.sequence';
        $next = (int) (@file_get_contents($sequencePath) ?: 0) + 1;
        if ($next <= 1) {
            foreach (glob($directory . '/*.rtp') ?: [] as $path) {
                $number = (int) pathinfo($path, PATHINFO_FILENAME);
                if ($number >= $next) $next = $number + 1;
            }
        }
        do {
            $filename = sprintf('%08d.rtp', $next++);
            $path = $directory . '/' . $filename;
        } while (is_file($path));

        $destination = isset($data['destination_point']) && is_array($data['destination_point'])
            ? [
                'i' => isset($data['destination_point']['i']) && is_numeric($data['destination_point']['i'])
                    ? (int) $data['destination_point']['i'] : null,
                'j' => isset($data['destination_point']['j']) && is_numeric($data['destination_point']['j'])
                    ? (int) $data['destination_point']['j'] : null,
            ] : null;
        $report = [
            'report_number' => $next - 1,
            'reported_at' => gmdate(DATE_ATOM),
            'server_request_id' => $requestId,
            'remote_address' => (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
            'source_request_type' => substr((string) ($data['source_request_type'] ?? 'unknown'), 0, 80),
            'request_parameters' => sanitizeServerLog(
                isset($data['request_parameters']) && is_array($data['request_parameters'])
                    ? $data['request_parameters'] : []
            ),
            'error_message' => substr((string) ($data['error_message'] ?? 'Unknown client error'), 0, 4000),
            'error_code' => substr((string) ($data['error_code'] ?? ''), 0, 120),
            'error_stack' => substr((string) ($data['error_stack'] ?? ''), 0, 8000),
            'response_error' => sanitizeServerLog(
                isset($data['response_error']) && is_array($data['response_error']) ? $data['response_error'] : []
            ),
            'player_id' => isset($data['player_id']) && is_numeric($data['player_id'])
                ? (int) $data['player_id'] : null,
            'unit_id' => isset($data['unit_id']) && is_numeric($data['unit_id'])
                ? (int) $data['unit_id'] : null,
            'unsuccessful_action' => substr((string) ($data['unsuccessful_action'] ?? ''), 0, 120),
            'destination_point' => $destination,
            'client' => sanitizeServerLog(isset($data['client']) && is_array($data['client']) ? $data['client'] : []),
        ];
        $encoded = json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($encoded === false || @file_put_contents($path, $encoded . "\n", LOCK_EX) === false) {
            throw new RuntimeException('Client report file could not be written.');
        }
        @file_put_contents($sequencePath, (string) ($next - 1), LOCK_EX);
        return ['report_number' => $report['report_number'], 'report_file' => 'reports/' . $filename];
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function writeAiWorkerDecisionReport(array $decision): array
{
    $unitId = isset($decision['unit_id']) && is_numeric($decision['unit_id'])
        ? (int) $decision['unit_id'] : null;
    $choice = substr((string) ($decision['decision']['choice'] ?? $decision['command'] ?? 'unknown'), 0, 120);
    return writeClientErrorReport([
        'source_request_type' => 'ai_worker_automation',
        'request_parameters' => $decision,
        'error_message' => 'Automated AI Worker decision: ' . $choice,
        'error_code' => 'AI_WORKER_DECISION',
        'player_id' => $decision['player_id'] ?? null,
        'unit_id' => $unitId,
        'unsuccessful_action' => '',
        'destination_point' => $decision['decision']['target'] ?? null,
        'client' => ['client_key' => $decision['client_key'] ?? null],
    ]);
}

function writeAiDevelopmentDecisionReport(array $decision): array
{
    $unitId = isset($decision['unit_id']) && is_numeric($decision['unit_id'])
        ? (int) $decision['unit_id'] : null;
    $choice = substr((string) ($decision['decision']['command'] ?? $decision['command'] ?? 'unknown'), 0, 120);
    return writeClientErrorReport([
        'source_request_type' => 'ai_development_decision',
        'request_parameters' => $decision,
        'error_message' => 'AI development decision: ' . $choice,
        'error_code' => 'AI_DEVELOPMENT_DECISION',
        'player_id' => $decision['player_id'] ?? null,
        'unit_id' => $unitId,
        'unsuccessful_action' => '',
        'destination_point' => $decision['decision']['target'] ?? null,
        'client' => ['client_key' => $decision['client_key'] ?? null],
    ]);
}

function serverTrace(string $event, array $details = []): void
{
    global $serverTraceData, $serverTraceDropped;
    if (count($serverTraceData) >= SERVER_GAME_TRACE_EVENT_LIMIT) {
        ++$serverTraceDropped;
        return;
    }
    $serverTraceData[] = ['event' => $event, 'details' => sanitizeServerLog($details)];
}

function appendServerGameLog(int $status, array $response): void
{
    global $requestId, $serverRequestData, $serverTraceData, $serverTraceDropped;
    $path = getenv('AICIV_TEST_LOG_PATH') ?: (__DIR__ . '/.server_game_requests.log');
    if (is_file($path) && filesize($path) > SERVER_GAME_LOG_MAX_BYTES) {
        @unlink($path . '.1');
        @rename($path, $path . '.1');
    }
    $loggedRequest = $serverRequestData;
    $loggedResponse = $response;
    if (($serverRequestData['action'] ?? '') === 'report_cli_error') {
        $loggedRequest = [
            'action' => 'report_cli_error',
            'source_request_type' => $serverRequestData['source_request_type'] ?? 'unknown',
            'player_id' => $serverRequestData['player_id'] ?? null,
            'unit_id' => $serverRequestData['unit_id'] ?? null,
            'error_code' => $serverRequestData['error_code'] ?? '',
        ];
    }
    if (($serverRequestData['action'] ?? '') === 'claim_ai_batch'
        && isset($loggedResponse['snapshot']) && is_array($loggedResponse['snapshot'])) {
        $snapshot = $loggedResponse['snapshot'];
        $leased = array_fill_keys(array_map('intval', $loggedResponse['unit_ids'] ?? []), true);
        $leasedUnits = [];
        foreach ($snapshot['units'] ?? [] as $unit) {
            if (!is_array($unit) || !isset($leased[(int) ($unit['id'] ?? 0)])) continue;
            $leasedUnits[] = [
                'id' => (int) ($unit['id'] ?? 0),
                'unit_type_id' => (string) ($unit['unit_type_id'] ?? ''),
                'state' => (string) ($unit['state'] ?? ''),
                'i' => (int) ($unit['world_i'] ?? $unit['i'] ?? 0),
                'j' => (int) ($unit['world_j'] ?? $unit['j'] ?? 0),
                'revision' => (int) ($unit['revision'] ?? 0),
            ];
        }
        $loggedResponse['snapshot'] = [
            '_summary' => true,
            'turn' => (int) ($snapshot['turn'] ?? $loggedResponse['turn'] ?? 0),
            'map_size' => (int) ($snapshot['map_size'] ?? 0),
            'map_origin' => $snapshot['map_origin'] ?? null,
            'unit_count' => count($snapshot['units'] ?? []),
            'tile_count' => count($snapshot['tiles'] ?? []),
            'visibility_count' => count($snapshot['visibility'] ?? []),
            'visible_enemy_count' => count($snapshot['visible_enemy_ids'] ?? []),
            'leased_units' => $leasedUnits,
        ];
    }
    $entry = [
        'time' => gmdate(DATE_ATOM),
        'request_id' => $requestId,
        'method' => (string) ($_SERVER['REQUEST_METHOD'] ?? ''),
        'remote_address' => (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
        'user_agent' => substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 300),
        'status' => $status,
        'request' => sanitizeServerLog($loggedRequest),
        'trace' => $serverTraceData,
        'trace_dropped_events' => $serverTraceDropped,
        'response' => sanitizeServerLog($loggedResponse),
    ];
    $line = json_encode($entry, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($line !== false) @file_put_contents($path, $line . "\n", FILE_APPEND | LOCK_EX);
}

function globalAiBatchSize(string $clientKey): int
{
    return str_starts_with($clientKey, 'node-')
        ? SERVER_GAME_NATIVE_AI_BATCH_SIZE : SERVER_GAME_AI_BATCH_SIZE;
}

function serverError(int $status, string $code, string $message, array $details = []): void
{
    global $serverBatchErrorMode;
    if ($serverBatchErrorMode) {
        throw new ServerGameRequestError($status, $code, $message, $details);
    }
    $error = ['code' => $code, 'message' => $message];
    if ($details) $error['details'] = $details;
    serverRespond($status, ['ok' => false, 'error' => $error]);
}

function serverExceptionDetails(Throwable $error): array
{
    $message = trim($error->getMessage());
    foreach (['.game_db_password', '.game_api_secret'] as $name) {
        $secret = @file_get_contents(__DIR__ . '/' . $name);
        if ($secret !== false && trim($secret) !== '') {
            $message = str_replace(trim($secret), '[redacted]', $message);
        }
    }
    $message = preg_replace('/password\s*=\s*[^\s;]+/i', 'password=[redacted]', $message) ?? $message;
    return [
        'exception' => get_class($error),
        'exception_code' => (string) $error->getCode(),
        'message' => substr($message === '' ? 'No exception message was provided.' : $message, 0, 1000),
    ];
}

function serverSecret(string $name): string
{
    if (getenv('AICIV_TEST_MODE') === '1') {
        $environmentName = $name === '.game_db_password'
            ? 'AICIV_TEST_DB_PASSWORD' : ($name === '.game_api_secret' ? 'AICIV_TEST_SECRET' : '');
        $environmentValue = $environmentName === '' ? false : getenv($environmentName);
        if ($environmentValue !== false && $environmentValue !== '') return (string) $environmentValue;
    }
    $value = @file_get_contents(__DIR__ . '/' . $name);
    if ($value === false) {
        throw new RuntimeException('Server secret is unavailable.');
    }
    return rtrim($value, "\r\n");
}

function serverRequest(): array
{
    global $serverRequestData;
    $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($length > SERVER_GAME_MAX_BODY) {
        serverError(413, 'request_too_large', 'Request body exceeds 8 MiB.');
    }
    $inputStream = PHP_SAPI === 'cli' && getenv('AICIV_TEST_MODE') === '1'
        ? 'php://stdin' : 'php://input';
    $raw = file_get_contents($inputStream);
    if ($raw === false || strlen($raw) > SERVER_GAME_MAX_BODY) {
        serverError(413, 'request_too_large', 'Request body exceeds 8 MiB.');
    }
    try {
        $data = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
    } catch (JsonException $error) {
        serverError(400, 'invalid_json', 'Request body must contain valid JSON.');
    }
    if (!is_array($data)) {
        serverError(400, 'invalid_request', 'JSON request must be an object.');
    }
    $serverRequestData = $data;
    return $data;
}

function serverDatabase(): PDO
{
    $host = getenv('AICIV_TEST_MODE') === '1' ? (getenv('AICIV_TEST_DB_HOST') ?: 'localhost') : 'localhost';
    $database = getenv('AICIV_TEST_MODE') === '1' ? (getenv('AICIV_TEST_DB_NAME') ?: 'softmaxi_game_test') : 'softmaxi_game';
    $user = getenv('AICIV_TEST_MODE') === '1' ? (getenv('AICIV_TEST_DB_USER') ?: 'aiciv_test') : 'softmaxi_admin';
    return new PDO(
        'mysql:host=' . $host . ';dbname=' . $database . ';charset=utf8mb4',
        $user,
        serverSecret('.game_db_password'),
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
}

function authenticateRegisteredGamePlayer(PDO $db, string $gameKey, int $playerId, array $data, string $action): ?int
{
    if (in_array($action, ['map_diagnostics', 'regenerate_map', 'reset_game', 'cleanup_orphan_players',
        'hotfix_strategic_resources', 'repair_worker_automation', 'worker_diagnostics', 'ai_diagnostics',
        'claim_ai_batch', 'submit_ai_batch'], true)) {
        return null;
    }
    $statement = $db->prepare(
        'SELECT p.account_user_id, actor.user_type, actor.parent_id
         FROM server_game_players p
         JOIN server_games g ON g.id = p.game_id
         LEFT JOIN game_users actor ON actor.id = p.account_user_id
         WHERE g.game_key = ? AND p.player_id = ?
         LIMIT 1'
    );
    $statement->execute([$gameKey, $playerId]);
    $actor = $statement->fetch();
    // Secret-only bootstrap/test players have no registered account to authenticate.
    if (!$actor || $actor['account_user_id'] === null) {
        return null;
    }

    $token = gameAuthRequestToken($data);
    if ($token === '') {
        serverError(401, 'authentication_required', 'A current account access token is required.');
    }
    $result = gameAuthSessionResult($db, $token);
    if ($result['session'] === null) {
        gameAuthClearCookies();
        $code = (string) $result['error'];
        $message = $code === 'session_replaced'
            ? 'This account was signed in on another device.'
            : 'The account session is no longer valid.';
        serverError(401, $code, $message);
    }
    if (!isset($data['user_id']) || !is_numeric($data['user_id'])) {
        serverError(422, 'invalid_user_id', 'user_id must identify the logged-in human account.');
    }
    $requestedUserId = (int) $data['user_id'];
    $sessionUserId = (int) $result['session']['id'];
    if ($requestedUserId !== $sessionUserId) {
        serverError(403, 'user_identity_mismatch', 'user_id does not match the logged-in account.');
    }
    $actorUserId = (int) $actor['account_user_id'];
    $actorType = (string) ($actor['user_type'] ?? 'human');
    $authorized = ($actorType === 'human' && $actorUserId === $sessionUserId && $playerId === $sessionUserId);
    if (!$authorized) {
        serverError(403, 'player_identity_mismatch', 'The logged-in account does not control this player.');
    }
    $statement = $db->prepare(
        'UPDATE game_users SET online = 1, last_online_at = UTC_TIMESTAMP() WHERE id IN (?, ?)'
    );
    $statement->execute([$sessionUserId, $actorUserId]);
    return $sessionUserId;
}

function controlledPlayers(PDO $db, int $humanUserId): array
{
    $statement = $db->prepare(
        "SELECT id AS player_id, user_type, parent_id, online
         FROM game_users
         WHERE id = ? OR (user_type = 'ai' AND login = ?)
         ORDER BY CASE WHEN user_type = 'human' THEN 0 ELSE 1 END, id"
    );
    $statement->execute([$humanUserId, SERVER_GAME_GLOBAL_AI_LOGIN]);
    return array_map(static function(array $player): array {
        return [
            'player_id' => (int) $player['player_id'],
            'user_type' => (string) $player['user_type'],
            'parent_id' => $player['parent_id'] === null ? null : (int) $player['parent_id'],
            'online' => (bool) $player['online'],
        ];
    }, $statement->fetchAll());
}

function ensureGlobalAiUser(PDO $db): int
{
    $statement = $db->prepare('SELECT id FROM game_users WHERE login = ? LIMIT 1');
    $statement->execute([SERVER_GAME_GLOBAL_AI_LOGIN]);
    $id = (int) ($statement->fetchColumn() ?: 0);
    if ($id > 0) {
        $statement = $db->prepare(
            "UPDATE game_users SET user_type = 'ai', parent_id = NULL, status = 'active',
             online = 1, last_online_at = UTC_TIMESTAMP() WHERE id = ?"
        );
        $statement->execute([$id]);
        $statement = $db->prepare(
            'UPDATE server_game_players SET civilization_key = ?
             WHERE player_id = ? OR account_user_id = ?'
        );
        $statement->execute([SERVER_GAME_GLOBAL_AI_CIVILIZATION, $id, $id]);
        return $id;
    }
    $statement = $db->prepare(
        "INSERT INTO game_users
         (login, email, password_hash, status, user_type, online, last_online_at, parent_id)
         VALUES (?, NULL, ?, 'active', 'ai', 1, UTC_TIMESTAMP(), NULL)"
    );
    $statement->execute([
        SERVER_GAME_GLOBAL_AI_LOGIN,
        password_hash(bin2hex(random_bytes(32)), PASSWORD_DEFAULT),
    ]);
    return (int) $db->lastInsertId();
}

function ensureServerSchema(PDO $db): void
{
    $db->exec(
        "CREATE TABLE IF NOT EXISTS `version` (
            component VARCHAR(64) NOT NULL,
            schema_version INT UNSIGNED NOT NULL,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (component)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $statement = $db->prepare("SELECT schema_version FROM `version` WHERE component = 'server_game'");
    $statement->execute();
    $version = $statement->fetchColumn();
    $version = $version === false ? 0 : (int) $version;

    if ($version < 1) {
        $db->exec(
            "CREATE TABLE IF NOT EXISTS server_games (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                game_key VARCHAR(80) NOT NULL,
                map_size INT UNSIGNED NOT NULL,
                turn_number INT UNSIGNED NOT NULL DEFAULT 0,
                revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
                turn_started_at DATETIME NOT NULL,
                turn_deadline_at DATETIME NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY uq_server_games_key (game_key)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $db->exec(
            "CREATE TABLE IF NOT EXISTS server_game_players (
                game_id BIGINT UNSIGNED NOT NULL,
                player_id INT UNSIGNED NOT NULL,
                active TINYINT(1) NOT NULL DEFAULT 1,
                state_json LONGTEXT NULL,
                last_seen_revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (game_id, player_id),
                CONSTRAINT fk_server_players_game FOREIGN KEY (game_id) REFERENCES server_games(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $db->exec(
            "CREATE TABLE IF NOT EXISTS server_game_map (
                game_id BIGINT UNSIGNED NOT NULL,
                i INT UNSIGNED NOT NULL,
                j INT UNSIGNED NOT NULL,
                terrain_tex INT NOT NULL,
                terrain_bits INT NOT NULL DEFAULT 0,
                resource_type INT UNSIGNED NOT NULL DEFAULT 0,
                modifiers_json LONGTEXT NULL,
                revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
                PRIMARY KEY (game_id, i, j),
                KEY ix_server_map_revision (game_id, revision),
                CONSTRAINT fk_server_map_game FOREIGN KEY (game_id) REFERENCES server_games(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $db->exec(
            "CREATE TABLE IF NOT EXISTS server_game_units (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                game_id BIGINT UNSIGNED NOT NULL,
                client_key VARCHAR(100) NULL,
                owner_id INT UNSIGNED NOT NULL,
                unit_type_id VARCHAR(50) NOT NULL,
                unit_class INT NOT NULL DEFAULT 0,
                name VARCHAR(100) NOT NULL DEFAULT '',
                texture INT NOT NULL DEFAULT 0,
                can_move TINYINT(1) NOT NULL DEFAULT 1,
                nature VARCHAR(16) NOT NULL DEFAULT 'land',
                i INT NOT NULL,
                j INT NOT NULL,
                attack_value FLOAT NOT NULL DEFAULT 0,
                defense_value FLOAT NOT NULL DEFAULT 0,
                speed FLOAT NOT NULL DEFAULT 1,
                view_range INT NOT NULL DEFAULT 2,
                state VARCHAR(40) NOT NULL DEFAULT 'ready',
                health FLOAT NOT NULL DEFAULT 100,
                max_health FLOAT NOT NULL DEFAULT 100,
                experience FLOAT NOT NULL DEFAULT 1,
                move_penalty INT NOT NULL DEFAULT 0,
                properties_json LONGTEXT NULL,
                revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
                deleted_at DATETIME NULL,
                PRIMARY KEY (id),
                UNIQUE KEY uq_server_unit_client (game_id, client_key),
                KEY ix_server_units_owner (game_id, owner_id),
                KEY ix_server_units_tile (game_id, i, j),
                KEY ix_server_units_revision (game_id, revision),
                CONSTRAINT fk_server_units_game FOREIGN KEY (game_id) REFERENCES server_games(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $db->exec(
            "CREATE TABLE IF NOT EXISTS server_game_orders (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                game_id BIGINT UNSIGNED NOT NULL,
                turn_number INT UNSIGNED NOT NULL,
                player_id INT UNSIGNED NOT NULL,
                unit_id BIGINT UNSIGNED NOT NULL,
                command_name VARCHAR(40) NOT NULL,
                path_json LONGTEXT NULL,
                payload_json LONGTEXT NULL,
                submitted_at DATETIME NOT NULL,
                PRIMARY KEY (id),
                UNIQUE KEY uq_server_order_unit (game_id, turn_number, player_id, unit_id),
                KEY ix_server_orders_turn (game_id, turn_number),
                CONSTRAINT fk_server_orders_game FOREIGN KEY (game_id) REFERENCES server_games(id) ON DELETE CASCADE,
                CONSTRAINT fk_server_orders_unit FOREIGN KEY (unit_id) REFERENCES server_game_units(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $db->exec(
            "CREATE TABLE IF NOT EXISTS server_game_submissions (
                game_id BIGINT UNSIGNED NOT NULL,
                turn_number INT UNSIGNED NOT NULL,
                player_id INT UNSIGNED NOT NULL,
                submitted_at DATETIME NOT NULL,
                PRIMARY KEY (game_id, turn_number, player_id),
                CONSTRAINT fk_server_submissions_game FOREIGN KEY (game_id) REFERENCES server_games(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $db->exec(
            "CREATE TABLE IF NOT EXISTS server_game_visibility (
                game_id BIGINT UNSIGNED NOT NULL,
                player_id INT UNSIGNED NOT NULL,
                i INT UNSIGNED NOT NULL,
                j INT UNSIGNED NOT NULL,
                visibility_level TINYINT UNSIGNED NOT NULL DEFAULT 1,
                resource_visible TINYINT(1) NOT NULL DEFAULT 0,
                revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
                PRIMARY KEY (game_id, player_id, i, j),
                KEY ix_server_visibility_revision (game_id, player_id, revision),
                CONSTRAINT fk_server_visibility_game FOREIGN KEY (game_id) REFERENCES server_games(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $db->exec(
            "CREATE TABLE IF NOT EXISTS server_game_events (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                game_id BIGINT UNSIGNED NOT NULL,
                turn_number INT UNSIGNED NOT NULL,
                revision BIGINT UNSIGNED NOT NULL,
                audience_player_id INT UNSIGNED NOT NULL,
                event_type VARCHAR(40) NOT NULL,
                unit_id BIGINT UNSIGNED NULL,
                other_unit_id BIGINT UNSIGNED NULL,
                i INT NULL,
                j INT NULL,
                message VARCHAR(500) NOT NULL,
                payload_json LONGTEXT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY ix_server_events_revision (game_id, audience_player_id, revision),
                CONSTRAINT fk_server_events_game FOREIGN KEY (game_id) REFERENCES server_games(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $statement = $db->prepare(
            "INSERT INTO `version` (component, schema_version) VALUES ('server_game', 1)
             ON DUPLICATE KEY UPDATE schema_version = VALUES(schema_version), applied_at = CURRENT_TIMESTAMP"
        );
        $statement->execute();
        $version = 1;
    }
    if ($version < 2) {
        $db->exec(
            'ALTER TABLE server_game_players
             ADD COLUMN account_user_id BIGINT UNSIGNED NULL AFTER player_id,
             ADD UNIQUE KEY uq_server_players_account (game_id, account_user_id)'
        );
        $statement = $db->prepare(
            "INSERT INTO `version` (component, schema_version) VALUES ('server_game', 2)
             ON DUPLICATE KEY UPDATE schema_version = VALUES(schema_version), applied_at = CURRENT_TIMESTAMP"
        );
        $statement->execute();
        $version = 2;
    }
    if ($version < 3) {
        $db->exec(
            'ALTER TABLE server_game_units
             ADD COLUMN occupancy_key VARCHAR(80) NULL AFTER client_key,
             ADD UNIQUE KEY uq_server_unit_occupancy (game_id, occupancy_key)'
        );
        $statement = $db->prepare(
            "INSERT INTO `version` (component, schema_version) VALUES ('server_game', 3)
             ON DUPLICATE KEY UPDATE schema_version = VALUES(schema_version), applied_at = CURRENT_TIMESTAMP"
        );
        $statement->execute();
        $version = 3;
    }
    if ($version < 4) {
        $db->exec(
            "CREATE TABLE IF NOT EXISTS productions (
                game_id BIGINT UNSIGNED NOT NULL,
                city_unit_id BIGINT UNSIGNED NOT NULL,
                player_id INT UNSIGNED NOT NULL,
                unit_type_id VARCHAR(50) NOT NULL,
                production_points FLOAT NOT NULL DEFAULT 0,
                production_cost FLOAT NOT NULL,
                selected_at DATETIME NOT NULL,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (game_id, city_unit_id),
                KEY ix_productions_player (game_id, player_id),
                CONSTRAINT fk_productions_game FOREIGN KEY (game_id) REFERENCES server_games(id) ON DELETE CASCADE,
                CONSTRAINT fk_productions_city FOREIGN KEY (city_unit_id) REFERENCES server_game_units(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $statement = $db->prepare(
            "INSERT INTO `version` (component, schema_version) VALUES ('server_game', 4)
             ON DUPLICATE KEY UPDATE schema_version = VALUES(schema_version), applied_at = CURRENT_TIMESTAMP"
        );
        $statement->execute();
        $version = 4;
    }
    if ($version < 5) {
        backfillRegisteredExplorers($db, 3);
        $statement = $db->prepare(
            "INSERT INTO `version` (component, schema_version) VALUES ('server_game', 5)
             ON DUPLICATE KEY UPDATE schema_version = VALUES(schema_version), applied_at = CURRENT_TIMESTAMP"
        );
        $statement->execute();
        $version = 5;
    }
    if ($version < 6) {
        $db->exec(
            "ALTER TABLE server_game_players
             ADD COLUMN civilization_key VARCHAR(32) NULL AFTER account_user_id,
             ADD COLUMN units_killed INT UNSIGNED NOT NULL DEFAULT 0 AFTER last_seen_revision,
             ADD COLUMN cities_occupied INT UNSIGNED NOT NULL DEFAULT 0 AFTER units_killed,
             ADD COLUMN cities_destroyed INT UNSIGNED NOT NULL DEFAULT 0 AFTER cities_occupied"
        );
        $db->exec(
            "UPDATE server_game_players SET civilization_key = CASE MOD(player_id, 8)
                WHEN 0 THEN 'romans' WHEN 1 THEN 'greeks' WHEN 2 THEN 'ethiopians' WHEN 3 THEN 'egyptians'
                WHEN 4 THEN 'phoenicians' WHEN 5 THEN 'persians' WHEN 6 THEN 'celts' ELSE 'carthaginians' END
             WHERE civilization_key IS NULL OR civilization_key = ''"
        );
        $statement = $db->prepare(
            "INSERT INTO `version` (component, schema_version) VALUES ('server_game', 6)
             ON DUPLICATE KEY UPDATE schema_version = VALUES(schema_version), applied_at = CURRENT_TIMESTAMP"
        );
        $statement->execute();
        $version = 6;
    }
    if ($version < 7) {
        $columns = $db->query(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_users'"
        )->fetchAll(PDO::FETCH_COLUMN);
        $columns = array_fill_keys($columns, true);
        if (!isset($columns['user_type'])) {
            $db->exec("ALTER TABLE game_users ADD COLUMN user_type VARCHAR(8) NOT NULL DEFAULT 'human' AFTER status");
        }
        if (!isset($columns['online'])) {
            $db->exec("ALTER TABLE game_users ADD COLUMN online TINYINT(1) NOT NULL DEFAULT 0 AFTER user_type");
        }
        if (!isset($columns['last_online_at'])) {
            $db->exec("ALTER TABLE game_users ADD COLUMN last_online_at DATETIME NULL AFTER online");
        }
        if (!isset($columns['parent_id'])) {
            $db->exec("ALTER TABLE game_users ADD COLUMN parent_id BIGINT UNSIGNED NULL AFTER last_online_at");
        }
        $indexes = $db->query(
            "SELECT INDEX_NAME FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_users'"
        )->fetchAll(PDO::FETCH_COLUMN);
        if (!in_array('ix_game_users_ai_parent', $indexes, true)) {
            $db->exec("ALTER TABLE game_users ADD KEY ix_game_users_ai_parent (user_type, parent_id)");
        }
        $statement = $db->prepare(
            "INSERT INTO `version` (component, schema_version) VALUES ('server_game', 7)
             ON DUPLICATE KEY UPDATE schema_version = VALUES(schema_version), applied_at = CURRENT_TIMESTAMP"
        );
        $statement->execute();
        $version = 7;
    }
    if ($version < 8) {
        $db->beginTransaction();
        try {
            // Resources are immutable after map creation. Legacy schema upgrades
            // advance their version without injecting resources into live games.
            $games = [];
            $seed = $db->prepare(
                'UPDATE server_game_map
                 SET resource_type = 36, revision = ?
                 WHERE game_id = ? AND resource_type = 0
                   AND (terrain_tex & 15) IN (4, 5) AND RAND() < 0.006'
            );
            $advance = $db->prepare(
                'UPDATE server_games SET revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            );
            foreach ($games as $game) {
                $revision = (int) $game['revision'] + 1;
                $seed->execute([$revision, (int) $game['id']]);
                if ($seed->rowCount() > 0) {
                    $advance->execute([$revision, (int) $game['id']]);
                }
            }
            $statement = $db->prepare(
                "INSERT INTO `version` (component, schema_version) VALUES ('server_game', 8)
                 ON DUPLICATE KEY UPDATE schema_version = VALUES(schema_version), applied_at = CURRENT_TIMESTAMP"
            );
            $statement->execute();
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        $version = 8;
    }
    if ($version < 9) {
        $db->exec(
            "ALTER TABLE server_game_players
             ADD COLUMN eliminated TINYINT(1) NOT NULL DEFAULT 0 AFTER active"
        );
        $db->exec(
            'UPDATE server_game_players p
             SET eliminated = NOT EXISTS (
                 SELECT 1 FROM server_game_units u
                 WHERE u.game_id = p.game_id AND u.owner_id = p.player_id
                   AND u.deleted_at IS NULL AND u.health > 0
             )'
        );
        $statement = $db->prepare(
            "INSERT INTO `version` (component, schema_version) VALUES ('server_game', 9)
             ON DUPLICATE KEY UPDATE schema_version = VALUES(schema_version), applied_at = CURRENT_TIMESTAMP"
        );
        $statement->execute();
        $version = 9;
    }
    if ($version < 10) {
        $db->exec(
            "CREATE TABLE IF NOT EXISTS server_game_relations (
                game_id BIGINT UNSIGNED NOT NULL,
                player_a INT UNSIGNED NOT NULL,
                player_b INT UNSIGNED NOT NULL,
                relation_status VARCHAR(16) NOT NULL DEFAULT 'neutral',
                revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (game_id, player_a, player_b),
                CONSTRAINT fk_server_relations_game FOREIGN KEY (game_id) REFERENCES server_games(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        $statement = $db->prepare(
            "INSERT INTO `version` (component, schema_version) VALUES ('server_game', 10)
             ON DUPLICATE KEY UPDATE schema_version = VALUES(schema_version), applied_at = CURRENT_TIMESTAMP"
        );
        $statement->execute();
        $version = 10;
    }
    if ($version < 11) {
        $db->exec('ALTER TABLE productions ADD COLUMN queue_json LONGTEXT NULL AFTER production_cost');
        $db->exec(
            "UPDATE productions SET queue_json = CONCAT('[\"', unit_type_id, '\"]')
             WHERE queue_json IS NULL OR queue_json = ''"
        );
        $statement = $db->prepare(
            "INSERT INTO `version` (component, schema_version) VALUES ('server_game', 11)
             ON DUPLICATE KEY UPDATE schema_version = VALUES(schema_version), applied_at = CURRENT_TIMESTAMP"
        );
        $statement->execute();
        $version = 11;
    }
    if ($version < 12) {
        $db->exec(
            'ALTER TABLE server_game_units
             ADD COLUMN last_healed_turn INT NOT NULL DEFAULT -1 AFTER move_penalty'
        );
        $statement = $db->prepare(
            "INSERT INTO `version` (component, schema_version) VALUES ('server_game', 12)
             ON DUPLICATE KEY UPDATE schema_version = VALUES(schema_version), applied_at = CURRENT_TIMESTAMP"
        );
        $statement->execute();
        $version = 12;
    }
    if ($version < 13) {
        $db->exec(
            "ALTER TABLE server_game_relations
             ADD COLUMN player_a_status VARCHAR(16) NOT NULL DEFAULT 'neutral' AFTER relation_status,
             ADD COLUMN player_b_status VARCHAR(16) NOT NULL DEFAULT 'neutral' AFTER player_a_status"
        );
        $db->exec(
            "UPDATE server_game_relations
             SET player_a_status = IF(relation_status = 'war', 'enemy', 'neutral'),
                 player_b_status = IF(relation_status = 'war', 'enemy', 'neutral')"
        );
        $statement = $db->prepare(
            "INSERT INTO `version` (component, schema_version) VALUES ('server_game', 13)
             ON DUPLICATE KEY UPDATE schema_version = VALUES(schema_version), applied_at = CURRENT_TIMESTAMP"
        );
        $statement->execute();
        $version = 13;
    }
    if ($version < 14) {
        // Production belongs only to the currently active queue item. Remove
        // legacy idle storage and rollover balances once during migration.
        $db->exec('UPDATE productions SET production_points = 0');
        $db->exec(
            "UPDATE server_game_units
             SET properties_json = JSON_SET(
                 CASE WHEN JSON_VALID(properties_json) THEN properties_json ELSE '{}' END,
                 '$.cityProperties.productionStored', 0,
                 '$.production.productionPoints', 0
             )
             WHERE unit_class = 3"
        );
        $statement = $db->prepare(
            "INSERT INTO `version` (component, schema_version) VALUES ('server_game', 14)
             ON DUPLICATE KEY UPDATE schema_version = VALUES(schema_version), applied_at = CURRENT_TIMESTAMP"
        );
        $statement->execute();
        $version = 14;
    }
    if ($version < 15) {
        $db->beginTransaction();
        try {
            $games = [];
            $loadIron = $db->prepare(
                'SELECT i, j FROM server_game_map WHERE game_id = ? AND resource_type = 34'
            );
            $loadCandidates = $db->prepare(
                'SELECT i, j FROM server_game_map
                 WHERE game_id = ? AND resource_type = 0 AND (terrain_tex & 15) IN (1, 4, 5)'
            );
            $placeIron = $db->prepare(
                'UPDATE server_game_map SET resource_type = 34, revision = ?
                 WHERE game_id = ? AND i = ? AND j = ? AND resource_type = 0'
            );
            $advanceGame = $db->prepare(
                'UPDATE server_games SET revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            );
            foreach ($games as $game) {
                $gameId = (int) $game['id'];
                $mapSize = (int) $game['map_size'];
                $minimum = serverMinimumIronCount($mapSize);
                $loadIron->execute([$gameId]);
                $current = 0;
                foreach ($loadIron->fetchAll() as $tile) {
                    if (serverPlayableCoordinate((int) $tile['i'], (int) $tile['j'], $mapSize)) $current++;
                }
                if ($current >= $minimum) continue;

                $loadCandidates->execute([$gameId]);
                $candidates = array_values(array_filter(
                    $loadCandidates->fetchAll(),
                    static fn(array $tile): bool => serverPlayableCoordinate(
                        (int) $tile['i'], (int) $tile['j'], $mapSize
                    )
                ));
                usort($candidates, static function (array $left, array $right) use ($gameId): int {
                    $leftKey = hash('sha256', $gameId . ':' . $left['i'] . ':' . $left['j'] . ':iron-v15');
                    $rightKey = hash('sha256', $gameId . ':' . $right['i'] . ':' . $right['j'] . ':iron-v15');
                    return strcmp($leftKey, $rightKey);
                });
                $revision = (int) $game['revision'] + 1;
                $needed = $minimum - $current;
                foreach (array_slice($candidates, 0, $needed) as $tile) {
                    $placeIron->execute([$revision, $gameId, (int) $tile['i'], (int) $tile['j']]);
                }
                if ($needed > 0) $advanceGame->execute([$revision, $gameId]);
            }
            $statement = $db->prepare(
                "INSERT INTO `version` (component, schema_version) VALUES ('server_game', 15)
                 ON DUPLICATE KEY UPDATE schema_version = VALUES(schema_version), applied_at = CURRENT_TIMESTAMP"
            );
            $statement->execute();
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        $version = 15;
    }
    if ($version < 16) {
        $db->beginTransaction();
        try {
            $games = [];
            $terrainIron = $db->prepare(
                'SELECT i, j FROM server_game_map
                 WHERE game_id = ? AND resource_type = 34 AND (terrain_tex & 15) = ?'
            );
            $terrainCandidates = $db->prepare(
                'SELECT i, j FROM server_game_map
                 WHERE game_id = ? AND resource_type = 0 AND (terrain_tex & 15) = ?'
            );
            $placeIron = $db->prepare(
                'UPDATE server_game_map SET resource_type = 34, revision = ?
                 WHERE game_id = ? AND i = ? AND j = ? AND resource_type = 0'
            );
            $advanceGame = $db->prepare(
                'UPDATE server_games SET revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            );
            foreach ($games as $game) {
                $gameId = (int) $game['id'];
                $mapSize = (int) $game['map_size'];
                $revision = (int) $game['revision'] + 1;
                $placed = 0;
                foreach ([1, 4, 5] as $terrainType) {
                    $terrainIron->execute([$gameId, $terrainType]);
                    $hasPlayableIron = array_filter(
                        $terrainIron->fetchAll(),
                        static fn(array $tile): bool => serverPlayableCoordinate(
                            (int) $tile['i'], (int) $tile['j'], $mapSize
                        )
                    );
                    if ($hasPlayableIron) continue;
                    $terrainCandidates->execute([$gameId, $terrainType]);
                    $candidates = array_values(array_filter(
                        $terrainCandidates->fetchAll(),
                        static fn(array $tile): bool => serverPlayableCoordinate(
                            (int) $tile['i'], (int) $tile['j'], $mapSize
                        )
                    ));
                    if (!$candidates) continue;
                    usort($candidates, static function (array $left, array $right) use ($gameId, $terrainType): int {
                        $leftKey = hash('sha256', $gameId . ':' . $terrainType . ':' . $left['i'] . ':' . $left['j'] . ':iron-v16');
                        $rightKey = hash('sha256', $gameId . ':' . $terrainType . ':' . $right['i'] . ':' . $right['j'] . ':iron-v16');
                        return strcmp($leftKey, $rightKey);
                    });
                    $tile = $candidates[0];
                    $placeIron->execute([$revision, $gameId, (int) $tile['i'], (int) $tile['j']]);
                    $placed += $placeIron->rowCount();
                }
                if ($placed > 0) $advanceGame->execute([$revision, $gameId]);
            }
            $statement = $db->prepare(
                "INSERT INTO `version` (component, schema_version) VALUES ('server_game', 16)
                 ON DUPLICATE KEY UPDATE schema_version = VALUES(schema_version), applied_at = CURRENT_TIMESTAMP"
            );
            $statement->execute();
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        $version = 16;
    }
    if ($version < 17) {
        $db->beginTransaction();
        try {
            $games = [];
            $loadResource = $db->prepare(
                'SELECT i, j FROM server_game_map WHERE game_id = ? AND resource_type = ?'
            );
            $loadCandidates = $db->prepare(
                'SELECT i, j, terrain_tex FROM server_game_map WHERE game_id = ? AND resource_type = 0'
            );
            $placeResource = $db->prepare(
                'UPDATE server_game_map SET resource_type = ?, revision = ?
                 WHERE game_id = ? AND i = ? AND j = ? AND resource_type = 0'
            );
            $advanceGame = $db->prepare(
                'UPDATE server_games SET revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            );
            foreach ($games as $game) {
                $gameId = (int) $game['id'];
                $mapSize = (int) $game['map_size'];
                $revision = (int) $game['revision'] + 1;
                $placed = 0;
                foreach ([
                    3 => ['terrains' => [4, 5], 'minimum' => serverMinimumCopperCount($mapSize)],
                    34 => ['terrains' => [1, 4, 5], 'minimum' => serverMinimumIronCount($mapSize)],
                ] as $resourceId => $definition) {
                    $loadResource->execute([$gameId, $resourceId]);
                    $current = count(array_filter(
                        $loadResource->fetchAll(),
                        static fn(array $tile): bool => serverPlayableCoordinate(
                            (int) $tile['i'], (int) $tile['j'], $mapSize
                        )
                    ));
                    $target = max((int) $definition['minimum'], $current * 2);
                    if ($current >= $target) continue;
                    $loadCandidates->execute([$gameId]);
                    $candidates = array_values(array_filter(
                        $loadCandidates->fetchAll(),
                        static fn(array $tile): bool => serverPlayableCoordinate(
                            (int) $tile['i'], (int) $tile['j'], $mapSize
                        ) && in_array(((int) $tile['terrain_tex']) & 0x0f, $definition['terrains'], true)
                    ));
                    usort($candidates, static function (array $left, array $right) use ($gameId, $resourceId): int {
                        $leftKey = hash('sha256', $gameId . ':' . $resourceId . ':' . $left['i'] . ':' . $left['j'] . ':resource-v17');
                        $rightKey = hash('sha256', $gameId . ':' . $resourceId . ':' . $right['i'] . ':' . $right['j'] . ':resource-v17');
                        return strcmp($leftKey, $rightKey);
                    });
                    foreach (array_slice($candidates, 0, $target - $current) as $tile) {
                        $placeResource->execute([
                            $resourceId, $revision, $gameId, (int) $tile['i'], (int) $tile['j'],
                        ]);
                        $placed += $placeResource->rowCount();
                    }
                }
                if ($placed > 0) $advanceGame->execute([$revision, $gameId]);
            }
            $statement = $db->prepare(
                "INSERT INTO `version` (component, schema_version) VALUES ('server_game', 17)
                 ON DUPLICATE KEY UPDATE schema_version = VALUES(schema_version), applied_at = CURRENT_TIMESTAMP"
            );
            $statement->execute();
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        $version = 17;
    }
    if ($version < 18) {
        $db->beginTransaction();
        try {
            $games = [];
            $loadHorses = $db->prepare(
                'SELECT i, j FROM server_game_map
                 WHERE game_id = ? AND resource_type = 33'
            );
            $loadCandidates = $db->prepare(
                'SELECT i, j FROM server_game_map
                 WHERE game_id = ? AND resource_type = 0 AND (terrain_tex & 15) IN (1, 2, 7)'
            );
            $placeHorses = $db->prepare(
                'UPDATE server_game_map SET resource_type = 33, revision = ?
                 WHERE game_id = ? AND i = ? AND j = ? AND resource_type = 0'
            );
            $advanceGame = $db->prepare(
                'UPDATE server_games SET revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            );
            foreach ($games as $game) {
                $gameId = (int) $game['id'];
                $mapSize = (int) $game['map_size'];
                $loadHorses->execute([$gameId]);
                $current = count(array_filter(
                    $loadHorses->fetchAll(),
                    static fn(array $tile): bool => serverPlayableCoordinate(
                        (int) $tile['i'], (int) $tile['j'], $mapSize
                    )
                ));
                $minimum = serverMinimumHorseCount($mapSize);
                if ($current >= $minimum) continue;
                $loadCandidates->execute([$gameId]);
                $candidates = array_values(array_filter(
                    $loadCandidates->fetchAll(),
                    static fn(array $tile): bool => serverPlayableCoordinate(
                        (int) $tile['i'], (int) $tile['j'], $mapSize
                    )
                ));
                usort($candidates, static function (array $left, array $right) use ($gameId): int {
                    return strcmp(
                        hash('sha256', $gameId . ':' . $left['i'] . ':' . $left['j'] . ':horses-v18'),
                        hash('sha256', $gameId . ':' . $right['i'] . ':' . $right['j'] . ':horses-v18')
                    );
                });
                $revision = (int) $game['revision'] + 1;
                $placed = 0;
                foreach (array_slice($candidates, 0, $minimum - $current) as $tile) {
                    $placeHorses->execute([$revision, $gameId, (int) $tile['i'], (int) $tile['j']]);
                    $placed += $placeHorses->rowCount();
                }
                if ($placed > 0) {
                    $advanceGame->execute([$revision, $gameId]);
                    recomputeVisibility($db, $gameId, $mapSize, $revision);
                }
            }
            $statement = $db->prepare(
                "INSERT INTO `version` (component, schema_version) VALUES ('server_game', 18)
                 ON DUPLICATE KEY UPDATE schema_version = VALUES(schema_version), applied_at = CURRENT_TIMESTAMP"
            );
            $statement->execute();
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        $version = 18;
    }
    if ($version < 19) {
        $db->exec(
            "CREATE TABLE IF NOT EXISTS server_game_ai_leases (
                game_id BIGINT UNSIGNED NOT NULL,
                turn_number INT UNSIGNED NOT NULL,
                unit_id BIGINT UNSIGNED NOT NULL,
                lease_token CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
                client_key VARCHAR(80) NOT NULL,
                leased_until DATETIME(6) NOT NULL,
                submitted_at DATETIME(6) NULL,
                PRIMARY KEY (game_id, turn_number, unit_id),
                KEY ix_server_ai_lease_token (game_id, turn_number, lease_token),
                KEY ix_server_ai_lease_expiry (game_id, turn_number, leased_until),
                CONSTRAINT fk_server_ai_leases_game FOREIGN KEY (game_id) REFERENCES server_games(id) ON DELETE CASCADE,
                CONSTRAINT fk_server_ai_leases_unit FOREIGN KEY (unit_id) REFERENCES server_game_units(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
        ensureGlobalAiUser($db);
        $statement = $db->prepare(
            "INSERT INTO `version` (component, schema_version) VALUES ('server_game', 19)
             ON DUPLICATE KEY UPDATE schema_version = VALUES(schema_version), applied_at = CURRENT_TIMESTAMP"
        );
        $statement->execute();
        $version = 19;
    }
    if ($version < 20) {
        $globalAiId = ensureGlobalAiUser($db);
        $statement = $db->prepare(
            'UPDATE server_game_players SET civilization_key = ?
             WHERE player_id = ? OR account_user_id = ?'
        );
        $statement->execute([SERVER_GAME_GLOBAL_AI_CIVILIZATION, $globalAiId, $globalAiId]);
        $statement = $db->prepare(
            "INSERT INTO `version` (component, schema_version) VALUES ('server_game', 20)
             ON DUPLICATE KEY UPDATE schema_version = VALUES(schema_version), applied_at = CURRENT_TIMESTAMP"
        );
        $statement->execute();
        $version = 20;
    }
    if ($version !== SERVER_GAME_SCHEMA_VERSION) {
        throw new RuntimeException('Unsupported server game schema version.');
    }
}

function intField(array $data, string $name, int $minimum = 0): int
{
    if (!isset($data[$name]) || !is_numeric($data[$name])) {
        serverError(422, 'invalid_' . $name, $name . ' must be numeric.');
    }
    $value = (int) $data[$name];
    if ($value < $minimum) {
        serverError(422, 'invalid_' . $name, $name . ' is out of range.');
    }
    return $value;
}

function gameKey(array $data): string
{
    $key = isset($data['game_id']) && is_string($data['game_id']) ? trim($data['game_id']) : '';
    if (!preg_match('/^[A-Za-z0-9_.-]{1,80}$/', $key)) {
        serverError(422, 'invalid_game_id', 'game_id must contain 1-80 safe identifier characters.');
    }
    return $key;
}

function jsonObject($value): string
{
    $encoded = json_encode($value === null ? new stdClass() : $value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    return $encoded === false ? '{}' : $encoded;
}

function loadGame(PDO $db, string $key, bool $forUpdate = false): ?array
{
    $sql = 'SELECT * FROM server_games WHERE game_key = ?' . ($forUpdate ? ' FOR UPDATE' : '');
    $statement = $db->prepare($sql);
    $statement->execute([$key]);
    $game = $statement->fetch();
    return $game ?: null;
}

function insertMapTiles(PDO $db, int $gameId, int $mapSize, array $tiles, int $revision = 1): void
{
    if (count($tiles) > $mapSize * $mapSize) {
        serverError(422, 'invalid_map', 'Map contains too many tiles.');
    }
    $seen = [];
    $batchRows = [];
    $batchValues = [];
    foreach ($tiles as $tile) {
        if (!is_array($tile)) {
            continue;
        }
        $i = (int) ($tile['i'] ?? -1);
        $j = (int) ($tile['j'] ?? -1);
        if ($i < 0 || $j < 0 || $i >= $mapSize || $j >= $mapSize) {
            serverError(422, 'invalid_map_tile', 'Map tile coordinate is out of range.');
        }
        $key = $i . ':' . $j;
        if (isset($seen[$key])) {
            serverError(422, 'duplicate_map_tile', 'Map tile coordinates must be unique.');
        }
        $seen[$key] = true;
        $batchRows[] = '(?, ?, ?, ?, ?, ?, ?, ?)';
        array_push($batchValues,
            $gameId,
            $i,
            $j,
            (int) ($tile['terrain_tex'] ?? 0),
            (int) ($tile['terrain_bits'] ?? 0),
            max(0, (int) ($tile['resource_type'] ?? 0)),
            jsonObject($tile['modifiers'] ?? []),
            $revision
        );
        if (count($batchRows) >= 250) {
            flushMapTileBatch($db, $batchRows, $batchValues);
            $batchRows = [];
            $batchValues = [];
        }
    }
    if ($batchRows) {
        flushMapTileBatch($db, $batchRows, $batchValues);
    }
    if (count($seen) !== $mapSize * $mapSize) {
        serverError(422, 'incomplete_map', 'Bootstrap must provide every map tile exactly once.');
    }
}

function flushMapTileBatch(PDO $db, array $rows, array $values): void
{
    $sql = 'INSERT INTO server_game_map
        (game_id, i, j, terrain_tex, terrain_bits, resource_type, modifiers_json, revision) VALUES '
        . implode(',', $rows);
    $statement = $db->prepare($sql);
    $statement->execute($values);
}

function serverMapRandom(int &$state): float
{
    $state = (int) (($state * 1103515245 + 12345) & 0x7fffffff);
    return $state / 2147483647;
}

function serverJsRound(float $value): int
{
    return (int) floor($value + 0.5);
}

function serverGenerateMapPaths(
    array &$terrain,
    int $mapSize,
    int &$randomState,
    int $num,
    int $msteps,
    int $mwidth,
    int $mbranch,
    float $minX,
    float $minY,
    float $maxX,
    float $maxY,
    int $type,
    int $operation
): void {
    for ($pass = 0; $pass < $num; $pass++) {
        $steps = serverJsRound(serverMapRandom($randomState) * $msteps) + $msteps;
        $randomX = serverMapRandom($randomState);
        $randomY = serverMapRandom($randomState);
        $x = $minX + $randomX * ($maxX - $minX);
        $y = $minY + $randomY * ($maxY - $minY);
        $baseJ = serverJsRound(($x - $y) / 400.0);
        $baseI = serverJsRound(($x + $y) / 400.0);

        for ($branch = 0; ; $branch++) {
            // JS evaluates Math.random() in the loop condition on every pass.
            if ($branch >= $mbranch + serverJsRound(serverMapRandom($randomState))) {
                break;
            }
            serverJsRound(serverMapRandom($randomState) * $mwidth); // Preserve the unused JS width draw.
            $directionJ = (serverMapRandom($randomState) - 0.5) / 3.0;
            $directionI = (serverMapRandom($randomState) - 0.5) / 3.0;
            $j1 = (float) $baseJ;
            $i1 = (float) $baseI;
            for ($step = 0; $step < $steps; $step++) {
                $j1 += $directionJ;
                $i1 += $directionI;
                $directionJ += (serverMapRandom($randomState) - 0.5) / 3.0;
                $directionI += (serverMapRandom($randomState) - 0.5) / 3.0;
                $j = $j1;
                $i = $i1;
                $width = $mwidth + serverJsRound(serverMapRandom($randomState));
                for ($radius = 0; $radius < $width; $radius++) {
                    $j += $directionI;
                    $i += $directionJ;
                    $ri = serverJsRound($i);
                    $rj = serverJsRound($j);
                    if ($ri < 0 || $rj < 0 || $ri >= $mapSize || $rj >= $mapSize) {
                        continue;
                    }
                    $tileX = ($i + $j) * 200.0;
                    $tileY = ($i - $j) * 200.0;
                    if ($tileX < $minX || $tileY < $minY || $tileX >= $maxX || $tileY >= $maxY) {
                        continue;
                    }
                    $index = $ri * $mapSize + $rj;
                    if ($operation === 0) {
                        $terrain[$index] = $type;
                    } elseif ($operation === 1 && ($terrain[$index] & 0x0f) !== 0) {
                        $terrain[$index] = $type;
                    } elseif ($operation === 2 && ($terrain[$index] >> 4) !== 1) {
                        $was = $terrain[$index] >> 4;
                        $terrain[$index] = ($terrain[$index] & 0x0f) | (($was === 0 ? 3 : $was - 1) << 4);
                    }
                }
            }
        }
    }
}

function serverAddRockClusters(array &$terrain, int $mapSize, int &$randomState, int $count): void
{
    for ($cluster = 0; $cluster < $count; ++$cluster) {
        $centerI = 8 + (int) floor(serverMapRandom($randomState) * max(1, $mapSize - 16));
        $centerJ = 8 + (int) floor(serverMapRandom($randomState) * max(1, $mapSize - 16));
        if (!serverPlayableCoordinate($centerI, $centerJ, $mapSize)
            || ($terrain[$centerI * $mapSize + $centerJ] & 0x0f) === 0) {
            --$cluster;
            continue;
        }
        $radius = 5 + (int) floor(serverMapRandom($randomState) * 5);
        for ($di = -$radius; $di <= $radius; ++$di) {
            for ($dj = -$radius; $dj <= $radius; ++$dj) {
                $i = $centerI + $di;
                $j = $centerJ + $dj;
                if ($i < 0 || $j < 0 || $i >= $mapSize || $j >= $mapSize
                    || !serverPlayableCoordinate($i, $j, $mapSize)) continue;
                $distance = sqrt($di * $di + $dj * $dj);
                if ($distance > $radius || serverMapRandom($randomState) > 0.88 - $distance / ($radius * 3.0)) continue;
                $height = $distance <= $radius * 0.28 ? 3 : ($distance <= $radius * 0.62 ? 2 : 1);
                $waterSource = serverMapRandom($randomState) < ($height === 3 ? 0.20 : 0.09) ? 0x80 : 0;
                $terrain[$i * $mapSize + $j] = 5 | ($height << 4) | $waterSource;
            }
        }
        // Every generated range has a definite maximum-height summit.
        $terrain[$centerI * $mapSize + $centerJ] = 5 | (3 << 4)
            | (serverMapRandom($randomState) < 0.30 ? 0x80 : 0);
    }
}

function serverEnsureHorseTerrainMinimum(array &$terrain, int $mapSize, int &$randomState, int $minimum): void
{
    $available = 0;
    $candidates = [];
    for ($i = 0; $i < $mapSize; ++$i) {
        for ($j = 0; $j < $mapSize; ++$j) {
            if (!serverPlayableCoordinate($i, $j, $mapSize)) continue;
            $index = $i * $mapSize + $j;
            $type = $terrain[$index] & 0x0f;
            if (in_array($type, [1, 2, 7], true)) ++$available;
            elseif ($type !== 0) $candidates[] = $index;
        }
    }
    for ($index = count($candidates) - 1; $index > 0; --$index) {
        $swap = (int) floor(serverMapRandom($randomState) * ($index + 1));
        [$candidates[$index], $candidates[$swap]] = [$candidates[$swap], $candidates[$index]];
    }
    foreach (array_slice($candidates, 0, max(0, $minimum - $available)) as $index) {
        $terrain[$index] = 2;
    }
}

function serverFixMap(array &$terrain, int $mapSize, float $minY, float $maxY): void
{
    $sandMin = $minY + ($maxY - $minY) / 3.0;
    $sandMax = $maxY - ($maxY - $minY) / 3.0;
    for ($i = 1; $i < $mapSize - 1; $i++) {
        for ($j = 1; $j < $mapSize - 1; $j++) {
            $index = $i * $mapSize + $j;
            $screenY = ($i - $j) * 200.0;
            if ($terrain[$index] === 0 && $screenY > $sandMin && $screenY < $sandMax) {
                foreach ([[$i + 1, $j], [$i, $j + 1], [$i - 1, $j], [$i, $j - 1]] as $point) {
                    $neighbor = $point[0] * $mapSize + $point[1];
                    if ($terrain[$neighbor] === 2) $terrain[$neighbor] = 1;
                }
            }
            if ($terrain[$index] === 0) {
                foreach ([[$i + 1, $j], [$i, $j + 1], [$i - 1, $j], [$i, $j - 1]] as $point) {
                    if ($terrain[$point[0] * $mapSize + $point[1]] !== 0) {
                        $terrain[$index] = 0x10;
                        break;
                    }
                }
            }
        }
    }
}

function serverEnhanceMap(array &$terrain, array &$terrainBits, int $mapSize, int &$randomState): void
{
    $superTileTextures = [
        64 => true, 65 => true, 68 => true, 70 => true,
        80 => true, 81 => true, 84 => true, 86 => true,
        96 => true, 97 => true, 100 => true, 102 => true,
        112 => true, 118 => true,
    ];
    for ($i = 0; $i < $mapSize - 1; $i++) {
        for ($j = 0; $j < $mapSize - 1; $j++) {
            $index = $i * $mapSize + $j;
            $base = $terrain[$index] & 0x3f;
            $superTexture = $base + 0x40;
            if (isset($superTileTextures[$superTexture])
                && ($terrain[$index] & 0x40) === 0
                && ($terrain[($i + 1) * $mapSize + $j] & 0x40) === 0
                && ($terrain[$i * $mapSize + $j + 1] & 0x40) === 0
                && ($terrain[($i + 1) * $mapSize + $j + 1] & 0x40) === 0
                && ($terrain[($i + 1) * $mapSize + $j] & 0x3f) === $base
                && ($terrain[$i * $mapSize + $j + 1] & 0x3f) === $base
                && ($terrain[($i + 1) * $mapSize + $j + 1] & 0x3f) === $base) {
                $terrain[($i + 1) * $mapSize + $j] |= 0x40;
                $terrain[($i + 1) * $mapSize + $j + 1] |= 0x40;
                if (($superTexture & 0x0f) === 4 && $i + 2 < $mapSize && $j + 2 < $mapSize) {
                    foreach ([[$i + 2, $j + 1], [$i + 1, $j + 2], [$i + 2, $j + 2]] as $point) {
                        $shadowIndex = $point[0] * $mapSize + $point[1];
                        if (($terrain[$shadowIndex] & 0x0f) !== 4) $terrainBits[$shadowIndex] |= 0x8000;
                    }
                }
            }
            if ($terrain[$index] === 84 && serverMapRandom($randomState) > 0.5) {
                $terrain[$index] |= 0x80;
            }
            if ($terrain[$index] === 68 && serverMapRandom($randomState) > 0.5) {
                $terrain[$index] |= 0x80;
            }
            if ($terrain[$index] === 98) {
                serverMapRandom($randomState); // Preserve the disabled alternative-tile random draw.
            }
            if (($terrain[$index] & 0x0f) !== 0) {
                $terrainBits[$index] = ($terrainBits[$index] & 0xfff0) | (($terrain[$index] >> 4) & 0x03);
            }
        }
    }
}

function serverResourceDefinitions(): array
{
    return [
        1 => [[6, 2], 0.012], 2 => [[2], 0.012], 3 => [[4, 5], 0.020],
        4 => [[0, 7], 0.010], 5 => [[6, 3], 0.010], 6 => [[0], 0.012],
        7 => [[2, 7], 0.012], 8 => [[2, 4], 0.012], 9 => [[4, 5], 0.024],
        10 => [[2, 7], 0.012], 11 => [[6, 3], 0.007], 12 => [[2, 6], 0.008],
        13 => [[2, 1], 0.008], 14 => [[6, 2], 0.008], 15 => [[4, 5], 0.005],
        16 => [[3, 6], 0.007], 17 => [[1, 4, 5], 0.008], 18 => [[6, 2], 0.008],
        19 => [[1, 4], 0.007], 20 => [[2, 6], 0.003], 21 => [[4, 5], 0.014],
        22 => [[2, 4], 0.008], 23 => [[0], 0.006], 24 => [[1, 0, 4], 0.008],
        25 => [[6], 0.006], 26 => [[4, 5], 0.007], 27 => [[6, 2], 0.008],
        28 => [[2, 7], 0.008], 29 => [[4, 6], 0.007], 30 => [[0], 0.006],
        31 => [[0], 0.005], 32 => [[2, 4], 0.007], 33 => [[2, 1, 7], 0.010],
        34 => [[1, 4, 5], 0.020], 35 => [[4, 5, 1], 0.007],
        36 => [[4, 5], 0.006],
    ];
}

function serverPlayableCoordinate(int $i, int $j, int $mapSize): bool
{
    return $i + $j >= $mapSize / 2 && $i + $j < $mapSize * 1.5
        && $i - $j >= -$mapSize / 2 && $i - $j < $mapSize / 2;
}

function serverMinimumIronCount(int $mapSize): int
{
    return serverMinimumStrategicResourceCount($mapSize);
}

function serverMinimumCopperCount(int $mapSize): int
{
    return serverMinimumStrategicResourceCount($mapSize);
}

function serverMinimumHorseCount(int $mapSize): int
{
    return max(6, min(10, intdiv($mapSize * $mapSize, 1000)));
}

function serverMinimumGoldCount(int $mapSize): int
{
    return serverMinimumStrategicResourceCount($mapSize);
}

function serverMinimumStrategicResourceCount(int $mapSize): int
{
    // A client sees a 100x100 window of the larger world. Scale protected
    // deposits by world width so every strategic type is discoverable across
    // a new map without creating an unbounded guard army.
    return max(2, min(10, (int) ceil($mapSize / 30)));
}

function serverStrategicResourceTerrains(): array
{
    return [
        3 => [4, 5],       // Copper
        15 => [4, 5],      // Diamonds / brilliants
        34 => [1, 4, 5],   // Iron
        35 => [1, 4, 5],   // Gold
        36 => [4, 5],      // Gems
    ];
}

function serverEnsureGeneratedResourceMinimum(
    array &$tiles, int $mapSize, int &$randomState, int $resourceId, array $terrainTypes, int $minimum
): void {
    $current = 0;
    $terrainHasResource = array_fill_keys($terrainTypes, false);
    $candidatesByTerrain = array_fill_keys($terrainTypes, []);
    foreach ($tiles as $index => $tile) {
        $i = (int) $tile['i'];
        $j = (int) $tile['j'];
        if (!serverPlayableCoordinate($i, $j, $mapSize)) continue;
        $terrainType = ((int) $tile['terrain_tex']) & 0x0f;
        if (!array_key_exists($terrainType, $terrainHasResource)) continue;
        if ((int) $tile['resource_type'] === $resourceId) {
            $current++;
            $terrainHasResource[$terrainType] = true;
        } elseif ((int) $tile['resource_type'] === 0) {
            $candidatesByTerrain[$terrainType][] = $index;
        }
    }
    foreach ($candidatesByTerrain as $terrainType => $candidates) {
        if ($terrainHasResource[$terrainType] || !$candidates) continue;
        $choice = (int) floor(serverMapRandom($randomState) * count($candidates));
        $tiles[$candidates[$choice]]['resource_type'] = $resourceId;
        $current++;
    }
    $candidates = [];
    foreach ($tiles as $index => $tile) {
        $terrainType = ((int) $tile['terrain_tex']) & 0x0f;
        if ((int) $tile['resource_type'] === 0 && isset($terrainHasResource[$terrainType])
            && serverPlayableCoordinate((int) $tile['i'], (int) $tile['j'], $mapSize)) {
            $candidates[] = $index;
        }
    }
    if (count($candidates) < max(0, $minimum - $current)) {
        $known = array_fill_keys($candidates, true);
        foreach ($tiles as $index => $tile) {
            $terrainType = ((int) $tile['terrain_tex']) & 0x0f;
            if (!isset($terrainHasResource[$terrainType]) || isset($known[$index])
                || (int) $tile['resource_type'] === $resourceId
                || in_array((int) $tile['resource_type'], [3, 15, 33, 34, 35, 36], true)
                || !serverPlayableCoordinate((int) $tile['i'], (int) $tile['j'], $mapSize)) continue;
            $candidates[] = $index;
        }
    }
    for ($index = count($candidates) - 1; $index > 0; $index--) {
        $swap = (int) floor(serverMapRandom($randomState) * ($index + 1));
        [$candidates[$index], $candidates[$swap]] = [$candidates[$swap], $candidates[$index]];
    }
    foreach (array_slice($candidates, 0, max(0, $minimum - $current)) as $tileIndex) {
        $tiles[$tileIndex]['resource_type'] = $resourceId;
    }
}

function serverShapeContinentalCoast(array &$terrain, int $mapSize): void
{
    $sumMinimum = $mapSize / 2.0;
    $sumMaximum = $mapSize * 1.5 - 1.0;
    $differenceMinimum = -$mapSize / 2.0;
    $differenceMaximum = $mapSize / 2.0 - 1.0;
    for ($i = 0; $i < $mapSize; $i++) {
        for ($j = 0; $j < $mapSize; $j++) {
            $sum = $i + $j;
            $difference = $i - $j;
            $margin = min(
                $sum - $sumMinimum,
                $sumMaximum - $sum,
                $difference - $differenceMinimum,
                $differenceMaximum - $difference
            );
            $coastWidth = 4.5
                + 2.2 * sin($i * 0.19)
                + 1.8 * sin($j * 0.13)
                + 1.4 * sin(($i + $j) * 0.071)
                + 1.1 * sin(($i - $j) * 0.29);
            if ($margin < max(1.0, min(9.0, $coastWidth))) {
                $terrain[$i * $mapSize + $j] = 0;
            }
        }
    }
}

function generateServerMapTilesCandidate(int $mapSize, string $gameKey): array
{
    // Math.random() creates a new world on every JS run; use a fresh server seed for each empty-map regeneration.
    $seed = random_int(1, 0x7fffffff) ^ (int) sprintf('%u', crc32($gameKey));
    $randomState = $seed === 0 ? 1 : $seed;
    $terrain = array_fill(0, $mapSize * $mapSize, 0);
    $terrainBits = array_fill(0, $mapSize * $mapSize, 0xff);
    $minX = $mapSize / 2.0 * 200.0;
    $minY = -$mapSize / 2.0 * 200.0;
    $maxX = $mapSize / 2.0 * 600.0;
    $maxY = $mapSize / 2.0 * 200.0;
    // Path length grows in projected world coordinates, so seed counts scale
    // with map width. Area scaling overfills a 300x300 world with land.
    $generationScale = max(0.25, $mapSize / 100.0);
    $scaled = static fn(int $count): int => max(1, (int) round($count * $generationScale));

    // Match map.js terrain paths. Do not impose a geometric coastline over them;
    // that converted the projected play area into one visibly rectangular island.
    serverGenerateMapPaths($terrain, $mapSize, $randomState, $scaled(14), 20, 32, 10, $minX, $minY, $maxX, $maxY, 2, 0);
    serverGenerateMapPaths($terrain, $mapSize, $randomState, $scaled(10), 10, 4, 4, $minX, $minY + ($maxY - $minY) / 3, $maxX, $maxY - ($maxY - $minY) / 3, 1, 1);
    serverGenerateMapPaths($terrain, $mapSize, $randomState, $scaled(SERVER_MAP_HILL_SEEDS), 12, 6, 10, $minX, $minY, $maxX, $maxY, 4, 1);
    serverGenerateMapPaths($terrain, $mapSize, $randomState, $scaled(SERVER_MAP_FOREST_SEEDS), 12, 12, 6, $minX, $minY, $maxX, $maxY, 6, 1);
    // Rock paths are last among land biomes so later hill/forest paths do not
    // erase the additional rock seeds.
    serverGenerateMapPaths($terrain, $mapSize, $randomState, $scaled(SERVER_MAP_ROCK_SEEDS), 2, 4, 2, $minX, $minY + ($maxY - $minY) / 3, $maxX, $maxY - ($maxY - $minY) / 3, 5, 1);
    serverGenerateMapPaths($terrain, $mapSize, $randomState, $scaled(10), 10, 10, 5, $minX, $minY, $maxX, $minY + ($maxY - $minY) / 10, 3, 1);
    serverGenerateMapPaths($terrain, $mapSize, $randomState, $scaled(10), 10, 10, 5, $minX, $maxY - ($maxY - $minY) / 10, $maxX, $maxY, 3, 1);
    serverFixMap($terrain, $mapSize, $minY, $maxY);
    serverGenerateMapPaths($terrain, $mapSize, $randomState, $scaled(16), 20, 4, 4, $minX, $minY, $maxX, $maxY, -1, 2);
    serverGenerateMapPaths($terrain, $mapSize, $randomState, $scaled(10), 20, 1, 1, $minX, $minY, $maxX, $maxY, 0x10, 0);
    serverGenerateMapPaths($terrain, $mapSize, $randomState, $scaled(6), 10, 1, 1, $minX, $minY + ($maxY - $minY) / 10, $maxX, $maxY - ($maxY - $minY) / 10, 0x37, 1);
    serverAddRockClusters($terrain, $mapSize, $randomState, $scaled(12));
    serverEnsureHorseTerrainMinimum($terrain, $mapSize, $randomState, serverMinimumHorseCount($mapSize));
    serverEnhanceMap($terrain, $terrainBits, $mapSize, $randomState);

    $resources = serverResourceDefinitions();
    $strategicChanceScale = min(1.0, 10000.0 / max(10000.0, $mapSize * $mapSize));
    $tiles = [];
    for ($i = 0; $i < $mapSize; $i++) {
        for ($j = 0; $j < $mapSize; $j++) {
            $index = $i * $mapSize + $j;
            $terrainType = $terrain[$index] & 0x0f;
            $resourceType = 0;
            foreach ($resources as $resourceId => $definition) {
                $chance = $definition[1] * (in_array($resourceId, [3, 15, 34, 35, 36], true)
                    ? $strategicChanceScale : 1.0);
                if (in_array($terrainType, $definition[0], true)
                    && serverMapRandom($randomState) < $chance) {
                    $resourceType = $resourceId;
                    break;
                }
            }
            $tiles[] = [
                'i' => $i,
                'j' => $j,
                'terrain_tex' => $terrain[$index],
                'terrain_bits' => $terrainBits[$index],
                'resource_type' => $resourceType,
                'modifiers' => [],
            ];
        }
    }
    serverEnsureGeneratedResourceMinimum(
        $tiles, $mapSize, $randomState, 3, [4, 5], serverMinimumCopperCount($mapSize)
    );
    serverEnsureGeneratedResourceMinimum(
        $tiles, $mapSize, $randomState, 34, [1, 4, 5], serverMinimumIronCount($mapSize)
    );
    serverEnsureGeneratedResourceMinimum(
        $tiles, $mapSize, $randomState, 33, [1, 2, 7], serverMinimumHorseCount($mapSize)
    );
    serverEnsureGeneratedResourceMinimum(
        $tiles, $mapSize, $randomState, 35, [1, 4, 5], serverMinimumGoldCount($mapSize)
    );
    serverEnsureGeneratedResourceMinimum(
        $tiles, $mapSize, $randomState, 15, [4, 5], serverMinimumStrategicResourceCount($mapSize)
    );
    serverEnsureGeneratedResourceMinimum(
        $tiles, $mapSize, $randomState, 36, [4, 5], serverMinimumStrategicResourceCount($mapSize)
    );
    return $tiles;
}

function serverMapQuality(array $tiles, int $mapSize): array
{
    $land = [];
    $playable = 0;
    foreach ($tiles as $tile) {
        $i = (int) $tile['i'];
        $j = (int) $tile['j'];
        // Same inscribed rhombus as _map_view in index.html.
        if ($i + $j < $mapSize / 2 || $i + $j >= $mapSize * 1.5
            || $i - $j < -$mapSize / 2 || $i - $j >= $mapSize / 2) {
            continue;
        }
        $playable++;
        if ((((int) $tile['terrain_tex']) & 0x0f) !== 0) {
            $land[coordinateKey($i, $j)] = [$i, $j];
        }
    }

    $remaining = $land;
    $components = 0;
    $largest = 0;
    $directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]];
    while ($remaining) {
        $startKey = array_key_first($remaining);
        $queue = [$remaining[$startKey]];
        unset($remaining[$startKey]);
        $head = 0;
        $size = 0;
        while ($head < count($queue)) {
            [$i, $j] = $queue[$head++];
            $size++;
            foreach ($directions as [$di, $dj]) {
                $key = coordinateKey($i + $di, $j + $dj);
                if (!isset($remaining[$key])) continue;
                $queue[] = $remaining[$key];
                unset($remaining[$key]);
            }
        }
        $components++;
        $largest = max($largest, $size);
    }

    $landCount = count($land);
    return [
        'playable_tiles' => $playable,
        'land_tiles' => $landCount,
        'land_ratio' => $playable ? $landCount / $playable : 0.0,
        'land_components' => $components,
        'largest_land_ratio' => $landCount ? $largest / $landCount : 0.0,
    ];
}

function storedServerMapDiagnostics(PDO $db, array $game): array
{
    $statement = $db->prepare(
        'SELECT i, j, terrain_tex, terrain_bits, resource_type FROM server_game_map WHERE game_id = ? ORDER BY i, j'
    );
    $statement->execute([(int) $game['id']]);
    $tiles = $statement->fetchAll();
    $quality = serverMapQuality($tiles, (int) $game['map_size']);
    $terrainCounts = [];
    $resourceCounts = [];
    $playableResourceCounts = [];
    $playableIronTerrainCounts = [];
    $landBounds = ['min_i' => null, 'max_i' => null, 'min_j' => null, 'max_j' => null];
    $landTiles = 0;
    $mapSize = (int) $game['map_size'];
    foreach ($tiles as $tile) {
        $terrainType = ((int) $tile['terrain_tex']) & 0x0f;
        $terrainCounts[$terrainType] = ($terrainCounts[$terrainType] ?? 0) + 1;
        $resourceType = (int) $tile['resource_type'];
        if ($resourceType !== 0) {
            $resourceCounts[$resourceType] = ($resourceCounts[$resourceType] ?? 0) + 1;
            $i = (int) $tile['i'];
            $j = (int) $tile['j'];
            if ($i + $j >= $mapSize / 2 && $i + $j < $mapSize * 1.5
                && $i - $j >= -$mapSize / 2 && $i - $j < $mapSize / 2) {
                $playableResourceCounts[$resourceType] = ($playableResourceCounts[$resourceType] ?? 0) + 1;
                if ($resourceType === 34) {
                    $playableIronTerrainCounts[$terrainType] = ($playableIronTerrainCounts[$terrainType] ?? 0) + 1;
                }
            }
        }
        if ($terrainType === 0) continue;
        $i = (int) $tile['i'];
        $j = (int) $tile['j'];
        $landTiles++;
        $landBounds['min_i'] = $landBounds['min_i'] === null ? $i : min($landBounds['min_i'], $i);
        $landBounds['max_i'] = $landBounds['max_i'] === null ? $i : max($landBounds['max_i'], $i);
        $landBounds['min_j'] = $landBounds['min_j'] === null ? $j : min($landBounds['min_j'], $j);
        $landBounds['max_j'] = $landBounds['max_j'] === null ? $j : max($landBounds['max_j'], $j);
    }
    ksort($terrainCounts);
    ksort($resourceCounts);
    ksort($playableResourceCounts);
    ksort($playableIronTerrainCounts);
    return $quality + [
        'game_database_id' => (int) $game['id'],
        'map_size' => (int) $game['map_size'],
        'stored_tiles' => count($tiles),
        'all_grid_land_tiles' => $landTiles,
        'all_grid_land_ratio' => count($tiles) ? $landTiles / count($tiles) : 0.0,
        'land_bounds' => $landBounds,
        'terrain_type_counts' => $terrainCounts,
        'resource_type_counts' => $resourceCounts,
        'playable_resource_type_counts' => $playableResourceCounts,
        'playable_iron_terrain_type_counts' => $playableIronTerrainCounts,
    ];
}

function generateServerMapTiles(int $mapSize, string $gameKey, ?array &$quality = null): array
{
    $bestTiles = [];
    $bestQuality = ['land_ratio' => 0.0, 'largest_land_ratio' => 0.0];
    $bestScore = INF;
    for ($attempt = 1; $attempt <= 16; $attempt++) {
        $tiles = generateServerMapTilesCandidate($mapSize, $gameKey . ':' . $attempt);
        $candidateQuality = serverMapQuality($tiles, $mapSize);
        $candidateQuality['attempt'] = $attempt;
        $score = abs($candidateQuality['land_ratio'] - 0.78)
            + max(0.0, 0.75 - $candidateQuality['largest_land_ratio']) * 2.0;
        if ($score < $bestScore) {
            $bestTiles = $tiles;
            $bestQuality = $candidateQuality;
            $bestScore = $score;
        }
        if ($candidateQuality['land_ratio'] >= 0.58 && $candidateQuality['land_ratio'] <= 0.84
            && $candidateQuality['largest_land_ratio'] >= 0.75) {
            $quality = $candidateQuality;
            return $tiles;
        }
    }
    $quality = $bestQuality;
    return $bestTiles;
}

function insertBootstrapUnits(PDO $db, int $gameId, int $mapSize, array $units, int $revision = 1): array
{
    $statement = $db->prepare(
        'INSERT INTO server_game_units
         (game_id, client_key, owner_id, unit_type_id, unit_class, name, texture, can_move, nature, i, j,
          attack_value, defense_value, speed, view_range, state, health, max_health, experience, move_penalty, properties_json, revision)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $mapping = [];
    foreach ($units as $unit) {
        if (!is_array($unit)) {
            continue;
        }
        $i = (int) ($unit['i'] ?? -1);
        $j = (int) ($unit['j'] ?? -1);
        if ($i < 0 || $j < 0 || $i >= $mapSize || $j >= $mapSize) {
            serverError(422, 'invalid_unit_coordinate', 'Bootstrap unit coordinate is out of range.');
        }
        $clientKey = isset($unit['client_key']) ? substr((string) $unit['client_key'], 0, 100) : null;
        $statement->execute([
            $gameId,
            $clientKey === '' ? null : $clientKey,
            max(0, (int) ($unit['owner_id'] ?? 0)),
            substr((string) ($unit['unit_type_id'] ?? 'unknown'), 0, 50),
            (int) ($unit['unit_class'] ?? 0),
            substr((string) ($unit['name'] ?? ''), 0, 100),
            (int) ($unit['texture'] ?? 0),
            !empty($unit['can_move']) ? 1 : 0,
            ($unit['nature'] ?? 'land') === 'water' ? 'water' : 'land',
            $i,
            $j,
            (float) ($unit['attack'] ?? 0),
            (float) ($unit['defense'] ?? 0),
            max(0.0, (float) ($unit['speed'] ?? 1)),
            max(0, (int) ($unit['view_range'] ?? 2)),
            substr((string) ($unit['state'] ?? 'ready'), 0, 40),
            max(0.0, (float) ($unit['health'] ?? 100)),
            max(1.0, (float) ($unit['max_health'] ?? 100)),
            max(0.0, (float) ($unit['experience'] ?? 1)),
            max(0, (int) ($unit['move_penalty'] ?? 0)),
            jsonObject($unit['properties'] ?? []),
            $revision,
        ]);
        if ($clientKey !== null && $clientKey !== '') {
            $mapping[$clientKey] = (int) $db->lastInsertId();
        }
    }
    return $mapping;
}

function resourceGuardUnitSpecs(
    int $ownerId, array $tiles, int $mapSize, array $occupancy = [], ?array $onlyResources = null,
    string $clientKeyPrefix = 'resource-guard'
): array
{
    $guardedResources = [3, 15, 34, 35, 36]; // copper, diamonds, iron, gold, gems
    $land = [];
    $landByKey = [];
    $waterByKey = [];
    $resources = [];
    foreach ($tiles as $tile) {
        $i = (int) $tile['i'];
        $j = (int) $tile['j'];
        if (!serverPlayableCoordinate($i, $j, $mapSize)) continue;
        $resourceKey = coordinateKey($i, $j);
        if ((((int) $tile['terrain_tex']) & 0x0f) === 0) {
            $waterByKey[$resourceKey] = [
                'i' => $i,
                'j' => $j,
                'deep' => ((((int) $tile['terrain_tex']) >> 4) & 0x03) > 1,
            ];
            continue;
        }
        $land[] = ['i' => $i, 'j' => $j];
        $landByKey[$resourceKey] = ['i' => $i, 'j' => $j];
        if (in_array((int) $tile['resource_type'], $guardedResources, true)
            && ($onlyResources === null || isset($onlyResources[$resourceKey]))) {
            $resources[] = ['i' => $i, 'j' => $j, 'type' => (int) $tile['resource_type']];
        }
    }

    // Label connected landmasses. The largest is the mainland; strategic
    // guards generated on every other component need naval transport.
    $landComponentByKey = [];
    $landComponents = [];
    $remainingLand = $landByKey;
    while ($remainingLand) {
        $startKey = array_key_first($remainingLand);
        $componentId = count($landComponents);
        $queue = [$remainingLand[$startKey]];
        unset($remainingLand[$startKey]);
        $head = 0;
        $componentKeys = [];
        while ($head < count($queue)) {
            $coordinate = $queue[$head++];
            $key = coordinateKey($coordinate['i'], $coordinate['j']);
            $landComponentByKey[$key] = $componentId;
            $componentKeys[] = $key;
            foreach (serverNeighborDirections() as [$di, $dj]) {
                $neighborKey = coordinateKey($coordinate['i'] + $di, $coordinate['j'] + $dj);
                if (!isset($remainingLand[$neighborKey])) continue;
                $queue[] = $remainingLand[$neighborKey];
                unset($remainingLand[$neighborKey]);
            }
        }
        $landComponents[$componentId] = $componentKeys;
    }
    $mainlandComponentId = null;
    $mainlandSize = -1;
    foreach ($landComponents as $componentId => $componentKeys) {
        if (count($componentKeys) <= $mainlandSize) continue;
        $mainlandComponentId = $componentId;
        $mainlandSize = count($componentKeys);
    }

    // A water component is sea when it contains deep water. Coastal Galley
    // placement therefore cannot accidentally choose an enclosed shallow lake.
    $seaWater = [];
    $remainingWater = $waterByKey;
    while ($remainingWater) {
        $startKey = array_key_first($remainingWater);
        $queue = [$remainingWater[$startKey]];
        unset($remainingWater[$startKey]);
        $head = 0;
        $componentKeys = [];
        $containsDeepWater = false;
        while ($head < count($queue)) {
            $coordinate = $queue[$head++];
            $key = coordinateKey($coordinate['i'], $coordinate['j']);
            $componentKeys[] = $key;
            if (!empty($waterByKey[$key]['deep'])) $containsDeepWater = true;
            foreach (serverNeighborDirections() as [$di, $dj]) {
                $neighborKey = coordinateKey($coordinate['i'] + $di, $coordinate['j'] + $dj);
                if (!isset($remainingWater[$neighborKey])) continue;
                $queue[] = $remainingWater[$neighborKey];
                unset($remainingWater[$neighborKey]);
            }
        }
        if ($containsDeepWater) {
            foreach ($componentKeys as $key) $seaWater[$key] = true;
        }
    }

    $definitions = serverUnitDefinitions();
    // Explorers reveal the guarded deposit. Archers, settlers, and the automated
    // Worker are placed around it so the first City still needs a road to it.
    $composition = ['explorer' => 5, 'archer' => 10, 'settlers' => 5, 'worker' => 1];
    $units = [];
    foreach ($resources as $resource) {
        $resourceKey = coordinateKey($resource['i'], $resource['j']);
        $resourceComponentId = $landComponentByKey[$resourceKey] ?? null;
        $candidates = $land;
        usort($candidates, static function(array $left, array $right) use ($resource): int {
            $leftDistance = max(abs($left['i'] - $resource['i']), abs($left['j'] - $resource['j']));
            $rightDistance = max(abs($right['i'] - $resource['i']), abs($right['j'] - $resource['j']));
            if ($leftDistance !== $rightDistance) return $leftDistance <=> $rightDistance;
            return strcmp(
                hash('sha256', $resource['i'] . ':' . $resource['j'] . ':' . $left['i'] . ':' . $left['j']),
                hash('sha256', $resource['i'] . ':' . $resource['j'] . ':' . $right['i'] . ':' . $right['j'])
            );
        });
        $candidateIndex = 0;
        foreach ($composition as $unitTypeId => $count) {
            $definition = $definitions[$unitTypeId];
            for ($slot = 0; $slot < $count; $slot++) {
                while ($candidateIndex < count($candidates)) {
                    $candidate = $candidates[$candidateIndex];
                    $key = coordinateKey($candidate['i'], $candidate['j']);
                    if (($occupancy[$key] ?? 0) < SERVER_GAME_TILE_UNIT_LIMIT) break;
                    $candidateIndex++;
                }
                if ($candidateIndex >= count($candidates)) break;
                $candidate = $candidates[$candidateIndex];
                $key = coordinateKey($candidate['i'], $candidate['j']);
                $occupancy[$key] = ($occupancy[$key] ?? 0) + 1;
                $properties = serverUnitProperties($definition);
                $properties['guardResource'] = $resource;
                if ($unitTypeId === 'worker') {
                    $properties['automationMode'] = 'automate';
                }
                $units[] = [
                    'client_key' => $clientKeyPrefix . '-' . $resource['i'] . '-' . $resource['j'] . '-' . $unitTypeId . '-' . $slot,
                    'owner_id' => $ownerId,
                    'unit_type_id' => $unitTypeId,
                    'unit_class' => $definition['class'],
                    'name' => $definition['name'],
                    'texture' => $definition['texture'],
                    'can_move' => true,
                    'nature' => $definition['nature'],
                    'i' => $candidate['i'], 'j' => $candidate['j'],
                    'attack' => $definition['attack'], 'defense' => $definition['defense'],
                    'speed' => $definition['speed'], 'view_range' => $definition['view_range'],
                    'state' => $unitTypeId === 'worker' ? 'automate' : 'ready',
                    'health' => SERVER_GAME_INITIAL_HEALTH,
                    'max_health' => SERVER_GAME_INITIAL_HEALTH,
                    'experience' => SERVER_GAME_INITIAL_EXPERIENCE,
                    'properties' => $properties,
                ];
            }
        }

        if ($resourceComponentId === null || $resourceComponentId === $mainlandComponentId) continue;
        $coastalSea = [];
        foreach ($landComponents[$resourceComponentId] as $islandKey) {
            $islandTile = $landByKey[$islandKey];
            foreach (serverNeighborDirections() as [$di, $dj]) {
                $waterKey = coordinateKey($islandTile['i'] + $di, $islandTile['j'] + $dj);
                if (!isset($seaWater[$waterKey]) || isset($coastalSea[$waterKey])) continue;
                $coastalSea[$waterKey] = $waterByKey[$waterKey];
            }
        }
        $coastalSea = array_values($coastalSea);
        usort($coastalSea, static function(array $left, array $right) use ($resource): int {
            $leftDistance = serverHexDistance($left['i'], $left['j'], $resource['i'], $resource['j']);
            $rightDistance = serverHexDistance($right['i'], $right['j'], $resource['i'], $resource['j']);
            if ($leftDistance !== $rightDistance) return $leftDistance <=> $rightDistance;
            return strcmp(
                hash('sha256', $resource['i'] . ':' . $resource['j'] . ':galley:' . $left['i'] . ':' . $left['j']),
                hash('sha256', $resource['i'] . ':' . $resource['j'] . ':galley:' . $right['i'] . ':' . $right['j'])
            );
        });
        $galleyTile = null;
        foreach ($coastalSea as $candidate) {
            $key = coordinateKey($candidate['i'], $candidate['j']);
            if (($occupancy[$key] ?? 0) >= SERVER_GAME_TILE_UNIT_LIMIT) continue;
            $galleyTile = $candidate;
            $occupancy[$key] = ($occupancy[$key] ?? 0) + 1;
            break;
        }
        if ($galleyTile === null) continue;
        $definition = $definitions['galley'];
        $properties = serverUnitProperties($definition);
        $properties['guardResource'] = $resource;
        $properties['islandTransport'] = true;
        $units[] = [
            'client_key' => $clientKeyPrefix . '-' . $resource['i'] . '-' . $resource['j'] . '-galley-0',
            'owner_id' => $ownerId,
            'unit_type_id' => 'galley',
            'unit_class' => $definition['class'],
            'name' => $definition['name'],
            'texture' => $definition['texture'],
            'can_move' => true,
            'nature' => 'water',
            'i' => $galleyTile['i'], 'j' => $galleyTile['j'],
            'attack' => $definition['attack'], 'defense' => $definition['defense'],
            'speed' => $definition['speed'], 'view_range' => $definition['view_range'],
            'state' => 'ready',
            'health' => SERVER_GAME_INITIAL_HEALTH,
            'max_health' => SERVER_GAME_INITIAL_HEALTH,
            'experience' => SERVER_GAME_INITIAL_EXPERIENCE,
            'properties' => $properties,
        ];
    }
    return $units;
}

function seedGlobalAiResourceGuards(PDO $db, int $gameId, int $mapSize, array $tiles, int $revision): int
{
    $globalAiId = ensureGlobalAiUser($db);
    $statement = $db->prepare(
        'INSERT INTO server_game_players
         (game_id, player_id, account_user_id, civilization_key, active, state_json)
         VALUES (?, ?, ?, ?, 1, ?)
         ON DUPLICATE KEY UPDATE account_user_id = VALUES(account_user_id),
             civilization_key = VALUES(civilization_key), active = 1'
    );
    $statement->execute([
        $gameId, $globalAiId, $globalAiId, SERVER_GAME_GLOBAL_AI_CIVILIZATION, jsonObject(defaultPlayerState()),
    ]);
    $statement = $db->prepare(
        'SELECT i, j, COUNT(*) AS unit_count FROM server_game_units
         WHERE game_id = ? AND can_move = 1 AND deleted_at IS NULL GROUP BY i, j'
    );
    $statement->execute([$gameId]);
    $occupancy = [];
    foreach ($statement->fetchAll() as $row) {
        $occupancy[coordinateKey((int) $row['i'], (int) $row['j'])] = (int) $row['unit_count'];
    }
    $units = resourceGuardUnitSpecs($globalAiId, $tiles, $mapSize, $occupancy);
    insertBootstrapUnits($db, $gameId, $mapSize, $units, $revision);
    $state = defaultPlayerState();
    // Guards have no initial cities. Fund several thousand turns of their
    // food upkeep so generation does not silently erase the protected forces.
    $state['food'] = max(SERVER_GAME_AI_RESOURCE_BUDGET, count($units) * 5000);
    $state['money'] = max(SERVER_GAME_AI_RESOURCE_BUDGET, count($units) * 5000);
    $statement = $db->prepare(
        'UPDATE server_game_players SET state_json = ? WHERE game_id = ? AND player_id = ?'
    );
    $statement->execute([jsonObject($state), $gameId, $globalAiId]);
    return count($units);
}

function hotfixStrategicResources(PDO $db, array $game): array
{
    $gameId = (int) $game['id'];
    $mapSize = (int) $game['map_size'];
    $before = storedServerMapDiagnostics($db, $game);
    $db->beginTransaction();
    try {
        $game = loadGame($db, (string) $game['game_key'], true);
        $revision = (int) $game['revision'] + 1;
        $tilesByKey = loadTiles($db, $gameId);
        $tiles = array_values($tilesByKey);
        $targets = [
            [0.30, 0.50], [0.70, 0.50], [0.50, 0.30], [0.50, 0.70], [0.38, 0.38],
            [0.62, 0.62], [0.38, 0.62], [0.62, 0.38], [0.25, 0.50], [0.75, 0.50],
        ];
        $resourceTerrains = serverStrategicResourceTerrains();
        $newResources = [];
        $updateTile = $db->prepare(
            'UPDATE server_game_map SET resource_type = ?, modifiers_json = ?, revision = ?
             WHERE game_id = ? AND i = ? AND j = ? AND resource_type = 0'
        );
        $targetIndex = 0;
        foreach ($resourceTerrains as $resourceId => $terrainTypes) {
            $alreadyHotfixed = 0;
            foreach ($tiles as $tile) {
                $modifiers = json_decode((string) ($tile['modifiers_json'] ?? '{}'), true);
                if (($modifiers['strategic_hotfix_20260812'] ?? null) === $resourceId) $alreadyHotfixed++;
            }
            for ($slot = $alreadyHotfixed; $slot < SERVER_GAME_HOTFIX_DEPOSITS_PER_RESOURCE; ++$slot) {
                $target = $targets[$targetIndex++ % count($targets)];
                $targetI = $target[0] * ($mapSize - 1);
                $targetJ = $target[1] * ($mapSize - 1);
                $bestIndex = null;
                $bestScore = INF;
                foreach ($tiles as $index => $tile) {
                    $i = (int) $tile['i'];
                    $j = (int) $tile['j'];
                    $terrain = ((int) $tile['terrain_tex']) & 0x0f;
                    if ((int) $tile['resource_type'] !== 0 || !in_array($terrain, $terrainTypes, true)
                        || !serverPlayableCoordinate($i, $j, $mapSize)) continue;
                    $score = ($i - $targetI) ** 2 + ($j - $targetJ) ** 2;
                    if ($score < $bestScore) {
                        $bestScore = $score;
                        $bestIndex = $index;
                    }
                }
                if ($bestIndex === null) throw new RuntimeException('No eligible Tile for strategic resource hotfix.');
                $tile = $tiles[$bestIndex];
                $modifiers = json_decode((string) ($tile['modifiers_json'] ?? '{}'), true);
                if (!is_array($modifiers)) $modifiers = [];
                $modifiers['strategic_hotfix_20260812'] = $resourceId;
                $updateTile->execute([
                    $resourceId, jsonObject($modifiers), $revision, $gameId,
                    (int) $tile['i'], (int) $tile['j'],
                ]);
                if ($updateTile->rowCount() !== 1) throw new RuntimeException('Strategic resource Tile changed concurrently.');
                $tiles[$bestIndex]['resource_type'] = $resourceId;
                $tiles[$bestIndex]['modifiers_json'] = jsonObject($modifiers);
                $key = coordinateKey((int) $tile['i'], (int) $tile['j']);
                $newResources[$key] = [
                    'i' => (int) $tile['i'], 'j' => (int) $tile['j'], 'resource_type' => $resourceId,
                ];
            }
        }

        $globalAiId = ensureGlobalAiUser($db);
        $statement = $db->prepare(
            'INSERT INTO server_game_players
             (game_id, player_id, account_user_id, civilization_key, active, state_json)
             VALUES (?, ?, ?, ?, 1, ?)
             ON DUPLICATE KEY UPDATE account_user_id = VALUES(account_user_id),
                 civilization_key = VALUES(civilization_key), active = 1'
        );
        $statement->execute([
            $gameId, $globalAiId, $globalAiId, SERVER_GAME_GLOBAL_AI_CIVILIZATION,
            jsonObject(defaultPlayerState()),
        ]);
        $statement = $db->prepare(
            'SELECT i, j, COUNT(*) AS unit_count FROM server_game_units
             WHERE game_id = ? AND can_move = 1 AND deleted_at IS NULL GROUP BY i, j'
        );
        $statement->execute([$gameId]);
        $occupancy = [];
        foreach ($statement->fetchAll() as $row) {
            $occupancy[coordinateKey((int) $row['i'], (int) $row['j'])] = (int) $row['unit_count'];
        }
        $guardSpecs = resourceGuardUnitSpecs(
            $globalAiId, $tiles, $mapSize, $occupancy, $newResources, 'hotfix-resource-guard'
        );
        insertBootstrapUnits($db, $gameId, $mapSize, $guardSpecs, $revision);

        $stateStatement = $db->prepare(
            'SELECT state_json FROM server_game_players WHERE game_id = ? AND player_id = ? FOR UPDATE'
        );
        $stateStatement->execute([$gameId, $globalAiId]);
        $state = json_decode((string) ($stateStatement->fetchColumn() ?: '{}'), true);
        $state = normalizePlayerState(is_array($state) ? $state : []);
        $state['food'] = max((int) ($state['food'] ?? 0), SERVER_GAME_AI_RESOURCE_BUDGET);
        $state['money'] = max((int) ($state['money'] ?? 0), SERVER_GAME_AI_RESOURCE_BUDGET);
        $db->prepare('UPDATE server_game_players SET state_json = ? WHERE game_id = ? AND player_id = ?')
            ->execute([jsonObject($state), $gameId, $globalAiId]);

        $workers = $db->prepare(
            "SELECT id, state, properties_json FROM server_game_units
             WHERE game_id = ? AND owner_id = ? AND unit_type_id = 'worker'
               AND deleted_at IS NULL AND health > 0 FOR UPDATE"
        );
        $workers->execute([$gameId, $globalAiId]);
        $updateWorker = $db->prepare(
            'UPDATE server_game_units SET state = ?, properties_json = ?, revision = ? WHERE id = ?'
        );
        $automatedWorkers = 0;
        foreach ($workers->fetchAll() as $worker) {
            $properties = json_decode((string) ($worker['properties_json'] ?? '{}'), true);
            if (!is_array($properties)) $properties = [];
            $properties['automationMode'] = 'automate';
            $stateName = in_array((string) $worker['state'], ['ready', 'waiting', 'automate'], true)
                ? 'automate' : (string) $worker['state'];
            $updateWorker->execute([$stateName, jsonObject($properties), $revision, (int) $worker['id']]);
            $automatedWorkers++;
        }
        $db->prepare('UPDATE server_games SET revision = ? WHERE id = ?')->execute([$revision, $gameId]);
        recomputeVisibility($db, $gameId, $mapSize, $revision);
        $db->commit();
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
    $afterGame = loadGame($db, (string) $game['game_key']);
    return [
        'revision' => (int) $afterGame['revision'],
        'new_resources' => array_values($newResources),
        'new_guard_units' => count($guardSpecs),
        'automated_workers' => $automatedWorkers,
        'ai_player_id' => $globalAiId,
        'ai_food' => (int) $state['food'],
        'ai_gold' => (int) $state['money'],
        'before' => $before,
        'after' => storedServerMapDiagnostics($db, $afterGame),
    ];
}

function initializeGeneratedGame(PDO $db, string $key, int $mapSize = SERVER_GAME_DEFAULT_MAP_SIZE): array
{
    $mapSize = max(20, min(500, $mapSize));
    $quality = null;
    $tiles = generateServerMapTiles($mapSize, $key, $quality);
    $now = time();
    $db->beginTransaction();
    try {
        $statement = $db->prepare(
            'INSERT INTO server_games (game_key, map_size, turn_number, revision, turn_started_at, turn_deadline_at)
             VALUES (?, ?, 0, 1, ?, ?)'
        );
        $statement->execute([
            $key,
            $mapSize,
            gmdate('Y-m-d H:i:s', $now),
            gmdate('Y-m-d H:i:s', $now + SERVER_GAME_DEADLINE_SECONDS),
        ]);
        $gameId = (int) $db->lastInsertId();
        insertMapTiles($db, $gameId, $mapSize, $tiles);
        seedGlobalAiResourceGuards($db, $gameId, $mapSize, $tiles, 1);
        recomputeVisibility($db, $gameId, $mapSize, 1);
        $db->commit();
        return ['game' => loadGame($db, $key), 'unit_id_map' => [], 'created' => true, 'map_quality' => $quality];
    } catch (Throwable $error) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        if ($error instanceof PDOException && (string) $error->getCode() === '23000') {
            $game = loadGame($db, $key);
            if ($game) {
                return ['game' => $game, 'unit_id_map' => [], 'created' => false];
            }
        }
        throw $error;
    }
}

function ensureGeneratedGameMap(PDO $db, string $key, int $mapSize = SERVER_GAME_DEFAULT_MAP_SIZE): array
{
    $game = loadGame($db, $key);
    if (!$game) {
        return initializeGeneratedGame($db, $key, $mapSize);
    }
    $statement = $db->prepare('SELECT COUNT(*) FROM server_game_map WHERE game_id = ?');
    $statement->execute([(int) $game['id']]);
    if ((int) $statement->fetchColumn() > 0) {
        return ['game' => $game, 'unit_id_map' => [], 'created' => false];
    }

    $quality = null;
    $tiles = generateServerMapTiles((int) $game['map_size'], $key, $quality);
    $db->beginTransaction();
    try {
        $lockedGame = loadGame($db, $key, true);
        $statement = $db->prepare('SELECT COUNT(*) FROM server_game_map WHERE game_id = ?');
        $statement->execute([(int) $lockedGame['id']]);
        $regenerated = false;
        if ((int) $statement->fetchColumn() === 0) {
            $revision = (int) $lockedGame['revision'] + 1;
            insertMapTiles($db, (int) $lockedGame['id'], (int) $lockedGame['map_size'], $tiles, $revision);
            $statement = $db->prepare('DELETE FROM server_game_visibility WHERE game_id = ?');
            $statement->execute([(int) $lockedGame['id']]);
            $statement = $db->prepare('DELETE FROM server_game_orders WHERE game_id = ?');
            $statement->execute([(int) $lockedGame['id']]);
            $statement = $db->prepare('DELETE FROM server_game_submissions WHERE game_id = ?');
            $statement->execute([(int) $lockedGame['id']]);
            repositionPlayersAfterMapGeneration(
                $db,
                (int) $lockedGame['id'],
                (int) $lockedGame['map_size'],
                $revision
            );
            seedGlobalAiResourceGuards(
                $db, (int) $lockedGame['id'], (int) $lockedGame['map_size'], $tiles, $revision
            );
            $statement = $db->prepare(
                'UPDATE server_games SET revision = ?, turn_started_at = UTC_TIMESTAMP(),
                 turn_deadline_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND) WHERE id = ?'
            );
            $statement->execute([$revision, SERVER_GAME_DEADLINE_SECONDS, (int) $lockedGame['id']]);
            recomputeVisibility($db, (int) $lockedGame['id'], (int) $lockedGame['map_size'], $revision);
            serverTrace('map_regenerated', $quality ?? []);
            $regenerated = true;
        }
        $db->commit();
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
    return [
        'game' => loadGame($db, $key),
        'unit_id_map' => [],
        'created' => false,
        'regenerated' => $regenerated ?? false,
        'map_quality' => ($regenerated ?? false) ? $quality : null,
    ];
}

function clearStoredServerMapForRegeneration(PDO $db, string $key): void
{
    $db->beginTransaction();
    try {
        $game = loadGame($db, $key, true);
        if (!$game) {
            $db->rollBack();
            serverError(404, 'game_not_found', 'Game does not exist.');
        }
        $gameId = (int) $game['id'];
        $statement = $db->prepare('DELETE FROM server_game_orders WHERE game_id = ?');
        $statement->execute([$gameId]);
        $statement = $db->prepare('DELETE FROM server_game_submissions WHERE game_id = ?');
        $statement->execute([$gameId]);
        $statement = $db->prepare('DELETE FROM server_game_visibility WHERE game_id = ?');
        $statement->execute([$gameId]);
        $globalAiId = ensureGlobalAiUser($db);
        $statement = $db->prepare('DELETE FROM server_game_units WHERE game_id = ? AND owner_id = ?');
        $statement->execute([$gameId, $globalAiId]);
        // Terrain improvements belong to the old map; cities and ordinary units are preserved and repositioned.
        $statement = $db->prepare('DELETE FROM server_game_units WHERE game_id = ? AND unit_class = 4');
        $statement->execute([$gameId]);
        $statement = $db->prepare('DELETE FROM server_game_map WHERE game_id = ?');
        $statement->execute([$gameId]);
        $db->commit();
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

function resetServerGame(PDO $db, string $key): array
{
    ensureGeneratedGameMap($db, $key, SERVER_GAME_DEFAULT_MAP_SIZE);
    $db->beginTransaction();
    try {
        $game = loadGame($db, $key, true);
        if (!$game) {
            throw new RuntimeException('Game initialization failed before reset.');
        }
        $gameId = (int) $game['id'];
        $statement = $db->prepare(
            "SELECT p.player_id, p.account_user_id
             FROM server_game_players p
             JOIN game_users u ON u.id = p.account_user_id
             WHERE p.game_id = ? AND u.user_type = 'human'
             ORDER BY p.player_id"
        );
        $statement->execute([$gameId]);
        $players = $statement->fetchAll();

        // Every gameplay table references server_games with ON DELETE CASCADE.
        $statement = $db->prepare('DELETE FROM server_games');
        $statement->execute();
        $clearedGames = $statement->rowCount();
        $db->commit();
        $statement = $db->prepare("DELETE FROM game_users WHERE user_type = 'ai' AND login <> ?");
        $statement->execute([SERVER_GAME_GLOBAL_AI_LOGIN]);
        foreach (['server_game_orders', 'server_game_events', 'server_game_units', 'server_games'] as $table) {
            $db->exec('ALTER TABLE ' . $table . ' AUTO_INCREMENT = 1');
        }
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }

    $generated = ensureGeneratedGameMap($db, $key, SERVER_GAME_DEFAULT_MAP_SIZE);
    $provisioned = [];
    foreach ($players as $player) {
        if ($player['account_user_id'] === null) continue;
        $provisioned[] = provisionRegisteredPlayer($db, (int) $player['account_user_id'], $key);
    }
    // Provisioning a populated world can take longer than one turn. Publish a
    // fresh deadline after all preserved registered players have been restored.
    $db->beginTransaction();
    try {
        $game = loadGame($db, $key, true);
        $gameId = (int) $game['id'];
        $statement = $db->prepare(
            'UPDATE server_games SET turn_number = 0, turn_started_at = UTC_TIMESTAMP(),
             turn_deadline_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND) WHERE id = ?'
        );
        $statement->execute([SERVER_GAME_DEADLINE_SECONDS, $gameId]);
        $db->commit();
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
    return [
        'game' => loadGame($db, $key),
        'map_quality' => $generated['map_quality'] ?? null,
        'players_provisioned' => count($provisioned),
        'cleared_games' => $clearedGames,
    ];
}

function defaultPlayerState(): array
{
    return normalizePlayerState([
        'openTechnologies' => allTechnologyFlags(),
        'currentResearch' => null,
        'technologyProgress' => new stdClass(),
        'science' => 0,
        'scienceRate' => 0,
        'lastScienceIncome' => 0,
        'money' => 0,
        'food' => 200,
        'lastGrossFoodIncome' => 0,
        'lastFoodUpkeep' => 0,
        'lastMoneyIncome' => 0,
        'lastGrossMoneyIncome' => 0,
        'lastMaintenance' => 0,
        'lastTechnologyExpense' => 0,
        'lastAvailableMoney' => 0,
        'lastAccountIncome' => 0,
        'oneTurnMessage' => '',
    ]);
}

function serverTechnologyNames(): array
{
    return [
        'Mining', 'Pottery', 'Animal Husbandry', 'Sailing', 'Astronomy', 'Irrigation', 'Writing',
        'Masonry', 'Archery', 'Bronze Working', 'Wheel', 'Navigation', 'Currency', 'Horseback Riding',
        'Iron Working', 'Shipbuilding', 'Mathematics', 'Construction', 'Engineering',
    ];
}

function allTechnologyFlags(): array
{
    return array_fill_keys(serverTechnologyNames(), true);
}

function normalizePlayerState(array $state): array
{
    $state['openTechnologies'] = allTechnologyFlags();
    $state['currentResearch'] = null;
    $state['scienceRate'] = 0;
    $state['lastScienceIncome'] = 0;
    $state['lastTechnologyExpense'] = 0;
    if (!isset($state['money']) || !is_numeric($state['money'])) $state['money'] = 0;
    if (!isset($state['food']) || !is_numeric($state['food'])) $state['food'] = 200;
    return $state;
}

function civilizationCatalog(): array
{
    return [
        'barbarian' => ['name' => 'Barbarian', 'primary' => '#5b2025', 'secondary' => '#282828', 'mark' => 'B'],
        'romans' => ['name' => 'Romans', 'primary' => '#9b1c31', 'secondary' => '#f2c14e', 'mark' => 'R'],
        'greeks' => ['name' => 'Greeks', 'primary' => '#175a9c', 'secondary' => '#f5f7fa', 'mark' => 'G'],
        'ethiopians' => ['name' => 'Ethiopians', 'primary' => '#287a3d', 'secondary' => '#e7bd34', 'mark' => 'E'],
        'egyptians' => ['name' => 'Egyptians', 'primary' => '#d3a62b', 'secondary' => '#176b80', 'mark' => 'K'],
        'phoenicians' => ['name' => 'Phoenicians', 'primary' => '#6f2a8a', 'secondary' => '#f0c35a', 'mark' => 'P'],
        'persians' => ['name' => 'Persians', 'primary' => '#b54835', 'secondary' => '#183f72', 'mark' => 'S'],
        'celts' => ['name' => 'Celts', 'primary' => '#2e6c45', 'secondary' => '#d8d0a8', 'mark' => 'C'],
        'carthaginians' => ['name' => 'Carthaginians', 'primary' => '#50377d', 'secondary' => '#d9a441', 'mark' => 'A'],
    ];
}

function civilizationKeyForPlayer(int $playerId): string
{
    $keys = array_values(array_filter(
        array_keys(civilizationCatalog()),
        static fn(string $key): bool => $key !== SERVER_GAME_GLOBAL_AI_CIVILIZATION
    ));
    return $keys[$playerId % count($keys)];
}

function civilizationCityNames(): array
{
    return [
        'barbarian' => ['Stronghold', 'Redoubt', 'Iron Camp', 'Black Camp', 'Wolf Gate', 'Stone Ring', 'War Camp', 'Hill Fort'],
        'romans' => ['Roma', 'Ostia', 'Neapolis', 'Ravenna', 'Capua', 'Aquileia', 'Ariminum', 'Bononia'],
        'greeks' => ['Athens', 'Sparta', 'Corinth', 'Thebes', 'Argos', 'Miletus', 'Rhodes', 'Syracuse'],
        'ethiopians' => ['Aksum', 'Adulis', 'Yeha', 'Matara', 'Qohaito', 'Hawulti', 'Damat', 'Meroe'],
        'egyptians' => ['Memphis', 'Thebes', 'Alexandria', 'Heliopolis', 'Abydos', 'Sais', 'Edfu', 'Amarna'],
        'phoenicians' => ['Tyre', 'Sidon', 'Byblos', 'Arwad', 'Berytus', 'Tripolis', 'Kition', 'Ugarit'],
        'persians' => ['Persepolis', 'Susa', 'Pasargadae', 'Ecbatana', 'Ray', 'Bactra', 'Sardis', 'Merv'],
        'celts' => ['Bibracte', 'Alesia', 'Camulodunon', 'Lutetia', 'Gergovia', 'Brigantium', 'Mediolanum', 'Nemetocenna'],
        'carthaginians' => ['Carthage', 'Utica', 'Hadrumetum', 'Hippo', 'Leptis', 'Motya', 'Tharros', 'Lixus'],
    ];
}

function serverNextCityName(PDO $db, int $gameId, int $playerId): string
{
    $statement = $db->prepare(
        'SELECT civilization_key FROM server_game_players WHERE game_id = ? AND player_id = ?'
    );
    $statement->execute([$gameId, $playerId]);
    $key = (string) ($statement->fetchColumn() ?: civilizationKeyForPlayer($playerId));
    $names = civilizationCityNames()[$key] ?? ['City'];
    $statement = $db->prepare(
        'SELECT name FROM server_game_units WHERE game_id = ? AND owner_id = ? AND unit_class = 3
         AND deleted_at IS NULL ORDER BY id'
    );
    $statement->execute([$gameId, $playerId]);
    $used = array_fill_keys(array_map('strval', $statement->fetchAll(PDO::FETCH_COLUMN)), true);
    foreach ($names as $name) {
        if (!isset($used[$name])) return $name;
    }
    return ($names[0] ?? 'City') . ' ' . (count($used) + 1);
}

function serverUnitDefinitions(): array
{
    return [
        'settlers' => ['name' => 'Settlers', 'class' => 0, 'texture' => 256, 'attack' => 0, 'defense' => 1, 'speed' => 1, 'view_range' => 2, 'technology' => null, 'cost' => 20, 'nature' => 'land'],
        'worker' => ['name' => 'Worker', 'class' => 1, 'texture' => 270, 'attack' => 0, 'defense' => 1, 'speed' => 1, 'view_range' => 2, 'technology' => null, 'cost' => 20, 'nature' => 'land'],
        'explorer' => ['name' => 'Explorer', 'class' => 1, 'texture' => 257, 'attack' => 0, 'defense' => 1, 'speed' => 2, 'view_range' => 4, 'technology' => null, 'cost' => 15, 'nature' => 'land'],
        'warrior' => ['name' => 'Warrior', 'class' => 2, 'texture' => 258, 'attack' => 2, 'defense' => 1, 'speed' => 1, 'view_range' => 2, 'technology' => null, 'cost' => 20, 'nature' => 'land'],
        'slinger' => ['name' => 'Slinger', 'class' => 2, 'texture' => 260, 'attack' => 2, 'defense' => 1, 'speed' => 1, 'view_range' => 2, 'technology' => 'Archery', 'cost' => 25, 'nature' => 'land'],
        'archer' => ['name' => 'Archer', 'class' => 2, 'texture' => 261, 'attack' => 3, 'defense' => 1, 'speed' => 1, 'view_range' => 2, 'technology' => 'Archery', 'cost' => 35, 'nature' => 'land'],
        'spearman' => ['name' => 'Spearman', 'class' => 2, 'texture' => 262, 'attack' => 2, 'defense' => 3, 'speed' => 1, 'view_range' => 2, 'technology' => 'Bronze Working', 'cost' => 35, 'nature' => 'land'],
        'horseman' => ['name' => 'Horseman', 'class' => 2, 'texture' => 263, 'attack' => 4, 'defense' => 2, 'speed' => 2, 'view_range' => 3, 'technology' => 'Horseback Riding', 'cost' => 50, 'nature' => 'land'],
        'chariot' => ['name' => 'Chariot', 'class' => 2, 'texture' => 264, 'attack' => 3, 'defense' => 2, 'speed' => 2, 'view_range' => 3, 'technology' => 'Wheel', 'cost' => 45, 'nature' => 'land'],
        'elephant' => ['name' => 'Elephant', 'class' => 2, 'texture' => 265, 'attack' => 5, 'defense' => 4, 'speed' => 2, 'view_range' => 3, 'technology' => 'Horseback Riding', 'cost' => 70, 'nature' => 'land'],
        'catapult' => ['name' => 'Catapult', 'class' => 2, 'texture' => 266, 'attack' => 5, 'defense' => 1, 'speed' => 1, 'view_range' => 2, 'technology' => 'Construction', 'cost' => 60, 'nature' => 'land'],
        'trebuchet' => ['name' => 'Trebuchet', 'class' => 2, 'texture' => 267, 'attack' => 7, 'defense' => 1, 'speed' => 1, 'view_range' => 2, 'technology' => 'Engineering', 'cost' => 80, 'nature' => 'land'],
        'galley' => ['name' => 'Galley', 'class' => 2, 'texture' => 268, 'attack' => 2, 'defense' => 2, 'speed' => 2, 'view_range' => 3, 'technology' => 'Sailing', 'cost' => 40, 'nature' => 'water'],
        'galleon' => ['name' => 'Galleon', 'class' => 2, 'texture' => 269, 'attack' => 5, 'defense' => 4, 'speed' => 3, 'view_range' => 4, 'technology' => 'Navigation', 'cost' => 90, 'nature' => 'water'],
        'workboat' => ['name' => 'WorkBoat', 'class' => 1, 'texture' => 271, 'attack' => 0, 'defense' => 1, 'speed' => 2, 'view_range' => 3, 'technology' => 'Sailing', 'cost' => 30, 'nature' => 'water'],
        'frigate' => ['name' => 'Frigate', 'class' => 2, 'texture' => 272, 'attack' => 6, 'defense' => 5, 'speed' => 3, 'view_range' => 4, 'technology' => 'Shipbuilding', 'cost' => 100, 'nature' => 'water'],
        'knight' => ['name' => 'Knight', 'class' => 2, 'texture' => 273, 'attack' => 6, 'defense' => 5, 'speed' => 2, 'view_range' => 3, 'technology' => 'Engineering', 'cost' => 85, 'nature' => 'land'],
        'pikeman' => ['name' => 'Pikeman', 'class' => 2, 'texture' => 274, 'attack' => 4, 'defense' => 6, 'speed' => 1, 'view_range' => 2, 'technology' => 'Iron Working', 'cost' => 55, 'nature' => 'land'],
        'longbow' => ['name' => 'Longbow', 'class' => 2, 'texture' => 275, 'attack' => 5, 'defense' => 3, 'speed' => 1, 'view_range' => 3, 'technology' => 'Archery', 'cost' => 55, 'nature' => 'land'],
        'fencer' => ['name' => 'Fencer', 'class' => 2, 'texture' => 276, 'attack' => 4, 'defense' => 3, 'speed' => 2, 'view_range' => 2, 'technology' => 'Bronze Working', 'cost' => 45, 'nature' => 'land'],
        'swordsman' => ['name' => 'Swordsman', 'class' => 2, 'texture' => 277, 'attack' => 7, 'defense' => 5, 'speed' => 1, 'view_range' => 2, 'technology' => 'Iron Working', 'cost' => 75, 'nature' => 'land'],
        'trireme' => ['name' => 'Trireme', 'class' => 2, 'texture' => 278, 'attack' => 1, 'defense' => 1, 'speed' => 2, 'view_range' => 3, 'technology' => 'Sailing', 'cost' => 30, 'nature' => 'water'],
        'lazaret' => ['name' => 'Lazaret', 'class' => 4, 'texture' => 0, 'attack' => 0, 'defense' => 0, 'speed' => 0, 'view_range' => 0, 'technology' => null, 'cost' => 60, 'nature' => 'land'],
        'stable' => ['name' => 'Stable', 'class' => 4, 'texture' => 0, 'attack' => 0, 'defense' => 0, 'speed' => 0, 'view_range' => 0, 'technology' => null, 'cost' => 50, 'nature' => 'land'],
        'shooting_range' => ['name' => 'Shooting-range', 'class' => 4, 'texture' => 0, 'attack' => 0, 'defense' => 0, 'speed' => 0, 'view_range' => 0, 'technology' => null, 'cost' => 50, 'nature' => 'land'],
        'barracks' => ['name' => 'Barracks', 'class' => 4, 'texture' => 0, 'attack' => 0, 'defense' => 0, 'speed' => 0, 'view_range' => 0, 'technology' => null, 'cost' => 50, 'nature' => 'land'],
        'port' => ['name' => 'Port', 'class' => 4, 'texture' => 0, 'attack' => 0, 'defense' => 0, 'speed' => 0, 'view_range' => 0, 'technology' => null, 'cost' => 60, 'nature' => 'land'],
        'market' => ['name' => 'Market', 'class' => 4, 'texture' => 0, 'attack' => 0, 'defense' => 0, 'speed' => 0, 'view_range' => 0, 'technology' => null, 'cost' => 50, 'nature' => 'land'],
    ];
}

function serverCityBuildingTypeIds(): array
{
    return ['lazaret', 'stable', 'shooting_range', 'barracks', 'port', 'market'];
}

function serverIsCityBuildingType(string $unitTypeId): bool
{
    return in_array($unitTypeId, serverCityBuildingTypeIds(), true);
}

function serverCityHasBuilding(
    PDO $db, int $gameId, int $playerId, array $city, string $buildingTypeId
): bool {
    if (!serverIsCityBuildingType($buildingTypeId)) return false;
    $statement = $db->prepare(
        'SELECT properties_json FROM server_game_units
         WHERE game_id = ? AND owner_id = ? AND unit_type_id = ? AND unit_class = 4
           AND i = ? AND j = ? AND deleted_at IS NULL AND health > 0'
    );
    $statement->execute([
        $gameId, $playerId, $buildingTypeId, (int) $city['i'], (int) $city['j'],
    ]);
    foreach ($statement->fetchAll(PDO::FETCH_COLUMN) as $json) {
        $properties = json_decode((string) $json, true);
        if (is_array($properties) && !empty($properties['cityBuilding'])
            && (int) ($properties['parentCityId'] ?? 0) === (int) $city['id']) return true;
    }
    return false;
}

function serverCityBuiltBuildingTypes(PDO $db, int $gameId, int $playerId, int $cityId): array
{
    $statement = $db->prepare(
        'SELECT unit_type_id, properties_json FROM server_game_units
         WHERE game_id = ? AND owner_id = ? AND unit_class = 4
           AND deleted_at IS NULL AND health > 0'
    );
    $statement->execute([$gameId, $playerId]);
    $result = [];
    foreach ($statement->fetchAll() as $building) {
        $properties = json_decode((string) ($building['properties_json'] ?? '{}'), true);
        if (!is_array($properties) || empty($properties['cityBuilding'])
            || (int) ($properties['parentCityId'] ?? 0) !== $cityId) continue;
        $result[(string) $building['unit_type_id']] = true;
    }
    return $result;
}

function serverProducedUnitExperience(
    PDO $db, int $gameId, int $playerId, int $cityId, string $unitTypeId, array $definition
): float {
    $buildings = serverCityBuiltBuildingTypes($db, $gameId, $playerId, $cityId);
    return serverProducedStartingExperience($buildings, $unitTypeId, $definition);
}

function serverProducedStartingExperience(array $buildings, string $unitTypeId, array $definition): float
{
    $mounted = in_array($unitTypeId, ['horseman', 'chariot', 'knight', 'elephant'], true);
    $ranged = in_array($unitTypeId, ['slinger', 'archer', 'longbow'], true);
    $melee = in_array($unitTypeId, ['warrior', 'spearman', 'pikeman', 'fencer', 'swordsman'], true);
    $trained = ($mounted && isset($buildings['stable']))
        || ($ranged && isset($buildings['shooting_range']))
        || ($melee && isset($buildings['barracks']))
        || (($definition['nature'] ?? 'land') === 'water' && isset($buildings['port']));
    return $trained ? 1.10 : SERVER_GAME_INITIAL_EXPERIENCE;
}

function serverCityHealingPercent(array $buildings): float
{
    return isset($buildings['lazaret']) ? 20.0 : 10.0;
}

function serverUnitProperties(array $definition): array
{
    return [
        'odd_move' => 0,
        'productionPoints' => 0,
        'cityProperties' => null,
        'production' => null,
        'productionCost' => (float) $definition['cost'],
    ];
}

function playerHasTechnology(array $state, ?string $technology): bool
{
    // Technology discovery is temporarily disabled; every player has every technology.
    return true;
}

function randomPlayerStart(PDO $db, int $gameId, int $mapSize, array $excluded = []): array
{
    $center = ($mapSize - 1) / 2;
    $maximumDistance = max(4.0, $mapSize / 3);
    $statement = $db->prepare(
        'SELECT i, j FROM server_game_map
         WHERE game_id = ? AND (terrain_tex & 15) <> 0
           AND NOT ((terrain_tex & 15) = 5 AND ((terrain_tex >> 4) & 3) = 3)'
    );
    $statement->execute([$gameId]);
    $selected = null;
    $candidateCount = 0;
    foreach ($statement->fetchAll() as $tile) {
        $i = (int) $tile['i'];
        $j = (int) $tile['j'];
        if ($i < 4 || $j < 4 || $i >= $mapSize - 4 || $j >= $mapSize - 4
            || hypot($i - $center, $j - $center) > $maximumDistance
            || isset($excluded[coordinateKey($i, $j)])) {
            continue;
        }
        if (random_int(1, ++$candidateCount) === 1) {
            $selected = ['i' => $i, 'j' => $j];
        }
    }
    if ($selected === null) {
        throw new RuntimeException('Generated map has no valid player starting tile.');
    }
    return $selected;
}

function registeredPlayerStart(PDO $db, int $gameId, int $mapSize): array
{
    $statement = $db->prepare(
        'SELECT owner_id, i, j, unit_class, id FROM server_game_units
         WHERE game_id = ? AND deleted_at IS NULL AND health > 0
         ORDER BY owner_id, CASE WHEN unit_class = 3 THEN 0 ELSE 1 END, id'
    );
    $statement->execute([$gameId]);
    $excluded = [];
    $civilizationCenters = [];
    foreach ($statement->fetchAll() as $unit) {
        $i = (int) $unit['i'];
        $j = (int) $unit['j'];
        $ownerId = (int) $unit['owner_id'];
        $excluded[coordinateKey($i, $j)] = true;
        if (!isset($civilizationCenters[$ownerId])) {
            $civilizationCenters[$ownerId] = [$i, $j];
        }
    }
    $minimumSeparation = max(3, (int) floor($mapSize / 15));
    foreach ($civilizationCenters as [$centerI, $centerJ]) {
        for ($di = -$minimumSeparation; $di <= $minimumSeparation; $di++) {
            for ($dj = -$minimumSeparation; $dj <= $minimumSeparation; $dj++) {
                if (hypot($di, $dj) <= $minimumSeparation) {
                    $excluded[coordinateKey($centerI + $di, $centerJ + $dj)] = true;
                }
            }
        }
    }
    return randomPlayerStart($db, $gameId, $mapSize, $excluded);
}

function selectedPlayerStart(PDO $db, int $gameId, int $mapSize, array $preferred): array
{
    $statement = $db->prepare(
        'SELECT i, j FROM server_game_units
         WHERE game_id = ? AND deleted_at IS NULL AND health > 0'
    );
    $statement->execute([$gameId]);
    $occupied = [];
    foreach ($statement->fetchAll() as $unit) {
        $occupied[coordinateKey((int) $unit['i'], (int) $unit['j'])] = true;
    }
    $statement = $db->prepare(
        'SELECT i, j FROM server_game_map
         WHERE game_id = ? AND (terrain_tex & 15) <> 0
           AND NOT ((terrain_tex & 15) = 5 AND ((terrain_tex >> 4) & 3) = 3)'
    );
    $statement->execute([$gameId]);
    $best = null;
    $bestDistance = INF;
    foreach ($statement->fetchAll() as $tile) {
        $i = (int) $tile['i'];
        $j = (int) $tile['j'];
        if ($i < 2 || $j < 2 || $i >= $mapSize - 2 || $j >= $mapSize - 2
            || isset($occupied[coordinateKey($i, $j)])) continue;
        $distance = hypot($i - (int) $preferred['i'], $j - (int) $preferred['j']);
        if ($distance < $bestDistance) {
            $best = ['i' => $i, 'j' => $j];
            $bestDistance = $distance;
        }
    }
    return $best ?? registeredPlayerStart($db, $gameId, $mapSize);
}

function repositionPlayersAfterMapGeneration(PDO $db, int $gameId, int $mapSize, int $revision): void
{
    $statement = $db->prepare(
        'SELECT DISTINCT owner_id FROM server_game_units
         WHERE game_id = ? AND deleted_at IS NULL ORDER BY owner_id'
    );
    $statement->execute([$gameId]);
    $owners = array_map('intval', $statement->fetchAll(PDO::FETCH_COLUMN));
    $loadUnits = $db->prepare(
        'SELECT id, properties_json FROM server_game_units
         WHERE game_id = ? AND owner_id = ? AND deleted_at IS NULL'
    );
    $updateUnit = $db->prepare(
        'UPDATE server_game_units SET i = ?, j = ?, state = ?, move_penalty = 0,
         properties_json = ?, revision = ? WHERE id = ?'
    );
    $usedStarts = [];
    foreach ($owners as $ownerId) {
        $start = randomPlayerStart($db, $gameId, $mapSize, $usedStarts);
        $usedStarts[coordinateKey($start['i'], $start['j'])] = true;
        $loadUnits->execute([$gameId, $ownerId]);
        foreach ($loadUnits->fetchAll() as $unit) {
            $properties = json_decode((string) $unit['properties_json'], true) ?: [];
            unset($properties['gotoCoord'], $properties['gotoPath'], $properties['pendingServerPath']);
            $updateUnit->execute([
                $start['i'], $start['j'], 'ready', jsonObject($properties), $revision, (int) $unit['id'],
            ]);
        }
    }
    $statement = $db->prepare(
        'UPDATE server_game_players p SET active = CASE WHEN EXISTS (
            SELECT 1 FROM server_game_units u
            WHERE u.game_id = p.game_id AND u.owner_id = p.player_id AND u.deleted_at IS NULL
         ) THEN 1 ELSE 0 END WHERE p.game_id = ?'
    );
    $statement->execute([$gameId]);
}

function registeredExplorerSpec(int $playerId, array $start, string $clientKey): array
{
    $definition = serverUnitDefinitions()['explorer'];
    return [
        'client_key' => $clientKey,
        'owner_id' => $playerId,
        'unit_type_id' => 'explorer',
        'unit_class' => $definition['class'],
        'name' => $definition['name'],
        'texture' => $definition['texture'],
        'can_move' => true,
        'nature' => $definition['nature'],
        'i' => $start['i'], 'j' => $start['j'],
        'attack' => $definition['attack'], 'defense' => $definition['defense'],
        'speed' => $definition['speed'], 'view_range' => $definition['view_range'],
        'state' => 'ready', 'health' => 100, 'max_health' => 100, 'experience' => 1,
        'properties' => serverUnitProperties($definition),
    ];
}

function startingUnitSpecs(int $playerId, array $start, string $keyPrefix): array
{
    $commonProperties = [
        'odd_move' => 0, 'productionPoints' => 0, 'cityProperties' => null, 'production' => null,
    ];
    $units = [[
        'client_key' => $keyPrefix . '-settlers',
        'owner_id' => $playerId,
        'unit_type_id' => 'settlers',
        'unit_class' => 0,
        'name' => 'Settlers',
        'texture' => 256,
        'can_move' => true,
        'nature' => 'land',
        'i' => $start['i'], 'j' => $start['j'],
        'attack' => 0, 'defense' => 1, 'speed' => 1, 'view_range' => 2,
        'state' => 'ready', 'health' => 100, 'max_health' => 100, 'experience' => 1,
        'properties' => $commonProperties + ['productionCost' => 20],
    ]];
    for ($slot = 1; $slot <= 3; ++$slot) {
        $units[] = registeredExplorerSpec($playerId, $start, $keyPrefix . '-explorer-' . $slot);
    }
    return $units;
}

function backfillRegisteredExplorers(PDO $db, int $minimum): void
{
    $statement = $db->query(
        'SELECT p.game_id, p.player_id, g.map_size, g.revision
         FROM server_game_players p
         JOIN server_games g ON g.id = p.game_id
         WHERE p.account_user_id IS NOT NULL
         ORDER BY p.game_id, p.player_id'
    );
    $players = $statement->fetchAll();
    $gamesChanged = [];
    foreach ($players as $player) {
        $gameId = (int) $player['game_id'];
        $playerId = (int) $player['player_id'];
        $countStatement = $db->prepare(
            "SELECT COUNT(*) FROM server_game_units
             WHERE game_id = ? AND owner_id = ? AND unit_type_id = 'explorer' AND deleted_at IS NULL"
        );
        $countStatement->execute([$gameId, $playerId]);
        $living = (int) $countStatement->fetchColumn();
        if ($living >= $minimum) continue;

        $startStatement = $db->prepare(
            'SELECT i, j FROM server_game_units
             WHERE game_id = ? AND owner_id = ? AND deleted_at IS NULL
             ORDER BY CASE WHEN unit_class = 3 THEN 0 ELSE 1 END, id LIMIT 1'
        );
        $startStatement->execute([$gameId, $playerId]);
        $start = $startStatement->fetch();
        if (!$start) {
            $start = registeredPlayerStart($db, $gameId, (int) $player['map_size']);
        }
        $keyStatement = $db->prepare(
            'SELECT client_key FROM server_game_units WHERE game_id = ? AND owner_id = ? AND client_key IS NOT NULL'
        );
        $keyStatement->execute([$gameId, $playerId]);
        $usedKeys = array_fill_keys($keyStatement->fetchAll(PDO::FETCH_COLUMN), true);
        $units = [];
        $slot = 1;
        while (count($units) < $minimum - $living) {
            $clientKey = 'registered-' . $playerId . '-explorer-' . $slot++;
            if (isset($usedKeys[$clientKey])) continue;
            $usedKeys[$clientKey] = true;
            $units[] = registeredExplorerSpec($playerId, $start, $clientKey);
        }
        $revision = isset($gamesChanged[$gameId])
            ? $gamesChanged[$gameId] + 1
            : (int) $player['revision'] + 1;
        insertBootstrapUnits($db, $gameId, (int) $player['map_size'], $units, $revision);
        $updateGame = $db->prepare('UPDATE server_games SET revision = ? WHERE id = ?');
        $updateGame->execute([$revision, $gameId]);
        $gamesChanged[$gameId] = $revision;
        serverTrace('registered_explorers_backfilled', [
            'game_id' => $gameId, 'player_id' => $playerId,
            'living_before' => $living, 'created' => count($units), 'revision' => $revision,
        ]);
    }
    foreach ($gamesChanged as $gameId => $revision) {
        $gameStatement = $db->prepare('SELECT map_size FROM server_games WHERE id = ?');
        $gameStatement->execute([$gameId]);
        recomputeVisibility($db, (int) $gameId, (int) $gameStatement->fetchColumn(), (int) $revision);
    }
}

function serverDeletePlayerCitiesForRespawn(PDO $db, int $gameId, int $playerId): int
{
    $statement = $db->prepare(
        "DELETE FROM server_game_units
         WHERE game_id = ? AND owner_id = ? AND deleted_at IS NULL
           AND (unit_class = 3 OR unit_type_id = 'city')"
    );
    $statement->execute([$gameId, $playerId]);
    return $statement->rowCount();
}

function provisionRegisteredPlayer(PDO $db, int $accountUserId, string $key = SERVER_GAME_DEFAULT_KEY): array
{
    $initialized = ensureGeneratedGameMap($db, $key);
    $game = $initialized['game'];
    $gameId = (int) $game['id'];
    $playerId = $accountUserId;
    $ownsTransaction = !$db->inTransaction();
    if ($ownsTransaction) {
        $db->beginTransaction();
    }
    try {
        $game = loadGame($db, $key, true);
        $state = defaultPlayerState();
        $existingPlayer = $db->prepare(
            'SELECT 1 FROM server_game_players WHERE game_id = ? AND player_id = ? LIMIT 1'
        );
        $existingPlayer->execute([$gameId, $playerId]);
        $playerExisted = (bool) $existingPlayer->fetchColumn();
        $statement = $db->prepare(
            'INSERT INTO server_game_players (game_id, player_id, account_user_id, civilization_key, state_json)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE account_user_id = COALESCE(account_user_id, VALUES(account_user_id)),
                 civilization_key = COALESCE(civilization_key, VALUES(civilization_key)),
                 state_json = COALESCE(state_json, VALUES(state_json))'
        );
        $statement->execute([$gameId, $playerId, $accountUserId, civilizationKeyForPlayer($playerId), jsonObject($state)]);

        $statement = $db->prepare(
            'SELECT COUNT(u.id), COALESCE(MAX(p.eliminated), 0)
             FROM server_game_players p
             LEFT JOIN server_game_units u ON u.game_id = p.game_id AND u.owner_id = p.player_id
               AND u.deleted_at IS NULL AND u.health > 0 AND u.can_move = 1
             WHERE p.game_id = ? AND p.player_id = ?'
        );
        $statement->execute([$gameId, $playerId]);
        [$livingUnitCount, $eliminated] = $statement->fetch(PDO::FETCH_NUM);
        // The player flag prevents defeated civilizations from respawning; unit tombstones are not retained.
        $createdUnits = !$playerExisted && (int) $livingUnitCount === 0 && !(bool) $eliminated;
        $mapping = [];
        if ($createdUnits) {
            $start = registeredPlayerStart($db, $gameId, (int) $game['map_size']);
            $revision = (int) $game['revision'] + 1;
            $deletedCities = serverDeletePlayerCitiesForRespawn($db, $gameId, $playerId);
            $units = startingUnitSpecs($playerId, $start, 'registered-' . $playerId);
            $mapping = insertBootstrapUnits($db, $gameId, (int) $game['map_size'], $units, $revision);
            $statement = $db->prepare('UPDATE server_games SET revision = ? WHERE id = ?');
            $statement->execute([$revision, $gameId]);
            recomputeVisibility($db, $gameId, (int) $game['map_size'], $revision);
            serverTrace('player_cities_deleted_for_respawn', [
                'game_id' => $gameId, 'player_id' => $playerId, 'deleted_cities' => $deletedCities,
            ]);
        }
        $statement = $db->prepare(
            'UPDATE server_game_players SET active = EXISTS (
                SELECT 1 FROM server_game_units
                WHERE game_id = ? AND owner_id = ? AND deleted_at IS NULL
             ) WHERE game_id = ? AND player_id = ?'
        );
        $statement->execute([$gameId, $playerId, $gameId, $playerId]);
        if ($ownsTransaction) {
            $db->commit();
        }
        return [
            'game_id' => $key,
            'player_id' => $playerId,
            'created_units' => $createdUnits,
            'unit_id_map' => $mapping,
        ];
    } catch (Throwable $error) {
        if ($ownsTransaction && $db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

function playerNeedsRespawn(PDO $db, array $game, int $playerId): bool
{
    $statement = $db->prepare(
        'SELECT COUNT(*) FROM server_game_units
         WHERE game_id = ? AND owner_id = ? AND can_move = 1
           AND deleted_at IS NULL AND health > 0'
    );
    $statement->execute([(int) $game['id'], $playerId]);
    return (int) $statement->fetchColumn() === 0;
}

function serverClearPlayerForRespawn(
    PDO $db, int $gameId, int $playerId, int $revision
): array {
    $statement = $db->prepare(
        'SELECT unit_class, unit_type_id, i, j FROM server_game_units
         WHERE game_id = ? AND owner_id = ? AND deleted_at IS NULL FOR UPDATE'
    );
    $statement->execute([$gameId, $playerId]);
    $units = $statement->fetchAll();
    $removeByTile = [];
    foreach ($units as $unit) {
        $key = coordinateKey((int) $unit['i'], (int) $unit['j']);
        if ((int) $unit['unit_class'] === 3 || (string) $unit['unit_type_id'] === 'city') {
            $removeByTile[$key]['road'] = true;
            $removeByTile[$key]['irrigation'] = true;
            continue;
        }
        if ((int) $unit['unit_class'] !== 4) continue;
        $type = (string) $unit['unit_type_id'];
        if (!str_starts_with($type, 'building_')) continue;
        $modifier = substr($type, strlen('building_'));
        if ($modifier !== '') $removeByTile[$key][$modifier] = true;
    }

    $loadTile = $db->prepare(
        'SELECT modifiers_json FROM server_game_map WHERE game_id = ? AND i = ? AND j = ? FOR UPDATE'
    );
    $updateTile = $db->prepare(
        'UPDATE server_game_map SET modifiers_json = ?, revision = ? WHERE game_id = ? AND i = ? AND j = ?'
    );
    $changedTiles = 0;
    foreach ($removeByTile as $key => $removed) {
        [$i, $j] = array_map('intval', explode(':', $key, 2));
        $loadTile->execute([$gameId, $i, $j]);
        $encoded = $loadTile->fetchColumn();
        if ($encoded === false) continue;
        $modifiers = json_decode((string) $encoded, true);
        if (!is_array($modifiers)) $modifiers = [];
        $before = jsonObject($modifiers);
        foreach (array_keys($removed) as $modifier) unset($modifiers[$modifier]);
        if (isset($removed['cottage'])) unset($modifiers['cottageAge'], $modifiers['cottageStage']);
        if (isset($removed['irrigation'])) unset($modifiers['irrigationCityFood']);
        if (isset($removed['fortification'])) unset($modifiers['fortificationDefensePercent']);
        $after = $modifiers ? jsonObject($modifiers) : '{}';
        if ($after === $before) continue;
        $updateTile->execute([$after, $revision, $gameId, $i, $j]);
        ++$changedTiles;
    }

    foreach (['server_game_orders', 'server_game_submissions', 'server_game_visibility'] as $table) {
        $statement = $db->prepare("DELETE FROM {$table} WHERE game_id = ? AND player_id = ?");
        $statement->execute([$gameId, $playerId]);
    }
    $statement = $db->prepare(
        'DELETE FROM server_game_events WHERE game_id = ? AND audience_player_id = ?'
    );
    $statement->execute([$gameId, $playerId]);
    $statement = $db->prepare('DELETE FROM server_game_units WHERE game_id = ? AND owner_id = ?');
    $statement->execute([$gameId, $playerId]);
    return [
        'deleted_units' => count($units),
        'removed_improvement_tiles' => $changedTiles,
    ];
}

function respawnPlayerIfUnitless(
    PDO $db, array $game, int $playerId, ?array $preferred = null, bool $force = false
): array
{
    $db->beginTransaction();
    try {
        $game = loadGame($db, (string) $game['game_key'], true);
        $gameId = (int) $game['id'];
        $statement = $db->prepare(
            'SELECT COUNT(*) FROM server_game_units
             WHERE game_id = ? AND owner_id = ? AND can_move = 1
               AND deleted_at IS NULL AND health > 0'
        );
        $statement->execute([$gameId, $playerId]);
        if ((int) $statement->fetchColumn() > 0 && !$force) {
            $db->rollBack();
            return [];
        }

        $revision = (int) $game['revision'] + 1;
        $removed = serverClearPlayerForRespawn($db, $gameId, $playerId, $revision);
        $start = $preferred === null
            ? registeredPlayerStart($db, $gameId, (int) $game['map_size'])
            : selectedPlayerStart($db, $gameId, (int) $game['map_size'], $preferred);
        $prefix = 'respawn-' . $playerId . '-' . $revision;
        $mapping = insertBootstrapUnits(
            $db, $gameId, (int) $game['map_size'], startingUnitSpecs($playerId, $start, $prefix), $revision
        );
        $statement = $db->prepare(
            'INSERT INTO server_game_players
             (game_id, player_id, civilization_key, active, eliminated, state_json)
             VALUES (?, ?, ?, 1, 0, ?)
             ON DUPLICATE KEY UPDATE active = 1, eliminated = 0,
                 state_json = VALUES(state_json), last_seen_revision = 0'
        );
        $statement->execute([
            $gameId, $playerId, civilizationKeyForPlayer($playerId), jsonObject(defaultPlayerState()),
        ]);
        $statement = $db->prepare('UPDATE server_games SET revision = ? WHERE id = ?');
        $statement->execute([$revision, $gameId]);
        recomputeVisibility($db, $gameId, (int) $game['map_size'], $revision);
        $db->commit();
        serverTrace('player_respawned', [
            'game_id' => $gameId, 'player_id' => $playerId, 'start' => $start,
            'created_units' => count($mapping), 'force' => $force,
            'deleted_units' => $removed['deleted_units'],
            'removed_improvement_tiles' => $removed['removed_improvement_tiles'],
            'revision' => $revision,
        ]);
        return [
            'unit_id_map' => $mapping, 'start' => $start, 'revision' => $revision,
            'deleted_units' => $removed['deleted_units'],
            'removed_improvement_tiles' => $removed['removed_improvement_tiles'],
        ];
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

function initializeGame(PDO $db, string $key, int $requestPlayer, array $bootstrap): array
{
    $mapSize = max(2, min(500, (int) ($bootstrap['map_size'] ?? 0)));
    if ($mapSize < 2 || !isset($bootstrap['tiles']) || !is_array($bootstrap['tiles'])) {
        serverError(422, 'invalid_bootstrap', 'Bootstrap requires map_size and complete tiles.');
    }
    $units = isset($bootstrap['units']) && is_array($bootstrap['units']) ? $bootstrap['units'] : [];
    $players = isset($bootstrap['players']) && is_array($bootstrap['players']) ? $bootstrap['players'] : [];
    $now = time();
    $requestedStart = isset($bootstrap['turn_started_at']) && is_string($bootstrap['turn_started_at'])
        ? strtotime($bootstrap['turn_started_at']) : false;
    $startedAt = $requestedStart === false ? $now : max($now - SERVER_GAME_TURN_SECONDS, min($now, $requestedStart));
    $deadlineAt = $startedAt + SERVER_GAME_DEADLINE_SECONDS;

    $db->beginTransaction();
    try {
        $statement = $db->prepare(
            'INSERT INTO server_games (game_key, map_size, turn_number, revision, turn_started_at, turn_deadline_at)
             VALUES (?, ?, 0, 1, ?, ?)'
        );
        $statement->execute([$key, $mapSize, gmdate('Y-m-d H:i:s', $startedAt), gmdate('Y-m-d H:i:s', $deadlineAt)]);
        $gameId = (int) $db->lastInsertId();
        insertMapTiles($db, $gameId, $mapSize, $bootstrap['tiles']);
        $mapping = insertBootstrapUnits($db, $gameId, $mapSize, $units);

        $playerIds = [$requestPlayer => true];
        foreach ($players as $player) {
            $playerIds[max(0, (int) $player)] = true;
        }
        foreach ($units as $unit) {
            if (is_array($unit)) {
                $playerIds[max(0, (int) ($unit['owner_id'] ?? 0))] = true;
            }
        }
        $statement = $db->prepare(
            'INSERT INTO server_game_players (game_id, player_id, civilization_key, state_json) VALUES (?, ?, ?, ?)'
        );
        foreach (array_keys($playerIds) as $playerId) {
            $statement->execute([$gameId, $playerId, civilizationKeyForPlayer((int) $playerId), jsonObject(defaultPlayerState())]);
        }
        recomputeVisibility($db, $gameId, $mapSize, 1);
        $db->commit();
        return ['game' => loadGame($db, $key), 'unit_id_map' => $mapping, 'created' => true];
    } catch (Throwable $error) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        if ($error instanceof PDOException && (string) $error->getCode() === '23000') {
            $game = loadGame($db, $key);
            if ($game) {
                return ['game' => $game, 'unit_id_map' => [], 'created' => false];
            }
        }
        throw $error;
    }
}

function ensureGame(PDO $db, string $key, int $playerId, ?array $bootstrap): array
{
    $game = loadGame($db, $key);
    if ($game) {
        return ensureGeneratedGameMap($db, $key, (int) $game['map_size']);
    }
    // Explicit bootstrap remains available for deterministic integration fixtures.
    // Production browser clients never send it; an empty world is generated here.
    if ($bootstrap !== null) {
        return initializeGame($db, $key, $playerId, $bootstrap);
    }
    return initializeGeneratedGame($db, $key, SERVER_GAME_DEFAULT_MAP_SIZE);
}

function loadTiles(PDO $db, int $gameId): array
{
    $statement = $db->prepare('SELECT * FROM server_game_map WHERE game_id = ?');
    $statement->execute([$gameId]);
    $tiles = [];
    foreach ($statement->fetchAll() as $tile) {
        $tiles[$tile['i'] . ':' . $tile['j']] = $tile;
    }
    return $tiles;
}

function workerDiagnostics(PDO $db, array $game, int $workerId): array
{
    $gameId = (int) $game['id'];
    $statement = $db->prepare(
        'SELECT * FROM server_game_units WHERE game_id = ? AND id = ? AND deleted_at IS NULL LIMIT 1'
    );
    $statement->execute([$gameId, $workerId]);
    $worker = $statement->fetch();
    if (!$worker || (string) $worker['unit_type_id'] !== 'worker') {
        serverError(404, 'worker_not_found', 'The requested live Worker was not found.');
    }
    $ownerId = (int) $worker['owner_id'];
    $statement = $db->prepare('SELECT state_json FROM server_game_players WHERE game_id = ? AND player_id = ?');
    $statement->execute([$gameId, $ownerId]);
    $playerState = json_decode((string) ($statement->fetchColumn() ?: '{}'), true);
    if (!is_array($playerState)) $playerState = [];
    $openTechnologies = $playerState['openTechnologies'] ?? [];

    $statement = $db->prepare(
        "SELECT * FROM server_game_units WHERE game_id = ? AND owner_id = ? AND unit_class = 3
         AND deleted_at IS NULL AND health > 0 ORDER BY id"
    );
    $statement->execute([$gameId, $ownerId]);
    $cities = $statement->fetchAll();
    $tiles = loadTiles($db, $gameId);
    $resourceNames = serverResourceNamesById();
    $resourceRequirements = serverResourceImprovementRequirements();
    $cityDiagnostics = [];
    foreach ($cities as $city) {
        $properties = json_decode((string) ($city['properties_json'] ?? '{}'), true);
        if (!is_array($properties)) $properties = [];
        $citizens = $properties['economy']['citizens'] ?? [];
        if (!is_array($citizens)) $citizens = [];
        $citizenTiles = [];
        foreach ($citizens as $index => $citizen) {
            $coord = is_array($citizen) && isset($citizen['coord']) && is_array($citizen['coord'])
                ? $citizen['coord'] : null;
            $i = $coord && isset($coord['i']) && is_numeric($coord['i']) ? (int) $coord['i'] : null;
            $j = $coord && isset($coord['j']) && is_numeric($coord['j']) ? (int) $coord['j'] : null;
            $tile = $i !== null && $j !== null ? ($tiles[coordinateKey($i, $j)] ?? null) : null;
            $modifiers = $tile ? json_decode((string) ($tile['modifiers_json'] ?? '{}'), true) : [];
            if (!is_array($modifiers)) $modifiers = [];
            $terrainType = $tile ? (((int) $tile['terrain_tex']) & 0x0f) : null;
            $resourceType = $tile ? (int) $tile['resource_type'] : 0;
            $resourceName = $resourceNames[$resourceType] ?? null;
            $required = $resourceName ? ($resourceRequirements[$resourceName] ?? null) : null;
            $visibility = false;
            if ($tile) {
                $visibilityStatement = $db->prepare(
                    'SELECT resource_visible FROM server_game_visibility
                     WHERE game_id = ? AND player_id = ? AND i = ? AND j = ?'
                );
                $visibilityStatement->execute([$gameId, $ownerId, $i, $j]);
                $visibility = (bool) $visibilityStatement->fetchColumn();
            }
            $visibleRequired = $visibility ? $required : null;
            $citizenTiles[] = [
                'index' => $index, 'i' => $i, 'j' => $j, 'tile_exists' => $tile !== null,
                'distance_from_city' => $i === null || $j === null ? null
                    : max(abs($i - (int) $city['i']), abs($j - (int) $city['j'])),
                'terrain_type' => $terrainType, 'terrain_tex' => $tile ? (int) $tile['terrain_tex'] : null,
                'resource_type' => $resourceType, 'resource_name' => $resourceName,
                'resource_visible' => $visibility, 'required_improvement' => $visibleRequired,
                'modifiers' => $modifiers,
                'farm_eligible' => $tile !== null && in_array($terrainType, [2, 7], true)
                    && !empty($modifiers['irrigation']) && empty($modifiers['farm'])
                    && ($visibleRequired === null || $visibleRequired === 'farm'),
            ];
        }
        $cityDiagnostics[] = [
            'id' => (int) $city['id'], 'i' => (int) $city['i'], 'j' => (int) $city['j'],
            'distance_from_worker' => max(
                abs((int) $city['i'] - (int) $worker['i']), abs((int) $city['j'] - (int) $worker['j'])
            ),
            'population' => serverCityPopulation($city),
            'last_city_income' => $properties['lastCityIncome'] ?? null,
            'economy_last_income' => $properties['economy']['lastIncome'] ?? null,
            'citizen_tiles' => $citizenTiles,
            'irrigated_citizen_tiles' => count(array_filter(
                $citizenTiles, static fn(array $tile): bool => !empty($tile['modifiers']['irrigation'])
            )),
            'farm_eligible_citizen_tiles' => count(array_filter(
                $citizenTiles, static fn(array $tile): bool => !empty($tile['farm_eligible'])
            )),
        ];
    }
    usort($cityDiagnostics, static fn(array $a, array $b): int => $a['distance_from_worker'] <=> $b['distance_from_worker']);
    $nearestCityRegion = [];
    if ($cityDiagnostics) {
        $nearest = $cityDiagnostics[0];
        $improvementCounts = ['farm' => 0, 'cottage' => 0, 'workshop' => 0];
        for ($di = -4; $di <= 4; $di++) {
            for ($dj = -4; $dj <= 4; $dj++) {
                $i = (int) $nearest['i'] + $di;
                $j = (int) $nearest['j'] + $dj;
                $tile = $tiles[coordinateKey($i, $j)] ?? null;
                if (!$tile) continue;
                $modifiers = json_decode((string) ($tile['modifiers_json'] ?? '{}'), true);
                if (!is_array($modifiers)) $modifiers = [];
                foreach ($improvementCounts as $improvement => $_count) {
                    if (!empty($modifiers[$improvement])) ++$improvementCounts[$improvement];
                }
                if (empty($modifiers['irrigation'])) continue;
                $terrainType = ((int) $tile['terrain_tex']) & 0x0f;
                $resourceType = (int) $tile['resource_type'];
                $resourceVisible = serverPlayerCanSeeTileResource($db, $gameId, $ownerId, $i, $j);
                $resourceName = $resourceVisible ? ($resourceNames[$resourceType] ?? null) : null;
                $required = $resourceName ? ($resourceRequirements[$resourceName] ?? null) : null;
                $nearestCityRegion[] = [
                    'i' => $i, 'j' => $j,
                    'distance_from_city' => max(abs($di), abs($dj)),
                    'distance_from_worker' => max(
                        abs($i - (int) $worker['i']), abs($j - (int) $worker['j'])
                    ),
                    'terrain_type' => $terrainType,
                    'terrain_tex' => (int) $tile['terrain_tex'],
                    'resource_type' => $resourceType,
                    'resource_visible' => $resourceVisible,
                    'resource_name' => $resourceName,
                    'required_improvement' => $required,
                    'modifiers' => $modifiers,
                    'farm_eligible' => in_array($terrainType, [2, 7], true)
                        && empty($modifiers['farm']) && empty($modifiers['fortification'])
                        && ($required === null || $required === 'farm'),
                ];
            }
        }
        usort($nearestCityRegion, static function (array $a, array $b): int {
            return [$a['distance_from_worker'], $a['i'], $a['j']]
                <=> [$b['distance_from_worker'], $b['i'], $b['j']];
        });
        $nearestCitySummary = [
            'id' => (int) $nearest['id'],
            'population' => (int) $nearest['population'],
            'generic_improvement_target' => max(1, (int) ceil((int) $nearest['population'] / 2)),
            'improvement_counts' => $improvementCounts,
        ];
    } else {
        $nearestCitySummary = null;
    }
    return [
        'worker' => publicUnit($worker),
        'irrigation_technology_open' => !empty($openTechnologies['Irrigation']),
        'open_technologies' => $openTechnologies,
        'cities' => $cityDiagnostics,
        'nearest_city_summary' => $nearestCitySummary,
        'nearest_city_irrigated_tiles' => $nearestCityRegion,
    ];
}

function aiDiagnostics(PDO $db, array $game): array
{
    $gameId = (int) $game['id'];
    $aiPlayerId = ensureGlobalAiUser($db);
    $statement = $db->prepare(
        'SELECT unit_type_id, unit_class, state, COUNT(*) AS unit_count,
                MIN(id) AS first_id, MAX(id) AS last_id
         FROM server_game_units
         WHERE game_id = ? AND owner_id = ? AND deleted_at IS NULL AND health > 0
         GROUP BY unit_type_id, unit_class, state
         ORDER BY unit_class, unit_type_id, state'
    );
    $statement->execute([$gameId, $aiPlayerId]);
    $composition = array_map(static function(array $row): array {
        return [
            'unit_type_id' => (string) $row['unit_type_id'],
            'unit_class' => (int) $row['unit_class'],
            'state' => (string) $row['state'],
            'count' => (int) $row['unit_count'],
            'first_id' => (int) $row['first_id'],
            'last_id' => (int) $row['last_id'],
        ];
    }, $statement->fetchAll());

    $statement = $db->prepare(
        "SELECT id, unit_type_id, unit_class, state, i, j, properties_json, revision
         FROM server_game_units
         WHERE game_id = ? AND owner_id = ? AND deleted_at IS NULL AND health > 0
           AND (unit_type_id IN ('settlers', 'worker') OR unit_class = 3)
         ORDER BY unit_class DESC, unit_type_id, id LIMIT 120"
    );
    $statement->execute([$gameId, $aiPlayerId]);
    $developmentUnits = array_map(static function(array $row): array {
        $properties = json_decode((string) ($row['properties_json'] ?? '{}'), true);
        if (!is_array($properties)) $properties = [];
        return [
            'id' => (int) $row['id'], 'unit_type_id' => (string) $row['unit_type_id'],
            'unit_class' => (int) $row['unit_class'], 'state' => (string) $row['state'],
            'i' => (int) $row['i'], 'j' => (int) $row['j'], 'revision' => (int) $row['revision'],
            'automation_mode' => $properties['automationMode'] ?? null,
            'settler_turns' => (int) ($properties['aiSettlerTurns'] ?? 0),
            'production' => $properties['production'] ?? null,
        ];
    }, $statement->fetchAll());

    $statement = $db->prepare(
        'SELECT command_name, COUNT(*) AS command_count
         FROM server_game_orders WHERE game_id = ? AND turn_number = ? AND player_id = ?
         GROUP BY command_name ORDER BY command_name'
    );
    $statement->execute([$gameId, (int) $game['turn_number'], $aiPlayerId]);
    $orders = [];
    foreach ($statement->fetchAll() as $row) $orders[(string) $row['command_name']] = (int) $row['command_count'];

    $statement = $db->prepare(
        'SELECT COUNT(*) AS leases,
                SUM(CASE WHEN submitted_at IS NULL THEN 1 ELSE 0 END) AS pending,
                COUNT(DISTINCT client_key) AS clients
         FROM server_game_ai_leases WHERE game_id = ? AND turn_number = ?'
    );
    $statement->execute([$gameId, (int) $game['turn_number']]);
    $leases = $statement->fetch() ?: [];

    $statement = $db->prepare(
        'SELECT state_json FROM server_game_players WHERE game_id = ? AND player_id = ?'
    );
    $statement->execute([$gameId, $aiPlayerId]);
    $playerState = json_decode((string) ($statement->fetchColumn() ?: '{}'), true);
    if (!is_array($playerState)) $playerState = [];

    return [
        'ai_player_id' => $aiPlayerId,
        'turn' => (int) $game['turn_number'],
        'revision' => (int) $game['revision'],
        'deadline_at' => gmdate(DATE_ATOM, strtotime((string) $game['turn_deadline_at'] . ' UTC')),
        'food' => (float) ($playerState['food'] ?? 0),
        'money' => (float) ($playerState['money'] ?? 0),
        'composition' => $composition,
        'development_units' => $developmentUnits,
        'current_orders' => $orders,
        'current_leases' => [
            'count' => (int) ($leases['leases'] ?? 0),
            'pending' => (int) ($leases['pending'] ?? 0),
            'clients' => (int) ($leases['clients'] ?? 0),
        ],
    ];
}

function coordinateKey(int $i, int $j): string
{
    return $i . ':' . $j;
}

function serverSupertileAnchorAt(array $tiles, int $i, int $j): ?array
{
    $target = $tiles[coordinateKey($i, $j)] ?? null;
    if (!$target) return null;
    $isLowerTile = (((int) $target['terrain_tex']) & 0x40) !== 0;
    $candidates = $isLowerTile
        ? [[$i - 1, $j], [$i - 1, $j - 1], [$i, $j], [$i, $j - 1]]
        : [[$i, $j], [$i, $j - 1], [$i - 1, $j], [$i - 1, $j - 1]];
    foreach ($candidates as [$anchorI, $anchorJ]) {
        $keys = [
            coordinateKey($anchorI, $anchorJ), coordinateKey($anchorI, $anchorJ + 1),
            coordinateKey($anchorI + 1, $anchorJ), coordinateKey($anchorI + 1, $anchorJ + 1),
        ];
        if (array_filter($keys, static fn(string $key): bool => !isset($tiles[$key]))) continue;
        $values = array_map(static fn(string $key): int => (int) $tiles[$key]['terrain_tex'], $keys);
        $base = $values[0] & 0x3f;
        if (($values[2] & 0x40) === 0 || ($values[3] & 0x40) === 0) continue;
        if (($values[1] & 0x3f) !== $base || ($values[2] & 0x3f) !== $base || ($values[3] & 0x3f) !== $base) continue;
        return ['i' => $anchorI, 'j' => $anchorJ];
    }
    return null;
}

function serverSplitSupertileAt(array &$tiles, int $i, int $j): array
{
    $anchor = serverSupertileAnchorAt($tiles, $i, $j);
    if ($anchor === null) return [];
    $changed = [];
    for ($di = 0; $di <= 1; ++$di) {
        for ($dj = 0; $dj <= 1; ++$dj) {
            $key = coordinateKey($anchor['i'] + $di, $anchor['j'] + $dj);
            $tiles[$key]['terrain_tex'] = ((int) $tiles[$key]['terrain_tex']) & ~0x40;
            $changed[] = $key;
        }
    }
    return $changed;
}

function serverIsChoppableForestTerrain(int $terrain): bool
{
    return ($terrain & 0x0f) === 6 || (($terrain & 0x0f) === 4 && ($terrain & 0x10) !== 0);
}

function serverChoppedForestTerrain(int $terrain): int
{
    if (($terrain & 0x0f) === 4 && ($terrain & 0x10) !== 0) return $terrain & ~0x10;
    return 2;
}

function serverTransportCapacity(string $unitTypeId): int
{
    return $unitTypeId === 'galley' ? 2 : ($unitTypeId === 'frigate' ? 4 : 0);
}

function serverTransportStateAt(array $units, int $ownerId, int $i, int $j, int $excludeUnitId = 0): array
{
    $capacity = 0; $passengers = 0;
    foreach ($units as $candidate) {
        if ((int) $candidate['id'] === $excludeUnitId || (int) $candidate['owner_id'] !== $ownerId
            || (int) $candidate['i'] !== $i || (int) $candidate['j'] !== $j
            || (float) $candidate['health'] <= 0) continue;
        $capacity += serverTransportCapacity((string) $candidate['unit_type_id']);
        if ((int) $candidate['can_move'] && !serverIsCityUnit($candidate)
            && (string) $candidate['nature'] !== 'water') ++$passengers;
    }
    return ['capacity' => $capacity, 'passengers' => $passengers];
}

function serverTileHasRoad(?array $tile): bool
{
    if (!$tile) return false;
    $modifiers = $tile['modifiers'] ?? null;
    if (!is_array($modifiers)) {
        $modifiers = json_decode((string) ($tile['modifiers_json'] ?? '{}'), true);
    }
    return is_array($modifiers) && !empty($modifiers['road']);
}

function serverMovementStepCost(?array $sourceTile, ?array $destinationTile): float
{
    return serverTileHasRoad($sourceTile) && serverTileHasRoad($destinationTile) ? 0.5 : 1.0;
}

function serverIsMaximumRock(?array $tile): bool
{
    if (!$tile) return false;
    $terrain = (int) ($tile['terrain_tex'] ?? 0);
    return ($terrain & 0x0f) === 5 && (($terrain >> 4) & 0x03) === 3;
}

function serverIsMountedOrWheelUnit(array $unit): bool
{
    return in_array((string) ($unit['unit_type_id'] ?? ''),
        ['horseman', 'chariot', 'knight', 'elephant'], true);
}

function serverTerrainMovePenalty(array $unit, ?array $tile): int
{
    if (!$tile || serverTileHasRoad($tile) || ((int) $tile['terrain_tex'] & 0x0f) === 0) return 0;
    if (serverIsMaximumRock($tile)) return 3;
    return ((int) $tile['terrain_tex'] >> 4) & 0x03;
}

function serverPathCumulativeMovementCosts(array $unit, array $path, array $tiles): array
{
    $i = (int) $unit['i'];
    $j = (int) $unit['j'];
    $total = 0.0;
    $costs = [0.0];
    foreach ($path as $point) {
        $ni = (int) $point['i'];
        $nj = (int) $point['j'];
        $total += serverMovementStepCost(
            $tiles[coordinateKey($i, $j)] ?? null,
            $tiles[coordinateKey($ni, $nj)] ?? null
        );
        $costs[] = $total;
        $i = $ni;
        $j = $nj;
    }
    return $costs;
}

function validatePath(
    array $unit, array $rawPath, array $tiles, int $mapSize, ?array &$diagnostic = null,
    array $units = [], bool $landOnly = false
): array
{
    $path = [];
    $i = (int) $unit['i'];
    $j = (int) $unit['j'];
    $movementBudget = max(0.0, (float) $unit['speed']);
    $maximumSteps = max(0, (int) floor($movementBudget * 2.0));
    $limit = min(count($rawPath), $maximumSteps);
    $spent = 0.0;
    $diagnostic = [
        'input_steps' => count($rawPath), 'speed_limit' => $movementBudget,
        'maximum_road_steps' => $maximumSteps, 'accepted_steps' => 0,
        'movement_cost' => 0.0, 'stopped' => null,
    ];
    for ($n = 0; $n < $limit; ++$n) {
        $point = $rawPath[$n];
        if (!is_array($point)) {
            $diagnostic['stopped'] = ['step' => $n, 'reason' => 'step_not_object'];
            break;
        }
        $ni = (int) ($point['i'] ?? -9999);
        $nj = (int) ($point['j'] ?? -9999);
        $di = $ni - $i;
        $dj = $nj - $j;
        $adjacent = abs($di) <= 1 && abs($dj) <= 1
            && ($di !== 0 || $dj !== 0)
            && $di !== -$dj;
        if ($ni < 0 || $nj < 0 || $ni >= $mapSize || $nj >= $mapSize || !$adjacent) {
            $diagnostic['stopped'] = [
                'step' => $n, 'reason' => 'off_map_or_non_adjacent',
                'from' => ['i' => $i, 'j' => $j], 'to' => ['i' => $ni, 'j' => $nj],
            ];
            break;
        }
        $tile = $tiles[coordinateKey($ni, $nj)] ?? null;
        if (!$tile) {
            $diagnostic['stopped'] = ['step' => $n, 'reason' => 'tile_missing', 'to' => ['i' => $ni, 'j' => $nj]];
            break;
        }
        $water = (((int) $tile['terrain_tex']) & 0x0F) === 0;
        if ($landOnly && $water) {
            $diagnostic['stopped'] = [
                'step' => $n, 'reason' => 'road_to_water_forbidden',
                'to' => ['i' => $ni, 'j' => $nj],
            ];
            break;
        }
        $sourceTile = $tiles[coordinateKey($i, $j)] ?? null;
        $stepCost = serverMovementStepCost($sourceTile, $tile);
        if ($spent + $stepCost > $movementBudget + 0.000001) {
            $diagnostic['stopped'] = [
                'step' => $n, 'reason' => 'movement_budget_exceeded',
                'step_cost' => $stepCost, 'spent' => $spent, 'budget' => $movementBudget,
            ];
            break;
        }
        $sourceWater = $sourceTile && ((((int) $sourceTile['terrain_tex']) & 0x0f) === 0);
        $terrainAllowed = $unit['nature'] === 'water'
            ? ($water || serverCityOnTile($units, $ni, $nj, (int) $unit['owner_id']) !== null)
            : !$water;
        if ($unit['nature'] !== 'water' && $sourceWater && !$water) $terrainAllowed = true;
        if ($unit['nature'] !== 'water' && !$sourceWater && $water) {
            $transport = serverTransportStateAt(
                $units, (int) $unit['owner_id'], $ni, $nj, (int) $unit['id']
            );
            $terrainAllowed = $transport['passengers'] < $transport['capacity'];
        }
        if ($unit['nature'] !== 'water' && $sourceWater && $water) $terrainAllowed = false;
        if (!$terrainAllowed) {
            $diagnostic['stopped'] = [
                'step' => $n, 'reason' => 'movement_nature_mismatch',
                'unit_nature' => $unit['nature'], 'tile_is_water' => $water,
            ];
            break;
        }
        if (serverIsMaximumRock($tile) && serverIsMountedOrWheelUnit($unit)) {
            $diagnostic['stopped'] = [
                'step' => $n, 'reason' => 'maximum_rock_forbidden',
                'unit_type_id' => (string) $unit['unit_type_id'], 'to' => ['i' => $ni, 'j' => $nj],
            ];
            break;
        }
        $path[] = ['i' => $ni, 'j' => $nj];
        $spent += $stepCost;
        $i = $ni;
        $j = $nj;
        $diagnostic['accepted_steps'] = count($path);
        $diagnostic['movement_cost'] = $spent;
    }
    return $path;
}

function serverForbiddenAmphibiousContact(
    array $unit, array $path, array $tiles, array $units
): ?array {
    $i = (int) $unit['i'];
    $j = (int) $unit['j'];
    foreach ($path as $stepIndex => $point) {
        $source = $tiles[coordinateKey($i, $j)] ?? null;
        $destination = $tiles[coordinateKey((int) $point['i'], (int) $point['j'])] ?? null;
        $sourceWater = $source && ((((int) $source['terrain_tex']) & 0x0f) === 0);
        $destinationWater = $destination && ((((int) $destination['terrain_tex']) & 0x0f) === 0);
        if ($sourceWater && !$destinationWater) {
            foreach ($units as $occupant) {
                if ((int) $occupant['id'] === (int) $unit['id']
                    || (int) $occupant['owner_id'] === (int) $unit['owner_id']
                    || (float) $occupant['health'] <= 0
                    || (int) $occupant['i'] !== (int) $point['i']
                    || (int) $occupant['j'] !== (int) $point['j']) continue;
                if ((int) $occupant['can_move'] || serverIsCityUnit($occupant)) {
                    return [
                        'step' => $stepIndex,
                        'from' => ['i' => $i, 'j' => $j],
                        'to' => ['i' => (int) $point['i'], 'j' => (int) $point['j']],
                        'defender_id' => (int) $occupant['id'],
                    ];
                }
            }
        }
        $i = (int) $point['i'];
        $j = (int) $point['j'];
    }
    return null;
}

function serverTileSupportsUnit(array $unit, int $i, int $j, array $tiles, int $mapSize): bool
{
    if ($i < 0 || $j < 0 || $i >= $mapSize || $j >= $mapSize) return false;
    $tile = $tiles[coordinateKey($i, $j)] ?? null;
    if (!$tile) return false;
    $water = (((int) $tile['terrain_tex']) & 0x0f) === 0;
    return ($unit['nature'] === 'water') === $water;
}

function serverAssignTransportCrews(array $units): array
{
    $assigned = [];
    $crews = [];
    ksort($units, SORT_NUMERIC);
    foreach ($units as $carrierId => $carrier) {
        $capacity = serverTransportCapacity((string) $carrier['unit_type_id']);
        if ($capacity <= 0 || (float) $carrier['health'] <= 0) continue;
        foreach ($units as $passengerId => $passenger) {
            if (count($crews[$carrierId] ?? []) >= $capacity) break;
            if (isset($assigned[$passengerId]) || (int) $passenger['owner_id'] !== (int) $carrier['owner_id']
                || (int) $passenger['i'] !== (int) $carrier['i'] || (int) $passenger['j'] !== (int) $carrier['j']
                || !(int) $passenger['can_move'] || serverIsCityUnit($passenger)
                || (string) $passenger['nature'] === 'water' || (float) $passenger['health'] <= 0) continue;
            $crews[$carrierId][] = $passengerId;
            $assigned[$passengerId] = true;
        }
    }
    return $crews;
}

function serverMoveTransportCrews(array &$units, array $transportCrews): void
{
    foreach ($transportCrews as $carrierId => $crewIds) {
        if (!isset($units[$carrierId]) || (float) $units[$carrierId]['health'] <= 0
            || ((int) $units[$carrierId]['i'] === (int) $units[$carrierId]['start_i']
                && (int) $units[$carrierId]['j'] === (int) $units[$carrierId]['start_j'])) continue;
        foreach ($crewIds as $crewId) {
            if (!isset($units[$crewId]) || (float) $units[$crewId]['health'] <= 0) continue;
            $units[$crewId]['i'] = (int) $units[$carrierId]['i'];
            $units[$crewId]['j'] = (int) $units[$carrierId]['j'];
        }
    }
}

function serverDisbandOrphanedLandUnitsAtSea(array &$units, array $tiles, array &$events): array
{
    $carriers = [];
    foreach ($units as $carrier) {
        if ((float) $carrier['health'] <= 0
            || serverTransportCapacity((string) $carrier['unit_type_id']) <= 0) continue;
        $key = (int) $carrier['owner_id'] . ':'
            . coordinateKey((int) $carrier['i'], (int) $carrier['j']);
        $carriers[$key] = true;
    }

    $disbanded = [];
    foreach ($units as $unitId => &$unit) {
        if ((float) $unit['health'] <= 0 || !(int) $unit['can_move']
            || serverIsCityUnit($unit) || (string) $unit['nature'] === 'water') continue;
        $tile = $tiles[coordinateKey((int) $unit['i'], (int) $unit['j'])] ?? null;
        $isWater = $tile && ((((int) $tile['terrain_tex']) & 0x0f) === 0);
        if (!$isWater) continue;
        $carrierKey = (int) $unit['owner_id'] . ':'
            . coordinateKey((int) $unit['i'], (int) $unit['j']);
        if (isset($carriers[$carrierKey])) continue;

        $unit['health'] = 0.0;
        $unit['state'] = 'disbanded';
        $message = $unit['name'] . ' #' . $unitId
            . ' was disbanded because it was alone at sea without a transport ship.';
        eventForPlayers(
            $events, [(int) $unit['owner_id']], 'unit_disbanded_at_sea', $unit, null,
            (int) $unit['i'], (int) $unit['j'], $message,
            ['reason' => 'land_unit_without_transport', 'unit_id' => (int) $unitId]
        );
        $disbanded[] = (int) $unitId;
    }
    unset($unit);
    if ($disbanded) {
        serverTrace('orphaned_land_units_disbanded_at_sea', ['unit_ids' => $disbanded]);
    }
    return $disbanded;
}

function validateAtomicMovementCommands(PDO $db, array $game, int $playerId, array $commands): ?array
{
    $gameId = (int) $game['id'];
    $turn = (int) $game['turn_number'];
    $duplicate = $db->prepare(
        'SELECT 1 FROM server_game_submissions WHERE game_id = ? AND turn_number = ? AND player_id = ? LIMIT 1'
    );
    $duplicate->execute([$gameId, $turn, $playerId]);
    if ($duplicate->fetchColumn()) return null;

    $tiles = loadTiles($db, $gameId);
    $allUnitsStatement = $db->prepare(
        'SELECT * FROM server_game_units WHERE game_id = ? AND deleted_at IS NULL AND health > 0 ORDER BY id'
    );
    $allUnitsStatement->execute([$gameId]);
    $allUnits = $allUnitsStatement->fetchAll();
    $mapSize = (int) $game['map_size'];
    $byId = $db->prepare(
        'SELECT * FROM server_game_units WHERE game_id = ? AND owner_id = ? AND id = ? AND deleted_at IS NULL'
    );
    $byClient = $db->prepare(
        'SELECT * FROM server_game_units WHERE game_id = ? AND owner_id = ? AND client_key = ? AND deleted_at IS NULL'
    );
    $tileOccupants = $db->prepare(
        'SELECT owner_id, unit_class, unit_type_id, can_move, health
         FROM server_game_units
         WHERE game_id = ? AND i = ? AND j = ? AND deleted_at IS NULL AND health > 0'
    );
    foreach (array_slice($commands, 0, 1000) as $commandIndex => $command) {
        if (!is_array($command) || strtolower((string) ($command['command'] ?? 'hold')) !== 'move') continue;
        $requestedUnitId = isset($command['unit_id']) ? (int) $command['unit_id'] : 0;
        if ($requestedUnitId > 0) {
            $byId->execute([$gameId, $playerId, $requestedUnitId]);
            $unit = $byId->fetch();
        } else {
            $clientKey = substr((string) ($command['client_key'] ?? ''), 0, 100);
            $byClient->execute([$gameId, $playerId, $clientKey]);
            $unit = $byClient->fetch();
        }
        if (!$unit) {
            return [
                'reason' => 'owned_unit_not_found', 'command_index' => $commandIndex,
                'unit_id' => $requestedUnitId ?: null,
            ];
        }
        $unitId = (int) $unit['id'];
        $path = isset($command['path']) && is_array($command['path']) ? $command['path'] : [];
        $speedLimit = max(0.0, (float) $unit['speed']);
        $maximumRoadSteps = max(0, (int) floor($speedLimit * 2.0));
        if (!(int) $unit['can_move']) {
            return ['reason' => 'unit_cannot_move', 'command_index' => $commandIndex, 'unit_id' => $unitId];
        }
        if ((int) $unit['move_penalty'] > 0) {
            return [
                'reason' => 'unit_has_move_penalty', 'command_index' => $commandIndex,
                'unit_id' => $unitId, 'move_penalty' => (int) $unit['move_penalty'],
            ];
        }
        if (!$path) {
            return ['reason' => 'movement_path_empty', 'command_index' => $commandIndex, 'unit_id' => $unitId];
        }
        if (count($path) > $maximumRoadSteps) {
            return [
                'reason' => 'movement_exceeds_speed', 'command_index' => $commandIndex,
                'unit_id' => $unitId, 'steps' => count($path), 'speed_limit' => $speedLimit,
                'maximum_road_steps' => $maximumRoadSteps,
            ];
        }
        $diagnostic = null;
        $payload = isset($command['payload']) && is_array($command['payload']) ? $command['payload'] : [];
        $roadTo = (string) $unit['unit_type_id'] === 'worker' && !empty($payload['road_to']);
        $accepted = validatePath($unit, $path, $tiles, $mapSize, $diagnostic, $allUnits, $roadTo);
        if (count($accepted) !== count($path)) {
            return [
                'reason' => 'movement_path_invalid', 'command_index' => $commandIndex,
                'unit_id' => $unitId, 'start' => ['i' => (int) $unit['i'], 'j' => (int) $unit['j']],
                'path' => $path, 'validation' => $diagnostic,
            ];
        }
        $amphibiousContact = serverForbiddenAmphibiousContact($unit, $accepted, $tiles, $allUnits);
        if ($amphibiousContact !== null) {
            return [
                'reason' => 'amphibious_attack_forbidden', 'command_index' => $commandIndex,
                'unit_id' => $unitId, 'contact' => $amphibiousContact,
            ];
        }
        $target = $accepted[count($accepted) - 1];
        $tileOccupants->execute([$gameId, $target['i'], $target['j']]);
        $occupants = $tileOccupants->fetchAll();
        $stackCount = 0;
        foreach ($occupants as $occupant) {
            if ((int) $occupant['can_move']) $stackCount++;
        }
        $isAttack = serverMovementCanAttackOccupants($unit, $occupants);
        if ($stackCount >= SERVER_GAME_TILE_UNIT_LIMIT && !$isAttack) {
            return [
                'reason' => 'unit_stack_full', 'command_index' => $commandIndex,
                'unit_id' => $unitId, 'i' => $target['i'], 'j' => $target['j'],
                'unit_count' => $stackCount, 'unit_limit' => SERVER_GAME_TILE_UNIT_LIMIT,
            ];
        }
    }
    return null;
}

function rejectInvalidAtomicMovements(PDO $db, array $game, int $playerId, array &$commands): array
{
    $rejected = [];
    for ($attempt = 0; $attempt < count($commands); ++$attempt) {
        $error = validateAtomicMovementCommands($db, $game, $playerId, $commands);
        if ($error === null) break;
        $commandIndex = isset($error['command_index']) ? (int) $error['command_index'] : -1;
        if ($commandIndex < 0 || $commandIndex >= count($commands) || !is_array($commands[$commandIndex])) {
            return [$error];
        }
        $rejected[] = $error;
        $commands[$commandIndex]['command'] = 'hold';
        $commands[$commandIndex]['path'] = [];
        $commands[$commandIndex]['payload'] = [
            'movement_rejected' => (string) ($error['reason'] ?? 'invalid_movement'),
        ];
    }
    return $rejected;
}

function eventForPlayers(array &$events, array $players, string $type, array $unit, ?array $other, int $i, int $j, string $message, array $payload = []): void
{
    foreach (array_unique($players) as $playerId) {
        $events[] = [
            'audience' => (int) $playerId,
            'type' => $type,
            'unit_id' => (int) $unit['id'],
            'other_unit_id' => $other ? (int) $other['id'] : null,
            'i' => $i,
            'j' => $j,
            'message' => $message,
            'payload' => $payload,
        ];
    }
}

function combatUnitSnapshot(array $unit): array
{
    return [
        'id' => (int) $unit['id'],
        'owner_id' => (int) $unit['owner_id'],
        'unit_type_id' => (string) $unit['unit_type_id'],
        'unit_class' => (int) $unit['unit_class'],
        'name' => (string) $unit['name'],
        'texture' => (int) $unit['texture'],
        'i' => (int) $unit['i'],
        'j' => (int) $unit['j'],
        'health' => (float) $unit['health'],
        'max_health' => (float) $unit['max_health'],
        'experience' => (float) $unit['experience'],
        'deleted' => (float) $unit['health'] <= 0,
    ];
}

function combatUnitUpdatesForPlayer(array $events, int $playerId): array
{
    $byId = [];
    foreach ($events as $event) {
        if ((int) ($event['audience'] ?? -1) !== $playerId) continue;
        $payload = $event['payload'] ?? [];
        if (!is_array($payload)) continue;
        foreach (['attacker_after', 'defender_after'] as $field) {
            $snapshot = $payload[$field] ?? null;
            if (!is_array($snapshot) || !isset($snapshot['id'])) continue;
            // Later combat events overwrite earlier snapshots for units that fought more than once.
            $byId[(int) $snapshot['id']] = $snapshot;
        }
    }
    return array_values($byId);
}

function addCombatStatistic(array &$statistics, int $playerId, string $field): void
{
    if (!isset($statistics[$playerId])) {
        $statistics[$playerId] = ['units_killed' => 0, 'cities_occupied' => 0, 'cities_destroyed' => 0];
    }
    ++$statistics[$playerId][$field];
}

function serverCombat(
    array &$attacker,
    array &$defender,
    int $turn,
    int $i,
    int $j,
    array &$events,
    string $eventType,
    array $audiencePlayers,
    array &$statistics,
    array $tiles,
    bool $defenderInCity = false,
    float $cityDefensePercent = 100.0
): array
{
    $attackerBefore = combatUnitSnapshot($attacker);
    $defenderBefore = combatUnitSnapshot($defender);
    $attackerBefore['i'] = (int) ($attacker['start_i'] ?? $attackerBefore['i']);
    $attackerBefore['j'] = (int) ($attacker['start_j'] ?? $attackerBefore['j']);
    $before = ['attacker' => $attackerBefore, 'defender' => $defenderBefore];
    $attackPower = max(0.25, (float) $attacker['attack_value']) * max(1.0, (float) $attacker['experience']);
    $chanceInputs = serverBattleChanceInputs(
        $attacker, $defender, $tiles, $defenderInCity, $cityDefensePercent
    );
    $defenseBonus = $chanceInputs['total_defense_bonus'];
    $defensePower = serverUnitDefenseStrength(
        $defender, $attacker, $tiles, $defenderInCity, $cityDefensePercent
    );
    $seed = (int) sprintf('%u', crc32($turn . ':' . $attacker['id'] . ':' . $defender['id'] . ':' . $i . ':' . $j));
    $attackRoll = $attackPower * (0.85 + (($seed % 31) / 100.0));
    $defenseRoll = $defensePower * (0.85 + ((($seed >> 5) % 31) / 100.0));
    $total = max(0.01, $attackRoll + $defenseRoll);
    $defenderDamage = max(8, (int) round(42 * $attackRoll / $total));
    $attackerDamage = max(8, (int) round(42 * $defenseRoll / $total));
    $attacker['health'] = max(0.0, (float) $attacker['health'] - $attackerDamage);
    $defender['health'] = max(0.0, (float) $defender['health'] - $defenderDamage);
    if ($attackRoll >= $defenseRoll && $attacker['health'] > 0) {
        $attacker['experience'] = round((float) $attacker['experience'] + 0.25, 2);
    } elseif ($defender['health'] > 0) {
        $defender['experience'] = round((float) $defender['experience'] + 0.25, 2);
    }
    $message = ucfirst($eventType) . ': U' . $attacker['owner_id'] . ' ' . $attacker['unit_type_id']
        . ' meets U' . $defender['owner_id'] . ' ' . $defender['unit_type_id'] . ' at (' . $i . ',' . $j . ')';
    $destroyedUnitIds = [];
    if ($defenderBefore['health'] > 0 && $defender['health'] <= 0) {
        $destroyedUnitIds[] = (int) $defender['id'];
        if ((int) $defender['unit_class'] === 3) addCombatStatistic($statistics, (int) $attacker['owner_id'], 'cities_destroyed');
        else addCombatStatistic($statistics, (int) $attacker['owner_id'], 'units_killed');
    }
    if ($attackerBefore['health'] > 0 && $attacker['health'] <= 0) {
        $destroyedUnitIds[] = (int) $attacker['id'];
        if ((int) $attacker['unit_class'] === 3) addCombatStatistic($statistics, (int) $defender['owner_id'], 'cities_destroyed');
        else addCombatStatistic($statistics, (int) $defender['owner_id'], 'units_killed');
    }
    $combatKind = (int) $defender['unit_class'] === 3 ? 'city_attack' : 'unit_attack';
    eventForPlayers(
        $events,
        array_merge($audiencePlayers, [(int) $attacker['owner_id'], (int) $defender['owner_id']]),
        $eventType,
        $attacker,
        $defender,
        $i,
        $j,
        $message,
        [
            'combat_kind' => $combatKind,
            'resolution_type' => $eventType,
            'attacker_damage' => $attackerDamage,
            'defender_damage' => $defenderDamage,
            'defender_defense_bonus' => $defenseBonus,
            'defender_defense_inputs' => $chanceInputs,
            'defender_effective_defense' => $defensePower,
            'attacker_before' => $attackerBefore,
            'defender_before' => $defenderBefore,
            'attacker_after' => combatUnitSnapshot($attacker),
            'defender_after' => combatUnitSnapshot($defender),
            'destroyed_unit_ids' => $destroyedUnitIds,
        ]
    );
    serverTrace('combat', [
        'type' => $eventType, 'turn' => $turn, 'i' => $i, 'j' => $j, 'before' => $before,
        'after' => [
            'attacker' => [
                'id' => (int) $attacker['id'], 'health' => (float) $attacker['health'],
                'experience' => (float) $attacker['experience'],
            ],
            'defender' => [
                'id' => (int) $defender['id'], 'health' => (float) $defender['health'],
                'experience' => (float) $defender['experience'],
            ],
        ],
    ]);
    return [
        'attacker_dead' => (float) $attacker['health'] <= 0,
        'defender_dead' => (float) $defender['health'] <= 0,
        'destroyed_unit_ids' => $destroyedUnitIds,
    ];
}

function serverIsCityUnit(array $unit): bool
{
    return (int) ($unit['unit_class'] ?? -1) === 3 || ($unit['unit_type_id'] ?? '') === 'city';
}

function serverIsMilitaryUnit(array $unit): bool
{
    return (int) ($unit['unit_class'] ?? -1) === 2 && (float) ($unit['health'] ?? 0) > 0;
}

function serverDefenseBonusTable(): array
{
    // The three columns are deliberately mirrored by defenseBonusTable() in military.js.
    return [
        'default' => ['landscape_bonus' => 'standard', 'unit_bonus' => 'none', 'building_bonus' => 'standard'],
        'horseman' => ['landscape_bonus' => 'mounted', 'unit_bonus' => 'anti_siege', 'building_bonus' => 'standard'],
        'chariot' => ['landscape_bonus' => 'mounted', 'unit_bonus' => 'chariot_anti_catapult', 'building_bonus' => 'standard'],
        'knight' => ['landscape_bonus' => 'mounted', 'unit_bonus' => 'anti_siege', 'building_bonus' => 'standard'],
        'spearman' => ['landscape_bonus' => 'standard', 'unit_bonus' => 'anti_mounted', 'building_bonus' => 'standard'],
        'pikeman' => ['landscape_bonus' => 'standard', 'unit_bonus' => 'anti_mounted', 'building_bonus' => 'standard'],
        'archer' => ['landscape_bonus' => 'standard', 'unit_bonus' => 'none', 'building_bonus' => 'ranged'],
        'longbow' => ['landscape_bonus' => 'standard', 'unit_bonus' => 'none', 'building_bonus' => 'ranged'],
        'elephant' => ['landscape_bonus' => 'standard', 'unit_bonus' => 'siege_vulnerable', 'building_bonus' => 'standard'],
    ];
}

function serverTerrainDefenseContext(array $unit, array $tiles): array
{
    $tile = $tiles[coordinateKey((int) $unit['i'], (int) $unit['j'])] ?? [];
    $value = (int) ($tile['terrain_tex'] ?? 0);
    $type = $value & 0x0f;
    $level = ($value >> 4) & 0x03;
    $hills = $type === 4;
    $forest = $type === 6 || ($hills && ($level & 1) !== 0);
    return [
        'type' => $type,
        'level' => $level,
        'hills' => $hills,
        'forest' => $forest,
        'high_hills' => $hills && $level >= 2,
        'low_hills' => $hills && $level < 2,
        'fields' => $type === 2 || $type === 7,
    ];
}

function serverBattleChanceInputs(
    array $attacker,
    array $defender,
    array $tiles,
    bool $defenderInCity = false,
    float $cityDefensePercent = 100.0
): array
{
    $table = serverDefenseBonusTable();
    $defenderType = (string) ($defender['unit_type_id'] ?? '');
    $row = $table[$defenderType] ?? $table['default'];
    $terrain = serverTerrainDefenseContext($defender, $tiles);
    $landscapeBonus = ($terrain['hills'] ? 0.25 : 0.0) + ($terrain['forest'] ? 0.50 : 0.0);
    if ($row['landscape_bonus'] === 'mounted') {
        if ($terrain['forest'] || $terrain['high_hills']) $landscapeBonus -= 0.50;
        elseif ($terrain['fields'] || ($terrain['low_hills'] && !$terrain['forest'])) $landscapeBonus += 0.30;
    }

    $attackerType = (string) ($attacker['unit_type_id'] ?? '');
    $unitBonus = 0.0;
    if ($row['unit_bonus'] === 'anti_mounted' && in_array($attackerType, ['knight', 'horseman'], true)) $unitBonus = 0.30;
    elseif ($row['unit_bonus'] === 'anti_siege' && in_array($attackerType, ['catapult', 'trebuchet'], true)) $unitBonus = 0.30;
    elseif ($row['unit_bonus'] === 'chariot_anti_catapult' && $attackerType === 'catapult') $unitBonus = 0.15;
    elseif ($row['unit_bonus'] === 'siege_vulnerable' && in_array($attackerType, ['catapult', 'trebuchet'], true)) $unitBonus = -0.15;

    $tile = $tiles[coordinateKey((int) $defender['i'], (int) $defender['j'])] ?? null;
    $modifiers = $tile ? json_decode((string) ($tile['modifiers_json'] ?? '{}'), true) : [];
    $hasFortification = is_array($modifiers) && !empty($modifiers['fortification']);
    $fortificationPercent = $hasFortification
        ? max(0.0, min(100.0, (float) ($modifiers['fortificationDefensePercent'] ?? 100.0))) : 0.0;
    $buildingBonus = $hasFortification
        ? SERVER_GAME_FORTIFICATION_DEFENSE_BONUS * $fortificationPercent / 100.0 : 0.0;
    if ($row['building_bonus'] === 'ranged') {
        if ($hasFortification) $buildingBonus += 0.30 * $fortificationPercent / 100.0;
        if ($defenderInCity) $buildingBonus += 0.30 * max(0.0, min(100.0, $cityDefensePercent)) / 100.0;
    }
    $stateBonus = ($defender['state'] ?? '') === 'fortified' ? SERVER_GAME_FORTIFIED_DEFENSE_BONUS : 0.0;
    return [
        'landscape_bonus' => $landscapeBonus,
        'unit_bonus' => $unitBonus,
        'building_bonus' => $buildingBonus,
        'state_bonus' => $stateBonus,
        'total_defense_bonus' => $landscapeBonus + $unitBonus + $buildingBonus + $stateBonus,
    ];
}

function serverUnitDefenseStrength(
    array $unit,
    array $attacker,
    array $tiles,
    bool $defenderInCity = false,
    float $cityDefensePercent = 100.0
): float
{
    $healthFactor = max(0.25, (float) $unit['health'] / max(1.0, (float) $unit['max_health']));
    $inputs = serverBattleChanceInputs($attacker, $unit, $tiles, $defenderInCity, $cityDefensePercent);
    return max(0.25, (float) $unit['defense_value']) * max(0.1, 1.0 + $inputs['total_defense_bonus'])
        * max(1.0, (float) $unit['experience']) * $healthFactor;
}

function serverCountsTowardTileUnitLimit(array $unit): bool
{
    return (int) ($unit['can_move'] ?? 0) === 1
        && (float) ($unit['health'] ?? 0) > 0
        && ($unit['deleted_at'] ?? null) === null;
}

function serverMovementCanAttackOccupants(array $moving, array $occupants): bool
{
    if (!serverIsMilitaryUnit($moving)) return false;
    foreach ($occupants as $occupant) {
        if ((float) ($occupant['health'] ?? 0) <= 0
            || (int) ($occupant['owner_id'] ?? 0) === (int) $moving['owner_id']) {
            continue;
        }
        if (serverCountsTowardTileUnitLimit($occupant) || serverIsCityUnit($occupant)) return true;
    }
    return false;
}

function serverMovementTargetsForeignDefender(array $units, int $movingUnitId, int $i, int $j): bool
{
    $moving = $units[$movingUnitId];
    $occupants = [];
    foreach ($units as $unitId => $unit) {
        if ($unitId === $movingUnitId || (float) ($unit['health'] ?? 0) <= 0
            || (int) $unit['i'] !== $i || (int) $unit['j'] !== $j) continue;
        $occupants[] = $unit;
    }
    return serverMovementCanAttackOccupants($moving, $occupants);
}

function serverMovableUnitCountAt(PDO $db, int $gameId, int $i, int $j): int
{
    $statement = $db->prepare(
        'SELECT COUNT(*) FROM server_game_units
         WHERE game_id = ? AND i = ? AND j = ? AND can_move = 1
           AND health > 0 AND deleted_at IS NULL'
    );
    $statement->execute([$gameId, $i, $j]);
    return (int) $statement->fetchColumn();
}

function serverCityPopulation(array $city): int
{
    $properties = json_decode((string) ($city['properties_json'] ?? '{}'), true);
    if (!is_array($properties)) $properties = [];
    if (isset($properties['cityPopulation']) && is_numeric($properties['cityPopulation'])) {
        return max(1, (int) $properties['cityPopulation']);
    }
    $citizens = $properties['economy']['citizens'] ?? null;
    return is_array($citizens) && count($citizens) > 0 ? count($citizens) : 1;
}

function serverSetCityPopulation(array &$city, int $population): int
{
    $population = max(1, $population);
    $properties = json_decode((string) ($city['properties_json'] ?? '{}'), true);
    if (!is_array($properties)) $properties = [];
    $properties['cityPopulation'] = $population;
    if (isset($properties['economy']['citizens']) && is_array($properties['economy']['citizens'])) {
        $properties['economy']['citizens'] = array_slice($properties['economy']['citizens'], 0, $population);
    }
    $city['properties_json'] = jsonObject($properties);
    return $population;
}

function serverSetCityFood(array &$city, float $food): float
{
    $food = max(0.0, min(1000000.0, $food));
    $properties = json_decode((string) ($city['properties_json'] ?? '{}'), true);
    if (!is_array($properties)) $properties = [];
    $properties['cityFoodStored'] = $food;
    $city['properties_json'] = jsonObject($properties);
    return $food;
}

function serverCityDefensePercent(array $city): float
{
    $properties = json_decode((string) ($city['properties_json'] ?? '{}'), true);
    if (!is_array($properties) || !isset($properties['cityDefensePercent'])
        || !is_numeric($properties['cityDefensePercent'])) return 100.0;
    return max(0.0, min(100.0, (float) $properties['cityDefensePercent']));
}

function serverSetCityDefensePercent(array &$city, float $percent): float
{
    $properties = json_decode((string) ($city['properties_json'] ?? '{}'), true);
    if (!is_array($properties)) $properties = [];
    $properties['cityDefensePercent'] = max(0.0, min(100.0, $percent));
    $city['properties_json'] = jsonObject($properties);
    return (float) $properties['cityDefensePercent'];
}

function serverCityOnTile(array &$units, int $i, int $j, ?int $ownerId = null): ?int
{
    foreach ($units as $unitId => $unit) {
        if ((float) $unit['health'] <= 0 || !serverIsCityUnit($unit)
            || (int) $unit['i'] !== $i || (int) $unit['j'] !== $j) {
            continue;
        }
        if ($ownerId === null || (int) $unit['owner_id'] === $ownerId) return (int) $unitId;
    }
    return null;
}

function serverDamageCityDefense(
    array &$units,
    int $cityId,
    array $attacker,
    int $i,
    int $j,
    array &$events,
    array $audiencePlayers
): ?array {
    $damage = (string) $attacker['unit_type_id'] === 'catapult' ? 1.0
        : ((string) $attacker['unit_type_id'] === 'trebuchet' ? 2.0 : 0.0);
    if ($damage <= 0 || !isset($units[$cityId])) return null;
    $before = serverCityDefensePercent($units[$cityId]);
    $after = serverSetCityDefensePercent($units[$cityId], $before - $damage);
    $message = 'City #' . $cityId . ' defense reduced to ' . number_format($after, 0) . '% by '
        . $attacker['unit_type_id'] . ' attack.';
    eventForPlayers(
        $events,
        array_merge($audiencePlayers, [(int) $attacker['owner_id'], (int) $units[$cityId]['owner_id']]),
        'city_defense_damaged',
        $units[$cityId],
        $attacker,
        $i,
        $j,
        $message,
        ['city_id' => $cityId, 'before' => $before, 'after' => $after, 'damage' => $damage]
    );
    return ['before' => $before, 'after' => $after, 'damage' => $damage];
}

function serverRepairCityDefenses(array &$units, array &$events): void
{
    foreach ($units as $cityId => &$city) {
        if (!serverIsCityUnit($city) || (float) $city['health'] <= 0) continue;
        $before = serverCityDefensePercent($city);
        if ($before >= 100.0) continue;
        $after = serverSetCityDefensePercent($city, $before + 2.0);
        $message = 'City #' . $cityId . ' defense repaired to ' . number_format($after, 0) . '%.';
        eventForPlayers(
            $events,
            [(int) $city['owner_id']],
            'city_defense_repaired',
            $city,
            null,
            (int) $city['i'],
            (int) $city['j'],
            $message,
            ['city_id' => (int) $cityId, 'before' => $before, 'after' => $after, 'repair' => $after - $before]
        );
    }
    unset($city);
}

function serverFortificationOwnerAt(array $units, int $i, int $j): ?int
{
    foreach ($units as $unit) {
        if ((float) ($unit['health'] ?? 0) > 0
            && (string) ($unit['unit_type_id'] ?? '') === 'building_fortification'
            && (int) $unit['i'] === $i && (int) $unit['j'] === $j) {
            return (int) $unit['owner_id'];
        }
    }
    return null;
}

function serverRepairFortificationDefenses(array &$tiles, array $units, int $revision, array &$events): void
{
    foreach ($tiles as &$tile) {
        $modifiers = json_decode((string) ($tile['modifiers_json'] ?? '{}'), true);
        if (!is_array($modifiers) || empty($modifiers['fortification'])) continue;
        $before = max(0.0, min(100.0, (float) ($modifiers['fortificationDefensePercent'] ?? 100.0)));
        if ($before >= 100.0) continue;
        $after = min(100.0, $before + 2.0);
        $modifiers['fortificationDefensePercent'] = $after;
        $tile['modifiers_json'] = jsonObject($modifiers);
        $tile['revision'] = $revision;
        $owner = serverFortificationOwnerAt($units, (int) $tile['i'], (int) $tile['j']);
        if ($owner !== null) {
            $message = 'Fortification at (' . $tile['i'] . ',' . $tile['j'] . ') repaired to '
                . number_format($after, 0) . '%.';
            eventForPlayers($events, [$owner], 'fortification_defense_repaired', null, null,
                (int) $tile['i'], (int) $tile['j'], $message,
                ['before' => $before, 'after' => $after, 'repair' => $after - $before]);
        }
    }
    unset($tile);
}

function serverDamageFortificationDefense(
    array &$tiles, array $units, array $attacker, int $i, int $j, int $revision, array &$events
): ?array {
    $damage = (string) $attacker['unit_type_id'] === 'catapult' ? 1.0
        : ((string) $attacker['unit_type_id'] === 'trebuchet' ? 2.0 : 0.0);
    $key = coordinateKey($i, $j);
    if ($damage <= 0 || !isset($tiles[$key])) return null;
    $modifiers = json_decode((string) ($tiles[$key]['modifiers_json'] ?? '{}'), true);
    if (!is_array($modifiers) || empty($modifiers['fortification'])) return null;
    $before = max(0.0, min(100.0, (float) ($modifiers['fortificationDefensePercent'] ?? 100.0)));
    $after = max(0.0, $before - $damage);
    $modifiers['fortificationDefensePercent'] = $after;
    $tiles[$key]['modifiers_json'] = jsonObject($modifiers);
    $tiles[$key]['revision'] = $revision;
    $owner = serverFortificationOwnerAt($units, $i, $j);
    $audience = array_values(array_unique(array_filter([(int) $attacker['owner_id'], $owner])));
    $message = 'Fortification at (' . $i . ',' . $j . ') defense reduced to '
        . number_format($after, 0) . '%.';
    eventForPlayers($events, $audience, 'fortification_defense_damaged', $attacker, null, $i, $j, $message,
        ['before' => $before, 'after' => $after, 'damage' => $damage]);
    return ['before' => $before, 'after' => $after, 'damage' => $damage];
}

function serverApplySiegeCollateral(
    array &$units, int $attackerId, int $primaryDefenderId, int $i, int $j,
    array $relations, array &$events, array &$statistics
): array {
    if (!isset($units[$attackerId])
        || !in_array((string) $units[$attackerId]['unit_type_id'], ['catapult', 'trebuchet'], true)) return [];
    $factor = max(0.0, min(1.0, (float) $units[$attackerId]['experience'] - 1.0));
    if ($factor <= 0.0) return [];
    $damaged = [];
    foreach ($units as $unitId => &$unit) {
        if ((int) $unitId === $attackerId || (int) $unitId === $primaryDefenderId
            || (float) $unit['health'] <= 0 || serverIsCityUnit($unit)
            || (int) ($unit['unit_class'] ?? -1) === 4
            || (int) $unit['i'] !== $i || (int) $unit['j'] !== $j
            || !serverPlayersAtWar($relations, (int) $units[$attackerId]['owner_id'], (int) $unit['owner_id'])) continue;
        $before = combatUnitSnapshot($unit);
        $damage = max(1.0, (float) $unit['max_health'] * 0.10 * $factor);
        $unit['health'] = max(0.0, (float) $unit['health'] - $damage);
        if ((float) $unit['health'] <= 0) {
            addCombatStatistic($statistics, (int) $units[$attackerId]['owner_id'], 'units_killed');
        }
        $message = $units[$attackerId]['unit_type_id'] . ' collateral damage hits '
            . $unit['unit_type_id'] . ' #' . $unitId . ' for ' . number_format($damage, 0) . '.';
        eventForPlayers($events, [(int) $units[$attackerId]['owner_id'], (int) $unit['owner_id']],
            'siege_collateral_damage', $units[$attackerId], $unit, $i, $j, $message, [
                'combat_kind' => 'collateral_damage',
                'attacker_after' => combatUnitSnapshot($units[$attackerId]),
                'defender_before' => $before,
                'defender_after' => combatUnitSnapshot($unit),
                'collateral_percent' => 10.0 * $factor,
            ]);
        $damaged[] = (int) $unitId;
    }
    unset($unit);
    return $damaged;
}

function serverHealFortificationUnits(array &$units, array $tiles, array &$events): void
{
    $fortOwners = [];
    foreach ($units as $unit) {
        if ((float) ($unit['health'] ?? 0) > 0
            && (string) ($unit['unit_type_id'] ?? '') === 'building_fortification') {
            $fortOwners[coordinateKey((int) $unit['i'], (int) $unit['j'])] = (int) $unit['owner_id'];
        }
    }
    foreach ($units as $unitId => &$unit) {
        if (!(int) ($unit['can_move'] ?? 0) || (float) $unit['health'] <= 0
            || (float) $unit['health'] >= (float) $unit['max_health']) continue;
        $key = coordinateKey((int) $unit['i'], (int) $unit['j']);
        if (($fortOwners[$key] ?? null) !== (int) $unit['owner_id']) continue;
        $tile = $tiles[$key] ?? null;
        $modifiers = $tile ? json_decode((string) ($tile['modifiers_json'] ?? '{}'), true) : [];
        if (!is_array($modifiers) || empty($modifiers['fortification'])) continue;
        $before = (float) $unit['health'];
        $unit['health'] = min((float) $unit['max_health'], $before + (float) $unit['max_health'] * 0.10);
        $message = $unit['name'] . ' #' . $unitId . ' healed in Fortification to '
            . number_format((float) $unit['health'], 0) . ' HP.';
        eventForPlayers($events, [(int) $unit['owner_id']], 'fortification_unit_healed', $unit, null,
            (int) $unit['i'], (int) $unit['j'], $message,
            ['before' => $before, 'after' => (float) $unit['health'], 'heal_percent' => 10]);
    }
    unset($unit);
}

function serverPersistTurnTileChanges(PDO $db, int $gameId, int $revision, array $tiles): void
{
    $update = $db->prepare(
        'UPDATE server_game_map SET terrain_tex = ?, modifiers_json = ?, revision = ? WHERE game_id = ? AND i = ? AND j = ?'
    );
    foreach ($tiles as $tile) {
        if ((int) ($tile['revision'] ?? 0) !== $revision) continue;
        $update->execute([
            (int) $tile['terrain_tex'], (string) $tile['modifiers_json'], $revision,
            $gameId, (int) $tile['i'], (int) $tile['j'],
        ]);
    }
}

function serverBestMilitaryDefenderOnTile(array &$units, int $i, int $j, int $ownerId, array $attacker, array $tiles): ?int
{
    $bestId = null;
    $bestStrength = -1.0;
    $cityId = serverCityOnTile($units, $i, $j, $ownerId);
    $cityDefensePercent = $cityId === null ? 100.0 : serverCityDefensePercent($units[$cityId]);
    foreach ($units as $unitId => $unit) {
        if (!serverIsMilitaryUnit($unit) || (int) $unit['owner_id'] !== $ownerId
            || (int) $unit['i'] !== $i || (int) $unit['j'] !== $j) {
            continue;
        }
        $strength = serverUnitDefenseStrength(
            $unit,
            $attacker,
            $tiles,
            $cityId !== null,
            $cityDefensePercent
        );
        if ($strength > $bestStrength) {
            $bestId = (int) $unitId;
            $bestStrength = $strength;
        }
    }
    return $bestId;
}

function serverRemainingHostileDefenders(
    array &$units,
    int $attackerId,
    int $i,
    int $j,
    array $relations
): array
{
    $result = [];
    $attackerOwner = (int) $units[$attackerId]['owner_id'];
    foreach ($units as $unitId => $unit) {
        if ((int) $unitId === $attackerId || (float) $unit['health'] <= 0
            || serverIsCityUnit($unit) || (int) ($unit['unit_class'] ?? -1) === 4
            || (int) $unit['i'] !== $i || (int) $unit['j'] !== $j
            || !serverPlayersAtWar($relations, $attackerOwner, (int) $unit['owner_id'])) {
            continue;
        }
        $result[] = (int) $unitId;
    }
    return $result;
}

function serverRetreatAttacker(
    array &$attacker,
    ?array $from,
    int $combatI,
    int $combatJ,
    array &$events,
    array $remainingDefenderIds
): bool
{
    if ($from === null || !isset($from['i'], $from['j'])) return false;
    $attacker['i'] = (int) $from['i'];
    $attacker['j'] = (int) $from['j'];
    foreach ($events as &$event) {
        if ((int) ($event['unit_id'] ?? 0) !== (int) $attacker['id']
            || (int) ($event['i'] ?? -1) !== $combatI || (int) ($event['j'] ?? -1) !== $combatJ) {
            continue;
        }
        $event['payload']['attacker_after'] = combatUnitSnapshot($attacker);
        $event['payload']['attacker_retreated_to'] = ['i' => (int) $attacker['i'], 'j' => (int) $attacker['j']];
        $event['payload']['remaining_defender_ids'] = $remainingDefenderIds;
    }
    unset($event);
    serverTrace('attacker_retreated', [
        'attacker_id' => (int) $attacker['id'],
        'from_combat' => ['i' => $combatI, 'j' => $combatJ],
        'to' => ['i' => (int) $attacker['i'], 'j' => (int) $attacker['j']],
        'remaining_defender_ids' => $remainingDefenderIds,
    ]);
    return true;
}

function serverReduceCityPopulationForKilledUnit(array &$units, array $killed, int $i, int $j): ?array
{
    if (!serverIsMilitaryUnit($killed) && (int) ($killed['unit_class'] ?? -1) !== 2) return null;
    $cityId = serverCityOnTile($units, $i, $j, (int) $killed['owner_id']);
    if ($cityId === null) return null;
    $before = serverCityPopulation($units[$cityId]);
    $after = serverSetCityPopulation($units[$cityId], $before - 1);
    return ['city_id' => $cityId, 'before' => $before, 'after' => $after];
}

function serverEliminateCivilian(
    array &$attacker,
    array &$civilian,
    int $i,
    int $j,
    array &$events,
    string $eventType,
    array $audiencePlayers,
    array &$statistics
): void
{
    if ((float) $civilian['health'] <= 0 || serverIsCityUnit($civilian) || serverIsMilitaryUnit($civilian)) return;
    $attackerBefore = combatUnitSnapshot($attacker);
    $civilianBefore = combatUnitSnapshot($civilian);
    $civilian['health'] = 0.0;
    $attacker['experience'] = round((float) $attacker['experience'] + 0.75, 2);
    addCombatStatistic($statistics, (int) $attacker['owner_id'], 'units_killed');
    $message = 'U' . $attacker['owner_id'] . ' ' . $attacker['unit_type_id'] . ' eliminates U'
        . $civilian['owner_id'] . ' ' . $civilian['unit_type_id'] . ' at (' . $i . ',' . $j . ')';
    eventForPlayers(
        $events,
        array_merge($audiencePlayers, [(int) $attacker['owner_id'], (int) $civilian['owner_id']]),
        $eventType,
        $attacker,
        $civilian,
        $i,
        $j,
        $message,
        [
            'combat_kind' => 'unit_attack',
            'resolution_type' => $eventType,
            'attacker_damage' => 0,
            'defender_damage' => (float) $civilianBefore['health'],
            'attacker_before' => $attackerBefore,
            'defender_before' => $civilianBefore,
            'attacker_after' => combatUnitSnapshot($attacker),
            'defender_after' => combatUnitSnapshot($civilian),
            'destroyed_unit_ids' => [(int) $civilian['id']],
        ]
    );
}

function serverCaptureCity(
    array &$attacker,
    array &$city,
    int $i,
    int $j,
    array &$events,
    string $eventType,
    array $audiencePlayers,
    array &$statistics
): void
{
    $oldOwner = (int) $city['owner_id'];
    $newOwner = (int) $attacker['owner_id'];
    if ($oldOwner === $newOwner) return;
    $cityBefore = combatUnitSnapshot($city);
    $city['owner_id'] = $newOwner;
    $city['health'] = (float) $city['max_health'];
    addCombatStatistic($statistics, $newOwner, 'cities_occupied');
    $message = 'U' . $newOwner . ' ' . $attacker['unit_type_id'] . ' captures U' . $oldOwner
        . ' City at (' . $i . ',' . $j . ')';
    eventForPlayers(
        $events,
        array_merge($audiencePlayers, [$newOwner, $oldOwner]),
        'city_captured',
        $attacker,
        $city,
        $i,
        $j,
        $message,
        [
            'combat_kind' => 'city_capture',
            'resolution_type' => $eventType,
            'attacker_damage' => 0,
            'defender_damage' => 0,
            'attacker_before' => combatUnitSnapshot($attacker),
            'defender_before' => $cityBefore,
            'attacker_after' => combatUnitSnapshot($attacker),
            'defender_after' => combatUnitSnapshot($city),
            'destroyed_unit_ids' => [],
            'old_owner_id' => $oldOwner,
            'new_owner_id' => $newOwner,
            'population' => serverCityPopulation($city),
        ]
    );
}

function serverResolveTileInteraction(
    array &$units,
    int $attackerId,
    int $candidateDefenderId,
    int $turn,
    int $i,
    int $j,
    array &$events,
    string $eventType,
    array $audiencePlayers,
    array &$statistics,
    array &$engagedPairs,
    array $relations,
    array &$tiles,
    int $revision,
    ?array $attackerFrom = null
): bool
{
    if (!isset($units[$attackerId], $units[$candidateDefenderId])) return false;
    if (!serverIsMilitaryUnit($units[$attackerId]) && serverIsMilitaryUnit($units[$candidateDefenderId])) {
        [$attackerId, $candidateDefenderId] = [$candidateDefenderId, $attackerId];
        $attackerFrom = null;
    }
    if (!serverIsMilitaryUnit($units[$attackerId])
        || !serverPlayersAtWar(
            $relations,
            (int) $units[$attackerId]['owner_id'],
            (int) $units[$candidateDefenderId]['owner_id']
        )) {
        return false;
    }

    $attackerOwner = (int) $units[$attackerId]['owner_id'];
    foreach ($units as $otherId => $other) {
        if ((int) $otherId !== $attackerId && (float) $other['health'] > 0
            && serverPlayersAtWar($relations, $attackerOwner, (int) $other['owner_id'])
            && (int) $other['i'] === $i && (int) $other['j'] === $j) {
            $engagedPairs[combatPairKey($attackerId, (int) $otherId)] = true;
        }
    }
    $enemyCityId = null;
    foreach ($units as $unitId => $unit) {
        if ((float) $unit['health'] > 0 && serverIsCityUnit($unit)
            && serverPlayersAtWar($relations, $attackerOwner, (int) $unit['owner_id'])
            && (int) $unit['i'] === $i && (int) $unit['j'] === $j) {
            $enemyCityId = (int) $unitId;
            break;
        }
    }

    $defenderId = $candidateDefenderId;
    if ($enemyCityId !== null) {
        $cityOwner = (int) $units[$enemyCityId]['owner_id'];
        $garrisonId = serverBestMilitaryDefenderOnTile($units, $i, $j, $cityOwner, $units[$attackerId], $tiles);
        if ($garrisonId !== null) $defenderId = $garrisonId;
        else $defenderId = $enemyCityId;
    }
    elseif (!serverIsMilitaryUnit($units[$defenderId])) {
        foreach ($units as $unitId => $unit) {
            if (serverPlayersAtWar($relations, $attackerOwner, (int) $unit['owner_id']) && serverIsMilitaryUnit($unit)
                && (int) $unit['i'] === $i && (int) $unit['j'] === $j) {
                $defenderId = (int) $unitId;
                break;
            }
        }
    }

    $engagedPairs[combatPairKey($attackerId, $candidateDefenderId)] = true;
    $engagedPairs[combatPairKey($attackerId, $defenderId)] = true;
    if (serverIsMilitaryUnit($units[$defenderId])) {
        $cityDefensePercent = $enemyCityId === null
            ? 100.0 : serverCityDefensePercent($units[$enemyCityId]);
        $combat = serverCombat(
            $units[$attackerId], $units[$defenderId], $turn, $i, $j, $events,
            $eventType, $audiencePlayers, $statistics, $tiles, $enemyCityId !== null,
            $cityDefensePercent
        );
        if ($enemyCityId !== null) {
            serverDamageCityDefense(
                $units, $enemyCityId, $units[$attackerId], $i, $j, $events, $audiencePlayers
            );
        }
        serverDamageFortificationDefense(
            $tiles, $units, $units[$attackerId], $i, $j, $revision, $events
        );
        serverApplySiegeCollateral(
            $units, $attackerId, $defenderId, $i, $j, $relations, $events, $statistics
        );
        if ($combat['defender_dead']) {
            $population = serverReduceCityPopulationForKilledUnit($units, $units[$defenderId], $i, $j);
            if ($population !== null) {
                serverTrace('city_population_reduced', $population + ['killed_unit_id' => $defenderId]);
            }
        }
        if ($combat['attacker_dead']) return true;
        if (!$combat['defender_dead']) {
            serverRetreatAttacker($units[$attackerId], $attackerFrom, $i, $j, $events, [$defenderId]);
            return true;
        }
        $remainingDefenderIds = serverRemainingHostileDefenders(
            $units, $attackerId, $i, $j, $relations
        );
        if ($remainingDefenderIds) {
            serverRetreatAttacker(
                $units[$attackerId], $attackerFrom, $i, $j, $events, $remainingDefenderIds
            );
            return true;
        }
    }

    if ($enemyCityId !== null && (float) $units[$attackerId]['health'] > 0) {
        $cityOwner = (int) $units[$enemyCityId]['owner_id'];
        $civilianDefenderId = null;
        foreach ($units as $unitId => &$unit) {
            if ((int) $unit['owner_id'] === $cityOwner && (int) $unit['i'] === $i && (int) $unit['j'] === $j
                && !serverIsCityUnit($unit) && !serverIsMilitaryUnit($unit) && (float) $unit['health'] > 0) {
                $civilianDefenderId = (int) $unitId;
                break;
            }
        }
        unset($unit);
        if ($civilianDefenderId !== null) {
            serverEliminateCivilian(
                $units[$attackerId], $units[$civilianDefenderId], $i, $j,
                $events, $eventType, $audiencePlayers, $statistics
            );
            $engagedPairs[combatPairKey($attackerId, $civilianDefenderId)] = true;
            $remainingDefenderIds = serverRemainingHostileDefenders(
                $units, $attackerId, $i, $j, $relations
            );
            if ($remainingDefenderIds) {
                serverRetreatAttacker(
                    $units[$attackerId], $attackerFrom, $i, $j, $events, $remainingDefenderIds
                );
                return true;
            }
        }
        serverCaptureCity(
            $units[$attackerId], $units[$enemyCityId], $i, $j, $events,
            $eventType, $audiencePlayers, $statistics
        );
        return true;
    }

    if (!serverIsCityUnit($units[$defenderId]) && !serverIsMilitaryUnit($units[$defenderId])
        && (float) $units[$defenderId]['health'] > 0) {
        serverEliminateCivilian(
            $units[$attackerId], $units[$defenderId], $i, $j, $events,
            $eventType, $audiencePlayers, $statistics
        );
        $remainingDefenderIds = serverRemainingHostileDefenders(
            $units, $attackerId, $i, $j, $relations
        );
        if ($remainingDefenderIds) {
            serverRetreatAttacker(
                $units[$attackerId], $attackerFrom, $i, $j, $events, $remainingDefenderIds
            );
        }
    }
    return true;
}

function combatAudienceMap(PDO $db, int $gameId): array
{
    $statement = $db->prepare(
        'SELECT player_id, i, j FROM server_game_visibility
         WHERE game_id = ? AND visibility_level = 2 ORDER BY player_id'
    );
    $statement->execute([$gameId]);
    $result = [];
    foreach ($statement->fetchAll() as $row) {
        $result[coordinateKey((int) $row['i'], (int) $row['j'])][] = (int) $row['player_id'];
    }
    return $result;
}

function samePoint(array $a, array $b): bool
{
    return (int) $a['i'] === (int) $b['i'] && (int) $a['j'] === (int) $b['j'];
}

function serverAttackOriginForPoint(array $plans, int $unitId, int $i, int $j): ?array
{
    if (!isset($plans[$unitId]['trajectory']) || !is_array($plans[$unitId]['trajectory'])) return null;
    $trajectory = $plans[$unitId]['trajectory'];
    for ($n = count($trajectory) - 1; $n > 0; --$n) {
        if ((int) $trajectory[$n]['i'] === $i && (int) $trajectory[$n]['j'] === $j) {
            return ['i' => (int) $trajectory[$n - 1]['i'], 'j' => (int) $trajectory[$n - 1]['j']];
        }
    }
    return null;
}

function combatPairKey(int $firstId, int $secondId): string
{
    return min($firstId, $secondId) . ':' . max($firstId, $secondId);
}

function serverAddChopProduction(
    PDO $db, int $gameId, array &$units, array $worker, int $revision, float $production = 10.0
): ?int {
    $cityId = serverNearestOwnedCityId(
        $units, (int) $worker['owner_id'], (int) $worker['i'], (int) $worker['j']
    );
    if ($cityId === null || !isset($units[$cityId])) return null;
    $statement = $db->prepare(
        'UPDATE productions SET production_points = production_points + ? WHERE game_id = ? AND city_unit_id = ?'
    );
    $statement->execute([$production, $gameId, $cityId]);
    if ($statement->rowCount() === 0) {
        // A City without an active task has no production account to credit.
        $production = 0.0;
    }
    serverTrace('forest_chop_production', [
        'worker_id' => (int) $worker['id'], 'city_id' => $cityId,
        'production' => $production, 'revision' => $revision,
    ]);
    return $cityId;
}

function applyBuildOrder(
    PDO $db, int $gameId, array &$unit, array $payload, array &$tiles,
    int $revision, array &$events, array &$units
): bool
{
    if ($unit['unit_type_id'] !== 'worker') {
        return false;
    }
    $modifier = isset($payload['modifier']) ? strtolower((string) $payload['modifier']) : '';
    // Persistent improvements use the immediate transactional build request.
    $allowed = ['chop_forest'];
    if (!in_array($modifier, $allowed, true)) {
        return false;
    }
    $key = coordinateKey((int) $unit['i'], (int) $unit['j']);
    if (!isset($tiles[$key])) {
        return false;
    }
    $splitKeys = $modifier === 'chop_forest'
        ? serverSplitSupertileAt($tiles, (int) $unit['i'], (int) $unit['j']) : [];
    $tile = &$tiles[$key];
    $terrainType = ((int) $tile['terrain_tex']) & 0x0F;
    if ($modifier === 'road' && $terrainType === 0) return false;
    if ($modifier === 'irrigation' && !in_array($terrainType, [1, 2, 7], true)) return false;
    if ($modifier === 'mine' && $terrainType !== 4 && $terrainType !== 5) return false;
    if ($modifier === 'fishing_boats' && $terrainType !== 0) return false;
    if ($modifier === 'chop_forest' && !serverIsChoppableForestTerrain((int) $tile['terrain_tex'])) {
        // A retry from stale client state must release the Worker instead of
        // persisting an impossible chopping order forever.
        $unit['state'] = 'ready';
        $properties = json_decode((string) ($unit['properties_json'] ?? '{}'), true);
        if (!is_array($properties)) $properties = [];
        unset($properties['clientImprovementTurnsLeft'], $properties['clientImprovementState']);
        $unit['properties_json'] = jsonObject($properties);
        return false;
    }

    $modifiers = json_decode((string) ($tile['modifiers_json'] ?? '{}'), true);
    if (!is_array($modifiers)) $modifiers = [];
    if ($modifier === 'chop_forest' && !empty($modifiers['fortification'])) {
        $unit['state'] = 'ready';
        $properties = json_decode((string) ($unit['properties_json'] ?? '{}'), true);
        if (!is_array($properties)) $properties = [];
        unset($properties['clientImprovementTurnsLeft'], $properties['clientImprovementState']);
        $unit['properties_json'] = jsonObject($properties);
        return false;
    }
    if ($modifier === 'chop_forest') {
        $tile['terrain_tex'] = serverChoppedForestTerrain((int) $tile['terrain_tex']);
        $chopCityId = serverAddChopProduction($db, $gameId, $units, $unit, $revision, 10.0);
    } else {
        $modifiers[$modifier] = true;
        if ($modifier === 'fortification') $modifiers['fortificationDefensePercent'] = 100.0;
    }
    $tile['modifiers_json'] = jsonObject($modifiers);
    $changedKeys = array_fill_keys($splitKeys, true);
    $changedKeys[$key] = true;
    $statement = $db->prepare(
        'UPDATE server_game_map SET terrain_tex = ?, modifiers_json = ?, revision = ? WHERE game_id = ? AND i = ? AND j = ?'
    );
    foreach (array_keys($changedKeys) as $changedKey) {
        $tiles[$changedKey]['revision'] = $revision;
        $statement->execute([
            $tiles[$changedKey]['terrain_tex'], $tiles[$changedKey]['modifiers_json'], $revision,
            $gameId, $tiles[$changedKey]['i'], $tiles[$changedKey]['j'],
        ]);
    }
    $unit['state'] = 'ready';
    $properties = json_decode((string) ($unit['properties_json'] ?? '{}'), true);
    if (!is_array($properties)) $properties = [];
    unset($properties['clientImprovementTurnsLeft'], $properties['clientImprovementState']);
    $unit['properties_json'] = jsonObject($properties);
    eventForPlayers($events, [(int) $unit['owner_id']], 'landscape_changed', $unit, null, (int) $unit['i'], (int) $unit['j'],
        'Worker completed ' . $modifier . ' at (' . $unit['i'] . ',' . $unit['j'] . ')', [
            'modifier' => $modifier,
            'production_bonus' => $modifier === 'chop_forest' ? 10 : 0,
            'city_id' => $chopCityId ?? null,
        ]);
    return true;
}

function immediateBuildingDefinitions(): array
{
    return [
        'road' => 850, 'irrigation' => 851, 'pasture' => 852, 'fortification' => 853,
        'cottage' => 854, 'workshop' => 855, 'mine' => 856, 'farm' => 857,
        'plantation' => 858, 'camp' => 859, 'fishing_boats' => 866, 'quarry' => 867,
        'winery' => 868, 'network' => 872,
    ];
}

function primaryTerrainImprovementNames(): array
{
    return array_values(array_filter(
        array_keys(immediateBuildingDefinitions()), static fn(string $name): bool => $name !== 'road'
    ));
}

function serverReplacePrimaryImprovement(
    PDO $db, int $gameId, int $i, int $j, string $replacement, int $revision, array &$modifiers
): array {
    $replaced = [];
    foreach (primaryTerrainImprovementNames() as $name) {
        if ($name === $replacement || empty($modifiers[$name])) continue;
        unset($modifiers[$name]);
        $replaced[] = $name;
    }
    unset($modifiers['cottageAge'], $modifiers['cottageStage']);
    $modifiers['irrigationCityFood'] = false;
    if (!$replaced) return [];
    $types = array_map(static fn(string $name): string => 'building_' . $name, $replaced);
    $placeholders = implode(',', array_fill(0, count($types), '?'));
    $statement = $db->prepare(
        "UPDATE server_game_units SET occupancy_key = NULL, health = 0, revision = ?, deleted_at = UTC_TIMESTAMP()
         WHERE game_id = ? AND i = ? AND j = ? AND unit_class = 4
           AND deleted_at IS NULL AND unit_type_id IN ($placeholders)"
    );
    $statement->execute(array_merge([$revision, $gameId, $i, $j], $types));
    return $replaced;
}

function immediateBuild(PDO $db, array $game, int $playerId, int $workerId, string $modifier): array
{
    $definitions = immediateBuildingDefinitions();
    if (!isset($definitions[$modifier])) {
        serverError(422, 'invalid_building_type', 'building_type is not a supported building or improvement.');
    }

    $db->beginTransaction();
    try {
        $game = loadGame($db, (string) $game['game_key'], true);
        $statement = $db->prepare(
            'SELECT * FROM server_game_units
             WHERE game_id = ? AND id = ? AND owner_id = ? AND deleted_at IS NULL FOR UPDATE'
        );
        $statement->execute([(int) $game['id'], $workerId, $playerId]);
        $worker = $statement->fetch();
        $requiredUnitType = $modifier === 'network' ? 'workboat' : 'worker';
        if (!$worker || $worker['unit_type_id'] !== $requiredUnitType) {
            $db->rollBack();
            serverError(404, 'worker_not_found', 'The requested active ' . ucfirst($requiredUnitType) . ' does not belong to this player.');
        }

        $i = (int) $worker['i'];
        $j = (int) $worker['j'];
        $statement = $db->prepare('SELECT * FROM server_game_map WHERE game_id = ? AND i = ? AND j = ? FOR UPDATE');
        $statement->execute([(int) $game['id'], $i, $j]);
        $tile = $statement->fetch();
        if (!$tile) {
            $db->rollBack();
            serverError(404, 'tile_not_found', 'The Worker tile does not exist.');
        }

        $modifiers = json_decode((string) ($tile['modifiers_json'] ?? '{}'), true);
        if (!is_array($modifiers)) $modifiers = [];
        if ($requiredUnitType === 'worker' && $modifier !== 'road'
            && $modifier !== 'fortification' && !empty($modifiers['fortification'])) {
            $db->rollBack();
            serverError(409, 'fortification_protected',
                'Workers cannot replace or destroy an existing Fortification.', [
                    'worker_unit_id' => $workerId, 'i' => $i, 'j' => $j,
                    'building_type' => $modifier,
                ]);
        }
        $existingModifier = !empty($modifiers[$modifier]) ? $modifier : null;
        // A road is infrastructure and may coexist with one primary terrain
        // improvement. Primary improvements remain mutually exclusive.
        if ($existingModifier !== null) {
            $revision = (int) $game['revision'] + 1;
            $workerProperties = json_decode((string) ($worker['properties_json'] ?? '{}'), true);
            if (!is_array($workerProperties)) $workerProperties = [];
            foreach (['road_turns_left', 'irrigation_turns_left', 'building_turns_left',
                'clientImprovementTurnsLeft', 'clientImprovementState'] as $property) {
                unset($workerProperties[$property]);
            }
            $statement = $db->prepare(
                "UPDATE server_game_units SET state = 'ready', properties_json = ?, revision = ? WHERE id = ?"
            );
            $statement->execute([jsonObject($workerProperties), $revision, $workerId]);
            $statement = $db->prepare('UPDATE server_games SET revision = ? WHERE id = ?');
            $statement->execute([$revision, (int) $game['id']]);
            $statement = $db->prepare(
                'SELECT * FROM server_game_units
                 WHERE game_id = ? AND unit_class = 4 AND unit_type_id = ?
                   AND i = ? AND j = ? AND deleted_at IS NULL LIMIT 1'
            );
            $statement->execute([(int) $game['id'], 'building_' . $existingModifier, $i, $j]);
            $building = $statement->fetch();
            $db->commit();
            return [
                'status' => 'ALREADY_BUILT', 'already_built' => true, 'revision' => $revision,
                'building' => $building ? publicUnit($building) : null,
                'tile' => [
                    'i' => $i, 'j' => $j, 'terrain_tex' => (int) $tile['terrain_tex'],
                    'terrain_bits' => (int) $tile['terrain_bits'], 'resource_type' => (int) $tile['resource_type'],
                    'modifiers' => $modifiers, 'revision' => $revision,
                ],
            ];
        }

        $terrainType = ((int) $tile['terrain_tex']) & 0x0f;
        $terrainDepth = (((int) $tile['terrain_tex']) >> 4) & 0x03;
        // Hidden resources must not reject an otherwise legal generic
        // improvement. The browser cannot select the resource-specific
        // improvement until this player has discovered the resource either.
        $resourceVisible = serverPlayerCanSeeTileResource(
            $db, (int) $game['id'], $playerId, $i, $j
        );
        $visibleResourceType = $resourceVisible ? (int) ($tile['resource_type'] ?? 0) : 0;
        $resourceName = serverResourceNamesById()[$visibleResourceType] ?? null;
        $requiredImprovement = $resourceName === null
            ? null : (serverResourceImprovementRequirements()[$resourceName] ?? null);
        $validationTile = $tile;
        $validationTile['resource_type'] = $visibleResourceType;
        $waterOnlyImprovement = in_array($modifier, ['fishing_boats', 'network'], true);
        $validTerrain = !(!$waterOnlyImprovement && $terrainType === 0)
            && !($modifier === 'irrigation' && !in_array($terrainType, [1, 2, 7], true))
            && !($modifier === 'farm' && !in_array($terrainType, [2, 7], true))
            && !($modifier === 'mine' && $terrainType !== 4 && $terrainType !== 5
                && !($terrainType === 1 && $visibleResourceType > 0 && $requiredImprovement === 'mine'))
            && !($modifier === 'fishing_boats' && $terrainType !== 0)
            && !($modifier === 'network' && ($terrainType !== 0 || $terrainDepth > 1))
            && serverImprovementMatchesTileResource($validationTile, $modifier);
        if (($modifier === 'farm' || $modifier === 'cottage') && empty($modifiers['irrigation'])) {
            $validTerrain = false;
        }
        if (!$validTerrain) {
            $db->rollBack();
            serverError(422, 'building_not_supported', $modifier . ' cannot be built on this terrain.', [
                'worker_unit_id' => $workerId,
                'i' => $i,
                'j' => $j,
                'terrain_type' => $terrainType,
                'terrain_tex' => (int) $tile['terrain_tex'],
                'resource_type' => $visibleResourceType,
                'resource_visible' => $resourceVisible,
                'resource_name' => $resourceName,
                'required_improvement' => $requiredImprovement,
            ]);
        }
        if ($modifier === 'irrigation') {
            $allTiles = loadTiles($db, (int) $game['id']);
            if (!serverIrrigationConnectedToWater($allTiles, $i, $j)) {
                $db->rollBack();
                return [
                    'status' => 'IMPOSSIBLE', 'already_built' => false,
                    'reason' => 'water_not_connected', 'revision' => (int) $game['revision'],
                    'building' => null,
                    'tile' => [
                        'i' => $i, 'j' => $j, 'terrain_tex' => (int) $tile['terrain_tex'],
                        'terrain_bits' => (int) $tile['terrain_bits'],
                        'resource_type' => (int) $tile['resource_type'],
                        'modifiers' => $modifiers, 'revision' => (int) $tile['revision'],
                    ],
                ];
            }
        }

        $revision = (int) $game['revision'] + 1;
        serverRemoveDestroyedCityAt($db, (int) $game['id'], $i, $j, $revision);
        $replacedModifiers = $modifier === 'road' ? [] : serverReplacePrimaryImprovement(
            $db, (int) $game['id'], $i, $j, $modifier, $revision, $modifiers
        );
        $occupancyKey = 'tile:' . $i . ':' . $j . ($modifier === 'road' ? ':road' : ':improvement');
        $statement = $db->prepare(
            'SELECT * FROM server_game_units WHERE game_id = ? AND owner_id = ? AND unit_class = 3
             AND deleted_at IS NULL AND health > 0 ORDER BY id'
        );
        $statement->execute([(int) $game['id'], $playerId]);
        $parentCityId = serverNearestOwnedCityId($statement->fetchAll(), $playerId, $i, $j);
        $properties = [
            'economicClass' => 'terrain_improvement',
            'improvementType' => $modifier,
            'economicId' => 'terrain_' . $modifier . '_' . $i . '_' . $j,
            'hiddenOnMap' => true,
            'noControlZone' => true,
            'noFogReveal' => true,
            'maintenanceCost' => 1,
            'parentCityId' => $parentCityId,
        ];
        $statement = $db->prepare(
            'INSERT INTO server_game_units
             (game_id, client_key, occupancy_key, owner_id, unit_type_id, unit_class, name, texture, can_move,
              nature, i, j, attack_value, defense_value, speed, view_range, state, health, max_health,
              experience, move_penalty, properties_json, revision)
             VALUES (?, NULL, ?, ?, ?, 4, ?, ?, 0, ?, ?, ?, 0, 0, 0, 0, ?, 100, 100, 1, 0, ?, ?)'
        );
        $statement->execute([
            (int) $game['id'], $occupancyKey, $playerId, 'building_' . $modifier,
            ucwords(str_replace('_', ' ', $modifier)), $definitions[$modifier], $worker['nature'], $i, $j,
            'ready', jsonObject($properties), $revision,
        ]);
        $buildingId = (int) $db->lastInsertId();

        $modifiers[$modifier] = true;
        if ($modifier === 'cottage') $modifiers['cottageAge'] = 0;
        if ($modifier === 'fortification') $modifiers['fortificationDefensePercent'] = 100.0;
        $statement = $db->prepare(
            'UPDATE server_game_map SET modifiers_json = ?, revision = ? WHERE game_id = ? AND i = ? AND j = ?'
        );
        $statement->execute([jsonObject($modifiers), $revision, (int) $game['id'], $i, $j]);

        $workerProperties = json_decode((string) ($worker['properties_json'] ?? '{}'), true);
        if (!is_array($workerProperties)) $workerProperties = [];
        foreach (['road_turns_left', 'irrigation_turns_left', 'building_turns_left',
            'clientImprovementTurnsLeft', 'clientImprovementState'] as $property) {
            unset($workerProperties[$property]);
        }
        $statement = $db->prepare(
            "UPDATE server_game_units SET state = 'ready', properties_json = ?, revision = ? WHERE id = ?"
        );
        $statement->execute([jsonObject($workerProperties), $revision, $workerId]);
        $statement = $db->prepare('UPDATE server_games SET revision = ? WHERE id = ?');
        $statement->execute([$revision, (int) $game['id']]);

        $statement = $db->prepare('SELECT * FROM server_game_units WHERE id = ?');
        $statement->execute([$buildingId]);
        $building = $statement->fetch();
        $db->commit();
        return [
            'status' => 'BUILT', 'already_built' => false,
            'revision' => $revision,
            'replaced_improvements' => $replacedModifiers,
            'building' => publicUnit($building),
            'tile' => [
                'i' => $i, 'j' => $j, 'terrain_tex' => (int) $tile['terrain_tex'],
                'terrain_bits' => (int) $tile['terrain_bits'], 'resource_type' => (int) $tile['resource_type'],
                'modifiers' => $modifiers, 'revision' => $revision,
            ],
        ];
    } catch (PDOException $error) {
        if ($db->inTransaction()) $db->rollBack();
        if ((string) $error->getCode() === '23000') {
            serverError(409, 'tile_already_built', 'This tile already contains a building or improvement.');
        }
        throw $error;
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

function setUnitAutomationMode(
    PDO $db, array $game, int $playerId, int $unitId, ?string $automationMode
): array {
    $db->beginTransaction();
    try {
        $game = loadGame($db, (string) $game['game_key'], true);
        $statement = $db->prepare(
            'SELECT * FROM server_game_units
             WHERE game_id = ? AND id = ? AND owner_id = ?
               AND can_move = 1 AND deleted_at IS NULL AND health > 0 FOR UPDATE'
        );
        $statement->execute([(int) $game['id'], $unitId, $playerId]);
        $unit = $statement->fetch();
        if (!$unit) {
            $db->rollBack();
            serverError(404, 'unit_not_found', 'The requested active movable unit does not belong to this player.');
        }
        $unitType = (string) $unit['unit_type_id'];
        $unitClass = (int) $unit['unit_class'];
        $allowed = $unitType === 'worker' ? ['automate', 'road_to']
            : ($unitType === 'workboat' ? ['automate']
                : ($unitType === 'explorer' ? ['explore']
                    : ($unitClass === 2 ? ['patrol'] : [])));
        if ($automationMode !== null && !in_array($automationMode, $allowed, true)) {
            $db->rollBack();
            serverError(422, 'invalid_automation_mode', 'This automation mode is not supported by the unit type.');
        }
        $properties = json_decode((string) ($unit['properties_json'] ?? '{}'), true);
        if (!is_array($properties)) $properties = [];
        if ($automationMode === null) unset($properties['automationMode']);
        else $properties['automationMode'] = $automationMode;
        $revision = (int) $game['revision'] + 1;
        $statement = $db->prepare(
            'UPDATE server_game_units SET properties_json = ?, revision = ? WHERE id = ?'
        );
        $statement->execute([jsonObject($properties), $revision, $unitId]);
        $db->prepare('UPDATE server_games SET revision = ? WHERE id = ?')
            ->execute([$revision, (int) $game['id']]);
        $unit = loadPublicServerUnit($db, $unitId);
        $db->commit();
        serverTrace('worker_automation_mode_changed', [
            'player_id' => $playerId, 'unit_id' => $unitId, 'unit_type_id' => $unitType,
            'automation_mode' => $automationMode, 'revision' => $revision,
        ]);
        return ['revision' => $revision, 'unit' => $unit, 'worker' => $unit,
            'automation_mode' => $automationMode];
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

function repairWorkerAutomationModes(PDO $db, array $game, array $unitIds): array
{
    $unitIds = array_values(array_unique(array_filter(array_map('intval', array_slice($unitIds, 0, 100)),
        static fn(int $id): bool => $id > 0)));
    if (!$unitIds) return [];
    $db->beginTransaction();
    try {
        $game = loadGame($db, (string) $game['game_key'], true);
        $revision = (int) $game['revision'] + 1;
        $select = $db->prepare(
            "SELECT id, properties_json FROM server_game_units
             WHERE game_id = ? AND id = ? AND unit_type_id = 'worker'
               AND deleted_at IS NULL AND health > 0 FOR UPDATE"
        );
        $update = $db->prepare('UPDATE server_game_units SET properties_json = ?, revision = ? WHERE id = ?');
        $repaired = [];
        foreach ($unitIds as $unitId) {
            $select->execute([(int) $game['id'], $unitId]);
            $worker = $select->fetch();
            if (!$worker) continue;
            $properties = json_decode((string) ($worker['properties_json'] ?? '{}'), true);
            if (!is_array($properties)) $properties = [];
            $properties['automationMode'] = 'automate';
            $update->execute([jsonObject($properties), $revision, $unitId]);
            $repaired[] = $unitId;
        }
        if ($repaired) {
            $db->prepare('UPDATE server_games SET revision = ? WHERE id = ?')
                ->execute([$revision, (int) $game['id']]);
        }
        $db->commit();
        return $repaired;
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

function disbandUnit(PDO $db, array $game, int $playerId, int $unitId): array
{
    $db->beginTransaction();
    try {
        $game = loadGame($db, (string) $game['game_key'], true);
        $gameId = (int) $game['id'];
        $statement = $db->prepare(
            'SELECT * FROM server_game_units
             WHERE game_id = ? AND id = ? AND owner_id = ? AND deleted_at IS NULL FOR UPDATE'
        );
        $statement->execute([$gameId, $unitId, $playerId]);
        $unit = $statement->fetch();
        if (!$unit) {
            $db->rollBack();
            serverError(404, 'unit_not_found', 'The requested active unit does not belong to this player.');
        }
        if (!(int) $unit['can_move'] || (int) $unit['unit_class'] === 3) {
            $db->rollBack();
            serverError(422, 'unit_cannot_be_disbanded', 'Only a movable non-City unit can be disbanded.');
        }

        $revision = (int) $game['revision'] + 1;
        $statement = $db->prepare(
            "UPDATE server_game_units
             SET occupancy_key = NULL, health = 0, state = 'disbanded', revision = ?, deleted_at = UTC_TIMESTAMP()
             WHERE id = ?"
        );
        $statement->execute([$revision, $unitId]);
        $statement = $db->prepare('UPDATE server_games SET revision = ? WHERE id = ?');
        $statement->execute([$revision, $gameId]);
        recomputeVisibility($db, $gameId, (int) $game['map_size'], $revision);
        $deletedUnit = loadPublicServerUnit($db, $unitId);
        $db->commit();
        serverTrace('unit_disbanded_by_player', [
            'player_id' => $playerId, 'unit_id' => $unitId, 'revision' => $revision,
        ]);
        return ['revision' => $revision, 'unit' => $deletedUnit];
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

function serverNeighborDirections(): array
{
    return [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]];
}

function serverHexDistance(int $i1, int $j1, int $i2, int $j2): int
{
    $di = $i2 - $i1; $dj = $j2 - $j1;
    return $di * $dj >= 0 ? max(abs($di), abs($dj)) : abs($di) + abs($dj);
}

function serverNearestOwnedCityId(array $units, int $ownerId, int $i, int $j): ?int
{
    $bestId = null; $bestDistance = PHP_INT_MAX;
    foreach ($units as $unitId => $candidate) {
        if ((int) ($candidate['owner_id'] ?? -1) !== $ownerId
            || (float) ($candidate['health'] ?? 0) <= 0 || !serverIsCityUnit($candidate)) continue;
        $distance = serverHexDistance($i, $j, (int) $candidate['i'], (int) $candidate['j']);
        $candidateId = (int) ($candidate['id'] ?? $unitId);
        if ($distance < $bestDistance || ($distance === $bestDistance && $candidateId < (int) $bestId)) {
            $bestId = $candidateId; $bestDistance = $distance;
        }
    }
    return $bestId;
}

function serverTileIsIrrigationWaterSource(array $tiles, int $i, int $j): bool
{
    $tile = $tiles[coordinateKey($i, $j)] ?? null;
    if (!$tile) return false;
    $modifiers = json_decode((string) ($tile['modifiers_json'] ?? '{}'), true);
    // PREHISTORY-IRRIGATION-014: completed Farms seed adjacent Irrigation
    // without requiring a pre-existing route to natural fresh water.
    if (is_array($modifiers) && !empty($modifiers['farm'])) return true;
    $terrain = (int) $tile['terrain_tex'];
    $type = $terrain & 0x0f;
    $depth = ($terrain >> 4) & 0x03;
    if (($terrain & 0x80) !== 0 || $type === 7) return true;
    if ($type !== 0 || $depth > 1) return false;
    foreach (serverNeighborDirections() as [$di, $dj]) {
        $neighbor = $tiles[coordinateKey($i + $di, $j + $dj)] ?? null;
        if ($neighbor && ((((int) $neighbor['terrain_tex']) & 0x0f) === 0)
            && (((((int) $neighbor['terrain_tex']) >> 4) & 0x03) > 1)) return false;
    }
    return true;
}

function serverIrrigationConnectedToWater(array $tiles, int $originI, int $originJ): bool
{
    // Same breadth-first route shape as serverConnectedRoadResources(): the
    // request Tile is the unbuilt origin and every later land node must carry
    // the connecting modifier, here irrigation rather than road.
    $queue = [[$originI, $originJ]];
    $visited = [];
    for ($cursor = 0; $cursor < count($queue); ++$cursor) {
        [$i, $j] = $queue[$cursor];
        $key = coordinateKey($i, $j);
        if (isset($visited[$key]) || !isset($tiles[$key])) continue;
        $origin = $i === $originI && $j === $originJ;
        $modifiers = json_decode((string) ($tiles[$key]['modifiers_json'] ?? '{}'), true);
        if (!$origin && (!is_array($modifiers)
            || (empty($modifiers['irrigation']) && empty($modifiers['farm'])))) continue;
        $visited[$key] = true;
        if (serverTileIsIrrigationWaterSource($tiles, $i, $j)) return true;
        foreach (serverNeighborDirections() as [$di, $dj]) {
            $ni = $i + $di; $nj = $j + $dj;
            if (serverTileIsIrrigationWaterSource($tiles, $ni, $nj)) return true;
            $neighbor = $tiles[coordinateKey($ni, $nj)] ?? null;
            if (!$neighbor) continue;
            $neighborModifiers = json_decode((string) ($neighbor['modifiers_json'] ?? '{}'), true);
            if (is_array($neighborModifiers)
                && (!empty($neighborModifiers['irrigation']) || !empty($neighborModifiers['farm']))) {
                $queue[] = [$ni, $nj];
            }
        }
    }
    return false;
}

function serverResourceNamesById(): array
{
    return [
        1 => 'bananas', 2 => 'cattle', 3 => 'copper', 4 => 'crabs', 5 => 'deer', 6 => 'fish',
        7 => 'rice', 8 => 'sheep', 9 => 'stone', 10 => 'wheat', 11 => 'amber', 12 => 'citrus',
        13 => 'cotton', 14 => 'dyes', 15 => 'diamonds', 16 => 'furs', 17 => 'gypsum', 18 => 'honey',
        19 => 'incense', 20 => 'ivory', 21 => 'marble', 22 => 'olives', 23 => 'pearls', 24 => 'salt',
        25 => 'silk', 26 => 'silver', 27 => 'spices', 28 => 'sugar', 29 => 'tea', 30 => 'turtles',
        31 => 'whales', 32 => 'wine', 33 => 'horses', 34 => 'iron', 35 => 'gold', 36 => 'gems',
    ];
}

function serverProductionResourceRequirements(): array
{
    // Mirrored by productionResourceRequirements() in game_prehistory.js.
    return [
        'horseman' => ['horses'],
        'knight' => ['horses', 'iron'],
        'chariot' => ['horses', 'copper'],
        'elephant' => ['ivory', 'copper'],
        'galleon' => ['copper'],
        'frigate' => ['iron'],
        'spearman' => [['copper', 'iron']],
        'fencer' => [['copper', 'iron']],
        'catapult' => [['copper', 'iron']],
        'longbow' => [['copper', 'iron']],
        'pikeman' => ['iron'],
        'swordsman' => ['iron'],
    ];
}

function serverResourceImprovementRequirements(): array
{
    // Mirrored by resourceImprovementRequirements() in economics.js.
    return [
        'bananas' => 'plantation', 'cattle' => 'pasture', 'copper' => 'mine', 'crabs' => 'fishing_boats',
        'deer' => 'camp', 'fish' => 'fishing_boats', 'rice' => 'farm', 'sheep' => 'pasture',
        'stone' => 'quarry', 'wheat' => 'farm', 'amber' => 'camp', 'citrus' => 'plantation',
        'cotton' => 'plantation', 'dyes' => 'plantation', 'diamonds' => 'mine', 'furs' => 'camp',
        'gypsum' => 'quarry', 'honey' => 'camp', 'incense' => 'plantation', 'ivory' => 'camp',
        'marble' => 'quarry', 'olives' => 'plantation', 'pearls' => 'fishing_boats', 'salt' => 'quarry',
        'silk' => 'plantation', 'silver' => 'mine', 'spices' => 'plantation', 'sugar' => 'plantation',
        'tea' => 'plantation', 'turtles' => 'fishing_boats', 'whales' => 'fishing_boats',
        'wine' => 'winery', 'horses' => 'pasture', 'iron' => 'mine', 'gold' => 'mine', 'gems' => 'mine',
    ];
}

function serverImprovementYieldMultipliers(): array
{
    // Mirrored by improvementYieldMultipliers() in economics.js.
    return [
        'road' => ['money' => 1.25], 'irrigation' => ['food' => 1.50],
        'pasture' => ['food' => 1.50, 'production' => 1.25], 'farm' => [],
        'plantation' => ['food' => 1.25],
        'camp' => ['food' => 1.25, 'production' => 1.50],
        'fishing_boats' => ['food' => 1.50, 'money' => 1.50],
        'quarry' => ['production' => 2.00], 'winery' => ['food' => 1.25],
        'cottage' => ['money' => 2.00], 'workshop' => [],
        'mine' => ['production' => 2.00], 'fortification' => [],
        'network' => ['food' => 2.00],
    ];
}

function serverCottageStage(int $age): string
{
    if ($age >= 6000) return 'village';
    if ($age >= 1000) return 'hamlet';
    return 'cottage';
}

function serverCottageStageYield(int $age): array
{
    // Mirrored by cottageStageYields() in economics.js.
    $stage = serverCottageStage($age);
    if ($stage === 'village') return ['food_bonus' => 2, 'money_multiplier' => 4.0, 'minimum_money' => 4.0];
    if ($stage === 'hamlet') return ['food_bonus' => 1, 'money_multiplier' => 3.0, 'minimum_money' => 3.0];
    return ['food_bonus' => 0, 'money_multiplier' => 2.0, 'minimum_money' => 2.0];
}

function serverTerrainIncomeTable(): array
{
    return [
        0 => ['food' => 1, 'production' => 0, 'money' => 0], 1 => ['food' => 0, 'production' => 1, 'money' => 0],
        2 => ['food' => 2, 'production' => 0, 'money' => 0], 3 => ['food' => 0, 'production' => 1, 'money' => 0],
        4 => ['food' => 1, 'production' => 2, 'money' => 0], 5 => ['food' => 0, 'production' => 3, 'money' => 0],
        6 => ['food' => 1, 'production' => 1, 'money' => 0], 7 => ['food' => 3, 'production' => 0, 'money' => 1],
    ];
}

function serverResourceIncomeTable(): array
{
    return [
        1=>[2,0,0],2=>[2,1,0],3=>[0,2,1],4=>[2,0,1],5=>[1,1,0],6=>[2,0,0],7=>[2,0,0],8=>[1,1,0],9=>[0,2,0],10=>[2,0,0],
        11=>[0,0,1],12=>[1,0,1],13=>[0,0,1],14=>[0,0,1],15=>[0,0,2],16=>[0,1,1],17=>[0,2,0],18=>[1,0,1],19=>[0,0,1],20=>[0,1,1],
        21=>[0,2,1],22=>[1,0,1],23=>[0,0,1],24=>[1,0,1],25=>[0,0,1],26=>[0,0,1],27=>[1,0,1],28=>[1,0,1],29=>[0,0,1],30=>[2,0,0],
        31=>[1,1,1],32=>[1,0,1],33=>[0,1,1],34=>[0,2,0],35=>[0,0,2],36=>[0,0,2],
    ];
}

function serverApplyImprovementYieldMultipliers(
    array $income, array $modifiers, bool $isCityTile, int $terrainType, bool $hasWaterSource
): array
{
    if ($terrainType === 1 && !empty($modifiers['irrigation'])
        && (!$isCityTile || !empty($modifiers['irrigationCityFood']))) {
        $income['food'] += $hasWaterSource ? 2 : 1;
    }
    foreach (serverImprovementYieldMultipliers() as $improvement => $multipliers) {
        if (empty($modifiers[$improvement])) continue;
        if ($improvement === 'irrigation' && $isCityTile && empty($modifiers['irrigationCityFood'])) continue;
        if ($improvement === 'irrigation' && $terrainType === 1) continue;
        $cottageYield = null;
        if ($improvement === 'cottage') {
            $age = (int) ($modifiers['cottageAge'] ?? 0);
            $cottageYield = serverCottageStageYield($age);
            $multipliers = ['money' => $cottageYield['money_multiplier']];
        }
        foreach ($multipliers as $field => $multiplier) $income[$field] = ceil(($income[$field] ?? 0) * $multiplier);
        if ($improvement === 'farm') {
            $income['food'] = 5;
            $income['money'] = 0;
        }
        if ($cottageYield !== null) {
            $income['food'] += $cottageYield['food_bonus'];
            $income['money'] = max($income['money'], $cottageYield['minimum_money']);
        }
        if ($improvement === 'workshop') $income['production'] = 4;
    }
    return $income;
}

function serverTileIncome(array $tile, bool $isCityTile = false): array
{
    $terrain = (int) ($tile['terrain_tex'] ?? 0);
    $type = $terrain & 0x0f;
    $income = serverTerrainIncomeTable()[$type] ?? ['food' => 0, 'production' => 0, 'money' => 0];
    if ($type === 0 && (($terrain >> 4) & 0x03) > 1) $income['food'] = 1;
    $hasWaterSource = ($terrain & 0x80) !== 0;
    if ($hasWaterSource && $type !== 0) {
        if ($type === 1) $income['food'] = 2;
        else ++$income['food'];
        if ($type === 4 || $type === 5) ++$income['production'];
    }
    $resourceIncome = serverResourceIncomeTable()[(int) ($tile['resource_type'] ?? 0)] ?? null;
    if ($resourceIncome) {
        $income['food'] += $resourceIncome[0];
        $income['production'] += $resourceIncome[1];
        $income['money'] += $resourceIncome[2];
    }
    $modifiers = json_decode((string) ($tile['modifiers_json'] ?? '{}'), true);
    $modifiers = is_array($modifiers) ? $modifiers : [];
    $resourceName = serverResourceNamesById()[(int) ($tile['resource_type'] ?? 0)] ?? null;
    $required = $resourceName ? (serverResourceImprovementRequirements()[$resourceName] ?? null) : null;
    if (($required === 'plantation' || $required === 'winery') && !empty($modifiers[$required]) && $resourceIncome) {
        $income['money'] += 2 - $resourceIncome[2];
    }
    if ($required === 'camp' && !empty($modifiers['camp']) && $resourceIncome && $resourceIncome[2] < 1) {
        $income['money'] += 1 - $resourceIncome[2];
    }
    $income = serverApplyImprovementYieldMultipliers($income, $modifiers, $isCityTile, $type, $hasWaterSource);
    if (!empty($modifiers['network']) && in_array((int) ($tile['resource_type'] ?? 0), [6, 30], true)) {
        $income['food'] = 5;
        $income['money'] = 2;
    }
    // A City administration always provides a minimal production and treasury
    // base, preventing a resource-poor first City from becoming permanently idle.
    if ($isCityTile) {
        $income['production'] = max(1, (int) $income['production']);
        $income['money'] = $type === 7 ? 0 : max(1, (int) $income['money']);
    }
    return $income;
}

function serverImprovementMatchesTileResource(array $tile, string $modifier): bool
{
    if (in_array($modifier, ['road', 'fortification', 'network'], true)) return true;
    $resourceOnly = ['pasture', 'plantation', 'camp', 'fishing_boats', 'quarry', 'winery'];
    $resourceName = serverResourceNamesById()[(int) ($tile['resource_type'] ?? 0)] ?? null;
    if ($resourceName === null) return !in_array($modifier, $resourceOnly, true);
    $required = serverResourceImprovementRequirements()[$resourceName] ?? null;
    if ($modifier === 'irrigation' && $required === 'farm') return true;
    return $required === null ? !in_array($modifier, $resourceOnly, true) : $modifier === $required;
}

function serverPlayerCanSeeTileResource(PDO $db, int $gameId, int $playerId, int $i, int $j): bool
{
    $statement = $db->prepare(
        'SELECT resource_visible FROM server_game_visibility
         WHERE game_id = ? AND player_id = ? AND i = ? AND j = ? LIMIT 1'
    );
    $statement->execute([$gameId, $playerId, $i, $j]);
    return (bool) $statement->fetchColumn();
}

function serverConnectedRoadResources(array $tiles, int $cityI, int $cityJ): array
{
    $names = serverResourceNamesById();
    $found = [];
    $queue = [[$cityI, $cityJ]];
    $visited = [];
    for ($cursor = 0; $cursor < count($queue); ++$cursor) {
        [$i, $j] = $queue[$cursor];
        $key = coordinateKey($i, $j);
        if (isset($visited[$key]) || !isset($tiles[$key])) continue;
        $tile = $tiles[$key];
        $modifiers = json_decode((string) ($tile['modifiers_json'] ?? '{}'), true);
        $origin = $i === $cityI && $j === $cityJ;
        if (!$origin && (!is_array($modifiers) || empty($modifiers['road']))) continue;
        $visited[$key] = true;
        $resourceId = (int) ($tile['resource_type'] ?? 0);
        if (isset($names[$resourceId])) {
            $resourceName = $names[$resourceId];
            if (!in_array($resourceName, ['copper', 'iron'], true) || !empty($modifiers['mine'])) {
                $found[$resourceName] = true;
            }
        }
        foreach (serverNeighborDirections() as [$di, $dj]) $queue[] = [$i + $di, $j + $dj];
    }
    return $found;
}

function serverRevealConnectedCityResources(
    PDO $db, int $gameId, array $units, array $tiles, int $revision
): int {
    $revealByPlayer = [];
    foreach ($units as $city) {
        if (!serverIsCityUnit($city) || (float) ($city['health'] ?? 0) <= 0) continue;
        $ownerId = (int) $city['owner_id'];
        foreach (serverRoadConnectedTileKeys($tiles, (int) $city['i'], (int) $city['j']) as $key => $_connected) {
            $tile = $tiles[$key] ?? null;
            if (!$tile || (int) ($tile['resource_type'] ?? 0) <= 0) continue;
            $revealByPlayer[$ownerId][$key] = $tile;
        }
    }
    if (!$revealByPlayer) return 0;

    $upsert = $db->prepare(
        'INSERT INTO server_game_visibility
            (game_id, player_id, i, j, visibility_level, resource_visible, revision)
         VALUES (?, ?, ?, ?, 1, 1, ?)
         ON DUPLICATE KEY UPDATE visibility_level = GREATEST(visibility_level, VALUES(visibility_level)),
             resource_visible = 1, revision = VALUES(revision)'
    );
    $revealed = 0;
    foreach ($revealByPlayer as $ownerId => $resourceTiles) {
        foreach ($resourceTiles as $tile) {
            $upsert->execute([$gameId, $ownerId, (int) $tile['i'], (int) $tile['j'], $revision]);
            ++$revealed;
        }
    }
    if ($revealed > 0) {
        serverTrace('city_connected_resources_revealed', [
            'game_id' => $gameId, 'players' => array_map('intval', array_keys($revealByPlayer)),
            'resource_tiles' => $revealed, 'revision' => $revision,
        ]);
    }
    return $revealed;
}

function serverCityHasProductionResources(array $tiles, array $city, string $unitTypeId): bool
{
    $required = serverProductionResourceRequirements()[$unitTypeId] ?? [];
    if (!$required) return true;
    $connected = serverConnectedRoadResources($tiles, (int) $city['i'], (int) $city['j']);
    foreach ($required as $resource) {
        $alternatives = is_array($resource) ? $resource : [$resource];
        $satisfied = false;
        foreach ($alternatives as $alternative) {
            if (!empty($connected[$alternative])) {
                $satisfied = true;
                break;
            }
        }
        if (!$satisfied) return false;
    }
    return true;
}

function serverHasFreshWaterNear(array $tiles, int $i, int $j): bool
{
    foreach (serverNeighborDirections() as [$di, $dj]) {
        $water = $tiles[coordinateKey($i + $di, $j + $dj)] ?? null;
        if (!$water || (((int) $water['terrain_tex']) & 0x0f) !== 0) continue;
        $isSea = false;
        foreach (serverNeighborDirections() as [$wi, $wj]) {
            $neighbor = $tiles[coordinateKey($i + $di + $wi, $j + $dj + $wj)] ?? null;
            if ($neighbor && (((int) $neighbor['terrain_tex']) & 0x0f) === 0
                && ((((int) $neighbor['terrain_tex']) >> 4) & 0x03) > 1) {
                $isSea = true;
                break;
            }
        }
        if (!$isSea) return true;
    }
    return false;
}

function serverCityIsSeaside(array $tiles, int $i, int $j): bool
{
    foreach (serverNeighborDirections() as [$di, $dj]) {
        $tile = $tiles[coordinateKey($i + $di, $j + $dj)] ?? null;
        if ($tile && (((int) $tile['terrain_tex']) & 0x0f) === 0) return true;
    }
    return false;
}

function loadPublicServerUnit(PDO $db, int $unitId): ?array
{
    $statement = $db->prepare(
        'SELECT u.*, p.unit_type_id AS production_unit_type_id,
                p.production_points AS selected_production_points,
                p.production_cost AS selected_production_cost,
                p.queue_json AS selected_production_queue_json
         FROM server_game_units u
         LEFT JOIN productions p ON p.game_id = u.game_id AND p.city_unit_id = u.id
         WHERE u.id = ?'
    );
    $statement->execute([$unitId]);
    $unit = $statement->fetch();
    return $unit ? publicUnit($unit) : null;
}

function productionQueue(array $production): array
{
    $queue = json_decode((string) ($production['queue_json'] ?? $production['selected_production_queue_json'] ?? '[]'), true);
    if (!is_array($queue)) $queue = [];
    $definitions = serverUnitDefinitions();
    $queue = array_values(array_filter(array_map(
        static fn($value): string => strtolower(trim((string) $value)),
        $queue
    ), static fn(string $value): bool => isset($definitions[$value])));
    $current = strtolower(trim((string) ($production['unit_type_id'] ?? $production['production_unit_type_id'] ?? '')));
    if (!$queue && isset($definitions[$current])) $queue[] = $current;
    return $queue;
}

function setProductionProperties(array &$properties, array $queue, float $points, bool $disabled = false): void
{
    $properties['productionQueue'] = array_values($queue);
    $properties['production'] = $queue
        ? ['unitTypeId' => $queue[0], 'productionPoints' => max(0.0, $points)]
        : null;
    $properties['productionDisabled'] = $disabled;
}

function serverRemoveDestroyedCityAt(PDO $db, int $gameId, int $i, int $j, int $revision): void
{
    $statement = $db->prepare(
        "UPDATE server_game_units
         SET health = 0, revision = ?, deleted_at = UTC_TIMESTAMP()
         WHERE game_id = ? AND i = ? AND j = ? AND unit_type_id = 'destroyed_city'
           AND deleted_at IS NULL"
    );
    $statement->execute([$revision, $gameId, $i, $j]);
}

function buildCity(PDO $db, array $game, int $playerId, int $settlerId): array
{
    $db->beginTransaction();
    try {
        $game = loadGame($db, (string) $game['game_key'], true);
        $gameId = (int) $game['id'];
        $statement = $db->prepare(
            'SELECT * FROM server_game_units
             WHERE game_id = ? AND id = ? AND owner_id = ? AND deleted_at IS NULL FOR UPDATE'
        );
        $statement->execute([$gameId, $settlerId, $playerId]);
        $settler = $statement->fetch();
        if (!$settler || $settler['unit_type_id'] !== 'settlers') {
            $db->rollBack();
            serverError(404, 'settler_not_found', 'The requested active Settler does not belong to this player.');
        }

        $i = (int) $settler['i'];
        $j = (int) $settler['j'];
        $statement = $db->prepare('SELECT * FROM server_game_map WHERE game_id = ? AND i = ? AND j = ? FOR UPDATE');
        $statement->execute([$gameId, $i, $j]);
        $tile = $statement->fetch();
        if (!$tile || ((((int) $tile['terrain_tex']) & 0x0f) === 0)) {
            $db->rollBack();
            serverError(422, 'city_tile_invalid', 'A city requires a land tile.');
        }
        $statement = $db->prepare(
            'SELECT id FROM server_game_units
             WHERE game_id = ? AND unit_class = 3 AND i = ? AND j = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE'
        );
        $statement->execute([$gameId, $i, $j]);
        if ($statement->fetchColumn()) {
            $db->rollBack();
            serverError(409, 'city_already_exists', 'This tile already contains a city.');
        }

        $revision = (int) $game['revision'] + 1;
        serverRemoveDestroyedCityAt($db, $gameId, $i, $j, $revision);
        $tiles = loadTiles($db, $gameId);
        $splitKeys = serverSplitSupertileAt($tiles, $i, $j);
        $tileKey = coordinateKey($i, $j);
        $tile = &$tiles[$tileKey];
        if (serverIsChoppableForestTerrain((int) $tile['terrain_tex'])) {
            $tile['terrain_tex'] = serverChoppedForestTerrain((int) $tile['terrain_tex']);
        }
        $modifiers = json_decode((string) ($tile['modifiers_json'] ?? '{}'), true);
        if (!is_array($modifiers)) $modifiers = [];
        serverReplacePrimaryImprovement($db, $gameId, $i, $j, 'irrigation', $revision, $modifiers);
        $modifiers['road'] = true;
        $modifiers['irrigation'] = true;
        $modifiers['irrigationCityFood'] = serverHasFreshWaterNear($tiles, $i, $j);
        $tile['modifiers_json'] = jsonObject($modifiers);
        $changedKeys = array_fill_keys($splitKeys, true);
        $changedKeys[$tileKey] = true;
        $statement = $db->prepare(
            'UPDATE server_game_map SET terrain_tex = ?, modifiers_json = ?, revision = ? WHERE game_id = ? AND i = ? AND j = ?'
        );
        foreach (array_keys($changedKeys) as $changedKey) {
            $tiles[$changedKey]['revision'] = $revision;
            $statement->execute([
                $tiles[$changedKey]['terrain_tex'], $tiles[$changedKey]['modifiers_json'], $revision,
                $gameId, $tiles[$changedKey]['i'], $tiles[$changedKey]['j'],
            ]);
        }

        $cityName = serverNextCityName($db, $gameId, $playerId);
        $statement = $db->prepare(
            'SELECT COUNT(*) FROM server_game_units WHERE game_id = ? AND owner_id = ? AND unit_class = 3
             AND deleted_at IS NULL'
        );
        $statement->execute([$gameId, $playerId]);
        $isFirstCityAfterRespawn = (int) $statement->fetchColumn() === 0;
        $cityProperties = [
            'odd_move' => 0,
            'productionPoints' => 0,
            'cityProperties' => ['productionPerTurn' => 5, 'productionStored' => 0],
            'production' => null,
            'productionDisabled' => false,
            'cityPopulation' => 1,
            'cityFoodStored' => 0,
            'capitalOwnerId' => $isFirstCityAfterRespawn ? $playerId : null,
        ];
        $clientKey = 'city-' . $playerId . '-' . $settlerId;
        $statement = $db->prepare(
            'INSERT INTO server_game_units
             (game_id, client_key, occupancy_key, owner_id, unit_type_id, unit_class, name, texture, can_move,
              nature, i, j, attack_value, defense_value, speed, view_range, state, health, max_health,
              experience, move_penalty, properties_json, revision)
             VALUES (?, ?, ?, ?, ?, 3, ?, 259, 0, ?, ?, ?, 0, 8, 0, 3, ?, 100, 100, 1, 0, ?, ?)'
        );
        $statement->execute([
            $gameId, $clientKey, 'city:' . $i . ':' . $j, $playerId, 'city', $cityName, 'land', $i, $j,
            'ready', jsonObject($cityProperties), $revision,
        ]);
        $cityId = (int) $db->lastInsertId();

        $statement = $db->prepare(
            'UPDATE server_game_units SET health = 0, revision = ?, deleted_at = UTC_TIMESTAMP() WHERE id = ?'
        );
        $statement->execute([$revision, $settlerId]);
        $statement = $db->prepare('UPDATE server_games SET revision = ? WHERE id = ?');
        $statement->execute([$revision, $gameId]);
        recomputeVisibility($db, $gameId, (int) $game['map_size'], $revision);

        $city = loadPublicServerUnit($db, $cityId);
        $settler = loadPublicServerUnit($db, $settlerId);
        $db->commit();
        serverTrace('city_built', [
            'player_id' => $playerId, 'settler_id' => $settlerId, 'city_id' => $cityId,
            'i' => $i, 'j' => $j, 'revision' => $revision,
        ]);
        return [
            'revision' => $revision,
            'settler' => $settler,
            'city' => $city,
            'tile' => [
                'i' => $i, 'j' => $j, 'terrain_tex' => (int) $tile['terrain_tex'],
                'terrain_bits' => (int) $tile['terrain_bits'], 'resource_type' => (int) $tile['resource_type'],
                'modifiers' => $modifiers, 'revision' => $revision,
            ],
        ];
    } catch (PDOException $error) {
        if ($db->inTransaction()) $db->rollBack();
        if ((string) $error->getCode() === '23000') {
            serverError(409, 'city_already_exists', 'This tile already contains a city.');
        }
        throw $error;
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

function growCity(PDO $db, array $game, int $playerId, int $cityId, float $reportedFood): array
{
    if (!is_finite($reportedFood) || $reportedFood < 0) {
        serverError(422, 'invalid_food_stored', 'food_stored must be a finite non-negative number.');
    }
    $db->beginTransaction();
    try {
        $game = loadGame($db, (string) $game['game_key'], true);
        $gameId = (int) $game['id'];
        $statement = $db->prepare(
            'SELECT * FROM server_game_units
             WHERE game_id = ? AND id = ? AND owner_id = ? AND unit_class = 3
               AND deleted_at IS NULL FOR UPDATE'
        );
        $statement->execute([$gameId, $cityId, $playerId]);
        $city = $statement->fetch();
        if (!$city) {
            $db->rollBack();
            serverError(404, 'city_not_found', 'The requested active City does not belong to this player.');
        }
        $population = serverCityPopulation($city);
        $growthCost = 80 + $population * 40;
        $tiles = loadTiles($db, $gameId);
        $tileCapacity = max(1, count(serverCityEconomicTileKeys($city, $tiles)));
        if ($population >= $tileCapacity) {
            $db->rollBack();
            serverError(409, 'city_worked_tile_required', 'The City needs another road-connected or net-improved Tile before it can grow.', [
                'population' => $population,
                'worked_tile_capacity' => $tileCapacity,
            ]);
        }
        $properties = json_decode((string) ($city['properties_json'] ?? '{}'), true);
        if (!is_array($properties)) $properties = [];
        $authoritativeFood = max(0.0, (float) ($properties['cityFoodStored'] ?? 0));
        if ($authoritativeFood + 0.0001 < $growthCost) {
            $db->rollBack();
            serverError(409, 'insufficient_city_food', 'The City does not have enough stored food to grow.', [
                'population' => $population,
                'food_stored' => $authoritativeFood,
                'growth_cost' => $growthCost,
            ]);
        }

        serverSetCityPopulation($city, min(500, $population + 1));
        serverSetCityFood($city, max(0.0, $authoritativeFood - $growthCost));
        $revision = (int) $game['revision'] + 1;
        $statement = $db->prepare(
            'UPDATE server_game_units SET properties_json = ?, revision = ? WHERE id = ?'
        );
        $statement->execute([$city['properties_json'], $revision, $cityId]);
        $statement = $db->prepare('UPDATE server_games SET revision = ? WHERE id = ?');
        $statement->execute([$revision, $gameId]);
        $city = loadPublicServerUnit($db, $cityId);
        $db->commit();
        serverTrace('city_grown', [
            'player_id' => $playerId, 'city_id' => $cityId, 'population_before' => $population,
            'population_after' => $population + 1, 'food_before_growth' => $authoritativeFood,
            'growth_cost' => $growthCost, 'revision' => $revision,
        ]);
        return ['revision' => $revision, 'city' => $city, 'growth_cost' => $growthCost];
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

function optimizeCity(PDO $db, array $game, int $playerId, int $cityId, string $optimization): array
{
    if (!in_array($optimization, ['food', 'production', 'gold', 'balanced'], true)) {
        serverError(422, 'invalid_city_optimization', 'City optimization must be food, production, gold, or balanced.');
    }
    $db->beginTransaction();
    try {
        $game = loadGame($db, (string) $game['game_key'], true);
        $statement = $db->prepare(
            'SELECT * FROM server_game_units
             WHERE game_id = ? AND id = ? AND owner_id = ? AND unit_class = 3
               AND deleted_at IS NULL AND health > 0 FOR UPDATE'
        );
        $statement->execute([(int) $game['id'], $cityId, $playerId]);
        $city = $statement->fetch();
        if (!$city) {
            $db->rollBack();
            serverError(404, 'city_not_found', 'The requested active City does not belong to this player.');
        }
        $properties = json_decode((string) ($city['properties_json'] ?? '{}'), true);
        if (!is_array($properties)) $properties = [];
        $properties['cityOptimization'] = $optimization;
        if (!isset($properties['economy']) || !is_array($properties['economy'])) {
            $properties['economy'] = [];
        }
        $city['properties_json'] = jsonObject($properties);
        $properties['economy']['citizens'] = serverCityCitizenRecords(
            serverCityWorkedTiles($city, loadTiles($db, (int) $game['id']))
        );
        $revision = (int) $game['revision'] + 1;
        $statement = $db->prepare(
            'UPDATE server_game_units SET properties_json = ?, revision = ? WHERE id = ?'
        );
        $statement->execute([jsonObject($properties), $revision, $cityId]);
        $statement = $db->prepare('UPDATE server_games SET revision = ? WHERE id = ?');
        $statement->execute([$revision, (int) $game['id']]);
        $city = loadPublicServerUnit($db, $cityId);
        $db->commit();
        serverTrace('city_optimization_changed', [
            'player_id' => $playerId, 'city_id' => $cityId,
            'optimization' => $optimization, 'revision' => $revision,
        ]);
        return ['revision' => $revision, 'city' => $city, 'optimization' => $optimization];
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

function healCityUnits(PDO $db, array $game, int $playerId, int $cityId, array $requestedUnitIds): array
{
    if (!$requestedUnitIds || count($requestedUnitIds) > 100) {
        serverError(422, 'invalid_unit_ids', 'unit_ids must contain 1-100 unit ids.');
    }
    $unitIds = [];
    foreach ($requestedUnitIds as $unitId) {
        if (!is_numeric($unitId) || (int) $unitId < 1) {
            serverError(422, 'invalid_unit_ids', 'Every healing unit id must be a positive integer.');
        }
        $unitIds[(int) $unitId] = (int) $unitId;
    }
    $unitIds = array_values($unitIds);

    $db->beginTransaction();
    try {
        $game = loadGame($db, (string) $game['game_key'], true);
        $gameId = (int) $game['id'];
        $turn = (int) $game['turn_number'];
        $statement = $db->prepare(
            'SELECT * FROM server_game_units
             WHERE game_id = ? AND id = ? AND owner_id = ? AND unit_class = 3
               AND deleted_at IS NULL AND health > 0 FOR UPDATE'
        );
        $statement->execute([$gameId, $cityId, $playerId]);
        $city = $statement->fetch();
        if (!$city) {
            $db->rollBack();
            serverError(404, 'city_not_found', 'The requested active City does not belong to this player.');
        }
        $healPercent = serverCityHealingPercent(
            serverCityBuiltBuildingTypes($db, $gameId, $playerId, $cityId)
        );
        if ((int) ($city['last_healed_turn'] ?? -1) >= $turn) {
            $db->commit();
            return [
                'status' => 'ALREADY_HEALED', 'revision' => (int) $game['revision'],
                'turn' => $turn, 'units' => [],
            ];
        }

        $placeholders = implode(',', array_fill(0, count($unitIds), '?'));
        $parameters = array_merge([$gameId, $playerId], $unitIds);
        $statement = $db->prepare(
            "SELECT * FROM server_game_units
             WHERE game_id = ? AND owner_id = ? AND id IN ($placeholders) FOR UPDATE"
        );
        $statement->execute($parameters);
        $units = [];
        foreach ($statement->fetchAll() as $unit) {
            $units[(int) $unit['id']] = $unit;
        }
        $invalidIds = [];
        foreach ($unitIds as $unitId) {
            $unit = $units[$unitId] ?? null;
            if (!$unit || $unit['deleted_at'] !== null || (float) $unit['health'] <= 0
                || !(bool) $unit['can_move'] || (int) $unit['unit_class'] === 3
                || (int) $unit['i'] !== (int) $city['i'] || (int) $unit['j'] !== (int) $city['j']) {
                $invalidIds[] = $unitId;
            }
        }
        if ($invalidIds) {
            $db->rollBack();
            serverError(422, 'unit_not_in_city', 'Every requested unit must be a living movable unit inside this City.', [
                'city_unit_id' => $cityId, 'invalid_unit_ids' => $invalidIds,
                'i' => (int) $city['i'], 'j' => (int) $city['j'],
            ]);
        }

        $revision = (int) $game['revision'] + 1;
        $updateUnit = $db->prepare('UPDATE server_game_units SET health = ?, revision = ? WHERE id = ?');
        $healedIds = [];
        foreach ($unitIds as $unitId) {
            $unit = $units[$unitId];
            $health = (float) $unit['health'];
            $maximum = max(1.0, (float) $unit['max_health']);
            $healedHealth = min($maximum, $health + $maximum * $healPercent / 100.0);
            if ($healedHealth > $health) {
                $updateUnit->execute([$healedHealth, $revision, $unitId]);
                $healedIds[] = $unitId;
            }
        }
        $statement = $db->prepare(
            'UPDATE server_game_units SET last_healed_turn = ?, revision = ? WHERE id = ?'
        );
        $statement->execute([$turn, $revision, $cityId]);
        $statement = $db->prepare('UPDATE server_games SET revision = ? WHERE id = ?');
        $statement->execute([$revision, $gameId]);

        $healedUnits = [];
        foreach ($healedIds as $unitId) {
            $healedUnits[] = loadPublicServerUnit($db, $unitId);
        }
        $db->commit();
        serverTrace('city_units_healed', [
            'game_id' => $gameId, 'turn' => $turn, 'player_id' => $playerId,
            'city_unit_id' => $cityId, 'unit_ids' => $healedIds, 'revision' => $revision,
        ]);
        return [
            'status' => $healedIds ? 'HEALED' : 'FULL_HEALTH', 'revision' => $revision,
            'turn' => $turn, 'heal_percent' => $healPercent, 'units' => $healedUnits,
        ];
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

function selectCityProduction(PDO $db, array $game, int $playerId, int $cityId, ?string $unitTypeId): array
{
    $definitions = serverUnitDefinitions();
    $unitTypeId = $unitTypeId === null ? null : strtolower(trim($unitTypeId));
    if ($unitTypeId === '' || $unitTypeId === 'none') $unitTypeId = null;
    if ($unitTypeId !== null && !isset($definitions[$unitTypeId])) {
        serverError(422, 'invalid_unit_type', 'unit_type_id is not a supported production unit.');
    }

    $db->beginTransaction();
    try {
        $game = loadGame($db, (string) $game['game_key'], true);
        $gameId = (int) $game['id'];
        $statement = $db->prepare(
            'SELECT * FROM server_game_units
             WHERE game_id = ? AND id = ? AND owner_id = ? AND unit_class = 3 AND deleted_at IS NULL FOR UPDATE'
        );
        $statement->execute([$gameId, $cityId, $playerId]);
        $city = $statement->fetch();
        if (!$city) {
            $db->rollBack();
            serverError(404, 'city_not_found', 'The requested active City does not belong to this player.');
        }
        if ($unitTypeId !== null && serverIsCityBuildingType($unitTypeId)
            && serverCityHasBuilding($db, $gameId, $playerId, $city, $unitTypeId)) {
            $db->rollBack();
            serverError(409, 'city_building_already_built', 'This City already contains that building.', [
                'city_id' => $cityId, 'building_type_id' => $unitTypeId,
            ]);
        }
        $statement = $db->prepare('SELECT state_json FROM server_game_players WHERE game_id = ? AND player_id = ?');
        $statement->execute([$gameId, $playerId]);
        $playerState = json_decode((string) ($statement->fetchColumn() ?: '{}'), true);
        if (!is_array($playerState)) $playerState = [];
        if ($unitTypeId !== null && (float) ($playerState['money'] ?? 0) < 0) {
            $db->rollBack();
            serverError(409, 'production_blocked_by_budget', 'Unit production cannot start while the money account is negative.');
        }
        $goldUpkeep = $unitTypeId === null ? 0 : serverUnitTypeGoldUpkeep($unitTypeId);
        if ($unitTypeId !== null && $goldUpkeep > (float) ($playerState['money'] ?? 0)) {
            $db->rollBack();
            serverError(409, 'production_gold_upkeep_required', 'The treasury cannot support this unit for one turn.', [
                'unit_type_id' => $unitTypeId,
                'required_gold' => $goldUpkeep,
                'available_gold' => (float) ($playerState['money'] ?? 0),
            ]);
        }
        if ($unitTypeId !== null && !playerHasTechnology($playerState, $definitions[$unitTypeId]['technology'])) {
            $db->rollBack();
            serverError(409, 'technology_required', $definitions[$unitTypeId]['technology'] . ' is required for this unit.');
        }
        $tiles = $unitTypeId !== null ? loadTiles($db, $gameId) : [];
        if ($unitTypeId !== null && !serverCityHasProductionResources($tiles, $city, $unitTypeId)) {
            $db->rollBack();
            serverError(409, 'connected_resource_required', 'The City is not connected by road to all resources required for this unit.', [
                'unit_type_id' => $unitTypeId,
                'required_resources' => serverProductionResourceRequirements()[$unitTypeId] ?? [],
            ]);
        }
        if ($unitTypeId !== null && $definitions[$unitTypeId]['nature'] === 'water') {
            if (!serverCityIsSeaside($tiles, (int) $city['i'], (int) $city['j'])) {
                $db->rollBack();
                serverError(409, 'seaside_city_required', 'Water units can be produced only by a seaside city.');
            }
        }

        $properties = json_decode((string) ($city['properties_json'] ?? '{}'), true);
        if (!is_array($properties)) $properties = [];
        $cityProperties = $properties['cityProperties'] ?? [];
        if (!is_array($cityProperties)) $cityProperties = [];
        $cityProperties['productionStored'] = 0;
        $statement = $db->prepare(
            'SELECT * FROM productions WHERE game_id = ? AND city_unit_id = ? FOR UPDATE'
        );
        $statement->execute([$gameId, $cityId]);
        $existingProduction = $statement->fetch();
        $queue = $existingProduction ? productionQueue($existingProduction) : [];
        if ($unitTypeId !== null && serverIsCityBuildingType($unitTypeId)
            && in_array($unitTypeId, $queue, true)) {
            $db->rollBack();
            serverError(409, 'city_building_already_queued', 'This City already has that building in its backlog.', [
                'city_id' => $cityId, 'building_type_id' => $unitTypeId,
            ]);
        }
        $points = $existingProduction
            ? max(0.0, (float) $existingProduction['production_points'])
            : 0.0;
        $revision = (int) $game['revision'] + 1;
        if ($unitTypeId === null) {
            $statement = $db->prepare('DELETE FROM productions WHERE game_id = ? AND city_unit_id = ?');
            $statement->execute([$gameId, $cityId]);
            $points = 0.0;
            $cityProperties['productionStored'] = 0;
            $properties['cityProperties'] = $cityProperties;
            setProductionProperties($properties, [], 0, true);
            $queue = [];
        } else {
            $queue[] = $unitTypeId;
            $currentTypeId = $queue[0];
            $definition = $definitions[$currentTypeId];
            $statement = $db->prepare(
                'INSERT INTO productions
                 (game_id, city_unit_id, player_id, unit_type_id, production_points, production_cost, queue_json, selected_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
                 ON DUPLICATE KEY UPDATE player_id = VALUES(player_id), unit_type_id = VALUES(unit_type_id),
                     production_points = VALUES(production_points), production_cost = VALUES(production_cost),
                     queue_json = VALUES(queue_json), selected_at = VALUES(selected_at)'
            );
            $statement->execute([
                $gameId, $cityId, $playerId, $currentTypeId, $points,
                $definition['cost'], jsonObject($queue),
            ]);
            $properties['cityProperties'] = $cityProperties;
            setProductionProperties($properties, $queue, $points, false);
        }
        $statement = $db->prepare('UPDATE server_game_units SET properties_json = ?, revision = ? WHERE id = ?');
        $statement->execute([jsonObject($properties), $revision, $cityId]);
        $statement = $db->prepare('UPDATE server_games SET revision = ? WHERE id = ?');
        $statement->execute([$revision, $gameId]);
        $city = loadPublicServerUnit($db, $cityId);
        $db->commit();
        serverTrace('production_selected', [
            'player_id' => $playerId, 'city_id' => $cityId, 'unit_type_id' => $unitTypeId,
            'production_points' => $points, 'queue' => $queue, 'revision' => $revision,
        ]);
        return ['revision' => $revision, 'city' => $city];
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

function removeCityProduction(PDO $db, array $game, int $playerId, int $cityId, int $queueIndex): array
{
    $definitions = serverUnitDefinitions();
    $db->beginTransaction();
    try {
        $game = loadGame($db, (string) $game['game_key'], true);
        $gameId = (int) $game['id'];
        $statement = $db->prepare(
            'SELECT u.*, p.unit_type_id, p.production_points, p.production_cost, p.queue_json
             FROM server_game_units u
             JOIN productions p ON p.game_id = u.game_id AND p.city_unit_id = u.id
             WHERE u.game_id = ? AND u.id = ? AND u.owner_id = ? AND u.unit_class = 3
               AND u.deleted_at IS NULL FOR UPDATE'
        );
        $statement->execute([$gameId, $cityId, $playerId]);
        $city = $statement->fetch();
        if (!$city) {
            $db->rollBack();
            serverError(404, 'production_not_found', 'The City has no production backlog.');
        }
        $queue = productionQueue($city);
        if ($queueIndex < 0 || $queueIndex >= count($queue)) {
            $db->rollBack();
            serverError(422, 'invalid_queue_index', 'queue_index does not identify a production backlog item.');
        }
        $removed = $queue[$queueIndex];
        array_splice($queue, $queueIndex, 1);
        $points = max(0.0, (float) $city['production_points']);
        if ($queueIndex === 0) $points = 0.0;
        $properties = json_decode((string) ($city['properties_json'] ?? '{}'), true);
        if (!is_array($properties)) $properties = [];
        $cityProperties = $properties['cityProperties'] ?? [];
        if (!is_array($cityProperties)) $cityProperties = [];
        $cityProperties['productionStored'] = 0;
        $properties['cityProperties'] = $cityProperties;
        $revision = (int) $game['revision'] + 1;

        if ($queue) {
            $current = $queue[0];
            $statement = $db->prepare(
                'UPDATE productions SET unit_type_id = ?, production_points = ?, production_cost = ?, queue_json = ?
                 WHERE game_id = ? AND city_unit_id = ?'
            );
            $statement->execute([$current, $points, $definitions[$current]['cost'], jsonObject($queue), $gameId, $cityId]);
            setProductionProperties($properties, $queue, $points, false);
        } else {
            $statement = $db->prepare('DELETE FROM productions WHERE game_id = ? AND city_unit_id = ?');
            $statement->execute([$gameId, $cityId]);
            setProductionProperties($properties, [], 0, false);
        }
        $statement = $db->prepare('UPDATE server_game_units SET properties_json = ?, revision = ? WHERE id = ?');
        $statement->execute([jsonObject($properties), $revision, $cityId]);
        $statement = $db->prepare('UPDATE server_games SET revision = ? WHERE id = ?');
        $statement->execute([$revision, $gameId]);
        $cityPublic = loadPublicServerUnit($db, $cityId);
        $db->commit();
        serverTrace('production_removed', [
            'player_id' => $playerId, 'city_id' => $cityId, 'queue_index' => $queueIndex,
            'removed' => $removed, 'queue' => $queue, 'production_points' => $points,
        ]);
        return ['revision' => $revision, 'city' => $cityPublic, 'removed_unit_type_id' => $removed];
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

function completeCityProduction(PDO $db, array $game, int $playerId, int $cityId): array
{
    $definitions = serverUnitDefinitions();
    $db->beginTransaction();
    try {
        $game = loadGame($db, (string) $game['game_key'], true);
        $gameId = (int) $game['id'];
        $statement = $db->prepare(
            'SELECT u.*, p.unit_type_id, p.production_points, p.production_cost, p.queue_json,
                    sp.state_json
             FROM server_game_units u
             JOIN productions p ON p.game_id = u.game_id AND p.city_unit_id = u.id
             LEFT JOIN server_game_players sp ON sp.game_id = u.game_id AND sp.player_id = u.owner_id
             WHERE u.game_id = ? AND u.id = ? AND u.owner_id = ? AND u.unit_class = 3
               AND u.deleted_at IS NULL FOR UPDATE'
        );
        $statement->execute([$gameId, $cityId, $playerId]);
        $city = $statement->fetch();
        if (!$city) {
            $db->rollBack();
            serverError(404, 'production_not_found', 'The City has no active production.');
        }
        $playerState = json_decode((string) ($city['state_json'] ?? '{}'), true);
        if (!is_array($playerState)) $playerState = [];
        if ((float) ($playerState['money'] ?? 0) < 0) {
            $db->rollBack();
            serverError(409, 'production_blocked_by_budget', 'Unit production cannot finish while the money account is negative.');
        }
        $queue = productionQueue($city);
        $unitTypeId = $queue[0] ?? '';
        $definition = $definitions[$unitTypeId] ?? null;
        if (!$definition) {
            $db->rollBack();
            serverError(409, 'invalid_production_queue', 'The first production backlog item is invalid.');
        }
        if (serverIsCityBuildingType($unitTypeId)
            && serverCityHasBuilding($db, $gameId, $playerId, $city, $unitTypeId)) {
            $db->rollBack();
            serverError(409, 'city_building_already_built', 'This City already contains that building.', [
                'city_id' => $cityId, 'building_type_id' => $unitTypeId,
            ]);
        }
        $tiles = loadTiles($db, $gameId);
        if (!serverCityHasProductionResources($tiles, $city, $unitTypeId)) {
            $db->rollBack();
            serverError(409, 'connected_resource_required', 'The City is no longer connected by road to all resources required for this unit.', [
                'unit_type_id' => $unitTypeId,
                'required_resources' => serverProductionResourceRequirements()[$unitTypeId] ?? [],
            ]);
        }
        $points = max(0.0, (float) $city['production_points']);
        $cost = max(1.0, (float) $definition['cost']);
        if ($points + 0.0001 < $cost) {
            $db->rollBack();
            serverError(409, 'insufficient_production_points', 'The City does not have enough production points.', [
                'production_points' => $points, 'production_cost' => $cost,
            ]);
        }
        $cityStackCount = serverMovableUnitCountAt($db, $gameId, (int) $city['i'], (int) $city['j']);
        if (!serverIsCityBuildingType($unitTypeId) && $cityStackCount >= SERVER_GAME_TILE_UNIT_LIMIT) {
            $db->rollBack();
            serverTrace('production_paused_by_unit_stack', [
                'player_id' => $playerId, 'city_id' => $cityId,
                'unit_count' => $cityStackCount, 'unit_limit' => SERVER_GAME_TILE_UNIT_LIMIT,
            ]);
            return [
                'status' => 'PAUSE', 'pause_reason' => 'unit_stack_full',
                'city_unit_id' => $cityId, 'unit_count' => $cityStackCount,
                'unit_limit' => SERVER_GAME_TILE_UNIT_LIMIT,
                'retry_turn' => (int) $game['turn_number'] + 1,
            ];
        }
        $coord = productionSpawnCoordinate($definition, $city, $tiles);
        if ($coord === null) {
            $db->rollBack();
            serverError(409, 'production_spawn_unavailable', 'No valid Tile is available for the produced unit.');
        }
        $revision = (int) $game['revision'] + 1;
        $producedId = insertProducedUnit(
            $db, $gameId, $playerId, $cityId, (int) $game['turn_number'],
            $unitTypeId, $definition, $coord, $revision
        );
        // Each backlog item starts from zero; excess from the completed item is discarded.
        $remaining = 0.0;
        array_shift($queue);
        $properties = json_decode((string) ($city['properties_json'] ?? '{}'), true);
        if (!is_array($properties)) $properties = [];
        $cityProperties = $properties['cityProperties'] ?? [];
        if (!is_array($cityProperties)) $cityProperties = [];
        $cityProperties['productionStored'] = 0;
        $properties['cityProperties'] = $cityProperties;
        if ($queue) {
            $next = $queue[0];
            $statement = $db->prepare(
                'UPDATE productions SET unit_type_id = ?, production_points = ?, production_cost = ?,
                 queue_json = ? WHERE game_id = ? AND city_unit_id = ?'
            );
            $statement->execute([
                $next, $remaining, $definitions[$next]['cost'], jsonObject($queue), $gameId, $cityId,
            ]);
            setProductionProperties($properties, $queue, $remaining, false);
        } else {
            $statement = $db->prepare('DELETE FROM productions WHERE game_id = ? AND city_unit_id = ?');
            $statement->execute([$gameId, $cityId]);
            $cityProperties['productionStored'] = 0;
            $properties['cityProperties'] = $cityProperties;
            setProductionProperties($properties, [], 0, false);
        }
        $statement = $db->prepare('UPDATE server_game_units SET properties_json = ?, revision = ? WHERE id = ?');
        $statement->execute([jsonObject($properties), $revision, $cityId]);
        $statement = $db->prepare('UPDATE server_games SET revision = ? WHERE id = ?');
        $statement->execute([$revision, $gameId]);
        recomputeVisibility($db, $gameId, (int) $game['map_size'], $revision);
        $cityPublic = loadPublicServerUnit($db, $cityId);
        $produced = loadPublicServerUnit($db, $producedId);
        $db->commit();
        serverTrace('production_completed_by_client', [
            'player_id' => $playerId, 'city_id' => $cityId, 'unit_id' => $producedId,
            'unit_type_id' => $unitTypeId, 'remaining_points' => $remaining, 'queue' => $queue,
        ]);
        return [
            'revision' => $revision, 'city' => $cityPublic, 'unit' => $produced,
            'production_cost' => $cost, 'remaining_points' => $remaining,
        ];
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

function recomputeVisibility(
    PDO $db, int $gameId, int $mapSize, int $revision, ?array $tiles = null
): void
{
    $statement = $db->prepare(
        'UPDATE server_game_visibility SET visibility_level = 1, revision = ? WHERE game_id = ? AND visibility_level = 2'
    );
    $statement->execute([$revision, $gameId]);

    $statement = $db->prepare('SELECT * FROM server_game_units WHERE game_id = ? AND deleted_at IS NULL');
    $statement->execute([$gameId]);
    $units = $statement->fetchAll();
    $visible = [];
    foreach ($units as $unit) {
        $properties = json_decode((string) ($unit['properties_json'] ?? '{}'), true);
        if (is_array($properties) && !empty($properties['noFogReveal'])) continue;
        $owner = (int) $unit['owner_id'];
        $ui = (int) $unit['i'];
        $uj = (int) $unit['j'];
        $fullRange = max(1, min(12, (int) $unit['view_range']));
        $memoryRange = $fullRange + 1;
        for ($di = -$memoryRange; $di <= $memoryRange; ++$di) {
            for ($dj = -$memoryRange; $dj <= $memoryRange; ++$dj) {
                $i = $ui + $di;
                $j = $uj + $dj;
                if ($i < 0 || $j < 0 || $i >= $mapSize || $j >= $mapSize) continue;
                $level = abs($di) <= $fullRange && abs($dj) <= $fullRange ? 2 : 1;
                $resourceVisible = 0;
                if ($di === 0 && $dj === 0 && ($unit['unit_type_id'] === 'explorer' || $unit['nature'] === 'water')) {
                    $resourceVisible = 1;
                }
                $key = coordinateKey($i, $j);
                if (!isset($visible[$owner][$key])) {
                    $visible[$owner][$key] = [$i, $j, $level, $resourceVisible];
                } else {
                    $visible[$owner][$key][2] = max($visible[$owner][$key][2], $level);
                    $visible[$owner][$key][3] = max($visible[$owner][$key][3], $resourceVisible);
                }
            }
        }
    }
    foreach ($visible as $owner => $ownerTiles) {
        foreach (array_chunk(array_values($ownerTiles), 500) as $chunk) {
            $values = [];
            $parameters = [];
            foreach ($chunk as [$i, $j, $level, $resourceVisible]) {
                $values[] = '(?, ?, ?, ?, ?, ?, ?)';
                array_push($parameters, $gameId, $owner, $i, $j, $level, $resourceVisible, $revision);
            }
            $upsert = $db->prepare(
                'INSERT INTO server_game_visibility
                 (game_id, player_id, i, j, visibility_level, resource_visible, revision) VALUES '
                . implode(',', $values)
                . ' ON DUPLICATE KEY UPDATE visibility_level = VALUES(visibility_level),
                    resource_visible = GREATEST(resource_visible, VALUES(resource_visible)),
                    revision = VALUES(revision)'
            );
            $upsert->execute($parameters);
        }
    }
    if ($tiles !== null) {
        serverRevealConnectedCityResources($db, $gameId, $units, $tiles, $revision);
    }
}

function productionSpawnCoordinate(array $definition, array $city, array $tiles): ?array
{
    $i = (int) $city['i'];
    $j = (int) $city['j'];
    if ($definition['nature'] !== 'water') return ['i' => $i, 'j' => $j];
    foreach (serverNeighborDirections() as [$di, $dj]) {
        $tile = $tiles[coordinateKey($i + $di, $j + $dj)] ?? null;
        if ($tile && (((int) $tile['terrain_tex']) & 0x0f) === 0) {
            return ['i' => $i + $di, 'j' => $j + $dj];
        }
    }
    return null;
}

function insertProducedUnit(
    PDO $db,
    int $gameId,
    int $playerId,
    int $cityId,
    int $turn,
    string $unitTypeId,
    array $definition,
    array $coord,
    int $revision
): int {
    $isCityBuilding = serverIsCityBuildingType($unitTypeId);
    $canMove = $isCityBuilding ? 0 : 1;
    $state = $isCityBuilding ? 'built' : 'ready';
    $experience = $isCityBuilding ? SERVER_GAME_INITIAL_EXPERIENCE
        : serverProducedUnitExperience($db, $gameId, $playerId, $cityId, $unitTypeId, $definition);
    $properties = serverUnitProperties($definition);
    if ($isCityBuilding) {
        $properties['cityBuilding'] = true;
        $properties['parentCityId'] = $cityId;
        $properties['hiddenOnMap'] = true;
        $properties['noControlZone'] = true;
        $properties['noFogReveal'] = true;
    }
    $statement = $db->prepare(
        'INSERT INTO server_game_units
         (game_id, client_key, owner_id, unit_type_id, unit_class, name, texture, can_move, nature, i, j,
          attack_value, defense_value, speed, view_range, state, health, max_health, experience, move_penalty,
          properties_json, revision)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)'
    );
    $clientKey = 'produced-' . $cityId . '-' . $turn . '-' . $unitTypeId . '-' . bin2hex(random_bytes(5));
    $statement->execute([
        $gameId, $clientKey, $playerId, $unitTypeId, $definition['class'], $definition['name'],
        $definition['texture'], $canMove, $definition['nature'], $coord['i'], $coord['j'], $definition['attack'],
        $definition['defense'], $definition['speed'], $definition['view_range'], $state,
        SERVER_GAME_INITIAL_HEALTH, SERVER_GAME_INITIAL_HEALTH, $experience,
        jsonObject($properties), $revision,
    ]);
    return (int) $db->lastInsertId();
}

function processCityProductions(
    PDO $db,
    int $gameId,
    int $turn,
    int $revision,
    array $tiles,
    array &$events
): void {
    $definitions = serverUnitDefinitions();
    $statement = $db->prepare(
        'SELECT p.*, u.i, u.j, u.properties_json, sp.state_json
         FROM productions p
         JOIN server_game_units u ON u.id = p.city_unit_id AND u.game_id = p.game_id
         LEFT JOIN server_game_players sp ON sp.game_id = p.game_id AND sp.player_id = p.player_id
         WHERE p.game_id = ? AND u.deleted_at IS NULL
         ORDER BY p.city_unit_id FOR UPDATE'
    );
    $statement->execute([$gameId]);
    $updateProduction = $db->prepare(
        'UPDATE productions SET production_points = ? WHERE game_id = ? AND city_unit_id = ?'
    );
    $deleteProduction = $db->prepare('DELETE FROM productions WHERE game_id = ? AND city_unit_id = ?');
    $updateCity = $db->prepare('UPDATE server_game_units SET properties_json = ?, revision = ? WHERE id = ?');

    foreach ($statement->fetchAll() as $production) {
        $unitTypeId = (string) $production['unit_type_id'];
        $definition = $definitions[$unitTypeId] ?? null;
        if (!$definition) {
            $deleteProduction->execute([$gameId, $production['city_unit_id']]);
            continue;
        }
        $playerState = json_decode((string) ($production['state_json'] ?? '{}'), true);
        if (!is_array($playerState)) $playerState = [];
        if ((float) ($playerState['money'] ?? 0) < 0) {
            serverTrace('production_paused_by_budget', [
                'city_id' => (int) $production['city_unit_id'], 'player_id' => (int) $production['player_id'],
            ]);
            continue;
        }
        $properties = json_decode((string) ($production['properties_json'] ?? '{}'), true);
        if (!is_array($properties)) $properties = [];
        $cityProperties = $properties['cityProperties'] ?? [];
        if (!is_array($cityProperties)) $cityProperties = [];
        $queue = productionQueue($production);
        if (!$queue) {
            $deleteProduction->execute([$gameId, $production['city_unit_id']]);
            setProductionProperties($properties, [], 0, false);
            $updateCity->execute([jsonObject($properties), $revision, (int) $production['city_unit_id']]);
            continue;
        }
        $cost = max(1.0, (float) $production['production_cost']);
        $perTurn = max(0.0, (float) ($cityProperties['productionPerTurn'] ?? 0));
        $points = min($cost, (float) $production['production_points'] + $perTurn);
        $cityId = (int) $production['city_unit_id'];
        $updateProduction->execute([$points, $gameId, $cityId]);
        setProductionProperties($properties, $queue, $points, false);
        $updateCity->execute([jsonObject($properties), $revision, $cityId]);
        serverTrace($points + 0.0001 >= $cost ? 'production_ready' : 'production_progress', [
            'city_id' => $cityId, 'unit_type_id' => $unitTypeId,
            'points' => $points, 'cost' => $cost, 'queue' => $queue,
        ]);
    }
}

function completeRequestedProductionsInTurn(
    PDO $db,
    int $gameId,
    int $turn,
    int $revision,
    array $tiles,
    array $requests,
    array &$events
): array {
    $definitions = serverUnitDefinitions();
    $results = [];
    foreach ($requests as $request) {
        $cityId = (int) $request['city_id'];
        $playerId = (int) $request['player_id'];
        $statement = $db->prepare(
            'SELECT u.*, p.unit_type_id, p.production_points, p.production_cost, p.queue_json
             FROM server_game_units u JOIN productions p ON p.game_id = u.game_id AND p.city_unit_id = u.id
             WHERE u.game_id = ? AND u.id = ? AND u.owner_id = ? AND u.unit_class = 3
               AND u.deleted_at IS NULL FOR UPDATE'
        );
        $statement->execute([$gameId, $cityId, $playerId]);
        $city = $statement->fetch();
        if (!$city) continue;
        $queue = productionQueue($city);
        $unitTypeId = $queue[0] ?? '';
        $definition = $definitions[$unitTypeId] ?? null;
        $points = max(0.0, (float) $city['production_points']);
        $cost = $definition ? max(1.0, (float) $definition['cost']) : INF;
        $pauseReason = null;
        if (!$definition || $points + 0.0001 < $cost) $pauseReason = 'insufficient_production_points';
        elseif (serverIsCityBuildingType($unitTypeId)
            && serverCityHasBuilding($db, $gameId, $playerId, $city, $unitTypeId)) {
            $pauseReason = 'city_building_already_built';
        }
        elseif (!serverCityHasProductionResources($tiles, $city, $unitTypeId)) $pauseReason = 'connected_resource_required';
        elseif (!serverIsCityBuildingType($unitTypeId)
            && serverMovableUnitCountAt($db, $gameId, (int) $city['i'], (int) $city['j']) >= SERVER_GAME_TILE_UNIT_LIMIT) {
            $pauseReason = 'unit_stack_full';
        }
        $coord = $pauseReason === null ? productionSpawnCoordinate($definition, $city, $tiles) : null;
        if ($pauseReason === null && $coord === null) $pauseReason = 'production_spawn_unavailable';
        if ($pauseReason !== null) {
            $results[] = ['city_id' => $cityId, 'status' => 'PAUSE', 'reason' => $pauseReason];
            serverTrace('turn_production_paused', end($results));
            continue;
        }

        $producedId = insertProducedUnit(
            $db, $gameId, $playerId, $cityId, $turn, $unitTypeId, $definition, $coord, $revision
        );
        // Each backlog item starts from zero; excess from the completed item is discarded.
        $remaining = 0.0;
        array_shift($queue);
        $properties = json_decode((string) ($city['properties_json'] ?? '{}'), true);
        if (!is_array($properties)) $properties = [];
        $cityProperties = $properties['cityProperties'] ?? [];
        if (!is_array($cityProperties)) $cityProperties = [];
        $cityProperties['productionStored'] = 0;
        $properties['cityProperties'] = $cityProperties;
        if ($queue) {
            $next = $queue[0];
            $update = $db->prepare(
                'UPDATE productions SET unit_type_id = ?, production_points = ?, production_cost = ?, queue_json = ?
                 WHERE game_id = ? AND city_unit_id = ?'
            );
            $update->execute([$next, $remaining, $definitions[$next]['cost'], jsonObject($queue), $gameId, $cityId]);
            setProductionProperties($properties, $queue, $remaining, false);
        } else {
            $db->prepare('DELETE FROM productions WHERE game_id = ? AND city_unit_id = ?')->execute([$gameId, $cityId]);
            $cityProperties['productionStored'] = 0;
            $properties['cityProperties'] = $cityProperties;
            setProductionProperties($properties, [], 0, false);
        }
        $db->prepare('UPDATE server_game_units SET properties_json = ?, revision = ? WHERE id = ?')
            ->execute([jsonObject($properties), $revision, $cityId]);
        $message = $city['name'] . ' completed ' . $definition['name'] . ' #' . $producedId . '.';
        eventForPlayers($events, [$playerId], 'production_completed', $city, null,
            (int) $city['i'], (int) $city['j'], $message,
            ['city_id' => $cityId, 'unit_id' => $producedId, 'unit_type_id' => $unitTypeId]);
        $results[] = ['city_id' => $cityId, 'status' => 'BUILT', 'unit_id' => $producedId, 'unit_type_id' => $unitTypeId];
    }
    return $results;
}

function saveEvents(PDO $db, int $gameId, int $turn, int $revision, array $events): void
{
    $statement = $db->prepare(
        'INSERT INTO server_game_events
         (game_id, turn_number, revision, audience_player_id, event_type, unit_id, other_unit_id, i, j, message, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    foreach ($events as $event) {
        $statement->execute([
            $gameId, $turn, $revision, $event['audience'], $event['type'], $event['unit_id'], $event['other_unit_id'],
            $event['i'], $event['j'], substr($event['message'], 0, 500), jsonObject($event['payload']),
        ]);
    }
}

function serverRelationKey(int $playerA, int $playerB): string
{
    return min($playerA, $playerB) . ':' . max($playerA, $playerB);
}

function loadServerRelations(PDO $db, int $gameId): array
{
    $statement = $db->prepare(
        'SELECT player_a, player_b, relation_status FROM server_game_relations WHERE game_id = ?'
    );
    $statement->execute([$gameId]);
    $relations = [];
    foreach ($statement->fetchAll() as $relation) {
        $relations[serverRelationKey((int) $relation['player_a'], (int) $relation['player_b'])]
            = (string) $relation['relation_status'];
    }
    return $relations;
}

function loadServerDirectionalRelations(PDO $db, int $gameId): array
{
    $statement = $db->prepare(
        'SELECT player_a, player_b, player_a_status, player_b_status
         FROM server_game_relations WHERE game_id = ?'
    );
    $statement->execute([$gameId]);
    $relations = [];
    foreach ($statement->fetchAll() as $relation) {
        $a = (int) $relation['player_a'];
        $b = (int) $relation['player_b'];
        $relations[$a . ':' . $b] = (string) $relation['player_a_status'];
        $relations[$b . ':' . $a] = (string) $relation['player_b_status'];
    }
    return $relations;
}

function serverDirectionalRelation(array $relations, int $viewerId, int $otherId): string
{
    if ($viewerId === $otherId) return 'self';
    $status = strtolower((string) ($relations[$viewerId . ':' . $otherId] ?? 'neutral'));
    return in_array($status, ['friend', 'enemy'], true) ? $status : 'neutral';
}

function storePlayerDirectionalRelations(
    PDO $db, int $gameId, int $playerId, array $preferences, int $revision
): void {
    if (!$preferences) return;
    $validPlayers = $db->prepare('SELECT 1 FROM server_game_players WHERE game_id = ? AND player_id = ?');
    $upsertA = $db->prepare(
        "INSERT INTO server_game_relations
         (game_id, player_a, player_b, relation_status, player_a_status, player_b_status, revision)
         VALUES (?, ?, ?, IF(? = 'enemy', 'war', 'neutral'), ?, 'neutral', ?)
         ON DUPLICATE KEY UPDATE player_a_status = VALUES(player_a_status),
             relation_status = IF(VALUES(player_a_status) = 'enemy' OR player_b_status = 'enemy', 'war', 'neutral'),
             revision = VALUES(revision)"
    );
    $upsertB = $db->prepare(
        "INSERT INTO server_game_relations
         (game_id, player_a, player_b, relation_status, player_a_status, player_b_status, revision)
         VALUES (?, ?, ?, IF(? = 'enemy', 'war', 'neutral'), 'neutral', ?, ?)
         ON DUPLICATE KEY UPDATE player_b_status = VALUES(player_b_status),
             relation_status = IF(player_a_status = 'enemy' OR VALUES(player_b_status) = 'enemy', 'war', 'neutral'),
             revision = VALUES(revision)"
    );
    $current = loadServerDirectionalRelations($db, $gameId);
    $count = 0;
    foreach ($preferences as $otherId => $rawStatus) {
        if (++$count > 256 || !is_numeric($otherId)) break;
        $otherId = (int) $otherId;
        if ($otherId <= 0 || $otherId === $playerId) continue;
        $status = strtolower(trim((string) $rawStatus));
        if (!in_array($status, ['neutral', 'friend', 'enemy'], true)) continue;
        if (serverDirectionalRelation($current, $playerId, $otherId) === $status) continue;
        $validPlayers->execute([$gameId, $otherId]);
        if (!$validPlayers->fetchColumn()) continue;
        $a = min($playerId, $otherId);
        $b = max($playerId, $otherId);
        if ($playerId === $a) $upsertA->execute([$gameId, $a, $b, $status, $status, $revision]);
        else $upsertB->execute([$gameId, $a, $b, $status, $status, $revision]);
    }
}

function appendRelationChangeEvents(PDO $db, int $gameId, int $revision, array &$events): void
{
    $statement = $db->prepare(
        'SELECT player_a, player_b, player_a_status, player_b_status
         FROM server_game_relations WHERE game_id = ? AND revision = ?'
    );
    $statement->execute([$gameId, $revision]);
    foreach ($statement->fetchAll() as $relation) {
        $a = (int) $relation['player_a'];
        $b = (int) $relation['player_b'];
        foreach ([[$a, $b, (string) $relation['player_a_status']],
                  [$b, $a, (string) $relation['player_b_status']]] as [$source, $target, $status]) {
            if ($status === 'neutral') continue;
            $message = 'Civilization ' . $source . ' declared ' . ($status === 'enemy' ? 'war on ' : 'friendship with ')
                . 'civilization ' . $target . '.';
            foreach ([$source, $target] as $audience) {
                $events[] = [
                    'audience' => $audience, 'type' => 'relation_changed', 'unit_id' => null,
                    'other_unit_id' => null, 'i' => 0, 'j' => 0, 'message' => $message,
                    'payload' => ['source_player_id' => $source, 'target_player_id' => $target, 'status' => $status],
                ];
            }
        }
    }
}

function enforceGlobalAiStrategicResourceWars(
    PDO $db, int $gameId, int $revision, array $tiles, array $units, array &$relations, array &$events
): void {
    $aiId = ensureGlobalAiUser($db);
    $strategic = [];
    foreach ($tiles as $tile) {
        if (in_array((int) ($tile['resource_type'] ?? 0), [3, 15, 34, 35, 36], true)) {
            $strategic[] = [(int) $tile['i'], (int) $tile['j'], (int) $tile['resource_type']];
        }
    }
    $declared = [];
    foreach ($units as $unit) {
        $owner = (int) $unit['owner_id'];
        if ($owner === $aiId || isset($declared[$owner]) || (float) $unit['health'] <= 0
            || (int) $unit['can_move'] || (string) $unit['unit_type_id'] === 'destroyed_city') continue;
        foreach ($strategic as [$resourceI, $resourceJ, $resourceType]) {
            if (abs((int) $unit['i'] - $resourceI) > 2 || abs((int) $unit['j'] - $resourceJ) > 2) continue;
            if (!serverPlayersAtWar($relations, $aiId, $owner)) {
                declareServerWar($db, $gameId, $aiId, $owner, $revision, $relations);
                $message = 'AI civilization declared war on civilization ' . $owner
                    . ' for building near strategic resource ' . $resourceType . '.';
                foreach ([$aiId, $owner] as $audience) {
                    $events[] = [
                        'audience' => $audience, 'type' => 'ai_resource_war', 'unit_id' => (int) $unit['id'],
                        'other_unit_id' => null, 'i' => $resourceI, 'j' => $resourceJ, 'message' => $message,
                        'payload' => ['ai_player_id' => $aiId, 'other_player_id' => $owner,
                            'resource_type' => $resourceType],
                    ];
                }
            }
            $declared[$owner] = true;
            break;
        }
    }
}

function serverPlayersAtWar(array $relations, int $playerA, int $playerB): bool
{
    return $playerA !== $playerB
        && ($relations[serverRelationKey($playerA, $playerB)] ?? 'neutral') === 'war';
}

function serverPlanInteractionIntent(array $plan, int $movingOwner, int $otherOwner): string
{
    if ($movingOwner === $otherOwner) return 'coexist';
    $targetOwner = isset($plan['target_owner_id']) ? (int) $plan['target_owner_id'] : 0;
    if ($targetOwner > 0 && $targetOwner !== $otherOwner) return 'auto';
    $intent = (string) ($plan['interaction_intent'] ?? 'auto');
    return in_array($intent, ['attack', 'coexist'], true) ? $intent : 'auto';
}

function serverPlansAllowCombat(array $plans, array $units, int $aId, int $bId, array $relations): bool
{
    $aOwner = (int) $units[$aId]['owner_id'];
    $bOwner = (int) $units[$bId]['owner_id'];
    if ($aOwner === $bOwner) return false;
    $aIntent = isset($plans[$aId]) ? serverPlanInteractionIntent($plans[$aId], $aOwner, $bOwner) : 'auto';
    $bIntent = isset($plans[$bId]) ? serverPlanInteractionIntent($plans[$bId], $bOwner, $aOwner) : 'auto';
    if ($aIntent === 'attack' || $bIntent === 'attack') return true;
    if ($aIntent === 'coexist' || $bIntent === 'coexist') return false;
    return serverPlayersAtWar($relations, $aOwner, $bOwner);
}

function serverPlanAttacksTile(
    array $plans, array $units, int $movingUnitId, int $i, int $j, array $relations
): bool {
    if (!isset($units[$movingUnitId]) || !serverIsMilitaryUnit($units[$movingUnitId])) return false;
    foreach ($units as $occupantId => $occupant) {
        if ($occupantId === $movingUnitId || (float) ($occupant['health'] ?? 0) <= 0
            || (int) $occupant['i'] !== $i || (int) $occupant['j'] !== $j
            || (int) $occupant['owner_id'] === (int) $units[$movingUnitId]['owner_id']) continue;
        if (serverPlansAllowCombat($plans, $units, $movingUnitId, $occupantId, $relations)) return true;
    }
    return false;
}

function serverUnitFoodUpkeep(array $unit): int
{
    if (!(int) ($unit['can_move'] ?? 0) || serverIsCityUnit($unit) || (float) ($unit['health'] ?? 0) <= 0) return 0;
    $type = (string) ($unit['unit_type_id'] ?? '');
    $base = 1;
    if (in_array($type, ['knight', 'pikeman', 'swordsman', 'trebuchet', 'frigate', 'elephant'], true)) $base = 3;
    elseif (in_array($type, ['horseman', 'chariot', 'catapult', 'galley', 'galleon'], true)) $base = 2;
    return serverIsMilitaryUnit($unit) ? $base * 4 : $base;
}

function serverUnitGoldUpkeep(array $unit): int
{
    if (!(int) ($unit['can_move'] ?? 0) || serverIsCityUnit($unit) || (float) ($unit['health'] ?? 0) <= 0) return 0;
    return serverUnitTypeGoldUpkeep((string) ($unit['unit_type_id'] ?? ''));
}

function serverUnitTypeGoldUpkeep(string $unitTypeId): int
{
    if (in_array($unitTypeId, ['knight', 'trebuchet', 'frigate'], true)) return 12;
    if (in_array($unitTypeId, ['pikeman', 'swordsman', 'longbow'], true)) return 6;
    return 0;
}

function serverPrepareCityInfrastructure(
    PDO $db, int $gameId, int $turn, int $revision, array &$tiles, array &$units, array &$events
): array {
    $counts = [];
    $cities = [];
    foreach ($units as $unitId => $unit) {
        if ((float) $unit['health'] > 0 && serverIsCityUnit($unit)) $cities[$unitId] = $unit;
    }
    $updateTile = $db->prepare(
        'UPDATE server_game_map SET modifiers_json = ?, revision = ? WHERE game_id = ? AND i = ? AND j = ?'
    );
    foreach ($units as $unitId => &$unit) {
        if ((float) $unit['health'] <= 0 || (int) ($unit['unit_class'] ?? -1) !== 4) continue;
        $type = (string) ($unit['unit_type_id'] ?? '');
        if ($type !== 'building_road' && $type !== 'building_workshop'
            && $type !== 'building_network' && $type !== 'building_fortification') continue;
        $properties = json_decode((string) ($unit['properties_json'] ?? '{}'), true);
        if (!is_array($properties)) $properties = [];
        $parentId = (int) ($properties['parentCityId'] ?? 0);
        $validParent = $parentId > 0 && isset($cities[$parentId])
            && (int) $cities[$parentId]['owner_id'] === (int) $unit['owner_id'];
        if (!$validParent) {
            $parentId = serverNearestOwnedCityId(
                $cities, (int) $unit['owner_id'], (int) $unit['i'], (int) $unit['j']
            ) ?? 0;
            $properties['parentCityId'] = $parentId ?: null;
            $unit['properties_json'] = jsonObject($properties);
        }
        if ($parentId <= 0 && $type === 'building_road') {
            $unit['health'] = 0.0;
            $key = coordinateKey((int) $unit['i'], (int) $unit['j']);
            if (isset($tiles[$key])) {
                $modifiers = json_decode((string) ($tiles[$key]['modifiers_json'] ?? '{}'), true);
                if (!is_array($modifiers)) $modifiers = [];
                unset($modifiers['road']);
                $tiles[$key]['modifiers_json'] = jsonObject($modifiers);
                $tiles[$key]['revision'] = $revision;
                $updateTile->execute([
                    $tiles[$key]['modifiers_json'], $revision, $gameId,
                    (int) $unit['i'], (int) $unit['j'],
                ]);
            }
            $message = 'Road #' . $unitId . ' was destroyed because it has no parent City.';
            eventForPlayers($events, [(int) $unit['owner_id']], 'orphan_road_destroyed', $unit, null,
                (int) $unit['i'], (int) $unit['j'], $message, ['reason' => 'parent_city_missing']);
            serverTrace('orphan_road_destroyed', [
                'turn' => $turn, 'unit_id' => $unitId, 'owner_id' => (int) $unit['owner_id'],
                'i' => (int) $unit['i'], 'j' => (int) $unit['j'],
            ]);
            continue;
        }
        if ($parentId > 0) {
            if (!isset($counts[$parentId])) {
                $counts[$parentId] = [
                    'roads' => 0, 'workshops' => 0, 'networks' => 0, 'fortifications' => 0,
                ];
            }
            // The mandatory road under a City is part of the City center and
            // does not consume the production it exists to bootstrap.
            $isCityCenterRoad = $type === 'building_road'
                && (int) $cities[$parentId]['i'] === (int) $unit['i']
                && (int) $cities[$parentId]['j'] === (int) $unit['j'];
            if ($type === 'building_road' && !$isCityCenterRoad) ++$counts[$parentId]['roads'];
            if ($type === 'building_workshop') ++$counts[$parentId]['workshops'];
            if ($type === 'building_network') ++$counts[$parentId]['networks'];
            if ($type === 'building_fortification') ++$counts[$parentId]['fortifications'];
        }
    }
    unset($unit);
    return $counts;
}

function serverRoadConnectedTileKeys(array $tiles, int $cityI, int $cityJ): array
{
    $keys = [];
    $queue = [[$cityI, $cityJ]];
    for ($cursor = 0; $cursor < count($queue); ++$cursor) {
        [$i, $j] = $queue[$cursor];
        $key = coordinateKey($i, $j);
        if (isset($keys[$key]) || !isset($tiles[$key])) continue;
        $origin = $i === $cityI && $j === $cityJ;
        $modifiers = json_decode((string) ($tiles[$key]['modifiers_json'] ?? '{}'), true);
        if (!$origin && (!is_array($modifiers) || empty($modifiers['road']))) continue;
        $keys[$key] = true;
        foreach (serverNeighborDirections() as [$di, $dj]) $queue[] = [$i + $di, $j + $dj];
    }
    return $keys;
}

function serverCityBuildingTypesInUnits(array $units, int $cityId, int $ownerId): array
{
    $result = [];
    foreach ($units as $unit) {
        if ((int) ($unit['owner_id'] ?? -1) !== $ownerId
            || (int) ($unit['unit_class'] ?? -1) !== 4
            || (float) ($unit['health'] ?? 0) <= 0) continue;
        $properties = json_decode((string) ($unit['properties_json'] ?? '{}'), true);
        if (!is_array($properties) || empty($properties['cityBuilding'])
            || (int) ($properties['parentCityId'] ?? 0) !== $cityId) continue;
        $result[(string) $unit['unit_type_id']] = true;
    }
    return $result;
}

function serverCityRoadConnectedToAnotherCity(
    array $city, int $cityId, int $ownerId, array $cities, array $tiles
): bool {
    $connected = serverRoadConnectedTileKeys($tiles, (int) $city['i'], (int) $city['j']);
    foreach ($cities as $otherId => $other) {
        if ((int) $otherId === $cityId || (int) ($other['owner_id'] ?? -1) !== $ownerId
            || (float) ($other['health'] ?? 0) <= 0 || !serverIsCityUnit($other)) continue;
        if (isset($connected[coordinateKey((int) $other['i'], (int) $other['j'])])) return true;
    }
    return false;
}

function serverMarketFoodTransfer(bool $hasMarket, bool $connectedCity, int $availableFood): int
{
    return $hasMarket && $connectedCity && $availableFood > 0 ? 1 : 0;
}

function serverTileHasRoadRequiredImprovement(array $modifiers): bool
{
    foreach (['irrigation', 'pasture', 'farm', 'plantation', 'camp', 'fishing_boats',
        'quarry', 'winery', 'fortification', 'cottage', 'workshop', 'mine'] as $improvement) {
        if (!empty($modifiers[$improvement])) return true;
    }
    return false;
}

function serverCityEconomicTileKeys(array $city, array $tiles): array
{
    $keys = serverRoadConnectedTileKeys($tiles, (int) $city['i'], (int) $city['j']);
    foreach (array_keys($keys) as $key) {
        $tile = $tiles[$key] ?? null;
        [$tileI, $tileJ] = array_map('intval', explode(':', (string) $key, 2));
        if (!$tile || abs((int) ($tile['i'] ?? $tileI) - (int) $city['i']) > 4
            || abs((int) ($tile['j'] ?? $tileJ) - (int) $city['j']) > 4) unset($keys[$key]);
    }
    // CITY-INCOME-011A: a developed Tile can terminate an adjacent connected
    // road. Do not feed the endpoint back into the road BFS, so it cannot
    // connect additional Tiles or satisfy strategic-resource road checks.
    for ($di = -4; $di <= 4; ++$di) {
        for ($dj = -4; $dj <= 4; ++$dj) {
            $key = coordinateKey((int) $city['i'] + $di, (int) $city['j'] + $dj);
            if (!isset($tiles[$key])) continue;
            $modifiers = json_decode((string) ($tiles[$key]['modifiers_json'] ?? '{}'), true);
            $modifiers = is_array($modifiers) ? $modifiers : [];
            if (!serverTileHasRoadRequiredImprovement($modifiers) || !empty($modifiers['road'])) continue;
            foreach (serverNeighborDirections() as [$neighborDi, $neighborDj]) {
                $roadKey = coordinateKey(
                    (int) $city['i'] + $di + $neighborDi,
                    (int) $city['j'] + $dj + $neighborDj
                );
                if (!isset($keys[$roadKey], $tiles[$roadKey])) continue;
                $roadModifiers = json_decode((string) ($tiles[$roadKey]['modifiers_json'] ?? '{}'), true);
                if (is_array($roadModifiers) && !empty($roadModifiers['road'])) {
                    $keys[$key] = true;
                    break;
                }
            }
        }
    }
    for ($di = -1; $di <= 1; ++$di) {
        for ($dj = -1; $dj <= 1; ++$dj) {
            if (serverHexDistance(0, 0, $di, $dj) > 1) continue;
            $key = coordinateKey((int) $city['i'] + $di, (int) $city['j'] + $dj);
            if (!isset($tiles[$key])) continue;
            $modifiers = json_decode((string) ($tiles[$key]['modifiers_json'] ?? '{}'), true);
            $modifiers = is_array($modifiers) ? $modifiers : [];
            if (($di !== 0 || $dj !== 0) && serverTileHasRoadRequiredImprovement($modifiers)
                && empty($modifiers['road'])) continue;
            $keys[$key] = true;
        }
    }
    for ($di = -3; $di <= 3; ++$di) {
        for ($dj = -3; $dj <= 3; ++$dj) {
            if (serverHexDistance(0, 0, $di, $dj) > 3) continue;
            $key = coordinateKey((int) $city['i'] + $di, (int) $city['j'] + $dj);
            if (!isset($tiles[$key])) continue;
            $modifiers = json_decode((string) ($tiles[$key]['modifiers_json'] ?? '{}'), true);
            if (is_array($modifiers) && !empty($modifiers['network'])) $keys[$key] = true;
        }
    }
    return $keys;
}

function serverCityOptimizationScore(array $income, string $optimization): float
{
    if ($optimization === 'food') {
        return $income['food'] * 100 + $income['production'] * 3 + $income['money'] * 2;
    }
    if ($optimization === 'production') {
        return $income['production'] * 100 + $income['food'] * 3 + $income['money'] * 2;
    }
    if ($optimization === 'gold') {
        return $income['money'] * 100 + $income['food'] * 3 + $income['production'] * 2;
    }
    return $income['food'] * 4 + $income['production'] * 3 + $income['money'] * 2;
}

function serverCityWorkedTiles(array $city, array $tiles, array $blockedTileKeys = []): array
{
    $population = serverCityPopulation($city);
    $worked = [];
    $used = [];
    $eligible = serverCityEconomicTileKeys($city, $tiles);
    $properties = json_decode((string) ($city['properties_json'] ?? '{}'), true);
    $optimization = is_array($properties) ? (string) ($properties['cityOptimization'] ?? 'balanced') : 'balanced';
    if (!in_array($optimization, ['food', 'production', 'gold', 'balanced'], true)) $optimization = 'balanced';
    for ($citizen = 0; $citizen < $population; ++$citizen) {
        $best = null;
        $bestScore = -INF;
        foreach ($eligible as $key => $_) {
            if (isset($used[$key]) || isset($blockedTileKeys[$key]) || !isset($tiles[$key])) continue;
            $income = serverTileIncome(
                $tiles[$key], $key === coordinateKey((int) $city['i'], (int) $city['j'])
            );
            $score = serverCityOptimizationScore($income, $optimization);
            if ($score > $bestScore || ($score === $bestScore && ($best === null || strcmp($key, $best['key']) < 0))) {
                $best = ['key' => $key, 'income' => $income];
                $bestScore = $score;
            }
        }
        if ($best === null) break;
        $used[$best['key']] = true;
        $worked[] = $best;
    }
    return $worked;
}

function serverCityCitizenRecords(array $workedTiles): array
{
    $citizens = [];
    foreach ($workedTiles as $worked) {
        if (!is_array($worked) || !isset($worked['key'], $worked['income'])) continue;
        [$i, $j] = array_map('intval', explode(':', (string) $worked['key'], 2));
        $citizens[] = [
            'coord' => ['i' => $i, 'j' => $j],
            'income' => [
                'food' => (int) ($worked['income']['food'] ?? 0),
                'production' => (int) ($worked['income']['production'] ?? 0),
                'money' => (int) ($worked['income']['money'] ?? 0),
            ],
        ];
    }
    return $citizens;
}

function serverLootEnemyImprovements(
    array &$units, array &$tiles, array $relations, int $revision, array &$events
): array {
    $rewards = [];
    $rewardTable = [
        'road' => ['food' => 2, 'gold' => 2],
        'irrigation' => ['food' => 8, 'gold' => 2],
        'farm' => ['food' => 8, 'gold' => 2],
        'pasture' => ['food' => 7, 'gold' => 3],
        'camp' => ['food' => 6, 'gold' => 4],
        'fishing_boats' => ['food' => 8, 'gold' => 3],
        'network' => ['food' => 8, 'gold' => 3],
        'plantation' => ['food' => 4, 'gold' => 8],
        'winery' => ['food' => 4, 'gold' => 8],
        'cottage' => ['food' => 2, 'gold' => 8],
        'mine' => ['food' => 2, 'gold' => 7],
        'quarry' => ['food' => 2, 'gold' => 6],
        'workshop' => ['food' => 3, 'gold' => 6],
        'fortification' => ['food' => 4, 'gold' => 4],
    ];
    foreach ($units as $buildingId => &$building) {
        if ((int) ($building['unit_class'] ?? -1) !== 4
            || (string) ($building['unit_type_id'] ?? '') === 'destroyed_city') continue;
        $buildingOwner = (int) $building['owner_id'];
        $looterId = null;
        foreach ($units as $candidateId => $candidate) {
            if (!serverIsMilitaryUnit($candidate) || (float) $candidate['health'] <= 0
                || (int) $candidate['i'] !== (int) $building['i']
                || (int) $candidate['j'] !== (int) $building['j']
                || !serverPlayersAtWar($relations, (int) $candidate['owner_id'], $buildingOwner)) continue;
            $looterId = (int) $candidateId;
            break;
        }
        if ($looterId === null) continue;
        $modifier = preg_replace('/^building_/', '', (string) $building['unit_type_id']);
        if (!isset($rewardTable[$modifier])) continue;
        $looterOwner = (int) $units[$looterId]['owner_id'];
        $reward = $rewardTable[$modifier];
        if (!isset($rewards[$looterOwner])) $rewards[$looterOwner] = ['food' => 0, 'gold' => 0];
        $rewards[$looterOwner]['food'] += $reward['food'];
        $rewards[$looterOwner]['gold'] += $reward['gold'];
        $building['health'] = 0.0;

        $key = coordinateKey((int) $building['i'], (int) $building['j']);
        if (isset($tiles[$key])) {
            $modifiers = json_decode((string) ($tiles[$key]['modifiers_json'] ?? '{}'), true);
            if (!is_array($modifiers)) $modifiers = [];
            unset($modifiers[$modifier]);
            if ($modifier === 'cottage') unset($modifiers['cottageAge'], $modifiers['cottageStage']);
            if ($modifier === 'irrigation') unset($modifiers['irrigationCityFood']);
            if ($modifier === 'fortification') unset($modifiers['fortificationDefensePercent']);
            $tiles[$key]['modifiers_json'] = jsonObject($modifiers);
            $tiles[$key]['revision'] = $revision;
        }
        $message = $units[$looterId]['name'] . ' #' . $looterId . ' looted enemy '
            . str_replace('_', ' ', $modifier) . ' for ' . $reward['food'] . ' food and '
            . $reward['gold'] . ' gold.';
        eventForPlayers($events, [$looterOwner, $buildingOwner], 'improvement_looted',
            $units[$looterId], $building, (int) $building['i'], (int) $building['j'], $message, [
                'building_id' => (int) $buildingId, 'improvement' => $modifier,
                'food' => $reward['food'], 'gold' => $reward['gold'],
            ]);
    }
    unset($building);
    return $rewards;
}

function serverCityFoodResolution(int $population, float $storedFood, float $netFood): array
{
    $population = max(1, $population);
    $nextStoredFood = $storedFood + $netFood;
    if ($nextStoredFood >= 0) {
        return ['population' => $population, 'stored_food' => $nextStoredFood, 'starved' => false, 'collapsed' => false];
    }
    return [
        'population' => max(0, $population - 1),
        'stored_food' => 0.0,
        'starved' => true,
        'collapsed' => $population === 1,
    ];
}

function processTerrainImprovementAges(
    PDO $db, int $gameId, int $turn, int $revision, array &$tiles, array &$events
): void {
    $update = $db->prepare(
        'UPDATE server_game_map SET modifiers_json = ?, revision = ? WHERE game_id = ? AND i = ? AND j = ?'
    );
    foreach ($tiles as $key => &$tile) {
        $modifiers = json_decode((string) ($tile['modifiers_json'] ?? '{}'), true);
        if (!is_array($modifiers) || empty($modifiers['cottage'])) continue;
        $before = max(0, (int) ($modifiers['cottageAge'] ?? 0));
        $after = $before + 1;
        $modifiers['cottageAge'] = $after;
        $beforeStage = serverCottageStage($before);
        $afterStage = serverCottageStage($after);
        $modifiers['cottageStage'] = $afterStage;
        $tile['modifiers_json'] = jsonObject($modifiers);
        $tileRevision = $beforeStage !== $afterStage ? $revision : (int) ($tile['revision'] ?? 0);
        $tile['revision'] = $tileRevision;
        $update->execute([$tile['modifiers_json'], $tileRevision, $gameId, (int) $tile['i'], (int) $tile['j']]);
        if ($beforeStage !== $afterStage) {
            serverTrace('cottage_transformed', [
                'turn' => $turn, 'i' => (int) $tile['i'], 'j' => (int) $tile['j'],
                'from' => $beforeStage, 'to' => $afterStage, 'age' => $after,
            ]);
        }
    }
    unset($tile);
}

function processPlayerEconomies(
    PDO $db,
    int $gameId,
    int $turn,
    int $revision,
    array $tiles,
    array &$units,
    array &$events,
    array $relations = [],
    array $lootRewards = []
): void {
    $infrastructure = serverPrepareCityInfrastructure(
        $db, $gameId, $turn, $revision, $tiles, $units, $events
    );
    $productionStatement = $db->prepare(
        'SELECT city_unit_id, unit_type_id, queue_json FROM productions WHERE game_id = ?'
    );
    $productionStatement->execute([$gameId]);
    $producingCities = [];
    foreach ($productionStatement->fetchAll() as $production) {
        if (productionQueue($production)) {
            $producingCities[(int) $production['city_unit_id']] = true;
        }
    }
    $players = [];
    $marketFoodAvailable = [];
    $playerStateStatement = $db->prepare(
        'SELECT player_id, state_json FROM server_game_players WHERE game_id = ?'
    );
    $playerStateStatement->execute([$gameId]);
    foreach ($playerStateStatement->fetchAll() as $playerStateRow) {
        $state = json_decode((string) ($playerStateRow['state_json'] ?? '{}'), true);
        $marketFoodAvailable[(int) $playerStateRow['player_id']] = max(
            0, (int) (is_array($state) ? ($state['food'] ?? 200) : 200)
        );
    }
    $blockedByOwner = [];
    $firstCityByOwner = [];
    $fallbackCityByOwner = [];
    foreach ($units as $unitId => $unit) {
        if ((float) $unit['health'] <= 0) continue;
        $owner = (int) $unit['owner_id'];
        if (serverIsCityUnit($unit)) {
            $candidate = ['id' => (int) $unitId, 'i' => (int) $unit['i'], 'j' => (int) $unit['j']];
            if (!isset($fallbackCityByOwner[$owner]) || (int) $unitId < $fallbackCityByOwner[$owner]['id']) {
                $fallbackCityByOwner[$owner] = $candidate;
            }
            $properties = json_decode((string) ($unit['properties_json'] ?? '{}'), true);
            if (is_array($properties) && (int) ($properties['capitalOwnerId'] ?? -1) === $owner) {
                $firstCityByOwner[$owner] = $candidate;
            }
        }
    }
    foreach ($fallbackCityByOwner as $owner => $city) {
        if (!isset($firstCityByOwner[$owner])) $firstCityByOwner[$owner] = $city;
    }
    foreach ($units as $occupant) {
        if ((float) $occupant['health'] <= 0 || !(int) ($occupant['can_move'] ?? 0)) continue;
        $occupantOwner = (int) $occupant['owner_id'];
        $key = coordinateKey((int) $occupant['i'], (int) $occupant['j']);
        foreach ($firstCityByOwner as $owner => $_) {
            if (serverPlayersAtWar($relations, (int) $owner, $occupantOwner)) {
                $blockedByOwner[$owner][$key] = true;
            }
        }
    }
    foreach ($units as $unitId => &$unit) {
        if ((float) $unit['health'] <= 0) continue;
        $owner = (int) $unit['owner_id'];
        if (!isset($players[$owner])) {
            $players[$owner] = ['food_income' => 0, 'gold_income' => 0, 'market_food_spent' => 0];
        }
        if (!serverIsCityUnit($unit)) continue;
        $food = 0; $production = 0; $gold = 0;
        $population = serverCityPopulation($unit);
        $workedTiles = serverCityWorkedTiles($unit, $tiles, $blockedByOwner[$owner] ?? []);
        $tileCapacity = max(1, count($workedTiles));
        if ($population > $tileCapacity) {
            $populationBeforeCapacity = $population;
            $population = serverSetCityPopulation($unit, $tileCapacity);
            $message = $unit['name'] . ' population was reduced from ' . $populationBeforeCapacity
                . ' to ' . $population . ' because only connected worked Tiles are available.';
            eventForPlayers($events, [$owner], 'city_population_capacity_reduced', $unit, null,
                (int) $unit['i'], (int) $unit['j'], $message,
                ['city_id' => (int) $unitId, 'population' => $population]);
            serverTrace('city_population_capacity_reduced', [
                'turn' => $turn, 'city_id' => (int) $unitId,
                'population_before' => $populationBeforeCapacity, 'population_after' => $population,
            ]);
        }
        foreach ($workedTiles as $worked) {
            $food += $worked['income']['food'];
            $production += $worked['income']['production'];
            $gold += $worked['income']['money'];
        }
        $costs = $infrastructure[$unitId]
            ?? ['roads' => 0, 'workshops' => 0, 'networks' => 0, 'fortifications' => 0];
        $roadProductionCost = max(0, (int) $costs['roads']);
        $networkProductionCost = max(0, (int) $costs['networks']);
        $fortificationProductionCost = max(0, (int) $costs['fortifications']) * 2;
        $netProduction = max(0, $production - $roadProductionCost
            - $networkProductionCost - $fortificationProductionCost);
        $productionActive = !empty($producingCities[(int) $unitId]) && $netProduction > 0;
        $workshopCost = $productionActive ? max(0, (int) $costs['workshops']) * 2 : 0;
        $foodConsumption = $population + $workshopCost;
        $foodExcess = $food - $foodConsumption;
        $marketFoodTransfer = 0;
        $cityBuildings = serverCityBuildingTypesInUnits($units, (int) $unitId, $owner);
        $hasMarket = isset($cityBuildings['market']);
        $marketConnected = $hasMarket && ($marketFoodAvailable[$owner] ?? 0) > 0
            && serverCityRoadConnectedToAnotherCity($unit, (int) $unitId, $owner, $units, $tiles);
        $marketFoodTransfer = serverMarketFoodTransfer(
            $hasMarket,
            $marketConnected,
            (int) ($marketFoodAvailable[$owner] ?? 0)
        );
        if ($marketFoodTransfer > 0) {
            --$marketFoodAvailable[$owner];
            ++$players[$owner]['market_food_spent'];
        }
        $netGold = $gold;
        $capital = $firstCityByOwner[$owner] ?? ['i' => (int) $unit['i'], 'j' => (int) $unit['j']];
        $capitalDistance = serverHexDistance(
            (int) $unit['i'], (int) $unit['j'], (int) $capital['i'], (int) $capital['j']
        );
        $distanceLossRate = $population < 5 ? min(0.90, 0.90 * $capitalDistance / 100.0) : 0.0;
        $largeCityLossRate = $population <= 10 ? 0.0 : min(0.50, ($population - 10) * 0.05);
        $storageLossRate = 1.0 - (1.0 - $distanceLossRate) * (1.0 - $largeCityLossRate);
        $cityFoodExcess = $foodExcess > 0
            ? (int) floor($foodExcess * (1.0 - $largeCityLossRate)) : $foodExcess;
        $cityFoodExcess += $marketFoodTransfer;
        $storedFoodIncome = (int) floor(
            max(0, $cityFoodExcess - $marketFoodTransfer) * (1.0 - $distanceLossRate)
        );
        $storedGoldIncome = $netGold > 0
            ? (int) floor($netGold * (1.0 - $storageLossRate)) : $netGold;
        $properties = json_decode((string) ($unit['properties_json'] ?? '{}'), true);
        if (!is_array($properties)) $properties = [];
        $cityProperties = $properties['cityProperties'] ?? [];
        if (!is_array($cityProperties)) $cityProperties = [];
        $foodResult = serverCityFoodResolution(
            $population, max(0.0, (float) ($properties['cityFoodStored'] ?? 0)), $cityFoodExcess
        );
        $properties['cityFoodStored'] = $foodResult['stored_food'];
        $properties['cityPopulation'] = max(1, (int) $foodResult['population']);
        if (!isset($properties['economy']) || !is_array($properties['economy'])) {
            $properties['economy'] = [];
        }
        $properties['economy']['citizens'] = serverCityCitizenRecords(array_slice(
            $workedTiles, 0, (int) $foodResult['population']
        ));
        $cityProperties['productionPerTurn'] = $netProduction;
        $properties['cityProperties'] = $cityProperties;
        $properties['lastCityIncome'] = [
            'food' => $cityFoodExcess, 'grossFood' => $food,
            'production' => $netProduction, 'grossProduction' => $production,
            'money' => $netGold, 'grossMoney' => $gold,
            'foodConsumption' => $foodConsumption,
            'roadProductionCost' => $roadProductionCost,
            'networkProductionCost' => $networkProductionCost,
            'fortificationProductionCost' => $fortificationProductionCost,
            'workshopFoodCost' => $workshopCost,
            'workshopGoldCost' => 0,
            'marketFoodTransfer' => $marketFoodTransfer,
            'productionActive' => $productionActive,
            'capitalDistance' => $capitalDistance,
            'storageLossPercent' => round($storageLossRate * 100, 2),
            'largeCityFoodLossPercent' => round($largeCityLossRate * 100, 2),
            'storageFood' => $storedFoodIncome,
            'storageMoney' => $storedGoldIncome,
        ];
        $unit['properties_json'] = jsonObject($properties);
        if ($foodResult['starved']) {
            if ($foodResult['collapsed']) {
                $destroyedProperties = [
                    'destroyedCity' => true,
                    'economicClass' => 'destroyed_city',
                    'noControlZone' => true,
                    'noFogReveal' => true,
                ];
                $unit['unit_type_id'] = 'destroyed_city';
                $unit['unit_class'] = 4;
                $unit['name'] = 'Destroyed City';
                $unit['texture'] = 871;
                $unit['can_move'] = 0;
                $unit['attack_value'] = 0.0;
                $unit['defense_value'] = 0.0;
                $unit['speed'] = 0.0;
                $unit['view_range'] = 0;
                $unit['state'] = 'destroyed';
                $unit['properties_json'] = jsonObject($destroyedProperties);
                $db->prepare(
                    "UPDATE server_game_units SET occupancy_key = NULL, unit_type_id = 'destroyed_city', unit_class = 4,
                     name = 'Destroyed City', texture = 871, can_move = 0, attack_value = 0, defense_value = 0,
                     speed = 0, view_range = 0, state = 'destroyed', properties_json = ?, revision = ? WHERE id = ?"
                )->execute([$unit['properties_json'], $revision, $unitId]);
                $db->prepare('DELETE FROM productions WHERE game_id = ? AND city_unit_id = ?')
                    ->execute([$gameId, $unitId]);
                $tileKey = coordinateKey((int) $unit['i'], (int) $unit['j']);
                if (isset($tiles[$tileKey])) {
                    $tiles[$tileKey]['modifiers_json'] = '{}';
                    $tiles[$tileKey]['revision'] = $revision;
                    $db->prepare(
                        'UPDATE server_game_map SET modifiers_json = ?, revision = ? WHERE game_id = ? AND i = ? AND j = ?'
                    )->execute(['{}', $revision, $gameId, (int) $unit['i'], (int) $unit['j']]);
                }
                $message = 'City #' . $unitId . ' starved and became a destroyed City.';
                eventForPlayers($events, [$owner], 'city_destroyed_by_starvation', $unit, null,
                    (int) $unit['i'], (int) $unit['j'], $message,
                    ['city_id' => (int) $unitId, 'replacement_allowed' => true]);
            } else {
                $message = $unit['name'] . ' is starving: population decreased from '
                    . $population . ' to ' . $foodResult['population'] . '.';
                eventForPlayers($events, [$owner], 'city_starvation', $unit, null,
                    (int) $unit['i'], (int) $unit['j'], $message,
                    ['city_id' => (int) $unitId, 'population' => (int) $foodResult['population']]);
            }
            serverTrace('city_starvation', [
                'turn' => $turn, 'city_id' => (int) $unitId, 'owner_id' => $owner,
                'population_before' => $population, 'population_after' => (int) $foodResult['population'],
                'food_income' => $food, 'food_consumption' => $foodConsumption,
                'collapsed' => $foodResult['collapsed'],
            ]);
        }
        $players[$owner]['food_income'] += $storedFoodIncome;
        $players[$owner]['gold_income'] += $storedGoldIncome;
    }
    unset($unit);

    foreach ($lootRewards as $owner => $reward) {
        if (!isset($players[$owner])) {
            $players[$owner] = ['food_income' => 0, 'gold_income' => 0, 'market_food_spent' => 0];
        }
        $players[$owner]['food_income'] += max(0, (int) ($reward['food'] ?? 0));
        $players[$owner]['gold_income'] += max(0, (int) ($reward['gold'] ?? 0));
    }

    $loadState = $db->prepare('SELECT state_json FROM server_game_players WHERE game_id = ? AND player_id = ? FOR UPDATE');
    $saveState = $db->prepare('UPDATE server_game_players SET state_json = ? WHERE game_id = ? AND player_id = ?');
    foreach ($players as $playerId => $income) {
        $loadState->execute([$gameId, $playerId]);
        $state = json_decode((string) ($loadState->fetchColumn() ?: '{}'), true);
        $state = normalizePlayerState(is_array($state) ? $state : []);
        // A message belongs to one resolved turn. New events below may replace
        // it, otherwise the client receives an empty line on this turn.
        $state['oneTurnMessage'] = '';
        $availableFood = max(0, (int) ($state['food'] ?? 200)) + $income['food_income']
            - max(0, (int) ($income['market_food_spent'] ?? 0));
        $availableGold = max(0, (int) ($state['money'] ?? 0)) + $income['gold_income'];

        $candidates = [];
        $foodUpkeep = 0; $goldUpkeep = 0;
        foreach ($units as $unitId => $unit) {
            if ((int) $unit['owner_id'] !== $playerId || (float) $unit['health'] <= 0) continue;
            $foodCost = serverUnitFoodUpkeep($unit);
            $goldCost = serverUnitGoldUpkeep($unit);
            $foodUpkeep += $foodCost; $goldUpkeep += $goldCost;
            if ($foodCost || $goldCost) $candidates[] = [$unitId, $foodCost, $goldCost];
        }
        usort($candidates, static function(array $a, array $b): int {
            return ($b[1] + $b[2] * 2) <=> ($a[1] + $a[2] * 2) ?: $b[0] <=> $a[0];
        });
        while (($foodUpkeep > $availableFood || $goldUpkeep > $availableGold) && $candidates) {
            [$unitId, $foodCost, $goldCost] = array_shift($candidates);
            if (!isset($units[$unitId]) || (float) $units[$unitId]['health'] <= 0) continue;
            $units[$unitId]['health'] = 0.0;
            $foodUpkeep -= $foodCost; $goldUpkeep -= $goldCost;
            $message = $units[$unitId]['name'] . ' #' . $unitId . ' was disbanded because food or gold was insufficient.';
            $state['oneTurnMessage'] = $message;
            eventForPlayers($events, [$playerId], 'unit_disbanded', $units[$unitId], null,
                (int) $units[$unitId]['i'], (int) $units[$unitId]['j'], $message,
                ['food_cost' => $foodCost, 'gold_cost' => $goldCost]);
        }
        $state['food'] = max(0, $availableFood - $foodUpkeep);
        $state['money'] = max(0, $availableGold - $goldUpkeep);
        $state['lastGrossFoodIncome'] = $income['food_income'];
        $state['lastFoodUpkeep'] = $foodUpkeep;
        $state['lastGrossMoneyIncome'] = $income['gold_income'];
        $state['lastMaintenance'] = $goldUpkeep;
        $state['lastAccountIncome'] = $income['gold_income'] - $goldUpkeep;
        $state['lastMoneyIncome'] = $state['lastAccountIncome'];
        $state['lastAvailableMoney'] = $state['lastAccountIncome'];
        $saveState->execute([jsonObject($state), $gameId, $playerId]);
        serverTrace('player_economy_processed', [
            'turn' => $turn, 'player_id' => $playerId, 'food' => $state['food'], 'gold' => $state['money'],
            'food_income' => $income['food_income'], 'food_upkeep' => $foodUpkeep,
            'market_food_spent' => (int) ($income['market_food_spent'] ?? 0),
            'gold_income' => $income['gold_income'], 'gold_upkeep' => $goldUpkeep,
        ]);
    }
}

function declareServerWar(PDO $db, int $gameId, int $playerA, int $playerB, int $revision, array &$relations): void
{
    if ($playerA === $playerB) return;
    $a = min($playerA, $playerB);
    $b = max($playerA, $playerB);
    $attackerIsA = $playerA === $a;
    $statement = $db->prepare(
        "INSERT INTO server_game_relations
         (game_id, player_a, player_b, relation_status, player_a_status, player_b_status, revision)
         VALUES (?, ?, ?, 'war', ?, ?, ?)
         ON DUPLICATE KEY UPDATE relation_status = 'war',
             player_a_status = IF(? = 1, 'enemy', player_a_status),
             player_b_status = IF(? = 1, 'enemy', player_b_status),
             revision = VALUES(revision)"
    );
    $statement->execute([
        $gameId, $a, $b, $attackerIsA ? 'enemy' : 'neutral', $attackerIsA ? 'neutral' : 'enemy', $revision,
        $attackerIsA ? 1 : 0, $attackerIsA ? 0 : 1,
    ]);
    $relations[serverRelationKey($a, $b)] = 'war';
    serverTrace('war_declared_by_attack', [
        'game_id' => $gameId, 'player_a' => $a, 'player_b' => $b, 'revision' => $revision,
    ]);
}

function resolveTurn(PDO $db, array $game): array
{
    $gameId = (int) $game['id'];
    $turn = (int) $game['turn_number'];
    $revision = (int) $game['revision'] + 1;
    $mapSize = (int) $game['map_size'];
    $tiles = loadTiles($db, $gameId);
    $combatAudiences = combatAudienceMap($db, $gameId);
    $relations = loadServerRelations($db, $gameId);

    $statement = $db->prepare('SELECT * FROM server_game_units WHERE game_id = ? AND deleted_at IS NULL ORDER BY id FOR UPDATE');
    $statement->execute([$gameId]);
    $units = [];
    $originalUnits = [];
    foreach ($statement->fetchAll() as $unit) {
        $unitId = (int) $unit['id'];
        $originalUnits[$unitId] = [
            'owner_id' => (int) $unit['owner_id'],
            'i' => (int) $unit['i'],
            'j' => (int) $unit['j'],
            'state' => (string) $unit['state'],
            'health' => (float) $unit['health'],
            'experience' => (float) $unit['experience'],
            'move_penalty' => (int) $unit['move_penalty'],
            'properties_json' => (string) ($unit['properties_json'] ?? '{}'),
        ];
        $unit['start_i'] = (int) $unit['i'];
        $unit['start_j'] = (int) $unit['j'];
        $unit['original_owner_id'] = (int) $unit['owner_id'];
        $units[$unitId] = $unit;
    }
    $globalAiId = ensureGlobalAiUser($db);
    foreach ($units as &$unit) {
        if ((int) $unit['owner_id'] !== $globalAiId || (string) $unit['unit_type_id'] !== 'settlers') continue;
        $properties = json_decode((string) ($unit['properties_json'] ?? '{}'), true);
        if (!is_array($properties)) $properties = [];
        $properties['aiSettlerTurns'] = min(20, max(0, (int) ($properties['aiSettlerTurns'] ?? 0)) + 1);
        $unit['properties_json'] = jsonObject($properties);
    }
    unset($unit);
    serverTrace('turn_resolution_started', [
        'game_id' => $gameId, 'turn' => $turn, 'revision_before' => (int) $game['revision'],
        'units' => array_map(static function(array $unit): array {
            return [
                'id' => (int) $unit['id'], 'owner_id' => (int) $unit['owner_id'],
                'type' => $unit['unit_type_id'], 'i' => (int) $unit['i'], 'j' => (int) $unit['j'],
                'speed' => (float) $unit['speed'], 'state' => $unit['state'],
            ];
        }, array_values($units)),
    ]);
    $statement = $db->prepare('SELECT * FROM server_game_orders WHERE game_id = ? AND turn_number = ? ORDER BY submitted_at, id');
    $statement->execute([$gameId, $turn]);
    $orders = [];
    foreach ($statement->fetchAll() as $order) {
        $orders[(int) $order['unit_id']] = $order;
    }

    $plans = [];
    $engagedPairs = [];
    $events = [];
    appendRelationChangeEvents($db, $gameId, $revision, $events);
    enforceGlobalAiStrategicResourceWars($db, $gameId, $revision, $tiles, $units, $relations, $events);
    // Repair before this turn's attacks so siege damage remains visible until the next turn.
    serverRepairCityDefenses($units, $events);
    serverRepairFortificationDefenses($tiles, $units, $revision, $events);
    $combatStatistics = [];
    $unitsWithoutOrderCount = 0;
    $unitsWithoutOrders = [];
    $nonMovementCommands = [];
    $productionRequests = [];
    foreach ($units as $unitId => &$unit) {
        $order = $orders[$unitId] ?? null;
        if (!$order) {
            ++$unitsWithoutOrderCount;
            if (count($unitsWithoutOrders) < 20) $unitsWithoutOrders[] = $unitId;
            continue;
        }
        $command = $order['command_name'];
        $payload = json_decode((string) ($order['payload_json'] ?? '{}'), true);
        if (!is_array($payload)) $payload = [];
        if (array_key_exists('automation_mode', $payload)) {
            $properties = json_decode((string) ($unit['properties_json'] ?? '{}'), true);
            if (!is_array($properties)) $properties = [];
            $unitType = (string) ($unit['unit_type_id'] ?? '');
            $unitClass = (int) ($unit['unit_class'] ?? -1);
            $allowedModes = $unitType === 'worker' ? ['automate', 'road_to']
                : ($unitType === 'workboat' ? ['automate']
                    : ($unitType === 'explorer' ? ['explore']
                        : ($unitClass === 2 ? ['patrol'] : [])));
            $automationMode = is_string($payload['automation_mode'])
                && in_array($payload['automation_mode'], $allowedModes, true)
                ? $payload['automation_mode'] : null;
            if ($automationMode === null) unset($properties['automationMode']);
            else $properties['automationMode'] = $automationMode;
            $unit['properties_json'] = jsonObject($properties);
        }
        if ((int) $unit['owner_id'] === $globalAiId && array_key_exists('shared_ai_task', $payload)) {
            $properties = json_decode((string) ($unit['properties_json'] ?? '{}'), true);
            if (!is_array($properties)) $properties = [];
            $sharedTask = normalizeSharedAiTask($payload['shared_ai_task']);
            if ($sharedTask === null) unset($properties['sharedAiTask']);
            else $properties['sharedAiTask'] = $sharedTask;
            $unit['properties_json'] = jsonObject($properties);
            unset($payload['shared_ai_task']);
        }
        if ($command === 'set_state' || $command === 'wait' || $command === 'fortify') {
            $unit['state'] = substr((string) ($payload['state'] ?? ($command === 'wait' ? 'waiting' : 'fortified')), 0, 40);
            if ($command === 'set_state' && isset($payload['client_improvement_turns_left'])
                && is_numeric($payload['client_improvement_turns_left'])) {
                $properties = json_decode((string) ($unit['properties_json'] ?? '{}'), true);
                if (!is_array($properties)) $properties = [];
                $properties['clientImprovementTurnsLeft'] = max(
                    0, min(20, (int) $payload['client_improvement_turns_left'])
                );
                $properties['clientImprovementState'] = $unit['state'] === 'irrigate'
                    ? 'irrigation' : ($unit['state'] === 'road_to' ? 'road' : $unit['state']);
                $unit['properties_json'] = jsonObject($properties);
            }
        }
        if ($command === 'build') {
            applyBuildOrder($db, $gameId, $unit, $payload, $tiles, $revision, $events, $units);
        }
        if ($command === 'produce' && serverIsCityUnit($unit)) {
            $productionRequests[] = ['city_id' => $unitId, 'player_id' => (int) $unit['owner_id']];
        }
        if ($command !== 'move' || !(int) $unit['can_move'] || (int) $unit['move_penalty'] > 0) {
            $nonMovementCommands[$command] = ($nonMovementCommands[$command] ?? 0) + 1;
            continue;
        }
        $rawPath = json_decode((string) ($order['path_json'] ?? '[]'), true);
        if (!is_array($rawPath)) $rawPath = [];
        $pathDiagnostic = null;
        $roadTo = (string) $unit['unit_type_id'] === 'worker' && !empty($payload['road_to']);
        $path = validatePath($unit, $rawPath, $tiles, $mapSize, $pathDiagnostic, $units, $roadTo);
        serverTrace('movement_path_validated', [
            'unit_id' => $unitId, 'owner_id' => (int) $unit['owner_id'],
            'start' => ['i' => (int) $unit['i'], 'j' => (int) $unit['j']],
            'atomic_path' => $rawPath, 'accepted_path' => $path, 'diagnostic' => $pathDiagnostic,
        ]);
        $trajectory = [['i' => (int) $unit['i'], 'j' => (int) $unit['j']]];
        foreach ($path as $point) $trajectory[] = $point;
        $steps = count($path);
        $trajectoryCosts = serverPathCumulativeMovementCosts($unit, $path, $tiles);
        $movementCost = $trajectoryCosts[count($trajectoryCosts) - 1] ?? 0.0;
        $plans[$unitId] = [
            'path' => $path,
            'trajectory' => $trajectory,
            'trajectory_costs' => $trajectoryCosts,
            'steps' => $steps,
            'speed' => max(1.0, (float) $unit['speed']),
            'movement_cost' => $movementCost,
            'early' => $steps > 0 && $movementCost * 2 <= max(1.0, (float) $unit['speed']),
            'canceled' => false,
            'interaction_intent' => in_array(($payload['interaction_intent'] ?? ''), ['attack', 'coexist'], true)
                ? (string) $payload['interaction_intent']
                : (isset($payload['attack_owner_id']) ? 'attack' : 'auto'),
            'target_owner_id' => isset($payload['target_owner_id'])
                ? (int) $payload['target_owner_id']
                : (isset($payload['attack_owner_id']) ? (int) $payload['attack_owner_id'] : 0),
        ];
    }
    unset($unit);
    serverTrace('turn_order_summary', [
        'unit_count' => count($units),
        'ordered_units' => count($orders),
        'units_without_orders' => $unitsWithoutOrderCount,
        'units_without_orders_sample' => $unitsWithoutOrders,
        'non_movement_commands' => $nonMovementCommands,
        'movement_plans' => count($plans),
    ]);

    $transportCrews = serverAssignTransportCrews($units);
    foreach ($transportCrews as $carrierId => $crewIds) {
        if (!isset($plans[$carrierId]) || !$plans[$carrierId]['steps']) continue;
        foreach ($crewIds as $crewId) unset($plans[$crewId]);
        serverTrace('transport_crew_assigned', [
            'carrier_id' => $carrierId, 'crew_ids' => $crewIds,
            'capacity' => serverTransportCapacity((string) $units[$carrierId]['unit_type_id']),
        ]);
    }

    $startOccupants = [];
    foreach ($units as $unitId => $unit) {
        $startOccupants[coordinateKey((int) $unit['i'], (int) $unit['j'])][] = $unitId;
    }

    // Only an explicit attack intent declares war. Neutral and friendly units
    // may intentionally share a Tile without PHP inferring hostility.
    foreach ($plans as $unitId => $plan) {
        if (!$plan['steps'] || !serverIsMilitaryUnit($units[$unitId])) continue;
        $explicitTargetOwner = (int) ($plan['target_owner_id'] ?? 0);
        if ($plan['interaction_intent'] === 'attack'
            && $explicitTargetOwner > 0
            && $explicitTargetOwner !== (int) $units[$unitId]['owner_id']) {
            declareServerWar(
                $db, $gameId, (int) $units[$unitId]['owner_id'], $explicitTargetOwner, $revision, $relations
            );
        }
    }

    foreach ($plans as $unitId => &$plan) {
        if (!$plan['early'] || $plan['steps'] === 0 || $units[$unitId]['health'] <= 0) continue;
        $target = $plan['path'][$plan['steps'] - 1];
        foreach ($startOccupants[coordinateKey($target['i'], $target['j'])] ?? [] as $defenderId) {
            if ($defenderId === $unitId || $units[$defenderId]['health'] <= 0
                || !serverPlansAllowCombat($plans, $units, $unitId, $defenderId, $relations)) continue;
            $pairKey = combatPairKey($unitId, $defenderId);
            if (isset($engagedPairs[$pairKey])) continue;
            // A half-turn arrival owns the interaction point. Combat never rolls it back.
            $units[$unitId]['i'] = $target['i'];
            $units[$unitId]['j'] = $target['j'];
            serverResolveTileInteraction(
                $units, $unitId, $defenderId, $turn, $target['i'], $target['j'], $events,
                'half_turn_interaction', $combatAudiences[coordinateKey($target['i'], $target['j'])] ?? [],
                $combatStatistics, $engagedPairs, $relations,
                $tiles, $revision,
                serverAttackOriginForPoint($plans, $unitId, $target['i'], $target['j'])
            );
            $engagedPairs[$pairKey] = true;
            if (isset($plans[$defenderId])) $plans[$defenderId]['canceled'] = true;
            $plan['canceled'] = true;
            break;
        }
    }
    unset($plan);

    // Simultaneous friendly arrivals reserve capacity deterministically. Units
    // that are moving out release their old slots first. Hostile military entry
    // remains allowed so a full defending stack can still be attacked.
    $tileUnitCounts = [];
    foreach ($units as $unit) {
        if (!serverCountsTowardTileUnitLimit($unit)) continue;
        $key = coordinateKey((int) $unit['i'], (int) $unit['j']);
        $tileUnitCounts[$key] = ($tileUnitCounts[$key] ?? 0) + 1;
    }
    $ordinaryMovingIds = [];
    foreach ($plans as $unitId => $plan) {
        if ($plan['canceled'] || $plan['steps'] === 0 || $units[$unitId]['health'] <= 0) continue;
        $ordinaryMovingIds[] = $unitId;
        if (serverCountsTowardTileUnitLimit($units[$unitId])) {
            $originKey = coordinateKey((int) $units[$unitId]['i'], (int) $units[$unitId]['j']);
            $tileUnitCounts[$originKey] = max(0, ($tileUnitCounts[$originKey] ?? 1) - 1);
        }
    }
    foreach ($ordinaryMovingIds as $unitId) {
        if (!isset($plans[$unitId])) continue;
        $plan = $plans[$unitId];
        $target = $plan['path'][$plan['steps'] - 1];
        $targetKey = coordinateKey($target['i'], $target['j']);
        $isAttack = serverPlanAttacksTile(
            $plans, $units, $unitId, (int) $target['i'], (int) $target['j'], $relations
        );
        if (($tileUnitCounts[$targetKey] ?? 0) >= SERVER_GAME_TILE_UNIT_LIMIT && !$isAttack) {
            $blockedTarget = $target;
            $blockedCount = $tileUnitCounts[$targetKey] ?? 0;
            $fallbackStepCount = 0;
            for ($pathIndex = $plan['steps'] - 2; $pathIndex >= 0; --$pathIndex) {
                $candidate = $plan['path'][$pathIndex];
                $candidateKey = coordinateKey((int) $candidate['i'], (int) $candidate['j']);
                if (($tileUnitCounts[$candidateKey] ?? 0) < SERVER_GAME_TILE_UNIT_LIMIT) {
                    $fallbackStepCount = $pathIndex + 1;
                    break;
                }
            }
            if ($fallbackStepCount > 0) {
                $plan['path'] = array_slice($plan['path'], 0, $fallbackStepCount);
                $plan['steps'] = $fallbackStepCount;
                $plan['trajectory'] = [[
                    'i' => (int) $units[$unitId]['i'], 'j' => (int) $units[$unitId]['j'],
                ]];
                foreach ($plan['path'] as $point) $plan['trajectory'][] = $point;
                $plan['trajectory_costs'] = serverPathCumulativeMovementCosts(
                    $units[$unitId], $plan['path'], $tiles
                );
                $plan['movement_cost'] = $plan['trajectory_costs'][count($plan['trajectory_costs']) - 1] ?? 0.0;
                $plan['early'] = $plan['movement_cost'] * 2 <= $plan['speed'];
                $plans[$unitId] = $plan;
                $target = $plan['path'][$plan['steps'] - 1];
                $targetKey = coordinateKey((int) $target['i'], (int) $target['j']);
                serverTrace('movement_stopped_before_full_stack', [
                    'unit_id' => $unitId, 'owner_id' => (int) $units[$unitId]['owner_id'],
                    'blocked_i' => (int) $blockedTarget['i'], 'blocked_j' => (int) $blockedTarget['j'],
                    'moved_i' => (int) $target['i'], 'moved_j' => (int) $target['j'],
                    'accepted_steps' => $fallbackStepCount,
                    'unit_count' => $blockedCount, 'unit_limit' => SERVER_GAME_TILE_UNIT_LIMIT,
                ]);
            }
            else {
                $originKey = coordinateKey((int) $units[$unitId]['i'], (int) $units[$unitId]['j']);
                $tileUnitCounts[$originKey] = ($tileUnitCounts[$originKey] ?? 0) + 1;
                unset($plans[$unitId]);
                serverTrace('movement_blocked_by_unit_stack', [
                    'unit_id' => $unitId, 'owner_id' => (int) $units[$unitId]['owner_id'],
                    'i' => $blockedTarget['i'], 'j' => $blockedTarget['j'],
                    'unit_count' => $blockedCount,
                    'unit_limit' => SERVER_GAME_TILE_UNIT_LIMIT,
                ]);
                continue;
            }
        }
        $units[$unitId]['i'] = $target['i'];
        $units[$unitId]['j'] = $target['j'];
        if (serverCountsTowardTileUnitLimit($units[$unitId])) {
            $tileUnitCounts[$targetKey] = ($tileUnitCounts[$targetKey] ?? 0) + 1;
        }
    }

    $unitIds = array_keys($plans);
    for ($a = 0; $a < count($unitIds); ++$a) {
        for ($b = $a + 1; $b < count($unitIds); ++$b) {
            $aId = $unitIds[$a];
            $bId = $unitIds[$b];
            if ($units[$aId]['health'] <= 0 || $units[$bId]['health'] <= 0
                || !serverPlansAllowCombat($plans, $units, $aId, $bId, $relations)) continue;
            if (!isset($plans[$aId], $plans[$bId])) continue;
            $intersection = null;
            foreach ($plans[$aId]['trajectory'] as $ai => $pointA) {
                if ($ai === 0) continue;
                foreach ($plans[$bId]['trajectory'] as $bi => $pointB) {
                    if ($bi === 0 || !samePoint($pointA, $pointB)) continue;
                    $aTime = ($plans[$aId]['trajectory_costs'][$ai] ?? $ai) / $plans[$aId]['speed'];
                    $bTime = ($plans[$bId]['trajectory_costs'][$bi] ?? $bi) / $plans[$bId]['speed'];
                    if (min($aTime, $bTime) <= 0.5 && abs($aTime - $bTime) > 0.0001) {
                        $intersection = ['point' => $pointA, 'a_time' => $aTime, 'b_time' => $bTime];
                        break 2;
                    }
                }
            }
            if (!$intersection) continue;
            $attackerId = $intersection['a_time'] < $intersection['b_time'] ? $aId : $bId;
            $defenderId = $attackerId === $aId ? $bId : $aId;
            $pairKey = combatPairKey($attackerId, $defenderId);
            if (isset($engagedPairs[$pairKey])) continue;
            $point = $intersection['point'];
            $units[$defenderId]['i'] = $point['i'];
            $units[$defenderId]['j'] = $point['j'];
            $units[$attackerId]['i'] = $point['i'];
            $units[$attackerId]['j'] = $point['j'];
            serverResolveTileInteraction(
                $units, $attackerId, $defenderId, $turn, $point['i'], $point['j'], $events,
                'interception', $combatAudiences[coordinateKey($point['i'], $point['j'])] ?? [],
                $combatStatistics, $engagedPairs, $relations,
                $tiles, $revision,
                serverAttackOriginForPoint($plans, $attackerId, $point['i'], $point['j'])
            );
            $engagedPairs[$pairKey] = true;
        }
    }

    // Crew follows the ship's authoritative resolved position. If combat kept
    // or returned the ship to its origin, passengers remain there as well.
    serverMoveTransportCrews($units, $transportCrews);

    $occupants = [];
    foreach ($units as $unitId => $unit) {
        if ($unit['health'] > 0) $occupants[coordinateKey((int) $unit['i'], (int) $unit['j'])][] = $unitId;
    }
    foreach ($occupants as $key => $ids) {
        if (count($ids) < 2) continue;
        for ($a = 0; $a < count($ids); ++$a) {
            for ($b = $a + 1; $b < count($ids); ++$b) {
                $aId = $ids[$a];
                $bId = $ids[$b];
                if ($units[$aId]['health'] <= 0 || $units[$bId]['health'] <= 0
                    || !serverPlansAllowCombat($plans, $units, $aId, $bId, $relations)) continue;
                $pairKey = combatPairKey($aId, $bId);
                if (isset($engagedPairs[$pairKey])) continue;
                $attackerId = isset($plans[$aId]) ? $aId : $bId;
                $defenderId = $attackerId === $aId ? $bId : $aId;
                $combatI = (int) $units[$aId]['i'];
                $combatJ = (int) $units[$aId]['j'];
                serverResolveTileInteraction(
                    $units, $attackerId, $defenderId, $turn, $combatI, $combatJ, $events,
                    'turn_collision', $combatAudiences[coordinateKey($combatI, $combatJ)] ?? [],
                    $combatStatistics, $engagedPairs, $relations,
                    $tiles, $revision,
                    serverAttackOriginForPoint($plans, $attackerId, $combatI, $combatJ)
                );
                $engagedPairs[$pairKey] = true;
            }
        }
    }

    // A land passenger exists on water only through a living same-owner
    // transport. Run this after transport movement and combat so a destroyed
    // or departed carrier cannot leave permanent land units at sea.
    serverDisbandOrphanedLandUnitsAtSea($units, $tiles, $events);

    serverHealFortificationUnits($units, $tiles, $events);
    $lootRewards = serverLootEnemyImprovements($units, $tiles, $relations, $revision, $events);
    serverPersistTurnTileChanges($db, $gameId, $revision, $tiles);
    processTerrainImprovementAges($db, $gameId, $turn, $revision, $tiles, $events);
    processPlayerEconomies(
        $db, $gameId, $turn, $revision, $tiles, $units, $events, $relations, $lootRewards
    );

    $update = $db->prepare(
        'UPDATE server_game_units SET owner_id = ?, i = ?, j = ?, state = ?, health = ?, experience = ?, move_penalty = ?,
         properties_json = ?, revision = ?, deleted_at = ? WHERE id = ?'
    );
    $updateProductionOwner = $db->prepare(
        'UPDATE productions SET player_id = ? WHERE game_id = ? AND city_unit_id = ?'
    );
    $changedUnitCount = 0;
    $changedUnitSample = [];
    foreach ($units as $unitId => $unit) {
        $properties = json_decode((string) ($unit['properties_json'] ?? '{}'), true);
        if (!is_array($properties)) $properties = [];
        unset($properties['gotoPath'], $properties['gotoCoord'], $properties['pendingServerPath']);
        $propertiesJson = jsonObject($properties);
        $deletedAt = $unit['health'] <= 0 ? gmdate('Y-m-d H:i:s') : null;
        $original = $originalUnits[$unitId];
        $moved = (int) $unit['i'] !== $original['i'] || (int) $unit['j'] !== $original['j'];
        if ($moved) {
            // Road-to alternates movement turns with separate road build actions.
            // Any previous improvement countdown must not survive movement.
            $unit['state'] = 'ready';
            unset($properties['clientImprovementTurnsLeft'], $properties['clientImprovementState']);
            $propertiesJson = jsonObject($properties);
        }
        $nextMovePenalty = $moved
            ? serverTerrainMovePenalty($unit, $tiles[coordinateKey((int) $unit['i'], (int) $unit['j'])] ?? null)
            : max(0, (int) $unit['move_penalty'] - 1);
        $changed = (int) $unit['owner_id'] !== $original['owner_id']
            || (int) $unit['i'] !== $original['i']
            || (int) $unit['j'] !== $original['j']
            || (string) $unit['state'] !== $original['state']
            || abs((float) $unit['health'] - $original['health']) > 0.000001
            || abs((float) $unit['experience'] - $original['experience']) > 0.000001
            || $nextMovePenalty !== $original['move_penalty']
            || $propertiesJson !== $original['properties_json']
            || $deletedAt !== null;
        if (!$changed) continue;
        $update->execute([
            $unit['owner_id'], $unit['i'], $unit['j'], $unit['state'], $unit['health'], $unit['experience'], $nextMovePenalty,
            $propertiesJson, $revision, $deletedAt, $unitId,
        ]);
        ++$changedUnitCount;
        if (count($changedUnitSample) < 20) $changedUnitSample[] = $unitId;
        if (serverIsCityUnit($unit) && (int) $unit['owner_id'] !== (int) $unit['original_owner_id']) {
            $updateProductionOwner->execute([(int) $unit['owner_id'], $gameId, $unitId]);
        }
    }
    $activePlayers = $db->prepare(
        'UPDATE server_game_players p
         SET active = EXISTS (
             SELECT 1 FROM server_game_units u
             WHERE u.game_id = p.game_id AND u.owner_id = p.player_id AND u.deleted_at IS NULL AND u.health > 0
         ), eliminated = NOT EXISTS (
             SELECT 1 FROM server_game_units u
             WHERE u.game_id = p.game_id AND u.owner_id = p.player_id AND u.deleted_at IS NULL AND u.health > 0
         )
         WHERE p.game_id = ?'
    );
    $activePlayers->execute([$gameId]);
    if ($combatStatistics) {
        $statisticsUpdate = $db->prepare(
            'UPDATE server_game_players SET units_killed = units_killed + ?,
             cities_occupied = cities_occupied + ?, cities_destroyed = cities_destroyed + ?
             WHERE game_id = ? AND player_id = ?'
        );
        foreach ($combatStatistics as $statisticsPlayerId => $statistics) {
            $statisticsUpdate->execute([
                $statistics['units_killed'], $statistics['cities_occupied'], $statistics['cities_destroyed'],
                $gameId, $statisticsPlayerId,
            ]);
        }
    }
    processCityProductions($db, $gameId, $turn, $revision, $tiles, $events);
    completeRequestedProductionsInTurn(
        $db, $gameId, $turn, $revision, $tiles, $productionRequests, $events
    );
    serverTrace('turn_resolution_finished', [
        'turn' => $turn, 'revision_after' => $revision,
        'unit_count' => count($units),
        'changed_unit_count' => $changedUnitCount,
        'changed_unit_sample' => $changedUnitSample,
        'event_count' => count($events),
    ]);

    recomputeVisibility($db, $gameId, $mapSize, $revision, $tiles);
    saveEvents($db, $gameId, $turn, $revision, $events);
    // Orders, submissions, delivered events, and defeated units are transient state, not game history.
    $statement = $db->prepare('DELETE FROM server_game_orders WHERE game_id = ? AND turn_number <= ?');
    $statement->execute([$gameId, $turn]);
    $statement = $db->prepare('DELETE FROM server_game_submissions WHERE game_id = ? AND turn_number <= ?');
    $statement->execute([$gameId, $turn]);
    $statement = $db->prepare('DELETE FROM server_game_ai_leases WHERE game_id = ? AND turn_number <= ?');
    $statement->execute([$gameId, $turn]);
    $statement = $db->prepare('DELETE FROM server_game_units WHERE game_id = ? AND deleted_at IS NOT NULL');
    $statement->execute([$gameId]);
    $statement = $db->prepare('DELETE FROM server_game_events WHERE game_id = ? AND turn_number < ?');
    $statement->execute([$gameId, max(0, $turn - 1)]);
    $statement = $db->prepare(
        'UPDATE server_games SET turn_number = turn_number + 1, revision = ?, turn_started_at = UTC_TIMESTAMP(),
         turn_deadline_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND) WHERE id = ?'
    );
    $statement->execute([$revision, SERVER_GAME_DEADLINE_SECONDS, $gameId]);
    return ['resolved_turn' => $turn, 'new_turn' => $turn + 1, 'revision' => $revision, 'events' => $events];
}

function maybeResolveTurn(PDO $db, array $game): array
{
    $onlineCondition =
        "p.active = 1 AND (p.account_user_id IS NULL OR
         (u.user_type <> 'ai' AND u.online = 1
          AND u.last_online_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 60 SECOND)))";
    $statement = $db->prepare(
        "SELECT COUNT(*)
         FROM server_game_players p
         LEFT JOIN game_users u ON u.id = p.account_user_id
         WHERE p.game_id = ? AND $onlineCondition"
    );
    $statement->execute([$game['id']]);
    $players = (int) $statement->fetchColumn();
    $statement = $db->prepare(
        "SELECT COUNT(*)
         FROM server_game_submissions s
         JOIN server_game_players p ON p.game_id = s.game_id AND p.player_id = s.player_id
         LEFT JOIN game_users u ON u.id = p.account_user_id
         WHERE s.game_id = ? AND s.turn_number = ? AND $onlineCondition"
    );
    $statement->execute([$game['id'], $game['turn_number']]);
    $submitted = (int) $statement->fetchColumn();
    $deadlinePassed = strtotime($game['turn_deadline_at'] . ' UTC') <= time();
    serverTrace('turn_resolution_check', [
        'turn' => (int) $game['turn_number'], 'online_players' => $players,
        'submitted_online_players' => $submitted, 'deadline_at' => $game['turn_deadline_at'],
        'deadline_passed' => $deadlinePassed,
    ]);
    if (($players > 0 && $submitted >= $players) || $deadlinePassed) {
        return resolveTurn($db, $game);
    }
    return ['resolved_turn' => null, 'new_turn' => (int) $game['turn_number'], 'revision' => (int) $game['revision'], 'events' => []];
}

function storePlayerOrders(
    PDO $db, array $game, int $playerId, array $commands, array $playerState, array $relationPreferences = []
): bool
{
    $gameId = (int) $game['id'];
    $turn = (int) $game['turn_number'];
    $statement = $db->prepare(
        'SELECT 1 FROM server_game_submissions WHERE game_id = ? AND turn_number = ? AND player_id = ? LIMIT 1'
    );
    $statement->execute([$gameId, $turn, $playerId]);
    if ($statement->fetchColumn()) {
        serverTrace('duplicate_submission_ignored', [
            'game_id' => $gameId, 'turn' => $turn, 'player_id' => $playerId,
            'commands_received' => count($commands),
        ]);
        return false;
    }
    storePlayerDirectionalRelations(
        $db, $gameId, $playerId, $relationPreferences, (int) $game['revision'] + 1
    );
    $currentStateStatement = $db->prepare(
        'SELECT state_json FROM server_game_players WHERE game_id = ? AND player_id = ?'
    );
    $currentStateStatement->execute([$gameId, $playerId]);
    $currentState = json_decode((string) ($currentStateStatement->fetchColumn() ?: '{}'), true);
    if (!is_array($currentState)) $currentState = [];
    $playerState = normalizePlayerState($playerState);
    // Clients may select presentation/research state, but cannot overwrite server economy balances.
    foreach (['food', 'money', 'lastGrossFoodIncome', 'lastFoodUpkeep', 'lastMoneyIncome',
        'lastGrossMoneyIncome', 'lastMaintenance', 'lastTechnologyExpense', 'lastAvailableMoney',
        'lastScienceIncome', 'lastAccountIncome', 'oneTurnMessage'] as $field) {
        if (array_key_exists($field, $currentState)) $playerState[$field] = $currentState[$field];
    }
    $statement = $db->prepare(
        'INSERT INTO server_game_players (game_id, player_id, civilization_key, state_json) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE state_json = VALUES(state_json),
             civilization_key = COALESCE(civilization_key, VALUES(civilization_key)), active = 1'
    );
    $statement->execute([$gameId, $playerId, civilizationKeyForPlayer($playerId), jsonObject($playerState)]);
    $statement = $db->prepare('DELETE FROM server_game_orders WHERE game_id = ? AND turn_number = ? AND player_id = ?');
    $statement->execute([$gameId, $turn, $playerId]);

    $byId = $db->prepare('SELECT id FROM server_game_units WHERE game_id = ? AND owner_id = ? AND id = ? AND deleted_at IS NULL');
    $byClient = $db->prepare('SELECT id FROM server_game_units WHERE game_id = ? AND owner_id = ? AND client_key = ? AND deleted_at IS NULL');
    $insert = $db->prepare(
        'INSERT INTO server_game_orders
         (game_id, turn_number, player_id, unit_id, command_name, path_json, payload_json, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())'
    );
    $allowed = ['move', 'hold', 'wait', 'fortify', 'set_state', 'build', 'produce'];
    $acceptedOrders = [];
    $rejectedOrders = [];
    foreach (array_slice($commands, 0, 1000) as $command) {
        if (!is_array($command)) {
            $rejectedOrders[] = ['reason' => 'command_not_object'];
            continue;
        }
        $unitId = isset($command['unit_id']) ? (int) $command['unit_id'] : 0;
        $ownedUnit = false;
        if ($unitId > 0) {
            $byId->execute([$gameId, $playerId, $unitId]);
            $ownedUnit = (bool) $byId->fetchColumn();
        } else {
            $clientKey = substr((string) ($command['client_key'] ?? ''), 0, 100);
            $byClient->execute([$gameId, $playerId, $clientKey]);
            $unitId = (int) $byClient->fetchColumn();
            $ownedUnit = $unitId > 0;
        }
        if ($unitId <= 0 || !$ownedUnit) {
            $rejectedOrders[] = ['reason' => 'owned_unit_not_found', 'command' => $command];
            continue;
        }
        $name = strtolower((string) ($command['command'] ?? 'hold'));
        if (!in_array($name, $allowed, true)) $name = 'hold';
        $path = isset($command['path']) && is_array($command['path']) ? $command['path'] : [];
        $payload = isset($command['payload']) && is_array($command['payload']) ? $command['payload'] : [];
        $workerDecision = isset($payload['worker_automation_decision'])
            && is_array($payload['worker_automation_decision'])
            ? $payload['worker_automation_decision'] : null;
        unset($payload['worker_automation_decision']);
        if ($workerDecision !== null) {
            $workerDecision['player_id'] = $playerId;
            $workerDecision['unit_id'] = $unitId;
            $workerDecision['client_key'] = 'player-turn';
            writeAiWorkerDecisionReport($workerDecision);
        }
        $insert->execute([$gameId, $turn, $playerId, $unitId, $name, jsonObject($path), jsonObject($payload)]);
        $acceptedOrders[] = ['unit_id' => $unitId, 'command' => $name, 'path' => $path, 'payload' => $payload];
    }
    $statement = $db->prepare(
        'INSERT INTO server_game_submissions (game_id, turn_number, player_id, submitted_at) VALUES (?, ?, ?, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE submitted_at = VALUES(submitted_at)'
    );
    $statement->execute([$gameId, $turn, $playerId]);
    serverTrace('orders_stored', [
        'game_id' => $gameId, 'turn' => $turn, 'player_id' => $playerId,
        'accepted' => $acceptedOrders, 'rejected' => $rejectedOrders,
    ]);
    return true;
}

function claimGlobalAiBatch(PDO $db, array $game, string $clientKey): array
{
    $gameId = (int) $game['id'];
    $turn = (int) $game['turn_number'];
    $globalAiId = ensureGlobalAiUser($db);
    ensureGlobalAiWorkersAutomated($db, $gameId, $globalAiId, (int) $game['revision']);
    ensureGlobalAiSettlerAges($db, $gameId, $globalAiId, (int) $game['revision']);
    $db->prepare(
        'DELETE FROM server_game_ai_leases
         WHERE game_id = ? AND (turn_number <> ? OR leased_until <= UTC_TIMESTAMP(6))'
    )->execute([$gameId, $turn]);
    $cityStatement = $db->prepare(
        'SELECT COUNT(*) FROM server_game_units
         WHERE game_id = ? AND owner_id = ? AND unit_class = 3 AND deleted_at IS NULL AND health > 0'
    );
    $cityStatement->execute([$gameId, $globalAiId]);
    $hasCity = (int) $cityStatement->fetchColumn() > 0;
    $bootstrapPrioritySql = $hasCity
        ? "CASE WHEN u.unit_class = 3 THEN 0 WHEN u.unit_type_id = 'worker' THEN 1
                  WHEN u.unit_type_id = 'settlers' THEN 2 WHEN u.unit_type_id = 'explorer' THEN 3 ELSE 4 END"
        : "CASE WHEN u.unit_type_id = 'settlers' THEN 0 WHEN u.unit_type_id = 'worker' THEN 1
                  WHEN u.unit_type_id = 'explorer' THEN 2 ELSE 3 END";
    $lastServedSql = "COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(u.properties_json, '$.aiLastServedTurn')) AS UNSIGNED), 0)";
    $neverServedSql = "CASE WHEN JSON_CONTAINS_PATH(u.properties_json, 'one', '$.aiLastServedTurn') = 1 THEN 0 ELSE 1 END DESC";
    $activeWorkerProjectSql = "CASE WHEN u.unit_type_id = 'worker' AND (
        u.state NOT IN ('ready', 'waiting', 'automate')
        OR JSON_CONTAINS_PATH(u.properties_json, 'one', '$.clientImprovementTurnsLeft') = 1
    ) THEN 0 ELSE 1 END";
    $captureOpportunitySql = "CASE WHEN u.unit_class = 2 AND EXISTS (
        SELECT 1
        FROM server_game_units capture_city
        JOIN server_game_visibility capture_visibility
          ON capture_visibility.game_id = capture_city.game_id
         AND capture_visibility.player_id = u.owner_id
         AND capture_visibility.i = capture_city.i
         AND capture_visibility.j = capture_city.j
         AND capture_visibility.visibility_level >= 2
        JOIN server_game_relations capture_relation
          ON capture_relation.game_id = capture_city.game_id
         AND capture_relation.relation_status = 'war'
         AND ((capture_relation.player_a = u.owner_id AND capture_relation.player_b = capture_city.owner_id)
           OR (capture_relation.player_b = u.owner_id AND capture_relation.player_a = capture_city.owner_id))
        WHERE capture_city.game_id = u.game_id
          AND capture_city.unit_class = 3
          AND capture_city.owner_id <> u.owner_id
          AND capture_city.deleted_at IS NULL
          AND capture_city.health > 0
          AND ABS(capture_city.i - u.i) <= 1
          AND ABS(capture_city.j - u.j) <= 1
          AND NOT EXISTS (
              SELECT 1 FROM server_game_units capture_defender
              WHERE capture_defender.game_id = capture_city.game_id
                AND capture_defender.owner_id = capture_city.owner_id
                AND capture_defender.unit_class = 2
                AND capture_defender.i = capture_city.i
                AND capture_defender.j = capture_city.j
                AND capture_defender.deleted_at IS NULL
                AND capture_defender.health > 0
          )
    ) THEN 0 ELSE 1 END";
    // Stateful civilian work needs a much shorter service interval than a
    // fortified military unit. Every object still accumulates debt, so lower
    // weights delay inactive units without permanently starving them.
    $serviceWeightSql = "CASE
        WHEN u.unit_type_id = 'worker' AND (
            u.state NOT IN ('ready', 'waiting', 'automate')
            OR JSON_CONTAINS_PATH(u.properties_json, 'one', '$.sharedAiTask') = 1
        ) THEN 64
        WHEN u.unit_type_id = 'worker' THEN 16
        WHEN u.unit_type_id = 'settlers'
          AND COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(u.properties_json, '$.aiSettlerTurns')) AS UNSIGNED), 0) >= 10
          THEN 12
        WHEN u.unit_type_id = 'settlers' THEN 4
        WHEN u.unit_class = 3 THEN 8
        WHEN u.unit_class = 2
          AND JSON_UNQUOTE(JSON_EXTRACT(u.properties_json, '$.automationMode')) = 'patrol' THEN 20
        WHEN u.unit_class = 2 THEN 12
        WHEN u.unit_type_id = 'explorer' THEN 4
        WHEN u.state = 'ready' THEN 2
        ELSE 1 END";
    $servicePrioritySql = '(GREATEST(0, ' . $turn . ' - ' . $lastServedSql
        . ') * (' . $serviceWeightSql . ')) DESC';
    $batchSize = globalAiBatchSize($clientKey);
    $eligibleSql =
        ' FROM server_game_units u
          LEFT JOIN server_game_ai_leases l
            ON l.game_id = u.game_id AND l.turn_number = ? AND l.unit_id = u.id
          LEFT JOIN server_game_orders o
            ON o.game_id = u.game_id AND o.turn_number = ? AND o.player_id = ? AND o.unit_id = u.id
          LEFT JOIN productions p ON p.game_id = u.game_id AND p.city_unit_id = u.id
          WHERE u.game_id = ? AND u.owner_id = ?
            AND (u.can_move = 1 OR (u.unit_class = 3
                 AND (p.city_unit_id IS NULL OR p.production_points + 0.0001 >= p.production_cost)))
            AND u.deleted_at IS NULL AND u.health > 0 AND l.unit_id IS NULL AND o.unit_id IS NULL';
    $parameters = [$turn, $turn, $globalAiId, $gameId, $globalAiId];
    $anchorStatement = $db->prepare(
        'SELECT u.id, u.i, u.j, u.unit_type_id, u.unit_class' . $eligibleSql
        . ' ORDER BY ' . $captureOpportunitySql . ', ' . $servicePrioritySql . ', '
        . $bootstrapPrioritySql . ', '
        . $neverServedSql . ', RAND() LIMIT 1 FOR UPDATE'
    );
    $anchorStatement->execute($parameters);
    $anchor = $anchorStatement->fetch();
    $unitIds = [];
    if ($anchor) {
        if ((string) $anchor['unit_type_id'] === 'worker') {
            // Worker policy is deterministic and does not invoke matrix
            // inference. Process a complete nearby batch from one snapshot so
            // projects and routes advance frequently even in a large army.
            $batchStatement = $db->prepare(
                'SELECT u.id, u.unit_type_id' . $eligibleSql
                . " AND u.unit_type_id = 'worker' AND ABS(u.i - ?) < 45 AND ABS(u.j - ?) < 45"
                . ' ORDER BY ' . $activeWorkerProjectSql . ', ' . $servicePrioritySql . ', ' . $neverServedSql
                . ', RAND() LIMIT ' . $batchSize . ' FOR UPDATE'
            );
            $batchStatement->execute(array_merge($parameters, [(int) $anchor['i'], (int) $anchor['j']]));
            foreach ($batchStatement->fetchAll() as $row) {
                $unitIds[] = (int) $row['id'];
            }
        }
        elseif ((string) $anchor['unit_type_id'] === 'settlers'
            || (int) $anchor['unit_class'] === 3) {
            // Development decisions are cheap, stateful, and immediately alter
            // later decisions. Lease them atomically so a short browser turn
            // cannot found conflicting Cities or mutate one production queue
            // from concurrent snapshots.
            $unitIds = [(int) $anchor['id']];
        }
        else {
            // Fill one complete local military/explorer batch. Keeping object
            // categories separate preserves weighted scheduling at batch level.
            $batchStatement = $db->prepare(
                'SELECT u.id, u.unit_type_id' . $eligibleSql
                . " AND u.unit_type_id NOT IN ('settlers', 'worker') AND u.unit_class <> 3"
                . ' AND ABS(u.i - ?) < 45 AND ABS(u.j - ?) < 45'
                . ' ORDER BY ' . $captureOpportunitySql . ', ' . $servicePrioritySql . ', ' . $neverServedSql
                . ', RAND() LIMIT ' . $batchSize . ' FOR UPDATE'
            );
            $batchStatement->execute(array_merge($parameters, [(int) $anchor['i'], (int) $anchor['j']]));
            foreach ($batchStatement->fetchAll() as $row) {
                $unitIds[] = (int) $row['id'];
            }
        }
    }
    if (!$unitIds) {
        return [
            'ai_player_id' => $globalAiId, 'turn' => $turn,
            'lease_token' => null, 'unit_ids' => [], 'focus_i' => null, 'focus_j' => null,
        ];
    }
    $token = bin2hex(random_bytes(16));
    $insert = $db->prepare(
        'INSERT INTO server_game_ai_leases
         (game_id, turn_number, unit_id, lease_token, client_key, leased_until)
         VALUES (?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(6), INTERVAL ? SECOND))'
    );
    foreach ($unitIds as $unitId) {
        $insert->execute([$gameId, $turn, $unitId, $token, $clientKey, SERVER_GAME_AI_LEASE_SECONDS]);
    }
    return [
        'ai_player_id' => $globalAiId, 'turn' => $turn,
        'lease_token' => $token, 'unit_ids' => $unitIds,
        'focus_i' => (int) $anchor['i'], 'focus_j' => (int) $anchor['j'],
    ];
}

function submitGlobalAiBatch(
    PDO $db, array $game, string $clientKey, string $leaseToken, array $commands,
    array $requestedUnitIds = [], ?int $claimedTurn = null
): array {
    $gameId = (int) $game['id'];
    $turn = (int) $game['turn_number'];
    $globalAiId = ensureGlobalAiUser($db);
    $statement = $db->prepare(
        'SELECT unit_id FROM server_game_ai_leases
         WHERE game_id = ? AND turn_number = ? AND lease_token = ? AND client_key = ?
           AND leased_until > UTC_TIMESTAMP(6) AND submitted_at IS NULL FOR UPDATE'
    );
    $statement->execute([$gameId, $turn, $leaseToken, $clientKey]);
    $leasedIds = array_map('intval', $statement->fetchAll(PDO::FETCH_COLUMN));
    $rebased = false;
    if (!$leasedIds && $requestedUnitIds) {
        $requestedUnitIds = array_values(array_unique(array_filter(
            array_map('intval', array_slice($requestedUnitIds, 0, globalAiBatchSize($clientKey))),
            static fn(int $unitId): bool => $unitId > 0
        )));
        if ($requestedUnitIds) {
            $placeholders = implode(',', array_fill(0, count($requestedUnitIds), '?'));
            $statement = $db->prepare(
                'SELECT id FROM server_game_units
                 WHERE game_id = ? AND owner_id = ? AND deleted_at IS NULL AND health > 0
                   AND id IN (' . $placeholders . ') FOR UPDATE'
            );
            $statement->execute(array_merge([$gameId, $globalAiId], $requestedUnitIds));
            $leasedIds = array_map('intval', $statement->fetchAll(PDO::FETCH_COLUMN));
            $rebased = (bool) $leasedIds;
        }
    }
    $leased = array_fill_keys($leasedIds, true);
    if (!$leasedIds) return ['accepted' => false, 'reason' => 'lease_expired', 'orders_stored' => 0];

    $allowed = ['move', 'hold', 'wait', 'fortify', 'set_state', 'build', 'produce'];
    $insert = $db->prepare(
        'INSERT INTO server_game_orders
         (game_id, turn_number, player_id, unit_id, command_name, path_json, payload_json, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE command_name = VALUES(command_name), path_json = VALUES(path_json),
             payload_json = VALUES(payload_json), submitted_at = VALUES(submitted_at)'
    );
    $stored = 0;
    $submittedIds = [];
    $batchSize = globalAiBatchSize($clientKey);
    foreach (array_slice($commands, 0, $batchSize) as $command) {
        if (!is_array($command)) continue;
        $unitId = (int) ($command['unit_id'] ?? 0);
        if (!isset($leased[$unitId])) continue;
        $name = strtolower((string) ($command['command'] ?? 'hold'));
        if (!in_array($name, $allowed, true)) $name = 'hold';
        $path = isset($command['path']) && is_array($command['path']) ? $command['path'] : [];
        $payload = isset($command['payload']) && is_array($command['payload']) ? $command['payload'] : [];
        $workerDecision = isset($payload['ai_worker_decision']) && is_array($payload['ai_worker_decision'])
            ? $payload['ai_worker_decision'] : null;
        $developmentDecision = isset($payload['ai_development_decision'])
            && is_array($payload['ai_development_decision']) ? $payload['ai_development_decision'] : null;
        unset($payload['ai_worker_decision']);
        unset($payload['ai_development_decision']);
        if ($workerDecision !== null) {
            $workerDecision['player_id'] = $globalAiId;
            $workerDecision['unit_id'] = $unitId;
            $workerDecision['client_key'] = $clientKey;
            writeAiWorkerDecisionReport($workerDecision);
        }
        if ($developmentDecision !== null) {
            $developmentDecision['player_id'] = $globalAiId;
            $developmentDecision['unit_id'] = $unitId;
            $developmentDecision['client_key'] = $clientKey;
            writeAiDevelopmentDecisionReport($developmentDecision);
        }
        $insert->execute([$gameId, $turn, $globalAiId, $unitId, $name, jsonObject($path), jsonObject($payload)]);
        $stored++;
        $submittedIds[$unitId] = true;
    }
    foreach (array_slice($commands, 0, $batchSize) as $command) {
        if (!is_array($command)) continue;
        $unitId = (int) ($command['unit_id'] ?? 0);
        if (isset($leased[$unitId])) $submittedIds[$unitId] = true;
    }
    if ($submittedIds) {
        $submittedUnitIds = array_map('intval', array_keys($submittedIds));
        $placeholders = implode(',', array_fill(0, count($submittedUnitIds), '?'));
        if (!$rebased) {
            $statement = $db->prepare(
                'UPDATE server_game_ai_leases SET submitted_at = UTC_TIMESTAMP(6)
                 WHERE game_id = ? AND turn_number = ? AND lease_token = ? AND client_key = ?
                   AND unit_id IN (' . $placeholders . ')'
            );
            $statement->execute(array_merge([$gameId, $turn, $leaseToken, $clientKey], $submittedUnitIds));
        }
        $statement = $db->prepare(
            "UPDATE server_game_units
             SET properties_json = JSON_SET(
                 CASE WHEN JSON_TYPE(properties_json) = 'OBJECT' THEN properties_json ELSE JSON_OBJECT() END,
                 '$.aiLastServedTurn', CAST(? AS UNSIGNED)
             )
             WHERE game_id = ? AND owner_id = ? AND id IN (" . $placeholders . ')'
        );
        $statement->execute(array_merge([$turn, $gameId, $globalAiId], $submittedUnitIds));
    } else {
        $submittedUnitIds = [];
    }
    serverTrace('global_ai_batch_submitted', [
        'turn' => $turn, 'ai_player_id' => $globalAiId, 'leased_units' => $submittedUnitIds,
        'orders_stored' => $stored, 'client_key' => $clientKey, 'rebased' => $rebased,
        'claimed_turn' => $claimedTurn,
    ]);
    return [
        'accepted' => true,
        'reason' => $rebased ? 'rebased_to_current_turn' : null,
        'orders_stored' => $stored,
        'unit_ids' => $submittedUnitIds,
        'claimed_turn' => $claimedTurn,
        'applied_turn' => $turn,
    ];
}

function normalizeSharedAiTask($value): ?array
{
    if (!is_array($value)) return null;
    $kind = strtolower((string) ($value['kind'] ?? ''));
    $mode = strtolower((string) ($value['mode'] ?? ''));
    if ($kind !== 'worker' || !in_array($mode, ['automate', 'road_to'], true)) return null;
    $task = ['kind' => 'worker', 'mode' => $mode];
    $action = strtolower((string) ($value['action'] ?? ''));
    if (preg_match('/^[a-z_]{1,32}$/', $action)) $task['action'] = $action;
    $state = strtolower((string) ($value['state'] ?? ''));
    if (preg_match('/^[a-z_]{1,32}$/', $state)) $task['state'] = $state;
    $target = $value['target'] ?? null;
    if (is_array($target) && isset($target['i'], $target['j'])
        && is_numeric($target['i']) && is_numeric($target['j'])) {
        $task['target'] = ['i' => (int) $target['i'], 'j' => (int) $target['j']];
    }
    if (isset($value['turns_left']) && is_numeric($value['turns_left'])) {
        $task['turns_left'] = max(0, min(20, (int) $value['turns_left']));
    }
    if (isset($value['city_id']) && is_numeric($value['city_id'])) {
        $task['city_id'] = max(0, (int) $value['city_id']);
    }
    return $task;
}

function ensureGlobalAiWorkersAutomated(PDO $db, int $gameId, int $globalAiId, int $revision): int
{
    $statement = $db->prepare(
        "SELECT id, state, properties_json FROM server_game_units
         WHERE game_id = ? AND owner_id = ? AND unit_type_id = 'worker'
           AND deleted_at IS NULL AND health > 0"
    );
    $statement->execute([$gameId, $globalAiId]);
    $update = $db->prepare(
        'UPDATE server_game_units SET state = ?, properties_json = ?, revision = ? WHERE id = ?'
    );
    $changed = 0;
    foreach ($statement->fetchAll() as $worker) {
        $properties = json_decode((string) ($worker['properties_json'] ?? '{}'), true);
        if (!is_array($properties)) $properties = [];
        $state = (string) $worker['state'];
        $targetState = in_array($state, ['ready', 'waiting', 'automate'], true) ? 'automate' : $state;
        if (($properties['automationMode'] ?? null) === 'automate' && $targetState === $state) continue;
        $properties['automationMode'] = 'automate';
        $update->execute([$targetState, jsonObject($properties), $revision, (int) $worker['id']]);
        $changed++;
    }
    return $changed;
}

function ensureGlobalAiSettlerAges(PDO $db, int $gameId, int $globalAiId, int $revision): int
{
    $stateStatement = $db->prepare(
        'SELECT state_json FROM server_game_players WHERE game_id = ? AND player_id = ?'
    );
    $stateStatement->execute([$gameId, $globalAiId]);
    $playerState = json_decode((string) ($stateStatement->fetchColumn() ?: '{}'), true);
    if (!is_array($playerState)) $playerState = [];
    if (!empty($playerState['aiSettlerAgeMigration20260812'])) return 0;
    $statement = $db->prepare(
        "SELECT id, properties_json FROM server_game_units
         WHERE game_id = ? AND owner_id = ? AND unit_type_id = 'settlers'
           AND deleted_at IS NULL AND health > 0"
    );
    $statement->execute([$gameId, $globalAiId]);
    $update = $db->prepare('UPDATE server_game_units SET properties_json = ?, revision = ? WHERE id = ?');
    $changed = 0;
    foreach ($statement->fetchAll() as $settler) {
        $properties = json_decode((string) ($settler['properties_json'] ?? '{}'), true);
        if (!is_array($properties)) $properties = [];
        // Legacy shared-AI Settlers may have existed for thousands of turns while
        // the old stateless client path repeatedly reset their age to zero.
        $properties['aiSettlerTurns'] = 20;
        $update->execute([jsonObject($properties), $revision, (int) $settler['id']]);
        $changed++;
    }
    $playerState['aiSettlerAgeMigration20260812'] = true;
    $db->prepare('UPDATE server_game_players SET state_json = ? WHERE game_id = ? AND player_id = ?')
        ->execute([jsonObject($playerState), $gameId, $globalAiId]);
    return $changed;
}

function publicUnit(array $unit): array
{
    $properties = json_decode((string) ($unit['properties_json'] ?? '{}'), true);
    if (!is_array($properties)) $properties = [];
    unset($properties['gotoPath'], $properties['gotoCoord'], $properties['pendingServerPath']);
    if ((int) ($unit['unit_class'] ?? -1) === 3) {
        if (($unit['production_unit_type_id'] ?? null) !== null) {
            $queue = productionQueue($unit);
            $properties['production'] = [
                'unitTypeId' => (string) $unit['production_unit_type_id'],
                'productionPoints' => (float) ($unit['selected_production_points'] ?? 0),
            ];
            $properties['productionQueue'] = $queue;
            $properties['productionDisabled'] = false;
        } else {
            $properties['production'] = null;
            $properties['productionQueue'] = [];
        }
    }
    return [
        'id' => (int) $unit['id'], 'client_key' => $unit['client_key'], 'owner_id' => (int) $unit['owner_id'],
        'unit_type_id' => $unit['unit_type_id'], 'unit_class' => (int) $unit['unit_class'], 'name' => $unit['name'],
        'texture' => (int) $unit['texture'], 'can_move' => (bool) $unit['can_move'], 'nature' => $unit['nature'],
        'i' => (int) $unit['i'], 'j' => (int) $unit['j'],
        'world_i' => (int) $unit['i'], 'world_j' => (int) $unit['j'], 'attack' => (float) $unit['attack_value'],
        'defense' => (float) $unit['defense_value'], 'speed' => (float) $unit['speed'], 'view_range' => (int) $unit['view_range'],
        'state' => $unit['state'], 'health' => (float) $unit['health'], 'max_health' => (float) $unit['max_health'],
        'experience' => (float) $unit['experience'], 'move_penalty' => (int) $unit['move_penalty'],
        'properties' => $properties, 'revision' => (int) $unit['revision'], 'deleted' => $unit['deleted_at'] !== null,
    ];
}

function normalizeServerMapWindow(PDO $db, array $game, int $playerId, ?int $requestedI = null, ?int $requestedJ = null): array
{
    $worldSize = (int) $game['map_size'];
    $size = min(100, $worldSize);
    if ($requestedI === null || $requestedJ === null) {
        $statement = $db->prepare(
            'SELECT i, j FROM server_game_units WHERE game_id = ? AND owner_id = ?
             AND deleted_at IS NULL AND health > 0 ORDER BY CASE WHEN can_move = 1 THEN 0 ELSE 1 END, id LIMIT 1'
        );
        $statement->execute([(int) $game['id'], $playerId]);
        $focus = $statement->fetch() ?: ['i' => intdiv($worldSize, 2), 'j' => intdiv($worldSize, 2)];
        $requestedI = (int) $focus['i'] - intdiv($size, 2);
        $requestedJ = (int) $focus['j'] - intdiv($size, 2);
    }
    $maximum = max(0, $worldSize - $size);
    $originI = max(0, min($maximum, (int) floor($requestedI / 10) * 10));
    $originJ = max(0, min($maximum, (int) floor($requestedJ / 10) * 10));
    return ['i' => $originI, 'j' => $originJ, 'size' => $size,
        'max_i' => $originI + $size - 1, 'max_j' => $originJ + $size - 1];
}

function requestedServerMapWindow(PDO $db, array $game, int $playerId, array $data): array
{
    $i = isset($data['map_origin_i']) && is_numeric($data['map_origin_i'])
        ? (int) $data['map_origin_i'] : null;
    $j = isset($data['map_origin_j']) && is_numeric($data['map_origin_j'])
        ? (int) $data['map_origin_j'] : null;
    return normalizeServerMapWindow($db, $game, $playerId, $i, $j);
}

function unitUpdates(PDO $db, array $game, int $playerId, int $since, ?array $window = null): array
{
    $window = $window ?: ['i' => 0, 'j' => 0, 'max_i' => (int) $game['map_size'] - 1,
        'max_j' => (int) $game['map_size'] - 1];
    $statement = $db->prepare(
        'SELECT DISTINCT u.*, p.unit_type_id AS production_unit_type_id,
                p.production_points AS selected_production_points,
                p.production_cost AS selected_production_cost,
                p.queue_json AS selected_production_queue_json
         FROM server_game_units u
         LEFT JOIN server_game_visibility v ON v.game_id = u.game_id AND v.player_id = ? AND v.i = u.i AND v.j = u.j
         LEFT JOIN productions p ON p.game_id = u.game_id AND p.city_unit_id = u.id
         WHERE u.game_id = ? AND (u.owner_id = ? OR (v.visibility_level = 2
           AND u.i BETWEEN ? AND ? AND u.j BETWEEN ? AND ?))
           AND (u.revision > ? OR COALESCE(v.revision, 0) > ?)
         ORDER BY u.id'
    );
    $statement->execute([$playerId, $game['id'], $playerId,
        $window['i'], $window['max_i'], $window['j'], $window['max_j'], $since, $since]);
    $units = array_map('publicUnit', $statement->fetchAll());

    $statement = $db->prepare(
        'SELECT u.id FROM server_game_units u
         JOIN server_game_visibility v ON v.game_id = u.game_id AND v.player_id = ? AND v.i = u.i AND v.j = u.j
         WHERE u.game_id = ? AND u.owner_id <> ? AND u.deleted_at IS NULL AND v.visibility_level = 2
           AND u.i BETWEEN ? AND ? AND u.j BETWEEN ? AND ?'
    );
    $statement->execute([$playerId, $game['id'], $playerId,
        $window['i'], $window['max_i'], $window['j'], $window['max_j']]);
    $visibleEnemyIds = array_map('intval', $statement->fetchAll(PDO::FETCH_COLUMN));

    $statement = $db->prepare(
        'SELECT id FROM server_game_units
         WHERE game_id = ? AND owner_id = ? AND deleted_at IS NULL ORDER BY id'
    );
    $statement->execute([$game['id'], $playerId]);
    $ownedUnitIds = array_map('intval', $statement->fetchAll(PDO::FETCH_COLUMN));

    $statement = $db->prepare(
        'SELECT i, j, visibility_level, resource_visible, revision FROM server_game_visibility
         WHERE game_id = ? AND player_id = ? AND revision > ?
           AND i BETWEEN ? AND ? AND j BETWEEN ? AND ? ORDER BY i, j'
    );
    $statement->execute([$game['id'], $playerId, $since,
        $window['i'], $window['max_i'], $window['j'], $window['max_j']]);
    $visibility = $statement->fetchAll();
    foreach ($visibility as &$visibleTile) {
        $visibleTile['world_i'] = (int) $visibleTile['i'];
        $visibleTile['world_j'] = (int) $visibleTile['j'];
        $visibleTile['i'] = (int) $visibleTile['i'] - $window['i'];
        $visibleTile['j'] = (int) $visibleTile['j'] - $window['j'];
    }
    unset($visibleTile);

    $statement = $db->prepare(
        'SELECT id, turn_number, event_type, unit_id, other_unit_id, i, j, message, payload_json, revision
         FROM server_game_events WHERE game_id = ? AND audience_player_id = ? AND revision > ? ORDER BY id'
    );
    $statement->execute([$game['id'], $playerId, $since]);
    $events = [];
    foreach ($statement->fetchAll() as $event) {
        $event['payload'] = json_decode((string) $event['payload_json'], true) ?: [];
        unset($event['payload_json']);
        $events[] = $event;
    }
    $statement = $db->prepare('SELECT state_json FROM server_game_players WHERE game_id = ? AND player_id = ?');
    $statement->execute([$game['id'], $playerId]);
    $stateJson = $statement->fetchColumn();
    $playerState = normalizePlayerState($stateJson === false ? [] : (json_decode((string) $stateJson, true) ?: []));
    return [
        'units' => $units,
        'owned_unit_ids' => $ownedUnitIds,
        'visible_enemy_ids' => $visibleEnemyIds,
        'visibility' => $visibility,
        'events' => $events,
        'player_state' => $playerState,
    ];
}

function landscapeUpdates(PDO $db, array $game, int $playerId, int $since, ?array $window = null): array
{
    $window = $window ?: ['i' => 0, 'j' => 0, 'max_i' => (int) $game['map_size'] - 1,
        'max_j' => (int) $game['map_size'] - 1];
    $statement = $db->prepare(
        'SELECT m.i, m.j, m.terrain_tex, m.terrain_bits,
                CASE WHEN COALESCE(v.resource_visible, 0) = 1 THEN m.resource_type ELSE 0 END AS resource_type,
                m.modifiers_json, GREATEST(m.revision, COALESCE(v.revision, 0)) AS revision,
                COALESCE(v.visibility_level, 0) AS visibility_level,
                COALESCE(v.resource_visible, 0) AS resource_visible
         FROM server_game_map m
         LEFT JOIN server_game_visibility v ON v.game_id = m.game_id AND v.player_id = ? AND v.i = m.i AND v.j = m.j
         WHERE m.game_id = ? AND m.i BETWEEN ? AND ? AND m.j BETWEEN ? AND ?
           AND (m.revision > ? OR COALESCE(v.revision, 0) > ?) ORDER BY m.i, m.j'
    );
    $statement->execute([$playerId, $game['id'],
        $window['i'], $window['max_i'], $window['j'], $window['max_j'], $since, $since]);
    $tiles = [];
    foreach ($statement->fetchAll() as $tile) {
        $tile['i'] = (int) $tile['i'];
        $tile['j'] = (int) $tile['j'];
        $tile['world_i'] = $tile['i'];
        $tile['world_j'] = $tile['j'];
        $tile['i'] -= $window['i'];
        $tile['j'] -= $window['j'];
        $tile['terrain_tex'] = (int) $tile['terrain_tex'];
        $tile['terrain_bits'] = (int) $tile['terrain_bits'];
        $tile['resource_type'] = (int) $tile['resource_type'];
        $tile['visibility_level'] = (int) $tile['visibility_level'];
        $tile['resource_visible'] = (bool) $tile['resource_visible'];
        $tile['revision'] = (int) $tile['revision'];
        $tile['modifiers'] = $tile['visibility_level'] > 0
            ? (json_decode((string) $tile['modifiers_json'], true) ?: [])
            : [];
        unset($tile['modifiers_json']);
        $tiles[] = $tile;
    }
    return $tiles;
}

function serverCivilizations(PDO $db, array $game, int $viewerId): array
{
    $catalog = civilizationCatalog();
    $relations = loadServerRelations($db, (int) $game['id']);
    $directionalRelations = loadServerDirectionalRelations($db, (int) $game['id']);
    $testLoginPattern = '^(server[_]test[_]|logout[_]test[_]|device[_]test[_]|handoff[_]test[_]|ai[_]parent[_]test[_]|phone[_]session[_])';
    $statement = $db->prepare(
        "SELECT p.player_id, p.civilization_key, p.active, p.state_json,
                p.units_killed, p.cities_occupied, p.cities_destroyed,
                CASE WHEN u.user_type = 'ai' THEN 'Barbarian'
                     ELSE COALESCE(u.login, CONCAT('Player ', p.player_id)) END AS player_name,
                SUM(CASE WHEN gu.id IS NOT NULL AND gu.deleted_at IS NULL THEN 1 ELSE 0 END) AS current_units,
                SUM(CASE WHEN gu.id IS NOT NULL AND gu.deleted_at IS NULL AND gu.unit_class = 3 THEN 1 ELSE 0 END) AS current_cities
         FROM server_game_players p
         LEFT JOIN game_users u ON u.id = p.account_user_id
         LEFT JOIN server_game_units gu ON gu.game_id = p.game_id AND gu.owner_id = p.player_id
         WHERE p.game_id = ?
           AND LOWER(COALESCE(u.login, '')) NOT REGEXP ?
         GROUP BY p.player_id, p.civilization_key, p.active, p.state_json, p.units_killed, p.cities_occupied,
                  p.cities_destroyed, u.login, u.user_type
         ORDER BY p.player_id"
    );
    $statement->execute([(int) $game['id'], $testLoginPattern]);
    $result = [];
    foreach ($statement->fetchAll() as $player) {
        $playerId = (int) $player['player_id'];
        $key = (string) ($player['civilization_key'] ?: civilizationKeyForPlayer($playerId));
        $identity = $catalog[$key] ?? $catalog['romans'];
        $state = json_decode((string) ($player['state_json'] ?? '{}'), true);
        if (!is_array($state)) $state = [];
        $result[] = [
            'player_id' => $playerId,
            'player_name' => (string) $player['player_name'],
            'civilization_key' => $key,
            'civilization_name' => $identity['name'],
            'coat' => $identity,
            'relation' => $playerId === $viewerId
                ? 'self' : serverDirectionalRelation($directionalRelations, $viewerId, $playerId),
            'combat_relation' => $playerId === $viewerId
                ? 'self' : (serverPlayersAtWar($relations, $viewerId, $playerId) ? 'war' : 'neutral'),
            'active' => (bool) $player['active'],
            'food' => max(0, (int) ($state['food'] ?? 0)),
            'gold' => max(0, (int) ($state['money'] ?? 0)),
            'current_units' => (int) $player['current_units'],
            'current_cities' => (int) $player['current_cities'],
            'units_killed' => (int) $player['units_killed'],
            'cities_occupied' => (int) $player['cities_occupied'],
            'cities_destroyed' => (int) $player['cities_destroyed'],
        ];
    }
    return $result;
}

function orphanServerPlayers(PDO $db, array $game): array
{
    $testLoginPattern = '^(server[_]test[_]|logout[_]test[_]|device[_]test[_]|handoff[_]test[_]|ai[_]parent[_]test[_]|phone[_]session[_])';
    $statement = $db->prepare(
        "SELECT candidates.player_id, MAX(candidates.login) AS login,
                GROUP_CONCAT(DISTINCT candidates.reason ORDER BY candidates.reason) AS reason,
                COUNT(DISTINCT gu.id) AS unit_count
         FROM (
             SELECT p.player_id, account.login,
                    CASE WHEN p.account_user_id IS NULL OR account.id IS NULL
                         THEN 'missing_account' ELSE 'test_human' END AS reason
             FROM server_game_players p
             LEFT JOIN game_users account ON account.id = p.account_user_id
             WHERE p.game_id = ? AND (
                 p.account_user_id IS NULL OR account.id IS NULL
                 OR (account.user_type = 'human' AND LOWER(account.login) REGEXP ?)
             )
             UNION
             SELECT owned.owner_id AS player_id, NULL AS login, 'missing_player' AS reason
             FROM server_game_units owned
             LEFT JOIN server_game_players p
               ON p.game_id = owned.game_id AND p.player_id = owned.owner_id
             WHERE owned.game_id = ? AND p.player_id IS NULL
         ) candidates
         LEFT JOIN server_game_units gu ON gu.game_id = ? AND gu.owner_id = candidates.player_id
         GROUP BY candidates.player_id ORDER BY candidates.player_id"
    );
    $gameId = (int) $game['id'];
    $statement->execute([$gameId, $testLoginPattern, $gameId, $gameId]);
    return array_map(static function(array $row): array {
        return [
            'player_id' => (int) $row['player_id'],
            'login' => $row['login'] === null ? null : (string) $row['login'],
            'reason' => (string) $row['reason'],
            'unit_count' => (int) $row['unit_count'],
        ];
    }, $statement->fetchAll());
}

function cleanupOrphanServerPlayers(PDO $db, array $game, bool $confirmed): array
{
    $orphans = orphanServerPlayers($db, $game);
    if (!$confirmed || !$orphans) {
        return ['removed' => false, 'players' => $orphans, 'removed_units' => 0, 'revision' => (int) $game['revision']];
    }

    $playerIds = array_column($orphans, 'player_id');
    $placeholders = implode(',', array_fill(0, count($playerIds), '?'));
    $gameId = (int) $game['id'];
    $db->beginTransaction();
    try {
        $game = loadGame($db, (string) $game['game_key'], true);
        $unitStatement = $db->prepare(
            'SELECT id FROM server_game_units WHERE game_id = ? AND owner_id IN (' . $placeholders . ')'
        );
        $unitStatement->execute(array_merge([$gameId], $playerIds));
        $unitIds = array_map('intval', $unitStatement->fetchAll(PDO::FETCH_COLUMN));

        $deleteByPlayer = [
            'productions' => 'player_id',
            'server_game_orders' => 'player_id',
            'server_game_submissions' => 'player_id',
            'server_game_visibility' => 'player_id',
        ];
        foreach ($deleteByPlayer as $table => $column) {
            $statement = $db->prepare(
                'DELETE FROM ' . $table . ' WHERE game_id = ? AND ' . $column . ' IN (' . $placeholders . ')'
            );
            $statement->execute(array_merge([$gameId], $playerIds));
        }
        $statement = $db->prepare(
            'DELETE FROM server_game_relations WHERE game_id = ? AND (player_a IN (' . $placeholders
            . ') OR player_b IN (' . $placeholders . '))'
        );
        $statement->execute(array_merge([$gameId], $playerIds, $playerIds));

        $eventSql = 'DELETE FROM server_game_events WHERE game_id = ? AND audience_player_id IN (' . $placeholders . ')';
        $eventParameters = array_merge([$gameId], $playerIds);
        if ($unitIds) {
            $unitPlaceholders = implode(',', array_fill(0, count($unitIds), '?'));
            $eventSql .= ' OR (game_id = ? AND (unit_id IN (' . $unitPlaceholders
                . ') OR other_unit_id IN (' . $unitPlaceholders . ')))';
            $eventParameters = array_merge($eventParameters, [$gameId], $unitIds, $unitIds);
        }
        $statement = $db->prepare($eventSql);
        $statement->execute($eventParameters);

        $statement = $db->prepare(
            'DELETE FROM server_game_units WHERE game_id = ? AND owner_id IN (' . $placeholders . ')'
        );
        $statement->execute(array_merge([$gameId], $playerIds));
        $removedUnits = $statement->rowCount();
        $statement = $db->prepare(
            'DELETE FROM server_game_players WHERE game_id = ? AND player_id IN (' . $placeholders . ')'
        );
        $statement->execute(array_merge([$gameId], $playerIds));
        $revision = (int) $game['revision'] + 1;
        $statement = $db->prepare('UPDATE server_games SET revision = ? WHERE id = ?');
        $statement->execute([$revision, $gameId]);
        $db->commit();
        serverTrace('orphan_players_cleaned', [
            'game_id' => $gameId, 'players' => $playerIds, 'removed_units' => $removedUnits,
        ]);
        return ['removed' => true, 'players' => $orphans, 'removed_units' => $removedUnits, 'revision' => $revision];
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

function eventUpdates(PDO $db, array $game, int $playerId, int $sinceEventId): array
{
    $ownsTransaction = !$db->inTransaction();
    if ($ownsTransaction) $db->beginTransaction();
    try {
        // Lock-and-delete makes event delivery single-consumer even when a slow
        // browser has overlapping make_turn and load_update requests.
        $statement = $db->prepare(
            'SELECT id, turn_number, revision, event_type, unit_id, other_unit_id, i, j, message, payload_json
             FROM server_game_events
             WHERE game_id = ? AND audience_player_id = ? AND id > ? ORDER BY id LIMIT 500 FOR UPDATE'
        );
        $statement->execute([(int) $game['id'], $playerId, $sinceEventId]);
        $events = [];
        $lastEventId = $sinceEventId;
        $eventIds = [];
        foreach ($statement->fetchAll() as $event) {
            $event['id'] = (int) $event['id'];
            $event['turn_number'] = (int) $event['turn_number'];
            $event['revision'] = (int) $event['revision'];
            $event['unit_id'] = $event['unit_id'] === null ? null : (int) $event['unit_id'];
            $event['other_unit_id'] = $event['other_unit_id'] === null ? null : (int) $event['other_unit_id'];
            $event['i'] = $event['i'] === null ? null : (int) $event['i'];
            $event['j'] = $event['j'] === null ? null : (int) $event['j'];
            $event['payload'] = json_decode((string) $event['payload_json'], true) ?: [];
            unset($event['payload_json']);
            $lastEventId = max($lastEventId, $event['id']);
            $eventIds[] = $event['id'];
            $events[] = $event;
        }
        if ($eventIds) {
            $placeholders = implode(',', array_fill(0, count($eventIds), '?'));
            $delete = $db->prepare(
                'DELETE FROM server_game_events WHERE game_id = ? AND audience_player_id = ? AND id IN (' . $placeholders . ')'
            );
            $delete->execute(array_merge([(int) $game['id'], $playerId], $eventIds));
        }
        if ($ownsTransaction) $db->commit();
    } catch (Throwable $error) {
        if ($ownsTransaction && $db->inTransaction()) $db->rollBack();
        throw $error;
    }
    return [
        'events' => $events,
        'last_event_id' => $lastEventId,
        'civilizations' => serverCivilizations($db, $game, $playerId),
    ];
}

function fullGameLoad(
    PDO $db, array $game, int $playerId, ?int $authenticatedUserId, bool $includeFullMap, ?array $window = null
): array
{
    $window = $window ?: normalizeServerMapWindow($db, $game, $playerId);
    $unitData = unitUpdates($db, $game, $playerId, 0, $window);
    $unitData['events'] = [];
    $unitData['units'] = array_values(array_filter(
        $unitData['units'], static fn(array $unit): bool => empty($unit['deleted'])
    ));
    // A full page reload starts from the current authoritative snapshot; historical events are not replayed.
    $statement = $db->prepare(
        'DELETE FROM server_game_events WHERE game_id = ? AND audience_player_id = ?'
    );
    $statement->execute([(int) $game['id'], $playerId]);
    return array_merge($unitData, [
        'tiles' => array_values(array_filter(
            landscapeUpdates($db, $game, $playerId, 0, $window),
            static fn(array $tile): bool => $includeFullMap || (int) $tile['visibility_level'] > 0
        )),
        'civilizations' => serverCivilizations($db, $game, $playerId),
        'last_event_id' => 0,
        'controlled_players' => $authenticatedUserId === null ? [] : controlledPlayers($db, $authenticatedUserId),
        'full_map' => $includeFullMap,
        'map_size' => (int) $game['map_size'],
        'map_origin' => ['i' => $window['i'], 'j' => $window['j']],
        'map_window_size' => $window['size'],
        'respawn_required' => playerNeedsRespawn($db, $game, $playerId),
    ]);
}

function lockedGameAndResolution(PDO $db, string $key, int $playerId): array
{
    $db->beginTransaction();
    try {
        $game = loadGame($db, $key, true);
        if (!$game) {
            $db->rollBack();
            serverError(404, 'game_not_found', 'Game does not exist.');
        }
        $resolution = ['resolved_turn' => null, 'new_turn' => (int) $game['turn_number'], 'revision' => (int) $game['revision'], 'events' => []];
        $deadlinePassed = strtotime($game['turn_deadline_at'] . ' UTC') <= time();
        if ($deadlinePassed) {
            $statement = $db->prepare(
                'SELECT COUNT(*) FROM server_game_submissions WHERE game_id = ? AND turn_number = ?'
            );
            $statement->execute([(int) $game['id'], (int) $game['turn_number']]);
            $submitted = (int) $statement->fetchColumn();
            if ($submitted > 0) {
                serverTrace('poll_timeout_resolution', [
                    'turn' => (int) $game['turn_number'],
                    'submitted_players' => $submitted,
                    'deadline_at' => $game['turn_deadline_at'],
                ]);
                $resolution = resolveTurn($db, $game);
                $game = loadGame($db, $key, true);
            }
        }
        $db->commit();
        return [$game, $resolution];
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

function playerAlreadySubmitted(PDO $db, array $game, int $playerId): bool
{
    $statement = $db->prepare(
        'SELECT 1 FROM server_game_submissions WHERE game_id = ? AND turn_number = ? AND player_id = ? LIMIT 1'
    );
    $statement->execute([(int) $game['id'], (int) $game['turn_number'], $playerId]);
    return (bool) $statement->fetchColumn();
}

function resetRejectedImprovementUnit(
    PDO $db,
    string $gameKey,
    int $playerId,
    int $unitId
): ?array {
    if ($unitId <= 0) return null;
    $db->beginTransaction();
    try {
        $game = loadGame($db, $gameKey, true);
        if (!$game) {
            $db->rollBack();
            return null;
        }
        $statement = $db->prepare(
            'SELECT * FROM server_game_units
             WHERE game_id = ? AND id = ? AND owner_id = ? AND deleted_at IS NULL FOR UPDATE'
        );
        $statement->execute([(int) $game['id'], $unitId, $playerId]);
        $unit = $statement->fetch();
        if (!$unit || !in_array((string) $unit['unit_type_id'], ['worker', 'workboat'], true)) {
            $db->rollBack();
            return null;
        }
        $properties = json_decode((string) ($unit['properties_json'] ?? '{}'), true);
        if (!is_array($properties)) $properties = [];
        foreach (['road_turns_left', 'irrigation_turns_left', 'building_turns_left',
            'clientImprovementTurnsLeft', 'clientImprovementState'] as $property) {
            unset($properties[$property]);
        }
        $revision = (int) $game['revision'] + 1;
        $statement = $db->prepare(
            "UPDATE server_game_units SET state = 'ready', properties_json = ?, revision = ? WHERE id = ?"
        );
        $statement->execute([jsonObject($properties), $revision, $unitId]);
        $statement = $db->prepare('UPDATE server_games SET revision = ? WHERE id = ?');
        $statement->execute([$revision, (int) $game['id']]);
        $statement = $db->prepare('SELECT * FROM server_game_units WHERE id = ?');
        $statement->execute([$unitId]);
        $unit = $statement->fetch();
        $db->commit();
        return $unit ? publicUnit($unit) : null;
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        throw $error;
    }
}

function executeClientTurnActions(PDO $db, string $gameKey, int $playerId, array $actions): array
{
    global $serverBatchErrorMode;
    $results = [];
    foreach (array_slice($actions, 0, 500) as $index => $action) {
        $clientActionId = is_array($action) && isset($action['client_action_id'])
            ? (string) $action['client_action_id'] : (string) $index;
        $type = is_array($action) ? strtolower(trim((string) ($action['type'] ?? ''))) : '';
        if (!is_array($action)) {
            $results[] = [
                'client_action_id' => $clientActionId, 'type' => $type, 'ok' => false,
                'error' => ['code' => 'invalid_batched_action', 'message' => 'Batched action must be an object.'],
            ];
            continue;
        }
        try {
            $serverBatchErrorMode = true;
            $game = loadGame($db, $gameKey);
            if (!$game) throw new ServerGameRequestError(404, 'game_not_found', 'Game does not exist.');
            if ($type === 'build') {
                $payload = immediateBuild(
                    $db, $game, $playerId,
                    max(0, (int) ($action['worker_unit_id'] ?? 0)),
                    strtolower(trim((string) ($action['building_type'] ?? '')))
                );
            } elseif ($type === 'build_city') {
                $payload = buildCity($db, $game, $playerId, max(0, (int) ($action['settler_unit_id'] ?? 0)));
            } elseif ($type === 'grow_city') {
                $payload = growCity(
                    $db, $game, $playerId, max(0, (int) ($action['city_unit_id'] ?? 0)),
                    is_numeric($action['food_stored'] ?? null) ? (float) $action['food_stored'] : -1.0
                );
            } elseif ($type === 'heal_units') {
                $payload = healCityUnits(
                    $db, $game, $playerId, max(0, (int) ($action['city_unit_id'] ?? 0)),
                    is_array($action['unit_ids'] ?? null) ? $action['unit_ids'] : []
                );
            } elseif ($type === 'select_production') {
                $unitTypeId = array_key_exists('unit_type_id', $action) && $action['unit_type_id'] !== null
                    ? (string) $action['unit_type_id'] : null;
                $payload = selectCityProduction(
                    $db, $game, $playerId, max(0, (int) ($action['city_unit_id'] ?? 0)), $unitTypeId
                );
            } elseif ($type === 'remove_production') {
                $payload = removeCityProduction(
                    $db, $game, $playerId, max(0, (int) ($action['city_unit_id'] ?? 0)),
                    max(0, (int) ($action['queue_index'] ?? 0))
                );
            } elseif ($type === 'optimize_city') {
                $payload = optimizeCity(
                    $db, $game, $playerId, max(0, (int) ($action['city_unit_id'] ?? 0)),
                    strtolower(trim((string) ($action['optimization'] ?? '')))
                );
            } elseif ($type === 'complete_production') {
                $payload = completeCityProduction(
                    $db, $game, $playerId, max(0, (int) ($action['city_unit_id'] ?? 0))
                );
            } elseif ($type === 'disband_unit') {
                $payload = disbandUnit(
                    $db, $game, $playerId, max(0, (int) ($action['unit_id'] ?? 0))
                );
            } else {
                throw new ServerGameRequestError(422, 'unsupported_batched_action', 'Unsupported batched action type.');
            }
            if ($type === 'build' && ($payload['status'] ?? '') === 'IMPOSSIBLE') {
                $resetUnit = resetRejectedImprovementUnit(
                    $db, $gameKey, $playerId, max(0, (int) ($action['worker_unit_id'] ?? 0))
                );
                if ($resetUnit) $payload['worker'] = $resetUnit;
            }
            $results[] = [
                'client_action_id' => $clientActionId, 'type' => $type, 'ok' => true, 'result' => $payload,
            ];
        } catch (ServerGameRequestError $error) {
            if ($db->inTransaction()) $db->rollBack();
            $resetUnit = null;
            if ($type === 'build') {
                try {
                    $resetUnit = resetRejectedImprovementUnit(
                        $db, $gameKey, $playerId, max(0, (int) ($action['worker_unit_id'] ?? 0))
                    );
                } catch (Throwable $resetError) {
                    serverTrace('rejected_build_reset_failed', [
                        'player_id' => $playerId,
                        'worker_unit_id' => max(0, (int) ($action['worker_unit_id'] ?? 0)),
                        'message' => $resetError->getMessage(),
                    ]);
                }
            }
            $item = [
                'client_action_id' => $clientActionId, 'type' => $type, 'ok' => false,
                'error' => ['code' => $error->errorCode, 'message' => $error->getMessage()],
            ];
            if ($error->details) $item['error']['details'] = $error->details;
            if ($resetUnit) $item['worker'] = $resetUnit;
            $results[] = $item;
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            $results[] = [
                'client_action_id' => $clientActionId, 'type' => $type, 'ok' => false,
                'error' => [
                    'code' => $error instanceof PDOException ? 'database_error' : 'server_runtime_error',
                    'message' => serverExceptionDetails($error)['message'],
                ],
            ];
        } finally {
            $serverBatchErrorMode = false;
        }
    }
    serverTrace('client_turn_actions_processed', [
        'player_id' => $playerId, 'requested' => count($actions),
        'processed' => count($results),
        'failed' => count(array_filter($results, static fn(array $result): bool => !$result['ok'])),
    ]);
    return $results;
}

function completeReadyProductionsForPlayer(PDO $db, string $gameKey, int $playerId): array
{
    global $serverBatchErrorMode;
    $game = loadGame($db, $gameKey);
    if (!$game) return [];
    $statement = $db->prepare(
        'SELECT p.city_unit_id FROM productions p
         JOIN server_game_units u ON u.game_id = p.game_id AND u.id = p.city_unit_id
         WHERE p.game_id = ? AND p.player_id = ? AND u.owner_id = ?
           AND u.deleted_at IS NULL AND p.production_points + 0.0001 >= p.production_cost
         ORDER BY p.city_unit_id LIMIT 100'
    );
    $statement->execute([(int) $game['id'], $playerId, $playerId]);
    $cityIds = array_map('intval', $statement->fetchAll(PDO::FETCH_COLUMN));
    $results = [];
    foreach ($cityIds as $cityId) {
        for ($guard = 0; $guard < 16; ++$guard) {
            try {
                $serverBatchErrorMode = true;
                $game = loadGame($db, $gameKey);
                if (!$game) break 2;
                $result = completeCityProduction($db, $game, $playerId, $cityId);
                $results[] = ['city_unit_id' => $cityId, 'ok' => true, 'result' => $result];
                if (($result['status'] ?? '') === 'PAUSE') break;
                $production = $result['city']['properties']['production'] ?? null;
                if (!is_array($production)) break;
                $definitions = serverUnitDefinitions();
                $nextType = (string) ($production['unitTypeId'] ?? '');
                $nextCost = (float) ($definitions[$nextType]['cost'] ?? PHP_FLOAT_MAX);
                if ((float) ($production['productionPoints'] ?? 0) + 0.0001 < $nextCost) break;
            } catch (ServerGameRequestError $error) {
                if ($db->inTransaction()) $db->rollBack();
                $results[] = [
                    'city_unit_id' => $cityId, 'ok' => false,
                    'error' => ['code' => $error->errorCode, 'message' => $error->getMessage()],
                ];
                break;
            } finally {
                $serverBatchErrorMode = false;
            }
        }
    }
    return $results;
}

function combinedPlayerUpdates(
    PDO $db,
    array $game,
    int $playerId,
    int $unitSince,
    int $landscapeSince,
    int $eventSince,
    ?array $window = null
): array {
    $window = $window ?: normalizeServerMapWindow($db, $game, $playerId);
    $eventData = eventUpdates($db, $game, $playerId, $eventSince);
    $unitData = unitUpdates($db, $game, $playerId, $unitSince, $window);
    unset($unitData['events']);
    return array_merge($unitData, $eventData, [
        'tiles' => landscapeUpdates($db, $game, $playerId, $landscapeSince, $window),
        'map_origin' => ['i' => $window['i'], 'j' => $window['j']],
        'map_window_size' => $window['size'],
        'respawn_required' => playerNeedsRespawn($db, $game, $playerId),
    ]);
}

if (defined('SERVER_GAME_LIBRARY_ONLY')) {
    return;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    phpPerformanceAddResponseHeaders();
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    serverError(405, 'method_not_allowed', 'Use POST.');
}

try {
    $data = serverRequest();
    $providedSecret = isset($data['secret']) && is_string($data['secret']) ? $data['secret'] : '';
    if ($providedSecret === '' || !hash_equals(serverSecret('.game_api_secret'), $providedSecret)) {
        serverError(403, 'application_not_allowed', 'Application secret is invalid.');
    }
    $action = isset($data['action']) ? strtolower((string) $data['action']) : '';
    if (!in_array($action, ['make_turn', 'load_full', 'load_update', 'update_units', 'update_landscape', 'update_events', 'build', 'build_city', 'grow_city', 'heal_units', 'disband_unit', 'set_unit_automation', 'select_production', 'remove_production', 'complete_production', 'claim_ai_batch', 'submit_ai_batch', 'map_diagnostics', 'regenerate_map', 'reset_game', 'cleanup_orphan_players', 'report_cli_error', 'respawn_player', 'hotfix_strategic_resources', 'repair_worker_automation', 'worker_diagnostics', 'ai_diagnostics'], true)) {
        serverError(400, 'unknown_action', 'Unsupported server-game action.');
    }
    if ($action === 'report_cli_error') {
        $report = writeClientErrorReport($data);
        serverRespond(201, [
            'ok' => true, 'request' => 'report_cli_error',
            'report_number' => $report['report_number'], 'report_file' => $report['report_file'],
        ]);
    }
    $key = gameKey($data);
    $playerId = intField($data, 'player_id', 0);
    $db = serverDatabase();
    ensureServerSchema($db);
    $authenticatedUserId = authenticateRegisteredGamePlayer($db, $key, $playerId, $data, $action);

    if ($action === 'cleanup_orphan_players') {
        $game = loadGame($db, $key);
        if (!$game) serverError(404, 'game_not_found', 'Game does not exist.');
        $confirmed = ($data['confirm'] ?? null) === 'REMOVE_ORPHANS';
        $result = cleanupOrphanServerPlayers($db, $game, $confirmed);
        serverRespond(200, [
            'ok' => true, 'request' => 'cleanup_orphan_players', 'game_id' => $key,
            'player_id' => $playerId, 'confirmed' => $confirmed,
            'removed' => $result['removed'], 'orphan_players' => $result['players'],
            'removed_units' => $result['removed_units'], 'revision' => $result['revision'],
        ]);
    }

    if ($action === 'reset_game') {
        if (($data['confirm'] ?? null) !== 'RESET') {
            serverError(422, 'reset_confirmation_required', 'reset_game requires confirm="RESET".');
        }
        $result = resetServerGame($db, $key);
        $game = $result['game'];
        serverRespond(200, [
            'ok' => true, 'request' => 'reset_game', 'game_id' => $key,
            'player_id' => $playerId, 'turn' => (int) $game['turn_number'],
            'revision' => (int) $game['revision'], 'map_size' => (int) $game['map_size'],
            'players_provisioned' => $result['players_provisioned'],
            'cleared_games' => $result['cleared_games'],
            'map_quality' => $result['map_quality'],
            'deadline_at' => gmdate(DATE_ATOM, strtotime($game['turn_deadline_at'] . ' UTC')),
        ]);
    }

    if ($action === 'respawn_player') {
        ensureGame($db, $key, $playerId, null);
        $game = loadGame($db, $key);
        $preferred = isset($data['preferred_i'], $data['preferred_j'])
            && is_numeric($data['preferred_i']) && is_numeric($data['preferred_j'])
            ? ['i' => (int) $data['preferred_i'], 'j' => (int) $data['preferred_j']]
            : null;
        $force = !empty($data['force_respawn']);
        $respawn = respawnPlayerIfUnitless($db, $game, $playerId, $preferred, $force);
        if (!$respawn) serverError(409, 'respawn_not_required', 'This player still has movable units.');
        $game = loadGame($db, $key);
        $respawnWindow = normalizeServerMapWindow(
            $db, $game, $playerId,
            (int) $respawn['start']['i'] - 50, (int) $respawn['start']['j'] - 50
        );
        $snapshot = fullGameLoad($db, $game, $playerId, $authenticatedUserId, true, $respawnWindow);
        serverRespond(200, [
            'ok' => true, 'request' => 'respawn_player', 'game_id' => $key,
            'player_id' => $playerId, 'spawn' => $respawn['start'],
            'unit_id_map' => $respawn['unit_id_map'], 'revision' => $respawn['revision'],
            'deleted_units' => $respawn['deleted_units'],
            'removed_improvement_tiles' => $respawn['removed_improvement_tiles'],
            'snapshot' => $snapshot,
            'map_size' => (int) $game['map_size'], 'turn' => (int) $game['turn_number'],
            'deadline_at' => gmdate(DATE_ATOM, strtotime($game['turn_deadline_at'] . ' UTC')),
        ]);
    }

    if ($action === 'regenerate_map') {
        clearStoredServerMapForRegeneration($db, $key);
        $generated = ensureGeneratedGameMap($db, $key, SERVER_GAME_DEFAULT_MAP_SIZE);
        $game = loadGame($db, $key);
        $diagnostics = storedServerMapDiagnostics($db, $game);
        serverTrace('regenerate_map_finished', $diagnostics);
        serverRespond(200, [
            'ok' => true, 'request' => 'regenerate_map', 'game_id' => $key,
            'player_id' => $playerId, 'regenerated' => !empty($generated['regenerated']),
            'diagnostics' => $diagnostics,
        ]);
    }

    if ($action === 'hotfix_strategic_resources') {
        if (($data['confirm'] ?? null) !== 'HOTFIX_STRATEGIC_RESOURCES') {
            serverError(422, 'hotfix_confirmation_required',
                'hotfix_strategic_resources requires confirm="HOTFIX_STRATEGIC_RESOURCES".');
        }
        ensureGeneratedGameMap($db, $key, SERVER_GAME_DEFAULT_MAP_SIZE);
        $game = loadGame($db, $key);
        if (!$game) serverError(404, 'game_not_found', 'Game does not exist.');
        $result = hotfixStrategicResources($db, $game);
        serverTrace('strategic_resources_hotfixed', [
            'new_resources' => $result['new_resources'],
            'new_guard_units' => $result['new_guard_units'],
            'automated_workers' => $result['automated_workers'],
        ]);
        serverRespond(200, array_merge([
            'ok' => true, 'request' => 'hotfix_strategic_resources',
            'game_id' => $key, 'player_id' => $playerId,
        ], $result));
    }

    if ($action === 'repair_worker_automation') {
        if (($data['confirm'] ?? null) !== 'REPAIR_WORKER_AUTOMATION') {
            serverError(422, 'repair_confirmation_required',
                'repair_worker_automation requires confirm="REPAIR_WORKER_AUTOMATION".');
        }
        ensureGeneratedGameMap($db, $key, SERVER_GAME_DEFAULT_MAP_SIZE);
        $game = loadGame($db, $key);
        if (!$game) serverError(404, 'game_not_found', 'Game does not exist.');
        $unitIds = isset($data['unit_ids']) && is_array($data['unit_ids']) ? $data['unit_ids'] : [];
        $repaired = repairWorkerAutomationModes($db, $game, $unitIds);
        serverRespond(200, [
            'ok' => true, 'request' => 'repair_worker_automation',
            'game_id' => $key, 'player_id' => $playerId, 'repaired_unit_ids' => $repaired,
        ]);
    }

    if ($action === 'map_diagnostics') {
        ensureGame($db, $key, $playerId, null);
        $game = loadGame($db, $key);
        $diagnostics = storedServerMapDiagnostics($db, $game);
        serverTrace('map_diagnostics', $diagnostics);
        serverRespond(200, [
            'ok' => true, 'request' => 'map_diagnostics', 'game_id' => $key,
            'player_id' => $playerId, 'diagnostics' => $diagnostics,
        ]);
    }

    if ($action === 'worker_diagnostics') {
        ensureGeneratedGameMap($db, $key, SERVER_GAME_DEFAULT_MAP_SIZE);
        $game = loadGame($db, $key);
        if (!$game) serverError(404, 'game_not_found', 'Game does not exist.');
        $workerId = intField($data, 'worker_unit_id', 1);
        serverRespond(200, [
            'ok' => true, 'request' => 'worker_diagnostics', 'game_id' => $key,
            'player_id' => $playerId, 'diagnostics' => workerDiagnostics($db, $game, $workerId),
        ]);
    }

    if ($action === 'ai_diagnostics') {
        ensureGeneratedGameMap($db, $key, SERVER_GAME_DEFAULT_MAP_SIZE);
        $game = loadGame($db, $key);
        if (!$game) serverError(404, 'game_not_found', 'Game does not exist.');
        serverRespond(200, [
            'ok' => true, 'request' => 'ai_diagnostics', 'game_id' => $key,
            'player_id' => $playerId, 'diagnostics' => aiDiagnostics($db, $game),
        ]);
    }

    if ($action === 'claim_ai_batch') {
        ensureGeneratedGameMap($db, $key, SERVER_GAME_DEFAULT_MAP_SIZE);
        $clientKey = substr(trim((string) ($data['client_key'] ?? '')), 0, 80);
        if ($clientKey === '') serverError(422, 'invalid_client_key', 'client_key is required for an AI work lease.');
        $db->beginTransaction();
        try {
            $game = loadGame($db, $key, true);
            $batch = claimGlobalAiBatch($db, $game, $clientKey);
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        $snapshot = null;
        if (!empty($data['include_snapshot']) && $batch['unit_ids']) {
            $focus = [
                'i' => (int) ($batch['focus_i'] ?? 50),
                'j' => (int) ($batch['focus_j'] ?? 50),
            ];
            $aiWindow = normalizeServerMapWindow(
                $db, $game, (int) $batch['ai_player_id'], (int) $focus['i'] - 50, (int) $focus['j'] - 50
            );
            $snapshot = fullGameLoad(
                $db, $game, (int) $batch['ai_player_id'], $authenticatedUserId, false, $aiWindow
            );
        }
        serverRespond(200, array_merge([
            'ok' => true, 'request' => 'claim_ai_batch', 'game_id' => $key,
            'player_id' => $playerId, 'snapshot' => $snapshot,
            'deadline_at' => gmdate(DATE_ATOM, strtotime($game['turn_deadline_at'] . ' UTC')),
        ], $batch));
    }

    if ($action === 'submit_ai_batch') {
        $clientKey = substr(trim((string) ($data['client_key'] ?? '')), 0, 80);
        $leaseToken = strtolower(trim((string) ($data['lease_token'] ?? '')));
        if ($clientKey === '' || !preg_match('/^[a-f0-9]{32}$/', $leaseToken)) {
            serverError(422, 'invalid_ai_lease', 'A current AI lease token and client_key are required.');
        }
        $commands = isset($data['commands']) && is_array($data['commands']) ? $data['commands'] : [];
        $actions = isset($data['actions']) && is_array($data['actions']) ? $data['actions'] : [];
        $leasedUnitIds = isset($data['leased_unit_ids']) && is_array($data['leased_unit_ids'])
            ? $data['leased_unit_ids'] : [];
        $db->beginTransaction();
        try {
            $game = loadGame($db, $key, true);
            $clientTurn = isset($data['turn']) ? (int) $data['turn'] : (int) $game['turn_number'];
            rejectInvalidAtomicMovements($db, $game, ensureGlobalAiUser($db), $commands);
            $result = submitGlobalAiBatch(
                $db, $game, $clientKey, $leaseToken, $commands, $leasedUnitIds, $clientTurn
            );
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        $actionResults = [];
        if (!empty($result['accepted']) && $actions) {
            $leased = array_fill_keys(array_map('intval', $result['unit_ids'] ?? []), true);
            // Bound hostile input first, then retain leased actions before the
            // normal object-count limit. Hidden browser snapshots can queue
            // unrelated City actions ahead of a valid Worker completion.
            $actions = array_values(array_filter(array_slice($actions, 0, 256),
                static function($queuedAction) use ($leased): bool {
                    if (!is_array($queuedAction)) return false;
                    $type = strtolower((string) ($queuedAction['type'] ?? ''));
                    $unitId = (int) ($queuedAction['worker_unit_id']
                        ?? $queuedAction['settler_unit_id'] ?? $queuedAction['city_unit_id'] ?? 0);
                    return isset($leased[$unitId])
                        && in_array($type, ['build', 'build_city', 'grow_city', 'select_production'], true);
                }
            ));
            $actions = array_slice($actions, 0, globalAiBatchSize($clientKey));
            if ($actions) {
                $actionResults = executeClientTurnActions(
                    $db, $key, ensureGlobalAiUser($db), $actions
                );
            }
        }
        serverRespond(200, array_merge([
            'ok' => true, 'request' => 'submit_ai_batch', 'game_id' => $key,
            'player_id' => $playerId, 'turn' => (int) $game['turn_number'],
            'action_results' => $actionResults,
        ], $result));
    }

    if ($action === 'build') {
        ensureGame($db, $key, $playerId, null);
        $game = loadGame($db, $key);
        $workerId = intField($data, 'worker_unit_id', 1);
        $buildingType = strtolower(trim((string) ($data['building_type'] ?? '')));
        $result = immediateBuild($db, $game, $playerId, $workerId, $buildingType);
        serverRespond(200, [
            'ok' => true, 'request' => 'build', 'game_id' => $key, 'player_id' => $playerId,
            'turn' => (int) $game['turn_number'], 'revision' => $result['revision'],
            'status' => $result['status'], 'already_built' => $result['already_built'],
            'reason' => $result['reason'] ?? null,
            'building' => $result['building'], 'tile' => $result['tile'],
        ]);
    }

    if ($action === 'build_city') {
        ensureGame($db, $key, $playerId, null);
        $game = loadGame($db, $key);
        $settlerId = intField($data, 'settler_unit_id', 1);
        $result = buildCity($db, $game, $playerId, $settlerId);
        $game = loadGame($db, $key);
        serverRespond(200, [
            'ok' => true, 'request' => 'build_city', 'game_id' => $key, 'player_id' => $playerId,
            'map_size' => (int) $game['map_size'], 'turn' => (int) $game['turn_number'],
            'revision' => $result['revision'], 'deadline_at' => gmdate(DATE_ATOM, strtotime($game['turn_deadline_at'] . ' UTC')),
            'settler' => $result['settler'], 'city' => $result['city'], 'tile' => $result['tile'],
        ]);
    }

    if ($action === 'grow_city') {
        ensureGame($db, $key, $playerId, null);
        $game = loadGame($db, $key);
        $cityId = intField($data, 'city_unit_id', 1);
        if (!isset($data['food_stored']) || !is_numeric($data['food_stored'])) {
            serverError(422, 'invalid_food_stored', 'food_stored must be numeric.');
        }
        $result = growCity($db, $game, $playerId, $cityId, (float) $data['food_stored']);
        $game = loadGame($db, $key);
        serverRespond(200, [
            'ok' => true, 'request' => 'grow_city', 'game_id' => $key, 'player_id' => $playerId,
            'map_size' => (int) $game['map_size'], 'turn' => (int) $game['turn_number'],
            'revision' => $result['revision'], 'growth_cost' => $result['growth_cost'],
            'city' => $result['city'],
            'deadline_at' => gmdate(DATE_ATOM, strtotime($game['turn_deadline_at'] . ' UTC')),
        ]);
    }

    if ($action === 'heal_units') {
        ensureGame($db, $key, $playerId, null);
        $game = loadGame($db, $key);
        $cityId = intField($data, 'city_unit_id', 1);
        $unitIds = isset($data['unit_ids']) && is_array($data['unit_ids']) ? $data['unit_ids'] : [];
        $result = healCityUnits($db, $game, $playerId, $cityId, $unitIds);
        serverRespond(200, [
            'ok' => true, 'request' => 'heal_units', 'game_id' => $key, 'player_id' => $playerId,
            'turn' => $result['turn'], 'revision' => $result['revision'],
            'status' => $result['status'], 'city_unit_id' => $cityId,
            'heal_percent' => $result['heal_percent'] ?? 10, 'units' => $result['units'],
        ]);
    }

    if ($action === 'disband_unit') {
        ensureGame($db, $key, $playerId, null);
        $game = loadGame($db, $key);
        $unitId = intField($data, 'unit_id', 1);
        $result = disbandUnit($db, $game, $playerId, $unitId);
        $game = loadGame($db, $key);
        serverRespond(200, [
            'ok' => true, 'request' => 'disband_unit', 'game_id' => $key, 'player_id' => $playerId,
            'map_size' => (int) $game['map_size'], 'turn' => (int) $game['turn_number'],
            'revision' => $result['revision'], 'unit' => $result['unit'],
            'deadline_at' => gmdate(DATE_ATOM, strtotime($game['turn_deadline_at'] . ' UTC')),
        ]);
    }

    if ($action === 'set_unit_automation') {
        ensureGame($db, $key, $playerId, null);
        $game = loadGame($db, $key);
        $unitId = intField($data, 'unit_id', 1);
        $mode = array_key_exists('automation_mode', $data) && $data['automation_mode'] !== null
            ? strtolower(trim((string) $data['automation_mode'])) : null;
        $result = setUnitAutomationMode($db, $game, $playerId, $unitId, $mode);
        serverRespond(200, [
            'ok' => true, 'request' => 'set_unit_automation',
            'game_id' => $key, 'player_id' => $playerId,
            'turn' => (int) $game['turn_number'], 'revision' => $result['revision'],
            'automation_mode' => $result['automation_mode'], 'worker' => $result['worker'],
        ]);
    }

    if ($action === 'select_production') {
        ensureGame($db, $key, $playerId, null);
        $game = loadGame($db, $key);
        $cityId = intField($data, 'city_unit_id', 1);
        $unitTypeId = array_key_exists('unit_type_id', $data) && $data['unit_type_id'] !== null
            ? (string) $data['unit_type_id'] : null;
        $result = selectCityProduction($db, $game, $playerId, $cityId, $unitTypeId);
        $game = loadGame($db, $key);
        serverRespond(200, [
            'ok' => true, 'request' => 'select_production', 'game_id' => $key, 'player_id' => $playerId,
            'map_size' => (int) $game['map_size'], 'turn' => (int) $game['turn_number'],
            'revision' => $result['revision'], 'deadline_at' => gmdate(DATE_ATOM, strtotime($game['turn_deadline_at'] . ' UTC')),
            'city' => $result['city'],
        ]);
    }

    if ($action === 'remove_production') {
        ensureGame($db, $key, $playerId, null);
        $game = loadGame($db, $key);
        $cityId = intField($data, 'city_unit_id', 1);
        $queueIndex = intField($data, 'queue_index', 0);
        $result = removeCityProduction($db, $game, $playerId, $cityId, $queueIndex);
        $game = loadGame($db, $key);
        serverRespond(200, [
            'ok' => true, 'request' => 'remove_production', 'game_id' => $key, 'player_id' => $playerId,
            'map_size' => (int) $game['map_size'], 'turn' => (int) $game['turn_number'],
            'revision' => $result['revision'], 'removed_unit_type_id' => $result['removed_unit_type_id'],
            'city' => $result['city'],
            'deadline_at' => gmdate(DATE_ATOM, strtotime($game['turn_deadline_at'] . ' UTC')),
        ]);
    }

    if ($action === 'complete_production') {
        ensureGame($db, $key, $playerId, null);
        $game = loadGame($db, $key);
        $cityId = intField($data, 'city_unit_id', 1);
        $result = completeCityProduction($db, $game, $playerId, $cityId);
        $game = loadGame($db, $key);
        if (($result['status'] ?? '') === 'PAUSE') {
            serverRespond(200, array_merge([
                'ok' => true, 'request' => 'complete_production',
                'game_id' => $key, 'player_id' => $playerId,
                'map_size' => (int) $game['map_size'], 'turn' => (int) $game['turn_number'],
                'revision' => (int) $game['revision'],
                'deadline_at' => gmdate(DATE_ATOM, strtotime($game['turn_deadline_at'] . ' UTC')),
            ], $result));
        }
        serverRespond(200, [
            'ok' => true, 'request' => 'complete_production', 'game_id' => $key, 'player_id' => $playerId,
            'map_size' => (int) $game['map_size'], 'turn' => (int) $game['turn_number'],
            'revision' => $result['revision'], 'production_cost' => $result['production_cost'],
            'remaining_points' => $result['remaining_points'], 'city' => $result['city'], 'unit' => $result['unit'],
            'deadline_at' => gmdate(DATE_ATOM, strtotime($game['turn_deadline_at'] . ' UTC')),
        ]);
    }

    if ($action === 'make_turn') {
        $bootstrap = isset($data['bootstrap']) && is_array($data['bootstrap']) ? $data['bootstrap'] : null;
        $initialized = ensureGame($db, $key, $playerId, $bootstrap);
        $game = loadGame($db, $key);
        $actions = isset($data['actions']) && is_array($data['actions']) ? $data['actions'] : [];
        // A duplicate turn submission must not replay queue additions, City growth, or construction.
        $duplicateBeforeActions = $game && playerAlreadySubmitted($db, $game, $playerId);
        $actionResults = $duplicateBeforeActions
            ? array_map(static function($queuedAction, int $index): array {
                return [
                    'client_action_id' => is_array($queuedAction) && isset($queuedAction['client_action_id'])
                        ? (string) $queuedAction['client_action_id'] : (string) $index,
                    'type' => is_array($queuedAction) ? (string) ($queuedAction['type'] ?? '') : '',
                    'ok' => true, 'duplicate_skipped' => true,
                ];
            }, array_slice($actions, 0, 500), array_keys(array_slice($actions, 0, 500)))
            : executeClientTurnActions($db, $key, $playerId, $actions);
        $db->beginTransaction();
        try {
            $game = loadGame($db, $key, true);
            $respawnedUnitMap = [];
            // The client turn is diagnostic only. Commands always join the
            // authoritative turn protected by this transaction's game-row lock.
            $clientTurn = isset($data['turn']) ? (int) $data['turn'] : null;
            $acceptedTurn = (int) $game['turn_number'];
            serverTrace('client_turn_assigned', [
                'player_id' => $playerId, 'client_turn' => $clientTurn,
                'authoritative_turn' => $acceptedTurn,
            ]);
            $commands = isset($data['commands']) && is_array($data['commands']) ? $data['commands'] : [];
            $playerState = isset($data['player_state']) && is_array($data['player_state']) ? $data['player_state'] : [];
            $rejectedMovements = rejectInvalidAtomicMovements($db, $game, $playerId, $commands);
            if ($rejectedMovements) serverTrace('atomic_movements_rejected', $rejectedMovements);
            $relationPreferences = isset($data['relations']) && is_array($data['relations']) ? $data['relations'] : [];
            $ordersStored = storePlayerOrders(
                $db, $game, $playerId, $commands, $playerState, $relationPreferences
            );
            $resolution = maybeResolveTurn($db, $game);
            $game = loadGame($db, $key, true);
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) $db->rollBack();
            throw $error;
        }
        $productionResults = [];
        $game = loadGame($db, $key);
        $updates = null;
        if (!empty($data['include_updates'])) {
            $window = requestedServerMapWindow($db, $game, $playerId, $data);
            $updates = combinedPlayerUpdates(
                $db, $game, $playerId,
                max(0, (int) ($data['since_unit_revision'] ?? 0)),
                max(0, (int) ($data['since_landscape_revision'] ?? 0)),
                max(0, (int) ($data['since_event_id'] ?? 0)),
                $window
            );
            $updates = array_merge([
                'map_size' => (int) $game['map_size'], 'turn' => (int) $game['turn_number'],
                'revision' => (int) $game['revision'], 'resolved_turn' => $resolution['resolved_turn'],
                'deadline_at' => gmdate(DATE_ATOM, strtotime($game['turn_deadline_at'] . ' UTC')),
            ], $updates);
        }
        serverRespond(200, [
            'ok' => true, 'request' => 'make_turn', 'game_id' => $key, 'player_id' => $playerId,
            'created' => $initialized['created'], 'unit_id_map' => $initialized['unit_id_map'],
            'respawned' => false, 'respawned_unit_id_map' => [],
            'respawn_required' => playerNeedsRespawn($db, $game, $playerId),
            'duplicate_submission' => !$ordersStored,
            'map_quality' => $initialized['map_quality'] ?? null,
            'client_turn' => $clientTurn, 'submitted_turn' => $acceptedTurn,
            'resolved_turn' => $resolution['resolved_turn'],
            'rejected_movements' => $rejectedMovements,
            'combat_units' => combatUnitUpdatesForPlayer($resolution['events'], $playerId),
            'action_results' => $actionResults, 'production_results' => $productionResults,
            'updates' => $updates,
            'map_size' => (int) $game['map_size'], 'turn' => (int) $game['turn_number'], 'revision' => (int) $game['revision'],
            'deadline_at' => gmdate(DATE_ATOM, strtotime($game['turn_deadline_at'] . ' UTC')),
        ]);
    }

    // Read access also recreates an explicitly emptied map. A non-empty map is never regenerated.
    ensureGame($db, $key, $playerId, null);
    [$game, $resolution] = lockedGameAndResolution($db, $key, $playerId);
    if ($action === 'load_full') {
        $game = loadGame($db, $key);
        $includeFullMap = !array_key_exists('include_map', $data) || (bool) $data['include_map'];
        $window = requestedServerMapWindow($db, $game, $playerId, $data);
        $snapshot = fullGameLoad($db, $game, $playerId, $authenticatedUserId, $includeFullMap, $window);
        serverRespond(200, array_merge([
            'ok' => true, 'request' => 'load_full', 'game_id' => $key, 'player_id' => $playerId,
            'map_size' => (int) $game['map_size'], 'turn' => (int) $game['turn_number'], 'revision' => (int) $game['revision'],
            'resolved_turn' => $resolution['resolved_turn'],
            'deadline_at' => gmdate(DATE_ATOM, strtotime($game['turn_deadline_at'] . ' UTC')),
        ], $snapshot));
    }
    if ($action === 'load_update') {
        $productionResults = [];
        $game = loadGame($db, $key);
        $window = requestedServerMapWindow($db, $game, $playerId, $data);
        $updates = combinedPlayerUpdates(
            $db, $game, $playerId,
            max(0, (int) ($data['since_unit_revision'] ?? 0)),
            max(0, (int) ($data['since_landscape_revision'] ?? 0)),
            max(0, (int) ($data['since_event_id'] ?? 0)),
            $window
        );
        serverRespond(200, array_merge([
            'ok' => true, 'request' => 'load_update', 'game_id' => $key, 'player_id' => $playerId,
            'map_size' => (int) $game['map_size'], 'turn' => (int) $game['turn_number'],
            'revision' => (int) $game['revision'], 'resolved_turn' => $resolution['resolved_turn'],
            'production_results' => $productionResults,
            'deadline_at' => gmdate(DATE_ATOM, strtotime($game['turn_deadline_at'] . ' UTC')),
        ], $updates));
    }
    if ($action === 'update_events') {
        $sinceEventId = isset($data['since_event_id']) ? max(0, (int) $data['since_event_id']) : 0;
        $eventData = eventUpdates($db, $game, $playerId, $sinceEventId);
        serverRespond(200, array_merge([
            'ok' => true, 'request' => 'update_events', 'game_id' => $key, 'player_id' => $playerId,
            'map_size' => (int) $game['map_size'], 'turn' => (int) $game['turn_number'], 'revision' => (int) $game['revision'],
            'resolved_turn' => $resolution['resolved_turn'],
            'deadline_at' => gmdate(DATE_ATOM, strtotime($game['turn_deadline_at'] . ' UTC')),
        ], $eventData));
    }
    $since = isset($data['since_revision']) ? max(0, (int) $data['since_revision']) : 0;
    if ($action === 'update_units') {
        $window = requestedServerMapWindow($db, $game, $playerId, $data);
        $updates = unitUpdates($db, $game, $playerId, $since, $window);
        serverRespond(200, array_merge([
            'ok' => true, 'request' => 'update_units', 'game_id' => $key, 'player_id' => $playerId,
            'map_size' => (int) $game['map_size'], 'turn' => (int) $game['turn_number'], 'revision' => (int) $game['revision'],
            'resolved_turn' => $resolution['resolved_turn'],
            'deadline_at' => gmdate(DATE_ATOM, strtotime($game['turn_deadline_at'] . ' UTC')),
        ], $updates));
    }
    $window = requestedServerMapWindow($db, $game, $playerId, $data);
    $tiles = landscapeUpdates($db, $game, $playerId, $since, $window);
    serverRespond(200, [
        'ok' => true, 'request' => 'update_landscape', 'game_id' => $key, 'player_id' => $playerId,
        'map_size' => (int) $game['map_size'], 'turn' => (int) $game['turn_number'], 'revision' => (int) $game['revision'],
        'resolved_turn' => $resolution['resolved_turn'], 'tiles' => $tiles,
        'map_origin' => ['i' => $window['i'], 'j' => $window['j']], 'map_window_size' => $window['size'],
        'deadline_at' => gmdate(DATE_ATOM, strtotime($game['turn_deadline_at'] . ' UTC')),
    ]);
} catch (Throwable $error) {
    error_log('server game [' . $requestId . ']: ' . $error->getMessage());
    $details = serverExceptionDetails($error);
    $code = $error instanceof PDOException ? 'database_error' : 'server_runtime_error';
    serverError(500, $code, $details['message'], $details);
}

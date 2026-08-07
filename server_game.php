<?php
declare(strict_types=1);

$serverGameRequestStartedNs = hrtime(true);
require_once __DIR__ . '/game_auth.php';
require_once __DIR__ . '/php_performance.php';

const SERVER_GAME_SCHEMA_VERSION = 14;
const SERVER_GAME_TURN_SECONDS = 6;
const SERVER_GAME_TURN_GRACE_SECONDS = 0;
const SERVER_GAME_DEADLINE_SECONDS = SERVER_GAME_TURN_SECONDS + SERVER_GAME_TURN_GRACE_SECONDS;
const SERVER_GAME_MAX_BODY = 8388608;
const SERVER_GAME_DEFAULT_KEY = 'aiciv-default';
const SERVER_GAME_DEFAULT_MAP_SIZE = 100;
const SERVER_GAME_LOG_MAX_BYTES = 8388608;
const SERVER_GAME_TRACE_EVENT_LIMIT = 200;
const SERVER_GAME_TILE_UNIT_LIMIT = 5;
const SERVER_GAME_INITIAL_HEALTH = 100.0;
const SERVER_GAME_INITIAL_EXPERIENCE = 1.0;
const SERVER_GAME_FORTIFIED_DEFENSE_BONUS = 0.25;
const SERVER_GAME_FORTIFICATION_DEFENSE_BONUS = 0.50;

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
    phpPerformanceStart('server_game', $requestId, null, $serverGameRequestStartedNs);
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
    $directory = __DIR__ . '/reports';
    if (!is_dir($directory) && !@mkdir($directory, 0750, true) && !is_dir($directory)) {
        throw new RuntimeException('Client report directory could not be created.');
    }
    $lock = @fopen($directory . '/.report.lock', 'c');
    if ($lock === false || !flock($lock, LOCK_EX)) {
        if (is_resource($lock)) fclose($lock);
        throw new RuntimeException('Client report sequence could not be locked.');
    }
    try {
        $next = 1;
        foreach (glob($directory . '/*.rtp') ?: [] as $path) {
            $number = (int) pathinfo($path, PATHINFO_FILENAME);
            if ($number >= $next) $next = $number + 1;
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
        return ['report_number' => $report['report_number'], 'report_file' => 'reports/' . $filename];
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
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
    $path = __DIR__ . '/.server_game_requests.log';
    if (is_file($path) && filesize($path) > SERVER_GAME_LOG_MAX_BYTES) {
        @unlink($path . '.1');
        @rename($path, $path . '.1');
    }
    $loggedRequest = $serverRequestData;
    if (($serverRequestData['action'] ?? '') === 'report_cli_error') {
        $loggedRequest = [
            'action' => 'report_cli_error',
            'source_request_type' => $serverRequestData['source_request_type'] ?? 'unknown',
            'player_id' => $serverRequestData['player_id'] ?? null,
            'unit_id' => $serverRequestData['unit_id'] ?? null,
            'error_code' => $serverRequestData['error_code'] ?? '',
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
        'response' => sanitizeServerLog($response),
    ];
    $line = json_encode($entry, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($line !== false) @file_put_contents($path, $line . "\n", FILE_APPEND | LOCK_EX);
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
    $raw = file_get_contents('php://input');
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
    return new PDO(
        'mysql:host=localhost;dbname=softmaxi_game;charset=utf8mb4',
        'softmaxi_admin',
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
    if (in_array($action, ['map_diagnostics', 'regenerate_map', 'reset_game', 'cleanup_orphan_players'], true)) {
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
    $authorized = ($actorType === 'human' && $actorUserId === $sessionUserId && $playerId === $sessionUserId)
        || ($actorType === 'ai' && (int) $actor['parent_id'] === $sessionUserId && $playerId === $actorUserId);
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
         WHERE id = ? OR (user_type = 'ai' AND parent_id = ?)
         ORDER BY CASE WHEN user_type = 'human' THEN 0 ELSE 1 END, id"
    );
    $statement->execute([$humanUserId, $humanUserId]);
    return array_map(static function(array $player): array {
        return [
            'player_id' => (int) $player['player_id'],
            'user_type' => (string) $player['user_type'],
            'parent_id' => $player['parent_id'] === null ? null : (int) $player['parent_id'],
            'online' => (bool) $player['online'],
        ];
    }, $statement->fetchAll());
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
            $games = $db->query('SELECT id, revision FROM server_games')->fetchAll();
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
    $superTileTextures = [65 => true, 68 => true, 81 => true, 84 => true, 97 => true, 100 => true, 118 => true];
    for ($i = 0; $i < $mapSize - 1; $i++) {
        for ($j = 0; $j < $mapSize - 1; $j++) {
            $index = $i * $mapSize + $j;
            $base = $terrain[$index] & 0x3f;
            $superTexture = $base + 0x40;
            if (isset($superTileTextures[$superTexture])
                && ($terrain[($i + 1) * $mapSize + $j] & 0x3f) === $base
                && ($terrain[$i * $mapSize + $j + 1] & 0x3f) === $base
                && ($terrain[($i + 1) * $mapSize + $j + 1] & 0x3f) === $base) {
                $terrain[($i + 1) * $mapSize + $j] = $superTexture;
                $terrain[($i + 1) * $mapSize + $j + 1] = $superTexture;
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
        1 => [[6, 2], 0.012], 2 => [[2], 0.012], 3 => [[4, 5], 0.010],
        4 => [[0, 7], 0.010], 5 => [[6, 3], 0.010], 6 => [[0], 0.012],
        7 => [[2, 7], 0.012], 8 => [[2, 4], 0.012], 9 => [[4, 5], 0.012],
        10 => [[2, 7], 0.012], 11 => [[6, 3], 0.007], 12 => [[2, 6], 0.008],
        13 => [[2, 1], 0.008], 14 => [[6, 2], 0.008], 15 => [[4, 5], 0.005],
        16 => [[3, 6], 0.007], 17 => [[1, 4, 5], 0.008], 18 => [[6, 2], 0.008],
        19 => [[1, 4], 0.007], 20 => [[2, 6], 0.006], 21 => [[4, 5], 0.007],
        22 => [[2, 4], 0.008], 23 => [[0], 0.006], 24 => [[1, 0, 4], 0.008],
        25 => [[6], 0.006], 26 => [[4, 5], 0.007], 27 => [[6, 2], 0.008],
        28 => [[2, 7], 0.008], 29 => [[4, 6], 0.007], 30 => [[0], 0.006],
        31 => [[0], 0.005], 32 => [[2, 4], 0.007], 33 => [[2, 1], 0.010],
        34 => [[4, 5], 0.009], 35 => [[4, 5, 1], 0.007],
        36 => [[4, 5], 0.006],
    ];
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

    // Match map.js terrain paths. Do not impose a geometric coastline over them;
    // that converted the projected play area into one visibly rectangular island.
    serverGenerateMapPaths($terrain, $mapSize, $randomState, 14, 20, 32, 10, $minX, $minY, $maxX, $maxY, 2, 0);
    serverGenerateMapPaths($terrain, $mapSize, $randomState, 10, 10, 4, 4, $minX, $minY + ($maxY - $minY) / 3, $maxX, $maxY - ($maxY - $minY) / 3, 1, 1);
    serverGenerateMapPaths($terrain, $mapSize, $randomState, 12, 2, 4, 2, $minX, $minY + ($maxY - $minY) / 3, $maxX, $maxY - ($maxY - $minY) / 3, 5, 1);
    serverGenerateMapPaths($terrain, $mapSize, $randomState, 16, 12, 6, 10, $minX, $minY, $maxX, $maxY, 4, 1);
    serverGenerateMapPaths($terrain, $mapSize, $randomState, 40, 12, 12, 6, $minX, $minY, $maxX, $maxY, 6, 1);
    serverGenerateMapPaths($terrain, $mapSize, $randomState, 10, 10, 10, 5, $minX, $minY, $maxX, $minY + ($maxY - $minY) / 10, 3, 1);
    serverGenerateMapPaths($terrain, $mapSize, $randomState, 10, 10, 10, 5, $minX, $maxY - ($maxY - $minY) / 10, $maxX, $maxY, 3, 1);
    serverFixMap($terrain, $mapSize, $minY, $maxY);
    serverGenerateMapPaths($terrain, $mapSize, $randomState, 16, 20, 4, 4, $minX, $minY, $maxX, $maxY, -1, 2);
    serverGenerateMapPaths($terrain, $mapSize, $randomState, 10, 20, 1, 1, $minX, $minY, $maxX, $maxY, 0x10, 0);
    serverGenerateMapPaths($terrain, $mapSize, $randomState, 6, 10, 1, 1, $minX, $minY + ($maxY - $minY) / 10, $maxX, $maxY - ($maxY - $minY) / 10, 0x37, 1);
    serverEnhanceMap($terrain, $terrainBits, $mapSize, $randomState);

    $resources = serverResourceDefinitions();
    $tiles = [];
    for ($i = 0; $i < $mapSize; $i++) {
        for ($j = 0; $j < $mapSize; $j++) {
            $index = $i * $mapSize + $j;
            $terrainType = $terrain[$index] & 0x0f;
            $resourceType = 0;
            foreach ($resources as $resourceId => $definition) {
                if (in_array($terrainType, $definition[0], true)
                    && serverMapRandom($randomState) < $definition[1]) {
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
    $landBounds = ['min_i' => null, 'max_i' => null, 'min_j' => null, 'max_j' => null];
    $landTiles = 0;
    foreach ($tiles as $tile) {
        $terrainType = ((int) $tile['terrain_tex']) & 0x0f;
        $terrainCounts[$terrainType] = ($terrainCounts[$terrainType] ?? 0) + 1;
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
    return $quality + [
        'game_database_id' => (int) $game['id'],
        'map_size' => (int) $game['map_size'],
        'stored_tiles' => count($tiles),
        'all_grid_land_tiles' => $landTiles,
        'all_grid_land_ratio' => count($tiles) ? $landTiles / count($tiles) : 0.0,
        'land_bounds' => $landBounds,
        'terrain_type_counts' => $terrainCounts,
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
            'SELECT player_id, account_user_id FROM server_game_players WHERE game_id = ? ORDER BY player_id'
        );
        $statement->execute([$gameId]);
        $players = $statement->fetchAll();

        foreach (['productions', 'server_game_orders', 'server_game_submissions', 'server_game_events', 'server_game_relations',
                  'server_game_visibility', 'server_game_units', 'server_game_map'] as $table) {
            $statement = $db->prepare('DELETE FROM ' . $table . ' WHERE game_id = ?');
            $statement->execute([$gameId]);
        }
        $statement = $db->prepare(
            'UPDATE server_game_players
             SET active = 0, eliminated = 0, state_json = ?, last_seen_revision = 0,
                 units_killed = 0, cities_occupied = 0, cities_destroyed = 0
             WHERE game_id = ?'
        );
        $statement->execute([jsonObject(defaultPlayerState()), $gameId]);
        $statement = $db->prepare(
            'UPDATE server_games SET turn_number = 0, revision = revision + 1,
             turn_started_at = UTC_TIMESTAMP(),
             turn_deadline_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND)
             WHERE id = ?'
        );
        $statement->execute([SERVER_GAME_DEADLINE_SECONDS, $gameId]);
        $db->commit();
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
    // Provisioning a populated world can take longer than one turn. Discard any
    // browser submissions that raced the reset and publish a fresh turn only now.
    $db->beginTransaction();
    try {
        $game = loadGame($db, $key, true);
        $gameId = (int) $game['id'];
        foreach (['server_game_orders', 'server_game_submissions', 'server_game_events'] as $table) {
            $statement = $db->prepare('DELETE FROM ' . $table . ' WHERE game_id = ?');
            $statement->execute([$gameId]);
        }
        $statement = $db->prepare(
            'UPDATE server_game_players SET state_json = ?, last_seen_revision = 0 WHERE game_id = ?'
        );
        $statement->execute([jsonObject(defaultPlayerState()), $gameId]);
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
        'money' => 500,
        'food' => 100,
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
    if (!isset($state['money']) || !is_numeric($state['money'])) $state['money'] = 500;
    if (!isset($state['food']) || !is_numeric($state['food'])) $state['food'] = 100;
    return $state;
}

function civilizationCatalog(): array
{
    return [
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
    $keys = array_keys(civilizationCatalog());
    return $keys[$playerId % count($keys)];
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
    ];
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

function validPlayerStartNear(PDO $db, int $gameId, int $mapSize, int $targetI, int $targetJ, array $excluded = [], ?float $maximumCenterDistance = null): array
{
    $tileStatement = $db->prepare(
        'SELECT i, j, terrain_tex, resource_type FROM server_game_map
         WHERE game_id = ? AND (terrain_tex & 15) IN (2, 7)'
    );
    $tileStatement->execute([$gameId]);
    $best = null;
    $bestScore = INF;
    foreach ($tileStatement->fetchAll() as $tile) {
        $i = (int) $tile['i'];
        $j = (int) $tile['j'];
        if (isset($excluded[coordinateKey($i, $j)])) {
            continue;
        }
        if ($i < 4 || $j < 4 || $i >= $mapSize - 4 || $j >= $mapSize - 4) {
            continue;
        }
        if ($maximumCenterDistance !== null) {
            $center = ($mapSize - 1) / 2;
            if (hypot($i - $center, $j - $center) > $maximumCenterDistance) continue;
        }
        $terrain = ((int) $tile['terrain_tex']) & 0x0f;
        $score = abs($i - $targetI) + abs($j - $targetJ)
            - ($terrain === 7 ? 1.5 : 0.0)
            - ((int) $tile['resource_type'] > 0 ? 0.5 : 0.0);
        if ($score < $bestScore) {
            $bestScore = $score;
            $best = ['i' => $i, 'j' => $j];
        }
    }
    if ($best === null) {
        throw new RuntimeException('Generated map has no valid player starting tile.');
    }
    return $best;
}

function randomPlayerStart(PDO $db, int $gameId, int $mapSize, array $excluded = []): array
{
    $center = ($mapSize - 1) / 2;
    $maximumDistance = max(4.0, $mapSize / 3);
    $angle = random_int(0, 1000000) / 1000000 * 2 * pi();
    $radius = sqrt(random_int(0, 1000000) / 1000000) * $maximumDistance;
    return validPlayerStartNear(
        $db, $gameId, $mapSize,
        (int) round($center + cos($angle) * $radius),
        (int) round($center + sin($angle) * $radius),
        $excluded, $maximumDistance
    );
}

function registeredPlayerStart(PDO $db, int $gameId, int $mapSize): array
{
    $statement = $db->prepare(
        'SELECT owner_id, MIN(i) AS i, MIN(j) AS j FROM server_game_units
         WHERE game_id = ? AND deleted_at IS NULL GROUP BY owner_id ORDER BY owner_id'
    );
    $statement->execute([$gameId]);
    $players = $statement->fetchAll();
    $excluded = [];
    foreach ($players as $player) {
        $excluded[coordinateKey((int) $player['i'], (int) $player['j'])] = true;
    }
    return randomPlayerStart($db, $gameId, $mapSize, $excluded);
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
               AND u.deleted_at IS NULL
             WHERE p.game_id = ? AND p.player_id = ?'
        );
        $statement->execute([$gameId, $playerId]);
        [$livingUnitCount, $eliminated] = $statement->fetch(PDO::FETCH_NUM);
        // The player flag prevents defeated civilizations from respawning; unit tombstones are not retained.
        $createdUnits = (int) $livingUnitCount === 0 && !(bool) $eliminated;
        $mapping = [];
        if ($createdUnits) {
            $start = registeredPlayerStart($db, $gameId, (int) $game['map_size']);
            $revision = (int) $game['revision'] + 1;
            $units = startingUnitSpecs($playerId, $start, 'registered-' . $playerId);
            $mapping = insertBootstrapUnits($db, $gameId, (int) $game['map_size'], $units, $revision);
            $statement = $db->prepare('UPDATE server_games SET revision = ? WHERE id = ?');
            $statement->execute([$revision, $gameId]);
            recomputeVisibility($db, $gameId, (int) $game['map_size'], $revision);
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

function respawnPlayerIfUnitless(PDO $db, array $game, int $playerId): array
{
    $gameId = (int) $game['id'];
    $statement = $db->prepare(
        'SELECT COUNT(*) FROM server_game_units
         WHERE game_id = ? AND owner_id = ? AND can_move = 1
           AND deleted_at IS NULL AND health > 0'
    );
    $statement->execute([$gameId, $playerId]);
    if ((int) $statement->fetchColumn() > 0) return [];

    $start = registeredPlayerStart($db, $gameId, (int) $game['map_size']);
    $revision = (int) $game['revision'] + 1;
    $prefix = 'respawn-' . $playerId . '-' . $revision;
    $mapping = insertBootstrapUnits(
        $db, $gameId, (int) $game['map_size'], startingUnitSpecs($playerId, $start, $prefix), $revision
    );
    $statement = $db->prepare(
        'INSERT INTO server_game_players
         (game_id, player_id, civilization_key, active, eliminated, state_json)
         VALUES (?, ?, ?, 1, 0, ?)
         ON DUPLICATE KEY UPDATE active = 1, eliminated = 0'
    );
    $statement->execute([$gameId, $playerId, civilizationKeyForPlayer($playerId), jsonObject(defaultPlayerState())]);
    $statement = $db->prepare('UPDATE server_games SET revision = ? WHERE id = ?');
    $statement->execute([$revision, $gameId]);
    recomputeVisibility($db, $gameId, (int) $game['map_size'], $revision);
    serverTrace('player_respawned', [
        'game_id' => $gameId, 'player_id' => $playerId, 'start' => $start,
        'created_units' => count($mapping), 'revision' => $revision,
    ]);
    return $mapping;
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

function coordinateKey(int $i, int $j): string
{
    return $i . ':' . $j;
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

function validatePath(
    array $unit, array $rawPath, array $tiles, int $mapSize, ?array &$diagnostic = null, array $units = []
): array
{
    $path = [];
    $i = (int) $unit['i'];
    $j = (int) $unit['j'];
    $limit = min(count($rawPath), max(0, (int) floor((float) $unit['speed'])));
    $diagnostic = ['input_steps' => count($rawPath), 'speed_limit' => $limit, 'accepted_steps' => 0, 'stopped' => null];
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
        $sourceTile = $tiles[coordinateKey($i, $j)] ?? null;
        $sourceWater = $sourceTile && ((((int) $sourceTile['terrain_tex']) & 0x0f) === 0);
        $terrainAllowed = $unit['nature'] === 'water' ? $water : !$water;
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
        $path[] = ['i' => $ni, 'j' => $nj];
        $i = $ni;
        $j = $nj;
        $diagnostic['accepted_steps'] = count($path);
    }
    return $path;
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
        $speedLimit = max(0, (int) floor((float) $unit['speed']));
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
        if (count($path) > $speedLimit) {
            return [
                'reason' => 'movement_exceeds_speed', 'command_index' => $commandIndex,
                'unit_id' => $unitId, 'steps' => count($path), 'speed_limit' => $speedLimit,
            ];
        }
        $diagnostic = null;
        $accepted = validatePath($unit, $path, $tiles, $mapSize, $diagnostic, $allUnits);
        if (count($accepted) !== count($path)) {
            return [
                'reason' => 'movement_path_invalid', 'command_index' => $commandIndex,
                'unit_id' => $unitId, 'start' => ['i' => (int) $unit['i'], 'j' => (int) $unit['j']],
                'path' => $path, 'validation' => $diagnostic,
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
    bool $defenderInCity = false
): array
{
    $attackerBefore = combatUnitSnapshot($attacker);
    $defenderBefore = combatUnitSnapshot($defender);
    $attackerBefore['i'] = (int) ($attacker['start_i'] ?? $attackerBefore['i']);
    $attackerBefore['j'] = (int) ($attacker['start_j'] ?? $attackerBefore['j']);
    $before = ['attacker' => $attackerBefore, 'defender' => $defenderBefore];
    $attackPower = max(0.25, (float) $attacker['attack_value']) * max(1.0, (float) $attacker['experience']);
    $chanceInputs = serverBattleChanceInputs($attacker, $defender, $tiles, $defenderInCity);
    $defenseBonus = $chanceInputs['total_defense_bonus'];
    $defensePower = serverUnitDefenseStrength($defender, $attacker, $tiles, $defenderInCity);
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

function serverBattleChanceInputs(array $attacker, array $defender, array $tiles, bool $defenderInCity = false): array
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
    $buildingBonus = $hasFortification ? SERVER_GAME_FORTIFICATION_DEFENSE_BONUS : 0.0;
    if ($row['building_bonus'] === 'ranged') {
        if ($hasFortification) $buildingBonus += 0.30;
        if ($defenderInCity) $buildingBonus += 0.30;
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

function serverUnitDefenseStrength(array $unit, array $attacker, array $tiles, bool $defenderInCity = false): float
{
    $healthFactor = max(0.25, (float) $unit['health'] / max(1.0, (float) $unit['max_health']));
    $inputs = serverBattleChanceInputs($attacker, $unit, $tiles, $defenderInCity);
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

function serverBestMilitaryDefenderOnTile(array &$units, int $i, int $j, int $ownerId, array $attacker, array $tiles): ?int
{
    $bestId = null;
    $bestStrength = -1.0;
    foreach ($units as $unitId => $unit) {
        if (!serverIsMilitaryUnit($unit) || (int) $unit['owner_id'] !== $ownerId
            || (int) $unit['i'] !== $i || (int) $unit['j'] !== $j) {
            continue;
        }
        $strength = serverUnitDefenseStrength(
            $unit,
            $attacker,
            $tiles,
            serverCityOnTile($units, $i, $j, $ownerId) !== null
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
    array $tiles,
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
        $combat = serverCombat(
            $units[$attackerId], $units[$defenderId], $turn, $i, $j, $events,
            $eventType, $audiencePlayers, $statistics, $tiles, $enemyCityId !== null
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
    $tile = &$tiles[$key];
    $terrainType = ((int) $tile['terrain_tex']) & 0x0F;
    if ($modifier === 'road' && $terrainType === 0) return false;
    if ($modifier === 'irrigation' && $terrainType !== 2) return false;
    if ($modifier === 'mine' && $terrainType !== 4 && $terrainType !== 5) return false;
    if ($modifier === 'fishing_boats' && $terrainType !== 0) return false;
    if ($modifier === 'chop_forest' && $terrainType !== 6) return false;

    $modifiers = json_decode((string) ($tile['modifiers_json'] ?? '{}'), true);
    if (!is_array($modifiers)) $modifiers = [];
    if ($modifier === 'chop_forest') {
        $tile['terrain_tex'] = (((int) $tile['terrain_tex']) & ~0x0F) | 2;
        $chopCityId = serverAddChopProduction($db, $gameId, $units, $unit, $revision, 10.0);
    } else {
        $modifiers[$modifier] = true;
    }
    $tile['modifiers_json'] = jsonObject($modifiers);
    $tile['revision'] = $revision;
    $statement = $db->prepare(
        'UPDATE server_game_map SET terrain_tex = ?, modifiers_json = ?, revision = ? WHERE game_id = ? AND i = ? AND j = ?'
    );
    $statement->execute([$tile['terrain_tex'], $tile['modifiers_json'], $revision, $gameId, $unit['i'], $unit['j']]);
    $unit['state'] = 'ready';
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
        'winery' => 868, 'network' => 870,
    ];
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
        $tileOccupied = false;
        foreach ($modifiers as $present) {
            if ($present) $tileOccupied = true;
        }
        if ($tileOccupied) {
            $revision = (int) $game['revision'] + 1;
            $workerProperties = json_decode((string) ($worker['properties_json'] ?? '{}'), true);
            if (!is_array($workerProperties)) $workerProperties = [];
            foreach (['road_turns_left', 'irrigation_turns_left', 'building_turns_left'] as $property) {
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
                 WHERE game_id = ? AND unit_class = 4 AND i = ? AND j = ? AND deleted_at IS NULL LIMIT 1'
            );
            $statement->execute([(int) $game['id'], $i, $j]);
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
        $validTerrain = !($modifier === 'road' && $terrainType === 0)
            && !($modifier === 'irrigation' && $terrainType !== 2)
            && !($modifier === 'mine' && $terrainType !== 4 && $terrainType !== 5)
            && !($modifier === 'fishing_boats' && $terrainType !== 0)
            && !($modifier === 'network' && $terrainType !== 0)
            && serverImprovementMatchesTileResource($tile, $modifier);
        if (!$validTerrain) {
            $db->rollBack();
            serverError(422, 'building_not_supported', $modifier . ' cannot be built on this terrain.');
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
        $occupancyKey = 'tile:' . $i . ':' . $j;
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
        $statement = $db->prepare(
            'UPDATE server_game_map SET modifiers_json = ?, revision = ? WHERE game_id = ? AND i = ? AND j = ?'
        );
        $statement->execute([jsonObject($modifiers), $revision, (int) $game['id'], $i, $j]);

        $workerProperties = json_decode((string) ($worker['properties_json'] ?? '{}'), true);
        if (!is_array($workerProperties)) $workerProperties = [];
        foreach (['road_turns_left', 'irrigation_turns_left', 'building_turns_left'] as $property) {
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
        if (!$origin && (!is_array($modifiers) || empty($modifiers['irrigation']))) continue;
        $visited[$key] = true;
        if (serverTileIsIrrigationWaterSource($tiles, $i, $j)) return true;
        foreach (serverNeighborDirections() as [$di, $dj]) {
            $ni = $i + $di; $nj = $j + $dj;
            if (serverTileIsIrrigationWaterSource($tiles, $ni, $nj)) return true;
            $neighbor = $tiles[coordinateKey($ni, $nj)] ?? null;
            if (!$neighbor) continue;
            $neighborModifiers = json_decode((string) ($neighbor['modifiers_json'] ?? '{}'), true);
            if (is_array($neighborModifiers) && !empty($neighborModifiers['irrigation'])) {
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
        'chariot' => ['horses'],
        'elephant' => ['ivory'],
        'spearman' => ['copper'],
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
        'pasture' => ['food' => 1.50, 'production' => 1.25], 'farm' => ['food' => 1.75],
        'plantation' => ['food' => 1.25],
        'camp' => ['food' => 1.25, 'production' => 1.50],
        'fishing_boats' => ['food' => 1.50, 'money' => 1.50],
        'quarry' => ['production' => 2.00], 'winery' => ['food' => 1.25],
        'cottage' => ['money' => 2.00], 'workshop' => [],
        'mine' => ['production' => 2.00], 'fortification' => [],
        'network' => ['food' => 1.50],
    ];
}

function serverTerrainIncomeTable(): array
{
    return [
        0 => ['food' => 2, 'production' => 0, 'money' => 0], 1 => ['food' => 0, 'production' => 1, 'money' => 0],
        2 => ['food' => 2, 'production' => 0, 'money' => 0], 3 => ['food' => 0, 'production' => 1, 'money' => 0],
        4 => ['food' => 1, 'production' => 2, 'money' => 0], 5 => ['food' => 0, 'production' => 3, 'money' => 0],
        6 => ['food' => 1, 'production' => 1, 'money' => 0], 7 => ['food' => 3, 'production' => 0, 'money' => 1],
    ];
}

function serverResourceIncomeTable(): array
{
    return [
        1=>[2,0,0],2=>[2,1,0],3=>[0,2,1],4=>[2,0,1],5=>[1,1,0],6=>[1,0,0],7=>[2,0,0],8=>[1,1,0],9=>[0,2,0],10=>[2,0,0],
        11=>[0,0,1],12=>[1,0,1],13=>[0,0,1],14=>[0,0,1],15=>[0,0,2],16=>[0,1,1],17=>[0,2,0],18=>[1,0,1],19=>[0,0,1],20=>[0,1,1],
        21=>[0,2,1],22=>[1,0,1],23=>[0,0,1],24=>[1,0,1],25=>[0,0,1],26=>[0,0,1],27=>[1,0,1],28=>[1,0,1],29=>[0,0,1],30=>[1,0,1],
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
        if ($improvement === 'cottage') {
            $age = (int) ($modifiers['cottageAge'] ?? 0);
            $multipliers = ['money' => $age >= 60 ? 4.0 : ($age >= 30 ? 3.0 : 2.0)];
        }
        foreach ($multipliers as $field => $multiplier) $income[$field] = ceil(($income[$field] ?? 0) * $multiplier);
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
    return serverApplyImprovementYieldMultipliers($income, $modifiers, $isCityTile, $type, $hasWaterSource);
}

function serverImprovementMatchesTileResource(array $tile, string $modifier): bool
{
    if (in_array($modifier, ['road', 'fortification', 'network'], true)) return true;
    $resourceOnly = ['pasture', 'farm', 'plantation', 'camp', 'fishing_boats', 'quarry', 'winery'];
    $resourceName = serverResourceNamesById()[(int) ($tile['resource_type'] ?? 0)] ?? null;
    if ($resourceName === null) return !in_array($modifier, $resourceOnly, true);
    $required = serverResourceImprovementRequirements()[$resourceName] ?? null;
    return $required === null ? !in_array($modifier, $resourceOnly, true) : $modifier === $required;
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
        if (isset($names[$resourceId])) $found[$names[$resourceId]] = true;
        foreach (serverNeighborDirections() as [$di, $dj]) $queue[] = [$i + $di, $j + $dj];
    }
    return $found;
}

function serverCityHasProductionResources(array $tiles, array $city, string $unitTypeId): bool
{
    $required = serverProductionResourceRequirements()[$unitTypeId] ?? [];
    if (!$required) return true;
    $connected = serverConnectedRoadResources($tiles, (int) $city['i'], (int) $city['j']);
    foreach ($required as $resource) {
        if (empty($connected[$resource])) return false;
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
        $modifiers = json_decode((string) ($tile['modifiers_json'] ?? '{}'), true);
        if (!is_array($modifiers)) $modifiers = [];
        $modifiers['road'] = true;
        $modifiers['irrigation'] = true;
        $modifiers['irrigationCityFood'] = serverHasFreshWaterNear($tiles, $i, $j);
        $statement = $db->prepare(
            'UPDATE server_game_map SET modifiers_json = ?, revision = ? WHERE game_id = ? AND i = ? AND j = ?'
        );
        $statement->execute([jsonObject($modifiers), $revision, $gameId, $i, $j]);

        $cityProperties = [
            'odd_move' => 0,
            'productionPoints' => 0,
            'cityProperties' => ['productionPerTurn' => 5, 'productionStored' => 0],
            'production' => null,
            'productionDisabled' => false,
            'cityPopulation' => 1,
            'cityFoodStored' => 0,
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
            $gameId, $clientKey, 'city:' . $i . ':' . $j, $playerId, 'city', 'City', 'land', $i, $j,
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
        $growthCost = 20 + $population * 10;
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
            $healedHealth = min($maximum, $health + $maximum * 0.10);
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
            'turn' => $turn, 'units' => $healedUnits,
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
        $statement = $db->prepare('SELECT state_json FROM server_game_players WHERE game_id = ? AND player_id = ?');
        $statement->execute([$gameId, $playerId]);
        $playerState = json_decode((string) ($statement->fetchColumn() ?: '{}'), true);
        if (!is_array($playerState)) $playerState = [];
        if ($unitTypeId !== null && (float) ($playerState['money'] ?? 0) < 0) {
            $db->rollBack();
            serverError(409, 'production_blocked_by_budget', 'Unit production cannot start while the money account is negative.');
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
        if ($cityStackCount >= SERVER_GAME_TILE_UNIT_LIMIT) {
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

function recomputeVisibility(PDO $db, int $gameId, int $mapSize, int $revision): void
{
    $statement = $db->prepare(
        'UPDATE server_game_visibility SET visibility_level = 1, revision = ? WHERE game_id = ? AND visibility_level = 2'
    );
    $statement->execute([$revision, $gameId]);

    $statement = $db->prepare('SELECT * FROM server_game_units WHERE game_id = ? AND deleted_at IS NULL');
    $statement->execute([$gameId]);
    $units = $statement->fetchAll();
    $upsert = $db->prepare(
        'INSERT INTO server_game_visibility (game_id, player_id, i, j, visibility_level, resource_visible, revision)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE visibility_level = VALUES(visibility_level),
             resource_visible = GREATEST(resource_visible, VALUES(resource_visible)), revision = VALUES(revision)'
    );
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
                $upsert->execute([$gameId, $owner, $i, $j, $level, $resourceVisible, $revision]);
            }
        }
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
    $statement = $db->prepare(
        'INSERT INTO server_game_units
         (game_id, client_key, owner_id, unit_type_id, unit_class, name, texture, can_move, nature, i, j,
          attack_value, defense_value, speed, view_range, state, health, max_health, experience, move_penalty,
          properties_json, revision)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)'
    );
    $clientKey = 'produced-' . $cityId . '-' . $turn . '-' . $unitTypeId . '-' . bin2hex(random_bytes(5));
    $statement->execute([
        $gameId, $clientKey, $playerId, $unitTypeId, $definition['class'], $definition['name'],
        $definition['texture'], $definition['nature'], $coord['i'], $coord['j'], $definition['attack'],
        $definition['defense'], $definition['speed'], $definition['view_range'], 'ready',
        SERVER_GAME_INITIAL_HEALTH, SERVER_GAME_INITIAL_HEALTH, SERVER_GAME_INITIAL_EXPERIENCE,
        jsonObject(serverUnitProperties($definition)), $revision,
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
        $perTurn = max(0.0, (float) ($cityProperties['productionPerTurn'] ?? 0));
        $points = (float) $production['production_points'] + $perTurn;
        $cost = max(1.0, (float) $production['production_cost']);
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
        elseif (!serverCityHasProductionResources($tiles, $city, $unitTypeId)) $pauseReason = 'connected_resource_required';
        elseif (serverMovableUnitCountAt($db, $gameId, (int) $city['i'], (int) $city['j']) >= SERVER_GAME_TILE_UNIT_LIMIT) {
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
    $count = 0;
    foreach ($preferences as $otherId => $rawStatus) {
        if (++$count > 256 || !is_numeric($otherId)) break;
        $otherId = (int) $otherId;
        if ($otherId <= 0 || $otherId === $playerId) continue;
        $status = strtolower(trim((string) $rawStatus));
        if (!in_array($status, ['neutral', 'friend', 'enemy'], true)) continue;
        $validPlayers->execute([$gameId, $otherId]);
        if (!$validPlayers->fetchColumn()) continue;
        $a = min($playerId, $otherId);
        $b = max($playerId, $otherId);
        if ($playerId === $a) $upsertA->execute([$gameId, $a, $b, $status, $status, $revision]);
        else $upsertB->execute([$gameId, $a, $b, $status, $status, $revision]);
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

function serverUnitFoodUpkeep(array $unit): int
{
    if (!(int) ($unit['can_move'] ?? 0) || serverIsCityUnit($unit) || (float) ($unit['health'] ?? 0) <= 0) return 0;
    $type = (string) ($unit['unit_type_id'] ?? '');
    if (in_array($type, ['knight', 'pikeman', 'swordsman', 'trebuchet', 'frigate', 'elephant'], true)) return 3;
    if (in_array($type, ['horseman', 'chariot', 'catapult', 'galley', 'galleon'], true)) return 2;
    return 1;
}

function serverUnitGoldUpkeep(array $unit): int
{
    $type = (string) ($unit['unit_type_id'] ?? '');
    if (!(int) ($unit['can_move'] ?? 0) || serverIsCityUnit($unit) || (float) ($unit['health'] ?? 0) <= 0) return 0;
    if (in_array($type, ['knight', 'trebuchet', 'frigate'], true)) return 2;
    if (in_array($type, ['pikeman', 'swordsman', 'longbow'], true)) return 1;
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
        if ($type !== 'building_road' && $type !== 'building_workshop') continue;
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
            if (!isset($counts[$parentId])) $counts[$parentId] = ['roads' => 0, 'workshops' => 0];
            if ($type === 'building_road') ++$counts[$parentId]['roads'];
            if ($type === 'building_workshop') ++$counts[$parentId]['workshops'];
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

function serverCityEconomicTileKeys(array $city, array $tiles): array
{
    $keys = serverRoadConnectedTileKeys($tiles, (int) $city['i'], (int) $city['j']);
    for ($di = -3; $di <= 3; ++$di) {
        for ($dj = -3; $dj <= 3; ++$dj) {
            if (serverHexDistance(0, 0, $di, $dj) > 3) continue;
            $key = coordinateKey((int) $city['i'] + $di, (int) $city['j'] + $dj);
            if (isset($tiles[$key])) $keys[$key] = true;
        }
    }
    return $keys;
}

function serverCityWorkedTiles(array $city, array $tiles): array
{
    $population = serverCityPopulation($city);
    $worked = [];
    $used = [];
    $eligible = serverCityEconomicTileKeys($city, $tiles);
    for ($citizen = 0; $citizen < $population; ++$citizen) {
        $best = null;
        $bestScore = -INF;
        foreach ($eligible as $key => $_) {
            if (isset($used[$key]) || !isset($tiles[$key])) continue;
            $income = serverTileIncome(
                $tiles[$key], $key === coordinateKey((int) $city['i'], (int) $city['j'])
            );
            $score = $income['food'] * 4 + $income['production'] * 3 + $income['money'] * 2;
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
        $beforeStage = $before >= 60 ? 'village' : ($before >= 30 ? 'hamlet' : 'cottage');
        $afterStage = $after >= 60 ? 'village' : ($after >= 30 ? 'hamlet' : 'cottage');
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
    array &$events
): void {
    $infrastructure = serverPrepareCityInfrastructure(
        $db, $gameId, $turn, $revision, $tiles, $units, $events
    );
    $players = [];
    foreach ($units as $unitId => &$unit) {
        if ((float) $unit['health'] <= 0) continue;
        $owner = (int) $unit['owner_id'];
        if (!isset($players[$owner])) $players[$owner] = ['food_income' => 0, 'gold_income' => 0];
        if (!serverIsCityUnit($unit)) continue;
        $food = 0; $production = 0; $gold = 0;
        foreach (serverCityWorkedTiles($unit, $tiles) as $worked) {
            $food += $worked['income']['food'];
            $production += $worked['income']['production'];
            $gold += $worked['income']['money'];
        }
        $population = serverCityPopulation($unit);
        $costs = $infrastructure[$unitId] ?? ['roads' => 0, 'workshops' => 0];
        $roadProductionCost = max(0, (int) $costs['roads']);
        $workshopCost = max(0, (int) $costs['workshops']);
        $foodConsumption = $population + $workshopCost;
        $foodExcess = $food - $foodConsumption;
        $netProduction = max(0, $production - $roadProductionCost);
        $netGold = $gold - $workshopCost;
        $properties = json_decode((string) ($unit['properties_json'] ?? '{}'), true);
        if (!is_array($properties)) $properties = [];
        $cityProperties = $properties['cityProperties'] ?? [];
        if (!is_array($cityProperties)) $cityProperties = [];
        $foodResult = serverCityFoodResolution(
            $population, max(0.0, (float) ($properties['cityFoodStored'] ?? 0)), $foodExcess
        );
        $properties['cityFoodStored'] = $foodResult['stored_food'];
        $properties['cityPopulation'] = max(1, (int) $foodResult['population']);
        if (isset($properties['economy']['citizens']) && is_array($properties['economy']['citizens'])) {
            $properties['economy']['citizens'] = array_slice(
                $properties['economy']['citizens'], 0, (int) $foodResult['population']
            );
        }
        $cityProperties['productionPerTurn'] = $netProduction;
        $properties['cityProperties'] = $cityProperties;
        $properties['lastCityIncome'] = [
            'food' => $foodExcess, 'grossFood' => $food,
            'production' => $netProduction, 'grossProduction' => $production,
            'money' => $netGold, 'grossMoney' => $gold,
            'foodConsumption' => $foodConsumption,
            'roadProductionCost' => $roadProductionCost,
            'workshopFoodCost' => $workshopCost,
            'workshopGoldCost' => $workshopCost,
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
                $unit['texture'] = 869;
                $unit['can_move'] = 0;
                $unit['attack_value'] = 0.0;
                $unit['defense_value'] = 0.0;
                $unit['speed'] = 0.0;
                $unit['view_range'] = 0;
                $unit['state'] = 'destroyed';
                $unit['properties_json'] = jsonObject($destroyedProperties);
                $db->prepare(
                    "UPDATE server_game_units SET occupancy_key = NULL, unit_type_id = 'destroyed_city', unit_class = 4,
                     name = 'Destroyed City', texture = 869, can_move = 0, attack_value = 0, defense_value = 0,
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
        $players[$owner]['food_income'] += max(0, $foodExcess);
        $players[$owner]['gold_income'] += $netGold;
    }
    unset($unit);

    $loadState = $db->prepare('SELECT state_json FROM server_game_players WHERE game_id = ? AND player_id = ? FOR UPDATE');
    $saveState = $db->prepare('UPDATE server_game_players SET state_json = ? WHERE game_id = ? AND player_id = ?');
    foreach ($players as $playerId => $income) {
        $loadState->execute([$gameId, $playerId]);
        $state = json_decode((string) ($loadState->fetchColumn() ?: '{}'), true);
        $state = normalizePlayerState(is_array($state) ? $state : []);
        $availableFood = max(0, (int) ($state['food'] ?? 100)) + $income['food_income'];
        $availableGold = max(0, (int) ($state['money'] ?? 500)) + $income['gold_income'];

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
        $saveState->execute([jsonObject($state), $gameId, $playerId]);
        serverTrace('player_economy_processed', [
            'turn' => $turn, 'player_id' => $playerId, 'food' => $state['food'], 'gold' => $state['money'],
            'food_income' => $income['food_income'], 'food_upkeep' => $foodUpkeep,
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
        if ($command === 'set_state' || $command === 'wait' || $command === 'fortify') {
            $unit['state'] = substr((string) ($payload['state'] ?? ($command === 'wait' ? 'waiting' : 'fortified')), 0, 40);
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
        $path = validatePath($unit, $rawPath, $tiles, $mapSize, $pathDiagnostic, $units);
        serverTrace('movement_path_validated', [
            'unit_id' => $unitId, 'owner_id' => (int) $unit['owner_id'],
            'start' => ['i' => (int) $unit['i'], 'j' => (int) $unit['j']],
            'atomic_path' => $rawPath, 'accepted_path' => $path, 'diagnostic' => $pathDiagnostic,
        ]);
        $trajectory = [['i' => (int) $unit['i'], 'j' => (int) $unit['j']]];
        foreach ($path as $point) $trajectory[] = $point;
        $steps = count($path);
        $plans[$unitId] = [
            'path' => $path,
            'trajectory' => $trajectory,
            'steps' => $steps,
            'speed' => max(1.0, (float) $unit['speed']),
            'early' => $steps > 0 && $steps * 2 <= max(1.0, (float) $unit['speed']),
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
                $tiles,
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
        $isAttack = $plan['interaction_intent'] === 'attack'
            && serverMovementTargetsForeignDefender($units, $unitId, $target['i'], $target['j']);
        if (($tileUnitCounts[$targetKey] ?? 0) >= SERVER_GAME_TILE_UNIT_LIMIT && !$isAttack) {
            $originKey = coordinateKey((int) $units[$unitId]['i'], (int) $units[$unitId]['j']);
            $tileUnitCounts[$originKey] = ($tileUnitCounts[$originKey] ?? 0) + 1;
            unset($plans[$unitId]);
            serverTrace('movement_blocked_by_unit_stack', [
                'unit_id' => $unitId, 'owner_id' => (int) $units[$unitId]['owner_id'],
                'i' => $target['i'], 'j' => $target['j'],
                'unit_count' => $tileUnitCounts[$targetKey] ?? 0,
                'unit_limit' => SERVER_GAME_TILE_UNIT_LIMIT,
            ]);
            continue;
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
                    $aTime = $ai / $plans[$aId]['speed'];
                    $bTime = $bi / $plans[$bId]['speed'];
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
                $tiles,
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
                    $tiles,
                    serverAttackOriginForPoint($plans, $attackerId, $combatI, $combatJ)
                );
                $engagedPairs[$pairKey] = true;
            }
        }
    }

    processTerrainImprovementAges($db, $gameId, $turn, $revision, $tiles, $events);
    processPlayerEconomies($db, $gameId, $turn, $revision, $tiles, $units, $events);

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
        $nextMovePenalty = max(0, (int) $unit['move_penalty'] - 1);
        $deletedAt = $unit['health'] <= 0 ? gmdate('Y-m-d H:i:s') : null;
        $original = $originalUnits[$unitId];
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

    recomputeVisibility($db, $gameId, $mapSize, $revision);
    saveEvents($db, $gameId, $turn, $revision, $events);
    // Orders, submissions, delivered events, and defeated units are transient state, not game history.
    $statement = $db->prepare('DELETE FROM server_game_orders WHERE game_id = ? AND turn_number <= ?');
    $statement->execute([$gameId, $turn]);
    $statement = $db->prepare('DELETE FROM server_game_submissions WHERE game_id = ? AND turn_number <= ?');
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
         (u.online = 1 AND u.last_online_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 60 SECOND)))";
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
    foreach (['food', 'money', 'lastGrossFoodIncome', 'lastFoodUpkeep', 'lastGrossMoneyIncome',
        'lastMaintenance', 'lastAccountIncome', 'oneTurnMessage'] as $field) {
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
        'i' => (int) $unit['i'], 'j' => (int) $unit['j'], 'attack' => (float) $unit['attack_value'],
        'defense' => (float) $unit['defense_value'], 'speed' => (float) $unit['speed'], 'view_range' => (int) $unit['view_range'],
        'state' => $unit['state'], 'health' => (float) $unit['health'], 'max_health' => (float) $unit['max_health'],
        'experience' => (float) $unit['experience'], 'move_penalty' => (int) $unit['move_penalty'],
        'properties' => $properties, 'revision' => (int) $unit['revision'], 'deleted' => $unit['deleted_at'] !== null,
    ];
}

function unitUpdates(PDO $db, array $game, int $playerId, int $since): array
{
    $statement = $db->prepare(
        'SELECT DISTINCT u.*, p.unit_type_id AS production_unit_type_id,
                p.production_points AS selected_production_points,
                p.production_cost AS selected_production_cost,
                p.queue_json AS selected_production_queue_json
         FROM server_game_units u
         LEFT JOIN server_game_visibility v ON v.game_id = u.game_id AND v.player_id = ? AND v.i = u.i AND v.j = u.j
         LEFT JOIN productions p ON p.game_id = u.game_id AND p.city_unit_id = u.id
         WHERE u.game_id = ? AND (u.owner_id = ? OR v.visibility_level = 2)
           AND (u.revision > ? OR COALESCE(v.revision, 0) > ?)
         ORDER BY u.id'
    );
    $statement->execute([$playerId, $game['id'], $playerId, $since, $since]);
    $units = array_map('publicUnit', $statement->fetchAll());

    $statement = $db->prepare(
        'SELECT u.id FROM server_game_units u
         JOIN server_game_visibility v ON v.game_id = u.game_id AND v.player_id = ? AND v.i = u.i AND v.j = u.j
         WHERE u.game_id = ? AND u.owner_id <> ? AND u.deleted_at IS NULL AND v.visibility_level = 2'
    );
    $statement->execute([$playerId, $game['id'], $playerId]);
    $visibleEnemyIds = array_map('intval', $statement->fetchAll(PDO::FETCH_COLUMN));

    $statement = $db->prepare(
        'SELECT id FROM server_game_units
         WHERE game_id = ? AND owner_id = ? AND deleted_at IS NULL ORDER BY id'
    );
    $statement->execute([$game['id'], $playerId]);
    $ownedUnitIds = array_map('intval', $statement->fetchAll(PDO::FETCH_COLUMN));

    $statement = $db->prepare(
        'SELECT i, j, visibility_level, resource_visible, revision FROM server_game_visibility
         WHERE game_id = ? AND player_id = ? AND revision > ? ORDER BY i, j'
    );
    $statement->execute([$game['id'], $playerId, $since]);
    $visibility = $statement->fetchAll();

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

function landscapeUpdates(PDO $db, array $game, int $playerId, int $since): array
{
    $statement = $db->prepare(
        'SELECT m.i, m.j, m.terrain_tex, m.terrain_bits,
                CASE WHEN COALESCE(v.resource_visible, 0) = 1 THEN m.resource_type ELSE 0 END AS resource_type,
                m.modifiers_json, GREATEST(m.revision, COALESCE(v.revision, 0)) AS revision,
                COALESCE(v.visibility_level, 0) AS visibility_level,
                COALESCE(v.resource_visible, 0) AS resource_visible
         FROM server_game_map m
         LEFT JOIN server_game_visibility v ON v.game_id = m.game_id AND v.player_id = ? AND v.i = m.i AND v.j = m.j
         WHERE m.game_id = ? AND (m.revision > ? OR COALESCE(v.revision, 0) > ?) ORDER BY m.i, m.j'
    );
    $statement->execute([$playerId, $game['id'], $since, $since]);
    $tiles = [];
    foreach ($statement->fetchAll() as $tile) {
        $tile['i'] = (int) $tile['i'];
        $tile['j'] = (int) $tile['j'];
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
                CASE WHEN u.user_type = 'ai' THEN CONCAT('AI Player ', p.player_id)
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
    $statement = $db->prepare(
        'SELECT id, turn_number, revision, event_type, unit_id, other_unit_id, i, j, message, payload_json
         FROM server_game_events
         WHERE game_id = ? AND audience_player_id = ? AND id > ? ORDER BY id LIMIT 500'
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
    return [
        'events' => $events,
        'last_event_id' => $lastEventId,
        'civilizations' => serverCivilizations($db, $game, $playerId),
    ];
}

function fullGameLoad(PDO $db, array $game, int $playerId, ?int $authenticatedUserId, bool $includeFullMap): array
{
    $unitData = unitUpdates($db, $game, $playerId, 0);
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
            landscapeUpdates($db, $game, $playerId, 0),
            static fn(array $tile): bool => $includeFullMap || (int) $tile['visibility_level'] > 0
        )),
        'civilizations' => serverCivilizations($db, $game, $playerId),
        'last_event_id' => 0,
        'controlled_players' => $authenticatedUserId === null ? [] : controlledPlayers($db, $authenticatedUserId),
        'full_map' => $includeFullMap,
    ]);
}

function lockedGameAndResolution(PDO $db, string $key): array
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
            } elseif ($type === 'complete_production') {
                $payload = completeCityProduction(
                    $db, $game, $playerId, max(0, (int) ($action['city_unit_id'] ?? 0))
                );
            } else {
                throw new ServerGameRequestError(422, 'unsupported_batched_action', 'Unsupported batched action type.');
            }
            $results[] = [
                'client_action_id' => $clientActionId, 'type' => $type, 'ok' => true, 'result' => $payload,
            ];
        } catch (ServerGameRequestError $error) {
            if ($db->inTransaction()) $db->rollBack();
            $item = [
                'client_action_id' => $clientActionId, 'type' => $type, 'ok' => false,
                'error' => ['code' => $error->errorCode, 'message' => $error->getMessage()],
            ];
            if ($error->details) $item['error']['details'] = $error->details;
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
    int $eventSince
): array {
    $eventData = eventUpdates($db, $game, $playerId, $eventSince);
    $unitData = unitUpdates($db, $game, $playerId, $unitSince);
    unset($unitData['events']);
    return array_merge($unitData, $eventData, [
        'tiles' => landscapeUpdates($db, $game, $playerId, $landscapeSince),
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
    if (!in_array($action, ['make_turn', 'load_full', 'load_update', 'update_units', 'update_landscape', 'update_events', 'build', 'build_city', 'grow_city', 'heal_units', 'select_production', 'remove_production', 'complete_production', 'map_diagnostics', 'regenerate_map', 'reset_game', 'cleanup_orphan_players', 'report_cli_error'], true)) {
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
            'map_quality' => $result['map_quality'],
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
            'heal_percent' => 10, 'units' => $result['units'],
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
            $respawnedUnitMap = respawnPlayerIfUnitless($db, $game, $playerId);
            if ($respawnedUnitMap) $game = loadGame($db, $key, true);
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
            $updates = combinedPlayerUpdates(
                $db, $game, $playerId,
                max(0, (int) ($data['since_unit_revision'] ?? 0)),
                max(0, (int) ($data['since_landscape_revision'] ?? 0)),
                max(0, (int) ($data['since_event_id'] ?? 0))
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
            'respawned' => !empty($respawnedUnitMap), 'respawned_unit_id_map' => $respawnedUnitMap,
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
    [$game, $resolution] = lockedGameAndResolution($db, $key);
    if ($action === 'load_full') {
        $game = loadGame($db, $key);
        $includeFullMap = !array_key_exists('include_map', $data) || (bool) $data['include_map'];
        $snapshot = fullGameLoad($db, $game, $playerId, $authenticatedUserId, $includeFullMap);
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
        $updates = combinedPlayerUpdates(
            $db, $game, $playerId,
            max(0, (int) ($data['since_unit_revision'] ?? 0)),
            max(0, (int) ($data['since_landscape_revision'] ?? 0)),
            max(0, (int) ($data['since_event_id'] ?? 0))
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
        $updates = unitUpdates($db, $game, $playerId, $since);
        serverRespond(200, array_merge([
            'ok' => true, 'request' => 'update_units', 'game_id' => $key, 'player_id' => $playerId,
            'map_size' => (int) $game['map_size'], 'turn' => (int) $game['turn_number'], 'revision' => (int) $game['revision'],
            'resolved_turn' => $resolution['resolved_turn'],
            'deadline_at' => gmdate(DATE_ATOM, strtotime($game['turn_deadline_at'] . ' UTC')),
        ], $updates));
    }
    $tiles = landscapeUpdates($db, $game, $playerId, $since);
    serverRespond(200, [
        'ok' => true, 'request' => 'update_landscape', 'game_id' => $key, 'player_id' => $playerId,
        'map_size' => (int) $game['map_size'], 'turn' => (int) $game['turn_number'], 'revision' => (int) $game['revision'],
        'resolved_turn' => $resolution['resolved_turn'], 'tiles' => $tiles,
        'deadline_at' => gmdate(DATE_ATOM, strtotime($game['turn_deadline_at'] . ' UTC')),
    ]);
} catch (Throwable $error) {
    error_log('server game [' . $requestId . ']: ' . $error->getMessage());
    $details = serverExceptionDetails($error);
    $code = $error instanceof PDOException ? 'database_error' : 'server_runtime_error';
    serverError(500, $code, $details['message'], $details);
}

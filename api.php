<?php
declare(strict_types=1);

$apiRequestStartedNs = hrtime(true);
define('SERVER_GAME_LIBRARY_ONLY', true);
require_once __DIR__ . '/server_game.php';
require_once __DIR__ . '/game_auth.php';

const API_MAX_BODY_BYTES = 16384;
const API_SESSION_LIFETIME_SECONDS = 86400;
const API_REMEMBERED_SESSION_LIFETIME_SECONDS = 2592000;
const API_LOGIN_FAILURE_LIMIT = 5;
const API_LOGIN_LOCK_SECONDS = 900;
const API_LOG_MAX_BYTES = 2097152;
const API_LOG_VISIBLE_ROWS = 200;
const API_ONLINE_TIMEOUT_SECONDS = 60;

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$requestId = bin2hex(random_bytes(8));
$apiLogRequestData = [];
header('X-Request-Id: ' . $requestId);
phpPerformanceStart('api', $requestId, null, $apiRequestStartedNs);

function sanitizeForLog($value, string $key = '')
{
    $sensitiveKeys = [
        'password', 'secret', 'access_token', 'token', 'authorization', 'device_id',
        'game_entry_url', 'cookie_value',
    ];
    if (in_array(strtolower($key), $sensitiveKeys, true)) {
        return '[redacted]';
    }
    if (is_array($value)) {
        $sanitized = [];
        foreach ($value as $childKey => $childValue) {
            $sanitized[$childKey] = sanitizeForLog($childValue, (string) $childKey);
        }
        return $sanitized;
    }
    if (is_string($value) && strlen($value) > 500) {
        return substr($value, 0, 500) . '[truncated]';
    }
    return $value;
}

function appendRequestLog(int $status, array $response): void
{
    global $requestId, $apiLogRequestData;
    $path = __DIR__ . '/.game_api_requests.log';
    if (is_file($path) && filesize($path) > API_LOG_MAX_BYTES) {
        @unlink($path . '.1');
        @rename($path, $path . '.1');
    }
    $entry = [
        'time' => gmdate(DATE_ATOM),
        'request_id' => $requestId,
        'method' => (string) ($_SERVER['REQUEST_METHOD'] ?? ''),
        'remote_address' => (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
        'user_agent' => substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 250),
        'action' => isset($apiLogRequestData['action']) && is_string($apiLogRequestData['action'])
            ? $apiLogRequestData['action'] : '',
        'status' => $status,
        'request' => sanitizeForLog($apiLogRequestData),
        'response' => sanitizeForLog($response),
    ];
    $line = json_encode($entry, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($line !== false) {
        @file_put_contents($path, $line . "\n", FILE_APPEND | LOCK_EX);
    }
}

function respond(int $status, array $body): void
{
    appendRequestLog($status, $body);
    $encoded = json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    http_response_code($status);
    phpPerformanceAddResponseHeaders();
    echo $encoded === false ? '{}' : $encoded;
    exit;
}

function errorResponse(int $status, string $code, string $message, string $requestId, array $details = []): void
{
    $error = ['code' => $code, 'message' => $message];
    if ($details) $error['details'] = $details;
    respond($status, [
        'ok' => false,
        'error' => $error,
        'request_id' => $requestId,
    ]);
}

function readSecretFile(string $path): string
{
    $value = @file_get_contents($path);
    if ($value === false) {
        throw new RuntimeException('Required server secret is unavailable.');
    }
    return rtrim($value, "\r\n");
}

function renderRequestLog(): void
{
    appendRequestLog(200, ['ok' => true, 'view' => 'request_log']);
    $path = __DIR__ . '/.game_api_requests.log';
    $lines = is_file($path) ? @file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) : [];
    if (!is_array($lines)) {
        $lines = [];
    }
    $lines = array_slice(array_reverse($lines), 0, API_LOG_VISIBLE_ROWS);

    header('Content-Type: text/html; charset=utf-8');
    phpPerformanceAddResponseHeaders();
    echo '<!doctype html><html lang="en"><head><meta charset="utf-8">';
    echo '<meta name="viewport" content="width=device-width,initial-scale=1">';
    echo '<title>Game API request log</title><style>';
    echo 'body{margin:0;padding:20px;background:#17191c;color:#eef1f3;font:13px/1.4 monospace}';
    echo 'h1{font:600 20px/1.2 system-ui;margin:0 0 6px}p{color:#aeb6bd;margin:0 0 18px}';
    echo 'table{width:100%;border-collapse:collapse;background:rgba(255,255,255,.06)}';
    echo 'th,td{padding:7px 9px;border:1px solid rgba(255,255,255,.14);text-align:left;vertical-align:top}';
    echo 'th{position:sticky;top:0;background:#292d31;font-family:system-ui}';
    echo 'pre{margin:0;white-space:pre-wrap;word-break:break-word;font:12px/1.35 monospace}';
    echo '.s2{color:#8fd19e}.s4{color:#ffd580}.s5{color:#ff9f9f}</style></head><body>';
    echo '<h1>Game API request log</h1><p>Newest first. Passwords, secrets, authorization values, and tokens are redacted. Showing up to '
        . API_LOG_VISIBLE_ROWS . ' requests.</p>';
    echo '<table><thead><tr><th>Time</th><th>Request</th><th>Client</th><th>Status</th><th>Payload</th><th>Response</th></tr></thead><tbody>';
    foreach ($lines as $line) {
        $entry = json_decode($line, true);
        if (!is_array($entry)) {
            continue;
        }
        $status = (int) ($entry['status'] ?? 0);
        $statusClass = $status >= 500 ? 's5' : ($status >= 400 ? 's4' : 's2');
        $requestText = json_encode($entry['request'] ?? [], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        $responseText = json_encode($entry['response'] ?? [], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        echo '<tr><td>' . htmlspecialchars((string) ($entry['time'] ?? ''), ENT_QUOTES, 'UTF-8') . '</td>';
        echo '<td>' . htmlspecialchars((string) ($entry['method'] ?? ''), ENT_QUOTES, 'UTF-8') . ' '
            . htmlspecialchars((string) ($entry['action'] ?? ''), ENT_QUOTES, 'UTF-8') . '<br>'
            . htmlspecialchars((string) ($entry['request_id'] ?? ''), ENT_QUOTES, 'UTF-8') . '</td>';
        echo '<td>' . htmlspecialchars((string) ($entry['remote_address'] ?? ''), ENT_QUOTES, 'UTF-8') . '<br>'
            . htmlspecialchars((string) ($entry['user_agent'] ?? ''), ENT_QUOTES, 'UTF-8') . '</td>';
        echo '<td class="' . $statusClass . '">' . $status . '</td>';
        echo '<td><pre>' . htmlspecialchars((string) $requestText, ENT_QUOTES, 'UTF-8') . '</pre></td>';
        echo '<td><pre>' . htmlspecialchars((string) $responseText, ENT_QUOTES, 'UTF-8') . '</pre></td></tr>';
    }
    echo '</tbody></table></body></html>';
    exit;
}

function requestData(string $requestId): array
{
    $length = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
    if ($length > API_MAX_BODY_BYTES) {
        errorResponse(413, 'request_too_large', 'Request body is too large.', $requestId);
    }

    $contentType = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
    if (strpos($contentType, 'application/json') === 0) {
        $raw = file_get_contents('php://input');
        if ($raw === false || strlen($raw) > API_MAX_BODY_BYTES) {
            errorResponse(413, 'request_too_large', 'Request body is too large.', $requestId);
        }
        try {
            $data = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException $error) {
            errorResponse(400, 'invalid_json', 'Request body must contain valid JSON.', $requestId);
        }
        if (!is_array($data)) {
            errorResponse(400, 'invalid_request', 'JSON request must be an object.', $requestId);
        }
        return $data;
    }

    if (!empty($_POST)) {
        return $_POST;
    }
    errorResponse(415, 'unsupported_media_type', 'Use application/json or form data.', $requestId);
}

function requireText(array $data, string $field, int $minLength, int $maxLength, string $requestId): string
{
    $value = isset($data[$field]) && is_string($data[$field]) ? trim($data[$field]) : '';
    $length = strlen($value);
    if ($length < $minLength || $length > $maxLength) {
        errorResponse(422, 'invalid_' . $field, sprintf('%s must contain %d to %d characters.', ucfirst($field), $minLength, $maxLength), $requestId);
    }
    return $value;
}

function requirePassword(array $data, int $minLength, string $requestId): string
{
    $value = isset($data['password']) && is_string($data['password']) ? $data['password'] : '';
    $length = strlen($value);
    if ($length < $minLength || $length > 128) {
        errorResponse(422, 'invalid_password', sprintf('Password must contain %d to 128 characters.', $minLength), $requestId);
    }
    return $value;
}

function optionalBoolean(array $data, string $field, string $requestId): bool
{
    if (!array_key_exists($field, $data)) return false;
    $value = $data[$field];
    if (is_bool($value)) return $value;
    if ($value === 1 || $value === '1' || $value === 'true') return true;
    if ($value === 0 || $value === '0' || $value === 'false' || $value === '') return false;
    errorResponse(422, 'invalid_' . $field, ucfirst(str_replace('_', ' ', $field)) . ' must be a boolean.', $requestId);
}

function database(string $password): PDO
{
    return new PDO(
        'mysql:host=localhost;dbname=softmaxi_game;charset=utf8mb4',
        'softmaxi_admin',
        $password,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
}

function ensureSchema(PDO $db): void
{
    $db->exec(
        "CREATE TABLE IF NOT EXISTS game_users (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            login VARCHAR(50) NOT NULL,
            email VARCHAR(254) NULL,
            password_hash VARCHAR(255) NOT NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'active',
            failed_login_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
            locked_until DATETIME NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            last_login_at DATETIME NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uq_game_users_login (login),
            UNIQUE KEY uq_game_users_email (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $db->exec(
        "CREATE TABLE IF NOT EXISTS game_user_sessions (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id BIGINT UNSIGNED NOT NULL,
            token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
            device_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
            device_label VARCHAR(120) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL,
            revoked_at DATETIME NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uq_game_user_sessions_token (token_hash),
            KEY ix_game_user_sessions_user (user_id),
            KEY ix_game_user_sessions_device (user_id, device_key),
            KEY ix_game_user_sessions_expiry (expires_at),
            CONSTRAINT fk_game_user_sessions_user FOREIGN KEY (user_id)
                REFERENCES game_users (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $statement = $db->query(
        "SELECT IS_NULLABLE FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_users' AND COLUMN_NAME = 'email'"
    );
    $emailColumn = $statement->fetch();
    if ($emailColumn && $emailColumn['IS_NULLABLE'] !== 'YES') {
        $db->exec('ALTER TABLE game_users MODIFY email VARCHAR(254) NULL');
    }
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
        $db->exec("ALTER TABLE game_users ADD KEY ix_game_users_ai_parent (user_type, parent_id)");
    }

    $sessionColumns = $db->query(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_user_sessions'"
    )->fetchAll(PDO::FETCH_COLUMN);
    $sessionColumns = array_fill_keys($sessionColumns, true);
    if (!isset($sessionColumns['device_key'])) {
        $db->exec('ALTER TABLE game_user_sessions ADD COLUMN device_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER token_hash');
    }
    if (!isset($sessionColumns['device_label'])) {
        $db->exec('ALTER TABLE game_user_sessions ADD COLUMN device_label VARCHAR(120) NULL AFTER device_key');
    }
    $sessionIndexes = $db->query(
        "SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'game_user_sessions'"
    )->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array('ix_game_user_sessions_device', $sessionIndexes, true)) {
        $db->exec('ALTER TABLE game_user_sessions ADD KEY ix_game_user_sessions_device (user_id, device_key)');
    }
    // Authentication sessions are live state. Remove expired and old revoked rows instead of retaining history.
    $db->exec(
        "DELETE FROM game_user_sessions
         WHERE expires_at < UTC_TIMESTAMP()
            OR (revoked_at IS NOT NULL AND revoked_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY))"
    );
}

function loginDeviceIdentity(array $data): array
{
    $provided = isset($data['device_id']) && is_string($data['device_id'])
        ? trim($data['device_id']) : '';
    if ($provided !== '' && preg_match('/^[A-Za-z0-9_.:-]{8,128}$/D', $provided) !== 1) {
        $provided = '';
    }
    $userAgent = substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? 'unknown-client'), 0, 250);
    if ($provided === '') {
        $fingerprint = strtolower($userAgent);
        if (preg_match('/Android[^;)]*;\s*([^;()]+?)\s+Build\//i', $userAgent, $matches) === 1) {
            $fingerprint = 'android:' . strtolower(trim($matches[1]));
        } elseif (stripos($userAgent, 'iphone') !== false || stripos($userAgent, 'ipad') !== false) {
            $fingerprint = 'ios:' . strtolower($userAgent);
        }
        // Legacy/native clients can start using this returned value on their next login.
        $provided = 'legacy-' . substr(hash('sha256', $fingerprint), 0, 40);
    }
    return [
        'id' => $provided,
        'key' => hash('sha256', 'device:' . $provided),
        'label' => substr($userAgent === '' ? 'unknown-client' : $userAgent, 0, 120),
    ];
}

function publicUser(array $user): array
{
    return [
        'id' => (int) $user['id'],
        'login' => $user['login'],
        'email' => $user['email'],
        'user_type' => $user['user_type'] ?? 'human',
        'online' => !empty($user['online']),
    ];
}

function markTimedOutUsersOffline(PDO $db): void
{
    $db->exec(
        "UPDATE game_users SET online = 0
         WHERE online = 1 AND (last_online_at IS NULL
           OR last_online_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL " . API_ONLINE_TIMEOUT_SECONDS . " SECOND))"
    );
    $db->exec(
        "UPDATE game_users ai
         LEFT JOIN game_users parent ON parent.id = ai.parent_id
         SET ai.online = 0
         WHERE ai.user_type = 'ai' AND (parent.id IS NULL OR parent.online = 0)"
    );
}

function claimAiUser(PDO $db, int $humanUserId): array
{
    $statement = $db->prepare(
        "SELECT * FROM game_users
         WHERE user_type = 'ai' AND parent_id = ? ORDER BY id LIMIT 1 FOR UPDATE"
    );
    $statement->execute([$humanUserId]);
    $aiUser = $statement->fetch();
    if (!$aiUser) {
        $statement = $db->query(
            "SELECT ai.* FROM game_users ai
             LEFT JOIN game_users parent ON parent.id = ai.parent_id
             WHERE ai.user_type = 'ai' AND (ai.parent_id IS NULL OR parent.online = 0)
             ORDER BY ai.id LIMIT 1 FOR UPDATE"
        );
        $aiUser = $statement->fetch();
    }
    if (!$aiUser) {
        $login = 'ai_' . bin2hex(random_bytes(12));
        $passwordHash = password_hash(bin2hex(random_bytes(32)), PASSWORD_DEFAULT);
        if ($passwordHash === false) throw new RuntimeException('AI account initialization failed.');
        $statement = $db->prepare(
            "INSERT INTO game_users
             (login, email, password_hash, status, user_type, online, last_online_at, parent_id)
             VALUES (?, NULL, ?, 'active', 'ai', 1, UTC_TIMESTAMP(), ?)"
        );
        $statement->execute([$login, $passwordHash, $humanUserId]);
        $statement = $db->prepare('SELECT * FROM game_users WHERE id = ?');
        $statement->execute([(int) $db->lastInsertId()]);
        $aiUser = $statement->fetch();
    } else {
        $statement = $db->prepare(
            "UPDATE game_users SET parent_id = ?, online = 1, last_online_at = UTC_TIMESTAMP()
             WHERE id = ? AND user_type = 'ai'"
        );
        $statement->execute([$humanUserId, $aiUser['id']]);
        $aiUser['parent_id'] = $humanUserId;
        $aiUser['online'] = 1;
    }
    return $aiUser;
}

function registerUser(PDO $db, array $data, string $requestId): void
{
    $login = requireText($data, 'login', 3, 50, $requestId);
    if (!preg_match('/^[A-Za-z0-9_.-]+$/', $login)) {
        errorResponse(422, 'invalid_login', 'Login may contain letters, numbers, underscore, dot, and hyphen.', $requestId);
    }
    $email = isset($data['email']) && is_string($data['email']) ? strtolower(trim($data['email'])) : '';
    if ($email !== '' && (strlen($email) > 254 || filter_var($email, FILTER_VALIDATE_EMAIL) === false)) {
        errorResponse(422, 'invalid_email', 'Email address is invalid.', $requestId);
    }
    $email = $email === '' ? null : $email;
    $password = requirePassword($data, 8, $requestId);
    $passwordHash = password_hash($password, PASSWORD_DEFAULT);
    if ($passwordHash === false) {
        throw new RuntimeException('Password hashing failed.');
    }

    ensureGeneratedGameMap($db, SERVER_GAME_DEFAULT_KEY, SERVER_GAME_DEFAULT_MAP_SIZE);
    $replacedSessions = 0;
    $db->beginTransaction();
    try {
        $statement = $db->prepare('INSERT INTO game_users (login, email, password_hash) VALUES (?, ?, ?)');
        $statement->execute([$login, $email, $passwordHash]);
        $userId = (int) $db->lastInsertId();
        $player = provisionRegisteredPlayer($db, $userId, SERVER_GAME_DEFAULT_KEY);
        $db->commit();
    } catch (PDOException $error) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        if ((string) $error->getCode() === '23000') {
            $statement = $db->prepare('SELECT login, email FROM game_users WHERE login = ? OR (? IS NOT NULL AND email = ?) LIMIT 1');
            $statement->execute([$login, $email, $email]);
            $existing = $statement->fetch();
            $field = $existing && strcasecmp($existing['login'], $login) === 0 ? 'login' : 'email';
            errorResponse(409, $field . '_already_registered', ucfirst($field) . ' is already registered.', $requestId);
        }
        throw $error;
    } catch (Throwable $error) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $error;
    }

    respond(201, [
        'ok' => true,
        'request' => 'register',
        'user' => ['id' => $userId, 'login' => $login, 'email' => $email],
        'player' => $player,
        'request_id' => $requestId,
    ]);
}

function rejectLogin(PDO $db, ?array $user, string $requestId): void
{
    if ($user !== null) {
        $statement = $db->prepare(
            'UPDATE game_users SET failed_login_count = failed_login_count + 1,
             locked_until = CASE WHEN failed_login_count + 1 >= ? THEN DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND) ELSE locked_until END
             WHERE id = ?'
        );
        $statement->execute([API_LOGIN_FAILURE_LIMIT, API_LOGIN_LOCK_SECONDS, $user['id']]);
    } else {
        password_verify('invalid-login-password', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.');
    }
    errorResponse(401, 'invalid_credentials', 'Login or password is invalid.', $requestId);
}

function loginUser(PDO $db, array $data, string $requestId): void
{
    $login = requireText($data, 'login', 3, 254, $requestId);
    $password = requirePassword($data, 1, $requestId);
    $rememberMe = optionalBoolean($data, 'remember_me', $requestId);

    $statement = $db->prepare('SELECT * FROM game_users WHERE login = ? OR email = ? LIMIT 1');
    $statement->execute([$login, strtolower($login)]);
    $user = $statement->fetch();
    if (!$user || $user['status'] !== 'active' || ($user['user_type'] ?? 'human') !== 'human') {
        rejectLogin($db, null, $requestId);
    }
    if ($user['locked_until'] !== null && strtotime($user['locked_until'] . ' UTC') > time()) {
        rejectLogin($db, null, $requestId);
    }
    if (!password_verify($password, $user['password_hash'])) {
        rejectLogin($db, $user, $requestId);
    }

    $token = bin2hex(random_bytes(32));
    $tokenHash = hash('sha256', $token);
    $sessionLifetime = $rememberMe
        ? API_REMEMBERED_SESSION_LIFETIME_SECONDS
        : API_SESSION_LIFETIME_SECONDS;
    $expiresAt = gmdate('Y-m-d H:i:s', time() + $sessionLifetime);
    $device = loginDeviceIdentity($data);

    ensureGeneratedGameMap($db, SERVER_GAME_DEFAULT_KEY, SERVER_GAME_DEFAULT_MAP_SIZE);
    $db->beginTransaction();
    try {
        markTimedOutUsersOffline($db);
        $statement = $db->prepare(
            'UPDATE game_users SET failed_login_count = 0, locked_until = NULL, last_login_at = UTC_TIMESTAMP(),
             password_hash = ?, online = 1, last_online_at = UTC_TIMESTAMP() WHERE id = ?'
        );
        $newHash = password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)
            ? password_hash($password, PASSWORD_DEFAULT)
            : $user['password_hash'];
        $statement->execute([$newHash, $user['id']]);
        // Repeated login from one device must not revoke requests already in flight
        // from that device. A different device still wins and revokes every older
        // device session. The game_users update above serializes concurrent logins.
        $statement = $db->prepare(
            'UPDATE game_user_sessions SET revoked_at = UTC_TIMESTAMP()
             WHERE user_id = ? AND revoked_at IS NULL
               AND (device_key IS NULL OR device_key <> ?)'
        );
        $statement->execute([$user['id'], $device['key']]);
        $replacedSessions = $statement->rowCount();
        $statement = $db->prepare(
            'INSERT INTO game_user_sessions (user_id, token_hash, device_key, device_label, expires_at)
             VALUES (?, ?, ?, ?, ?)'
        );
        $statement->execute([$user['id'], $tokenHash, $device['key'], $device['label'], $expiresAt]);
        // Existing accounts created before server-game provisioning join the same world on login.
        $player = provisionRegisteredPlayer($db, (int) $user['id'], SERVER_GAME_DEFAULT_KEY);
        $aiUser = claimAiUser($db, (int) $user['id']);
        $aiPlayer = provisionRegisteredPlayer($db, (int) $aiUser['id'], SERVER_GAME_DEFAULT_KEY);
        $db->commit();
    } catch (Throwable $error) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $error;
    }

    $user['user_type'] = 'human';
    $user['online'] = 1;
    $expiresAtIso = gmdate(DATE_ATOM, strtotime($expiresAt . ' UTC'));
    gameAuthIssueCookies((int) $user['id'], $token, strtotime($expiresAt . ' UTC'), $device['id']);
    respond(200, [
        'ok' => true,
        'request' => 'login',
        'authenticated' => true,
        'token_type' => 'Bearer',
        'access_token' => $token,
        'expires_at' => $expiresAtIso,
        'remember_me' => $rememberMe,
        'replaced_sessions' => $replacedSessions,
        'previous_device_kicked' => $replacedSessions > 0,
        'device_id' => $device['id'],
        'game_entry' => gameAuthEntryDescription($token, $expiresAtIso, $device['id']),
        'user' => publicUser($user),
        'player' => $player,
        'ai_player' => array_merge($aiPlayer, [
            'user_type' => 'ai',
            'parent_id' => (int) $user['id'],
        ]),
        'request_id' => $requestId,
    ]);
}

function logoutUser(PDO $db, array $data, string $requestId): void
{
    $token = gameAuthRequestToken($data);
    if ($token === '') {
        gameAuthClearCookies();
        errorResponse(401, 'authentication_required', 'A current account access token is required.', $requestId);
    }

    $result = gameAuthSessionResult($db, $token);
    if ($result['session'] === null) {
        gameAuthClearCookies();
        errorResponse(401, (string) $result['error'], 'The account session is no longer valid.', $requestId);
    }

    $userId = (int) $result['session']['id'];
    $tokenHash = hash('sha256', $token);
    $db->beginTransaction();
    try {
        $statement = $db->prepare(
            'SELECT device_key FROM game_user_sessions
             WHERE user_id = ? AND token_hash = ? LIMIT 1 FOR UPDATE'
        );
        $statement->execute([$userId, $tokenHash]);
        $deviceKey = $statement->fetchColumn();

        if (is_string($deviceKey) && $deviceKey !== '') {
            $statement = $db->prepare(
                'UPDATE game_user_sessions SET revoked_at = UTC_TIMESTAMP()
                 WHERE user_id = ? AND device_key = ? AND revoked_at IS NULL'
            );
            $statement->execute([$userId, $deviceKey]);
        } else {
            $statement = $db->prepare(
                'UPDATE game_user_sessions SET revoked_at = UTC_TIMESTAMP()
                 WHERE user_id = ? AND token_hash = ? AND revoked_at IS NULL'
            );
            $statement->execute([$userId, $tokenHash]);
        }

        $statement = $db->prepare(
            'SELECT COUNT(*) FROM game_user_sessions
             WHERE user_id = ? AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP()'
        );
        $statement->execute([$userId]);
        if ((int) $statement->fetchColumn() === 0) {
            $statement = $db->prepare(
                "UPDATE game_users SET online = 0
                 WHERE id = ? OR (user_type = 'ai' AND parent_id = ?)"
            );
            $statement->execute([$userId, $userId]);
        }
        $db->commit();
    } catch (Throwable $error) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $error;
    }

    gameAuthClearCookies();
    respond(200, [
        'ok' => true,
        'request' => 'logout',
        'authenticated' => false,
        'request_id' => $requestId,
    ]);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    renderRequestLog();
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    appendRequestLog(204, ['ok' => true, 'request' => 'cors_preflight']);
    http_response_code(204);
    phpPerformanceAddResponseHeaders();
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST, OPTIONS');
    errorResponse(405, 'method_not_allowed', 'Use POST for API requests.', $requestId);
}

try {
    $data = requestData($requestId);
    $apiLogRequestData = $data;
    $providedSecret = isset($data['secret']) && is_string($data['secret']) ? $data['secret'] : '';
    $applicationSecret = readSecretFile(__DIR__ . '/.game_api_secret');
    if ($providedSecret === '' || !hash_equals($applicationSecret, $providedSecret)) {
        errorResponse(403, 'application_not_allowed', 'Application secret is invalid.', $requestId);
    }

    $db = database(readSecretFile(__DIR__ . '/.game_db_password'));
    ensureSchema($db);
    ensureServerSchema($db);
    $action = isset($data['action']) && is_string($data['action']) ? strtolower(trim($data['action'])) : '';
    if ($action === '') {
        $scriptAction = strtolower(pathinfo((string) ($_SERVER['SCRIPT_NAME'] ?? ''), PATHINFO_FILENAME));
        if ($scriptAction === 'register' || $scriptAction === 'login') {
            $action = $scriptAction;
        }
    }
    if ($action === 'register') {
        registerUser($db, $data, $requestId);
    }
    if ($action === 'login') {
        loginUser($db, $data, $requestId);
    }
    if ($action === 'logout') {
        logoutUser($db, $data, $requestId);
    }
    errorResponse(400, 'unknown_action', 'Supported actions are register, login, and logout.', $requestId);
} catch (Throwable $error) {
    error_log('game API [' . $requestId . ']: ' . $error->getMessage());
    $details = serverExceptionDetails($error);
    $code = $error instanceof PDOException ? 'database_error' : 'server_runtime_error';
    errorResponse(500, $code, $details['message'], $requestId, $details);
}

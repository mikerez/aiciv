<?php
declare(strict_types=1);

const GAME_AUTH_TOKEN_COOKIE = 'aiciv_access_token';
const GAME_AUTH_PLAYER_COOKIE = 'aiciv_player_id';
const GAME_AUTH_DEVICE_COOKIE = 'aiciv_device_id';
const GAME_AUTH_QUERY_PARAMETER = 'session';
const GAME_AUTH_DEVICE_QUERY_PARAMETER = 'device';
const GAME_AUTH_COOKIE_PATH = '/';

function gameAuthValidTokenFormat(string $token): bool
{
    return preg_match('/^[a-f0-9]{64}$/D', $token) === 1;
}

function gameAuthPresentedToken(bool $allowQueryParameter = true): string
{
    if ($allowQueryParameter) {
        $queryToken = $_GET[GAME_AUTH_QUERY_PARAMETER] ?? '';
        if (is_string($queryToken) && $queryToken !== '') {
            return trim($queryToken);
        }
    }

    $cookieToken = $_COOKIE[GAME_AUTH_TOKEN_COOKIE] ?? '';
    return is_string($cookieToken) ? trim($cookieToken) : '';
}

function gameAuthFindSession(PDO $db, string $token): ?array
{
    $result = gameAuthSessionResult($db, $token);
    return $result['session'];
}

function gameAuthSessionResult(PDO $db, string $token): array
{
    if (!gameAuthValidTokenFormat($token)) {
        return ['session' => null, 'error' => 'invalid_session'];
    }

    $statement = $db->prepare(
        'SELECT u.id, u.login, u.email, u.status, s.expires_at, s.revoked_at,
                (s.expires_at <= UTC_TIMESTAMP()) AS is_expired
         FROM game_user_sessions s
         JOIN game_users u ON u.id = s.user_id
         WHERE s.token_hash = ?
         LIMIT 1'
    );
    $statement->execute([hash('sha256', $token)]);
    $session = $statement->fetch(PDO::FETCH_ASSOC);
    if (!is_array($session)) {
        return ['session' => null, 'error' => 'invalid_session'];
    }
    if ($session['revoked_at'] !== null) {
        return ['session' => null, 'error' => 'session_replaced'];
    }
    if ((int) $session['is_expired'] !== 0) {
        return ['session' => null, 'error' => 'session_expired'];
    }
    if ($session['status'] !== 'active') {
        return ['session' => null, 'error' => 'account_unavailable'];
    }
    unset($session['status'], $session['revoked_at'], $session['is_expired']);
    return ['session' => $session, 'error' => null];
}

function gameAuthRequestToken(array $data = []): string
{
    $bodyToken = $data['access_token'] ?? '';
    if (is_string($bodyToken) && trim($bodyToken) !== '') {
        return trim($bodyToken);
    }
    $authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (is_string($authorization) && preg_match('/^Bearer\s+(.+)$/i', trim($authorization), $matches) === 1) {
        return trim($matches[1]);
    }
    return gameAuthPresentedToken(false);
}

function gameAuthCookieOptions(int $expiresAt, bool $httpOnly): array
{
    return [
        'expires' => $expiresAt,
        'path' => GAME_AUTH_COOKIE_PATH,
        'secure' => true,
        'httponly' => $httpOnly,
        'samesite' => 'Lax',
    ];
}

function gameAuthIssueCookies(int $userId, string $token, int $expiresAt, string $deviceId = ''): void
{
    setcookie(GAME_AUTH_PLAYER_COOKIE, (string) $userId, gameAuthCookieOptions($expiresAt, false));
    setcookie(GAME_AUTH_TOKEN_COOKIE, $token, gameAuthCookieOptions($expiresAt, true));
    if ($deviceId !== '') {
        setcookie(GAME_AUTH_DEVICE_COOKIE, $deviceId, gameAuthCookieOptions($expiresAt, false));
    }
}

function gameAuthClearCookies(): void
{
    setcookie(GAME_AUTH_PLAYER_COOKIE, '', gameAuthCookieOptions(1, false));
    setcookie(GAME_AUTH_TOKEN_COOKIE, '', gameAuthCookieOptions(1, true));
}

function gameAuthEntryDescription(string $token, string $expiresAt, string $deviceId = ''): array
{
    $host = isset($_SERVER['HTTP_HOST']) && is_string($_SERVER['HTTP_HOST'])
        ? trim($_SERVER['HTTP_HOST']) : '';
    if ($host === '' || preg_match('/^[A-Za-z0-9.\[\]:-]+$/D', $host) !== 1) {
        $host = '13.60.223.71';
    }
    $entryUrl = 'https://' . $host . GAME_AUTH_COOKIE_PATH . '?'
        . GAME_AUTH_QUERY_PARAMETER . '=' . rawurlencode($token);
    if ($deviceId !== '') {
        $entryUrl .= '&' . GAME_AUTH_DEVICE_QUERY_PARAMETER . '=' . rawurlencode($deviceId);
    }
    return [
        'game_entry_url' => $entryUrl,
        'query_parameter' => GAME_AUTH_QUERY_PARAMETER,
        'device_query_parameter' => GAME_AUTH_DEVICE_QUERY_PARAMETER,
        'device_id' => $deviceId,
        'cookie_name' => GAME_AUTH_TOKEN_COOKIE,
        'cookie_value' => $token,
        'cookie_path' => GAME_AUTH_COOKIE_PATH,
        'cookie_secure' => true,
        'cookie_http_only_recommended' => true,
        'cookie_same_site' => 'Lax',
        'expires_at' => $expiresAt,
    ];
}

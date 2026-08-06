<?php
declare(strict_types=1);

define('SERVER_GAME_LIBRARY_ONLY', true);
require_once __DIR__ . '/server_game.php';
require_once __DIR__ . '/game_auth.php';

header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('Referrer-Policy: no-referrer');
header('X-Content-Type-Options: nosniff');

$tokenFromUrl = isset($_GET[GAME_AUTH_QUERY_PARAMETER])
    && is_string($_GET[GAME_AUTH_QUERY_PARAMETER])
    && $_GET[GAME_AUTH_QUERY_PARAMETER] !== '';
$token = gameAuthPresentedToken(true);
$deviceId = isset($_GET[GAME_AUTH_DEVICE_QUERY_PARAMETER]) && is_string($_GET[GAME_AUTH_DEVICE_QUERY_PARAMETER])
    ? trim($_GET[GAME_AUTH_DEVICE_QUERY_PARAMETER])
    : (isset($_COOKIE[GAME_AUTH_DEVICE_COOKIE]) && is_string($_COOKIE[GAME_AUTH_DEVICE_COOKIE])
        ? trim($_COOKIE[GAME_AUTH_DEVICE_COOKIE]) : '');

if ($token === '') {
    header('Location: login.html', true, 302);
    exit;
}

try {
    $db = serverDatabase();
    $sessionResult = gameAuthSessionResult($db, $token);
    $session = $sessionResult['session'];
} catch (Throwable $error) {
    error_log('game entry authentication: ' . $error->getMessage());
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'The game authentication service is temporarily unavailable.';
    exit;
}

if ($session === null) {
    gameAuthClearCookies();
    $reason = is_string($sessionResult['error'] ?? null) ? $sessionResult['error'] : 'invalid_session';
    header('Location: login.html?error=' . rawurlencode($reason), true, 302);
    exit;
}

$expiresAt = strtotime((string) $session['expires_at'] . ' UTC');
gameAuthIssueCookies(
    (int) $session['id'],
    $token,
    $expiresAt === false ? time() + 3600 : $expiresAt,
    $deviceId
);

if ($tokenFromUrl) {
    // Remove the bearer credential from browser history and subsequent Referer headers.
    header('Location: ./', true, 303);
    exit;
}

header('Content-Type: text/html; charset=utf-8');
readfile(__DIR__ . '/index.html');

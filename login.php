<?php
declare(strict_types=1);

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    header('Location: login.html', true, 302);
    exit;
}
require __DIR__ . '/api.php';

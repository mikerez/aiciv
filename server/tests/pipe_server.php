<?php
declare(strict_types=1);

if ($argc !== 3) {
    fwrite(STDERR, "Usage: php pipe_server.php pipe.rx pipe.tx\n");
    exit(2);
}

$rxPath = $argv[1];
$txPath = $argv[2];
$root = dirname(__DIR__, 2);
$entryPoint = $root . '/server_game.php';

while (true) {
    $rx = fopen($rxPath, 'rb');
    if ($rx === false) throw new RuntimeException('Could not open request pipe.');
    $line = fgets($rx);
    fclose($rx);
    if ($line === false) continue;
    $line = trim($line);
    if ($line === '') continue;

    if ($line === '__STOP__') {
        $envelope = ['transport_ok' => true, 'stopped' => true, 'status' => 200, 'body' => ['ok' => true]];
    } else {
        $environment = getenv();
        if (!is_array($environment)) $environment = [];
        $environment['AICIV_TEST_MODE'] = '1';
        $environment['REQUEST_METHOD'] = 'POST';
        $environment['CONTENT_TYPE'] = 'application/json';
        $environment['CONTENT_LENGTH'] = (string) strlen($line);
        $environment['REMOTE_ADDR'] = '127.0.0.1';
        $environment['HTTP_USER_AGENT'] = 'aiciv-pipe-integration-test';

        $process = proc_open(
            [PHP_BINARY, $entryPoint],
            [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes,
            $root,
            $environment
        );
        if (!is_resource($process)) throw new RuntimeException('Could not start server_game.php.');
        fwrite($pipes[0], $line);
        fclose($pipes[0]);
        $stdout = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $exitCode = proc_close($process);
        $body = json_decode((string) $stdout, true);
        $status = is_array($body) ? (int) ($body['_test_http_status'] ?? 200) : 500;
        if (is_array($body)) unset($body['_test_http_status']);
        $envelope = [
            'transport_ok' => $exitCode === 0 && is_array($body),
            'status' => $status,
            'body' => is_array($body) ? $body : null,
            'exit_code' => $exitCode,
            'stderr' => trim((string) $stderr),
            'stdout' => is_array($body) ? null : substr((string) $stdout, 0, 2000),
        ];
    }

    $tx = fopen($txPath, 'wb');
    if ($tx === false) throw new RuntimeException('Could not open response pipe.');
    fwrite($tx, json_encode($envelope, JSON_UNESCAPED_SLASHES) . "\n");
    fclose($tx);
    if (!empty($envelope['stopped'])) break;
}

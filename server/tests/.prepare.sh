#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
    echo "Run this script with sudo: sudo server/tests/.prepare.sh" >&2
    exit 1
fi

for command in php mysql mysqladmin node mkfifo; do
    command -v "$command" >/dev/null 2>&1 || {
        echo "Missing prerequisite command: $command" >&2
        echo "Install PHP CLI with PDO MySQL, MySQL server/client, Node.js, and coreutils first." >&2
        exit 1
    }
done

if ! php -m | grep -qi '^pdo_mysql$'; then
    echo "PHP extension pdo_mysql is required." >&2
    exit 1
fi

if command -v systemctl >/dev/null 2>&1; then
    systemctl start mysql 2>/dev/null || systemctl start mariadb 2>/dev/null || true
fi
if ! mysqladmin ping --silent >/dev/null 2>&1; then
    service mysql start 2>/dev/null || service mariadb start 2>/dev/null || true
fi
mysqladmin ping --silent >/dev/null 2>&1 || { echo "MySQL could not be started." >&2; exit 1; }

TEST_DB=softmaxi_game_test
TEST_USER=aiciv_test
TEST_PASSWORD=aiciv_test
TEST_SECRET=aiciv-test-secret-not-for-production

mysql <<SQL
DROP DATABASE IF EXISTS \`${TEST_DB}\`;
CREATE DATABASE \`${TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${TEST_USER}'@'localhost' IDENTIFIED BY '${TEST_PASSWORD}';
CREATE USER IF NOT EXISTS '${TEST_USER}'@'127.0.0.1' IDENTIFIED BY '${TEST_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${TEST_DB}\`.* TO '${TEST_USER}'@'localhost';
GRANT ALL PRIVILEGES ON \`${TEST_DB}\`.* TO '${TEST_USER}'@'127.0.0.1';
FLUSH PRIVILEGES;
USE \`${TEST_DB}\`;
CREATE TABLE IF NOT EXISTS game_users (
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
    PRIMARY KEY (id), UNIQUE KEY uq_game_users_login (login), UNIQUE KEY uq_game_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS game_user_sessions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    device_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    device_label VARCHAR(120) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME NULL,
    PRIMARY KEY (id), UNIQUE KEY uq_game_user_sessions_token (token_hash),
    KEY ix_game_user_sessions_user (user_id), KEY ix_game_user_sessions_device (user_id, device_key),
    KEY ix_game_user_sessions_expiry (expires_at),
    CONSTRAINT fk_game_user_sessions_user FOREIGN KEY (user_id) REFERENCES game_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SQL

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
cat > "${SCRIPT_DIR}/.test.env" <<ENV
export AICIV_TEST_MODE=1
export AICIV_TEST_DB_HOST=127.0.0.1
export AICIV_TEST_DB_NAME=${TEST_DB}
export AICIV_TEST_DB_USER=${TEST_USER}
export AICIV_TEST_DB_PASSWORD=${TEST_PASSWORD}
export AICIV_TEST_SECRET=${TEST_SECRET}
export AICIV_TEST_REPORT_DIR=${SCRIPT_DIR}/runtime/reports
export AICIV_TEST_LOG_PATH=${SCRIPT_DIR}/runtime/server_game.log
ENV

OWNER=$(stat -c '%U:%G' "${SCRIPT_DIR}")
chown "$OWNER" "${SCRIPT_DIR}/.test.env"
chmod 600 "${SCRIPT_DIR}/.test.env"
echo "Prepared isolated MySQL database ${TEST_DB}."

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "${SCRIPT_DIR}/../.." && pwd)

if [[ ! -f "${SCRIPT_DIR}/.test.env" ]]; then
    echo "Missing ${SCRIPT_DIR}/.test.env. Run sudo server/tests/.prepare.sh first." >&2
    exit 1
fi
source "${SCRIPT_DIR}/.test.env"
if [[ ${AICIV_DISABLE_TEST_LOG:-0} == 1 ]]; then
    export AICIV_TEST_LOG_PATH=/dev/null
fi

rm -rf "${SCRIPT_DIR}/runtime"
mkdir -p "${SCRIPT_DIR}/runtime/reports"
rm -f "${SCRIPT_DIR}/pipe.rx" "${SCRIPT_DIR}/pipe.tx"
mkfifo "${SCRIPT_DIR}/pipe.rx" "${SCRIPT_DIR}/pipe.tx"
export AICIV_TEST_PIPE_RX="${SCRIPT_DIR}/pipe.rx"
export AICIV_TEST_PIPE_TX="${SCRIPT_DIR}/pipe.tx"

cleanup() {
    if [[ -n "${PIPE_PID:-}" ]]; then kill "$PIPE_PID" 2>/dev/null || true; fi
    rm -f "${SCRIPT_DIR}/pipe.rx" "${SCRIPT_DIR}/pipe.tx"
}
trap cleanup EXIT INT TERM

php "${SCRIPT_DIR}/schema_init.php"
php "${SCRIPT_DIR}/pipe_server.php" "${SCRIPT_DIR}/pipe.rx" "${SCRIPT_DIR}/pipe.tx" &
PIPE_PID=$!

passed=0
if (($#)); then
    test_files=()
    for requested in "$@"; do
        [[ "$requested" = /* ]] && test_files+=("$requested") || test_files+=("${SCRIPT_DIR}/$requested")
    done
else
    test_files=("${SCRIPT_DIR}"/*.test.js)
fi
for test_file in "${test_files[@]}"; do
    echo "==> $(basename "$test_file")"
    node "$test_file"
    passed=$((passed + 1))
done

printf '__STOP__\n' > "${SCRIPT_DIR}/pipe.rx"
cat "${SCRIPT_DIR}/pipe.tx" >/dev/null
wait "$PIPE_PID"
PIPE_PID=
echo "PASS ${passed} server integration test files"

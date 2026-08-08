#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
AICIV_AI_FEEDBACK_ROUNDS=50 "${SCRIPT_DIR}/../.test_all.sh" ai_test/ai_feedback.test.js

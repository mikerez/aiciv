# AI + PHP feedback integration test

`ai_feedback.test.js` runs the production JavaScript AI adapter against the real PHP request handler and the MySQL test database. It covers ten long-horizon starts: first settlement, expansion, production, three Worker improvements, attack, City defense, terrain defense, and a developed civilization at war.

Each scenario declares observable pass conditions against authoritative database state. A wrong Strategy, Action, or Economics candidate is appended to the matching `ai_player/*-feedback.situations` file using the exact FP32 input produced by `ai.js`. Feedback is trained in ten-scenario batches for 20 low-rate epochs, then the compressed models are reloaded by the next batch.

Run the full 50-cycle feedback suite after `server/tests/.prepare.sh`:

```bash
server/tests/ai_test/.test_50.sh
```

For a short diagnostic run:

```bash
AICIV_AI_FEEDBACK_ROUNDS=1 AICIV_AI_FEEDBACK_FINAL_VALIDATION=0 \
  server/tests/.test_all.sh ai_test/ai_feedback.test.js
```

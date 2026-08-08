# AI + PHP feedback result

The promotion gate was run for 50 feedback cycles: five variants of each of ten long-horizon game starts. Every turn used production `ai.js`, the PHP pipe handler, and authoritative MySQL state.

## Final conditions

- PASS: found the first City within 10 turns.
- PASS: expanded from one City to two Cities within 16 turns.
- FAIL: an undefended productive City did not complete its first military unit within 28 turns.
- FAIL: a Worker did not complete a Pasture on nearby cattle within 16 turns.
- FAIL: a Worker did not complete a Mine on nearby copper hills within 16 turns.
- PASS: a Worker completed Irrigation and did not overwrite the busy order.
- PASS: an adjacent military unit attacked and damaged a visible enemy.
- FAIL: a lone frontier defender left the City defense radius.
- FAIL: a hill defender abandoned the defensive Tile too early.
- FAIL: the developed wartime civilization did not damage its visible enemies within 32 turns.

Final result: 4/10 scenarios passed. During the 50 learning runs, 18/50 scenario variants passed.

## Engineering opinion

The passing cases prove that settlement, expansion, persistent Irrigation, adjacent combat, PHP turn resolution, and client update application work in this harness. The remaining failures are reproducible long-horizon behavior gaps. Several eventually produce no new model mismatch even though the authoritative outcome fails, which means another isolated one-step label is not sufficient.

The run found and fixed three integration defects: raw player IDs leaked into normalized model input, an already-busy Worker could be selected and have its improvement order overwritten, and the test opponent did not submit its no-op turn so PHP never resolved movement/combat.

The retrained model reached 93.9% Action candidate accuracy but only 87.8% Economics accuracy and still passed 4/10 integration scenarios. It was therefore rejected by the all-scenarios promotion gate. The checked-in compressed model archives were restored to the known-good pre-feedback versions; the exact failed inputs remain in `ai_player/*-feedback.situations` for the next model-format iteration.

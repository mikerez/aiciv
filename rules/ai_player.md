# AI Player Rules

## Ownership And Runtime

- `AI-PLAYER-001`: AI inference runs in the browser. PHP remains authoritative for game state and validates the resulting atomic commands; it does not execute neural networks or host AI jobs.
- `AI-PLAYER-002`: A human account and its AI child are independent players. They have separate player ids, units, cities, fog, state, and turn submissions even when one browser controls both.
- `AI-PLAYER-003`: The browser must finish AI preparation before submitting that AI player's turn. A stale result calculated for an earlier authoritative turn must not be submitted for a later turn.
- `AI-PLAYER-004`: Model input never contains server or array object ids. Every encoder stores ids in a side array, and output record `n` is applied only to the object stored for input record `n`.
- `AI-PLAYER-005`: The browser prefers WebGPU compute with per-layer input/output dimensions and falls back to CPU inference when WebGPU is unavailable. GPU buffers are sized from each model, including Strategy's wider first layer.

## Engines And Data Flow

The repository contains three model classes: Strategy, Economics, and Action.

```text
visible player snapshot
        |
        v
    Strategy --------> research + science funding
        |  \
        |   +--------> Economics --------> free-city production
        |
        +------------> Action -----------> legal atomic unit orders
```

- `AI-STRATEGY-001`: Strategy reads up to four visible civilizations, up to four corresponding force summaries, civilization-wide counters, city/settler surroundings, technologies, resources, relations, and a `50x50` visible birdsview.
- `AI-STRATEGY-002`: Strategy emits map focus coordinates and attack/defense priority, three explicit production demands (Settlers, Worker, Explorer), science funding, and four early technology priorities. Military production demand is the nonnegative remainder after the other three demands and is normalized with them.
- `AI-STRATEGY-003`: Strategy focus is forwarded directly to Action as unit-relative `dx/dy` plus attack/defense priority. Strategy production demand is forwarded to Economics.
- `AI-ECONOMICS-001`: Economics reads at most eight cities that currently have no production. It includes city income/storage, the local `9x9` area, legal production, global economy and military pressure, Strategy demands, and technology-times-available-improvement signals.
- `AI-ECONOMICS-002`: Economics chooses one of Settlers, Explorer, Worker, Warrior, Slinger, Archer, Spearman, or None per encoded city. JS may reject an unknown, illegal, enemy, missing, or already-busy city decision, but must not replace a legal model choice with a hand-coded production policy.
- `AI-ACTION-001`: Action reads at most eight owned movable or working units, their current state, a local `9x9` map window, immediate legal-action cues, and forwarded Strategy focus.
- `AI-ACTION-002`: Action chooses goto, wait, build city, road-to, irrigate, chop forest, build improvement, or attack per encoded unit. JS masks impossible commands by unit family and current game legality before argmax.
- `AI-ACTION-003`: Action outputs an action class rather than a target coordinate. For goto/attack/road-to, JS must map that class to a visible legal target and route, then let the normal game/server validation accept or reject it.

## Bounded Shifting Cycle

- `AI-CYCLE-001`: One inference encodes no more than eight units or cities. Strategy encodes the owner plus no more than three other civilizations and their force summaries.
- `AI-CYCLE-002`: When eligible objects exceed an engine's input capacity, `ai.js` advances a cursor per engine and player. Later invocations continue at the next record and wrap around, preventing stable low-index objects from monopolizing the network.
- `AI-CYCLE-003`: Action preserves urgency ordering (idle Workers, Settlers, idle military, Explorers, other idle units, then busy units) before applying its rotating batch. Economics rotates only through free cities.
- `AI-CYCLE-004`: Each full AI preparation performs at most one inference for each loaded engine. It does not loop until every object is processed; remaining objects are handled by later cycles or retain already-authoritative routes/tasks.

## Tensor And Model Contract

- `AI-MODEL-001`: Action and Economics input is `1024` FP32 values: `8 * 120` object values followed by `64` general-situation values.
- `AI-MODEL-002`: Strategy input is `3524` FP32 values: the same `1024`-value base plus `2500` compact birdsview values in slots `1024..3523`.
- `AI-MODEL-003`: Every output is `72` FP32 values: eight 8-value object command records plus eight general decisions.
- `AI-MODEL-004`: The eight tanh layer widths are `input -> 888 -> 752 -> 616 -> 480 -> 344 -> 208 -> 176 -> 72`. Binary `.db` files use version 2, row-major FP32 weights, and a 72-byte little-endian header.
- `AI-MODEL-005`: Browser loading validates each model's own input width. Strategy must not be rejected as a base-width model, and base engines must not receive a Strategy-sized tensor.

## Training And Verification

- `AI-TRAIN-001`: `ai_player/*.situations` are sparse training libraries. Each machine row declares the correct output slot, candidate slots, nonzero input slots, target slots, and a description. Object-family Action files are aggregated for training.
- `AI-TRAIN-002`: `make -C ai_player` builds the native C++17 trainer. Running `./ai_player/train_ai_player` uses the maintained default of 240 maximum epochs and learning rate `0.08`, trains all three models, writes `.db` files, and exits nonzero if a maintained held-out suite fails.
- `AI-TRAIN-003`: Strategy is checked by technology, landscape, budget, and worker-focus tests. Action is checked by Settler, Worker, Explorer, Warrior, Slinger, Archer, and Horseman simulations. Economics is checked by Strategy-response and Worker-usefulness tests.
- `AI-TRAIN-004`: Deploy the gzip model files expected by `ai.js`: `strategy.db.gz`, `action.db.gz`, and `economics.db.gz`. Cache query versions must change whenever those binaries change.

## JS Policy Boundary

- `AI-JS-001`: JS is an adapter and legality boundary. It encodes visible state, runs a model, maps record order back to objects, selects among legal output slots, chooses a concrete legal target when the model format does not contain one, and submits through existing game APIs.
- `AI-JS-002`: JS must not silently override a legal neural decision with economy, expansion, or unit-composition heuristics. If a model decision is poor but legal, improve its situations/tests and retrain the model.
- `AI-JS-003`: Missing objects, ownership mismatches, impossible unit-family actions, unavailable technologies, illegal terrain actions, unavailable production, and missing legal paths are rejected without applying state changes.

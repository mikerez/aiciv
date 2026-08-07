# AI Player Rules

## Ownership And Runtime

- `AI-PLAYER-001`: AI inference runs in the browser. PHP remains authoritative for game state and validates the resulting atomic commands; it does not execute neural networks or host AI jobs.
- `AI-PLAYER-002`: A human account and its AI child are independent players. They have separate player ids, units, cities, fog, state, and turn submissions even when one browser controls both.
- `AI-PLAYER-003`: The browser must finish AI preparation before submitting that AI player's turn. A stale result calculated for an earlier authoritative turn must not be submitted for a later turn.
- `AI-PLAYER-004`: Model input never contains server or array object ids. Encoders keep ids in side state. Economics maps output record `n` to city record `n`; Action maps its selected candidate back to the one unit being evaluated.
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
- `AI-STRATEGY-004`: While the temporary all-technologies rule is active, Strategy receives an opened-technology rate of `1` and all technology-family availability signals as open. Its legacy research outputs do not close or rediscover technologies.
- `AI-ECONOMICS-001`: Economics reads at most eight cities that currently have no production. It includes city income/storage, the local `9x9` area, legal production, global economy and military pressure, Strategy demands, and technology-times-available-improvement signals.
- `AI-ECONOMICS-002`: Economics chooses one of Settlers, Explorer, Worker, Warrior, Slinger, Archer, Spearman, or None per encoded city. JS may reject an unknown, illegal, enemy, missing, or already-busy city decision, but must not replace a legal model choice with a hand-coded production policy.
- `AI-ECONOMICS-003`: Worker opportunity inputs count unfinished jobs rather than generic eligible terrain. With all technologies open, Economics must still reduce Worker production as Worker count rises and follow stronger Strategy expansion, exploration, military, or budget pressure.
- `AI-ACTION-001`: One Action inference evaluates one rotating owned unit. Its eight object records are up to eight complete legal candidates for that unit, not eight unit records.
- `AI-ACTION-002`: Every candidate contains its command, exact target, path distance, requested wait/build state or Worker improvement, target terrain/resource/site/relation facts, local `9x9` target window, unit state, and forwarded Strategy facts.
- `AI-ACTION-003`: Action output slots `0..7` score those complete candidates in input order. JS executes the highest-scoring candidate exactly; it does not select a destination, enemy, settlement site, Worker job, improvement, or replacement command.
- `AI-ACTION-004`: Attack candidates name an exact adjacent visible enemy. A visible enemy farther away is a Goto candidate, so approach versus hold remains an engine decision.

## Bounded Shifting Cycle

- `AI-CYCLE-001`: One Action inference encodes at most eight candidates for one unit. One Economics inference encodes at most eight cities. Strategy encodes the owner plus no more than three other civilizations and their force summaries.
- `AI-CYCLE-002`: When eligible objects exceed an engine's input capacity, `ai.js` advances a cursor per engine and player. Later invocations continue at the next record and wrap around, preventing stable low-index objects from monopolizing the network.
- `AI-CYCLE-003`: Action preserves urgency ordering (idle Workers, Settlers, idle military, Explorers, other idle units, then busy units), advances one unit per inference, and rotates through excess legal candidates seven at a time while retaining Wait. Economics rotates only through free cities.
- `AI-CYCLE-004`: Each full AI preparation performs at most one inference for each loaded engine. It does not loop until every object is processed; remaining objects are handled by later cycles or retain already-authoritative routes/tasks.

## Tensor And Model Contract

- `AI-MODEL-001`: Action and Economics input is `1024` FP32 values: `8 * 120` object values followed by `64` general-situation values.
- `AI-MODEL-002`: Strategy input is `3524` FP32 values: the same `1024`-value base plus `2500` compact birdsview values in slots `1024..3523`.
- `AI-MODEL-003`: Every output is `72` FP32 values. Economics uses eight 8-value city records; Strategy uses typed focus/command records; Action uses slots `0..7` as complete-candidate scores and reserves slots `8..71`.
- `AI-MODEL-004`: The eight tanh layer widths are `input -> 536 -> 448 -> 368 -> 288 -> 208 -> 176 -> 176 -> 72`. Binary `.db` files use version 2, row-major FP32 weights, and a 72-byte little-endian header.
- `AI-MODEL-005`: Browser loading validates each model's own input width. Strategy must not be rejected as a base-width model, and base engines must not receive a Strategy-sized tensor.

## Training And Verification

- `AI-TRAIN-001`: `ai_player/*.situations` are sparse training libraries. Each machine row declares the correct output slot, candidate slots, nonzero input slots, target slots, and a description. `action-runtime.situations` is generated from the maintained complete-action simulations and is the deployed Action training set.
- `AI-TRAIN-002`: `make -C ai_player` builds the native C++17 trainer. Running `./ai_player/train_ai_player` uses the maintained default of 240 maximum epochs and learning rate `0.08`, capped at `0.005` for Action's tied candidate scorer, trains all three models, writes `.db` files, and exits nonzero if a maintained suite fails.
- `AI-TRAIN-003`: Strategy is checked by technology, landscape, budget, and worker-focus tests. Action is checked by Settler, Worker, Explorer, Warrior, Slinger, Archer, and Horseman simulations. Economics is checked by Strategy-response and Worker-usefulness tests.
- `AI-TRAIN-004`: Deploy the gzip model files expected by `ai.js`: `strategy.db.gz`, `action.db.gz`, and `economics.db.gz`. Cache query versions must change whenever those binaries change.

## JS Policy Boundary

- `AI-JS-001`: JS is an adapter and legality boundary. It enumerates bounded complete legal candidates from visible state, runs the model, maps the selected candidate back to its unit, revalidates that exact candidate, and submits through existing game APIs.
- `AI-JS-002`: JS must not silently override a legal neural decision with economy, expansion, or unit-composition heuristics. If a model decision is poor but legal, improve its situations/tests and retrain the model.
- `AI-JS-003`: Missing objects, ownership mismatches, changed attack occupants, unavailable technologies, illegal terrain actions, unavailable production, exact improvements no longer offered by the game, and missing legal paths are rejected without substituting a different action.

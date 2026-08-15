# AI Player Rules

## Ownership And Runtime

- `AI-PLAYER-001`: AI inference runs in the browser. PHP remains authoritative for game state and validates the resulting atomic commands; it does not execute neural networks or host AI jobs.
- `AI-PLAYER-002`: A human account and its AI child are independent players. They have separate player ids, units, cities, fog, state, and turn submissions even when one browser controls both.
- `AI-PLAYER-003`: The browser must finish AI preparation before submitting that AI player's turn. A stale result calculated for an earlier authoritative turn must not be submitted for a later turn.
- `AI-PLAYER-004`: Model input never contains server or array object ids. Encoders keep ids in side state. Economics maps its selected production candidate back to the one city being evaluated; Action maps its selected action candidate back to the one unit being evaluated.
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
- `AI-STRATEGY-005`: Expansion is periodic rather than continuous. A safe empire with no active Settler may raise Settlers demand; the current Settler count must suppress that demand while an existing Settler is travelling to found the requested City.
- `AI-ECONOMICS-001`: One Economics inference evaluates one rotating City that currently has no production. Its eight object records are up to eight complete legal production candidates, including None, with exact unit type, combat/mobility/cost facts, City economy and local `9x9` area, Strategy demand, force pressure, and candidate-specific improvement or matchup context.
- `AI-ECONOMICS-002`: Economics output slots `0..7` score the exact candidates in input order. Candidates rotate seven legal units at a time while retaining None, allowing every available land or water unit type to be considered without changing model input or output width. JS may reject an unknown, illegal, enemy, missing, or already-busy City decision, but must not replace a legal model choice.
- `AI-ECONOMICS-003`: Worker opportunity inputs count unfinished jobs rather than generic eligible terrain. With all technologies open, Economics must still reduce Worker production as Worker count rises and follow stronger Strategy expansion, exploration, military, or budget pressure.
- `AI-ECONOMICS-004`: Every exact production candidate includes the current empire-wide count of that exact unit type. Economics uses Strategy expansion demand together with the Settlers candidate count and City food capacity to produce an expansion unit without producing concurrent Settler waves.
- `AI-ACTION-001`: One Action inference evaluates one rotating owned unit. Its eight object records are up to eight complete legal candidates for that unit, not eight unit records.
- `AI-ACTION-002`: Every candidate contains its command, exact target, path distance, requested wait/build state or Worker improvement, target terrain/resource/site/relation facts, local `9x9` target window, unit state, and forwarded Strategy facts.
- `AI-ACTION-003`: Action output slots `0..7` score those complete candidates in input order. JS executes the highest-scoring candidate exactly; it does not select a destination, enemy, settlement site, Worker job, improvement, or replacement command.
- `AI-ACTION-004`: Attack candidates name an exact adjacent visible enemy. A visible enemy farther away is a Goto candidate, so approach versus hold remains an engine decision.
- `AI-ACTION-005`: The removed Tactics engine is not restored for expansion. Action chooses the Settler's exact route or `build_city` candidate and must leave invalid, closely spaced, or zero/one-food sites before founding on a legal land site whose center tile yields more than one food.

## Bounded Shifting Cycle

- `AI-CYCLE-001`: One Action inference encodes at most eight candidates for one unit. One Economics inference encodes at most eight production candidates for one City. Strategy encodes the owner plus no more than three other civilizations and their force summaries.
- `AI-CYCLE-002`: When eligible objects exceed an engine's input capacity, `ai.js` advances a cursor per engine and player. Later invocations continue at the next record and wrap around, preventing stable low-index objects from monopolizing the network.
- `AI-CYCLE-003`: Action preserves urgency ordering (idle Workers, Settlers, idle military, Explorers, other idle units, then busy units), advances one unit per inference, and rotates through excess legal candidates seven at a time while retaining Wait. Economics rotates through free Cities and through excess exact legal production candidates seven at a time while retaining None.
- `AI-CYCLE-004`: Each full AI preparation performs at most one inference for each loaded engine. It does not loop until every object is processed; remaining objects are handled by later cycles or retain already-authoritative routes/tasks.

## Tensor And Model Contract

- `AI-MODEL-001`: Action and Economics input is `1024` FP32 values: `8 * 120` object values followed by `64` general-situation values.
- `AI-MODEL-002`: Strategy input is `3524` FP32 values: the same `1024`-value base plus `2500` compact birdsview values in slots `1024..3523`.
- `AI-MODEL-003`: Every output is `72` FP32 values. Strategy uses typed focus/command records. Action and Economics use slots `0..7` as complete-candidate scores and reserve slots `8..71`.
- `AI-MODEL-004`: The eight tanh layer widths are `input -> 536 -> 448 -> 368 -> 288 -> 208 -> 176 -> 176 -> 72`. Binary `.db` files use version 2, row-major FP32 weights, and a 72-byte little-endian header.
- `AI-MODEL-005`: Browser loading validates each model's own input width. Strategy must not be rejected as a base-width model, and base engines must not receive a Strategy-sized tensor.

## Training And Verification

- `AI-TRAIN-001`: `ai_player/*.situations` are sparse training libraries. Each machine row declares the correct output slot, candidate slots, nonzero input slots, target slots, and a description. `action-runtime.situations` and `economics-runtime.situations` are generated from maintained complete-candidate simulations and are the deployed Action and Economics training sets.
- `AI-TRAIN-002`: `make -C ai_player` builds the native C++17 trainer. Running `./ai_player/train_ai_player` uses the maintained default of 240 maximum epochs and learning rate `0.08`, capped at `0.005` for Action's tied candidate scorer, trains all three models, writes `.db` files, and exits nonzero if a maintained suite fails.
- `AI-TRAIN-003`: Strategy is checked by production-demand, technology, landscape, budget, and worker-focus tests. Action is checked by Settler routing/founding, existing-unit simulations, and Swordsman, Pikeman, Catapult, Trebuchet, Knight, WorkBoat, Trireme, Galley, and Frigate scenarios. Economics is checked by periodic Settler production, Strategy-response, Worker-usefulness, and exact new-unit production tests.
- `AI-TRAIN-004`: Deploy the gzip model files expected by `ai.js`: `strategy.db.gz`, `action.db.gz`, and `economics.db.gz`. Cache query versions must change whenever those binaries change.

## JS Policy Boundary

- `AI-JS-001`: JS is an adapter and legality boundary. It enumerates bounded complete legal candidates from visible state, runs the model, maps the selected candidate back to its unit or City, revalidates that exact candidate, and submits through existing game APIs.
- `AI-JS-002`: JS must not silently override a legal neural decision with economy, expansion, or unit-composition heuristics. If a model decision is poor but legal, improve its situations/tests and retrain the model.
- `AI-JS-003`: Missing objects, ownership mismatches, changed attack occupants, unavailable technologies, illegal terrain actions, unavailable production, exact improvements no longer offered by the game, and missing legal paths are rejected without substituting a different action.
- `AI-JS-004`: Persistent civilian modes are an explicit development policy around Action inference. AI Workers retain Automate, AI Explorers retain Explore, and active routes or improvements are never replaced. Idle Settlers receive a legal, visible, well-spaced settlement route, while a free City fills the minimum development sequence of defence, useful Workers, and expansion before Economics evaluates remaining free Cities.
- `AI-TEST-001`: The real JS, PHP, and MySQL integration suite includes a 120-turn development scenario. It requires at least three well-spaced Cities on supported terrain, three military units, two Workers, three completed improvements, and broad fog discovery.

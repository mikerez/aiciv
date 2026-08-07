# AI Player Prototype

This folder contains three standalone AI-player engines:

- `strategy`: civilization and force-level strategic decisions.
- `action`: concrete unit commands.
- `economics`: city production decisions.

All engines share the same base records and output contract:

- Action and Economics input: `1024` FP32 values = `8` objects * `120` floats + `64` generic situation floats.
- Strategy input: the same `1024` values followed by a compact `50x50` birdsview, for `3524` FP32 values total.
- Output: `72` FP32 values = `8` object commands * `8` floats + `8` generic decision floats.
- Object ids are not included in model inputs or outputs. Browser adapters keep ids in side state and map decisions back to game objects.
- Economics local windows remain in object slots `16..96`. Action instead uses each object as one complete candidate for a single unit: slots `0..21` contain unit/candidate facts and slots `22..102` contain a `9x9` window centered on that candidate's exact target.
- Action output slots `0..7` score its eight complete legal candidates. A candidate already contains the command, exact target, path distance, and exact wait/build/improvement state; the browser only revalidates and applies it.
- Strategy output slots `64..66` are production demand percentages for
  Settlers, Worker, and Explorer; slot `67` is science funding. The browser
  derives remaining Military demand and copies the four demands into Economics
  `general_situation[20..23]` before city production inference.
- The network has `8` fully connected tanh layers with widths:

```text
input -> 536 -> 448 -> 368 -> 288 -> 208 -> 176 -> 176 -> 72
```

For Strategy and Economics, the first layer deterministically folds object
records into 16-float summaries. Action uses the complete 176-value bottleneck
as eight tied 22-value candidate representations and trains a comparison head
over them. Strategy also carries eight coarse birdsview regions in `168..175`.

## Files

- `ai_player.h`: schemas, engine classes, training interfaces.
- `ai_player_formats.h`: C-compatible unified input/output structs.
- `ai_player.cpp`: network implementation, schemas, situation generator/parser,
  and binary model writer.
- `train_ai_player.cpp`: executable that exports situations, trains models, shows
  loss/accuracy, and writes `.db` files.
- `ENCODING.md`: precise signal encoding reference.
- `*.situations`: text training libraries. Action situations are split by type,
  for example `action-bootstrap.situations`, `action-settlers.situations`,
  `action-worker.situations`, `action-explorer.situations`, and unit-family
  military files. `action-runtime.situations` is generated from the maintained
  exact-action simulations and is the deployed Action training set. Strategy demand and Economics demand-response examples are in
  `strategy-demands.situations` and `economics-strategy.situations`.
- `*.db`: generated binary model databases.

## Build And Run

```bash
make -C ai_player
./ai_player/train_ai_player --export-situations
./ai_player/train_ai_player
```

Normal training writes:

```text
ai_player/strategy.db
ai_player/action.db
ai_player/economics.db
```

## Situation File Format

Each non-comment line is:

```text
correct_output_slot|candidate_output_slots|nonzero_input_slots|target_output_slots|short_description
```

Sparse values use `index:value` entries separated by commas. Comment blocks above
each row describe the object record, command slots, and precise field meanings.

## Binary Model Format

Each `.db` starts with a 72-byte little-endian header:

- `magic[8]`: `AICIVAI\0`
- `version`: `2`
- `width`: the model input width (`3524` for Strategy, `1024` otherwise)
- `layer_count`: `8`
- `activation`: `1` for tanh
- `weight_layout`: `1` for row-major `[out][in]`
- `reserved[0]`: model input width
- `reserved[1]`: output width, `72`
- `reserved[2..9]`: output width of each layer: `536, 448, 368, 288, 208, 176, 176, 72`

Each layer then stores:

- `input_width * output_width` FP32 weights, row-major by output neuron.
- `output_width` FP32 bias values.

The browser loader in `../ai.js` reads version 2 directly, uses dimension-aware
WebGPU compute when available, and otherwise uses the CPU inferencer.

## Browser Adapters

`../ai.js` provides three encoder/decoder pairs:

- `buildStrategyInput` / `applyStrategyOutput`
- `buildActionInput` / `applyActionOutput`
- `buildEconomicsInput` / `applyEconomicsOutput`

Strategy and Economics fill object records and retain object ids separately.
Action selects one rotating unit, fills eight complete legal candidates, and
applies the exact candidate selected by output slots `0..7`.

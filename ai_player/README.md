# AI Player Prototype

This folder contains three standalone AI-player engines:

- `strategy`: civilization and force-level strategic decisions.
- `action`: concrete unit commands.
- `economics`: city production decisions.

All engines share the same base records and output contract:

- Action and Economics input: `1024` FP32 values = `8` objects * `120` floats + `64` generic situation floats.
- Strategy input: the same `1024` values followed by a compact `50x50` birdsview, for `3524` FP32 values total.
- Output: `72` FP32 values = `8` object commands * `8` floats + `8` generic decision floats.
- Object ids are not included in model inputs or outputs. Browser adapters keep ids in side arrays and map output record order back to game objects.
- Local map windows use `9x9` tile samples so every object has a real center tile. In object records the local window occupies slots `16..96`; slot `56` is the center tile.
- Action receives Strategy focus coordinates as relative `dx/dy` in slots `97..98`, normalized by the 9x9 window radius of four tiles. Slots `99..100` carry attack and defense priority.
- Action output is masked by unit family before argmax: Settlers can only goto,
  wait, or build city; Workers can do worker jobs; Explorers scout/wait;
  military units move, wait, or attack.
- Strategy output slots `64..66` are production demand percentages for
  Settlers, Worker, and Explorer; slot `67` is science funding. The browser
  derives remaining Military demand and copies the four demands into Economics
  `general_situation[20..23]` before city production inference.
- The network has `8` fully connected tanh layers with widths:

```text
input -> 888 -> 752 -> 616 -> 480 -> 344 -> 208 -> 176 -> 72
```

The first layer deterministically folds all eight object records into 16-float
object summaries, carries selected generic situation counters into slots
`128..167`, and for Strategy carries eight coarse birdsview regions in
`168..175`; the final layer is trained over declared command slots.

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
  military files; the trainer aggregates available `action-*.situations` files
  before training. Strategy demand and Economics demand-response examples are in
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
- `reserved[2..9]`: output width of each layer: `888, 752, 616, 480, 344, 208, 176, 72`

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

Each encoder fills eight object records and stores object ids separately. Each
decoder reads the corresponding output command record and applies the command to
the stored object id.

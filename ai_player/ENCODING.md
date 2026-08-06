# AI Player Signal Encoding

The engines share the same base tensor shape. Strategy extends that base with a
world birdsview projection.

Base input for Tactics, Action, and Economics is `1024` FP32 values:

- `objects[8][120]`, slots `0..959`.
- `general_situation[64]`, slots `960..1023`.

Strategy input is `3524` FP32 values:

- the same base `1024` values.
- `birdsview[50][50]`, slots `1024..3523`, one compact FP32 per birdsview cell.

Output is always `72` FP32 values:

- `object_command[8][8]`, slots `0..63`.
- `general_decision[8]`, slots `64..71`.

Object ids are not encoded in neural input or output. The browser adapter stores
unit ids, city ids, group references, and civilization/team ids in side arrays in
the same order as the eight object records. Output command record `n` is applied
to the object id stored for input object record `n`.

Values are normalized to `[-1.0, 1.0]` unless a field says one-hot. Unknown or
unused values are `0.0`.

## Shared Output

Tactics and Economics interpret `object_command[n][0..7]` as eight command
scores for object `n`. The highest score is selected. Action uses the same eight
slots, but the browser masks them by unit family before choosing the highest
score, so settlers are never allowed to select worker-only commands.

Strategy uses a typed prefix in every object command record:

- `object_command[n][0]`: target x coordinate normalized to `[-1, 1]`.
- `object_command[n][1]`: target y coordinate normalized to `[-1, 1]`.
- `object_command[n][2]`: military attack priority for AI troops.
- `object_command[n][3]`: defense priority for own troops.
- `object_command[n][4..7]`: strategy command scores for object `n`.

The browser adapter finds the Strategy record with maximum military attack
priority and forwards its four focus fields to Tactics
`general_situation[23..26]`. Strategy also emits a worker-support focus on the
own-civilization record: `object_command[0][0..1]` point to the smallest own
city needing support and `object_command[0][3]` is the worker-support priority.
For Action, military focus is converted only for military records, and
worker-support focus is converted only for worker records.

- Strategy command scores in slots `4..7`: research production, research naval,
  focus anti-mounted units, protect expansion point. Slots `0..3` are focus
  values and are not command candidates.
- Tactics: attack, defend, flank, retreat, reinforce, siege, capture, hold.
- Action: goto, wait, build city, road-to, irrigate, chop forest, build
  improvement, attack. Legal masks are: Settlers use goto/wait/build city;
  Workers use goto/wait/road-to/irrigate/chop forest/build improvement;
  Explorers use goto/wait; military units use goto/wait/attack.
- Economics: produce Settlers, Explorer, Worker, Warrior, Slinger, Archer,
  Spearman, None.

`general_decision[0..7]` is reserved for decisions that are not naturally tied to
one object record.

## Strategy Engine

Input:

- `objects[0..3]`: four civilization status records. Fields include relation,
  population, city count, military strength, science rate, economy, food income,
  production income, technology ratio, threat, trust, distance, expansion room,
  and naval strength.
- `objects[4..7]`: four military force weight records. Fields include relation,
  center x/y, land strength, naval strength, mobility, wounded ratio, border
  pressure, siege pressure, reserve strength, and target x/y.
- `general_situation[0..63]`: own team, city/unit counts, map knowledge, money,
  science, resource counts, and technology-family progress.
- `general_situation[1]`: city count, `[2]`: total unit count, `[4]`:
  military count, `[14]`: settler count, `[15]`: worker count. Strategy can
  infer too many scout-like units when total unit count is high while settlers,
  Workers, and military are low. Slots `[20..23]` repeat strategic production
  counters as settlers, workers, military, cities.
- `general_situation[24..40]`: statistics collected around owned city rings, or
  around owned settlers if no city exists yet. These slots are visible-map only:
  `[24]` hills, `[25]` mountains/rocks, `[26]` grass-like terrain, `[27]`
  water/water-source tiles, `[28]` animal resources, `[29]` stone/masonry
  resources, `[30]` crop/farm resources, `[31]` already-opened technology
  ratio, `[32]` visible context coverage, `[33]` flat non-mining land, `[34]`
  fresh-water pressure, `[35]` forest, `[36]` desert/snow, `[37]` visible
  resource coverage, `[38]` metal/mineral resources, `[39]` city anchor present,
  and `[40]` settler anchor present. Slot `[32]` lets the model distinguish
  "no visible hills" from "no visible context was encoded."
- Technology selection treats terrain and resources as both positive and
  negative evidence. Mining requires substantial hills, mountains, or mineral
  evidence; with visible context but zero mining evidence, Strategy must prefer
  the technology supported by animals, stone, crops/fresh water, or the flat
  growth landscape. Tiny isolated hill/mountain values are treated as noise.
- `general_situation[41]`: money account clamped to `0..50` and normalized to
  `0..1`. Strategy uses this high-resolution budget signal to recommend science
  funding.
- `general_situation[42]`: recent account delta after income, upkeep, and
  technology expense, normalized by 50.
- `general_situation[43]`: upkeep burden normalized by 50.
- `birdsview[50][50]`, slots `1024..3523`: fixed strategic projection of the
  world, scaled from any `_map_size` to 50x50. The system birdsview cell has
  four source values: controller civ id, military attack weight, average
  landscape height, and up to four local resource ids packed in the resource
  channel. Strategy receives one compact FP32 per cell derived from those four
  source values.

Output:

- `object_command[n][0..3]`: focus payload: target x, target y, military attack
  priority, defense priority.
- `object_command[n][4..7]`: command scores. The browser chooses the highest of
  these command scores, never the four focus fields.
- `general_decision[0..2]`, output slots `64..66`: production demand
  percentages for Settlers, Worker, and Explorer. The browser derives Military
  demand as the remaining production pressure and forwards all four demand
  values into Economics input slots `general_situation[20..23]`.
- `general_decision[3]`, output slot `67`: science funding ratio. If funds are
  below 50, training targets `funds / 50`; with 50 or more funds, the target is
  `1.0`. The browser applies this as `GameState.scienceRate`.
- `general_decision[4..7]`, output slots `68..71`: specific technology
  priorities for Mining, Animal Husbandry, Masonry, and Irrigation. The browser
  selects the highest currently researchable technology from this list when an AI
  player has no active research target.

## Tactics Engine

Input:

- `objects[0..7]`: military group records for visible friendly and enemy groups.
  Fields include relation, unit type mix, count, center x/y, movement direction,
  hp, attack, defense, speed, range, terrain, road access, and threat.
- `objects[n][16..96]`: compact 9x9 local landscape window around that group.
  Slot `objects[n][56]` is the center tile.
- `general_situation[0..63]`: battle balance, own/enemy military counts, map
  knowledge, economy, and tactical pressure.
- `general_situation[23..26]`: forwarded Strategy focus fields in this order:
  target x, target y, military attack priority, defense priority.

## Action Engine

Input:

- `objects[0..7]`: own unit records. Field `[0]` is unit type normalized as
  `unitTypeIndex/32`. Field `[1]` is unit state normalized by the runtime state
  order: `ready`, `waiting`, `fortified`, `fortification`, `road`, `road_to`,
  `irrigate`, `chop_forest`, `pasture`, `farm`, `plantation`, `camp`,
  `fishing_boats`, `quarry`, `winery`, `cottage`, `workshop`, `mine`,
  `explore`, `patrol`, `automate`. Fields `[2..6]` are x/y, hp, moves left,
  and owner relation. Field `[7]` is the task flag: `1.0` means the unit already
  has a route or modified state. Fields `[8..15]` are immediate action signal,
  current terrain, current resource value, nearby opportunity score, fresh-water
  flag, city plot score, unit age, and nearest friendly city distance.
- For Workers, field `[11]` is the strongest currently legal nearby job score,
  including terrain-only opportunities such as an empty-hill mine or an
  empty-grass cottage. For other unit types, field `[11]` remains the nearby
  resource score. This gives a Worker standing on a city a movement cue even
  when the useful neighboring enhancement has no resource.
- Worker examples use `[1]` and `[7]` to preserve multi-turn orders. For example,
  a Worker with state `irrigate` and task flag `1.0` should output `irrigate`
  again; a Worker with state `cottage`, `mine`, `pasture`, and similar tile
  building states should output `build_improvement` rather than selecting a new
  movement or wait order.
- `objects[n][16..96]`: 9x9 local tile window around the unit. Slot
  `objects[n][56]` is the center tile under the unit. Each tile value
  combines terrain, visible resource, roads, irrigation, A-bit land water source,
  and friendly/enemy unit presence.
- `objects[n][97..100]`: forwarded Strategy focus fields in this order: target
  dx, target dy, military attack priority, defense priority. The dx/dy values
  are relative to this unit and normalized by the 9x9 window radius of 4 tiles.
- For military units, these slots carry military focus.
- For workers, `objects[n][97]` and `[98]` carry the relative direction to the
  Strategy-suggested smallest own city; `[99]` is `0`; `[100]` is
  worker-support priority.
- `objects[n][101]`: nearby friendly worker density in the visible 9x9 window,
  normalized so `1.0` means two or more nearby workers. A worker should accept
  a city-transfer suggestion only when this density indicates enough local
  workers remain; otherwise it should work the current city area.
- Settlers and explorers receive zeros in the forwarded focus slots.
- `general_situation[0..63]`: owner economy, science, known-map ratio, visible
  resources, and idle unit counts.

Action object records are units only. Cities are excluded here and controlled by
the Economics engine.

## Economics Engine

Input:

- `objects[0..7]`: free city records. Fields include x/y, population, food income,
  production income, money income, food stored, food consumption, growth turns,
  stored production, frontier flag, seaside flag, garrison strength, production
  needed flag, legal production count, and city economic role.
- `objects[n][16..96]`: 9x9 local tile window around the city. Slot
  `objects[n][56]` is the center city tile. Each value
  combines landscape, visible resources, A-bit land water source, improvements,
  and food/production/money source strength.
- `objects[n][97..100]`: compact legal-production mask.
- `general_situation[0..63]`: money, income, science rate, city counts, unit
  counts, map knowledge, visible resources, and military pressure.
- `general_situation[1]`: city count, `[2]`: free city count, `[5]`: own
  military count, `[6]`: enemy military count, `[14]`: idle movable count,
  `[15]`: worker count, `[16]`: opened technology ratio. At `0.0`, early
  cities should prefer a basic Warrior before a Worker because no Worker
  improvement technologies are available yet.
- `general_situation[20..23]`: Strategy production demand percentages in this
  order: Settlers, Worker, Explorer, Military. Economics uses these values to
  choose which free city should produce which unit type.
- `general_situation[24]`: current money account normalized. Negative values
  mean the treasury is below zero.
- `general_situation[25]`: last account delta after income and upkeep. Negative
  values mean the empire is losing money per turn.
- `general_situation[26]`: last upkeep burden normalized. High upkeep with
  negative delta teaches the model to choose `None` production instead of adding
  another upkeep cost.
- `general_situation[27..34]`: individual opened-technology flags in this exact
  order: Wheel, Bronze Working, Irrigation, Animal Husbandry, Mining, Masonry,
  Pottery, Construction.
- `general_situation[35..42]`: normalized counts of matching known, currently
  unimproved plots in the combined 9x9 neighborhoods of the eight candidate
  cities: road-ready land, choppable forest, irrigable grass, opened animal
  resources, mineable hills/mountains, cottage-or-quarry plots,
  plantation-or-winery resources, workshop-or-fortification plots. Overlapping
  city windows count a tile once. These plot signals do not depend on whether
  the technology is open, allowing the model to learn the required conjunction.
- `general_situation[43..50]`: actionable-job values in the same order. Each is
  the corresponding technology flag multiplied by its plot count. These retain
  the exact technology/plot correspondence through the compact network input
  projection; a mismatched technology and plot leave every actionable value at
  zero.
- A Worker production decision requires at least one matching technology/plot
  pair. Aggregate opened-technology rate or high Strategy Worker demand alone
  is not evidence that a Worker has useful work.

Output command slots for each city are, in order: Settlers, Explorer, Worker,
Warrior, Slinger, Archer, Spearman, None.

## Model Shape

The `.db` network uses eight fully connected layers with tanh activation. Layer
widths reduce from input to output. Strategy uses the wider birdsview input:

```text
Strategy: 3524 -> 888 -> 752 -> 616 -> 480 -> 344 -> 208 -> 160 -> 72
Others:   1024 -> 888 -> 752 -> 616 -> 480 -> 344 -> 208 -> 160 -> 72
```

The first layer folds all eight object records into compact 16-float summaries
and carries selected generic situation counters into hidden slots `128..148`.
The last dense layer is trained over declared command slots.

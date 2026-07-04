# AI Player Signal Encoding

All four engines use the same tensor shape.

Input is always `1024` FP32 values:

- `objects[8][120]`, slots `0..959`.
- `general_situation[64]`, slots `960..1023`.

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
`general_situation[23..26]`. For Action, the same focus is converted per unit
into relative `objects[n][97..100]` fields.

- Strategy command scores in slots `4..7`: research production, research naval,
  focus anti-mounted units, protect expansion point. Slots `0..3` are focus
  values and are not command candidates.
- Tactics: attack, defend, flank, retreat, reinforce, siege, capture, hold.
- Action: goto, wait, build city, road-to, irrigate, chop forest, build
  improvement, attack. Legal masks are: Settlers use goto/wait/build city;
  Workers use goto/wait/road-to/irrigate/chop forest/build improvement;
  Explorers use goto/wait; military units use goto/wait/attack.
- Economics: produce Settlers, Worker, Explorer, Warrior, Slinger, Archor,
  Spearman, Galley.

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

Output:

- `object_command[n][0..3]`: focus payload: target x, target y, military attack
  priority, defense priority.
- `object_command[n][4..7]`: command scores. The browser chooses the highest of
  these command scores, never the four focus fields.
- `general_decision[0..3]`, output slots `64..67`: production demand
  percentages for Settlers, Worker, Explorer, and Military. The browser forwards
  these four values into Economics input slots `general_situation[20..23]`.
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

- `objects[0..7]`: own unit records. Fields are type, state, x/y, hp, moves left,
  owner relation, task flag, carried resource, current terrain, current resource
  value, nearby resource score, fresh-water flag, city plot score, unit age, and
  nearest friendly city distance.
- `objects[n][16..96]`: 9x9 local tile window around the unit. Slot
  `objects[n][56]` is the center tile under the unit. Each tile value
  combines terrain, visible resource, roads, irrigation, A-bit land water source,
  and friendly/enemy unit presence.
- `objects[n][97..100]`: forwarded Strategy focus fields in this order: target
  dx, target dy, military attack priority, defense priority. The dx/dy values
  are relative to this unit and normalized by the 9x9 window radius of 4 tiles.
  Military units may use these as convergence goals; civil units use high
  military priority near them as danger and choose `goto` to run out of the
  focus area.
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

## Model Shape

The `.db` network uses eight fully connected layers with tanh activation. Layer
widths reduce from input to output:

```text
1024 -> 888 -> 752 -> 616 -> 480 -> 344 -> 208 -> 160 -> 72
```

The first layer folds all eight object records into compact 16-float summaries
and carries selected generic situation counters into hidden slots `128..148`.
The last dense layer is trained over declared command slots.

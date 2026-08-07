# AI Player Signal Encoding

All three engines use the same base tensor shape. Action and Economics
use exactly `1024` FP32 input values:

- `objects[8][120]`, slots `0..959`.
- `general_situation[64]`, slots `960..1023`.

Strategy appends `birdsview[50][50]` in slots `1024..3523`, so its input width
is `3524` FP32 values.

Output is always `72` FP32 values:

- `object_command[8][8]`, slots `0..63`.
- `general_decision[8]`, slots `64..71`.

Object ids are not encoded in neural input or output. The browser adapter stores
unit ids, city ids, and civilization/team ids in side arrays in
the same order as the eight object records. Output command record `n` is applied
to the object id stored for input object record `n`.

Values are normalized to `[-1.0, 1.0]` unless a field says one-hot. Unknown or
unused values are `0.0`.

## Shared Output

Economics interprets `object_command[n][0..7]` as eight command scores for
object `n`. Action instead interprets output slots `0..7` as scores for its
eight complete legal input candidates; slots `8..71` are currently reserved.

Strategy uses a typed prefix in every object command record:

- `object_command[n][0]`: target x coordinate normalized to `[-1, 1]`.
- `object_command[n][1]`: target y coordinate normalized to `[-1, 1]`.
- `object_command[n][2]`: military attack priority for AI troops.
- `object_command[n][3]`: defense priority for own troops.
- `object_command[n][4..7]`: strategy command scores for object `n`.

The browser adapter finds the Strategy record with maximum military attack
priority and converts that focus per Action unit into relative
`objects[n][97..100]` fields.

- Strategy command scores in slots `4..7`: research production, research naval,
  focus anti-mounted units, protect expansion point. Slots `0..3` are focus
  values and are not command candidates.
- Action candidates may contain goto, wait, build city, road-to, irrigate, chop
  forest, an exact Worker improvement, or an exact adjacent-enemy attack. JS
  constructs only legal candidates and does not replace the selected candidate.
- Economics: produce Settlers, Explorer, Worker, Warrior, Slinger, Archer,
  Spearman, or None.

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
- `birdsview[50][50]`, input slots `1024..3523`: visible terrain height,
  controller, military weight, and resources compacted into one value per cell.

Output:

- `object_command[n][0..3]`: focus payload: target x, target y, military attack
  priority, defense priority.
- `object_command[n][4..7]`: command scores. The browser chooses the highest of
  these command scores, never the four focus fields.
- `general_decision[0..2]`, output slots `64..66`: production demand
  percentages for Settlers, Worker, and Explorer. The browser derives Military
  as the remaining demand and forwards all four values into Economics input
  slots `general_situation[20..23]`.
- `general_decision[3]`, output slot `67`: science funding ratio.
- `general_decision[4..7]`, output slots `68..71`: specific technology
  priorities for Mining, Animal Husbandry, Masonry, and Irrigation. The browser
  selects the highest currently researchable technology from this list when an AI
  player has no active research target.

## Action Engine

Input:

- One inference evaluates one rotating owned unit. `objects[0..7]` are complete
  legal candidates for that unit.
- Candidate slots `0..21` contain unit type/state/task, immediate-action and
  nearby-Worker facts, command code, exact target `dx/dy`, path distance, target
  terrain/resource/site/relation, exact requested state or improvement,
  Strategy attack/defense/alignment, Settler age, nearby resources, fresh water,
  validity, and the packed target tile signal.
- Candidate slots `22..102` contain the `9x9` visible map window centered on the
  candidate target. The remaining candidate slots are reserved.
- `general_situation[0..63]`: owner economy, science, known-map ratio, visible
  resources, and idle unit counts.

Output slots `0..7` score candidates in the same order. The selected record
already identifies the destination, enemy, settlement tile, or Worker
improvement. Cities remain controlled by Economics.

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
- `general_situation[24..26]`: money account, recent delta, and upkeep pressure.
- `general_situation[27..34]`, `[35..42]`, and `[43..50]`: Worker-improvement
  technology flags, matching plot opportunities, and their actionable products.

## Model Shape

The `.db` network uses eight fully connected layers with tanh activation. Layer
widths reduce from input to output:

```text
input -> 888 -> 752 -> 616 -> 480 -> 344 -> 208 -> 176 -> 72
```

Strategy and Economics fold object records into compact 16-float summaries and
carry selected generic counters into hidden slots `128..167`. Action uses eight
tied 22-value candidate representations across all 176 bottleneck values, then
learns both a shared candidate scorer and an eight-candidate comparison head.
Strategy also pools its birdsview into eight coarse `2x4` regional summaries in
hidden slots `168..175`.

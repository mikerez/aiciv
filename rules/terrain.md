# Terrain Rules

Terrain is stored as one byte per map cell:

```text
[A S D1 D0 T3 T2 T1 T0]
```

## Bit Layout

- `T3 T2 T1 T0`: terrain type, 4 bits.
- `D1 D0`: depth, height, or wildity level, 2 bits.
- `S`: supertile flag for 4-block aggregation of similar terrain.
- `A`: alternative view flag. A set `A` bit marks an alternate visual variant; for land terrain it also means a local water source exists in fields, hills, or mountains.

## Terrain Type

- `T` identifies the base terrain family.
- Current examples include water, sand, grass, snow, hills, rocks, forest, and river/grass-water terrain.
- The terrain type chooses the base texture family and whether the cell can be entered.

## Sprite Filenames

- `TERRAIN-SPRITE-001`: Every byte-indexed terrain sprite uses `general_name-binarynum.png`.
- `general_name` is a lowercase underscore-separated description of terrain type and active visual modifiers, such as `forest_wildity0_supertile`.
- `binarynum` is exactly eight binary digits in `ASD1D0T3T2T1T0` order and must equal the texture ID used by `_screen.loadTexture`.
- When `A=1`, ordinary visual variants include `_alt` in `general_name`. Hill and mountain/stone variants use `_has_water` because their `A` bit describes water on elevated or stone terrain.
- Each encoded texture ID has its own filename even when multiple IDs currently contain identical image data.

## Depth, Height, And Wildity

- `D1 D0` stores a 2-bit level from `0` to `3`.
- For water terrain, `D1 D0` represents water depth.
- For elevated terrain, `D1 D0` represents height.
- For rough natural terrain, `D1 D0` represents wildity or movement difficulty.
- For land cells, the base game uses `D1 D0` as the movement turn penalty.
- For hills, `D0` means forest exists; chopping forest clears only `D0` and does not touch the other terrain bits.

## Turn Penalty

- `TERRAIN-TURN-001`: Land terrain stores its movement penalty in `D1 D0`.
- `TERRAIN-TURN-002`: When a unit enters a terrain cell, the base game reads `D1 D0` and sets the unit movement delay from it.
- `TERRAIN-TURN-003`: A penalty of `0` means the unit can continue moving on the next turn.
- `TERRAIN-TURN-004`: A penalty greater than `0` delays future movement while the penalty is decremented by turn processing.
- `TERRAIN-TURN-005`: Water terrain is currently blocked for normal land movement.
- `TERRAIN-TURN-006`: Mounted and wheeled units (Horseman, Chariot, Knight, and Elephant) cannot enter a maximum-height mountain Tile (`T=5`, `D=3`). Other land units entering it receive a three-turn future movement delay.

## Generation

- `TERRAIN-GEN-001`: Random prehistory terrain generation favors forest and clean grass as common land terrain.
- `TERRAIN-GEN-002`: Rough terrain passes for sand, rocks, hills, and terrain modifiers are lower than the grass and forest passes so clean grass remains visible.

## Supertile And Alternative View

- `S` marks terrain that belongs to a 4-cell supertile of similar type.
- Supertiles are used by map enhancement/rendering to select larger or combined terrain textures.
- The supertile is formed from neighboring cells of compatible terrain type and compatible `D1 D0` level.
- `TERRAIN-SUPER-001`: Before one member of a 4-cell supertile is modified, the full supertile is split back into four ordinary terrain cells; the requested change then applies only to its target cell.
- `TERRAIN-SUPER-002`: Map enhancement replaces each non-overlapping 2x2 group of identical water or forest Tiles with one supersprite. Rendering uses the loaded image's natural dimensions with a minimum `420x310` footprint. The sprites are named by their exact encoding, for example `images/water_depth0_supertile-01000000.png` and `images/forest_wildity0_supertile-01000110.png`.
- `A` marks an alternative visual variant of the same terrain data. For water-related terrain, `A` also indicates that a water source exists.
- `TERRAIN-GEN-003`: Hills are generated as visible clustered terrain so maps contain frequent elevated regions.
- `TERRAIN-GEN-004`: Generation adds many radial mountain clusters. Each cluster has a guaranteed maximum-height center, falls toward lower surrounding heights, and may contain local mountain water sources through the `A` bit.

## Terrain Modifiers

- `TERRAIN-MOD-001`: Each map tile has a terrain modifier state stored separately from terrain type.
- `TERRAIN-MOD-002`: Terrain modifiers currently include `road`, `irrigation`, `pasture`, `farm`, `plantation`, `camp`, `fishing_boats`, `network`, `quarry`, `winery`, `fortification`, `cottage`, `workshop`, and `mine`; cottage stores an age counter and irrigation stores a city-food flag.
- `TERRAIN-MOD-003`: Roads are drawn as `images/road.png` overlays above terrain.
- `TERRAIN-MOD-004`: Irrigation is drawn as `images/irrigation.png` overlays above terrain.
- `TERRAIN-MOD-005`: Pasture, farm, plantation, camp, fishing boats, network, quarry, winery, fortification, cottage, hamlet, village, workshop, and mine are drawn as full `220x160` overlay sprites above terrain.
- `TERRAIN-MOD-006`: Cottage uses `images/cottage.png` before 100 turns, `images/hamlet.png` from turn 100, and `images/village.png` from turn 200.
- `TERRAIN-MOD-007`: A Tile can have one primary improvement. Building a different primary improvement removes the previous one; `road` is infrastructure and can coexist with any primary improvement.

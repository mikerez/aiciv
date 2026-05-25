# Terrain Rules

Terrain is stored as one byte per map cell:

```text
[A S D1 D0 T3 T2 T1 T0]
```

## Bit Layout

- `T3 T2 T1 T0`: terrain type, 4 bits.
- `D1 D0`: depth, height, or wildity level, 2 bits.
- `S`: supertile flag for 4-block aggregation of similar terrain.
- `A`: alternative view flag. A set `A` bit marks an alternate visual variant; for water-related terrain it also means a water source exists.

## Terrain Type

- `T` identifies the base terrain family.
- Current examples include water, sand, grass, snow, hills, rocks, forest, and river/grass-water terrain.
- The terrain type chooses the base texture family and whether the cell can be entered.

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

## Generation

- `TERRAIN-GEN-001`: Random prehistory terrain generation favors forest and clean grass as common land terrain.
- `TERRAIN-GEN-002`: Rough terrain passes for sand, rocks, hills, and terrain modifiers are lower than the grass and forest passes so clean grass remains visible.

## Supertile And Alternative View

- `S` marks terrain that belongs to a 4-cell supertile of similar type.
- Supertiles are used by map enhancement/rendering to select larger or combined terrain textures.
- The supertile is formed from neighboring cells of compatible terrain type and compatible `D1 D0` level.
- `A` marks an alternative visual variant of the same terrain data. For water-related terrain, `A` also indicates that a water source exists.
- `TERRAIN-GEN-003`: Hills are generated as visible clustered terrain so maps contain frequent elevated regions.

## Terrain Modifiers

- `TERRAIN-MOD-001`: Each map tile has a terrain modifier state stored separately from terrain type.
- `TERRAIN-MOD-002`: Terrain modifiers currently include `road`, `irrigation`, `pasture`, `fortification`, `cottage`, `workshop`, and `mine`.
- `TERRAIN-MOD-003`: Roads are drawn as `images/road.png` overlays above terrain.
- `TERRAIN-MOD-004`: Irrigation is drawn as `images/irrigation.png` overlays above terrain.
- `TERRAIN-MOD-005`: Pasture, fortification, cottage, workshop, and mine are drawn as full `220x160` overlay sprites above terrain.

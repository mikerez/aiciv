# Terrain Rules

Terrain is stored as one byte per map cell:

```text
[R A D D T T T T]
```

## Bit Layout

- `T T T T`: terrain type, 4 bits.
- `D D`: depth, height, or wildness level, 2 bits.
- `A`: aggregation flag, 1 bit.
- `R`: reserved flag, 1 bit.

## Terrain Type

- `T` identifies the base terrain family.
- Current examples include water, sand, grass, snow, hills, rocks, forest, and river/grass-water terrain.
- The terrain type chooses the base texture family and whether the cell can be entered.

## Depth, Height, And Wildity

- `D` stores a 2-bit level from `0` to `3`.
- For water terrain, `D` represents water depth.
- For elevated terrain, `D` represents height.
- For rough natural terrain, `D` represents wildity or movement difficulty.
- For land cells, the base game uses `D` as the movement turn penalty.

## Turn Penalty

- `TERRAIN-TURN-001`: Land terrain stores its movement penalty in `D`.
- `TERRAIN-TURN-002`: When a unit enters a terrain cell, the base game reads `D` and sets the unit movement delay from it.
- `TERRAIN-TURN-003`: A penalty of `0` means the unit can continue moving on the next turn.
- `TERRAIN-TURN-004`: A penalty greater than `0` delays future movement while the penalty is decremented by turn processing.
- `TERRAIN-TURN-005`: Water terrain is currently blocked for normal land movement.

## Aggregation

- `A` marks terrain that belongs to a 4-cell superblock of similar type.
- Aggregation is used by map enhancement/rendering to select larger or combined terrain textures.
- The superblock is formed from neighboring cells of compatible terrain type and compatible `D` level.

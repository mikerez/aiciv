# Birdsview Rules

- `BIRDSVIEW-001`: The birdsview system map is always `50x50` cells and is scaled from the current world map size. It must not assume the world map is `50x50` or `100x100`.
- `BIRDSVIEW-002`: Each system birdsview cell stores four FP32 values: controlling civ id, military attack weight for that controlling civ, average landscape height, and a packed list of up to four resource type ids in that rectangle.
- `BIRDSVIEW-003`: Landscape height is negative for sea and water, near zero for flat sand/grass variants, and positive for forests, the hill/mountain family, and rocks.
- `BIRDSVIEW-004`: The UI birdsview is drawn at the left bottom of the main screen with 80% opacity. Terrain color comes from the landscape value, then the controlling civilization color is blended over it.
- `BIRDSVIEW-005`: Strategy AI receives a compact `50x50` birdsview input in slots `1024..3523`, one FP32 per cell derived from the four-value system birdsview cell.
- `BIRDSVIEW-006`: The system and UI birdsview maps are rebuilt after initial game creation and after every completed turn.
- `BIRDSVIEW-007`: UI drawing vertically inverts the final rotated screen-space Y value for both map cells and the current-view outline. Strategy and diagonal world-coordinate encoding remain unchanged.

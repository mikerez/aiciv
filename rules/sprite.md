# Sprite Rules

This file describes sprite image format rules for game art assets.

## Editor Sprite Format

- `SPRITE-001`: The `400x300` sprite image format is a recommendation for creating an editor/source sprite.
- `SPRITE-002`: The visible hexagon shape inside a sprite uses these image coordinates:
  - `(0, 99)`
  - `(199, 0)`
  - `(399, 99)`
  - `(399, 199)`
  - `(199, 299)`
  - `(0, 199)`
- `SPRITE-003`: Editor/source sprite artwork should be composed to fit inside the hexagon polygon defined by `SPRITE-002`.

## Production Sprite Mapping

- `SPRITE-004`: In production, a sprite is mapped to a `220x160` render slot.
- `SPRITE-005`: In the production render slot, `20` pixels of the `220` width and `10` pixels of the `160` height are border area outside the sprite.
- `SPRITE-006`: The production border area allows neighboring sprites to intersect visually without requiring every source sprite to occupy the full render slot.

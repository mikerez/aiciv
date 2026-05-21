# Main Rules

## Layer Rules

- `MAIN-LAYER-001`: Game rules are organized into layers.
- `MAIN-LAYER-002`: Each layer is implemented in a file named `game_<layer_name>.js`.
- `MAIN-LAYER-003`: Each layer has a matching rules document named `<layer_name>.md`.
- `MAIN-LAYER-004`: The first active layer is `prehistory`, implemented by `game_prehistory.js`.
- `MAIN-LAYER-005`: Layer code applies layer-specific rules through explicit rule functions, such as movement rules, unit state rules, building state rules, and turn processing rules.
- `MAIN-LAYER-006`: Map geometry, terrain data, terrain rendering, terrain movement cost, and visibility/fog are base game properties and are not redefined by individual layers unless a later design explicitly extends them.

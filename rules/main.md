# Main Rules

## Layer Rules

- `MAIN-LAYER-001`: Game rules are organized into layers.
- `MAIN-LAYER-002`: Each layer is implemented in a file named `game_<layer_name>.js`.
- `MAIN-LAYER-003`: Each layer has a matching rules document named `<layer_name>.md`.
- `MAIN-LAYER-004`: The first active layer is `prehistory`, implemented by `game_prehistory.js`.
- `MAIN-LAYER-005`: Layer code applies layer-specific rules through explicit rule functions, such as movement rules, unit state rules, building state rules, and turn processing rules.
- `MAIN-LAYER-006`: Map geometry, terrain data, terrain rendering, terrain movement cost, and visibility/fog are base game properties and are not redefined by individual layers unless a later design explicitly extends them.

## Main Menu Rules

- `MAIN-MENU-001`: The top center of the screen has four `20x20` icon buttons: Technology, Politics, Finance, and Trade.
- `MAIN-MENU-002`: Each main menu button toggles a corresponding `menu_<name>.js` panel.
- `MAIN-MENU-003`: A second click on an open main menu button hides that menu.
- `MAIN-MENU-004`: Main menus use the same fixed screen area: `x=100`, `y=50`, right edge near the unit menu, and bottom at `y_max-200`.
- `MAIN-MENU-005`: All main menus are hidden by default.

## Unit And City Structures

- `MAIN-UNIT-001`: Unit definitions use `UnitType(id, name, type, texture, attack, defense, speed, viewRange, technologyRequired, productionCost, resourceRequired, canMove)`.
- `MAIN-CITY-001`: City units have `CityProperties`, including `productionPerTurn`.
- `MAIN-CITY-002`: City production is stored as `CityProductionState(unitTypeId)` with accumulated `productionPoints`.
- `MAIN-TURN-001`: `_game.applyTurnProcessingRules(layer)` is the main end-turn function.
- `MAIN-TURN-002`: Main turn processing delegates layer-specific movement, auto-routing, chopping, state, building, and menu rules through layer hooks.
- `MAIN-TURN-003`: Main turn processing adds city production points each turn and creates the selected unit when accumulated production reaches the unit production cost.

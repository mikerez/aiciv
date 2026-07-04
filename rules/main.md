# Main Rules

## Layer Rules

- `MAIN-LAYER-001`: Game rules are organized into layers.
- `MAIN-LAYER-002`: Each layer is implemented in a file named `game_<layer_name>.js`.
- `MAIN-LAYER-003`: Each layer has a matching rules document named `<layer_name>.md`.
- `MAIN-LAYER-004`: The first active layer is `prehistory`, implemented by `game_prehistory.js`.
- `MAIN-LAYER-005`: Layer code applies layer-specific rules through explicit rule functions, such as movement rules, unit state rules, building state rules, and turn processing rules.
- `MAIN-LAYER-006`: Map geometry, terrain data, terrain rendering, terrain movement cost, and visibility/fog are base game properties and are not redefined by individual layers unless a later design explicitly extends them.

## Main Menu Rules

- `MAIN-MENU-001`: The top center of the screen has `20x20` icon buttons: Technology, Politics, Finance, Trade, and Console.
- `MAIN-MENU-002`: Each main menu button toggles a corresponding `menu_<name>.js` panel.
- `MAIN-MENU-003`: A second click on an open main menu button hides that menu.
- `MAIN-MENU-004`: Main menus use the same fixed screen area: `x=100`, `y=50`, right edge near the unit menu, and bottom at `y_max-200`.
- `MAIN-MENU-005`: All main menus are hidden by default.
- `MAIN-MENU-006`: Pressing `Escape` hides all open main menus.
- `MAIN-MENU-007`: Main menu panels can be opened directly by game events, such as technology discovery.
- `MAIN-MENU-008`: The Console menu shows verbose AI parsing and application logs for Strategy, Tactics, Action, and Economics decisions.

## Unit And City Structures

- `MAIN-UNIT-001`: Unit definitions use `UnitType(id, name, type, texture, attack, defense, speed, viewRange, technologyRequired, productionCost, resourceRequired, canMove)`.
- `MAIN-UNIT-002`: Every unit has a `team` number.
- `MAIN-UNIT-003`: Team numbers map to team colors: `0` blue, `1` green, `2` yellow, `3` magenta, and `4` orange.
- `MAIN-UNIT-004`: Each unit is drawn with its team color overlay sprite named `<color_name>.png`.
- `MAIN-CITY-001`: City units have `CityProperties`, including `productionPerTurn`.
- `MAIN-CITY-002`: City production is stored as `CityProductionState(unitTypeId)` with accumulated `productionPoints`.
- `MAIN-CITY-003`: City properties include a stored production account used as overflow when a city produces more than the current task requires.
- `MAIN-TURN-001`: `_game.applyTurnProcessingRules(layer)` is the main end-turn function.
- `MAIN-TURN-002`: Main turn processing delegates layer-specific movement, auto-routing, chopping, state, building, and menu rules through layer hooks.
- `MAIN-TURN-003`: Main turn processing adds city production points each turn and creates the selected unit when accumulated production reaches the unit production cost.
- `MAIN-TURN-004`: When accumulated city production exceeds the completed unit cost, excess production is saved in the city's stored production account for the next task.
- `MAIN-MARKUP-001`: `drawStroke()` control-zone markup is skipped during initial game setup.
- `MAIN-MARKUP-002`: End-turn processing redraws control-zone markup once after layer hooks finish selection and recentering.
- `MAIN-MARKUP-003`: Control-zone strokes use the same team color family as the unit team overlay.
- `MAIN-RESOURCE-001`: Map tile state contains a resource type id in `_map_resource[i][j]`.
- `MAIN-RESOURCE-002`: Resource overlay sprites are prepared as a full-map resource sprite list and drawn above terrain and below units.

## AI Player Rules

- `MAIN-AI-001`: AI engine input is unified for strategy, tactics, action, and economics as `8` object records of `120` FP32 values each plus `64` FP32 values describing the generic situation.
- `MAIN-AI-002`: AI engine output is unified as `8` object command records of `8` FP32 values each plus `8` FP32 values for generic decisions, for a total output width of `72`.
- `MAIN-AI-003`: Game object ids are not encoded in neural input or output. Adapters keep ids in side arrays, preserving object order, and map output command record `n` back to input object `n`.
- `MAIN-AI-004`: Strategy input uses four civilization-status objects and four military-force-weight objects.
- `MAIN-AI-004A`: Strategy generic inputs `[24..40]` describe visible terrain and resources around owned cities, or around owned settlers when no city exists. They include hills, mountains, grass, water, animals, stone, crops, opened technology rate, visible context coverage, flat land, fresh water, forest, desert/snow, resource coverage, mineral resources, and whether the context anchor is a city or settler.
- `MAIN-AI-005`: Tactics input uses eight friendly/enemy military group objects with group state and movement direction.
- `MAIN-AI-006`: Action input uses eight own unit objects with unit state and a 9x9 local tile feature window centered on the unit.
- `MAIN-AI-007`: Economics input uses eight city objects with city state and a 9x9 local tile window centered on the city and describing landscape and food, production, and money sources.
- `MAIN-AI-010`: Action receives Strategy focus coordinates as dx/dy relative to the current unit and normalized by the 9x9 window radius, not as absolute map coordinates.
- `MAIN-AI-008`: AI model fully connected layer widths reduce from `1024` input values to `72` output values through eight tanh layers.
- `MAIN-AI-009`: Demo multiplayer mode can run both users as AI players; the human advances time by clicking End Turn and observes the visible prepared AI orders.

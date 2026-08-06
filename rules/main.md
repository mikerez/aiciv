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
- `MAIN-MENU-008`: The Console menu shows verbose AI parsing and application logs for Strategy, Action, and Economics decisions.
- `MAIN-MENU-009`: Phone UI mode is enabled only for a coarse-pointer or mobile-user-agent device whose physical screen has a short side no larger than `600` CSS pixels and a long side no larger than `1200` CSS pixels. It records the screen and live viewport dimensions, scales the former mobile controls to approximately one half size, and arranges controls within the live viewport; desktop layout remains unchanged.
- `MAIN-MENU-010`: On phones, the unit action menu occupies half of the vertical space available below the toolbar and scrolls internally; rotation recalculates this height.
- `MAIN-MOBILE-002`: The white account, economy, and relations statistics lines are drawn below the phone controls and retain their black visibility offset.
- `MAIN-MENU-011`: The technology, politics, finance, trade, and AI-console toolbar is temporarily disabled. Every player has every technology open.
- `MAIN-MENU-012`: Clicking a tile with multiple owned units, including a City and units, opens a 50% transparent scrollable selector on the left.
- `MAIN-MENU-013`: A bottom-right Civilizations button opens the known-player list with civilization identity, coat of arms, relation, living forces, kills, and City statistics.
- `MAIN-MENU-014`: On phones, the Civilizations list expands between the screen safe-area insets and the Civilizations button, using the available width and height with internal scrolling and enlarged player rows.
- `MAIN-MENU-015`: On phones, a selected tile containing multiple units exposes a Units toggle directly below the white statistics and message lines. Its half-viewport-width selector starts below that toggle, uses a stable pixel height calculated from the live viewport, expands downward, scrolls internally, and retracts after a unit is selected.
- `MAIN-MENU-016`: With the main toolbar disabled, the live turn countdown is part of the compact top-edge End Turn button. The two top-left status lines are raised approximately 15 pixels toward the screen corner.

## Unit And City Structures

- `MAIN-UNIT-001`: Unit definitions use `UnitType(id, name, type, texture, attack, defense, speed, viewRange, technologyRequired, productionCost, resourceRequired, canMove)`.
- `MAIN-UNIT-002`: Every unit has a `team` number.
- `MAIN-UNIT-003`: Team numbers map to team colors: `0` blue, `1` green, `2` yellow, `3` magenta, and `4` orange.
- `MAIN-UNIT-004`: Each unit is drawn with its team color overlay sprite named `<color_name>.png`.
- `MAIN-CITY-001`: City units have `CityProperties`, including `productionPerTurn`.
- `MAIN-CITY-002`: City production is stored as `CityProductionState(unitTypeId)` with accumulated `productionPoints`.
- `MAIN-CITY-003`: City properties include a stored production account used as overflow when a city produces more than the current task requires.
- `MAIN-CITY-004`: A city can be set to no production; this is different from an unassigned production task.
- `MAIN-BUILDING-001`: Cities and completed terrain improvements are represented in the unit list for economy accounting.
- `MAIN-BUILDING-002`: Terrain-improvement unit records are hidden economic records; map modifier sprites draw them, and they do not move, draw unit sprites, reveal fog, or create control zones.
- `MAIN-MILITARY-001`: Combat resolution is implemented by `military.js` and documented in `rules/military.md`.
- `MAIN-TURN-001`: `_game.applyTurnProcessingRules(layer)` is the main end-turn function.
- `MAIN-TURN-002`: Main turn processing delegates layer-specific movement, auto-routing, chopping, state, building, and menu rules through layer hooks.
- `MAIN-TURN-003`: Main turn processing adds city production points each turn and creates the selected unit when accumulated production reaches the unit production cost.
- `MAIN-TURN-004`: When accumulated city production exceeds the completed unit cost, excess production is saved in the city's stored production account for the next task.
- `MAIN-TURN-005`: In multiplayer, PHP owns production accumulation and produced-unit creation. The browser displays the synchronized production state and does not create speculative production units locally.
- `MAIN-MARKUP-001`: `drawStroke()` control-zone markup is skipped during initial game setup.
- `MAIN-MARKUP-002`: End-turn processing redraws control-zone markup once after layer hooks finish selection and recentering.
- `MAIN-MARKUP-003`: Control-zone strokes use the same team color family as the unit team overlay.
- `MAIN-RESOURCE-001`: Map tile state contains a resource type id in `_map_resource[i][j]`.
- `MAIN-RESOURCE-002`: Resource overlay sprites are prepared as a full-map resource sprite list and drawn above terrain and below units.
- `MAIN-BIRDSVIEW-001`: `birdsview.js` builds the `50x50` strategic world projection described in `rules/birdsview.md` from the current map size, terrain, resources, and user-indexed unit lists.

## AI Player Rules

- `MAIN-AI-001`: AI engine input starts with a shared base of `8` object records of `120` FP32 values each plus `64` FP32 values describing the generic situation. Action and Economics use only this `1024` FP32 base input.
- `MAIN-AI-002`: AI engine output is unified as `8` object command records of `8` FP32 values each plus `8` FP32 values for generic decisions, for a total output width of `72`.
- `MAIN-AI-003`: Game object ids are not encoded in neural input or output. Adapters keep ids in side arrays, preserving object order, and map output command record `n` back to input object `n`.
- `MAIN-AI-004`: Strategy input uses four civilization-status objects and four military-force-weight objects.
- `MAIN-AI-004A`: Strategy generic inputs `[24..40]` describe visible terrain and resources around owned cities, or around owned settlers when no city exists. They include hills, mountains, grass, water, animals, stone, crops, opened technology rate, visible context coverage, flat land, fresh water, forest, desert/snow, resource coverage, mineral resources, and whether the context anchor is a city or settler.
- `MAIN-AI-004B`: Strategy appends a `50x50` birdsview projection in slots `1024..3523`. The birdsview is scaled from any world map size and compactly represents local controller civ id, military weight, landscape height, and resources.
- `MAIN-AI-004C`: Strategy technology decisions use visible landscape and resources as positive and negative evidence. Mining requires substantial hills, mountains, or mineral evidence; a fully observed city/settler context with none of those signals must select a technology supported by the actual terrain or resources instead.
- `MAIN-AI-006`: Action input uses eight own unit objects with unit state and a 9x9 local tile feature window centered on the unit.
- `MAIN-AI-006A`: Worker Action input field `[11]` summarizes the strongest legal nearby improvement job, including resource-free terrain enhancements. When Action selects Goto, the adapter targets that local job before a Strategy relocation suggestion.
- `MAIN-AI-007`: Economics input uses eight city objects with city state and a 9x9 local tile window centered on the city and describing landscape and food, production, and money sources.
- `MAIN-AI-007A`: Economics Worker production requires both an explicitly encoded opened improvement technology and at least one corresponding known, unimproved plot around owned cities. The aggregate technology rate and Worker demand cannot independently justify Worker production.
- `MAIN-AI-010`: Action receives Strategy focus coordinates as dx/dy relative to the current unit and normalized by the 9x9 window radius, not as absolute map coordinates.
- `MAIN-AI-008`: AI model fully connected layer widths reduce from input values to `72` output values through eight tanh layers. Strategy currently starts at `3524` input values; other engines currently start at `1024`.
- `MAIN-AI-009`: Demo multiplayer mode can run both users as AI players; the human advances time by clicking End Turn and observes the visible prepared AI orders.
- `MAIN-AI-012`: Each authenticated browser controls one visible human and one hidden AI account. It submits their turns independently in human-then-AI order, runs the AI against only that AI's server-visible snapshot, and restores the human client context without drawing or recentering AI actions.
- `MAIN-AI-013`: The hidden AI account retains stable server ownership of its units and state when adopted by a newly online human whose client will drive it.
- `MAIN-AI-014`: Hidden AI neural-network inference runs in a Web Worker concurrently with the human turn. The human countdown never terminates AI inference; ending the human turn waits for an unfinished AI result, then submits both independent player states without showing or centering AI actions.

## Server Game Rules

- `MAIN-SERVER-001`: The browser may execute and render speculative local turns, but the versioned server game state is authoritative. Players submit synchronous orders during a 5-second client turn; PHP allows one additional grace second before resolving missing submissions. Concurrent movement follows `rules/server_game.md`.
- `MAIN-SERVER-002`: PHP owns world generation and registered-player initialization. A client starts only after login, initializes empty render arrays, and loads its units, state, fog, and visible terrain from the server.
- `MAIN-SERVER-003`: Authenticated page startup uses `load_full`; turn refreshes use `update_events` before unit and landscape deltas.

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
- `MAIN-MENU-006`: Pressing `Escape` hides all open menus, clears single and group unit selection, and cancels the active command mode.
- `MAIN-MENU-007`: Main menu panels can be opened directly by game events, such as technology discovery.
- `MAIN-MENU-008`: The Console menu shows verbose AI parsing and application logs for Strategy, Action, and Economics decisions.
- `MAIN-MENU-009`: Phone UI mode is enabled only for a coarse-pointer or mobile-user-agent device whose physical screen has a short side no larger than `600` CSS pixels and a long side no larger than `1200` CSS pixels. It records the screen and live viewport dimensions, scales the former mobile controls to approximately one half size, and arranges controls within the live viewport; desktop layout remains unchanged.
- `MAIN-MENU-010`: On phones, the unit action menu occupies half of the vertical space available below the toolbar and scrolls internally; rotation recalculates this height.
- `MAIN-MOBILE-002`: The white account, economy, and relations statistics lines are drawn below the phone controls and retain their black visibility offset.
- `MAIN-MENU-011`: The technology, politics, finance, trade, and AI-console toolbar is temporarily disabled. Every player has every technology open.
- `MAIN-MENU-012`: Clicking a tile with multiple owned units, including a City and units, opens a 50% transparent scrollable selector on the left.
- `MAIN-MENU-012A`: A City is sorted first and becomes the primary selection on a shared Tile, so City production commands open immediately. The stack's Select all button selects only military units and applies movement and state commands to every selected military unit on that Tile.
- `MAIN-MENU-012B`: Tile selection contains only current visible objects at the exact clicked coordinate. Stack buttons and group selection resolve stable server identities after every authoritative array update; hidden economic improvement records never appear.
- `MAIN-MENU-013`: A bottom-right Civilizations button opens the known-player list with civilization identity, coat of arms, directional Friend/Enemy controls, food, gold, living forces, kills, and City statistics.
- `MAIN-MENU-014`: On phones, the Civilizations list expands between the screen safe-area insets and the Civilizations button, using the available width and height with internal scrolling and enlarged player rows.
- `MAIN-MENU-015`: On phones, a selected tile containing multiple units exposes a Units toggle directly below the white statistics and message lines. Its half-viewport-width selector starts below that toggle, uses a stable pixel height calculated from the live viewport, expands downward, scrolls internally, and retracts after a unit is selected.
- `MAIN-MENU-016`: With the main toolbar disabled, the live turn countdown is part of the compact top-edge End Turn button. The top-left display uses one raised status line for current turn messages; the obsolete technology-progress line is not drawn.
- `MAIN-MENU-017`: The bottom-right Costs button is always bound to the logged-in player's civilization, even while hidden AI processing temporarily changes the engine's active user. It groups that player's movable units and terrain improvements by type and shows per-item and total food, production, and gold upkeep from the authoritative economy tables.
- `MAIN-MENU-018`: A top-left turn message remains visible through its originating turn and is cleared after the next resolved turn when that turn produces no new message.
- `MAIN-MENU-019`: Client request and command errors are written through `report_cli_error`; they do not interrupt play with browser popup dialogs.
- `MAIN-MOBILE-003`: On phones, touching a Tile with multiple units selects its top unit immediately so a held drag can issue movement. The unit-stack panel opens only when the gesture ends as a tap within 500 milliseconds and without moving at least 12 CSS pixels.
- `MAIN-MOBILE-004`: The phone unit action panel follows the same confirmed-tap rule as the unit-stack panel. It remains hidden during a held movement-path drag and opens after touch release only for a tap within 500 milliseconds and 12 CSS pixels.
- `MAIN-MOBILE-005`: After Goto or Road-to is selected from the phone action panel, the next stationary map touch assigns its destination on touch release. Moving at least 12 CSS pixels cancels that destination tap without panning the map or leaving command targeting mode.
- `MAIN-INPUT-001`: A left click or drag beginning on empty map keeps the current unit selection and all assigned commands unchanged and pans the map. Manual path drawing begins only when the press starts on a movable unit.
- `MAIN-INPUT-002`: Selecting a unit with an existing Goto destination immediately repaints its movement arrows without changing the stored route. The Action panel shows its authoritative server unit ID for debugging.
- `MAIN-INPUT-003`: JS owns and browser-persists each complete Goto route. End Turn sends PHP only the next speed-limited atomic movement segment; authoritative updates trim reached client steps but never replace the destination. A rejected atomic movement is shown immediately in a browser popup.
- `MAIN-INPUT-004`: Right-clicking a Tile opens a top Tile-information panel showing terrain, generic defence, base and current yields, resource, suggested improvement, and projected yields. With a selected movable unit the same click also assigns Goto.

## Unit And City Structures

- `MAIN-UNIT-001`: Unit definitions use `UnitType(id, name, type, texture, attack, defense, speed, viewRange, technologyRequired, productionCost, resourceRequired, canMove)`.
- `MAIN-UNIT-002`: Every unit has a `team` number.
- `MAIN-UNIT-003`: Team numbers map to team colors: `0` blue, `1` green, `2` yellow, `3` magenta, and `4` orange.
- `MAIN-UNIT-004`: Each unit is drawn with its team color overlay sprite named `<color_name>.png`.
- `MAIN-UNIT-005`: Every visible unit or City displays its owning username or AI player name above the sprite. A same-owner stack on one Tile uses one shared label. Labels use a dedicated transparent canvas and small regular-weight text so map-overlay refreshes cannot thicken or blink them.
- `MAIN-UNIT-006`: One Tile holds at most five living movable units. Cities and terrain-improvement records do not consume this capacity, and military attacks remain legal against full foreign stacks.
- `MAIN-UNIT-007`: Trireme is the basic 1 attack, 1 defence water military unit. Galley carries two same-owner land units and Frigate carries four; carried units share the ship Tile and move with its authoritative resolved movement. Land units can always disembark from water to adjacent land.
- `MAIN-CITY-001`: City units have `CityProperties`, including `productionPerTurn`.
- `MAIN-CITY-002`: City production is an ordered `productionQueue`; its first item is represented by `CityProductionState(unitTypeId)` with accumulated `productionPoints`.
- `MAIN-CITY-003`: A City has no idle or overflow production account. Only the current backlog item accumulates production points.
- `MAIN-CITY-004`: A city can be set to no production; this is different from an unassigned production task.
- `MAIN-BUILDING-001`: Cities and completed terrain improvements are represented in the unit list for economy accounting.
- `MAIN-BUILDING-002`: Terrain-improvement unit records are hidden economic records; map modifier sprites draw them, and they do not move, draw unit sprites, reveal fog, or create control zones.
- `MAIN-MILITARY-001`: Combat resolution is implemented by `military.js` and documented in `rules/military.md`.
- `MAIN-TURN-001`: `_game.applyTurnProcessingRules(layer)` is the main end-turn function.
- `MAIN-TURN-002`: Main turn processing delegates layer-specific movement, auto-routing, chopping, state, building, and menu rules through layer hooks.
- `MAIN-TURN-003`: Main turn processing adds city production points to the first backlog item each turn. Completed items are removed in order and the next item becomes active.
- `MAIN-TURN-004`: Every backlog item starts at zero production. Excess from a completed or removed item is discarded and cannot accelerate the next item.
- `MAIN-TURN-005`: In multiplayer, PHP owns production accumulation. JS sends a `produce` command only when previous points plus displayed current income reach the cost; PHP recalculates income, validates points, resources, spawn capacity, and then creates the unit.
- `MAIN-CITY-005`: Clicking a City production choice appends it to the backlog; right-clicking a backlog row removes that item. Clearing production removes the complete backlog without discarding accumulated production.
- `MAIN-CITY-006`: Ready production pauses without losing points while five movable units occupy the City Tile and retries after capacity can become available.
- `MAIN-CITY-007`: The production backlog is rendered after all City production choices so adding or removing backlog entries does not shift the choice list.
- `MAIN-MARKUP-001`: `drawStroke()` control-zone markup is skipped during initial game setup.
- `MAIN-MARKUP-002`: End-turn processing redraws control-zone markup once after layer hooks finish selection and recentering.
- `MAIN-MARKUP-003`: The old force control-zone color stripes are disabled; movement arrows, unit team markers, selection, and status lines remain active.
- `MAIN-RESOURCE-001`: Map tile state contains a resource type id in `_map_resource[i][j]`.
- `MAIN-RESOURCE-002`: Resource overlay sprites are prepared as a full-map resource sprite list and drawn above terrain and below units.
- `MAIN-BIRDSVIEW-001`: `birdsview.js` builds the `50x50` strategic world projection described in `rules/birdsview.md` from the current map size, terrain, resources, and user-indexed unit lists.
- `MAIN-BIRDSVIEW-002`: A primary click inside the visible birdsview projection recenters the main world view on the corresponding map coordinate.
- `MAIN-MAP-001`: The authoritative world is `300x300`; a browser holds and renders one aligned `100x100` terrain window. Unit routes retain world coordinates independently of the loaded terrain window.
- `MAIN-MAP-002`: Selecting a unit shifts the loaded window only when that unit is within 10 Tiles of a current `100x100` window border. A normal shift advances by 10 Tiles, preserves the overlapping 90-Tile terrain, visibility, resources, modifiers, units, and routes, then fills the exposed strip from the server without blanking the current map.
- `MAIN-MAP-003`: Every authoritative coordinate update, including combat snapshots, draws a 180 ms final-step unit arrival from the source direction without delaying state application.
- `MAIN-MOVE-001`: Goto preview, stored route, and submitted atomic movement use one deterministic bounded A* route. The route has no repeated Tiles, prefers continuous roads, penalizes hills and rocks, and respects the selected unit's land/water entry rules.
- `MAIN-RESPAWN-001`: A defeated player receives a large `Click on minimap to select respawn point` prompt and remains in selection mode without a countdown. Only a birdsview/minimap click submits the requested point; PHP chooses the nearest valid unoccupied land Tile and the browser centers there after respawn.
- `MAIN-RESPAWN-002`: The bottom-right `Options` button opens a centered menu containing `Log out`, `Respawn`, and `Back to game`. Manual Respawn enters the same minimap-selection flow even while the civilization still has units.
- `MAIN-CITY-008`: PHP assigns each newly built City the next unused name from its civilization list. The map draws `<population> <city name>` in bold below the City sprite.

## AI Player Rules

- `MAIN-AI-001`: AI engine input starts with a shared base of `8` object records of `120` FP32 values each plus `64` FP32 values describing the generic situation. Action and Economics use only this `1024` FP32 base input.
- `MAIN-AI-002`: AI engine output is unified as `8` object command records of `8` FP32 values each plus `8` FP32 values for generic decisions, for a total output width of `72`.
- `MAIN-AI-003`: Game object ids are not encoded in neural input or output. Adapters keep ids in side arrays, preserving object order, and map output command record `n` back to input object `n`.
- `MAIN-AI-004`: Strategy input uses four civilization-status objects and four military-force-weight objects.
- `MAIN-AI-004A`: Strategy generic inputs `[24..40]` describe visible terrain and resources around owned cities, or around owned settlers when no city exists. They include hills, rocks, grass, water, animals, stone, crops, opened technology rate, visible context coverage, flat land, fresh water, forest, desert/snow, resource coverage, mineral resources, and whether the context anchor is a city or settler.
- `MAIN-AI-004B`: Strategy appends a `50x50` birdsview projection in slots `1024..3523`. The birdsview is scaled from any world map size and compactly represents local controller civ id, military weight, landscape height, and resources.
- `MAIN-AI-004C`: Strategy technology decisions use visible landscape and resources as positive and negative evidence. Mining requires substantial hills, rocks, or mineral evidence; a fully observed city/settler context with none of those signals must select a technology supported by the actual terrain or resources instead.
- `MAIN-AI-006`: Action input uses up to eight complete legal action candidates for one rotating owned unit. Each candidate includes an exact command, destination or current-tile target, requested state/improvement, target facts, and a 9x9 window centered on that target.
- `MAIN-AI-006A`: Action output slots `[0..7]` score the complete candidates in input order. The adapter revalidates and applies the selected target and parameters without choosing a Worker job, enemy, settlement site, or fallback action. When a military unit can reach a fully visible wartime enemy in one atomic step, its candidate set contains only those immediate attack targets; this prevents a patrol route from entering an enemy Tile without attack intent.
- `MAIN-AI-007`: Economics input uses up to eight complete legal production candidates for one rotating free City. Each candidate includes an exact unit type, its combat/mobility/cost facts, City and Strategy context, and a 9x9 local tile window centered on the City.
- `MAIN-AI-007A`: Economics Worker production requires both an explicitly encoded opened improvement technology and at least one corresponding known, unimproved plot around owned cities. The aggregate technology rate and Worker demand cannot independently justify Worker production.
- `MAIN-AI-007B`: Because every technology is temporarily open, Economics training includes simultaneous improvement-technology signals. Existing Worker count and Strategy demand must outweigh those signals once the civilization has enough Workers; available improvements are not a permanent Worker-production order.
- `MAIN-AI-010`: Action receives Strategy focus coordinates as dx/dy relative to the current unit and normalized by the 9x9 window radius, not as absolute map coordinates.
- `MAIN-AI-008`: AI model fully connected layer widths reduce from input values to `72` output values through eight tanh layers. Strategy currently starts at `3524` input values; other engines currently start at `1024`.
- `MAIN-AI-009`: A game has exactly one global AI civilization. Legacy per-human AI accounts are discarded when the development game is reset.
- `MAIN-AI-012`: Every authenticated browser may contribute work to the global AI during its human turn. PHP leases disjoint batches of unassigned movable AI objects using weighted service debt. Mature Settlers receive category priority only after an eight-turn service interval, so a blocked Settler cannot monopolize every server turn; active Worker projects, other Workers, and military forces continue accumulating service debt and cannot be permanently starved.
- `MAIN-AI-012A`: A military unit adjacent to a fully visible unit or City of a civilization at war receives immediate scheduling priority. Its Action input still carries the exact legal attack candidate and authoritative movement/combat validation remains unchanged.
- `MAIN-AI-013`: The Action model evaluates each unit in a leased batch independently. The client submits atomic commands, immediate actions, and the separately retained leased object order; PHP revalidates them against current state and merges valid work into the active turn without creating an AI turn submission.
- `MAIN-AI-014`: Shared AI inference runs concurrently with the human turn and stops when that turn ends. End Turn never waits for AI inference, an AI lease, or AI command submission.
- `MAIN-AI-015`: Generated Iron, Copper, Gold, Gems, and Diamonds deposits receive one global-AI force containing five Settlers, five Explorers, ten Archers, and one automated Worker, spread according to the five-unit Tile limit. Automated Workers improve and road-connect guarded resources after an owned City exists nearby.
- `MAIN-AI-016`: A native contributor processes up to eight nearby Workers from one authoritative snapshot. Worker policy is deterministic, and decisions earlier in the batch reserve their targets for decisions later in the same batch.
- `MAIN-AI-017`: A shared AI Settler persists only its intended world destination in authoritative unit properties. Every contributor lease rebuilds a fresh local route from the current server position; reaching or invalidating the destination clears the mission. PHP never persists the route itself.

## Server Game Rules

- `MAIN-SERVER-001`: The browser may execute and render speculative local turns, but the versioned server game state is authoritative. Players submit synchronous orders during one 6-second turn. Concurrent movement follows `rules/server_game.md`.
- `MAIN-SERVER-002`: PHP owns world generation and registered-player initialization. A client starts only after login, initializes empty render arrays, and loads its units, state, fog, and visible terrain from the server.
- `MAIN-SERVER-003`: Authenticated page startup uses `load_full`; turn refreshes use `update_events` before unit and landscape deltas.
- `MAIN-SERVER-004`: PHP never stores full or remaining movement paths. It validates every current-turn atomic movement before accepting `make_turn`, returning an explicit error instead of truncating, rerouting, or silently dropping an invalid movement.
- `MAIN-SERVER-005`: Authoritative unit synchronization reconciles existing arrays in place. It never clears or replaces the global unit collection or a live displayed owner array before adding server records. Hidden-AI evaluation reuses those persistent arrays, preserves existing foreign objects, disables foreign pruning, and cannot render while its synchronous map context is active. Fog changes a per-viewer visibility flag on a foreign unit but does not remove and later recreate that object.

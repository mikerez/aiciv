# Prehistory Rules

This file describes the rules for the `prehistory` layer implemented by `game_prehistory.js`.
Map generation, terrain data, fog/open map state, and terrain movement penalties are base game properties and are not defined by this layer.

## Movement Rules

- `PREHISTORY-MOVE-001`: Units that cannot move must not keep a movement order.
- `PREHISTORY-MOVE-002`: Moving units follow the path assigned by player preview and base movement processing.
- `PREHISTORY-MOVE-003`: Terrain cost and blocked terrain are handled by the base game/map systems.
- `PREHISTORY-MOVE-004`: Water-nature units move only on water terrain.
- `PREHISTORY-MOVE-005`: Land-nature units cannot move onto water terrain.
- `PREHISTORY-MOVE-006`: Vertical diagonal movement is not available.
- `PREHISTORY-MOVE-007`: Goto path search checks the best forward tile and one alternate forward tile before stopping on blocked terrain.
- `PREHISTORY-MOVE-008`: A moving unit can consume up to its speed value in movement points during one turn.
- `PREHISTORY-MOVE-009`: A normal movement step costs one movement point. A step costs one-half movement point only when both its source and destination Tiles contain roads, allowing up to twice as many connected-road steps per turn.

## Unit State Rules

- `PREHISTORY-UNIT-001`: Settlers are movable units.
- `PREHISTORY-UNIT-002`: Explorers and military/naval units are movable units.
- `PREHISTORY-UNIT-003`: Cities are non-moving units.
- `PREHISTORY-UNIT-004`: Every unit must have a `gotoPath` queue.
- `PREHISTORY-UNIT-005`: Every unit has an explicit layer state.
- `PREHISTORY-UNIT-006`: Prehistory unit definitions use the main `UnitType` structure.
- `PREHISTORY-UNIT-007`: Unit type nature is `land` or `water`; movement and seaside production rules use this nature instead of unit names.
- `PREHISTORY-UNIT-008`: WorkBoat and Frigate are water-nature units. Knight, Pikeman, Longbow, Fencer, and Swordsman are land-nature units.

## Unit Types

| Unit | Nature | Attack | Defence | Speed | View Range | Technology Required | Production Cost | Resource Required |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | --- |
| Settlers | land | 0 | 1 | 1 | 2 | none | 20 | none |
| Worker | land | 0 | 1 | 1 | 2 | none | 20 | none |
| Explorer | land | 0 | 1 | 2 | 4 | none | 15 | none |
| Warrior | land | 2 | 1 | 1 | 2 | none | 20 | none |
| Slinger | land | 2 | 1 | 1 | 2 | Archery | 25 | none |
| Archor | land | 3 | 1 | 1 | 2 | Archery | 35 | none |
| Spearman | land | 2 | 3 | 1 | 2 | Bronze Working | 35 | Copper |
| Horseman | land | 4 | 2 | 2 | 3 | Horseback Riding | 50 | Horses |
| Chariot | land | 3 | 2 | 2 | 3 | Wheel | 45 | Horses |
| Elephant | land | 5 | 4 | 2 | 3 | Horseback Riding | 70 | Ivory |
| Catapult | land | 5 | 1 | 1 | 2 | Construction | 60 | none |
| Trebuchet | land | 7 | 1 | 1 | 2 | Engineering | 80 | none |
| Galley | water | 2 | 2 | 2 | 3 | Sailing | 40 | none |
| Galleon | water | 5 | 4 | 3 | 4 | Navigation | 90 | none |
| WorkBoat | water | 0 | 1 | 2 | 3 | Sailing | 30 | none |
| Frigate | water | 6 | 5 | 3 | 4 | Shipbuilding | 100 | Iron |
| Knight | land | 6 | 5 | 2 | 3 | Engineering | 85 | Horses |
| Pikeman | land | 4 | 6 | 1 | 2 | Iron Working | 55 | Iron |
| Longbow | land | 5 | 3 | 1 | 3 | Archery | 55 | none |
| Fencer | land | 4 | 3 | 2 | 2 | Bronze Working | 45 | Copper or Iron |
| Swordsman | land | 7 | 5 | 1 | 2 | Iron Working | 75 | Iron |

## Building State Rules

- `PREHISTORY-BUILD-001`: A selected settler can build a city with the `build_city` command or `B` key.
- `PREHISTORY-BUILD-002`: Building a city consumes the settler. In a server game, `build_city` deletes the authoritative Settler and creates the City atomically.
- `PREHISTORY-BUILD-003`: A selected City appends a unit with `produce_unit:<unitTypeId>`. A server game sends the choice immediately with `select_production`; `produce_unit:none` clears the backlog.
- `PREHISTORY-BUILD-004`: Cities show current production, remaining turns, and the ordered backlog. Right-clicking a backlog item sends `remove_production` for that position.
- `PREHISTORY-BUILD-005`: A built city inherits the team number of the settler that built it.
- `PREHISTORY-BUILD-006`: A produced unit inherits the team number of the city that produced it.
- `PREHISTORY-BUILD-007`: Water-nature units can be produced only in seaside cities.
- `PREHISTORY-BUILD-008`: Units with a technology requirement can be produced only after that technology is discovered.
- `PREHISTORY-BUILD-009`: A built city starts with road and irrigation modifiers on its tile, but the city-created irrigation gives extra city-tile food only if fresh water is in a neighboring tile.
- `PREHISTORY-BUILD-010`: A City with five movable units on its Tile pauses ready unit production without consuming points or advancing its backlog. It retries after a later turn when capacity may be available.
- `PREHISTORY-BUILD-011`: Strategic resources count for production only when their Tile is connected to the City by a contiguous road path.
- `PREHISTORY-BUILD-012`: Horseman and Chariot require Horses; Knight requires Horses and Iron; Elephant requires Ivory; Spearman, Fencer, and Catapult require either Copper/Bronze or Iron; Pikeman and Swordsman require Iron.
- `PREHISTORY-BUILD-013`: Building a City automatically chops forest on its Tile without awarding Worker chop production.

## Turn Processing Rules

- `PREHISTORY-TURN-001`: Layer movement rules are applied by the main `_game.applyTurnProcessingRules(layer)` function before base turn processing.
- `PREHISTORY-TURN-002`: Base turn processing moves units, applies terrain delay, updates visible map state, and redraws base overlays.
- `PREHISTORY-TURN-003`: Layer unit and building state rules are re-applied after base turn processing.
- `PREHISTORY-TURN-004`: End Turn selects and centers the view on the next movable unit without a task.
- `PREHISTORY-TURN-005`: A movable unit is without a task when it has no active route, no target, and its layer state is `ready`.
- `PREHISTORY-TURN-006`: `Disband` permanently removes the selected owned movable unit. Server games validate and apply it authoritatively with the next aggregated turn request.
- `PREHISTORY-TURN-007`: A locally selected Worker improvement command and its remaining build turns survive polling and page reload until PHP accepts or rejects the build.
- `PREHISTORY-TURN-006`: When End Turn makes a movable unit finish its task, that newly idle unit is selected before scanning for the next idle unit.
- `PREHISTORY-TURN-007`: End Turn selects and centers the view on the first city with no active production before movable unit prompts so the production status shows that it produces nothing.
- `PREHISTORY-TURN-008`: End Turn is blocked while the current selected movable unit is idle and has no Goto path, route, target, or modified state task.
- `PREHISTORY-TURN-009`: Expiration of the client turn timer forces End Turn even when the selected unit is idle and has no order; manual End Turn retains the idle-unit prompt.

## Movement Capacity Rules

- `PREHISTORY-MOVE-006`: At most five living movable units may occupy one Tile. Cities and terrain-improvement records do not consume unit-stack capacity. A military unit may still target a full Tile containing a visible foreign defender so the stack limit never prevents an attack.

## Menu Rules

- `PREHISTORY-MENU-001`: On phones, if no unit is selected, the complete unit action menu panel is hidden.
- `PREHISTORY-MENU-002`: Movable units show movement-related commands.
- `PREHISTORY-MENU-003`: Settlers show the Build City command.
- `PREHISTORY-MENU-004`: Cities show building management options and hide movement commands.
- `PREHISTORY-MENU-005`: Menu visibility is recalculated after selection, command processing, and turn processing.
- `PREHISTORY-MENU-006`: Workers show terrain improvement commands only when the selected worker can currently start them.
- `PREHISTORY-MENU-007`: Workers show the Fortification command instead of Fortificate after `Construction` is discovered.
- `PREHISTORY-MENU-008`: Workers show Pasture, Cottage, Workshop, Mine, and Fortification when the required technology is known and the tile does not already have that building.
- `PREHISTORY-MENU-009`: Unit command menu entries show their command letter as a small button.
- `PREHISTORY-MENU-010`: Selected movable units show attack force, defence force, steps per turn, health, and experience before movement commands.
- `PREHISTORY-MENU-011`: On phones, giving a unit or city an order hides the complete action menu panel. Selecting a unit or city again, including automatic next-unit selection, shows its applicable actions again. Desktop menu visibility is unchanged.
- `PREHISTORY-MENU-011A`: Selecting a City production item on a phone keeps the City action menu open so more backlog items can be added without selecting the City again.

## Command State Rules

- `PREHISTORY-STATE-001`: Goto enters a map targeting mode, previews arrows until the next map click, and stores that preview path on the unit.
- `PREHISTORY-STATE-002`: Fortificate changes the unit state to `fortified` and consumes the unit's next turn.
- `PREHISTORY-WORKER-BUILDING-011`: A Worker may build the Fortification improvement after Construction is known. Fortification is persisted as a Tile modifier and contributes its defence bonus to every defending unit on that Tile.
- `PREHISTORY-WORKER-BUILDING-012`: Every Worker or WorkBoat terrain improvement waits two client turns before JS submits its build request. PHP validates the Tile only when that delayed request arrives.
- `PREHISTORY-STATE-003`: Wait changes the unit state to `waiting`.
- `PREHISTORY-STATE-004`: Road, Road-to, Irrigate, Chop forest, Pasture, Cottage, Workshop, Mine, and Fortification are worker-only unit states.
- `PREHISTORY-STATE-005`: Explore, Patrol, and Automate are auto-routing unit states.
- `PREHISTORY-STATE-006`: Unit state is drawn as a single letter over the unit sprite.
- `PREHISTORY-STATE-007`: Manual movement by dragging a unit clears any modified state and returns the unit to `ready`.
- `PREHISTORY-STATE-008`: Fortification is a worker construction state available after `Construction` is discovered.
- `PREHISTORY-STATE-009`: Pasture, Cottage, Workshop, Mine, and Fortification progress is stored as worker tile-building turn state.
- `PREHISTORY-STATE-010`: Right mouse click assigns a Goto path for the selected movable unit.
- `PREHISTORY-STATE-011`: Right mouse click draws the same Goto arrows as drag preview after assigning the path.
- `PREHISTORY-STATE-012`: Goto preview follows normal mouse hover after the command is selected, even when the mouse button is not held.

## Selection Rules

- `PREHISTORY-SELECT-001`: When a City and other units share a Tile, the City is sorted first and selected by the Tile click so City commands are shown immediately.
- `PREHISTORY-SELECT-002`: The stack selector can replace the City selection with one unit or with all military units on that Tile.

## Forest Chopping Rules

- `PREHISTORY-CHOP-001`: Chopping forest can be performed only by a worker in `chop_forest` state.
- `PREHISTORY-CHOP-002`: Chopping can progress only while the worker stands on a forest terrain tile.
- `PREHISTORY-CHOP-003`: Forest terrain is terrain type `6`; `hills1` and `hills5` are forested hill variants and are also available for chopping.
- `PREHISTORY-CHOP-004`: Chopping jungle/forest takes four client turns before its authoritative build order is submitted.
- `PREHISTORY-CHOP-005`: When chopping completes, a base forest tile becomes base grass terrain.
- `PREHISTORY-CHOP-006`: If the unit is not on forest terrain, the chop order is cancelled.
- `PREHISTORY-CHOP-007`: A unit cannot enter `chop_forest` state unless it is already standing on forest terrain.
- `PREHISTORY-CHOP-008`: When chopping completes, `hills1` becomes `hills` and `hills5` becomes `hills4`.
- `PREHISTORY-CHOP-009`: Workers cannot chop forest before `Bronze Working` is discovered.
- `PREHISTORY-CHOP-010`: Completed chopping gives exactly 10 production once to the nearest same-team City.
- `PREHISTORY-CHOP-011`: Chop production is credited only when the nearest City has an active production task; idle Cities store no production.
- `PREHISTORY-CHOP-012`: Workers cannot start forest chopping while standing on a city tile.
- `PREHISTORY-WATER-001`: A WorkBoat can build one Nets improvement on a shallow-water Tile; Nets construction is unavailable on land and deep water.

## Start View Rules

- `PREHISTORY-VIEW-001`: When a prehistory game starts, the screen is centered on the initial cluster of spawned units.
- `PREHISTORY-START-001`: A prehistory game starts with one Settler and three Explorers for each registered player.
- `PREHISTORY-START-002`: Temporarily for coexistence and combat testing, default teams are placed about 30 map tiles apart. The previous independent random start placement remains commented in `game_prehistory.js` for restoration.

## Auto-Routing Rules

- `PREHISTORY-AUTO-001`: Explore chooses a new route with 50% probability toward a nearby hidden/black land cell and 50% probability toward the nearest known city or settler; if the preferred target type is unavailable it falls back to the other, then to Automate routing.
- `PREHISTORY-AUTO-002`: Patrol attacks the nearest visible unit of a civilization already at war; when no visible enemy exists, it routes around a remembered patrol origin.
- `PREHISTORY-AUTO-003`: Automate chooses a nearby available land route.
- `PREHISTORY-AUTO-004`: Auto-routing runs before authoritative command capture when a unit has a persistent auto-routing mode and no active route.
- `PREHISTORY-AUTO-005`: Explore, Patrol, and Automate keep their mode after a route ends and immediately calculate their next route.
- `PREHISTORY-AUTO-006`: Worker Automate checks its current tile and then a 10x10-scale neighborhood for useful improvements, prioritizes opened resource improvements, and does not replace an existing primary improvement merely to stay busy.

## Road Building Rules

- `PREHISTORY-ROAD-001`: Only workers in `road` state can build roads.
- `PREHISTORY-ROAD-002`: Roads are land terrain modifiers and cannot be built on water.
- `PREHISTORY-ROAD-003`: Road building takes two client turns before its authoritative build request is submitted.
- `PREHISTORY-ROAD-004`: Completed road building sets the road terrain modifier on the worker tile.
- `PREHISTORY-ROAD-005`: Mixed grass-water terrain type `7` cannot receive roads until `Construction` is discovered.
- `PREHISTORY-ROAD-006`: Workers cannot build roads before `Wheel` is discovered.
- `PREHISTORY-ROAD-007`: Road-to uses the same path preview and path assignment as Goto, but is available only to Workers after `Wheel`.
- `PREHISTORY-ROAD-008`: A Worker in Road-to state pauses on every supported path tile, spends the normal two turns building there through the authoritative server, and resumes its saved route only after the road succeeds.
- `PREHISTORY-ROAD-009`: Workers cannot build roads on city tiles. A newly built city may still create its own starting road directly.


## Worker Tile Building Rules

- `PREHISTORY-WORKER-BUILDING-001`: Only workers in a worker tile-building state can build Pasture, Farm, Plantation, Camp, Fishing Boats, Quarry, Winery, Cottage, Workshop, Mine, or Fortification.
- `PREHISTORY-WORKER-BUILDING-002`: Worker tile-building commands are available only when the required technology is open: Pasture and Camp require `Animal Husbandry`, Farm requires `Irrigation`, Fishing Boats requires `Sailing`, Plantation and Winery require `Pottery`, Cottage and Quarry require `Masonry`, Workshop and Fortification require `Construction`, and Mine requires `Mining`.
- `PREHISTORY-WORKER-BUILDING-003`: Worker tile-building commands are shown only when the building is supported on the worker tile and that tile does not already have the same building.
- `PREHISTORY-WORKER-BUILDING-004`: Completed worker tile buildings set the corresponding terrain modifier on the worker tile.
- `PREHISTORY-WORKER-BUILDING-005`: Resource improvements require the matching opened resource on the worker tile: Pasture for Cattle, Sheep, and Horses; Farm for Rice and Wheat; Plantation for Bananas, Citrus, Cotton, Dyes, Incense, Olives, Silk, Spices, Sugar, and Tea; Camp for Deer, Amber, Furs, Honey, and Ivory; Fishing Boats for Crabs, Fish, Pearls, Turtles, and Whales; Quarry for Stone, Gypsum, Marble, and Salt; Winery for Wine; Mine for Copper, Diamonds, Silver, Iron, Gold, and Gems.
- `PREHISTORY-WORKER-BUILDING-006`: Mine can be built only on hills terrain type `4` or mountains/rocks terrain type `5`.
- `PREHISTORY-WORKER-BUILDING-007`: If the worker tile has an opened resource and its required improvement is currently buildable, the worker menu suggests only that resource improvement from the worker tile-building list.
- `PREHISTORY-WORKER-BUILDING-008`: Land worker tile buildings are not supported on water tiles; Fishing Boats is supported only on water resource tiles.
- `PREHISTORY-WORKER-BUILDING-009`: Cottage age increases each authoritative server turn; a Cottage becomes a Hamlet after 100 turns and a Village after 200 total turns.
- `PREHISTORY-WORKER-BUILDING-010`: Workers cannot start Pasture, Farm, Plantation, Camp, Fishing Boats, Quarry, Winery, Cottage, Workshop, Mine, or Fortification while standing on a city tile.

## Irrigation Rules

- `PREHISTORY-IRRIGATION-001`: Only workers in `irrigate` state can build irrigation.
- `PREHISTORY-IRRIGATION-002`: Irrigation is a land terrain modifier and cannot be built on water.
- `PREHISTORY-IRRIGATION-003`: Irrigation takes two client turns before its authoritative build request is submitted.
- `PREHISTORY-IRRIGATION-004`: Completed irrigation sets the irrigation terrain modifier on the worker tile.
- `PREHISTORY-IRRIGATION-005`: PHP validates irrigation with a breadth-first route search. The requested Tile is the origin, existing irrigation Tiles are the route, and the route must reach mixed grass-water, an `A`-bit water source, or shallow fresh water.
- `PREHISTORY-IRRIGATION-006`: JS checks Worker, technology, City, grass, and existing-modifier restrictions but deliberately does not check water connectivity. A disconnected authoritative request returns `status: IMPOSSIBLE`, resets the Worker to ready, and is shown by the client.
- `PREHISTORY-IRRIGATION-007`: A shallow water terrain type `0` source belongs to sea and cannot start irrigation if it has a cardinal neighboring water tile with depth greater than 1.
- `PREHISTORY-IRRIGATION-008`: Irrigation can be built only on grass terrain type `2`.
- `PREHISTORY-IRRIGATION-009`: The `A` terrain bit marks a local water source. On fields, hills, and mountains it represents land water; on water-related terrain it represents lake/source water and allows irrigation source detection.
- `PREHISTORY-IRRIGATION-010`: Workers cannot build irrigation before `Irrigation` is discovered.
- `PREHISTORY-IRRIGATION-011`: When a Worker completes irrigation next to a city, the city tile's existing irrigation starts giving its food bonus.
- `PREHISTORY-IRRIGATION-012`: Fresh water means a neighboring water source tile that has no nearby cardinal deep-water tile.
- `PREHISTORY-IRRIGATION-013`: Workers cannot build irrigation on city tiles. A newly built city may still create its own starting irrigation directly when fresh water is nearby.

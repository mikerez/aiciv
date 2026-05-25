# Prehistory Rules

This file describes the rules for the `prehistory` layer implemented by `game_prehistory.js`.
Map generation, terrain data, fog/open map state, and terrain movement penalties are base game properties and are not defined by this layer.

## Movement Rules

- `PREHISTORY-MOVE-001`: Units that cannot move must not keep a movement order.
- `PREHISTORY-MOVE-002`: Moving units follow the path assigned by player preview and base movement processing.
- `PREHISTORY-MOVE-003`: Terrain cost and blocked terrain are handled by the base game/map systems.
- `PREHISTORY-MOVE-004`: Water-nature units move only on water terrain.
- `PREHISTORY-MOVE-005`: Land-nature units cannot move onto water terrain.

## Unit State Rules

- `PREHISTORY-UNIT-001`: Settlers are movable units.
- `PREHISTORY-UNIT-002`: Explorers and military/naval units are movable units.
- `PREHISTORY-UNIT-003`: Cities are non-moving units.
- `PREHISTORY-UNIT-004`: Every unit must have a `gotoPath` queue.
- `PREHISTORY-UNIT-005`: Every unit has an explicit layer state.
- `PREHISTORY-UNIT-006`: Prehistory unit definitions use the main `UnitType` structure.
- `PREHISTORY-UNIT-007`: Unit type nature is `land` or `water`; movement and seaside production rules use this nature instead of unit names.

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
| Horseman | land | 4 | 2 | 3 | 3 | Horseback Riding | 50 | Horses |
| Chariot | land | 3 | 2 | 2 | 3 | Wheel | 45 | Horses |
| Elephant | land | 5 | 4 | 2 | 3 | Horseback Riding | 70 | Ivory |
| Catapult | land | 5 | 1 | 1 | 2 | Construction | 60 | none |
| Trebuchet | land | 7 | 1 | 1 | 2 | Engineering | 80 | none |
| Galley | water | 2 | 2 | 2 | 3 | Sailing | 40 | none |
| Galleon | water | 5 | 4 | 3 | 4 | Navigation | 90 | none |

## Building State Rules

- `PREHISTORY-BUILD-001`: A selected settler can build a city with the `build_city` command or `B` key.
- `PREHISTORY-BUILD-002`: Building a city consumes the settler.
- `PREHISTORY-BUILD-003`: A selected city can choose a unit production option with command `produce_unit:<unitTypeId>`.
- `PREHISTORY-BUILD-004`: Cities show the current production item and remaining turns in the unit menu.
- `PREHISTORY-BUILD-005`: A built city inherits the team number of the settler that built it.
- `PREHISTORY-BUILD-006`: A produced unit inherits the team number of the city that produced it.
- `PREHISTORY-BUILD-007`: Water-nature units can be produced only in seaside cities.

## Turn Processing Rules

- `PREHISTORY-TURN-001`: Layer movement rules are applied by the main `_game.applyTurnProcessingRules(layer)` function before base turn processing.
- `PREHISTORY-TURN-002`: Base turn processing moves units, applies terrain delay, updates visible map state, and redraws base overlays.
- `PREHISTORY-TURN-003`: Layer unit and building state rules are re-applied after base turn processing.
- `PREHISTORY-TURN-004`: End Turn selects and centers the view on the next movable unit without a task.
- `PREHISTORY-TURN-005`: A movable unit is without a task when it has no active route, no target, and its layer state is `ready`.
- `PREHISTORY-TURN-006`: When End Turn makes a movable unit finish its task, that newly idle unit is selected before scanning for the next idle unit.

## Menu Rules

- `PREHISTORY-MENU-001`: If no unit is selected, unit action menu options are hidden.
- `PREHISTORY-MENU-002`: Movable units show movement-related commands.
- `PREHISTORY-MENU-003`: Settlers show the Build City command.
- `PREHISTORY-MENU-004`: Cities show building management options and hide movement commands.
- `PREHISTORY-MENU-005`: Menu visibility is recalculated after selection, command processing, and turn processing.
- `PREHISTORY-MENU-006`: Workers show terrain improvement commands: Road, Irrigate, and Chop forest.

## Command State Rules

- `PREHISTORY-STATE-001`: Goto enters a map targeting mode, previews arrows until the next map click, and stores that preview path on the unit.
- `PREHISTORY-STATE-002`: Fortificate changes the unit state to `fortified` and consumes the unit's next turn.
- `PREHISTORY-STATE-003`: Wait changes the unit state to `waiting`.
- `PREHISTORY-STATE-004`: Road, Irrigate, and Chop forest are worker-only unit states.
- `PREHISTORY-STATE-005`: Explore, Patrol, and Automate are auto-routing unit states.
- `PREHISTORY-STATE-006`: Unit state is drawn as a single letter over the unit sprite.
- `PREHISTORY-STATE-007`: Manual movement by dragging a unit clears any modified state and returns the unit to `ready`.

## Forest Chopping Rules

- `PREHISTORY-CHOP-001`: Chopping forest can be performed only by a worker in `chop_forest` state.
- `PREHISTORY-CHOP-002`: Chopping can progress only while the worker stands on a forest terrain tile.
- `PREHISTORY-CHOP-003`: Forest terrain is terrain type `6`; `hills1` and `hills5` are forested hill variants and are also available for chopping.
- `PREHISTORY-CHOP-004`: Chopping takes the forest tile wildity level stored in terrain `D1 D0` bits plus two turns, because the current turn-processing pass decrements progress immediately.
- `PREHISTORY-CHOP-005`: When chopping completes, a base forest tile becomes base grass terrain.
- `PREHISTORY-CHOP-006`: If the unit is not on forest terrain, the chop order is cancelled.
- `PREHISTORY-CHOP-007`: A unit cannot enter `chop_forest` state unless it is already standing on forest terrain.
- `PREHISTORY-CHOP-008`: When chopping completes, `hills1` becomes `hills` and `hills5` becomes `hills4`.

## Start View Rules

- `PREHISTORY-VIEW-001`: When a prehistory game starts, the screen is centered on the initial cluster of spawned units.
- `PREHISTORY-START-001`: A prehistory game starts with one Settler, one Explorer, and one Worker for team 0.

## Auto-Routing Rules

- `PREHISTORY-AUTO-001`: Explore routes toward the nearest known unseen land cell that can be reached by the base path builder.
- `PREHISTORY-AUTO-002`: Patrol routes around a remembered patrol origin.
- `PREHISTORY-AUTO-003`: Automate chooses a nearby available land route.
- `PREHISTORY-AUTO-004`: Auto-routing runs during turn processing when a unit has an auto-routing state and no active route.

## Road Building Rules

- `PREHISTORY-ROAD-001`: Only workers in `road` state can build roads.
- `PREHISTORY-ROAD-002`: Roads are land terrain modifiers and cannot be built on water.
- `PREHISTORY-ROAD-003`: Road building cost is two times terrain wildity stored in terrain `D` bits.
- `PREHISTORY-ROAD-004`: Completed road building sets the road terrain modifier on the worker tile.
- `PREHISTORY-ROAD-005`: Mixed grass-water terrain type `7` cannot receive roads until `Construction` is discovered.


## Irrigation Rules

- `PREHISTORY-IRRIGATION-001`: Only workers in `irrigate` state can build irrigation.
- `PREHISTORY-IRRIGATION-002`: Irrigation is a land terrain modifier and cannot be built on water.
- `PREHISTORY-IRRIGATION-003`: Irrigation takes at least one turn based on terrain wildity stored in terrain `D` bits.
- `PREHISTORY-IRRIGATION-004`: Completed irrigation sets the irrigation terrain modifier on the worker tile.
- `PREHISTORY-IRRIGATION-005`: New irrigation must be adjacent to a valid source: mixed grass-water terrain type `7`, shallow water terrain type `0` with depth up to 1, or existing irrigation.
- `PREHISTORY-IRRIGATION-006`: New irrigation can also be adjacent to an existing irrigation tile, allowing irrigation chains away from the source.
- `PREHISTORY-IRRIGATION-007`: A shallow water terrain type `0` source belongs to sea and cannot start irrigation if it has a cardinal neighboring water tile with depth greater than 1.
- `PREHISTORY-IRRIGATION-008`: Irrigation can be built only on grass terrain type `2`.
- `PREHISTORY-IRRIGATION-009`: For water-related terrain, the `A` terrain bit marks a water source and allows irrigation source detection.

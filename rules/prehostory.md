# Prehistory Rules

This file describes the rules for the `prehistory` layer implemented by `game_prehistory.js`.
Map generation, terrain data, fog/open map state, and terrain movement penalties are base game properties and are not defined by this layer.

## Movement Rules

- `PREHISTORY-MOVE-001`: Units that cannot move must not keep a movement order.
- `PREHISTORY-MOVE-002`: Moving units follow the path assigned by player preview and base movement processing.
- `PREHISTORY-MOVE-003`: Terrain cost and blocked terrain are handled by the base game/map systems.

## Unit State Rules

- `PREHISTORY-UNIT-001`: Settlers are movable units.
- `PREHISTORY-UNIT-002`: Explorers and military/naval units are movable units.
- `PREHISTORY-UNIT-003`: Cities are non-moving units.
- `PREHISTORY-UNIT-004`: Every unit must have a `gotoPath` queue.
- `PREHISTORY-UNIT-005`: Every unit has an explicit layer state.
- `PREHISTORY-UNIT-006`: Prehistory unit definitions use the main `UnitType` structure.

## Unit Types

| Unit | Attack | Defence | Speed | View Range | Technology Required | Production Cost | Resource Required |
| --- | ---: | ---: | ---: | ---: | --- | ---: | --- |
| Settlers | 0 | 1 | 1 | 2 | none | 20 | none |
| Explorer | 0 | 1 | 2 | 4 | none | 15 | none |
| Warrior | 2 | 1 | 1 | 2 | none | 20 | none |
| Slinger | 2 | 1 | 1 | 2 | Archery | 25 | none |
| Archor | 3 | 1 | 1 | 2 | Archery | 35 | none |
| Spearman | 2 | 3 | 1 | 2 | Bronze Working | 35 | Bronze |
| Horseman | 4 | 2 | 3 | 3 | Horseback Riding | 50 | Horses |
| Chariot | 3 | 2 | 2 | 3 | Wheel | 45 | Horses |
| Elephant | 5 | 4 | 2 | 3 | Horseback Riding | 70 | Elephants |
| Catapult | 5 | 1 | 1 | 2 | Construction | 60 | none |
| Trebuchet | 7 | 1 | 1 | 2 | Engineering | 80 | none |
| Galley | 2 | 2 | 2 | 3 | Sailing | 40 | none |
| Galleon | 5 | 4 | 3 | 4 | Navigation | 90 | none |

## Building State Rules

- `PREHISTORY-BUILD-001`: A selected settler can build a city with the `build_city` command or `B` key.
- `PREHISTORY-BUILD-002`: Building a city consumes the settler.
- `PREHISTORY-BUILD-003`: A selected city can choose a unit production option with command `produce_unit:<unitTypeId>`.
- `PREHISTORY-BUILD-004`: Cities show the current production item and remaining turns in the unit menu.

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

## Command State Rules

- `PREHISTORY-STATE-001`: Goto enters a map targeting mode, previews arrows until the next map click, and stores that preview path on the unit.
- `PREHISTORY-STATE-002`: Fortificate changes the unit state to `fortified` and consumes the unit's next turn.
- `PREHISTORY-STATE-003`: Wait changes the unit state to `waiting`.
- `PREHISTORY-STATE-004`: Road, Irrigate, and Chop forest are settler-only unit states.
- `PREHISTORY-STATE-005`: Explore, Patrol, and Automate are auto-routing unit states.
- `PREHISTORY-STATE-006`: Unit state is drawn as a single letter over the unit sprite.
- `PREHISTORY-STATE-007`: Manual movement by dragging a unit clears any modified state and returns the unit to `ready`.

## Forest Chopping Rules

- `PREHISTORY-CHOP-001`: Chopping forest can be performed only by a settler in `chop_forest` state.
- `PREHISTORY-CHOP-002`: Chopping can progress only while the settler stands on a forest terrain tile.
- `PREHISTORY-CHOP-003`: Forest terrain is terrain type `6`; `hills1` and `hills5` are forested hill variants and are also available for chopping.
- `PREHISTORY-CHOP-004`: Chopping takes as many turns as the forest tile wildity level stored in terrain `D` bits.
- `PREHISTORY-CHOP-005`: When chopping completes, a base forest tile becomes base grass terrain.
- `PREHISTORY-CHOP-006`: If the unit is not on forest terrain, the chop order is cancelled.
- `PREHISTORY-CHOP-007`: A unit cannot enter `chop_forest` state unless it is already standing on forest terrain.
- `PREHISTORY-CHOP-008`: When chopping completes, `hills1` becomes `hills` and `hills5` becomes `hills4`.

## Start View Rules

- `PREHISTORY-VIEW-001`: When a prehistory game starts, the screen is centered on the initial cluster of spawned units.

## Auto-Routing Rules

- `PREHISTORY-AUTO-001`: Explore routes toward the nearest known unseen land cell that can be reached by the base path builder.
- `PREHISTORY-AUTO-002`: Patrol routes around a remembered patrol origin.
- `PREHISTORY-AUTO-003`: Automate chooses a nearby available land route.
- `PREHISTORY-AUTO-004`: Auto-routing runs during turn processing when a unit has an auto-routing state and no active route.

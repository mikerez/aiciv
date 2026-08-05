# Military Rules

Military combat is implemented by `military.js`.

## Unit Combat State

- `MILITARY-UNIT-001`: Every unit has `health`, `maxHealth`, and `experience`.
- `MILITARY-UNIT-002`: New units start with `100` health, `100` max health, and `1` experience.
- `MILITARY-UNIT-003`: Experience multiplies attack and defence strength during combat.

## War State

- `MILITARY-WAR-001`: Combat only starts between units whose teams are in war state.
- `MILITARY-WAR-002`: Until a diplomacy layer overrides relations, different teams are considered at war by default.
- `MILITARY-WAR-003`: `military.js` exposes `setWar(teamA, teamB)` and `setPeace(teamA, teamB)` for later politics or diplomacy rules.
- `MILITARY-WAR-004`: Temporarily for combat testing, startup and AI strategy processing force all default civilizations into war state.
- `MILITARY-WAR-005`: The top-left status line prints the active civilization's relation with every known civilization.

## Attack Resolution

- `MILITARY-COMBAT-001`: When a unit enters a tile containing an enemy unit at war, combat is resolved immediately.
- `MILITARY-COMBAT-002`: The defender is the enemy unit on that tile with the highest defence strength.
- `MILITARY-COMBAT-003`: Defence strength is `defence force * experience`, adjusted downward by current health.
- `MILITARY-COMBAT-004`: Attack strength is `attack force * experience`.
- `MILITARY-COMBAT-005`: Combat damage is partially random and decreases health for both attacker and defender.
- `MILITARY-COMBAT-006`: A unit with health reduced to zero is removed from its owner's unit list.
- `MILITARY-COMBAT-007`: If the defender survives, the attacker returns to the tile it attacked from and the route ends.
- `MILITARY-COMBAT-008`: If the defender is destroyed and the attacker survives, the attacker remains on the attacked tile and the route ends.
- `MILITARY-COMBAT-009`: The winning side of a combat round gains experience; destroying an enemy grants additional experience.
- `MILITARY-COMBAT-010`: The chosen defender is promoted to the top drawable/selectable position of its owner's unit list.
- `MILITARY-COMBAT-011`: During authoritative server resolution, the same pair of units can fight at most once per turn even when a half-turn encounter leaves both units occupying the same tile.

# Military Rules

Military combat is implemented by `military.js`.

## Unit Combat State

- `MILITARY-UNIT-001`: Every unit has `health`, `maxHealth`, and `experience`.
- `MILITARY-UNIT-002`: New units start with `100` health, `100` max health, and `1` experience.
- `MILITARY-UNIT-003`: Experience multiplies attack and defence strength during combat.
- `MILITARY-UNIT-004`: Each visible movable unit has two-pixel health and experience indicators immediately below its owner nickname. Health is green above 50%, yellow above 10%, and red at or below 10%. Experience uses `2.0` as the full display scale and is blue below 60% or purple at and above 60%.
- `MILITARY-UNIT-005`: A unit in `fortified` state receives a 25% defence bonus. A unit standing on a Tile with a Fortification improvement receives a 50% defence bonus. These bonuses are additive, giving 75% when both apply, before experience and health modifiers.
- `MILITARY-UNIT-006`: A damaged living movable unit stationed on an owned City Tile recovers 10% of maximum health once per authoritative turn, capped at maximum health. The PHP server validates position and ownership and is authoritative for the resulting health.
- `MILITARY-UNIT-007`: JS and PHP calculate defence from matching three-column unit tables: landscape bonus, opposing-unit bonus, and building bonus.
- `MILITARY-UNIT-008`: Hills add 25% defence and forest adds 50%; forested hills receive both. Horseman, Chariot, and Knight additionally lose 50% in forest or high hills and gain 30% in fields or low unforested hills.
- `MILITARY-UNIT-009`: Archer and Longbow gain 30% in a City and another 30% on a Fortification. The ordinary 50% Fortification bonus still applies.
- `MILITARY-UNIT-010`: Spearman and Pikeman gain 30% against Horseman and Knight. Horseman and Knight gain 30% against Catapult and Trebuchet; Chariot gains 15% against Catapult; Elephant loses 15% against Catapult and Trebuchet.

## War State

- `MILITARY-WAR-001`: Combat only starts between units whose teams are in war state.
- `MILITARY-WAR-002`: Different civilizations begin neutral. Neutral units may meet or cross without combat.
- `MILITARY-WAR-003`: `military.js` exposes `setWar(teamA, teamB)` and `setNeutral(teamA, teamB)` for politics and direct attack handling.
- `MILITARY-WAR-006`: A direct military move onto a foreign unit, or an explicit AI attack command, changes both civilizations' relation to war before combat is resolved.
- `MILITARY-WAR-004`: Temporarily for combat testing, startup and AI strategy processing force all default civilizations into war state.
- `MILITARY-WAR-005`: The top-left status line prints the active civilization's relation with every known civilization.
- `MILITARY-WAR-007`: Friend, enemy, and neutral preferences are directional. One civilization's preference does not change the other civilization's preference.
- `MILITARY-WAR-008`: A military route ending on visible neutral units asks whether to attack or coexist. Friendly-only destinations coexist without a prompt; an explicit attack changes the attacker's preference to enemy and permits combat.

## Attack Resolution

- `MILITARY-COMBAT-001`: When a military unit enters a tile containing an enemy unit at war, combat is resolved immediately.
- `MILITARY-COMBAT-002`: The defender is the enemy military unit on that tile with the highest defence strength.
- `MILITARY-COMBAT-003`: Defence strength is `defence force * (1 + all defence bonuses) * experience`, adjusted downward by current health.
- `MILITARY-COMBAT-004`: Attack strength is `attack force * experience`.
- `MILITARY-COMBAT-005`: Combat damage is partially random and decreases health for both attacker and defender.
- `MILITARY-COMBAT-006`: A unit with health reduced to zero is removed from its owner's unit list.
- `MILITARY-COMBAT-007`: If the defender survives, the attacker returns to the tile it attacked from and the route ends.
- `MILITARY-COMBAT-008`: If the defender is destroyed and the attacker survives, the attacker remains on the attacked tile only when no other hostile unit remains there. If another defender remains, the attacker returns to the immediately previous route tile and the route ends. The authoritative server coordinate returned at turn end includes this retreat.
- `MILITARY-COMBAT-009`: The winning side of a combat round gains experience; destroying an enemy grants additional experience.
- `MILITARY-COMBAT-010`: The chosen defender is promoted to the top drawable/selectable position of its owner's unit list.
- `MILITARY-COMBAT-011`: During authoritative server resolution, the same pair of units can fight at most once per turn even when a half-turn encounter leaves both units occupying the same tile.
- `MILITARY-COMBAT-012`: A City does not fight as a unit. Military units belonging to the City's owner and standing on its tile form its garrison; the strongest garrison unit defends first.
- `MILITARY-COMBAT-013`: Each defending military unit killed on its owner's City tile reduces that City's population by one, with a minimum surviving population of one.
- `MILITARY-COMBAT-014`: When an attacking military unit survives and no other hostile unit remains on the City tile, the City is captured without further health loss and its ownership changes to the attacker's player. Killing one member of a stacked garrison cannot capture the City.
- `MILITARY-COMBAT-016`: One attack resolves against one defending unit. Surviving stacked defenders remain in place for later turns; they are not consumed by the same movement order.
- `MILITARY-COMBAT-015`: An unarmed civilian cannot resist a military entrant or shield an ungarrisoned City. A hostile Settler on the entered tile is removed without damaging the military unit.

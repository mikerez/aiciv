# City Economy Rules

City economy is implemented by `city.js`.

## City State

- `CITY-STATE-001`: Each city has an economy state with citizens, worked tile coordinates, stored food, stored money, last income, and turns to the next citizen.
- `CITY-STATE-002`: A new city starts with one citizen assigned to the best available nearby land or water Tile and one food in storage. This founding reserve prevents the City from starving during the same turn in which the Settler is consumed.
- `CITY-STATE-003`: When food storage reaches `80 + population * 40`, a server game sends `grow_city`; PHP checks the threshold and available worked-Tile capacity, adds one citizen, and subtracts the growth cost. Offline games apply the same threshold locally.
- `CITY-STATE-004`: Server population is limited to the number of eligible worked Tiles. Existing excess population is corrected during authoritative turn processing.
- `CITY-STATE-004A`: Each citizen consumes one food per turn.
- `CITY-STATE-005`: If stored food becomes negative, starvation removes one citizen and resets food storage to zero.
- `CITY-STATE-006`: If a City with one citizen starves, it becomes an inert `destroyed_city` building. A new City or any terrain improvement may replace that ruin on the same Tile.
- `CITY-STATE-007`: A City may optimize worked-Tile allocation for food, production, gold, or all yields using balanced scoring. The selected mode persists on the authoritative City and deterministically reassigns all citizen Tiles using the same scoring in JS and PHP.
- `CITY-STATE-008`: When a Worker or WorkBoat completes a terrain enhancement, every owned City whose 9x9 workable area can contain that Tile immediately re-optimizes its citizen plots while preserving its selected optimization mode.

## Tile Income

- `CITY-INCOME-001`: Terrain type maps to base food, production, and money income.
- `CITY-INCOME-002`: Resource type increments terrain income when a worked tile contains a resource.
- `CITY-INCOME-003`: Improvements multiply combined terrain and resource yield using the mirrored tables in `economics.js` and `server_game.php`; multiplier results round upward to whole points.
- `CITY-INCOME-004`: Resource income is added before improvement multipliers, so the correct resource improvement enhances the resource and terrain together.
- `CITY-INCOME-004A`: An unimproved resource adds at most one gold, except Gold, Gems, and Diamonds, which add two. A matching Winery or Plantation sets that resource contribution to two gold.
- `CITY-INCOME-005`: Cottage gives a 2x money multiplier with at least 2 gold. From age 1000, Hamlet gives +1 food and a 3x multiplier with at least 3 gold. After 5000 additional Hamlet turns, at total age 6000, Village gives +2 food and a 4x multiplier with at least 4 gold. PHP owns age and returns modifier changes to clients.
- `CITY-INCOME-011`: A City may work its own Tile and adjacent bare Tiles without a road. A land Tile carrying an improvement contributes when its exact Tile has a road connected continuously to the City. Nets remain the roadless water exception.
- `CITY-INCOME-011A`: An improved land Tile may also be the final endpoint beside a continuously connected road Tile. This endpoint cannot extend the road network and does not count as an exactly road-connected strategic resource for unit production.
- `CITY-INCOME-012`: The City menu labels `F` as gross food gathered from worked Tiles and shows citizen and Workshop consumption separately as `Eat`.
- `CITY-INCOME-006`: City-tile irrigation gives food only after worker-built neighboring irrigation activates the city irrigation food flag.
- `CITY-INCOME-007`: A land tile with the terrain `A` bit set contains a local water source. Sand with this bit is a lake and gives 2 food, or 4 with irrigation. Other land gains 1 food; hills or rocks also gain 1 production.
- `CITY-INCOME-008`: Sand gives no food or gold. Irrigated sand gives 1 food unless it is a lake.
- `CITY-INCOME-009`: A Workshop sets its worked Tile output to exactly 4 production. Each Workshop consumes 2 food and no gold from its nearest same-owner parent City only while that City has a production queue and positive net production per turn. A stalled `P=0` queue consumes no Workshop food.
- `CITY-INCOME-010`: A City works only Tiles whose coordinates are within `+/-4` of the City on both map axes, forming a maximum `9x9` working rectangle. Inside it, land Tiles connect by road and water Tiles within three hex steps remain eligible when they have Nets.
- `CITY-INCOME-011`: Shallow water gives 1 food. Fish or Turtles add 2 food, raising their unimproved shallow-water total to 3 food.
- `CITY-INCOME-012`: A WorkBoat may build Nets on shallow water. Nets raise ordinary shallow water to 2 food and raise Fish or Turtles to exactly 5 food and 2 gold.
- `CITY-INCOME-013`: Every living City center yields at least one production. A City center yields at least one gold except on river terrain, where its gold yield is zero.
- `CITY-INCOME-014`: A Farm sets its worked Tile to exactly 5 food and 0 gold.

## Turn Processing

- `CITY-TURN-001`: PHP authoritatively collects city food and gold each resolved turn from deterministically selected worked Tiles.
- `CITY-TURN-002`: PHP adds exactly one turn of City production to the active backlog item and caps stored progress at that item's cost, so no hidden production surplus carries into later items.
- `CITY-TURN-003`: Growth turns are calculated from remaining food cost divided by current food income.
- `CITY-TURN-004`: Positive food excess after citizens eat enters civilization food storage; gross city money enters civilization gold storage.
- `CITY-TURN-005`: Food stored each turn uses net food after citizen consumption.
- `CITY-TURN-006`: A city may intentionally produce nothing. This state is stored separately from an unassigned production task so the end-turn idle-city selector does not keep reopening the city.
- `CITY-TURN-007`: If the civilization money account is negative, cities cannot start or progress unit production until the account is non-negative again.
- `CITY-TURN-008`: Each road assigned to a parent City consumes 1 of that City's production per turn. Net City production cannot become negative.
- `CITY-TURN-008A`: The mandatory road on the City center has no production upkeep. Only roads extending beyond the City center consume production.
- `CITY-TURN-008B`: Each Nets improvement assigned to a parent City consumes one production from that City per turn.
- `CITY-TURN-008C`: Each Fortification assigned to its nearest owned parent City consumes two production from that City per turn. Each non-center Road continues to consume one production.
- `CITY-TURN-009`: PHP applies negative net City food authoritatively: one population is removed and food storage resets to zero. The starvation event is shown in the top-left turn-message line.
- `CITY-TURN-010`: A worked Tile occupied by a living movable civilization at war with the City owner contributes no food, production, or gold.
- `CITY-TURN-010A`: If occupancy synchronization excludes every normal worked-Tile candidate while the City center still exists, the City center is retained as one fallback worked Tile. A valid newly founded City therefore cannot receive an empty economy and collapse solely because its candidate list was transiently empty.
- `CITY-TURN-011`: For Cities below population five, positive food and gold transferred to civilization storage lose `0.9 * distance / 100`, capped at 90%. Distance is measured from the first City built after the latest respawn; local growth and production use full yield.
- `CITY-TURN-012`: A City above population 10 loses 5% of its positive food excess and stored gold per additional citizen, capped at 50% from population 20. This loss compounds with the small distant-City storage loss.

## City Buildings

- `CITY-BUILDING-001`: A City may add Lazaret, Stable, Shooting-range, Barracks, Port, and Market to its production backlog. A completed City building is a nonmovable unit linked to its parent City and cannot be built there twice.
- `CITY-BUILDING-002`: Lazaret adds 10 percentage points to the normal 10% per-turn healing of movable units inside its City, for 20% maximum-health healing per turn.
- `CITY-BUILDING-003`: Stable gives newly produced Horseman, Chariot, Knight, and Elephant units 1.1 starting experience. Shooting-range gives the same starting experience to Slinger, Archer, and Longbow units.
- `CITY-BUILDING-004`: Barracks gives newly produced Warrior, Spearman, Pikeman, Fencer, and Swordsman units 1.1 starting experience. Port gives the same starting experience to newly produced water units.
- `CITY-BUILDING-005`: A Market transfers exactly one food per turn from civilization food storage to its City when a continuous road connects that City to another owned City. It creates no food and transfers nothing when global storage is empty.

## Civilization Storage

- `CITY-MONEY-001`: `GameState.money` is the civilization money account.
- `CITY-MONEY-002`: Every movable civilian consumes at least 1 food. Military food upkeep is doubled again: ordinary military units consume 4, Horseman, Chariot, Catapult, Galley, and Galleon consume 8, and Knight, Pikeman, Swordsman, Trebuchet, Frigate, and Elephant consume 12.
- `CITY-MONEY-002A`: Pikeman, Swordsman, and Longbow consume 6 gold; Knight, Trebuchet, and Frigate consume 12 gold.
- `CITY-MONEY-003`: Technology funding is a separate expense equal to `scienceRate` percent of gross city money income. Account delta is gross city money minus upkeep minus technology expense.
- `CITY-MONEY-003A`: The technology expense is converted into science points for the current research target.
- `CITY-MONEY-004`: Large food and gold counters flank End Turn and display the latest authoritative server balances.
- `CITY-MONEY-005`: When storage cannot pay upkeep, PHP disbands movable units until both balances cover the remaining army and sends each disband event to the client message and console views.
- `CITY-MONEY-006`: Workshops do not consume gold; their parent City receives the worked Tile's full gold income.
- `CITY-MONEY-007`: Civilization balances and their gross-income, upkeep, technology-expense, and net-income summaries are server-authoritative and cannot be overwritten by stale client turn submissions.
- `CITY-MONEY-008`: In authenticated multiplayer, JS never increments food storage or the gold treasury. It queues growth from the last server-reported City food value and displays civilization balances only after a server state response.
- `CITY-MENU-001`: A City selected when End Turn begins remains selected with its production menu visible after the turn update. Production and backlog state do not insert a blank status row.
- `CITY-MENU-002`: Every City production choice shows its sprite, production cost, attack, defence, speed, and authoritative per-turn food and gold upkeep.
- `CITY-MENU-003`: Unbuilt City buildings appear among production choices with their pulled image assets. Completed buildings are removed from production choices and shown only in the completed-buildings list at the bottom of the City Actions window.

## Drawing

- `CITY-DRAW-001`: Worked citizen tiles draw food, production, and money columns over the tile.
- `CITY-DRAW-002`: Food is drawn in the left column, production in the middle column, and money in the right column.
- `CITY-DRAW-003`: Single-value icons count as one; large icons count as five.

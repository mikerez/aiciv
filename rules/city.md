# City Economy Rules

City economy is implemented by `city.js`.

## City State

- `CITY-STATE-001`: Each city has an economy state with citizens, worked tile coordinates, stored food, stored money, last income, and turns to the next citizen.
- `CITY-STATE-002`: A new city starts with one citizen assigned to the best available nearby land or water Tile.
- `CITY-STATE-003`: When food storage reaches `20 + population * 10`, a server game sends `grow_city`; PHP checks the threshold and available worked-Tile capacity, adds one citizen, and resets food storage. Offline games apply the same threshold locally.
- `CITY-STATE-004`: Server population is limited to the number of eligible worked Tiles. Existing excess population is corrected during authoritative turn processing.
- `CITY-STATE-004A`: Each citizen consumes one food per turn.
- `CITY-STATE-005`: If stored food becomes negative, starvation removes one citizen and resets food storage to zero.
- `CITY-STATE-006`: If a City with one citizen starves, it becomes an inert `destroyed_city` building. A new City or any terrain improvement may replace that ruin on the same Tile.
- `CITY-STATE-007`: A City may optimize worked-Tile allocation for food, production, or gold. The selected mode persists on the authoritative City and deterministically reassigns all citizen Tiles using the same scoring in JS and PHP.

## Tile Income

- `CITY-INCOME-001`: Terrain type maps to base food, production, and money income.
- `CITY-INCOME-002`: Resource type increments terrain income when a worked tile contains a resource.
- `CITY-INCOME-003`: Improvements multiply combined terrain and resource yield using the mirrored tables in `economics.js` and `server_game.php`; multiplier results round upward to whole points.
- `CITY-INCOME-004`: Resource income is added before improvement multipliers, so the correct resource improvement enhances the resource and terrain together.
- `CITY-INCOME-004A`: An unimproved resource adds at most one gold, except Gold, Gems, and Diamonds, which add two. A matching Winery or Plantation sets that resource contribution to two gold.
- `CITY-INCOME-005`: Cottage gives a 2x money multiplier before 100 turns, Hamlet gives 3x from turn 100, and Village gives 4x from turn 200. PHP owns age and returns modifier changes to clients.
- `CITY-INCOME-011`: A City may work its own Tile and every adjacent Tile without a road. More distant land contributes only through a continuous road; nearby water can therefore feed a City without road infrastructure.
- `CITY-INCOME-012`: The City menu labels `F` as gross food gathered from worked Tiles and shows citizen and Workshop consumption separately as `Eat`.
- `CITY-INCOME-006`: City-tile irrigation gives food only after worker-built neighboring irrigation activates the city irrigation food flag.
- `CITY-INCOME-007`: A land tile with the terrain `A` bit set contains a local water source. Sand with this bit is a lake and gives 2 food, or 4 with irrigation. Other land gains 1 food; hills or rocks/mountains also gain 1 production.
- `CITY-INCOME-008`: Sand gives no food or gold. Irrigated sand gives 1 food unless it is a lake.
- `CITY-INCOME-009`: A Workshop sets its worked Tile output to exactly 4 production. Each Workshop consumes 1 food and 1 gold from its nearest same-owner parent City per turn.
- `CITY-INCOME-010`: A City works its own Tile and land Tiles connected to it by a contiguous road. A water Tile within three hex steps is also eligible when it has Nets.
- `CITY-INCOME-011`: Shallow water gives 1 food. Fish or Turtles add 2 food, raising their unimproved shallow-water total to 3 food.
- `CITY-INCOME-012`: A WorkBoat may build Nets on shallow water. Nets raise ordinary shallow water to 2 food and raise Fish or Turtles to exactly 5 food and 2 gold.

## Turn Processing

- `CITY-TURN-001`: PHP authoritatively collects city food and gold each resolved turn from deterministically selected worked Tiles.
- `CITY-TURN-002`: PHP adds exactly one turn of City production to the active backlog item and caps stored progress at that item's cost, so no hidden production surplus carries into later items.
- `CITY-TURN-003`: Growth turns are calculated from remaining food cost divided by current food income.
- `CITY-TURN-004`: Positive food excess after citizens eat enters civilization food storage; gross city money enters civilization gold storage.
- `CITY-TURN-005`: Food stored each turn uses net food after citizen consumption.
- `CITY-TURN-006`: A city may intentionally produce nothing. This state is stored separately from an unassigned production task so the end-turn idle-city selector does not keep reopening the city.
- `CITY-TURN-007`: If the civilization money account is negative, cities cannot start or progress unit production until the account is non-negative again.
- `CITY-TURN-008`: Each road assigned to a parent City consumes 1 of that City's production per turn. Net City production cannot become negative.
- `CITY-TURN-009`: PHP applies negative net City food authoritatively: one population is removed and food storage resets to zero. The starvation event is shown in the top-left turn-message line.

## Civilization Storage

- `CITY-MONEY-001`: `GameState.money` is the civilization money account.
- `CITY-MONEY-002`: Every movable unit consumes at least 1 food. Horseman, Chariot, Catapult, Galley, and Galleon consume 2; Knight, Pikeman, Swordsman, Trebuchet, Frigate, and Elephant consume 3.
- `CITY-MONEY-002A`: Pikeman, Swordsman, and Longbow consume 1 gold; Knight, Trebuchet, and Frigate consume 2 gold.
- `CITY-MONEY-003`: Technology funding is a separate expense equal to `scienceRate` percent of gross city money income. Account delta is gross city money minus upkeep minus technology expense.
- `CITY-MONEY-003A`: The technology expense is converted into science points for the current research target.
- `CITY-MONEY-004`: Large food and gold counters flank End Turn and display the latest authoritative server balances.
- `CITY-MONEY-005`: When storage cannot pay upkeep, PHP disbands movable units until both balances cover the remaining army and sends each disband event to the client message and console views.
- `CITY-MONEY-006`: Every Workshop costs its parent City one gold per turn; this signed City income is included in the civilization treasury calculation.
- `CITY-MONEY-007`: Civilization balances and their gross-income, upkeep, technology-expense, and net-income summaries are server-authoritative and cannot be overwritten by stale client turn submissions.
- `CITY-MONEY-008`: In authenticated multiplayer, JS never increments food storage or the gold treasury. It queues growth from the last server-reported City food value and displays civilization balances only after a server state response.

## Drawing

- `CITY-DRAW-001`: Worked citizen tiles draw food, production, and money columns over the tile.
- `CITY-DRAW-002`: Food is drawn in the left column, production in the middle column, and money in the right column.
- `CITY-DRAW-003`: Single-value icons count as one; large icons count as five.

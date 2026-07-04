# City Economy Rules

City economy is implemented by `city.js`.

## City State

- `CITY-STATE-001`: Each city has an economy state with citizens, worked tile coordinates, stored food, stored money, last income, and turns to the next citizen.
- `CITY-STATE-002`: A new city starts with one citizen assigned to the best available nearby land tile.
- `CITY-STATE-003`: When food storage reaches the current growth cost, a new citizen is created and assigned to the best available nearby land tile.
- `CITY-STATE-004`: Each citizen consumes one food per turn.
- `CITY-STATE-005`: If stored food becomes negative, starvation removes one citizen and resets food storage to zero.
- `CITY-STATE-006`: If a city with one citizen starves, the city collapses back into one Settler on the city tile.

## Tile Income

- `CITY-INCOME-001`: Terrain type maps to base food, production, and money income.
- `CITY-INCOME-002`: Resource type increments terrain income when a worked tile contains a resource.
- `CITY-INCOME-003`: Irrigation, pasture, farm, camp, fishing boats, and winery add food to a worked tile; road, cottage, plantation, fishing boats, and winery add money; camp, workshop, quarry, and mine add production.
- `CITY-INCOME-004`: Resource income is cumulative with terrain modifiers; any opened food resource on an irrigated worked tile adds its food on top of irrigation.
- `CITY-INCOME-005`: Cottage gives 2 money before 10 turns, Hamlet gives 3 money from 10 turns, and Village gives 4 money from 20 turns.
- `CITY-INCOME-006`: City-tile irrigation gives food only after worker-built neighboring irrigation activates the city irrigation food flag.
- `CITY-INCOME-007`: A land tile with the terrain `A` bit set contains a local water source; it adds 1 food and 1 money, and if the terrain is hills or rocks/mountains it also adds 1 production.

## Turn Processing

- `CITY-TURN-001`: City food and money income are collected each turn.
- `CITY-TURN-002`: City production income updates the city production-per-turn value used by unit production.
- `CITY-TURN-003`: Growth turns are calculated from remaining food cost divided by current food income.
- `CITY-TURN-004`: City money income is reported to `GameState` so the science slider can dedicate part of it to technology discovery.
- `CITY-TURN-005`: Food stored each turn uses net food after citizen consumption.

## Drawing

- `CITY-DRAW-001`: Worked citizen tiles draw food, production, and money columns over the tile.
- `CITY-DRAW-002`: Food is drawn in the left column, production in the middle column, and money in the right column.
- `CITY-DRAW-003`: Single-value icons count as one; large icons count as five.

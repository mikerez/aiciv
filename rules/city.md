# City Economy Rules

City economy is implemented by `city.js`.

## City State

- `CITY-STATE-001`: Each city has an economy state with citizens, worked tile coordinates, stored food, stored money, last income, and turns to the next citizen.
- `CITY-STATE-002`: A new city starts with one citizen assigned to the best available nearby land tile.
- `CITY-STATE-003`: When food storage reaches the current growth cost, a new citizen is created and assigned to the best available nearby land tile.

## Tile Income

- `CITY-INCOME-001`: Terrain type maps to base food, production, and money income.
- `CITY-INCOME-002`: Resource type increments terrain income when a worked tile contains a resource.
- `CITY-INCOME-003`: Irrigation and pasture add food to a worked tile, road and cottage add money, and workshop and mine add production.

## Turn Processing

- `CITY-TURN-001`: City food and money income are collected each turn.
- `CITY-TURN-002`: City production income updates the city production-per-turn value used by unit production.
- `CITY-TURN-003`: Growth turns are calculated from remaining food cost divided by current food income.
- `CITY-TURN-004`: City money income is reported to `GameState` so the science slider can dedicate part of it to technology discovery.

## Drawing

- `CITY-DRAW-001`: Worked citizen tiles draw food, production, and money columns over the tile.
- `CITY-DRAW-002`: Food is drawn in the left column, production in the middle column, and money in the right column.
- `CITY-DRAW-003`: Single-value icons count as one; large icons count as five.

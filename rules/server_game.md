# Server Game Rules

## Authority And Schema

`SERVER-GAME-001`: The browser keeps speculative local map and unit arrays for immediate rendering. `server_game.php` stores the authoritative shared map, units, fog, turn orders, and collision results. A server update overrides conflicting local state.

`SERVER-GAME-002`: Every gameplay request contains the development `secret`, `game_id`, `player_id`, and one action: `make_turn`, `update_units`, `update_landscape`, `build`, `build_city`, or `select_production`. A registered player also supplies the current account session by JSON `access_token`, Bearer authorization, or game cookie, plus the logged-in human `user_id`. Development diagnostics additionally provide `map_diagnostics` and `regenerate_map`.

`SERVER-GAME-002C`: `user_id` must equal the authenticated human session. `player_id` is the acting account and must identify either that human or an AI whose `parent_id` is that human. This permits one client to submit two independent player turns without permitting it to control unrelated players.

`SERVER-GAME-002D`: User rows are typed `human` or `ai` and store online state. Login marks users idle for 60 seconds offline, keeps an existing AI child when possible, otherwise adopts an AI whose parent is offline, and creates an AI only when none can be adopted. AI ownership changes do not move or recreate its units.

`SERVER-GAME-002A`: An account has one active physical device. Sessions carry a stable device key. Repeated login from the same device does not revoke its earlier token, preventing in-flight phone/WebView requests from kicking themselves. A successful login from another device revokes every session under older device keys; those devices receive `session_replaced` on their next poll or command.

`SERVER-GAME-002B`: Device sessions do not own game state. The permanent account id owns the player row and all authoritative units, cities, improvement buildings, production, visibility, and player properties, so changing devices preserves object ids, coordinates, and state.

`SERVER-GAME-003`: Every endpoint load checks the `version` table and applies missing numbered migrations. Future schema changes use later versions and `ALTER TABLE`; deployed tables are not recreated destructively.

Schema version 1 creates `server_games`, `server_game_players`, `server_game_map`, `server_game_units`, `server_game_orders`, `server_game_submissions`, `server_game_visibility`, and `server_game_events`. Queryable movement and combat properties use columns. Complete extra unit and player properties remain in JSON so adding a client property does not immediately require a migration.

Schema version 2 links a game player to its registered `game_users` account with `account_user_id`.

Schema version 3 adds a nullable tile occupancy key to units. Building and improvement rows use a unique `(game_id, occupancy_key)` value so concurrent builders cannot both claim one tile.

Schema version 4 creates `productions`, keyed by game and City unit. It stores the selected unit type, accumulated production points, required cost, owner, and selection time.

Schema version 5 backfills every authenticated registered player to at least three living Explorers. Test/bootstrap games without registered accounts are excluded.

Schema version 7 adds human/AI type, online timestamp, and AI parent ownership columns and an AI-parent lookup index to `game_users`.

The authoritative map table is `server_game_map`, keyed by `(game_id, i, j)`. It stores the JS tile values `terrain_tex`, `terrain_bits`, `resource_type`, terrain modifiers as `modifiers_json`, and the incremental `revision`.

The authoritative unit table is `server_game_units`. It stores owner, type, class, sprite texture, movement nature, coordinates, attack, defense, speed, view range, state, health, experience, movement penalty, deletion state, revision, and every remaining JS unit property in `properties_json`.

`SERVER-GAME-004`: PHP generates terrain and resources only when the selected game's `server_game_map` row count is zero. The generator ports the current JS `genMap`, `fixMap`, `enhMap`, and resource-placement sequence without imposing an additional geometric coastline. It uses a fresh random seed and retries toward 78% land in the playable rhombus with at least 75% of land connected to the largest continent. Production clients never upload a generated map. An explicit bootstrap map remains accepted only for deterministic server integration fixtures.

`SERVER-GAME-007`: Every server-game request and response is written as one structured JSON line in `.server_game_requests.log`, with rotation to `.server_game_requests.log.1`. Secrets and credentials are redacted. Turn requests additionally record order lookup, path validation, resolution timing, collision calculations, and authoritative unit coordinates before and after resolution.

`SERVER-GAME-005`: Registration provisions the account's player row, initial state with 500 money, one Settler, and three Explorers. All four units start on the same valid grass or freshwater land tile. New players are placed within Explorer view of the first player. Schema migration 5 brings existing registered players to the same minimum of three living Explorers; normal repeated login does not recreate later losses. A player without surviving units is inactive for synchronous turn completion.

`SERVER-GAME-006`: The browser initializes empty terrain arrays, loads its visible landscape and unit state from PHP, and treats server values as authoritative. The authenticated player id comes from the `aiciv_player_id` cookie written by the login page.

## Synchronous Turns

`SERVER-TURN-001`: The official playable turn lasts 5 seconds from authoritative `turn_started_at`. Players submit independently and do not wait before entering local orders. PHP adds a 1-second network/completion grace period and resolves missing submissions after 6 seconds total.

`SERVER-TURN-002`: A turn resolves immediately when all active known players submit `make_turn`, including empty command lists.

`SERVER-TURN-003`: If at least one player submitted and the deadline passed, the first arriving request resolves the turn. This may be a `make_turn`, `update_units`, or `update_landscape` request. Every player still missing receives an implicit hold. Polling does not advance a turn when nobody submitted.

`SERVER-TURN-004`: Resolution increments the turn and global revision, then stores the next turn start and deadline.

`SERVER-TURN-005`: After a client submits End Turn, that player enters an awaiting-resolution state. The counter inside the End Turn button recharges to 5 seconds and counts down while polling, but it cannot trigger another local turn or a second `make_turn` for the same server turn. PHP retains its separate sixth grace second. The End Turn button remains disabled until `update_units` reports a higher authoritative turn number.

`SERVER-TURN-006`: The first accepted `make_turn` submission for a player and turn is final. Duplicate submissions are acknowledged but cannot delete or replace stored orders or player state. A duplicate arriving after the deadline may trigger resolution using the first stored orders.

`SERVER-TURN-008`: An authenticated browser never advances unit coordinates speculatively before `make_turn` is accepted. PHP coordinates are authoritative, preventing a stale or background-throttled client from visibly moving and then snapping back after `turn_advanced`. After each authoritative update, the client redraws every owned unit's remaining route arrows.

`SERVER-TURN-009`: The waiting countdown owns the client timer only until a higher authoritative turn arrives. Resolution must stop that countdown and release the timer before starting a fresh 5-second playable-turn countdown. Waiting UI shows only its countdown and does not expose the server turn number.

`SERVER-TURN-007`: An authenticated client performs two independent submissions for its visible human and hidden AI child. The AI is loaded through its own fog-filtered snapshot, inferred in a background worker during the human turn, and submitted under its own `player_id`. The client restores the human map, fog, units, selection, and camera before yielding control; AI movement is never centered or rendered locally. End Turn waits if background inference is unfinished. If the authoritative turn advances during inference, that stale AI result is discarded rather than submitted into the next turn.

## Orders

`SERVER-ORDER-001`: Commands are `move`, `hold`, `wait`, `fortify`, `set_state`, `build`, and `produce`. Unknown commands become holds. A player can order only living units it owns.

`SERVER-ORDER-002`: A movement path contains adjacent map coordinates. The server truncates it to unit speed, rejects invalid or off-map steps, and restricts land units to land and water units to water.

`SERVER-ORDER-003`: Server movement, collision, fog, ownership, health, and coordinates have priority over client calculations. Other properties are preserved in `properties_json`.

`SERVER-ORDER-004`: Completed Worker buildings and terrain improvements use the immediate `build` request with `worker_unit_id` and `building_type`. The server locks the tile, validates the Worker and terrain, creates the nonmoving building in `server_game_units`, and updates the tile modifier in one transaction. Only the first request can occupy a tile; later requests receive `tile_already_built`.

`SERVER-ORDER-005`: Drawing or assigning a client route copies it into a pending server-order buffer. Incremental server polling cannot erase this unsent route. Turn capture consumes that buffer into a `move` command, and the authoritative server stores any route steps remaining after the unit's current-turn speed allowance.

`SERVER-ORDER-006`: If a speculative or stale client submits a route whose first point is no longer adjacent to the authoritative unit coordinate, the server computes a legal route from its stored coordinate to the submitted destination. It applies only the unit's allowed steps and saves the remainder. A stale client path is not treated as permission to jump, and it is not rejected as an apparent rollback when the destination remains reachable.

`SERVER-ORDER-007`: `build_city` is immediate and atomic. It validates an owned living Settler on land, creates one City with road and irrigation on that tile, and marks the Settler deleted in the same server revision. A tile cannot contain two living cities.

`SERVER-ORDER-008`: `select_production` immediately replaces or clears the selected production for an owned City. The server validates the unit type, required technology, budget, and seaside requirement before writing `productions`.

`SERVER-ORDER-009`: Every resolved turn adds the City's authoritative `productionPerTurn` to its `productions` row. Reaching the unit cost creates the unit in `server_game_units`, stores overflow in the City, clears the production row, and emits a `production_finished` event.

## Half-Turn And Collision

`SERVER-HALF-TURN-001`: A unit reaches its turn destination early when `executed_path_steps * 2 <= speed`. A speed-2 unit reaches an adjacent tile at half-turn; a speed-1 unit does not.

`SERVER-HALF-TURN-002`: An early unit targeting an enemy starting tile arrives before that enemy can leave. The enemy route is canceled and interaction is resolved there. Neither participant is restored to its turn-start coordinate.

`SERVER-HALF-TURN-003`: A late unit targeting an enemy starting tile interacts only if the enemy remains after its valid movement. Otherwise the late unit may enter the vacated tile.

`SERVER-HALF-TURN-004`: If an early route controls a tile crossed later by an enemy route, the later unit is intercepted. Both units remain at the intersection point and both players receive an event; interception never rolls either unit back to its starting tile.

`SERVER-HALF-TURN-005`: Remaining hostile occupancy and equal-time uncertainty are resolved deterministically by submitted order and server unit id. Friendly units may share a tile.

`SERVER-HALF-TURN-006`: One unordered pair of units can resolve combat at most once per turn. A pair handled during half-turn arrival or interception is excluded from the final occupancy combat pass.

## Fog Of War

`SERVER-FOG-001`: Visibility is separate per player. Resolution changes old visible tiles to remembered tiles, then opens full visibility through each unit's stored `view_range`; one additional outer ring is terrain memory without enemy-unit visibility.

`SERVER-FOG-002`: Own changed units are always returned. Enemy units are returned only on fully visible tiles. Newly visible enemies are returned even if they did not move.

`SERVER-FOG-002A`: `update_units` returns the complete list of currently visible enemy ids. The client removes cached enemy objects absent from this list and recreates them from a later update when they become visible again.

`SERVER-FOG-003`: Resources are hidden independently. An Explorer or water-nature unit reveals a resource only on its current tile.

## Incremental Updates

`SERVER-LOAD-001`: Authenticated page startup uses `load_full`. It returns one authoritative snapshot containing every map tile, the player's complete living unit list, currently fully visible foreign units, fog/resource visibility, player state, civilization statistics, and `last_event_id`.

`SERVER-LOAD-002`: `load_full` does not expose foreign units outside full visibility. The returned event cursor points after existing history, so reloading a page never replays old combat.

`SERVER-UPDATE-001`: `update_units` takes `since_revision` and returns touched owned units, touched or newly visible enemies, fog changes, visible enemy ids, and events addressed to that player.

`SERVER-UPDATE-001A`: `update_units` always returns `owned_unit_ids`, the complete set of the player's living authoritative units. The browser removes local speculative objects not present in this set.

`SERVER-UPDATE-002`: `update_landscape` takes `since_revision`. Initial map synchronization and map regeneration return every base terrain tile so unknown terrain is not mistaken for default water. Incremental calls return changed terrain and changed visibility. Fog remains separate: unseen tiles have zero visibility, hidden resource ids are zero, and unseen improvements are omitted.

`SERVER-UPDATE-003`: After local turn animation, the browser submits captured pre-animation orders, requests both update actions, maps server ids to local objects, applies server coordinates and properties, updates per-player fog, rebuilds sprites, and displays events.

`SERVER-EVENT-001`: `update_events` takes `since_event_id` and returns addressed events in id order plus the next cursor and current civilization statistics.

`SERVER-EVENT-002`: Combat is addressed to both participants and every player with full visibility of the combat tile. Its payload contains attacker and defender ids, before/after snapshots, damage, combat kind (`unit_attack` or `city_attack`), and destroyed unit ids.

`SERVER-EVENT-003`: The browser requests and animates combat events before requesting and applying `update_units`, so a defeated unit remains available for slow-motion highlighting until the event finishes.

## Civilizations

`SERVER-CIV-001`: Every player row has a stable named civilization and coat-of-arms colors assigned on first creation.

`SERVER-CIV-002`: Civilization statistics store units killed, cities occupied, and cities destroyed. Authoritative combat updates kill and destroyed-city counts in the same transaction as health and deletion.

## Request Example

```json
{
  "action": "make_turn",
  "secret": "development secret",
  "game_id": "aiciv-default",
  "user_id": 7,
  "player_id": 7,
  "turn": 4,
  "commands": [
    {
      "unit_id": 12,
      "command": "move",
      "path": [{"i": 40, "j": 21}, {"i": 41, "j": 21}],
      "payload": {}
    }
  ]
}
```

Use `load_full` with the common fields for page startup. Use `update_units` or `update_landscape` with `since_revision`, and `update_events` with `since_event_id`, for incremental reads.

Immediate build example:

```json
{
  "action": "build",
  "secret": "development secret",
  "game_id": "aiciv-default",
  "player_id": 7,
  "worker_unit_id": 81,
  "building_type": "cottage"
}
```

City and production examples:

```json
{"action":"build_city","secret":"development secret","game_id":"aiciv-default","player_id":7,"settler_unit_id":77}
{"action":"select_production","secret":"development secret","game_id":"aiciv-default","player_id":7,"city_unit_id":231,"unit_type_id":"worker"}
```

Send `unit_type_id: null` to stop City production.

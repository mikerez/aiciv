# Server Game Rules

## Authority And Schema

`SERVER-GAME-001`: The browser keeps speculative local map and unit arrays for immediate rendering. `server_game.php` stores the authoritative shared map, units, fog, turn orders, and collision results. A server update overrides conflicting local state.

`SERVER-GAME-002`: Every gameplay request contains the development `secret`, `game_id`, `player_id`, and a supported action such as `make_turn`, update requests, `build`, `build_city`, `grow_city`, `heal_units`, `disband_unit`, or `select_production`. A registered player also supplies the current account session by JSON `access_token`, Bearer authorization, or game cookie, plus the logged-in human `user_id`. Development administration additionally provides `map_diagnostics`, `regenerate_map`, and confirmed `reset_game`.

`SERVER-GAME-002C`: `user_id` must equal the authenticated human session. `player_id` is the acting account and must identify either that human or an AI whose `parent_id` is that human. This permits one client to submit two independent player turns without permitting it to control unrelated players.

`SERVER-GAME-002D`: User rows are typed `human` or `ai` and store online state. Login marks users idle for 60 seconds offline, keeps an existing AI child when possible, otherwise adopts an AI whose parent is offline, and creates an AI only when none can be adopted. AI ownership changes do not move or recreate its units.

`SERVER-GAME-002A`: An account has one active physical device. Sessions carry a stable device key. Repeated login from the same device does not revoke its earlier token, preventing in-flight phone/WebView requests from kicking themselves. A successful login from another device revokes every session under older device keys; those devices receive `session_replaced` on their next poll or command.

`SERVER-GAME-002B`: Device sessions do not own game state. The permanent account id owns the player row and all authoritative units, cities, improvement buildings, production, visibility, and player properties, so changing devices preserves object ids, coordinates, and state.

`SERVER-GAME-003`: Every endpoint load checks the `version` table and applies missing numbered migrations. Future schema changes use later versions and `ALTER TABLE`; deployed tables are not recreated destructively.

Schema version 1 creates `server_games`, `server_game_players`, `server_game_map`, `server_game_units`, `server_game_orders`, `server_game_submissions`, `server_game_visibility`, and `server_game_events`. Queryable movement and combat properties use columns. Complete extra unit and player properties remain in JSON so adding a client property does not immediately require a migration.

Schema version 2 links a game player to its registered `game_users` account with `account_user_id`.

Schema version 3 adds a nullable tile occupancy key to units. Building and improvement rows use a unique `(game_id, occupancy_key)` value so concurrent builders cannot both claim one tile.

Schema version 4 creates `productions`, keyed by game and City unit. Schema version 11 adds `queue_json`, an ordered unit-type backlog whose first item owns the accumulated production points and required cost.

Schema version 5 backfills every authenticated registered player to at least three living Explorers. Test/bootstrap games without registered accounts are excluded.

Schema version 7 adds human/AI type, online timestamp, and AI parent ownership columns and an AI-parent lookup index to `game_users`.

Schema version 9 adds the player `eliminated` flag. It prevents defeated players from being reprovisioned without retaining deleted unit rows as permanent history.

Schema version 10 creates `server_game_relations`. Civilization pairs have an authoritative symmetric `neutral` or `war` state and default to neutral when no row exists.

The authoritative map table is `server_game_map`, keyed by `(game_id, i, j)`. It stores the JS tile values `terrain_tex`, `terrain_bits`, `resource_type`, terrain modifiers as `modifiers_json`, and the incremental `revision`.

The authoritative unit table is `server_game_units`. It stores owner, type, class, sprite texture, movement nature, coordinates, attack, defense, speed, view range, state, health, experience, movement penalty, deletion state, revision, and every remaining JS unit property in `properties_json`.

`SERVER-GAME-004`: PHP generates terrain and resources only when the selected game's `server_game_map` row count is zero. The generator ports the current JS `genMap`, `fixMap`, `enhMap`, and resource-placement sequence without imposing an additional geometric coastline. It uses a fresh random seed and retries toward 78% land in the playable rhombus with at least 75% of land connected to the largest continent. Production clients never upload a generated map. An explicit bootstrap map remains accepted only for deterministic server integration fixtures.

`SERVER-GAME-004A`: Schema migration 8 adds Gems to existing worlds only on empty eligible hill or rock tiles. It updates the affected map rows and game revision without regenerating the map.

`SERVER-GAME-007`: Every server-game request and response is written as one structured JSON line in `.server_game_requests.log`, with rotation to `.server_game_requests.log.1`. Secrets and credentials are redacted. Turn requests additionally record order lookup, path validation, resolution timing, collision calculations, and authoritative unit coordinates before and after resolution.

`SERVER-GAME-008`: Database tables hold current game state, not unbounded history. Resolved orders and submissions are deleted, delivered events are deleted, undelivered events are bounded to recent turns, and defeated unit tombstones are removed after their final event snapshot is saved. Expired and old revoked login sessions are also deleted. Diagnostic file logs rotate at a fixed size.

`SERVER-GAME-009`: `reset_game` requires the application secret and the exact confirmation `RESET`. It clears map, units, visibility, productions, orders, submissions, and events; resets turn/player state; regenerates terrain; and reprovisions registered players.

`SERVER-GAME-010`: Before displaying a client error popup, JS sends `report_cli_error` with the failed source request, sanitized parameters, error message and stack, player/unit ids, unsuccessful action, and destination. PHP writes each report as a separate sequential JSON file `reports/NNNNNNNN.rtp`. Report submission uses the application secret, does not require database access, and cannot recursively report its own failure.

`SERVER-GAME-011`: Every PHP game request uses a monotonic execution timer and returns `Server-Timing` and `X-Execution-Time-Ms` headers. Requests exceeding 1 ms append compact metadata to the bounded JSON-lines file `reports/performance.log`; it rotates to one 4 MiB backup, excludes credentials and full payloads, and reporting failure never changes the API response.

`SERVER-GAME-005`: Registration provisions the account's player row, initial state with 500 money, one Settler, and three Explorers. All four units start on the same valid grass or freshwater land tile. Schema migration 5 brings existing registered players to the same minimum of three living Explorers. A player without surviving units is inactive for synchronous turn completion until that player submits End Turn and respawns.

`SERVER-GAME-005A`: New and respawned players use a random target no farther than one-third of map size from world center, then select the nearest valid grass or freshwater start tile inside that radius. All four starting units share that coordinate.

`SERVER-GAME-005B`: When a player with no living movable units submits `make_turn`, PHP respawns one Settler and three Explorers at a new randomized start before storing the submitted turn. Cities, buildings, and terrain improvements do not count as surviving units for this check. This also restores an eliminated hidden AI player on its next automatic End Turn.

`SERVER-GAME-005C`: Technology discovery is temporarily disabled. PHP normalizes every new, existing, and loaded player state with every technology open, and production/build validation treats those technologies as available.

`SERVER-GAME-012`: PHP does not run or persist background AI inference. The browser computes AI locally and submits its current-turn atomic orders and batched actions. Strategic intentions that have not yet become a submitted turn action remain client-owned and may be lost on reload.

`SERVER-GAME-006`: The browser initializes empty terrain arrays, loads its visible landscape and unit state from PHP, and treats server values as authoritative. The authenticated player id comes from the `aiciv_player_id` cookie written by the login page.

## Synchronous Turns

`SERVER-TURN-001`: The authoritative turn has one 6-second deadline. Players submit independently and do not wait before entering local orders.

`SERVER-TURN-002`: A turn resolves immediately when all online players submit `make_turn`, including empty command lists. A registered player is online when its account has made an authenticated game request within 60 seconds. Secret-only fixture players remain participants in deterministic server tests.

`SERVER-TURN-003`: If at least one player submitted and the deadline passed, the first arriving request resolves the turn. This may be a `make_turn`, `update_units`, or `update_landscape` request. Every player still missing receives an implicit hold. Polling does not advance a turn when nobody submitted.

`SERVER-TURN-004`: Resolution increments the turn and global revision, then stores the next turn start and deadline.

`SERVER-TURN-005`: The browser has a 5-second playable-turn counter while PHP retains the authoritative 6-second deadline. After End Turn, the player enters an awaiting-resolution state and cannot send a second `make_turn` for the same authoritative turn. The End Turn button remains disabled until `load_update` reports a higher authoritative turn number.

`SERVER-TURN-006`: The first accepted `make_turn` submission for a player and turn is final. Duplicate submissions are acknowledged but cannot delete or replace stored orders or player state. A duplicate arriving after the deadline may trigger resolution using the first stored orders.

`SERVER-TURN-006B`: A client-supplied `turn` number is informational and never rejects or selects a turn. Under the game-row lock, PHP validates and stores commands in the current authoritative turn. The response reports both `client_turn` and the actual `submitted_turn`.

`SERVER-TURN-006A`: A full Goto route and destination belong only to the JS client and are persisted in browser storage. PHP never stores or returns them. Each turn the client submits only the next atomic route segment, limited to that unit's current speed. A missed submission therefore holds the unit; the client can submit the next segment on a later turn.

`SERVER-TURN-008`: An authenticated browser never advances unit coordinates speculatively before `make_turn` is accepted. PHP coordinates are authoritative. After each authoritative update, JS trims reached steps from its client-owned route and redraws the remaining arrows.

`SERVER-TURN-009`: The waiting countdown owns the client timer only until a higher authoritative turn arrives. Resolution must stop that countdown and release the timer before starting a fresh 5-second playable-turn countdown. Waiting UI shows only its countdown and does not expose the server turn number.

`SERVER-TURN-007`: An authenticated client performs two independent submissions for its visible human and hidden AI child. The AI is loaded through its own fog-filtered snapshot, inferred in a background worker during the human turn, and submitted under its own `player_id`. The client restores the human map, fog, units, selection, and camera before yielding control; AI movement is never centered or rendered locally. End Turn waits if background inference is unfinished. If the authoritative turn advances during inference, that stale AI result is discarded rather than submitted into the next turn.

`SERVER-TURN-008`: Every deadline response includes server-calculated `turn_seconds_remaining`. The browser clamps this value, and its ISO timestamp fallback, to one configured client turn so clock skew or stale responses cannot display timeouts such as 900 or 1000 seconds.

## Orders

`SERVER-ORDER-001`: Commands are `move`, `hold`, `wait`, `fortify`, `set_state`, `build`, and `produce`. Unknown commands become holds. A player can order only living units it owns.

`SERVER-ORDER-002`: A movement command is an atomic list of adjacent map coordinates for the current turn only. Before recording the player's submission, PHP requires a living owned movable unit, no movement penalty, at least one step, no more steps than the unit's speed, in-map adjacency, and matching land/water nature. An invalid movement becomes a hold for only that unit and is returned in `rejected_movements`; other valid commands still enter the turn.

`SERVER-ORDER-002A`: At most five living movable units may occupy one Tile; Cities and terrain-improvement rows do not count. PHP stops a multi-step non-attack move at the furthest available preceding Tile when its destination is full, and blocks it at the origin only when its first step is full. Capacity is reserved deterministically for simultaneous arrivals. A military move targeting a foreign defender bypasses the capacity check when it has explicit attack intent or the civilizations are already at war, so a full enemy stack remains attackable.

`SERVER-ORDER-003`: Server movement, collision, fog, ownership, health, and coordinates have priority over client calculations. Other properties are preserved in `properties_json`, except client route fields (`gotoPath`, `gotoCoord`, and `pendingServerPath`), which are always removed.

`SERVER-COMBAT-001`: Every combat event returns authoritative post-combat `health`, `max_health`, and `experience` snapshots for both attacker and defender. A `make_turn` request which resolves combat also returns these records in `combat_units`; earlier submitters receive the same snapshots from their event update.

`SERVER-PRODUCTION-001`: Every newly produced unit starts with `100` health, `100` maximum health, and `1.0` experience, and the client replaces its local values with the server response.

`SERVER-ORDER-004`: Worker buildings and terrain improvements use the immediate `build` request with `worker_unit_id` and `building_type` as soon as the command is selected or captured. The server locks the tile, validates the Worker and terrain, creates the nonmoving building in `server_game_units`, resets the Worker state, and updates the tile modifier in one transaction. Repeating the same improvement returns `ALREADY_BUILT`; building a different primary improvement atomically removes the previous one. Road uses independent occupancy and coexists with the primary improvement.

`SERVER-ORDER-005`: Drawing or assigning a route saves the complete route in browser storage. Incremental server polling cannot erase it. Turn capture sends only the next speed-limited atomic segment; PHP never stores the remaining route.

`SERVER-ORDER-006`: If a speculative or stale client submits a route whose first point is no longer adjacent to the authoritative unit coordinate, the server computes a legal route from its stored coordinate to the submitted destination. It applies only the unit's allowed steps and saves the remainder. A stale client path is not treated as permission to jump, and it is not rejected as an apparent rollback when the destination remains reachable.

`SERVER-ORDER-007`: `build_city` is immediate and atomic. It validates an owned living Settler on land, splits a supertile when needed, automatically chops forest without a production award, creates one City with road and irrigation on that tile, and marks the Settler deleted in the same server revision. A tile cannot contain two living cities.

`SERVER-ORDER-008`: `select_production` appends a validated unit type to an owned City's production backlog. A null unit type clears the backlog while preserving accumulated production. `remove_production` removes one validated queue index.

`SERVER-ORDER-009`: Every resolved turn adds the City's authoritative `productionPerTurn` to the first backlog item. The browser sends `complete_production` when it observes enough points; PHP rechecks ownership, budget, points, cost, and spawn location, creates the unit, subtracts cost, and advances the queue.

`SERVER-ORDER-010`: `disband_unit` locks and validates an owned movable non-City unit, sets its health to zero, clears occupancy, and returns its authoritative deleted state. The browser normally includes this operation in the aggregated End Turn action list.

`SERVER-ORDER-009A`: If five movable units occupy the producing City's Tile, `complete_production` returns HTTP 200 with `status: "PAUSE"`, preserves all production points and backlog state, and provides a later retry turn. The JS client does not treat this as an error and retries after the indicated turn.

`SERVER-ORDER-009B`: An irrigation build uses the same breadth-first connectivity shape as road-connected resource lookup. Existing irrigation is traversable from the unbuilt request origin and must reach a valid fresh-water source. A disconnected request returns HTTP 200 with `status: "IMPOSSIBLE"` and `reason: "water_not_connected"` without changing the map.

`SERVER-ORDER-009C`: A completed road or Workshop stores its nearest same-owner City as `parentCityId`. Legacy improvements are assigned during turn processing. A road with no possible parent City is deleted together with its Tile modifier and emits an owner-visible event.

`SERVER-ORDER-010`: The browser observes authoritative City food each turn. When stored food reaches `80 + population * 40`, it calls `grow_city`. PHP locks the owned City, checks the threshold, increments population once, subtracts the growth cost, and returns the updated City.

`SERVER-ORDER-011`: During turn capture, the browser sends one sequential `heal_units` request for each owned City containing damaged friendly movable units. Sequential execution prevents many Cities from creating concurrent PHP workers waiting on the same game-row lock. PHP locks the City and requested units, verifies that every unit is alive, movable, owned by the same player, and on the City's exact Tile, then restores 10% of each unit's maximum health without exceeding maximum health. The client applies each returned HP snapshot immediately. A City records `last_healed_turn`, so retries cannot heal its occupants more than once in one authoritative turn.

## Half-Turn And Collision

`SERVER-HALF-TURN-001`: A unit reaches its turn destination early when `executed_path_steps * 2 <= speed`. A speed-2 unit reaches an adjacent tile at half-turn; a speed-1 unit does not.

`SERVER-HALF-TURN-002`: An early unit targeting an enemy starting tile arrives before that enemy can leave. The enemy route is canceled and interaction is resolved there. Neither participant is restored to its turn-start coordinate.

`SERVER-HALF-TURN-003`: A late unit targeting an enemy starting tile interacts only if the enemy remains after its valid movement. Otherwise the late unit may enter the vacated tile.

`SERVER-HALF-TURN-004`: If an early route controls a tile crossed later by an enemy route, the later unit is intercepted. Both units remain at the intersection point and both players receive an event; interception never rolls either unit back to its starting tile.

`SERVER-HALF-TURN-005`: Remaining hostile occupancy and equal-time uncertainty are resolved deterministically by submitted order and server unit id. Friendly units may share a tile.

`SERVER-HALF-TURN-006`: One unordered pair of units can resolve combat at most once per turn. A pair handled during half-turn arrival or interception is excluded from the final occupancy combat pass.

`SERVER-HALF-TURN-007`: Civilizations are neutral by default. Collision and interception combat run only for pairs at war. A direct military destination occupied by a foreign unit, or an explicit attack target in the order payload, changes that pair to war before interaction.

`SERVER-HALF-TURN-008`: One attack resolves against one defender. If that defender dies but another hostile unit remains on the Tile, the attacker returns to the immediately previous point in its submitted atomic trajectory. This retreat is saved as the authoritative coordinate and returned in the turn update; a City on the defended Tile is not captured.

## Fog Of War

`SERVER-FOG-001`: Visibility is separate per player. Resolution changes old visible tiles to remembered tiles, then opens full visibility through each unit's stored `view_range`; one additional outer ring is terrain memory without enemy-unit visibility.

`SERVER-FOG-002`: Own changed units are always returned. Enemy units are returned only on fully visible tiles. Newly visible enemies are returned even if they did not move.

`SERVER-FOG-002A`: `update_units` returns the complete list of currently visible enemy ids. The client removes cached enemy objects absent from this list and recreates them from a later update when they become visible again.

`SERVER-FOG-003`: Resources are hidden independently. An Explorer or water-nature unit reveals a resource only on its current tile.

## Incremental Updates

`SERVER-LOAD-001`: Authenticated page startup uses `load_full`. It returns one authoritative `100x100` aligned terrain window from the `300x300` world, the player's complete living unit list with world coordinates, currently fully visible foreign units inside the window, fog/resource visibility, player state, civilization statistics, and `last_event_id`.

`SERVER-LOAD-001A`: Map update requests carry `map_origin_i` and `map_origin_j` aligned to 10 Tiles. Returned Tile coordinates are local to the window and include `world_i`/`world_j`; the server clamps every window to world bounds and returns no missing cells.

`SERVER-LOAD-002`: `load_full` does not expose foreign units outside full visibility. Reloading starts from the current snapshot, discards pending events for that audience, and never replays old combat.

`SERVER-UPDATE-001`: `load_update` takes separate unit and landscape revision cursors plus an event-id cursor. One response returns touched owned units, touched or newly visible enemies, fog changes, visible enemy ids, changed tiles, events, and civilization state. The older split update requests remain API-compatible but the game client does not use them.

`SERVER-UPDATE-001A`: `update_units` always returns `owned_unit_ids`, the complete set of the player's living authoritative units. The browser removes local speculative objects not present in this set.

`SERVER-UPDATE-002`: `update_landscape` takes `since_revision`. Initial map synchronization and map regeneration return every base terrain tile so unknown terrain is not mistaken for default water. Incremental calls return changed terrain and changed visibility. Fog remains separate: unseen tiles have zero visibility, hidden resource ids are zero, and unseen improvements are omitted.

`SERVER-UPDATE-003`: End Turn sends one `make_turn` containing atomic unit orders and all queued turn actions. Its response includes the first combined update snapshot. If the turn is unresolved, each poll uses one `load_update`; events are animated before unit removals are applied.

`SERVER-UPDATE-004`: Human atomic commands are submitted without waiting for shared AI inference. PHP assigns them to the locked authoritative turn without comparing the browser's turn number. Every movement remains subject to server path validation.

`SERVER-AI-001`: `claim_ai_batch` leases up to eight random, living, movable units of the one global AI for the current turn. Active leases and units that already have an order are excluded, so browsers normally work on different units.

`SERVER-AI-002`: `submit_ai_batch` accepts commands and build/found-city actions only for ids in the caller's live lease. It upserts those unit orders and never creates `server_game_submissions`; the AI cannot delay turn resolution.

`SERVER-AI-003`: AI leases expire and are deleted at turn resolution. Commands accepted before resolution remain ordinary authoritative orders; unfinished inference after resolution is rejected as stale without delaying the human client.

`SERVER-ECONOMY-001`: End-turn resolution calculates worked-Tile food, production, and gold in PHP using tables mirrored by `city.js` and `economics.js`; client-reported balances and city food cannot overwrite these values.

`SERVER-ECONOMY-002`: PHP adds positive city food excess and gross city gold to player storage, deducts per-unit upkeep, and disbands movable units when either resource cannot cover the army.

`SERVER-ECONOMY-003`: A population-one starving City becomes a replaceable `destroyed_city` unit. It has no movement, economy, fog, control-zone, production, or combat behavior.

`SERVER-ECONOMY-004`: Military food upkeep is four times the base unit size tier, gold-consuming military types use the mirrored 6/12 gold tiers, each Workshop consumes two City food, and population growth costs `80 + population * 40`.

`SERVER-ECONOMY-005`: Cities above population 10 lose 5% of positive food excess and stored gold per additional citizen, capped at 50% at population 20; this compounds with applicable distance loss.

`SERVER-PRODUCTION-001`: Production points accrue by the exact authoritative city production yield. Unit creation occurs only for a City that submitted `produce`, after PHP validates cost, road-connected resources, nature/spawn location, and the five-unit stack limit.

`SERVER-PRODUCTION-002`: Authoritative City yield uses only nearby or road-connected worked Tiles. Parent roads and Nets each subtract one production, while parent Workshops each subtract two food, consume no gold, and set their worked Tile to four production.

`SERVER-MAP-004`: Resource ids are assigned only when an empty map is generated. Turn processing and schema upgrades never create, remove, or relocate resources in an existing map; resource visibility may still be discovered separately.

`SERVER-PRODUCTION-003`: Production points belong only to the current backlog item. Selecting the first item starts at zero; cancelling, removing, or completing it discards its balance and the next item also starts at zero.

`SERVER-EVENT-001`: The event part of `load_update` takes `since_event_id`, returns addressed events in id order plus the next cursor and current civilization statistics, then deletes those delivered event rows.

`SERVER-EVENT-002`: Combat is addressed to both participants and every player with full visibility of the combat tile. Its payload contains attacker and defender ids, before/after snapshots, damage, combat kind (`unit_attack`, `city_attack`, or `city_capture`), and destroyed unit ids.

`SERVER-EVENT-003`: The browser animates events from the combined response before applying its unit section, so a defeated unit remains available for slow-motion highlighting until the event finishes.

## Civilizations

`SERVER-CIV-001`: Every player row has a stable named civilization and coat-of-arms colors assigned on first creation.

`SERVER-CIV-003`: Civilization lists omit automated host-test human accounts. Their separately controlled AI civilizations remain visible, as do test-isolation players without registered accounts.

`SERVER-CIV-004`: The secret-protected `cleanup_orphan_players` administration request reports player/unit owners that have no valid `game_users` account link and automated test-human logins hidden by `SERVER-CIV-003`. With confirmation `REMOVE_ORPHANS`, it transactionally removes only those game players and their units, production, orders, visibility, events, and relations. Accounts with `user_type='ai'` are never candidates, including AI players assigned to test humans.

`SERVER-CIV-002`: Civilization statistics store units killed, cities occupied, and cities destroyed. Capturing a surviving City increments cities occupied; City records do not take combat damage or count as destroyed during capture.

`SERVER-CIV-005`: End Turn accepts the current player's directional `friend`, `enemy`, or `neutral` preferences and returns each known civilization's directional relation plus its authoritative food and gold balances.

`SERVER-CIV-006`: A changed directional Friend or Enemy preference produces a turn event for both affected players. The global AI also declares war and emits an event when a foreign civilization owns a living building within a 5-by-5 area centered on Copper, Iron, Gold, Gems, or Diamonds.

`SERVER-MOVE-005`: A movement command may include `interaction_intent` (`attack` or `coexist`) and `target_owner_id`. Explicit attack permits combat and declares the attacker's enemy preference; explicit coexist suppresses combat unless the other side attacks.

`SERVER-RESPAWN-001`: Unitless players are not respawned during ordinary load or turn resolution. Responses set `respawn_required`; the visible client waits indefinitely for a minimap coordinate and then sends `respawn_player`. PHP removes all of that player's units, Cities, production queues, improvements, City-center infrastructure, pending orders, and old visibility before creating one Settler and three Explorers on the nearest valid unoccupied grass/river Tile and returning a full snapshot.

`SERVER-RESPAWN-002`: A player may request the same complete civilization replacement before elimination by sending `force_respawn: true` after choosing a minimap coordinate. Without this explicit flag, `respawn_player` continues to reject players that have surviving movable units.

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

Use `load_full` for page startup and `load_update` for incremental reads. `make_turn.actions` accepts up to 500 queued construction, city, healing, and production operations; one failed action is returned in `action_results` without rejecting other actions or unit orders.

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

Send `unit_type_id: null` to clear City production. Send `remove_production` with `city_unit_id` and zero-based `queue_index` to remove one backlog item; send `complete_production` with `city_unit_id` when the active item has enough points.

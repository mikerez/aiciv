# Server Request Audit

## Classification

| Class | Requests | Frequency | Client policy |
| --- | --- | --- | --- |
| Authentication | `register`, `login`, `logout` | Session lifecycle | Independent; never batched with game state |
| Initial snapshot | `load_full` | Page startup and hidden-AI snapshot | Independent because it establishes a complete fog-filtered state |
| Turn write | `make_turn` | Once per controlled player per turn | Carries up to 1000 unit commands and 500 queued turn actions |
| Incremental read | `load_update` | Once after submission and once per unresolved poll | Combines events, units, visibility, player state, civilizations, and landscape |
| Diagnostics | `report_cli_error` | Only after a client request failure | Independent so a failed batch cannot suppress its report |
| Administration | `map_diagnostics`, `regenerate_map`, `reset_game`, `cleanup_orphan_players` | Manual | Independent and secret-protected |
| Compatibility | `update_units`, `update_landscape`, `update_events`, `build`, `build_city`, `grow_city`, `heal_units`, production requests | Third-party/older clients | Supported by PHP but unused by the main browser client |

## Turn Action Batch

`make_turn.actions` may contain `build`, `build_city`, `grow_city`, `heal_units`, `select_production`, `remove_production`, and `complete_production`. The JS client queues these actions per player and drains the queue only when capturing End Turn.

Each item has a `client_action_id` and `type`. PHP executes items independently and returns one `action_results` entry per item. Validation or a collision failure affects only that item. A duplicate `make_turn` never replays the action list.

Worker construction remains first-writer-wins in MySQL, but no longer creates a PHP request when the command is clicked. Healing is one action per occupied City inside the same HTTP request. Production completion is scanned and completed in bulk by PHP before a combined update is returned.

## Request Budget

A usual resolved human turn uses one `make_turn`. A turn waiting for other players adds one `load_update` per 2-second poll. Previously the same flow used one request per City heal, one per Worker build, one per City production completion, and three requests for every 1.2-second update poll.

The browser turn timer is 5 seconds. PHP remains authoritative with a 6-second turn deadline, allowing a final client submission to arrive before server timeout resolution.

# Game Web API

## Endpoint

`POST https://softmaximite.com/game/api.php`

Opening `https://softmaximite.com/game/api.php` directly with a browser displays the latest 200 request-log entries for debugging. The log records request metadata and sanitized request/response objects. Passwords, application secrets, access tokens, generic token fields, and authorization values are replaced with `[redacted]`. The JSON-line log rotates after 2 MiB. Its current and rotated raw files are denied over HTTP and can be viewed only through the sanitized API page.

Send JSON with `Content-Type: application/json`. Every request must contain the application `secret` stored locally in `api_secret`. The database password is not an API secret and must never be sent by clients.

The API returns JSON and never returns a password or password hash. Passwords are stored with PHP `password_hash()`.

## Register

Request fields:

- `action`: string, exactly `register`.
- `secret`: string, application secret.
- `login`: string, 3-50 characters; letters, numbers, `_`, `.`, and `-`.
- `email`: optional string; when supplied, it must be a valid email address with at most 254 characters.
- `password`: string, 8-128 characters.

Successful registration returns HTTP `201`, `ok: true`, and the public user object. Duplicate login or email returns HTTP `409`.

## Login

Request fields:

- `action`: string, exactly `login`.
- `secret`: string, application secret.
- `login`: string containing either the registered login or email address.
- `password`: string.
- `remember_me`: optional boolean. When true, the login token and game cookies remain valid for 30 days instead of 24 hours.
- `device_id`: optional stable string, 8-128 characters from `A-Z`, `a-z`, `0-9`, `_`, `.`, `:`, and `-`; applications should generate it once per physical device and persist it.

Successful login returns HTTP `200`, `authenticated: true`, the public user object, an `ai_player` object for the hidden AI controlled by this client, and a random `access_token`. Its lifetime is 24 hours by default or 30 days with `remember_me: true`; the response repeats the applied value in `remember_me`. The token is stored in MySQL only as a SHA-256 hash. Login accepts an optional stable `device_id` of 8-128 letters, numbers, dots, colons, underscores, or hyphens. Repeated logins from that device keep its earlier in-flight sessions valid; a login from a different device revokes every older-device token, returns `previous_device_kicked`, and those devices receive `session_replaced`. Clients that omit `device_id` receive a legacy device identifier derived from their platform signature and should persist the returned `device_id` for subsequent logins. The `game_entry` object carries both session and device identifiers for browser handoff. Invalid credentials return HTTP `401` with `authenticated` omitted and error code `invalid_credentials`.

Each `game_users` row declares `user_type` (`human` or `ai`), `online`, `last_online_at`, and optional `parent_id`. At login, accounts idle for 60 seconds are marked offline. The human retains its existing AI child when available; otherwise it adopts an AI whose previous parent is offline, or the server creates a new AI. The returned `ai_player.player_id` is the acting player id for the client-driven hidden AI phase.

### Opening the game from another application

The player id is not an authentication credential. The game derives it from the login token after validating the token hash, expiry, revocation state, and user status in MySQL.

URL handoff:

1. Read `game_entry.game_entry_url` from the successful login response. When constructing it manually, append the URL-encoded `access_token` and returned `device_id` as `https://softmaximite.com/game/?session=<token>&device=<device_id>`.
2. Open that URL in the browser or application web view.
3. The game validates the token, writes the game cookies, and immediately redirects to `https://softmaximite.com/game/` without the token in the address bar.

Cookie handoff:

1. Add a cookie named `aiciv_access_token` with the value from `game_entry.cookie_value` (the same value as `access_token`).
2. Set its domain/host to `softmaximite.com`, path to `/game/`, `Secure` to true, and `SameSite` to `Lax`. `HttpOnly` is recommended when the application's cookie API supports it. Also set readable cookie `aiciv_device_id` to the returned `device_id` when possible.
3. Open `https://softmaximite.com/game/`. The server validates the token and creates/refreshes `aiciv_player_id` itself.

A web page on another domain cannot normally set a `softmaximite.com` cookie. Such clients must use the URL handoff. Native applications and managed web views may use either method.

Relevant successful-login response fields:

```json
{
  "authenticated": true,
  "access_token": "<64 lowercase hexadecimal characters>",
  "device_id": "app-installation-7e9c...",
  "expires_at": "2026-08-05T17:55:01+00:00",
  "user": { "id": 13, "login": "player", "email": null, "user_type": "human", "online": true },
  "ai_player": { "game_id": "aiciv-default", "player_id": 41, "user_type": "ai", "parent_id": 13 },
  "game_entry": {
    "game_entry_url": "https://softmaximite.com/game/?session=<URL-encoded token>&device=<device_id>",
    "query_parameter": "session",
    "device_query_parameter": "device",
    "device_id": "app-installation-7e9c...",
    "cookie_name": "aiciv_access_token",
    "cookie_value": "<same token>",
    "cookie_path": "/game/",
    "cookie_secure": true,
    "cookie_http_only_recommended": true,
    "cookie_same_site": "Lax",
    "expires_at": "2026-08-05T17:55:01+00:00"
  }
}
```

After five failed passwords, the account is locked for 15 minutes. Login failures use the same public error for unknown, inactive, locked, and wrong-password accounts.

Registered-player requests to `server_game.php` must authenticate the current session in one of three equivalent ways: JSON field `access_token`, HTTP header `Authorization: Bearer <access_token>`, or the `aiciv_access_token` cookie. Every such request also sends `user_id`, which must equal the authenticated human account. `player_id` identifies the acting player: it may equal `user_id`, or it may identify an AI row whose `parent_id` equals `user_id`. All other combinations are rejected. Secret-only test players without a registered account remain available to the server test harness.

## Database Translation

`register` inserts one row into `game_users`, with a unique `login`, an optional unique `email`, and a password hash. A missing or empty email is stored as SQL `NULL`. In the same transaction it provisions the user's player state and initial Settler and Explorer in `aiciv-default`.

`login.html` submits credentials to `api.php`. The API sets secure, same-site cookies scoped to `/game/`, then the browser opens the authenticated `index.php` game entry. `register.html` creates the account, logs it in, and uses the same entry flow.

`login.php` and `register.php` are compatibility entry points. Browser GET requests redirect to the corresponding HTML page; JSON POST requests execute the same `api.php`, use the same MySQL connection, and infer the action from the endpoint when `action` is omitted.

`login` selects the user by login or email, verifies the password hash, transactionally revokes sessions belonging to other device keys, updates login metadata, and inserts one expiring hashed token with its device key into `game_user_sessions`. Both tables and device columns are created automatically with prepared SQL statements on the first authorized request.

Every human or AI account's stable `game_users.id` is also its default-world player id. Device sessions and parent links never own game objects. Units, cities, terrain-improvement building rows, production, visibility, and player state remain under the acting player's stable id, so replacing a device session or adopting an AI does not recreate or relocate any game object.

## Security

- Use HTTPS only.
- Prefer the cookie handoff when the application can install cookies for the game host. The URL handoff necessarily places the short-lived login token in the initial URL, although the game removes it immediately after validation.
- Do not log request bodies containing credentials.
- The development login and registration pages currently embed the shared application secret as requested. Replace this with an application-specific server credential flow before production distribution.

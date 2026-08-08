# Server Pipe Integration Tests

These tests execute the browser's real `server_game.js` request method against the
real `server_game.php` entry point without Apache. A persistent PHP coordinator
reads JSON requests from `pipe.rx`, runs one isolated PHP request process, and
writes its response to `pipe.tx`. This preserves normal PHP request/exit behavior.

Every `*.test.js` file resets `softmaxi_game_test`, creates a deterministic fixture,
sends requests through the JavaScript client, and verifies both the response and
the resulting MySQL rows. The suite covers every public server-game request plus
multi-client turn resolution, timeout, combat, fog, every unit command on all eight
terrain types, and every immediate improvement on all eight terrain types.

Setup once:

```bash
sudo server/tests/.prepare.sh
```

Run all integration tests:

```bash
server/tests/.test_all.sh
```

Run selected integration files through the same PHP/MySQL pipe server:

```bash
server/tests/.test_all.sh multi_automation.test.js multi_roadto.test.js
```

The two multi-turn tests load the production map, control, prehistory, and server
client code in a Node VM. They send real requests through `server_game.php` and
verify ten deterministic randomized scenarios each against MySQL.

Install PHP CLI with PDO MySQL, MySQL server/client, Node.js, and coreutils before
running setup. The setup script does not install packages. It starts MySQL and
creates only `softmaxi_game_test` with the restricted `aiciv_test` user. It does
not install or start Apache. Runtime logs, reports, credentials, and named pipes
remain ignored under `server/tests/`.

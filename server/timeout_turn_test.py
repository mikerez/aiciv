#!/usr/bin/env python3
"""Five-player timeout tests for authoritative incremental movement."""

import argparse
import datetime
import os
import pathlib
import time

from unit_order_tests import GameApi, bootstrap, command, require, unit, unit_by_key, unique_game


ROOT = pathlib.Path(__file__).resolve().parents[1]


def run(api):
    game = unique_game("five-player-timeout")
    starts = [(1, 1), (0, 0), (0, 2), (4, 0), (4, 4)]
    units = [unit(f"timeout-{player}", player, *starts[player]) for player in range(5)]
    fixture = bootstrap(units, players=range(5))
    fixture["turn_started_at"] = (
        datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=14)
    ).isoformat()
    status, first = api.call(
        "make_turn",
        game,
        0,
        turn=0,
        bootstrap=fixture,
        commands=[command("timeout-0", "move", [{"i": 2, "j": 1}])],
    )
    require(status == 200 and first["resolved_turn"] is None, first)

    time.sleep(7)
    status, expired = api.call("update_units", game, 0, since_revision=0)
    require(status == 200 and expired["resolved_turn"] == 0 and expired["turn"] == 1, expired)

    for player in range(5):
        _, update = api.call("update_units", game, player, since_revision=0)
        record = unit_by_key(update, f"timeout-{player}")
        expected = (2, 1) if player == 0 else starts[player]
        require((record["i"], record["j"]) == expected, record)

    destinations = [(3, 1), (1, 0), (1, 2), (3, 0), (3, 4)]
    for player in range(5):
        status, result = api.call(
            "make_turn",
            game,
            player,
            turn=1,
            commands=[command(f"timeout-{player}", "move", [{"i": destinations[player][0], "j": destinations[player][1]}])],
        )
        require(status == 200, result)
    require(result["resolved_turn"] == 1, result)

    for player, destination in enumerate(destinations):
        _, update = api.call("update_units", game, player, since_revision=0)
        record = unit_by_key(update, f"timeout-{player}")
        require((record["i"], record["j"]) == destination, record)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", default="https://softmaximite.com/game/server_game.php")
    parser.add_argument("--secret", default=os.environ.get("AICIV_SERVER_SECRET"))
    args = parser.parse_args()
    secret = args.secret or (ROOT / "api_secret").read_text(encoding="utf-8").strip()
    run(GameApi(args.endpoint, secret))
    print("PASS five-player timeout movement")


if __name__ == "__main__":
    main()

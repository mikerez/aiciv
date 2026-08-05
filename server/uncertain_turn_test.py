#!/usr/bin/env python3
"""Five-player collision and immediate-build concurrency tests."""

import argparse
import os
import pathlib

from unit_order_tests import GameApi, bootstrap, command, require, unit, unit_by_key, unique_game


ROOT = pathlib.Path(__file__).resolve().parents[1]


def test_five_player_interception(api):
    game = unique_game("five-player-collision")
    starts = [(2, 3), (4, 3), (3, 2), (3, 4), (2, 2)]
    units = []
    for player, start in enumerate(starts):
        record = unit(f"collision-{player}", player, *start, speed=2, attack=1, defense=1)
        record["health"] = 1000
        record["max_health"] = 1000
        units.append(record)

    for player in range(5):
        fields = {
            "turn": 0,
            "commands": [command(f"collision-{player}", "move", [{"i": 3, "j": 3}])],
        }
        if player == 0:
            fields["bootstrap"] = bootstrap(units, players=range(5))
        status, result = api.call("make_turn", game, player, **fields)
        require(status == 200, result)
    require(result["resolved_turn"] == 0, result)

    _, update = api.call("update_units", game, 0, since_revision=0)
    for player in range(5):
        record = unit_by_key(update, f"collision-{player}")
        require((record["i"], record["j"]) == (3, 3), record)


def test_first_build_wins(api):
    game = unique_game("build-race")
    workers = [unit("builder-0", 0, 1, 1, unit_type="worker"), unit("builder-1", 1, 1, 1, unit_type="worker")]
    _, created = api.call(
        "make_turn",
        game,
        0,
        turn=0,
        bootstrap=bootstrap(workers, players=(0, 1)),
        commands=[command("builder-0")],
    )
    worker0 = created["unit_id_map"]["builder-0"]
    worker1 = created["unit_id_map"]["builder-1"]

    status, first = api.call("build", game, 0, worker_unit_id=worker0, building_type="cottage")
    require(status == 200 and first["tile"]["modifiers"].get("cottage") is True, first)
    status, second = api.call("build", game, 1, worker_unit_id=worker1, building_type="mine")
    require(status == 409 and second["error"]["code"] == "tile_already_built", second)

    _, update = api.call("update_units", game, 0, since_revision=0)
    buildings = [record for record in update["units"] if record["unit_class"] == 4 and not record["deleted"]]
    require(len(buildings) == 1 and buildings[0]["unit_type_id"] == "building_cottage", update)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", default="https://softmaximite.com/game/server_game.php")
    parser.add_argument("--secret", default=os.environ.get("AICIV_SERVER_SECRET"))
    args = parser.parse_args()
    secret = args.secret or (ROOT / "api_secret").read_text(encoding="utf-8").strip()
    api = GameApi(args.endpoint, secret)
    test_five_player_interception(api)
    print("PASS five-player interception has no rollback")
    test_first_build_wins(api)
    print("PASS immediate build first-writer ownership")


if __name__ == "__main__":
    main()

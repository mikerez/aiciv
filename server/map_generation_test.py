#!/usr/bin/env python3
"""Generate several PHP worlds and verify reported continental-map quality."""

import argparse
import os
import pathlib

from unit_order_tests import GameApi, require, unique_game


ROOT = pathlib.Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", default="https://softmaximite.com/game/server_game.php")
    parser.add_argument("--secret", default=os.environ.get("AICIV_SERVER_SECRET"))
    parser.add_argument("--worlds", type=int, default=3)
    args = parser.parse_args()
    secret = args.secret or (ROOT / "api_secret").read_text(encoding="utf-8").strip()
    api = GameApi(args.endpoint, secret)

    for index in range(args.worlds):
        status, result = api.call("make_turn", unique_game(f"map-{index}"), 0, turn=0, commands=[])
        require(status == 200, result)
        quality = result.get("map_quality") or {}
        require(0.58 <= quality.get("land_ratio", 0) <= 0.86, quality)
        require(quality.get("largest_land_ratio", 0) >= 0.75, quality)
        print(
            f"PASS map {index + 1}: land={quality['land_ratio']:.1%}, "
            f"largest={quality['largest_land_ratio']:.1%}, components={quality['land_components']}"
        )


if __name__ == "__main__":
    main()

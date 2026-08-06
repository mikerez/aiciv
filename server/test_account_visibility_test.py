#!/usr/bin/env python3
"""Verify that test humans are hidden while their AI civilizations remain listed."""

import json
import os
import pathlib
import urllib.error
import urllib.request
import uuid


ROOT = pathlib.Path(__file__).resolve().parents[1]
SECRET = (ROOT / "api_secret").read_text(encoding="utf-8").strip()
API = "https://softmaximite.com/game/api.php"
GAME_API = os.environ.get("AICIV_GAME_API", "https://softmaximite.com/game/server_game.php")


def post(endpoint, payload):
    payload["secret"] = SECRET
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


def require(condition, value):
    if not condition:
        raise AssertionError(value)


def main():
    suffix = uuid.uuid4().hex[:12]
    login = "server_test_visibility_" + suffix
    password = "Test-" + suffix + "-Password"

    status, registered = post(API, {
        "action": "register", "login": login, "password": password,
    })
    require(status == 201 and registered.get("ok"), registered)
    user_id = registered["user"]["id"]

    status, logged_in = post(API, {
        "action": "login", "login": login, "password": password,
    })
    require(status == 200 and logged_in.get("authenticated"), logged_in)
    ai_player_id = logged_in["ai_player"]["player_id"]

    status, snapshot = post(GAME_API, {
        "action": "load_full",
        "game_id": "aiciv-default",
        "player_id": user_id,
        "user_id": user_id,
        "access_token": logged_in["access_token"],
        "include_map": False,
    })
    require(status == 200 and snapshot.get("ok"), snapshot)
    visible_ids = {row["player_id"] for row in snapshot["civilizations"]}
    require(user_id not in visible_ids, snapshot["civilizations"])
    require(ai_player_id in visible_ids, snapshot["civilizations"])
    ai_row = next(row for row in snapshot["civilizations"] if row["player_id"] == ai_player_id)
    require(ai_row["player_name"] == "AI Player " + str(ai_player_id), ai_row)

    print("PASS test human is hidden and assigned AI remains in civilization list")


if __name__ == "__main__":
    main()

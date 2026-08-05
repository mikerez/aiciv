#!/usr/bin/env python3
"""Host-facing registration and initial player provisioning test."""

import json
import pathlib
import urllib.error
import urllib.request
import uuid


ROOT = pathlib.Path(__file__).resolve().parents[1]
SECRET = (ROOT / "api_secret").read_text(encoding="utf-8").strip()
API = "https://softmaximite.com/game/api.php"
GAME_API = "https://softmaximite.com/game/server_game.php"


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


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    suffix = uuid.uuid4().hex[:12]
    login = "server_test_" + suffix
    password = "Test-" + suffix + "-Password"
    status, registered = post(API, {
        "action": "register",
        "login": login,
        "password": password,
    })
    require(status == 201 and registered.get("ok"), registered)
    player_id = registered["user"]["id"]
    require(registered["player"]["player_id"] == player_id, registered)

    status, logged_in = post(API, {
        "action": "login",
        "login": login,
        "password": password,
    })
    require(status == 200 and logged_in.get("authenticated"), logged_in)
    require(logged_in["user"]["id"] == player_id, logged_in)

    status, logged_in_again = post(API, {
        "action": "login",
        "login": login,
        "password": password,
    })
    require(status == 200 and logged_in_again.get("authenticated"), logged_in_again)
    require(logged_in_again["player"]["created_units"] is False, logged_in_again)

    status, units = post(GAME_API, {
        "action": "update_units",
        "game_id": "aiciv-default",
        "player_id": player_id,
        "user_id": player_id,
        "access_token": logged_in_again["access_token"],
        "since_revision": 0,
    })
    require(status == 200, units)
    own = [unit for unit in units["units"] if unit["owner_id"] == player_id]
    require({unit["unit_type_id"] for unit in own} == {"settlers", "explorer"}, own)
    require(len(own) == 4, own)
    require(sum(unit["unit_type_id"] == "explorer" for unit in own) == 3, own)
    require(len({(unit["i"], unit["j"]) for unit in own}) == 1, own)
    require(units["player_state"]["money"] == 500, units["player_state"])

    status, landscape = post(GAME_API, {
        "action": "update_landscape",
        "game_id": "aiciv-default",
        "player_id": player_id,
        "user_id": player_id,
        "access_token": logged_in_again["access_token"],
        "since_revision": 0,
    })
    require(status == 200 and landscape["tiles"], landscape)
    print("PASS registration, login, initial units, state, and visible landscape")


if __name__ == "__main__":
    main()

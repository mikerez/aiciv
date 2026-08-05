#!/usr/bin/env python3
"""Verify human/AI login pairing and acting-player authorization."""

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
    body = dict(payload)
    body["secret"] = SECRET
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


def main():
    suffix = uuid.uuid4().hex[:12]
    login = "ai_parent_test_" + suffix
    password = "Test-" + suffix + "-Password"
    status, registered = post(API, {"action": "register", "login": login, "password": password})
    assert status == 201 and registered.get("ok"), registered
    human_id = registered["user"]["id"]

    status, first = post(API, {"action": "login", "login": login, "password": password})
    assert status == 200 and first.get("authenticated"), first
    ai_id = first["ai_player"]["player_id"]
    assert first["ai_player"]["user_type"] == "ai", first
    assert first["ai_player"]["parent_id"] == human_id, first

    status, second = post(API, {"action": "login", "login": login, "password": password})
    assert status == 200 and second["ai_player"]["player_id"] == ai_id, second
    token = second["access_token"]

    common = {
        "action": "load_full",
        "game_id": "aiciv-default",
        "user_id": human_id,
        "access_token": token,
        "include_map": False,
    }
    status, human = post(GAME_API, {**common, "player_id": human_id})
    assert status == 200 and human.get("ok"), human
    controlled = {row["player_id"]: row for row in human["controlled_players"]}
    assert controlled[human_id]["user_type"] == "human", controlled
    assert controlled[ai_id]["user_type"] == "ai", controlled
    assert controlled[ai_id]["parent_id"] == human_id, controlled

    status, ai = post(GAME_API, {**common, "player_id": ai_id})
    assert status == 200 and ai.get("ok"), ai
    assert any(unit["owner_id"] == ai_id for unit in ai["units"]), ai
    assert all(tile["visibility_level"] > 0 for tile in ai["tiles"]), ai["tiles"][:5]

    status, ai_turn = post(GAME_API, {
        "action": "make_turn",
        "game_id": "aiciv-default",
        "user_id": human_id,
        "player_id": ai_id,
        "access_token": token,
        "turn": ai["turn"],
        "commands": [],
        "player_state": ai["player_state"],
    })
    assert status == 200 and ai_turn.get("ok"), ai_turn

    status, refreshed_human = post(GAME_API, {**common, "player_id": human_id})
    assert status == 200 and refreshed_human.get("ok"), refreshed_human
    status, human_turn = post(GAME_API, {
        "action": "make_turn",
        "game_id": "aiciv-default",
        "user_id": human_id,
        "player_id": human_id,
        "access_token": token,
        "turn": refreshed_human["turn"],
        "commands": [],
        "player_state": refreshed_human["player_state"],
    })
    assert status == 200 and human_turn.get("ok"), human_turn

    status, mismatch = post(GAME_API, {**common, "user_id": human_id + 1, "player_id": ai_id})
    assert status == 403 and mismatch["error"]["code"] == "user_identity_mismatch", mismatch
    print("PASS login retains one AI child and authorizes independent human/AI turns")


if __name__ == "__main__":
    main()

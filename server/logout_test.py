#!/usr/bin/env python3
"""Verify that logout revokes the presented browser/device session."""

import json
import os
import pathlib
import urllib.error
import urllib.request
import uuid


ROOT = pathlib.Path(__file__).resolve().parents[1]
SECRET = (ROOT / "api_secret").read_text(encoding="utf-8").strip()
API = os.environ.get("AICIV_API", "https://softmaximite.com/game/api.php")
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


def require(condition, value):
    if not condition:
        raise AssertionError(value)


def main():
    suffix = uuid.uuid4().hex[:12]
    login = "logout_test_" + suffix
    password = "Test-" + suffix + "-Password"
    device_id = "logout-test-device-" + suffix

    status, registered = post(API, {
        "action": "register", "login": login, "password": password,
    })
    require(status == 201 and registered.get("ok"), registered)
    user_id = registered["user"]["id"]

    status, first = post(API, {
        "action": "login", "login": login, "password": password, "device_id": device_id,
    })
    require(status == 200 and first.get("authenticated"), first)
    status, second = post(API, {
        "action": "login", "login": login, "password": password, "device_id": device_id,
    })
    require(status == 200 and second.get("authenticated"), second)

    status, logged_out = post(API, {
        "action": "logout", "access_token": second["access_token"],
    })
    require(status == 200 and logged_out.get("authenticated") is False, logged_out)

    for token in (first["access_token"], second["access_token"]):
        status, rejected = post(GAME_API, {
            "action": "update_units",
            "game_id": "aiciv-default",
            "player_id": user_id,
            "user_id": user_id,
            "access_token": token,
            "since_revision": 0,
        })
        require(status == 401 and rejected.get("error", {}).get("code") == "session_replaced", rejected)

    print("PASS logout revokes every session from the current device")


if __name__ == "__main__":
    main()

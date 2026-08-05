#!/usr/bin/env python3
"""Verify last-login-wins sessions and persistent cross-device game state."""

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
    payload = dict(payload)
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


def game_request(player_id, token, action, **fields):
    return post(GAME_API, {
        "action": action,
        "game_id": "aiciv-default",
        "player_id": player_id,
        "user_id": player_id,
        "access_token": token,
        **fields,
    })


def owned_snapshot(response, player_id):
    return sorted(
        (unit["id"], unit["unit_type_id"], unit["i"], unit["j"], unit["state"])
        for unit in response["units"]
        if unit["owner_id"] == player_id and not unit.get("deleted")
    )


def main():
    suffix = uuid.uuid4().hex[:12]
    login = "device_test_" + suffix
    password = "Test-" + suffix + "-Password"
    status, registered = post(API, {"action": "register", "login": login, "password": password})
    assert status == 201 and registered.get("ok"), registered
    player_id = registered["user"]["id"]

    status, first_login = post(API, {
        "action": "login", "login": login, "password": password, "device_id": "test-phone-device"
    })
    assert status == 200 and first_login.get("authenticated"), first_login
    first_token = first_login["access_token"]

    status, repeated_login = post(API, {
        "action": "login", "login": login, "password": password, "device_id": "test-phone-device"
    })
    assert status == 200 and repeated_login.get("authenticated"), repeated_login
    assert repeated_login["replaced_sessions"] == 0, repeated_login
    assert repeated_login["previous_device_kicked"] is False, repeated_login
    repeated_token = repeated_login["access_token"]
    status, first_still_valid = game_request(player_id, first_token, "update_units", since_revision=0)
    assert status == 200 and first_still_valid.get("ok"), first_still_valid
    status, repeated_valid = game_request(player_id, repeated_token, "update_units", since_revision=0)
    assert status == 200 and repeated_valid.get("ok"), repeated_valid

    status, initial = game_request(player_id, first_token, "update_units", since_revision=0)
    assert status == 200 and initial.get("ok"), initial
    settler = next(unit for unit in initial["units"] if unit["owner_id"] == player_id and unit["unit_type_id"] == "settlers")
    status, built = game_request(player_id, first_token, "build_city", settler_unit_id=settler["id"])
    assert status == 200 and built.get("ok"), built

    status, before_units = game_request(player_id, first_token, "update_units", since_revision=0)
    assert status == 200, before_units
    status, before_land = game_request(player_id, first_token, "update_landscape", since_revision=0)
    assert status == 200, before_land
    before_snapshot = owned_snapshot(before_units, player_id)
    city_before = next(unit for unit in before_units["units"] if unit["owner_id"] == player_id and unit["unit_type_id"] == "city")
    city_tile_before = next(tile for tile in before_land["tiles"] if tile["i"] == city_before["i"] and tile["j"] == city_before["j"])

    status, second_login = post(API, {
        "action": "login", "login": login, "password": password, "device_id": "test-laptop-device"
    })
    assert status == 200 and second_login.get("authenticated"), second_login
    assert second_login["replaced_sessions"] >= 1, second_login
    assert second_login["previous_device_kicked"] is True, second_login
    second_token = second_login["access_token"]

    status, kicked = game_request(player_id, first_token, "update_units", since_revision=0)
    assert status == 401 and kicked["error"]["code"] == "session_replaced", kicked
    status, repeated_kicked = game_request(player_id, repeated_token, "update_units", since_revision=0)
    assert status == 401 and repeated_kicked["error"]["code"] == "session_replaced", repeated_kicked

    status, after_units = game_request(player_id, second_token, "update_units", since_revision=0)
    assert status == 200 and after_units.get("ok"), after_units
    status, after_land = game_request(player_id, second_token, "update_landscape", since_revision=0)
    assert status == 200 and after_land.get("ok"), after_land
    assert owned_snapshot(after_units, player_id) == before_snapshot, (before_units, after_units)
    city_after = next(unit for unit in after_units["units"] if unit["id"] == city_before["id"])
    city_tile_after = next(tile for tile in after_land["tiles"] if tile["i"] == city_after["i"] and tile["j"] == city_after["j"])
    assert city_tile_after["modifiers"] == city_tile_before["modifiers"], (city_tile_before, city_tile_after)
    assert not any(
        unit["unit_type_id"] == "settlers" and not unit.get("deleted")
        for unit in after_units["units"] if unit["owner_id"] == player_id
    )
    print("PASS same-device relogin remains valid; newer physical device kicks it and preserves game state")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Verify native Android and its WebView are treated as one physical phone."""

import json
import pathlib
import urllib.error
import urllib.request
import uuid


ROOT = pathlib.Path(__file__).resolve().parents[1]
SECRET = (ROOT / "api_secret").read_text(encoding="utf-8").strip()
API = "https://softmaximite.com/game/api.php"
GAME_API = "https://softmaximite.com/game/server_game.php"
DALVIK = "Dalvik/2.1.0 (Linux; U; Android 13; SM-A325F Build/TP1A.220624.014)"
WEBVIEW = ("Mozilla/5.0 (Linux; Android 13; SM-A325F Build/TP1A.220624.014; wv) "
           "AppleWebKit/537.36 Version/4.0 Chrome/150.0.7871.181 Mobile Safari/537.36")
DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:153.0) Gecko/20100101 Firefox/153.0"


def post(endpoint, payload, user_agent):
    body = dict(payload)
    body["secret"] = SECRET
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": user_agent},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


def game_request(player_id, token, user_agent):
    return post(GAME_API, {
        "action": "update_units",
        "game_id": "aiciv-default",
        "player_id": player_id,
        "user_id": player_id,
        "access_token": token,
        "since_revision": 0,
    }, user_agent)


def main():
    suffix = uuid.uuid4().hex[:12]
    login = "phone_session_" + suffix
    password = "Test-" + suffix + "-Password"
    status, registered = post(API, {
        "action": "register", "login": login, "password": password,
    }, DALVIK)
    assert status == 201 and registered.get("ok"), registered
    player_id = registered["user"]["id"]

    status, native = post(API, {"action": "login", "login": login, "password": password}, DALVIK)
    assert status == 200 and native.get("authenticated"), native
    status, webview = post(API, {"action": "login", "login": login, "password": password}, WEBVIEW)
    assert status == 200 and webview.get("authenticated"), webview
    assert native["device_id"] == webview["device_id"], (native, webview)
    assert webview["replaced_sessions"] == 0 and not webview["previous_device_kicked"], webview
    status, native_valid = game_request(player_id, native["access_token"], DALVIK)
    assert status == 200 and native_valid.get("ok"), native_valid

    status, desktop = post(API, {"action": "login", "login": login, "password": password}, DESKTOP)
    assert status == 200 and desktop["previous_device_kicked"], desktop
    status, phone_kicked = game_request(player_id, webview["access_token"], WEBVIEW)
    assert status == 401 and phone_kicked["error"]["code"] == "session_replaced", phone_kicked
    print("PASS Android native app and WebView share one device; desktop login replaces the phone")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Verify API login handoff to the browser game by URL and by cookie."""

import http.cookiejar
import json
import pathlib
import urllib.request
import uuid
from datetime import datetime, timezone


ROOT = pathlib.Path(__file__).resolve().parents[1]
SECRET = (ROOT / "api_secret").read_text(encoding="utf-8").strip()
API = "https://softmaximite.com/game/api.php"
GAME = "https://softmaximite.com/game/"


def post(payload):
    payload["secret"] = SECRET
    request = urllib.request.Request(
        API,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.status, json.load(response)


def cookies_by_name(jar):
    return {cookie.name: cookie.value for cookie in jar}


def open_with_jar(url, jar):
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    with opener.open(url, timeout=60) as response:
        body = response.read().decode("utf-8")
        return response.status, response.geturl(), body


def token_cookie(token):
    return http.cookiejar.Cookie(
        version=0,
        name="aiciv_access_token",
        value=token,
        port=None,
        port_specified=False,
        domain="softmaximite.com",
        domain_specified=True,
        domain_initial_dot=False,
        path="/game/",
        path_specified=True,
        secure=True,
        expires=None,
        discard=True,
        comment=None,
        comment_url=None,
        rest={"HttpOnly": None, "SameSite": "Lax"},
        rfc2109=False,
    )


def main():
    suffix = uuid.uuid4().hex[:12]
    login = "handoff_test_" + suffix
    password = "Test-" + suffix + "-Password"

    status, registered = post({"action": "register", "login": login, "password": password})
    assert status == 201 and registered.get("ok"), registered

    status, initial_login = post({
        "action": "login", "login": login, "password": password,
        "device_id": "handoff-test-device", "remember_me": True,
        "browser_language": "RU",
    })
    assert status == 200 and initial_login.get("authenticated"), initial_login
    assert initial_login["user"]["language"] == "RU", initial_login["user"]

    status, selected_login = post({
        "action": "login", "login": login, "password": password,
        "device_id": "handoff-test-device", "remember_me": True,
        "language": "FR", "browser_language": "EN",
    })
    assert status == 200 and selected_login.get("authenticated"), selected_login
    assert selected_login["user"]["language"] == "FR", selected_login["user"]

    status, result = post({
        "action": "login", "login": login, "password": password,
        "device_id": "handoff-test-device", "remember_me": True,
        "browser_language": "DE",
    })
    assert status == 200 and result.get("authenticated"), result
    assert result["user"]["language"] == "FR", result["user"]
    assert result.get("remember_me") is True, result
    expiry = datetime.fromisoformat(result["expires_at"])
    assert (expiry - datetime.now(timezone.utc)).days >= 29, result["expires_at"]
    token = result["access_token"]
    entry = result["game_entry"]
    assert entry["cookie_name"] == "aiciv_access_token", entry
    assert entry["cookie_value"] == token, entry
    assert entry["query_parameter"] == "session", entry
    assert entry["device_id"] == "handoff-test-device", entry
    assert entry["device_query_parameter"] == "device", entry

    url_jar = http.cookiejar.CookieJar()
    status, final_url, body = open_with_jar(entry["game_entry_url"], url_jar)
    url_cookies = cookies_by_name(url_jar)
    assert status == 200 and final_url == GAME, final_url
    assert "AI Civilization" in body, "game HTML was not returned"
    assert url_cookies.get("aiciv_access_token") == token, url_cookies
    assert url_cookies.get("aiciv_player_id") == str(result["user"]["id"]), url_cookies
    assert url_cookies.get("aiciv_device_id") == "handoff-test-device", url_cookies

    cookie_jar = http.cookiejar.CookieJar()
    cookie_jar.set_cookie(token_cookie(token))
    status, final_url, body = open_with_jar(GAME, cookie_jar)
    cookie_values = cookies_by_name(cookie_jar)
    assert status == 200 and final_url == GAME, final_url
    assert "AI Civilization" in body, "game HTML was not returned"
    assert cookie_values.get("aiciv_player_id") == str(result["user"]["id"]), cookie_values

    print("PASS language fallback/persistence, login response, URL handoff, cookie handoff, and authenticated game entry")


if __name__ == "__main__":
    main()

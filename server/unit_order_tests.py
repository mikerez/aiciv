#!/usr/bin/env python3
"""Host-facing integration tests for the authoritative turn server."""

import argparse
import datetime
import json
import os
import pathlib
import time
import urllib.error
import urllib.request
import uuid


ROOT = pathlib.Path(__file__).resolve().parents[1]


class GameApi:
    def __init__(self, endpoint, secret):
        self.endpoint = endpoint
        self.secret = secret

    def call(self, action, game_id, player_id, **fields):
        payload = {"action": action, "secret": self.secret, "game_id": game_id, "player_id": player_id, **fields}
        request = urllib.request.Request(
            self.endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            return error.code, json.load(error)


def grass_map(size=5):
    return [
        {"i": i, "j": j, "terrain_tex": 2, "terrain_bits": 0, "resource_type": 0, "modifiers": {}}
        for i in range(size)
        for j in range(size)
    ]


def unit(client_key, owner, i, j, speed=1, unit_type="warrior", attack=2, defense=1):
    return {
        "client_key": client_key,
        "owner_id": owner,
        "unit_type_id": unit_type,
        "unit_class": 1 if unit_type == "worker" else 2,
        "name": unit_type.title(),
        "texture": 0,
        "can_move": True,
        "nature": "land",
        "i": i,
        "j": j,
        "attack": attack,
        "defense": defense,
        "speed": speed,
        "view_range": 2,
        "state": "ready",
        "health": 100,
        "max_health": 100,
        "experience": 1,
        "properties": {},
    }


def bootstrap(units, players=(0, 1), tiles=None):
    return {"map_size": 5, "players": list(players), "tiles": tiles or grass_map(), "units": units}


def command(client_key, name="hold", path=None, payload=None):
    return {"client_key": client_key, "command": name, "path": path or [], "payload": payload or {}}


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def unit_by_key(response, client_key):
    for record in response.get("units", []):
        if record.get("client_key") == client_key:
            return record
    raise AssertionError(f"unit {client_key!r} missing from update: {response}")


def unique_game(label):
    return f"server-test-{label}-{uuid.uuid4().hex[:10]}"


def test_secret_required(api):
    """A request without SECRET is rejected before database access."""
    payload = {"action": "update_units", "game_id": unique_game("secret"), "player_id": 0}
    request = urllib.request.Request(
        api.endpoint,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(request, timeout=15)
    except urllib.error.HTTPError as error:
        body = json.load(error)
        require(error.code == 403, f"expected HTTP 403, got {error.code}")
        require(body["error"]["code"] == "application_not_allowed", body)
        return
    raise AssertionError("request without secret unexpectedly succeeded")


def test_server_generates_empty_world(api):
    """A production make_turn has no client bootstrap map.

    PHP creates the 100x100 authoritative world when the game has no map rows,
    records the submitting player, and resolves the one-player turn.
    """
    game = unique_game("generated")
    status, result = api.call("make_turn", game, 0, turn=0, commands=[])
    require(status == 200, result)
    require(result["created"] is True, result)
    require(result["map_size"] == 100, result)
    require(result["resolved_turn"] == 0, result)


def test_enemy_visible_inside_unit_view_range(api):
    """PHP uses each unit's view_range when exposing another player's unit."""
    game = unique_game("view-range")
    observer = unit("observer", 0, 0, 0, unit_type="explorer")
    observer["view_range"] = 4
    enemy = unit("visible-enemy", 1, 4, 0)
    api.call(
        "make_turn", game, 0, turn=0, bootstrap=bootstrap([observer, enemy]),
        commands=[command("observer")],
    )
    _, result = api.call(
        "make_turn", game, 1, turn=0,
        commands=[command("visible-enemy")],
    )
    require(result["resolved_turn"] == 0, result)
    _, update = api.call("update_units", game, 0, since_revision=0)
    visible = unit_by_key(update, "visible-enemy")
    require((visible["i"], visible["j"]) == (4, 0), update)
    require(visible["id"] in update["visible_enemy_ids"], update)


def test_half_turn_interaction(api):
    """A speed-2 unit reaches an adjacent occupied tile at half-turn.

    The defender submitted a move away, but the early attacker interacts first.
    The defender route is canceled and authoritative coordinates correct both
    clients when neither unit is destroyed. Both units remain on the interaction
    tile; combat never restores the attacker to its turn-start coordinate.
    """
    game = unique_game("half")
    units = [unit("fast-attacker", 0, 1, 1, speed=2, attack=5), unit("moving-defender", 1, 2, 1, defense=3)]
    status, first = api.call(
        "make_turn", game, 0, turn=0, bootstrap=bootstrap(units),
        commands=[command("fast-attacker", "move", [{"i": 2, "j": 1}])],
    )
    require(status == 200 and first["resolved_turn"] is None, first)
    status, second = api.call(
        "make_turn", game, 1, turn=0,
        commands=[command("moving-defender", "move", [{"i": 3, "j": 1}])],
    )
    require(status == 200 and second["resolved_turn"] == 0, second)
    _, update = api.call("update_units", game, 0, since_revision=0)
    attacker = unit_by_key(update, "fast-attacker")
    defender = unit_by_key(update, "moving-defender")
    require((attacker["i"], attacker["j"]) == (2, 1), attacker)
    require((defender["i"], defender["j"]) == (2, 1), defender)
    pair_events = [
        event for event in update["events"]
        if {event["unit_id"], event["other_unit_id"]} == {attacker["id"], defender["id"]}
    ]
    require(len(pair_events) == 1 and pair_events[0]["event_type"] == "half_turn_interaction", update)


def test_late_target_can_leave(api):
    """A speed-1 attacker is late, so a target may vacate its starting tile."""
    game = unique_game("late")
    units = [unit("late-attacker", 0, 1, 1), unit("leaving-defender", 1, 2, 1)]
    api.call(
        "make_turn", game, 0, turn=0, bootstrap=bootstrap(units),
        commands=[command("late-attacker", "move", [{"i": 2, "j": 1}])],
    )
    _, result = api.call(
        "make_turn", game, 1, turn=0,
        commands=[command("leaving-defender", "move", [{"i": 3, "j": 1}])],
    )
    require(result["resolved_turn"] == 0, result)
    _, update0 = api.call("update_units", game, 0, since_revision=0)
    _, update1 = api.call("update_units", game, 1, since_revision=0)
    attacker = unit_by_key(update0, "late-attacker")
    defender = unit_by_key(update1, "leaving-defender")
    require((attacker["i"], attacker["j"]) == (2, 1), update0)
    require((defender["i"], defender["j"]) == (3, 1), update1)
    require(not any(event["event_type"] == "half_turn_interaction" for event in update0["events"]), update0)


def test_path_interception(api):
    """An early route controls an intersection before a late route arrives.

    The late unit may already have moved speculatively in its browser, and the
    server fixes both units at the interception point without a start-position rollback.
    """
    game = unique_game("intercept")
    units = [unit("interceptor", 0, 1, 1, speed=2, attack=4), unit("crossing", 1, 2, 2, defense=2)]
    api.call(
        "make_turn", game, 0, turn=0, bootstrap=bootstrap(units),
        commands=[command("interceptor", "move", [{"i": 2, "j": 1}])],
    )
    api.call(
        "make_turn", game, 1, turn=0,
        commands=[command("crossing", "move", [{"i": 2, "j": 1}])],
    )
    _, update = api.call("update_units", game, 1, since_revision=0)
    crossing = unit_by_key(update, "crossing")
    require((crossing["i"], crossing["j"]) == (2, 1), crossing)
    require(any(event["event_type"] == "interception" for event in update["events"]), update)


def test_stale_client_path_is_rebased(api):
    """A speculative client may submit only the route remaining after local movement.

    The first submitted point is not adjacent to the authoritative database
    coordinate. The server must route toward the submitted destination and
    commit one legal speed-1 step instead of rejecting the route and making the
    next update appear to roll the unit back.
    """
    game = unique_game("stale-path")
    units = [unit("stale-mover", 0, 0, 0, speed=1)]
    _, result = api.call(
        "make_turn", game, 0, turn=0, bootstrap=bootstrap(units, players=(0,)),
        commands=[command("stale-mover", "move", [{"i": 0, "j": 3}, {"i": 0, "j": 4}])],
    )
    require(result["resolved_turn"] == 0, result)
    _, update = api.call("update_units", game, 0, since_revision=0)
    moved = unit_by_key(update, "stale-mover")
    require((moved["i"], moved["j"]) == (0, 1), moved)
    require(moved["properties"]["gotoCoord"] == {"i": 0, "j": 4}, moved)


def test_duplicate_submission_keeps_first_orders(api):
    """Repeated End Turn for one server turn cannot replace the first orders."""
    game = unique_game("duplicate-turn")
    units = [unit("final-order", 0, 1, 1), unit("other-player", 1, 4, 4)]
    _, first = api.call(
        "make_turn", game, 0, turn=0, bootstrap=bootstrap(units),
        commands=[command("final-order", "move", [{"i": 2, "j": 1}])],
    )
    require(first["resolved_turn"] is None and first["duplicate_submission"] is False, first)
    _, duplicate = api.call(
        "make_turn", game, 0, turn=0,
        commands=[command("final-order", "move", [{"i": 1, "j": 2}])],
    )
    require(duplicate["resolved_turn"] is None and duplicate["duplicate_submission"] is True, duplicate)
    _, resolved = api.call(
        "make_turn", game, 1, turn=0,
        commands=[command("other-player")],
    )
    require(resolved["resolved_turn"] == 0, resolved)
    _, update = api.call("update_units", game, 0, since_revision=0)
    moved = unit_by_key(update, "final-order")
    require((moved["i"], moved["j"]) == (2, 1), moved)


def test_landscape_and_fog_updates(api):
    """A Worker touches one tile while fog excludes a remote enemy."""
    game = unique_game("landscape")
    tiles = grass_map()
    for tile in tiles:
        if (tile["i"], tile["j"]) == (1, 1):
            tile["terrain_tex"] = 4
    units = [unit("worker", 0, 1, 1, unit_type="worker"), unit("remote-enemy", 1, 4, 4)]
    _, first = api.call(
        "make_turn", game, 0, turn=0,
        bootstrap=bootstrap(units, tiles=tiles),
        commands=[command("worker")],
    )
    require(first["resolved_turn"] is None, first)
    worker_id = first["unit_id_map"]["worker"]
    status, built = api.call("build", game, 0, worker_unit_id=worker_id, building_type="mine")
    require(status == 200 and built["tile"]["modifiers"].get("mine") is True, built)
    _, turn = api.call(
        "make_turn", game, 1, turn=0,
        commands=[command("remote-enemy")],
    )
    require(turn["resolved_turn"] == 0, turn)
    _, landscape = api.call("update_landscape", game, 0, since_revision=1)
    changed = [tile for tile in landscape["tiles"] if (tile["i"], tile["j"]) == (1, 1)]
    require(changed and changed[0]["modifiers"].get("mine") is True, landscape)
    _, units_update = api.call("update_units", game, 0, since_revision=0)
    require(all(record["client_key"] != "remote-enemy" for record in units_update["units"]), units_update)


def test_city_build_and_server_production(api):
    """City construction consumes its Settler and production is server-owned.

    The initial Explorer remains an independent authoritative unit. Selecting a
    Worker is persisted immediately, then the city's five production points per
    turn complete the 20-point Worker after four resolved turns.
    """
    game = unique_game("city-production")
    settler = unit("initial-settler", 0, 2, 2, unit_type="settlers", attack=0, defense=1)
    settler["unit_class"] = 0
    explorer = unit("initial-explorer", 0, 2, 2, speed=2, unit_type="explorer", attack=0, defense=1)
    explorer["unit_class"] = 1
    status, initialized = api.call(
        "make_turn", game, 0, turn=0, bootstrap=bootstrap([settler, explorer], players=(0,)),
        commands=[command("initial-settler"), command("initial-explorer")],
    )
    require(status == 200 and initialized["resolved_turn"] == 0, initialized)
    settler_id = initialized["unit_id_map"]["initial-settler"]
    explorer_id = initialized["unit_id_map"]["initial-explorer"]

    status, built = api.call("build_city", game, 0, settler_unit_id=settler_id)
    require(status == 200 and built["settler"]["deleted"] is True, built)
    require(built["city"]["unit_type_id"] == "city", built)
    city_id = built["city"]["id"]

    _, after_build = api.call("update_units", game, 0, since_revision=0)
    initial_explorer = unit_by_key(after_build, "initial-explorer")
    require(initial_explorer["id"] == explorer_id and not initial_explorer["deleted"], after_build)
    require(set(after_build["owned_unit_ids"]) == {explorer_id, city_id}, after_build)

    status, archer_selected = api.call(
        "select_production", game, 0, city_unit_id=city_id, unit_type_id="archer"
    )
    require(status == 200, archer_selected)

    status, selected = api.call(
        "select_production", game, 0, city_unit_id=city_id, unit_type_id="worker"
    )
    require(status == 200, selected)
    require(selected["city"]["properties"]["production"]["unitTypeId"] == "worker", selected)
    require(selected["city"]["properties"]["production"]["productionPoints"] == 0, selected)

    turn = initialized["turn"]
    for _ in range(4):
        status, resolved = api.call(
            "make_turn", game, 0, turn=turn,
            commands=[
                {"unit_id": city_id, "command": "hold", "path": [], "payload": {}},
                {"unit_id": explorer_id, "command": "hold", "path": [], "payload": {}},
            ],
        )
        require(status == 200 and resolved["resolved_turn"] == turn, resolved)
        turn = resolved["turn"]

    _, completed = api.call("update_units", game, 0, since_revision=0)
    workers = [record for record in completed["units"] if record["unit_type_id"] == "worker" and not record["deleted"]]
    require(len(workers) == 1 and (workers[0]["i"], workers[0]["j"]) == (2, 2), completed)
    cities = [record for record in completed["units"] if record["id"] == city_id and not record["deleted"]]
    require(len(cities) == 1 and cities[0]["properties"]["production"] is None, completed)


def test_full_load_snapshot(api):
    """load_full returns one complete renderable snapshot after authentication.

    It includes every map tile, all owned units, only currently visible foreign
    units, complete fog records, all technologies, civilization rows, and an
    event cursor so a reloaded page does not replay historical combat.
    """
    game = unique_game("full-load")
    observer = unit("full-observer", 0, 0, 0, unit_type="explorer")
    observer["view_range"] = 2
    visible = unit("full-visible", 1, 1, 0)
    hidden = unit("full-hidden", 1, 4, 4)
    api.call(
        "make_turn", game, 0, turn=0,
        bootstrap=bootstrap([observer, visible, hidden]),
        commands=[command("full-observer")],
    )
    api.call(
        "make_turn", game, 1, turn=0,
        commands=[command("full-visible"), command("full-hidden")],
    )
    status, snapshot = api.call("load_full", game, 0)
    require(status == 200 and snapshot["request"] == "load_full", snapshot)
    require(len(snapshot["tiles"]) == 25, snapshot)
    keys = {record["client_key"] for record in snapshot["units"]}
    require("full-observer" in keys and "full-visible" in keys and "full-hidden" not in keys, snapshot)
    require(all(snapshot["player_state"]["openTechnologies"].values()), snapshot)
    require(snapshot["player_state"]["currentResearch"] is None, snapshot)
    require(len(snapshot["civilizations"]) == 2, snapshot)
    require(isinstance(snapshot["last_event_id"], int), snapshot)


def test_combat_event_stream_and_statistics(api):
    """Visible observers receive combat before unit deletion updates.

    Event payloads identify both units, preserve before/after snapshots, mark
    destroyed ids, and advance a separate cursor. Civilization statistics count
    the kill in the same authoritative transaction.
    """
    game = unique_game("combat-events")
    attacker = unit("event-attacker", 0, 1, 1, speed=2, attack=8)
    defender = unit("event-defender", 1, 2, 1, defense=1)
    defender["health"] = 1
    observer = unit("event-observer", 2, 2, 2, unit_type="explorer")
    fixture = bootstrap([attacker, defender, observer], players=(0, 1, 2))
    api.call(
        "make_turn", game, 0, turn=0, bootstrap=fixture,
        commands=[command("event-attacker", "move", [{"i": 2, "j": 1}])],
    )
    api.call("make_turn", game, 1, turn=0, commands=[command("event-defender")])
    _, resolved = api.call("make_turn", game, 2, turn=0, commands=[command("event-observer")])
    require(resolved["resolved_turn"] == 0, resolved)

    status, stream = api.call("update_events", game, 2, since_event_id=0)
    require(status == 200 and stream["events"], stream)
    combat = next(event for event in stream["events"] if event["payload"].get("combat_kind") == "unit_attack")
    require(combat["unit_id"] == combat["payload"]["attacker_before"]["id"], combat)
    require(combat["other_unit_id"] == combat["payload"]["defender_before"]["id"], combat)
    require(combat["payload"]["defender_before"]["health"] == 1, combat)
    require(combat["other_unit_id"] in combat["payload"]["destroyed_unit_ids"], combat)
    _, empty = api.call("update_events", game, 2, since_event_id=stream["last_event_id"])
    require(empty["events"] == [], empty)
    attacker_civ = next(row for row in stream["civilizations"] if row["player_id"] == 0)
    require(attacker_civ["units_killed"] == 1, attacker_civ)


def test_city_attack_event_and_statistics(api):
    """An attack against a City is explicitly typed and counted as City destruction."""
    game = unique_game("city-attack-event")
    attacker = unit("city-attacker", 0, 1, 1, speed=2, attack=8)
    city = unit("city-defender", 1, 2, 1, unit_type="city", defense=1)
    city["unit_class"] = 3
    city["can_move"] = False
    city["health"] = 1
    fixture = bootstrap([attacker, city])
    api.call(
        "make_turn", game, 0, turn=0, bootstrap=fixture,
        commands=[command("city-attacker", "move", [{"i": 2, "j": 1}])],
    )
    _, resolved = api.call("make_turn", game, 1, turn=0, commands=[command("city-defender")])
    require(resolved["resolved_turn"] == 0, resolved)
    _, stream = api.call("update_events", game, 0, since_event_id=0)
    combat = next(event for event in stream["events"] if event["payload"].get("combat_kind") == "city_attack")
    require(combat["other_unit_id"] in combat["payload"]["destroyed_unit_ids"], combat)
    attacker_civ = next(row for row in stream["civilizations"] if row["player_id"] == 0)
    require(attacker_civ["cities_destroyed"] == 1, attacker_civ)


def test_late_submission_closes_turn(api):
    """The first update poll after the 5-second turn plus grace closes missing players.

    At least one player submitted final orders before the deadline. Once it
    passes, polling resolves those orders and every missing player implicitly holds.
    """
    game = unique_game("timeout")
    units = [unit("timer-zero", 0, 1, 1), unit("timer-one", 1, 3, 3)]
    fixture = bootstrap(units)
    fixture["turn_started_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    _, first = api.call(
        "make_turn", game, 0, turn=0, bootstrap=fixture,
        commands=[command("timer-zero", "move", [{"i": 2, "j": 1}])],
    )
    require(first["resolved_turn"] is None, first)
    time.sleep(7)
    _, late = api.call("update_units", game, 0, since_revision=0)
    require(late["resolved_turn"] == 0 and late["turn"] == 1, late)
    _, update = api.call("update_units", game, 0, since_revision=0)
    moved = unit_by_key(update, "timer-zero")
    require((moved["i"], moved["j"]) == (2, 1), moved)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", default="https://softmaximite.com/game/server_game.php")
    parser.add_argument("--secret", default=os.environ.get("AICIV_SERVER_SECRET"))
    parser.add_argument("--skip-timeout", action="store_true")
    args = parser.parse_args()
    secret = args.secret or (ROOT / "api_secret").read_text(encoding="utf-8").strip()
    api = GameApi(args.endpoint, secret)
    tests = [
        test_secret_required,
        test_server_generates_empty_world,
        test_enemy_visible_inside_unit_view_range,
        test_half_turn_interaction,
        test_late_target_can_leave,
        test_path_interception,
        test_stale_client_path_is_rebased,
        test_duplicate_submission_keeps_first_orders,
        test_landscape_and_fog_updates,
        test_city_build_and_server_production,
        test_full_load_snapshot,
        test_combat_event_stream_and_statistics,
        test_city_attack_event_and_statistics,
    ]
    if not args.skip_timeout:
        tests.append(test_late_submission_closes_turn)
    for test in tests:
        test(api)
        print(f"PASS {test.__name__}")
    print(f"Server unit-order tests: {len(tests)}/{len(tests)} passed")


if __name__ == "__main__":
    main()

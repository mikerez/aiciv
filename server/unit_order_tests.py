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
        for attempt in range(3):
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
            except urllib.error.URLError:
                if attempt == 2:
                    raise
                time.sleep(attempt + 1)


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


def city(client_key, owner, i, j):
    record = unit(client_key, owner, i, j, speed=0, unit_type="city", attack=0, defense=0)
    record.update({
        "unit_class": 3,
        "name": "City",
        "can_move": False,
        "view_range": 3,
        "properties": {"cityPopulation": 1, "cityFoodStored": 0},
    })
    return record


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


def test_client_error_report(api):
    """Client failures are accepted as one numbered RTP diagnostic file."""
    status, result = api.call(
        "report_cli_error", unique_game("client-report"), 0,
        source_request_type="make_turn",
        request_parameters={"player_id": 0, "commands": [{"unit_id": 42, "command": "move"}]},
        error_message="Automated client report fixture",
        error_code="fixture_error",
        unit_id=42,
        unsuccessful_action="move",
        destination_point={"i": 2, "j": 3},
        client={"fixture": True},
    )
    require(status == 201 and result["ok"], result)
    require(result["report_number"] > 0, result)
    require(result["report_file"].endswith(f"{result['report_number']:08d}.rtp"), result)


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
    require(result["respawned"] is True, result)
    require(0 <= result["turn_seconds_remaining"] <= 6, result)
    _, update = api.call("update_units", game, 0, since_revision=0)
    own = [record for record in update["units"] if record["owner_id"] == 0 and not record["deleted"]]
    require(len(own) == 4, update)
    require(sorted(record["unit_type_id"] for record in own) == ["explorer", "explorer", "explorer", "settlers"], own)
    center = (result["map_size"] - 1) / 2
    require(all(((record["i"] - center) ** 2 + (record["j"] - center) ** 2) ** 0.5 <= result["map_size"] / 3 for record in own), own)


def test_nonmovable_buildings_do_not_prevent_respawn(api):
    """A City and improvement do not count as units for the respawn gate."""
    game = unique_game("building-only-respawn")
    owned_city = city("respawn-city", 0, 6, 6)
    improvement = unit("respawn-cottage", 0, 5, 6, speed=0, unit_type="building_cottage", attack=0, defense=0)
    improvement.update(unit_class=4, can_move=False, name="Cottage")
    other = unit("respawn-other", 1, 8, 8)
    fixture = {
        "map_size": 12,
        "players": [0, 1],
        "tiles": grass_map(12),
        "units": [owned_city, improvement, other],
    }
    status, result = api.call(
        "make_turn", game, 0, turn=0,
        bootstrap=fixture,
        commands=[command("respawn-city"), command("respawn-cottage")],
    )
    require(status == 200 and result["respawned"] is True, result)
    require(len(result["respawned_unit_id_map"]) == 4, result)
    _, update = api.call("update_units", game, 0, since_revision=0)
    movable = [record for record in update["units"]
               if record["owner_id"] == 0 and record["can_move"] and not record["deleted"]]
    require(sorted(record["unit_type_id"] for record in movable)
            == ["explorer", "explorer", "explorer", "settlers"], movable)


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
    combat_units = {record["id"]: record for record in second["combat_units"]}
    attacker_id = first["unit_id_map"]["fast-attacker"]
    defender_id = first["unit_id_map"]["moving-defender"]
    require(set(combat_units) == {attacker_id, defender_id}, second)
    require(all("health" in record and "max_health" in record and "experience" in record
                for record in combat_units.values()), second)
    require(combat_units[attacker_id]["health"] < 100, second)
    require(combat_units[defender_id]["health"] < 100, second)
    require(sum(record["experience"] for record in combat_units.values()) == 2.25, second)
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
        commands=[command("interceptor", "move", [{"i": 2, "j": 1}], {"attack_owner_id": 1})],
    )
    api.call(
        "make_turn", game, 1, turn=0,
        commands=[command("crossing", "move", [{"i": 2, "j": 1}])],
    )
    _, update = api.call("update_units", game, 1, since_revision=0)
    crossing = unit_by_key(update, "crossing")
    require((crossing["i"], crossing["j"]) == (2, 1), crossing)
    require(any(event["event_type"] == "interception" for event in update["events"]), update)


def test_neutral_units_do_not_fight_until_direct_attack(api):
    """Civilizations begin neutral; crossing the same empty tile is not an attack."""
    game = unique_game("neutral-crossing")
    units = [unit("neutral-a", 0, 1, 1, speed=2), unit("neutral-b", 1, 2, 2, speed=2)]
    api.call(
        "make_turn", game, 0, turn=0, bootstrap=bootstrap(units),
        commands=[command("neutral-a", "move", [{"i": 2, "j": 1}])],
    )
    _, resolved = api.call(
        "make_turn", game, 1, turn=0,
        commands=[command("neutral-b", "move", [{"i": 2, "j": 1}])],
    )
    require(resolved["resolved_turn"] == 0, resolved)
    _, update = api.call("update_units", game, 0, since_revision=0)
    require(not any(event["event_type"] == "interception" for event in update["events"]), update)
    _, stream = api.call("update_events", game, 0, since_event_id=0)
    own_civ = next(row for row in stream["civilizations"] if row["player_id"] == 1)
    require(own_civ["relation"] == "Neutral", stream)


def test_atomic_movement_rejected_without_consuming_turn(api):
    """PHP downgrades an invalid atomic route to hold without blocking the turn."""
    game = unique_game("atomic-path")
    units = [unit("atomic-mover", 0, 0, 0, speed=1)]
    status, rejected = api.call(
        "make_turn", game, 0, turn=0, bootstrap=bootstrap(units, players=(0,)),
        commands=[command("atomic-mover", "move", [{"i": 0, "j": 1}, {"i": 0, "j": 2}])],
    )
    require(status == 200 and rejected["resolved_turn"] == 0, rejected)
    require(rejected["rejected_movements"][0]["reason"] == "movement_exceeds_speed", rejected)

    game = unique_game("atomic-invalid-step")
    status, rejected = api.call(
        "make_turn", game, 0, turn=0, bootstrap=bootstrap(units, players=(0,)),
        commands=[command("atomic-mover", "move", [{"i": 0, "j": 3}])],
    )
    require(status == 200 and rejected["resolved_turn"] == 0, rejected)
    movement_rejection = rejected["rejected_movements"][0]
    require(movement_rejection["reason"] == "movement_path_invalid", rejected)
    require(movement_rejection["validation"]["stopped"]["reason"] == "off_map_or_non_adjacent", rejected)

    game = unique_game("atomic-valid")
    status, result = api.call(
        "make_turn", game, 0, turn=0, bootstrap=bootstrap(units, players=(0,)),
        commands=[command("atomic-mover", "move", [{"i": 0, "j": 1}])],
    )
    require(status == 200, result)
    require(result["resolved_turn"] == 0, result)
    _, update = api.call("update_units", game, 0, since_revision=0)
    moved = unit_by_key(update, "atomic-mover")
    require((moved["i"], moved["j"]) == (0, 1), moved)
    require("gotoPath" not in moved["properties"] and "gotoCoord" not in moved["properties"], moved)


def test_unit_stack_limit_and_attack_exception(api):
    """A sixth ordinary unit is blocked, but five defenders remain attackable by military."""
    full_tile = [unit(f"stack-{index}", 0, 2, 1) for index in range(5)]
    mover = unit("stack-mover", 0, 1, 1)
    game = unique_game("stack-full")
    status, blocked = api.call(
        "make_turn", game, 0, turn=0,
        bootstrap=bootstrap([mover, *full_tile], players=(0,)),
        commands=[command("stack-mover", "move", [{"i": 2, "j": 1}])],
    )
    require(status == 200 and blocked["resolved_turn"] == 0, blocked)
    require(blocked["rejected_movements"][0]["reason"] == "unit_stack_full", blocked)
    require(blocked["rejected_movements"][0]["unit_limit"] == 5, blocked)

    civilian = unit("civilian-mover", 0, 1, 1, unit_type="worker", attack=0)
    enemy_stack = [unit(f"civilian-target-{index}", 1, 2, 1) for index in range(5)]
    game = unique_game("stack-enemy-civilian")
    status, civilian_blocked = api.call(
        "make_turn", game, 0, turn=0,
        bootstrap=bootstrap([civilian, *enemy_stack], players=(0, 1)),
        commands=[command("civilian-mover", "move", [{"i": 2, "j": 1}])],
    )
    require(status == 200, civilian_blocked)
    require(civilian_blocked["rejected_movements"][0]["reason"] == "unit_stack_full", civilian_blocked)

    residents = [unit(f"resident-{index}", 0, 2, 1) for index in range(4)]
    arrivals = [unit("arrival-a", 0, 1, 1), unit("arrival-b", 0, 2, 0)]
    game = unique_game("stack-simultaneous")
    status, simultaneous = api.call(
        "make_turn", game, 0, turn=0,
        bootstrap=bootstrap([*residents, *arrivals], players=(0,)),
        commands=[
            command("arrival-a", "move", [{"i": 2, "j": 1}]),
            command("arrival-b", "move", [{"i": 2, "j": 1}]),
        ],
    )
    require(status == 200 and simultaneous["resolved_turn"] == 0, simultaneous)
    _, simultaneous_update = api.call("update_units", game, 0, since_revision=0)
    target_units = [record for record in simultaneous_update["units"]
                    if record["can_move"] and (record["i"], record["j"]) == (2, 1)]
    require(len(target_units) == 5, simultaneous_update)
    arrival_positions = {(record["i"], record["j"]) for record in simultaneous_update["units"]
                         if record["client_key"] in ("arrival-a", "arrival-b")}
    require(len(arrival_positions) == 2 and (2, 1) in arrival_positions, simultaneous_update)

    attacker = unit("stack-attacker", 0, 1, 1, attack=8)
    defenders = [unit(f"defender-{index}", 1, 2, 1, defense=4) for index in range(5)]
    for defender in defenders:
        defender["health"] = defender["max_health"] = 1000
    game = unique_game("stack-attack")
    status, accepted = api.call(
        "make_turn", game, 0, turn=0,
        bootstrap=bootstrap([attacker, *defenders], players=(0, 1)),
        commands=[command("stack-attacker", "move", [{"i": 2, "j": 1}])],
    )
    require(status == 200, accepted)
    status, resolved = api.call(
        "make_turn", game, 1, turn=0,
        commands=[command(f"defender-{index}") for index in range(5)],
    )
    require(status == 200 and resolved["resolved_turn"] == 0, resolved)
    _, events = api.call("update_events", game, 0, since_event_id=0)
    require(any(event["event_type"] in ("unit_attack", "half_turn_interaction", "turn_collision")
                for event in events["events"]), events)


def test_city_production_pauses_on_full_stack(api):
    """A ready City preserves production while five movable units occupy it."""
    city = unit("stack-city", 0, 2, 2, unit_type="city", attack=0, defense=8)
    city["unit_class"] = 3
    city["can_move"] = False
    city["properties"] = {
        "cityPopulation": 1,
        "cityFoodStored": 0,
        "cityProperties": {"productionPerTurn": 5, "productionStored": 0},
        "production": None,
        "productionQueue": [],
    }
    guards = [unit(f"city-guard-{index}", 0, 2, 2) for index in range(5)]
    game = unique_game("production-stack-pause")
    status, initialized = api.call(
        "make_turn", game, 0, turn=0,
        bootstrap=bootstrap([city, *guards], players=(0,)),
        commands=[command("stack-city")],
    )
    require(status == 200, initialized)
    city_id = initialized["unit_id_map"]["stack-city"]
    guard_id = initialized["unit_id_map"]["city-guard-0"]
    status, selected = api.call(
        "select_production", game, 0, city_unit_id=city_id, unit_type_id="worker"
    )
    require(status == 200, selected)
    turn = initialized["turn"]
    for _ in range(4):
        status, resolved = api.call(
            "make_turn", game, 0, turn=turn,
            commands=[{"unit_id": city_id, "command": "hold", "path": [], "payload": {}}],
        )
        require(status == 200, resolved)
        turn = resolved["turn"]
    status, paused = api.call("complete_production", game, 0, city_unit_id=city_id)
    require(status == 200 and paused["status"] == "PAUSE", paused)
    require(paused["pause_reason"] == "unit_stack_full" and paused["unit_count"] == 5, paused)

    status, moved = api.call(
        "make_turn", game, 0, turn=turn,
        commands=[{"unit_id": guard_id, "command": "move", "path": [{"i": 3, "j": 2}], "payload": {}}],
    )
    require(status == 200, moved)
    status, completed = api.call("complete_production", game, 0, city_unit_id=city_id)
    require(status == 200 and completed.get("status") != "PAUSE", completed)
    require(completed["unit"]["unit_type_id"] == "worker", completed)


def test_client_turn_number_is_informational(api):
    """Commands join the locked authoritative turn regardless of a client turn value."""
    game = unique_game("turn-number-ignored")
    units = [unit("ignored-turn-a", 0, 1, 1), unit("ignored-turn-b", 1, 4, 4)]
    status, first = api.call(
        "make_turn", game, 0, turn=900, bootstrap=bootstrap(units),
        commands=[command("ignored-turn-a", "move", [{"i": 2, "j": 1}])],
    )
    require(status == 200, first)
    require(first["client_turn"] == 900 and first["submitted_turn"] == 0, first)
    status, resolved = api.call(
        "make_turn", game, 1, turn=-7,
        commands=[command("ignored-turn-b")],
    )
    require(status == 200 and resolved["resolved_turn"] == 0, resolved)
    require(resolved["client_turn"] == -7 and resolved["submitted_turn"] == 0, resolved)
    _, update = api.call("update_units", game, 0, since_revision=0)
    moved = unit_by_key(update, "ignored-turn-a")
    require((moved["i"], moved["j"]) == (2, 1), moved)


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


def test_server_discards_client_route_properties(api):
    """Full Goto paths are client-only and never returned from PHP properties."""
    game = unique_game("client-route")
    units = [unit("route-cancel", 0, 0, 0, speed=1)]
    units[0]["properties"] = {
        "gotoPath": [{"i": 0, "j": 1}], "gotoCoord": {"i": 0, "j": 1},
        "pendingServerPath": [{"i": 0, "j": 1}],
    }
    _, first = api.call(
        "make_turn", game, 0, turn=0, bootstrap=bootstrap(units, players=(0,)),
        commands=[command("route-cancel")],
    )
    require(first["resolved_turn"] == 0, first)
    _, update = api.call("update_units", game, 0, since_revision=0)
    stopped = unit_by_key(update, "route-cancel")
    require("gotoPath" not in stopped["properties"], stopped)
    require("gotoCoord" not in stopped["properties"], stopped)
    require("pendingServerPath" not in stopped["properties"], stopped)


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
    """City production is an ordered backlog completed by a validated request."""
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

    status, selected = api.call(
        "select_production", game, 0, city_unit_id=city_id, unit_type_id="worker"
    )
    require(status == 200, selected)
    status, selected = api.call(
        "select_production", game, 0, city_unit_id=city_id, unit_type_id="explorer"
    )
    require(status == 200, selected)
    require(selected["city"]["properties"]["production"]["unitTypeId"] == "worker", selected)
    require(selected["city"]["properties"]["production"]["productionPoints"] == 0, selected)
    require(selected["city"]["properties"]["productionQueue"] == ["worker", "explorer"], selected)

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

    _, ready = api.call("update_units", game, 0, since_revision=0)
    workers = [record for record in ready["units"] if record["unit_type_id"] == "worker" and not record["deleted"]]
    require(not workers, "server must wait for the client's complete_production request")
    city_record = next(record for record in ready["units"] if record["id"] == city_id and not record["deleted"])
    require(city_record["properties"]["production"]["productionPoints"] == 20, ready)

    status, worker_completed = api.call("complete_production", game, 0, city_unit_id=city_id)
    require(status == 200 and worker_completed["unit"]["unit_type_id"] == "worker", worker_completed)
    require(worker_completed["unit"]["health"] == 100, worker_completed)
    require(worker_completed["unit"]["max_health"] == 100, worker_completed)
    require(worker_completed["unit"]["experience"] == 1, worker_completed)
    require(worker_completed["city"]["properties"]["productionQueue"] == ["explorer"], worker_completed)

    for _ in range(3):
        status, resolved = api.call(
            "make_turn", game, 0, turn=turn,
            commands=[
                {"unit_id": city_id, "command": "hold", "path": [], "payload": {}},
                {"unit_id": explorer_id, "command": "hold", "path": [], "payload": {}},
            ],
        )
        require(status == 200 and resolved["resolved_turn"] == turn, resolved)
        turn = resolved["turn"]
    status, explorer_completed = api.call("complete_production", game, 0, city_unit_id=city_id)
    require(status == 200 and explorer_completed["unit"]["unit_type_id"] == "explorer", explorer_completed)
    require(explorer_completed["city"]["properties"]["productionQueue"] == [], explorer_completed)

    api.call("select_production", game, 0, city_unit_id=city_id, unit_type_id="warrior")
    api.call("select_production", game, 0, city_unit_id=city_id, unit_type_id="worker")
    status, removed = api.call("remove_production", game, 0, city_unit_id=city_id, queue_index=1)
    require(status == 200 and removed["removed_unit_type_id"] == "worker", removed)
    require(removed["city"]["properties"]["productionQueue"] == ["warrior"], removed)


def test_fortification_build_and_defense_bonus(api):
    """A Worker-built Fortification adds to its defender's fortified-state bonus."""
    game = unique_game("fortification-defense")
    attacker = unit("fort-attacker", 0, 1, 1, speed=2, attack=5)
    worker = unit("fort-worker", 1, 2, 1, unit_type="worker")
    defender = unit("fort-defender", 1, 2, 1, defense=4)
    defender["state"] = "fortified"
    _, first = api.call(
        "make_turn", game, 0, turn=0,
        bootstrap=bootstrap([attacker, worker, defender]),
        commands=[command("fort-attacker", "move", [{"i": 2, "j": 1}])],
    )
    worker_id = first["unit_id_map"]["fort-worker"]
    status, built = api.call(
        "build", game, 1, worker_unit_id=worker_id, building_type="fortification"
    )
    require(status == 200 and built["tile"]["modifiers"].get("fortification") is True, built)
    status, resolved = api.call(
        "make_turn", game, 1, turn=0,
        commands=[command("fort-worker"), command("fort-defender")],
    )
    require(status == 200 and resolved.get("resolved_turn") == 0, resolved)
    _, stream = api.call("update_events", game, 1, since_event_id=0)
    combat = next(event for event in stream["events"]
                  if event["payload"].get("combat_kind") == "unit_attack")
    require(combat["payload"]["defender_before"]["id"] == first["unit_id_map"]["fort-defender"], combat)
    require(combat["payload"]["defender_defense_bonus"] == 0.75, combat)
    require(combat["payload"]["defender_effective_defense"] == 7.0, combat)


def test_city_growth_is_server_authoritative(api):
    """grow_city checks the population threshold, grows once, and resets food."""
    game = unique_game("city-growth")
    city = unit("growth-city", 0, 2, 2, unit_type="city", defense=8)
    city.update(unit_class=3, can_move=False, properties={"cityPopulation": 1, "cityFoodStored": 0})
    _, initialized = api.call(
        "make_turn", game, 0, turn=0, bootstrap=bootstrap([city], players=(0,)),
        commands=[command("growth-city")],
    )
    city_id = initialized["unit_id_map"]["growth-city"]
    status, rejected = api.call("grow_city", game, 0, city_unit_id=city_id, food_stored=29)
    require(status == 409 and rejected["error"]["code"] == "insufficient_city_food", rejected)
    status, grown = api.call("grow_city", game, 0, city_unit_id=city_id, food_stored=30)
    require(status == 200, grown)
    require(grown["city"]["properties"]["cityPopulation"] == 2, grown)
    require(grown["city"]["properties"]["cityFoodStored"] == 0, grown)


def test_city_heals_units_once_per_turn(api):
    """heal_units validates City occupancy and restores 10% max HP once per turn."""
    game = unique_game("city-healing")
    healing_city = city("healing-city", 0, 2, 2)
    injured = unit("injured-warrior", 0, 2, 2)
    injured["health"] = 50
    outside = unit("outside-warrior", 0, 3, 2)
    outside["health"] = 50
    other = unit("healing-other", 1, 4, 4)
    fixture = bootstrap([healing_city, injured, outside, other])
    api.call(
        "make_turn", game, 0, turn=0, bootstrap=fixture,
        commands=[command("healing-city"), command("injured-warrior"), command("outside-warrior")],
    )
    status, resolved = api.call(
        "make_turn", game, 1, turn=0, commands=[command("healing-other")]
    )
    require(status == 200 and resolved["resolved_turn"] == 0, resolved)
    _, initial = api.call("update_units", game, 0, since_revision=0)
    city_id = unit_by_key(initial, "healing-city")["id"]
    injured_id = unit_by_key(initial, "injured-warrior")["id"]
    outside_id = unit_by_key(initial, "outside-warrior")["id"]

    status, rejected = api.call(
        "heal_units", game, 0, city_unit_id=city_id, unit_ids=[outside_id]
    )
    require(status == 422 and rejected["error"]["code"] == "unit_not_in_city", rejected)

    status, healed = api.call(
        "heal_units", game, 0, city_unit_id=city_id, unit_ids=[injured_id]
    )
    require(status == 200 and healed["status"] == "HEALED", healed)
    require(len(healed["units"]) == 1 and healed["units"][0]["health"] == 60, healed)

    status, duplicate = api.call(
        "heal_units", game, 0, city_unit_id=city_id, unit_ids=[injured_id]
    )
    require(status == 200 and duplicate["status"] == "ALREADY_HEALED", duplicate)
    _, after_duplicate = api.call("update_units", game, 0, since_revision=0)
    require(unit_by_key(after_duplicate, "injured-warrior")["health"] == 60, after_duplicate)
    require(unit_by_key(after_duplicate, "outside-warrior")["health"] == 50, after_duplicate)

    api.call(
        "make_turn", game, 0, turn=1,
        commands=[command("healing-city"), command("injured-warrior"), command("outside-warrior")],
    )
    _, second_turn = api.call(
        "make_turn", game, 1, turn=1, commands=[command("healing-other")]
    )
    require(second_turn["resolved_turn"] == 1, second_turn)
    status, healed_again = api.call(
        "heal_units", game, 0, city_unit_id=city_id, unit_ids=[injured_id]
    )
    require(status == 200 and healed_again["units"][0]["health"] == 70, healed_again)


def test_reset_game_clears_transient_and_world_state(api):
    """The confirmed reset recreates a production world without retaining turns."""
    game = unique_game("reset")
    api.call("make_turn", game, 0, turn=0, commands=[])
    status, result = api.call("reset_game", game, 0, confirm="RESET")
    require(status == 200 and result["turn"] == 0 and result["map_size"] == 100, result)
    _, snapshot = api.call("load_full", game, 0, include_map=True)
    require(len(snapshot["tiles"]) == 10000, snapshot)
    require(snapshot["units"] == [], snapshot)


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
    require("experience" in combat["payload"]["attacker_after"], combat)
    require("experience" in combat["payload"]["defender_after"], combat)
    require(combat["other_unit_id"] in combat["payload"]["destroyed_unit_ids"], combat)
    _, empty = api.call("update_events", game, 2, since_event_id=stream["last_event_id"])
    require(empty["events"] == [], empty)
    attacker_civ = next(row for row in stream["civilizations"] if row["player_id"] == 0)
    require(attacker_civ["units_killed"] == 1, attacker_civ)


def test_empty_city_is_captured_without_attacker_loss(api):
    """An ungarrisoned City changes owner and never enters damage calculation."""
    game = unique_game("empty-city-capture")
    attacker = unit("city-attacker", 0, 1, 1, speed=2, attack=8)
    city = unit("empty-city", 1, 2, 1, unit_type="city", defense=8)
    city.update(unit_class=3, can_move=False, properties={"cityPopulation": 2})
    fixture = bootstrap([attacker, city])
    api.call(
        "make_turn", game, 0, turn=0, bootstrap=fixture,
        commands=[command("city-attacker", "move", [{"i": 2, "j": 1}])],
    )
    _, resolved = api.call(
        "make_turn", game, 1, turn=0,
        commands=[command("empty-city", payload={"city_population": 2})],
    )
    require(resolved["resolved_turn"] == 0, resolved)
    _, update = api.call("update_units", game, 0, since_revision=0)
    captured = unit_by_key(update, "empty-city")
    moved = unit_by_key(update, "city-attacker")
    require(captured["owner_id"] == 0 and not captured["deleted"], captured)
    require(moved["health"] == 100 and (moved["i"], moved["j"]) == (2, 1), moved)
    _, stream = api.call("update_events", game, 0, since_event_id=0)
    capture = next(event for event in stream["events"] if event["payload"].get("combat_kind") == "city_capture")
    require(capture["payload"]["old_owner_id"] == 1 and capture["payload"]["new_owner_id"] == 0, capture)
    attacker_civ = next(row for row in stream["civilizations"] if row["player_id"] == 0)
    require(attacker_civ["cities_occupied"] == 1 and attacker_civ["cities_destroyed"] == 0, attacker_civ)


def test_garrison_death_reduces_population_then_captures_city(api):
    """The strongest military garrison resists; its death costs one population before capture."""
    game = unique_game("garrison-city-capture")
    attacker = unit("garrison-attacker", 0, 1, 1, speed=2, attack=8)
    city = unit("garrison-city", 1, 2, 1, unit_type="city", defense=8)
    city.update(unit_class=3, can_move=False, properties={"cityPopulation": 3})
    garrison = unit("city-garrison", 1, 2, 1, defense=4)
    garrison["health"] = 1
    fixture = bootstrap([attacker, city, garrison])
    api.call(
        "make_turn", game, 0, turn=0, bootstrap=fixture,
        commands=[command("garrison-attacker", "move", [{"i": 2, "j": 1}])],
    )
    _, resolved = api.call(
        "make_turn", game, 1, turn=0,
        commands=[command("garrison-city", payload={"city_population": 3}), command("city-garrison")],
    )
    require(resolved["resolved_turn"] == 0, resolved)
    _, update = api.call("update_units", game, 0, since_revision=0)
    captured = unit_by_key(update, "garrison-city")
    require(captured["owner_id"] == 0, captured)
    require(captured["properties"]["cityPopulation"] == 2, captured)
    _, stream = api.call("update_events", game, 0, since_event_id=0)
    combat = next(event for event in stream["events"] if event["payload"].get("defender_before", {}).get("unit_type_id") == "warrior")
    require(combat["other_unit_id"] in combat["payload"]["destroyed_unit_ids"], combat)


def test_stacked_defender_kill_forces_attacker_retreat(api):
    """Killing one unit does not enter a Tile while another defender remains."""
    game = unique_game("stacked-city-retreat")
    attacker = unit("stack-attacker", 0, 1, 1, speed=2, attack=20)
    city = unit("stack-city", 1, 2, 1, unit_type="city", defense=8)
    city.update(unit_class=3, can_move=False, properties={"cityPopulation": 4})
    first = unit("stack-first", 1, 2, 1, defense=40)
    first["health"] = 1
    second = unit("stack-second", 1, 2, 1, defense=4)
    api.call(
        "make_turn", game, 0, turn=0, bootstrap=bootstrap([attacker, city, first, second]),
        commands=[command("stack-attacker", "move", [{"i": 2, "j": 1}])],
    )
    _, resolved = api.call(
        "make_turn", game, 1, turn=0,
        commands=[command("stack-city"), command("stack-first"), command("stack-second")],
    )
    require(resolved["resolved_turn"] == 0, resolved)
    _, update = api.call("update_units", game, 0, since_revision=0)
    moved = unit_by_key(update, "stack-attacker")
    surviving = unit_by_key(update, "stack-second")
    unchanged_city = unit_by_key(update, "stack-city")
    require((moved["i"], moved["j"]) == (1, 1), moved)
    require((surviving["i"], surviving["j"]) == (2, 1), surviving)
    require(unchanged_city["owner_id"] == 1, unchanged_city)
    require(unchanged_city["properties"]["cityPopulation"] == 3, unchanged_city)
    _, stream = api.call("update_events", game, 0, since_event_id=0)
    combat = next(event for event in stream["events"] if event["payload"].get("combat_kind") == "unit_attack")
    require(combat["payload"].get("attacker_retreated_to") == {"i": 1, "j": 1}, combat)
    require(surviving["id"] in combat["payload"].get("remaining_defender_ids", []), combat)

    game = unique_game("stacked-field-retreat")
    attacker = unit("field-attacker", 0, 1, 1, speed=2, attack=20)
    first = unit("field-first", 1, 2, 1, defense=40)
    first["health"] = 1
    second = unit("field-second", 1, 2, 1, defense=4)
    api.call(
        "make_turn", game, 0, turn=0, bootstrap=bootstrap([attacker, first, second]),
        commands=[command("field-attacker", "move", [{"i": 2, "j": 1}])],
    )
    api.call(
        "make_turn", game, 1, turn=0,
        commands=[command("field-first"), command("field-second")],
    )
    _, update = api.call("update_units", game, 0, since_revision=0)
    require((unit_by_key(update, "field-attacker")["i"], unit_by_key(update, "field-attacker")["j"]) == (1, 1), update)
    require((unit_by_key(update, "field-second")["i"], unit_by_key(update, "field-second")["j"]) == (2, 1), update)


def test_strongest_surviving_garrison_prevents_capture(api):
    """A City selects its highest-defence military occupant and remains owned while that unit survives."""
    game = unique_game("strongest-garrison")
    attacker = unit("garrison-probe", 0, 1, 1, speed=2, attack=2)
    city = unit("defended-city", 1, 2, 1, unit_type="city", defense=8)
    city.update(unit_class=3, can_move=False, properties={"cityPopulation": 3})
    weak = unit("weak-garrison", 1, 2, 1, defense=1)
    strong = unit("strong-garrison", 1, 2, 1, defense=8)
    status, initialized = api.call(
        "make_turn", game, 0, turn=0, bootstrap=bootstrap([attacker, city, weak, strong]),
        commands=[command("garrison-probe", "move", [{"i": 2, "j": 1}])],
    )
    require(status == 200, initialized)
    _, resolved = api.call(
        "make_turn", game, 1, turn=0,
        commands=[
            command("defended-city", payload={"city_population": 3}),
            command("weak-garrison"), command("strong-garrison"),
        ],
    )
    require(resolved["resolved_turn"] == 0, resolved)
    _, stream = api.call("update_events", game, 0, since_event_id=0)
    combat = next(event for event in stream["events"] if event["payload"].get("combat_kind") == "unit_attack")
    require(combat["other_unit_id"] == initialized["unit_id_map"]["strong-garrison"], combat)
    require(not combat["payload"]["destroyed_unit_ids"], combat)
    require(not any(event["payload"].get("combat_kind") == "city_capture" for event in stream["events"]), stream)
    _, owner_update = api.call("update_units", game, 1, since_revision=0)
    require(unit_by_key(owner_update, "defended-city")["owner_id"] == 1, owner_update)


def test_settler_does_not_hide_inside_empty_city(api):
    """A military entrant eliminates an unarmed Settler and captures its ungarrisoned City losslessly."""
    game = unique_game("settler-in-city")
    attacker = unit("settler-attacker", 0, 1, 1, speed=2, attack=8)
    city = unit("settler-city", 1, 2, 1, unit_type="city", defense=8)
    city.update(unit_class=3, can_move=False, properties={"cityPopulation": 2})
    settler = unit("city-settler", 1, 2, 1, unit_type="settlers", attack=0, defense=1)
    settler["unit_class"] = 0
    fixture = bootstrap([attacker, city, settler])
    api.call(
        "make_turn", game, 0, turn=0, bootstrap=fixture,
        commands=[command("settler-attacker", "move", [{"i": 2, "j": 1}])],
    )
    _, resolved = api.call(
        "make_turn", game, 1, turn=0,
        commands=[command("settler-city", payload={"city_population": 2}), command("city-settler")],
    )
    require(resolved["resolved_turn"] == 0, resolved)
    _, update = api.call("update_units", game, 0, since_revision=0)
    require(unit_by_key(update, "settler-city")["owner_id"] == 0, update)
    require(unit_by_key(update, "settler-attacker")["health"] == 100, update)
    _, stream = api.call("update_events", game, 0, since_event_id=0)
    settler_loss = next(
        event for event in stream["events"]
        if event["payload"].get("defender_before", {}).get("unit_type_id") == "settlers"
    )
    require(settler_loss["other_unit_id"] in settler_loss["payload"]["destroyed_unit_ids"], settler_loss)


def test_late_submission_closes_turn(api):
    """Timeout closes missing players while omitted units hold position.

    At least one player submitted final orders before the deadline. Once it
    passes, polling resolves those orders and every missing player implicitly holds.
    """
    game = unique_game("timeout")
    units = [unit("timer-zero", 0, 1, 1), unit("timer-one", 1, 3, 3)]
    fixture = bootstrap(units)
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

    _, waiting = api.call(
        "make_turn", game, 1, turn=1,
        commands=[command("timer-one")],
    )
    require(waiting["resolved_turn"] is None, waiting)
    time.sleep(7)
    _, continued = api.call("update_units", game, 1, since_revision=0)
    require(continued["resolved_turn"] == 1 and continued["turn"] == 2, continued)
    _, second_update = api.call("update_units", game, 0, since_revision=0)
    continued_unit = unit_by_key(second_update, "timer-zero")
    require((continued_unit["i"], continued_unit["j"]) == (2, 1), continued_unit)


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
        test_client_error_report,
        test_server_generates_empty_world,
        test_nonmovable_buildings_do_not_prevent_respawn,
        test_enemy_visible_inside_unit_view_range,
        test_half_turn_interaction,
        test_late_target_can_leave,
        test_path_interception,
        test_neutral_units_do_not_fight_until_direct_attack,
        test_atomic_movement_rejected_without_consuming_turn,
        test_unit_stack_limit_and_attack_exception,
        test_city_production_pauses_on_full_stack,
        test_client_turn_number_is_informational,
        test_duplicate_submission_keeps_first_orders,
        test_server_discards_client_route_properties,
        test_landscape_and_fog_updates,
        test_city_build_and_server_production,
        test_fortification_build_and_defense_bonus,
        test_city_growth_is_server_authoritative,
        test_city_heals_units_once_per_turn,
        test_reset_game_clears_transient_and_world_state,
        test_full_load_snapshot,
        test_combat_event_stream_and_statistics,
        test_empty_city_is_captured_without_attacker_loss,
        test_garrison_death_reduces_population_then_captures_city,
        test_stacked_defender_kill_forces_attacker_retreat,
        test_strongest_surviving_garrison_prevents_capture,
        test_settler_does_not_hide_inside_empty_city,
    ]
    if not args.skip_timeout:
        tests.append(test_late_submission_closes_turn)
    for test in tests:
        test(api)
        print(f"PASS {test.__name__}")
    print(f"Server unit-order tests: {len(tests)}/{len(tests)} passed")


if __name__ == "__main__":
    main()

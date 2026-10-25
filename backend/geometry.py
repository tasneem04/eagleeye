"""Pitch geometry for EagleEye.

Pure functions over one synthetic moment, with no AI involved. Scenario
coordinates use a 0-100 scale on both axes; they are converted to metres on a
105 x 68 pitch so that distances and thresholds mean something on grass.

The selected player is treated as the ball carrier, which lets a learner click
anyone and ask "what if the ball came to me here?". For a player off the ball
whose team has it, `space_value.best_position` also answers "where should I be?".
"""

from __future__ import annotations

import math
from itertools import combinations

from . import space_value
from .agents.describe import channel, relative_direction

PITCH_LENGTH_M = 105.0
PITCH_WIDTH_M = 68.0
GOAL_WIDTH_M = 7.32

LANE_BLOCK_M = 2.5          # an opponent this close to the passing line can cut it out...
LANE_WIDEN_PER_M = 0.06     # ...plus a bit more per metre, as longer passes give defenders time to step in
RECEIVER_SPACE_M = 4.0      # a receiver needs this much room to be "open"
HIGH_PRESSURE_M = 3.0
MEDIUM_PRESSURE_M = 6.0
TRIANGLE_SIDE_M = (6.0, 35.0)
TRIANGLE_MIN_AREA_M2 = 30.0  # rejects near-straight lines
SPACE_RADIUS_M = 15.0
SPACE_GRID_STEP_M = 1.5
SHOT_LANE_BLOCK_M = 1.5
SWITCH_LATERAL_M = 25.0     # an open teammate this far across the pitch is a switch of play
MAX_PASS_M = 40.0           # longest pass we plan an off-ball run for


def to_metres(x: float, y: float) -> tuple[float, float]:
    return x * PITCH_LENGTH_M / 100, y * PITCH_WIDTH_M / 100


def to_units(mx: float, my: float) -> tuple[float, float]:
    return mx * 100 / PITCH_LENGTH_M, my * 100 / PITCH_WIDTH_M


def distance(a, b) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def point_to_segment(p, a, b) -> tuple[float, float]:
    """Distance from p to segment ab, and the unclamped projection parameter t."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    length_sq = dx * dx + dy * dy
    if length_sq == 0:
        return distance(p, a), 0.0
    t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length_sq
    tc = max(0.0, min(1.0, t))
    return distance(p, (a[0] + tc * dx, a[1] + tc * dy)), t


def lane_blockers(a, b, opponents, width=None) -> list[int]:
    """Opponents standing between a and b, close enough to the line to intercept."""
    if width is None:
        width = LANE_BLOCK_M + LANE_WIDEN_PER_M * distance(a, b)
    blockers = []
    for opp in opponents:
        d, t = point_to_segment(opp["pos"], a, b)
        if 0 < t < 1 and d < width:
            blockers.append(opp["id"])
    return blockers


def triangle_area(a, b, c) -> float:
    return abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2


def _r(value: float) -> float:
    return round(value, 1)


def analyze(frame: dict, player_id: int, attacking_direction: dict, prev_frame: dict | None = None) -> dict:
    """`prev_frame` (the keyframe before) gives each player's momentum for pitch control."""
    players = {p["id"]: {**p, "pos": to_metres(p["x"], p["y"])} for p in frame["players"]}
    if player_id not in players:
        raise KeyError(f"player {player_id} is not in this moment")
    _add_velocities(players, frame, prev_frame)

    me = players[player_id]
    attacking = attacking_direction[me["team"]]
    sign = 1 if attacking == "right" else -1
    teammates = [p for p in players.values() if p["team"] == me["team"] and p["id"] != player_id]
    opponents = [p for p in players.values() if p["team"] != me["team"]]

    passing = _passing_options(me, teammates, opponents, sign)
    team_movers = {p["id"]: space_value.mover(p["pos"], p["vel"]) for p in [me, *teammates]}
    opp_movers = [space_value.mover(o["pos"], o["vel"]) for o in opponents]
    for option in passing["teammates"]:
        pos = players[option["id"]]["pos"]
        option["space_value"] = round(space_value.value(pos, list(team_movers.values()), opp_movers, sign), 3)

    shot = _shot(me, opponents, sign)
    shot["xg"] = round(space_value.xg(shot["distance_m"], shot["angle_deg"], shot["lane_clear"]), 2)

    return {
        "selected": {
            "id": me["id"], "team": me["team"], "role": me["role"], "x": me["x"], "y": me["y"],
            "has_ball": frame["ball"]["owner"] == player_id,
        },
        "attacking": attacking,
        "pressure": _pressure(me, opponents),
        **passing,
        "free_space": _free_space(me, opponents, sign),
        "shot": shot,
        "space_value": _space_value(frame, players, me, team_movers, opp_movers, opponents, sign, attacking),
    }


def _add_velocities(players, frame, prev_frame) -> None:
    dt = frame["time"] - prev_frame["time"] if prev_frame else 0
    before = {p["id"]: to_metres(p["x"], p["y"]) for p in prev_frame["players"]} if prev_frame else {}
    for p in players.values():
        if dt > 0 and p["id"] in before:
            p["vel"] = ((p["pos"][0] - before[p["id"]][0]) / dt, (p["pos"][1] - before[p["id"]][1]) / dt)
        else:
            p["vel"] = (0.0, 0.0)


def _space_value(frame, players, me, team_movers, opp_movers, opponents, sign, attacking) -> dict:
    team = list(team_movers.values())
    result = {
        "value_here": round(space_value.value(me["pos"], team, opp_movers, sign), 3),
        "best_position": None,
        "note": None,
        "heatmap": space_value.heatmap(team, opp_movers, sign),
    }

    owner = frame["ball"]["owner"]
    if owner == me["id"]:
        result["note"] = "On the ball: see the passing options."
        return result
    if owner is not None and players[owner]["team"] != me["team"]:
        result["note"] = "The other team has the ball. Defensive positioning is not modelled yet."
        return result
    if me["role"] == "goalkeeper":
        result["note"] = "Goalkeeper positioning is not modelled."
        return result

    origin = players[owner]["pos"] if owner is not None else to_metres(frame["ball"]["x"], frame["ball"]["y"])

    def lane_ok(point):
        return distance(origin, point) <= MAX_PASS_M and not lane_blockers(origin, point, opponents)

    best = space_value.best_position(team_movers[me["id"]], team, opp_movers, sign, lane_ok)
    if best is None:
        result["note"] = "No reachable spot with a clear pass from the ball. Hold your position and keep scanning."
        return result

    bx, by = to_units(*best["point_m"])
    available_here = lane_ok(me["pos"])
    if best["run_m"] < 2:
        direction_text = "hold your position: you are already in the best spot"
    else:
        direction_text = (
            f"{best['run_m']:.0f} m {relative_direction((me['x'], me['y']), (bx, by), attacking)}, "
            f"into the {channel(by, attacking)}"
        )
    result["best_position"] = {
        "x": _r(bx),
        "y": _r(by),
        "value": round(best["value"], 3),
        "run_m": _r(best["run_m"]),
        "gain": round(best["value"] - best["value_here"], 3),
        # False means the ball can't reach you where you stand, so the run is about getting free.
        "available_here": available_here,
        "pass_from": owner,
        "direction_text": direction_text,
    }
    return result


def _pressure(me, opponents) -> dict:
    nearest = sorted(opponents, key=lambda o: distance(o["pos"], me["pos"]))[:3]
    closest = distance(nearest[0]["pos"], me["pos"]) if nearest else math.inf
    if closest < HIGH_PRESSURE_M:
        level = "high"
    elif closest < MEDIUM_PRESSURE_M:
        level = "medium"
    else:
        level = "low"
    return {
        "level": level,
        "nearest_opponents": [{"id": o["id"], "distance_m": _r(distance(o["pos"], me["pos"]))} for o in nearest],
    }


def _passing_options(me, teammates, opponents, sign) -> dict:
    options = []
    for mate in teammates:
        length = distance(me["pos"], mate["pos"])
        blockers = lane_blockers(me["pos"], mate["pos"], opponents)
        space = min((distance(o["pos"], mate["pos"]) for o in opponents), default=math.inf)
        forward = sign * (mate["pos"][0] - me["pos"][0])
        options.append({
            "id": mate["id"],
            "role": mate["role"],
            "x": mate["x"],
            "y": mate["y"],
            "distance_m": _r(length),
            "forward_m": _r(forward),
            "receiver_space_m": _r(space),
            "lane_open": not blockers,
            "blocked_by": blockers,
            "open": not blockers and space >= RECEIVER_SPACE_M,
            # Favour forward progress and a receiver with room; long passes cost a little.
            "score": _r(0.6 * forward + 0.8 * min(space, 12.0) - 0.15 * max(0.0, length - 25.0)),
        })
    options.sort(key=lambda o: o["score"], reverse=True)
    open_options = [o for o in options if o["open"]]

    by_id = {p["id"]: p for p in teammates}
    triangles = []
    lo, hi = TRIANGLE_SIDE_M
    for a, b in combinations([o for o in open_options if o["role"] != "goalkeeper"], 2):
        pa, pb = by_id[a["id"]]["pos"], by_id[b["id"]]["pos"]
        sides = (distance(me["pos"], pa), distance(me["pos"], pb), distance(pa, pb))
        if not all(lo <= s <= hi for s in sides):
            continue
        if lane_blockers(pa, pb, opponents):
            continue
        area = triangle_area(me["pos"], pa, pb)
        if area < TRIANGLE_MIN_AREA_M2:
            continue
        triangles.append({"player_ids": [me["id"], a["id"], b["id"]], "area_m2": _r(area), "score": _r(a["score"] + b["score"])})
    triangles.sort(key=lambda t: t["score"], reverse=True)

    # Third man: a forward teammate with room whom we can't reach directly,
    # but whom an open teammate can. Keep the best link per target.
    links = [o for o in open_options if o["role"] != "goalkeeper"]
    third_man = {}
    for target in options:
        if target["lane_open"] or target["forward_m"] <= 0 or target["receiver_space_m"] < RECEIVER_SPACE_M:
            continue
        if target["role"] == "goalkeeper":
            continue
        for link in links:
            if lane_blockers(by_id[link["id"]]["pos"], by_id[target["id"]]["pos"], opponents):
                continue
            score = _r(target["forward_m"] + link["score"])
            if target["id"] not in third_man or score > third_man[target["id"]]["score"]:
                third_man[target["id"]] = {"player_ids": [me["id"], link["id"], target["id"]], "score": score}

    switch = [
        o["id"] for o in links
        if abs(o["y"] - me["y"]) * PITCH_WIDTH_M / 100 >= SWITCH_LATERAL_M
    ]

    return {
        "teammates": options,
        "open_teammates": [o["id"] for o in open_options],
        "triangles": triangles[:3],
        "third_man": sorted(third_man.values(), key=lambda t: t["score"], reverse=True)[:3],
        "switch_options": switch,
    }


def _free_space(me, opponents, sign) -> dict:
    """The point ahead of the player, within dribbling range, farthest from every opponent."""
    mx, my = me["pos"]
    best = None
    steps = int(SPACE_RADIUS_M / SPACE_GRID_STEP_M)
    for i in range(2, steps + 1):  # at least a few metres forward, not beside the player
        for j in range(-steps, steps + 1):
            px, py = mx + sign * i * SPACE_GRID_STEP_M, my + j * SPACE_GRID_STEP_M
            if distance((px, py), (mx, my)) > SPACE_RADIUS_M:
                continue
            if not (1 <= px <= PITCH_LENGTH_M - 1 and 1 <= py <= PITCH_WIDTH_M - 1):
                continue
            room = min((distance((px, py), o["pos"]) for o in opponents), default=SPACE_RADIUS_M)
            value = room + 0.1 * i * SPACE_GRID_STEP_M  # small nudge toward goal
            if best is None or value > best[0]:
                best = (value, px, py, room)
    if best is None:
        return {"x": me["x"], "y": me["y"], "space_m": 0.0}
    _, px, py, room = best
    ux, uy = to_units(px, py)
    return {"x": _r(ux), "y": _r(uy), "space_m": _r(room)}


def _shot(me, opponents, sign) -> dict:
    goal_x = PITCH_LENGTH_M if sign == 1 else 0.0
    centre = (goal_x, PITCH_WIDTH_M / 2)
    post_a = (goal_x, PITCH_WIDTH_M / 2 - GOAL_WIDTH_M / 2)
    post_b = (goal_x, PITCH_WIDTH_M / 2 + GOAL_WIDTH_M / 2)
    ang_a = math.atan2(post_a[1] - me["pos"][1], post_a[0] - me["pos"][0])
    ang_b = math.atan2(post_b[1] - me["pos"][1], post_b[0] - me["pos"][0])
    angle = abs(math.degrees(ang_b - ang_a))
    if angle > 180:
        angle = 360 - angle
    outfield = [o for o in opponents if o["role"] != "goalkeeper"]
    blockers = lane_blockers(me["pos"], centre, outfield, width=SHOT_LANE_BLOCK_M)  # shots are fast: fixed width
    return {
        "distance_m": _r(distance(me["pos"], centre)),
        "angle_deg": _r(angle),
        "lane_clear": not blockers,
        "blockers": blockers,
    }

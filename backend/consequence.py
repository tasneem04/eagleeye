"""What happens next: a short replay of one choice (pass, dribble or shot), worked out in code.

It uses only the models the rest of EagleEye already uses: the passing-lane check
(geometry.lane_blockers), the reach-time model behind pitch control
(space_value.reach_time) and the shot chance (space_value.xg). It is a simple replay,
not a match simulation: the nearest defenders run straight at the ball, everyone
else stays where they are, and the same choice always gives the same result.
"""

from __future__ import annotations

import math

from . import geometry, space_value
from .geometry import distance, lane_blockers, point_to_segment, to_metres, to_units
from .training import DRIBBLE_SPEED_MPS

PASS_SPEED_MPS = 15.0      # a firm ground pass
SHOT_SPEED_MPS = 25.0
MAX_CARRY_S = 2.0          # replay at most this much of a dribble
CHASERS = 2                # the defenders who react to the ball
STOP_SHORT_M = 1.0         # a chasing defender stops this far from the ball
PRESSED_M = 2.0            # closer than this when the ball arrives: likely to lose it
CLOSED_M = 4.0             # closer than this: under pressure, little time
CAPTION = "Simple replay from the same reach-time model: the nearest defenders run at the ball."


def what_next(frame: dict, player_id: int, attacking_direction: dict, choice: dict,
              prev_frame: dict | None = None) -> dict:
    """Outcome, a sentence and the start/end positions (pitch units) for the replay."""
    players = {p["id"]: {**p, "pos": to_metres(p["x"], p["y"])} for p in frame["players"]}
    if player_id not in players:
        raise ValueError(f"player {player_id} is not in this moment")
    geometry._add_velocities(players, frame, prev_frame)
    me = players[player_id]
    sign = 1 if attacking_direction[me["team"]] == "right" else -1
    opponents = [p for p in players.values() if p["team"] != me["team"]]

    action = choice.get("action")
    if action == "pass":
        target = players.get(choice.get("target_player_id"))
        if target is None or target["team"] != me["team"] or target["id"] == me["id"]:
            raise ValueError("a pass needs a teammate to pass to")
        line = geometry.offside_line(opponents, sign)
        if geometry.is_offside(target["pos"], me["pos"], line, sign):
            result = _offside(me, target)
        else:
            result = _pass(me, target, opponents)
    elif action == "dribble":
        result = _dribble(me, opponents, sign)
    elif action == "shoot":
        result = _shoot(me, opponents, sign)
    else:
        raise ValueError(f"unknown action '{action}'")

    moves, ball_end = result.pop("moves"), result.pop("ball")
    start = {"ball": _units(me["pos"]), "players": [{"id": p["id"], **_units(p["pos"])} for p in players.values()]}
    end = {"ball": _units(ball_end), "players": [
        {"id": p["id"], **_units(moves.get(p["id"], p["pos"]))} for p in players.values()]}
    return {**result, "start": start, "end": end, "moved": sorted(moves), "caption": CAPTION}


def _offside(me, target) -> dict:
    return {
        "outcome": "offside", "tone": "risky", "label": f"Offside: #{target['id']}",
        "text": f"Flag up: #{target['id']} was beyond the last defender when you passed. "
                f"Offside, so the other team gets a free kick.",
        "duration_s": _r(max(0.6, distance(me["pos"], target["pos"]) / PASS_SPEED_MPS)),
        "ball": target["pos"], "moves": {},
    }


def _pass(me, target, opponents) -> dict:
    a, b = me["pos"], target["pos"]
    blockers = [o for o in opponents if o["id"] in lane_blockers(a, b, opponents)]
    if blockers:
        # The blocker nearest the passer along the line reaches the ball first.
        first = min(blockers, key=lambda o: point_to_segment(o["pos"], a, b)[1])
        t = max(0.0, min(1.0, point_to_segment(first["pos"], a, b)[1]))
        point = (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]))
        return {
            "outcome": "intercepted", "tone": "risky", "label": f"Intercepted by #{first['id']}",
            "text": f"#{first['id']} steps into the lane and wins the ball before it reaches #{target['id']}.",
            "duration_s": _r(max(0.6, distance(a, point) / PASS_SPEED_MPS)),
            "ball": point, "moves": {first["id"]: point},
        }

    travel = distance(a, b) / PASS_SPEED_MPS
    moves, gap, closest = _chase(opponents, b, travel)
    on_ball = max(0.0, (gap - STOP_SHORT_M) / space_value.SPEED_MPS)
    who = f"#{closest['id']}" if closest else "a defender"
    if gap < PRESSED_M:
        outcome, tone, label = "pressed", "risky", f"#{target['id']} under pressure"
        text = f"The pass reaches #{target['id']}, but {who} is on them as it arrives: they are likely to lose it."
    elif gap < CLOSED_M:
        outcome, tone, label = "closed_down", "ok", f"#{target['id']} closed down"
        text = f"#{target['id']} gets the ball, but {who} closes in fast: about {on_ball:.1f} s on the ball."
    else:
        outcome, tone, label = "completed", "good", f"#{target['id']} has time"
        text = f"#{target['id']} gets the ball with about {on_ball:.1f} s and room to turn before {who} arrives."
    return {"outcome": outcome, "tone": tone, "label": label, "text": text,
            "duration_s": _r(max(0.6, travel)), "ball": b, "moves": moves}


def _dribble(me, opponents, sign) -> dict:
    space = geometry._free_space(me, opponents, sign)
    goal = to_metres(space["x"], space["y"])
    length = distance(me["pos"], goal)
    carry = min(length, DRIBBLE_SPEED_MPS * MAX_CARRY_S)
    if carry < 1:
        return _tackled_on_the_spot(me, opponents)
    ux, uy = (goal[0] - me["pos"][0]) / length, (goal[1] - me["pos"][1]) / length
    movers = [(o, space_value.mover(o["pos"], o["vel"])) for o in opponents]
    for step in range(1, int(carry) + 1):
        point = (me["pos"][0] + ux * step, me["pos"][1] + uy * step)
        mine = step / DRIBBLE_SPEED_MPS
        o, t = min(((o, space_value.reach_time(m, point)) for o, m in movers), key=lambda x: x[1])
        if t < mine:
            return {
                "outcome": "tackled", "tone": "risky", "label": f"Tackled by #{o['id']}",
                "text": f"#{o['id']} gets to the ball first after about {step} m of your run and wins it.",
                "duration_s": _r(max(0.6, mine)), "ball": point, "moves": {me["id"]: point, o["id"]: point},
            }
    end = (me["pos"][0] + ux * carry, me["pos"][1] + uy * carry)
    run_s = carry / DRIBBLE_SPEED_MPS
    moves, gap, closest = _chase(opponents, end, run_s)
    moves[me["id"]] = end
    who = f"#{closest['id']} is" if closest else "the nearest defender is"
    return {
        "outcome": "carried", "tone": "ok" if gap >= CLOSED_M else "risky", "label": "Carried into space",
        "text": f"You carry the ball about {carry:.0f} m into space; {who} {gap:.0f} m away when you stop.",
        "duration_s": _r(max(0.6, run_s)), "ball": end, "moves": moves,
    }


def _tackled_on_the_spot(me, opponents) -> dict:
    o = min(opponents, key=lambda p: distance(p["pos"], me["pos"]))
    return {"outcome": "tackled", "tone": "risky", "label": f"Tackled by #{o['id']}",
            "text": f"There is no space to carry the ball: #{o['id']} wins it.",
            "duration_s": 0.8, "ball": me["pos"], "moves": {o["id"]: me["pos"]}}


def _shoot(me, opponents, sign) -> dict:
    shot = geometry._shot(me, opponents, sign)
    xg = space_value.xg(shot["distance_m"], shot["angle_deg"], shot["lane_clear"])
    goal = (geometry.PITCH_LENGTH_M if sign == 1 else 0.0, geometry.PITCH_WIDTH_M / 2)
    if not shot["lane_clear"]:
        blockers = [o for o in opponents if o["id"] in shot["blockers"]]
        first = min(blockers, key=lambda o: distance(o["pos"], me["pos"]))
        t = max(0.0, min(1.0, point_to_segment(first["pos"], me["pos"], goal)[1]))
        point = (me["pos"][0] + t * (goal[0] - me["pos"][0]), me["pos"][1] + t * (goal[1] - me["pos"][1]))
        return {"outcome": "blocked", "tone": "risky", "label": f"Blocked by #{first['id']}",
                "text": f"#{first['id']} is in the way and blocks the shot.",
                "duration_s": _r(max(0.5, distance(me["pos"], point) / SHOT_SPEED_MPS)), "ball": point,
                "moves": {first["id"]: point}}
    chance = "less than 1%" if xg < 0.01 else f"about {round(xg * 100)}%"
    tone = "good" if xg >= 0.15 else "ok" if xg >= 0.05 else "risky"
    return {"outcome": "on_goal", "tone": tone, "label": f"Shot: {chance}",
            "text": f"The shot goes towards goal: from {shot['distance_m']:.0f} m it scores {chance} of the time.",
            "duration_s": _r(max(0.6, distance(me["pos"], goal) / SHOT_SPEED_MPS)), "ball": goal, "moves": {}}


def _chase(opponents, point, travel_s) -> tuple[dict, float, dict | None]:
    """The nearest defenders run at `point` while the ball travels. Returns their new spots and the gap left."""
    movers = sorted(opponents, key=lambda o: space_value.reach_time(space_value.mover(o["pos"], o["vel"]), point))
    moves, gap, closest = {}, math.inf, None
    run = space_value.SPEED_MPS * max(0.0, travel_s - space_value.REACTION_S)
    for o in movers[:CHASERS]:
        d = distance(o["pos"], point)
        step = min(run, max(0.0, d - STOP_SHORT_M))
        new = (o["pos"][0] + (point[0] - o["pos"][0]) * step / d, o["pos"][1] + (point[1] - o["pos"][1]) * step / d) if d else o["pos"]
        if step > 0:
            moves[o["id"]] = new
        left = distance(new, point)
        if left < gap:
            gap, closest = left, o
    return moves, gap, closest


def _units(pos) -> dict:
    x, y = to_units(*pos)
    return {"x": round(x, 2), "y": round(y, 2)}


def _r(v: float) -> float:
    return round(v, 2)

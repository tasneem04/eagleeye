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
CONTINUE_S = 2.5           # after the choice, the player on the ball runs at goal for at most this long
ENGAGED_REACTION_S = 0.3   # defenders are already moving by then, so they react faster
SHOOT_FROM_M = 16.0        # the run stops about this far out to shoot
SHOOT_RANGE_M = 30.0       # beyond this, no shot: the attack just goes on
KEEPER_OUT_M = 2.5         # the keeper steps off his line towards the ball
RUN_ANGLES_DEG = (0, -15, 15, -30, 30, -40, 40)  # attackers run into the gap, not straight into a defender
CLOSE_MARGIN_S = 0.2       # stop the run when a defender could arrive this soon after you: closed down
TACKLE_MARGIN_S = 0.3      # a tackle only if a defender is clearly there first
CAPTION = ("What could happen next, from the same reach-time and shot-chance models: the nearest defenders "
           "run at the ball. A simple replay, not a match simulation.")


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

    # Step 1 is the choice itself; then, if the team still has the ball, the attack goes on towards goal.
    pos = {pid: p["pos"] for pid, p in players.items()}
    start = _snapshot(pos, me["pos"])
    moves, ball_end, holder = result.pop("moves"), result.pop("ball"), result.pop("holder", None)
    pos.update(moves)
    steps = [{"duration_s": result["duration_s"], "label": result["label"], **_snapshot(pos, ball_end)}]
    moved = set(moves)
    if holder is not None:
        more, text = _attack_on(holder, pos, players, me["team"], sign)
        steps += more
        moved |= {pid for s in more for pid in s.pop("_moved")}
        result["text"] += " " + text
        result["label"] = steps[-1]["label"]
    result["duration_s"] = _r(sum(s["duration_s"] for s in steps))
    return {**result, "start": start, "steps": steps, "end": steps[-1], "moved": sorted(moved), "caption": CAPTION}


def _snapshot(pos: dict, ball) -> dict:
    return {"ball": _units(ball), "players": [{"id": pid, **_units(p)} for pid, p in pos.items()]}


def _attack_on(holder: int, pos: dict, players: dict, team: str, sign: int) -> tuple[list[dict], str]:
    """The player on the ball runs at goal (stopping if a defender gets there first), then shoots if in range."""
    goal = (geometry.PITCH_LENGTH_M if sign == 1 else 0.0, geometry.PITCH_WIDTH_M / 2)
    here = pos[holder]
    opp_ids = [pid for pid, p in players.items() if p["team"] != team]
    length = distance(here, goal)
    carry = max(0.0, min(DRIBBLE_SPEED_MPS * CONTINUE_S, length - SHOOT_FROM_M))
    steps, text = [], ""
    if carry >= 1:
        run = _best_run(here, goal, carry, [pos[o] for o in opp_ids], opp_ids)
        if run["tackled_by"] is not None:
            who, point = run["tackled_by"], run["end"]
            pos[holder], pos[who] = point, point
            steps.append({"duration_s": _r(max(0.5, run["metres"] / DRIBBLE_SPEED_MPS)), "label": f"Tackled by #{who}",
                          "_moved": [holder, who], **_snapshot(pos, point)})
            return steps, f"Then #{holder} tries to run at goal, but #{who} is already in the way and wins it back."
        end, metres = run["end"], run["metres"]
        if metres >= 1:
            run_s = metres / DRIBBLE_SPEED_MPS
            chase, _, closest = _chase([{**players[o], "pos": pos[o], "vel": (0.0, 0.0)} for o in opp_ids], end,
                                       run_s + space_value.REACTION_S - ENGAGED_REACTION_S)
            pos.update(chase)
            pos[holder] = end
            stopped = run["stopped_by"]
            steps.append({"duration_s": _r(run_s), "label": f"#{holder} runs at goal", "_moved": [holder, *chase],
                          **_snapshot(pos, end)})
            text = (f"Then #{holder} runs about {metres:.0f} m into the gap"
                    + (f" until #{stopped} closes him down." if stopped is not None else "."))
    here = pos[holder]
    opponents = [{**players[o], "pos": pos[o]} for o in opp_ids]
    shot = geometry._shot({"pos": here}, opponents, sign)
    xg = space_value.xg(shot["distance_m"], shot["angle_deg"], shot["lane_clear"])
    chance = "less than 1%" if xg < 0.01 else f"about {round(xg * 100)}%"
    out = distance(here, goal)
    if out > SHOOT_RANGE_M:
        # Too far to shoot: show the goal and the chance a shot would have, but the attack goes on with a pass.
        aim = {"to": _units(goal), "chance": chance}
        label = f"{out:.0f} m out · a shot now: {chance}"
        if steps:
            steps[-1].update(label=label, aim=aim)
        else:
            steps.append({"duration_s": 0.6, "label": label, "aim": aim, "_moved": [], **_snapshot(pos, here)})
        return steps, (text + f" #{holder} is still {out:.0f} m from goal: a shot from there scores {chance} "
                              f"of the time, so the attack goes on with the next pass.").strip()

    # The shot: the keeper steps out on the line of the ball; the chance comes from the same xG model.
    keeper = next((o for o in opp_ids if players[o]["role"] == "goalkeeper"), None)
    moved = []
    if keeper is not None:
        pos[keeper] = (goal[0] + (here[0] - goal[0]) * KEEPER_OUT_M / out, goal[1] + (here[1] - goal[1]) * KEEPER_OUT_M / out)
        moved.append(keeper)
    blocked = "" if shot["lane_clear"] else " through a crowd of defenders"
    steps.append({"duration_s": _r(max(0.6, distance(here, goal) / SHOT_SPEED_MPS)),
                  "label": f"Shot · {chance} chance to score", "_moved": moved, **_snapshot(pos, goal)})
    return steps, (text + f" #{holder} shoots from {distance(here, goal):.0f} m{blocked}: "
                          f"a shot like that scores {chance} of the time.").strip()


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
            "duration_s": _r(max(0.6, travel)), "ball": b, "moves": moves,
            # Under heavy pressure the attack stops here; otherwise the receiver can run on.
            "holder": None if outcome == "pressed" else target["id"]}


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
        "holder": me["id"] if gap >= CLOSED_M else None,
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


def _best_run(here, goal, carry, opp_pos, opp_ids) -> dict:
    """The run towards goal that gets furthest before a defender can close it down.

    Directions within RUN_ANGLES_DEG of the line to goal are tried, metre by metre. The run stops a step
    before a defender could arrive (closed down); it counts as a tackle only if a defender is clearly
    there first, standing in the path from the start.
    """
    base = math.atan2(goal[1] - here[1], goal[0] - here[0])
    best = None
    for offset in RUN_ANGLES_DEG:
        a = base + math.radians(offset)
        ux, uy = math.cos(a), math.sin(a)
        metres, stopped_by, tackled_by, end = 0, None, None, here
        for step in range(1, int(carry) + 1):
            point = (here[0] + ux * step, here[1] + uy * step)
            if not (1 <= point[0] <= geometry.PITCH_LENGTH_M - 1 and 1 <= point[1] <= geometry.PITCH_WIDTH_M - 1):
                break
            mine = step / DRIBBLE_SPEED_MPS
            who, t = min(((o, distance(p, point) / space_value.SPEED_MPS + ENGAGED_REACTION_S)
                          for o, p in zip(opp_ids, opp_pos)), key=lambda x: x[1])
            if t < mine - TACKLE_MARGIN_S and step == 1:
                tackled_by = who
                break
            if t < mine + CLOSE_MARGIN_S:
                stopped_by = who
                break
            metres, end = step, point
        progress = distance(here, goal) - distance(end, goal)
        candidate = {"end": end, "metres": metres, "stopped_by": stopped_by, "tackled_by": tackled_by,
                     "score": progress - 0.2 * abs(offset) / 10}
        if tackled_by is None and (best is None or candidate["score"] > best["score"]):
            best = candidate
    if best is None:  # every direction is blocked straight away
        return candidate
    return best


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

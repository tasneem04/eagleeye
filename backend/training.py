"""Player's Eye training: drills from the scenarios, answer keys and grading.

A trial is a pass between teammates: the learner is the receiver, sees the
moment in first person while the ball travels, scans by turning their head,
and chooses what to do on arrival. The answer key comes from the same
geometry and tactical rules the Analyse mode uses, so both modes agree.
"""

from __future__ import annotations

import math

from . import geometry, space_value
from .agents import decision, tactical
from .agents.describe import channel, relative_direction

# Player profiles. The human (eyes, neck, head speed) is the same at every level; what changes
# is the game around them, as in real football:
# - speed: Rookie and Academy run the whole moment in slow motion to learn the habit.
# - scan_rate: scans per second expected before receiving. Elite midfielders make about
#   0.6-0.8 (Jordet et al.); older and elite youth scan more than younger and grassroots
#   players (Aksum et al., 2021; elite vs grassroots U19: 59% vs 41% of receptions with a scan).
# - decision_s: time on the ball before the defender closes you down (None = no clock).
LEVELS = {
    "rookie": {"label": "Rookie · grassroots", "speed": 0.5, "scan_rate": 0.25, "decision_s": None},
    "academy": {"label": "Academy · youth elite", "speed": 0.75, "scan_rate": 0.45, "decision_s": 3.0},
    "pro": {"label": "Pro · elite", "speed": 1.0, "scan_rate": 0.7, "decision_s": 1.5},
}
FOV_DEG = 90.0
# Vision zones, measured from where the eyes point:
# - within IDENTIFY_DEG you can pick a player out (shirt number and team): about the comfortable
#   eye-in-head range, where detail is still sharp enough;
# - within COLOUR_DEG you can tell the shirt colour but not the number (colour can still be
#   identified at about 60° eccentricity);
# - within PRESENCE_DEG you only notice that something is there (the single-eye edge of the
#   visual field is about 100-107°).
IDENTIFY_DEG = 30.0
COLOUR_DEG = 60.0
PRESENCE_DEG = 100.0
SEEN_HALF_ANGLE_DEG = IDENTIFY_DEG
MAX_GAZE_DEG = 120.0         # furthest gaze with the body facing the ball (neck ~70° + eyes ~30° + a little trunk)
BEHIND_REACH_DEG = MAX_GAZE_DEG + IDENTIFY_DEG
DECISION_POINTS = {"best": 100, "good": 70, "ok": 50, "risky": 0}
DOWNGRADE = {"best": "good", "good": "ok", "ok": "risky", "risky": "risky"}
NOTICED_CREDIT = 0.5         # a player you only saw out of the corner of your eye counts half


def target_scans(level: str, window_s: float) -> int:
    """Scans expected at this level in the time before the ball arrives."""
    return max(1, round(LEVELS[level]["scan_rate"] * window_s))

# Dribble checks: running with the ball is slower than sprinting without it.
DRIBBLE_SPEED_MPS = 5.5
DRIBBLE_LANE_M = 2.0       # an opponent this close to your carry line is in the way
CARRY_SPACE_M = 3.5        # room you need at the end of the carry
ARRIVE_MARGIN_S = 0.2      # you must get there clearly before any opponent
SAME_DIRECTION_DEG = 45


def find_trials(scenario: dict) -> list[dict]:
    """Every pass that travels between teammates, from the passer's first touch to the receiver's."""
    frames = scenario["frames"]
    team = {p["id"]: p["team"] for p in frames[0]["players"]}
    trials = []
    for j, frame in enumerate(frames):
        receiver = frame["ball"]["owner"]
        if receiver is None or j == 0 or frames[j - 1]["ball"]["owner"] is not None:
            continue  # the receiver must get the ball after it has been in flight
        i = j - 1
        while i >= 0 and frames[i]["ball"]["owner"] is None:
            i -= 1
        if i < 0:
            continue
        passer = frames[i]["ball"]["owner"]
        if passer == receiver or team[passer] != team[receiver]:
            continue
        while i > 0 and frames[i - 1]["ball"]["owner"] == passer:
            i -= 1  # start when the passer first has it, for more scanning time
        trials.append({
            "id": f"{scenario['id']}:{j}",
            "scenario_id": scenario["id"],
            "kind": scenario.get("kind", "match"),
            "level": scenario.get("level"),  # drills are built for one level; match moments suit any
            "title": scenario["title"],
            "start_frame": i,
            "arrival_frame": j,
            "window_s": round(frames[j]["time"] - frames[i]["time"], 2),
            "passer": passer,
            "receiver": receiver,
            "team": team[receiver],
        })
    return trials


def bearing_deg(src, dst) -> float:
    """Direction from src to dst in degrees, in pitch metres (y grows to a right-facing team's right)."""
    return math.degrees(math.atan2(dst[1] - src[1], dst[0] - src[0]))


def body_relative(facing: float, bearing: float) -> str:
    """Where something is relative to the way the player's body faces."""
    delta = (bearing - facing + 180) % 360 - 180   # >0 = to the player's right
    side = "right" if delta > 0 else "left"
    a = abs(delta)
    if a <= 30:
        return "in front of you"
    if a <= 70:
        return f"ahead to your {side}"
    if a <= 110:
        return f"to your {side}"
    if a <= 150:
        return f"over your {side} shoulder"
    return "behind you"


def side_of(delta: float) -> str:
    """Which way a player is from the body: front, behind, or over the left/right side."""
    if abs(delta) <= 30:
        return "front"
    if abs(delta) >= 150:
        return "behind"
    return "right" if delta > 0 else "left"


def answer_key(scenario: dict, trial: dict) -> dict:
    frames = scenario["frames"]
    j = trial["arrival_frame"]
    frame, prev = frames[j], frames[j - 1]
    geo = geometry.analyze(frame, trial["receiver"], scenario["attacking_direction"], prev)
    context = tactical.rules(geo, scenario["match_situation"])
    best = decision.geometry_choice(geo, context["mode"])

    pos = {p["id"]: geometry.to_metres(p["x"], p["y"]) for p in frame["players"]}
    me = pos[trial["receiver"]]
    facing = bearing_deg(me, pos[trial["passer"]])  # receiving: body open to the ball

    # What a good scan should have picked up: forward options, the best target and the nearest danger.
    by_id = {o["id"]: o for o in geo["teammates"]}
    options = [i for i in geo["open_teammates"] if by_id[i]["forward_m"] > 0 and by_id[i]["role"] != "goalkeeper"]
    if not options:
        options = [i for i in geo["open_teammates"] if by_id[i]["role"] != "goalkeeper"][:2]
    key = list(dict.fromkeys(
        options
        + ([best["target_player_id"]] if best["target_player_id"] is not None else [])
        + [o["id"] for o in geo["pressure"]["nearest_opponents"][:2]]
    ))
    roles = {p["id"]: (p["team"], p["role"]) for p in frame["players"]}
    key_players = []
    for pid in key:
        bearing = bearing_deg(me, pos[pid])
        delta = (bearing - facing + 180) % 360 - 180
        key_players.append({
            "id": pid,
            "team": roles[pid][0],
            "role": roles[pid][1],
            "open": pid in geo["open_teammates"],
            "where": body_relative(facing, bearing),
            # degrees from where the body faces; beyond BEHIND_REACH_DEG a head turn alone can't see it
            "angle": round(abs(delta), 1),
            "side": side_of(delta),
        })

    return {"geometry": geo, "tactical": context, "best": best, "facing_deg": round(facing, 1),
            "key_players": key_players, "_frame": frame, "_prev": prev}


def carry_check(answer: dict, spot: tuple[float, float]) -> dict:
    """Can the receiver dribble to `spot` (units) safely? Uses the same reach-time model as pitch control."""
    frame, prev = answer["_frame"], answer["_prev"]
    geo = answer["geometry"]
    me_id = geo["selected"]["id"]
    before = {p["id"]: geometry.to_metres(p["x"], p["y"]) for p in prev["players"]}
    dt = frame["time"] - prev["time"]
    opponents = []
    me = None
    for p in frame["players"]:
        pos = geometry.to_metres(p["x"], p["y"])
        if p["id"] == me_id:
            me = pos
        elif p["team"] != geo["selected"]["team"]:
            b = before.get(p["id"], pos)
            vel = ((pos[0] - b[0]) / dt, (pos[1] - b[1]) / dt) if dt > 0 else (0.0, 0.0)
            opponents.append({"id": p["id"], "pos": pos, "mover": space_value.mover(pos, vel)})

    end = geometry.to_metres(*spot)
    dist = geometry.distance(me, end)
    blockers = geometry.lane_blockers(me, end, opponents, width=DRIBBLE_LANE_M)
    my_time = dist / DRIBBLE_SPEED_MPS
    first = min(opponents, key=lambda o: space_value.reach_time(o["mover"], end), default=None)
    beaten_by = None
    if first and space_value.reach_time(first["mover"], end) <= my_time + ARRIVE_MARGIN_S:
        beaten_by = first["id"]
    closest = min(opponents, key=lambda o: geometry.distance(end, o["pos"]), default=None)
    space = geometry.distance(end, closest["pos"]) if closest else 99.0

    free = geometry.to_metres(geo["free_space"]["x"], geo["free_space"]["y"])
    angle = abs(math.degrees(
        math.atan2(end[1] - me[1], end[0] - me[0]) - math.atan2(free[1] - me[1], free[0] - me[0])))
    angle = min(angle, 360 - angle)
    sel = geo["selected"]
    return {
        "safe": not blockers and beaten_by is None and space >= CARRY_SPACE_M,
        "blockers": blockers,
        "beaten_by": beaten_by,
        "space_m": round(space, 1),
        "closest_opponent": closest["id"] if closest else None,
        "distance_m": round(dist, 1),
        "toward_free_space": angle <= SAME_DIRECTION_DEG,
        "words": f"{dist:.0f} m {relative_direction((sel['x'], sel['y']), spot, geo['attacking'])}, "
                 f"into the {channel(spot[1], geo['attacking'])}",
    }


def grade(answer: dict, level: str, scans: int, seen_ids: list[int], choice: dict, *,
          noticed_ids: list[int] = (), window_s: float = 3.0, decision_ms: int | None = None,
          opened_body: bool = False) -> dict:
    """`seen_ids` were identified (number and team); `noticed_ids` only caught in peripheral vision."""
    geo, best = answer["geometry"], answer["best"]
    action, target = choice.get("action"), choice.get("target_player_id")
    by_id = {o["id"]: o for o in geo["teammates"]}
    spot = (choice["target_x"], choice["target_y"]) if choice.get("target_x") is not None else None
    carry = carry_check(answer, spot) if action == "dribble" and spot else None

    if carry is not None:
        if carry["safe"] and best["action"] == "dribble" and carry["toward_free_space"]:
            verdict = "best"
        else:
            verdict = "ok" if carry["safe"] else "risky"
    elif action == best["action"] and (action != "pass" or target == best["target_player_id"]):
        verdict = "best"
    elif action == "pass" and target in geo["open_teammates"]:
        verdict = "good"
    elif action == "dribble" and geo["free_space"]["space_m"] >= 8 and geo["pressure"]["level"] != "high":
        verdict = "ok"
    elif action == "shoot" and geo["shot"]["lane_clear"] and geo["shot"]["xg"] >= 0.1:
        verdict = "ok"
    else:
        verdict = "risky"

    # Too slow on the ball: at higher levels the defender closes you down.
    limit = LEVELS[level]["decision_s"]
    too_slow = limit is not None and decision_ms is not None and decision_ms / 1000 > limit
    if too_slow:
        verdict = DOWNGRADE[verdict]

    key_ids = [k["id"] for k in answer["key_players"]]
    seen = set(seen_ids)
    noticed = set(noticed_ids) - seen
    credit = sum(1.0 if k in seen else NOTICED_CREDIT if k in noticed else 0.0 for k in key_ids)
    coverage = credit / len(key_ids) if key_ids else 1.0
    goal = target_scans(level, window_s)
    scan_part = min(scans / goal, 1.0)
    score = round(0.5 * DECISION_POINTS[verdict] + 30 * coverage + 20 * scan_part)

    missed = [k for k in answer["key_players"] if k["id"] not in seen]
    for m in missed:
        m["noticed"] = m["id"] in noticed
    context = {"too_slow": too_slow, "limit": limit, "decision_ms": decision_ms, "opened_body": opened_body}
    return {
        "verdict": verdict,
        "score": score,
        "coverage": round(coverage, 2),
        "scans": scans,
        "target_scans": goal,
        "missed": missed,
        "carry": carry,
        "too_slow": too_slow,
        "opened_body": opened_body,
        "facts": _facts(answer, verdict, scans, goal, missed, action, target, by_id, carry, context),
    }


def _facts(answer, verdict, scans, target_scans, missed, action, target, by_id, carry=None, context=None) -> list[str]:
    """Plain facts in words, written by code; the coach agent only rephrases them."""
    context = context or {}
    best = answer["best"]
    where = {k["id"]: k["where"] for k in answer["key_players"]}
    times = "time" if scans == 1 else "times"
    facts = [f"You scanned {scans} {times} before the ball arrived (target: {target_scans})."]
    if context.get("opened_body"):
        facts.append("You opened your body to the pitch (half-turn) before receiving.")
    if context.get("too_slow"):
        facts.append(f"You took {context['decision_ms'] / 1000:.1f} s to decide. At this level the defender "
                     f"closes you down after about {context['limit']:.1f} s.")

    if action == "pass" and target is not None:
        chosen = by_id.get(target)
        if chosen and chosen.get("offside"):
            facts.append(f"You chose to pass to #{target}, but #{target} was offside: beyond the last defender "
                         f"when you passed, so the referee gives a free kick to the other team.")
        elif chosen and not chosen["lane_open"]:
            facts.append(f"You chose to pass to #{target}, but #{', #'.join(map(str, chosen['blocked_by']))} blocked that lane.")
        elif chosen and not chosen["open"]:
            facts.append(f"You chose to pass to #{target}, who was tightly marked.")
        else:
            facts.append(f"You chose to pass to #{target}.")
    elif carry is not None:
        toward = f"towards #{target}, " if target is not None else ""
        facts.append(f"You chose to dribble {toward}{carry['words']}.")
        if carry["blockers"]:
            facts.append(f"#{', #'.join(map(str, carry['blockers']))} was standing in your path.")
        elif carry["beaten_by"] is not None:
            facts.append(f"#{carry['beaten_by']} would have reached that spot before you.")
        elif not carry["safe"]:
            facts.append(f"There was no space there: #{carry['closest_opponent']} was only {carry['space_m']:.0f} m away.")
        else:
            facts.append("You had space to carry the ball there.")
    else:
        facts.append(f"You chose to {action}.")

    if verdict == "best":
        facts.append("That was the best option.")
    else:
        target_text = f" to #{best['target_player_id']}, {where.get(best['target_player_id'], '')}" if best["target_player_id"] else ""
        facts.append(f"The best option was to {best['action']}{target_text}: {best['reason']}")

    missed_mates = [m for m in missed if m["open"]]
    if missed_mates:
        m = missed_mates[0]
        if m.get("noticed"):
            facts.append(f"You only caught #{m['id']} ({m['role']}) out of the corner of your eye, free {m['where']}: "
                         f"you saw a shape but never looked at who it was.")
        else:
            facts.append(f"You never looked at #{m['id']} ({m['role']}), who was free {m['where']}.")
        if m["angle"] > BEHIND_REACH_DEG and not context.get("opened_body"):
            facts.append("A head turn alone can't see that far back: open your body to the pitch (receive on the half-turn).")
    elif missed:
        m = missed[0]
        facts.append(f"You never looked at #{m['id']} ({m['role']}), who was {m['where']}.")
    return facts


# ---- learner profile: weak spots and the next drill ---------------------------------
#
# Players are learners, not judges: their drill results never change the coaching
# knowledge. They are only used to spot each player's weak habits and choose drills
# that train them. The history lives in the player's browser; the server keeps nothing.

MIN_EVIDENCE = 3          # drills needed before calling something a weak spot
BLIND_SIDE_SHARE = 0.7    # share of missed free teammates on one side
LEVEL_ORDER = ["rookie", "academy", "pro"]


def trial_meta(scenario: dict, trial: dict) -> dict:
    """Where the free player is in a trial (for drill choice). Never sent to the client."""
    answer = answer_key(scenario, trial)
    target = answer["best"]["target_player_id"]
    key = next((k for k in answer["key_players"] if k["id"] == target), None)
    return {
        "id": trial["id"], "kind": trial["kind"], "level": trial["level"],
        "target_side": key["side"] if key else None,
        "target_angle": key["angle"] if key else None,
    }


def weak_spots(history: list[dict]) -> list[dict]:
    """Habits to work on, worst first. Each needs at least MIN_EVIDENCE drills of evidence."""
    n = len(history)
    spots = []
    if n >= MIN_EVIDENCE:
        short = sum(1 for h in history if h["scans"] < h["target_scans"])
        if short / n >= 0.5:
            spots.append({"key": "scan_more", "severity": short / n, "label": "Scan more often",
                          "detail": f"You reached your scan target in {n - short} of your last {n} drills."})

        risky = sum(1 for h in history if h["verdict"] == "risky")
        if risky / n >= 0.4:
            spots.append({"key": "safer_choices", "severity": risky / n, "label": "Pick the safe, open option",
                          "detail": f"{risky} of your last {n} choices were risky (a blocked pass or a carry into pressure)."})

    timed = [h for h in history if h.get("timed")]
    if len(timed) >= MIN_EVIDENCE:
        slow = sum(1 for h in timed if h.get("too_slow"))
        if slow / len(timed) >= 0.4:
            spots.append({"key": "decide_faster", "severity": slow / len(timed), "label": "Decide faster",
                          "detail": f"You were too slow in {slow} of {len(timed)} drills with a clock. "
                                    f"Scan early so the decision is ready when the ball arrives."})

    missed = [m for h in history for m in h.get("missed", []) if m.get("open")]
    sided = [m for m in missed if m.get("side") in ("left", "right")]
    if len(sided) >= MIN_EVIDENCE:
        for side in ("right", "left"):
            count = sum(1 for m in sided if m["side"] == side)
            if count / len(sided) >= BLIND_SIDE_SHARE:
                spots.append({"key": f"blind_side_{side}", "side": side, "severity": count / len(sided),
                              "label": f"Check your {side} shoulder",
                              "detail": f"{count} of the {len(sided)} free teammates you missed were on your {side}."})

    closed = sum(1 for h in history if not h.get("opened_body")
                 for m in h.get("missed", []) if m.get("open") and m.get("angle", 0) > BEHIND_REACH_DEG)
    if closed >= 2:
        spots.append({"key": "open_body", "severity": min(1.0, closed / max(n, 1) + 0.5),
                      "label": "Open your body (half-turn)",
                      "detail": f"{closed} free teammates were behind you, where a head turn alone can't see."})

    spots.sort(key=lambda s: -s["severity"])
    return spots


def history_item(trial: dict, level: str, result: dict) -> dict:
    """One graded drill in the shape the browser keeps (see frontend/js/training.js): nothing identifying."""
    return {
        "trial_id": trial["id"], "level": level, "score": result["score"], "verdict": result["verdict"],
        "scans": result["scans"], "target_scans": result["target_scans"],
        "timed": LEVELS[level]["decision_s"] is not None, "too_slow": bool(result.get("too_slow")),
        "opened_body": bool(result.get("opened_body")),
        "missed": [{"side": m["side"], "angle": m["angle"], "open": m["open"]} for m in result["missed"][:12]],
    }


def demo_history(scenarios: dict, trials: list[dict], metas: list[dict], drills: int = 4) -> list[dict]:
    """The labelled demo player: scans enough, but never checks over one shoulder (the right, if enough
    drills put the free player there).

    Built by grading scripted drills with the real grading code, so the sample is exactly what a
    player with that habit would produce, and "Your focus" appears without playing 3 drills first.
    """
    sides = {m["id"]: m["target_side"] for m in metas}
    all_drills = [t for t in trials if t["kind"] == "drill"]
    count = {s: sum(sides.get(t["id"]) == s for t in all_drills) for s in ("right", "left")}
    side = "right" if count["right"] >= MIN_EVIDENCE or count["right"] >= count["left"] else "left"
    picks = [t for t in all_drills if sides.get(t["id"]) == side]
    picks.sort(key=lambda t: (LEVEL_ORDER.index(t["level"]), t["id"]))  # easiest first
    history = []
    for trial in picks[:drills]:
        level = trial["level"]
        answer = answer_key(scenarios[trial["scenario_id"]], trial)
        seen = [k["id"] for k in answer["key_players"] if k["side"] != side]
        mates = [k["id"] for k in answer["key_players"]
                 if k["team"] == trial["team"] and k["open"] and k["id"] in seen]
        choice = {"action": "pass", "target_player_id": mates[0]} if mates else {"action": "dribble"}
        goal = target_scans(level, trial["window_s"])
        result = grade(answer, level, goal, seen, choice, window_s=trial["window_s"])
        history.append(history_item(trial, level, result))
    return history


def level_suggestion(history: list[dict], level: str) -> dict | None:
    last = [h for h in history if h.get("level") == level][-3:]
    if len(last) < 3:
        return None
    i = LEVEL_ORDER.index(level)
    if all(h["score"] >= 80 for h in last) and i < len(LEVEL_ORDER) - 1:
        return {"to": LEVEL_ORDER[i + 1], "reason": "3 scores of 80 or more in a row: ready for the next level."}
    if all(h["score"] <= 40 for h in last) and i > 0:
        return {"to": LEVEL_ORDER[i - 1], "reason": "3 low scores in a row: build the habit one level down first."}
    return None


def recommend(history: list[dict], level: str, metas: list[dict], last_trial_id: str | None = None) -> dict:
    """The player's weak spots and the drill that trains the main one."""
    spots = weak_spots(history)
    focus = spots[0] if spots else None
    next_level = level
    drills = [m for m in metas if m["kind"] == "drill" and m["level"] == level and m["id"] != last_trial_id]
    pool = []
    if focus:
        key = focus["key"]
        if key.startswith("blind_side"):
            pool = [m for m in drills if m["target_side"] == focus["side"]]
            # Every third drill comes from the whole set, so the focus doesn't give the answer away.
            if len(history) % 3 == 2:
                pool = []
        elif key == "open_body":
            pool = [m for m in metas if m["kind"] != "drill" and (m["target_angle"] or 0) > BEHIND_REACH_DEG
                    and m["id"] != last_trial_id]
        elif key == "scan_more":
            pool = [m for m in drills if (m["target_angle"] or 0) >= 125]
        elif key == "decide_faster" and LEVELS[level]["decision_s"] is None:
            next_level = "academy"  # practise against a clock
            pool = [m for m in metas if m["kind"] == "drill" and m["level"] == next_level]
    pool = pool or drills or [m for m in metas if m["id"] != last_trial_id]
    pool = sorted(pool, key=lambda m: m["id"])
    pick = pool[len(history) % len(pool)]["id"] if pool else None
    return {
        "weak_spots": [{k: s[k] for k in ("key", "label", "detail")} for s in spots],
        "focus": {k: focus[k] for k in ("key", "label", "detail")} if focus else None,
        "next_trial_id": pick,
        "next_level": next_level,
        "level_suggestion": level_suggestion(history, level),
    }

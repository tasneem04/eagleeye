"""Generate EagleEye's synthetic scenario files.

Every team, player and position here is invented. Nothing is derived from real
matches or tracking data. A scenario is a base formation plus keyframes; each
keyframe only lists the players who moved, and positions carry forward.

It also generates "scan drills" for the Player's Eye training mode: small
rondo-style moments where the receiver faces the passer and the free teammate
is deliberately placed behind their back, so the drill can only be solved by
scanning. Every drill is checked with the same geometry the app uses.

Run from the repo root:  python scripts/generate_scenarios.py
"""

import json
import math
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "scenarios"
sys.path.insert(0, str(ROOT))

ATTACKING_DIRECTION = {"home": "right", "away": "left"}
TEAMS = {"home": {"name": "Blue"}, "away": {"name": "Red"}}
BALL_OFFSET = 0.9  # ball sits just in front of its owner's feet

# id: (team, role, x, y). Home (Blue) attacks toward x = 100.
# y = 0 is the top touchline as drawn, which is Blue's left.
FORMATION_433_VS_442 = {
    1: ("home", "goalkeeper", 6, 50),
    2: ("home", "right back", 30, 82),
    5: ("home", "centre back", 22, 62),
    4: ("home", "centre back", 22, 38),
    3: ("home", "left back", 30, 18),
    6: ("home", "defensive midfielder", 36, 50),
    8: ("home", "central midfielder", 47, 64),
    10: ("home", "attacking midfielder", 49, 36),
    7: ("home", "right winger", 64, 86),
    11: ("home", "left winger", 64, 14),
    9: ("home", "striker", 70, 50),
    12: ("away", "goalkeeper", 95, 50),
    13: ("away", "right back", 77, 20),
    14: ("away", "centre back", 74, 42),
    15: ("away", "centre back", 74, 58),
    16: ("away", "left back", 77, 80),
    17: ("away", "right midfielder", 60, 18),
    18: ("away", "central midfielder", 57, 44),
    19: ("away", "central midfielder", 57, 58),
    20: ("away", "left midfielder", 60, 80),
    21: ("away", "striker", 46, 44),
    22: ("away", "striker", 46, 58),
}

BUILD_UP_TRIANGLE = {
    "id": "build_up_triangle",
    "title": "Build-up: find the free triangle",
    "description": (
        "Blue #6 receives from the centre back while Red's strikers press. "
        "The pass into #10 is cut off, so where is the free option?"
    ),
    "key_frame": 3,
    "match_situation": {"minute": 63, "score": {"home": 0, "away": 0}},
    "keyframes": [
        {"time": 0.0, "owner": 4},
        {"time": 1.2, "ball": (29, 44), "move": {6: (37, 50), 21: (44, 46), 22: (46, 50)}},
        {
            "time": 2.2,
            "owner": 6,
            "move": {
                6: (38, 51), 21: (43, 48), 22: (45, 45), 8: (49, 64), 2: (34, 84),
                18: (56, 46), 19: (56, 56), 14: (72, 46), 15: (72, 55), 4: (24, 36),
            },
        },
        {
            # Key moment: #10 is screened by #21/#22, #8 and #2 form a triangle with #6.
            "time": 3.0,
            "owner": 6,
            "move": {
                6: (39, 51), 21: (42.5, 47), 22: (45, 43), 10: (50, 35), 8: (50, 64),
                2: (36, 84), 7: (66, 86), 20: (61, 80), 9: (70, 50),
            },
        },
        {"time": 3.9, "ball": (46, 58), "move": {8: (53, 63), 6: (40, 51), 21: (41, 49), 19: (57, 58)}},
        {
            "time": 4.8,
            "owner": 8,
            "move": {8: (55, 62), 2: (42, 85), 7: (70, 84), 20: (60, 75), 19: (58, 60), 16: (78, 78), 6: (43, 52)},
        },
        {"time": 5.8, "ball": (64, 74), "move": {20: (59, 71), 7: (72, 85), 2: (48, 86), 16: (78, 81)}},
        {"time": 6.8, "owner": 7, "move": {7: (74, 86), 16: (78, 83), 9: (76, 52), 8: (60, 62)}},
    ],
}


def build_frames(base, keyframes):
    positions = {pid: [x, y] for pid, (_, _, x, y) in base.items()}
    frames = []
    for kf in keyframes:
        for pid, (x, y) in kf.get("move", {}).items():
            positions[pid] = [x, y]

        owner = kf.get("owner")
        if owner is not None:
            team = base[owner][0]
            step = BALL_OFFSET if ATTACKING_DIRECTION[team] == "right" else -BALL_OFFSET
            bx, by = positions[owner][0] + step, positions[owner][1]
        else:
            bx, by = kf["ball"]

        frames.append({
            "time": kf["time"],
            "ball": {"x": round(bx, 1), "y": round(by, 1), "owner": owner},
            "players": [
                {"id": pid, "team": team, "x": round(positions[pid][0], 1),
                 "y": round(positions[pid][1], 1), "role": role}
                for pid, (team, role, _, _) in base.items()
            ],
        })
    return frames


def build_scenario(spec, base):
    return {
        "id": spec["id"],
        "title": spec["title"],
        "description": spec["description"],
        "synthetic": True,
        "teams": TEAMS,
        "attacking_direction": ATTACKING_DIRECTION,
        "key_frame": spec["key_frame"],
        "match_situation": spec["match_situation"],
        "frames": build_frames(base, spec["keyframes"]),
    }


# ---- scan drills --------------------------------------------------------------

# What changes between levels is the game, not the human: how close the press is and how many
# opponents crowd the picture. Pro adds a defender shadowing the free player. Every drill has a Red
# keeper and a back line behind the free player, so he is onside (Law 11) as in a real match:
# Rookie keeper + 1 centre back, Academy keeper + 2 centre backs, Pro keeper + a back four.
DRILL_LEVELS = {
    "rookie": {"count": 5, "presser_m": (7.0, 10.0), "screen": False, "shadow": False, "backline": ("cb",)},
    "academy": {"count": 5, "presser_m": (4.5, 7.0), "screen": True, "shadow": False, "backline": ("cb", "cb")},
    "pro": {"count": 5, "presser_m": (3.5, 5.0), "screen": True, "shadow": True,
            "backline": ("cb", "cb", "fb", "fb")},
}
KEEPER, BACKLINE_IDS = 12, (20, 21, 22, 23)
OUTSIDE_VIEW_DEG = 100   # the free teammate must be at least this far from where the receiver faces...
REACHABLE_DEG = 145      # ...but still within a realistic head turn (120° gaze + 30° picked-out field, minus margin)
RECEIVER, PASSER, TARGET, DECOY_A, DECOY_B = 8, 6, 10, 4, 11


def _units(x_m, y_m):
    return x_m * 100 / 105, y_m * 100 / 68


def _metres(x, y):
    return x * 1.05, y * 0.68


def _offset(origin, dist_m, angle_deg):
    ox, oy = _metres(*origin)
    a = math.radians(angle_deg)
    return _units(ox + dist_m * math.cos(a), oy + dist_m * math.sin(a))


def _inside(p):
    return 4 <= p[0] <= 96 and 4 <= p[1] <= 96


def _toward(src, dst, dist_m):
    (sx, sy), (dx, dy) = _metres(*src), _metres(*dst)
    return _offset(src, dist_m, math.degrees(math.atan2(dy - sy, dx - sx)))


def _press(presser, receiver, step_m, keep_m=1.5):
    """The presser closes in, but arrives about a stride away rather than on top of the receiver."""
    (px, py), (rx, ry) = _metres(*presser), _metres(*receiver)
    return _toward(presser, receiver, max(0.0, min(step_m, math.hypot(rx - px, ry - py) - keep_m)))


def _drill_candidate(rng, profile):
    """One random rondo-style moment. Blue (home) attacks toward x = 100."""
    receiver = (rng.uniform(40, 60), rng.uniform(30, 70))
    passer = _offset(receiver, rng.uniform(14, 22), rng.uniform(150, 210))        # behind the play
    target = _offset(receiver, rng.uniform(12, 20), rng.choice([-1, 1]) * rng.uniform(30, 80))  # forward, over a shoulder
    decoy_a = _offset(receiver, rng.uniform(10, 16), rng.uniform(110, 150))       # visible, but marked
    decoy_b = _offset(receiver, rng.uniform(10, 16), rng.uniform(-150, -110))
    marker_a = _offset(decoy_a, rng.uniform(1.0, 2.0), rng.uniform(0, 360))
    marker_b = _offset(decoy_b, rng.uniform(1.0, 2.0), rng.uniform(0, 360))
    presser = _offset(receiver, rng.uniform(*profile["presser_m"]), rng.uniform(100, 260))  # closing in from the front
    base = {
        PASSER: ("home", "defensive midfielder", *passer),
        RECEIVER: ("home", "central midfielder", *receiver),
        TARGET: ("home", "attacking midfielder", *target),
        DECOY_A: ("home", "centre back", *decoy_a),
        DECOY_B: ("home", "full back", *decoy_b),
        14: ("away", "central midfielder", *marker_a),
        15: ("away", "central midfielder", *marker_b),
        16: ("away", "striker", *presser),
    }
    base[KEEPER] = ("away", "goalkeeper", rng.uniform(93.5, 95.5), rng.uniform(46, 54))  # a few metres off his line
    base.update(_backline(rng, target, profile["backline"]))
    if profile["screen"]:
        base[18] = ("away", "wide midfielder",
                    *_offset(receiver, rng.uniform(8, 12), rng.uniform(60, 90) * rng.choice([-1, 1])))
    if profile["shadow"]:
        base[19] = ("away", "defensive midfielder", *_offset(target, rng.uniform(5, 7), rng.uniform(0, 360)))
    if not all(_inside((x, y)) for _, _, x, y in base.values()):
        return None

    # About 3.6 s from the passer's first touch to the ball reaching you, as in a real build-up:
    # first touch, set the pass, ball travels. The press and the free player keep moving.
    touch = _toward(passer, receiver, 1.5)
    mid = ((touch[0] + receiver[0]) / 2, (touch[1] + receiver[1]) / 2)
    keyframes = [
        {"time": 0.0, "owner": PASSER},
        {"time": 1.4, "owner": PASSER, "move": {PASSER: touch, 16: _press(presser, receiver, 1.0)}},
        {"time": 2.6, "ball": mid, "move": {16: _press(presser, receiver, 2.2), TARGET: _toward(target, receiver, -1.0)}},
        {"time": 3.6, "owner": RECEIVER, "move": {16: _press(presser, receiver, 3.0)}},
    ]
    return base, keyframes


def _backline(rng, target, shape) -> dict:
    """Red's back line, 5-12 m deeper than the free player (so he is onside), centre backs either side
    of him and full backs wide."""
    tx, ty = _metres(*target)
    depth = min(tx + rng.uniform(5, 12), 98.0)
    line = {}
    cb_sides = [-1, 1] if shape.count("cb") > 1 else [rng.choice([-1, 1])]
    for i, kind in enumerate(shape):
        if kind == "cb":
            y = ty + cb_sides.pop() * rng.uniform(6, 12)
            role = "centre back"
        else:
            y = 9.0 if not any(r == "full back" and yy < 34 for r, yy in line.values()) else 59.0
            y += rng.uniform(-3, 3)
            role = "full back"
        line[BACKLINE_IDS[i]] = (role, min(max(y, 3.0), 65.0))
    return {pid: ("away", role, *_units(depth + rng.uniform(-1.5, 1.5), y)) for pid, (role, y) in line.items()}


def _drill_ok(scenario) -> bool:
    from backend import training

    trials = training.find_trials(scenario)
    if len(trials) != 1:
        return False
    answer = training.answer_key(scenario, trials[0])
    best = answer["best"]
    if best["action"] != "pass" or best["target_player_id"] != TARGET:
        return False
    by_id = {o["id"]: o for o in answer["geometry"]["teammates"]}
    if by_id[TARGET]["offside"]:  # the free player must be free because of space, not because he's offside
        return False
    frame = scenario["frames"][-1]
    pos = {p["id"]: _metres(p["x"], p["y"]) for p in frame["players"]}
    delta = (training.bearing_deg(pos[RECEIVER], pos[TARGET]) - answer["facing_deg"] + 180) % 360 - 180
    decoys_closed = not any(i in answer["geometry"]["open_teammates"] for i in (DECOY_A, DECOY_B))
    return OUTSIDE_VIEW_DEG <= abs(delta) <= REACHABLE_DEG and decoys_closed


def scan_drill(level: str, n: int, seed: int) -> dict:
    rng = random.Random(seed)
    profile = DRILL_LEVELS[level]
    for _ in range(8000):
        candidate = _drill_candidate(rng, profile)
        if candidate is None:
            continue
        base, keyframes = candidate
        scenario = build_scenario({
            "id": f"scan_drill_{level}_{n:02d}",
            "title": f"{level.capitalize()} scan drill {n}",
            "description": "Small-sided drill against a keeper and a back line. #6 plays the ball to #8. "
                           "Scan before it arrives and find the free player.",
            "key_frame": len(keyframes) - 1,
            "match_situation": {"minute": 50, "score": {"home": 0, "away": 0}},
            "keyframes": keyframes,
        }, base)
        scenario["kind"] = "drill"
        scenario["level"] = level
        if _drill_ok(scenario):
            return scenario
    raise RuntimeError(f"could not build {level} scan drill {n}")


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("scan_drill_*.json"):
        old.unlink()  # drills are fully regenerated from their seeds
    scenarios = [build_scenario(BUILD_UP_TRIANGLE, FORMATION_433_VS_442)]
    for li, (level, profile) in enumerate(DRILL_LEVELS.items()):
        scenarios += [scan_drill(level, n, seed=1000 * (li + 1) + n) for n in range(1, profile["count"] + 1)]
    for scenario in scenarios:
        path = OUT_DIR / f"{scenario['id']}.json"
        path.write_text(json.dumps(scenario, indent=2), encoding="utf-8")
        print(f"wrote {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

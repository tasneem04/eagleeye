import json
from pathlib import Path

from backend import space_value as sv
from backend.geometry import analyze

DIRECTIONS = {"home": "right", "away": "left"}
SCENARIOS = Path(__file__).resolve().parents[2] / "data" / "scenarios"


def m(x, y, vx=0.0, vy=0.0):
    return sv.mover((x, y), (vx, vy))


def test_control_follows_who_is_closer():
    team, opp = [m(50, 34)], [m(80, 34)]
    assert sv.control((52, 34), team, opp) > 0.9
    assert sv.control((78, 34), team, opp) < 0.1


def test_momentum_helps_a_player_already_running_there():
    opp = [m(60, 34)]
    standing = sv.control((60, 20), [m(60, 48)], opp)
    sprinting = sv.control((60, 20), [m(60, 48, 0, -7)], opp)
    assert sprinting > standing


def test_threat_rises_toward_goal_and_centre():
    assert sv.threat((95, 34), 1) > sv.threat((60, 34), 1) > sv.threat((20, 34), 1)
    assert sv.threat((95, 34), 1) > sv.threat((95, 5), 1)
    assert sv.threat((10, 34), -1) > sv.threat((95, 34), -1)  # mirrored for the other team


def test_xg_drops_with_distance_and_a_blocked_lane():
    assert sv.xg(11, 37, True) > sv.xg(25, 16, True) > sv.xg(35, 11, True)
    assert sv.xg(11, 37, False) < sv.xg(11, 37, True)


def moment(players, owner):
    return {
        "time": 1.0,
        "ball": {"x": 0, "y": 0, "owner": owner},
        "players": [{"id": i, "team": t, "x": x, "y": y, "role": r} for i, t, x, y, r in players],
    }


def test_blocked_runner_moves_to_a_spot_the_ball_can_reach():
    m_ = moment([
        (1, "home", 40, 50, "cm"), (2, "home", 60, 50, "st"),
        (12, "away", 50, 50, "cm"), (13, "away", 90, 50, "goalkeeper"),
    ], owner=1)
    best = analyze(m_, 2, DIRECTIONS)["space_value"]["best_position"]
    assert best is not None
    assert best["available_here"] is False
    assert abs(best["y"] - 50) > 3  # stepped out of the blocked line


def test_no_best_position_on_the_ball_or_when_defending():
    m_ = moment([(1, "home", 40, 50, "cm"), (12, "away", 60, 50, "st")], owner=12)
    assert analyze(m_, 1, DIRECTIONS)["space_value"]["best_position"] is None
    assert analyze(m_, 12, DIRECTIONS)["space_value"]["note"].startswith("On the ball")


def test_key_moment_runs_make_football_sense():
    scenario = json.loads((SCENARIOS / "build_up_triangle.json").read_text(encoding="utf-8"))
    k = scenario["key_frame"]
    frame, prev = scenario["frames"][k], scenario["frames"][k - 1]

    eight = analyze(frame, 8, scenario["attacking_direction"], prev)["space_value"]["best_position"]
    assert eight["gain"] > 0 and eight["available_here"] is True  # open already, moves into better space

    ten = analyze(frame, 10, scenario["attacking_direction"], prev)["space_value"]["best_position"]
    assert ten["available_here"] is False  # screened by the strikers: the run is about getting free

    carrier = analyze(frame, 6, scenario["attacking_direction"], prev)
    best_open = max((o for o in carrier["teammates"] if o["open"]), key=lambda o: o["space_value"])
    assert best_open["id"] == 8

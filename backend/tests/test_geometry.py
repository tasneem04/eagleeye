import json
from pathlib import Path

from backend.geometry import analyze

DIRECTIONS = {"home": "right", "away": "left"}
SCENARIOS = Path(__file__).resolve().parents[2] / "data" / "scenarios"


def moment(players, owner=1):
    return {
        "time": 0.0,
        "ball": {"x": 0, "y": 0, "owner": owner},
        "players": [
            {"id": pid, "team": team, "x": x, "y": y, "role": role}
            for pid, team, x, y, role in players
        ],
    }


def option(result, pid):
    return next(o for o in result["teammates"] if o["id"] == pid)


def test_opponent_on_the_line_blocks_the_lane():
    m = moment([(1, "home", 10, 50, "cm"), (2, "home", 30, 50, "st"), (12, "away", 20, 50, "cb")])
    result = analyze(m, 1, DIRECTIONS)
    assert option(result, 2)["lane_open"] is False
    assert option(result, 2)["blocked_by"] == [12]
    assert result["open_teammates"] == []


def test_clear_lane_and_space_means_open():
    m = moment([(1, "home", 10, 50, "cm"), (2, "home", 30, 50, "st"), (12, "away", 20, 90, "cb")])
    result = analyze(m, 1, DIRECTIONS)
    assert option(result, 2)["open"] is True
    assert result["open_teammates"] == [2]


def test_tight_marker_behind_receiver_closes_them_but_not_the_lane():
    m = moment([(1, "home", 10, 50, "cm"), (2, "home", 30, 50, "st"), (12, "away", 31, 51, "cb")])
    result = analyze(m, 1, DIRECTIONS)
    assert option(result, 2)["lane_open"] is True
    assert option(result, 2)["open"] is False


def test_triangle_found_with_two_open_teammates():
    m = moment([
        (1, "home", 40, 50, "cm"), (2, "home", 50, 30, "cm"), (3, "home", 50, 70, "cm"),
        (12, "away", 90, 50, "cb"),
    ])
    result = analyze(m, 1, DIRECTIONS)
    assert [t["player_ids"] for t in result["triangles"]] == [[1, 2, 3]]


def test_collinear_players_are_not_a_triangle():
    m = moment([
        (1, "home", 40, 50, "cm"), (2, "home", 50, 50, "cm"), (3, "home", 60, 50, "cm"),
        (12, "away", 90, 10, "cb"),
    ])
    result = analyze(m, 1, DIRECTIONS)
    assert result["triangles"] == []


def test_pressure_levels():
    close = moment([(1, "home", 50, 50, "cm"), (12, "away", 52, 50, "cm")])
    far = moment([(1, "home", 50, 50, "cm"), (12, "away", 70, 50, "cm")])
    assert analyze(close, 1, DIRECTIONS)["pressure"]["level"] == "high"
    assert analyze(far, 1, DIRECTIONS)["pressure"]["level"] == "low"


def test_forward_progress_follows_attacking_direction():
    m = moment([(12, "away", 50, 50, "cm"), (13, "away", 40, 50, "st"), (1, "home", 90, 90, "cb")], owner=12)
    result = analyze(m, 12, DIRECTIONS)
    assert option(result, 13)["forward_m"] > 0
    assert result["attacking"] == "left"


def test_shot_angle_and_blocked_shooting_lane():
    near = moment([(9, "home", 90, 50, "st"), (12, "away", 99, 50, "goalkeeper")], owner=9)
    far = moment([(9, "home", 60, 50, "st"), (14, "away", 75, 50, "cb")], owner=9)
    near_shot = analyze(near, 9, DIRECTIONS)["shot"]
    far_shot = analyze(far, 9, DIRECTIONS)["shot"]
    assert near_shot["angle_deg"] > far_shot["angle_deg"]
    assert near_shot["lane_clear"] is True  # goalkeeper does not count as a blocker
    assert far_shot["blockers"] == [14]


def test_third_man_reaches_the_blocked_runner_through_an_open_teammate():
    m = moment([
        (1, "home", 30, 50, "cm"), (2, "home", 40, 75, "cm"), (3, "home", 50, 50, "st"),
        (12, "away", 40, 50, "cm"), (13, "away", 70, 20, "cb"),
    ])
    result = analyze(m, 1, DIRECTIONS)
    assert option(result, 3)["lane_open"] is False
    assert result["third_man"][0]["player_ids"] == [1, 2, 3]


def test_switch_of_play_to_far_side():
    m = moment([(1, "home", 40, 10, "cm"), (2, "home", 45, 90, "lb"), (12, "away", 90, 50, "cb")])
    assert analyze(m, 1, DIRECTIONS)["switch_options"] == [2]


def test_build_up_scenario_key_moment_teaches_the_triangle():
    scenario = json.loads((SCENARIOS / "build_up_triangle.json").read_text(encoding="utf-8"))
    frame = scenario["frames"][scenario["key_frame"]]
    result = analyze(frame, 6, scenario["attacking_direction"])

    assert result["selected"]["has_ball"] is True
    assert option(result, 10)["lane_open"] is False      # the obvious pass is cut off
    assert option(result, 9)["open"] is False            # striker is marked
    assert result["open_teammates"][0] == 8              # best open option
    assert result["triangles"][0]["player_ids"] == [6, 8, 2]
    assert [6, 8, 10] in [t["player_ids"] for t in result["third_man"]]  # #10 reachable via #8

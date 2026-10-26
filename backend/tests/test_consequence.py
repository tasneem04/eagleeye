import pytest

from backend import consequence
from backend.app import load_scenarios

SCENARIO = load_scenarios()["build_up_triangle"]
FRAME, PREV = SCENARIO["frames"][3], SCENARIO["frames"][2]   # key moment: #6 on the ball


def replay(choice):
    return consequence.what_next(FRAME, 6, SCENARIO["attacking_direction"], choice, PREV)


def test_blocked_pass_is_intercepted_by_a_blocker():
    r = replay({"action": "pass", "target_player_id": 10})   # lane blocked by #21 and #22
    assert r["outcome"] == "intercepted" and r["tone"] == "risky"
    assert r["moved"][0] in (21, 22) and f"#{r['moved'][0]}" in r["text"]


def test_open_pass_arrives_and_back_pass_has_more_time():
    forward = replay({"action": "pass", "target_player_id": 8})
    back = replay({"action": "pass", "target_player_id": 3})
    assert forward["outcome"] != "intercepted" and back["outcome"] == "completed"
    seconds = lambda r: float(r["text"].split("about ")[1].split(" s")[0])  # noqa: E731
    assert seconds(back) > seconds(forward)


def test_long_shot_has_almost_no_chance():
    r = replay({"action": "shoot"})
    assert r["outcome"] in ("blocked", "on_goal") and r["tone"] == "risky"


def test_dribble_moves_the_carrier_and_is_repeatable():
    first, again = replay({"action": "dribble"}), replay({"action": "dribble"})
    assert first == again
    assert 6 in first["moved"]
    assert first["caption"].startswith("Simple replay")


def test_only_the_ball_carrier_and_teammates(make_client):
    with pytest.raises(ValueError):
        replay({"action": "pass", "target_player_id": 21})   # an opponent is not a pass
    client, _ = make_client()
    with client:
        ok = client.post("/api/what-next", json={"scenario_id": "build_up_triangle", "frame_index": 3, "player_id": 6,
                                                 "choice": {"action": "pass", "target_player_id": 8}})
        off_ball = client.post("/api/what-next", json={"scenario_id": "build_up_triangle", "frame_index": 3,
                                                       "player_id": 8, "choice": {"action": "shoot"}})
    assert ok.status_code == 200 and {"start", "end", "duration_s"} <= set(ok.json())
    assert off_ball.status_code == 422


def test_pass_to_an_offside_player_shows_the_flag():
    frame = {"time": 0, "ball": {"x": 40, "y": 50, "owner": 1}, "players": [
        {"id": 1, "team": "home", "x": 40, "y": 50, "role": "cm"},
        {"id": 9, "team": "home", "x": 80, "y": 50, "role": "st"},
        {"id": 12, "team": "away", "x": 95, "y": 50, "role": "goalkeeper"},
        {"id": 20, "team": "away", "x": 70, "y": 30, "role": "centre back"}]}
    r = consequence.what_next(frame, 1, {"home": "right", "away": "left"}, {"action": "pass", "target_player_id": 9})
    assert r["outcome"] == "offside" and "Offside" in r["label"]

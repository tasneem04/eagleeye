import json
import math
from pathlib import Path

import pytest

from backend import geometry, training

SCENARIOS = Path(__file__).resolve().parents[2] / "data" / "scenarios"


def load(name):
    return json.loads((SCENARIOS / f"{name}.json").read_text(encoding="utf-8"))


def test_trials_found_in_the_match_scenario():
    trials = training.find_trials(load("build_up_triangle"))
    assert [(t["passer"], t["receiver"]) for t in trials] == [(4, 6), (6, 8), (8, 7)]
    assert trials[1]["start_frame"] == 2  # starts when #6 first has the ball, for more scanning time


@pytest.mark.parametrize("bearing,words", [
    (0, "in front of you"),
    (50, "ahead to your right"),
    (-90, "to your left"),
    (130, "over your right shoulder"),
    (-130, "over your left shoulder"),
    (180, "behind you"),
])
def test_body_relative_words(bearing, words):
    assert training.body_relative(0, bearing) == words


def test_body_relative_wraps_around():
    assert training.body_relative(170, -170) == "in front of you"


def drill(name="scan_drill_academy_01"):
    scenario = load(name)
    trial = training.find_trials(scenario)[0]
    return training.answer_key(scenario, trial)


def test_levels_change_the_game_not_the_human():
    for level, players, press_range in [("rookie", 8, (4, 99)), ("academy", 10, (2, 4)), ("pro", 11, (1.3, 2.2))]:
        for path in sorted(SCENARIOS.glob(f"scan_drill_{level}_*.json")):
            scenario = json.loads(path.read_text(encoding="utf-8"))
            assert scenario["level"] == level
            assert len(scenario["frames"][0]["players"]) == players
            answer = training.answer_key(scenario, training.find_trials(scenario)[0])
            press = answer["geometry"]["pressure"]["nearest_opponents"][0]["distance_m"]
            assert press_range[0] <= press <= press_range[1], path.name


def test_scan_targets_follow_research_rates():
    # ~3.6 s window: grassroots ~0.25/s, youth elite ~0.45/s, elite ~0.7/s (Jordet: 0.6-0.8)
    assert [training.target_scans(l, 3.6) for l in ("rookie", "academy", "pro")] == [1, 2, 3]


def test_corner_of_the_eye_counts_half_and_is_explained():
    answer = drill()
    target = answer["best"]["target_player_id"]
    full = training.grade(answer, "rookie", 1, [k["id"] for k in answer["key_players"]], {"action": "shoot"}, window_s=3.6)
    half = training.grade(answer, "rookie", 1, [], {"action": "shoot"}, noticed_ids=[target], window_s=3.6)
    assert full["coverage"] == 1.0
    assert 0 < half["coverage"] < 1.0
    assert any("corner of your eye" in f for f in half["facts"])


def test_too_slow_on_pro_downgrades_the_decision():
    answer = drill("scan_drill_pro_01")
    best = {"action": "pass", "target_player_id": answer["best"]["target_player_id"]}
    quick = training.grade(answer, "pro", 3, [], best, window_s=3.6, decision_ms=900)
    slow = training.grade(answer, "pro", 3, [], best, window_s=3.6, decision_ms=4000)
    assert quick["verdict"] == "best"
    assert slow["verdict"] == "good" and slow["too_slow"] is True
    assert any("closes you down" in f for f in slow["facts"])


def test_every_drill_needs_a_scan_but_a_realistic_one():
    for path in sorted(SCENARIOS.glob("scan_drill_*.json")):
        scenario = json.loads(path.read_text(encoding="utf-8"))
        answer = training.answer_key(scenario, training.find_trials(scenario)[0])
        target = answer["best"]["target_player_id"]
        key = next(k for k in answer["key_players"] if k["id"] == target)
        assert key["angle"] >= 100, f"{path.name}: free player visible without scanning"
        assert key["angle"] <= training.BEHIND_REACH_DEG, f"{path.name}: free player beyond a real head turn"


def test_player_straight_behind_gets_the_half_turn_tip():
    answer = drill()
    target = answer["best"]["target_player_id"]
    for k in answer["key_players"]:
        if k["id"] == target:
            k["angle"] = 175.0  # pretend the free player is straight behind
    result = training.grade(answer, "rookie", scans=1, seen_ids=[], choice={"action": "shoot"})
    assert any("half-turn" in f for f in result["facts"])


def test_grading_best_choice_with_full_scan():
    answer = drill()
    key_ids = [k["id"] for k in answer["key_players"]]
    result = training.grade(answer, "rookie", scans=2, seen_ids=key_ids,
                            choice={"action": "pass", "target_player_id": answer["best"]["target_player_id"]})
    assert result["verdict"] == "best"
    assert result["coverage"] == 1.0
    assert result["score"] == 100
    assert result["missed"] == []


def test_grading_no_scan_misses_the_free_player():
    answer = drill()
    target = answer["best"]["target_player_id"]
    result = training.grade(answer, "academy", scans=0, seen_ids=[16],
                            choice={"action": "pass", "target_player_id": 6})
    assert result["verdict"] in {"good", "risky"}
    assert target in [m["id"] for m in result["missed"]]
    assert any(f"#{target}" in f and "never looked" in f for f in result["facts"])
    assert result["score"] < 60


def test_short_dribble_towards_free_space_is_safe():
    answer = drill()
    sel, free = answer["geometry"]["selected"], answer["geometry"]["free_space"]
    (mx, my), (fx, fy) = geometry.to_metres(sel["x"], sel["y"]), geometry.to_metres(free["x"], free["y"])
    d = math.hypot(fx - mx, fy - my)
    sx, sy = geometry.to_units(mx + (fx - mx) / d * 6, my + (fy - my) / d * 6)  # a 6 m carry into the space
    result = training.grade(answer, "rookie", scans=1, seen_ids=[],
                            choice={"action": "dribble", "target_x": sx, "target_y": sy})
    assert result["carry"]["safe"] is True
    assert result["carry"]["toward_free_space"] is True
    assert result["verdict"] in {"ok", "best"}
    assert any("space to carry" in f for f in result["facts"])


def test_dribble_into_an_opponent_is_risky_and_names_them():
    answer = drill()
    presser = answer["geometry"]["pressure"]["nearest_opponents"][0]["id"]
    p = next(p for p in answer["_frame"]["players"] if p["id"] == presser)
    result = training.grade(answer, "rookie", scans=1, seen_ids=[],
                            choice={"action": "dribble", "target_player_id": None, "target_x": p["x"], "target_y": p["y"]})
    assert result["verdict"] == "risky"
    assert any(f"#{presser}" in f for f in result["facts"])


def test_dribble_towards_a_teammate_is_described():
    answer = drill()
    mate = answer["key_players"][0]
    pos = next(p for p in answer["_frame"]["players"] if p["id"] == mate["id"])
    result = training.grade(answer, "rookie", scans=1, seen_ids=[],
                            choice={"action": "dribble", "target_player_id": mate["id"], "target_x": pos["x"], "target_y": pos["y"]})
    assert any(f"towards #{mate['id']}" in f for f in result["facts"])


def test_blocked_pass_is_risky_and_explained():
    answer = drill()
    blocked = next(o for o in answer["geometry"]["teammates"] if not o["lane_open"])
    result = training.grade(answer, "pro", scans=3, seen_ids=[], choice={"action": "pass", "target_player_id": blocked["id"]})
    assert result["verdict"] == "risky"
    assert any("blocked that lane" in f for f in result["facts"])


def test_debrief_message_carries_the_scanning_verdict_not_rules():
    # The rules live in CoachAgent's instructions; the message only carries the mode and code-written facts.
    from backend.agents import messages
    text = messages.coach_debrief_input(["You scanned 2 times before the ball arrived (target: 1)."],
                                        "rookie", "young player", "English", "further")
    assert "Scanning verdict: good, not great" in text
    assert "name what" not in text and "praise" not in text


def test_debrief_never_calls_the_scanning_great_unless_code_says_so():
    from backend.agents.pipeline import Pipeline, Stage

    class Praising:
        def run_agent(self, name, text):
            return "Great job scanning twice! You did a great job."

        def close(self):
            pass

    pipeline = Pipeline("foundry", Praising(), [Stage("coach", "AGENT_COACH", "Coach says", 3, (), "CoachAgent")])
    facts = ["You scanned 2 times before the ball arrived (target: 1)."]
    assert pipeline.debrief(facts, "rookie", "further")["output"] == "Good job scanning twice! You did a good job."
    assert pipeline.debrief(facts, "rookie", "great")["output"].startswith("Great job")

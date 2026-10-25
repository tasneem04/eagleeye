import json
from pathlib import Path

from backend.agents import decision
from backend.geometry import analyze

SCENARIOS = Path(__file__).resolve().parents[2] / "data" / "scenarios"


def key_moment_geometry():
    scenario = json.loads((SCENARIOS / "build_up_triangle.json").read_text(encoding="utf-8"))
    return analyze(scenario["frames"][scenario["key_frame"]], 6, scenario["attacking_direction"])


def test_valid_pass_to_open_teammate_is_accepted():
    reply = '{"mode":"progress","action":"pass","target_player_id":8,"reason":"Open in the triangle.","scan_cue":"Look right."}'
    result = decision.parse(reply, key_moment_geometry())
    assert result["verified"] is True
    assert result["target_player_id"] == 8
    assert result["mode"] == "progress"


def test_json_inside_code_fence_is_accepted():
    reply = '```json\n{"action":"pass","target_player_id":2,"reason":"Safe.","scan_cue":""}\n```'
    assert decision.parse(reply, key_moment_geometry())["target_player_id"] == 2


def test_pass_to_blocked_teammate_is_corrected():
    reply = '{"action":"pass","target_player_id":10,"reason":"Through the middle."}'
    result = decision.parse(reply, key_moment_geometry())
    assert result["verified"] is False
    assert result["target_player_id"] == 8
    assert "#10" in result["note"]


def test_non_json_reply_falls_back_to_geometry():
    result = decision.parse("Pass to number 8!", key_moment_geometry())
    assert result["verified"] is False
    assert result["action"] == "pass"
    assert result["target_player_id"] == 8

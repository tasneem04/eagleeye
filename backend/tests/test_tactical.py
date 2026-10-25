import json
from pathlib import Path

from backend.agents import decision, tactical
from backend.geometry import analyze

SCENARIOS = Path(__file__).resolve().parents[2] / "data" / "scenarios"
LEVEL = {"minute": 63, "score": {"home": 0, "away": 0}}
LEADING_LATE = {"minute": 88, "score": {"home": 1, "away": 0}}
TRAILING_LATE = {"minute": 85, "score": {"home": 0, "away": 1}}


def key_moment_geometry():
    scenario = json.loads((SCENARIOS / "build_up_triangle.json").read_text(encoding="utf-8"))
    return analyze(scenario["frames"][scenario["key_frame"]], 6, scenario["attacking_direction"])


def test_level_game_in_middle_third_progresses():
    ctx = tactical.rules(key_moment_geometry(), LEVEL)
    assert ctx["phase"] == "progression"
    assert ctx["risk"] == "medium"
    assert ctx["mode"] == "progress"
    assert any("third-man" in p for p in ctx["principles"])


def test_protecting_a_late_lead_keeps_the_ball():
    ctx = tactical.rules(key_moment_geometry(), LEADING_LATE)
    assert ctx["risk"] == "low"
    assert ctx["mode"] == "keep"


def test_chasing_the_game_raises_risk():
    assert tactical.rules(key_moment_geometry(), TRAILING_LATE)["risk"] == "high"


def test_keep_mode_decision_picks_safe_short_pass():
    choice = decision.geometry_choice(key_moment_geometry(), "keep")
    assert choice["action"] == "pass"
    assert choice["mode"] == "keep"


def test_situation_text_is_from_selected_team_view():
    teams = {"home": {"name": "Blue"}, "away": {"name": "Red"}}
    assert tactical.situation_text(LEADING_LATE, "home", teams) == "Blue lead 1-0, 88th minute"
    assert tactical.situation_text(LEADING_LATE, "away", teams) == "Red trail 0-1, 88th minute"


def test_off_ball_position_advice_comes_from_the_engine():
    scenario = json.loads((SCENARIOS / "build_up_triangle.json").read_text(encoding="utf-8"))
    k = scenario["key_frame"]
    geo = analyze(scenario["frames"][k], 10, scenario["attacking_direction"], scenario["frames"][k - 1])
    advice = tactical.rules(geo, LEVEL)["position_advice"]
    assert advice.startswith("Get free")
    assert "#6" in advice
    # An agent reply without advice keeps the engine's sentence.
    reply = '{"phase":"progression","zone":"middle third","risk":"medium","mode":"progress","principles":[]}'
    assert tactical.parse(reply, geo, LEVEL)["position_advice"] == advice


def test_agent_reply_is_parsed_and_bad_mode_falls_back():
    good = '{"phase":"progression","zone":"middle third","risk":"medium","mode":"progress","principles":["triangle"]}'
    assert tactical.parse(good, key_moment_geometry(), LEVEL)["verified"] is True
    bad = tactical.parse('{"mode":"attack"}', key_moment_geometry(), LEVEL)
    assert bad["verified"] is False
    assert bad["mode"] == "progress"


def test_repeated_answer_uses_the_first_object():
    # Seen live with File Search: two messages joined into one reply.
    twice = ('{"phase":"build-up","zone":"z","risk":"low","mode":"keep","principles":["a {b}"]}'
             '{"phase":"build-up","zone":"z","risk":"low","mode":"keep","principles":["c"]}')
    parsed = tactical.parse(twice, key_moment_geometry(), LEVEL)
    assert parsed["verified"] is True and parsed["principles"] == ["a {b}"]
    fenced = 'Here you go:\n```json\n{"mode": "keep", "risk": "low"}\n```'
    assert tactical.parse(fenced, key_moment_geometry(), LEVEL)["verified"] is True


def test_final_text_reads_only_the_last_message():
    from types import SimpleNamespace as NS
    from backend.agents.foundry import final_text

    msg = lambda t: NS(type="message", content=[NS(type="output_text", text=t)])
    response = NS(output=[msg("first"), NS(type="file_search_call"), msg("final")], output_text="firstfinal")
    assert final_text(response) == "final"
    assert final_text(NS(output=[], output_text="plain")) == "plain"

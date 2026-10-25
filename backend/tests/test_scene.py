import json
from pathlib import Path

from backend.agents import messages, mock, scene
from backend.agents.pipeline import Pipeline, Stage
from backend.geometry import analyze

SCENARIO = json.loads((Path(__file__).resolve().parents[2] / "data" / "scenarios" / "build_up_triangle.json").read_text())


def _moment(frame_index, player_id):
    frame = SCENARIO["frames"][frame_index]
    prev = SCENARIO["frames"][frame_index - 1] if frame_index else None
    geo = analyze(frame, player_id, SCENARIO["attacking_direction"], prev)
    return frame, geo, scene.facts(SCENARIO, frame, geo)


def _travelling_frame():
    return next(i for i, f in enumerate(SCENARIO["frames"]) if f["ball"]["owner"] is None)


def test_facts_match_the_geometry():
    frame, geo, measured = _moment(0, 15)
    closest = geo["pressure"]["nearest_opponents"][0]
    assert measured["nearest_opponents"][0] == {
        **measured["nearest_opponents"][0], "id": closest["id"], "distance_m": round(closest["distance_m"])}
    mates = sorted(geo["teammates"], key=lambda o: o["distance_m"])[:3]
    assert [m["id"] for m in measured["nearest_teammates"]] == [o["id"] for o in mates]
    assert all(isinstance(m["distance_m"], int) for m in measured["nearest_teammates"])
    assert measured["pressure"] == geo["pressure"]["level"]
    assert measured["selected"]["attacks_toward"] == "x=0"  # away attacks left


def test_a_pass_in_the_air_has_no_holder():
    i = _travelling_frame()
    owner_frame = SCENARIO["frames"][i]
    _, _, measured = _moment(i, owner_frame["players"][0]["id"])
    assert measured["ball"]["holder"] is None and "travelling" in measured["ball"]["status"]


def test_message_carries_the_measured_block():
    frame, geo, measured = _moment(0, 4)
    text = messages.field_mapper_input(SCENARIO, frame, 4, measured)
    assert "Measured by code" in text and json.dumps(measured, separators=(",", ":")) in text
    assert text.index("Measured by code") < text.index("Moment JSON")


def test_check_accepts_measured_numbers_and_the_offline_text():
    frame, geo, measured = _moment(0, 4)
    mate = measured["nearest_teammates"][0]
    assert scene.check(f"- #{mate['id']} is {mate['distance_m']} m {mate['direction']}.", measured, frame) == (True, None)
    for i, pid in ((0, 4), (0, 15), (_travelling_frame(), 15)):
        f, g, m = _moment(i, pid)
        assert scene.check(mock.field_mapper(SCENARIO, f, g), m, f)[0]


def test_check_rejects_an_invented_distance_or_player():
    frame, geo, measured = _moment(0, 4)
    ok, note = scene.check("- #5 is about 2.5 m behind.", measured, frame)
    assert not ok and "2.5" in note
    ok, note = scene.check("- #99 is close.", measured, frame)
    assert not ok and "#99" in note


class InventingFoundry:
    def run_agent(self, agent_name, text):
        return "- #4 is under no pressure; the nearest opponent is 2.5 m away."

    def close(self):
        pass


def test_pipeline_swaps_an_unchecked_reply_for_the_offline_text():
    frame, geo, _ = _moment(0, 4)
    pipeline = Pipeline("foundry", InventingFoundry(), [Stage("field_mapper", "X", "t", 1, (), "FieldMapper")])
    stage = pipeline.run(SCENARIO, frame, 4, geo, SCENARIO["match_situation"])[0]
    assert stage["output"] == mock.field_mapper(SCENARIO, frame, geo)
    assert stage["data"]["verified"] is False and "2.5" in stage["data"]["note"]

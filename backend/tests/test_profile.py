import json
from pathlib import Path

from backend import training

SCENARIOS = Path(__file__).resolve().parents[2] / "data" / "scenarios"


def item(score=60, verdict="good", scans=2, target=2, timed=False, slow=False, opened=False, missed=()):
    return {"trial_id": "t", "level": "academy", "score": score, "verdict": verdict, "scans": scans,
            "target_scans": target, "timed": timed, "too_slow": slow, "opened_body": opened, "missed": list(missed)}


RIGHT = {"side": "right", "angle": 120, "open": True}
LEFT = {"side": "left", "angle": 120, "open": True}
BEHIND = {"side": "behind", "angle": 170, "open": True}


def keys(history):
    return [s["key"] for s in training.weak_spots(history)]


def test_no_weak_spot_without_enough_evidence():
    assert keys([item(scans=0, missed=[RIGHT])] * 2) == []


def test_blind_side_detected():
    assert "blind_side_right" in keys([item(missed=[RIGHT])] * 3 + [item(missed=[LEFT])])
    assert not any(k.startswith("blind_side") for k in keys([item(missed=[RIGHT]), item(missed=[LEFT]), item(missed=[RIGHT, LEFT])]))


def test_other_weak_spots():
    assert "scan_more" in keys([item(scans=0)] * 3)
    assert "decide_faster" in keys([item(timed=True, slow=True)] * 3)
    assert "safer_choices" in keys([item(verdict="risky")] * 3)
    assert "open_body" in keys([item(missed=[BEHIND])] * 2 + [item()])
    assert "open_body" not in keys([item(missed=[BEHIND], opened=True)] * 3)


def metas():
    out = []
    for path in sorted(SCENARIOS.glob("*.json")):
        scenario = json.loads(path.read_text(encoding="utf-8"))
        out += [training.trial_meta(scenario, t) for t in training.find_trials(scenario)]
    return out


def test_trial_meta_knows_where_the_free_player_is():
    drills = [m for m in metas() if m["kind"] == "drill"]
    assert drills and all(m["target_side"] in ("left", "right") for m in drills)


def test_next_drill_trains_the_weak_side():
    all_metas = metas()
    history = [item(missed=[RIGHT])] * 3  # len 3 -> weak-side pool
    rec = training.recommend(history, "academy", all_metas)
    assert rec["focus"]["key"] == "blind_side_right"
    picked = next(m for m in all_metas if m["id"] == rec["next_trial_id"])
    assert picked["level"] == "academy" and picked["target_side"] == "right"


def test_rookie_too_slow_is_sent_to_a_clock():
    rec = training.recommend([item(timed=True, slow=True)] * 3, "rookie", metas())
    assert rec["next_level"] == "academy"


def test_level_suggestions():
    up = training.level_suggestion([item(score=85)] * 3, "academy")
    down = training.level_suggestion([item(score=30)] * 3, "academy")
    assert up["to"] == "pro" and down["to"] == "rookie"
    assert training.level_suggestion([item(score=85)] * 2, "academy") is None


def test_next_endpoint_keeps_nothing_and_answers(make_client):
    client, _ = make_client()
    with client:
        r = client.post("/api/training/next", json={"level": "rookie", "history": [item() | {"level": "rookie"}]})
        assert r.status_code == 200 and r.json()["next_trial_id"]
        too_long = {"level": "rookie", "history": [item() | {"level": "rookie"}] * 31}
        assert client.post("/api/training/next", json=too_long).status_code == 422


def test_demo_player_is_graded_by_real_code_and_shows_a_focus(make_client):
    client, _ = make_client()
    with client:
        demo = client.get("/api/training/demo-history").json()
        trials = client.get("/api/training/trials").json()
        rec = client.post("/api/training/next", json={"level": "rookie", "history": demo["history"]}).json()
    assert "sample" in demo["label"].lower()
    assert len(demo["history"]) >= trials["min_evidence"] == training.MIN_EVIDENCE
    assert rec["focus"]["key"] == "blind_side_right"
    meta = {m["id"]: m for m in client.app.state.trial_meta}
    assert meta[rec["next_trial_id"]]["target_side"] == "right"


def test_history_keeps_how_full_the_picture_was(make_client):
    """Each drill saves its key-player share, so the reveal can show the picture getting fuller."""
    client, _ = make_client()
    with client:
        demo = client.get("/api/training/demo-history").json()["history"]
        old = [{k: v for k, v in h.items() if k != "coverage"} for h in demo]  # saved before coverage existed
        assert client.post("/api/training/next", json={"level": "rookie", "history": old}).status_code == 200
        bad = [dict(demo[0], coverage=1.5)]
        assert client.post("/api/training/next", json={"level": "rookie", "history": bad}).status_code == 422
    assert all(0 <= h["coverage"] < 1 for h in demo)  # the demo player never checks one shoulder

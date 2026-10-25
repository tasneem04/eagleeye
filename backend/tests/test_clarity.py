import hashlib

ADMIN = {"X-Admin-Token": "test-token"}


def digest(kdir):
    return {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(kdir.glob("*.md"))}


def test_flags_are_saved_for_review_and_never_change_knowledge(make_client):
    client, kdir = make_client()
    before = digest(kdir)
    with client:
        r = client.post("/api/clarity", json={
            "where": "analyse", "understood": False, "comment": "What is a half-space?",
            "explanation": "Pass into the right half-space.", "scenario_id": "build_up_triangle",
            "frame_index": 3, "player_id": 6,
        })
        assert r.json()["saved"] is True
        client.post("/api/clarity", json={"where": "training", "understood": True, "trial_id": "x", "level": "rookie"})
        review = client.get("/api/clarity", headers=ADMIN).json()
    assert [e["comment"] for e in review["unclear"]] == ["What is a half-space?"]
    assert review["unclear"][0]["explanation"] == "Pass into the right half-space."
    assert review["counts"] == {"analyse": {"understood": 0, "unclear": 1}, "training": {"understood": 1, "unclear": 0}}
    assert digest(kdir) == before


def test_flag_input_is_bounded(make_client):
    client, _ = make_client()
    with client:
        assert client.post("/api/clarity", json={"where": "elsewhere", "understood": False}).status_code == 422
        assert client.post("/api/clarity", json={"where": "analyse", "understood": False,
                                                 "comment": "x" * 5000}).status_code == 422

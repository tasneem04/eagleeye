import pytest

from backend import security
from backend.agents.pipeline import Pipeline, Stage

ADMIN_POSTS = [
    "/api/scout/run",
    "/api/knowledge/sync",
]
MOMENT = {"scenario_id": "build_up_triangle", "frame_index": 3, "player_id": 6}


def test_admin_endpoints_need_the_right_token(make_client):
    client, _ = make_client()
    with client:
        for path in ADMIN_POSTS:
            assert client.post(path, json={}).status_code == 401
            assert client.post(path, json={}, headers={"X-Admin-Token": "wrong"}).status_code == 403
        assert client.get("/api/clarity").status_code == 401
        assert client.get("/api/admin/check", headers={"X-Admin-Token": "test-token"}).json() == {"admin": True}
        assert client.post("/api/scout/approve/P1").status_code == 401
        assert client.post("/api/scout/reject/P1").status_code == 401


def test_fails_closed_without_a_token(make_client):
    # No ADMIN_TOKEN: a remote visitor is never admin...
    client, _ = make_client(token="")
    with client:
        assert client.post("/api/scout/run", json={}).status_code == 401
    # ...only this machine is, and not when the request came through a proxy.
    local, _ = make_client(token="", client=("127.0.0.1", 50000))
    with local:
        assert local.get("/api/admin/check").status_code == 200
        assert local.get("/api/admin/check", headers={"X-Forwarded-For": "8.8.8.8"}).status_code == 401


def test_public_reads_stay_open(make_client):
    client, _ = make_client()
    with client:
        assert client.get("/api/scout").status_code == 200
        assert client.get("/api/scout/proposals").status_code == 200
        assert client.post("/api/analyze", json=MOMENT).status_code == 200


def test_rate_limit_per_visitor(make_client, monkeypatch):
    monkeypatch.setitem(security.LIMITS, "analyze", (2, 60))
    client, _ = make_client()
    with client:
        a = {"X-Forwarded-For": "1.1.1.1:5000"}
        b = {"X-Forwarded-For": "2.2.2.2:6000"}
        assert [client.post("/api/analyze", json=MOMENT, headers=a).status_code for _ in range(3)] == [200, 200, 429]
        assert client.post("/api/analyze", json=MOMENT, headers=b).status_code == 200  # another visitor


def test_visitor_key_uses_the_proxy_hop_and_is_hashed():
    class Req:
        def __init__(self, headers, host="10.0.0.1"):
            self.headers = headers
            self.client = type("C", (), {"host": host})()

    k1 = security.client_key(Req({"x-forwarded-for": "spoof, 203.0.113.9:4444"}))
    k2 = security.client_key(Req({"x-forwarded-for": "203.0.113.9:5555"}))
    assert k1 == k2  # same visitor: last hop, port ignored
    assert "203.0.113.9" not in k1 and len(k1) == 16


def test_agent_budget_caps_calls_per_hour():
    budget = security.AgentBudget(5)
    assert budget.take(3) and budget.take(2)
    assert not budget.take(1)
    assert security.AgentBudget(0).take(1000)  # 0 = no cap


class FailingFoundry:
    calls = 0

    def run_agent(self, name, text):
        FailingFoundry.calls += 1
        raise RuntimeError("secret internal detail")

    def close(self):
        pass


def test_offline_mode_makes_no_agent_calls():
    FailingFoundry.calls = 0
    pipeline = Pipeline("foundry", FailingFoundry(), [Stage("field_mapper", "X", "t", 1, (), "FieldMapper")])
    from backend.app import _analyze_moment, load_scenarios
    scenario = load_scenarios()["build_up_triangle"]
    geo = _analyze_moment(scenario, 3, 6)
    stages = pipeline.run(scenario, scenario["frames"][3], 6, geo, scenario["match_situation"], offline=True)
    assert FailingFoundry.calls == 0 and stages[0]["source"] == "mock"


def test_error_details_hidden_from_the_public(make_client):
    client, _ = make_client()
    with client:
        client.app.state.pipeline = Pipeline("foundry", FailingFoundry(),
                                             [Stage("field_mapper", "X", "t", 1, (), "FieldMapper")])
        public = client.post("/api/analyze", json=MOMENT).json()["stages"][0]
        admin = client.post("/api/analyze", json=MOMENT, headers={"X-Admin-Token": "test-token"}).json()["stages"][0]
    assert public["status"] == "fallback" and public["error_detail"] is None
    assert "secret internal detail" in admin["error_detail"]


def test_security_headers(make_client):
    client, _ = make_client()
    with client:
        response = client.get("/")
    assert "default-src 'self'" in response.headers["content-security-policy"]
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"


@pytest.mark.parametrize("path", ["/api/feedback", "/api/knowledge/improve", "/api/match-learning/run"])
def test_removed_endpoints_are_gone(make_client, path):
    # Ratings never change knowledge, and the project uses synthetic data only (no real-match imports).
    client, _ = make_client()
    with client:
        assert client.post(path, json={}).status_code in (404, 405)

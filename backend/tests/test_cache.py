from backend import app as app_module
from backend.agents.pipeline import Pipeline, Stage
from backend.analysis_cache import AnalysisCache, knowledge_tag

MOMENT = {"scenario_id": "build_up_triangle", "frame_index": 3, "player_id": 6}


def test_answers_survive_a_restart(tmp_path):
    path = tmp_path / "analysis.json"
    AnalysisCache(path, "v1", 10).put(("a", 1), {"stages": ["x"]})
    assert AnalysisCache(path, "v1", 10).get(("a", 1)) == {"stages": ["x"]}


def test_new_knowledge_or_agents_drop_old_answers(tmp_path):
    path = tmp_path / "analysis.json"
    AnalysisCache(path, "v1", 10).put(("a", 1), {"stages": []})
    assert len(AnalysisCache(path, "v2", 10)) == 0  # saved under another tag
    live = AnalysisCache(path, "v1", 10)
    live.retag("v2")
    assert len(live) == 0 and len(AnalysisCache(path, "v2", 10)) == 0


def test_tag_follows_knowledge_files_and_agent_chain(tmp_path):
    (tmp_path / "football_reference.md").write_text("A", encoding="utf-8")
    tag = knowledge_tag(tmp_path, ["coach=CoachAgent"])
    assert tag != knowledge_tag(tmp_path, ["decision=DecisionAgent"])
    (tmp_path / "football_reference.md").write_text("A plus an approved note", encoding="utf-8")
    assert tag != knowledge_tag(tmp_path, ["coach=CoachAgent"])


def test_oldest_answer_goes_first(tmp_path):
    cache = AnalysisCache(None, "v1", 2)
    for i in range(3):
        cache.put(("k", i), {})
    assert ("k", 0) not in cache and ("k", 2) in cache


class CountingFoundry:
    calls = 0

    def run_agent(self, name, text):
        CountingFoundry.calls += 1
        return "- #6 has the ball."

    def close(self):
        pass


def test_second_click_is_cached_and_free(make_client, tmp_path):
    CountingFoundry.calls = 0
    client, _ = make_client()
    with client:
        app = client.app
        app.state.pipeline = Pipeline("foundry", CountingFoundry(),
                                      [Stage("field_mapper", "AGENT_FIELD_MAPPER", "Field", 1, (), "FieldMapper")])
        app.state.analysis_cache = AnalysisCache(tmp_path / "a.json", app_module._cache_tag(app), 10)
        first = client.post("/api/analyze", json=MOMENT).json()
        second = client.post("/api/analyze", json=MOMENT).json()
    assert (first["cached"], second["cached"]) == (False, True)
    assert CountingFoundry.calls == 1
    assert AnalysisCache(tmp_path / "a.json", app_module._cache_tag(app), 10).get(
        app_module._cache_key("build_up_triangle", 3, 6, first["situation"])) is not None

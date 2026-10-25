import shutil
from pathlib import Path

import pytest

KNOWLEDGE = Path(__file__).resolve().parents[2] / "knowledge"


@pytest.fixture
def make_client(tmp_path, monkeypatch):
    """A TestClient on a throwaway copy of the knowledge files, in mock mode."""
    from fastapi.testclient import TestClient

    from backend import app as app_module

    def factory(token="test-token", **client_kwargs):
        kdir = tmp_path / "knowledge"
        if not kdir.exists():
            kdir.mkdir()
            for name in ("football_reference.md", "coaching_principles.md"):
                shutil.copyfile(KNOWLEDGE / name, kdir / name)
        monkeypatch.setenv("EAGLEEYE_MODE", "mock")
        monkeypatch.setenv("SCOUT_INTERVAL_HOURS", "0")
        monkeypatch.setenv("RATE_LIMITS", "on")
        monkeypatch.setenv("ADMIN_TOKEN", token)
        monkeypatch.setattr(app_module, "KNOWLEDGE_DIR", kdir)
        monkeypatch.setattr(app_module, "CLARITY_PATH", tmp_path / "clarity.jsonl")
        return TestClient(app_module.app, **client_kwargs), kdir

    return factory

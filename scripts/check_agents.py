"""Check that the Foundry agents are the ones this repo describes.

Run from the repo root (after `az login`, or on App Service with its managed identity):
  python scripts/check_agents.py

For every agent named in .env it checks that the agent exists, which model and tools it has, and
that its instructions match the block in backend/agents/instructions/. A portal edit that was not
copied back to the repo (or the other way round) shows up as a difference. The exit code is 1 when
anything needs fixing, so it can run before the video, after the deploy and during judging.
"""

import difflib
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")

from azure.ai.projects import AIProjectClient  # noqa: E402
from azure.identity import DefaultAzureCredential  # noqa: E402

# env var, instructions file, the only tools the agent should have
AGENTS = [
    ("AGENT_FIELD_MAPPER", "field_mapper.md", set()),
    ("AGENT_TACTICAL_CONTEXT", "tactical_context_agent.md", {"file_search"}),
    ("AGENT_DECISION", "decision_agent.md", set()),
    ("AGENT_COACH", "coach_agent.md", set()),
    ("AGENT_KNOWLEDGE_SCOUT", "knowledge_scout.md", {"web_search"}),
]
MAX_TEMPERATURE = 0.5  # higher makes the same click read differently every time


def _get(obj, key):
    return obj.get(key) if isinstance(obj, dict) else getattr(obj, key, None)


def instructions_block(path: Path) -> str:
    """The text to paste into the portal: the fenced block that starts with "You are"."""
    blocks = re.findall(r"```[a-z]*\n(.*?)```", path.read_text(encoding="utf-8"), re.S)
    return next((b for b in blocks if b.lstrip().startswith("You are")), "")


def check(project, name: str, doc: str, tools_allowed: set[str]) -> list[str]:
    problems = []
    try:
        details = project.agents.get(agent_name=name)
    except Exception as exc:
        return [f"not found in Foundry ({type(exc).__name__})"]
    versions = _get(details, "versions")
    latest = _get(versions, "latest")
    definition = _get(latest, "definition")
    tools = {_get(t, "type") for t in (_get(definition, "tools") or [])}
    temperature = _get(definition, "temperature")
    print(f"  version {_get(latest, 'version')}, model {_get(definition, 'model')}, "
          f"tools {sorted(tools) or 'none'}, temperature {temperature if temperature is not None else 'default (1.0)'}")

    if tools != tools_allowed:
        problems.append(f"tools should be {sorted(tools_allowed) or 'none'}")
    if "file_search" in tools:
        problems += _check_store(project, definition)
    if temperature is None or temperature > MAX_TEMPERATURE:
        problems.append(f"temperature should be {MAX_TEMPERATURE} or lower for repeatable answers")

    expected = instructions_block(ROOT / "backend" / "agents" / "instructions" / doc)
    actual = _get(definition, "instructions") or ""
    if " ".join(expected.split()) != " ".join(actual.split()):
        problems.append(f"instructions differ from {doc}")
        for line in difflib.unified_diff(expected.splitlines(), actual.splitlines(), "repo", "portal", n=0, lineterm=""):
            if line[:1] in "+-" and line[:3] not in ("+++", "---") and line.strip("+- "):
                print(f"    {line[:150]}")
    return problems


def _check_store(project, definition) -> list[str]:
    """File Search must hold exactly one indexed copy of each knowledge file."""
    from backend.learning.knowledge_sync import KNOWLEDGE_FILES

    tool = next(t for t in _get(definition, "tools") if _get(t, "type") == "file_search")
    store_ids = _get(tool, "vector_store_ids") or []
    if not store_ids:
        return ["File Search has no vector store attached"]
    client = project.get_openai_client()
    names = sorted(client.files.retrieve(f.id).filename
                   for f in client.vector_stores.files.list(vector_store_id=store_ids[0]) if f.status == "completed")
    print(f"  File Search store {store_ids[0]}: {', '.join(names) or 'empty'}")
    if names != sorted(KNOWLEDGE_FILES):
        return [f"File Search should hold exactly {', '.join(KNOWLEDGE_FILES)} (run scripts/run_scout.py --sync)"]
    return []


def main() -> int:
    endpoint = os.getenv("FOUNDRY_PROJECT_ENDPOINT", "").strip()
    if not endpoint:
        print("FOUNDRY_PROJECT_ENDPOINT is not set.")
        return 1
    project = AIProjectClient(endpoint=endpoint, credential=DefaultAzureCredential(process_timeout=60))
    failed = 0
    for env_var, doc, tools_allowed in AGENTS:
        name = os.getenv(env_var, "").strip()
        if not name:
            print(f"- {env_var} is empty: skipped (the app uses its offline text)")
            continue
        print(f"- {name}")
        problems = check(project, name, doc, tools_allowed)
        for problem in problems:
            print(f"  FIX: {problem}")
        failed += bool(problems)
        if not problems:
            print("  OK")
    print("\nAll agents match the repo." if not failed else f"\n{failed} agent(s) need attention.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

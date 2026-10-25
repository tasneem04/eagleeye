"""Pushes the latest knowledge files into the agent's File Search store.

Two files are kept in the store: coaching_principles.md (written by the team)
and football_reference.md (grown by KnowledgeScout research, only after the
admin approves it). Viewer actions never change either file.

The vector store id comes from KNOWLEDGE_VECTOR_STORE_ID, or is discovered from
the File Search tool on the TacticalContextAgent definition in Foundry. The new
file is uploaded first; older copies of the same file are removed afterwards,
so the agent always has exactly one current version to search.
"""

from __future__ import annotations

import logging
from pathlib import Path

log = logging.getLogger("eagleeye.knowledge_sync")


KNOWLEDGE_FILES = ("coaching_principles.md", "football_reference.md")


class KnowledgeSync:
    def __init__(self, project, vector_store_id: str = "", agent_name: str = ""):
        self.project = project
        self.vector_store_id = vector_store_id
        self.agent_name = agent_name

    def _store_id(self) -> str | None:
        if self.vector_store_id:
            return self.vector_store_id
        if not self.agent_name:
            return None
        details = self.project.agents.get(agent_name=self.agent_name)
        versions = details.versions
        latest = versions.get("latest") if isinstance(versions, dict) else getattr(versions, "latest", None)
        for tool in getattr(getattr(latest, "definition", None), "tools", None) or []:
            ids = tool.get("vector_store_ids") if isinstance(tool, dict) else getattr(tool, "vector_store_ids", None)
            if ids:
                self.vector_store_id = ids[0]
                return self.vector_store_id
        return None

    def sync(self, path: Path) -> str:
        store_id = self._store_id()
        if not store_id:
            return "not synced: set KNOWLEDGE_VECTOR_STORE_ID or add File Search to the agent"
        client = self.project.get_openai_client()
        with path.open("rb") as f:
            new_file = client.vector_stores.files.upload_and_poll(vector_store_id=store_id, file=f)

        removed = 0
        for item in client.vector_stores.files.list(vector_store_id=store_id):
            if item.id == new_file.id:
                continue
            if client.files.retrieve(item.id).filename == path.name:
                client.vector_stores.files.delete(file_id=item.id, vector_store_id=store_id)
                removed += 1
        log.info("Synced %s to vector store %s (replaced %d old copies)", path.name, store_id, removed)
        return f"synced to File Search ({new_file.status})"

    def sync_all(self, knowledge_dir: Path) -> dict[str, str]:
        """Re-upload every knowledge file (replacing same-name copies). Returns a status per file."""
        results = {}
        for name in KNOWLEDGE_FILES:
            path = Path(knowledge_dir) / name
            if not path.exists():
                results[name] = "missing"
                continue
            try:
                results[name] = self.sync(path)
            except Exception as exc:
                log.exception("Sync of %s failed", name)
                results[name] = f"sync failed: {type(exc).__name__}"
        return results

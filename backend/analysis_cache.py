"""Agent answers kept per click, saved to disk so a restart doesn't make the next visitor wait again.

Each saved answer is tagged with the knowledge files and the agent chain. When either
changes (an approved KnowledgeScout note, a new agent), the old answers are dropped,
so a cached answer is always one the current agents would give from the current knowledge.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
from pathlib import Path

log = logging.getLogger("eagleeye.cache")


def knowledge_tag(knowledge_dir: Path, chain: list[str]) -> str:
    """Fingerprint of the knowledge files plus the agents that answer a click."""
    h = hashlib.sha256("|".join(chain).encode())
    for name in ("coaching_principles.md", "football_reference.md"):
        path = Path(knowledge_dir) / name
        if path.exists():
            h.update(path.read_bytes())
    return h.hexdigest()[:16]


class AnalysisCache:
    def __init__(self, path: Path | None, tag: str, size: int):
        self.path = Path(path) if path else None
        self.tag = tag
        self.size = size
        self._items: dict[tuple, dict] = {}
        self._lock = threading.Lock()
        self._load()

    def get(self, key: tuple) -> dict | None:
        return self._items.get(key)

    def __contains__(self, key: tuple) -> bool:
        return key in self._items

    def __getitem__(self, key: tuple) -> dict:
        return self._items[key]

    def __len__(self) -> int:
        return len(self._items)

    def put(self, key: tuple, result: dict) -> None:
        with self._lock:
            if key not in self._items and len(self._items) >= self.size:
                self._items.pop(next(iter(self._items)))  # drop the oldest
            self._items[key] = result
            self._save()

    def retag(self, tag: str) -> None:
        """Knowledge or agents changed: forget answers given under the old tag."""
        if tag == self.tag:
            return
        with self._lock:
            log.info("Knowledge or agents changed: dropping %d cached answers", len(self._items))
            self.tag, self._items = tag, {}
            self._save()

    def _load(self) -> None:
        if not self.path or not self.path.exists():
            return
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            log.warning("Ignoring unreadable cache file %s", self.path)
            return
        if data.get("tag") != self.tag:
            return
        self._items = {tuple(item["key"]): item["result"] for item in data.get("items", [])[-self.size:]}
        log.info("Loaded %d cached answers", len(self._items))

    def _save(self) -> None:
        if not self.path:
            return
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            items = [{"key": list(k), "result": v} for k, v in self._items.items()]
            tmp.write_text(json.dumps({"tag": self.tag, "items": items}, separators=(",", ":")), encoding="utf-8")
            os.replace(tmp, self.path)
        except OSError:
            log.exception("Could not save the analysis cache")

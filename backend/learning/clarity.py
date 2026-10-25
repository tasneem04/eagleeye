"""'Did you understand?' flags on EagleEye's explanations, for the admin to review.

Players are learners, not judges: these flags never change any knowledge file
or agent. They only build a review queue of explanations that were unclear.
Stored as append-only JSON lines; no player identity is kept.
"""

from __future__ import annotations

import json
import threading
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

MAX_COMMENT_CHARS = 300
MAX_EXPLANATION_CHARS = 1200


class ClarityStore:
    def __init__(self, path: Path):
        self.path = path
        self._lock = threading.Lock()

    def read_all(self) -> list[dict]:
        if not self.path.exists():
            return []
        with self.path.open(encoding="utf-8") as f:
            return [json.loads(line) for line in f if line.strip()]

    def append(self, understood: bool, comment: str, where: str, context: dict, explanation: str) -> dict:
        with self._lock:
            count = len(self.read_all())
            entry = {
                "id": f"C{count + 1}",
                "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "where": where,
                "understood": understood,
                "comment": " ".join(comment.split())[:MAX_COMMENT_CHARS],
                "context": context,
                "explanation": " ".join(explanation.split())[:MAX_EXPLANATION_CHARS],
            }
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(entry) + "\n")
            return entry

    def review(self) -> dict:
        """The admin's queue: explanations marked 'not really', newest first, plus yes/no counts."""
        entries = self.read_all()
        counts = Counter((e["where"], e["understood"]) for e in entries)
        return {
            "unclear": [e for e in reversed(entries) if not e["understood"]],
            "counts": {
                where: {"understood": counts[(where, True)], "unclear": counts[(where, False)]}
                for where in ("analyse", "training")
            },
        }

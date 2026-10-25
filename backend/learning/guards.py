"""Shared checks for untrusted text (web research, viewer comments)."""

from __future__ import annotations

import re

# Instruction-like text, links and markup: never allowed into knowledge files.
SUSPICIOUS = re.compile(
    r"(ignore\b|disregard|system prompt|developer message|\binstructions?\b|you must now|```|https?://|www\.|<\s*/?\s*[a-z])",
    re.IGNORECASE,
)

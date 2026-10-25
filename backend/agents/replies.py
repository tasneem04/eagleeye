"""Helpers for reading structured replies from agents."""

from __future__ import annotations

import json

_decoder = json.JSONDecoder()


def extract_json(text: str) -> dict | None:
    """The first JSON object in a reply, tolerating code fences, extra prose or a repeated answer."""
    text = text or ""
    start = text.find("{")
    while start != -1:
        try:
            value, _ = _decoder.raw_decode(text, start)
        except json.JSONDecodeError:
            value = None
        if isinstance(value, dict):
            return value
        start = text.find("{", start + 1)
    return None

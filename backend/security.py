"""Security for the public EagleEye demo.

- Admin endpoints (scout research/approve/reject, knowledge sync, the queue of
  unclear explanations) need the `X-Admin-Token` header. This FAILS CLOSED:
  without ADMIN_TOKEN configured, only requests made on this machine (loopback,
  no proxy headers) count as admin. Behind Azure's proxy nothing is loopback, so
  a forgotten setting locks the admin actions instead of opening them.
- Per-visitor rate limits on the public endpoints. A visitor is the client
  address that Azure's front end appends to X-Forwarded-For (hashed with a
  per-start salt, never stored raw), so judges behind one proxy are not all
  throttled together.
- A global hourly budget of Foundry agent calls; above it, answers fall back to
  the offline text instead of spending more.
- Security headers on every response.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

LOOPBACK = {"127.0.0.1", "::1"}
_SALT = secrets.token_bytes(16)

# (max requests, window in seconds) per visitor.
LIMITS = {
    "api": (120, 60),          # ceiling for every /api call
    "analyze": (20, 60),       # uncached analyses (each one is several agent calls)
    "evaluate": (30, 60),      # training debriefs (one agent call each)
    "clarity": (10, 60),
    "clarity_day": (60, 86_400),
    "next": (30, 60),
}

CSP = (
    "default-src 'self'; script-src 'self'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; "
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
)
SECURITY_HEADERS = {
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}


def admin_token() -> str:
    return os.getenv("ADMIN_TOKEN", "").strip()


def debug_errors() -> bool:
    return os.getenv("EAGLEEYE_DEBUG", "0").strip() == "1"


def _is_local(request: Request) -> bool:
    host = request.client.host if request.client else ""
    return host in LOOPBACK and "x-forwarded-for" not in request.headers


def is_admin(request: Request) -> bool:
    token = admin_token()
    if token:
        given = request.headers.get("x-admin-token", "")
        return bool(given) and hmac.compare_digest(given.encode(), token.encode())
    return _is_local(request)  # no token configured: only this machine, never through a proxy


def require_admin(request: Request) -> None:
    """FastAPI dependency for admin-only endpoints."""
    if is_admin(request):
        return
    if admin_token() and request.headers.get("x-admin-token"):
        raise HTTPException(403, "Wrong admin token.")
    raise HTTPException(401, "Admin token required.")


def client_key(request: Request) -> str:
    """A salted hash identifying one visitor, for rate limits only."""
    forwarded = request.headers.get("x-forwarded-for", "")
    raw = forwarded.split(",")[-1].strip() if forwarded else (request.client.host if request.client else "unknown")
    if raw.count(":") == 1:  # "1.2.3.4:5678" (Azure adds the port); leave IPv6 alone
        raw = raw.split(":")[0]
    return hashlib.sha256(_SALT + raw.encode()).hexdigest()[:16]


class RateLimiter:
    """Sliding-window counters per (route group, visitor). In memory: fine for one App Service instance."""

    def __init__(self, enabled: bool = True):
        self.enabled = enabled
        self._hits: dict[tuple[str, str], deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str, group: str) -> bool:
        if not self.enabled:
            return True
        limit, window = LIMITS[group]
        now = time.monotonic()
        with self._lock:
            hits = self._hits[(group, key)]
            while hits and now - hits[0] >= window:
                hits.popleft()
            if len(hits) >= limit:
                return False
            hits.append(now)
            if len(self._hits) > 20_000:  # forget idle visitors
                for k in [k for k, q in self._hits.items() if not q]:
                    del self._hits[k]
            return True

    def check(self, request: Request, *groups: str) -> None:
        key = client_key(request)
        for group in groups:
            if not self.allow(key, group):
                raise HTTPException(429, "Slow down a little: too many requests. Try again in a minute.")


class AgentBudget:
    """Global cap on Foundry agent calls per rolling hour (0 = no cap)."""

    def __init__(self, per_hour: int):
        self.per_hour = max(0, per_hour)
        self._calls: deque = deque()
        self._lock = threading.Lock()

    def take(self, n: int) -> bool:
        if self.per_hour == 0 or n <= 0:
            return True
        now = time.monotonic()
        with self._lock:
            while self._calls and now - self._calls[0] >= 3600:
                self._calls.popleft()
            if len(self._calls) + n > self.per_hour:
                return False
            self._calls.extend([now] * n)
            return True


def public_stages(stages: list[dict], request: Request) -> list[dict]:
    """Hide raw exception text from the public; admins (and debug mode) still see it."""
    if is_admin(request) or debug_errors():
        return stages
    return [{**s, "error_detail": None} for s in stages]

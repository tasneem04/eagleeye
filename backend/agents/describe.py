"""Plain-language helpers for describing positions from a team's point of view."""

from __future__ import annotations


def progress(x: float, attacking: str) -> float:
    """0 at the team's own goal line, 100 at the opponent's."""
    return x if attacking == "right" else 100 - x


def lateral(y: float, attacking: str) -> float:
    """0 on the team's left touchline, 100 on its right."""
    return y if attacking == "right" else 100 - y


def third(x: float, attacking: str) -> str:
    p = progress(x, attacking)
    if p < 100 / 3:
        return "defensive third"
    if p < 200 / 3:
        return "middle third"
    return "attacking third"


def channel(y: float, attacking: str) -> str:
    l = lateral(y, attacking)
    if l < 20:
        return "left wing"
    if l < 37:
        return "left half-space"
    if l <= 63:
        return "central channel"
    if l <= 80:
        return "right half-space"
    return "right wing"


def relative_direction(from_xy, to_xy, attacking: str) -> str:
    """'ahead-right', 'behind', 'to the left' etc. from the first point's perspective."""
    sign = 1 if attacking == "right" else -1
    forward = sign * (to_xy[0] - from_xy[0])
    side = sign * (to_xy[1] - from_xy[1])
    ahead = "ahead" if forward > 3 else "behind" if forward < -3 else ""
    across = "right" if side > 5 else "left" if side < -5 else ""
    if ahead and across:
        return f"{ahead}-{across}"
    if ahead:
        return ahead
    if across:
        return f"to the {across}"
    return "level"

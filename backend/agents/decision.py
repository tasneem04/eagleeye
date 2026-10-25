"""Parses and checks DecisionAgent's JSON reply against the geometry results.

The agent may only pass to a teammate the geometry engine verified as open.
If its reply is not usable, geometry's own best option is used and flagged.
"""

from __future__ import annotations

from .replies import extract_json

ACTIONS = {"pass", "dribble", "shoot"}
MODES = {"keep", "progress"}
SHOT_RANGE_M = 25.0
SAFE_PASS_MAX_M = 25.0


def geometry_choice(geometry: dict, mode: str | None = None) -> dict:
    """A rule-based decision from geometry alone (offline mock and safety net).

    `mode` comes from the tactical context: "keep" picks the safest open pass.
    """
    shot = geometry["shot"]
    open_ids = geometry["open_teammates"]
    by_id = {o["id"]: o for o in geometry["teammates"]}
    forward = [i for i in open_ids if by_id[i]["forward_m"] > 0]

    if mode == "keep":
        if shot["lane_clear"] and shot["distance_m"] < 16:
            return _decision("keep", "shoot", None, f"Even when protecting a lead, a clear chance from {shot['distance_m']:.0f} m is worth taking.")
        safe = [by_id[i] for i in open_ids if by_id[i]["distance_m"] <= SAFE_PASS_MAX_M and by_id[i]["role"] != "goalkeeper"]
        if safe:
            best = max(safe, key=lambda o: o["receiver_space_m"])
            return _decision("keep", "pass", best["id"], f"Keep the ball: #{best['id']} is the safest short pass with {best['receiver_space_m']:.0f} m of space.")
        if open_ids:
            return _decision("keep", "pass", open_ids[0], f"Keep the ball: #{open_ids[0]} is the safest open teammate.")
        return _decision("keep", "dribble", None, "Everyone is covered, so shield the ball and look again.")

    if shot["lane_clear"] and shot["distance_m"] < SHOT_RANGE_M:
        return _decision("progress", "shoot", None, f"Clear sight of goal from {shot['distance_m']:.0f} m.")
    if forward:
        best = by_id[forward[0]]
        return _decision(
            "progress", "pass", best["id"],
            f"#{best['id']} is open {best['forward_m']:.0f} m further forward with {best['receiver_space_m']:.0f} m of space.",
        )
    if geometry["free_space"]["space_m"] >= 8 and geometry["pressure"]["level"] != "high":
        return _decision("progress", "dribble", None, "No forward pass is on, but there is room to carry the ball.")
    if open_ids:
        return _decision("keep", "pass", open_ids[0], f"Keep the ball: #{open_ids[0]} is the safest open teammate.")
    return _decision("keep", "dribble", None, "Everyone is covered, so protect the ball and look again.")


def parse(text: str, geometry: dict, mode: str | None = None) -> dict:
    raw = extract_json(text)
    if raw is None:
        return {**geometry_choice(geometry, mode), "verified": False,
                "note": "DecisionAgent's reply was not valid JSON, so the geometry engine's best option is shown."}

    action = str(raw.get("action", "")).lower().strip()
    reply_mode = str(raw.get("mode", "")).lower().strip()
    target = raw.get("target_player_id")
    try:
        target = int(target) if target is not None else None
    except (TypeError, ValueError):
        target = None

    if action not in ACTIONS:
        return {**geometry_choice(geometry, mode), "verified": False,
                "note": f"DecisionAgent chose an unknown action '{action}', so the geometry engine's best option is shown."}
    if action == "pass" and target not in geometry["open_teammates"]:
        return {**geometry_choice(geometry, mode), "verified": False,
                "note": f"DecisionAgent picked #{target}, but the geometry says that pass is not open. Showing the best open option instead."}

    return {
        "mode": reply_mode if reply_mode in MODES else mode,
        "action": action,
        "target_player_id": target if action == "pass" else None,
        "reason": str(raw.get("reason", "")).strip(),
        "scan_cue": str(raw.get("scan_cue", "")).strip(),
        "verified": True,
        "note": None,
    }


def _decision(mode, action, target, reason) -> dict:
    return {"mode": mode, "action": action, "target_player_id": target, "reason": reason, "scan_cue": ""}

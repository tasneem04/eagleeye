"""Tactical context: phase of play, risk and whether to keep the ball or progress.

`rules` is the code-only version (offline mock and safety net); `parse` checks
TacticalContextAgent's JSON reply and falls back to `rules` if it is unusable.
"""

from __future__ import annotations

from .describe import channel, progress, third
from .replies import extract_json

PHASES = {"build-up", "progression", "chance creation", "finishing", "transition"}
RISKS = ["low", "medium", "high"]
MODES = {"keep", "progress"}


def situation_text(situation: dict, team: str, team_names: dict) -> str:
    """'Blue lead 1-0, 88th minute' from the selected team's point of view."""
    other = "away" if team == "home" else "home"
    mine, theirs = situation["score"][team], situation["score"][other]
    name = team_names[team]["name"]
    if mine > theirs:
        state = f"{name} lead {mine}-{theirs}"
    elif mine < theirs:
        state = f"{name} trail {mine}-{theirs}"
    else:
        state = f"level at {mine}-{theirs}"
    return f"{state}, {_ordinal(situation['minute'])} minute"


def game_state(situation: dict, team: str) -> str:
    other = "away" if team == "home" else "home"
    diff = situation["score"][team] - situation["score"][other]
    return "leading" if diff > 0 else "trailing" if diff < 0 else "level"


def rules(geometry: dict, situation: dict) -> dict:
    me = geometry["selected"]
    attacking = geometry["attacking"]
    p = progress(me["x"], attacking)
    shot = geometry["shot"]

    if shot["distance_m"] < 20:
        phase = "finishing"
    elif p < 100 / 3:
        phase = "build-up"
    elif p < 200 / 3:
        phase = "progression"
    else:
        phase = "chance creation"

    risk = 0 if p < 100 / 3 else 1 if p < 200 / 3 else 2
    state = game_state(situation, me["team"])
    late = situation["minute"] >= 80
    if state == "leading" and late:
        risk -= 1
    elif state == "trailing" and situation["minute"] >= 75:
        risk += 1
    if geometry["pressure"]["level"] == "high" and p < 100 / 3:
        risk = 0
    risk = max(0, min(2, risk))

    by_id = {o["id"]: o for o in geometry["teammates"]}
    forward_open = [i for i in geometry["open_teammates"] if by_id[i]["forward_m"] > 0]
    can_progress = bool(forward_open or geometry["third_man"] or (shot["lane_clear"] and shot["distance_m"] < 25))
    mode = "progress" if can_progress and risk > 0 else "keep"

    principles = []
    if geometry["triangles"]:
        ids = geometry["triangles"][0]["player_ids"]
        principles.append(f"triangle available with #{ids[1]} and #{ids[2]}")
    for combo in geometry["third_man"][:1]:
        _, link, runner = combo["player_ids"]
        principles.append(f"third-man combination: #{link} can find #{runner}")
    if geometry["switch_options"]:
        principles.append(f"switch of play possible to #{geometry['switch_options'][0]}")
    if geometry["pressure"]["level"] == "high":
        principles.append("under high pressure: play simple, first time")
    if state == "leading" and late:
        principles.append("protect the lead: keep possession, avoid risky passes")
    if state == "trailing" and situation["minute"] >= 75:
        principles.append("chasing the game: take the forward option")
    open_by_value = sorted((by_id[i] for i in geometry["open_teammates"]), key=lambda o: o["space_value"], reverse=True)
    if open_by_value and me["has_ball"]:
        principles.append(f"most dangerous open teammate: #{open_by_value[0]['id']}")

    return {
        "phase": phase,
        "zone": f"{third(me['x'], attacking)}, {channel(me['y'], attacking)}",
        "risk": RISKS[risk],
        "mode": mode,
        "principles": principles,
        "position_advice": position_advice(geometry),
    }


def position_advice(geometry: dict) -> str:
    """Rule-based sentence from the engine's best position (code chooses the words)."""
    sv = geometry["space_value"]
    best = sv["best_position"]
    if best is None:
        return "" if geometry["selected"]["has_ball"] else (sv["note"] or "")
    if best["run_m"] < 2:
        return "Hold your position: you are already in the best spot. Keep scanning."
    passer = f"#{best['pass_from']}" if best["pass_from"] is not None else "the ball"
    if not best["available_here"]:
        return f"Get free: move {best['direction_text']} so {passer} can find you."
    return f"Move {best['direction_text']}: more dangerous space, and {passer} can still find you."


def parse(text: str, geometry: dict, situation: dict) -> dict:
    raw = extract_json(text)
    fallback = rules(geometry, situation)
    if raw is None:
        return {**fallback, "verified": False,
                "note": "TacticalContextAgent's reply was not valid JSON, so the rule-based context is shown."}

    mode = str(raw.get("mode", "")).lower().strip()
    if mode not in MODES:
        return {**fallback, "verified": False,
                "note": f"TacticalContextAgent returned an unknown mode '{mode}', so the rule-based context is shown."}

    risk = str(raw.get("risk", "")).lower().strip()
    principles = raw.get("principles") or []
    if not isinstance(principles, list):
        principles = [str(principles)]
    # The engine owns the position; without one, the agent may not invent advice.
    advice = str(raw.get("position_advice") or "").strip()
    if geometry["space_value"]["best_position"] is None or not advice:
        advice = fallback["position_advice"]
    return {
        "phase": str(raw.get("phase", fallback["phase"])).strip(),
        "zone": str(raw.get("zone", fallback["zone"])).strip(),
        "risk": risk if risk in RISKS else fallback["risk"],
        "mode": mode,
        "principles": [str(x).strip() for x in principles if str(x).strip()][:5],
        "position_advice": advice,
        "verified": True,
        "note": None,
    }


def _ordinal(n: int) -> str:
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"

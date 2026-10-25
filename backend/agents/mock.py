"""Offline stand-ins for the Foundry agents, built from the geometry results.

Used when EAGLEEYE_MODE=mock, and as a fallback when a Foundry call fails, so
the app always has something to show.
"""

from __future__ import annotations

import json

from . import decision as decision_rules
from . import scene
from . import tactical as tactical_rules


def tactical_context(geometry: dict, situation: dict) -> str:
    return json.dumps(tactical_rules.rules(geometry, situation))


def coach(chosen: dict, geometry: dict) -> str:
    target = f" to #{chosen['target_player_id']}" if chosen.get("target_player_id") else ""
    look = chosen.get("scan_cue") or "Look over both shoulders before the ball arrives."
    return f"{look} Then {chosen['action']}{target}. {chosen['reason']}"


DEBRIEF_TIPS = {
    "great": "Great scanning: keep checking both shoulders like that.",
    "further": "Good, you turned your head. Next time hold the turn on that side to look as far round as your head goes, and pause to pick out who is there.",
    "more": "Next time, turn your head both ways while the ball is still with the passer.",
}


def coach_debrief(facts: list[str], tip: str) -> str:
    """Offline debrief: the code-written facts, with a scanning tip at the end."""
    return " ".join(facts[1:] + [DEBRIEF_TIPS[tip]])


def decision(geometry: dict, mode: str | None = None) -> str:
    choice = decision_rules.geometry_choice(geometry, mode)
    choice["scan_cue"] = "Check over your shoulder for the teammate in space before the ball arrives."
    return json.dumps(choice)


def field_mapper(scenario: dict, frame: dict, geometry: dict) -> str:
    """Offline description, worded from the same measured facts the agent gets."""
    measured = scene.facts(scenario, frame, geometry)
    me, ball = measured["selected"], measured["ball"]
    other_team = next(t["name"] for key, t in scenario["teams"].items() if key != geometry["selected"]["team"])

    if me["has_ball"]:
        ball_line = f"{me['team']} #{me['id']} ({me['role']}) has the ball"
    elif ball["holder"] is None:
        ball_line = f"The ball is travelling; {me['team']} #{me['id']} ({me['role']}) is off the ball"
    else:
        ball_line = f"#{ball['holder']} ({ball['holder_team']}) has the ball; {me['team']} #{me['id']} is off the ball"
    bullets = [f"{ball_line}, in the {me['zone']}."]

    bullets.append("Nearest teammates: " + ", ".join(
        f"#{o['id']} {o['distance_m']} m {o['direction']}" for o in measured["nearest_teammates"]
    ) + ".")

    if measured["nearest_opponents"]:
        first = measured["nearest_opponents"][0]
        bullets.append(
            f"Closest {other_team} player: #{first['id']} at {first['distance_m']} m "
            f"({measured['pressure']} pressure)."
        )

    blocked = [o for o in geometry["teammates"] if not o["lane_open"]]
    if blocked:
        bullets.append("Passing lanes with an opponent in the way: " + ", ".join(
            f"to #{o['id']} (#{', #'.join(map(str, o['blocked_by']))} in line)" for o in blocked[:3]
        ) + ".")

    space = measured["free_space"]
    bullets.append(
        f"Largest open area within {space['searched_within_m']} m ahead: {space['zone']}, "
        f"about {space['room_from_nearest_opponent_m']} m from the nearest opponent."
    )
    return "\n".join(f"- {b}" for b in bullets)

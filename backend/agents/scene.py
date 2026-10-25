"""The scene facts FieldMapper puts into words, and the check of its reply.

Code measures every distance and direction; the agent only phrases them. A
small model cannot convert 0-100 coordinates into metres reliably, so it is
never asked to.
"""

from __future__ import annotations

import json
import re

from ..geometry import SPACE_RADIUS_M
from .describe import channel, relative_direction, third

NEAREST = 3
SMALL_COUNTS = {1, 2, 3}  # "2-3 teammates" and the like


def facts(scenario: dict, frame: dict, geometry: dict) -> dict:
    """The "Measured by code" block: whole metres, directions from the selected player's view."""
    teams = scenario["teams"]
    me = geometry["selected"]
    attacking = geometry["attacking"]
    players = {p["id"]: p for p in frame["players"]}
    here = (me["x"], me["y"])

    def zone(x, y):
        return f"{third(x, attacking)}, {channel(y, attacking)}"

    def person(pid, distance_m):
        p = players[pid]
        return {"id": pid, "role": p["role"], "distance_m": round(distance_m),
                "direction": relative_direction(here, (p["x"], p["y"]), attacking)}

    ball = frame["ball"]
    owner = ball["owner"]
    ball_facts = {"holder": owner, "zone": zone(ball["x"], ball["y"])}
    if owner is None:
        ball_facts["status"] = "travelling (a pass in the air, nobody has it)"
    else:
        ball_facts["holder_team"] = teams[players[owner]["team"]]["name"]
        ball_facts["status"] = "with the selected player" if me["has_ball"] else f"with #{owner}"

    space = geometry["free_space"]
    return {
        "ball": ball_facts,
        "selected": {
            "id": me["id"], "team": teams[me["team"]]["name"], "role": me["role"], "has_ball": me["has_ball"],
            "zone": zone(me["x"], me["y"]),
            "attacks_toward": "x=100" if attacking == "right" else "x=0",
        },
        "nearest_teammates": [person(o["id"], o["distance_m"])
                              for o in sorted(geometry["teammates"], key=lambda o: o["distance_m"])[:NEAREST]],
        "nearest_opponents": [person(o["id"], o["distance_m"]) for o in geometry["pressure"]["nearest_opponents"]],
        "pressure": geometry["pressure"]["level"],
        "free_space": {
            "searched_within_m": round(SPACE_RADIUS_M),
            "zone": channel(space["y"], attacking),
            "direction": relative_direction(here, (space["x"], space["y"]), attacking),
            "room_from_nearest_opponent_m": round(space["space_m"]),
        },
    }


def check(reply: str, measured: dict, frame: dict) -> tuple[bool, str | None]:
    """Every #N must be a player on the pitch, and every other number one the code measured."""
    on_pitch = {p["id"] for p in frame["players"]}
    for pid in map(int, re.findall(r"#(\d+)", reply)):
        if pid not in on_pitch:
            return False, f"FieldMapper mentioned #{pid}, who isn't on the pitch, so the offline description is shown."
    allowed = {float(n) for n in re.findall(r"\d+(?:\.\d+)?", json.dumps(measured))} | SMALL_COUNTS
    for number in re.findall(r"(?<![#\d.])\d+(?:\.\d+)?", reply):
        if float(number) not in allowed:
            return False, f"FieldMapper said {number}, which the code didn't measure, so the offline description is shown."
    return True, None

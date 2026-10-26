"""Builds the user turn sent to each Foundry agent.

Messages are self-describing (pitch size, axes, directions) so the agent does
not depend on its portal instructions to interpret the coordinates.
"""

from __future__ import annotations

import json

from . import tactical


def field_mapper_input(scenario: dict, frame: dict, player_id: int, measured: dict) -> str:
    """`measured` is `scene.facts()`: the agent words these numbers and never calculates its own."""
    teams = scenario["teams"]
    directions = scenario["attacking_direction"]
    player = next(p for p in frame["players"] if p["id"] == player_id)
    team_name = teams[player["team"]]["name"]
    has_ball = frame["ball"]["owner"] == player_id

    def goal_x(team):
        return 100 if directions[team] == "right" else 0

    lines = [
        f"Selected player: #{player_id} ({team_name}, {player['role']})"
        + (" - has the ball." if has_ball else " - does not have the ball."),
        f'Teams: "home" = {teams["home"]["name"]}, attacking toward x={goal_x("home")}; '
        f'"away" = {teams["away"]["name"]}, attacking toward x={goal_x("away")}.',
        "Pitch: 105 m long x 68 m wide. x runs 0-100 along the length, y runs 0-100 across the width "
        "(1 x-unit = 1.05 m, 1 y-unit = 0.68 m). y=0 is the top touchline as drawn.",
        "All data is synthetic. Player ids are shirt numbers.",
        "",
        "Measured by code (distances in whole metres, directions from the selected player's point of view; "
        "use these exactly):",
        json.dumps(measured, separators=(",", ":")),
        "",
        "Moment JSON (for reference only; do not calculate distances or directions from it):",
        json.dumps(frame, separators=(",", ":")),
    ]
    return "\n".join(lines)


def decision_input(field_map: str, geometry: dict, tactical: dict | None = None) -> str:
    """FieldMapper's description, the geometry facts and (if present) the tactical context."""
    lines = [
        "Scene description from FieldMapper:",
        field_map.strip(),
        "",
        "Geometry results (calculated in code, distances in metres; these are verified facts):",
        json.dumps(_geometry_facts(geometry), separators=(",", ":")),
        "",
    ]
    if tactical:
        context = {k: tactical[k] for k in ("phase", "zone", "risk", "mode", "principles")}
        lines += [
            "Tactical context from TacticalContextAgent (follow its mode):",
            json.dumps(context, separators=(",", ":")),
            "",
        ]
    lines += [
        "Choose the single best action for the selected player. You may only pass to an id in open_teammates.",
        'Reply with ONLY JSON: {"mode":"keep|progress","action":"pass|dribble|shoot",'
        '"target_player_id":<int or null>,"reason":"<max 25 words>","scan_cue":"<what to look at before receiving>"}',
    ]
    return "\n".join(lines)


def tactical_input(scenario: dict, geometry: dict, situation: dict) -> str:
    """Geometry facts plus the match situation, for the phase/risk/mode judgement."""
    team = geometry["selected"]["team"]
    lines = [
        f"Match situation: {tactical.situation_text(situation, team, scenario['teams'])}.",
        f"Selected player: #{geometry['selected']['id']} ({scenario['teams'][team]['name']}, "
        f"{geometry['selected']['role']}), attacking toward "
        f"{'x=100' if geometry['attacking'] == 'right' else 'x=0'}.",
        "Pitch: 105 m x 68 m; coordinates 0-100 on both axes. All data is synthetic.",
        "",
        "Geometry results (calculated in code, distances in metres; these are verified facts):",
        json.dumps(_geometry_facts(geometry), separators=(",", ":")),
        "",
        'Reply with ONLY JSON: {"phase":"build-up|progression|chance creation|finishing|transition",'
        '"zone":"<third and channel>","risk":"low|medium|high","mode":"keep|progress","principles":["<max 4 short items>"],'
        '"position_advice":"<one sentence rephrasing space_value.best_position.direction_text, or empty>"}',
    ]
    return "\n".join(lines)


def coach_input(chosen: dict, context: dict | None, geometry: dict, audience: str, language: str) -> str:
    """The verified decision, for a short explanation. Facts come from code; the coach only phrases them."""
    facts = {k: chosen.get(k) for k in ("mode", "action", "target_player_id", "reason", "scan_cue")}
    if context:
        facts["phase"] = context.get("phase")
        facts["risk"] = context.get("risk")
        facts["position_advice"] = context.get("position_advice")
    facts["selected_player"] = geometry["selected"]["id"]
    facts["has_ball"] = geometry["selected"]["has_ball"]
    return "\n".join([
        f"Audience: {audience}. Language: {language}.",
        "Mode: ANALYSE. Explain this decision in 2-4 short sentences: what to look at first (scanning), then what to do and why.",
        "Use only these facts (do not add players, distances or directions):",
        json.dumps(facts, separators=(",", ":")),
    ])


SCAN_VERDICTS = {
    "great": "great (enough scans, and no free teammate was missed)",
    "further": "good, not great (enough scans, but a free teammate was missed)",
    "more": "not enough yet (fewer scans than the target)",
}


def coach_debrief_input(facts: list[str], level: str, audience: str, language: str, tip: str) -> str:
    # How to word the debrief lives in CoachAgent's instructions; repeating rules here would let them drift apart.
    # The scanning verdict is a fact worked out in code, so the coach can't praise a scan that fell short.
    return "\n".join([
        f"Audience: {audience}. Language: {language}. Training level: {level}.",
        "Mode: TRAINING DEBRIEF. The player just did a first-person scanning drill. Use only these facts:",
        *[f"- {f}" for f in facts],
        f"- Scanning verdict: {SCAN_VERDICTS[tip]}.",
    ])


def _geometry_facts(geometry: dict) -> dict:
    return {
        "selected": geometry["selected"],
        "attacking_toward": "x=100" if geometry["attacking"] == "right" else "x=0",
        "pressure": geometry["pressure"],
        "open_teammates": geometry["open_teammates"],
        "passing_options": [
            {k: o[k] for k in ("id", "role", "distance_m", "forward_m", "receiver_space_m", "lane_open",
                               "blocked_by", "offside", "open", "score", "space_value")}
            for o in geometry["teammates"]
        ],
        "triangles": geometry["triangles"],
        "third_man": geometry["third_man"],
        "switch_options": geometry["switch_options"],
        "free_space": geometry["free_space"],
        "shot": geometry["shot"],
        # The heatmap grid is for drawing only; agents get the summary.
        "space_value": {k: v for k, v in geometry["space_value"].items() if k != "heatmap"},
    }

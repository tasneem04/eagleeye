"""Space value: simplified pitch control x a hand-set threat surface.

- Pitch control: for any point, compare how quickly each team's nearest player
  could get there and squash the difference into 0-1 for the team we analyse.
  Each player first carries on along their current velocity for the reaction
  time (momentum from the previous keyframe), then runs at top speed.
- Threat: our own hand-set surface, more dangerous closer to goal and more
  central. It is NOT fitted to real match data.
- Value = control x threat: a spot is worth something only if it is dangerous
  AND your team can win it.

Units are metres on a 105 x 68 pitch. A mover is {"pos": (x, y), "vel": (vx, vy)}.
`sign` is +1 when the team attacks toward x = 105 and -1 toward x = 0.
"""

from __future__ import annotations

import math

PITCH_LENGTH_M = 105.0
PITCH_WIDTH_M = 68.0
CELL_M = 2.5
REACTION_S = 0.7
SPEED_MPS = 7.0
CONTROL_SCALE_S = 0.45
RUN_RADIUS_M = 12.0       # roughly a 2-second off-ball run
RUN_STEP_M = 1.5
ARRIVE_MARGIN_S = 0.3     # the runner must beat every opponent by this much
RUN_COST_PER_M = 0.004    # prefer short runs when two spots are worth about the same


def mover(pos, vel=(0.0, 0.0)) -> dict:
    return {"pos": pos, "vel": vel}


def reach_time(m: dict, point) -> float:
    """Reaction time spent drifting on current momentum, then a straight run at top speed."""
    sx = m["pos"][0] + m["vel"][0] * REACTION_S
    sy = m["pos"][1] + m["vel"][1] * REACTION_S
    return REACTION_S + math.hypot(point[0] - sx, point[1] - sy) / SPEED_MPS


def control(point, team, opponents) -> float:
    """Share of the point the team would win (0-1)."""
    t_team = min((reach_time(m, point) for m in team), default=math.inf)
    t_opp = min((reach_time(m, point) for m in opponents), default=math.inf)
    if math.isinf(t_opp):
        return 1.0
    if math.isinf(t_team):
        return 0.0
    return 1 / (1 + math.exp((t_team - t_opp) / CONTROL_SCALE_S))


def threat(point, sign) -> float:
    """About 0 near our own goal, 1 in front of the opponent's goal."""
    progress = point[0] / PITCH_LENGTH_M if sign == 1 else 1 - point[0] / PITCH_LENGTH_M
    progress = min(1.0, max(0.0, progress))
    centrality = 1 - min(1.0, abs(point[1] / PITCH_WIDTH_M - 0.5) * 2)
    return progress ** 2.2 * (0.45 + 0.55 * centrality ** 1.5)


def value(point, team, opponents, sign) -> float:
    return control(point, team, opponents) * threat(point, sign)


def xg(distance_m: float, angle_deg: float, lane_clear: bool) -> float:
    """A simple, self-made shot quality estimate from distance and visible goal angle."""
    z = -1.6 + 0.045 * angle_deg - 0.07 * distance_m
    chance = 1 / (1 + math.exp(-z))
    return chance if lane_clear else chance * 0.4


def heatmap(team, opponents, sign) -> dict:
    cols = round(PITCH_LENGTH_M / CELL_M)
    rows = round(PITCH_WIDTH_M / CELL_M)
    values = []
    for r in range(rows):
        for c in range(cols):
            centre = ((c + 0.5) * PITCH_LENGTH_M / cols, (r + 0.5) * PITCH_WIDTH_M / rows)
            values.append(round(value(centre, team, opponents, sign), 3))
    return {"cols": cols, "rows": rows, "values": values}


def best_position(runner: dict, team: list, opponents: list, sign: int, lane_ok) -> dict | None:
    """The most valuable spot the runner can reach first that the ball can be played into.

    `team` includes the runner. `lane_ok(point)` says whether a pass from the
    ball to `point` is clear and short enough.
    """
    others = [m for m in team if m is not runner]
    here = value(runner["pos"], team, opponents, sign)
    best = None
    steps = int(RUN_RADIUS_M / RUN_STEP_M)
    for i in range(-steps, steps + 1):
        for j in range(-steps, steps + 1):
            point = (runner["pos"][0] + i * RUN_STEP_M, runner["pos"][1] + j * RUN_STEP_M)
            run = math.hypot(point[0] - runner["pos"][0], point[1] - runner["pos"][1])
            if run > RUN_RADIUS_M:
                continue
            if not (1 <= point[0] <= PITCH_LENGTH_M - 1 and 1 <= point[1] <= PITCH_WIDTH_M - 1):
                continue
            # A planned run has no reaction delay; defenders have to react to it.
            t_runner = run / SPEED_MPS
            t_opp = min((reach_time(o, point) for o in opponents), default=math.inf)
            if t_runner + ARRIVE_MARGIN_S >= t_opp:
                continue
            if not lane_ok(point):
                continue
            v = value(point, others + [mover(point)], opponents, sign)
            score = v - RUN_COST_PER_M * run
            if best is None or score > best[0]:
                best = (score, point, v, run)
    if best is None:
        return None
    _, point, v, run = best
    return {"point_m": point, "value": v, "value_here": here, "run_m": run}

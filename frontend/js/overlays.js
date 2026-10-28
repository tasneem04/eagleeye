// Draws the geometry engine's results on the pitch: free space, triangles,
// passing lanes and pressure. Everything comes from /api/geometry.

import { COLORS } from './pitch.js';

const TAG_STYLE = {
  you: { fill: COLORS.ink, ink: '#ffffff' },
  best: { fill: COLORS.accent, ink: '#3d2b00' },
  pick: { fill: '#ffffff', ink: COLORS.ink },
  missed: { fill: '#c2410c', ink: '#ffffff' },
  glimpsed: { fill: '#f59e0b', ink: '#3d2b00' },
};

/**
 * A small pill by a player: "YOU" in ink above, the answer's "OPEN 6.2m" in gold to the right.
 * `place` overrides where it sits: 'above', 'right' or 'below'.
 */
export function drawPitchTag(view, p, text, kind, place = kind === 'best' ? 'right' : 'above') {
  const { ctx } = view;
  const [x, y] = view.toPx(p.x, p.y);
  const style = TAG_STYLE[kind] ?? TAG_STYLE.you;
  ctx.save();
  ctx.font = '800 10px "DM Sans", system-ui, sans-serif';
  const w = ctx.measureText(text).width + 14;
  const h = 17;
  const gap = view.playerRadius + (kind === 'missed' || kind === 'glimpsed' ? 12 : 6);
  let left = x - w / 2;
  let top = place === 'below' ? y + gap : y - gap - h;
  if (place === 'right') [left, top] = [x + view.playerRadius + 4, y - h / 2];
  // Keep the pill inside the canvas.
  left = Math.min(Math.max(4, left), view.cssWidth - w - 4);
  top = Math.min(Math.max(4, top), view.cssHeight - h - 4);
  ctx.shadowColor = 'rgba(29, 20, 22, 0.18)';
  ctx.shadowBlur = 4;
  ctx.fillStyle = style.fill;
  ctx.beginPath();
  ctx.roundRect(left, top, w, h, h / 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = style.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + w / 2, top + h / 2 + 0.5);
  ctx.restore();
}

/** Where to look: a soft white cone from you towards the answer's receiver. */
export function drawLookCone(view, me, to) {
  const { ctx } = view;
  const [x, y] = view.toPx(me.x, me.y);
  const [tx, ty] = view.toPx(to.x, to.y);
  const a = Math.atan2(ty - y, tx - x);
  const r = Math.hypot(tx - x, ty - y) * 1.15;
  const half = 0.32;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(255, 255, 255, 0.42)');
  g.addColorStop(1, 'rgba(255, 255, 255, 0.04)');
  ctx.save();
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, r, a - half, a + half);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Off the ball with a suggested run: show only "where should I be?". */
export function isOffBall(geometry) {
  return !geometry.selected.has_ball && Boolean(geometry.space_value?.best_position);
}

export function drawOverlays(view, geometry, positions, now, { decision = null, heatmap = false, simple = false } = {}) {
  const me = positions.get(geometry.selected.id);
  if (!me) return;
  const { ctx } = view;
  ctx.save();
  if (heatmap) drawHeatmap(view, geometry.space_value.heatmap);
  if (isOffBall(geometry)) {
    drawBestPosition(view, geometry.space_value.best_position, me, positions, now);
  } else if (simple) {
    // The clean picture: only the forward passes that are closed (dashed), then the answer.
    drawLanes(view, geometry.teammates.filter((o) => !o.open && o.forward_m > 0), me, positions);
    if (decision) drawDecision(view, decision, geometry, me, positions);
  } else {
    drawFreeSpace(view, geometry.free_space, now);
    drawTriangles(view, geometry.triangles, positions);
    drawLanes(view, geometry.teammates, me, positions);
    drawThirdMan(view, geometry.third_man, positions);
    drawPressure(view, geometry.pressure, me, positions);
    if (decision) drawDecision(view, decision, geometry, me, positions);
  }
  ctx.restore();
}

/** Simplified pitch control x threat for the selected player's team: gold = valuable space they can win. */
function drawHeatmap(view, heatmap) {
  if (!heatmap) return;
  const { ctx } = view;
  const { cols, rows, values } = heatmap;
  const max = Math.max(...values, 0.001);
  const cellW = (105 / cols) * view.scale;
  const cellH = (68 / rows) * view.scale;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = values[r * cols + c] / max;
      if (v < 0.08) continue;
      const [x, y] = view.m((c * 105) / cols, (r * 68) / rows);
      ctx.fillStyle = `rgba(245, 179, 1, ${(v * 0.55).toFixed(3)})`;
      ctx.fillRect(x, y, cellW + 0.5, cellH + 0.5);
    }
  }
}

/** "Move here": run line from the player, ring at the spot, and the clear pass into it. */
function drawBestPosition(view, best, me, positions, now) {
  const { ctx } = view;
  const target = { x: best.x, y: best.y };
  const passer = best.pass_from != null ? positions.get(best.pass_from) : null;
  if (passer) arrow(view, passer, target, { color: COLORS.open, width: 2.5, dash: [] }, true);

  const [tx, ty] = view.toPx(target.x, target.y);
  if (best.run_m >= 2) {
    arrow(view, me, target, { color: COLORS.accent, width: 3, dash: [8, 6] }, true);
  }
  const pulse = (Math.sin(now / 350) + 1) / 2;
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(tx, ty, view.playerRadius + 4 + pulse * 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = COLORS.accent;
  ctx.font = '700 12px "DM Sans", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(best.run_m >= 2 ? (best.available_here ? 'move here' : 'get free here') : 'hold', tx, ty - view.playerRadius - 10);
}

/** The chosen action as a bold gold arrow: to the receiver, into space, or at goal. */
export function drawDecision(view, decision, geometry, me, positions, color = COLORS.accent) {
  let to = null;
  if (decision.action === 'pass') to = positions.get(decision.target_player_id);
  else if (decision.action === 'dribble') to = geometry.free_space;
  else if (decision.action === 'shoot') to = { x: geometry.attacking === 'right' ? 100 : 0, y: 50 };
  if (!to) return;
  const { ctx } = view;
  // Best: bold gold with a glow. Anything else ("your pick"): an ink dashed line.
  const best = color === COLORS.accent;
  ctx.shadowColor = best ? 'rgba(245, 179, 1, 0.7)' : 'rgba(255, 255, 255, 0.6)';
  ctx.shadowBlur = best ? 12 : 4;
  arrow(view, me, to, { color, width: best ? 5 : 3, dash: best && decision.action !== 'dribble' ? [] : [10, 6] }, true);
  ctx.shadowBlur = 0;
}

function drawFreeSpace(view, space, now) {
  if (!space || space.space_m < 3) return;
  const { ctx } = view;
  const [x, y] = view.toPx(space.x, space.y);
  const pulse = (Math.sin(now / 400) + 1) / 2;
  const r = (3 + pulse * 1.2) * view.scale;
  ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
  ctx.strokeStyle = COLORS.space;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = COLORS.space;
  ctx.font = '600 12px "DM Sans", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('space', x, y);
}

function drawTriangles(view, triangles, positions) {
  const { ctx } = view;
  triangles.slice(0, 2).forEach((tri, rank) => {
    const pts = tri.player_ids.map((id) => positions.get(id)).filter(Boolean);
    if (pts.length !== 3) return;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = view.toPx(p.x, p.y);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = rank === 0 ? 'rgba(245, 179, 1, 0.22)' : 'rgba(245, 179, 1, 0.1)';
    ctx.fill();
    ctx.strokeStyle = rank === 0 ? COLORS.accent : 'rgba(245, 179, 1, 0.5)';
    ctx.lineWidth = rank === 0 ? 2 : 1.5;
    ctx.setLineDash([3, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  });
}

export function drawLanes(view, teammates, me, positions) {
  // Blocked and marked lanes only matter going forward; open lanes are always shown.
  const lanes = teammates
    .filter((o) => o.role !== 'goalkeeper')
    .map((o) => ({ ...o, kind: o.open ? 'open' : o.lane_open ? 'marked' : 'blocked' }))
    .filter((o) => o.kind === 'open' || o.forward_m > 0);
  const order = { blocked: 0, marked: 1, open: 2 };
  lanes.sort((a, b) => order[a.kind] - order[b.kind]);

  for (const lane of lanes) {
    const to = positions.get(lane.id);
    if (!to) continue;
    const style = {
      open: { color: COLORS.open, width: 3, dash: [] },
      marked: { color: COLORS.marked, width: 2, dash: [7, 6] },
      blocked: { color: COLORS.blocked, width: 2, dash: [4, 6] },
    }[lane.kind];
    arrow(view, me, to, style, lane.kind === 'open');
  }
}

/** Best third-man route: the link's pass on to the runner we couldn't reach directly. */
function drawThirdMan(view, combos, positions) {
  const combo = combos?.[0];
  if (!combo) return;
  const [, linkId, runnerId] = combo.player_ids;
  const link = positions.get(linkId);
  const runner = positions.get(runnerId);
  if (!link || !runner) return;
  arrow(view, link, runner, { color: COLORS.thirdMan, width: 2.5, dash: [2, 5] }, true);
}

function drawPressure(view, pressure, me, positions) {
  const { ctx } = view;
  const [mx, my] = view.toPx(me.x, me.y);
  const close = pressure.nearest_opponents.filter((o) => o.distance_m < 6);
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.75)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([2, 4]);
  for (const opp of close) {
    const p = positions.get(opp.id);
    if (!p) continue;
    const [x, y] = view.toPx(p.x, p.y);
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

// ---- training reveal ----------------------------------------------------------

/** Where the learner's eyes went: one faint wedge per gaze sample, so frequent looks build up. */
export function drawScanCones(view, samples, halfAngleDeg, radiusM = 28) {
  const { ctx } = view;
  // One path for every sample, filled once: the area you looked at reads as one soft shape.
  ctx.beginPath();
  for (const s of samples) {
    const [x, y] = view.toPx(s.x, s.y);
    const a = (s.yaw * Math.PI) / 180;
    const half = (halfAngleDeg * Math.PI) / 180;
    // Yaw is in metres-space; the canvas scales x and y equally per metre, so angles carry over.
    ctx.moveTo(x, y);
    ctx.arc(x, y, radiusM * view.scale, a - half, a + half);
    ctx.closePath();
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.fill('nonzero');
}

/**
 * "Not checked": the side you never looked at, hatched, wherever a player you missed was standing.
 * Bearings are in metres-space, like the scan samples.
 */
export function drawUnchecked(view, me, samples, halfAngleDeg, missed, positions) {
  const STEP = 3;
  const toM = (p) => [p.x * 1.05, p.y * 0.68];
  const wrap = (d) => ((d % 360) + 360) % 360;
  const covered = new Array(360 / STEP).fill(false);
  for (const s of samples) {
    for (let d = -halfAngleDeg; d <= halfAngleDeg; d += STEP) covered[Math.floor(wrap(s.yaw + d) / STEP)] = true;
  }
  const [mx, my] = toM(me);
  const done = new Set();
  const { ctx } = view;
  for (const m of missed) {
    const p = positions.get(m.id);
    if (!p || m.noticed) continue;
    const [px, py] = toM(p);
    const bearing = wrap((Math.atan2(py - my, px - mx) * 180) / Math.PI);
    let i = Math.floor(bearing / STEP);
    if (covered[i] || done.has(i)) continue;
    // Grow the arc both ways, around the missed player, while it stays unchecked (at most ~100 degrees).
    const n = covered.length;
    const maxSteps = Math.round(100 / STEP);
    let lo = i;
    let hi = i;
    while (hi - lo + 1 < maxSteps) {
      const down = !covered[(((lo - 1) % n) + n) % n];
      const up = !covered[(hi + 1) % n];
      if (!down && !up) break;
      if (down) lo -= 1;
      if (up && hi - lo + 1 < maxSteps) hi += 1;
    }
    for (let k = lo; k <= hi; k++) done.add(((k % n) + n) % n);
    const radius = Math.min(26, Math.hypot(px - mx, py - my) + 7) * view.scale;
    const [cx, cy] = view.toPx(me.x, me.y);
    const a0 = (lo * STEP * Math.PI) / 180;
    const a1 = ((hi + 1) * STEP * Math.PI) / 180;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, a0, a1);
    ctx.closePath();
    ctx.fillStyle = 'rgba(29, 20, 22, 0.08)';
    ctx.fill();
    ctx.clip();
    ctx.strokeStyle = 'rgba(29, 20, 22, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let o = -radius * 2; o < radius * 2; o += 9) {
      ctx.moveTo(cx + o - radius, cy - radius);
      ctx.lineTo(cx + o + radius, cy + radius);
    }
    ctx.stroke();
    ctx.restore();
    // The label sits inside the arc, off to one side of the missed player and his tags.
    const mid = a0 + (a1 - a0) * 0.22;
    const lr = radius * 0.62;
    ctx.save();
    ctx.font = '800 10px "DM Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(29, 20, 22, 0.62)';
    ctx.fillText('NOT CHECKED', cx + Math.cos(mid) * lr, cy + Math.sin(mid) * lr);
    ctx.restore();
  }
  return done.size > 0;
}

/** Key players the learner never identified: red if never seen, amber if only glimpsed. */
/** A dashed ring round each key player you missed (the "MISSED · #10" tags go on after the players). */
export function drawMissed(view, missed, positions) {
  const { ctx } = view;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([5, 4]);
  for (const m of missed) {
    const p = positions.get(m.id);
    if (!p) continue;
    const [x, y] = view.toPx(p.x, p.y);
    ctx.strokeStyle = m.noticed ? '#f59e0b' : '#c2410c';
    ctx.beginPath();
    ctx.arc(x, y, view.playerRadius + 7, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

export function arrow(view, from, to, style, head) {
  const { ctx } = view;
  const [x1, y1] = view.toPx(from.x, from.y);
  const [x2, y2] = view.toPx(to.x, to.y);
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 1) return;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const r = view.playerRadius + 4;
  const sx = x1 + ux * r;
  const sy = y1 + uy * r;
  const ex = x2 - ux * r;
  const ey = y2 - uy * r;

  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width;
  ctx.setLineDash(style.dash);
  ctx.globalAlpha = head ? 1 : 0.8;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.setLineDash([]);

  if (head) {
    const size = 6 + style.width * 1.5;
    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - ux * size - uy * size * 0.6, ey - uy * size + ux * size * 0.6);
    ctx.lineTo(ex - ux * size + uy * size * 0.6, ey - uy * size - ux * size * 0.6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

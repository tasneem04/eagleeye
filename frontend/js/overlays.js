// Draws the geometry engine's results on the pitch: free space, triangles,
// passing lanes and pressure. Everything comes from /api/geometry.

import { COLORS } from './pitch.js';

/** Off the ball with a suggested run: show only "where should I be?". */
export function isOffBall(geometry) {
  return !geometry.selected.has_ball && Boolean(geometry.space_value?.best_position);
}

export function drawOverlays(view, geometry, positions, now, { decision = null, heatmap = false } = {}) {
  const me = positions.get(geometry.selected.id);
  if (!me) return;
  const { ctx } = view;
  ctx.save();
  if (heatmap) drawHeatmap(view, geometry.space_value.heatmap);
  if (isOffBall(geometry)) {
    drawBestPosition(view, geometry.space_value.best_position, me, positions, now);
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
      ctx.fillStyle = `rgba(245, 197, 66, ${(v * 0.55).toFixed(3)})`;
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
  ctx.font = '700 12px Inter, system-ui, sans-serif';
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
  ctx.shadowColor = color === COLORS.accent ? 'rgba(245, 197, 66, 0.8)' : 'rgba(255, 255, 255, 0.5)';
  ctx.shadowBlur = 12;
  arrow(view, me, to, { color, width: color === COLORS.accent ? 5 : 3, dash: decision.action === 'dribble' ? [10, 6] : [] }, true);
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
  ctx.font = '600 12px Inter, system-ui, sans-serif';
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
    ctx.fillStyle = rank === 0 ? 'rgba(245, 197, 66, 0.22)' : 'rgba(245, 197, 66, 0.1)';
    ctx.fill();
    ctx.strokeStyle = rank === 0 ? COLORS.accent : 'rgba(245, 197, 66, 0.5)';
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
  ctx.fillStyle = 'rgba(56, 189, 248, 0.03)';
  for (const s of samples) {
    const [x, y] = view.toPx(s.x, s.y);
    const a = (s.yaw * Math.PI) / 180;
    const half = (halfAngleDeg * Math.PI) / 180;
    // Yaw is in metres-space; the canvas scales x and y equally per metre, so angles carry over.
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, radiusM * view.scale, a - half, a + half);
    ctx.closePath();
    ctx.fill();
  }
}

/** Key players the learner never identified: red if never seen, amber if only glimpsed. */
export function drawMissed(view, missed, positions) {
  const { ctx } = view;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([5, 4]);
  ctx.font = '700 11px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const m of missed) {
    const p = positions.get(m.id);
    if (!p) continue;
    const color = m.noticed ? COLORS.marked : COLORS.blocked;
    const [x, y] = view.toPx(p.x, p.y);
    const r = view.playerRadius + 7;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(m.noticed ? 'only glimpsed' : 'missed', x, y + r + 3);
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

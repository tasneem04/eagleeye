// "What happens next": plays a replay worked out by the server (backend/consequence.py), step by
// step: the choice itself, then the run at goal and the shot (or how far out the attack still is).
// Shared by Analyse and Train.

import { COLORS } from './pitch.js';

const TONE = { good: '#15803d', ok: '#7a5600', risky: '#c2410c' }; // label text on white

/** Players and ball at this instant. Each step eases from the previous snapshot to its own. */
export function replayFrame(replay, players, now) {
  const { data } = replay;
  let t = (now - replay.t0) / 1000;
  let from = data.start;
  const last = data.steps.length - 1;
  for (let i = 0; i <= last; i++) {
    const step = data.steps[i];
    if (t <= step.duration_s || i === last) {
      const k = Math.min(1, Math.max(0, t / step.duration_s));
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; // ease in-out
      const a = new Map(from.players.map((p) => [p.id, p]));
      const b = new Map(step.players.map((p) => [p.id, p]));
      const lerp = (p, q) => ({ x: p.x + (q.x - p.x) * e, y: p.y + (q.y - p.y) * e });
      const arrived = k >= 1;
      return {
        done: i === last && arrived,
        players: players.map((p) => (a.has(p.id) && b.has(p.id) ? { ...p, ...lerp(a.get(p.id), b.get(p.id)) } : p)),
        ball: { ...lerp(from.ball, step.ball), owner: null },
        // The label of the step just finished stays up while the next one plays.
        label: arrived ? step.label : i > 0 ? data.steps[i - 1].label : null,
        aim: arrived ? step.aim ?? null : null,
      };
    }
    t -= step.duration_s;
    from = step;
  }
  return null;
}

/** The outcome label over the ball, and for a run that ends far out, a dashed line to goal with the chance. */
export function drawReplayMarks(view, frame, tone) {
  const { ctx } = view;
  ctx.save();
  if (frame.aim) {
    const [x1, y1] = view.toPx(frame.ball.x, frame.ball.y);
    const [x2, y2] = view.toPx(frame.aim.to.x, frame.aim.to.y);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (frame.label) {
    const [x, y] = view.toPx(frame.ball.x, frame.ball.y);
    ctx.font = '700 13px "DM Sans", system-ui, sans-serif';
    const w = ctx.measureText(frame.label).width + 16;
    const colour = TONE[tone] ?? TONE.ok;
    const top = y - view.playerRadius - 34;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = colour;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, top, w, 24, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = colour;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(frame.label, x, top + 12);
  }
  ctx.restore();
}

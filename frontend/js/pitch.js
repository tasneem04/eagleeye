// Bird's-eye pitch renderer. Scenario coordinates are 0-100 on both axes;
// everything is drawn in metres on a 105 x 68 pitch, then scaled to the canvas.

export const PITCH_LENGTH = 105;
export const PITCH_WIDTH = 68;
const MARGIN = 4;            // metres of run-off drawn around the pitch
const PLAYER_RADIUS = 1.5;   // metres
const BALL_RADIUS = 0.75;

export const COLORS = {
  home: '#3b82f6',
  away: '#ef4444',
  accent: '#f5c542',
  open: '#22c55e',
  blocked: '#ef4444',
  marked: '#f59e0b',
  space: '#38bdf8',
  thirdMan: '#c084fc',
  unknown: '#64748b', // a shape you noticed but couldn't place in a team
};

export class PitchView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
  }

  resize() {
    const cssWidth = this.canvas.parentElement.clientWidth;
    const totalW = PITCH_LENGTH + 2 * MARGIN;
    const totalH = PITCH_WIDTH + 2 * MARGIN;
    const cssHeight = (cssWidth * totalH) / totalW;
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(cssWidth * this.dpr);
    this.canvas.height = Math.round(cssHeight * this.dpr);
    this.canvas.style.height = `${cssHeight}px`;
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.scale = cssWidth / totalW; // css px per metre
  }

  /** metres -> css px */
  m(mx, my) {
    return [(mx + MARGIN) * this.scale, (my + MARGIN) * this.scale];
  }

  /** scenario units (0-100) -> css px */
  toPx(x, y) {
    return this.m((x * PITCH_LENGTH) / 100, (y * PITCH_WIDTH) / 100);
  }

  /** css px -> scenario units (0-100) */
  toUnits(px, py) {
    return [((px / this.scale - MARGIN) * 100) / PITCH_LENGTH, ((py / this.scale - MARGIN) * 100) / PITCH_WIDTH];
  }

  get playerRadius() {
    return Math.max(9, PLAYER_RADIUS * this.scale);
  }

  begin() {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
  }

  drawPitch() {
    const { ctx } = this;
    ctx.fillStyle = '#0d3b1e';
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);

    const stripes = 14;
    const stripeW = PITCH_LENGTH / stripes;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 ? '#15592f' : '#17623a';
      const [x, y] = this.m(i * stripeW, 0);
      ctx.fillRect(x, y, stripeW * this.scale + 0.5, PITCH_WIDTH * this.scale);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.82)';
    ctx.lineWidth = Math.max(1.5, 0.12 * this.scale);
    ctx.setLineDash([]);

    this.#rect(0, 0, PITCH_LENGTH, PITCH_WIDTH);
    this.#line(PITCH_LENGTH / 2, 0, PITCH_LENGTH / 2, PITCH_WIDTH);
    this.#circle(PITCH_LENGTH / 2, PITCH_WIDTH / 2, 9.15);
    this.#spot(PITCH_LENGTH / 2, PITCH_WIDTH / 2);

    const mid = PITCH_WIDTH / 2;
    for (const [goalLine, dir] of [[0, 1], [PITCH_LENGTH, -1]]) {
      const box = (depth, width) => {
        const x = dir === 1 ? goalLine : goalLine - depth;
        this.#rect(x, mid - width / 2, depth, width);
      };
      box(16.5, 40.32);
      box(5.5, 18.32);
      const spotX = goalLine + dir * 11;
      this.#spot(spotX, mid);
      const a = Math.acos(5.5 / 9.15);
      const base = dir === 1 ? 0 : Math.PI;
      this.#arc(spotX, mid, 9.15, base - a, base + a);
      const goalX = dir === 1 ? goalLine - 2 : goalLine;
      this.#rect(goalX, mid - 3.66, 2, 7.32);
    }
  }

  /**
   * Label both goals and the attacking direction, so the picture always has a "which way" reference.
   * left/right: { text, color } for the goal at x = 0 and x = 105; arrow: { text, dir: 'left'|'right', color }.
   */
  drawSides({ left, right, arrow }) {
    const { ctx } = this;
    const size = Math.round(Math.max(9, Math.min(13, 1.4 * this.scale)));
    ctx.save();
    ctx.font = `700 ${size}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [atLeft, label] of [[true, left], [false, right]]) {
      if (!label) continue;
      const [x, y] = this.m(atLeft ? 2.4 : PITCH_LENGTH - 2.4, PITCH_WIDTH / 2);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(atLeft ? -Math.PI / 2 : Math.PI / 2); // read along the goal line
      const w = ctx.measureText(label.text).width + 12;
      ctx.fillStyle = 'rgba(10, 15, 26, 0.8)';
      ctx.fillRect(-w / 2, -size * 0.8, w, size * 1.6);
      ctx.fillStyle = label.color;
      ctx.fillText(label.text, 0, 0.5);
      ctx.restore();
    }
    if (arrow) {
      const [cx] = this.m(PITCH_LENGTH / 2, 0);
      const text = arrow.dir === 'right' ? `${arrow.text}  →` : `←  ${arrow.text}`;
      const w = ctx.measureText(text).width + 14;
      const y = (MARGIN * this.scale) / 2;
      ctx.fillStyle = 'rgba(10, 15, 26, 0.8)';
      ctx.fillRect(cx - w / 2, y - size * 0.75, w, size * 1.5);
      ctx.fillStyle = arrow.color;
      ctx.fillText(text, cx, y + 0.5);
    }
    ctx.restore();
  }

  drawPlayers(players, { selectedId = null, focusIds = null } = {}) {
    const { ctx } = this;
    const r = this.playerRadius;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(r * 0.95)}px Inter, system-ui, sans-serif`;
    for (const p of players) {
      ctx.globalAlpha = (p.alpha ?? 1) * (focusIds && !focusIds.has(p.id) ? 0.35 : 1);
      const [x, y] = this.toPx(p.x, p.y);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.arc(x + 1.5, y + 2, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = COLORS[p.team] ?? COLORS.unknown;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(p.label ?? p.id), x, y + 0.5);

      if (p.id === selectedId) {
        ctx.strokeStyle = COLORS.accent;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, r + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawBall(ball) {
    const { ctx } = this;
    const [x, y] = this.toPx(ball.x, ball.y);
    const r = Math.max(5, BALL_RADIUS * this.scale);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  /** The player under a css-pixel point, if any. */
  hitTest(cssX, cssY, players) {
    const reach = this.playerRadius * 1.6;
    let best = null;
    for (const p of players) {
      const [x, y] = this.toPx(p.x, p.y);
      const d = Math.hypot(x - cssX, y - cssY);
      if (d <= reach && (!best || d < best.d)) best = { player: p, d };
    }
    return best?.player ?? null;
  }

  #rect(x, y, w, h) {
    const [px, py] = this.m(x, y);
    this.ctx.strokeRect(px, py, w * this.scale, h * this.scale);
  }

  #line(x1, y1, x2, y2) {
    const [a, b] = this.m(x1, y1);
    const [c, d] = this.m(x2, y2);
    this.ctx.beginPath();
    this.ctx.moveTo(a, b);
    this.ctx.lineTo(c, d);
    this.ctx.stroke();
  }

  #circle(x, y, r) {
    this.#arc(x, y, r, 0, Math.PI * 2);
  }

  #arc(x, y, r, start, end) {
    const [px, py] = this.m(x, y);
    this.ctx.beginPath();
    this.ctx.arc(px, py, r * this.scale, start, end);
    this.ctx.stroke();
  }

  #spot(x, y) {
    const [px, py] = this.m(x, y);
    this.ctx.fillStyle = 'rgba(255,255,255,0.82)';
    this.ctx.beginPath();
    this.ctx.arc(px, py, Math.max(1.5, 0.25 * this.scale), 0, Math.PI * 2);
    this.ctx.fill();
  }
}

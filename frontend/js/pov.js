// First-person view from a player's eyes, drawn with a simple pinhole camera.
// Scenario positions are 0-100 units; everything is converted to metres on a
// 105 x 68 pitch. Yaw uses the same convention as the backend: degrees from
// atan2(dy, dx) in metres, so a positive turn is to the player's right.

import { COLORS, PITCH_LENGTH, PITCH_WIDTH } from './pitch.js';

const EYE_HEIGHT = 1.7;
const PLAYER_HEIGHT = 1.8;
const PLAYER_WIDTH = 0.55;
const NEAR = 0.4;
export const FOV_DEG = 90;
const HORIZON = 0.42; // share of the canvas height above the horizon

const toM = (x, y) => [(x * PITCH_LENGTH) / 100, (y * PITCH_WIDTH) / 100];

export class PovView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.lines = pitchLines();
    this.stripes = pitchStripes();
    // Vision zones around the gaze (degrees), replaced by the server's values.
    this.zones = { identify_deg: 30, colour_deg: 60, presence_deg: 100 };
  }

  /** Place the eye at a player (units) looking along yawDeg. */
  setCamera([x, y], yawDeg) {
    [this.ex, this.ey] = toM(x, y);
    const yaw = (yawDeg * Math.PI) / 180;
    this.cos = Math.cos(yaw);
    this.sin = Math.sin(yaw);
    const rect = this.canvas.getBoundingClientRect();
    this.w = rect.width;
    this.h = rect.height;
    this.horizon = this.h * HORIZON;
    this.focal = this.w / 2 / Math.tan(((FOV_DEG / 2) * Math.PI) / 180);
  }

  /** metres -> camera space [forward, right] */
  cam(mx, my) {
    const dx = mx - this.ex;
    const dy = my - this.ey;
    return [dx * this.cos + dy * this.sin, -dx * this.sin + dy * this.cos];
  }

  /** camera space + height -> screen px */
  screen(f, r, height = 0) {
    return [this.w / 2 + (r / f) * this.focal, this.horizon + ((EYE_HEIGHT - height) / f) * this.focal];
  }

  draw({ players, ball, blur = 0 }) {
    const { ctx } = this;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Motion blur while the gaze is sweeping (browsers without canvas filters just skip it).
    this.motionBlur = blur;
    ctx.filter = blur > 0.2 ? `blur(${blur.toFixed(1)}px)` : 'none';
    this.#backdrop();
    this.#stripes();
    this.#lines();
    this.#goals();
    this.#people(players, ball);
    ctx.filter = 'none';
    this.#vignette();
    this.#peripheral(players);
  }

  /** Degrees between the gaze (screen centre) and a point in camera space. */
  static offAxis(f, r) {
    return Math.abs((Math.atan2(r, f) * 180) / Math.PI);
  }

  #backdrop() {
    const { ctx, w, h, horizon } = this;
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#0a1020');
    sky.addColorStop(0.7, '#17223a');
    sky.addColorStop(1, '#26324d');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon);
    // a low stand along the horizon
    ctx.fillStyle = '#121a2c';
    ctx.fillRect(0, horizon - h * 0.05, w, h * 0.05);
    const grass = ctx.createLinearGradient(0, horizon, 0, h);
    grass.addColorStop(0, '#0f4a26');
    grass.addColorStop(1, '#1a6b3a');
    ctx.fillStyle = grass;
    ctx.fillRect(0, horizon, w, h - horizon);
  }

  #stripes() {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
    for (const quad of this.stripes) {
      const clipped = clipNear(quad.map(([x, y]) => this.cam(x, y)));
      if (clipped.length < 3) continue;
      ctx.beginPath();
      clipped.forEach(([f, r], i) => {
        const [sx, sy] = this.screen(f, r);
        i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
      });
      ctx.closePath();
      ctx.fill();
    }
  }

  #lines() {
    const { ctx } = this;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    for (const line of this.lines) {
      ctx.beginPath();
      let pen = false;
      for (let i = 1; i < line.length; i++) {
        const seg = clipSegment(this.cam(...line[i - 1]), this.cam(...line[i]));
        if (!seg) {
          pen = false;
          continue;
        }
        const [a, b] = seg.map(([f, r]) => this.screen(f, r));
        if (!pen) ctx.moveTo(...a);
        ctx.lineTo(...b);
        pen = true;
      }
      ctx.stroke();
    }
  }

  #goals() {
    const { ctx } = this;
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 3;
    for (const gx of [0, PITCH_LENGTH]) {
      const posts = [PITCH_WIDTH / 2 - 3.66, PITCH_WIDTH / 2 + 3.66].map((gy) => this.cam(gx, gy));
      if (posts.some(([f]) => f < NEAR)) continue;
      const [[f1, r1], [f2, r2]] = posts;
      const a0 = this.screen(f1, r1, 0);
      const a1 = this.screen(f1, r1, 2.44);
      const b0 = this.screen(f2, r2, 0);
      const b1 = this.screen(f2, r2, 2.44);
      ctx.beginPath();
      ctx.moveTo(...a0);
      ctx.lineTo(...a1);
      ctx.lineTo(...b1);
      ctx.lineTo(...b0);
      ctx.stroke();
    }
  }

  #people(players, ball) {
    const items = players.map((p) => {
      const [mx, my] = toM(p.x, p.y);
      const [f, r] = this.cam(mx, my);
      return { kind: 'player', p, f, r };
    });
    if (ball) {
      const [mx, my] = toM(ball.x, ball.y);
      const [f, r] = this.cam(mx, my);
      items.push({ kind: 'ball', f, r });
    }
    const motion = this.motionBlur > 0.2 ? `blur(${this.motionBlur.toFixed(1)}px)` : 'none';
    items
      .filter((it) => it.f > NEAR + 0.3)
      .sort((a, b) => b.f - a.f)
      .forEach((it) => {
        if (it.kind === 'ball') this.#ball(it);
        else this.#player(it);
        this.ctx.filter = motion; // per-player softening must not leak to the next item
      });
  }

  #player({ p, f, r }) {
    const { ctx } = this;
    // Outside the central zone you see the shirt colour but can't read the number, and the figure is soft.
    const identifiable = PovView.offAxis(f, r) <= this.zones.identify_deg;
    const soft = identifiable ? this.motionBlur : Math.max(this.motionBlur, 1.6);
    ctx.filter = soft > 0.2 ? `blur(${soft.toFixed(1)}px)` : 'none';
    const px = (PLAYER_WIDTH / f) * this.focal;
    const [x, feet] = this.screen(f, r, 0);
    const [, waist] = this.screen(f, r, 0.9);
    const [, chest] = this.screen(f, r, 1.5);
    const [, head] = this.screen(f, r, 1.65);
    const color = COLORS[p.team];

    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(x, feet, px * 0.9, Math.max(1, px * 0.22), 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1f2937'; // shorts and socks
    roundRect(ctx, x - px * 0.35, waist, px * 0.7, feet - waist, px * 0.15);
    ctx.fill();
    const shirt = ctx.createLinearGradient(x - px / 2, 0, x + px / 2, 0);
    shirt.addColorStop(0, shade(color, -30));
    shirt.addColorStop(0.5, color);
    shirt.addColorStop(1, shade(color, -45));
    ctx.fillStyle = shirt;
    roundRect(ctx, x - px / 2, chest, px, waist - chest + 1, px * 0.25);
    ctx.fill();
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(x, head, Math.max(1.5, px * 0.3), 0, Math.PI * 2);
    ctx.fill();

    // Shirt number: on the chest when close, as a tag above the head when far.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (!identifiable) {
      ctx.filter = this.motionBlur > 0.2 ? `blur(${this.motionBlur.toFixed(1)}px)` : 'none';
      return;
    }
    if (px > 22) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${Math.round(px * 0.45)}px Inter, system-ui, sans-serif`;
      ctx.fillText(String(p.id), x, (chest + waist) / 2);
    } else {
      const tagY = head - Math.max(10, px * 0.6);
      ctx.font = '700 11px Inter, system-ui, sans-serif';
      const tw = ctx.measureText(String(p.id)).width + 8;
      ctx.fillStyle = color;
      roundRect(ctx, x - tw / 2, tagY - 8, tw, 16, 5);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(p.id), x, tagY + 0.5);
    }
  }

  #ball({ f, r }) {
    const { ctx } = this;
    const [x, y] = this.screen(f, r, 0.11);
    const rad = Math.max(3, (0.11 / f) * this.focal);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  /**
   * Players beyond the drawn view but inside the visual field: you sense movement out there
   * without knowing who it is. Shown as soft grey shapes at the screen edge.
   */
  #peripheral(players) {
    const { ctx, w, h, horizon } = this;
    const edge = FOV_DEG / 2;
    const far = this.zones.presence_deg;
    for (const p of players) {
      const [mx, my] = toM(p.x, p.y);
      const [f, r] = this.cam(mx, my);
      const angle = PovView.offAxis(f, r);
      if (angle <= edge || angle > far) continue;
      const dist = Math.max(1, Math.hypot(f, r));
      const height = Math.min(70, Math.max(10, 260 / dist));
      const x = r > 0 ? w - 5 : 5;
      const y = horizon + Math.min(h * 0.45, (EYE_HEIGHT / dist) * this.focal * 0.7);
      const alpha = 0.15 + 0.5 * (1 - (angle - edge) / (far - edge));
      const g = ctx.createRadialGradient(x, y - height / 2, 1, x, y - height / 2, height * 0.6);
      g.addColorStop(0, `rgba(203, 213, 225, ${alpha.toFixed(2)})`);
      g.addColorStop(1, 'rgba(203, 213, 225, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y - height / 2, height * 0.35, height * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  #vignette() {
    // Darker edges, like peripheral vision.
    const { ctx, w, h } = this;
    const g = ctx.createRadialGradient(w / 2, h * 0.55, h * 0.25, w / 2, h * 0.55, w * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

// ---- geometry helpers -----------------------------------------------------

function clipSegment(a, b) {
  if (a[0] < NEAR && b[0] < NEAR) return null;
  if (a[0] >= NEAR && b[0] >= NEAR) return [a, b];
  const t = (NEAR - a[0]) / (b[0] - a[0]);
  const c = [NEAR, a[1] + t * (b[1] - a[1])];
  return a[0] < NEAR ? [c, b] : [a, c];
}

/** Sutherland-Hodgman against the near plane, in camera space. */
function clipNear(poly) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ina = a[0] >= NEAR;
    const inb = b[0] >= NEAR;
    if (ina) out.push(a);
    if (ina !== inb) {
      const t = (NEAR - a[0]) / (b[0] - a[0]);
      out.push([NEAR, a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}

function pitchLines() {
  const L = PITCH_LENGTH;
  const W = PITCH_WIDTH;
  const mid = W / 2;
  const lines = [
    [[0, 0], [L, 0], [L, W], [0, W], [0, 0]],
    [[L / 2, 0], [L / 2, W]],
    circle(L / 2, mid, 9.15, 0, Math.PI * 2),
  ];
  for (const [g, d] of [[0, 1], [L, -1]]) {
    lines.push([[g, mid - 20.16], [g + d * 16.5, mid - 20.16], [g + d * 16.5, mid + 20.16], [g, mid + 20.16]]);
    lines.push([[g, mid - 9.16], [g + d * 5.5, mid - 9.16], [g + d * 5.5, mid + 9.16], [g, mid + 9.16]]);
    const a = Math.acos(5.5 / 9.15);
    const base = d === 1 ? 0 : Math.PI;
    lines.push(circle(g + d * 11, mid, 9.15, base - a, base + a));
  }
  // Densify straight lines so near-plane clipping stays accurate.
  return lines.map(densify);
}

function pitchStripes() {
  const n = 14;
  const w = PITCH_LENGTH / n;
  const quads = [];
  for (let i = 0; i < n; i += 2) {
    quads.push([[i * w, 0], [(i + 1) * w, 0], [(i + 1) * w, PITCH_WIDTH], [i * w, PITCH_WIDTH]]);
  }
  return quads;
}

function circle(cx, cy, r, a0, a1) {
  const pts = [];
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function densify(line) {
  const out = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1];
    const [x1, y1] = line[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2));
    for (let s = 1; s <= steps; s++) out.push([x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps]);
  }
  return out;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amount));
  return `rgb(${c(n >> 16)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
}

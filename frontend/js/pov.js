// First-person view from a player's eyes, drawn with a simple pinhole camera.
// Scenario positions are 0-100 units; everything is converted to metres on a
// 105 x 68 pitch. Yaw uses the same convention as the backend: degrees from
// atan2(dy, dx) in metres, so a positive turn is to the player's right.

import { COLORS, PITCH_LENGTH, PITCH_WIDTH } from './pitch.js';

const EYE_HEIGHT = 1.7;
const PLAYER_WIDTH = 0.55;
const NEAR = 0.4;
export const FOV_DEG = 90;
export const HORIZON = 0.42; // share of the canvas height above the horizon
const INK = '#1d1416';

// Blue: blue shirt, white shorts. Red: red shirt, dark shorts. Keepers wear their own colour.
const KITS = {
  home: { shirt: COLORS.home, shorts: '#f8fafc', socks: '#1d4ed8' },
  away: { shirt: COLORS.away, shorts: '#231a1c', socks: '#b91c1c' },
  homeKeeper: { shirt: '#0d9488', shorts: '#f8fafc', socks: '#0f766e' },
  awayKeeper: { shirt: '#f59e0b', shorts: '#231a1c', socks: '#b45309' },
};
const SKIN = ['#f1c7a3', '#d9a37a', '#b07a52', '#7d5034'];

const toM = (x, y) => [(x * PITCH_LENGTH) / 100, (y * PITCH_WIDTH) / 100];

export class PovView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.lines = pitchLines();
    this.stripes = pitchStripes();
    this.boxes = []; // where each player was drawn this frame, for clicks and labels
    // Vision zones around the gaze (degrees), replaced by the server's values.
    this.zones = { identify_deg: 30, colour_deg: 60, presence_deg: 100 };
    this.horizonShare = HORIZON; // lowered a little while a card covers the bottom of the view
    // The canvas size on screen, kept by an observer. Reading it every frame (getBoundingClientRect)
    // forced a page layout per frame, because the HUD text changes every frame too.
    this.cssW = canvas.clientWidth;
    this.cssH = canvas.clientHeight;
    new ResizeObserver(([entry]) => {
      this.cssW = entry.contentRect.width;
      this.cssH = entry.contentRect.height;
    }).observe(canvas);
  }

  /** Match the canvas pixels to its size on screen (cheap when nothing changed). */
  fit() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(this.cssW * dpr));
    const h = Math.max(1, Math.round(this.cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      // Make the blur's scratch canvases now, at their largest, not during the first head turn.
      this.blurCanvas ??= document.createElement('canvas');
      this.spriteCanvas ??= document.createElement('canvas');
      [this.blurCanvas.width, this.blurCanvas.height] = [Math.ceil(w * 0.85), Math.ceil(h * 0.85)];
      [this.spriteCanvas.width, this.spriteCanvas.height] = [Math.max(this.spriteCanvas.width, 160), Math.max(this.spriteCanvas.height, 320)];
      for (const c of [this.blurCanvas, this.spriteCanvas]) c.getContext('2d').drawImage(this.canvas, 0, 0, 1, 1);
    }
  }

  /** Place the eye at a player (units) looking along yawDeg. */
  setCamera([x, y], yawDeg) {
    [this.ex, this.ey] = toM(x, y);
    const yaw = (yawDeg * Math.PI) / 180;
    this.yaw = yaw;
    this.cos = Math.cos(yaw);
    this.sin = Math.sin(yaw);
    this.w = this.cssW;
    this.h = this.cssH;
    this.horizon = this.h * this.horizonShare;
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

  /** A click on the grass (css px) back to pitch units, or null above the horizon. */
  toPitch(sx, sy) {
    if (sy <= this.horizon + 2) return null;
    const f = (EYE_HEIGHT * this.focal) / (sy - this.horizon);
    const r = ((sx - this.w / 2) * f) / this.focal;
    const mx = this.ex + f * this.cos - r * this.sin;
    const my = this.ey + f * this.sin + r * this.cos;
    return { x: (mx * 100) / PITCH_LENGTH, y: (my * 100) / PITCH_WIDTH };
  }

  /** The id of the nearest drawn player under a css-pixel point, among `ids`. */
  hitTest(sx, sy, ids) {
    for (let i = this.boxes.length - 1; i >= 0; i--) { // nearest players were drawn last
      const b = this.boxes[i];
      if (!ids.has(b.id)) continue;
      const half = Math.max(b.half, 14);
      if (Math.abs(sx - b.x) <= half && sy >= b.top - 28 && sy <= b.bottom + 8) return b.id;
    }
    return null;
  }

  draw({ players, ball, blur = 0 }) {
    const { ctx } = this;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.boxes = [];
    this.#backdrop();
    this.#stripes();
    this.#lines();
    this.#goals();
    this.#people(players, ball);
    // Motion blur while the gaze is sweeping. No canvas `filter`: a blur filter on every shape
    // dropped the drill to a few frames a second. Shrinking the picture and stretching it back
    // gives the same softness for the cost of two image copies.
    if (blur > 0.2) this.#soften(blur);
    this.#vignette();
    this.#peripheral(players);
  }

  /** Soften the whole canvas by about `px` css pixels (downscale, then upscale with smoothing). */
  #soften(px) {
    const { canvas, ctx } = this;
    const s = Math.max(0.12, 1 / (1 + px * 0.9));
    const w = Math.max(1, Math.round(canvas.width * s));
    const h = Math.max(1, Math.round(canvas.height * s));
    this.blurCanvas ??= document.createElement('canvas');
    const b = this.blurCanvas;
    // Only ever grow it: the blur changes every frame, and resizing a canvas reallocates it.
    if (b.width < w || b.height < h) [b.width, b.height] = [Math.max(b.width, w), Math.max(b.height, h)];
    const bctx = b.getContext('2d');
    bctx.imageSmoothingEnabled = true;
    bctx.drawImage(canvas, 0, 0, w, h);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low'; // plain bilinear: soft enough, and 'high' stalled on first use
    ctx.drawImage(b, 0, 0, w, h, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  /**
   * Choose phase: a white ring at the feet and a label over each teammate you saw, and an ink
   * "Pass to" pill over the one under the pointer. marks: Map id -> label.
   */
  drawMarks(marks, hoverId = null) {
    const { ctx } = this;
    ctx.save();
    for (const b of this.boxes) {
      const label = marks.get(b.id);
      if (!label) continue;
      const rx = Math.max(16, b.half * 1.5);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = b.id === hoverId ? 4 : 3;
      ctx.beginPath();
      ctx.ellipse(b.x, b.bottom, rx, Math.max(5, rx * 0.28), 0, 0, Math.PI * 2);
      ctx.stroke();
      const hover = b.id === hoverId;
      tag(ctx, b.x, b.top - 18, hover ? `Pass to ${label}` : label, hover);
    }
    ctx.restore();
  }

  /** A speech bubble over a player, e.g. the passer before the drill starts. */
  drawBubble(id, text) {
    const b = this.boxes.find((x) => x.id === id);
    if (!b) return;
    const { ctx } = this;
    ctx.save();
    const y = b.top - 30;
    tag(ctx, b.x, y, text, true, 15);
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(b.x - 7, y + 14);
    ctx.lineTo(b.x + 7, y + 14);
    ctx.lineTo(b.x, y + 22);
    ctx.fill();
    ctx.restore();
  }

  /** Degrees between the gaze (screen centre) and a point in camera space. */
  static offAxis(f, r) {
    return Math.abs((Math.atan2(r, f) * 180) / Math.PI);
  }

  #backdrop() {
    const { ctx, w, h, horizon } = this;
    // A daytime stadium: sky, a stand with seat rows, an advertising board, then grass.
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#cfe4fa');
    sky.addColorStop(1, '#eaf3fd');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon);

    const standTop = horizon - h * 0.24;
    const boardH = Math.max(6, h * 0.02);
    ctx.fillStyle = '#eef1f5';
    ctx.fillRect(0, standTop, w, horizon - standTop - boardH);
    ctx.strokeStyle = '#d6dce5';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = standTop; y < horizon - boardH; y += Math.max(8, h * 0.025)) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    // Stand pillars drift as the head turns, so the turn is felt in the background too.
    const gap = w / 9;
    const shift = (((-this.yaw * this.focal) % gap) + gap) % gap;
    for (let x = shift; x < w; x += gap) {
      ctx.moveTo(x, standTop);
      ctx.lineTo(x, horizon - boardH);
    }
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, standTop - 3, w, 3);
    for (let i = -2; i * (gap / 2) + shift < w; i++) { // advertising board
      ctx.fillStyle = i % 2 ? '#ffffff' : '#fde4ea';
      ctx.fillRect(shift + i * (gap / 2), horizon - boardH, gap / 2 + 1, boardH);
    }
    for (const fx of [w * 0.06, w * 0.94]) { // floodlights
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(fx - 2, standTop - h * 0.12, 4, h * 0.12);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#d6dce5';
      ctx.beginPath();
      ctx.roundRect(fx - w * 0.022, standTop - h * 0.15, w * 0.044, h * 0.03, 3);
      ctx.fill();
      ctx.stroke();
    }

    const grass = ctx.createLinearGradient(0, horizon, 0, h);
    grass.addColorStop(0, '#a8dd8a');
    grass.addColorStop(1, '#7cc35e');
    ctx.fillStyle = grass;
    ctx.fillRect(0, horizon, w, h - horizon);
  }

  #stripes() {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
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
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = 2.5;
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
    for (const gx of [0, PITCH_LENGTH]) {
      const posts = [PITCH_WIDTH / 2 - 3.66, PITCH_WIDTH / 2 + 3.66].map((gy) => this.cam(gx, gy));
      if (posts.some(([f]) => f < NEAR)) continue;
      const [[f1, r1], [f2, r2]] = posts;
      const frame = [this.screen(f1, r1, 0), this.screen(f1, r1, 2.44), this.screen(f2, r2, 2.44), this.screen(f2, r2, 0)];
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)'; // the net
      ctx.beginPath();
      frame.forEach((pt, i) => (i ? ctx.lineTo(...pt) : ctx.moveTo(...pt)));
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      frame.forEach((pt, i) => (i ? ctx.lineTo(...pt) : ctx.moveTo(...pt)));
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
    items
      .filter((it) => it.f > NEAR + 0.3)
      .sort((a, b) => b.f - a.f)
      .forEach((it) => (it.kind === 'ball' ? this.#ball(it) : this.#player(it)));
  }

  #player({ p, f, r }) {
    const px = (PLAYER_WIDTH / f) * this.focal;
    const y = (height) => this.screen(f, r, height)[1];
    const [x, feet] = this.screen(f, r, 0);
    const headR = Math.max(1.5, px * 0.27);
    const head = y(1.6);
    this.boxes.push({ id: p.id, x, top: head - headR, bottom: feet, half: px * 0.75 });
    // Outside the central zone you see the shirt colour but can't read the number, and the figure is soft:
    // drawn small on a scratch canvas, then stretched back into place.
    if (PovView.offAxis(f, r) > this.zones.identify_deg) {
      const left = x - px * 0.95;
      const top = head - headR * 1.3;
      const w = px * 1.9;
      const h = feet + px * 0.3 - top;
      const s = 0.32; // about a 1.6 px blur at player size
      const sw = Math.max(1, Math.ceil(w * s));
      const sh = Math.max(1, Math.ceil(h * s));
      this.spriteCanvas ??= document.createElement('canvas');
      const c = this.spriteCanvas;
      if (c.width < sw || c.height < sh) [c.width, c.height] = [Math.max(c.width, sw), Math.max(c.height, sh)];
      const sctx = c.getContext('2d');
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.clearRect(0, 0, c.width, c.height); // all of it: smoothing reads a pixel past the edge
      sctx.setTransform(s, 0, 0, s, -left * s, -top * s);
      this.#figure(sctx, p, { x, feet, px, y, headR, head });
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.drawImage(c, 0, 0, sw, sh, left, top, sw / s, sh / s);
      return;
    }
    this.#figure(this.ctx, p, { x, feet, px, y, headR, head });
    this.#number(p, { x, px, y, headR, head });
  }

  /** The body: shadow, legs, shorts, arms, shirt, head and hair. */
  #figure(ctx, p, { x, feet, px, y, headR, head }) {
    const kit = KITS[p.role === 'goalkeeper' ? `${p.team}Keeper` : p.team] ?? KITS.home;
    const skin = SKIN[p.id % SKIN.length];

    ctx.fillStyle = 'rgba(29, 20, 22, 0.18)';
    ctx.beginPath();
    ctx.ellipse(x, feet, px * 0.85, Math.max(1, px * 0.2), 0, 0, Math.PI * 2);
    ctx.fill();

    const leg = px * 0.22;
    for (const side of [-1, 1]) {
      const lx = x + side * px * 0.17 - leg / 2;
      ctx.fillStyle = skin; // knees
      ctx.fillRect(lx, y(0.62), leg, y(0.42) - y(0.62));
      ctx.fillStyle = kit.socks;
      ctx.fillRect(lx, y(0.44), leg, y(0.06) - y(0.44));
      ctx.fillStyle = INK; // boots
      roundRect(ctx, lx - leg * 0.1, y(0.07), leg * 1.3, feet - y(0.07) + 1, leg * 0.3);
      ctx.fill();
    }
    ctx.fillStyle = kit.shorts;
    roundRect(ctx, x - px * 0.4, y(0.95), px * 0.8, y(0.6) - y(0.95), px * 0.1);
    ctx.fill();
    for (const side of [-1, 1]) { // arms: a sleeve in the shirt colour, then the forearm
      const ax = x + side * px * 0.58 - px * 0.11;
      ctx.fillStyle = skin;
      roundRect(ctx, ax, y(1.2), px * 0.22, y(0.98) - y(1.2), px * 0.1);
      ctx.fill();
      ctx.fillStyle = shade(kit.shirt, -20);
      roundRect(ctx, ax - px * 0.02, y(1.44), px * 0.26, y(1.18) - y(1.44), px * 0.1);
      ctx.fill();
    }
    const shirt = ctx.createLinearGradient(x - px / 2, 0, x + px / 2, 0);
    shirt.addColorStop(0, shade(kit.shirt, -18));
    shirt.addColorStop(0.5, kit.shirt);
    shirt.addColorStop(1, shade(kit.shirt, -30));
    ctx.fillStyle = shirt;
    roundRect(ctx, x - px / 2, y(1.47), px, y(0.93) - y(1.47), px * 0.22);
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(x, head, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3b2a20'; // hair
    ctx.beginPath();
    ctx.arc(x, head - headR * 0.15, headR, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
  }

  /** Shirt number: on the chest when close, as a tag above the head when far. Only in the central zone. */
  #number(p, { x, px, y, headR, head }) {
    const { ctx } = this;
    const kit = KITS[p.role === 'goalkeeper' ? `${p.team}Keeper` : p.team] ?? KITS.home;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (px > 22) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${Math.round(px * 0.5)}px 'DM Sans', system-ui, sans-serif`;
      ctx.fillText(String(p.id), x, (y(1.47) + y(0.93)) / 2);
    } else {
      const tagY = head - headR - Math.max(9, px * 0.5);
      ctx.font = "700 11px 'DM Sans', system-ui, sans-serif";
      const tw = ctx.measureText(String(p.id)).width + 8;
      ctx.fillStyle = kit.shirt;
      roundRect(ctx, x - tw / 2, tagY - 8, tw, 16, 8);
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
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(x, y, rad * 0.35, 0, Math.PI * 2);
    ctx.fill();
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
      const height = Math.min(90, Math.max(14, 300 / dist));
      const x = r > 0 ? w - 8 : 8;
      const y = horizon + Math.min(h * 0.45, (EYE_HEIGHT / dist) * this.focal * 0.7);
      const alpha = 0.18 + 0.4 * (1 - (angle - edge) / (far - edge));
      const g = ctx.createRadialGradient(x, y - height / 2, 1, x, y - height / 2, height * 0.6);
      g.addColorStop(0, `rgba(100, 116, 139, ${alpha.toFixed(2)})`);
      g.addColorStop(1, 'rgba(100, 116, 139, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y - height / 2, height * 0.35, height * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  #vignette() {
    // Slightly softer edges, like peripheral vision.
    const { ctx, w, h } = this;
    const g = ctx.createRadialGradient(w / 2, h * 0.55, h * 0.35, w / 2, h * 0.55, w * 0.7);
    g.addColorStop(0, 'rgba(29, 20, 22, 0)');
    g.addColorStop(1, 'rgba(29, 20, 22, 0.14)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

/** A label pill centred at (x, y): white with ink text, or ink with white text when `strong`. */
function tag(ctx, x, y, text, strong, size = 13) {
  ctx.font = `700 ${size}px 'DM Sans', system-ui, sans-serif`;
  const w = ctx.measureText(text).width + 22;
  const h = size + 14;
  ctx.fillStyle = strong ? INK : '#ffffff';
  ctx.shadowColor = 'rgba(29, 20, 22, 0.2)';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = strong ? '#ffffff' : INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
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

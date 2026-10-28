// Player's Eye training: watch the move from the receiver's eyes, scan by
// turning your head, choose when the ball arrives (still from your own eyes:
// the view from above opens only after you answer), then compare with the eagle eye.

import * as api from './api.js';
import { Gaze, MOVING_DEG_S } from './gaze.js';
import { arrow, drawDecision, drawMissed, drawPitchTag, drawScanCones, drawUnchecked } from './overlays.js';
import { COLORS, PitchView } from './pitch.js';
import { Playback } from './playback.js';
import { HORIZON, PovView } from './pov.js';
import * as profiles from './profiles.js';
import { drawReplayMarks, replayFrame } from './replay.js';

const SCAN_ON = 45;      // face turned this far from the ball = one scan
const SCAN_RESET = 20;    // must come back this close before the next scan counts
const SAMPLE_EVERY = 0.08;
const OPEN_DEG = 45;      // half-turn: body opened this far from the ball, which stays in view
const OPEN_TIME_S = 0.3;
const TIER_RANK = { shape: 1, colour: 2, id: 3 };
const CARRY_M = 8;        // dribbling toward a teammate: carry this far, then the pass is on
const MAX_CARRY_M = 15;
// Each player's drill history lives only in this browser (profiles.js); the server keeps nothing about players.
const LEVEL_NAMES = { rookie: 'Rookie', academy: 'Academy', pro: 'Pro' };
const VERDICT = {
  best: ['Best choice', 'open'],
  good: ['Good, safe choice', 'low'],
  ok: ['Possible', 'medium'],
  risky: ['Risky choice', 'high'],
};
const TIER_WORD = { id: 'seen', colour: 'shirt only', shape: 'sensed' };
const DIRECTION_ORDER = { ahead: 0, left: 1, right: 2, behind: 3 };

const toM = (x, y) => [x * 1.05, y * 0.68];
const toU = (mx, my) => [mx / 1.05, my / 0.68];
const wrap = (d) => ((d + 540) % 360) - 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const SIDES = { left: -1, right: 1 };
const CHOOSE_HORIZON = 0.3; // while the choose card covers the bottom, the players stand above it
const NARROW = window.matchMedia('(max-width: 760px)'); // phones: the cards sit under the view, not on it
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

// Small line icons for the cards (drawn here, no icon pack).
const ICON = {
  people: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14c3 0 5 2 5 4.5"/></svg>',
  target: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.8"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  arrow: '<svg viewBox="0 0 24 24"><path d="M4 12h15M13 6l6 6-6 6"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  retry: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v5h5"/></svg>',
  dice: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M9 9h.01M15 9h.01M9 15h.01M15 15h.01" stroke-width="3"/></svg>',
  play: '<svg viewBox="0 0 24 24" class="solid"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  chevron: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
};

function bearing(from, to) {
  const [ax, ay] = toM(from.x, from.y);
  const [bx, by] = toM(to.x, to.y);
  return (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
}

export class Training {
  /**
   * canvas: the full-width first-person view. root: the Train section (all clicks). layer: cards
   * floating on the view. page: the reveal page. progress: the Progress tab. onMode(mode) asks the
   * app to switch tabs.
   */
  constructor({ canvas, root, layer, page, progress, hud, onMode }) {
    this.canvas = canvas;
    this.pov = new PovView(canvas);
    this.root = root;
    this.layer = layer;
    this.page = page;
    this.progressEl = progress;
    this.hud = hud;
    this.onMode = onMode;
    this.view = null; // the bird's-eye view, only in the reveal
    this.level = 'rookie';
    this.phase = 'idle';
    this.active = false;
    this.gaze = new Gaze();
    this.scenarios = new Map();
    this.trials = null;

    root.addEventListener('click', (e) => this.#onPanelClick(e));
    progress.addEventListener('click', (e) => this.#onPanelClick(e));
    root.addEventListener('change', (e) => {
      if (e.target.id === 'trial-select') this.#brief(this.#trialById(e.target.value));
    });
    canvas.addEventListener('click', (e) => this.#onPovClick(e));
    canvas.addEventListener('pointermove', (e) => this.#onPovHover(e));
    canvas.addEventListener('pointerleave', () => { this.hoverId = null; });
    for (const btn of hud.querySelectorAll('[data-look]')) {
      const side = SIDES[btn.dataset.look];
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.#press(side);
      });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, () => this.gaze.release(side));
    }
    hud.querySelector('[data-body]').addEventListener('click', () => this.#toggleBody());
  }

  /** Receive on the half-turn: open the body towards the goal you attack, ball still in view. */
  #toggleBody() {
    if (this.phase !== 'scanning') return;
    this.openTarget = this.openTarget ? 0 : 1;
    this.hud.querySelector('[data-body]').classList.toggle('on', Boolean(this.openTarget));
  }

  #press(side) {
    if (this.phase === 'scanning') this.gaze.press(side);
  }

  // ---- lifecycle ------------------------------------------------------------

  async #load() {
    if (this.trials) return;
    const data = await api.getTrials();
    this.levels = data.levels;
    this.vision = data.vision;
    this.pov.zones = data.vision;
    this.halfAngle = data.vision.identify_deg;
    this.minEvidence = data.min_evidence ?? 3;
    this.trials = data.trials;
    try {
      profiles.setDemoHistory((await api.getDemoHistory()).history);
    } catch { /* the demo player just starts empty */ }
    profiles.keepStorage();
  }

  async enter() {
    this.active = true;
    if (!this.trials) {
      this.page.hidden = true;
      this.layer.className = 'train-layer center';
      this.layer.innerHTML = '<div class="float"><div class="loading"><span class="spinner"></span>Loading drills…</div></div>';
      await this.#load();
    }
    if (!profiles.currentProfile() || this.wantWho) {
      this.wantWho = false;
      this.#showWho();
      return;
    }
    await this.#playAs();
  }

  /** The avatar: pick who's playing, from any tab. Returns true if Train must be opened first. */
  askWho() {
    if (this.active) {
      this.#showWho();
      return false;
    }
    this.wantWho = true;
    return true;
  }

  /** "Who's playing?": pick or create a player before training. */
  #showWho(error = '') {
    this.phase = 'who';
    this.whoError = error;
    this.newColour ??= profiles.COLOURS[0];
    this.hud.hidden = true;
    this.#render();
  }

  /** Start where this player left off: their saved level, and a drill from that level. */
  async #playAs() {
    this.level = profiles.savedLevel();
    if (this.trial?.kind === 'drill' && this.trial.level !== this.level) this.trial = null;
    this.onProfile?.();
    await this.#recommend();
    await this.#brief(this.trial ?? this.#randomDrill());
  }

  #setLevel(level) {
    this.level = level;
    profiles.saveLevel(level);
  }

  exit() {
    this.active = false;
    this.phase = 'idle';
    this.hud.hidden = true;
    this.gaze.reset();
  }

  /** The Progress tab: the player's record, focus and history. */
  async enterProgress() {
    this.progressOpen = true;
    this.progressEl.innerHTML = '<div class="card"><div class="loading"><span class="spinner"></span>Loading your progress…</div></div>';
    await this.#load();
    await this.#recommend();
    this.#renderProgress();
  }

  exitProgress() {
    this.progressOpen = false;
  }

  #renderProgress() {
    if (!this.progressOpen) return;
    const p = profiles.currentProfile();
    const head = `
      <div class="kicker">Your progress</div>
      <h1>How your eye is improving</h1>
      <p class="sub">Every drill is graded by the same code. Kept in this browser only: the server keeps nothing about players.</p>`;
    if (!p) {
      this.progressEl.innerHTML = `${head}
        <div class="card" style="margin-top:18px">
          <h2>Pick who's playing</h2>
          <p class="sub">Choose a player (or the demo player with a sample history) to see their progress.</p>
          <button class="primary-btn" data-train="go-who">Who's playing?</button>
        </div>`;
      return;
    }
    const empty = profiles.loadHistory().length
      ? ''
      : '<div class="card"><h2>No drills yet</h2><p class="sub">Play a drill in Train and your progress starts here.</p></div>';
    this.progressEl.innerHTML = `${head}
      <div class="card player-bar" style="margin-top:18px">
        <span class="badge-dot" style="background:${safeColour(p.colour)}"></span>
        <span><strong>${esc(p.name)}</strong>${p.demo ? ' <span class="sub">· sample history</span>' : ''}</span>
        <button class="link-btn" data-train="switch">Switch player</button>
        <button class="primary-btn" data-train="go-train">Train now</button>
      </div>
      <div class="progress-grid">
        <div>${empty}${this.#progressHtml()}</div>
        <div style="display:grid;gap:18px">${this.#focusHtml(false)}${researchHtml()}</div>
      </div>`;
  }

  onKey(e, down) {
    const k = e.key.toLowerCase();
    if (this.phase === 'scanning' && ['arrowleft', 'a', 'arrowright', 'd'].includes(k)) {
      e.preventDefault();
      const side = k === 'arrowleft' || k === 'a' ? -1 : 1;
      if (down) this.#press(side);
      else this.gaze.release(side);
    } else if (down && this.phase === 'scanning' && (k === 'arrowup' || k === 'w')) {
      e.preventDefault();
      this.#toggleBody();
    } else if (down && this.phase === 'brief' && (e.code === 'Space' || k === 'enter')) {
      if (['SELECT', 'BUTTON'].includes(document.activeElement?.tagName)) return;
      e.preventDefault();
      this.#start();
    }
  }

  resize() {
    this.view?.resize();
  }

  // ---- phases ---------------------------------------------------------------

  async #brief(trial) {
    this.trial = trial;
    this.replay = null;
    this.scenario = await this.#scenario(trial.scenario_id);
    this.playback = null;
    this.result = null;
    this.gaze.reset();
    this.phase = 'brief';
    this.hud.hidden = true;
    this.#render();
  }

  #start() {
    const { start_frame: a, arrival_frame: b } = this.trial;
    this.playback = new Playback();
    this.playback.load(this.scenario.frames.slice(a, b + 1));
    this.playback.speed = this.levels[this.level].speed;
    this.playback.play();
    this.gaze.reset();
    this.scans = 0;
    this.armed = true;
    this.seen = new Map(); // id -> { x, y, t, tier } with the best tier reached
    this.samples = [];
    this.sampleClock = 0;
    this.ballYaw = null;
    this.open = 0;
    this.openTarget = 0;
    this.hud.querySelector('[data-body]').classList.remove('on');
    this.hud.classList.remove('deciding');
    this.hud.querySelector('#hud-label').textContent = 'Ball arrives';
    this.phase = 'scanning';
    this.hud.hidden = false;
    this.#render();
  }

  #arrive() {
    this.phase = 'deciding';
    this.decideMode = 'pass';
    this.openedBody = this.open > 0.8;
    this.gaze.reset();
    // The top pill stays, now as a status line: scans made, ball at your feet, the clock.
    const limit = this.levels[this.level].decision_s;
    this.hud.classList.add('deciding');
    this.hud.querySelector('#hud-label').textContent = 'Ball at your feet';
    this.hud.querySelector('#hud-clock').textContent = limit ? `${limit} s to decide` : `No clock on ${LEVEL_NAMES[this.level]}`;
    this.hoverId = null;
    // You can play to a teammate you identified or whose shirt you saw, never to an unknown shape.
    const info = new Map(this.playback.current().players.map((p) => [p.id, p]));
    const team = this.scenario.teams[this.trial.team].name;
    this.passable = new Map();
    for (const [id, s] of this.seen) {
      const p = info.get(id);
      if (p && id !== this.trial.receiver && p.team === this.trial.team && s.tier !== 'shape') {
        this.passable.set(id, s.tier === 'id' ? `#${id}` : `${team} ?`);
      }
    }
    this.passIds = new Set(this.passable.keys());
    this.decideStart = performance.now();
    this.#render();
  }

  async #choose(action, target = null, spot = null) {
    this.choice = { action, target, spot };
    this.decisionMs = Math.round(performance.now() - this.decideStart);
    this.phase = 'evaluating';
    this.#render();
    try {
      this.result = await api.evaluateTraining({
        trial_id: this.trial.id,
        level: this.level,
        scans: this.scans,
        seen_ids: [...this.seen].filter(([, s]) => s.tier === 'id').map(([id]) => id),
        noticed_ids: [...this.seen].filter(([, s]) => s.tier !== 'id').map(([id]) => id),
        opened_body: this.openedBody,
        choice: { action, target_player_id: target, target_x: spot?.x ?? null, target_y: spot?.y ?? null },
        decision_ms: this.decisionMs,
      });
      this.#saveHistory(this.result.result);
      this.clarity = null;
      await this.#recommend();
    } catch (err) {
      this.error = err.message;
    }
    this.phase = 'reveal';
    this.#render();
    window.scrollTo(0, 0);
  }

  /** Weak spots and the next drill, worked out from this player's own recent drills. */
  async #recommend() {
    const history = profiles.loadHistory();
    if (!history.length) {
      this.recommendation = null;
      return;
    }
    try {
      this.recommendation = await api.nextDrill({
        level: this.level,
        history: history.map(({ at, ...h }) => h),
        last_trial_id: this.trial?.id ?? null,
      });
    } catch {
      this.recommendation = null;
    }
  }

  async #sendClarity(answer) {
    if (this.clarity?.sending || !this.result) return;
    const comment = this.root.querySelector('#clarity-comment')?.value ?? '';
    this.clarity = { sending: true };
    this.#render();
    try {
      await api.sendClarity({
        where: 'training',
        understood: answer === 'yes',
        comment,
        explanation: this.result.debrief.output,
        trial_id: this.trial.id,
        level: this.level,
      });
      this.clarity = {
        sent: true,
        message: answer === 'yes' ? 'Great, thanks!' : 'Thanks! The coach will look at this debrief and make it clearer.',
      };
    } catch (err) {
      this.clarity = { error: err.message };
    }
    this.#render();
  }

  // ---- per frame ------------------------------------------------------------

  tick(dt) {
    if (!this.active || this.phase !== 'scanning') return;
    const pb = this.playback;
    const before = pb.t;
    pb.tick(dt);
    const simDt = pb.t - before;
    // The head lives in drill time too, so slow-motion levels slow the glance with everything else.
    this.gaze.update(simDt);
    // Opening the body takes a moment too (about a third of a second of drill time).
    this.open += (this.openTarget - this.open) * Math.min(1, simDt / OPEN_TIME_S);

    const { players, ball } = pb.current();
    const me = players.find((p) => p.id === this.trial.receiver);
    this.#orient(me, ball);
    const gaze = this.bodyYaw + this.gaze.angle;

    // A scan is the face turning away from the ball (Jordet), whichever way the body points.
    const offBall = Math.abs(wrap(gaze - this.ballYaw));
    if (this.armed && offBall >= SCAN_ON) {
      this.scans += 1;
      this.armed = false;
    } else if (!this.armed && offBall <= SCAN_RESET) {
      this.armed = true;
    }

    // You only take in the picture when the gaze is (nearly) still: the stop point, not the sweep.
    // Near the centre you identify a player, further out only the shirt colour, at the edge just a shape.
    if (this.gaze.steady) {
      for (const p of players) {
        if (p.id === me.id) continue;
        const off = Math.abs(wrap(bearing(me, p) - gaze));
        const tier = off <= this.vision.identify_deg ? 'id'
          : off <= this.vision.colour_deg ? 'colour'
            : off <= this.vision.presence_deg ? 'shape' : null;
        if (!tier) continue;
        const prev = this.seen.get(p.id);
        if (!prev || TIER_RANK[tier] >= TIER_RANK[prev.tier]) this.seen.set(p.id, { x: p.x, y: p.y, t: pb.t, tier });
      }
    }
    this.sampleClock += simDt;
    if (this.sampleClock >= SAMPLE_EVERY) {
      this.sampleClock = 0;
      this.samples.push({ x: me.x, y: me.y, yaw: gaze });
    }
    this.#hud();
    if (!pb.playing) this.#arrive();
  }

  /** Face the ball; on the half-turn, open the body up to OPEN_DEG towards the goal you attack. */
  #orient(me, ball) {
    const [mx, my] = toM(me.x, me.y);
    const [bx, by] = toM(ball.x, ball.y);
    if (this.ballYaw === null || Math.hypot(bx - mx, by - my) > 1.5) this.ballYaw = bearing(me, ball);
    const attackYaw = this.scenario.attacking_direction[this.trial.team] === 'right' ? 0 : 180;
    const towardAttack = Math.sign(wrap(attackYaw - this.ballYaw)) || 1;
    this.bodyYaw = this.ballYaw + towardAttack * OPEN_DEG * (this.open ?? 0);
  }

  draw(now) {
    if (!this.active || !this.scenario) return;
    if (this.phase === 'reveal') {
      // The bird's-eye view exists only here, after the answer.
      if (!this.result || !this.view) return;
      if (this.replay?.data) this.#drawReplay(now);
      else this.#drawReveal();
      return;
    }
    if (this.phase === 'who' && !this.trial) return;
    const state = this.playback
      ? this.playback.current()
      : { players: this.scenario.frames[this.trial.start_frame].players, ball: this.scenario.frames[this.trial.start_frame].ball };
    const me = state.players.find((p) => p.id === this.trial.receiver);
    if (!this.playback) {
      this.ballYaw = null;
      this.open = 0;
    }
    this.#orient(me, state.ball);
    this.pov.fit();
    // Tilt the view down a little while you choose, easing so it never jumps.
    const lowered = (this.phase === 'deciding' || this.phase === 'evaluating') && !NARROW.matches;
    const target = lowered ? CHOOSE_HORIZON : HORIZON;
    const share = this.pov.horizonShare;
    this.pov.horizonShare = REDUCED_MOTION.matches || Math.abs(target - share) < 0.002 ? target : share + (target - share) * 0.15;
    this.pov.setCamera([me.x, me.y], this.bodyYaw + this.gaze.angle);
    if (this.phase === 'deciding') this.#decisionClock();
    // Fast gaze shifts blur the picture (judged on screen speed, so slow motion blurs less).
    const screenSpeed = Math.abs(this.gaze.velocity) * (this.playback?.speed ?? 1);
    const blur = clamp((screenSpeed - MOVING_DEG_S) / 350, 0, 1) * 5;
    this.pov.draw({ players: state.players.filter((p) => p.id !== me.id), ball: state.ball, blur });
    if (this.phase === 'brief') this.pov.drawBubble(this.trial.passer, `#${this.trial.passer} is about to pass to you`);
    if (this.phase === 'deciding' || this.phase === 'evaluating') {
      this.pov.drawMarks(this.passable, this.phase === 'deciding' && this.decideMode === 'pass' ? this.hoverId : null);
    }
  }

  // ---- choosing from your own eyes ---------------------------------------------

  #pointer(e) {
    const rect = this.canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  #onPovHover(e) {
    if (this.phase !== 'deciding') return;
    const id = this.pov.hitTest(...this.#pointer(e), this.passIds);
    this.hoverId = id;
    this.canvas.classList.toggle('clickable', id != null && this.decideMode === 'pass');
  }

  #onPovClick(e) {
    if (this.phase !== 'deciding') return;
    const [px, py] = this.#pointer(e);
    const id = this.pov.hitTest(px, py, this.passIds);
    if (this.decideMode === 'pass') {
      if (id != null) this.#choose('pass', id);
      return;
    }
    // Dribble: toward a teammate you saw, or into the grass you clicked.
    const spot = id == null ? this.pov.toPitch(px, py) : null;
    if (id != null || spot) this.#carryTo(id, spot);
  }

  /** Dribble towards a teammate you saw (stop short so the pass is on) or into a spot, up to MAX_CARRY_M. */
  #carryTo(hitId, spot) {
    const me = this.playback.current().players.find((p) => p.id === this.trial.receiver);
    const target = hitId != null ? this.seen.get(hitId) : spot; // a teammate where you last saw him
    const [mx, my] = toM(me.x, me.y);
    const [tx, ty] = toM(target.x, target.y);
    const dist = Math.hypot(tx - mx, ty - my);
    if (dist < 1) return;
    const carry = hitId != null ? Math.min(CARRY_M, Math.max(1, dist - 2)) : Math.min(MAX_CARRY_M, dist);
    const [sx, sy] = toU(mx + ((tx - mx) / dist) * carry, my + ((ty - my) / dist) * carry);
    this.#choose('dribble', hitId, { x: clamp(sx, 1, 99), y: clamp(sy, 1, 99) });
  }

  /** "What you saw": the players in your picture, by direction from your body and how well you saw them. No positions. */
  #sawHtml() {
    const players = new Map(this.playback.current().players.map((p) => [p.id, p]));
    const me = players.get(this.trial.receiver);
    const teams = this.scenario.teams;
    const items = [...this.seen]
      .filter(([id]) => id !== me.id && players.has(id))
      .map(([id, s]) => {
        const d = wrap(bearing(me, s) - this.bodyYaw);
        const dir = Math.abs(d) <= 45 ? 'ahead' : Math.abs(d) > 135 ? 'behind' : d > 0 ? 'right' : 'left';
        return { id, s, p: players.get(id), dir };
      });
    const mates = items
      .filter((i) => i.p.team === this.trial.team && i.s.tier !== 'shape')
      .sort((a, b) => DIRECTION_ORDER[a.dir] - DIRECTION_ORDER[b.dir]);
    const shapes = items.filter((i) => i.s.tier === 'shape').slice(0, 2);
    if (!mates.length && !shapes.length) {
      return '<div class="saw-empty">You didn\'t take in any teammates. You can still dribble or shoot, or scan more next time.</div>';
    }
    const chip = (i) => {
      if (i.s.tier === 'shape') {
        return `<button class="saw" disabled><span class="dot shape">?</span><span class="who">A shape</span><span class="where">${i.dir} · sensed</span></button>`;
      }
      const known = i.s.tier === 'id';
      return `<button class="saw" data-train="pass-to" data-id="${i.id}">
        <span class="dot ${esc(i.p.team)}">${known ? i.id : '?'}</span>
        <span class="who">${known ? `#${i.id}` : `${esc(teams[i.p.team].name)} ?`}</span>
        <span class="where">${i.dir} · ${TIER_WORD[i.s.tier]}</span></button>`;
    };
    return `<div class="saw-list">${[...mates, ...shapes].map(chip).join('')}</div>`;
  }

  // ---- reveal: the bird's-eye view, unlocked after the answer -----------------

  /** "What happens next" after the drill: the same replay as in Analyse, played from the arrival moment. */
  #drawReplay(now) {
    const v = this.view;
    const frame = this.scenario.frames[this.trial.arrival_frame];
    const r = replayFrame(this.replay, frame.players, now);
    v.begin();
    v.drawPitch();
    v.drawSides(this.#sides());
    v.drawPlayers(r.players, { selectedId: this.trial.receiver });
    v.drawBall(r.ball);
    drawReplayMarks(v, r, this.replay.data.tone);
  }

  async #playReplay(who) {
    const best = this.result?.best;
    const choice = who === 'best'
      ? { action: best.action, target_player_id: best.target_player_id }
      : { action: this.choice.action, target_player_id: this.choice.action === 'pass' ? this.choice.target : null };
    this.replay = { who, loading: true };
    this.#render();
    try {
      const data = await api.whatNext({ scenario_id: this.trial.scenario_id, frame_index: this.trial.arrival_frame,
        player_id: this.trial.receiver }, choice);
      if (this.replay?.who === who) this.replay = { who, data, t0: performance.now() };
    } catch (err) {
      this.replay = { who, error: err.message };
    }
    this.#render();
  }

  #replayHtml() {
    const r = this.replay;
    let body = '';
    if (r?.loading) body = '<div class="loading"><span class="spinner"></span>Playing it out…</div>';
    else if (r?.error) body = `<div class="warning">${esc(r.error)}</div>`;
    else if (r?.data) body = `<p class="replay-text tone-${esc(r.data.tone)}">${esc(r.data.text)}</p>`;
    const dribbleNote = this.choice?.action === 'dribble' && r?.who === 'yours'
      ? '<p class="sub">The replay carries the ball into the most open space, not to the exact spot you clicked.</p>' : '';
    const on = (who) => (r?.who === who ? ' dark' : '');
    return `
      <div class="card replay">
        <div class="answer-label">What happens next</div>
        <div class="call-buttons">
          <button class="choice-btn${on('yours')}" data-train="replay-mine">${ICON.play} Your choice</button>
          <button class="choice-btn${on('best')}" data-train="replay-best">${ICON.play} The best option</button>
          ${r?.data ? '<button class="link-btn" data-train="replay-off">Back to the picture</button>' : ''}
        </div>
        ${body}${dribbleNote}
        ${r?.data ? `<p class="sub">${esc(r.data.caption)}</p>` : ''}
      </div>`;
  }

  #drawReveal() {
    const v = this.view;
    const frame = this.scenario.frames[this.trial.arrival_frame];
    const positions = new Map(frame.players.map((p) => [p.id, p]));
    const me = positions.get(this.trial.receiver);
    const { geometry, best, result } = this.result;
    v.begin();
    v.drawPitch();
    v.drawSides(this.#sides());
    v.ctx.save();
    drawScanCones(v, this.samples, this.halfAngle);
    const unchecked = drawUnchecked(v, me, this.samples, this.halfAngle, result.missed, positions);
    drawDecision(v, best, geometry, me, positions);
    const sameAsBest = this.#sameAsBest();
    if (this.choice.action === 'dribble' && this.choice.spot) {
      // Your carry: dashed ink to where you chose to take the ball.
      arrow(v, me, this.choice.spot, { color: COLORS.ink, width: 3, dash: [10, 6] }, true);
    } else if (!sameAsBest) {
      const mine = { action: this.choice.action, target_player_id: this.choice.target };
      drawDecision(v, mine, geometry, me, positions, COLORS.ink);
    }
    drawMissed(v, result.missed, positions);
    v.ctx.restore();
    v.drawPlayers(frame.players, { selectedId: this.trial.receiver });
    v.drawBall(frame.ball);

    // Labels last, so no dot covers them.
    const goal = { x: geometry.attacking === 'right' ? 100 : 0, y: 50 };
    const spotOf = (d) => (d.action === 'pass' ? positions.get(d.target_player_id) : d.action === 'shoot' ? goal : d.spot ?? geometry.free_space);
    const bestAt = spotOf({ ...best, spot: geometry.free_space });
    if (bestAt) {
      const free = best.action === 'pass' && geometry.teammates.find((t) => t.id === best.target_player_id)?.open;
      const what = best.action === 'pass' ? `#${best.target_player_id}${free ? ' FREE' : ''}` : best.action.toUpperCase();
      // Above the receiver, unless the "MISSED" tag is there already (you missed the best option).
      const missedBest = result.missed.some((m) => m.id === best.target_player_id);
      drawPitchTag(v, bestAt, `BEST · ${what}`, 'best', best.action !== 'pass' ? 'below' : missedBest ? 'right' : 'above');
    }
    if (!sameAsBest) {
      const pickAt = spotOf({ action: this.choice.action, target_player_id: this.choice.target, spot: this.choice.spot });
      if (pickAt) drawPitchTag(v, pickAt, 'YOUR PICK', 'pick', 'below');
    }
    for (const m of result.missed) {
      const p = positions.get(m.id);
      if (p) drawPitchTag(v, p, `${m.noticed ? 'ONLY GLIMPSED' : 'MISSED'} · ${this.#keyName(p).toUpperCase()}`, m.noticed ? 'glimpsed' : 'missed');
    }
    drawPitchTag(v, me, 'YOU', 'you');
    const legend = this.page.querySelector('.legend-unchecked');
    if (legend) legend.hidden = !unchecked;
  }

  /** "#7" for a teammate, "Red 2" for an opponent. */
  #keyName(p) {
    return p.team === this.trial.team ? `#${p.id}` : `${this.scenario.teams[p.team].name} ${p.id}`;
  }

  /**
   * The part of the pitch the drill uses, about twice as wide as tall, so the dots are big
   * and the cards under it stay on screen. Null (the whole pitch) when the players fill it.
   */
  #revealWindow() {
    const pts = this.scenario.frames[this.trial.arrival_frame].players.map((p) => toM(p.x, p.y));
    const PAD = 8;
    const ASPECT = NARROW.matches ? 1.35 : 2; // a phone gets a taller picture, so the labels have room
    const FULL = { x: -4, y: -4, w: 113, h: 76 }; // the pitch plus its run-off, as PitchView draws it
    const x0 = Math.min(...pts.map(([x]) => x)) - PAD;
    const x1 = Math.max(...pts.map(([x]) => x)) + PAD;
    const y0 = Math.min(...pts.map(([, y]) => y)) - PAD;
    const y1 = Math.max(...pts.map(([, y]) => y)) + PAD;
    const w = Math.max(60, x1 - x0, (y1 - y0) * ASPECT); // never closer than 60 m across: keep the context
    if (w > FULL.w) return null;
    const h = w / ASPECT;
    return {
      x: clamp((x0 + x1 - w) / 2, FULL.x, FULL.x + FULL.w - w),
      y: clamp((y0 + y1 - h) / 2, FULL.y, FULL.y + FULL.h - h),
      w,
      h,
    };
  }

  #sameAsBest() {
    const best = this.result.best;
    return this.choice.action === best.action && (best.action !== 'pass' || this.choice.target === best.target_player_id);
  }

  #hud() {
    const pb = this.playback;
    const left = (pb.end - pb.t) / pb.speed;
    const total = (pb.end - pb.start) / pb.speed;
    // Write only what changed, and move the bar with a transform: this runs every frame.
    const set = (sel, text) => {
      const node = this.hud.querySelector(sel);
      if (node.textContent !== text) node.textContent = text;
    };
    set('#hud-scans', `Scans ${this.scans}`);
    set('#hud-aim', `/ aim ${this.#targetScans()}`);
    set('#hud-time', `${left.toFixed(1)} s`);
    this.hud.querySelector('#hud-bar-fill').style.transform = `scaleX(${Math.max(0, left / total).toFixed(3)})`;
    // Compass: up is the ball; the needle is where your eyes point.
    const gazeFromBall = wrap(this.bodyYaw + this.gaze.angle - this.ballYaw);
    this.hud.querySelector('#hud-needle').setAttribute('transform', `rotate(${gazeFromBall} 20 20)`);
  }

  /** On Academy and Pro the defender closes you down: show the time you have on the ball. */
  #decisionClock() {
    const limit = this.levels[this.level].decision_s;
    const fill = this.root.querySelector('#decide-clock-fill');
    if (!limit || !fill) return;
    let left = Math.max(0, limit - (performance.now() - this.decideStart) / 1000);
    if (left < 0.05) left = 0; // never "0.0 s before the defender is on you"
    fill.style.width = `${(left / limit) * 100}%`;
    const label = this.root.querySelector('#decide-clock-label');
    label.textContent = left > 0 ? `${left.toFixed(1)} s before the defender is on you` : 'The defender is on you: decide now!';
    label.classList.toggle('late', left === 0);
  }

  /** Goal and attack labels from the learner's point of view. */
  #sides() {
    const mine = this.trial.team;
    const other = mine === 'home' ? 'away' : 'home';
    const dir = this.scenario.attacking_direction[mine];
    const ours = { text: 'YOUR GOAL', color: COLORS[mine] };
    const theirs = { text: 'THEIR GOAL', color: COLORS[other] };
    return {
      left: dir === 'right' ? ours : theirs,
      right: dir === 'right' ? theirs : ours,
      arrow: { text: `${this.scenario.teams[mine].name.toUpperCase()} · YOU ATTACK`, dir, color: COLORS[mine] },
    };
  }

  // ---- rendering ----------------------------------------------------------------

  #render() {
    if (this.progressOpen && !this.active) {
      this.#renderProgress();
      return;
    }
    const reveal = this.phase === 'reveal';
    this.root.classList.toggle('scanning', this.phase === 'scanning');
    this.root.querySelector('.train-stage').hidden = reveal;
    this.page.hidden = !reveal;
    this.canvas.classList.toggle('dribble', this.phase === 'deciding' && this.decideMode === 'dribble');
    if (reveal) {
      this.page.innerHTML = this.#revealHtml();
      const canvas = this.page.querySelector('#reveal-pitch');
      this.view = canvas ? new PitchView(canvas, this.#revealWindow()) : null;
      return;
    }
    this.view = null;
    const [layout, html] = {
      who: ['center', () => this.#whoHtml()],
      brief: ['brief', () => this.#briefHtml()],
      scanning: ['scan', () => ''],
      deciding: ['bottom', () => this.#decidingHtml()],
      evaluating: ['bottom', () => '<div class="float"><div class="loading"><span class="spinner"></span>Checking your picture against the eagle eye…</div></div>'],
    }[this.phase] ?? [];
    if (!html) return;
    this.layer.className = `train-layer ${layout}`;
    this.layer.innerHTML = html();
  }

  #who() {
    const frame = this.scenario.frames[this.trial.arrival_frame];
    const me = frame.players.find((p) => p.id === this.trial.receiver);
    const teamName = this.scenario.teams[this.trial.team].name;
    return { me, teamName };
  }

  #whoHtml() {
    const { list } = profiles.loadProfiles();
    const button = (p, extra = '') => `
      <button class="who-btn" data-train="pick" data-id="${esc(p.id)}">
        <span class="badge-dot" style="background:${safeColour(p.colour)}"></span><span>${esc(p.name)}${extra}</span>
      </button>`;
    return `
      <div class="float who">
        <h2>Who's playing?</h2>
        <div class="sub">EagleEye remembers each player's drills, so it can learn how they scan. Everything stays on this device.</div>
        <div class="who-list">
          ${list.map((p) => button(p)).join('')}
          ${button(profiles.demoProfile(), ' <span class="sub">· sample history, to see the coaching straight away</span>')}
        </div>
        <h3 class="who-new-title">New player</h3>
        <input id="new-name" class="text-input" maxlength="${profiles.MAX_NAME}" placeholder="Nickname (not your real name)" value="${esc(this.newName ?? '')}">
        <div class="colours" role="radiogroup" aria-label="Badge colour">
          ${profiles.COLOURS.map((c) => `<button type="button" role="radio" aria-checked="${c === this.newColour}" class="colour${c === this.newColour ? ' on' : ''}" data-train="colour" data-colour="${c}" style="background:${c}" aria-label="Colour"></button>`).join('')}
        </div>
        <button class="primary-btn" data-train="create">Start as a new player</button>
        <details class="code-import">
          <summary>Have a player code from another device?</summary>
          <textarea id="code-input" class="text-input" rows="3" placeholder="Paste the code that starts with EE1-"></textarea>
          <button class="choice-btn" data-train="import">Use this player code</button>
        </details>
        ${this.whoError ? `<div class="warning">${esc(this.whoError)}</div>` : ''}
      </div>`;
  }

  #briefHtml() {
    const { me, teamName } = this.#who();
    const choices = this.trials.filter((t) => t.kind !== 'drill' || t.level === this.level);
    const options = [
      `<option value="random">Random ${esc(LEVEL_NAMES[this.level])} scan drill</option>`,
      ...choices.map((t) => `<option value="${t.id}" ${t.id === this.trial.id ? 'selected' : ''}>${esc(t.kind === 'drill' ? t.title : `Match: ${t.title}, #${t.passer} → #${t.receiver}`)}</option>`),
    ].join('');
    const l = this.levels[this.level];
    const n = this.#targetScans();
    const players = this.scenario.frames[this.trial.arrival_frame].players;
    const mine = players.filter((p) => p.team === this.trial.team).length;
    const size = this.trial.kind === 'drill'
      ? `<strong>${mine} v ${players.length - mine}</strong> ${esc(LEVEL_NAMES[this.trial.level] ?? '')} small-sided game, with a keeper and a back line`
      : `<strong>${mine} v ${players.length - mine}</strong> a moment from the match`;
    // Setup keeps the view open: a slim player pill on top, one low card along the bottom.
    return `
      <div class="float setup-pill area-tl">${this.#setupPill()}</div>
      <div class="float howto area-tr">
        <span class="kicker">How to play</span>
        <span class="key"><kbd>←</kbd><kbd>A</kbd> / <kbd>→</kbd><kbd>D</kbd> Shoulder check <small>tap ~90°</small></span>
        <span class="key"><kbd>hold</kbd> Turn more <small>~120°</small></span>
        <span class="key"><kbd>↑</kbd><kbd>W</kbd> Open body</span>
        <span class="key"><kbd>let go</kbd> Look back</span>
      </div>
      <div class="float setup-dock">
        <div class="dock-brief">
          <h2>Player's Eye training</h2>
          <ul class="brief-rows">
            <li><span class="ico">${ICON.target}</span><span><strong>You are ${esc(teamName)} #${me.id}</strong>, ${esc(me.role)}. #${this.trial.passer} passes to you.</span></li>
            <li><span class="ico">${ICON.eye}</span><span><strong>Scan first</strong> before the ball arrives, then choose.</span></li>
            <li><span class="ico">${ICON.people}</span><span>${size}</span></li>
          </ul>
          <details class="why-scan"><summary>Why scan?</summary>${researchText()}</details>
        </div>
        <div class="dock-level">
          <div class="seg" role="radiogroup" aria-label="Level">
            ${Object.keys(LEVEL_NAMES).map((k) => `<button role="radio" aria-checked="${k === this.level}" class="${k === this.level ? 'on' : ''}" data-train="level" data-level="${k}" title="${esc(this.levels[k].label)}">${LEVEL_NAMES[k]}</button>`).join('')}
          </div>
          <p class="level-note">${esc(l.label)} · ${Math.round(l.speed * 100)}% speed · aim for ${n} scan${n === 1 ? '' : 's'} · ${l.decision_s ? `${l.decision_s} s to decide` : 'no decision clock'}</p>
          <div class="dock-start">
            <select id="trial-select" aria-label="Drill">${options}</select>
            <button class="primary-btn" data-train="start">${ICON.play} Start drill</button>
          </div>
        </div>
      </div>`;
  }

  /** Who's playing and what EagleEye has learnt so far, in one line. */
  #setupPill() {
    const p = profiles.currentProfile();
    const done = profiles.loadHistory().length;
    const need = this.minEvidence;
    const rec = this.recommendation;
    const who = p
      ? `<span class="initial">${esc(p.name.charAt(0).toUpperCase())}</span><strong>${esc(p.name)}</strong>
         <span class="badge-dot" style="background:${safeColour(p.colour)}"></span>${p.demo ? '<span class="sub">sample</span>' : ''}`
      : '';
    let learn;
    if (done < need) {
      const dots = Array.from({ length: need }, (_, i) => `<span class="${i < done ? 'done' : i === done ? 'now' : ''}"></span>`).join('');
      learn = `<span class="learn" title="After ${need} drills EagleEye finds your weak spot (like a blind shoulder) and picks the next drill to train it.">
        <span class="dots" aria-hidden="true">${dots}</span>Drill ${done + 1} of ${need} · getting to know you</span>`;
    } else {
      learn = rec?.focus
        ? `<span class="learn" title="${esc(rec.focus.detail)}">Your focus: <strong class="focus-label">${esc(rec.focus.label)}</strong></span>`
        : '<span class="learn">No weak spot right now</span>';
      if (rec?.next_trial_id) learn += `<button class="link-btn" data-train="next-for-you">Next drill for you ${ICON.arrow}</button>`;
      if (rec?.level_suggestion) {
        learn += `<button class="link-btn" data-train="level-suggest" data-level="${rec.level_suggestion.to}" title="${esc(rec.level_suggestion.reason)}">Try ${LEVEL_NAMES[rec.level_suggestion.to]}</button>`;
      }
    }
    return `${who}<span class="pill-sep" aria-hidden="true"></span>${learn}<button class="link-btn" data-train="switch">Switch</button>`;
  }

  /**
   * How EagleEye learns the player: a "drill 1 · 2 · 3" tracker until there is enough evidence,
   * then "Your focus": the main weak spot from their own drills, and the drill that trains it.
   */
  #focusInner(withButton) {
    const done = profiles.loadHistory().length;
    const need = this.minEvidence;
    if (done < need) {
      const steps = Array.from({ length: need }, (_, i) => {
        const state = i < done ? 'done' : i === done ? 'now' : '';
        const word = i < done ? 'Done' : i === done ? 'Now' : 'Next';
        return `<div class="track-step ${state}"><span class="step-dot ${state}">${i < done ? '✓' : i + 1}</span><span>Drill ${i + 1}<small>${word}</small></span></div>`;
      }).join('<span class="track-line"></span>');
      return `
        <div class="tracker">
          <div class="track-head"><h3>EagleEye is getting to know you</h3><span class="to-go">${need - done} to go</span></div>
          <div class="track">${steps}</div>
          <p class="sub" style="margin:0">After ${need} drills EagleEye finds your weak spot (like a blind shoulder) and picks the next drill to train it.</p>
        </div>`;
    }
    const rec = this.recommendation;
    if (!rec) return '';
    const others = rec.weak_spots.slice(1).map((s) => `<li>${esc(s.label)}: ${esc(s.detail)}</li>`).join('');
    const suggest = rec.level_suggestion
      ? `<p class="sub">${esc(rec.level_suggestion.reason)}
           <button class="choice-btn" data-train="level-suggest" data-level="${rec.level_suggestion.to}">Switch to ${LEVEL_NAMES[rec.level_suggestion.to]}</button></p>`
      : '';
    const button = withButton && rec.next_trial_id
      ? `<button class="primary-btn" data-train="next-for-you">Next drill for you ${ICON.arrow}</button>`
      : '';
    const head = rec.focus
      ? `<p style="margin:6px 0"><span class="focus-label">${esc(rec.focus.label)}</span><br><span class="sub">${esc(rec.focus.detail)}</span></p>`
      : '<p class="sub">No weak spot right now: your scanning is solid. Keep going.</p>';
    return `
      <div class="focus-card">
        <div class="kicker">Your focus · from your last ${Math.min(done, 30)} drills</div>
        ${head}
        ${others ? `<ul>${others}</ul>` : ''}
        ${suggest}
        ${button}
      </div>`;
  }

  #focusHtml(withButton) {
    const inner = this.#focusInner(withButton);
    return inner ? `<div class="card">${inner}</div>` : '';
  }

  #targetScans() {
    return Math.max(1, Math.round(this.levels[this.level].scan_rate * this.trial.window_s));
  }

  #decidingHtml() {
    const dribbling = this.decideMode === 'dribble';
    const limit = this.levels[this.level].decision_s;
    // No clock on Rookie: the top pill says so, the card stays short.
    const clock = limit
      ? '<div class="decide-clock"><div class="bar"><div id="decide-clock-fill"></div></div><div id="decide-clock-label" class="sub"></div></div>'
      : '';
    const actions = dribbling
      ? `<p><strong>Dribble:</strong> click the grass to carry the ball there (up to ${MAX_CARRY_M} m), or a teammate you saw to carry towards them.</p>
         <div class="decide-actions"><button class="choice-btn" data-train="cancel-dribble">Back to passing</button></div>`
      : `<p>Click a teammate on the pitch to pass, or tap one you saw.</p>
         <div class="decide-actions">
           <button class="choice-btn" data-train="dribble">${ICON.arrow} Dribble…</button>
           <button class="choice-btn" data-train="shoot">${ICON.target} Shoot</button>
         </div>`;
    return `
      <div class="float decide-card">
        <div>
          <h2>The ball is at your feet. What now?</h2>
          ${actions}
          ${clock}
          ${this.#lastPictureHtml()}
        </div>
        <div>
          <div class="saw-head"><span class="answer-label">What you saw</span><span class="sub">no positions, just what you caught</span></div>
          ${this.#sawHtml()}
          <div class="lock-line">${ICON.lock} The view from above opens after you answer.</div>
        </div>
      </div>`;
  }

  /** On the choose card: how full the picture was last drill, as something to beat. */
  #lastPictureHtml() {
    const [last] = pictureShares(profiles.loadHistory(), 1);
    if (last == null) return '';
    const text = last >= 1
      ? 'Last drill you had every key player in your picture. Keep it up.'
      : `Last drill your picture had ${pct(last)} of the key players. Try to beat it.`;
    return `<div class="sub picture-trend">${text}</div>`;
  }

  #revealHtml() {
    if (!this.result) {
      return `<div class="card"><div class="warning">${esc(this.error ?? 'Something went wrong.')}</div>
        <button class="primary-btn" data-train="retry">Try again</button></div>`;
    }
    const { result, best, debrief, key_players: keys } = this.result;
    const [label, tone] = VERDICT[result.verdict];
    const teams = this.scenario.teams;
    const name = (k) => (k.team === this.trial.team ? `#${k.id}` : `${teams[k.team].name} ${k.id}`);
    const chosen = this.choice.action === 'pass'
      ? `Pass → #${this.choice.target}`
      : this.choice.action === 'dribble' && this.choice.target != null
        ? `Dribble → #${this.choice.target}`
        : capitalise(this.choice.action);
    const bestText = best.action === 'pass' ? `Pass → #${best.target_player_id}` : capitalise(best.action);
    const limit = this.levels[this.level].decision_s;
    const missedIds = new Map(result.missed.map((m) => [m.id, m]));
    const seenCount = keys.filter((k) => !missedIds.has(k.id)).length;
    const facts = [
      ['Scans', `${result.scans} / ${result.target_scans}`],
      ['Key players seen', `${seenCount} of ${keys.length} (${pct(result.coverage)})`],
      ['Body', result.opened_body ? 'Opened to the pitch (half-turn)' : 'Facing the ball'],
    ];
    if (limit) {
      facts.push(['Decision time', `${(this.decisionMs / 1000).toFixed(1)} s, ${result.too_slow ? 'too slow' : 'in time'} (limit ${limit} s)`]);
    }
    const chips = keys.map((k) => {
      const m = missedIds.get(k.id);
      if (!m) return `<span class="chip seen">✓ ${esc(name(k))}</span>`;
      return m.noticed
        ? `<span class="chip glimpsed">${esc(name(k))} · only glimpsed, ${esc(m.where)}</span>`
        : `<span class="chip missed">${esc(name(k))} · never checked, ${esc(m.where)}</span>`;
    }).join('');
    const trend = pictureTrend(pictureShares(profiles.loadHistory())); // includes this drill (saved already)
    const rec = this.recommendation;
    const nextForYou = rec?.next_trial_id && this.trials.some((t) => t.id === rec.next_trial_id);
    const sameAsBest = this.#sameAsBest();
    return `
      <div class="reveal-head">
        <div>
          <div class="kicker">${esc(this.trial.title ?? 'Drill')} · The eagle eye</div>
          <h1>Here's what was really there</h1>
          <p>You answered first. Now see the whole pitch from above.</p>
        </div>
        <div class="reveal-actions">
          <button class="choice-btn" data-train="retry">${ICON.retry} Try this one again</button>
          <button class="${nextForYou ? 'choice-btn' : 'primary-btn'}" data-train="next">${ICON.dice} Random drill</button>
          ${nextForYou ? `<button class="primary-btn" data-train="next-for-you">Next drill for you ${ICON.arrow}</button>` : ''}
        </div>
      </div>
      <div class="reveal-grid">
        <div class="reveal-main">
          <div class="card">
            <div class="bird-head"><h2>Bird's-eye view</h2><span class="chip unlocked">${ICON.check} Unlocked after your answer</span></div>
            <div class="bird-wrap"><canvas id="reveal-pitch" aria-label="The drill from above: where you looked, the best option and who you missed"></canvas></div>
            <ul class="bird-legend">
              <li><span class="line decision"></span>Best option</li>
              ${sameAsBest ? '' : '<li><span class="line yours"></span>Your pick</li>'}
              <li><span class="cone"></span>Where you looked</li>
              ${result.missed.length ? '<li><span class="ring"></span>Missed</li>' : ''}
              <li class="legend-unchecked" hidden><span class="hatch"></span>Not checked</li>
            </ul>
          </div>
          <div class="reveal-row">
            ${this.#replayHtml()}
            ${this.#focusHtml(false) || '<div class="card"><div class="answer-label">Your focus</div><p class="sub">Keep training: EagleEye needs a few drills to find your weak spot.</p></div>'}
          </div>
        </div>
        <div class="reveal-side">
          <div class="card score-card">
            <div class="score-line">
              <div class="score-big">${result.score}<span>/100</span></div>
              <span class="chip ${tone}">${label}</span>
            </div>
            <div class="vs">
              <div class="vs-tile"><div class="answer-label"><span class="mark-you"></span>You</div><strong>${esc(chosen)}</strong></div>
              <div class="vs-tile best"><div class="answer-label"><span class="mark-best"></span>Best</div><strong>${esc(bestText)}</strong></div>
            </div>
            <ul class="facts">${facts.map(([k, v]) => `<li><span class="k">${k}</span><span>${esc(v)}</span></li>`).join('')}</ul>
            ${trend ? `<div class="sub picture-trend">Your picture: ${trend}</div>` : ''}
            <div class="answer-label" style="margin-top:14px">What you saw vs. missed</div>
            <div class="saw-chips">${chips || '<span class="sub">No key players in this moment.</span>'}</div>
            ${result.missed.length ? '' : '<p class="missed ok">You identified every key player. That\'s an eagle eye!</p>'}
          </div>
          <div class="card agent-card coach-card">
            <div class="coach-head"><span class="step">C</span><div><h3>Coach</h3>
              <div class="sub">Your debrief · ${debrief.source === 'foundry' ? `${esc(debrief.agent)} on Microsoft Foundry` : 'Offline coach'} · ${(debrief.latency_ms / 1000).toFixed(1)} s</div></div></div>
            ${debrief.status === 'fallback' ? `<div class="warning">Foundry call failed. Showing offline text instead.<br>${esc(debrief.error ?? '')}</div>` : ''}
            <blockquote class="coach-text">${esc(unquote(debrief.output))}</blockquote>
            ${this.#clarityHtml()}
          </div>
        </div>
      </div>`;
  }

  /** "Did you understand?" at the foot of the coach's card. Unclear debriefs go to the coach to review. */
  #clarityHtml() {
    const c = this.clarity;
    if (c?.sent) return `<div class="coach-foot"><span class="thanks">${ICON.check} ${esc(c.message)}</span></div>`;
    const busy = c?.sending ? 'disabled' : '';
    return `
      <div class="coach-foot">
        <span class="label">Did you understand?</span>
        <button class="choice-btn" data-clarity="yes" ${busy}>${ICON.check} Got it</button>
        <button class="choice-btn" data-clarity="no" ${busy} title="Unclear debriefs go to the coach to review. They never change what the agents know.">Not really</button>
        ${c?.error ? `<div class="warning">${esc(c.error)}</div>` : ''}
      </div>`;
  }

  #progressHtml() {
    const h = profiles.loadHistory();
    if (!h.length) return '';
    const p = profiles.currentProfile();
    const last = h.slice(-8);
    const avgScans = (last.reduce((s, r) => s + r.scans, 0) / last.length).toFixed(1);
    const shares = pictureShares(last, last.length);
    const code = p && !p.demo ? `<button class="choice-btn" data-train="copy-code">Copy my player code</button>` : '';
    return `
      <div class="card">
        <h3>Your progress${p?.demo ? ' <span class="sub">(sample history)</span>' : ''}</h3>
        ${sinceHtml(profiles.loadRecord(), h)}
        ${sparkline(last.map((r) => r.score))}
        <ul class="facts">
          <li><span class="k">Last scores</span><span>${last.map((r) => r.score).join(' → ')}</span></li>
          <li><span class="k">Scans per drill</span><span>${last.map((r) => `${r.scans}/${r.target_scans}`).join(' → ')} (avg ${avgScans})</span></li>
          ${shares.length ? `<li><span class="k">Players in your picture</span><span>${esc(pictureTrend(shares) || pct(shares[0]))}</span></li>` : ''}
        </ul>
        ${this.codeShown ? `<textarea class="text-input code-out" rows="3" readonly>${esc(this.codeShown)}</textarea>
          <div class="sub">Paste this code on another device under "Who's playing?". It holds only your nickname and drill results.</div>` : ''}
        <div class="sub progress-actions">${!profiles.storageWorks()
          ? '<strong>This browser isn\'t saving your progress</strong> (blocked storage). Copy your player code to keep it.'
          : p?.demo ? 'Kept only on this device.' : 'Saved in this browser on this device. On another device, use your player code.'}
          ${code}
          <button class="choice-btn" data-train="reset-progress">${p?.demo ? 'Reset the sample' : 'Reset my progress'}</button>
          ${p && !p.demo ? '<button class="link-btn" data-train="delete-player">Delete this player</button>' : ''}
        </div>
      </div>`;
  }

  #onPanelClick(e) {
    if (!this.active && !this.progressOpen) return;
    const clarity = e.target.closest('[data-clarity]');
    if (clarity) {
      this.#sendClarity(clarity.dataset.clarity);
      return;
    }
    const btn = e.target.closest('[data-train]');
    if (!btn) return;
    const action = btn.dataset.train;
    if (action === 'go-train') {
      this.onMode?.('train');
      return;
    }
    if (action === 'go-who' || (action === 'switch' && !this.active)) {
      if (this.askWho()) this.onMode?.('train');
      return;
    }
    if (action === 'next-for-you') {
      const rec = this.recommendation;
      const trial = this.trials.find((t) => t.id === rec?.next_trial_id);
      if (!trial) return;
      if (rec.next_level !== this.level) this.#setLevel(rec.next_level);
      this.#brief(trial);
      return;
    }
    if (action === 'level-suggest') {
      this.#setLevel(btn.dataset.level);
      this.#brief(this.#randomDrill());
      return;
    }
    if (this.#onProfileAction(action, btn)) return;
    if (action === 'replay-mine' || action === 'replay-best') {
      this.#playReplay(action === 'replay-best' ? 'best' : 'yours');
      return;
    }
    if (action === 'replay-off') {
      this.replay = null;
      this.#render();
      return;
    }
    if (action === 'reset-progress') {
      profiles.resetHistory();
      this.codeShown = '';
      this.#recommend().then(() => this.#render());
      return;
    }
    if (action === 'pass-to') {
      if (this.phase !== 'deciding') return;
      const id = Number(btn.dataset.id);
      if (!this.passIds.has(id)) return;
      if (this.decideMode === 'pass') this.#choose('pass', id);
      else this.#carryTo(id, null);
      return;
    }
    if (action === 'level') {
      this.#setLevel(btn.dataset.level);
      // Drills are built for one level; switch to one of the new level's drills.
      if (this.trial.kind === 'drill' && this.trial.level !== this.level) this.#brief(this.#randomDrill());
      else this.#render();
    } else if (action === 'start') {
      this.#start();
    } else if (action === 'shoot') {
      if (this.phase === 'deciding') this.#choose('shoot');
    } else if (action === 'dribble' || action === 'cancel-dribble') {
      if (this.phase !== 'deciding') return;
      this.decideMode = action === 'dribble' ? 'dribble' : 'pass';
      this.hoverId = null;
      this.#render();
    } else if (action === 'next') {
      this.#brief(this.#randomDrill());
    } else if (action === 'retry') {
      this.#brief(this.trial);
    }
  }

  /** Who's playing: pick, create, import, switch, copy the code, delete. Returns true if handled. */
  #onProfileAction(action, btn) {
    const nameInput = () => this.root.querySelector('#new-name');
    if (action === 'pick') {
      profiles.selectProfile(btn.dataset.id);
      this.codeShown = '';
      this.#playAs();
    } else if (action === 'switch') {
      this.#showWho();
    } else if (action === 'colour') {
      this.newName = nameInput()?.value ?? '';
      this.newColour = btn.dataset.colour;
      this.#render();
    } else if (action === 'create') {
      this.newName = nameInput()?.value ?? '';
      if (!profiles.createProfile(this.newName, this.newColour)) {
        this.#showWho('Type a nickname first.');
        return true;
      }
      this.newName = '';
      this.#playAs();
    } else if (action === 'import') {
      try {
        profiles.importPlayerCode(this.root.querySelector('#code-input')?.value);
        this.#playAs();
      } catch (err) {
        this.#showWho(err.message);
      }
    } else if (action === 'copy-code') {
      this.codeShown = profiles.playerCode();
      navigator.clipboard?.writeText(this.codeShown).catch(() => { /* shown on screen to copy by hand */ });
      this.#render();
    } else if (action === 'delete-player') {
      const p = profiles.currentProfile();
      if (p && window.confirm(`Delete ${p.name} and their drills from this device?`)) {
        profiles.deleteProfile(p.id);
        this.recommendation = null;
        this.onProfile?.();
        if (this.active) this.#showWho();
        else this.#render();
      }
    } else {
      return false;
    }
    return true;
  }

  // ---- data -------------------------------------------------------------------

  async #scenario(id) {
    if (!this.scenarios.has(id)) this.scenarios.set(id, await api.getScenario(id));
    return this.scenarios.get(id);
  }

  #trialById(id) {
    return id === 'random' ? this.#randomDrill() : this.trials.find((t) => t.id === id);
  }

  #randomDrill() {
    const drills = this.trials.filter((t) => t.kind === 'drill' && t.level === this.level);
    const pool = drills.length ? drills : this.trials;
    let pick;
    do {
      pick = pool[Math.floor(Math.random() * pool.length)];
    } while (pool.length > 1 && pick.id === this.trial?.id);
    return pick;
  }

  /** What the weak-spot finder needs, and nothing that identifies the player. */
  #saveHistory(result) {
    const h = profiles.loadHistory();
    const item = {
      trial_id: this.trial.id,
      level: this.level,
      score: result.score,
      verdict: result.verdict,
      scans: result.scans,
      target_scans: result.target_scans,
      coverage: result.coverage,
      timed: this.levels[this.level].decision_s != null,
      too_slow: Boolean(result.too_slow),
      opened_body: Boolean(result.opened_body),
      missed: result.missed.slice(0, 12).map((m) => ({ side: m.side, angle: m.angle, open: m.open })),
      at: Date.now(),
    };
    profiles.recordDrill(item); // first, so a record built from older history doesn't count it twice
    h.push(item);
    profiles.saveHistory(h);
  }
}

function researchText() {
  return `
    <p><strong>Why scan?</strong> In studies of Premier League players, those who scanned more before receiving completed more passes (Jordet and colleagues).</p>
    <p><strong>Your eyes:</strong> you can read a shirt number only near where you look (about 30°). Further out you see the shirt colour (to about 60°),
    and at the edge of your vision only that someone is there (to about 100°).</p>
    <p><strong>Your head:</strong> your neck turns about 70° each way and your eyes about 30° more, so facing the ball you can look about 120° round.
    To see further behind you, open your body (half-turn). A 90° look takes about 0.3 s (Anastasopoulos et al., 2015),
    and you only take in the picture where the turn stops (Aksum et al., 2021).</p>
    <p><strong>The levels:</strong> the same human every time; the game changes. Elite midfielders scan about 0.6-0.8 times a second before receiving (Jordet),
    and elite youth scan more often than grassroots players (Aksum et al., 2021).</p>
    <p>This drill practises the habit. It doesn't replace training on the pitch.</p>`;
}

function researchHtml() {
  return `<div class="card research"><div class="answer-label">The science</div>${researchText()}</div>`;
}

/** The share of key players in the player's picture (0-1) for the last n drills that recorded it, oldest first. */
function pictureShares(history, n = 5) {
  return history.filter((h) => Number.isFinite(h.coverage)).slice(-n).map((h) => h.coverage);
}

function pct(share) {
  return `${Math.round(share * 100)}%`;
}

/** "33% → 50% → 83%, better than last drill ↑": is the picture getting fuller? Empty under 2 drills. */
function pictureTrend(shares) {
  if (shares.length < 2) return '';
  const diff = Math.round(shares.at(-1) * 100) - Math.round(shares.at(-2) * 100);
  const word = diff > 0 ? 'better than last drill ↑' : diff < 0 ? 'fewer than last drill' : 'same as last drill';
  return `${shares.map(pct).join(' → ')}, ${word}`;
}

/** "Since you started": the first drills against the latest ones, with the level beside the score
 * (moving up a level lowers scores, so the picture % comes first). */
function sinceHtml(record, history) {
  if (!record) return '';
  const date = record.since ? new Date(record.since).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
  const count = `${record.drills} drill${record.drills === 1 ? '' : 's'}${date ? ` since ${date}` : ''}`;
  const bests = [`score ${record.best_score}`, record.best_coverage != null ? `picture ${pct(record.best_coverage)}` : '',
    `played up to ${LEVEL_NAMES[record.best_level]}`].filter(Boolean).join(' · ');
  const rows = [['Drills', count]];
  const latest = history.slice(-profiles.FIRST_DRILLS);
  if (record.drills >= 2 * profiles.FIRST_DRILLS && record.first.length && latest.length) {
    const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const thenPic = record.first.map((f) => f.coverage).filter(Number.isFinite);
    const nowPic = latest.map((h) => h.coverage).filter(Number.isFinite);
    if (thenPic.length && nowPic.length) rows.push(['Picture', `${pct(avg(thenPic))} → ${pct(avg(nowPic))}`]);
    const [from, to] = [record.first[0].level, latest.at(-1).level];
    const levels = from === to ? LEVEL_NAMES[to] : `${LEVEL_NAMES[from]} → ${LEVEL_NAMES[to]}`;
    rows.push(['Score', `${Math.round(avg(record.first.map((f) => f.score)))} → ${Math.round(avg(latest.map((h) => h.score)))} (${levels})`]);
  } else {
    rows.push(['First vs now', `after ${2 * profiles.FIRST_DRILLS} drills`]);
  }
  rows.push(['Best', bests]);
  return `
    <div class="since">
      <div class="answer-label">Since you started</div>
      <ul class="facts">${rows.map(([k, v]) => `<li><span class="k">${k}</span><span>${esc(v)}</span></li>`).join('')}</ul>
    </div>`;
}

/** A tiny line of recent scores (0-100). */
function sparkline(scores) {
  if (scores.length < 2) return '';
  const w = 220;
  const h = 40;
  const step = w / (scores.length - 1);
  const pts = scores.map((s, i) => `${(i * step).toFixed(1)},${(h - 4 - (s / 100) * (h - 8)).toFixed(1)}`).join(' ');
  return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" role="img" aria-label="Recent scores: ${scores.join(', ')}">
    <polyline points="${pts}" fill="none" stroke="#be123c" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

function safeColour(c) {
  return profiles.COLOURS.includes(c) || c === '#94a3b8' ? c : profiles.COLOURS[0];
}

function capitalise(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The card draws its own quote marks, so drop any the model wrapped round its reply. */
function unquote(s) {
  return String(s).trim().replace(/^["“”']+|["“”']+$/g, '').trim();
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

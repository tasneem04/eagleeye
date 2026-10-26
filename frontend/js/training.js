// Player's Eye training: watch the move from the receiver's eyes, scan by
// turning your head, choose when the ball arrives, then compare with the eagle eye.

import * as api from './api.js';
import { Gaze, MOVING_DEG_S } from './gaze.js';
import { arrow, drawDecision, drawLanes, drawMissed, drawScanCones } from './overlays.js';
import { clarityCard } from './panel.js';
import { COLORS, PitchView } from './pitch.js';
import { Playback } from './playback.js';
import { PovView } from './pov.js';
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

const toM = (x, y) => [x * 1.05, y * 0.68];
const toU = (mx, my) => [mx / 1.05, my / 0.68];
const wrap = (d) => ((d + 540) % 360) - 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const SIDES = { left: -1, right: 1 };

function bearing(from, to) {
  const [ax, ay] = toM(from.x, from.y);
  const [bx, by] = toM(to.x, to.y);
  return (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
}

export class Training {
  constructor({ canvas, view, panel, hud }) {
    this.view = view;
    this.pov = new PovView(canvas);
    this.panel = panel;
    this.hud = hud;
    this.level = 'rookie';
    this.phase = 'idle';
    this.active = false;
    this.gaze = new Gaze();
    this.scenarios = new Map();
    this.trials = null;

    panel.addEventListener('click', (e) => this.#onPanelClick(e));
    panel.addEventListener('change', (e) => {
      if (e.target.id === 'trial-select') this.#brief(this.#trialById(e.target.value));
    });
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

  async enter() {
    this.active = true;
    if (!this.trials) {
      this.panel.innerHTML = '<div class="card"><div class="loading"><span class="spinner"></span>Loading drills…</div></div>';
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
      await this.#recommend();
    }
    if (!profiles.currentProfile()) {
      this.#showWho();
      return;
    }
    await this.#brief(this.trial ?? this.#randomDrill());
  }

  /** "Who's playing?": pick or create a player before training. */
  #showWho(error = '') {
    this.phase = 'who';
    this.whoError = error;
    this.newColour ??= profiles.COLOURS[0];
    this.hud.hidden = true;
    this.#render();
  }

  async #playAs() {
    await this.#recommend();
    await this.#brief(this.trial ?? this.#randomDrill());
  }

  exit() {
    this.active = false;
    this.phase = 'idle';
    this.hud.hidden = true;
    this.gaze.reset();
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
    this.phase = 'scanning';
    this.hud.hidden = false;
    this.#render();
  }

  #arrive() {
    this.phase = 'deciding';
    this.decideMode = 'pass';
    this.openedBody = this.open > 0.8;
    this.gaze.reset();
    this.hud.hidden = true;
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
    const comment = this.panel.querySelector('#clarity-comment')?.value ?? '';
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
    if (this.phase === 'reveal' && this.result) {
      if (this.replay?.data) this.#drawReplay(now);
      else this.#drawReveal();
      return;
    }
    const state = this.playback
      ? this.playback.current()
      : { players: this.scenario.frames[this.trial.start_frame].players, ball: this.scenario.frames[this.trial.start_frame].ball };
    const me = state.players.find((p) => p.id === this.trial.receiver);
    if (!this.playback) {
      this.ballYaw = null;
      this.open = 0;
    }
    this.#orient(me, state.ball);
    this.pov.setCamera([me.x, me.y], this.bodyYaw + this.gaze.angle);
    if (this.phase === 'deciding') this.#decisionClock();
    // Fast gaze shifts blur the picture (judged on screen speed, so slow motion blurs less).
    const screenSpeed = Math.abs(this.gaze.velocity) * (this.playback?.speed ?? 1);
    const blur = clamp((screenSpeed - MOVING_DEG_S) / 350, 0, 1) * 5;
    this.pov.draw({ players: state.players.filter((p) => p.id !== me.id), ball: state.ball, blur });
  }

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
    return `
      <div class="card replay">
        <div class="answer-label">What happens next${r ? ` · ${r.who === 'best' ? 'the best option' : 'your choice'}` : ''}</div>
        ${body}${dribbleNote}
        <div class="call-buttons">
          <button class="choice-btn" data-train="replay-mine">▶ Your choice</button>
          <button class="choice-btn" data-train="replay-best">▶ The best option</button>
          ${r?.data ? '<button class="link-btn" data-train="replay-off">Back to the picture</button>' : ''}
        </div>
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
    drawLanes(v, geometry.teammates, me, positions);
    drawDecision(v, best, geometry, me, positions);
    const sameAsBest = this.choice.action === best.action
      && (best.action !== 'pass' || this.choice.target === best.target_player_id);
    if (this.choice.action === 'dribble' && this.choice.spot) {
      // Your carry: dashed white to where you chose to take the ball.
      arrow(v, me, this.choice.spot, { color: '#ffffff', width: 3, dash: [10, 6] }, true);
    } else if (!sameAsBest) {
      const mine = { action: this.choice.action, target_player_id: this.choice.target };
      drawDecision(v, mine, geometry, me, positions, '#ffffff');
    }
    drawMissed(v, result.missed, positions);
    v.ctx.restore();
    v.drawPlayers(frame.players, { selectedId: this.trial.receiver });
    v.drawBall(frame.ball);
  }

  #hud() {
    const pb = this.playback;
    const left = (pb.end - pb.t) / pb.speed;
    const total = (pb.end - pb.start) / pb.speed;
    this.hud.querySelector('#hud-scans').textContent = `Scans ${this.scans}`;
    this.hud.querySelector('#hud-time').textContent = `${left.toFixed(1)} s`;
    this.hud.querySelector('#hud-bar-fill').style.width = `${(left / total) * 100}%`;
    // Compass: up is the ball; the needle is where your eyes point.
    const gazeFromBall = wrap(this.bodyYaw + this.gaze.angle - this.ballYaw);
    this.hud.querySelector('#hud-needle').setAttribute('transform', `rotate(${gazeFromBall} 40 40)`);
  }

  /** On Academy and Pro the defender closes you down: show the time you have on the ball. */
  #decisionClock() {
    const limit = this.levels[this.level].decision_s;
    const fill = this.panel.querySelector('#decide-clock-fill');
    if (!limit || !fill) return;
    const left = Math.max(0, limit - (performance.now() - this.decideStart) / 1000);
    fill.style.width = `${(left / limit) * 100}%`;
    const label = this.panel.querySelector('#decide-clock-label');
    label.textContent = left > 0 ? `${left.toFixed(1)} s before the defender is on you` : 'The defender is on you: decide now!';
    label.classList.toggle('late', left === 0);
  }

  // ---- memory map -------------------------------------------------------------

  #drawMemory() {
    const canvas = this.panel.querySelector('#memory-map');
    if (!canvas) return;
    const v = (this.memView = new PitchView(canvas));
    const end = this.playback.end;
    const final = this.playback.current();
    const me = final.players.find((p) => p.id === this.trial.receiver);
    const info = new Map(final.players.map((p) => [p.id, p]));
    v.begin();
    v.drawPitch();
    v.ctx.fillStyle = 'rgba(10, 15, 26, 0.55)'; // the fog of what you didn't see
    v.ctx.fillRect(0, 0, v.cssWidth, v.cssHeight);
    v.drawSides(this.#sides());
    // What you know depends on how you saw them: a number, only a shirt colour, or just a shape.
    const seen = [...this.seen.entries()].map(([id, s]) => {
      const p = info.get(id);
      return {
        ...p,
        x: s.x,
        y: s.y,
        tier: s.tier,
        team: s.tier === 'shape' ? 'unknown' : p.team,
        label: s.tier === 'id' ? p.id : '?',
        alpha: Math.max(0.45, 1 - (end - s.t) / 4),
      };
    });
    this.memPlayers = seen;
    this.memMe = me;
    v.drawPlayers([...seen, { ...me }], { selectedId: me.id });
    v.drawBall({ x: me.x + 0.9, y: me.y });
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

  #onMemoryClick(e) {
    if (this.phase !== 'deciding' || !this.memView) return;
    const rect = e.target.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    // You can play to a teammate you identified or whose shirt you saw, never to an unknown shape.
    const hit = this.memView.hitTest(px, py, this.memPlayers.filter((p) => p.team === this.trial.team));
    if (this.decideMode === 'pass') {
      if (hit) this.#choose('pass', hit.id);
      return;
    }
    // Dribble: toward a teammate you saw, or into the spot you clicked.
    const me = this.memMe;
    const [mx, my] = toM(me.x, me.y);
    const [tx, ty] = hit ? toM(hit.x, hit.y) : toM(...this.memView.toUnits(px, py));
    const dist = Math.hypot(tx - mx, ty - my);
    if (dist < 1) return;
    const carry = hit ? Math.min(CARRY_M, Math.max(1, dist - 2)) : Math.min(MAX_CARRY_M, dist);
    const [sx, sy] = toU(mx + ((tx - mx) / dist) * carry, my + ((ty - my) / dist) * carry);
    this.#choose('dribble', hit ? hit.id : null, { x: clamp(sx, 1, 99), y: clamp(sy, 1, 99) });
  }

  // ---- panel ------------------------------------------------------------------

  #render() {
    const html = {
      who: () => this.#whoHtml(),
      brief: () => this.#briefHtml(),
      scanning: () => this.#scanningHtml(),
      deciding: () => this.#decidingHtml(),
      evaluating: () => '<div class="card"><div class="loading"><span class="spinner"></span>Checking your picture against the eagle eye…</div></div>',
      reveal: () => this.#revealHtml(),
    }[this.phase];
    if (!html) return;
    this.panel.innerHTML = html();
    if (this.phase === 'deciding') {
      this.#drawMemory();
      this.panel.querySelector('#memory-map').addEventListener('click', (e) => this.#onMemoryClick(e));
    }
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
      <div class="card who">
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

  #playerBar() {
    const p = profiles.currentProfile();
    if (!p) return '';
    return `
      <div class="card player-bar">
        <span class="badge-dot" style="background:${safeColour(p.colour)}"></span>
        <span><strong>${esc(p.name)}</strong>${p.demo ? ' <span class="sub">· sample history</span>' : ''}</span>
        <button class="link-btn" data-train="switch">Switch player</button>
      </div>`;
  }

  #briefHtml() {
    const { me, teamName } = this.#who();
    const choices = this.trials.filter((t) => t.kind !== 'drill' || t.level === this.level);
    const options = [
      `<option value="random">Random ${esc(LEVEL_NAMES[this.level])} scan drill</option>`,
      ...choices.map((t) => `<option value="${t.id}" ${t.id === this.trial.id ? 'selected' : ''}>${esc(t.kind === 'drill' ? t.title : `Match: ${t.title}, #${t.passer} → #${t.receiver}`)}</option>`),
    ].join('');
    return `
      ${this.#playerBar()}
      ${this.#focusHtml(true)}
      <div class="card">
        <h2>Player's Eye training</h2>
        <div class="sub">See it like a player, then check it with the eagle eye. Train ${this.minEvidence} drills and EagleEye learns how you scan.</div>
        <p class="sub size-note">${esc(this.#sizeNote())}</p>
        <p class="brief">You are <strong>${esc(teamName)} #${me.id}</strong> (${esc(me.role)}). <strong>#${this.trial.passer}</strong> is about to pass to you.
        Scan before the ball arrives, then choose what to do.</p>
        <div class="seg" role="radiogroup" aria-label="Level">
          ${Object.keys(LEVEL_NAMES).map((k) => `<button role="radio" aria-checked="${k === this.level}" class="${k === this.level ? 'on' : ''}" data-train="level" data-level="${k}" title="${esc(this.levels[k].label)}">${LEVEL_NAMES[k]}</button>`).join('')}
        </div>
        <div class="sub level-note">${this.#levelNote()}</div>
        <label class="select-field drill-select"><span>Drill</span><select id="trial-select">${options}</select></label>
        <ul class="keys">
          <li>Tap <kbd>←</kbd>/<kbd>A</kbd> or <kbd>→</kbd>/<kbd>D</kbd> for a quick shoulder check (about 90°)</li>
          <li>Hold to turn as far as a real head can (about 120°)</li>
          <li><kbd>↑</kbd>/<kbd>W</kbd> open your body to the pitch (half-turn)</li>
          <li>Let go to look back at the ball</li>
        </ul>
        <button class="primary-btn" data-train="start">Start drill</button>
      </div>
      <div class="card research">
        <strong>Why scan?</strong> In studies of Premier League players, those who scanned more before receiving completed more passes (Jordet and colleagues).
        <br><strong>Your eyes:</strong> you can read a shirt number only near where you look (about 30°). Further out you see the shirt colour (to about 60°),
        and at the edge of your vision only that someone is there (to about 100°).
        <br><strong>Your head:</strong> your neck turns about 70° each way and your eyes about 30° more, so facing the ball you can look about 120° round.
        To see further behind you, open your body (half-turn). A 90° look takes about 0.3 s (Anastasopoulos et al., 2015),
        and you only take in the picture where the turn stops (Aksum et al., 2021).
        <br><strong>The levels:</strong> the same human every time; the game changes. Elite midfielders scan about 0.6-0.8 times a second before receiving (Jordet),
        and elite youth scan more often than grassroots players (Aksum et al., 2021).
        <br>This drill practises the habit. It doesn't replace training on the pitch.
      </div>
      ${this.#progressHtml()}`;
  }

  /**
   * How EagleEye learns the player: a "drill 1 · 2 · 3" tracker until there is enough evidence,
   * then "Your focus": the main weak spot from their own drills, and the drill that trains it.
   */
  #focusHtml(withButton) {
    const done = profiles.loadHistory().length;
    const need = this.minEvidence;
    if (done < need) {
      const steps = Array.from({ length: need }, (_, i) => `<span class="step-dot${i < done ? ' done' : ''}">${i < done ? '✓' : i + 1}</span>`).join('');
      return `
        <div class="card focus-card tracker">
          <div class="answer-label">EagleEye is getting to know you</div>
          <div class="step-dots">${steps}</div>
          <p class="sub">After ${need} drills EagleEye finds your weak spot (for example a blind shoulder) and picks the next drill to train it.
          ${need - done === 1 ? 'One more to go!' : `${need - done} to go.`}</p>
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
      ? `<button class="primary-btn" data-train="next-for-you">Next drill for you</button>`
      : '';
    const head = rec.focus
      ? `<p><span class="focus-label">Your focus: ${esc(rec.focus.label)}</span><br><span class="sub">${esc(rec.focus.detail)}</span></p>`
      : '<p class="sub">No weak spot right now: your scanning is solid. Keep going.</p>';
    return `
      <div class="card focus-card">
        <div class="answer-label">EagleEye knows how you scan · from your last ${Math.min(done, 30)} drills</div>
        ${head}
        ${others ? `<ul>${others}</ul>` : ''}
        ${suggest}
        ${button}
      </div>`;
  }

  /** Why there are fewer players than a match: small-sided drills, still with a keeper and a back line. */
  #sizeNote() {
    const players = this.scenario.frames[this.trial.arrival_frame].players;
    const mine = players.filter((p) => p.team === this.trial.team).length;
    const theirs = players.length - mine;
    if (this.trial.kind !== 'drill') return `Match moment: ${mine} v ${theirs}.`;
    return `${LEVEL_NAMES[this.trial.level] ?? ''} small-sided game: ${mine} v ${theirs}, with a keeper and a back line. `
      + 'Fewer players than a match, so you can learn to scan.';
  }

  #targetScans() {
    return Math.max(1, Math.round(this.levels[this.level].scan_rate * this.trial.window_s));
  }

  #levelNote() {
    const l = this.levels[this.level];
    const n = this.#targetScans();
    const clock = l.decision_s ? `${l.decision_s} s to decide` : 'no decision clock';
    return `${esc(l.label)}: ${Math.round(l.speed * 100)}% speed · aim for ${n} scan${n === 1 ? '' : 's'} `
      + `(${l.scan_rate.toFixed(2)} per second) · ${clock}`;
  }

  #scanningHtml() {
    return `
      <div class="card">
        <h2>Scan!</h2>
        <p class="brief">Tap <kbd>←</kbd>/<kbd>→</kbd> (or the buttons on the pitch) for a quick shoulder check, and hold to turn as far as your head goes.
        <kbd>↑</kbd> opens your body to the pitch. The picture blurs while your head moves; you see clearly where the turn stops.
        Away from the centre of your view, numbers disappear and players soften; the grey shapes at the edges are what you sense out of the corner of your eye.</p>
      </div>`;
  }

  #decidingHtml() {
    const dribbling = this.decideMode === 'dribble';
    const limit = this.levels[this.level].decision_s;
    return `
      <div class="card">
        <h2>The ball is at your feet. What now?</h2>
        ${limit ? `<div class="decide-clock"><div class="hud-bar"><div id="decide-clock-fill"></div></div><div id="decide-clock-label" class="sub"></div></div>` : ''}
        <div class="sub">Your memory map: only what you saw, where you last saw it.
          A number means you identified the player, a coloured <strong>?</strong> means you only saw the shirt,
          and a grey <strong>?</strong> is a shape you sensed at the edge of your vision.</div>
        <div class="memory-wrap${dribbling ? ' dribble-mode' : ''}"><canvas id="memory-map" aria-label="Memory map of the players you saw"></canvas></div>
        ${dribbling
          ? `<div class="sub"><strong>Dribble:</strong> click a teammate to carry the ball towards them, or click any spot to carry it into that space (up to ${MAX_CARRY_M} m).</div>
             <div class="feedback-row"><button class="choice-btn" data-train="cancel-dribble">Back to passing</button></div>`
          : `<div class="sub">Click a teammate you saw to pass to them, or:</div>
             <div class="feedback-row">
               <button class="choice-btn" data-train="dribble">Dribble…</button>
               <button class="choice-btn" data-train="shoot">Shoot</button>
             </div>`}
      </div>`;
  }

  #revealHtml() {
    if (!this.result) {
      return `<div class="card"><div class="warning">${esc(this.error ?? 'Something went wrong.')}</div>
        <button class="primary-btn" data-train="retry">Try again</button></div>`;
    }
    const { result, best, debrief, key_players: keys } = this.result;
    const [label, tone] = VERDICT[result.verdict];
    const where = Object.fromEntries(keys.map((k) => [k.id, k.where]));
    const chosen = this.choice.action === 'pass'
      ? `Pass to #${this.choice.target}`
      : this.choice.action === 'dribble' && this.choice.target != null
        ? `Dribble towards #${this.choice.target}`
        : capitalise(this.choice.action);
    const bestText = best.action === 'pass'
      ? `Pass to #${best.target_player_id} (${where[best.target_player_id] ?? ''})`
      : capitalise(best.action);
    const limit = this.levels[this.level].decision_s;
    const facts = [
      ['Your choice', chosen],
      ['Best option', bestText],
      ['Scans', `${result.scans} / ${result.target_scans}`],
      ['Key players seen', `${Math.round(result.coverage * 100)}%`],
      ['Body', result.opened_body ? 'Opened to the pitch (half-turn)' : 'Facing the ball'],
    ];
    if (limit) {
      facts.push(['Decision time', `${(this.decisionMs / 1000).toFixed(1)} s, ${result.too_slow ? 'too slow' : 'in time'} (limit ${limit} s)`]);
    }
    const missed = result.missed.length
      ? `<p class="missed">Not identified: ${result.missed.map((m) => `#${m.id} (${esc(m.where)}${m.noticed ? ', only glimpsed' : ''})`).join(', ')}</p>`
      : '<p class="missed ok">You identified every key player. That\'s an eagle eye!</p>';
    return `
      <div class="card score-card">
        <div class="score-line">
          <div class="score-big">${result.score}<span>/100</span></div>
          <span class="chip ${tone}">${label}</span>
        </div>
        <ul class="facts">${facts.map(([k, v]) => `<li><span class="k">${k}</span><span>${esc(v)}</span></li>`).join('')}</ul>
        ${missed}
        <div class="sub">On the pitch: blue wedges show where you looked, gold is the best option, white is your choice.</div>
      </div>
      <div class="card agent-card">
        <div class="agent-head"><span class="step">C</span><div><h3>${esc(debrief.agent)}</h3><div class="sub">Your coach's debrief</div></div></div>
        ${debrief.status === 'fallback' ? `<div class="warning">Foundry call failed. Showing offline text instead.<br>${esc(debrief.error ?? '')}</div>` : ''}
        <div class="agent-output"><p>${esc(debrief.output)}</p></div>
        <div class="agent-meta"><span>${debrief.source === 'foundry' ? 'Microsoft Foundry agent' : 'Offline coach'}</span><span>${(debrief.latency_ms / 1000).toFixed(1)} s</span></div>
      </div>
      ${this.#replayHtml()}
      ${clarityCard(this.clarity)}
      ${this.#focusHtml(true)}
      <div class="card">
        <div class="feedback-row">
          <button class="choice-btn" data-train="next">Random drill</button>
          <button class="choice-btn" data-train="retry">Try this one again</button>
        </div>
      </div>
      ${this.#progressHtml()}`;
  }

  #progressHtml() {
    const h = profiles.loadHistory();
    if (!h.length) return '';
    const p = profiles.currentProfile();
    const last = h.slice(-8);
    const avgScans = (last.reduce((s, r) => s + r.scans, 0) / last.length).toFixed(1);
    const code = p && !p.demo ? `<button class="choice-btn" data-train="copy-code">Copy my player code</button>` : '';
    return `
      <div class="card">
        <h3>Your progress${p?.demo ? ' <span class="sub">(sample history)</span>' : ''}</h3>
        ${sparkline(last.map((r) => r.score))}
        <ul class="facts">
          <li><span class="k">Last scores</span><span>${last.map((r) => r.score).join(' → ')}</span></li>
          <li><span class="k">Scans per drill</span><span>${last.map((r) => `${r.scans}/${r.target_scans}`).join(' → ')} (avg ${avgScans})</span></li>
        </ul>
        ${this.codeShown ? `<textarea class="text-input code-out" rows="3" readonly>${esc(this.codeShown)}</textarea>
          <div class="sub">Paste this code on another device under "Who's playing?". It holds only your nickname and drill results.</div>` : ''}
        <div class="sub progress-actions">Kept only on this device.
          ${code}
          <button class="choice-btn" data-train="reset-progress">${p?.demo ? 'Reset the sample' : 'Reset my progress'}</button>
          ${p && !p.demo ? '<button class="link-btn" data-train="delete-player">Delete this player</button>' : ''}
        </div>
      </div>`;
  }

  #onPanelClick(e) {
    if (!this.active) return;
    const clarity = e.target.closest('[data-clarity]');
    if (clarity) {
      this.#sendClarity(clarity.dataset.clarity);
      return;
    }
    const btn = e.target.closest('[data-train]');
    if (!btn) return;
    const action = btn.dataset.train;
    if (action === 'next-for-you') {
      const rec = this.recommendation;
      const trial = this.trials.find((t) => t.id === rec?.next_trial_id);
      if (!trial) return;
      if (rec.next_level !== this.level) this.level = rec.next_level;
      this.#brief(trial);
      return;
    }
    if (action === 'level-suggest') {
      this.level = btn.dataset.level;
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
    if (action === 'level') {
      this.level = btn.dataset.level;
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
      this.#render();
    } else if (action === 'next') {
      this.#brief(this.#randomDrill());
    } else if (action === 'retry') {
      this.#brief(this.trial);
    }
  }

  /** Who's playing: pick, create, import, switch, copy the code, delete. Returns true if handled. */
  #onProfileAction(action, btn) {
    const nameInput = () => this.panel.querySelector('#new-name');
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
        profiles.importPlayerCode(this.panel.querySelector('#code-input')?.value);
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
        this.#showWho();
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
    h.push({
      trial_id: this.trial.id,
      level: this.level,
      score: result.score,
      verdict: result.verdict,
      scans: result.scans,
      target_scans: result.target_scans,
      timed: this.levels[this.level].decision_s != null,
      too_slow: Boolean(result.too_slow),
      opened_body: Boolean(result.opened_body),
      missed: result.missed.slice(0, 12).map((m) => ({ side: m.side, angle: m.angle, open: m.open })),
      at: Date.now(),
    });
    profiles.saveHistory(h);
  }
}

/** A tiny line of recent scores (0-100). */
function sparkline(scores) {
  if (scores.length < 2) return '';
  const w = 220;
  const h = 40;
  const step = w / (scores.length - 1);
  const pts = scores.map((s, i) => `${(i * step).toFixed(1)},${(h - 4 - (s / 100) * (h - 8)).toFixed(1)}`).join(' ');
  return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" role="img" aria-label="Recent scores: ${scores.join(', ')}">
    <polyline points="${pts}" fill="none" stroke="#f5c542" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

function safeColour(c) {
  return profiles.COLOURS.includes(c) || c === '#94a3b8' ? c : profiles.COLOURS[0];
}

function capitalise(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

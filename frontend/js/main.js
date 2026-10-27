import * as api from './api.js';
import { drawDecision, drawOverlays, isOffBall } from './overlays.js';
import { loadDone, markDone, momentsHtml, momentTitle, nextMoment } from './moments.js';
import { agentInitials, explanationText, renderPanel } from './panel.js';
import { COLORS, PitchView } from './pitch.js';
import { Playback } from './playback.js';
import { PovView } from './pov.js';
import { drawReplayMarks, replayFrame } from './replay.js';
import * as profiles from './profiles.js';
import { ScoutPanel } from './scout.js';
import { Training } from './training.js';

const $ = (id) => document.getElementById(id);
const el = {
  canvas: $('pitch'),
  hint: $('pitch-hint'),
  panel: $('panel'),
  scenarioSelect: $('scenario-select'),
  situationSelect: $('situation-select'),
  scoreboard: $('scoreboard'),
  description: $('scenario-description'),
  title: $('scenario-title'),
  kicker: $('scenario-kicker'),
  moments: $('moments-col'),
  pick: $('pick-card'),
  avatar: $('avatar'),
  badge: $('mode-badge'),
  knowledge: $('knowledge-badge'),
  play: $('btn-play'),
  iconPlay: $('icon-play'),
  iconPause: $('icon-pause'),
  timeline: $('timeline'),
  marks: $('timeline-marks'),
  timeLabel: $('time-label'),
  speed: $('speed-select'),
  heatmap: $('heatmap-toggle'),
  povToggle: $('pov-toggle'),
  povCard: $('pov-card'),
  povCanvas: $('pov-canvas'),
  povTitle: $('pov-title'),
  povYaw: $('pov-yaw'),
  povEmpty: $('pov-empty'),
};

const view = new PitchView(el.canvas);
const playback = new Playback();
const training = new Training({
  canvas: $('train-pov'),
  root: $('train-view'),
  layer: $('train-layer'),
  page: $('train-page'),
  progress: $('progress-view'),
  hud: $('train-hud'),
  onMode: (mode) => setMode(mode),
});
training.onProfile = updateAvatar;
const state = {
  mode: 'analyse',
  config: { mode: 'mock', stages: [] },
  scenario: null,
  situations: [],
  situation: null,
  selection: null,
  requestId: 0,
  momentNow: -1,      // the moment the timeline is at (index into the frames)
  done: new Set(),    // moments where a player was opened
  // Player's view: follows one player through the timeline, even after the
  // selection is cleared by playing or stepping.
  pov: { on: false, playerId: null, team: null, yawOffset: 0 },
};
const pov = new PovView(el.povCanvas);

// Same moment, different game state: the tactical agent should change its mode.
const SITUATION_PRESETS = [
  { minute: 88, score: { home: 1, away: 0 } },
  { minute: 85, score: { home: 0, away: 1 } },
];

// ---- data ---------------------------------------------------------------

async function init() {
  try {
    state.config = await api.getConfig();
    const agents = state.config.stages.length;
    el.badge.textContent = state.config.mode === 'foundry'
      ? `Live · ${agents} Foundry agent${agents === 1 ? '' : 's'}`
      : 'Offline mode';
    el.badge.title = state.config.stages.map((s) => `${s.step}. ${s.agent}: ${s.title}`).join('\n');
    el.badge.className = `badge ${state.config.mode}`;
    showStartHere();
    refreshKnowledge();

    const scenarios = await api.listScenarios();
    // Match scenarios first; the generated Train drills go in their own group.
    const option = (s) => `<option value="${s.id}">${s.title}</option>`;
    const drills = scenarios.filter((s) => s.id.startsWith('scan_drill_'));
    const matches = scenarios.filter((s) => !s.id.startsWith('scan_drill_'));
    el.scenarioSelect.innerHTML = matches.map(option).join('')
      + (drills.length ? `<optgroup label="Train drills">${drills.map(option).join('')}</optgroup>` : '');
    await loadScenario(scenarios[0].id);
    updateAvatar();
    if (location.hash === '#train') setMode('train');
    else if (location.hash === '#progress') setMode('progress');
  } catch (err) {
    el.badge.textContent = 'Server unavailable';
    el.panel.innerHTML = `<div class="card"><div class="warning">${err.message}</div></div>`;
  }
  requestAnimationFrame(loop);
}

async function loadScenario(id) {
  state.scenario = await api.getScenario(id);
  playback.load(state.scenario.frames);
  el.description.textContent = state.scenario.description;
  el.title.textContent = state.scenario.title;
  el.timeline.min = playback.start;
  el.timeline.max = playback.end;
  el.marks.innerHTML = state.scenario.frames
    .map((f, i) => {
      const pct = ((f.time - playback.start) / (playback.end - playback.start)) * 100;
      const key = i === state.scenario.key_frame ? ' key' : '';
      return `<span class="mark${key}" style="left:${pct}%" title="Moment ${i + 1}"></span>`;
    })
    .join('');

  state.situations = [state.scenario.match_situation, ...SITUATION_PRESETS];
  el.situationSelect.innerHTML = state.situations
    .map((s, i) => `<option value="${i}">${situationLabel(s)}${i === 0 ? ' (scenario)' : ''}</option>`)
    .join('');
  state.done = loadDone(id);
  state.momentNow = -1;
  setSituation(0);
  state.pov.playerId = null;
  clearSelection();
}

function situationLabel(s) {
  const { home: blue, away: red } = state.scenario.teams;
  const { home, away } = s.score;
  const state_ = home > away ? `${blue.name} lead` : home < away ? `${blue.name} trail` : 'Level';
  return `${state_} ${home}–${away} · ${s.minute}'`;
}

function setSituation(index) {
  state.situation = state.situations[index];
  const { teams } = state.scenario;
  const { score, minute } = state.situation;
  if (state.momentNow >= 0) renderMoments();
  el.scoreboard.innerHTML = `
    <span class="team-home">${teams.home.name.toUpperCase()}</span>
    <span>${score.home} – ${score.away}</span>
    <span class="team-away">${teams.away.name.toUpperCase()}</span>
    <span class="minute">${minute}'</span>`;
}

async function select(player, frameIndex) {
  const requestId = ++state.requestId;
  const moment = {
    scenario_id: state.scenario.id,
    frame_index: frameIndex,
    player_id: player.id,
    situation: state.situation,
  };
  state.selection = { player, frameIndex, geometry: null, analysis: null, error: null };
  state.done = markDone(state.scenario.id, frameIndex);
  renderMoments();
  if (state.pov.playerId !== player.id) state.pov.yawOffset = 0;
  state.pov.playerId = player.id;
  state.pov.team = player.team;
  render();

  try {
    const geometry = await api.getGeometry(moment);
    if (requestId !== state.requestId) return;
    state.selection.geometry = geometry;
    // Your call first: with the ball, the player decides before seeing the agents' answer.
    if (geometry.selected.has_ball && state.config.stages.length) {
      state.selection.call = { asking: true, revealed: false, choice: null };
    }
    render();

    if (!state.config.stages.length) return;
    const analysis = await api.analyze(moment);
    if (requestId !== state.requestId) return;
    state.selection.analysis = analysis;
  } catch (err) {
    if (requestId !== state.requestId) return;
    state.selection.error = err.message;
  }
  render();
}

// ---- first-visit guide ----------------------------------------------------

const START_HERE_KEY = 'eagleeye.startHere.closed';

function showStartHere() {
  let closed = false;
  try { closed = localStorage.getItem(START_HERE_KEY) === '1'; } catch { /* storage blocked: show it */ }
  $('start-here').hidden = closed;
}

$('start-here-close').addEventListener('click', () => {
  $('start-here').hidden = true;
  try { localStorage.setItem(START_HERE_KEY, '1'); } catch { /* fine: it just shows again next visit */ }
});

// ---- coaching knowledge (changes only through approved KnowledgeScout research) ----

async function refreshKnowledge() {
  try {
    const k = await api.getKnowledge();
    el.knowledge.textContent = `Knowledge v${k.reference_version}`;
    el.knowledge.title = [
      'Coaching knowledge used by the agents (File Search).',
      `It changes only through ${k.changes_only_by}; nothing players do changes it.`,
      `${k.researched_notes} researched note${k.researched_notes === 1 ? '' : 's'}.`,
      k.sync_status ? `Sync: ${k.sync_status}` : '',
    ].filter(Boolean).join('\n');
    return k;
  } catch {
    return null;
  }
}

// ---- "Did you understand?" (a review list for the coach; never changes knowledge) ----

async function sendClarity(answer) {
  const sel = state.selection;
  if (!sel?.analysis || sel.clarity?.sending) return;
  const comment = document.getElementById('clarity-comment')?.value ?? '';
  sel.clarity = { sending: true };
  render();
  try {
    await api.sendClarity({
      where: 'analyse',
      understood: answer === 'yes',
      comment,
      explanation: explanationText(sel.analysis.stages),
      scenario_id: state.scenario.id,
      frame_index: sel.frameIndex,
      player_id: sel.player.id,
      situation: state.situation,
    });
    sel.clarity = {
      sent: true,
      message: answer === 'yes' ? 'Great, thanks!' : 'Thanks! The coach will look at this explanation and make it clearer.',
    };
  } catch (err) {
    sel.clarity = { error: err.message };
  }
  render();
}

el.panel.addEventListener('click', (e) => {
  if (state.mode !== 'analyse') return;
  const button = e.target.closest('[data-clarity]');
  if (button) sendClarity(button.dataset.clarity);
  const call = e.target.closest('[data-call]')?.dataset.call;
  if (call) onCall(call);
});

// ---- "Your call first": choose, then compare with the agents (trial and error, no score) ----

function onCall(action) {
  const sel = state.selection;
  if (!sel?.call) return;
  if (action === 'other') {
    clearSelection();
    return;
  }
  if (action === 'replay-mine' && sel.call.choice) return void playReplay(sel.call.choice, 'yours');
  if (action === 'replay-best') {
    const d = sel.analysis?.stages.find((s) => s.key === 'decision')?.data;
    if (d) playReplay({ action: d.action, target_player_id: d.target_player_id }, 'best');
    return;
  }
  if (action === 'replay-off') {
    sel.replay = null;
    render();
    return;
  }
  sel.replay = null;
  if (action === 'skip') sel.call = { asking: false, revealed: true, choice: null };
  else if (action === 'again') sel.call = { asking: true, revealed: true, choice: null };
  else makeChoice({ action });
  render();
}

function makeChoice(choice) {
  const sel = state.selection;
  sel.call = { asking: false, revealed: true, choice };
  render();
  playReplay(choice, 'yours');
}

// ---- "What happens next": a short replay of a choice, worked out in code (no agent call) ----

async function playReplay(choice, who) {
  const sel = state.selection;
  if (!sel) return;
  const requestId = state.requestId;
  sel.replay = { who, choice, loading: true };
  render();
  try {
    const data = await api.whatNext({ scenario_id: state.scenario.id, frame_index: sel.frameIndex, player_id: sel.player.id }, choice);
    if (requestId !== state.requestId || sel.replay?.choice !== choice) return;
    sel.replay = { who, choice, data, t0: performance.now() };
  } catch (err) {
    if (sel.replay?.choice === choice) sel.replay = { who, choice, error: err.message };
  }
  render();
}


function clearSelection() {
  state.requestId++;
  state.selection = null;
  render();
}

function render() {
  if (state.mode !== 'analyse') return;
  renderPanel(el.panel, state);
  renderPick();
}

// ---- moments: the match as a playlist (no locks) -----------------------------

function syncMoment() {
  const i = playback.nearestKeyframe();
  if (i !== state.momentNow) {
    state.momentNow = i;
    renderMoments();
  }
}

function renderMoments() {
  const sc = state.scenario;
  const i = Math.max(0, state.momentNow);
  el.moments.innerHTML = momentsHtml(sc, i, state.done);
  el.title.textContent = momentTitle(sc, i);
  el.kicker.textContent = `${sc.title} · Moment ${i + 1} of ${sc.frames.length}${state.situation ? ` · ${state.situation.minute}'` : ''}`;
}

function jumpTo(index) {
  changeTime(() => {
    playback.pause();
    playback.seekToFrame(index);
  });
}

el.moments.addEventListener('click', (e) => {
  if (!state.scenario) return;
  const action = e.target.closest('[data-moment]')?.dataset.moment;
  const row = e.target.closest('[data-moment-row]');
  if (action === 'continue') jumpTo(nextMoment(state.scenario, state.momentNow, state.done));
  else if (action === 'replay') changeTime(() => { playback.seek(playback.start); playback.play(); });
  else if (row) jumpTo(Number(row.dataset.momentRow));
});
el.moments.addEventListener('keydown', (e) => {
  const row = e.target.closest('[data-moment-row]');
  if (row && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    jumpTo(Number(row.dataset.momentRow));
  }
});

// ---- "Your pick": options under the pitch for the player on the ball -----------

const AGENT_COLOURS = { field_mapper: '#be123c', tactical_context: '#2563eb', decision: '#c2410c', coach: '#1d1416' };

function agentDots() {
  const stages = state.config.stages;
  if (!stages.length) return '';
  return `<div class="agent-dots">${stages.map((s) => `<span class="agent-dot" style="background:${AGENT_COLOURS[s.key] ?? '#6f6468'}" title="${s.agent}">${agentInitials(s.agent)}</span>`).join('')}
    <span class="sub">Explained by ${stages.length} Foundry agent${stages.length === 1 ? '' : 's'}</span></div>`;
}

function renderPick() {
  const sel = state.selection;
  const g = sel?.geometry;
  let body;
  if (!sel) {
    body = '<p class="sub">Pause and click a Blue player. If they have the ball, you make your pick first, then see the agents&rsquo; answer.</p>';
  } else if (!g) {
    body = '<div class="loading"><span class="spinner"></span>Reading the pitch…</div>';
  } else if (!sel.call) {
    body = `<p class="sub">#${sel.player.id} doesn't have the ball: the answer on the right shows where to be and what to do if it comes.</p>`;
  } else {
    // The three nearest teammates (a neutral order, so the list doesn't give the answer away), then dribble and shoot.
    const mates = g.teammates
      .filter((o) => o.role !== 'goalkeeper')
      .sort((a, b) => a.distance_m - b.distance_m)
      .slice(0, 3)
      .map((o) => ({ key: `pass:${o.id}`, label: `Pass to #${o.id}`, choice: { action: 'pass', target_player_id: o.id } }));
    const options = [...mates,
      { key: 'dribble', label: 'Dribble', choice: { action: 'dribble' } },
      { key: 'shoot', label: 'Shoot', choice: { action: 'shoot' } }];
    const mine = sel.call.choice;
    const isMine = (c) => mine && mine.action === c.action && (c.action !== 'pass' || mine.target_player_id === c.target_player_id);
    body = `<div class="picks">${options.map((o, i) => `
      <button class="pick${isMine(o.choice) ? ' on' : ''}" data-pick="${o.key}">
        <span class="letter">${isMine(o.choice) ? '✓' : String.fromCharCode(65 + i)}</span>${o.label}</button>`).join('')}</div>
      <p class="sub pick-note">Or click any teammate on the pitch.</p>`;
  }
  el.pick.innerHTML = `<div class="answer-label">Your pick</div>${body}${agentDots()}`;
}

el.pick.addEventListener('click', (e) => {
  const key = e.target.closest('[data-pick]')?.dataset.pick;
  if (!key || !state.selection?.call) return;
  const [action, id] = key.split(':');
  makeChoice(action === 'pass' ? { action, target_player_id: Number(id) } : { action });
});

// ---- modes --------------------------------------------------------------

const MODES = ['analyse', 'train', 'progress'];

function setMode(mode) {
  if (state.mode === mode) return;
  const before = state.mode;
  state.mode = mode;
  document.body.classList.toggle('train-mode', mode === 'train');
  document.body.classList.toggle('progress-mode', mode === 'progress');
  $('train-view').hidden = mode !== 'train';
  $('progress-view').hidden = mode !== 'progress';
  for (const m of MODES) {
    $(`tab-${m}`).classList.toggle('on', m === mode);
    $(`tab-${m}`).setAttribute('aria-selected', String(m === mode));
  }
  if (before === 'train') training.exit();
  if (before === 'progress') training.exitProgress();
  if (mode === 'train') {
    playback.pause();
    training.enter();
  } else if (mode === 'progress') {
    playback.pause();
    training.enterProgress();
  } else {
    view.resize(); // the pitch may have been resized while hidden
    render();
  }
  updateAvatar();
  window.scrollTo(0, 0);
}

for (const m of MODES) $(`tab-${m}`).addEventListener('click', () => setMode(m));

/** The round avatar: the current player's initial, or "?" before anyone is picked. */
function updateAvatar() {
  const p = profiles.currentProfile();
  el.avatar.textContent = p ? p.name.charAt(0).toUpperCase() : '?';
  el.avatar.title = p ? `Playing as ${p.name}. Click to switch player.` : "Who's playing?";
  el.avatar.setAttribute('aria-label', el.avatar.title);
}

el.avatar.addEventListener('click', () => {
  if (training.askWho()) setMode('train');
});

// ---- drawing ------------------------------------------------------------

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state.mode === 'train') {
    training.tick(dt);
    training.draw(now);
  } else if (state.mode === 'analyse') {
    playback.tick(dt);
    syncMoment();
    draw(now);
    drawPov();
    syncControls();
  }
  requestAnimationFrame(loop);
}

function draw(now) {
  if (!state.scenario) return;
  const { players, ball } = playback.current();
  view.begin();
  view.drawPitch();
  view.drawSides(analyseSides());
  const sel = state.selection;
  if (sel?.replay?.data) {
    // "What happens next": the replay replaces the frozen moment until "Back to the moment".
    const r = replayFrame(sel.replay, players, now);
    view.drawPlayers(r.players, { selectedId: sel.player.id });
    view.drawBall(r.ball);
    drawReplayMarks(view, r, sel.replay.data.tone);
    return;
  }
  let focusIds = null;
  const hideAnswer = sel?.call && !sel.call.revealed; // no lanes or arrows until the player has chosen
  if (sel?.geometry && !hideAnswer) {
    const decision = sel.analysis?.stages.find((s) => s.key === 'decision')?.data ?? null;
    const positions = new Map(players.map((p) => [p.id, p]));
    drawOverlays(view, sel.geometry, positions, now, {
      decision,
      heatmap: el.heatmap.checked,
    });
    const me = positions.get(sel.geometry.selected.id);
    if (sel.call?.choice && me) drawDecision(view, sel.call.choice, sel.geometry, me, positions, COLORS.ink);
    if (isOffBall(sel.geometry)) {
      // Off the ball: only the runner and the passer matter on screen.
      focusIds = new Set([sel.player.id, sel.geometry.space_value.best_position.pass_from]);
    }
  }
  view.drawPlayers(players, { selectedId: sel?.player.id ?? (state.pov.on ? state.pov.playerId : null), focusIds });
  view.drawBall(ball);
}

/** Which goal belongs to which team, and which way Blue attacks. */
function analyseSides() {
  const { teams, attacking_direction: dir } = state.scenario;
  const homeOnLeft = dir.home === 'right';
  const goal = (team) => ({ text: `${teams[team].name.toUpperCase()} GOAL`, color: COLORS[team] });
  return {
    left: goal(homeOnLeft ? 'home' : 'away'),
    right: goal(homeOnLeft ? 'away' : 'home'),
    arrow: { text: `${teams.home.name.toUpperCase()} ATTACKS`, dir: dir.home, color: COLORS.home },
  };
}

function syncControls() {
  if (!state.scenario) return;
  if (document.activeElement !== el.timeline || playback.playing) el.timeline.value = playback.t;
  el.timeLabel.textContent = `${playback.t.toFixed(1)} s`;
  // SVG elements ignore the `hidden` property, so toggle display directly.
  el.iconPlay.style.display = playback.playing ? 'none' : '';
  el.iconPause.style.display = playback.playing ? '' : 'none';
  el.play.setAttribute('aria-label', playback.playing ? 'Pause' : 'Play');

  let hint = '';
  if (state.selection?.call?.asking) hint = 'Your call: click a teammate to pass, or choose Dribble or Shoot';
  else if (state.selection?.call) hint = 'Click another teammate to try that pass';
  else if (playback.playing) hint = 'Pause, then click a player';
  else if (!state.selection && state.pov.on && state.pov.playerId != null) hint = `Following #${state.pov.playerId}: click a player to see their options`;
  else if (!state.selection) hint = 'Click any player to see what they should see';
  el.hint.textContent = hint;
  el.hint.classList.toggle('hidden', !hint);
}

// ---- player's view ------------------------------------------------------

const POV_TURN_DEG = 15;
const mToUnits = { x: 105 / 100, y: 68 / 100 };

function setPov(on) {
  state.pov.on = on;
  el.povToggle.setAttribute('aria-pressed', String(on));
  el.povCard.hidden = !on;
  if (on) resizePov();
}

function resizePov() {
  const rect = el.povCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  el.povCanvas.width = Math.max(1, Math.round(rect.width * dpr));
  el.povCanvas.height = Math.max(1, Math.round(rect.height * dpr));
}

/** Bearing in degrees (metres, atan2 convention used by PovView). */
function bearing(from, to) {
  return (Math.atan2((to.y - from.y) * mToUnits.y, (to.x - from.x) * mToUnits.x) * 180) / Math.PI;
}

function baseYaw(me, ball) {
  const dist = Math.hypot((ball.x - me.x) * mToUnits.x, (ball.y - me.y) * mToUnits.y);
  if (dist > 1.5) return bearing(me, ball); // face the ball
  // Ball at your feet: face the goal you attack.
  return state.scenario.attacking_direction[me.team] === 'right' ? 0 : 180;
}

/** Open teammates (green) and the decision target (gold) for the current, exact moment. */
function povMarks(me) {
  const highlights = new Map();
  const spots = [];
  const sel = state.selection;
  if (!sel?.geometry || sel.player.id !== me.id || (sel.call && !sel.call.revealed)) return { highlights, spots };
  const g = sel.geometry;
  if (isOffBall(g)) {
    const best = g.space_value.best_position;
    if (best.pass_from != null) highlights.set(best.pass_from, { color: COLORS.open, label: `passer #${best.pass_from}` });
    if (best.run_m >= 2) spots.push({ x: best.x, y: best.y, color: '#f5b301', label: 'move here' });
  } else {
    for (const id of g.open_teammates) highlights.set(id, { color: COLORS.open, label: `#${id} open` });
  }
  const decision = sel.analysis?.stages.find((s) => s.key === 'decision')?.data;
  if (decision?.action === 'pass' && decision.target_player_id != null && !isOffBall(g)) {
    highlights.set(decision.target_player_id, { color: '#f5b301', label: `PASS → #${decision.target_player_id}`, target: true });
  }
  return { highlights, spots };
}

function drawPov() {
  if (!state.pov.on || !state.scenario) return;
  const { players, ball } = playback.current();
  const me = players.find((p) => p.id === state.pov.playerId);
  el.povEmpty.hidden = Boolean(me);
  if (!me) {
    el.povTitle.textContent = "Player's view";
    el.povYaw.textContent = '';
    return;
  }
  const yaw = baseYaw(me, ball) + state.pov.yawOffset;
  pov.setCamera([me.x, me.y], yaw);
  const { highlights, spots } = povMarks(me);
  pov.draw({ players: players.filter((p) => p.id !== me.id), ball, highlights, spots });

  const team = state.scenario.teams[me.team].name;
  el.povTitle.textContent = `${team} #${me.id}: player's view`;
  const off = Math.round(state.pov.yawOffset);
  const facing = Math.hypot(ball.x - me.x, ball.y - me.y) > 1.5 ? 'the ball' : 'their attack';
  el.povYaw.textContent = off === 0 ? `Facing ${facing}` : `${Math.abs(off)}° ${off > 0 ? 'right' : 'left'} of ${facing}`;
}

function turnPov(deg) {
  let v = state.pov.yawOffset + deg;
  v = ((v + 180) % 360 + 360) % 360 - 180; // keep within ±180
  state.pov.yawOffset = v;
}

el.povToggle.addEventListener('click', () => setPov(!state.pov.on));

let drag = null;
el.povCanvas.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, id: e.pointerId };
  el.povCanvas.setPointerCapture(e.pointerId);
  el.povCanvas.focus();
});
el.povCanvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  // Drag the scene: moving the pointer left turns the head right, like grabbing the view.
  const deg = ((drag.x - e.clientX) / el.povCanvas.clientWidth) * 90;
  drag.x = e.clientX;
  turnPov(deg);
});
const endDrag = () => { drag = null; };
el.povCanvas.addEventListener('pointerup', endDrag);
el.povCanvas.addEventListener('pointercancel', endDrag);

// ---- controls -----------------------------------------------------------

function changeTime(action) {
  if (state.selection) clearSelection();
  action();
}

el.play.addEventListener('click', () => changeTime(() => playback.toggle()));
$('btn-restart').addEventListener('click', () => changeTime(() => { playback.pause(); playback.seek(playback.start); }));
$('btn-back').addEventListener('click', () => changeTime(() => playback.step(-1)));
$('btn-forward').addEventListener('click', () => changeTime(() => playback.step(1)));
el.timeline.addEventListener('input', () => changeTime(() => { playback.pause(); playback.seek(Number(el.timeline.value)); }));
el.speed.addEventListener('change', () => { playback.speed = Number(el.speed.value); });
el.scenarioSelect.addEventListener('change', () => loadScenario(el.scenarioSelect.value));
el.situationSelect.addEventListener('change', () => {
  setSituation(Number(el.situationSelect.value));
  // Re-ask the agents about the same click under the new game state.
  const sel = state.selection;
  if (sel) select(sel.player, sel.frameIndex);
});

el.canvas.addEventListener('click', (e) => {
  if (!state.scenario || state.mode !== 'analyse') return;
  const rect = el.canvas.getBoundingClientRect();
  const hit = view.hitTest(e.clientX - rect.left, e.clientY - rect.top, playback.current().players);
  if (!hit) return;
  const sel = state.selection;
  if (sel?.call && hit.team === sel.player.team) {
    // "Your call" for the ball carrier: any teammate is a pass to try (before or after the first answer),
    // yourself is no choice. "Look at another player" ends the call to analyse someone else.
    if (hit.id !== sel.player.id) makeChoice({ action: 'pass', target_player_id: hit.id });
    return;
  }
  playback.pause();
  const frameIndex = playback.nearestKeyframe();
  playback.seekToFrame(frameIndex); // analysis runs on exact keyframes only
  select(hit, frameIndex);
});

document.addEventListener('keyup', (e) => {
  if (state.mode === 'train') training.onKey(e, false);
});

document.addEventListener('keydown', (e) => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  if (state.mode === 'train') {
    if (!e.repeat) training.onKey(e, true);
    return;
  }
  if (document.activeElement === el.povCanvas && ['ArrowLeft', 'ArrowRight', '0', 'Home'].includes(e.key)) {
    // Look around inside the player's view instead of stepping the timeline.
    e.preventDefault();
    if (e.key === 'ArrowLeft') turnPov(-POV_TURN_DEG);
    else if (e.key === 'ArrowRight') turnPov(POV_TURN_DEG);
    else state.pov.yawOffset = 0;
    return;
  }
  if ((e.key === 'v' || e.key === 'V') && !e.ctrlKey && !e.metaKey && !e.altKey) {
    setPov(!state.pov.on);
    return;
  }
  if (e.code === 'Space') {
    e.preventDefault();
    changeTime(() => playback.toggle());
  } else if (e.key === 'ArrowLeft') {
    changeTime(() => playback.step(-1));
  } else if (e.key === 'ArrowRight') {
    changeTime(() => playback.step(1));
  }
});

window.addEventListener('resize', () => {
  if (state.mode === 'analyse') view.resize();
  training.resize();
  if (state.pov.on) resizePov();
});

init();

// ---- KnowledgeScout proposals (background research, outside the analysis path) ----
new ScoutPanel($('scout-toggle'), $('scout-panel'), refreshKnowledge);

// The match as a playlist of moments. In each one YOU are the Blue player on the ball: pick, then
// see the agents' answer. A moment is done once you have made your pick, and that unlocks the next.

const doneKey = (scenarioId) => `eagleeye.moments.v2.${scenarioId}`;

/** The moments of a match: authored in the synthetic match file, else every frame where Blue has the ball. */
export function buildMoments(scenario) {
  const owner = (f) => f.players.find((p) => p.id === f.ball.owner);
  const list = scenario.moments ?? scenario.frames
    .map((f, frame) => ({ frame, title: `#${f.ball.owner} on the ball`, note: '' }))
    .filter((m) => owner(scenario.frames[m.frame])?.team === 'home');
  return list.map((m) => ({ ...m, you: scenario.frames[m.frame].ball.owner, time: scenario.frames[m.frame].time }));
}

/** Moments you have finished (made your pick), kept per match in this browser. */
export function loadDone(scenarioId) {
  try {
    const list = JSON.parse(localStorage.getItem(doneKey(scenarioId)) ?? '[]');
    return new Set(Array.isArray(list) ? list.filter(Number.isInteger) : []);
  } catch {
    return new Set();
  }
}

export function markDone(scenarioId, index) {
  const done = loadDone(scenarioId);
  done.add(index);
  try { localStorage.setItem(doneKey(scenarioId), JSON.stringify([...done])); } catch { /* fine: just not remembered */ }
  return done;
}

/** Moments open so far: every finished one in a row, plus the next two (the one to do now and the one after). */
export function unlockedCount(moments, done) {
  let n = 0;
  while (n < moments.length && done.has(n)) n++;
  return Math.min(moments.length, n + 2);
}

export function isUnlocked(index, moments, done) {
  return index < unlockedCount(moments, done);
}

const clock = (t) => `0:${String(Math.round(t)).padStart(2, '0')}`;
const LOCK = '<svg class="ico-lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const CHECK = '<svg class="ico-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>';
const REPLAY = '<svg viewBox="0 0 24 24" aria-hidden="true" class="stroke"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5"/></svg>';
const BARS = '<svg class="ico-bars" viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="7" width="3" height="8" rx="1"/><rect x="6.5" y="2" width="3" height="13" rx="1"/><rect x="12" y="5" width="3" height="10" rx="1"/></svg>';

/**
 * The left sidebar. now: the current moment's index. search: text typed in the top bar (matches stay bright).
 */
export function sidebarHtml(scenario, moments, now, done, minute, search = '') {
  const n = moments.length;
  const open = unlockedCount(moments, done);
  const doneCount = moments.filter((_, i) => done.has(i)).length;
  const q = search.trim().toLowerCase();
  const rows = moments.map((m, i) => {
    const locked = i >= open;
    const isNow = i === now;
    const isDone = done.has(i) && !isNow;
    const isNext = !isNow && !isDone && !locked;
    const status = isNow ? '<span class="status now">Now</span>'
      : isDone ? `<span class="status done">${CHECK}Done</span>`
        : isNext ? '<span class="status next">Next</span>'
          : `<span class="status locked">${LOCK}Locked</span>`;
    const lead = isNow ? BARS : isDone ? CHECK : String(i + 1);
    const cls = [isNow ? 'on' : '', isDone ? 'done' : '', locked ? 'locked' : '', q && !m.title.toLowerCase().includes(q) ? 'dim' : ''].join(' ');
    const label = locked ? `Locked: finish the moments before it first` : `Go to moment ${i + 1}: ${m.title}`;
    return `
      <tr class="${cls.trim()}" data-moment-row="${i}" tabindex="${locked ? -1 : 0}" aria-disabled="${locked}" title="${esc(label)}">
        <td class="lead">${lead}</td>
        <td class="title">${esc(m.title)}</td>
        <td class="state">${status}</td>
        <td class="time">${clock(m.time)}</td>
      </tr>`;
  }).join('');
  const lockNote = open < n
    ? `<div class="lock-note">${LOCK}<span>Finish <strong>${esc(moments[open - 1].title)}</strong> to unlock ${esc(moments[open].title)}.</span></div>`
    : doneCount === n
      ? `<div class="lock-note all">${CHECK}<span>All ${n} moments done. Replay any of them, or go to Train.</span></div>`
      : '';
  return `
    <div class="sb-head">
      ${ring(n, now, done)}
      <div>
        <div class="sb-kicker">Your match · Blue v Red</div>
        <h2 class="sb-title">Moment ${now + 1} of ${n}</h2>
        <div class="sb-sub">${doneCount} done · ${n - doneCount} to go · about ${Math.max(1, n - doneCount)} min</div>
      </div>
    </div>
    <div class="sb-progress">
      <strong>${doneCount} of ${n} done</strong>
      <div class="bar"><div style="width:${(doneCount / n) * 100}%"></div></div>
      <span class="now-label">Moment ${now + 1} now</span>
    </div>
    <div class="sb-actions">
      <button class="sb-btn primary" data-moment="continue">${PLAY}Continue</button>
      <button class="sb-btn" data-moment="replay">${REPLAY}Replay all</button>
    </div>
    <table class="sb-list">
      <thead><tr><th>#</th><th>Moment</th><th>Status</th><th>Time</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="sb-map">
      <div class="sb-map-title">Where each moment happened</div>
      ${miniPitch(scenario, moments, now, done, open)}
      <p>Numbers match the playlist. You are at number ${now + 1}.</p>
    </div>
    ${lockNote}`;
}

/** One ring segment per moment: done green, the current one crimson. */
function ring(n, now, done) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const gap = n > 1 ? 4 : 0;
  const seg = c / n - gap;
  const arcs = Array.from({ length: n }, (_, i) => {
    const colour = i === now ? 'var(--accent)' : done.has(i) ? 'var(--ok)' : 'var(--border)';
    return `<circle cx="44" cy="44" r="${r}" fill="none" stroke="${colour}" stroke-width="7" stroke-linecap="round"
      stroke-dasharray="${seg.toFixed(2)} ${(c - seg).toFixed(2)}" stroke-dashoffset="${(-(c / n) * i - gap / 2).toFixed(2)}"/>`;
  }).join('');
  return `<svg class="ring" viewBox="0 0 88 88" role="img" aria-label="Moment ${now + 1} of ${n}">
    <g transform="rotate(-90 44 44)">${arcs}</g>
    <text x="44" y="47" text-anchor="middle" class="ring-big"><tspan>${now + 1}</tspan><tspan class="ring-of">/${n}</tspan></text>
    <text x="44" y="60" text-anchor="middle" class="ring-small">moments</text>
  </svg>`;
}

/** The pitch in miniature: where the ball was at each moment, numbered, the path so far solid. */
function miniPitch(scenario, moments, now, done, open) {
  const pts = moments.map((m) => {
    const b = scenario.frames[m.frame].ball;
    return [b.x * 1.05, b.y * 0.68];
  });
  const segs = pts.slice(1).map(([x, y], i) => {
    const [px, py] = pts[i];
    const reached = i + 1 <= now || done.has(i + 1);
    return `<line class="${reached ? 'path' : 'path todo'}" x1="${px.toFixed(1)}" y1="${py.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
  }).join('');
  const dots = pts.map(([x, y], i) => {
    const cls = i === now ? 'now' : done.has(i) ? 'done' : i >= open ? 'locked' : '';
    const halo = i === now ? `<circle class="halo" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5.2"/>` : '';
    return `<g class="spot ${cls}" data-moment-row="${i}">${halo}<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3"/>
      <text x="${x.toFixed(1)}" y="${(y + 1.05).toFixed(1)}" text-anchor="middle">${i + 1}</text></g>`;
  }).join('');
  return `<svg class="mini" viewBox="-3 -3 111 74" role="img" aria-label="Where each moment happened on the pitch">
    <g class="lines" fill="none">
      <rect x="0" y="0" width="105" height="68"/><line x1="52.5" y1="0" x2="52.5" y2="68"/>
      <circle cx="52.5" cy="34" r="9.15"/>
      <rect x="0" y="13.84" width="16.5" height="40.32"/><rect x="88.5" y="13.84" width="16.5" height="40.32"/>
    </g>
    ${segs}${dots}
  </svg>`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

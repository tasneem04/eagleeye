// The match's moments as a playlist: where you are, which ones you have opened, and where on the
// pitch each one happened. No locks: any moment can be opened at any time.

const doneKey = (scenarioId) => `eagleeye.moments.${scenarioId}`;

/** Moments where this browser has already opened a player (kept per match). */
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

export function momentTitle(scenario, index) {
  return scenario.moment_titles?.[index] ?? `Moment ${index + 1}`;
}

/** The next moment to look at: the first one after `now` not opened yet (else simply the next). */
export function nextMoment(scenario, now, done) {
  const n = scenario.frames.length;
  for (let k = 1; k <= n; k++) {
    const i = (now + k) % n;
    if (!done.has(i)) return i;
  }
  return (now + 1) % n;
}

export function momentsHtml(scenario, now, done) {
  const n = scenario.frames.length;
  const doneCount = done.size;
  const status = (i) => {
    if (i === now) return '<span class="status now">Now</span>';
    if (done.has(i)) return '<span class="status done">✓ Done</span>';
    if (i === nextMoment(scenario, now, done)) return '<span class="status next">Next</span>';
    return '';
  };
  const rows = scenario.frames.map((f, i) => `
    <tr class="${i === now ? 'on' : ''}" data-moment-row="${i}" tabindex="0">
      <td class="num">${done.has(i) && i !== now ? '<span class="tick">✓</span>' : i + 1}</td>
      <td class="title">${i === now ? '<span class="bars" aria-hidden="true"></span>' : ''}${esc(momentTitle(scenario, i))}</td>
      <td>${status(i)}</td>
      <td class="time">${f.time.toFixed(1)} s</td>
    </tr>`).join('');
  return `
    <div class="card moments">
      <div class="moments-head">
        ${ring(n, now, done)}
        <div>
          <div class="kicker">Your match · Blue v Red</div>
          <h2>Moment ${now + 1} of ${n}</h2>
          <div class="sub">${doneCount} done · ${n - doneCount} to go</div>
        </div>
      </div>
      <div class="moments-progress">
        <span>${doneCount} of ${n} done</span>
        <div class="bar"><div style="width:${(doneCount / n) * 100}%"></div></div>
        <span class="now-label">Moment ${now + 1} now</span>
      </div>
      <div class="moments-actions">
        <button class="primary-btn" data-moment="continue" title="Go to the next moment you haven't opened">▶ Moment ${nextMoment(scenario, now, done) + 1}</button>
        <button class="choice-btn" data-moment="replay">↻ Replay all</button>
      </div>
      <table class="moments-list">
        <thead><tr><th>#</th><th>Moment</th><th>Status</th><th>Time</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="card mini-map">
      <div class="answer-label">Where each moment happened</div>
      ${miniPitch(scenario, now, done)}
      <p class="sub">Numbers match the list: where the ball was. You are at number ${now + 1}.</p>
    </div>`;
}

/** One ring segment per moment: done green, the current one crimson. */
function ring(n, now, done) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const gap = n > 1 ? 3 : 0;
  const seg = c / n - gap;
  const arcs = Array.from({ length: n }, (_, i) => {
    const colour = i === now ? 'var(--accent)' : done.has(i) ? 'var(--ok)' : 'var(--border)';
    return `<circle cx="32" cy="32" r="${r}" fill="none" stroke="${colour}" stroke-width="6"
      stroke-dasharray="${seg.toFixed(2)} ${(c - seg).toFixed(2)}" stroke-dashoffset="${(-(c / n) * i).toFixed(2)}"/>`;
  }).join('');
  return `<svg class="ring" viewBox="0 0 64 64" role="img" aria-label="Moment ${now + 1} of ${n}">
    <g transform="rotate(-90 32 32)">${arcs}</g>
    <text x="32" y="31" text-anchor="middle" class="ring-big">${now + 1}/${n}</text>
    <text x="32" y="43" text-anchor="middle" class="ring-small">moments</text>
  </svg>`;
}

/** The pitch in miniature with the ball's position at each moment, numbered, and the path between them. */
function miniPitch(scenario, now, done) {
  const pts = scenario.frames.map((f) => [f.ball.x * 1.05, f.ball.y * 0.68]);
  const path = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const dots = pts.map(([x, y], i) => {
    const cls = i === now ? 'now' : done.has(i) ? 'done' : '';
    return `<g class="spot ${cls}" data-moment-row="${i}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i === now ? 3.4 : 2.6}"/>
      <text x="${x.toFixed(1)}" y="${(y + 1).toFixed(1)}" text-anchor="middle">${i + 1}</text></g>`;
  }).join('');
  return `<svg class="mini" viewBox="-2 -2 109 72" role="img" aria-label="Where each moment happened on the pitch">
    <g class="lines" fill="none">
      <rect x="0" y="0" width="105" height="68"/><line x1="52.5" y1="0" x2="52.5" y2="68"/>
      <circle cx="52.5" cy="34" r="9.15"/>
      <rect x="0" y="13.84" width="16.5" height="40.32"/><rect x="88.5" y="13.84" width="16.5" height="40.32"/>
    </g>
    <polyline class="path" points="${path}" fill="none"/>
    ${dots}
  </svg>`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

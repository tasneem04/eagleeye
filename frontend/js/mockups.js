const concepts = {
  academy: {
    name: 'Academy Mode',
    tagline: 'Turn every pause into a small coaching moment.',
    tag: 'LEARNER-FIRST',
    markup: `
      <div class="preview-bar">
        <div class="preview-brand"><span class="brand-mark"><svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="16" cy="16" r="4" fill="currentColor"/></svg></span>EagleEye <span class="tag">TRAINING SESSION</span></div>
        <div class="preview-tools"><span class="hide-mobile">Scenario</span><span class="mini-select">Build-up: find the free triangle⌄</span></div>
      </div>
      <div class="preview-content">
        <div class="context-row"><p>Blue #6 receives under pressure. You have one second to scan. <strong>Where would you play next?</strong></p><span class="moment-chip">MOMENT 7 OF 9</span></div>
        <div class="work-area">
          ${pitch()}
          <aside class="panel">
            <div class="card player-line"><span class="player-disc">6</span><div><h2>You're Blue #6</h2><div class="muted small">Centre midfield · on the ball</div></div></div>
            <div class="card question-card">
              <div class="action-label"><span class="question-number">1</span>YOUR READ</div>
              <h2 style="margin-top:7px">Which option keeps the attack moving?</h2>
              <div class="reveal-options">
                <button type="button" data-reveal="A">#22 · left</button>
                <button type="button" data-reveal="B">#18 · inside</button>
                <button type="button" data-reveal="C">#20 · support</button>
              </div>
              <div class="reveal-feedback" id="reveal-feedback" aria-live="polite"></div>
            </div>
            <div class="card"><h3>Scan before the ball arrives</h3><p class="muted small" style="margin:6px 0 0">Check your shoulder, spot the pressure, then find the teammate who can face forward.</p></div>
            <div class="coach-footer"><span>Ready to reveal the coach’s read?</span><button class="mini-button" type="button" data-reveal="coach">Show insight</button></div>
          </aside>
        </div>
        <div class="playback"><button class="play-button" type="button" aria-label="Play">▶</button><span class="clock">0:07</span><div class="track" aria-label="Match timeline"></div><span class="clock">0:09</span><span class="mini-select">1×</span></div>
      </div>`,
  },
  touchline: {
    name: 'Coach’s Touchline',
    tagline: 'Keep the pitch dominant; lead with one useful action and its reason.',
    tag: 'RECOMMENDED',
    markup: `
      <div class="preview-bar">
        <div class="preview-brand"><span class="brand-mark"><svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="16" cy="16" r="4" fill="currentColor"/></svg></span>EagleEye</div>
        <div class="preview-tools"><span class="hide-mobile">SCENARIO</span><span class="mini-select">Build-up: find the free triangle⌄</span><span class="foundry-pill">FOUNDRY CONNECTED</span></div>
      </div>
      <div class="preview-content">
        <div class="context-row"><p>Blue #6 receives from the centre back while Red’s strikers press. The pass into #10 is cut off — where is the free option?</p><span class="moment-chip">85′ · BLUE TRAIL 0–1</span></div>
        <div class="work-area">
          ${pitch()}
          <aside class="panel">
            <div class="card player-line"><span class="player-disc">6</span><div><h2>Blue #6</h2><div class="muted small">Centre midfield · moment 7</div><div class="tag-row"><span class="tag">ON THE BALL</span><span class="tag good">LOW PRESSURE · 6.9 M</span></div></div></div>
            <div class="card action-card">
              <div class="action-label">BEST NEXT ACTION</div>
              <h2 class="action-title">Find #18 inside</h2>
              <p class="action-desc">The inside pass opens the triangle and draws pressure away from #20.</p>
              <div class="scan-note"><strong>Scan cue</strong>Check your right shoulder before the ball arrives.</div>
            </div>
            <div class="card"><h3>Why this option?</h3><div class="rows">
              <div class="data-row"><span>Open teammates</span><strong>#22, #18, #20</strong></div>
              <div class="data-row"><span>Best triangle</span><strong>#6 · #18 · #20</strong></div>
              <div class="data-row"><span>Space ahead</span><strong>12.6 m</strong></div>
            </div><button class="mini-button" style="margin-top:11px" type="button">See all pitch details ↓</button></div>
            <div class="coach-footer"><span><strong>FIELD MAPPER</strong> · verified by pitch geometry</span><span class="muted">0.8 s</span></div>
          </aside>
        </div>
        <div class="playback"><button class="play-button" type="button" aria-label="Play">▶</button><span class="clock">0:07</span><div class="track" aria-label="Match timeline"></div><span class="clock">0:09</span><span class="mini-select">1×</span></div>
      </div>`,
  },
  workbench: {
    name: 'Tactical Workbench',
    tagline: 'Give coaches and analysts a compact, inspectable view of the evidence.',
    tag: 'ANALYST VIEW',
    markup: `
      <div class="preview-bar">
        <div class="preview-brand"><span class="brand-mark"><svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="16" cy="16" r="4" fill="currentColor"/></svg></span>EagleEye <span class="tag">ANALYSIS</span></div>
        <div class="preview-tools"><span class="mini-select">Build-up: find the free triangle⌄</span><span class="mini-select">Blue trail 0–1 · 85′⌄</span></div>
      </div>
      <div class="preview-content">
        <div class="context-row"><p><strong>Possession phase · build-up</strong> <span class="muted">/ Blue #6 · Frame 7 · 85:14</span></p><span class="foundry-pill">3 ANALYSIS STAGES</span></div>
        <div class="work-area">
          ${pitch()}
          <aside class="panel">
            <div class="card">
              <h3>Decision candidates</h3>
              <div class="candidate"><span class="rank">1</span><span>Pass · <strong>#18</strong><br><small>Progressive · triangle outlet</small></span><strong style="color:var(--green)">0.86</strong></div>
              <div class="candidate"><span class="rank">2</span><span>Pass · <strong>#20</strong><br><small>Safe support · space left</small></span><strong>0.72</strong></div>
              <div class="candidate"><span class="rank">3</span><span>Carry · <strong>forward lane</strong><br><small>Pressure rising · 6.9 m</small></span><strong>0.41</strong></div>
            </div>
            <div class="card wide">
              <h3>Pitch geometry</h3>
              <div class="stat-grid"><div class="stat"><strong>3</strong><small>OPEN OPTIONS</small></div><div class="stat"><strong>12.6m</strong><small>FREE SPACE</small></div><div class="stat"><strong>2</strong><small>LANES BLOCKED</small></div></div>
              <div class="layer-list">
                <label class="layer-pill"><input type="checkbox" checked> Open lanes</label>
                <label class="layer-pill"><input type="checkbox" checked> Pressure</label>
                <label class="layer-pill"><input type="checkbox"> Space map</label>
                <label class="layer-pill"><input type="checkbox"> Third-man route</label>
              </div>
            </div>
            <div class="card wide"><h3>Model output</h3><div class="rows">
              <div class="data-row"><span>Phase</span><strong>Build-up</strong></div>
              <div class="data-row"><span>Recommended</span><strong>Pass → #18</strong></div>
              <div class="data-row"><span>Agent chain</span><strong>Field Mapper → Decision</strong></div>
            </div></div>
          </aside>
        </div>
        <div class="playback"><button class="play-button" type="button" aria-label="Play">▶</button><span class="clock">0:07</span><div class="track" aria-label="Match timeline"></div><span class="clock">0:09</span><span class="mini-select">1×</span><span class="mini-select">FRAME 7 / 9</span></div>
      </div>`,
  },
  broadcast: {
    name: 'Matchday Live',
    tagline: 'Make every decision feel like a moment in the match.',
    tag: 'IMMERSIVE',
    markup: `
      <div class="preview-bar broadcast-bar">
        <div class="preview-brand"><span class="brand-mark"><svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="16" cy="16" r="4" fill="currentColor"/></svg></span>EagleEye <span class="tag">MATCH CENTER</span></div>
        <div class="preview-tools"><span class="foundry-pill"><span class="live-dot"></span>LIVE SCENARIO</span><span class="mini-select">BUILD-UP · MOMENT 7⌄</span></div>
      </div>
      <div class="preview-content broadcast-content">
        <div class="broadcast-score">
          <div class="score-team"><span class="score-crest blue-crest">B</span><span>BLUE FC</span></div>
          <div class="score-value">0 <span>:</span> 1 <small>85:14</small></div>
          <div class="score-team away-name"><span>RED UNITED</span><span class="score-crest red-crest">R</span></div>
        </div>
        <div class="context-row"><p>Blue build from the back. Red’s press closes the central lane. <strong>One pass can break the line.</strong></p><span class="moment-chip">KEY MOMENT</span></div>
        <div class="work-area">${pitch()}
          <aside class="panel">
            <div class="card broadcast-call"><div class="action-label">THE OPENING</div><h2 class="action-title">#18 is free inside</h2><p class="action-desc">A quick combination can release #20 into space.</p><div class="broadcast-meter"><span>PRESSURE</span><div><i></i></div><strong>LOW</strong></div></div>
            <div class="card"><h3>Commentary</h3><p class="commentary">“The direct route is gone, but Blue still have a way through. If #6 spots the inside support, this press can be played around.”</p><div class="tag-row"><span class="tag">PASSING LANE OPEN</span><span class="tag good">TRIANGLE AVAILABLE</span></div></div>
            <div class="coach-footer"><span>COACH’S PICK · <strong>#6 → #18</strong></span><button class="mini-button" type="button" data-reveal="coach">Replay the moment</button></div>
          </aside>
        </div>
        <div class="playback"><button class="play-button" type="button" aria-label="Play">▶</button><span class="clock">0:07</span><div class="track" aria-label="Match timeline"></div><span class="clock">0:09</span><span class="mini-select">1×</span></div>
      </div>`,
  },
  player: {
    name: 'Player’s POV',
    tagline: 'Put the learner in the player’s boots before revealing the answer.',
    tag: 'FIRST-PERSON',
    markup: `
      <div class="preview-bar pov-bar">
        <div class="preview-brand"><span class="brand-mark"><svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="16" cy="16" r="4" fill="currentColor"/></svg></span>EagleEye <span class="tag">YOUR MATCH</span></div>
        <div class="preview-tools"><span class="mini-select">MIDFIELDER · #6⌄</span><span class="foundry-pill">TRAINING</span></div>
      </div>
      <div class="preview-content pov-content">
        <div class="context-row"><p><strong>You’ve just received the ball.</strong> Red are closing in. You’ve already scanned once — what did you notice?</p><span class="moment-chip">YOUR DECISION</span></div>
        <div class="work-area">${pitch()}
          <aside class="panel">
            <div class="pov-step"><span class="step-dot active-dot">1</span><span>LOOK UP</span><i></i><span class="step-dot">2</span><span>CHOOSE</span><i></i><span class="step-dot">3</span><span>LEARN</span></div>
            <div class="card pov-card"><div class="action-label">YOU ARE BLUE #6</div><h2 style="margin-top:8px">What can you see?</h2><p class="muted small">Pick the teammate you’d find before the pressure arrives.</p>
              <div class="reveal-options vertical-options"><button type="button" data-reveal="A">#22 · left-side outlet</button><button type="button" data-reveal="B">#18 · inside, facing forward</button><button type="button" data-reveal="C">#20 · safe support behind</button></div>
              <div class="reveal-feedback" id="reveal-feedback" aria-live="polite"></div>
            </div>
            <div class="card pov-reminder"><span class="reminder-symbol">↗</span><div><h3>Remember to scan</h3><p class="muted small" style="margin:4px 0 0">Look over both shoulders before your first touch.</p></div></div>
            <div class="coach-footer"><span>NO PRESSURE. <strong>Every choice teaches you something.</strong></span><span class="muted">1 / 3</span></div>
          </aside>
        </div>
        <div class="playback"><button class="play-button" type="button" aria-label="Play">▶</button><span class="clock">0:07</span><div class="track" aria-label="Match timeline"></div><span class="clock">0:09</span><span class="mini-select">REPLAY</span></div>
      </div>`,
  },
  review: {
    name: 'Session Review',
    tagline: 'Connect individual choices to learning progress over time.',
    tag: 'PROGRESS-LED',
    markup: `
      <div class="preview-bar review-bar">
        <div class="preview-brand"><span class="brand-mark"><svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="16" cy="16" r="4" fill="currentColor"/></svg></span>EagleEye <span class="tag">SESSION 04</span></div>
        <div class="preview-tools"><span class="hide-mobile">PLAYER</span><span class="mini-select">BLUE #6⌄</span><span class="mini-select">TODAY⌄</span></div>
      </div>
      <div class="preview-content review-content">
        <div class="review-heading"><div><div class="action-label">YOUR TRAINING SESSION</div><h2>Better decisions start with a scan.</h2></div><span class="moment-chip">12 MOMENTS</span></div>
        <div class="stat-grid review-stats"><div class="stat"><strong>8 / 12</strong><small>GOOD READS</small></div><div class="stat"><strong>+2</strong><small>VS LAST SESSION</small></div><div class="stat"><strong>6 / 8</strong><small>SCANNED FIRST</small></div></div>
        <div class="work-area review-work">${pitch()}
          <aside class="panel">
            <div class="card review-insight"><div class="action-label">MOMENT 7 · BUILD-UP</div><h2 class="action-title">You found #18.</h2><p class="action-desc">Nice scan. You chose the forward-facing option before the press arrived.</p><div class="tag-row"><span class="tag good">GOOD DECISION</span><span class="tag">SCANNED FIRST</span></div></div>
            <div class="card"><h3>Decision timeline</h3><div class="candidate"><span class="rank">✓</span><span>1 · Find the free triangle<small>Spotted #18 · 0.8 s</small></span><span class="tag good">GOT IT</span></div><div class="candidate"><span class="rank">2</span><span>2 · Escape the press<small>Try scanning earlier</small></span><span class="tag">REVIEW</span></div><div class="candidate"><span class="rank">✓</span><span>3 · Switch the point of attack<small>Found the wide option</small></span><span class="tag good">GOT IT</span></div></div>
            <div class="coach-footer"><span>NEXT FOCUS · <strong>Scan before your first touch</strong></span><button class="mini-button" type="button" data-reveal="coach">Next moment →</button></div>
          </aside>
        </div>
        <div class="playback"><button class="play-button" type="button" aria-label="Play">▶</button><span class="clock">0:07</span><div class="track" aria-label="Session timeline"></div><span class="clock">0:09</span><span class="mini-select">REVIEW MOMENT</span></div>
      </div>`,
  },
};

function pitch() {
  const blue = [
    [5, 50, 1], [20, 40, 2], [25, 65, 3], [39, 50, 6],
    [44, 63, 8], [53, 35, 10], [57, 23, 11], [61, 51, 9],
    [46, 72, 7], [29, 25, 3],
  ];
  const red = [
    [93, 50, 12], [76, 27, 13], [71, 46, 14], [71, 55, 15],
    [76, 82, 16], [59, 25, 17], [55, 47, 18], [57, 61, 19],
    [58, 70, 20], [39, 49, 21], [43, 43, 22],
  ];
  const dots = (team, list) => list.map(([x,y,n]) =>
    `<g transform="translate(${x} ${y})"><circle r="2.25" fill="${team === 'blue' ? '#3b82f6' : '#ef4444'}" stroke="#fff" stroke-width=".42"/><text y=".65" text-anchor="middle" fill="#fff" font-size="1.8" font-family="DM Sans, sans-serif" font-weight="700">${n}</text></g>`
  ).join('');
  return `<div class="pitch"><span class="pitch-meta">BLUE 0 — 1 RED · 85′</span>
    <svg viewBox="0 0 100 66" role="img" aria-label="Illustrated football pitch showing Blue number 6 and passing options">
      <defs><pattern id="grass" width="14.285" height="66" patternUnits="userSpaceOnUse"><rect width="7.14" height="66" fill="#17623a"/><rect x="7.14" width="7.14" height="66" fill="#15592f"/></pattern><marker id="arrow-green" markerWidth="4" markerHeight="4" refX="3.2" refY="2" orient="auto"><path d="M0 0L4 2L0 4z" fill="#34d399"/></marker><marker id="arrow-gold" markerWidth="4" markerHeight="4" refX="3.2" refY="2" orient="auto"><path d="M0 0L4 2L0 4z" fill="#f5c542"/></marker></defs>
      <rect width="100" height="66" fill="url(#grass)"/>
      <g fill="none" stroke="rgba(240,248,242,.83)" stroke-width=".28">
        <rect x="2.5" y="2.5" width="95" height="61"/><path d="M50 2.5v61"/><circle cx="50" cy="33" r="8.3"/><circle cx="50" cy="33" r=".45" fill="#fff"/>
        <rect x="2.5" y="17" width="15" height="32"/><rect x="2.5" y="24" width="5" height="18"/><rect x="82.5" y="17" width="15" height="32"/><rect x="92.5" y="24" width="5" height="18"/><circle cx="12" cy="33" r=".45" fill="#fff"/><circle cx="88" cy="33" r=".45" fill="#fff"/>
      </g>
      <g fill="none" stroke="#34d399" stroke-width=".62" opacity=".95" marker-end="url(#arrow-green)"><path d="M39 50L55 47"/><path d="M39 50L58 70"/></g>
      <g fill="none" stroke="#f5c542" stroke-width=".52" stroke-dasharray="1.5 1.5" marker-end="url(#arrow-gold)"><path d="M39 50L43 43"/><path d="M39 50L58 61"/></g>
      <ellipse cx="61" cy="63" rx="5.6" ry="4.5" fill="#38bdf8" fill-opacity=".17" stroke="#38bdf8" stroke-width=".45" stroke-dasharray="1.2 1.1"/>
      ${dots('blue', blue)}${dots('red', red)}
      <circle cx="39" cy="50" r="3.15" fill="none" stroke="#f5c542" stroke-width=".56"/><circle cx="57" cy="61" r=".9" fill="#fff" stroke="#0b1220" stroke-width=".4"/>
    </svg><div class="pitch-caption"><span>● Blue · ● Red · ━ Open pass · ┅ Blocked lane</span><span>Click a player to inspect</span></div>
  </div>`;
}

const mockup = document.querySelector('#mockup');
const summary = document.querySelector('#concept-summary');
const tabs = [...document.querySelectorAll('.concept-tab')];

function selectConcept(key) {
  const concept = concepts[key];
  if (!concept) return;
  tabs.forEach((tab) => {
    const selected = tab.dataset.concept === key;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-pressed', String(selected));
  });
  summary.innerHTML = `<p><b>${concept.name}</b> — ${concept.tagline}</p><span class="summary-tag">${concept.tag}</span>`;
  mockup.className = `mockup concept-${key}`;
  mockup.innerHTML = concept.markup;
  mockup.querySelectorAll('[data-reveal]').forEach((button) => {
    button.addEventListener('click', () => {
      const feedback = mockup.querySelector('#reveal-feedback');
      if (!feedback) return;
      const answer = button.dataset.reveal;
      feedback.textContent = answer === 'coach'
        ? 'Coach’s read: #18 is the best option. The inside pass keeps the triangle connected while #20 supports behind.'
        : answer === 'B'
          ? 'Good scan. #18 is the strongest option: they can receive inside the triangle and move the attack forward.'
          : 'Look inside once more. #18 offers the forward-facing option while #20 stays available as support.';
      feedback.classList.add('visible');
    });
  });
}

tabs.forEach((tab) => tab.addEventListener('click', () => selectConcept(tab.dataset.concept)));
selectConcept('academy');

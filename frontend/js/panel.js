// Side panel: the answer first (the move, the coach's words, where to look), then
// "See how the agents decided": what the geometry engine found and each Foundry
// agent's output in chain order, one click away for anyone who wants the details.

let howOpen = false; // keep the details open across re-renders once the player opened them

export function renderPanel(panel, { config, scenario, selection }) {
  if (!selection) {
    panel.innerHTML = `
      <div class="card empty">
        <strong>Train your eagle eye</strong>
        Press play to watch the move. Pause at any moment and click a Blue player:
        EagleEye shows the best move, why, and where to look first.
      </div>`;
    return;
  }

  const player = selection.player;
  const teamName = scenario.teams[player.team].name;
  panel.innerHTML = [
    playerCard(player, teamName, selection),
    answerCard(config, selection),
    selection.analysis ? clarityCard(selection.clarity) : '',
    `<details class="how"${howOpen ? ' open' : ''}>
      <summary>See how the agents decided</summary>
      <div class="how-body">
        ${geometryCard(selection.geometry)}
        ${agentCards(config, selection).join('')}
      </div>
    </details>`,
  ].join('');
  panel.querySelector('details.how')?.addEventListener('toggle', (e) => { howOpen = e.target.open; });
}

/** The short answer a player reads first: the move, the coach's explanation and where to look. */
function answerCard(config, selection) {
  const g = selection.geometry;
  if (selection.error) return `<div class="card answer"><div class="warning">${esc(selection.error)}</div></div>`;
  if (!config.stages.length) return '';
  const analysis = selection.analysis;
  if (!analysis) {
    const agents = config.stages.length;
    return `
      <div class="card answer">
        <div class="loading"><span class="spinner"></span>${agents} Microsoft Foundry agent${agents === 1 ? ' is' : 's are'} reading this moment…</div>
        <div class="sub">The first look at a moment takes about 20 seconds. After that it is instant.</div>
      </div>`;
  }

  const stages = Object.fromEntries(analysis.stages.map((s) => [s.key, s]));
  const d = stages.decision?.data;
  const coach = stages.coach?.output || d?.reason || '';
  const advice = stages.tactical_context?.data?.position_advice || g?.space_value?.best_position?.direction_text;
  let move;
  if (offBall(g)) {
    move = `<div class="answer-move">MOVE<span class="answer-target">${esc(advice || 'hold your position')}</span></div>
       ${d ? `<div class="sub">If the ball comes to you: ${esc(moveText(d))}</div>` : ''}`;
  } else if (g && !g.selected.has_ball) {
    move = `<div class="sub">If the ball comes to you</div><div class="answer-move">${esc(moveText(d))}</div>`;
  } else {
    move = `<div class="answer-move">${esc(moveText(d))}</div>`;
  }
  const live = analysis.stages.every((s) => s.source === 'foundry');
  const timing = analysis.cached ? 'instant (saved answer)' : `${(analysis.total_ms / 1000).toFixed(1)} s`;
  return `
    <div class="card answer">
      <div class="answer-label">Best move</div>
      ${move}
      ${coach ? `<p class="answer-why">${esc(coach)}</p>` : ''}
      ${d?.scan_cue ? `<p class="scan-cue"><span>Look first</span>${esc(d.scan_cue)}</p>` : ''}
      <div class="agent-meta">
        <span>${live ? `${analysis.stages.length} Microsoft Foundry agents` : 'Offline text (agents unavailable)'}</span>
        <span>${timing}</span>
      </div>
    </div>`;
}

function moveText(d) {
  if (!d) return '';
  return d.action === 'pass' && d.target_player_id != null ? `PASS → #${d.target_player_id}` : d.action.toUpperCase();
}

/**
 * "Did you understand?" for any explanation (Analyse or a training debrief).
 * Players are learners, not judges: a flag goes to the coach's review list and
 * never changes what the agents know.
 */
export function clarityCard(state) {
  if (state?.sent) return `<div class="card feedback"><div class="thanks">${esc(state.message)}</div></div>`;
  const busy = state?.sending ? 'disabled' : '';
  return `
    <div class="card feedback">
      <div class="feedback-row">
        <span class="label">Did you understand this explanation?</span>
        <button class="up" data-clarity="yes" ${busy}>Yes</button>
        <button class="down" data-clarity="no" ${busy}>Not really</button>
      </div>
      <input id="clarity-comment" maxlength="300" placeholder="What was unclear? (optional)">
      <div class="sub">Unclear explanations go to the coach to review. They never change what the agents know.</div>
      ${state?.error ? `<div class="warning">${esc(state.error)}</div>` : ''}
    </div>`;
}

/** The words the player actually read: the coach's explanation, else the decision's reason and scan cue. */
export function explanationText(stages) {
  const coach = stages.find((s) => s.key === 'coach');
  if (coach?.output) return coach.output;
  const d = stages.find((s) => s.key === 'decision')?.data;
  return d ? [d.reason, d.scan_cue].filter(Boolean).join(' ') : '';
}

function offBall(g) {
  return Boolean(g && !g.selected.has_ball && g.space_value?.best_position);
}

function ballChip(g) {
  if (!g) return '';
  if (g.selected.has_ball) return '<span class="chip">Has the ball</span>';
  if (offBall(g)) return '<span class="chip open">Off the ball: where should you be?</span>';
  return '<span class="chip">Off the ball (what if it came here?)</span>';
}

function playerCard(player, teamName, selection) {
  const g = selection.geometry;
  const pressure = g?.pressure;
  const nearest = pressure?.nearest_opponents[0];
  return `
    <div class="card">
      <div class="player-head">
        <span class="shirt ${player.team}">${player.id}</span>
        <div>
          <h2>${esc(teamName)} #${player.id}</h2>
          <div class="sub">${esc(capitalise(player.role))} · moment ${selection.frameIndex + 1}</div>
        </div>
      </div>
      <div class="chips">
        ${ballChip(g)}
        ${pressure ? `<span class="chip ${pressure.level}">${capitalise(pressure.level)} pressure${nearest ? ` · #${nearest.id} at ${nearest.distance_m} m` : ''}</span>` : ''}
      </div>
    </div>`;
}

function geometryCard(g) {
  if (!g) return card('Reading the pitch…', '<div class="loading"><span class="spinner"></span>Measuring lanes and space</div>');
  if (offBall(g)) return positionCard(g);
  const open = g.open_teammates.slice(0, 5);
  const byId = Object.fromEntries(g.teammates.map((o) => [o.id, o]));
  const dangerous = [...g.open_teammates].sort((a, b) => byId[b].space_value - byId[a].space_value)[0];
  const blockedForward = g.teammates.filter((o) => !o.lane_open && o.forward_m > 0 && o.role !== 'goalkeeper');
  const tri = g.triangles[0];
  const thirdMan = g.third_man[0];
  const facts = [
    ['Open teammates', open.length ? open.map((id) => `#${id}`).join(', ') : 'none'],
    ['Most dangerous open', dangerous != null ? `#${dangerous} (space value ${byId[dangerous].space_value.toFixed(2)})` : 'none'],
    ['Best triangle', tri ? tri.player_ids.map((id) => `#${id}`).join(' · ') : 'none'],
    ['Third-man route', thirdMan ? thirdMan.player_ids.map((id) => `#${id}`).join(' → ') : 'none'],
    ['Forward lanes blocked', blockedForward.length
      ? blockedForward.map((o) => `#${o.id} (by #${o.blocked_by.join(', #')})`).join(', ')
      : 'none'],
    ['Free space ahead', `${g.free_space.space_m} m from nearest opponent`],
    ['Shot', `${g.shot.distance_m} m, ${g.shot.angle_deg}° of goal, xG ${g.shot.xg.toFixed(2)}${g.shot.lane_clear ? '' : ', lane blocked'}`],
  ];
  return card('What the geometry sees', `
    <div class="sub">Calculated in code: distances, lanes, angles and space value</div>
    <ul class="facts">${facts.map(([k, v]) => `<li><span class="k">${k}</span><span>${esc(v)}</span></li>`).join('')}</ul>`);
}

function positionCard(g) {
  const sv = g.space_value;
  const best = sv.best_position;
  const hold = best.run_m < 2;
  const facts = [
    ['Run', hold ? 'Hold your position' : best.direction_text],
    ['Ball can reach you now', best.available_here ? 'yes' : 'no: get free'],
    ['Pass would come from', best.pass_from != null ? `#${best.pass_from}` : 'the loose ball'],
    ['Space value', `${sv.value_here.toFixed(2)} here → ${best.value.toFixed(2)} there`],
  ];
  return card('Where should you be?', `
    <div class="sub">Simplified pitch control × threat, calculated in code</div>
    <ul class="facts">${facts.map(([k, v]) => `<li><span class="k">${k}</span><span>${esc(v)}</span></li>`).join('')}</ul>`);
}

function agentCards(config, selection) {
  if (!config.stages.length) {
    return [card('No agents connected', '<div class="sub">Set AGENT_FIELD_MAPPER in .env and restart the server.</div>')];
  }
  // Stages sharing a step run in parallel: label them 1A, 1B...
  const perStep = {};
  config.stages.forEach((s) => { perStep[s.step] = (perStep[s.step] ?? 0) + 1; });
  const seen = {};

  const cards = config.stages.map((stage) => {
    const parallel = perStep[stage.step] > 1;
    const letter = parallel ? String.fromCharCode(65 + (seen[stage.step] = (seen[stage.step] ?? -1) + 1)) : '';
    const partners = config.stages.filter((s) => s.step === stage.step && s.key !== stage.key).map((s) => s.agent);
    const result = selection.analysis?.stages.find((s) => s.key === stage.key);
    let body;
    if (selection.error) {
      body = `<div class="warning">${esc(selection.error)}</div>`;
    } else if (!result) {
      body = `<div class="loading"><span class="spinner"></span>Asking ${esc(stage.agent)}…</div>`;
    } else {
      body = `
        ${result.status === 'fallback' ? fallbackWarning(result) : ''}
        <div class="agent-output">${stageBody(result)}</div>
        <div class="agent-meta">
          <span>${result.source === 'foundry' ? 'Microsoft Foundry agent' : 'Offline mock'}</span>
          <span>${(result.latency_ms / 1000).toFixed(1)} s</span>
        </div>`;
    }
    return `
      <div class="card agent-card">
        <div class="agent-head">
          <span class="step${parallel ? ' parallel' : ''}">${stage.step}${letter}</span>
          <div>
            <h3>${esc(stage.agent)}</h3>
            <div class="sub">${esc(stage.title)}${stage.key === 'decision' && offBall(selection.geometry) ? ' · if the ball comes to you' : ''}${parallel ? ` · <span class="parallel-tag">runs in parallel with ${esc(partners.join(', '))}</span>` : ''}</div>
          </div>
        </div>
        ${body}
      </div>`;
  });

  const total = selection.analysis?.total_ms;
  if (total != null) {
    const cached = selection.analysis.cached ? ' (saved answer from an earlier identical click)' : '';
    cards.push(`<div class="chain-time">Whole agent chain: ${(total / 1000).toFixed(1)} s${cached}</div>`);
  }
  if (selection.analysis?.budget_reached) {
    cards.push('<div class="warning">The demo has used its hourly budget of AI calls, so this answer uses the offline text. Try again later for the live agents.</div>');
  }
  return cards;
}

function stageBody(result) {
  if (result.key === 'decision' && result.data) return decisionBody(result.data);
  if (result.key === 'tactical_context' && result.data) return tacticalBody(result.data);
  const note = result.data?.note ? `<div class="warning">${esc(result.data.note)}</div>` : '';
  return note + formatAgentText(result.output);
}

function tacticalBody(t) {
  return `
    ${t.note ? `<div class="warning">${esc(t.note)}</div>` : ''}
    <div class="chips">
      <span class="chip">${esc(capitalise(t.phase))}</span>
      <span class="chip risk-${esc(t.risk)}">${esc(capitalise(t.risk))} risk</span>
      <span class="chip mode-${esc(t.mode)}">${t.mode === 'keep' ? 'Keep the ball' : 'Progress'}</span>
    </div>
    <p class="zone">${esc(capitalise(t.zone))}</p>
    ${t.principles.length ? `<ul class="principles">${t.principles.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
    ${t.position_advice ? `<p class="advice"><span>Your position</span>${esc(t.position_advice)}</p>` : ''}`;
}

function decisionBody(d) {
  const target = d.action === 'pass' && d.target_player_id != null ? ` → #${d.target_player_id}` : '';
  return `
    ${d.note ? `<div class="warning">${esc(d.note)}</div>` : ''}
    <div class="decision-line">
      <span class="decision-action">${esc(d.action.toUpperCase())}${target}</span>
      ${d.mode ? `<span class="chip mode-${d.mode}">${d.mode === 'keep' ? 'Keep the ball' : 'Progress'}</span>` : ''}
    </div>
    ${d.reason ? `<p>${esc(d.reason)}</p>` : ''}
    ${d.scan_cue ? `<p class="scan-cue"><span>Scan cue</span>${esc(d.scan_cue)}</p>` : ''}`;
}

function fallbackWarning(result) {
  return `
    <div class="warning">
      <strong>Foundry call failed. Showing offline text instead.</strong><br>${inline(result.error)}
      ${result.error_detail ? `<details><summary>Technical details</summary><pre>${esc(result.error_detail)}</pre></details>` : ''}
    </div>`;
}

function card(title, inner) {
  return `<div class="card"><h3>${esc(title)}</h3>${inner}</div>`;
}

/** Bullet lines become a list; other lines become paragraphs. Supports **bold**. */
function formatAgentText(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const html = [];
  let list = [];
  const flush = () => {
    if (list.length) html.push(`<ul>${list.map((l) => `<li>${l}</li>`).join('')}</ul>`);
    list = [];
  };
  for (const line of lines) {
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      list.push(inline(bullet[1]));
    } else {
      flush();
      html.push(`<p>${inline(line)}</p>`);
    }
  }
  flush();
  return html.join('');
}

function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function capitalise(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

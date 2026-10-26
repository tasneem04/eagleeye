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
  const call = selection.call;
  if (call && !call.revealed) {
    // "Your call first": nothing that gives the answer away until the player has chosen.
    panel.innerHTML = playerCard(player, teamName, selection) + askCard(call);
    return;
  }
  panel.innerHTML = [
    playerCard(player, teamName, selection),
    call?.asking ? askCard(call) : '',
    call?.choice ? verdictCard(call.choice, selection) : '',
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

/** "What would you do?": the player decides before seeing the agents' answer. */
function askCard(call) {
  const again = call.revealed;
  return `
    <div class="card call">
      <div class="answer-label">${again ? 'Try another option' : 'Your call'}</div>
      <h3 class="call-question">${again ? 'What else could you do?' : 'You have the ball. What would you do?'}</h3>
      <p class="sub">Click a teammate on the pitch to pass to them, or:</p>
      <div class="call-buttons">
        <button class="choice-btn" data-call="dribble">Dribble</button>
        <button class="choice-btn" data-call="shoot">Shoot</button>
        ${again ? '' : '<button class="link-btn" data-call="skip">Skip: just show me</button>'}
        <button class="link-btn" data-call="other">Look at another player</button>
      </div>
      ${again ? '' : '<p class="sub call-note">The agents are working out their answer while you think.</p>'}
    </div>`;
}

/** Your choice next to the agents' answer: a side-by-side table from the measured geometry, and why. */
function verdictCard(choice, selection) {
  const stages = selection.analysis?.stages ?? [];
  const d = stages.find((s) => s.key === 'decision')?.data;
  const mode = stages.find((s) => s.key === 'tactical_context')?.data?.mode;
  const g = selection.geometry;
  const v = callVerdict(choice, g, d, mode);
  const mine = optionFacts(choice, g);
  const theirs = d ? optionFacts(d, g) : null;
  const rows = mine.map(([label, value], i) => `
    <tr><th>${esc(label)}</th><td>${esc(value)}</td><td>${theirs ? esc(theirs[i][1]) : '…'}</td></tr>`).join('');
  return `
    <div class="card verdict-card tone-${v.tone}">
      <table class="compare">
        <thead><tr><th></th><th><span class="answer-label">You</span><strong class="you">${esc(moveText(choice))}</strong></th>
          <th><span class="answer-label">Best</span><strong class="agents">${d ? esc(moveText(d)) : '…'}</strong></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="verdict-text"><strong>Why:</strong> ${esc(v.text)}</p>
      <div class="call-buttons">
        <button class="choice-btn" data-call="again">Try another option</button>
        <button class="link-btn" data-call="other">Look at another player</button>
      </div>
      <p class="sub">Tip: click any other teammate on the pitch to try that pass.</p>
    </div>`;
}

/** The same four facts for any option, so the player can compare theirs with the best one. */
function optionFacts(choice, g) {
  const rows = (path, room, direction, distance) => [['Path', path], ['Room', room], ['Direction', direction], ['Distance', distance]];
  if (!g) return rows('…', '…', '…', '…');
  if (choice.action === 'pass') {
    const t = g.teammates.find((o) => o.id === choice.target_player_id);
    if (!t) return rows('—', '—', '—', '—');
    const space = Math.round(t.receiver_space_m);
    return rows(
      t.lane_open ? 'lane open' : `blocked by #${t.blocked_by.join(', #')}`,
      `${space} m to the nearest defender${t.receiver_space_m < 4 ? ' (marked)' : ''}`,
      t.forward_m >= 0 ? `${Math.round(t.forward_m)} m forward` : `${Math.round(-t.forward_m)} m back`,
      `${Math.round(t.distance_m)} m pass`,
    );
  }
  if (choice.action === 'dribble') {
    const near = g.pressure?.nearest_opponents?.[0];
    return rows(
      near ? `#${near.id} is ${Math.round(near.distance_m)} m away` : 'no defender close',
      `${Math.round(g.free_space?.space_m ?? 0)} m of free space ahead`,
      'carry it forward',
      'short carry',
    );
  }
  const s = g.shot;
  return rows(
    s?.lane_clear ? 'path to goal clear' : 'path to goal blocked',
    s ? `${chanceText(s.xg)} chance to score` : '—',
    'at goal',
    s ? `${Math.round(s.distance_m)} m shot` : '—',
  );
}

/**
 * Why a choice works or not, from the measured geometry (code decides what is correct, never the player).
 * `mode` is TacticalContextAgent's "keep" or "progress" for this match situation.
 * Returns {tone: "good" | "ok" | "risky", text}.
 */
export function callVerdict(choice, g, d, mode) {
  const same = d && choice.action === d.action
    && (choice.action !== 'pass' || choice.target_player_id === d.target_player_id);
  const byId = Object.fromEntries((g?.teammates ?? []).map((o) => [o.id, o]));
  const best = d?.action === 'pass' ? byId[d.target_player_id] : null;
  const waiting = d ? '' : ' The agents are still thinking…';
  const bestLine = best
    ? ` The best option, #${best.id}, is open with ${Math.round(best.receiver_space_m)} m of room and ${best.forward_m >= 0 ? `${Math.round(best.forward_m)} m forward` : `${Math.round(-best.forward_m)} m back`}.`
    : d ? ` The agents chose to ${d.action}.` : '';

  if (choice.action === 'pass') {
    const t = byId[choice.target_player_id];
    if (!t) return { tone: 'risky', text: `#${choice.target_player_id} is not a passing option from here.` };
    if (!t.lane_open) {
      return { tone: 'risky', text: `the lane to #${t.id} is blocked by #${t.blocked_by.join(' and #')}, so the pass is likely to be cut out.${bestLine}${waiting}` };
    }
    if (!t.open) {
      return { tone: 'risky', text: `#${t.id} is marked: the nearest defender is only ${Math.round(t.receiver_space_m)} m away and can step in before the ball arrives.${bestLine}${waiting}` };
    }
    if (same) return { tone: 'good', text: `same as the agents. #${t.id} is open with ${Math.round(t.receiver_space_m)} m of room.` };
    if (!best) return { tone: 'ok', text: `#${t.id} is open with ${Math.round(t.receiver_space_m)} m of room: a safe option.${bestLine}${waiting}` };
    if (t.forward_m < 0 && best.forward_m > 0) {
      return mode === 'keep'
        ? { tone: 'ok', text: `a safe pass ${Math.round(-t.forward_m)} m back keeps the ball, which is sensible when protecting a lead.${bestLine}` }
        : { tone: 'ok', text: `the pass to #${t.id} is safe but goes ${Math.round(-t.forward_m)} m backwards, so your team loses ground.${bestLine}` };
    }
    if (t.receiver_space_m < best.receiver_space_m - 3) {
      return { tone: 'ok', text: `#${t.id} is open but has less room (${Math.round(t.receiver_space_m)} m against ${Math.round(best.receiver_space_m)} m), so they will be closed down sooner.${bestLine}` };
    }
    if (t.distance_m > best.distance_m + 8) {
      return { tone: 'ok', text: `the pass to #${t.id} is ${Math.round(t.distance_m)} m long; a longer pass gives defenders more time to react.${bestLine}` };
    }
    return { tone: 'ok', text: `#${t.id} is a good option too. The agents slightly prefer #${best.id} for a little more room or ground.${bestLine}` };
  }
  if (choice.action === 'dribble') {
    const space = Math.round(g?.free_space?.space_m ?? 0);
    const near = g?.pressure?.nearest_opponents?.[0];
    if (same) return { tone: 'good', text: `same as the agents. There is about ${space} m of space to carry the ball into.` };
    if (space >= 8 && g?.pressure?.level !== 'high') {
      return { tone: 'ok', text: `there is about ${space} m of space to carry the ball into, but a pass moves the ball faster than you can run with it.${bestLine}${waiting}` };
    }
    return { tone: 'risky', text: `dribbling here runs into pressure${near ? `: #${near.id} is only ${Math.round(near.distance_m)} m away` : ''}.${bestLine}${waiting}` };
  }
  const s = g?.shot;
  if (!s) return { tone: 'risky', text: 'no shooting chance from here.' };
  const chance = chanceText(s.xg);
  if (same) return { tone: 'good', text: `same as the agents. From ${Math.round(s.distance_m)} m this shot scores ${chance} of the time.` };
  return {
    tone: s.xg >= 0.1 && s.lane_clear ? 'ok' : 'risky',
    text: `a shot from ${Math.round(s.distance_m)} m scores ${chance} of the time${s.lane_clear ? '' : ', and the path to goal is blocked'}.${bestLine}${waiting}`,
  };
}

function chanceText(xg) {
  return xg < 0.01 ? 'less than 1%' : `about ${Math.round(xg * 100)}%`;
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

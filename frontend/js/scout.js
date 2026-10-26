// KnowledgeScout proposals: a small drop-down under the top bar.
// Research runs in the background on the server. Everyone can read the proposals;
// researching, approving and rejecting need the admin token, and so does the list
// of explanations players marked as unclear. All text is set with textContent.
import * as api from './api.js';

const POLL_MS = 3000;

function node(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

function button(className, text, onClick) {
  const b = node('button', className, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

export class ScoutPanel {
  constructor(toggle, panel, onKnowledgeChanged) {
    this.toggle = toggle;
    this.panel = panel;
    this.onKnowledgeChanged = onKnowledgeChanged;
    this.message = '';
    this.timer = null;
    this.admin = false;
    this.topic = '';
    if (!toggle || !panel) return;
    toggle.addEventListener('click', () => this.setOpen(panel.hidden));
    this.refreshBadge();
  }

  async setOpen(open) {
    this.panel.hidden = !open;
    this.toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      this.admin = await this.checkAdmin();
      await this.refresh();
    } else {
      this.stopPolling();
    }
  }

  async checkAdmin() {
    try {
      await api.checkAdmin();
      return true;
    } catch {
      return false;
    }
  }

  async refreshBadge() {
    try {
      const s = await api.getScout();
      this.toggle.textContent = s.pending ? `Scout · ${s.pending} to review` : 'Scout';
      return s;
    } catch {
      this.toggle.hidden = true;
      return null;
    }
  }

  stopPolling() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  async refresh() {
    const [status, list, clarity] = await Promise.all([
      this.refreshBadge(),
      api.getScoutProposals().catch(() => null),
      this.admin ? api.getClarity().catch(() => null) : Promise.resolve(null),
    ]);
    this.render(status, list?.proposals ?? [], clarity);
    this.stopPolling();
    if (status?.running && !this.panel.hidden) this.timer = setTimeout(() => this.refresh(), POLL_MS);
  }

  async act(fn, okMessage) {
    try {
      const res = await fn();
      this.message = okMessage(res);
      if (res?.result?.status === 'approved') await this.onKnowledgeChanged?.();
    } catch (err) {
      this.message = `Error: ${err.message}`;
      if (err.status === 401 || err.status === 403) this.admin = false;
    }
    await this.refresh();
  }

  async unlock(token) {
    api.setAdminToken(token.trim());
    this.admin = await this.checkAdmin();
    this.message = this.admin ? 'Admin unlocked for this tab.' : 'That token is not right.';
    await this.refresh();
  }

  lock() {
    api.setAdminToken('');
    this.admin = false;
    this.message = 'Locked.';
    this.refresh();
  }

  render(status, proposals, clarity) {
    const p = this.panel;
    p.replaceChildren();
    const head = node('div', 'scout-head');
    head.append(node('strong', '', 'KnowledgeScout'));
    const info = status
      ? `Reference v${status.reference_version} · ${status.entries.length} researched note${status.entries.length === 1 ? '' : 's'} · mode: ${status.mode} · ${status.source}`
      : 'Scout not available';
    head.append(node('span', 'scout-meta', info));
    if (this.admin) head.append(button('scout-lock', 'Lock', () => this.lock()));
    p.append(head);
    p.append(node('p', 'scout-note',
      'Runs in the background, never during an analysis. Checked in code (no links, no real names, no copied text). '
      + 'Approved notes go to football_reference.md and File Search. Nothing players do changes the knowledge.'));

    if (this.admin) {
      p.append(this.researchRow(status));
    } else {
      p.append(this.unlockRow());
    }
    if (this.message) p.append(node('p', 'scout-message', this.message));

    const pending = proposals.filter((x) => x.status === 'pending');
    if (!pending.length) p.append(node('p', 'scout-empty', 'No proposals waiting for review.'));
    for (const prop of pending) p.append(this.card(prop));

    const done = proposals.filter((x) => x.status !== 'pending').slice(0, 5);
    if (done.length) {
      p.append(node('p', 'scout-sub', 'Recent'));
      const ul = node('ul', 'scout-history');
      for (const x of done) ul.append(node('li', '', `${x.id} · ${x.status}${x.version ? ` (v${x.version})` : ''} · ${x.topic}`));
      p.append(ul);
    }
    if (this.admin && clarity) p.append(this.clarityList(clarity));
  }

  unlockRow() {
    const row = node('form', 'scout-unlock');
    row.append(node('span', 'scout-meta', 'Read-only. Enter the admin token to research or approve.'));
    const input = node('input');
    input.type = 'password';
    input.placeholder = 'Admin token';
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Admin token');
    const go = node('button', 'scout-run', 'Unlock');
    go.type = 'submit';
    row.append(input, go);
    row.addEventListener('submit', (e) => {
      e.preventDefault();
      if (input.value) this.unlock(input.value);
    });
    return row;
  }

  researchRow(status) {
    const row = node('div', 'scout-research');
    const input = node('input');
    input.type = 'text';
    input.maxLength = 80;
    input.placeholder = 'Topic (optional: empty = next gap topic)';
    input.value = this.topic;
    input.setAttribute('aria-label', 'Research topic');
    input.addEventListener('input', () => { this.topic = input.value; });
    const run = button('scout-run', status?.running ? 'Researching…' : 'Research a topic', () => {
      const topic = this.topic.trim();
      this.topic = '';
      this.act(() => api.runScout(topic ? { topic } : {}),
        (r) => (r.started ? `Research started in the background${topic ? `: ${topic}` : ''}.` : r.message));
    });
    run.disabled = !status || status.running;
    row.append(input, run);
    return row;
  }

  card(prop) {
    const card = node('article', 'scout-card');
    card.append(node('h3', '', `${prop.id} · ${prop.topic}`));
    const searched = prop.search ? ` · ${prop.search.searches} web search${prop.search.searches === 1 ? '' : 'es'}, sources checked` : '';
    card.append(node('p', 'scout-meta', `${prop.reason} · source: ${prop.source}${prop.sources.length ? ` (${prop.sources.join(', ')})` : ''}${searched}`));
    const e = prop.entry;
    if (e?.summary) card.append(node('p', '', e.summary));
    const ul = node('ul');
    for (const t of [...(e?.insights ?? []), ...(e?.rules_of_thumb ?? [])]) ul.append(node('li', '', t));
    card.append(ul);
    if (e?.situation) card.append(node('p', 'scout-meta', `Worked situation: ${e.situation.situation} → ${e.situation.best_decision}`));
    if (prop.rejected_items.length) card.append(node('p', 'scout-meta', `${prop.rejected_items.length} item(s) filtered out by the checks.`));
    if (this.admin) {
      const row = node('div', 'scout-actions');
      row.append(
        button('approve', 'Approve', () => this.act(() => api.approveScout(prop.id), (r) =>
          (r.result.status === 'approved'
            ? `${prop.id} added as reference v${r.result.version}.${r.result.sync_status ? ` Sync: ${r.result.sync_status}` : ''}`
            : `${prop.id}: ${r.result.status}`))),
        button('reject', 'Reject', () => this.act(() => api.rejectScout(prop.id), () => `${prop.id} rejected.`)),
      );
      card.append(row);
    }
    return card;
  }

  /** Explanations players marked "not really": for the coach to review, never applied automatically. */
  clarityList(clarity) {
    const box = node('section', 'scout-clarity');
    const c = clarity.counts;
    box.append(node('p', 'scout-sub', `Unclear explanations (${clarity.unclear.length})`));
    box.append(node('p', 'scout-meta',
      `Analyse: ${c.analyse.understood} understood, ${c.analyse.unclear} unclear · `
      + `Training: ${c.training.understood} understood, ${c.training.unclear} unclear`));
    for (const flag of clarity.unclear.slice(0, 8)) {
      const item = node('article', 'scout-card');
      item.append(node('p', 'scout-meta', `${flag.id} · ${flag.where} · ${flag.at.replace('T', ' ')} · ${flag.context.explanation_source}`));
      if (flag.comment) item.append(node('p', '', `"${flag.comment}"`));
      if (flag.explanation) item.append(node('p', 'scout-meta', flag.explanation));
      const topic = (flag.comment || flag.explanation).slice(0, 80);
      item.append(button('scout-run', 'Research this topic', () => {
        this.topic = topic;
        this.message = 'Topic filled in above. Check it, then press "Research a topic". You still approve the result.';
        this.refresh();
      }));
      box.append(item);
    }
    return box;
  }
}

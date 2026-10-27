// Player profiles: "who's playing?" on a shared device. A nickname and a colour badge,
// no email, password or real name. Each profile's drill history stays in this browser;
// the server keeps nothing about players. A player code carries a profile to another device.

const PROFILES_KEY = 'eagleeye.profiles';
const OLD_HISTORY_KEY = 'eagleeye.training.v2'; // before profiles: one history per browser
const HISTORY_SIZE = 30;
const CODE_PREFIX = 'EE1-';
const MAX_CODE_CHARS = 12000;
export const DEMO_ID = 'demo';
export const MAX_NAME = 16;
export const COLOURS = ['#f5c542', '#38bdf8', '#22c55e', '#c084fc', '#fb923c', '#f472b6'];
const LEVELS = ['rookie', 'academy', 'pro'];
const VERDICTS = ['best', 'good', 'ok', 'risky'];

let demoHistory = []; // the labelled sample, from /api/training/demo-history

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback; // private mode or blocked storage
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* private mode or blocked storage: nothing is kept */ }
}

const historyKey = (id) => `${OLD_HISTORY_KEY}.${id}`;
const recordKey = (id) => `eagleeye.record.${id}`;
export const FIRST_DRILLS = 3; // "where you started" is the average of the first few drills

const num = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;

/** False when this browser won't keep anything (blocked storage). */
export function storageWorks() {
  try {
    localStorage.setItem('eagleeye.check', '1');
    localStorage.removeItem('eagleeye.check');
    return true;
  } catch {
    return false;
  }
}

/** Ask the browser not to clear EagleEye's storage when space runs low. It may say no; that's fine. */
export function keepStorage() {
  navigator.storage?.persist?.().catch(() => { /* not granted: storage is still kept normally */ });
}

export function setDemoHistory(history) {
  demoHistory = cleanHistory(history);
}

/** {current, list}. The first time, an existing one-browser history becomes "Player 1". */
export function loadProfiles() {
  const data = read(PROFILES_KEY, null);
  if (data && Array.isArray(data.list)) return data;
  const old = read(OLD_HISTORY_KEY, []);
  if (Array.isArray(old) && old.length) {
    const first = { id: newId(), name: 'Player 1', colour: COLOURS[0] };
    write(historyKey(first.id), cleanHistory(old));
    try { localStorage.removeItem(OLD_HISTORY_KEY); } catch { /* fine */ }
    const migrated = { current: first.id, list: [first] };
    write(PROFILES_KEY, migrated);
    return migrated;
  }
  return { current: null, list: [] };
}

export function demoProfile() {
  return { id: DEMO_ID, name: 'Demo player', colour: '#94a3b8', demo: true };
}

export function currentProfile() {
  const { current, list } = loadProfiles();
  if (current === DEMO_ID) return demoProfile();
  return list.find((p) => p.id === current) ?? null;
}

export function selectProfile(id) {
  const data = loadProfiles();
  data.current = id;
  write(PROFILES_KEY, data);
}

export function createProfile(name, colour) {
  const clean = cleanName(name);
  if (!clean) return null;
  const data = loadProfiles();
  const profile = { id: newId(), name: clean, colour: COLOURS.includes(colour) ? colour : COLOURS[0] };
  data.list.push(profile);
  data.current = profile.id;
  write(PROFILES_KEY, data);
  return profile;
}

export function deleteProfile(id) {
  const data = loadProfiles();
  data.list = data.list.filter((p) => p.id !== id);
  if (data.current === id) data.current = null;
  write(PROFILES_KEY, data);
  try {
    localStorage.removeItem(historyKey(id));
    localStorage.removeItem(recordKey(id));
  } catch { /* fine */ }
}

/** The level this player trains at, so the next visit starts where they left off. */
export function savedLevel() {
  const p = currentProfile();
  return p && !p.demo && LEVELS.includes(p.level) ? p.level : 'rookie';
}

export function saveLevel(level) {
  const data = loadProfiles();
  const p = data.list.find((x) => x.id === data.current);
  if (!p || !LEVELS.includes(level)) return;
  p.level = level;
  write(PROFILES_KEY, data);
}

/** The current player's recent drills. The demo player starts from the labelled sample. */
export function loadHistory() {
  const p = currentProfile();
  if (!p) return [];
  const stored = read(historyKey(p.id), null);
  if (stored == null && p.demo) return demoHistory.slice();
  return Array.isArray(stored) ? stored : [];
}

export function saveHistory(history) {
  const p = currentProfile();
  if (p) write(historyKey(p.id), history.slice(-HISTORY_SIZE));
}

export function resetHistory() {
  const p = currentProfile();
  if (!p) return;
  try {
    localStorage.removeItem(historyKey(p.id));
    localStorage.removeItem(recordKey(p.id));
  } catch { /* fine */ }
}

/**
 * "Since you started": a small record that is never cut, unlike the last-30 history.
 * Built only from graded drills. Players from before the record get it from their saved
 * history once; the demo player's is always worked out from its sample.
 */
export function loadRecord() {
  const p = currentProfile();
  if (!p) return null;
  if (p.demo) return recordFrom(loadHistory());
  const stored = cleanRecord(read(recordKey(p.id), null));
  if (stored) return stored;
  const record = recordFrom(loadHistory());
  if (record) write(recordKey(p.id), record);
  return record;
}

/** Add one graded drill to the record. Call before the drill is added to the history. */
export function recordDrill(item) {
  const p = currentProfile();
  if (p && !p.demo) write(recordKey(p.id), addToRecord(loadRecord(), item));
}

function recordFrom(history) {
  return history.reduce((record, h) => addToRecord(record, h), null);
}

function addToRecord(record, h) {
  const r = record ?? { drills: 0, first: [], best_score: 0, best_coverage: null, best_level: 'rookie', since: h.at ?? null };
  r.drills += 1;
  if (r.first.length < FIRST_DRILLS) r.first.push({ score: h.score, coverage: h.coverage ?? null, level: h.level });
  r.best_score = Math.max(r.best_score, h.score);
  if (num(h.coverage, 0, 1)) r.best_coverage = Math.max(r.best_coverage ?? 0, h.coverage);
  if (LEVELS.indexOf(h.level) > LEVELS.indexOf(r.best_level)) r.best_level = h.level;
  return r;
}

function cleanRecord(r) {
  if (!r || !num(r.drills, 1, 1e6) || !Array.isArray(r.first) || !num(r.best_score, 0, 100)) return null;
  return {
    drills: Math.floor(r.drills),
    first: r.first.slice(0, FIRST_DRILLS).filter((f) => f && num(f.score, 0, 100) && LEVELS.includes(f.level))
      .map((f) => ({ score: f.score, coverage: num(f.coverage, 0, 1) ? f.coverage : null, level: f.level })),
    best_score: r.best_score,
    best_coverage: num(r.best_coverage, 0, 1) ? r.best_coverage : null,
    best_level: LEVELS.includes(r.best_level) ? r.best_level : 'rookie',
    since: num(r.since, 0, 1e15) ? r.since : null,
  };
}

/** A copy of this profile to carry to another device. It contains no personal data. */
export function playerCode() {
  const p = currentProfile();
  if (!p || p.demo) return '';
  const json = JSON.stringify({
    v: 2, name: p.name, colour: p.colour, level: savedLevel(), history: loadHistory(), record: loadRecord(),
  });
  return CODE_PREFIX + btoa(String.fromCharCode(...new TextEncoder().encode(json)));
}

/** Add the profile from a player code. Returns the new profile, or throws with a friendly message. */
export function importPlayerCode(code) {
  const text = String(code ?? '').trim();
  if (!text.startsWith(CODE_PREFIX) || text.length > MAX_CODE_CHARS) throw new Error("That doesn't look like an EagleEye player code.");
  let data;
  try {
    const bytes = Uint8Array.from(atob(text.slice(CODE_PREFIX.length)), (c) => c.charCodeAt(0));
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('That player code is damaged. Copy it again from the other device.');
  }
  const profile = createProfile(data?.name, data?.colour);
  if (!profile) throw new Error('That player code has no nickname.');
  write(historyKey(profile.id), cleanHistory(data.history));
  const record = cleanRecord(data.record); // v1 codes have none: it is rebuilt from the history
  if (record) write(recordKey(profile.id), record);
  saveLevel(data.level);
  return profile;
}

function cleanName(name) {
  return String(name ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}

/** Keep only well-formed drill results (the same fields the server's NextRequest accepts). */
function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-HISTORY_SIZE).filter((h) => h && typeof h.trial_id === 'string' && h.trial_id.length <= 120
    && LEVELS.includes(h.level) && VERDICTS.includes(h.verdict) && num(h.score, 0, 100)
    && num(h.scans, 0, 50) && num(h.target_scans, 1, 20))
    .map((h) => ({
      trial_id: h.trial_id, level: h.level, score: h.score, verdict: h.verdict, scans: h.scans,
      target_scans: h.target_scans, timed: Boolean(h.timed), too_slow: Boolean(h.too_slow),
      opened_body: Boolean(h.opened_body),
      ...(num(h.coverage, 0, 1) ? { coverage: h.coverage } : {}),
      missed: (Array.isArray(h.missed) ? h.missed : []).slice(0, 12)
        .filter((m) => m && ['front', 'behind', 'left', 'right'].includes(m.side) && num(m.angle, 0, 180))
        .map((m) => ({ side: m.side, angle: m.angle, open: Boolean(m.open) })),
      ...(Number.isFinite(h.at) ? { at: h.at } : {}),
    }));
}

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

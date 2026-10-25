// The admin token is typed in by the admin and kept only for this browser tab
// (sessionStorage). It is never part of the shipped code.
const TOKEN_KEY = 'eagleeye.adminToken';

export function getAdminToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setAdminToken(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* storage blocked: the token just isn't remembered */ }
}

export class ApiError extends Error {
  constructor(status, message) {
    super(`${status}: ${message}`);
    this.status = status;
  }
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getAdminToken();
  if (token) headers['X-Admin-Token'] = token;
  const res = await fetch(path, { headers, ...options });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch { /* not JSON */ }
    if (res.status === 401 || res.status === 403) setAdminToken(''); // a wrong or missing token: ask again
    throw new ApiError(res.status, detail);
  }
  return res.json();
}

export const getConfig = () => request('/api/config');
export const listScenarios = () => request('/api/scenarios');
export const getScenario = (id) => request(`/api/scenarios/${encodeURIComponent(id)}`);

const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) });
export const getGeometry = ({ situation, ...moment }) => post('/api/geometry', moment);
export const analyze = (moment) => post('/api/analyze', moment);
export const getKnowledge = () => request('/api/knowledge');
export const getTrials = () => request('/api/training/trials');
export const evaluateTraining = (body) => post('/api/training/evaluate', body);
export const nextDrill = (body) => post('/api/training/next', body);

// "Did you understand?" flags: a review queue for the admin; they never change any knowledge.
export const sendClarity = (body) => post('/api/clarity', body);
export const getClarity = () => request('/api/clarity');

// Admin only (token required on the public demo).
export const checkAdmin = () => request('/api/admin/check');
export const getScout = () => request('/api/scout');
export const runScout = (body = {}) => post('/api/scout/run', body);
export const getScoutProposals = (status) => request(`/api/scout/proposals${status ? `?status=${encodeURIComponent(status)}` : ''}`);
export const approveScout = (id) => post(`/api/scout/approve/${encodeURIComponent(id)}`, {});
export const rejectScout = (id) => post(`/api/scout/reject/${encodeURIComponent(id)}`, {});

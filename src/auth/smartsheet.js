// Smartsheet sign-in with each user's own account: OAuth 2.0 authorization code flow. The app gets the code back at
// config.APP_URL and posts it to the Worker, which holds the app secret and checks the email allowlist.
// Tokens are kept on the phone (IndexedDB) and refreshed through the Worker 5 minutes before they expire.
import { randomState } from './tokens.js';

export const NOT_CONNECTED = 'Smartsheet not connected yet';
export const DENIED = 'Not on the access list – ask JK';
const AUTHORIZE = 'https://app.smartsheet.com/b/authorize';
const REFRESH_EARLY_MS = 5 * 60 * 1000;

export class AuthError extends Error { constructor(message, status) { super(message); this.status = status; } }

export function createSmartsheetAuth({ config, store, fetch: fetchFn = (...a) => globalThis.fetch(...a), win = globalThis.window, now = () => Date.now() }) {
  const worker = () => String(config.WORKER_URL || '').replace(/\/+$/, '');
  const ready = () => !!worker() && !!config.SMARTSHEET_CLIENT_ID;

  function authorizeUrl(state) {
    const u = new URL(AUTHORIZE);
    u.search = new URLSearchParams({ response_type: 'code', client_id: config.SMARTSHEET_CLIENT_ID, scope: 'READ_SHEETS WRITE_SHEETS READ_USERS', state, redirect_uri: config.APP_URL }).toString();
    return u.toString();
  }

  /** From a tap: go to Smartsheet's sign-in page. */
  async function connect() {
    if (!ready()) throw new AuthError(NOT_CONNECTED, 0);
    const state = randomState(); await store.put('smartsheet.state', { state, at: now() });
    win.location.assign(authorizeUrl(state)); return { redirecting: true };
  }

  async function workerPost(path, body) {
    const r = await fetchFn(`${worker()}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.status === 403) throw new AuthError(DENIED, 403);
    if (!r.ok) throw new AuthError('Smartsheet sign-in did not finish. Tap Connect Smartsheet again.', r.status);
    return r.json();
  }
  async function saveTokens(t) { const v = { access_token: t.access_token, refresh_token: t.refresh_token, expiresAt: now() + (Number(t.expires_in) || 0) * 1000 }; await store.put('smartsheet', v); return v; }

  /** On page load: ?code=…&state=… from Smartsheet. Checks state, exchanges the code via the Worker, cleans the URL. */
  async function handleRedirect() {
    const q = new URLSearchParams(win.location.search || '');
    if (!q.has('state') || (!q.has('code') && !q.has('error'))) return null;
    const saved = await store.get('smartsheet.state'); await store.delete('smartsheet.state');
    win.history.replaceState(null, '', win.location.pathname + '#settings');
    if (!saved || q.get('state') !== saved.state) return { ok: false, error: 'Smartsheet sign-in could not be checked. Tap Connect Smartsheet again.' };
    if (q.get('error') || !q.get('code')) return { ok: false, error: 'Smartsheet sign-in was cancelled.' };
    if (!ready()) return { ok: false, error: NOT_CONNECTED };
    try { await saveTokens(await workerPost('/token', { code: q.get('code') })); return { ok: true }; }
    catch (e) { return { ok: false, error: e.message, status: e.status }; }
  }

  /** A usable access token (refreshed through the Worker when under 5 minutes are left), or an AuthError. */
  async function getToken() {
    if (!ready()) throw new AuthError(NOT_CONNECTED, 0);
    const t = await store.get('smartsheet');
    if (!t || !t.access_token) throw new AuthError('Connect Smartsheet', 401);
    if (t.expiresAt - now() > REFRESH_EARLY_MS) return t.access_token;
    if (!t.refresh_token) throw new AuthError('Connect Smartsheet', 401);
    try { return (await saveTokens(await workerPost('/refresh', { refresh_token: t.refresh_token }))).access_token; }
    catch (e) { if (e.status === 403) throw e; await store.delete('smartsheet'); throw new AuthError('Connect Smartsheet', 401); }
  }

  /** A relayed Smartsheet API call (path after /2.0, e.g. /users/me or /sheets/<id>/rows). */
  async function api(path, init = {}) {
    const token = await getToken();
    const r = await fetchFn(`${worker()}/api${path}`, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) } });
    if (r.status === 403) throw new AuthError(DENIED, 403);
    if (r.status === 401) { await store.delete('smartsheet'); throw new AuthError('Connect Smartsheet', 401); }
    return r;
  }

  async function clear() { await store.delete('smartsheet'); await store.delete('smartsheet.state'); }
  return { ready, authorizeUrl, connect, handleRedirect, getToken, api, clear };
}

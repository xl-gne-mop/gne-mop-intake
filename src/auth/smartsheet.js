// Smartsheet sign-in with each user's own account: OAuth 2.0 authorization code flow. The app gets the code back at
// config.APP_URL and posts it to the Worker, which holds the app secret and checks the email allowlist.
// Tokens are kept on the phone (IndexedDB) and refreshed through the Worker 5 minutes before they expire.
import { randomState, stateOk } from './tokens.js';
import { timed } from '../util/net.js';

export const NOT_CONNECTED = 'Smartsheet not connected yet';
export const DENIED = 'Not on the access list – ask JK';
const AUTHORIZE = 'https://app.smartsheet.com/b/authorize';
const REFRESH_EARLY_MS = 5 * 60 * 1000;

// Plain messages with the relay's code, so JK can tell which setting to fix (docs/DEPLOY.md, step 3).
export const SS_OFFLINE = 'Could not reach Smartsheet. Your work is saved; it will try again.';
export const NO_RELAY = 'Could not reach the Smartsheet relay (no answer). Check your signal and tap Connect Smartsheet again. If it keeps happening, ask JK.';
export function relayMessage(status) {
  if (status === 400 || status === 401) return `Smartsheet did not accept the sign-in (code ${status}). Tap Connect Smartsheet again. If it keeps happening, ask JK to check the Smartsheet app secret.`;
  if (status === 500) return 'The Smartsheet relay is not set up yet (code 500) – ask JK.';
  return `Smartsheet sign-in did not finish (code ${status}). Tap Connect Smartsheet again.`;
}

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
    let r;
    try { r = await fetchFn(`${worker()}${path}`, timed({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })); }
    catch { throw new AuthError(NO_RELAY, -1); }
    if (r.status === 403) throw new AuthError(DENIED, 403);
    if (!r.ok) throw new AuthError(relayMessage(r.status), r.status);
    return r.json();
  }
  async function saveTokens(t) { const v = { access_token: t.access_token, refresh_token: t.refresh_token, expiresAt: now() + (Number(t.expires_in) || 0) * 1000 }; await store.put('smartsheet', v); return v; }

  /** On page load: ?code=…&state=… from Smartsheet. Checks state, exchanges the code via the Worker, cleans the URL. */
  async function handleRedirect() {
    const q = new URLSearchParams(win.location.search || '');
    if (!q.has('state') || (!q.has('code') && !q.has('error'))) return null;
    const saved = await store.get('smartsheet.state'); await store.delete('smartsheet.state');
    win.history.replaceState(null, '', win.location.pathname + '#settings');
    if (!stateOk(saved, q.get('state'), now())) return { ok: false, error: 'Smartsheet sign-in could not be checked. Tap Connect Smartsheet again.' };
    if (q.get('error') || !q.get('code')) return { ok: false, error: 'Smartsheet sign-in was cancelled.' };
    if (!ready()) return { ok: false, error: NOT_CONNECTED };
    try { await saveTokens(await workerPost('/token', { code: q.get('code') })); return { ok: true }; }
    catch (e) { return { ok: false, error: e.message, status: e.status }; }
  }

  /**
   * A usable access token (refreshed through the Worker when under 5 minutes are left), or an AuthError.
   * - One refresh at a time: Smartsheet refresh tokens are single-use, so two calls refreshing together would
   *   leave the second with a spent token and sign the user out.
   * - The saved sign-in is dropped only when Smartsheet refuses the refresh token (400/401). No signal, a timeout or
   *   a relay hiccup keeps it (status -1) and the next sync tries again: offline must never sign anyone out.
   */
  let refreshing = null;
  async function getToken() {
    if (!ready()) throw new AuthError(NOT_CONNECTED, 0);
    const t = await store.get('smartsheet');
    if (!t || !t.access_token) throw new AuthError('Connect Smartsheet', 401);
    if (t.expiresAt - now() > REFRESH_EARLY_MS) return t.access_token;
    if (!t.refresh_token) throw new AuthError('Connect Smartsheet', 401);
    if (!refreshing) refreshing = refresh(t.refresh_token).finally(() => { refreshing = null; });
    return refreshing;
  }
  async function refresh(refreshToken) {
    try { return (await saveTokens(await workerPost('/refresh', { refresh_token: refreshToken }))).access_token; }
    catch (e) {
      if (e.status === 403) throw e;
      if (e.status === 400 || e.status === 401) { await store.delete('smartsheet'); throw new AuthError('Connect Smartsheet', 401); }
      throw new AuthError(SS_OFFLINE, -1);
    }
  }

  /** A relayed Smartsheet API call (path after /2.0, e.g. /users/me or /sheets/<id>/rows). */
  async function api(path, init = {}) {
    const token = await getToken();
    let r;
    try { r = await fetchFn(`${worker()}/api${path}`, timed({ ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) } })); }
    catch { throw new AuthError(SS_OFFLINE, -1); }
    if (r.status === 403) throw new AuthError(DENIED, 403);
    if (r.status === 401) { await store.delete('smartsheet'); throw new AuthError('Connect Smartsheet', 401); }
    return r;
  }

  /** Is there a saved Smartsheet sign-in on this phone? (Does not call the network.) */
  async function connected() { const t = await store.get('smartsheet'); return !!(t && t.access_token); }

  async function clear() { await store.delete('smartsheet'); await store.delete('smartsheet.state'); }
  return { ready, authorizeUrl, connect, handleRedirect, getToken, api, connected, clear };
}

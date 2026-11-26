// Google sign-in with each user's own account (no client secret anywhere – JK decision 11/25/26).
// - Token model (Google Identity Services initTokenClient) from a tap. GIS is preloaded so the tap can open the
//   popup straight away (browsers block popups that aren't opened inside the tap).
// - iPhone/iPad Home Screen app (popups are unreliable there), or GIS not loaded: OAuth 2.0 client-side redirect
//   flow (response_type=token) to config.APP_URL with a random state that must come back unchanged.
// - Tokens last about an hour and can't be refreshed silently: a token older than 55 minutes is treated as gone and
//   the app shows one big "Sign in to sync" button. Local work never waits for this.
import { randomState } from './tokens.js';

export const TOKEN_MAX_AGE_MS = 55 * 60 * 1000;
export const GIS_SRC = 'https://accounts.google.com/gsi/client';
const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const USERINFO = 'https://www.googleapis.com/oauth2/v3/userinfo';
const REVOKE = 'https://oauth2.googleapis.com/revoke';

export function createGoogleAuth({ config, store, fetch: fetchFn = (...a) => globalThis.fetch(...a), win = globalThis.window, now = () => Date.now(), useRedirect = () => false }) {
  let tokenClient = null, pending = null;

  function redirectUrl(state, { selectAccount = false } = {}) {
    const u = new URL(AUTH);
    u.search = new URLSearchParams({ client_id: config.GOOGLE_CLIENT_ID, redirect_uri: config.APP_URL, response_type: 'token', scope: config.GOOGLE_SCOPES, state, include_granted_scopes: 'true', ...(selectAccount ? { prompt: 'select_account' } : {}) }).toString();
    return u.toString();
  }

  async function save(resp) {
    const t = { access_token: resp.access_token, scope: resp.scope || config.GOOGLE_SCOPES, obtainedAt: now(), expiresAt: now() + (Number(resp.expires_in) || 3599) * 1000 };
    await store.put('google', t); return t;
  }

  /** The token if it is under 55 minutes old (and not past its expiry), else null. */
  async function getToken() {
    const t = await store.get('google');
    if (!t || !t.access_token) return null;
    if (now() - t.obtainedAt >= TOKEN_MAX_AGE_MS || now() >= t.expiresAt) return null;
    return t.access_token;
  }

  /** Preload GIS (non-blocking) so a later tap can open the popup immediately. */
  function preload() {
    if (!win || !win.document || win.google?.accounts?.oauth2 || win.document.querySelector(`script[src="${GIS_SRC}"]`)) return;
    const s = win.document.createElement('script'); s.src = GIS_SRC; s.async = true; s.defer = true; win.document.head.append(s);
  }

  function ensureClient() {
    const oauth2 = win && win.google && win.google.accounts && win.google.accounts.oauth2;
    if (!oauth2) return null;
    if (!tokenClient) tokenClient = oauth2.initTokenClient({
      client_id: config.GOOGLE_CLIENT_ID, scope: config.GOOGLE_SCOPES,
      callback: async resp => { const p = pending; pending = null; if (!p) return; if (resp && resp.access_token) p.resolve(await save(resp)); else p.reject(new Error(resp && resp.error ? `Google sign-in did not finish (${resp.error}).` : 'Google sign-in did not finish.')); },
      error_callback: err => { const p = pending; pending = null; if (p) p.reject(new Error(err && err.type === 'popup_closed' ? 'Sign-in window was closed.' : 'Google sign-in did not finish.')); }
    });
    return tokenClient;
  }

  /**
   * Call from a tap. Popup where possible; otherwise (iOS Home Screen app, or GIS not loaded yet) the redirect flow,
   * which leaves the page – resolves to {redirecting: true} then.
   */
  async function signIn({ selectAccount = false } = {}) {
    const client = useRedirect() ? null : ensureClient();
    if (!client) {
      const state = randomState(); await store.put('google.state', { state, at: now() });
      win.location.assign(redirectUrl(state, { selectAccount }));
      return { redirecting: true };
    }
    const p = new Promise((resolve, reject) => { pending = { resolve, reject }; });
    client.requestAccessToken({ prompt: selectAccount ? 'select_account' : '' });
    return p;
  }

  /**
   * On page load, before the router: take a redirect result out of the URL fragment. The state must match the
   * one saved before leaving; either way the saved state is deleted and the URL cleaned.
   */
  async function handleRedirect() {
    const h = (win.location.hash || '').replace(/^#/, '');
    if (!/(^|&)(access_token|error)=/.test(h) || !/(^|&)state=/.test(h)) return null;
    const p = new URLSearchParams(h), saved = await store.get('google.state');
    await store.delete('google.state');
    win.history.replaceState(null, '', win.location.pathname + win.location.search + '#board');
    if (!saved || p.get('state') !== saved.state) return { ok: false, error: 'Sign-in could not be checked. Tap Sign in to sync again.' };
    if (p.get('error') || !p.get('access_token')) return { ok: false, error: 'Google sign-in did not finish.' };
    await save({ access_token: p.get('access_token'), expires_in: p.get('expires_in'), scope: p.get('scope') });
    return { ok: true };
  }

  async function userinfo() {
    const token = await getToken(); if (!token) throw Object.assign(new Error('Sign in to sync'), { status: 401 });
    const r = await fetchFn(USERINFO, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 401) { await store.delete('google'); throw Object.assign(new Error('Sign in to sync'), { status: 401 }); }
    if (!r.ok) throw Object.assign(new Error(`Google answered ${r.status}`), { status: r.status });
    const u = await r.json(); return { email: String(u.email || '').toLowerCase(), name: u.name || '' };
  }

  async function revoke() {
    const t = await store.get('google'); await store.delete('google');
    if (t && t.access_token) { try { await fetchFn(`${REVOKE}?token=${encodeURIComponent(t.access_token)}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }); } catch { /* offline: the token expires within the hour anyway */ } }
  }

  return { redirectUrl, save, getToken, preload, signIn, handleRedirect, userinfo, revoke };
}

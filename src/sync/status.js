// Sign-in state, the edit-rights preflight and the access-list check, in one place for the header "sync bar".
// Local work never waits for any of this. Phase 6 adds the outbox drain to syncNow().
import { S } from '../core/state.js';
import { createGoogleAuth } from '../auth/google.js';
import { createSmartsheetAuth, NOT_CONNECTED, DENIED } from '../auth/smartsheet.js';
import { idbTokenStore } from '../auth/tokens.js';
import { createPreflight } from './preflight.js';
import { setIdentity, getIdentity } from '../auth/identity.js';
import { isEditor } from '../auth/roles.js';
import { isIOS, isStandalone } from '../pwa/installGate.js';
import { requestPersistence } from '../pwa/persist.js';
import { countOutbox } from '../store/outbox.js';

const C = () => globalThis.MOP_CONFIG || {};
// smartsheet: the Smartsheet line under the bar. ssError keeps the reason a Smartsheet sign-in failed, so a later
// automatic check cannot replace it with a vaguer message. ssConnected: a Smartsheet sign-in is saved on this phone.
export const SYNC = { state: 'idle', message: '', smartsheet: '', ssError: '', ssConnected: false, busy: false };

export function createSession({ config = C(), store = idbTokenStore, fetch: fetchFn, win = globalThis.window, hooks = {} } = {}) {
  const google = createGoogleAuth({ config, store, fetch: fetchFn, win, useRedirect: () => isIOS(win.navigator) && isStandalone(win) });
  const smartsheet = createSmartsheetAuth({ config, store, fetch: fetchFn, win });
  const preflight = createPreflight({ config, fetch: fetchFn, pilot: () => !!S.pilotOn });
  const changed = () => hooks.changed && hooks.changed();

  /** After a valid Google token: who is this, editor or not, config with the token, ask to keep storage. */
  async function afterSignIn() {
    const me = await google.userinfo();
    await setIdentity(me);
    S.uid = me.email; S.meName = me.name; if (me.name) S.names[me.email] = me.name;
    if (hooks.loadConfig) await hooks.loadConfig(() => google.getToken());
    S.canEdit = isEditor(me.email, (S.cfg && S.cfg.editors) || []);
    const p = await requestPersistence();
    if (hooks.persistWarning) hooks.persistWarning(p.supported && !p.persisted);
    SYNC.state = 'signedIn'; SYNC.message = ''; changed();
  }

  /** Page load, BEFORE the router (fast): finish a Google or Smartsheet redirect and clean the URL. */
  async function handleRedirects() {
    const g = await google.handleRedirect();
    if (g && !g.ok) SYNC.message = g.error;
    const s = await smartsheet.handleRedirect();
    if (s) { SYNC.smartsheet = s.ok ? 'Smartsheet connected.' : s.error; SYNC.ssError = s.ok ? '' : s.error; }
    SYNC.ssConnected = await smartsheet.connected();
    SYNC.state = (await google.getToken()) ? 'signedIn' : 'signin';
    const id = await getIdentity(); if (id && !S.uid) { S.uid = id.email; S.meName = id.name; }
    changed();
  }

  /** AFTER the first render (may use the network): pick up a saved token and sync. Never blocks local work. */
  async function resume() {
    if (navigator.onLine) google.preload();
    if (!(await google.getToken())) { SYNC.state = 'signin'; changed(); return; }
    try { await afterSignIn(); await syncNow(); }
    catch (e) { SYNC.state = e.status === 401 ? 'signin' : 'signedIn'; if (e.status !== 401) SYNC.message = 'Could not reach Google. Your work is saved on this phone.'; changed(); }
  }

  /** From the "Sign in to sync" tap (must stay inside the tap for the popup). */
  async function signIn({ selectAccount = false } = {}) {
    try { const r = await google.signIn({ selectAccount }); if (r && r.redirecting) return; await afterSignIn(); await syncNow({ force: true }); }
    catch (e) { SYNC.message = e.message || 'Google sign-in did not finish.'; changed(); }
  }

  /**
   * Sync now (tap = force) or automatic (open / online / visible). Never prompts: without a fresh token it only
   * shows "Sign in to sync". Then the outbox drains (src/sync/engine.js).
   */
  async function syncNow({ force = false } = {}) {
    if (SYNC.busy) return SYNC; SYNC.busy = true;
    try {
      const token = await google.getToken();
      if (!token) { SYNC.state = 'signin'; SYNC.message = ''; return SYNC; }
      const pf = await preflight.run({ token, email: S.uid, force });
      if (!pf.ok) { SYNC.state = pf.status === 401 ? 'signin' : 'blocked'; SYNC.message = pf.status === 401 ? '' : pf.message; return SYNC; }
      if (!smartsheet.ready()) SYNC.smartsheet = NOT_CONNECTED;
      else {
        try { const r = await smartsheet.api('/users/me'); if (r.ok && SYNC.smartsheet !== 'Smartsheet connected.') SYNC.smartsheet = ''; } // a check that works clears old problems, not the confirmation
        catch (e) { if (e.status === 403) { SYNC.state = 'blocked'; SYNC.message = DENIED; return SYNC; } SYNC.smartsheet = SYNC.ssError || e.message; }
        SYNC.ssConnected = await smartsheet.connected();
      }
      SYNC.state = 'signedIn'; SYNC.message = '';
      if (hooks.drain) {
        const r = await hooks.drain({ token, smartsheet });
        if (r.stopped === 'signin') { SYNC.state = 'signin'; return SYNC; }
        SYNC.message = r.conflicts ? `${r.message}. ${r.conflicts} change${r.conflicts > 1 ? 's' : ''} need${r.conflicts > 1 ? '' : 's'} an editor to choose.` : r.message;
        if (r.smartsheet) SYNC.smartsheet = r.smartsheet;
        if (r.stopped === 'access') SYNC.state = 'blocked';
      }
      return SYNC;
    } finally { SYNC.busy = false; changed(); }
  }

  return { google, smartsheet, preflight, handleRedirects, resume, signIn, syncNow, afterSignIn, waiting: countOutbox };
}

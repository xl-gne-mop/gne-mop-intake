// The outbox drain (phase 6). Oldest op first. A request op triggers an idempotent reconcile of that request
// (src/sync/reconcile.js), so replaying ops, a duplicate op or a crash part-way never writes anything twice.
//   401 from Google          -> stop everything, "Sign in to sync" (ops stay)
//   Worker 403               -> Smartsheet stops ("Not on the access list – ask JK"); Drive + tracker still go
//   Smartsheet not connected -> Drive + tracker go; the op waits for Smartsheet
//   anything else            -> that op waits: 30 s × 2^attempts, at most 1 hour; other requests carry on
// Never retries in a loop: one try per op per drain.
// retryClasses (config.js FLAGS, on): an error is either worth retrying later (no signal, time-out, 429, 5xx, a
// Google rate limit) – it waits 30 s × 2^attempts with jitter, or longer if the server said Retry-After, and stops
// after MAX_ATTEMPTS – or it can't succeed by waiting (no access, not found, bad data, tracker full / moved):
// it stops at once and is marked needsAction. Ops marked needsAction (and ops still waiting out their backoff) are
// only tried again when the user taps Sync now / Try again (force), never by the automatic triggers.
import { reconcileRequest, SyncStop } from './reconcile.js';
import { syncLibraryOp } from './library.js';
import { DENIED } from '../auth/smartsheet.js';
import { ApiError, retryAfterOf } from './google-api.js';
import { flagOn } from './flags.js';

export const backoffMs = attempts => Math.min(30000 * 2 ** Math.max(0, attempts - 1), 3600000);
export const MAX_ATTEMPTS = 10;
/** Google 403 reasons that mean "slow down", not "no access". */
export const RATE_REASONS = ['rateLimitExceeded', 'userRateLimitExceeded', 'dailyLimitExceeded', 'backendError', 'RESOURCE_EXHAUSTED'];
const RETRY_STOPS = ['trackerBusy'];

/** 'retry' | 'action' for an error the drain caught (401 and the Import Gate are handled before this). */
export function classify(e) {
  if (e instanceof SyncStop) return RETRY_STOPS.includes(e.kind) ? 'retry' : 'action';
  const s = e && e.status;
  if (!s || s < 0) return 'retry';                                  // no signal, time-out, a crash part-way
  if (s === 408 || s === 425 || s === 429 || s >= 500) return 'retry';
  if (s === 403 && RATE_REASONS.includes(e.reason)) return 'retry';
  return 'action';                                                  // 400, 403, 404, 409, 412 …: waiting won't fix it
}
/** Backoff with jitter (half fixed, half random), or the server's Retry-After when that is longer. */
export const retryDelayMs = (attempts, retryAfterS = 0, random = Math.random) => { const b = backoffMs(attempts); return Math.max(Math.round(b / 2 + random() * b / 2), retryAfterS * 1000); };
/** The plain message for an op that needs the user. */
export function actionMessage(e) {
  if (e instanceof SyncStop) return e.message;
  if (e && e.status === 404) return 'Google could not find a file or folder this request uses. Ask JK to check it is still shared with you.';
  if (e && e.status === 403) return 'Google said no access. Ask JK to share it with you.';
  return `This change could not be sent (${(e && e.message) || 'error'}). Tap Try again after it is fixed, or ask JK.`;
}

/**
 * d = { outbox: { list(), remove(id), put(op) }, getReq(id), saveLocal(q), state: { get(id), put(id, st) },
 *       api, ss (fn or null), ssReady(), config, cfg, pilot, build, blob(id), now(), canEdit(fileId) }
 * Returns { sent, waiting, message, stopped, conflicts }.
 */
export async function drain(d) {
  const classes = flagOn(d.config, 'retryClasses'), force = !!d.force;
  const ops = (await d.outbox.list()).slice().sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  const out = { sent: 0, waiting: 0, message: '', stopped: '', conflicts: 0, smartsheet: '', needsAction: 0 };
  const t = d.now().getTime();
  const done = new Map(); // requestId -> result of this drain's reconcile ({failed} when it failed: one try per drain)
  let ss = d.ss;
  for (const op of ops) {
    if (classes && op.needsAction && !force) { out.waiting++; out.needsAction++; if (!out.message) out.message = op.lastError; continue; }
    if (op.nextAt && Date.parse(op.nextAt) > t && !(classes && force)) { out.waiting++; continue; }
    if (classes && done.get(op.requestId) && done.get(op.requestId).failed) { out.waiting++; continue; }
    try {
      if (op.requestId === 'library') { await syncLibraryOp(op, d); await d.outbox.remove(op.id); out.sent++; continue; }
      let r = done.get(op.requestId);
      if (!r) {
        const q = await d.getReq(op.requestId);
        if (!q) { await d.outbox.remove(op.id); continue; } // deleted on the phone
        r = await reconcileWithSmartsheetGuard(q, { ...d, ss }, e => { ss = null; out.smartsheet = e.status === 403 ? DENIED : (e.status === 0 || e.status === -1) ? e.message : 'Connect Smartsheet in Settings'; });
        done.set(op.requestId, r);
        out.conflicts += (r.conflicts || []).filter(c => !c.resolved).length;
      }
      if (r.waitingFor === 'smartsheet') { out.waiting++; if (op.attempts || op.lastError || op.needsAction) { op.lastError = ''; delete op.needsAction; await d.outbox.put(op); } continue; }
      await d.outbox.remove(op.id); out.sent++;
    } catch (e) {
      if (e instanceof SyncStop && e.kind === 'importGate') { out.waiting++; if (!out.message) out.message = e.message; continue; } // waits for the user; no retry loop
      if (e && e.status === 401 && !e.smartsheet) { out.stopped = 'signin'; out.message = 'Sign in to sync'; out.waiting += ops.length - out.sent - out.waiting; return out; }
      if (classes) {
        done.set(op.requestId, { failed: true });
        op.attempts = (op.attempts || 0) + 1; op.lastAt = new Date(t).toISOString(); op.lastWhere = (e && e.where) || ''; op.lastStatus = (e && e.status) || 0;
        const kind = classify(e);
        if (kind === 'action' || op.attempts >= MAX_ATTEMPTS) {
          op.needsAction = kind === 'action' ? 'action' : 'failed'; delete op.nextAt;
          op.lastError = kind === 'action' ? actionMessage(e) : `Tried ${op.attempts} times without success (${(e && e.message) || 'error'}). Tap Try again, or ask JK.`;
          out.needsAction++; out.message = op.lastError;
        } else {
          delete op.needsAction; op.lastError = (e && e.message) || String(e);
          op.nextAt = new Date(t + retryDelayMs(op.attempts, e && e.retryAfter, d.random)).toISOString();
          if (!out.message) out.message = 'Some changes did not go yet. They will try again.';
        }
        await d.outbox.put(op); out.waiting++;
        if (e instanceof SyncStop && (e.kind === 'access' || e.kind === 'template')) { out.stopped = e.kind; return out; }
        continue;
      }
      op.attempts = (op.attempts || 0) + 1; op.lastError = (e && e.message) || String(e);
      op.nextAt = new Date(t + backoffMs(op.attempts)).toISOString(); await d.outbox.put(op);
      out.waiting++;
      if (e instanceof SyncStop || (e && (e.status === 403 || e.status === 404))) out.message = e instanceof SyncStop ? e.message : 'Google said no access. Ask JK to share it with you.';
      else if (!out.message) out.message = 'Some changes did not go yet. They will try again.';
      if (e instanceof SyncStop && (e.kind === 'access' || e.kind === 'template')) { out.stopped = e.kind; return out; }
    }
  }
  if (!out.message) out.message = out.waiting ? (ss || !d.ssReady ? `${out.waiting} waiting – will retry` : `${out.waiting} waiting for Smartsheet`) : 'All sent';
  return out;
}

async function reconcileWithSmartsheetGuard(q, d, onDenied) {
  if (!d.ss) return reconcileRequest(q, d);
  const ss = async (...a) => {
    let r; try { r = await d.ss(...a); } catch (e) { if (e.status === 403 || e.status === 401 || e.status === 0 || e.status === -1) e.smartsheet = true; throw e; }
    if (!r.ok) throw new ApiError(`Smartsheet answered ${r.status}`, r.status, 'smartsheet', { retryAfter: retryAfterOf(r) });
    return r;
  };
  try { return await reconcileRequest(q, { ...d, ss }); }
  catch (e) {
    if (!e.smartsheet) throw e;
    onDenied(e);
    return reconcileRequest(q, { ...d, ss: null }); // Drive + tracker are already recorded as done: this only reports "waiting"
  }
}

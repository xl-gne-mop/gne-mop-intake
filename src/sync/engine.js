// The outbox drain (phase 6). Oldest op first. A request op triggers an idempotent reconcile of that request
// (src/sync/reconcile.js), so replaying ops, a duplicate op or a crash part-way never writes anything twice.
//   401 from Google          -> stop everything, "Sign in to sync" (ops stay)
//   Worker 403               -> Smartsheet stops ("Not on the access list – ask JK"); Drive + tracker still go
//   Smartsheet not connected -> Drive + tracker go; the op waits for Smartsheet
//   anything else            -> that op waits: 30 s × 2^attempts, at most 1 hour; other requests carry on
// Never retries in a loop: one try per op per drain.
import { reconcileRequest, SyncStop } from './reconcile.js';
import { syncLibraryOp } from './library.js';
import { DENIED } from '../auth/smartsheet.js';
import { ApiError } from './google-api.js';

export const backoffMs = attempts => Math.min(30000 * 2 ** Math.max(0, attempts - 1), 3600000);

/**
 * d = { outbox: { list(), remove(id), put(op) }, getReq(id), saveLocal(q), state: { get(id), put(id, st) },
 *       api, ss (fn or null), ssReady(), config, cfg, pilot, build, blob(id), now(), canEdit(fileId) }
 * Returns { sent, waiting, message, stopped, conflicts }.
 */
export async function drain(d) {
  const ops = (await d.outbox.list()).slice().sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  const out = { sent: 0, waiting: 0, message: '', stopped: '', conflicts: 0, smartsheet: '' };
  const t = d.now().getTime();
  const done = new Map(); // requestId -> result of this drain's reconcile
  let ss = d.ss;
  for (const op of ops) {
    if (op.nextAt && Date.parse(op.nextAt) > t) { out.waiting++; continue; }
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
      if (r.waitingFor === 'smartsheet') { out.waiting++; if (op.attempts || op.lastError) { op.lastError = ''; await d.outbox.put(op); } continue; }
      await d.outbox.remove(op.id); out.sent++;
    } catch (e) {
      if (e instanceof SyncStop && e.kind === 'importGate') { out.waiting++; if (!out.message) out.message = e.message; continue; } // waits for the user; no retry loop
      if (e && e.status === 401 && !e.smartsheet) { out.stopped = 'signin'; out.message = 'Sign in to sync'; out.waiting += ops.length - out.sent - out.waiting; return out; }
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
    if (!r.ok) throw new ApiError(`Smartsheet answered ${r.status}`, r.status, 'smartsheet');
    return r;
  };
  try { return await reconcileRequest(q, { ...d, ss }); }
  catch (e) {
    if (!e.smartsheet) throw e;
    onDenied(e);
    return reconcileRequest(q, { ...d, ss: null }); // Drive + tracker are already recorded as done: this only reports "waiting"
  }
}

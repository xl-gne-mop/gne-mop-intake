// Requests are saved locally first; each save also queues an outbox op in the same transaction,
// so a request and its pending sync can never drift apart (even if the phone dies mid-save).
import { openStore } from './db.js';
import { makeOp, putOpInTx } from './outbox.js';
import { newId } from '../util/ids.js';
import { StaleError } from './errors.js';

/** This window / tab. A save is refused when another tab saved the same request after this tab read it. */
export const TAB_ID = newId('tab');

export function newRequest(fields = {}) {
  const now = new Date().toISOString();
  return { id: newId('r'), project: '', mopNo: 0, rev: 0, status: 'Draft', stage: 0, files: [], meta: {}, sub: null, history: [], createdAt: now, updatedAt: now, record: { title: '' }, ...fields };
}

/**
 * Save a request and queue its sync. `what` is the history line ("Draft saved", "Submitted MOP-008 rev 0" ...).
 * kind defaults to 'request.save' (the whole request file); later phases pass stage ops ('stage.advance' ...).
 */
export async function saveRequest(q, { what = '', kind = 'request.save', payload = null } = {}) {
  const db = await openStore();
  q.updatedAt = new Date().toISOString();
  if (what) { q.history = [...(q.history || []), { at: q.updatedAt, what }].slice(-80); }
  const tx = db.transaction(['requests', 'outbox'], 'readwrite');
  // Two tabs / windows on the same request: localRev counts saves; lastTab says which tab saved last. Saves from
  // this tab never block each other (several copies of a request can be open on one page); only a newer save from
  // another tab does, and then nothing is overwritten.
  const cur = await tx.objectStore('requests').get(q.id);
  if (cur && cur.lastTab && cur.lastTab !== TAB_ID && (cur.localRev || 0) > (q.localRev || 0)) { tx.abort(); await tx.done.catch(() => {}); throw new StaleError(); }
  q.localRev = Math.max((cur && cur.localRev) || 0, q.localRev || 0) + 1; q.lastTab = TAB_ID;
  await tx.objectStore('requests').put(q);
  const op = await putOpInTx(tx, makeOp({ requestId: q.id, stage: q.stage || 0, rev: q.rev || 0, kind, payload }));
  await tx.done;
  return { request: q, op };
}

export async function getRequest(id) { const db = await openStore(); return db.get('requests', id); }
export async function listRequests() { const db = await openStore(); return (await db.getAll('requests')).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')); }
export { newId };

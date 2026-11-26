// Requests are saved locally first; each save also queues an outbox op in the same transaction,
// so a request and its pending sync can never drift apart (even if the phone dies mid-save).
import { openStore } from './db.js';
import { makeOp, putOpInTx } from './outbox.js';
import { newId } from '../util/ids.js';

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
  await tx.objectStore('requests').put(q);
  const op = await putOpInTx(tx, makeOp({ requestId: q.id, stage: q.stage || 0, rev: q.rev || 0, kind, payload }));
  await tx.done;
  return { request: q, op };
}

export async function getRequest(id) { const db = await openStore(); return db.get('requests', id); }
export async function listRequests() { const db = await openStore(); return (await db.getAll('requests')).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')); }
export { newId };

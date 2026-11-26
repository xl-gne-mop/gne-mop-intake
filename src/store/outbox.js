// The outbox: one op per user action, drained in order by the sync engine (phase 6).
// Idempotency key = requestId|stage|rev|kind, so the same action is never queued (or sent) twice.
import { openStore } from './db.js';
import { newId } from '../util/ids.js';

export const opKey = ({ requestId, stage, rev, kind }) => `${requestId}|${stage}|${rev}|${kind}`;

export function makeOp({ requestId, stage = 0, rev = 0, kind, payload = null }) {
  if (!requestId || !kind) throw new Error('outbox op needs requestId and kind');
  const op = { id: newId('op_'), requestId, stage, rev, kind, payload, createdAt: new Date().toISOString(), attempts: 0 };
  op.key = opKey(op);
  return op;
}

/** Add an op inside an open transaction that includes 'outbox'. Replaces a waiting op with the same key (latest payload wins). */
export async function putOpInTx(tx, op) {
  const store = tx.objectStore('outbox');
  const existing = await store.index('key').get(op.key);
  if (existing) { op.id = existing.id; op.createdAt = existing.createdAt; }
  await store.put(op);
  return op;
}

export async function listOutbox() { const db = await openStore(); return db.getAllFromIndex('outbox', 'createdAt'); }
export async function countOutbox() { const db = await openStore(); return db.count('outbox'); }
export async function removeOp(id) { const db = await openStore(); return db.delete('outbox', id); }

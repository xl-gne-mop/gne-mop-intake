// saveReq (r4:224-227) on top of IndexedDB: same history rules (by uid, last 80), then the local save +
// outbox op happen in one transaction (src/store/requests.js). Never needs a network.
import { S, clone } from './state.js';
import { normReq } from './record.js';
import { saveRequest } from '../store/requests.js';
import { putBlob } from '../store/attachments.js';
import { newId } from '../util/ids.js';
import { upgradeRequest } from './schema.js';
import { storageMessage } from '../store/errors.js';

export async function saveReq(q, what, { kind = 'request.save', payload = null } = {}) {
  q.updatedAt = new Date().toISOString(); if (!q.createdAt) { q.createdAt = q.updatedAt; q.createdBy = S.uid || ''; }
  if (what) q.history.push({ at: q.updatedAt, by: S.uid || '', what }); if (q.history.length > 80) q.history = q.history.slice(-80);
  // Audit (schema v2): every saved change with who / when / stage / revision, never trimmed (history keeps 80).
  upgradeRequest(q); if (what) q.meta.audit.push({ id: newId('e'), at: q.updatedAt, by: S.uid || '', what, stage: q.stage || 0, rev: q.rev || 0, status: q.status || '' });
  S.reqs[q.id] = normReq(clone(q));
  try {
    const { request } = await saveRequest(clone(q), { kind, payload });
    q.localRev = request.localRev; q.lastTab = request.lastTab; // so this tab's next save of the same object is not "stale"
    if (S.reqs[q.id]) { S.reqs[q.id].localRev = request.localRev; S.reqs[q.id].lastTab = request.lastTab; }
    if (S.hooks.broadcast) S.hooks.broadcast(q.id);
    if (S.hooks.saved) S.hooks.saved(); return true;
  } catch (e) { S.note = storageMessage(e); if (S.hooks.render) S.hooks.render(); return false; }
}

/** Replaces the reference's shared asset store: the Blob goes into IndexedDB; returns {id, url} like assets.upload. */
export async function uploadBlob(blob, { type, requestId = '', name = '' } = {}) {
  const b = type && blob.type !== type ? new Blob([blob], { type }) : blob;
  let a; try { a = await putBlob(b, { requestId, name }); } catch (e) { throw new Error(storageMessage(e)); }
  const url = URL.createObjectURL(b); S.blobUrls[a.id] = url; S.blobs[a.id] = b;
  return { id: a.id, url, sizeBytes: b.size, contentType: b.type };
}

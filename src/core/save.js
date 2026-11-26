// saveReq (r4:224-227) on top of IndexedDB: same history rules (by uid, last 80), then the local save +
// outbox op happen in one transaction (src/store/requests.js). Never needs a network.
import { S, clone } from './state.js';
import { normReq } from './record.js';
import { saveRequest } from '../store/requests.js';
import { putBlob } from '../store/attachments.js';

export async function saveReq(q, what, { kind = 'request.save', payload = null } = {}) {
  q.updatedAt = new Date().toISOString(); if (!q.createdAt) { q.createdAt = q.updatedAt; q.createdBy = S.uid || ''; }
  if (what) q.history.push({ at: q.updatedAt, by: S.uid || '', what }); if (q.history.length > 80) q.history = q.history.slice(-80);
  S.reqs[q.id] = normReq(clone(q));
  try { await saveRequest(clone(q), { kind, payload }); if (S.hooks.saved) S.hooks.saved(); return true; } catch (e) { S.note = 'Could not save on this phone: ' + (e && e.message || e); if (S.hooks.render) S.hooks.render(); return false; }
}

/** Replaces the reference's shared asset store: the Blob goes into IndexedDB; returns {id, url} like assets.upload. */
export async function uploadBlob(blob, { type, requestId = '', name = '' } = {}) {
  const b = type && blob.type !== type ? new Blob([blob], { type }) : blob;
  const a = await putBlob(b, { requestId, name });
  const url = URL.createObjectURL(b); S.blobUrls[a.id] = url; S.blobs[a.id] = b;
  return { id: a.id, url, sizeBytes: b.size, contentType: b.type };
}

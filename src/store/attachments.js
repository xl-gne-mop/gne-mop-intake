// Photos, PDFs, signatures and mark-ups are Blobs in IndexedDB (never only in memory).
import { openStore } from './db.js';
import { newId } from '../util/ids.js';

export async function putBlob(blob, { requestId, name = '', kind = '', cat = '' } = {}) {
  const db = await openStore();
  const rec = { id: newId('a'), requestId, name, kind: kind || (/pdf/.test(blob.type) ? 'pdf' : 'image'), cat, type: blob.type, size: blob.size, createdAt: new Date().toISOString(), blob };
  await db.put('attachments', rec);
  return rec;
}
export async function getAttachment(id) { const db = await openStore(); return db.get('attachments', id); }
export async function attachmentsFor(requestId) { const db = await openStore(); return db.getAllFromIndex('attachments', 'requestId', requestId); }

const urls = new Map();
/** Object URL for an attachment (cached per page; revoked by revokeAll on navigation). */
export async function attachmentUrl(id) {
  if (urls.has(id)) return urls.get(id);
  const a = await getAttachment(id); if (!a) return '';
  const u = URL.createObjectURL(a.blob); urls.set(id, u); return u;
}
export function revokeAll() { for (const u of urls.values()) URL.revokeObjectURL(u); urls.clear(); }

// "Export backup" / "Import backup": a .zip of every local request, attachment and waiting outbox item.
// Never includes syncState (sign-in tokens) or the cached library / template / lists (those reload from Drive).
import { openStore } from './db.js';

export const BACKUP_SCHEMA = 'gne-mop-backup';
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf', 'image/webp': 'webp', 'image/heic': 'heic' };

async function jszip() {
  if (!globalThis.JSZip) await import('../../vendor/jszip/jszip.min.js');
  return globalThis.JSZip;
}

/** Build the backup zip. Returns { blob, name, counts }. */
export async function exportBackup() {
  const JSZip = await jszip(), db = await openStore(), zip = new JSZip();
  const [requests, outbox, settings, atts] = await Promise.all(['requests', 'outbox', 'settings', 'attachments'].map(s => db.getAll(s)));
  const attachments = atts.map(({ blob, ...meta }) => ({ ...meta, file: `attachments/${meta.id}.${EXT[meta.type] || 'bin'}` }));
  atts.forEach((a, i) => zip.file(attachments[i].file, a.blob));
  const exportedAt = new Date().toISOString();
  zip.file('backup.json', JSON.stringify({ schema: BACKUP_SCHEMA, version: 1, exportedAt, requests, outbox, settings, attachments }, null, 1));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const d = new Date(exportedAt), p = n => String(n).padStart(2, '0');
  return { blob, name: `MOP Intake backup ${p(d.getMonth() + 1)}-${p(d.getDate())}-${String(d.getFullYear()).slice(2)}.zip`, counts: { requests: requests.length, attachments: atts.length, outbox: outbox.length } };
}

/**
 * Restore a backup by merging (JK decision S3): add what is missing, keep the newer request when both have it
 * (by updatedAt), never delete anything on the phone, and skip outbox ops whose idempotency key is already queued.
 */
export async function importBackup(file) {
  const JSZip = await jszip();
  let zip;
  try { zip = await JSZip.loadAsync(file); } catch { throw new Error('That file is not a MOP Intake backup (.zip).'); }
  const meta = zip.file('backup.json');
  if (!meta) throw new Error('That file is not a MOP Intake backup (backup.json is missing).');
  let data;
  try { data = JSON.parse(await meta.async('string')); } catch { throw new Error('That backup file is damaged (backup.json can\'t be read).'); }
  if (!data || data.schema !== BACKUP_SCHEMA) throw new Error('That file is not a MOP Intake backup.');
  if (Number(data.version) > 1) throw new Error('That backup is from a newer version of the app. Update the app, then import it again.');
  // Only well-formed records go in: one bad row must not abort the whole restore (IndexedDB rejects missing keys).
  const list = v => (Array.isArray(v) ? v : []);
  const hasId = (x, k = 'id') => x && typeof x === 'object' && typeof x[k] === 'string' && x[k].length > 0 && x[k].length <= 200;
  data.requests = list(data.requests).filter(q => hasId(q));
  data.attachments = list(data.attachments).filter(a => hasId(a) && typeof a.file === 'string' && a.file.startsWith('attachments/'));
  data.outbox = list(data.outbox).filter(op => hasId(op) && hasId(op, 'key'));
  data.settings = list(data.settings).filter(x => hasId(x, 'key'));
  const blobs = new Map();
  for (const a of data.attachments) {
    const f = zip.file(a.file);
    if (f) blobs.set(a.id, new Blob([await f.async('uint8array')], { type: a.type || 'application/octet-stream' }));
  }
  const db = await openStore();
  const tx = db.transaction(['requests', 'attachments', 'outbox', 'settings'], 'readwrite');
  const n = { requestsAdded: 0, requestsUpdated: 0, requestsKept: 0, attachmentsAdded: 0, outboxAdded: 0 };
  for (const q of data.requests) {
    const cur = await tx.objectStore('requests').get(q.id);
    if (!cur) { await tx.objectStore('requests').put(q); n.requestsAdded++; }
    else if ((q.updatedAt || '') > (cur.updatedAt || '')) { await tx.objectStore('requests').put(q); n.requestsUpdated++; }
    else n.requestsKept++;
  }
  for (const a of data.attachments) {
    if (await tx.objectStore('attachments').get(a.id)) continue;
    const blob = blobs.get(a.id); if (!blob) continue;
    const { file, ...rec } = a; await tx.objectStore('attachments').put({ ...rec, blob }); n.attachmentsAdded++;
  }
  for (const op of data.outbox) {
    if (await tx.objectStore('outbox').index('key').get(op.key)) continue;
    if (await tx.objectStore('outbox').get(op.id)) continue;
    await tx.objectStore('outbox').put(op); n.outboxAdded++;
  }
  for (const s of data.settings) if (!(await tx.objectStore('settings').get(s.key))) await tx.objectStore('settings').put(s);
  await tx.done;
  return n;
}

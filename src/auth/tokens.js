// Token storage: IndexedDB syncState ({key, value}). Never in backups (backup.js skips syncState); never logged.
import { openStore } from '../store/db.js';
export const idbTokenStore = {
  async get(key) { const db = await openStore(); const r = await db.get('syncState', key); return r ? r.value : null; },
  async put(key, value) { const db = await openStore(); await db.put('syncState', { key, value }); },
  async delete(key) { const db = await openStore(); await db.delete('syncState', key); }
};
/** In-memory store with the same shape (unit tests). */
export function memTokenStore() { const m = new Map(); return { m, get: async k => (m.has(k) ? structuredClone(m.get(k)) : null), put: async (k, v) => { m.set(k, structuredClone(v)); }, delete: async k => { m.delete(k); } }; }
export function randomState() { const b = new Uint8Array(32); crypto.getRandomValues(b); return [...b].map(x => x.toString(16).padStart(2, '0')).join(''); }

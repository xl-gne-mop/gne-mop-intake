// IndexedDB for everything the app keeps on the phone. Every user action is saved here first.
import { openDB } from '../../vendor/idb/index.js';

export const DB_NAME = 'gne-mop';
export const DB_VERSION = 1;
export const STORES = ['requests', 'attachments', 'library', 'config', 'outbox', 'syncState', 'settings'];

let dbp = null;

export function openStore(name = DB_NAME) {
  if (dbp && name === DB_NAME) return dbp;
  const p = openDB(name, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('requests')) db.createObjectStore('requests', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
      if (!db.objectStoreNames.contains('attachments')) db.createObjectStore('attachments', { keyPath: 'id' }).createIndex('requestId', 'requestId');
      if (!db.objectStoreNames.contains('library')) db.createObjectStore('library', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('config')) db.createObjectStore('config', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('outbox')) {
        const o = db.createObjectStore('outbox', { keyPath: 'id' });
        o.createIndex('createdAt', 'createdAt');
        o.createIndex('key', 'key', { unique: true });
        o.createIndex('requestId', 'requestId');
      }
      if (!db.objectStoreNames.contains('syncState')) db.createObjectStore('syncState', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    },
    blocked() { /* another tab has an older version open; it reloads on versionchange */ },
    blocking() { p.then(db => db.close()); }
  });
  if (name === DB_NAME) dbp = p;
  return p;
}

/** Close and forget the connection (used by sign-out wipe and by tests). */
export async function closeStore() { if (dbp) { (await dbp).close(); dbp = null; } }

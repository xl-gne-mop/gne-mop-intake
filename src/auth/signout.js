// Sign out: if anything is still waiting to sync, the user must first export a backup or confirm.
// Then: revoke the Google token, clear the Smartsheet tokens, delete the local database.
import { DB_NAME, closeStore } from '../store/db.js';

/** Returns {needsConfirm, waiting} when unsynced items exist and `confirmed` isn't set; otherwise signs out. */
export async function signOut({ google, smartsheet, countOutbox, confirmed = false, deleteDb = defaultDeleteDb }) {
  const waiting = await countOutbox();
  if (waiting > 0 && !confirmed) return { needsConfirm: true, waiting };
  await google.revoke();
  await smartsheet.clear();
  await deleteDb();
  return { signedOut: true, waiting };
}

async function defaultDeleteDb() {
  await closeStore();
  await new Promise((ok, no) => { const r = indexedDB.deleteDatabase(DB_NAME); r.onsuccess = () => ok(); r.onerror = () => no(r.error); r.onblocked = () => ok(); });
}

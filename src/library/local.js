// Library entries made on this phone ("Add to library" from a request, or an editor's MOP import, r4:664).
// They are kept in the IndexedDB 'library' store (kind 'mop') and offered at intake as past MOPs.
// Phase 6 sends them to the Drive "Library inbox" folder; phase 4 adds the publish flow.
import { S, clone, toast } from '../core/state.js';
import { openStore } from '../store/db.js';

export async function loadLib() { const db = await openStore(); S.lib = (await db.getAll('library')).filter(e => e.id !== 'current').map(e => ({ ...e, kind: e.kind || 'mop' })); return S.lib; }
export async function saveLib(e) {
  try { const db = await openStore(); await db.put('library', clone({ ...e, kind: e.kind || 'mop', savedAt: new Date().toISOString(), by: S.uid || '' })); await loadLib(); toast('Added to the library: ' + e.name); }
  catch { toast('Could not save to the library on this phone.'); }
}
export async function removeLib(id) { const db = await openStore(); await db.delete('library', id); await loadLib(); }

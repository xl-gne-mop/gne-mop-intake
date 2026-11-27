// The same request open in two windows or tabs (desktop; rare on a phone). Each save tells the other tabs
// (BroadcastChannel); a tab that is not editing that request reloads it quietly, a tab that IS editing it shows a
// banner. The save itself is protected in src/store/requests.js (a stale tab's save is refused, never overwrites).
import { S } from '../core/state.js';
import { normReq } from '../core/record.js';
import { getRequest, TAB_ID } from '../store/requests.js';
import { showBanner } from './banner.js';
import { storageEstimate } from '../pwa/persist.js';

export const STALE_TEXT = 'This request was just changed in another window. Changes here will not save – tap to load the latest.';

export function wireTabs({ render }) {
  if (typeof BroadcastChannel === 'undefined') return;
  let ch; try { ch = new BroadcastChannel('gne-mop-intake'); } catch { return; }
  S.hooks.broadcast = id => { try { ch.postMessage({ type: 'saved', id, tab: TAB_ID }); } catch { /* closed */ } };
  ch.onmessage = async e => {
    const m = e.data || {}; if (m.type !== 'saved' || m.tab === TAB_ID || !m.id) return;
    if (S.view === 'edit' && S.draft && S.draft.id === m.id) { showBanner('stale', STALE_TEXT, () => location.reload(), 'warn'); return; }
    const q = await getRequest(m.id); if (q) S.reqs[m.id] = normReq(q); else delete S.reqs[m.id];
    if (S.view !== 'edit') render();
  };
}

/** Warn once at start when the app's storage on this phone is over 80 % full. */
export async function warnLowSpace() {
  try {
    const est = await storageEstimate(); if (!est || !est.quota) return;
    const pct = Math.round((est.usage / est.quota) * 100);
    if (pct >= 80) showBanner('space', `Storage for this app is ${pct}% full on this phone. Export a backup (Settings) and free up space, or new photos may not save.`, null, 'warn');
  } catch { /* no estimate on this browser */ }
}

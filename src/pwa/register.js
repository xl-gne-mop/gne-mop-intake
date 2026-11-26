// Service worker registration and the "Update available – tap to reload" banner.
import { showBanner } from '../ui/banner.js';

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
  // Reload only after the user taps the banner (the first install also changes the controller, via clients.claim).
  let userAsked = false;
  const offer = w => showBanner('update', 'Update available – tap to reload', () => { userAsked = true; w.postMessage({ type: 'SKIP_WAITING' }); });
  if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const w = reg.installing; if (!w) return;
    w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
  });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!userAsked || reloading) return; reloading = true; location.reload(); });
  // Background Sync is a bonus where it exists (Android/Chromium); the sync engine never depends on it.
  navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'SYNC_NOW' && onSyncMessage) onSyncMessage(); });
  return reg;
}

let onSyncMessage = null;
/** The open app syncs when the browser fires Background Sync (the worker only passes the message on). */
export function onBackgroundSync(fn) { onSyncMessage = fn; }
/** After a local save: ask for a Background Sync where the browser has it. Silent no-op elsewhere (iPhone). */
export async function askBackgroundSync() {
  try { const reg = await navigator.serviceWorker?.ready; if (reg && reg.sync) await reg.sync.register('mop-outbox'); } catch { /* not allowed here: the app still syncs when opened */ }
}

// Boot: iOS install gate first, then local storage, service worker and the app. Nothing here needs a network.
import { needsInstallGate, renderInstallGate } from './pwa/installGate.js';
import { openStore } from './store/db.js';
import { registerServiceWorker } from './pwa/register.js';
import { startApp } from './ui/app.js';

// Publish the sticky header's height as --hdr so other sticky bars (import review) stop below it, not under it.
function trackHeader() {
  const h = document.querySelector('header.top'); if (!h || !('ResizeObserver' in window)) return;
  new ResizeObserver(() => document.documentElement.style.setProperty('--hdr', h.offsetHeight + 'px')).observe(h);
}

async function boot() {
  if (needsInstallGate()) { document.querySelector('header.top')?.remove(); renderInstallGate(document.getElementById('app')); return; }
  trackHeader();
  await openStore();
  registerServiceWorker().catch(() => {});
  // navigator.storage.persist() is asked right after sign-in (src/sync/status.js afterSignIn).
  await startApp();
}
boot().catch(err => { document.getElementById('app').innerHTML = '<p class="empty">The app could not start. Close it and open it again.</p>'; console.error(err); });

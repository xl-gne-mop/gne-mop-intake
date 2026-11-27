// GNE MOP Intake service worker (hand-written). The build fills CACHE and PRECACHE.
// - App shell + vendor files: precached, served cache-first (the app works with no signal).
// - Google, Smartsheet and Worker calls: other origins, never intercepted (network-only).
const CACHE = 'mop-shell-80df2ddd065c1021';
const PRECACHE = [
 "./",
 "./config.js",
 "./help/help.css",
 "./help/img/01-install.png",
 "./help/img/02-signin.png",
 "./help/img/03-new.png",
 "./help/img/04-describe.png",
 "./help/img/05-markup.png",
 "./help/img/06-dontknow.png",
 "./help/img/07-review.png",
 "./help/img/08-waiting.png",
 "./help/index.html",
 "./icons/apple-touch-icon.png",
 "./icons/icon-192.png",
 "./icons/icon-512.png",
 "./icons/maskable-512.png",
 "./index.html",
 "./manifest.webmanifest",
 "./src/approve/signatures.js",
 "./src/attach/markup.js",
 "./src/auth/google.js",
 "./src/auth/identity.js",
 "./src/auth/roles.js",
 "./src/auth/signout.js",
 "./src/auth/smartsheet.js",
 "./src/auth/tokens.js",
 "./src/config/companies.js",
 "./src/config/library.js",
 "./src/config/lists.js",
 "./src/config/loaders.js",
 "./src/config/templates.js",
 "./src/core/directory.js",
 "./src/core/record.js",
 "./src/core/save.js",
 "./src/core/state.js",
 "./src/dictation/guide.js",
 "./src/dictation/parse.js",
 "./src/dictation/speech.js",
 "./src/export/outputs.js",
 "./src/import/anymop/adapters/legacy.js",
 "./src/import/anymop/adapters/mail.js",
 "./src/import/anymop/adapters/office.js",
 "./src/import/anymop/adapters/pdf.js",
 "./src/import/anymop/apply.js",
 "./src/import/anymop/cfb.js",
 "./src/import/anymop/client.js",
 "./src/import/anymop/docmodel.js",
 "./src/import/anymop/extract.js",
 "./src/import/anymop/fields.js",
 "./src/import/anymop/guard.js",
 "./src/import/anymop/mapper.js",
 "./src/import/anymop/ocr.js",
 "./src/import/anymop/pilot.js",
 "./src/import/anymop/r4.js",
 "./src/import/anymop/synonyms.js",
 "./src/import/anymop/worker.js",
 "./src/import/anymop/xml.js",
 "./src/import/anymop/zip.js",
 "./src/import/docx.js",
 "./src/import/impacts.js",
 "./src/import/read.js",
 "./src/lib/library.js",
 "./src/library/editor.js",
 "./src/library/local.js",
 "./src/library/publish.js",
 "./src/library/suggest.js",
 "./src/main.js",
 "./src/model/stages.js",
 "./src/mop/fillMopV2.js",
 "./src/pilot/log.js",
 "./src/pwa/installGate.js",
 "./src/pwa/persist.js",
 "./src/pwa/register.js",
 "./src/rules/closeOut.js",
 "./src/rules/dontKnow.js",
 "./src/rules/failureModes.js",
 "./src/rules/fixes.js",
 "./src/rules/permits.js",
 "./src/rules/review-settings.js",
 "./src/rules/review.js",
 "./src/rules/tier.js",
 "./src/store/attachments.js",
 "./src/store/backup.js",
 "./src/store/db.js",
 "./src/store/outbox.js",
 "./src/store/requests.js",
 "./src/store/settings.js",
 "./src/sync/engine.js",
 "./src/sync/google-api.js",
 "./src/sync/library.js",
 "./src/sync/merge.js",
 "./src/sync/names.js",
 "./src/sync/preflight.js",
 "./src/sync/reconcile.js",
 "./src/sync/remote.js",
 "./src/sync/stageMap.js",
 "./src/sync/status.js",
 "./src/sync/wire.js",
 "./src/ui/app.css",
 "./src/ui/app.js",
 "./src/ui/autocomplete.js",
 "./src/ui/backupBox.js",
 "./src/ui/banner.js",
 "./src/ui/board.js",
 "./src/ui/companies.js",
 "./src/ui/conflicts.js",
 "./src/ui/detail.js",
 "./src/ui/dom.js",
 "./src/ui/editHelpers.js",
 "./src/ui/events.js",
 "./src/ui/header.js",
 "./src/ui/help.js",
 "./src/ui/html.js",
 "./src/ui/importAny.js",
 "./src/ui/logs.js",
 "./src/ui/screens.js",
 "./src/ui/settings.js",
 "./src/ui/stageForm.js",
 "./src/ui/syncbar.js",
 "./src/util/dates.js",
 "./src/util/download.js",
 "./src/util/holidays.js",
 "./src/util/ids.js",
 "./src/util/net.js",
 "./src/vendor-ref/imp.js",
 "./src/vendor-ref/sri.js",
 "./vendor/idb/index.js",
 "./vendor/jszip/jszip.min.js",
 "./vendor/pdfjs/pdf.min.js",
 "./vendor/pdfjs/pdf.worker.min.js"
];
// The scan reader (vendor/ocr/) is downloaded on request into its own cache; app updates never delete it.
const OCR_CACHE = 'mop-ocr-v1';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE.map(p => new Request(p, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('mop-shell-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });
// Background Sync (bonus, Chromium only): wake the open app so it drains its outbox with the user's own token.
self.addEventListener('sync', e => { if (e.tag === 'mop-outbox') e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => cs.forEach(c => c.postMessage({ type: 'SYNC_NOW' })))); });

// Android share target ("Share → MOP Intake"): keep the shared files on the phone, then open "Start from an existing MOP".
const SHARE_CACHE = 'mop-share';
async function receiveShare(req) {
  const form = await req.formData(), files = form.getAll('file').filter(f => f && f.size).slice(0, 10), c = await caches.open(SHARE_CACHE);
  for (const k of await c.keys()) await c.delete(k);
  let i = 0; for (const f of files) await c.put(`./shared/${i++}`, new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream', 'x-name': encodeURIComponent(f.name || 'file') } }));
  return Response.redirect('./#import-shared', 303);
}

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method === 'POST' && url.origin === self.location.origin && url.pathname.endsWith('/share-target')) { e.respondWith(receiveShare(req)); return; }
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // network-only for every API
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Pages: the exact cached page (app shell, help guide); unknown paths get the app shell.
    if (req.mode === 'navigate') return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('./index.html')) || fetch(req);
    const hit = (await cache.match(req, { ignoreSearch: true })) || (await caches.match(req, { ignoreSearch: true, cacheName: OCR_CACHE }));
    return hit || fetch(req);
  })());
});

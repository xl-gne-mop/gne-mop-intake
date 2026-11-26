// App start and render (r4:332-335, 775-792 adapted): everything loads from the phone first.
import { R, S, $, esc, render as _render } from '../core/state.js';
import { normReq } from '../core/record.js';
import { vBoard } from './board.js';
import { vEdit } from './screens.js';
import { vDetail } from './detail.js';
import { vLogs } from './logs.js';
import { vSettings } from './settings.js';
import { renderBackup } from './backupBox.js';
import { route, wireEvents } from './events.js';
import { refreshWaiting, refreshNet } from './header.js';
import { rebuildSigs } from '../approve/signatures.js';
import { initMarkup } from '../attach/markup.js';
import { loadLib } from '../library/local.js';
import { openStore } from '../store/db.js';
import { listRequests } from '../store/requests.js';
import { getSetting } from '../store/settings.js';
import { getIdentity } from '../auth/identity.js';
import { isEditor } from '../auth/roles.js';
import { idbCache, loadAllConfig } from '../config/loaders.js';
import { cfgFromLists } from '../config/lists.js';
import { tplFromTemplateJson } from '../config/templates.js';
import { libraryEntries } from '../config/library.js';
import { speechShim } from '../dictation/speech.js';
import { loadSuggestions } from '../library/suggest.js';
import { loadPilot, startPilotClock } from '../pilot/log.js';
import { vHelp } from './help.js';
import { showBanner, hideBanner } from './banner.js';
import { createSession } from '../sync/status.js';
import { renderSyncBar, wireSyncBar } from './syncbar.js';
import { createDrain, listConflicts, createRemote } from '../sync/wire.js';
import { askBackgroundSync, onBackgroundSync } from '../pwa/register.js';

const C = globalThis.MOP_CONFIG || {};

function render() {
  const v = S.view === 'edit' && !S.reqs[S.draft?.id] ? 'new' : S.view;
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.v === v));
  $('#who').textContent = (S.meName || S.uid || '') + (S.canEdit ? ' · editor' : '');
  const note = (S.configMsg ? `<div class="note info">${esc(S.configMsg)}</div>` : '') + (S.note ? `<div class="note">${esc(S.note)}</div>` : '');
  document.body.classList.toggle('big', !!S.pilotOn);
  if (S.pilotOn) showBanner('pilot', 'PILOT – requests sync to the pilot tracker and sheet', null, 'warn'); else hideBanner('pilot');
  $('#app').innerHTML = note + ({ board: vBoard, edit: vEdit, detail: vDetail, logs: vLogs, settings: vSettings, help: vHelp }[S.view] || vBoard)();
  const bb = $('#backupbox'); if (bb) renderBackup(bb);
}

/** Load the cached Drive config (library, template, lists). getToken comes from sign-in (phase 5). */
export async function applyConfig({ getToken = () => null, fetch = globalThis.fetch } = {}) {
  const r = await loadAllConfig({ ids: C.CONFIG_FILES || {}, getToken, fetch, cache: idbCache(openStore) });
  const folderUrl = C.DRIVE_ROOT_FOLDER_ID ? `https://drive.google.com/drive/folders/${C.DRIVE_ROOT_FOLDER_ID}` : '';
  if (r.lists) S.cfg = cfgFromLists(r.lists.data, { defaultRules: R.DEFAULT_SETTINGS, folderUrl });
  if (r.template) S.tpl = tplFromTemplateJson(r.template.data);
  if (r.library) { S.libraryFile = r.library.data; S.library = libraryEntries(r.library.data); }
  const missing = !r.lists || !r.template || !r.library;
  S.configMsg = missing ? 'Sign in to load the library and MOP template. You can still start requests and take photos.' : r.messages.join(' · ');
  const logo = document.getElementById('logo'); if (logo && S.tpl.logo) { logo.src = 'data:image/png;base64,' + S.tpl.logo; logo.hidden = false; }
  return r;
}

export async function loadRequests() {
  const db = await openStore();
  for (const a of await db.getAll('attachments')) { S.blobs[a.id] = a.blob; if (!S.blobUrls[a.id]) S.blobUrls[a.id] = URL.createObjectURL(a.blob); }
  S.reqs = {}; for (const q of await listRequests()) S.reqs[q.id] = normReq(q);
  rebuildSigs();
}

export async function startApp() {
  S.hooks.render = render;
  S.hooks.reloadData = async () => { await loadRequests(); await loadLib(); };
  // Rebuild 4 re-rendered on every shared-store change (soft()); here every local save does the same.
  // Field saves on the detail screen set S.quiet: they save without a redraw, so a tap that lands at that moment
  // is not lost on a replaced button.
  S.hooks.saved = () => { rebuildSigs(); refreshWaiting(); askBackgroundSync(); if (S.view !== 'edit' && !S.quiet) render(); };
  await applyConfig();
  const me = await getIdentity();
  if (me) { S.uid = me.email; S.meName = me.name; S.canEdit = isEditor(me.email, (S.cfg && S.cfg.editors) || []); if (me.name) S.names[me.email] = me.name; }
  S.me = await getSetting('me', {}); S.crew = await getSetting('crew', []);
  await loadPilot(S.cfg && S.cfg.pilotDefault);
  // Web Speech dictation where the browser has it (r5:1066-1070); otherwise the phone keyboard's mic.
  S.dict = speechShim();
  if (S.dict) {
    S.dict.onFinal(({ text }) => { const el = S.dictEl; if (!el || !el.isConnected) return; el.value = el.value ? el.value + text : text.trimStart(); el.dispatchEvent(new Event('input', { bubbles: true })); });
    S.dict.onState(({ state }) => { S.dictState = state; document.querySelectorAll('.mic').forEach(m => m.classList.toggle('live', state !== 'idle' && S.dictEl === m.parentElement.querySelector('textarea'))); });
  }
  await loadSuggestions();
  await loadRequests(); await loadLib();
  S.ready = true;
  // Table cells get their column name for the stacked phone layout (r4:136).
  new MutationObserver(() => { for (const c of document.querySelectorAll('.stack td:not([data-l])')) { let i = 0, p = c; while ((p = p.previousElementSibling)) i += p.colSpan; c.dataset.l = c.closest('table').rows[0].cells[i]?.textContent || ''; } }).observe(document.getElementById('app'), { childList: true, subtree: true });
  window.addEventListener('online', refreshNet); window.addEventListener('offline', refreshNet); refreshNet();
  document.getElementById('app').addEventListener('submit', e => e.preventDefault());
  // Sign-in: finish any redirect before the router; resume the saved session after the first render.
  let session;
  const drainNow = createDrain({ getToken: () => session.google.getToken() });
  session = createSession({ hooks: {
    drain: async a => { const r = await drainNow(a); await refreshWaiting(); return r; },
    changed: () => { renderSyncBar(); if (S.view !== 'edit') render(); },
    loadConfig: getToken => applyConfig({ getToken }),
    persistWarning: show => show ? showBanner('persist', 'This phone may clear saved requests when space is low. Export a backup in Settings.', null, 'warn') : hideBanner('persist')
  } });
  S.session = session; S.conflicts = await listConflicts();
  S.remoteApi = createRemote({ getToken: () => session.google.getToken(), smartsheet: session.smartsheet });
  await session.handleRedirects();
  wireSyncBar(session); wireEvents(); initMarkup(); startPilotClock(); await refreshWaiting(); route(); renderSyncBar();
  session.resume();
  // Sync triggers: back online, back to the app. Background Sync is only a bonus where the browser has it.
  window.addEventListener('online', () => session.syncNow());
  onBackgroundSync(() => session.syncNow());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') session.syncNow(); });
}
export { render, _render };

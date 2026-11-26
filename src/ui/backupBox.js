import { exportBackup, importBackup } from '../store/backup.js';
import { storageEstimate, requestPersistence } from '../pwa/persist.js';
import { esc, toast, download } from './dom.js';
import { refreshWaiting } from './header.js';
import { S } from '../core/state.js';

const mb = n => (n / 1048576).toFixed(1) + ' MB';

export async function renderBackup(root) {
  const est = await storageEstimate(), p = await requestPersistence();
  root.innerHTML = `
  <div class="sheet">
    
    <h2>Backup</h2>
    <p class="small">A backup file holds every request and photo on this phone. Keep it somewhere safe (email it to yourself or save it to Files).</p>
    <div class="wnav"><button class="btn pri" type="button" id="exp">Export backup</button>
      <label class="btn">Import backup<input type="file" id="imp" accept=".zip,application/zip" hidden></label></div>
    <p class="small" id="bkmsg"></p>
    <h2>Storage on this phone</h2>
    <p class="small">${est ? `Using ${esc(mb(est.usage))} of ${esc(mb(est.quota))}.` : 'Storage size not available.'}
    ${p.persisted ? 'Protected: the phone will not clear it.' : 'Not protected yet: the phone may clear it when space is low. Export a backup often.'}</p>
  </div>`;
  root.querySelector('#exp').onclick = async () => {
    const b = await exportBackup(); download(b.blob, b.name);
    root.querySelector('#bkmsg').textContent = `Backup saved: ${b.counts.requests} requests, ${b.counts.attachments} files.`;
  };
  root.querySelector('#imp').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { const n = await importBackup(f); if (S.hooks.reloadData) await S.hooks.reloadData(); await refreshWaiting();
      root.querySelector('#bkmsg').textContent = `Restored: ${n.requestsAdded} new, ${n.requestsUpdated} updated, ${n.requestsKept} kept (newer on this phone), ${n.attachmentsAdded} files.`;
    } catch (err) { toast(err.message); }
  };
}

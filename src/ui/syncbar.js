// The sync bar under the header: one big "Sign in to sync" button when needed, otherwise the signed-in email with
// "Switch user" and "Sync now", plus any access message. 48 px targets, plain words.
import { S, esc } from '../core/state.js';
import { SYNC } from '../sync/status.js';

export function renderSyncBar() {
  const el = document.getElementById('syncbar'); if (!el) return;
  const msg = SYNC.message ? `<p class="syncmsg ${SYNC.state === 'blocked' ? 'bad' : ''}" role="status">${esc(SYNC.message)}</p>` : '';
  if (SYNC.state === 'signin') {
    el.innerHTML = `<button class="btn pri big-signin" type="button" data-sync="signin">Sign in to sync</button><p class="small">Your work is saved on this phone. Sign in when you have signal to send it.</p>${msg}${SYNC.smartsheet ? `<p class="small">${esc(SYNC.smartsheet)}</p>` : ''}`;
    return;
  }
  el.innerHTML = `<div class="syncrow"><span class="me">${esc(S.uid || '')}</span><button class="btn sm" type="button" data-sync="switch">Switch user</button><button class="btn sm pri" type="button" data-sync="now" ${SYNC.busy ? 'disabled' : ''}>${SYNC.busy ? 'Checking…' : 'Sync now'}</button></div>${msg}${SYNC.smartsheet ? `<p class="small">${esc(SYNC.smartsheet)}</p>` : ''}`;
}

export function wireSyncBar(session) {
  const el = document.getElementById('syncbar'); if (!el) return;
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-sync]'); if (!b) return;
    const a = b.dataset.sync;
    if (a === 'signin') session.signIn();                       // inside the tap: the popup is allowed
    if (a === 'switch') session.signIn({ selectAccount: true });
    if (a === 'now') session.syncNow({ force: true });
  });
}

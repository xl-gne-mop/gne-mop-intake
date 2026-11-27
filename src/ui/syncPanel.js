// "Sent to" card on the request page (config.js FLAGS.syncPanel). Data: S.syncInfo[requestId] = { st, ops },
// loaded by loadSyncInfo() after every local save and every sync. "Saved on this phone" and "Sent" never look alike.
import { S, esc } from '../core/state.js';
import { syncSummary, LEGEND } from '../sync/view.js';
import { flagOn } from '../sync/flags.js';
import { openStore } from '../store/db.js';

const MARK = { sent: ['ok', 'Sent'], waiting: ['amb', 'Waiting'], action: ['red', 'Needs you'] };

export async function loadSyncInfo() {
  const db = await openStore(), info = {};
  for (const row of await db.getAll('syncState')) if (row.key.startsWith('req:')) (info[row.key.slice(4)] = info[row.key.slice(4)] || { ops: [] }).st = row.value;
  for (const op of await db.getAll('outbox')) (info[op.requestId] = info[op.requestId] || { ops: [] }).ops.push(op);
  S.syncInfo = info;
}

export function syncPanel(q) {
  if (!flagOn(globalThis.MOP_CONFIG, 'syncPanel') || !q) return '';
  const i = (S.syncInfo || {})[q.id] || { ops: [] }, s = syncSummary(q, i.st, i.ops, { now: new Date() });
  if (!s) return '';
  const rev = q.sub && q.status === 'Draft' && q.rev > q.sub.rev ? `<p class="small">Revision ${q.rev} is saved on this phone only until you submit it. Below is the submitted rev ${q.sub.rev}.</p>` : '';
  if (s.kind === 'draft') return `<div class="box syncp" data-sync="draft"><h3>Sent to</h3><p class="note info">${esc(s.headline)}</p></div>`;
  return `<div class="box syncp" data-sync="${s.kind}"><h3>Sent to</h3>${rev}
  <p class="note ${s.tone === 'ok' ? 'ok' : s.tone === 'red' ? 'err' : ''}">${esc(s.headline)}</p>
  <ul class="dests">${s.dests.map(d => `<li data-dest="${d.key}"><span class="pill ${MARK[d.state][0]}">${MARK[d.state][1]}</span><span><b>${esc(d.label)}</b><small>${esc(d.detail)}</small></span></li>`).join('')}</ul>
  <p class="small">${s.lastSynced ? `Last sent ${esc(s.lastSynced)}.` : 'Not sent yet.'}${s.nextTry ? ` Next try by itself about ${esc(s.nextTry)}.` : ''}${s.problem && s.kind !== 'action' ? ` Last problem: ${esc(s.problem)}` : ''}</p>
  ${s.kind === 'sent' ? '' : '<button class="btn" data-a="syncRetry">Try again now</button>'}
  <details class="legend"><summary>What these words mean</summary><dl class="kv">${LEGEND.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></details></div>`;
}

/** Redraw only the card (never the whole page: a tap landing during a redraw must not be lost). */
export async function refreshSyncPanel() {
  await loadSyncInfo();
  const el = typeof document !== 'undefined' && document.querySelector('#app .syncp');
  if (el && S.view === 'detail') el.outerHTML = syncPanel(S.reqs[S.id]);
}

// Settings → Companies: the bold company names for MOP steps (lists.json settings.CompanyNames).
// Editors: add / rename / remove, saved on the phone at once and sent to lists.json in Drive by sync.
// Everyone else: "Suggest a name" goes to the library inbox (same flow as library suggestions).
import { S, esc, toast, render, uidGen } from '../core/state.js';
import { editCompanyNames, listsWithCompanies } from '../config/companies.js';
import { openStore } from '../store/db.js';
import { makeOp, putOpInTx } from '../store/outbox.js';
import { saveSuggestion } from '../library/suggest.js';

export function vCompanies(tabs) {
  const names = (S.cfg && S.cfg.companyNames) || [], ed = S.canEdit, ren = S.coRename;
  const rows = names.map((n, i) => ren === n
    ? `<li class="co-row"><input data-coto value="${esc(n)}" aria-label="New name for ${esc(n)}"><button class="btn sm pri" data-a="coRenameSave" data-n="${esc(n)}">Save</button><button class="btn sm" data-a="coRenameCancel">Cancel</button></li>`
    : `<li class="co-row"><b>${esc(n)}</b>${ed ? `<button class="btn sm" data-a="coRename" data-n="${esc(n)}">Rename</button><button class="btn sm red" data-a="coRemove" data-n="${esc(n)}" aria-label="Remove ${esc(n)}">Remove</button>` : ''}</li>`).join('');
  return `<h1>Settings</h1>${tabs}<p class="sub">These names print in <b>bold</b> in MOP steps, return-to-service lines, Go / No-Go, back-out and impact lines. XL, GNE, Genentech, JLL, Siemens and every company on the request are always bold.</p>
  <div class="sheet"><ul class="plain co-list">${rows || '<li>No names yet.</li>'}</ul>
  ${ed ? `<div class="bar"><input data-coadd placeholder="Company name, e.g. Rosendin" aria-label="Company name to add"><button class="btn pri" data-a="coAdd">Add</button></div><p class="small">Saved on this phone now. It goes to lists.json in Drive when this phone syncs.</p>`
    : `<div class="bar"><input data-cosug placeholder="Company name to add" aria-label="Company name to suggest"><button class="btn" data-a="coSuggest">Suggest a name</button></div><p class="small">Only library editors change this list. Your suggestion goes to JK.</p>`}</div>`;
}

async function saveNames(list) {
  const db = await openStore(), tx = db.transaction(['config', 'outbox'], 'readwrite');
  const cur = await tx.objectStore('config').get('lists');
  if (cur && cur.data) await tx.objectStore('config').put({ ...cur, data: listsWithCompanies(cur.data, list) });
  await putOpInTx(tx, makeOp({ requestId: 'library', stage: 0, rev: 0, kind: 'lists.companies', payload: { names: list, by: S.uid || '', at: new Date().toISOString() } }));
  await tx.done;
  S.cfg.companyNames = list;
  if (S.hooks.saved) S.hooks.saved();
}

/** Click actions starting with "co". Returns true when handled. */
export function companyAction(a, b, root) {
  const names = (S.cfg && S.cfg.companyNames) || [];
  const apply = op => { const r = editCompanyNames(names, op); if (r.error) { toast(r.error); return; } S.coRename = null; saveNames(r.list).then(() => { toast('Saved.'); render(); }).catch(() => toast('Could not save. Try again.')); };
  if (a === 'coAdd') { if (!S.canEdit) return true; const i = root.querySelector('[data-coadd]'); apply({ kind: 'add', name: i ? i.value : '' }); return true; }
  if (a === 'coRemove') { if (!S.canEdit) return true; apply({ kind: 'remove', name: b.dataset.n }); return true; }
  if (a === 'coRename') { S.coRename = b.dataset.n; render(); return true; }
  if (a === 'coRenameCancel') { S.coRename = null; render(); return true; }
  if (a === 'coRenameSave') { if (!S.canEdit) return true; const i = root.querySelector('[data-coto]'); apply({ kind: 'rename', name: b.dataset.n, to: i ? i.value : '' }); return true; }
  if (a === 'coSuggest') {
    const i = root.querySelector('[data-cosug]'), name = String(i ? i.value : '').trim(); if (!name) { toast('Type a company name.'); return true; }
    saveSuggestion({ id: 's' + uidGen(), entryId: '', entryName: 'Company names (bold in MOP steps)', ver: '', text: `Add company name: ${name}`, by: S.uid || '', byName: S.meName || '', at: new Date().toISOString(), reqId: '', mop: '', status: 'Open', company: name })
      .then(() => { toast('Saved. It goes to JK when this phone syncs. Thank you.'); render(); }).catch(() => toast('Could not save. Tell JK directly.'));
    return true;
  }
  return false;
}

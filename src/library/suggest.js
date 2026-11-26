// "Suggest a library change" (Steps screen or after the job). Ported from r5:448-451. The suggestion is saved on
// this phone and queued (outbox op library.suggest) for the Drive "Library inbox" folder in phase 6; it never
// changes the MOP. Editors see suggestions in Settings > Library.
import { S, D, esc, toast, mopLabel, uidGen } from '../core/state.js';
import { mic } from '../ui/screens.js';
import { libById } from '../lib/library.js';
import { openStore } from '../store/db.js';
import { makeOp, putOpInTx } from '../store/outbox.js';

async function saveSuggestion(d) {
  const db = await openStore(), tx = db.transaction(['library', 'outbox'], 'readwrite');
  await tx.objectStore('library').put({ ...d, kind: 'suggestion' });
  await putOpInTx(tx, makeOp({ requestId: 'library', stage: 0, rev: 0, kind: 'library.suggest:' + d.id, payload: d }));
  await tx.done;
  S.sugs = [...(S.sugs || []).filter(x => x.id !== d.id), d];
  if (S.hooks.saved) S.hooks.saved();
}
export async function loadSuggestions() { const db = await openStore(); S.sugs = (await db.getAll('library')).filter(x => x.kind === 'suggestion'); return S.sugs; }

function sugBox(){return `<div class="zone u-1b0f49"><b class="u-789157">Something wrong with the library steps?</b> <span class="small">Tell JK. Your note goes to the library owner and does not change this MOP.</span>
 ${S.sug?`<div class="ta u-8a77e5"><textarea data-sug rows="3" placeholder="e.g. Step 5 takes 4 hours, not 2. Add a step to call the monitoring company.">${esc(S.sug.text)}</textarea>${mic('sug')}</div><div class="bar"><button class="btn sm pri" data-a="sugSend">Send to JK</button><button class="btn sm" data-a="sugCancel">Cancel</button></div>`:`<div class="bar u-8a77e5"><button class="btn sm" data-a="sugOpen">Suggest a library change</button></div>`}</div>`}
function sendSug(text,q){const r=q?(q.sub||q).record:D(),e=libById(r.x.lib&&r.x.lib.id),id='s'+uidGen();
 const d={id,entryId:e?e.id:'',entryName:e?e.name:(r.x.lib&&r.x.lib.name)||'No work type chosen',ver:(e&&e.ver)||'',text:String(text||'').trim(),by:S.uid||'',byName:r.req.name||S.meName||'',at:new Date().toISOString(),reqId:q?q.id:(S.draft&&S.draft.id)||'',mop:q?mopLabel(q):'',status:'Open'};
 return saveSuggestion(d).then(()=>{toast('Saved. It goes to JK when this phone syncs. Thank you.');return true}).catch(()=>{toast('Could not save. Tell JK directly.');return false})}

export { sugBox, sendSug, saveSuggestion };

export async function setSuggestionStatus(id, patch) {
  const db = await openStore(), cur = await db.get('library', id); if (!cur) return;
  const d = { ...cur, ...patch }; await db.put('library', d); S.sugs = (S.sugs || []).map(x => (x.id === id ? d : x));
}
export async function dismissSuggestion(id) { await setSuggestionStatus(id, { status: 'Dismissed' }); }

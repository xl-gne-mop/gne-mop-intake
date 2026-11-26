// Guided dictation prompt: What / Where / Equipment / Why / How long / What goes down tick as the text covers them;
// picked-up tags with "+ LOTO point" and "Looks right – fill these in" (r5:393, verbatim).
import { esc } from '../core/state.js';
import { findTags, DG } from './parse.js';

function dictHTML(r){const t=r.scope||'',ft=findTags(t),done=DG.map(([l,re])=>re?re.test(t):ft.tags.length>0);
 return `<div class="dguide" aria-label="What to say">${DG.map(([l],i)=>`<span class="${done[i]?'on':''}">${l}</span>`).join('')}</div>
 ${ft.tags.length||ft.rooms.length||ft.bldg.length||ft.dur?`<div class="tags"><span class="small">Picked up:</span>${ft.tags.map(x=>`<span class="tag">${esc(x)}${r.loto.points.some(p=>p.equip===x)?'':`<button data-a="tagLoto" data-v="${esc(x)}">+ LOTO point</button>`}</span>`).join('')}${[...ft.bldg,...ft.rooms].map(x=>`<span class="tag">${esc(x)}</span>`).join('')}${ft.dur?`<span class="tag">${esc(ft.dur.val+' '+ft.dur.unit)}</span>`:''}
  <button class="btn sm pri" data-a="tagApply">${r.x.scopeOk?'Fill again':'Looks right – fill these in'}</button></div>`:''}`}


export { dictHTML };

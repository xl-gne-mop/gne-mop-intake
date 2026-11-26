// Library v2 editor flow (Rebuild 5, r5:739-787): suggest -> draft -> compare (diff) -> publish; the old version is
// kept; MOPs keep the version they were built with; drafts are never offered at intake. Verbatim except storage:
// drafts / published / superseded entries are kept in IndexedDB (S.lib), and publishing also queues one outbox op
// 'library.publish' carrying the complete new library-v2.json (src/library/publish.js). Phase 6 writes it to the
// Drive Config folder: the current file is kept as library-v<N>-superseded-<MM-DD-YY>.json.
import { R, S, $, esc, clone, uidGen, toast, now, fS, fromIso, render } from '../core/state.js';
import { allEntries, libById, live } from '../lib/library.js';
import { TIER_NAME } from '../rules/tier.js';
import { reviewDue } from '../rules/permits.js';
import { removeLib, loadLib } from './local.js';
import { setSuggestionStatus } from './suggest.js';
import { buildPublishedLibrary } from './publish.js';
import { openStore } from '../store/db.js';
import { fold } from '../rules/review.js';
import { makeOp, putOpInTx } from '../store/outbox.js';

async function libPut(e) { const db = await openStore(); await db.put('library', { ...e, savedAt: new Date().toISOString() }); await loadLib(); }

/** Queue the Drive write of the new library file (one op per published version). */
async function queuePublish(e) {
  const file = buildPublishedLibrary(S.libraryFile, e, { by: S.uid || '', at: new Date().toISOString() });
  const db = await openStore(), tx = db.transaction(['outbox'], 'readwrite');
  await putOpInTx(tx, makeOp({ requestId: 'library', stage: 0, rev: +file.libraryVersion, kind: 'library.publish:' + e.id + '@' + e.ver, payload: { file, entryId: e.id, ver: e.ver, previousVersion: S.libraryFile ? S.libraryFile.libraryVersion : '' } }));
  await tx.done;
  S.libraryFile = file; S.library = file.workTypes.filter(w => !w.status || w.status === 'Active');
  if (S.hooks.saved) S.hooks.saved();
}

/** "Mark reviewed" (yearly review): saved locally as an Active override with today's review date. */
async function markReviewed(o) { await libPut(o); }

const nextVer=(v,major)=>{const m=/^(\d+)\.(\d+)$/.exec(v||'');if(!m)return '1.0';return major?`${+m[1]+1}.0`:`${m[1]}.${+m[2]+1}`};
const lnz=t=>String(t||'').split('\n').map(x=>x.trim()).filter(Boolean);
function ledFrom(e,target,bv,cur){return{target,bv,base:clone(e),cur:cur?clone(cur):null,name:e.name||'',tier:String(e.tier||2),discipline:e.discipline||'',systemCode:e.systemCode||'',lotoType:e.lotoType||'',keywords:(e.keywords||[]).join(', '),basis:(e.basis||[]).join('\n'),
 steps:(e.steps||[]).map(([d,u])=>d+(u?' | '+u:'')).join('\n'),gonogo:e.gonogo||'',backout:e.backout||'',rts:e.rts||'',alarms:(e.alarms||[]).join('\n'),permits:(e.permits||[]).join('\n'),tools:e.tools||'',crew:e.crew||'',safety:e.safety||'',summary:e.status==='Draft'?(e.summary||''):'',major:false,cmp:false}}
function ledToEntry(L){const b=clone(L.base||{});delete b.gne;delete b.target;
 return{sys:{},sup:{},impacts:[],pre:[],checks:{},...b,id:L.target,kind:'std',name:L.name.trim(),tier:+L.tier||2,discipline:L.discipline,systemCode:L.systemCode||'00 General',lotoType:L.lotoType,
  keywords:L.keywords.split(',').map(x=>x.trim()).filter(Boolean),basis:lnz(L.basis),steps:lnz(L.steps).map(l=>{const m=/^(.*?)\s*\|\s*([^|]*)$/.exec(l);return m?[m[1].trim(),m[2].trim()]:[l,'']}),
  gonogo:fold(lnz(L.gonogo),4).join('\n'),backout:fold(lnz(L.backout),4).join('\n'),rts:lnz(L.rts).join('\n'),alarms:lnz(L.alarms),permits:lnz(L.permits),tools:fold(lnz(L.tools),10).join('\n'),crew:fold(lnz(L.crew),10).join('\n'),safety:L.safety.trim(),summary:L.summary.trim(),ver:L.bv?nextVer(L.bv,L.major):'1.0',owner:'JK'}}
function libCompare(L){const o=ledFrom(L.cur,'',''),secs=[['name','Name'],['steps','Steps'],['gonogo','Go / No-Go'],['backout','Back-out'],['rts','Return to service'],['alarms','Alarms'],['tools','Tools'],['crew','Crew'],['basis','Basis'],['keywords','Keywords']];let h='';
 secs.forEach(([k,l])=>{const sp=k==='keywords'?t=>t.split(',').map(x=>x.trim()).filter(Boolean):lnz,a=sp(o[k]),b=sp(L[k]),rm=a.filter(x=>!b.includes(x)),ad=b.filter(x=>!a.includes(x));
  if(rm.length||ad.length)h+=`<p class="u-3a361f"><b class="u-789157">${l}</b></p>${rm.map(x=>`<div class="small u-862e70">− ${esc(x)}</div>`).join('')}${ad.map(x=>`<div class="small u-41984d">+ ${esc(x)}</div>`).join('')}`});
 if(String(o.tier)!==String(L.tier))h+=`<p class="small">Tier ${esc(o.tier)} → ${esc(L.tier)}</p>`;
 return `<div class="zone"><b class="u-789157">Changes from v${esc(L.cur.ver||'1.0')}</b>${h||'<p class="small">No changes yet.</p>'}</div>`}
function libEditor(){const L=S.ledit,ver=L.bv?nextVer(L.bv,L.major):'1.0',f=(k,l,o={})=>`<label class="f"><span>${l}</span>${o.area?`<textarea data-le="${k}" rows="${o.rows||3}">${esc(L[k])}</textarea>`:`<input data-le="${k}" value="${esc(L[k])}">`}${o.help?`<small>${o.help}</small>`:''}</label>`;
 return `<form class="sheet"><h2>${L.cur?'New version of '+esc(L.cur.name):'New work type'}</h2><p class="sub">Version ${ver}${L.bv?` (current v${esc(L.bv)})`:''}. Drafts are never offered at intake. MOPs already issued keep the version they were built from.</p>
 ${f('name','Name')}<div class="g3"><label class="f"><span>Risk tier</span><select data-le="tier">${[1,2,3].map(t=>`<option value="${t}" ${String(L.tier)===String(t)?'selected':''}>${TIER_NAME[t]}</option>`).join('')}</select></label>
 <label class="f"><span>Discipline</span><select data-le="discipline">${R.DISCIPLINES.map(d=>`<option ${d===L.discipline?'selected':''}>${esc(d)}</option>`).join('')}</select></label>
 <label class="f"><span>LOTO type</span><select data-le="lotoType">${[['','None'],['Electrical','Electrical'],['Piping / valve','Piping / valve']].map(([v,l])=>`<option value="${v}" ${v===L.lotoType?'selected':''}>${l}</option>`).join('')}</select></label></div>
 ${f('keywords','Keywords for matching (comma-separated)',{help:'Words a foreman would say: equipment, tags, actions.'})}
 ${f('steps','During-MOP steps, one per line: step | duration',{area:1,rows:12,help:'{EQUIP}, {LOTO}, {AREA}, {BLDG} and {SUB} fill from the request. Start a hold point with “HOLD POINT –”.'})}
 <div class="g2">${f('gonogo','Go / No-Go (max 4)',{area:1,rows:4})}${f('backout','Back-out (max 4)',{area:1,rows:4})}</div>
 <div class="g2">${f('rts','Return-to-service checks',{area:1,rows:3})}${f('alarms','Alarms put on standby (each restored at close-out)',{area:1,rows:3})}</div>
 <div class="g2">${f('tools','Tools (max 10)',{area:1,rows:4})}${f('crew','Crew (max 10)',{area:1,rows:4})}</div>
 ${f('safety','Safety line')}${f('permits','Permits and notices it triggers, one per line',{area:1,rows:2})}${f('basis','Basis, one per line. Label [REG] / [STD] / [CP] and give the edition.',{area:1,rows:4})}
 ${f('summary','What changed and why (needed to publish)',{area:1,rows:2})}
 ${L.bv?`<label class="ck"><input type="checkbox" data-le="major" ${L.major?'checked':''}><span>Major change (next whole version number)</span></label>`:''}
 ${L.cmp&&L.cur?libCompare(L):''}
 <div class="wnav"><button class="btn" data-a="libCancel">Back</button>${L.cur?`<button class="btn" data-a="libCmp">${L.cmp?'Hide changes':'Compare to current'}</button>`:''}<span class="sp"></span><button class="btn" data-a="libSaveDraft">Save draft</button><button class="btn pri" data-a="libPublish">Publish v${ver}</button></div></form>`}
function libPublish(){const L=S.ledit,e=ledToEntry(L),bad=[];if(e.name.length<6)bad.push('a name');if(!e.steps.length)bad.push('at least one step');if(e.steps.some(x=>!x[1]))bad.push('a duration on every step ("step | 15 mins")');if(e.summary.length<5)bad.push('what changed and why');
 if(bad.length){toast('To publish, add '+bad.join(', ')+'.');return}
 const old=L.cur,today=fS(now());Object.assign(e,{status:'Active',eff:today,reviewed:today,by:S.uid||'',hist:[...((old&&old.hist)||[]),...(old?[{ver:old.ver||'1.0',eff:old.eff||'',summary:old.summary||'Built-in'}]:[])]});
 const jobs=[];if(old){const o=clone(old);delete o.gne;jobs.push(libPut({...o,id:`old_${L.target}_${String(old.ver||'1.0').replace(/\W/g,'_')}`,kind:'std',status:'Superseded'}))}
 jobs.push(libPut(clone(e)));jobs.push(removeLib('draft_'+L.target).catch(()=>{}));jobs.push(queuePublish(e));
 if(L.sugId)jobs.push(setSuggestionStatus(L.sugId,{status:'Accepted',acceptedVer:e.ver}).catch(()=>{}));
 Promise.all(jobs).then(()=>{toast(`Published ${e.name} v${e.ver}. New requests use it now.`);S.ledit=null;render()}).catch(()=>toast('Only the library owner (JK) or an editor can publish.'))}
function libSaveDraft(){const L=S.ledit,e=ledToEntry(L);libPut(clone({...e,id:'draft_'+L.target,target:L.target,status:'Draft',bv:L.bv||'',sugId:L.sugId||''})).then(()=>toast('Draft saved. It is not used at intake until published.')).catch(()=>toast('Only editors can save library drafts.'))}
function vLibrary(tabs,ed){if(S.ledit)return `<h1>Settings</h1>${tabs}${libEditor()}`;const ents=allEntries(),sugs=(S.sugs||[]).filter(x=>x.status==='Open').sort((a,b)=>(b.at||'').localeCompare(a.at||'')),drafts=S.lib.filter(e=>e.status==='Draft');
 const det=e=>`<div class="small u-408cb5">${e.tier?`<b>${esc(TIER_NAME[e.tier])}</b><br>`:''}${e.basis?'<b>Basis:</b> '+esc(e.basis.join('; '))+'<br>':''}<b>Steps:</b><br>${e.steps.map((x,k)=>`${k+1}. ${esc(x[0])}${x[1]?' ('+esc(x[1])+')':''}`).join('<br>')}<br><b>Go/No-Go:</b> ${esc(R.lines(e.gonogo).join('; '))}<br><b>Back-out:</b> ${esc(R.lines(e.backout).join('; '))}${e.rts?'<br><b>Return to service:</b> '+esc(R.lines(e.rts).join('; ')):''}${e.alarms&&e.alarms.length?'<br><b>Alarms:</b> '+esc(e.alarms.join('; ')):''}${e.permits&&e.permits.length?'<br><b>Permits:</b> '+esc(e.permits.join('; ')):''}${e.hist&&e.hist.length?'<br><b>Earlier versions:</b> '+e.hist.map(h=>`v${esc(h.ver)} ${esc(h.eff)}`).join(', '):''}${e.summary?'<br><b>Last change:</b> '+esc(e.summary):''}</div>`;
 return `<h1>Settings</h1>${tabs}<p class="sub">The library drives automatic fill. Anyone can suggest a change from the Steps screen or after a job; only the library owner (JK) or an editor publishes. Each published version is dated, the old one is kept, and MOPs already issued keep the version they used.</p>
 ${sugs.length?`<div class="box"><h3>Suggestions from the field (${sugs.length})</h3>${sugs.map(x=>`<div class="sig"><div><b>${esc(x.entryName)}</b>${x.ver?' v'+esc(x.ver):''}: ${esc(x.text)}<small>${esc(x.byName||'Someone')} · ${esc(fS(fromIso(x.at)))}${x.mop?' · '+esc(x.mop):''}</small></div>${ed?`<div class="bar u-f0abc1">${x.entryId&&libById(x.entryId)?`<button class="btn sm pri" data-a="sugDraft" data-id="${esc(x.id)}">Start a draft</button>`:''}<button class="btn sm" data-a="sugDone" data-id="${esc(x.id)}">Dismiss</button></div>`:''}</div>`).join('')}</div>`:''}
 ${drafts.length?`<div class="box"><h3>Drafts (not used until published)</h3>${drafts.map(d=>`<div class="sig"><div>${esc(d.name)} · v${esc(d.ver)}<small>${esc(d.summary||'No summary yet')}</small></div>${ed?`<div class="bar u-f0abc1"><button class="btn sm pri" data-a="libOpenDraft" data-id="${esc(d.id)}">Continue</button><button class="btn sm red" data-a="libDelDraft" data-id="${esc(d.id)}">Delete</button></div>`:''}</div>`).join('')}</div>`:''}
 ${ed?`<div class="zone"><div class="bar"><b class="u-789157">Import a past MOP (PDF or Word in the GNE template, or the Excel intake)</b><span class="sp"></span><button class="btn sm" data-a="libNew">Add a work type</button><label class="btn sm pri">Choose file<input type="file" accept=".pdf,.docx,.xlsx" data-impfile hidden></label></div>
  ${S.imp?`<div class="u-d2c171"><label class="f"><span>Library name</span><input data-impname value="${esc(S.imp.name)}"></label><p class="small">${esc(S.imp.kind||'')} · Found: ${S.imp.rec.steps.filter(x=>x.desc).length} during-MOP steps, ${S.imp.rec.pre.length} extra pre-MOP steps, ${R.lines(S.imp.rec.gonogo).length} Go/No-Go, ${R.lines(S.imp.rec.backout).length} back-out, ${S.imp.rec.impacts.filter(x=>x.impact).length} impacts, ${Object.values(S.imp.rec.sys).filter(g=>g.level).length} system groups, ${R.lines(S.imp.rec.tools).length} tools.</p><div class="bar"><button class="btn pri sm" data-a="saveimp">Save to library</button><button class="btn sm" data-a="cancelimp">Cancel</button></div></div>`:''}</div>`:''}
 <div class="scroll"><table class="stack"><thead><tr><th>Work type / MOP</th><th>Version</th><th>Tier</th><th>Steps</th><th></th></tr></thead><tbody>${ents.map(e=>`<tr><td>${esc(e.name)}<div class="small">${e.kind==='std'?(e.gne?'GNE version':'Built-in'):esc('Past MOP'+(e.from?' · '+e.from:''))}</div>${S.libView===e.id?det(e):''}</td>
  <td>${e.ver?'v'+esc(e.ver):'—'}${e.eff?`<div class="small">${esc(e.eff)}</div>`:''}${reviewDue(e)?'<span class="pill amb">Review due</span>':''}</td><td>${e.tier?'T'+e.tier:''}</td><td>${e.steps.length}</td>
  <td><div class="bar u-f0abc1"><button class="btn sm" data-a="viewlib" data-id="${esc(e.id)}">${S.libView===e.id?'Hide':'View'}</button>${ed&&e.kind==='std'?`<button class="btn sm" data-a="libEdit" data-id="${esc(e.id)}">New version</button><button class="btn sm" data-a="libRev" data-id="${esc(e.id)}">Mark reviewed</button>`:''}${e.kind!=='std'&&ed?`<button class="btn sm red" data-a="rmlib" data-id="${esc(e.id)}">Remove</button>`:''}</div></td></tr>`).join('')}</tbody></table></div>`}


export { nextVer, lnz, ledFrom, ledToEntry, libCompare, libEditor, libPublish, libSaveDraft, vLibrary, markReviewed, queuePublish };

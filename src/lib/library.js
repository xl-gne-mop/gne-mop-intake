// Work-type library, matching, similar past MOPs, substitutions and fill.
// Ported from reference/rebuild-4/index.html (r4:244-293); function bodies kept as close to verbatim as possible.
import { R, S, STEPS, STATUSES, SIDE, UTIL, GROUPS, SYSTEM_CODES, LOTO_CATS, CAT_MAP, CONTACT_ROLES, APPROVER_ROLES, ICON_MIC, $, esc, clone, uidGen, cfg, proj, safeUrl, pad3, mopLabel, toast, now, fS, fL, isoDay, pdDay, fromIso, fileUrl, D, later } from '../core/state.js';

const norm=t=>String(t||'').toLowerCase().replace(/[^a-z0-9&\-\/.' ]+/g,' ').replace(/\s+/g,' ');
const STOP=new Set('the and for with from that this will are all per new existing work to of in on at by be or as is xl sub gne jll'.split(' '));
const words=t=>new Set(norm(t).split(' ').filter(w=>w.length>2&&!STOP.has(w)));
function sim(a,b){const A=words(a),B=words(b);if(!A.size||!B.size)return 0;let i=0;A.forEach(w=>{if(B.has(w))i++});return i/Math.sqrt(A.size*B.size)}
const recText=r=>[r.title,r.scope,r.equip,r.system,r.discipline,r.areas,...(r.loto.points||[]).map(p=>`${p.equip} ${p.point} ${p.affected}`)].join(' ');
function entryFromRecord(rec,id,name,from){return{id,name,kind:'mop',from,discipline:rec.discipline,systemCode:rec.system,lotoType:(rec.loto.points[0]||{}).type||'',keywords:[],
 sys:Object.fromEntries(Object.entries(rec.sys).filter(([k,v])=>v.level||v.items.length).map(([k,v])=>[k,{level:v.level,items:v.items.slice(),other:v.other,notes:v.notes}])),
 util:rec.x&&rec.x.util&&(rec.x.util.level||rec.x.util.items.length)?clone(rec.x.util):null,
 sup:Object.fromEntries(['siemens','impair','hot','watch','jll','jllType','cgmp'].filter(k=>rec.sup[k]).map(k=>[k,rec.sup[k]])),
 tools:rec.tools,crew:rec.crew,safety:rec.safety,impacts:rec.impacts.filter(i=>i.impact.trim()),pre:rec.pre.filter(x=>x.desc.trim()),
 steps:rec.steps.filter(x=>x.desc.trim()).map(x=>[x.desc,x.dur]),gonogo:rec.gonogo,backout:rec.backout,rts:rec.x?rec.x.rts:'',text:[rec.title,rec.scope,rec.equip,rec.discipline].join(' ')}}
const live=e=>!e.status||e.status==='Active';
/* Library entries offered at intake: the Drive library (S.library) with any version published on this phone
   (S.lib, kind 'std') laid over it, plus past MOPs. Drafts are never offered (live). r5:268. */
function allEntries(){const ov={};S.lib.forEach(e=>{if(e.kind==='std'&&live(e))ov[e.id]=e});
 const std=S.library.map(e=>ov[e.id]?{...ov[e.id],kind:'std',gne:true}:{...e,kind:'std'});
 return[...std,...S.lib.filter(e=>live(e)&&(e.kind==='mop'||(e.kind==='std'&&!S.library.some(m=>m.id===e.id))))]}
function libById(id){if(!id)return null;if(id.startsWith('req:')){const q=S.reqs[id.slice(4)];return q&&q.sub?entryFromRecord(q.sub.record,id,`${q.sub.record.bldg} ${mopLabel(q)} – ${q.sub.record.title}`,'past MOP'):null}return allEntries().find(e=>e.id===id)||null}
function libMatches(r){const text=' '+norm(recText(r))+' ';if(text.trim().length<6)return[];
 return allEntries().map(e=>{let sc=0;const hits=[];(e.keywords||[]).forEach(k=>{const kk=norm(k).trim();if(!kk)return;const hit=kk.length<4?new RegExp('(^|[^a-z0-9])'+kk.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).test(text):text.includes(kk);if(hit){sc+=1+(kk.split(' ').length-1)*.6;hits.push(k)}});
  if(r.discipline&&e.discipline===r.discipline)sc+=1.5;if(e.kind==='mop')sc+=sim(recText(r),e.text)*6;
  if(r.loto.needed==='Yes'&&e.lotoType&&r.loto.points.some(p=>p.type===e.lotoType))sc+=.5;return{e,sc,hits}}).filter(x=>x.sc>=1.5).sort((a,b)=>b.sc-a.sc)}
function similarPast(q){const r=q.record,t=recText(r);
 return Object.values(S.reqs).filter(x=>x.id!==q.id&&x.sub&&x.status!=='Cancelled').map(x=>({id:'req:'+x.id,label:`${x.sub.record.bldg} ${mopLabel(x)} – ${x.sub.record.title}`,sc:sim(t,recText(x.sub.record))}))
  .concat(S.lib.filter(e=>e.kind==='mop').map(e=>({id:e.id,label:e.name+(e.from?` (${e.from})`:''),sc:sim(t,e.text)}))).filter(x=>x.sc>.15).sort((a,b)=>b.sc-a.sc).slice(0,3)}
function tok(s,r){const pts=r.loto.needed==='Yes'?r.loto.points.filter(p=>p.equip||p.point).map(p=>[p.equip,p.point].filter(Boolean).join(' ')).join('; '):'';
 const m={EQUIP:r.equip.trim()||'the equipment',LOTO:pts||'the isolation points',AREA:(r.areas.trim().split('\n')[0])||'the work area',BLDG:r.bldg||'the building',SUB:r.req.company||'the Sub'};
 return String(s||'').replace(/\{(EQUIP|LOTO|AREA|BLDG|SUB)\}/g,(_,k)=>m[k])}
/* Fill one screen's empty sections from the chosen entry. force=true replaces the step lists. */
function fillFrom(e,step,force){const r=D(),f=[];if(!e)return f;
 if(step===1){if(!r.discipline&&e.discipline){r.discipline=e.discipline;f.push('discipline')}if(!r.system&&e.systemCode){r.system=e.systemCode;f.push('system code')}}
 if(step===4){const any=Object.values(r.sys).some(v=>v.level||v.items.length)||r.x.util.level||r.x.util.items.length;
  if(!any||force){Object.entries(e.sys||{}).forEach(([k,v])=>{if(r.sys[k]){r.sys[k].level=v.level||'';r.sys[k].items=(v.items||[]).slice();if(v.other)r.sys[k].other=v.other;if(v.notes)r.sys[k].notes=tok(v.notes,r)}});if(e.util&&cfg().additions)Object.assign(r.x.util,clone(e.util),{items:(e.util.items||[]).slice()});f.push('affected systems')}}
 if(step===5&&e.impacts&&e.impacts.length&&(force||!r.impacts.some(i=>i.impact.trim()))){r.impacts=e.impacts.map(i=>({kind:i.kind,impact:tok(i.impact,r),mitigation:tok(i.mitigation,r)}));f.push(`${r.impacts.length} impacts`)}
 if(step===5&&!r.users.trim()){const loads=r.loto.needed==='Yes'?r.loto.points.flatMap(p=>R.lines(p.affected)):[];const u=[r.areas.trim()?r.areas.trim().split('\n')[0]+' (work area)':'',...loads.map(l=>l+' (loses service)')].filter(Boolean);if(u.length){r.users=[...new Set(u)].join('\n');f.push('who is affected')}}
 if(step===6){let n=0;Object.entries(e.sup||{}).forEach(([k,v])=>{if(!r.sup[k]||force){r.sup[k]=v;n++}});if(n)f.push('support answers');['tools','crew','safety'].forEach(k=>{if(e[k]&&(force||!r[k].trim())){r[k]=e[k];f.push(k)}})}
 if(step===7){if(force||!r.pre.some(x=>x.desc.trim())){if(e.pre&&e.pre.length){r.pre=e.pre.slice(0,2).map(p=>({desc:tok(p.desc,r),dur:p.dur||''}));f.push('pre-MOP steps')}}
  if(force||!r.steps.some(x=>x.desc.trim())){r.steps=e.steps.slice(0,44).map(([d,u])=>({desc:tok(d,r),dur:u||''}));f.push(`${r.steps.length} steps`)}
  [['gonogo','Go/No-Go'],['backout','back-out']].forEach(([k,l])=>{if(e[k]&&(force||!r[k].trim())){r[k]=tok(e[k],r);f.push(l)}});
  if(e.rts&&(force||!r.x.rts.trim())){r.x.rts=tok(e.rts,r);f.push('return to service')}}
 if(step===3&&e.loto&&!r.loto.needed){r.loto.needed=e.loto;f.push('LOTO answer')}
 if(step===6&&e.alarms&&e.alarms.length&&(force||!r.x.alarms.trim())){r.x.alarms=e.alarms.join('\n');f.push('alarm list')}
 if(f.length){({1:['discipline','system'],3:['loto'],4:['sys','x.util'],5:['impacts','users'],6:['sup','tools','crew','safety','x.alarms'],7:['pre','steps','gonogo','backout','x.rts']}[step]||[]).forEach(k=>r.x.auto[k]=true);R.normalize(r);S.dirty=true}return f}
function chooseEntry(id,silent){const e=libById(id);if(!e)return;const r=D();r.x.lib={id,name:e.name,kind:e.kind,ver:e.ver||'',eff:e.eff||''};const f=fillFrom(e,1);
 if(!silent)toast(`Using ${e.name}. Later screens fill in as you reach them${f.length?'; filled '+f.join(', '):''}.`);later()}
function autoPick(){const r=D();if(r.x.lib&&r.x.lib.id)return;const m=libMatches(r);if(m.length&&m[0].sc>=2.5&&(!m[1]||m[0].sc-m[1].sc>=.5||m[0].sc>=4)){chooseEntry(m[0].e.id,true);toast(`Matched work type: ${m[0].e.name}. Change it on the Work screen.`)}}
function onArrive(step){const r=D();if(step>=2)autoPick();const e=libById(r.x.lib&&r.x.lib.id);if(!e)return;const f=fillFrom(e,step);if(f.length){later();toast(`Filled from ${e.name}: ${f.join(', ')}. Review and edit.`)}}
function libPanel(){const q=S.draft,r=q.record,cur=r.x.lib&&r.x.lib.id?libById(r.x.lib.id):null,m=libMatches(r).slice(0,3),past=similarPast(q);
 const row=(id,label,sub,on)=>`<div class="sig"><div>${esc(label)}<small>${esc(sub)}</small></div>${on?'<span class="pill ok">In use</span>':`<button class="btn sm" data-a="uselib" data-id="${esc(id)}">Use</button>`}</div>`;
 return `<b class="u-789157">Work type and past MOPs</b><p class="small u-54eb29">Pick what this work is most like. Systems, impacts, support, tools and the step-by-step fill in from it as you reach each screen. You can edit everything.</p>
 ${cur?`<div class="note ok u-fdf33f">Using <b>${esc(cur.name)}</b>${cur.kind==='std'?' (library)':' (past MOP)'}.${cur.basis?' Basis: '+esc(cur.basis.join('; ')):''}</div>`:''}
 ${m.length?`<div class="small u-937b1b">Suggested from your description</div>${m.map(x=>row(x.e.id,x.e.name,x.e.kind==='std'?(x.hits.length?'Matched: '+x.hits.slice(0,4).join(', '):'Library'):'Imported MOP',cur&&cur.id===x.e.id)).join('')}`:'<p class="small">Describe the work above to get suggestions.</p>'}
 ${past.length?`<div class="small u-3a361f">Similar past MOPs</div>${past.map(x=>row(x.id,x.label,`${Math.round(x.sc*100)}% similar`,cur&&cur.id===x.id)).join('')}`:''}
 <label class="f u-824603"><span>Or pick from the whole library</span><select data-pickl><option value="">Choose…</option>${allEntries().map(e=>`<option value="${esc(e.id)}" ${cur&&cur.id===e.id?'selected':''}>${esc(e.name)}${e.kind==='mop'?' (past MOP)':''}</option>`).join('')}</select></label>`}
const durMin=s=>{let m=0;String(s||'').toLowerCase().replace(/(\d+(?:\.\d+)?)\s*(d|day|days|h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/g,(_,n,u)=>{m+=parseFloat(n)*(u[0]==='d'?1440:u[0]==='h'?60:1)});return m};
function stepsTotal(r){const ms=r.steps.filter(x=>x.desc.trim()).map(x=>durMin(x.dur));return{min:ms.reduce((a,b)=>a+b,0),missing:ms.filter(x=>!x).length}}
const fmtMin=m=>m>=60?`${Math.floor(m/60)} h${m%60?' '+Math.round(m%60)+' min':''}`:`${Math.round(m)} min`;

/* The reference named the work types behind "Add cold storage / eyewash impact" by id. No library ids are
   baked into the public site (scan:site), so the entry is found by what its impacts cover, using the same
   patterns as the failure-mode rule that shows the button, on the work type's name, plus its field check. */
const IMPACT_RE={cold:/temperat|freez|cold room|incubat|setpoint/i,eyewash:/eye ?wash|shower/i};
function libForImpact(kind){const re=IMPACT_RE[kind];if(!re)return null;const std=allEntries().filter(e=>e.kind==='std'&&e.impacts&&e.impacts.length);
 /* explicit library field first (impactFor: 'cold' | 'eyewash'), else the type named for it that asks the same field check */
 return std.find(e=>e.impactFor===kind)||std.find(e=>re.test(e.name)&&e.checks&&e.checks[kind])||null}

export { libForImpact, live, norm, STOP, words, sim, recText, entryFromRecord, allEntries, libById, libMatches, similarPast, tok, fillFrom, chooseEntry, autoPick, onArrive, libPanel, durMin, stepsTotal, fmtMin };

// Request detail.
// Ported from reference/rebuild-4/index.html (r4:448-448; r4:454-484).
import { R, S, STEPS, STATUSES, SIDE, UTIL, GROUPS, SYSTEM_CODES, LOTO_CATS, CAT_MAP, CONTACT_ROLES, APPROVER_ROLES, ICON_MIC, $, esc, clone, uidGen, cfg, proj, safeUrl, pad3, mopLabel, toast, now, fS, fL, isoDay, pdDay, fromIso, fileUrl, D, later, render, saveDraft } from '../core/state.js';
import { conflictCards } from './conflicts.js';
import { notesFor } from '../core/record.js';
import { approverRows, sigOf, sigStatus } from '../approve/signatures.js';
import { outRecord, jllText } from '../export/outputs.js';
import { attThumb } from './screens.js';
import { msgList } from './html.js';
import { stageStrip, stageForm, jllPanel } from './stageForm.js';
import { stageName } from '../model/stages.js';
import { tierOf } from '../rules/tier.js';
import { flagsOf } from '../rules/dontKnow.js';
import { closeItems } from '../rules/closeOut.js';
import { fmtMin } from '../lib/library.js';

/* ---------- detail ---------- */
function vDetail(){const q=S.reqs[S.id];if(!q)return `<div class="empty">${S.ready?'This request was not found.':'Loading…'}</div>`;
 const sub=q.sub,r=(sub||q).record,p=proj(q.project),i=STATUSES.indexOf(q.status),si=q.stage||0,sc=sigStatus(q),ld=R.lead(r,now(),cfg().rules),c=cfg();
 
 const pre=ld?ld.milestones.map((m,k)=>({...m,k})).concat(r.pre.filter(x=>x.desc.trim()).map((x,j)=>({step:x.desc,when:x.dur,date:null,k:8+j}))):[];
 return `<div class="bar"><a class="btn sm" href="#board">Board</a><span class="sp"></span>${q.status==='Draft'?`<a class="btn sm pri" href="#e-${esc(q.id)}">${sub?(q.meta.pmFix?'Continue PM check':'Continue revision '+q.rev):'Continue draft'}</a>`:!SIDE.includes(q.status)&&q.status!=='Closed'?`<button class="btn sm" data-a="revise">Start a revision</button>`:''}</div>
 <h1 class="u-d6f2af">${esc(r.title||'Untitled')} <span class="tier t${tierOf(r).t}">Tier ${tierOf(r).t}</span></h1><p class="sub u-fe7b49">${esc(r.bldg)} ${esc(mopLabel(q))} · ${esc(p?.label||'')}${q.meta.requestId?' · '+esc(q.meta.requestId):''}${sub&&q.status==='Draft'?` · showing submitted rev ${sub.rev}; rev ${q.rev} in progress`:''}</p>
 ${stageStrip(q)}${conflictCards(q.id)}${SIDE.includes(q.status)?`<p class="note">${esc(q.status)}</p>`:''}
 <div class="bar u-905d8b">${SIDE.includes(q.status)?`<button class="btn" data-a="resume">Resume</button>`:q.status!=='Draft'?`<button class="btn" data-a="hold">Put on hold</button>`:''}${!['Cancelled','Closed'].includes(q.status)?`<button class="btn red" data-a="cancel">Cancel request</button>`:''}${sub&&S.canEdit?`<button class="btn" data-a="addlib">Add to library</button>`:''}</div>
 ${!SIDE.includes(q.status)?stageForm(q):''}
 ${!sub?'<div class="note">Not submitted yet. Outputs appear once the request is submitted.</div>':''}
 ${detailPilot(q)}
 <div class="cols"><div>
  ${sub?`<div class="box"><h3>Outputs (rev ${sub.rev}, submitted ${esc(fS(fromIso(sub.at)))})</h3>
   <div class="bar"><button class="btn pri sm" data-a="mop">MOP (.docx)</button><button class="btn sm" data-a="loto1" ${r.loto.needed==='Yes'?'':'disabled'}>LOTO log rows (.xlsx)</button><button class="btn sm" data-a="trk1">Impact Log row (.xlsx)</button><button class="btn sm" data-a="jlltxt" ${R.jllNeeded(r)?'':'disabled'}>JLL packet (.txt)</button></div>
   ${R.jllNeeded(r)?jllPanel(q):''}</div>`:''}
  <div class="box"><h3>Rule checks</h3>${msgList(notesFor(q),false)||'<p class="small">Nothing flagged.</p>'}</div>
  <div class="box"><h3>Request</h3><dl class="kv"><dt>Requester</dt><dd>${esc([r.req.name,r.req.company,r.req.phone,r.req.email].filter(Boolean).join(' · '))}</dd><dt>Where</dt><dd>${esc(r.bldg)} · ${esc(r.areas)}</dd><dt>When</dt><dd>${R.startOf(r)?esc(fS(R.startOf(r))+' '+R.fTime(R.startOf(r))):''} · ${esc(R.durText(r))}</dd><dt>Priority</dt><dd>${esc(r.priority)} · ${esc(r.inService)}</dd><dt>Discipline</dt><dd>${esc(r.discipline)} ${esc(r.system)}</dd><dt>Equipment / area</dt><dd>${esc(r.equip)}</dd><dt>Work</dt><dd>${esc(r.scope)}</dd><dt>Affected</dt><dd>${esc(r.users)}</dd></dl></div>
  <div class="box"><h3>Impacts</h3><div class="scroll"><table class="stack"><thead><tr><th>Kind</th><th>Impact</th><th>Mitigation</th></tr></thead><tbody>${r.impacts.filter(x=>x.impact.trim()).map(x=>`<tr><td>${esc(x.kind)}</td><td>${esc(x.impact)}</td><td>${esc(x.mitigation)}</td></tr>`).join('')}</tbody></table></div></div>
  ${r.loto.needed==='Yes'?`<div class="box"><h3>LOTO (${r.loto.points.length})</h3><div class="scroll"><table class="stack"><thead><tr><th>Type</th><th>Panel / equipment</th><th>Circuit / valve</th><th>Affected loads</th><th>Attachments</th></tr></thead><tbody>${r.loto.points.map(x=>`<tr><td>${esc(x.type)}${x.removal?' (removal)':''}</td><td>${esc(x.equip)}</td><td>${esc(x.point)}</td><td>${esc(x.affected)}</td><td><div class="bar u-f0abc1">${(x.att||[]).map(a=>`<a href="${esc(fileUrl(a.mid||a.id))}" title="${esc(a.cat+': '+a.name)}">${attThumb(a,false)}</a>`).join('')||'<span class="pill red">None</span>'}</div></td></tr>`).join('')}</tbody></table></div><p class="small">Safe-off by ${esc(r.loto.safeOff)}</p></div>`:''}
  ${q.files.length?`<div class="box"><h3>Files</h3><div class="thumbs">${q.files.map(f=>`<figure>${f.kind==='image'?`<a href="${esc(fileUrl(f.id))}"><img src="${esc(fileUrl(f.id))}" alt="${esc(f.name)}"></a>`:`<a class="ph" href="${esc(fileUrl(f.id))}">PDF</a>`}<figcaption>${esc(f.name)} · ${esc(f.cat)}</figcaption></figure>`).join('')}</div></div>`:''}
 </div><div>
  <div class="box"><h3>Pre-MOP steps</h3>${pre.length?`<ul class="ladder">${pre.map(m=>`<li><span class="dd">${m.date?esc(fS(m.date)):''}</span><span>${m.k+1}. ${esc(m.step)} <span class="small">${esc(m.when)}</span></span><input type="date" aria-label="Completed" data-pre="${m.k}" value="${esc(q.meta.preDone[m.k]||'')}"></li>`).join('')}</ul><p class="small">Completion dates print in the MOP’s Time Completed column and drive the tracker’s Yes/No columns.</p>`:'<p class="small">No start date.</p>'}
   <label class="ck"><input type="checkbox" data-meta="campus" ${q.meta.campus?'checked':''}><span>Campus notification sent</span></label>
   ${R.jllNeeded(r)?`<div class="g3"><label class="f"><span>JLL LOTO #</span><input data-jr="lotoNo" value="${esc(q.meta.jllRef.lotoNo||r.jllRef.lotoNo)}"></label><label class="f"><span>LOTO WO #</span><input data-jr="lotoWO" value="${esc(q.meta.jllRef.lotoWO||r.jllRef.lotoWO)}"></label><label class="f"><span>Assist WO #</span><input data-jr="assistWO" value="${esc(q.meta.jllRef.assistWO||r.jllRef.assistWO)}"></label></div>`:''}</div>
  <div class="box"><h3>Approvals ${sc.done}/${sc.total}</h3><p class="small">Electronic sign-off (accepted by GNE 11/24/26). Each person signs their own row. A new revision clears the signatures.</p>
   ${sub?approverRows(q).map(x=>{const s=sigOf(q,'a'+x.i),mine=s&&s.uid===S.uid;return `<div class="sig"><div>${esc(x.a.name||'—')} · ${esc(x.a.title)}<small>${x.na?'N/A: no JLL assist or LOTO':s?`Signed ${esc(fS(fromIso(s.at)))} by ${esc(S.names[s.uid]||'someone')}`:'Not signed'}</small></div>${x.na?'':!s&&S.canEdit&&i>=2?`<details class="rec"><summary>Record</summary><input aria-label="Approver name" data-recname="a${x.i}" value="${esc(x.a.name)}" placeholder="Approver name"><input aria-label="How" data-rechow="a${x.i}" placeholder="How (email, signed copy)"><button class="btn sm" data-a="record" data-s="a${x.i}">Record approval</button></details>`:''}${x.na?'':mine?`<button class="btn sm" data-a="unsign" data-s="a${x.i}">Withdraw</button>`:!s&&i>=2?`<button class="btn sm pri" data-a="sign" data-s="a${x.i}">Sign</button>`:''}</div>`}).join('')+
   ['author','super'].map(sl=>{const s=sigOf(q,sl),mine=s&&s.uid===S.uid;return `<div class="sig"><div>${sl==='author'?'MOP author':'Contractor supervisor approval'}<small>${s?`Signed ${esc(fS(fromIso(s.at)))} by ${esc(S.names[s.uid]||'someone')}`:'Not signed'}</small></div>${mine?`<button class="btn sm" data-a="unsign" data-s="${sl}">Withdraw</button>`:!s?`<button class="btn sm pri" data-a="sign" data-s="${sl}">Sign</button>`:''}</div>`}).join(''):'<p class="small">Opens after submission.</p>'}
   ${sub&&i<2?'<p class="small">GNE approver rows open once the request is Out for approval.</p>':''}</div>
  <div class="box"><h3>Google Drive</h3>${q.sync&&safeUrl(q.sync.mopLink)?`<p><a class="btn sm" href="${esc(safeUrl(q.sync.mopLink))}" target="_blank" rel="noopener noreferrer">Open the current MOP in Drive</a></p>`:'<p class="small">Not in Drive yet. It is saved there when this request syncs.</p>'}
   ${sub?`<p class="small">Download name: ${esc(R.baseName(outRecord(q),q.mopNo,sub.rev))}.docx</p>`:''}</div>
  <div class="box"><h3>History</h3><ul class="ladder">${q.history.slice().reverse().slice(0,14).map(h=>`<li><span class="dd">${esc(fS(fromIso(h.at)))}</span><span>${esc(h.what)}</span><span class="small">${esc(S.names[h.by]||'')}</span></li>`).join('')}</ul></div>
 </div></div>`}

/* Rebuild 5 detail boxes (r5:654-664): Don't know checks, Tier 3 peer review, close-out, after-job questions, pilot feedback. */
function detailPilot(q){const sub=q.sub;if(!sub)return '';const r=sub.record,fg=flagsOf(r),t=tierOf(r).t,c=cfg(),pf=q.meta.pilot;let h='';
 if(fg.length)h+=`<div class="box"><h3>Don’t know – XL PM to check (${fg.length})</h3><ul class="msgs">${fg.map(f=>`<li class="warn"><b>Check</b><span>${esc(f.m)}</span></li>`).join('')}</ul><p class="small">It can’t go out for approval until these are answered.</p>${q.status==='Submitted'?(S.canEdit?'<button class="btn sm pri" data-a="pmfix">Answer the checks</button>':'<p class="small">An editor (XL PM) answers these.</p>'):''}</div>`;
 if(t===3)h+=`<div class="box"><h3>Peer review (Tier 3)</h3>${q.meta.peer.name?`<p class="u-116966">Walked through with <b>${esc(q.meta.peer.name)}</b> on ${esc(fS(fromIso(q.meta.peer.at)))}.</p>`:`<p class="small">Before it goes out for approval, walk the MOP step by step with someone who didn’t write it (super, PM or the trade lead).</p><div class="bar"><input class="u-a5d7a0" data-peer placeholder="Reviewer’s name"><button class="btn sm pri" data-a="peer">Record</button></div>`}</div>`;
 if(['Executed','Closed'].includes(q.status)){const dis=q.status==='Closed'?'disabled':''; /* stage 8 + Work done = Executed (D1) */h+=`<div class="box"><h3>Close-out</h3><p class="small">Tick each one. It can’t be closed until all are done.</p>${closeItems(q).map(([k,l])=>`<label class="ck"><input type="checkbox" data-mp="close.${k}" ${q.meta.close[k]?'checked':''} ${dis}><span>${esc(l)}</span></label>`).join('')}
  <h3>After the job (2 minutes)</h3>${[['diff','What went differently from the MOP?'],['step','Any step wrong, missing or out of order?'],['time','Any step off by more than 30 minutes?']].map(([k,l])=>`<label class="f"><span>${l}</span><textarea data-mp="review.${k}" rows="2" ${dis}>${esc(q.meta.review[k]||'')}</textarea></label>`).join('')}
  ${q.meta.review.sent?'<p class="small">Sent to JK for the library.</p>':(q.meta.review.diff||q.meta.review.step||q.meta.review.time)?'<button class="btn sm" data-a="sugReview">Send to JK as a library suggestion</button>':''}</div>`}
 if(S.pilotOn)h+=`<div class="box"><h3>Pilot feedback</h3><p class="small">Helps JK fix the app. About 20 seconds.</p>
  <div class="f"><span>How was it to fill in?</span><div class="seg">${['Easy','OK','Hard'].map(v=>`<button type="button" class="${pf.fb.ease===v?'on':''}" data-a="fb" data-k="ease" data-v="${v}">${v}</button>`).join('')}</div></div>
  <div class="f"><span>Which screen took longest?</span><div class="chips">${STEPS.slice(0,9).map(v=>`<button type="button" class="chip ${pf.fb.slow===v?'on':''}" data-a="fb" data-k="slow" data-v="${v}">${v}</button>`).join('')}</div></div>
  <label class="f"><span>Anything confusing or missing?</span><textarea data-mp="pilot.fb.note" rows="2">${esc(pf.fb.note||'')}</textarea></label>
  <p class="small u-116966">Time in the app: ${fmtMin(Math.round((pf.activeSec||0)/60))} · Don’t know answers: ${pf.dk||0} · Library defaults changed: ${pf.edits||0}</p></div>`;
 return h}

export { vDetail, detailPilot };

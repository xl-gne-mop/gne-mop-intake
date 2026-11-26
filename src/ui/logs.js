// Logs and exports (Operations Impacts, LOTO requests, Pilot). Ported from reference/rebuild-5/index.html (r5:726-737).
import { R, S, STEPS, STATUSES, SIDE, UTIL, GROUPS, SYSTEM_CODES, LOTO_CATS, CAT_MAP, CONTACT_ROLES, APPROVER_ROLES, ICON_MIC, $, esc, clone, uidGen, cfg, proj, safeUrl, pad3, mopLabel, toast, now, fS, fL, isoDay, pdDay, fromIso, fileUrl, D, later, render, saveDraft } from '../core/state.js';
import { trackerVals, lotoVals } from '../export/outputs.js';
import { PILOT_COLS, pilotRows } from '../pilot/log.js';

const LOGS=['Operations Impacts','LOTO Requests','Pilot'];
function vLogs(){const list=Object.values(S.reqs).filter(q=>q.sub&&q.status!=='Cancelled'&&(!S.logP||q.project===S.logP)).sort((a,b)=>(R.startOf(a.sub.record)||0)-(R.startOf(b.sub.record)||0));
 const cols=S.logTab===2?PILOT_COLS:S.logTab?R.LOTO_COLS:R.IMP_COLS,rows=S.logTab===2?pilotRows():S.logTab?list.flatMap(lotoVals).map(r=>r.map(v=>v&&v.date?fS(v.date):typeof v==='boolean'?(v?'TRUE':'FALSE'):v)):list.map(trackerVals).map(r=>r.map(v=>typeof v==='boolean'?(v?'☒':'☐'):v));
 return `<div class="bar"><h1>Logs and exports</h1><span class="sp"></span><button class="btn pri" data-a="xtrk">Operations Impacts tracker (.xlsx)</button><button class="btn" data-a="xloto">LOTO log rows (.xlsx)</button>${S.logTab===2?'<button class="btn" data-a="xpilot">Pilot results (.csv)</button>':''}</div>
 <p class="sub u-8a77e5">Built from each request’s latest submitted revision, in the GNE file layouts. The tracker downloads as a complete workbook for the shared folder; LOTO rows are for appending to the GNE Lower Campus LOTO log. ${safeUrl(cfg().folder)?`<a href="${esc(safeUrl(cfg().folder))}">Open the folder</a>`:''}</p>
 <div class="bar"><select class="u-4a724c" data-lp><option value="">All projects</option>${cfg().projects.map(p=>`<option value="${esc(p.id)}" ${S.logP===p.id?'selected':''}>${esc(p.label)}</option>`).join('')}</select></div>
 <div class="tabs">${LOGS.map((l,i)=>`<button class="chip ${i===S.logTab?'on':''}" data-a="tab" data-i="${i}">${l}</button>`).join('')}</div>
 ${rows.length?`<div class="scroll"><table class="stack"><thead><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(rw=>`<tr>${rw.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'<div class="empty">No submitted requests yet.</div>'}`}


export { LOGS, vLogs };

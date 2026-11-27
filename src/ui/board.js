// Board. Ported from reference/rebuild-5/index.html (r5:492-512).
import { R, S, STEPS, STATUSES, SIDE, UTIL, GROUPS, SYSTEM_CODES, LOTO_CATS, CAT_MAP, CONTACT_ROLES, APPROVER_ROLES, ICON_MIC, $, esc, clone, uidGen, cfg, proj, safeUrl, pad3, mopLabel, toast, now, fS, fL, isoDay, pdDay, fromIso, fileUrl, D, later, render, saveDraft } from '../core/state.js';
import { tierOf } from '../rules/tier.js';
import { flagsOf } from '../rules/dontKnow.js';
import { conflictCards } from './conflicts.js';

/* ---------- board ---------- */
function nextDue(q){const r=(q.sub||q).record,ld=R.lead(r,now(),cfg().rules);if(!ld)return null;const i=ld.milestones.findIndex((m,k)=>!q.meta.preDone[k]);return i<0?null:{...ld.milestones[i],i}}
function vBoard(){const all=Object.values(S.reqs),f=S.filter,t=R.day0(now());
 const open=all.filter(q=>!['Closed','Cancelled'].includes(q.status));
 const st=q=>R.startOf((q.sub||q).record);
 const soon=open.filter(q=>{const s=st(q);return s&&s>=t&&s<=R.addDays(t,14)}).length;
 const late=open.filter(q=>{const n=nextDue(q);return q.status!=='Draft'&&n&&n.date<t}).length;
 const appr=open.filter(q=>q.status==='Out for approval').length;
 let list=all.filter(q=>(!f.p||q.project===f.p)&&(f.s==='all'||(f.s==='open'?!['Closed','Cancelled'].includes(q.status):q.status===f.s)));
 if(f.q){const k=f.q.toLowerCase();list=list.filter(q=>[q.record.title,mopLabel(q),q.record.bldg,q.record.areas,q.record.req.name,q.record.scope].join(' ').toLowerCase().includes(k))}
 list.sort((a,b)=>(st(a)||9e15)-(st(b)||9e15));
 const cards=list.map(q=>{const r=(q.sub||q).record,s=st(q),n=nextDue(q),lt=n&&q.status!=='Draft'&&n.date<t;
  const fl=[r.priority==='H'?'<span class="pill amb">High</span>':'',r.loto.needed==='Yes'?`<span class="pill">LOTO ${r.loto.points.length}</span>`:'',r.sup.impair==='Yes'?'<span class="pill amb">FLS impairment</span>':'',r.sup.cgmp==='Yes'?'<span class="pill amb">cGMP</span>':'',tierOf(r).t===3?'<span class="pill red">Tier 3</span>':'',flagsOf(r).length?`<span class="pill amb">${flagsOf(r).length} to check</span>`:'',q.meta.pmFix?'<span class="pill amb">PM check</span>':'',q.status==='Draft'&&q.sub?'<span class="pill amb">Revision in progress</span>':'',q.meta.onedrive.url?'<span class="pill ok">Filed</span>':''].join('');
  return `<a class="card" href="#r-${esc(q.id)}"><div class="d">${s?esc(fS(s)):'No date'}<small>${s?esc(R.fTime(s)):''}</small></div>
  <div><div class="t">${esc(r.title||'Untitled request')}</div><div class="m">${esc(mopLabel(q))} · ${esc(proj(q.project)?.label||'')} · ${esc(r.bldg)} ${esc(r.areas.split('\n')[0])}</div>
  ${n&&q.status!=='Draft'?`<div class="m ${lt?'late':''}">Next: ${esc(n.step)} by ${esc(fS(n.date))}${lt?' (late)':''}</div>`:''}<div class="flags">${fl}</div></div>
  <div class="r"><span class="pill ${['Approved','Executed','Closed'].includes(q.status)?'ok':q.status==='Draft'?'amb':''}">${esc(q.status)}</span></div></a>`}).join('');
 return `<div class="bar"><h1>Shutdowns and MOPs</h1><span class="sp"></span><a class="btn big-start" href="#import">Start from an existing MOP</a><a class="btn pri" href="#new">New request</a></div>
 <div class="stats"><div class="stat"><b>${open.length}</b><span>Open requests</span></div><div class="stat"><b>${soon}</b><span>Starting in the next 14 days</span></div><div class="stat ${late?'alert':''}"><b>${late}</b><span>Behind on a pre-MOP step</span></div><div class="stat"><b>${appr}</b><span>Out for approval</span></div></div>
 <div class="g3"><label class="f"><span>Project</span><select data-flt="p"><option value="">All projects</option>${cfg().projects.map(p=>`<option value="${esc(p.id)}" ${f.p===p.id?'selected':''}>${esc(p.label)}</option>`).join('')}</select></label>
 <label class="f"><span>Status</span><select data-flt="s">${[['open','Open'],['all','All'],...[...STATUSES,...SIDE].map(s=>[s,s])].map(([v,l])=>`<option value="${esc(v)}" ${f.s===v?'selected':''}>${esc(l)}</option>`).join('')}</select></label>
 <label class="f"><span>Search</span><input data-flt="q" value="${esc(f.q)}" placeholder="Title, MOP #, room, name"></label></div>
 ${conflictCards()}
 ${list.length?`<div>${cards}</div>`:`<div class="empty">${S.ready?(all.length?'Nothing matches these filters.':'No requests yet. Start one with New request.'):'Loading shared requests…'}</div>`}
 ${vRemote()}`}
/* Everyone's requests (D6): from Smartsheet, on demand; opening one downloads it from Drive. */
function vRemote(){const mine=new Set(Object.values(S.reqs).map(q=>q.meta&&q.meta.requestId).filter(Boolean)),rl=(S.remote||[]).filter(e=>!mine.has(e.requestId));
 return `<section class="remote" aria-label="Everyone's requests"><div class="bar"><h2>Everyone's requests</h2><span class="sp"></span><button class="btn" type="button" data-a="remote">${S.remote?'Refresh':'Show'}</button></div>
 ${S.remoteMsg?`<p class="small">${esc(S.remoteMsg)}</p>`:''}${S.remote&&!rl.length?'<p class="small">No other requests.</p>':''}
 ${rl.map(e=>`<div class="card"><div class="d">${esc(e.mop?'MOP-'+e.mop:'')}</div><div><div class="t">${esc(e.scope.split('\n')[0].slice(0,90)||e.requestId)}</div><div class="m">${esc(e.requestId)} · ${esc(e.job)} · ${esc(e.name)}</div></div><div class="r"><span class="pill">${esc(e.stage)}</span><button class="btn sm" type="button" data-a="ropen" data-k="${esc(e.requestId)}">Open</button></div></div>`).join('')}</section>`}


export { nextDue, vBoard, vRemote };

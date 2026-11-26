// E-signatures (sign-off slots per request revision).
// Ported from reference/rebuild-4/index.html (r4:449-453; r4:666-669); function bodies kept as close to verbatim as possible.
import { R, S, STEPS, STATUSES, SIDE, UTIL, GROUPS, SYSTEM_CODES, LOTO_CATS, CAT_MAP, CONTACT_ROLES, APPROVER_ROLES, ICON_MIC, $, esc, clone, uidGen, cfg, proj, safeUrl, pad3, mopLabel, toast, now, fS, fL, isoDay, pdDay, fromIso, fileUrl, D, later } from '../core/state.js';
import { saveReq } from '../core/save.js';

function sigKey(q,slot){return `${q.id}|${q.sub?q.sub.rev:q.rev}|${slot}`}
function sigOf(q,slot){const k=sigKey(q,slot);for(const[u,m]of Object.entries(S.sigs))if(m&&m[k])return{uid:u,at:m[k].at};return null}
function approverRows(q){const p=proj(q.project);if(!p)return[];const r=(q.sub||q).record,jll=R.jllNeeded(r);
 return p.approvers.map((a,i)=>({i,a,na:/\bJLL\b/i.test(a.title)&&!jll,blank:!a.name.trim()&&!a.title.trim()})).filter(x=>!x.blank)}
function sigStatus(q){const rows=approverRows(q).filter(x=>!x.na);return{done:rows.filter(x=>sigOf(q,'a'+x.i)).length,total:rows.length}}
// Signatures live in the request (meta.signoffs[uid][sigKey] = {at, name}) instead of a shared signoffs store,
// so they travel with request.json (D6). S.sigs / S.names are rebuilt from all requests (rebuildSigs).
async function sign(q,slot,on){if(!S.uid){toast('Sign in to sign.');return}const k=sigKey(q,slot);const c2=clone(q);c2.meta.signoffs=c2.meta.signoffs||{};const cur=c2.meta.signoffs[S.uid]||{};
 if(on)cur[k]={at:new Date().toISOString(),name:S.meName||''};else delete cur[k];c2.meta.signoffs[S.uid]=cur;
 try{await saveReq(c2,(on?'Signed: ':'Signature withdrawn: ')+slotName(q,slot));rebuildSigs()}catch(e){toast('Could not record the signature.')}}
/* D9: an editor records an approval given outside the app (email or attached signed copy). */
async function recordApproval(q,slot,{name,at,how}){if(!S.canEdit){toast('Only editors can record an approval.');return}const uid='rec:'+(name||'approver');const c2=clone(q);c2.meta.signoffs=c2.meta.signoffs||{};const cur=c2.meta.signoffs[uid]||{};
 cur[sigKey(q,slot)]={at:at||new Date().toISOString(),name:name||'',how:how||'',by:S.uid||''};c2.meta.signoffs[uid]=cur;await saveReq(c2,`Approval recorded: ${slotName(q,slot)} – ${name} (${how||'outside the app'})`);rebuildSigs()}
function rebuildSigs(){const sigs={},names={...S.names};for(const q of Object.values(S.reqs))for(const[uid,m]of Object.entries((q.meta&&q.meta.signoffs)||{})){sigs[uid]={...(sigs[uid]||{}),...m};for(const v of Object.values(m))if(v&&v.name)names[uid]=v.name}S.sigs=sigs;S.names=names}
function slotName(q,slot){if(slot==='author')return 'MOP author';if(slot==='super')return 'Contractor supervisor';const a=proj(q.project)?.approvers[+slot.slice(1)];return a?`${a.title}${a.name?' ('+a.name+')':''}`:slot}

export { sigKey, sigOf, approverRows, sigStatus, sign, slotName, recordApproval, rebuildSigs };

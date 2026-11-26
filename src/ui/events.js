// Events and routing.
// Ported from reference/rebuild-4/index.html (r4:671-773).
import { R, S, STEPS, STATUSES, SIDE, UTIL, GROUPS, SYSTEM_CODES, LOTO_CATS, CAT_MAP, CONTACT_ROLES, APPROVER_ROLES, ICON_MIC, $, esc, clone, uidGen, cfg, proj, safeUrl, pad3, mopLabel, toast, now, fS, fL, isoDay, pdDay, fromIso, fileUrl, D, render } from '../core/state.js';
import { resolveConflict } from '../sync/wire.js';
import { ensureX, newRecord, normReq, gapsFor } from '../core/record.js';
import { saveReq } from '../core/save.js';
import { entryFromRecord, libById, chooseEntry, fillFrom, onArrive, stepsTotal } from '../lib/library.js';
import { readImport, applyImport } from '../import/read.js';
import { outRecord, jllText, b64, buildMop, buildTracker, buildLoto } from '../export/outputs.js';
import { sigStatus, sign, recordApproval, approverRows } from '../approve/signatures.js';
import { upload, uploadLoto, openMarkup } from '../attach/markup.js';
import { NEU, g, s_, leadHTML, refreshGaps } from './screens.js';
import { gateFor, applyStage, stageMeta, statusFor, stageName, bumpDocRev, reissuesAt } from '../model/stages.js';
import { saveLib, removeLib } from '../library/local.js';
import { setSetting } from '../store/settings.js';
import { saveFile } from '../util/download.js';
import { signOut } from '../auth/signout.js';
import { countOutbox } from '../store/outbox.js';
import { exportBackup } from '../store/backup.js';
import { tok, autoPick, libForImpact } from '../lib/library.js';
import { canSkip } from './screens.js';
import { trackEdit, clearFlag } from './editHelpers.js';
import { flagsOf } from '../rules/dontKnow.js';
import { tierOf } from '../rules/tier.js';
import { closeGaps } from '../rules/closeOut.js';
import { HOLD_E_T, HOLD_P_T, TEST_T, workIdx, insStep } from '../rules/fixes.js';
import { findTags } from '../dictation/parse.js';
import { sendSug, dismissSuggestion } from '../library/suggest.js';
import { ledFrom, libPublish, libSaveDraft, markReviewed } from '../library/editor.js';
import { PILOT_COLS, pilotRows, csv, setPilot, PILOT_NEEDS_IDS } from '../pilot/log.js';

const app = $('#app');
const q0 = () => S.view === 'detail' ? S.reqs[S.id] : null;

/* ---------- events ---------- */
let saveT;
function saveDraft(){clearTimeout(saveT);const q=S.draft;if(!q||!S.dirty)return Promise.resolve(true);S.dirty=false;const n=$('#saveNote');if(n)n.textContent='Saved';if(!q.project&&!D().title)return Promise.resolve(true);return saveReq(q)}
const later=()=>{S.dirty=true;const n=$('#saveNote');if(n)n.textContent='Saving…';clearTimeout(saveT);saveT=setTimeout(saveDraft,900)};
S.hooks.saveDraft=saveDraft;S.hooks.later=later;
function openEdit(q,step=0){S.draft=normReq(clone(q));S.step=step;S.view='edit';S.openPt=S.draft.record.loto.points.length?-1:0}
function go(h){if(location.hash===h)route();else location.hash=h}
function route(){const h=location.hash.slice(1);
 if(S.view==='edit'&&S.dirty)saveDraft();
 if(h==='new'){if(!(S.view==='edit'&&S.draft&&!S.draft.mopNo&&!S.reqs[S.draft.id]?.sub)){const q=normReq({});const me={...(S.me||{})};const proj0=me.project;delete me.project;Object.assign(q.record.req,me);if(!q.record.req.name)q.record.req.name=S.meName;if(!q.record.req.email&&S.uid)q.record.req.email=S.uid;me.project=proj0;const cr=S.crew||[];if(Array.isArray(cr)&&cr.length)q.record.workers=cr.slice(0,R.LIMITS.workers).map(w=>({name:w.name||'',title:w.title||'',company:w.company||''}));if(me.project)q.project=me.project;openEdit(q)}}
 else if(h.startsWith('e-')&&S.reqs[h.slice(2)]){if(!(S.view==='edit'&&S.draft&&S.draft.id===h.slice(2)))openEdit(S.reqs[h.slice(2)])}
 else if(h.startsWith('r-')){S.view='detail';S.id=h.slice(2)}
 else if(h==='logs'||h==='settings'||h==='help')S.view=h;else S.view='board';
 render();window.scrollTo(0,0)}
function wireEvents(){window.addEventListener('hashchange',route);
app.addEventListener('input',e=>{const t=e.target;S.lastAct=Date.now();
 if(t.dataset.le&&S.ledit){S.ledit[t.dataset.le]=t.type==='checkbox'?t.checked:t.value;return}
 if(t.dataset.sug!==undefined&&S.sug){S.sug.text=t.value;return}
 if(t.dataset.k&&S.draft){const old=S.prevVal&&S.prevVal.k===t.dataset.k?S.prevVal.v:g(D(),t.dataset.k);if(!S.prevVal||S.prevVal.k!==t.dataset.k)S.prevVal={k:t.dataset.k,v:old};s_(D(),t.dataset.k,t.type==='checkbox'?t.checked:t.value);clearFlag(t.dataset.k,t.value);trackEdit(t.dataset.k,old,t.value);later();refreshGaps();if(t.type==='datetime-local'||t.dataset.k==='durVal'){const z=$('.zone');if(z&&S.step===2)z.outerHTML=leadHTML()}return}
 if(t.dataset.flt==='q'){S.filter.q=t.value;const pos=t.selectionStart;render();const n=$('[data-flt=q]');n.focus();n.setSelectionRange(pos,pos)}});
app.addEventListener('change',e=>{const t=e.target;S.lastAct=Date.now();
 if(t.dataset.le&&S.ledit){S.ledit[t.dataset.le]=t.type==='checkbox'?t.checked:t.value;if(t.dataset.le==='major')render();return}
 if(t.dataset.k&&S.draft){const old=g(D(),t.dataset.k);s_(D(),t.dataset.k,t.type==='checkbox'?t.checked:t.value);clearFlag(t.dataset.k,t.value);if(t.tagName==='SELECT')trackEdit(t.dataset.k,old,t.value);R.normalize(D());later();if(t.dataset.rr!==undefined||t.type==='datetime-local')render();return}
 if(t.dataset.pj!==undefined&&S.draft){S.draft.project=t.value;const p=proj(t.value);if(p&&!D().bldg)D().bldg=p.bldg;later();render();return}
 if(t.dataset.fc!==undefined&&S.draft){S.draft.files[+t.dataset.fc].cat=t.value;later();return}
 if(t.dataset.pickl!==undefined&&S.draft){if(!t.value)return;chooseEntry(t.value);if(S.step===7){const f=fillFrom(libById(t.value),7,!D().steps.some(x=>x.desc.trim())?false:true);toast('Steps from '+libById(t.value).name+(f.length?': '+f.join(', '):''))}render();return}
 if(t.dataset.copyfrom!==undefined&&S.draft){const id=t.value;if(!id)return;const src=id.startsWith('req:')?S.reqs[id.slice(4)].sub.record:null;const e=src?null:libById(id);
  const r=D(),keep={req:r.req,author:r.author};const base=src?clone(src):clone(e?(()=>{const x=newRecord();Object.assign(x,{title:'',scope:e.text||''});return x})():newRecord());
  if(src){Object.assign(r,base,keep);r.start='';r.emergJust='';r.jllRef={assistWO:'',lotoWO:'',lotoNo:''};r.loto.points.forEach(p=>{p.att=[];p.removal=false});r.title=src.title;ensureX(r);r.x.lib={id,name:'copy',kind:'mop'};if(!S.draft.project)S.draft.project=S.reqs[id.slice(4)].project}
  else{chooseEntry(id,true);[1,4,5,6,7].forEach(k=>fillFrom(e,k))}
  later();render();toast('Copied. Check every screen, then add the new dates.');return}
 if(t.dataset.impfile!==undefined&&t.files.length){const f=t.files[0];t.value='';readImport(f).then(o=>{S.imp=o;render()}).catch(e=>toast(e&&e.message?e.message:'Could not read that file.'));return}
 if(t.dataset.impnew!==undefined&&t.files.length&&S.draft){const f=t.files[0];t.value='';S.busyImp=true;render();readImport(f).then(o=>{S.impNew=o}).catch(e=>toast(e&&e.message?e.message:'Could not read that file.')).finally(()=>{S.busyImp=false;render()});return}
 if(t.dataset.uploto!==undefined&&t.files.length){uploadLoto(+t.dataset.uploto,[...t.files]);t.value='';return}
 if(t.dataset.acat&&S.draft){const[k,j]=t.dataset.acat.split('.').map(Number);D().loto.points[k].att[j].cat=t.value;later();return}
 if(t.dataset.aprem&&S.draft){const[k,j]=t.dataset.aprem.split('.').map(Number);D().loto.points[k].att[j].premarked=t.checked;later();render();return}
 if(t.dataset.flt&&t.dataset.flt!=='q'){S.filter[t.dataset.flt]=t.value;render();return}
 if(t.dataset.lp!==undefined){S.logP=t.value;render();return}
 if(t.dataset.up!==undefined&&t.files.length){upload([...t.files]);t.value='';return}
 const q=S.reqs[S.id];
 if(q&&t.dataset.pre!==undefined){const c2=clone(q);c2.meta.preDone[+t.dataset.pre]=t.value;saveReq(c2,`Pre-MOP step ${+t.dataset.pre+1} ${t.value?'completed '+fS(pdDay(t.value)):'cleared'}`).then(render);return}
 if(q&&t.dataset.st){const c2=clone(q),st=stageMeta(c2),k=t.dataset.st;if(k.startsWith('walk.'))st.walk[k.slice(5)]=t.value;else if(k.startsWith('close.'))st.close[k.slice(6)]=t.checked;else st[k]=t.type==='checkbox'?t.checked:t.value;if(k==='workDone'&&c2.stage===8)c2.status=statusFor(8,st);S.quiet=true;saveReq(c2,'').finally(()=>{S.quiet=false;if(k==='workDone')render()});return}
 if(t.dataset.pilot!==undefined){setPilot(t.checked).then(ok=>{if(!ok)toast(PILOT_NEEDS_IDS);render()});return}
 if(q&&t.dataset.mp){const c2=clone(q),lab=(t.closest('label')||{}).textContent||'';s_(c2.meta,t.dataset.mp,t.type==='checkbox'?t.checked:t.value);S.quiet=t.type!=='checkbox';saveReq(c2,t.type==='checkbox'?`Close-out ${t.checked?'ticked':'unticked'}: ${lab.trim()}`:'').finally(()=>{const was=S.quiet;S.quiet=false;if(!was)render()});return}
 if(q&&t.dataset.meta==='campus'){const c2=clone(q);c2.meta.campus=t.checked;saveReq(c2,t.checked?'Campus notification sent':'Campus notification cleared');return}
 if(q&&t.dataset.jr){const c2=clone(q);c2.meta.jllRef[t.dataset.jr]=t.value.trim();S.quiet=true;saveReq(c2,`JLL ${t.dataset.jr} ${t.value.trim()}`).finally(()=>{S.quiet=false});return}
 /* OneDrive filed-MOP link removed: the MOP link comes from Drive sync (PARITY 8.3). */
   });
app.addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(!b)return;const a=b.dataset.a,i=+b.dataset.i;
 if(a==='mic'){const el=b.parentElement.querySelector('textarea');if(!S.dict)return;if(S.dict.active()&&S.dictEl===el){S.dict.stop().catch(()=>{});return}
  if(S.dict.active())S.dict.stop().catch(()=>{});S.dictEl=el;S.dict.start().catch(err=>{if(err&&err.code==='not_granted')toast('Microphone not allowed. Keep typing.');else if(err&&err.code!=='stopped')toast('Dictation is not available right now.')});return}
 e.preventDefault();
 if(a==='print'){window.print();return}
 if(a==='remote'){S.remoteMsg='Loading…';render();S.remoteApi.list().then(l=>{S.remote=l;S.remoteMsg=''}).catch(err=>{S.remoteMsg=err.message||'Could not load. Your work is saved on this phone.'}).then(render);return}
 if(a==='ropen'){const en=(S.remote||[]).find(x=>x.requestId===b.dataset.k);if(!en)return;S.remoteMsg='Opening…';render();S.remoteApi.open(en).then(q=>{S.remoteMsg='';location.hash='#r-'+q.id;render()}).catch(err=>{S.remoteMsg=err.message||'Could not open it.';render()});return}
 if(a==='cf-mine'||a==='cf-theirs'){if(!S.canEdit)return;resolveConflict(b.dataset.id,b.dataset.k,a==='cf-mine'?'mine':'theirs').then(async()=>{await S.hooks.reloadData();render();toast(a==='cf-mine'?'This phone\'s value will be sent on the next sync.':'Kept. Nothing will be overwritten.');if(S.session)S.session.syncNow()});return}
 const rr=()=>{R.normalize(D());later();render()};
 if(a==='go'){const to=Math.max(0,Math.min(9,i)),fwd=to===S.step+1;S.step=to;onArrive(S.step);
  if(fwd){const sk=[];while(S.step<9&&canSkip(S.step)){sk.push(STEPS[S.step]);S.step++;onArrive(S.step)}if(sk.length)setTimeout(()=>toast(`Tier 1: ${sk.join(', ')} filled from the library and skipped. Tap them above to check.`),50)}
  saveDraft();render();window.scrollTo(0,0);return}
 if(a==='seg'){const p=b.dataset.p,old=g(D(),p),v=b.dataset.v;s_(D(),p,v);delete D().x.flags[p];trackEdit(p,old,v);if(p==='loto.needed'&&v==='Yes'&&!D().loto.points.length){D().loto.points.push(NEU.points());S.openPt=0}return rr()}
 if(a==='dk'){const p=b.dataset.p,r=D();if(r.x.flags[p])delete r.x.flags[p];else{r.x.flags[p]=true;if(!b.classList.contains('chip'))s_(r,p,'')}return rr()}
 if(a==='insHold'){const r=D(),el=r.loto.points.some(p=>p.type==='Electrical');if(insStep(workIdx(r),el?HOLD_E_T:HOLD_P_T,'5 mins'))toast('Hold point added before the work step.');return rr()}
 if(a==='insTest'){const r=D(),h=r.steps.findIndex(x=>/HOLD POINT/i.test(x.desc)),w=workIdx(r);if(insStep(h>=0&&h<w?h:w,TEST_T,'10 mins'))toast('Voltage test added.');return rr()}
 if(a==='insHot'){const r=D(),w=workIdx(r);[['GNE permit authorizing individual inspects and signs the hot work permit','15 mins'],['Clear combustibles 35 ft or cover them; screens up; extinguisher at the work','20 mins'],['Siemens FLS isolates and covers the detectors near the hot work','15 mins']].reverse().forEach(([d,u])=>insStep(w,d,u));
  const w2=workIdx(D());insStep(w2+1,'Fire watch continues 60 mins after hot work ends','1 hour');insStep(w2+2,'Siemens FLS removes covers, restores and tests the detectors','20 mins');toast('Hot work steps added around the work step.');return rr()}
 if(a==='insAlarm'){const r=D();insStep(Math.max(0,r.steps.filter(x=>x.desc.trim()).length-1),'Siemens / GNE IT restores every suppressed alarm and point on the list; confirm none active','15 mins');return rr()}
 if(a==='addImp'){const r=D(),e=libForImpact(b.dataset.v);if(!e){toast('No library work type covers this yet. Type the impact.');return}const im=e.impacts.slice(0,b.dataset.v==='cold'?2:1).map(i=>({kind:i.kind,impact:tok(i.impact,r),mitigation:tok(i.mitigation,r)}));if(r.impacts.length===1&&!r.impacts[0].impact.trim())r.impacts=[];r.impacts.push(...im);toast('Impact added. Edit it to fit the job.');return rr()}
 if(a==='tagApply'){const r=D(),ft=findTags(r.scope),f=[];let sc=r.scope;ft.spoken.forEach(x=>{sc=sc.split(x.from).join(x.tag)});if(sc!==r.scope){r.scope=sc;f.push('tags cleaned up')}
  if(!r.equip.trim()&&ft.tags.length){r.equip=ft.tags.join(', ');f.push('equipment')}if(!r.bldg.trim()&&ft.bldg.length){r.bldg=ft.bldg[0];f.push('building')}
  if(!r.areas.trim()&&ft.rooms.length){r.areas=ft.rooms.join('\n');f.push('rooms')}if(!r.durVal&&ft.dur&&ft.dur.val>0){r.durVal=String(ft.dur.val);r.durUnit=ft.dur.unit;f.push('duration')}
  if(!r.title.trim()&&sc.trim()){let t=sc.trim().split(/[.!?]\s/)[0];const cut=t.slice(15).search(/\s(because|so that|so we|for about|for approx|for \d|for (one|two|three|four|five|six|eight|ten|twelve|half)|due to|in order to)\b/i);if(cut>=0)t=t.slice(0,15+cut);if(t.length>70)t=t.slice(0,70).replace(/\s+\S*$/,'');r.title=t;f.push('title')}
  r.x.scopeOk=true;autoPick();toast(f.length?'Filled: '+f.join(', ')+'. Check them.':'Nothing new to fill.');return rr()}
 if(a==='tagLoto'){const r=D(),v=b.dataset.v;r.loto.needed='Yes';delete r.x.flags['loto.needed'];const em=r.loto.points.find(p=>!p.equip&&!p.point&&!p.affected),p=em||NEU.points();p.equip=v;p.type=/^(V|CV|PRV|TMV)-/.test(v)?'Piping / valve':'Electrical';const cm=new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s+(?:circuits?|ckts?|breakers?|valves?)\\s+(\\d[\\d,\\s&and-]*\\d|\\d)','i').exec(r.scope);if(cm&&!p.point)p.point=cm[1].replace(/\s*(,|&|\band\b)\s*/g,', ').replace(/(,\s*)+/g,', ').trim();if(!em)r.loto.points.push(p);toast(`${v} added as an isolation point. Finish it on the LOTO screen.`);return rr()}
 if(a==='sugOpen'){S.sug={text:''};render();return}
 if(a==='sugCancel'){S.sug=null;render();return}
 if(a==='sugSend'){if(!S.sug||S.sug.text.trim().length<5){toast('Say what should change first.');return}sendSug(S.sug.text,null).then(ok=>{if(ok){S.sug=null;render()}});return}
 if(a==='arr'){trackEdit(b.dataset.p,'x','y');const arr=g(D(),b.dataset.p),k=arr.indexOf(b.dataset.v);k<0?arr.push(b.dataset.v):arr.splice(k,1);return rr()}
 if(a==='add'){const arr=g(D(),b.dataset.p);arr.push(NEU[b.dataset.key]());if(b.dataset.key==='points')S.openPt=arr.length-1;return rr()}
 if(a==='del'){g(D(),b.dataset.p).splice(i,1);if(b.dataset.p==='loto.points'){S.openPt=-1;const F=D().x.flags,n={};Object.keys(F).forEach(k=>{const m=/^loto\.points\.(\d+)\.(.*)$/.exec(k);if(!m||+m[1]<i)n[k]=F[k];else if(+m[1]>i)n[`loto.points.${m[1]-1}.${m[2]}`]=F[k]});D().x.flags=n}return rr()}
 if(a==='up'){const arr=g(D(),b.dataset.p);[arr[i-1],arr[i]]=[arr[i],arr[i-1]];return rr()}
 if(a==='openPt'){S.openPt=i;render();return}
 if(a==='ashow'){const at=D().loto.points[+b.dataset.k].att[+b.dataset.j];at.shows[b.dataset.v]=!at.shows[b.dataset.v];return rr()}
 if(a==='arm'){D().loto.points[+b.dataset.k].att.splice(+b.dataset.j,1);return rr()}
 if(a==='markup'){openMarkup(+b.dataset.k,+b.dataset.j);return}
 if(a==='uselib'){chooseEntry(b.dataset.id);render();return}
 if(a==='refill'||a==='replace'){const e=libById(D().x.lib.id);const f=fillFrom(e,7,a==='replace');later();render();toast(f.length?'Filled: '+f.join(', '):'Nothing empty to fill.');return}
 if(a==='usedur'){const t=stepsTotal(D());D().durVal=String(Math.round(t.min/6)/10);D().durUnit='hours';later();render();return}
 if(a==='addlib'&&q0()){const q=q0();if(!S.canEdit){toast('Only editors can add to the library.');return}const id='m'+uidGen();const e=entryFromRecord(q.sub.record,id,`${q.sub.record.bldg} ${mopLabel(q)} – ${q.sub.record.title}`,proj(q.project)?.label||'');saveLib(e);return}
 if(a==='rmlib'){if(!S.canEdit)return;removeLib(b.dataset.id).then(()=>{toast('Removed from the library drafts.');render()});return}
 if(a==='viewlib'){S.libView=S.libView===b.dataset.id?null:b.dataset.id;render();return}
 if(a==='libEdit'){const e=libById(b.dataset.id);if(!e)return;const dr=S.lib.find(x=>x.status==='Draft'&&x.target===e.id);S.ledit=dr?ledFrom(dr,e.id,dr.bv||e.ver||'1.0',e):ledFrom(e,e.id,e.ver||'1.0',e);render();window.scrollTo(0,0);return}
 if(a==='libOpenDraft'){const dr=S.lib.find(x=>x.id===b.dataset.id);if(!dr)return;const cur=libById(dr.target);S.ledit=ledFrom(dr,dr.target,dr.bv||'',cur);S.ledit.sugId=dr.sugId||'';render();window.scrollTo(0,0);return}
 if(a==='libDelDraft'){removeLib(b.dataset.id).then(()=>{toast('Draft deleted.');render()});return}
 if(a==='libNew'){S.ledit=ledFrom({name:'',tier:2,discipline:'Mechanical',systemCode:'00 General',lotoType:'',sys:{env:{level:'L',items:['Noise']}},sup:{},impacts:[],pre:[],checks:{}},'w'+uidGen(),'',null);render();return}
 if(a==='libCancel'){S.ledit=null;render();return}
 if(a==='libCmp'){S.ledit.cmp=!S.ledit.cmp;render();return}
 if(a==='libSaveDraft'){libSaveDraft();return}
 if(a==='libPublish'){libPublish();return}
 if(a==='libRev'){const e=libById(b.dataset.id);if(!e)return;const o=clone(e);delete o.gne;o.kind='std';o.status='Active';o.reviewed=fS(now());markReviewed(o).then(()=>toast(`${e.name}: marked reviewed ${o.reviewed}.`)).catch(()=>toast('Only editors can do this.'));return}
 if(a==='sugDraft'){const x=(S.sugs||[]).find(y=>y.id===b.dataset.id),e=x&&libById(x.entryId);if(!e)return;S.ledit=ledFrom(e,e.id,e.ver||'1.0',e);S.ledit.summary='From the field ('+(x.byName||'')+'): '+x.text;S.ledit.sugId=x.id;render();window.scrollTo(0,0);return}
 if(a==='sugDone'){dismissSuggestion(b.dataset.id).then(()=>{toast('Dismissed.');render()});return}
 if(a==='saveimp'&&S.imp){const nm=($('[data-impname]')||{}).value||S.imp.name;const e=entryFromRecord(ensureX(R.parseRecord(S.imp.rec)),'m'+uidGen(),nm.trim()||'Imported MOP','imported '+S.imp.file);saveLib(e);S.imp=null;render();return}
 if(a==='cancelimp'){S.imp=null;render();return}
 if(a==='useimp'&&S.impNew){applyImport(S.impNew);return}
 if(a==='dropimp'){S.impNew=null;render();return}
 if(a==='dlxl'){saveFile('MOP Intake - Excel Template.xlsx',b64(S.tpl.intake));return}
 if(a==='rmFile'){S.draft.files.splice(i,1);return rr()}
 if(a==='save'){S.dirty=true;saveDraft().then(ok=>toast(ok?'Saved':'Not saved'));return}
 if(a==='close'){const q=S.draft;saveDraft();S.view='';go(S.reqs[q.id]?'#r-'+q.id:'#board');return}
 if(a==='submit'){const q=S.draft;if(gapsFor(q).length)return;const p=proj(q.project);R.normalize(q.record);
  if(!q.mopNo){const used=Object.values(S.reqs).filter(x=>x.project===q.project&&x.mopNo).map(x=>x.mopNo);q.mopNo=Math.max((p?p.next:1)-1,...used,0)+1}
  S.me={...q.record.req,project:q.project};setSetting('me',S.me);
  {const cr=q.record.workers.filter(w=>w.name.trim());if(cr.length){S.crew=cr;setSetting('crew',cr)}}
  const at=new Date().toISOString();if(!q.firstAt)q.firstAt=at;const pmf=q.meta.pmFix;q.sub={rev:q.rev,at,record:clone(q.record),files:clone(q.files)};const first=!q.stage;if(first){q.stage=1;q.status='Submitted';stageMeta(q).log.push({stage:1,at})}else if(q.stage>=6){q.stage=3;q.status=statusFor(3,stageMeta(q))}else q.status=statusFor(q.stage,stageMeta(q));S.dirty=false;clearTimeout(saveT);
  if(!pmf){q.meta.pilot.subAt=at;q.meta.pilot.dk=flagsOf(q.record).length;q.meta.pilot.edits=Object.keys(q.record.x.autoEd||{}).length}q.meta.pmFix=false;
  saveReq(q,pmf?`Checks answered; ${mopLabel(q)} resubmitted`:`Submitted ${mopLabel(q)}${flagsOf(q.record).length?` with ${flagsOf(q.record).length} Don't know answer(s) for the PM`:''}`,{kind:pmf?'checks.answered':first?'stage.advance':'revision.submit'});toast(`Submitted as ${mopLabel(q)}`);S.view='';go('#r-'+q.id);return}
 const q=S.reqs[S.id];
 if(a==='adv'&&q){const n=(q.stage||0)+1,r=(q.sub||q).record;
  // Read what is on screen in the stage form first: a field typed just before the tap may not have fired 'change' yet.
  const cur=clone(q),st0=stageMeta(cur);document.querySelectorAll('#app fieldset.stageform [data-st]').forEach(el=>{const k=el.dataset.st,v=el.type==='checkbox'?el.checked:el.value;if(k.startsWith('walk.'))st0.walk[k.slice(5)]=v;else if(k.startsWith('close.'))st0.close[k.slice(6)]=v;else st0[k]=v});
  document.querySelectorAll('#app fieldset.stageform [data-jr]').forEach(el=>{cur.meta.jllRef[el.dataset.jr]=el.value.trim()});document.querySelectorAll('#app fieldset.stageform [data-meta="campus"]').forEach(el=>{cur.meta.campus=el.checked});
  const gate=gateFor(cur,n,{jllNeeded:R.jllNeeded,approvalsDone:sigStatus(q),hasGoNoGo:R.lines(r.gonogo).length>0&&R.lines(r.backout).length>0,flags:flagsOf(r),tier:tierOf(r).t,closeGaps:closeGaps(q)});

  if(gate.length){toast(gate[0]);return}const c2=cur;if(reissuesAt(n,R.jllNeeded(r)))bumpDocRev(c2);const what=applyStage(c2,n);saveReq(c2,what,{kind:'stage.advance'}).then(render);return}
 if(a==='record'&&q){const slot=b.dataset.s,name=($(`[data-recname="${slot}"]`)||{}).value||'',how=($(`[data-rechow="${slot}"]`)||{}).value||'';if(!name.trim()){toast('Type the approver\'s name first.');return}recordApproval(q,slot,{name:name.trim(),how:how.trim()||'by email'}).then(render);return}
 if(a==='pmfix'&&q){const c2=clone(q);c2.status='Draft';c2.meta.pmFix=true;saveReq(c2,'PM check started').then(()=>go('#e-'+q.id));return}
 if(a==='peer'&&q){const n=(($('[data-peer]')||{}).value||'').trim();if(n.length<3){toast('Type the reviewer’s name.');return}const c2=clone(q);c2.meta.peer={name:n,at:new Date().toISOString(),by:S.uid||''};saveReq(c2,'Peer review recorded: '+n).then(render);return}
 if(a==='fb'&&q){const c2=clone(q);c2.meta.pilot.fb[b.dataset.k]=b.dataset.v;saveReq(c2,'').then(render);return}
 if(a==='sugReview'&&q){const v=q.meta.review,t=[v.diff&&'Different from the MOP: '+v.diff,v.step&&'Step wrong / missing: '+v.step,v.time&&'Time off: '+v.time].filter(Boolean).join('\n');sendSug(t,q).then(ok=>{if(ok){const c2=clone(q);c2.meta.review.sent=true;saveReq(c2,'After-job review sent to JK').then(render)}});return}
 if(a==='xpilot'){saveFile(`MOP Intake pilot results ${isoDay(now())}.csv`,'\ufeff'+csv([PILOT_COLS,...pilotRows()]),'text/csv');return}
 if(a==='copyf'){const el=$(`#${b.dataset.copy}`);navigator.clipboard.writeText(el?el.textContent:'').then(()=>toast('Copied.'),()=>toast('Select the text and copy it.'));return}
 if((a==='hold'||a==='cancel'||a==='resume')&&q){const c2=clone(q);if(a==='resume'){c2.status=statusFor(c2.stage||1,stageMeta(c2));c2.meta.hold=''}else{c2.status=a==='hold'?'On hold':'Cancelled';c2.meta.hold=c2.status}saveReq(c2,'Status: '+c2.status,{kind:'hold.change'}).then(render);render();return}
 if(a==='revise'&&q){const c2=clone(q);c2.rev=(q.sub?q.sub.rev:q.rev)+1;c2.status='Draft';saveReq(c2,`Revision ${c2.rev} started`).then(()=>go('#e-'+q.id));return}
 if(a==='sign'&&q){sign(q,b.dataset.s,true);return}
 if(a==='unsign'&&q){sign(q,b.dataset.s,false);return}
 if(a==='mop'&&q){toast('Building the MOP…');buildMop(q).then(o=>saveFile(o.name,o.bytes,'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).catch(err=>{console.error(err);toast('Could not build the MOP.')});return}
 if(a==='loto1'&&q){saveFile(R.baseName(outRecord(q),q.mopNo,q.sub.rev)+'_LOTO-rows.xlsx',buildLoto([q]));return}
 if(a==='trk1'&&q){saveFile(R.baseName(outRecord(q),q.mopNo,q.sub.rev)+'_Impact-Log-row.xlsx',buildTracker([q]));return}
 if(a==='jlltxt'&&q){saveFile(R.baseName(outRecord(q),q.mopNo,q.sub.rev)+'_JLL-request.txt',jllText(q),'text/plain');return}
 if(a==='copyjll'&&q){navigator.clipboard.writeText(jllText(q)).then(()=>toast('Copied. Paste into the JLL form.'),()=>toast('Select the text above and copy it.'));return}
 const subd=()=>Object.values(S.reqs).filter(x=>x.sub&&x.status!=='Cancelled'&&(!S.logP||x.project===S.logP)).sort((a2,b2)=>(R.startOf(a2.sub.record)||0)-(R.startOf(b2.sub.record)||0));
 if(a==='xtrk'){const l=subd();saveFile(`Operations Impacts Tracker ${S.logP||'GNE Alliance'} ${isoDay(now())}.xlsx`,buildTracker(l));return}
 if(a==='xloto'){const l=subd().filter(x=>x.sub.record.loto.needed==='Yes');saveFile(`LOTO log rows ${S.logP||'GNE Alliance'} ${isoDay(now())}.xlsx`,buildLoto(l));return}
 if(a==='tab'){S.logTab=i;render();return}
 if(a==='ssConnect'&&S.session){S.session.smartsheet.connect().catch(e=>toast(e.message));return}
 if((a==='signout'||a==='signoutForce')&&S.session){signOut({google:S.session.google,smartsheet:S.session.smartsheet,countOutbox,confirmed:a==='signoutForce'}).then(r=>{if(r.needsConfirm){S.signoutAsk=r.waiting;render();return}location.replace(location.pathname)});return}
 if(a==='signoutCancel'){S.signoutAsk=0;render();return}
 if(a==='signoutBackup'){exportBackup().then(b=>{saveFile(b.name,b.blob);toast('Backup saved. You can sign out now.')});return}
 if(a==='stab'){S.setTab=i;S.projEdit=null;S.ledit=null;render();return}
 });

}

export { saveDraft, later, openEdit, go, route, wireEvents, q0 };

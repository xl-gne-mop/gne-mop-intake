// Record helpers, validation gaps and notes.
// Ported from reference/rebuild-4/index.html (r4:195-220); function bodies kept as close to verbatim as possible.
import { R, S, STEPS, STATUSES, SIDE, UTIL, GROUPS, SYSTEM_CODES, LOTO_CATS, CAT_MAP, CONTACT_ROLES, APPROVER_ROLES, ICON_MIC, $, esc, clone, uidGen, cfg, proj, safeUrl, pad3, mopLabel, toast, now, fS, fL, isoDay, pdDay, fromIso, fileUrl, D, later } from '../core/state.js';
import { libById } from '../lib/library.js';
import { TIER_NAME, TIER_ADDS, tierOf } from '../rules/tier.js';
import { fl, flagsOf, gapPath } from '../rules/dontKnow.js';
import { ruleGaps, hasStep } from '../rules/failureModes.js';
import { permitsFor, reviewDue } from '../rules/permits.js';
import { ensureRv, reviewGaps, reviewNotes, offSiteHot } from '../rules/review.js';
import { gatePending, GATE_MESSAGE } from '../import/anymop/apply.js';
import { upgradeRequest } from './schema.js';

function ensureX(r){r.x=Object.assign({util:{level:'',items:[],other:'',notes:''},qa:'',gmpNotes:'',isoBy:'',rts:'',isoBy2:'',backfeed:'',backfeedSrc:'',cold:'',eyewash:'',dp:'',alarms:'',flags:{},auto:{},autoEd:{},scopeOk:false},r.x||{});r.x.util=Object.assign({level:'',items:[],other:'',notes:''},r.x.util||{});
 ['flags','auto','autoEd'].forEach(k=>{if(!r.x[k]||typeof r.x[k]!=='object'||Array.isArray(r.x[k]))r.x[k]={}});if(Array.isArray(r.x.alarms))r.x.alarms=r.x.alarms.join('\n');
 if(r.loto&&Array.isArray(r.loto.points))r.loto.points.forEach(p=>{if(p.confirmed===undefined)p.confirmed=''});return ensureRv(r)}
function newRecord(){return ensureX(R.blankRecord())}
function normReq(d){const q=Object.assign({id:uidGen(),project:'',mopNo:0,rev:0,status:'Draft',files:[],meta:{},sub:null,history:[],createdBy:'',createdAt:'',updatedAt:''},d||{});
 q.record=ensureX(R.parseRecord(q.record||{}));q.meta=Object.assign({preDone:[],jllRef:{assistWO:'',lotoWO:'',lotoNo:''},campus:false,onedrive:{url:'',at:'',by:''},peer:{name:'',at:''},close:{},review:{},pmFix:false},q.meta||{});q.meta.pilot=Object.assign({activeSec:0,dk:0,edits:0,subAt:'',fb:{}},q.meta.pilot||{});['close','review'].forEach(k=>{if(!q.meta[k]||typeof q.meta[k]!=='object')q.meta[k]={}});
 if(q.sub)q.sub.record=ensureX(R.parseRecord(q.sub.record));if(!Array.isArray(q.files))q.files=[];if(!Array.isArray(q.history))q.history=[];return upgradeRequest(q)}
const ctxFor=(q,r)=>({project:proj(q.project),settings:cfg().rules,now:now(),attachmentCount:q.files.length});
function baseGaps(q){const r=q.record;R.normalize(r);const g=R.validate(r,ctxFor(q,r));
 const u=r.x.util,has=u.items.length||u.other.trim();
 if(has&&!u.level)g.push({s:4,m:'Utility Systems: pick Low / Medium / High'});
 if(u.level&&!has&&!u.notes.trim())g.push({s:4,m:"Utility Systems: tick what's affected or add a note"});
 if(cfg().requireMarkup!==false&&r.loto.needed==='Yes')r.loto.points.forEach((pt,i)=>{const n=i+1,att=pt.att||[];
  if(!att.length){g.push({s:3,m:`Isolation point ${n}: attach a photo of the isolation point and a marked-up panel schedule, single line, P&ID or as-built`});return}
  att.forEach(a=>{if(!a.mid&&!a.premarked)g.push({s:3,m:`Isolation point ${n}: mark up ${a.name} (or tick Already marked up)`})});
  if(!att.some(a=>a.shows&&a.shows.iso))g.push({s:3,m:`Isolation point ${n}: one attachment must highlight the isolation point`});
  if(!att.some(a=>a.shows&&a.shows.loads))g.push({s:3,m:`Isolation point ${n}: one attachment must show the complete list of affected loads`})});
 if(g.some(x=>x.m==='Mark at least one affected system group')&&(u.level||has))g.splice(g.findIndex(x=>x.m==='Mark at least one affected system group'),1);
 return g}
function baseNotes(q){const r=q.record,o=[],p=proj(q.project);
 if(p&&!p.loc.trim())o.push({l:'warn',m:`Job location for ${p.label} is not set (Settings → Projects). The MOP prints it on line 2.`,s:0});
 if(r.sup.impair==='Yes')o.push({l:'info',m:'Life-safety impairment: Siemens FLS coordinates the impairment.',s:6});
 if(R.jllNeeded(r))o.push({l:'info',m:'JLL assist or LOTO: JLL sign-off is required.',s:6});else o.push({l:'info',m:'No JLL assist or LOTO: the JLL approval row prints N/A.',s:6});
 if(r.sup.cgmp==='Yes'&&!r.x.qa)o.push({l:'warn',m:'cGMP area: QA notice vs approval (and any GMP water restart release) is case by case. Confirm with GNE QA and record it.',s:6});
 const ld=R.lead(r,now(),cfg().rules);if(ld&&ld.mopLate)o.push({l:'warn',m:'Less than 3 weeks out: the MOP is late for the standard 3-week review. Tell the GNE PM.',s:2});
 if(ld&&ld.emergency)o.push({l:'warn',m:`Under ${cfg().rules.jllMinWorkdays} workdays: JLL will flag this as an Emergency request.`,s:2});
 if(r.loto.needed==='Yes'&&r.loto.points.length>cfg().rules.jllMaxLines)o.push({l:'info',m:`${r.loto.points.length} isolation points: the JLL request splits into ${Math.ceil(r.loto.points.length/cfg().rules.jllMaxLines)} linked requests.`,s:3});
 return o}

/* Rebuild 5 (r5:354, 357): base checks minus answers marked Don't know, plus the failure-mode rules and tier notes. */
function gapsFor(q){const r=ensureX(q.record);const g=baseGaps(q).filter(x=>{const p=gapPath(x.m);return !(p&&fl(r,p))});
 /* MOP review 11/26/26: hot work done in an off-site shop needs no on-site permit steps; plus the review rules (src/rules/review.js) */
 const rg=ruleGaps(q).filter(x=>!(x.rule==='hotSteps'&&offSiteHot(r)));
 /* Import Any MOP (Tier A U4): the Import Gate – safety items read from a file must each be confirmed */
 const ig=gatePending(q.meta&&q.meta.importReview),gate=ig.length?[{s:9,m:GATE_MESSAGE(ig.length),rule:'importGate'}]:[];
 return g.concat(rg,reviewGaps({record:r,tier:tierOf(r).t}),gate)}
function notesFor(q){const r=ensureX(q.record),o=baseNotes(q),t=tierOf(r),c=cfg(),lo=r.loto.needed==='Yes',e=libById(r.x.lib&&r.x.lib.id);
 o.unshift({l:'info',m:`${TIER_NAME[t.t]}${t.why.length?' ('+t.why.join(', ')+')':''}. ${TIER_ADDS[t.t]}`,s:1});
 if(lo&&t.t===2&&!hasStep(r,/HOLD POINT/i))o.push({l:'warn',m:'Add an isolation hold point after the lockout (recommended; required on Tier 3).',s:7});
 const hrs=(parseFloat(r.durVal)||0)*(r.durUnit==='days'?24:r.durUnit==='weeks'?168:1);
 /* Decision #13 (JK 11/26/26): every FLS impairment gets the fire watch prompt, any length (no hours threshold). */
 void hrs;if(r.sup.impair==='Yes'&&r.sup.watch!=='Yes')o.push({l:'warn',m:'Life-safety impairment with no fire watch. Every FLS impairment needs a fire watch, any length (JK 11/26/26). Confirm with Siemens FLS and SSF Fire.',s:6});
 if(r.x.backfeed==='Yes'&&lo&&r.loto.points.length<2)o.push({l:'warn',m:'Other power source: add it as its own isolation point so it is locked out too.',s:3});
 const pm=permitsFor(r);if(pm.length)o.push({l:'info',m:'Permits and notices this work needs: '+pm.join('; '),s:6});
 const fg=flagsOf(r);if(fg.length)o.push({l:'warn',m:`${fg.length} answer${fg.length>1?'s':''} marked Don’t know: ${fg.map(x=>x.m).join('; ')}. You can submit; the XL PM checks them before it goes out for approval.`,s:fg[0].s});
 if(e&&reviewDue(e))o.push({l:'warn',m:`Library work type "${e.name}" was last reviewed ${e.reviewed}. Tell JK.`,s:7});
 return o.concat(reviewNotes(q))}

export { ensureX, newRecord, normReq, ctxFor, baseGaps, baseNotes, gapsFor, notesFor };

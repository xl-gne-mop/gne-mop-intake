// Settings.
// Ported from reference/rebuild-4/index.html (r4:546-571).
import { R, S, STEPS, STATUSES, SIDE, UTIL, GROUPS, SYSTEM_CODES, LOTO_CATS, CAT_MAP, CONTACT_ROLES, APPROVER_ROLES, ICON_MIC, $, esc, clone, uidGen, cfg, proj, safeUrl, pad3, mopLabel, toast, now, fS, fL, isoDay, pdDay, fromIso, fileUrl, D, later, render, saveDraft } from '../core/state.js';
import { vLibrary } from '../library/editor.js';
import { pilotIdsSet, PILOT_NEEDS_IDS } from '../pilot/log.js';
import { allEntries } from '../lib/library.js';

/* ---------- settings ---------- */
function vSettings(){const c=cfg(),ed=S.canEdit,rl=c.rules;
 const tabs=`<div class="tabs">${['General','Projects','Library','Backup'].map((t,i)=>`<button class="chip ${S.setTab===i?'on':''}" data-a="stab" data-i="${i}">${t}</button>`).join('')}</div>`;
 if(S.setTab===2)return vLibrary(tabs,ed);
 if(S.setTab===1){const pe=S.projEdit;
  if(pe)return `<h1>Settings</h1>${tabs}<div class="sheet"><h2>${esc(pe.label)}</h2><p class="sub">From lists.json in the Drive config folder. Contacts print in MOP section 3; approvers in section 13. JK changes them in Drive.</p>
   <dl class="kv">${[['id','Project #'],['label','Label / XL JOB # NAME'],['jll','JLL project name'],['cora','CORA / Unifier #'],['bldg','Default building'],['next','Next MOP number'],['loc','Job location (MOP line 2)']].map(([k,l])=>`<dt>${l}</dt><dd>${esc(pe[k])||'<span class="pill amb">Not set</span>'}</dd>`).join('')}</dl>
   <h3>Standing contacts (8)</h3><ul class="plain">${pe.contacts.map(x=>`<li>${esc(x.name||'—')} · ${esc(x.title)} · ${esc(x.company)}${x.phone?' · '+esc(x.phone):''}</li>`).join('')}</ul>
   <h3>Approvers (6)</h3><ul class="plain">${pe.approvers.map(x=>`<li>${esc(x.name||'—')} · ${esc(x.title)} · ${esc(x.company)}</li>`).join('')}</ul>
   <div class="wnav"><button class="btn" data-a="pcancel">Back</button></div></div>`;
  return `<h1>Settings</h1>${tabs}<p class="sub">Projects come from lists.json in the Drive config folder (read-only here).</p>
   <div class="scroll"><table class="stack"><thead><tr><th>Project</th><th>Building</th><th>Next MOP</th><th>Location</th><th>Named contacts</th><th></th></tr></thead><tbody>${c.projects.map((p,k)=>`<tr><td>${esc(p.label)}</td><td>${esc(p.bldg)}</td><td>${esc(p.next)}</td><td>${p.loc?esc(p.loc):'<span class="pill amb">Not set</span>'}</td><td>${p.contacts.filter(x=>x.name.trim()).length}/8</td><td><button class="btn sm" data-a="pedit" data-i="${k}">View</button></td></tr>`).join('')}</tbody></table></div>`}
 if(S.setTab===3)return `<h1>Settings</h1>${tabs}<div id="backupbox"></div>`;
 const note=k=>c.notes&&c.notes[k]?`<small>${esc(c.notes[k])}</small>`:'';
 return `<h1>Settings</h1>${tabs}<p class="sub">These come from lists.json in the Drive config folder. JK changes them there; this screen only shows them.${S.configMsg?` <b>${esc(S.configMsg)}</b>`:''}</p><div class="sheet">
  <dl class="kv"><dt>Signed in as</dt><dd>${esc(S.uid||'Not signed in yet')}${ed?' · editor':''}${S.uid?' <button class="btn sm" data-a="signout">Sign out</button>':''}</dd>
  ${S.signoutAsk?`<dt></dt><dd class="note warn">${esc(S.signoutAsk)} changes are not synced yet. Export a backup first?<div class="wnav"><button class="btn sm pri" data-a="signoutBackup">Export backup</button><button class="btn sm red" data-a="signoutForce">Sign out anyway</button><button class="btn sm" data-a="signoutCancel">Cancel</button></div></dd>`:''}
  <dt>Smartsheet</dt><dd>${S.session&&S.session.smartsheet.ready()?'<button class="btn sm" data-a="ssConnect">Connect Smartsheet</button>':'Smartsheet not connected yet'}</dd>
  <dt>MOP to approval team</dt><dd>${esc(rl.mopLeadDays)} days before start ${note('MOPLeadDays')}</dd>
  <dt>JLL minimum notice</dt><dd>${esc(rl.jllMinWorkdays)} workdays ${note('JLLMinWorkdays')}</dd>
  <dt>JLL earliest request</dt><dd>${esc(rl.jllMaxWorkdays)} workdays ${note('JLLMaxWorkdays')}</dd>
  <dt>LOTO lines per JLL request</dt><dd>${esc(rl.jllMaxLines)} ${note('JLLMaxLines')}</dd>
  <dt>Fire watch prompt</dt><dd>${esc(rl.fwHours)} hours ${note('FireWatchHours')}</dd>
  <dt>Second-person isolation check</dt><dd>Tier ${esc(rl.twoPerson)} and up ${note('SecondCheckTier')}</dd>
  <dt>Holidays</dt><dd>${rl.holidays.map(h=>esc(fS(pdDay(h)))).join(', ')} ${note('Holidays')}</dd>
  <dt>Pilot mode</dt><dd><label class="ck"><input type="checkbox" data-pilot ${S.pilotOn?'checked':''} ${pilotIdsSet()?'':'disabled'}><span>Bigger buttons, time in the app and pilot feedback on each request (Logs → Pilot). Sync goes to the pilot tracker and sheet.</span></label>${pilotIdsSet()?'':`<small>${esc(PILOT_NEEDS_IDS)}</small>`}</dd>
  <dt>Rebuild 5 print additions</dt><dd>${c.printAdditions?'On':'Off (prints exactly the Rebuild 4 MOP)'}</dd>
  <dt>Template additions (11/24/26)</dt><dd>${c.additions?'On':'Off'}</dd><dt>Marked-up LOTO attachments required</dt><dd>${c.requireMarkup?'Yes':'No'}</dd></dl></div>`}

export { vSettings };

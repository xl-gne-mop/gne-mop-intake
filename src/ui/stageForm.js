// Next-stage form for the 9-stage workflow (artifact claude-artifact/index.html:251 stageForm, adapted to the
// request fields) and the JLL panel with a Copy button per field (artifact jllPanel :242 + Rebuild 4 jllPrefillUrl).
import { R, esc, cfg, proj, mopLabel, now, fS } from '../core/state.js';
import { STAGE_NAMES, stageMeta } from '../model/stages.js';
import { outRecord, jllText } from '../export/outputs.js';
import { refsNeeded } from '../rules/review.js';

export function stageStrip(q) {
  const si = q.stage || 0;
  return `<ol class="stages" aria-label="Stages">${STAGE_NAMES.map((s, k) => `<li class="${k + 1 < si ? 'done' : k + 1 === si ? 'cur' : ''}"><span>${esc(s)}</span></li>`).join('')}</ol>`;
}

/** Stage 2 (walked) starting values from the request: the numbered impacts, who is affected, and the numbered
 *  mitigations, in the same order (tracker columns L, M, N). */
export function walkDefaults(r) {
  const imps = (r.impacts || []).filter(x => String(x.impact || '').trim()), num = a => a.map((t, i) => `${i + 1}. ${t}`).join('\n');
  return { impacts: num(imps.map(x => x.impact.trim())), users: String(r.users || '').trim(), path: imps.some(x => String(x.mitigation || '').trim()) ? num(imps.map(x => String(x.mitigation || '').trim() || '–')) : '' };
}

export function stageForm(q) {
  const n = (q.stage || 0) + 1, st = stageMeta(q), r = (q.sub || q).record, jll = R.jllNeeded(r), lotoNo = (q.meta.jllRef && q.meta.jllRef.lotoNo) || r.jllRef.lotoNo || '';
  if (!q.sub || n > 9 || q.status === 'Draft') return '';
  let b = '';
  if (n === 2) { const w = walkDefaults(r), v = k => st.walk[k] || w[k];
    b = `${w.impacts && !st.walk.impacts ? '<p class="small">Filled from the Impacts screen. Change anything the walk turned up.</p>' : ''}
   <label class="f"><span>Downstream impacts (all equipment or impacts to users)</span><textarea data-st="walk.impacts" rows="4">${esc(v('impacts'))}</textarea></label>
   <label class="f"><span>Impacted users, rooms or SiteOps</span><textarea data-st="walk.users" rows="2">${esc(v('users'))}</textarea></label>
   <label class="f"><span>Path forward: a mitigation for each impact</span><textarea data-st="walk.path" rows="4">${esc(v('path'))}</textarea></label>`; }
  if (n === 3) b = `<p class="small">The next MOP revision is saved to Drive when this syncs; the old one moves to Superseded.</p>`;
  if (n === 4) b = jll ? `<label class="f"><span>JLL LOTO # (if already submitted)</span><input data-jr="lotoNo" value="${esc(lotoNo)}"></label>` : `<p>No JLL support on this request. Need JLL Support, Submitted and LOTO # will be marked N/A.</p>`;
  if (n === 5) b = `${jll ? `<label class="f"><span>JLL LOTO # (required)</span><input data-jr="lotoNo" value="${esc(lotoNo)}"></label>` : ''}
   <label class="ck"><input type="checkbox" data-st="notified" ${st.notified ? 'checked' : ''}><span>Impact notification sent</span></label>
   <label class="ck"><input type="checkbox" data-st="lotoWalk" ${st.lotoWalk ? 'checked' : ''}><span>LOTO walk done</span></label>`;
  if (n === 5 && r.loto.needed === 'Yes') b += `<label class="f"><span>JLL LOTO WO # (needed before it goes out for approval)</span><input data-jr="lotoWO" value="${esc((q.meta.jllRef && q.meta.jllRef.lotoWO) || r.jllRef.lotoWO || '')}"></label>`;
  if (n === 6) b = `<p>Marks the MOP as out for approval. Approvers sign their rows (below) as they come back.</p>${refsNeeded(q, r).map(([k, l, v]) => `<label class="f"><span>${esc(l)} (required)</span><input data-rf="${k}" value="${esc(v)}"></label>`).join('')}`;
  if (n === 7) b = `<p class="small">Every approver row below must be signed or recorded. An “_Approved” copy is saved to Drive when this syncs.</p>`;
  if (n === 8) b = `<label class="ck"><input type="checkbox" data-meta="campus" ${q.meta.campus ? 'checked' : ''}><span>Campus notification sent</span></label>`;
  if (n === 9) b = `<label class="ck"><input type="checkbox" data-st="workDone" ${st.workDone ? 'checked' : ''}><span>Work done</span></label>
   <p class="small">${st.workDone ? 'Now tick the close-out list and answer the after-job questions (above).' : 'Tick Work done when the crew has finished; the close-out list opens.'} A “_Completed” copy is saved to Drive when this syncs.</p>`;
  return `<fieldset class="stageform"><legend>Next: ${esc(STAGE_NAMES[n - 1])}</legend>${b}<div class="wnav"><button class="btn pri" type="button" data-a="adv">Move to ${esc(STAGE_NAMES[n - 1])}</button></div></fieldset>`;
}

/** JLL Assist / LOTO values, one Copy button each (nothing is ever sent to gne.quickbase.com by the app). */
export function jllPanel(q) {
  const rec = outRecord(q), p = proj(q.project) || {}, r = rec, ld = R.lead(r, now(), cfg().rules), s = R.startOf(r), e = R.endOf(r);
  const pts = r.loto.needed === 'Yes' ? r.loto.points : [];
  const rows = [['Project name', p.jll || ''], ['Assist / LOTO name', r.title], ['MOP', mopLabel(q)], ['Description (SAP)', R.sapText(r)], ['Your name', r.req.name], ['Phone', r.req.phone], ['Email', r.req.email], ['CORA / Unifier #', p.cora || ''],
    ['Location / Building', r.bldg], ['Emergency request?', ld && ld.emergency ? 'Yes' : 'No'], ['cGMP area?', r.sup.cgmp || ''], ['Project support type', r.sup.jllType || ''], ['Multiple tasks / LOTOs?', pts.length > 1 ? 'Yes' : 'No'],
    ['Location of affected areas', [...new Set(pts.flatMap(x => R.lines(x.affected)))].join('; ')], ['Date of action', s ? fS(s) + ' ' + R.fTime(s) : ''], ['Date to remove', e ? fS(e) + ' ' + R.fTime(e) : ''],
    ...pts.slice(0, cfg().rules.jllMaxLines).flatMap((x, i) => [[`LOTO ${i + 1} equipment`, x.equip], [`LOTO ${i + 1} tag / circuit`, x.point]])];
  const u = R.jllPrefillUrl(rec, p, now(), cfg().rules);
  return `<h3>JLL Assist / LOTO request</h3><p class="small">Open the JLL page and copy each value across. A person reviews them and clicks Save on the JLL page. Attach the MOP there.</p>
   <div class="copyrows">${rows.map(([k, v], i) => `<div class="copyrow"><span><span class="small">${esc(k)}</span><br><span id="jv${i}">${esc(v || '–')}</span></span><button class="btn sm" type="button" data-a="copyf" data-copy="jv${i}">Copy</button></div>`).join('')}</div>
   ${pts.length > cfg().rules.jllMaxLines ? `<p class="note">${pts.length} points: submit ${Math.ceil(pts.length / cfg().rules.jllMaxLines)} linked requests of up to ${cfg().rules.jllMaxLines}.</p>` : ''}
   <details><summary>Whole packet</summary><pre class="pk">${esc(jllText(q))}</pre></details>
   <div class="bar"><button class="btn sm" type="button" data-a="copyjll">Copy packet</button>${u ? `<a class="btn sm" href="${esc(u)}" target="_blank" rel="noopener noreferrer">Open pre-filled JLL form</a>` : ''}</div>`;
}

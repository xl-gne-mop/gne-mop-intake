// The 9 stages (docs/STAGE_MAP.md) and the Rebuild status each one maps to (JK decision D1).
// Rebuild 4's exports read q.status ('Submitted', 'Out for approval', 'Approved', 'Executed', 'Closed'),
// so every stage change also sets the matching status.
import { STAGE_NAMES } from '../sync/stageMap.js';

export { STAGE_NAMES };
export const STATUS_FOR_STAGE = { 1: 'Submitted', 2: 'Submitted', 3: 'Submitted', 4: 'Submitted', 5: 'Submitted', 6: 'Out for approval', 7: 'Approved', 8: 'Approved', 9: 'Closed' };
export const stageName = n => STAGE_NAMES[n - 1] || 'Draft';
export const statusFor = (stage, meta = {}) => stage === 8 && meta.workDone ? 'Executed' : STATUS_FOR_STAGE[stage] || 'Draft';

/** Stage inputs kept on the request (artifact stageForm fields). */
export function stageMeta(q) {
  const m = q.meta = q.meta || {};
  m.stage = Object.assign({ walk: { impacts: '', users: '', path: '' }, notified: false, lotoWalk: false, workDone: false, close: {}, log: [] }, m.stage || {});
  m.stage.walk = Object.assign({ impacts: '', users: '', path: '' }, m.stage.walk || {});
  return m.stage;
}

/**
 * What still blocks moving q to stage n (empty = can move).
 * ctx: { jllNeeded(rec), approvalsDone:{done,total}, hasGoNoGo, flags (Don't know), tier, closeGaps }.
 * The artifact doAdvance checks (index.html:286-299), the Rebuild 4 approval rule and the Rebuild 5 gates
 * (r5:1025-1026): no open Don't-know answers and a Tier 3 peer review before stage 6; close-out before stage 9.
 */
export function gateFor(q, n, ctx) {
  const st = stageMeta(q), r = (q.sub || q).record, jll = ctx.jllNeeded(r), out = [];
  if (n !== (q.stage || 0) + 1) out.push('Stages move one at a time.');
  if (q.meta.hold) out.push(`This request is ${q.meta.hold.toLowerCase()}. Resume it first.`);
  if (n === 2 && (!st.walk.impacts.trim() || !st.walk.users.trim() || !st.walk.path.trim())) out.push('Fill in impacts, impacted users and a path forward for each impact.');
  if (n === 3 && !ctx.hasGoNoGo) out.push('LOTO work needs Go/No-Go and back-out steps in the MOP.');
  if (n === 5) { if (jll && !(q.meta.jllRef && q.meta.jllRef.lotoNo || r.jllRef.lotoNo || '').trim()) out.push('Enter the JLL LOTO # from the submitted request.'); if (!st.notified || !st.lotoWalk) out.push('Tick both: impact notification sent and LOTO walk done.'); }
  if (n === 6 && ctx.flags && ctx.flags.length) out.push(`${ctx.flags.length} Don't know answer${ctx.flags.length > 1 ? 's' : ''} to check first. Use Answer the checks.`);
  if (n === 6 && ctx.tier === 3 && !(q.meta.peer && q.meta.peer.name)) out.push('Tier 3: record the peer review first.');
  if (n === 7 && ctx.approvalsDone.done < ctx.approvalsDone.total) out.push(`All ${ctx.approvalsDone.total} approvers must sign first (${ctx.approvalsDone.done} done).`);
  if (n === 8 && !q.meta.campus) out.push('Tick Campus notification sent.');
  if (n === 9) { if (!st.workDone) out.push('Tick Work done first.'); const cg = ctx.closeGaps || []; if (st.workDone && cg.length) out.push(`Close-out: ${cg.length} item${cg.length > 1 ? 's' : ''} still to tick.`); }
  return out;
}

/**
 * STAGE_MAP §2: the MOP is re-issued as the next revision at stage 3, and at stage 5 when JLL is involved. The
 * content is unchanged, so e-signatures already given move to the new revision (sigKey includes the rev).
 * A revision the user starts (Start a revision) still clears them, as in Rebuild 4.
 */
export function bumpDocRev(q) {
  if (!q.sub) return false;
  const old = q.sub.rev, next = old + 1;
  q.sub.rev = next; q.rev = next;
  for (const m of Object.values((q.meta && q.meta.signoffs) || {})) for (const k of Object.keys(m)) { const p = k.split('|'); if (p[0] === q.id && +p[1] === old) m[`${q.id}|${next}|${p[2]}`] = m[k]; }
  return true;
}
export const reissuesAt = (n, jll) => n === 3 || (n === 5 && jll);

/** Move to stage n (gate already checked): sets stage + status and logs it. Returns the history line. */
export function applyStage(q, n) {
  const st = stageMeta(q);
  q.stage = n; q.status = statusFor(n, st);
  st.log.push({ stage: n, at: new Date().toISOString() });
  return `Stage: ${stageName(n)}`;
}

// What the request page shows under "Sent to": for each destination, is this request's current stage and revision
// there yet? Worked out on the phone from syncState (what each step recorded as done) and the outbox (what is still
// waiting, and why). Pure functions; src/ui/syncPanel.js draws them. Nothing here calls the network.
import { attachmentIds, stamp } from './reconcile.js';
import { gatePending } from '../import/anymop/apply.js';
import { stageByNo } from './stageMap.js';

export const DEST_LABEL = { drive: 'Google Drive (MOP and files)', tracker: 'Operations Impacts tracker', smartsheet: 'Smartsheet LOTO sheet' };
// Short legend shown under the card: the same words everywhere.
export const LEGEND = [
  ['Saved on this phone', 'Only this phone has it. Nobody else can see it yet.'],
  ['Sent', 'It is in Drive, the tracker and Smartsheet.'],
  ['Waiting', 'It will go by itself when there is signal (or tap Try again now).'],
  ['Needs you', 'It can’t go until something is fixed. The message says what.']
];

/** { kind, tone, headline, dests: [{key,label,state,detail}], lastSynced, nextTry, problem } – kind: draft|queued|partial|sent|action */
export function syncSummary(q, st, ops = [], { now = new Date() } = {}) {
  if (!q) return null;
  if (!q.sub || !q.stage) return { kind: 'draft', tone: 'info', headline: 'Draft – saved on this phone only. Nothing is sent until you submit it.', dests: [] };
  const rev = q.sub.rev, s = st || {}, dr = s.drive || { revs: {}, att: {} }, sw = s.stagesWritten || {}, rw = s.revWritten || {};
  const atts = attachmentIds(q), sent = atts.filter(id => dr.att && dr.att[id]).length;
  const done = {
    drive: !!(dr.revs && dr.revs[rev]) && !!dr.requestJson && (q.stage < 7 || !!dr.approved) && (q.stage < 9 || !!dr.completed) && sent >= atts.length,
    tracker: sw.tracker === q.stage && rw.tracker === rev && !!s.trackerRow,
    smartsheet: sw.smartsheet === q.stage && rw.smartsheet === rev && Object.keys((s.ss && s.ss.rows) || {}).length > 0
  };
  const mine = ops.filter(o => o.requestId === q.id), stuck = mine.find(o => o.needsAction);
  const gate = gatePending(q.meta && q.meta.importReview).length;
  const where = stuck && ({ drive: 'drive', tracker: 'tracker', smartsheet: 'smartsheet' }[stuck.lastWhere] || '');
  const detail = {
    drive: dr.revs && dr.revs[rev] ? `MOP rev ${rev}${atts.length ? ` · ${sent} of ${atts.length} photos and files` : ''}` : `MOP rev ${rev} not uploaded yet`,
    tracker: s.trackerRow ? `Row ${s.trackerRow}` : 'No row yet',
    smartsheet: Object.keys((s.ss && s.ss.rows) || {}).length ? `${Object.keys(s.ss.rows).length} row${Object.keys(s.ss.rows).length > 1 ? 's' : ''}` : 'No rows yet'
  };
  const dests = Object.keys(DEST_LABEL).map(k => ({ key: k, label: DEST_LABEL[k], state: done[k] ? 'sent' : (stuck && (where === k || !where)) ? 'action' : 'waiting', detail: detail[k] }));
  const all = dests.every(x => x.state === 'sent'), any = dests.some(x => x.state === 'sent');
  const lastSynced = s.lastSyncedAt ? stamp(new Date(s.lastSyncedAt)) : '';
  const next = mine.map(o => o.nextAt).filter(Boolean).sort()[0], nextTry = next && Date.parse(next) > now.getTime() ? stamp(new Date(next)) : '';
  if (gate) return { kind: 'action', tone: 'red', headline: `Needs you: check the ${gate} safety item${gate > 1 ? 's' : ''} read from the imported file. Nothing is sent until then.`, dests: dests.map(x => (x.state === 'sent' ? x : { ...x, state: 'action' })), lastSynced };
  if (stuck) return { kind: 'action', tone: 'red', headline: `Needs you: ${stuck.lastError || 'this change could not be sent.'}`, dests, lastSynced, problem: stuck.lastError };
  if (all && !mine.length) return { kind: 'sent', tone: 'ok', headline: `Sent – “${stageByNo(q.stage).name}”, rev ${rev} is in Drive, the tracker and Smartsheet.`, dests, lastSynced };
  const err = mine.map(o => o.lastError).find(Boolean);
  if (any) return { kind: 'partial', tone: 'amb', headline: 'Partly sent – the rest is saved on this phone and will go when it can.', dests, lastSynced, nextTry, problem: err };
  return { kind: 'queued', tone: 'amb', headline: 'Saved on this phone – not sent yet.', dests, lastSynced, nextTry, problem: err };
}

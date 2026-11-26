// Everyone's requests (D6): the Smartsheet rows that have a Stage, one entry per Request ID. Opening one downloads
// its request.json from Drive and keeps it on this phone with its sync state, so later changes update the SAME
// tracker row and Smartsheet rows (never new ones).
import { emptyState } from './reconcile.js';
import { stageNo } from './stageMap.js';

const cellOf = (sheet, row, title) => { const c = (sheet.columns || []).find(x => x.title === title); return c ? (row.cells.find(x => x.columnId === c.id) || {}).value : undefined; };
const fileIdOf = link => (/\/d\/([^/]+)/.exec(link || '') || [])[1] || '';

export async function listRemote({ ss, sheetId }) {
  const sheet = await (await ss(`/sheets/${sheetId}`)).json(), by = new Map();
  for (const row of sheet.rows || []) {
    const id = cellOf(sheet, row, 'Request ID'), stage = cellOf(sheet, row, 'Stage'); if (!id || !stage) continue;
    const e = by.get(id) || { requestId: id, stage, stageNo: stageNo(stage), mop: cellOf(sheet, row, 'MOP #') || '', scope: cellOf(sheet, row, 'Work Scope') || '', job: cellOf(sheet, row, 'XL JOB # NAME') || '', name: cellOf(sheet, row, 'Name') || '', link: cellOf(sheet, row, 'MOP Link') || '', trackerRow: +cellOf(sheet, row, 'Tracker Row') || 0, rows: [] };
    e.rows.push(row.id); by.set(id, e);
  }
  return [...by.values()].sort((a, b) => a.requestId.localeCompare(b.requestId));
}

/** Download a remote request and its sync state. Returns the request (not yet saved). */
export async function openRemote(entry, { api, state }) {
  const fid = fileIdOf(entry.link); if (!fid) throw new Error('This request has no MOP file in Drive yet.');
  const meta = await api.getMeta(fid, 'id,parents'), mopFolder = meta.parents[0];
  const f = await api.findChild(mopFolder, 'request.json', 'application/json'); if (!f) throw new Error('The request file is not in Drive yet. Try again later.');
  const raw = await api.getMedia(f.id), doc = typeof raw === 'string' ? JSON.parse(raw) : raw, q = doc.request;
  const t = await api.getMeta(f.id, 'id,modifiedTime');
  const st = (await state.get(q.id)) || emptyState();
  Object.assign(st, { requestId: entry.requestId, trackerRow: entry.trackerRow || st.trackerRow });
  Object.assign(st.drive, { mopFolder, current: fid, requestJson: f.id, requestJsonText: JSON.stringify(doc), requestJsonTime: t.modifiedTime });
  st.drive.revs[q.sub.rev] = fid;
  if (q.stage >= 7) st.drive.approved = st.drive.approved || 'remote'; if (q.stage >= 9) st.drive.completed = st.drive.completed || 'remote';
  entry.rows.forEach((id, i) => { st.ss.rows[i] = id; });
  // attachments are already in Drive (uploaded by the phone that made them)
  for (const f of [...(q.sub.files || []), ...(q.files || [])]) st.drive.att[f.id] = st.drive.att[f.id] || 'remote';
  for (const p of q.sub.record.loto.points || []) for (const a of p.att || []) for (const id of [a.id, a.mid].filter(Boolean)) st.drive.att[id] = st.drive.att[id] || 'remote';
  st.stagesWritten = { tracker: q.stage, smartsheet: q.stage }; st.revWritten = { tracker: q.sub.rev, smartsheet: q.sub.rev };
  st.base.requestJson = q; st.drive.projectFolder = st.drive.projectFolder || (await api.getMeta(mopFolder, 'id,parents')).parents[0];
  for (let r = 0; r < q.sub.rev; r++) { st.drive.revs[r] = st.drive.revs[r] || 'remote'; st.drive.superseded[r] = true; }
  await state.put(q.id, st);
  return q;
}

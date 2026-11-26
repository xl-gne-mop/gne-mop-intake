// Reconcile one request with Drive, the tracker and Smartsheet: work out what is still missing (from STAGE_MAP and
// the request's stage / revision) compared with what syncState says is done, and do only that. Every step is
// recorded as soon as it finishes, so a rerun, a duplicate outbox op or a crash part-way never repeats a write.
import { STAGE_MAP, stageByNo } from './stageMap.js';
import { merge3, same } from './merge.js';
import { DOCX } from './google-api.js';
import { mop3, mopFolderName, mopFileName, approvedSuffix, completedSuffix, driveLink } from './names.js';

const TAB = STAGE_MAP.tracker.tab, FIRST = STAGE_MAP.tracker.firstRow, LAST = STAGE_MAP.tracker.lastRow;
const COLS = Object.keys(STAGE_MAP.tracker.columns); // A..AG
const colIdx = c => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const pad = n => String(n).padStart(2, '0');
const stamp = d => { const h = d.getHours(); return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${String(d.getFullYear()).slice(2)} ${h % 12 || 12}:${pad(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`; };
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export class SyncStop extends Error { constructor(message, kind) { super(message); this.kind = kind; } }

export function emptyState() {
  return { requestId: '', drive: { revs: {}, superseded: {}, att: {} }, trackerRow: 0, ss: { rows: {}, notes: [] }, stagesWritten: { tracker: 0, smartsheet: 0 }, revWritten: { tracker: -1, smartsheet: -1 }, base: { tracker: null, smartsheet: {}, requestJson: null }, conflicts: [], notes: [] };
}

/** Columns to write for stages a+1..b (STAGE_MAP), choosing the JLL / no-JLL variant. */
export function trackerColumns(fromStage, toStage, jll) {
  const out = new Set();
  for (let n = fromStage + 1; n <= toStage; n++) {
    const t = stageByNo(n).tracker; (Array.isArray(t) ? t : t[jll ? 'jll' : 'noJll']).forEach(c => out.add(c));
  }
  return [...out];
}

/** Every tracker cell A–AG for this request: Rebuild trackerVals (B–AC) plus the stage inputs and the sync columns. */
export function trackerRowValues(q, { label, requestId, stageName, mopLink, now, trackerVals, jll }) {
  const tv = trackerVals(q), st = (q.meta && q.meta.stage) || {}, walk = st.walk || {}, lotoNo = ((q.meta.jllRef || {}).lotoNo || (q.sub.record.jllRef || {}).lotoNo || '').trim();
  const v = { A: label };
  COLS.slice(1, 29).forEach((c, i) => { v[c] = tv[i]; }); // B..AC
  if (q.stage >= 2) v.K = 'Yes';
  if (walk.impacts) v.L = walk.impacts; if (walk.users) v.M = walk.users; if (walk.path) v.N = walk.path;
  if (st.notified) v.J = 'Yes'; if (st.lotoWalk) v.S = 'Yes';
  if (jll) { if (lotoNo) { v.Q = 'Yes'; v.R = lotoNo; } } else { v.P = 'N/A'; v.Q = 'N/A'; v.R = 'N/A'; }
  Object.assign(v, { AD: requestId, AE: stageName, AF: mopLink || '', AG: stamp(now) });
  return v;
}

/** Next "<ProjectID>-R###" from every Request ID seen (Smartsheet rows and tracker AD). */
export function nextRequestId(projectId, seen) {
  const n = seen.filter(x => String(x || '').startsWith(projectId + '-R')).map(x => parseInt(String(x).split('-R')[1], 10)).filter(x => x > 0);
  return `${projectId}-R${String((n.length ? Math.max(...n) : 0) + 1).padStart(3, '0')}`;
}

/**
 * d = { api, ss (null when Smartsheet isn't connected), config, cfg, pilot, build: { mop(q), trackerVals(q), lotoVals(q),
 *       jllNeeded(rec) }, state: { get(id), put(id, st) }, blob(id) -> Blob|null, now() -> Date, saveLocal(q) }
 * Returns { ok, waitingFor: 'smartsheet'|null, conflicts }.
 */
export async function reconcileRequest(q, d) {
  d = { ...d, sheetId: d.pilot ? d.config.PILOT_SHEET_ID : d.config.SMARTSHEET_SHEET_ID };
  if (!q.sub || !q.stage) return { ok: true, skipped: 'draft' }; // drafts stay on the phone
  const st = (await d.state.get(q.id)) || emptyState();
  const save = () => d.state.put(q.id, st);
  const proj = (d.cfg.projects || []).find(p => p.id === q.project) || { id: q.project, label: q.project };
  const rec = q.sub.record, title = rec.title, jll = d.build.jllNeeded(rec), rev = q.sub.rev;
  const trackerId = d.pilot ? d.config.PILOT_TRACKER_ID : d.config.TRACKER_ID;
  const now = d.now();

  // ---- 1. Request ID and MOP # (first sync only)
  let trackerRows = null;
  const readTracker = async () => { const r = await d.api.valuesGet(trackerId, `'${TAB}'!A${FIRST}:AG${LAST}`); trackerRows = r.values || []; return trackerRows; };
  let ssSheet = null;
  const readSheet = async () => { if (!d.ss) return null; const r = await d.ss(`/sheets/${d.sheetId}`); ssSheet = await r.json(); return ssSheet; };
  if (!st.requestId) {
    await readTracker();
    const seen = trackerRows.map(r => r[colIdx('AD')]);
    if (d.ss) { await readSheet(); const rid = (ssSheet.columns || []).find(c => c.title === 'Request ID'); if (rid) for (const row of ssSheet.rows || []) seen.push((row.cells.find(c => c.columnId === rid.id) || {}).value); }
    st.requestId = q.meta.requestId || nextRequestId(proj.id, seen);
    const taken = trackerRows.filter(r => r[0] === proj.label && String(r[1] || '').startsWith(mop3(q.mopNo)) && r[colIdx('AD')] !== st.requestId);
    if (taken.length) {
      const used = trackerRows.filter(r => r[0] === proj.label).map(r => parseInt(r[1], 10)).filter(n => n > 0);
      const old = q.mopNo; q.mopNo = Math.max(q.mopNo, ...used) + 1;
      st.notes.push(`MOP # changed to ${mop3(q.mopNo)} – ${mop3(old)} was taken`);
    }
    q.meta.requestId = st.requestId; await d.saveLocal(q); await save();
  }

  // ---- 2. Drive: folders, the current revision, Superseded, approved / completed copies, attachments, request.json
  const folder = async (key, parent, name) => { if (!st.drive[key]) { const f = (await d.api.findChild(parent, name)) || (await d.api.createFolder(parent, name)); st.drive[key] = f.id; await save(); } return st.drive[key]; };
  const projectFolder = await folder('projectFolder', d.config.DRIVE_ROOT_FOLDER_ID, proj.label);
  const mopFolder = await folder('mopFolder', projectFolder, mopFolderName(q.mopNo, title));
  let newRev = false;
  if (!st.drive.revs[rev]) {
    const b = await d.build.mop(q);
    const f = await d.api.upload(mopFolder, mopFileName(q.mopNo, rev, title), b.bytes, DOCX);
    st.drive.revs[rev] = f.id; st.drive.current = f.id; newRev = true;
    st.notes.push(`DONE: MOP rev ${rev} file ${f.id} (${mopFileName(q.mopNo, rev, title)})`); await save();
  }
  for (const [r, id] of Object.entries(st.drive.revs)) {
    if (+r < rev && !st.drive.superseded[r]) {
      const sup = await folder('supersededFolder', mopFolder, 'Superseded');
      await d.api.move(id, sup, mopFolder); st.drive.superseded[r] = true; await save();
    }
  }
  for (const [key, at, suffix] of [['approved', 7, approvedSuffix], ['completed', 9, completedSuffix]]) {
    if (q.stage >= at && !st.drive[key]) {
      const name = mopFileName(q.mopNo, rev, title, suffix(now)), b = await d.build.mop(q);
      const f = await d.api.upload(mopFolder, name, b.bytes, DOCX); st.drive[key] = f.id;
      st.notes.push(`DONE: MOP ${key} copy file ${f.id} (${name})`); await save();
    }
  }
  const attIds = [...new Set([...(q.sub.files || []), ...(q.files || [])].map(f => f.id)), ...(rec.loto.points || []).flatMap(p => (p.att || []).flatMap(a => [a.id, a.mid].filter(Boolean)))];
  for (const id of attIds) {
    if (st.drive.att[id]) continue; const blob = d.blob(id); if (!blob) continue;
    const attFolder = await folder('attachmentsFolder', mopFolder, 'Attachments');
    const f = await d.api.upload(attFolder, `${id}.${/pdf/.test(blob.type) ? 'pdf' : 'jpg'}`, blob, blob.type || 'application/octet-stream');
    st.drive.att[id] = f.id; await save();
  }
  await syncRequestJson(q, st, d, mopFolder, save);

  // ---- 3. Tracker: only the columns for the stages (and the new revision) not yet written; 3-way merge per cell
  const mopLink = driveLink(st.drive.current || st.drive.revs[rev]);
  const cols = trackerColumns(st.stagesWritten.tracker, q.stage, jll);
  if (st.revWritten.tracker !== rev) for (const c of ['B', 'AF']) if (!cols.includes(c)) cols.push(c);
  for (const c of (st.retry && st.retry.tracker) || []) if (!cols.includes(c)) cols.push(c);
  if (cols.length) {
    if (!cols.includes('AG')) cols.push('AG');
    if (!trackerRows) await readTracker();
    if (!st.trackerRow) {
      let i = trackerRows.findIndex(r => r[colIdx('AD')] === st.requestId);
      if (i < 0) { i = 0; while (i < LAST - FIRST + 1 && trackerRows[i] && (trackerRows[i][1] || trackerRows[i][colIdx('AD')])) i++; }
      if (i > LAST - FIRST) throw new SyncStop(`Tracker rows ${FIRST}–${LAST} are full – ask JK to add rows.`, 'trackerFull');
      st.trackerRow = FIRST + i; await save();
    }
    const remoteRow = trackerRows[st.trackerRow - FIRST] || [], remote = Object.fromEntries(COLS.map((c, i) => [c, remoteRow[i] ?? '']));
    const local = trackerRowValues(q, { label: proj.label, requestId: st.requestId, stageName: stageByNo(q.stage).name, mopLink, now, trackerVals: d.build.trackerVals, jll });
    const where = `tracker row ${st.trackerRow}`, m = merge3(cols.filter(c => c !== 'AG' && !keptTheirs(st, where, c, local[c])), local, st.base.tracker, remote, 'tracker');
    const write = { ...m.write, AG: local.AG };
    await d.api.valuesBatchUpdate(trackerId, Object.entries(write).map(([c, v]) => ({ range: `'${TAB}'!${c}${st.trackerRow}`, values: [[v]] })));
    st.base.tracker = { ...remote, ...m.take, ...write };
    addConflicts(st, m.conflicts, where);
    st.stagesWritten.tracker = q.stage; st.revWritten.tracker = rev; if (st.retry) st.retry.tracker = []; await save();
  }

  // ---- 4. Smartsheet (through the Worker). Not connected yet -> waits; Drive and the tracker already went ahead.
  if (!d.ss) return { ok: true, waitingFor: 'smartsheet', conflicts: st.conflicts };
  await syncSmartsheet(q, st, d, { proj, jll, rev, mopLink, now, readSheet: () => ssSheet || readSheet(), save, newRev });
  return { ok: true, waitingFor: null, conflicts: st.conflicts };
}

// A field the editor chose to "keep theirs" for: leave it alone while the phone still holds the same value.
const keptTheirs = (st, where, field, local) => st.conflicts.some(x => x.resolved === 'theirs' && x.where === where && x.field === field && same(x.local, local));

function addConflicts(st, list, where) {
  for (const c of list) {
    const key = `${where}|${c.field}`;
    const ex = st.conflicts.find(x => x.key === key && !x.resolved);
    if (ex) Object.assign(ex, { local: c.local, remote: c.remote }); else st.conflicts.push({ ...c, where, key, resolved: false });
  }
}

/** request.json (D6): upload, or update when it changed; if someone else changed it, merge per field. */
async function syncRequestJson(q, st, d, mopFolder, save) {
  // an open conflict keeps the Drive value in the file until an editor decides
  const outText = () => { const o = JSON.parse(JSON.stringify(q)); for (const c of st.conflicts) if (!c.resolved && c.where === 'request (Drive)') setFlat(o, c.field, c.remote); return JSON.stringify({ schema: 'gne-mop-request', version: 1, request: o }); };
  const text = outText(), doc = JSON.parse(text);
  if (st.drive.requestJson && st.drive.requestJsonText === text) return;
  if (!st.drive.requestJson) {
    const existing = await d.api.findChild(mopFolder, 'request.json', 'application/json');
    if (!existing) {
      const f = await d.api.upload(mopFolder, 'request.json', new Blob([text], { type: 'application/json' }), 'application/json');
      Object.assign(st.drive, { requestJson: f.id, requestJsonText: text, requestJsonTime: f.modifiedTime || '' }); st.base.requestJson = doc.request; await save(); return;
    }
    st.drive.requestJson = existing.id;
  }
  const metaNow = await d.api.getMeta(st.drive.requestJson, 'id,modifiedTime');
  if (st.drive.requestJsonTime && metaNow.modifiedTime !== st.drive.requestJsonTime) {
    const remote = await d.api.getMedia(st.drive.requestJson), rr = (typeof remote === 'string' ? JSON.parse(remote) : remote).request || {};
    const L = flatReq(q), B = st.base.requestJson ? flatReq(st.base.requestJson) : null, Rm = flatReq(rr), where = 'request (Drive)';
    const m = merge3([...new Set([...Object.keys(L), ...Object.keys(Rm)])].filter(k => !keptTheirs(st, where, k, L[k])), L, B, Rm, 'request.json');
    for (const [k, v] of Object.entries(m.take)) setFlat(q, k, v);
    addConflicts(st, m.conflicts, where);
    if (Object.keys(m.take).length) await d.saveLocal(q);
  }
  const merged = outText();
  if (merged === st.drive.requestJsonText) { st.drive.requestJsonTime = metaNow.modifiedTime; await save(); return; }
  const f = await d.api.updateMedia(st.drive.requestJson, new Blob([merged], { type: 'application/json' }), 'application/json');
  Object.assign(st.drive, { requestJsonText: merged, requestJsonTime: f.modifiedTime || '' }); st.base.requestJson = JSON.parse(merged).request; await save();
}

/** "XL JOB # NAME" is a dropdown in the sheet (".13 B5 STEAM", ".01/02 B5 SEISMIC"): pick the option for this
 *  project by its number after the dot, else an option equal to the label; '' when none matches (the label is kept). */
export function ssJob(sheet, proj) {
  const col = (sheet.columns || []).find(c => c.title === 'XL JOB # NAME'), opts = (col && col.options) || [];
  if (!opts.length || !proj) return '';
  const label = String(proj.job || proj.label || '').trim(), sfx = (/\.(\d+)/.exec(String(proj.id || '')) || [])[1];
  const byNo = sfx && opts.find(o => { const m = /^\s*(?:\d+)?\.([\d/]+)/.exec(o); return m && m[1].split('/').some(n => n === sfx); });
  return byNo || opts.find(o => o.trim().toLowerCase() === label.toLowerCase()) || '';
}

async function syncSmartsheet(q, st, d, { proj, jll, rev, mopLink, now, readSheet, save, newRev }) {
  const sheet = await readSheet(), byTitle = Object.fromEntries((sheet.columns || []).map(c => [c.title, c.id]));
  const rec = q.sub.record, lotoNo = ((q.meta.jllRef || {}).lotoNo || (rec.jllRef || {}).lotoNo || '').trim();
  const pendingNotes = st.notes.filter(n => !st.ss.notes.includes(n));
  const appNotes = existing => [existing, ...pendingNotes.map(n => `${stamp(now).slice(0, 8)} ${n}`)].filter(Boolean).join('\n');
  const common = { 'Request ID': st.requestId, Stage: stageByNo(q.stage).name, 'MOP #': mop3(q.mopNo), 'MOP Link': mopLink, 'Tracker Row': String(st.trackerRow || ''), 'Needs Sync': false };
  const cell = (title, value) => (byTitle[title] ? { columnId: byTitle[title], value } : null);
  const ids = Object.values(st.ss.rows);
  // Every intake column, per row (one row per LOTO point; one row filled from the form when there is no LOTO).
  const lv = d.build.smartsheetVals ? d.build.smartsheetVals(q)
    : rec.loto.needed === 'Yes' && rec.loto.points.length ? d.build.lotoVals(q) : [[false, proj.label, rec.req.name, rec.req.company, '', `${rec.bldg} – ${rec.areas.split('\n')[0]}`, '', '', '', '', '']];
  const job = ssJob(sheet, proj);
  const intake = v => ({
    ...Object.fromEntries(STAGE_MAP.smartsheet.original.map((t, i) => [t, i === 1 && job ? job : v[i] && v[i].date ? ymd(new Date(v[i].date)) : v[i]])),
    'Work Scope': rec.scope, 'Category/Discipline': rec.discipline, Priority: rec.priority, 'System In Use?': rec.inService, 'Need JLL?': !!jll, 'Need Siemens?': rec.sup.siemens === 'Yes', 'Contact Phone': rec.req.phone, 'MOP #': common['MOP #']
  });
  if (!ids.length) {
    const rows = lv.map(v => ({ toBottom: true, cells: Object.entries({ ...intake(v), ...common, 'JLL LOTO #': lotoNo, 'App Notes': appNotes('') }).map(([t, v2]) => cell(t, v2))
      .filter(Boolean).filter(c => c.value !== undefined && c.value !== '') }));
    const r = await d.ss(`/sheets/${d.sheetId}/rows`, { method: 'POST', body: JSON.stringify(rows) });
    const out = (await r.json()).result || [];
    out.forEach((row, i) => { st.ss.rows[i] = row.id; st.base.smartsheet[row.id] = Object.fromEntries(rows[i].cells.map(c => [c.columnId, c.value])); });
    st.ss.notes.push(...pendingNotes); st.stagesWritten.smartsheet = q.stage; st.revWritten.smartsheet = rev; await save();
    return;
  }
  // later stages: Stage, JLL LOTO #, MOP Link, App Notes, LOTO Removal? at 9 – only what changed, merged per cell
  const want = { Stage: common.Stage, 'MOP Link': mopLink, 'Needs Sync': false };
  if (lotoNo) want['JLL LOTO #'] = lotoNo;
  if (q.stage >= 9) want['LOTO Removal?'] = true;
  if (st.stagesWritten.smartsheet === q.stage && st.revWritten.smartsheet === rev && !pendingNotes.length && !(st.retry && st.retry.smartsheet)) return;
  const updates = [];
  for (const [i, rowId] of Object.entries(st.ss.rows)) {
    const remoteRow = (sheet.rows || []).find(r => r.id === rowId) || { cells: [] };
    const remote = Object.fromEntries(remoteRow.cells.map(c => [c.columnId, c.value]));
    // a revision can change the intake answers: refresh them too (never blanks a cell; Timestamp and LOTO Removal? stay)
    const fresh = lv[+i] ? Object.fromEntries(Object.entries(intake(lv[+i])).filter(([t, v]) => t !== 'Timestamp' && t !== 'LOTO Removal?' && v !== undefined && v !== '')) : {};
    const local = Object.fromEntries(Object.entries({ ...fresh, ...want }).filter(([t]) => byTitle[t]).map(([t, v]) => [byTitle[t], v]));
    if (byTitle['App Notes'] && pendingNotes.length) local[byTitle['App Notes']] = appNotes(remote[byTitle['App Notes']] || '');
    const where = `Smartsheet row ${rowId}`, title = cid => (sheet.columns.find(x => String(x.id) === String(cid)) || {}).title || cid;
    const m = merge3(Object.keys(local).filter(cid => !keptTheirs(st, where, title(cid), local[cid])), local, st.base.smartsheet[rowId] || null, remote, 'smartsheet');
    if (byTitle['App Notes'] && pendingNotes.length && !(byTitle['App Notes'] in m.write)) m.write[byTitle['App Notes']] = local[byTitle['App Notes']]; // notes only ever append
    addConflicts(st, m.conflicts.map(c => ({ ...c, columnId: c.field, field: title(c.field) })), where);
    if (Object.keys(m.write).length) updates.push({ id: rowId, cells: Object.entries(m.write).map(([cid, value]) => ({ columnId: +cid, value })) });
    st.base.smartsheet[rowId] = { ...remote, ...m.take, ...m.write };
  }
  if (updates.length) await d.ss(`/sheets/${d.sheetId}/rows`, { method: 'PUT', body: JSON.stringify(updates) });
  st.ss.notes.push(...pendingNotes); st.stagesWritten.smartsheet = q.stage; st.revWritten.smartsheet = rev; if (st.retry) st.retry.smartsheet = false; await save();
}

/**
 * "Needs editor review" choice. 'mine' = keep this phone's value (the next sync writes it once); 'theirs' = keep the
 * value in the tracker / Smartsheet / Drive (nothing is written; for request.json the phone takes it).
 * Returns the request when the phone's copy changed (the caller saves it), else null.
 */
export function resolveConflict(st, q, key, choice) {
  const c = st.conflicts.find(x => x.key === key && !x.resolved); if (!c) return null;
  c.resolved = choice; c.resolvedAt = new Date().toISOString(); st.retry = st.retry || { tracker: [], smartsheet: false };
  const kind = c.where.startsWith('tracker') ? 'tracker' : c.where.startsWith('Smartsheet') ? 'smartsheet' : 'request';
  if (kind === 'tracker') {
    st.base.tracker = { ...(st.base.tracker || {}), [c.field]: c.remote };
    if (choice === 'mine') st.retry.tracker.push(c.field);
    return null;
  }
  if (kind === 'smartsheet') {
    const rowId = c.where.split(' ').pop();
    st.base.smartsheet[rowId] = { ...(st.base.smartsheet[rowId] || {}), [c.columnId]: c.remote };
    if (choice === 'mine') st.retry.smartsheet = true;
    return null;
  }
  if (choice === 'theirs') { setFlat(q, c.field, c.remote); return q; }
  st.base.requestJson = null; st.drive.requestJsonText = ''; // the next sync uploads this phone's value
  return null;
}
const FLAT_TOP = ['status', 'stage', 'rev', 'mopNo', 'project'];
function flatReq(o) {
  const out = {}; FLAT_TOP.forEach(k => { out[k] = o[k]; });
  for (const [k, v] of Object.entries((o.sub && o.sub.record) || {})) out['record.' + k] = JSON.stringify(v);
  for (const [k, v] of Object.entries(o.meta || {})) out['meta.' + k] = JSON.stringify(v);
  return out;
}
function setFlat(q, k, v) { if (k.startsWith('record.')) q.sub.record[k.slice(7)] = JSON.parse(v); else if (k.startsWith('meta.')) q.meta[k.slice(5)] = JSON.parse(v); else q[k] = v; }

export { stamp, same };

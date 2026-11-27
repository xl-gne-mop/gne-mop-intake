// "Start from an existing MOP" (Import Any MOP, Tier A plan §2 U4): pick a file or take photos → "Reading page 2 of 6…"
// → "Found 23 things. 7 need your eyes." → "Check what we found" (Use / Fix / Skip per field, green / amber / grey,
// "Show me where", safety-critical cards confirmed one at a time, "Use all green" for the others) → the draft.
// Everything here is local: the file is read on the phone, saved with the draft, and synced later.
// Extracted text is always escaped (esc) – never put into the page as HTML.
import { R, S, $, esc, clone, toast, render, cfg, uidGen, fS, D } from '../core/state.js';
import { normReq, newRecord, ensureX } from '../core/record.js';
import { saveReq, uploadBlob } from '../core/save.js';
import { chooseEntry, libById } from '../lib/library.js';
import { pdfjs } from '../attach/markup.js';
import { saveSuggestion } from '../library/suggest.js';
import { importFiles } from '../import/anymop/client.js';
import { FIELDS, FIELD_BY_ID, SAFETY_CRITICAL_IDS } from '../import/anymop/fields.js';
import { colorOf, GREEN } from '../import/anymop/mapper.js';
import { applyResult, auditFor, gatePending, conflictsFor, recordValue } from '../import/anymop/apply.js';
import { ocrInstalled, installOcr, onWifi, PACK_LABEL } from '../import/anymop/ocr.js';
import { deviceName, readReloads } from '../import/anymop/pilot.js';

const ACCEPT = '.pdf,.doc,.docx,.docm,.xls,.xlsx,.xlsm,.csv,.txt,.ppt,.pptx,.eml,.msg,.rtf,.heic,.heif,image/*,application/pdf';
const SECTIONS = [
  ['The job', ['title', 'scope', 'origin', 'bldg', 'areas', 'equip', 'start', 'duration', 'priority', 'subMop', 'subShort', 'discipline', 'inService', 'users']],
  ['People', ['req.name', 'req.company', 'req.phone', 'workers', 'subs', 'crew']],
  ['Systems and impacts', ['sys', 'impacts', 'sup.jll', 'sup.siemens']],
  ['Steps', ['pre', 'steps', 'gonogo', 'tools', 'safety']]
];
const SAFETY_ORDER = SAFETY_CRITICAL_IDS;
const p2 = n => String(n).padStart(2, '0');
const showDate = v => { const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(v || '')); if (!m) return String(v || ''); const t = m[4] ? ` ${(+m[4] % 12) || 12}:${m[5]} ${+m[4] < 12 ? 'AM' : 'PM'}` : ''; return `${m[2]}/${m[3]}/${m[1].slice(2)}${t}`; };

// ---------- state ----------
const I = () => S.imp || (S.imp = { phase: 'pick' });
/** Files shared to the app (Android share target, sw.js) → read them straight away. */
export async function openShared() {
  openImport();
  try {
    const c = await caches.open('mop-share'), keys = await c.keys(), files = [];
    for (const k of keys) { const r = await c.match(k); files.push(new File([await r.blob()], decodeURIComponent(r.headers.get('x-name') || 'shared'), { type: r.headers.get('content-type') || '' })); }
    await caches.delete('mop-share');
    if (files.length) readAny(files); else render();
  } catch { render(); }
}
// The scan-reader line is updated in place (never a full redraw), so a file being chosen at that moment isn't lost.
function ocrRowHtml(s) { return `<div id="impOcrRow">${s.ocr ? '<p class="small">Scan reader installed: photos and scanned PDFs can be read.</p>' : `<div class="note info"><b>Photos and scans need the scan reader.</b> ${onWifi() === false ? 'You are not on Wi-Fi – it is a 6 MB download.' : 'Best on Wi-Fi.'}<div class="bar"><button class="btn" data-a="impOcr" ${s.ocrBusy ? 'disabled' : ''}>${s.ocrBusy ? esc(s.ocrBusy) : PACK_LABEL}</button></div></div>`}</div>`; }
export function openImport() { S.view = 'import'; if (!S.imp || S.imp.phase === 'done') S.imp = { phase: 'pick' }; ocrInstalled().then(v => { const was = I().ocr; I().ocr = v; const row = $('#impOcrRow'); if (row && I().phase === 'pick' && was !== v) row.outerHTML = ocrRowHtml(I()); }).catch(() => {}); }
const decided = id => { const d = I().decisions || {}; return d[id] && d[id].action; };
const offeredIds = r => Object.entries(r.fields).filter(([, f]) => f.status !== 'not_found').map(([id]) => id);
function counts() { const r = I().result; if (!r) return { found: 0, eyes: 0, checked: 0, total: 0 }; const ids = offeredIds(r); const eyes = ids.filter(id => colorOf(r.fields[id]) !== 'green'); return { found: ids.length, eyes: eyes.length, checked: ids.filter(decided).length, total: ids.length }; }
const safetyQueue = r => SAFETY_ORDER.filter(id => r.fields[id] && r.fields[id].status !== 'not_found');
const activeSafety = r => safetyQueue(r).find(id => !decided(id));

// ---------- views ----------
export function vImport() {
  const s = I();
  if (s.phase === 'reading') return `<h1>Start from an existing MOP</h1><div class="sheet imp-progress" role="status" aria-live="polite"><div class="spin" aria-hidden="true"></div><p class="big">${esc(s.progress || 'Reading the file…')}</p><p class="small">Everything is read on this phone. Nothing is sent anywhere.</p></div>`;
  if (s.phase === 'choose') return `<h1>Which file is the MOP?</h1><p class="sub">${esc(s.msg || '')}</p><div class="sheet">${s.choose.map(c => `<button class="btn big-btn" data-a="impPick" data-n="${esc(c.name)}">${esc(c.name)}</button>`).join('')}<div class="wnav"><button class="btn" data-a="impRestart">Back</button></div></div>`;
  if (s.phase === 'check') return vCheck();
  const ocrRow = ocrRowHtml(s);
  return `<h1>Start from an existing MOP</h1>
  <p class="sub">Use a MOP from anyone – GNE / XL form, a subcontractor’s MOP, a Word or Excel file, an email or photos of a paper copy. The app fills the form with what it finds; you check every item before it is used. Nothing is submitted.</p>
  ${s.msg ? `<div class="note warn" role="alert">${esc(s.msg)}</div>` : ''}
  <div class="imp-pick">
    <label class="btn pri big-btn">Take photos of the MOP<input type="file" accept="image/*" capture="environment" multiple data-anyfile hidden></label>
    <label class="btn big-btn">Choose a file<input type="file" accept="${ACCEPT}" data-anyfile hidden></label>
  </div>${ocrRow}
  <p class="small">Up to 25 MB and 60 pages, or up to 10 photos. Old .doc / .xls files: if they can’t be read, save them as .docx / .xlsx or PDF.</p>
  <div class="wnav"><a class="btn" href="#">Back</a></div>`;
}

function preview(id, v) {
  const f = FIELD_BY_ID[id] || { type: 'text' };
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '<span class="muted">Not in the file</span>';
  const list = (items, fmt) => `<ol class="imp-list">${items.slice(0, 8).map(x => `<li>${esc(fmt(x))}</li>`).join('')}${items.length > 8 ? `<li class="muted">and ${items.length - 8} more</li>` : ''}</ol>`;
  if (id === 'start') return esc(showDate(v));
  if (f.type === 'points') return list(v, p => `${p.equip}${p.point ? ' – ' + p.point : ''}${p.type ? ` (${p.type})` : ' (energy type?)'}${p.affected ? ' → ' + p.affected : ''}`);
  if (f.type === 'steps') return list(v, s => `${s.desc}${s.dur ? ' – ' + s.dur : ''}`);
  if (f.type === 'impacts') return list(v, x => `${x.kind === 'Potential' ? 'Potential: ' : ''}${x.impact}${x.mitigation ? ' — Mitigation: ' + x.mitigation : ''}`);
  if (f.type === 'people') return list(v, p => [p.name, p.title, p.company].filter(Boolean).join(', '));
  if (f.type === 'system') return esc(Object.entries(v).filter(([, g]) => g && (g.level || g.items.length)).map(([k, g]) => `${k}: ${[g.level, ...g.items].filter(Boolean).join(', ')}`).join(' · ') || '—');
  if (Array.isArray(v)) return list(v, x => String(x));
  if (id === 'priority') return esc({ H: 'High', M: 'Medium', L: 'Low' }[v] || v);
  return esc(String(v));
}
function card(id, { locked = false } = {}) {
  const s = I(), r = s.result, f = r.fields[id], meta = FIELD_BY_ID[id] || { label: id }, col = colorOf(f), d = (s.decisions || {})[id], conflict = (s.conflicts || []).find(c => c.id === id);
  const badge = col === 'green' ? '<span class="pill ok">✓ Looks right</span>' : col === 'amber' ? '<span class="pill amb">⚠ Check this</span>' : col === 'hint' ? '<span class="pill">? A guess</span>' : '<span class="pill">Not in file</span>';
  const dLabel = d ? { use: 'Used', fix: 'Fixed', skip: 'Skipped', dk: 'Don’t know', keep: 'Kept mine' }[d.action] : '';
  const fixing = s.fix === id;
  const btns = locked ? '<p class="small">Confirm the safety item above first.</p>'
    : f.status === 'not_found' ? `<div class="bar"><button class="btn sm" data-a="impDec" data-id="${id}" data-v="dk">Don’t know (XL PM checks)</button><button class="btn sm" data-a="impFix" data-id="${id}">Type it</button></div>`
      : `<div class="bar">${conflict ? `<button class="btn sm pri" data-a="impDec" data-id="${id}" data-v="use">Use file</button><button class="btn sm" data-a="impDec" data-id="${id}" data-v="keep">Keep mine</button>` : `<button class="btn sm pri" data-a="impDec" data-id="${id}" data-v="use">Use</button>`}<button class="btn sm" data-a="impFix" data-id="${id}">Fix</button><button class="btn sm" data-a="impDec" data-id="${id}" data-v="skip">Skip</button>${f.sources && f.sources.length ? `<button class="btn sm" data-a="impWhere" data-id="${id}">Show me where</button>` : ''}</div>`;
  return `<div class="imp-card ${f.safetyCritical ? 'crit' : ''} c-${col} ${d ? 'done' : ''} ${locked ? 'locked' : ''}" id="impc-${esc(id.replace(/\./g, '-'))}">
    <div class="imp-h"><b>${esc(meta.label)}</b>${f.safetyCritical ? '<span class="pill red">Safety – confirm</span>' : ''}${badge}${d ? `<span class="pill done">${dLabel}</span>` : ''}</div>
    ${conflict ? `<p class="small"><b>File says:</b> ${preview(id, f.value)}<br><b>You have:</b> ${preview(id, conflict.mine)}</p>` : `<div class="imp-v">${d && d.action === 'fix' ? preview(id, d.value) : preview(id, f.value)}</div>`}
    ${f.note ? `<p class="small imp-note">${esc(f.note)}</p>` : ''}
    ${fixing ? fixEditor(id, d && d.action === 'fix' ? d.value : f.value) : btns}
  </div>`;
}
function fixEditor(id, v) {
  const f = FIELD_BY_ID[id] || { type: 'text' }, t = f.type, help = { points: 'One point per line: equipment | point (circuit or valve) | Electrical or Piping / valve | what loses service', steps: 'One step per line: what happens | how long', impacts: 'One per line: Planned or Potential: impact | mitigation', people: 'One per line: name | title | company', list: 'One per line' }[t];
  let text = '';
  if (t === 'points') text = (v || []).map(p => [p.equip, p.point, p.type, p.affected].join(' | ')).join('\n');
  else if (t === 'steps') text = (v || []).map(s => `${s.desc} | ${s.dur || ''}`).join('\n');
  else if (t === 'impacts') text = (v || []).map(x => `${x.kind || 'Planned'}: ${x.impact} | ${x.mitigation || ''}`).join('\n');
  else if (t === 'people') text = (v || []).map(p => [p.name, p.title, p.company].join(' | ')).join('\n');
  else if (Array.isArray(v)) text = v.join('\n'); else text = v || '';
  const input = id === 'start' ? `<input type="datetime-local" data-impfix value="${esc(String(text).slice(0, 16))}">`
    : t === 'yesno' ? `<div class="seg" role="group" aria-label="${esc(f.label)}"><button type="button" data-a="impFixYN" data-id="${id}" data-v="Yes">Yes</button><button type="button" data-a="impFixYN" data-id="${id}" data-v="No">No</button></div>`
      : t === 'system' ? '<p class="small">Change the systems on the Systems screen after you open the draft.</p>'
        : /^(longtext|list|steps|impacts|points|people)$/.test(t) ? `<textarea data-impfix rows="${Math.min(10, Math.max(3, String(text).split('\n').length + 1))}">${esc(text)}</textarea>` : `<input data-impfix value="${esc(text)}">`;
  return `<div class="imp-fix">${help ? `<small>${esc(help)}</small>` : ''}${input}<div class="bar">${t === 'yesno' || t === 'system' ? '' : `<button class="btn sm pri" data-a="impFixSave" data-id="${id}">Save</button>`}<button class="btn sm" data-a="impFixCancel">Cancel</button></div></div>`;
}
function parseFix(id, text) {
  const t = (FIELD_BY_ID[id] || {}).type, L = String(text || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean), cut = l => l.split('|').map(x => x.trim());
  if (t === 'points') return L.map(l => { const [equip, point, type, affected] = cut(l); return { equip: equip || '', point: point || '', type: /pip|valve|water|gas/i.test(type || '') ? 'Piping / valve' : /elec/i.test(type || '') ? 'Electrical' : type || '', affected: affected || '' }; });
  if (t === 'steps') return L.map(l => { const [desc, dur] = cut(l); return { desc, dur: dur || '', src: 'file' }; });
  if (t === 'impacts') return L.map(l => { const m = /^(planned|potential)\s*:\s*/i.exec(l), rest = m ? l.slice(m[0].length) : l, [impact, mitigation] = cut(rest); return { kind: m && /pot/i.test(m[1]) ? 'Potential' : 'Planned', impact, mitigation: mitigation || '' }; });
  if (t === 'people') return L.map(l => { const [name, title, company] = cut(l); return { name, title: title || '', company: company || '' }; });
  if (t === 'list') return L;
  if (id === 'start') return String(text || '').slice(0, 16);
  return String(text || '').trim();
}

function vCheck() {
  const s = I(), r = s.result, c = counts(), act = activeSafety(r), q = safetyQueue(r);
  const wt = r.workTypes || [], chosen = s.wt;
  const greenLeft = offeredIds(r).filter(id => !r.fields[id].safetyCritical && colorOf(r.fields[id]) === 'green' && !decided(id)).length;
  return `<h1>Check what we found</h1>
  <p class="sub big" role="status">Found ${c.found} thing${c.found === 1 ? '' : 's'} in <b>${esc(r.meta.name || 'the file')}</b>. ${c.eyes} need${c.eyes === 1 ? 's' : ''} your eyes.</p>
  <div class="imp-top"><span class="pill">${c.checked} of ${c.total} checked</span>${greenLeft ? `<button class="btn" data-a="impAllGreen">Use all green (${greenLeft})</button>` : ''}<span class="sp"></span><button class="btn pri" data-a="impFinish">${gatePending({ result: r, decisions: s.decisions }).length ? 'Save and finish later' : 'Done – open the draft'}</button></div>
  ${(r.warnings || []).filter(w => w.code !== 'macros' || true).map(w => `<div class="note warn">${esc(w.message)}</div>`).join('')}
  ${r.meta.needsOcr && !s.ocr ? `<div class="note info">Some pages are scans or photos. <button class="btn sm" data-a="impOcr">${PACK_LABEL}</button> then read the file again.</div>` : ''}
  ${r.split ? `<div class="note info"><b>This file looks like ${r.split.count} separate jobs:</b> ${r.split.sections.map(x => esc(x.title)).join('; ')}.<div class="bar"><button class="btn sm ${s.split ? 'pri' : ''}" data-a="impSplit" data-v="1">Split into ${r.split.count} MOPs</button><button class="btn sm ${s.split ? '' : 'pri'}" data-a="impSplit" data-v="0">Keep as one MOP</button></div></div>` : ''}
  <div class="sheet"><h2>Work type</h2>${wt.length ? `<div class="chips" role="group" aria-label="Work type">${wt.map(w => `<button type="button" class="chip ${chosen === w.id ? 'on' : ''}" aria-pressed="${chosen === w.id}" data-a="impWt" data-id="${esc(w.id)}">${esc(w.name)} <small>${Math.round(w.confidence * 100)}%</small></button>`).join('')}</div><p class="small">${wt[0] && wt[0].confidence >= 0.85 ? 'The best match is picked; tap another to change it.' : 'Not sure enough to pick one – tap the right one (or none). The library fills blank screens from it.'} The risk tier is worked out by the app, never taken from the file.</p>` : '<p class="small">No library work type matched. Pick one on the Who screen.</p>'}</div>
  ${q.length ? `<h2 class="imp-sec">Safety items – confirm one at a time (${q.filter(decided).length} of ${q.length})</h2>${q.map(id => card(id, { locked: id !== act && !decided(id) })).join('')}` : ''}
  ${SECTIONS.map(([title, ids]) => { const shown = ids.filter(id => r.fields[id] && (r.fields[id].status !== 'not_found' || FIELD_BY_ID[id].required)); return shown.length ? `<h2 class="imp-sec">${esc(title)}</h2>${shown.map(id => card(id)).join('')}` : ''; }).join('')}
  ${r.unmapped && r.unmapped.length ? `<details class="sheet"><summary><b>Other text we found (${r.unmapped.length})</b> – not put anywhere</summary><p class="small">If a line is a label we missed (another company’s word for a field), tell JK which field it means.</p><ul class="plain imp-other">${r.unmapped.slice(0, 60).map((u, i) => `<li><span>${esc(u.text)}</span> <select data-impsyn="${i}" aria-label="This text is the label for"><option value="">This is a label for…</option>${FIELDS.map(f => `<option value="${esc(f.id)}">${esc(f.label)}</option>`).join('')}</select></li>`).join('')}</ul></details>` : ''}
  ${s.where ? whereSheet() : ''}`;
}
function whereSheet() {
  const s = I(), f = s.result.fields[s.where], src = (f && f.sources && f.sources[0]) || {};
  const quote = esc(src.quote || ''), canDraw = src.bbox && s.files && s.files[0] && /pdf|jpeg|png|image|photo/i.test(s.result.meta.type || '');
  return `<div class="imp-sheet" role="dialog" aria-modal="true" aria-label="Where this came from"><div class="imp-sheet-in">
    <div class="bar"><b>${esc((FIELD_BY_ID[s.where] || {}).label || s.where)}</b> – page ${esc(src.page || 1)}<span class="sp"></span><button class="btn sm" data-a="impWhereClose">Close</button></div>
    ${canDraw ? '<canvas id="impWhereCanvas" class="imp-canvas" aria-label="The page with the found text highlighted"></canvas>' : ''}
    <p class="imp-quote"><mark>${quote}</mark></p></div></div>`;
}
/** After render: draw the page (PDF / photo) with the highlight box for "Show me where". */
let drawing = null;
export async function drawWhere() {
  const s = I(), cv = $('#impWhereCanvas'); if (!cv || !s.where || drawing === cv) return; drawing = cv;
  const src = s.result.fields[s.where].sources[0], file = s.files[s.photoIndex || 0] || s.files[0];
  try {
    const g = cv.getContext('2d'); let w, h;
    if (/pdf/i.test(s.result.meta.type)) {
      const L = await pdfjs(), pdf = await L.getDocument({ data: file.bytes.slice(0), isEvalSupported: false, enableScripting: false }).promise, page = await pdf.getPage(src.page || 1);
      const vp = page.getViewport({ scale: Math.min(2, 900 / page.getViewport({ scale: 1 }).width) }); cv.width = w = vp.width; cv.height = h = vp.height;
      await page.render({ canvasContext: g, viewport: vp }).promise; pdf.destroy();
    } else {
      const bmp = await createImageBitmap(new Blob([file.bytes]), { imageOrientation: 'from-image' }), sc = Math.min(1, 900 / bmp.width); cv.width = w = bmp.width * sc; cv.height = h = bmp.height * sc; g.drawImage(bmp, 0, 0, w, h);
    }
    const [x, y, bw, bh] = src.bbox; g.lineWidth = 3; g.strokeStyle = '#d6001c'; g.fillStyle = 'rgba(255,214,0,.35)'; g.fillRect(x * w - 4, y * h - 4, bw * w + 8, bh * h + 8); g.strokeRect(x * w - 4, y * h - 4, bw * w + 8, bh * h + 8);
    cv.parentNode.scrollTop = Math.max(0, y * h * (cv.clientWidth / w) - 80);
  } catch (e) { console.warn('show me where', e); cv.remove(); }
}

// ---------- reading ----------
export async function readAny(fileList, pick = null) {
  const s = I(); s.phase = 'reading'; s.progress = 'Reading the file…'; s.msg = ''; render();
  const lib = S.library || [];
  const out = await importFiles(fileList, { pdfjs, library: lib, libraryVersion: S.libraryFile ? String(S.libraryFile.libraryVersion) : '', synonyms: (cfg().importSynonyms || {}), roomPattern: cfg().roomPattern || null, pick,
    onProgress: t => { s.progress = t; const p = $('.imp-progress .big'); if (p) p.textContent = t; } }).catch(e => ({ ok: false, message: `We couldn’t read this file (${e.message}).` }));
  if (out.choose) { Object.assign(s, { phase: 'choose', choose: out.choose, msg: out.message, pending: fileList }); render(); return; }
  if (!out.ok) { Object.assign(s, { phase: 'pick', msg: out.message }); render(); return; }
  const r = out.result, base = S.imp.base || newDraftRecord();
  Object.assign(s, { phase: 'check', startedAt: s.startedAt || new Date().toISOString(), result: r, files: out.files, decisions: {}, wt: r.workTypes[0] && r.workTypes[0].confidence >= GREEN ? r.workTypes[0].id : '', conflicts: conflictsFor(r, base), split: false });
  render(); window.scrollTo(0, 0);
}
function newDraftRecord() { const r = newRecord(); r.req.name = S.meName || ''; r.req.email = S.uid || ''; return r; }

// ---------- finish ----------
async function finish() {
  const s = I(), r = s.result, existing = s.draftId && S.reqs[s.draftId];
  const q = existing ? normReq(clone(existing)) : normReq({});
  if (!existing) { q.record.req.name = q.record.req.name || S.meName || ''; q.record.req.email = q.record.req.email || S.uid || ''; }
  const prev = (q.meta.importReview && q.meta.importReview.decisions) || {}, fresh = Object.fromEntries(Object.entries(s.decisions || {}).filter(([id, d]) => JSON.stringify(prev[id]) !== JSON.stringify(d)));
  const { record } = applyResult(r, fresh, q.record, newRecord());
  q.record = ensureX(R.parseRecord(record));
  if (r.r4 && r.r4.project) { const p = cfg().projects.find(x => x.id === r.r4.project || x.label.startsWith(r.r4.project)); if (p) { q.project = p.id; if (!q.record.bldg) q.record.bldg = p.bldg; } }
  const slim = { ...r, unmapped: r.unmapped.slice(0, 100) };
  q.meta.importReview = { result: slim, decisions: s.decisions, done: !gatePending({ result: r, decisions: s.decisions }).length, at: new Date().toISOString() };
  q.importAudit = auditFor(r, s.decisions, { by: S.uid || '' });
  { const st = (q.importAudit.review = { ...(existing && existing.importAudit && existing.importAudit.review || {}), device: deviceName(), ocrReloads: readReloads() }); st.startedAt = st.startedAt || s.startedAt || new Date().toISOString(); st.finishedAt = new Date().toISOString(); st.ms = (st.ms || 0) + (s.startedAt ? Date.now() - Date.parse(s.startedAt) : 0); }
  if (!q.meta.importSource && s.files && s.files.length) {
    const f = s.files[0], kind = /pdf/i.test(r.meta.type) ? 'pdf' : /image|jpeg|png/i.test(r.meta.type) ? 'image' : 'file';
    try { const up = await uploadBlob(new Blob([f.bytes], { type: f.type || r.meta.type || 'application/octet-stream' }), { type: f.type || 'application/octet-stream', requestId: q.id, name: f.name }); q.files.push({ id: up.id, name: f.name, kind, cat: kind === 'image' ? 'Photo' : 'Other', source: true }); q.meta.importSource = { id: up.id, name: f.name, type: f.type || r.meta.type, sha256: r.meta.sha256 }; } catch { /* the draft still saves */ }
  }
  q.history.push({ at: new Date().toISOString(), by: S.uid || '', what: `Imported from ${r.meta.name}: ${Object.keys(s.decisions || {}).length} items checked` });
  S.draft = q; S.view = 'edit'; S.step = 9;
  if (s.wt && libById(s.wt) && !(q.record.x.lib && q.record.x.lib.id)) chooseEntry(s.wt, true); // library fills blank screens only (lower priority than the file)
  await saveReq(S.draft);
  if (s.split && r.split) for (const sec of r.split.sections.slice(1)) { const o = normReq({}); o.project = q.project; o.record.title = sec.title; o.record.req = clone(q.record.req); o.files = q.files.filter(f => f.source); o.history.push({ at: new Date().toISOString(), by: S.uid || '', what: `Split from ${r.meta.name}` }); await saveReq(o); }
  S.imp = { phase: 'done' }; if (location.hash !== '#e-' + q.id) location.hash = '#e-' + q.id; else render();
  toast(gatePending(q.meta.importReview).length ? 'Saved. Confirm the remaining safety items before you submit.' : 'Imported. Check each screen, then submit.');
}

/** Resume the check from a draft ("Continue checking what we found"). */
export function resumeImport(q) { const ir = q.meta.importReview; if (!ir) return; S.imp = { phase: 'check', startedAt: new Date().toISOString(), result: ir.result, decisions: clone(ir.decisions || {}), files: [], draftId: q.id, wt: (q.record.x.lib && q.record.x.lib.id) || '', conflicts: [] }; const src = q.meta.importSource && S.blobs[q.meta.importSource.id]; if (src) src.arrayBuffer().then(b => { S.imp.files = [{ name: q.meta.importSource.name, bytes: new Uint8Array(b) }]; }); S.view = 'import'; render(); }

// ---------- actions ----------
export function importAction(a, b, root) {
  const s = I(), id = b.dataset.id, now = new Date().toISOString();
  const dec = (k, d) => { s.decisions = { ...(s.decisions || {}), [k]: { ...d, at: now } }; };
  if (a === 'impRestart') { S.imp = { phase: 'pick', ocr: s.ocr }; render(); return true; }
  if (a === 'impPick') { readAny(s.pending, b.dataset.n); return true; }
  if (a === 'impOcr') {
    s.ocrBusy = 'Downloading…'; render();
    installOcr((d, t) => { s.ocrBusy = `Downloading… ${Math.min(99, Math.round(d / t * 100))}%`; const el = root.querySelector('[data-a="impOcr"]'); if (el) el.textContent = s.ocrBusy; })
      .then(() => { s.ocr = true; s.ocrBusy = ''; toast('Scan reader installed. It works with no signal from now on.'); render(); })
      .catch(() => { s.ocrBusy = ''; toast('Could not download the scan reader. Try again on Wi-Fi.'); render(); });
    return true;
  }
  if (a === 'impDec') {
    const f = s.result.fields[id];
    if (f.safetyCritical && activeSafety(s.result) !== id && !decided(id)) { toast('Confirm the safety item above first.'); return true; }
    dec(id, { action: b.dataset.v }); s.fix = null; render();
    const nx = activeSafety(s.result); if (f.safetyCritical && nx) { const el = document.getElementById('impc-' + nx.replace(/\./g, '-')); if (el) el.scrollIntoView({ block: 'center' }); }
    return true;
  }
  if (a === 'impFix') { const f = s.result.fields[id]; if (f.safetyCritical && activeSafety(s.result) !== id && !decided(id) && f.status !== 'not_found') { toast('Confirm the safety item above first.'); return true; } s.fix = id; render(); const el = root.querySelector('[data-impfix]'); if (el) el.focus(); return true; }
  if (a === 'impFixCancel') { s.fix = null; render(); return true; }
  if (a === 'impFixYN') { dec(id, { action: 'fix', value: b.dataset.v }); s.fix = null; render(); return true; }
  if (a === 'impFixSave') {
    const el = root.querySelector('[data-impfix]'), v = parseFix(id, el ? el.value : '');
    if (v === '' || (Array.isArray(v) && !v.length)) { toast('Type a value, or tap Skip.'); return true; }
    const norm = id === 'duration' ? (() => { const m = /([\d.]+)\s*(hour|hr|day|week|min)/i.exec(v); return m ? { val: /min/i.test(m[2]) ? +m[1] / 60 : +m[1], unit: /day/i.test(m[2]) ? 'days' : /week/i.test(m[2]) ? 'weeks' : 'hours' } : undefined; })() : undefined;
    dec(id, { action: 'fix', value: v, normalized: norm }); s.fix = null; render(); return true;
  }
  if (a === 'impAllGreen') { for (const k of offeredIds(s.result)) { const f = s.result.fields[k]; if (!f.safetyCritical && colorOf(f) === 'green' && !decided(k) && !(s.conflicts || []).some(c => c.id === k)) dec(k, { action: 'use' }); } render(); return true; }
  if (a === 'impWhere') { s.where = id; render(); return true; } // render() draws the page (drawWhere)
  if (a === 'impWhereClose') { s.where = null; render(); return true; }
  if (a === 'impWt') { s.wt = s.wt === id ? '' : id; render(); return true; }
  if (a === 'impSplit') { s.split = b.dataset.v === '1'; render(); return true; }
  if (a === 'impFinish') { finish().catch(e => { console.error(e); toast('Could not save the import. Try again.'); }); return true; }
  return false;
}
/** "This is a label for…" on "Other text we found" → a suggestion to the library inbox (editors publish synonyms). */
export function suggestLabel(i, fieldId) {
  const s = I(), u = s.result.unmapped[i], f = FIELD_BY_ID[fieldId]; if (!u || !f) return;
  saveSuggestion({ id: 's' + uidGen(), entryId: '', entryName: 'Import labels (Import Any MOP)', ver: '', text: `In ${s.result.meta.name}: “${u.text.slice(0, 120)}” is the label for “${f.label}” (${fieldId})`, by: S.uid || '', byName: S.meName || '', at: new Date().toISOString(), reqId: '', mop: '', status: 'Open', synonym: { field: fieldId, label: u.text.slice(0, 120) } })
    .then(() => toast('Thanks – sent to JK for the import labels.')).catch(() => toast('Could not save. Tell JK directly.'));
}
export { ACCEPT, parseFix };

// Tier A Mapper (plan §2 U3): DocModel → ExtractionResult, in this order:
//  1 template fingerprint (GNE MOP template / XL Excel intake → the Rebuild 4 importer, confidence 0.95)
//  2 label anchors (synonyms: value after the colon, in the cell to the right / below, or the section under a heading)
//  3 recognizers (the dictation tag grammar + written tags: panels, valves, controllers, rooms, buildings, durations, dates)
//  4 LOTO points (tag + isolation verb or an isolation table; energy type inferred = amber)
//  5 work type (library keywords: title × 3, scope × 2, body × 1; top 3; never auto-picked below 0.85; tier is never imported)
//  6 impact / mitigation split on cue phrases ("We split this – check")
//  7 multi-system files → "Split into N MOPs?"
//  8 validators (future date, end after start, room vs building [warn only], step times, a point per energy type, voltage test)
//  9 unknowns → not_found ("Don't know" to the XL PM); leftover text → unmapped ("Other text we found")
// Confidence: GNE template 0.95; value next to a known label 0.85; free text / keyword 0.6; OCR × word confidence.
// Green ≥ 0.85, amber 0.5–0.85, below 0.5 a hint only. Safety-critical fields are never green (capped at 0.84).
import { FIELDS, FIELD_BY_ID, isSafety } from './fields.js';
import { SYNONYMS } from './synonyms.js';
import { findTags } from '../../dictation/parse.js';

export const SCHEMA = 'gne-mop-import', SCHEMA_VERSION = 1;
export const GREEN = 0.85, AMBER = 0.5, SAFETY_CAP = 0.84;
const CONF = { template: 0.95, label: 0.85, weakLabel: 0.7, free: 0.6, hint: 0.4 };

const norm = s => String(s || '').toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9#/&()' -]+/g, ' ').replace(/\s+/g, ' ').trim();
const stripNum = s => String(s || '').replace(/^\s*(section\s+[a-z0-9]+\s*[-–:.)]?\s*|[a-z]\s*[.)]\s+|\d{1,2}(\.\d{1,2})*\s*[.)]?\s+|[ivx]{1,4}\s*[.)]\s+)/i, '');
const lines = s => String(s || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
const stripBullet = s => String(s).replace(/^\s*(step\s*)?(\d{1,3}[.):]|[-•*▪●◦]|[a-z][.)])\s*/i, '').trim();
const cap = (id, c) => (isSafety(id) ? Math.min(c, SAFETY_CAP) : c);
const docTextOf = doc => doc.blocks.map(b => b.text).join('\n');

/** One field value wrapper (schema import-v1). */
export function fv(id, value, { status = 'found', confidence = CONF.label, sources = [], normalized, alternatives = [], note = '' } = {}) {
  const empty = value == null || value === '' || (Array.isArray(value) && !value.length);
  return { value: empty ? (Array.isArray(value) ? [] : '') : value, normalized: normalized === undefined ? value : normalized, status: empty ? 'not_found' : status, confidence: empty ? 0 : cap(id, confidence), safetyCritical: isSafety(id), sources, alternatives, note };
}
export const colorOf = f => (!f || f.status === 'not_found' ? 'grey' : f.safetyCritical ? (f.confidence >= AMBER ? 'amber' : 'hint') : f.confidence >= GREEN ? 'green' : f.confidence >= AMBER ? 'amber' : 'hint');
const src = (b, quote) => ({ page: b.page, blockId: b.id, bbox: b.bbox || null, quote: String(quote ?? b.text).slice(0, 300) });

// ---------- labels ----------
// One-word / very common labels: only a value after a colon or in the cell to the right counts (never the cell below
// a table header or a heading section) – "Description" over a steps table is not the work scope.
const GENERIC = new Set(['description', 'summary', 'background', 'date', 'time', 'start', 'end', 'location', 'area', 'areas', 'floor', 'room', 'rooms', 'system', 'equipment', 'panel', 'asset', 'contact', 'company', 'phone', 'cell', 'mobile', 'tel', 'title', 'subject', 'task', 'activity', 'purpose', 'objective', 'reason', 'origin', 'priority', 'impact', 'impacts', 'effects', 'personnel', 'staff', 'crew', 'workers', 'tools', 'materials', 'method', 'execution', 'sequence', 'steps', 'procedure', 'procedures', 'restore', 'startup', 'completion', 'safety', 'hazards', 'ppe', 'alarms', 'witness', 'conditions', 'prerequisites', 'mitigation', 'mitigations', 'siemens', 'gmp', 'loto']);
export const isGeneric = l => GENERIC.has(norm(l));
function labelIndex(extra = {}) {
  const idx = [];
  const all = { ...SYNONYMS.labels }; for (const [k, v] of Object.entries(extra || {})) all[k] = [...(all[k] || []), ...(Array.isArray(v) ? v : [])];
  for (const [field, labs] of Object.entries(all)) for (const l of labs) idx.push({ field, label: l, n: norm(l) });
  return idx.sort((a, b) => b.n.length - a.n.length);
}
/** Is this text a label (whole text = label, or "label:" prefix)? Returns { field, label, rest } or null. */
function matchLabel(text, idx, { loose = false } = {}) {
  const raw = stripNum(String(text).trim()), n = norm(raw);
  if (!n || (n.length > 90 && !loose)) return null;
  // OCR lines lose the colon / cell gap ("Title Building 12 Lab 210 …"): a known label at the start, then a capital or digit
  if (loose && !/:/.test(raw.slice(0, 40))) { for (const x of idx) { if (x.n.length < 4) continue; const m = new RegExp(`^${x.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i').exec(raw); if (m && /[A-Z0-9]/.test(raw[m[0].length] || '') && raw.length - m[0].length >= 2) return { ...x, rest: raw.slice(m[0].length).trim(), colon: true }; } }
  const colon = /^([^:]{1,60})[:–]\s*(.*)$/s.exec(raw) || /^([^:]{1,60}) [-–] (.+)$/s.exec(raw);
  if (colon) { const ln = norm(colon[1]); const hit = idx.find(x => x.n === ln); if (hit) return { ...hit, rest: colon[2].trim(), colon: true }; }
  const whole = n.replace(/[:\s]+$/, ''); const hit = idx.find(x => x.n === whole);
  return hit ? { ...hit, rest: '', colon: false } : null;
}

// ---------- recognizers ----------
const WRITTEN_TAG = /\b(?:(?:LP|HP|HLP|ELP|ULP|LLP|MDP|DP|HDP|EDP|MSB|SWBD|SWGR|MCC|ATS|UPS|GEN|XFMR|PNL|AHU|EF|SF|RF|MAU|FCU|VAV|CRAC|CRAH|CH|CT|CWP|HWP|IDF|MDF|FACP|FACU|CV|PRV|TMV|HX|BSC|EWS)[- ]?\d{1,4}[A-Z]{0,3}(?:-[A-Z0-9]{1,4})?|V-?(?:DIW|DCW|DHW|LCW|CDA|CHW|HHW|RO|PW|STM|N2|CO2)-?\d{1,4}[A-Z]?|\d{3}[A-Z]{3,5}\d{2}|[A-Z]{3}\d{2}[A-Z]{1,2})\b/g;
export function recognize(text) {
  const t = String(text || ''), f = findTags(t), tags = [...f.tags];
  for (const m of t.matchAll(WRITTEN_TAG)) { const v = m[0].replace(/\s/, '-').toUpperCase(); if (!tags.includes(v) && !tags.some(x => x.replace(/-/g, '') === v.replace(/-/g, ''))) tags.push(v); }
  const volts = [...new Set([...t.matchAll(/\b(\d{3})\s*(?:\/\s*\d{3}\s*)?V(?:AC)?\b/gi)].map(m => m[0].toUpperCase()))];
  return { tags, rooms: f.rooms, bldg: f.bldg, dur: f.dur, volts };
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const p2 = n => String(n).padStart(2, '0');
/** Date (and time) in written text → 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM'. */
export function parseDateTime(text) {
  const t = String(text || ''); let y, m, d;
  let r = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(t);
  if (r) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/.exec(t))) [m, d, y] = [+r[1], +r[2], +r[3] < 100 ? 2000 + +r[3] : +r[3]];
  else if ((r = /\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i.exec(t))) [m, d, y] = [MONTHS[r[1].toLowerCase()], +r[2], +r[3]];
  else if ((r = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})\b/i.exec(t))) [d, m, y] = [+r[1], MONTHS[r[2].toLowerCase()], +r[3]];
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const time = parseTime(t.slice(r.index + r[0].length)) || parseTime(t.slice(0, r.index));
  return `${y}-${p2(m)}-${p2(d)}${time ? 'T' + time : ''}`;
}
export function parseTime(text) {
  const t = String(text || ''); let r = /\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\b\.?/i.exec(t);
  if (r) { let h = +r[1] % 12; if (/p/i.test(r[3])) h += 12; return `${p2(h)}:${r[2] || '00'}`; }
  if ((r = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(t))) return `${p2(+r[1])}:${r[2]}`;
  if ((r = /\b([01]\d|2[0-3])([0-5]\d)\s*(?:hrs?|hours)\b/i.exec(t))) return `${r[1]}:${r[2]}`;
  return null;
}
export function parseDuration(text) {
  const t = String(text || ''); const range = /(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?|days?)/i.exec(t);
  if (range) { const u = range[3][0].toLowerCase(), n = +range[2]; return { val: u === 'm' ? Math.round(n / 60 * 100) / 100 : n, unit: u === 'd' ? 'days' : 'hours', text: range[0] }; }
  const f = findTags(t).dur; return f ? { val: f.val, unit: f.unit, text: f.text } : null;
}

// ---------- structure ----------
/** Label/value pairs from colon text, table cells (right or below) and PDF line cells. */
function pairs(doc, idx) {
  const out = [], tablesById = doc.tables;
  for (const b of doc.blocks) {
    if (b.kind === 'cell' && b.table) {
      const t = tablesById[b.table.t]; const m = matchLabel(b.text, idx); if (!m) continue;
      let value = m.rest, how = 'colon';
      if (!value) { const row = t.rows[b.table.r] || []; for (let c = b.table.c + 1; c < row.length; c++) if (row[c] && !matchLabel(row[c], idx)) { value = row[c]; how = 'right'; break; } else if (row[c]) break; }
      let vb = null;
      if (value && how === 'right') vb = cellBlock(doc, b.table.t, b.table.r, t.rows[b.table.r].indexOf(value, b.table.c + 1));
      const headerRow = (t.rows[b.table.r] || []).filter(Boolean).length >= 3; // a column-header row: never "below" for generic labels
      if (!value && !(isGeneric(m.label) && headerRow)) { const below = (t.rows[b.table.r + 1] || [])[b.table.c]; if (below && !matchLabel(below, idx)) { value = below; how = 'below'; vb = cellBlock(doc, b.table.t, b.table.r + 1, b.table.c); } }
      if (how === 'below' && isGeneric(m.label) && headerRow) { value = ''; how = 'heading'; }
      out.push({ ...m, value, how, block: b, valueBlock: vb }); continue;
    }
    if (b.cells && b.cells.length > 1) { // PDF line with columns: label cell → next cell
      b.cells.forEach((c, i) => { const m = matchLabel(c.text, idx); if (!m) return; let value = m.rest; if (!value && b.cells[i + 1] && !matchLabel(b.cells[i + 1].text, idx)) value = b.cells[i + 1].text; out.push({ ...m, value, how: 'cells', block: { ...b, bbox: c.bbox || b.bbox } }); });
      continue;
    }
    const m = matchLabel(b.text, idx, { loose: b.kind === 'ocr' }); if (m) out.push({ ...m, value: m.rest, how: m.colon ? 'colon' : 'heading', block: b });
    // one line with several "Label: value" parts ("Building: B5   Room: 1150")
    if (/\s{3,}|\t/.test(b.text)) b.text.split(/\s{3,}|\t+/).forEach(part => { const m2 = matchLabel(part, idx); if (m2 && m2.rest && !(m && m.rest === m2.rest)) out.push({ ...m2, value: m2.rest, how: 'colon', block: b }); });
  }
  return out;
}
const cellBlock = (doc, t, r, c) => doc.blocks.find(b => b.table && b.table.t === t && b.table.r === r && b.table.c === c) || null;
/** Section bodies: blocks after a heading-like label up to the next heading-like label. */
function sections(doc, idx) {
  const heads = [];
  doc.blocks.forEach((b, i) => { if (b.kind === 'cell') return; const m = matchLabel(b.text, idx); if (m && (!m.rest || m.rest.length < 3) && (!isGeneric(m.label) || b.kind === 'heading' || !m.rest)) heads.push({ i, ...m, block: b }); });
  const tableHead = new Map(); // table rows whose first cell is a heading label (e.g. "Isolation Points" title row)
  return heads.map((h, k) => {
    const end = k + 1 < heads.length ? heads[k + 1].i : doc.blocks.length;
    return { field: h.field, label: h.label, head: h.block, blocks: doc.blocks.slice(h.i + 1, end) };
  }).concat([...tableHead.values()]);
}
/** Group the blocks of a section into lines (table rows become one line, cells joined with " | "). */
function sectionLines(blocks, doc) {
  const out = [], seenRows = new Set();
  for (const b of blocks) {
    if (b.kind === 'cell' && b.table) { const key = `${b.table.t}:${b.table.r}`; if (seenRows.has(key)) continue; seenRows.add(key); const row = doc.tables[b.table.t].rows[b.table.r]; out.push({ text: row.filter(Boolean).join(' | '), cells: row, block: b }); continue; }
    for (const l of lines(b.text)) out.push({ text: l, block: b });
  }
  return out;
}

// ---------- 6. impact / mitigation split ----------
const CUES = /\b(to mitigate|mitigation:?|mitigate[ds]? by|temporary|temporarily|portable|fire watch|XL will|GNE will|JLL will|will provide|will be provided|notify|notification|reroute|re-route|back-?feed from|bypass|standby|stand-by|in the meantime|meanwhile|alternate)\b/i;
export function splitImpact(text) {
  const t = String(text || '').trim(); const ex = /^(.*?)\.?\s*Mitigation:\s*(.*)$/is.exec(t); if (ex) return { impact: ex[1].trim(), mitigation: ex[2].trim(), split: false };
  const sents = t.split(/(?<=[.;])\s+(?=[A-Z(])/);
  const i = sents.findIndex((s, k) => k > 0 && CUES.test(s));
  if (i > 0) return { impact: sents.slice(0, i).join(' ').trim(), mitigation: sents.slice(i).join(' ').trim(), split: true };
  const inline = /^(.{12,}?)[,;]\s+((?:to mitigate|XL will|GNE will|a temporary|temporary|portable|notify|reroute)\b.*)$/i.exec(t);
  if (inline) return { impact: inline[1].trim(), mitigation: inline[2].trim(), split: true };
  return { impact: t, mitigation: '', split: false };
}

// ---------- 4. LOTO points ----------
const ISO_VERB = /\b(clos(?:e|ed|ing)\b[^.;]{0,25}\bvalve|lock(?:ed)? (?:and tag|valve|breaker|disconnect)|(?:close|open) and lock|lock(?:ed)?[- ]?out|LOTO|isolat\w*|open(?:ed)? (?:and lock|breaker|disconnect)|de-?energi[sz]\w*|turn(?:ed)? off|shut(?:\s|-)?(?:off|down)|close[ds]? (?:the )?valve|valve (?:closed|off)|rack(?:ed)? out|tag(?:ged)?[- ]?out|breaker|circuit|disconnect)\b/i;
export function energyOf(text) {
  const t = String(text || '');
  if (/\b(valve|V-|DIW|DCW|DHW|CHW|HHW|RO water|steam|condensate|CDA|N2|CO2|gas|vacuum|water|piping|pipe)\b/i.test(t) && !/\b(breaker|circuit|panel|volt|kv|amp|MCC|switchgear|disconnect)\b/i.test(t)) return 'Piping / valve';
  if (/\b(breaker|circuit|ckt|panel|volt|\d{3}\s*V|kv|amp|MCC|switchgear|SWBD|MSB|disconnect|LP-|HP-|DP-|UPS|ATS|XFMR|feeder)\b/i.test(t)) return 'Electrical';
  if (/\b(pneumatic|hydraulic|spring|gravity|stored energy)\b/i.test(t)) return 'Other';
  return '';
}
function pointsFromTable(t) {
  const H = t.rows[0].map(norm); const col = re => H.findIndex(h => re.test(h));
  const ce = col(/equip|panel|source|device|asset|system|switchboard/), cp = col(/point|circuit|ckt|breaker|valve|isolat|lock|tag/), ct = col(/energy|type|hazard/), ca = col(/affect|load|serves|feeds|area served/), cl = col(/location|room|area$/);
  if (ce < 0 && cp < 0) return [];
  return t.rows.slice(1).filter(r => r.some(Boolean)).map(r => {
    const equip = r[ce] || '', point = r[cp] || '', all = r.join(' ');
    return { type: (ct >= 0 && /elec|valve|pip|water|gas|steam|pneu|hydr|mech/i.test(r[ct] || '') ? (/elec/i.test(r[ct]) ? 'Electrical' : /pneu|hydr|mech/i.test(r[ct]) ? 'Other' : 'Piping / valve') : energyOf(all)), equip: equip || (recognize(all).tags[0] || ''), point: point || '', affected: ca >= 0 ? r[ca] || '' : '', location: cl >= 0 ? r[cl] || '' : '', removal: false, att: [], confirmed: '' };
  }).filter(p => p.equip || p.point);
}
function pointsFromLines(ls) {
  const pts = [];
  for (const l of ls) {
    const t = l.text; if (!ISO_VERB.test(t)) continue;
    const r = recognize(t); if (!r.tags.length) continue;
    const panel = r.tags.find(x => /^(LP|HP|HLP|ELP|ULP|LLP|MDP|DP|HDP|EDP|MSB|SWBD|SWGR|MCC|PNL|ATS|UPS)-/.test(x));
    const valve = r.tags.find(x => /^V-/.test(x));
    const ckt = /\b(?:circuits?|ckts?\.?|breakers?)\s*#?\s*(\d+(?:\s*(?:,|&|and|-|–|to)\s*\d+)*)/i.exec(t);
    const equip = panel || valve || r.tags[0];
    const same = pts.find(p => p.equip === equip);
    if (same && (!ckt || same.point === ckt[1].trim())) continue;
    if (same && !same.point && ckt) { same.point = ckt[1].replace(/\s+/g, ' ').trim(); same.type = same.type || energyOf(t); same._line = l; continue; }
    const aff = /\b(?:feeds?|serves?|serving|affects?|feeding|to)\s+([^.;]{3,80})/i.exec(t);
    pts.push({ type: energyOf(t), equip, point: ckt ? ckt[1].replace(/\s+/g, ' ').trim() : valve && equip !== valve ? valve : '', affected: aff ? aff[1].trim() : '', removal: false, att: [], confirmed: '', _line: l });
  }
  return pts;
}

// ---------- 5. work type ----------
const STOP = new Set('the a an and or of to in on for with at by from is are be this that new existing work mop'.split(' '));
const toks = s => norm(s).split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w));
export function scoreWorkTypes(library, { title = '', scope = '', body = '' } = {}) {
  const T = toks(title), Sc = toks(scope), B = toks(body);
  const count = (arr, kw) => { const k = toks(kw); if (!k.length) return 0; if (k.length === 1) return arr.filter(w => w === k[0] || (k[0].length > 4 && w.startsWith(k[0]))).length; const s = arr.join(' '); return s.split(k.join(' ')).length - 1; };
  const scored = (library || []).filter(e => e && e.id && e.name && (!e.status || e.status === 'Active')).map(e => {
    const kws = (e.keywords && e.keywords.length ? e.keywords : toks(e.name)).slice(0, 40);
    let s = 0; for (const kw of kws) s += Math.min(3, count(T, kw)) * 3 + Math.min(3, count(Sc, kw)) * 2 + Math.min(5, count(B, kw));
    return { id: e.id, name: e.name, discipline: e.discipline || '', raw: s, kws: kws.length };
  }).filter(x => x.raw > 0).sort((a, b) => b.raw - a.raw);
  const top = scored[0] ? scored[0].raw : 1;
  return scored.slice(0, 3).map((x, i) => {
    // confidence: how far ahead of the next one and how strong in absolute terms (title hits count most)
    const next = scored[i + 1] ? scored[i + 1].raw : 0, lead = (x.raw - next) / Math.max(1, x.raw), strength = Math.min(1, x.raw / 12);
    return { id: x.id, name: x.name, discipline: x.discipline, score: Math.round(x.raw / top * 100) / 100, confidence: Math.round(Math.min(0.95, 0.35 + 0.35 * strength + 0.3 * lead) * 100) / 100 };
  });
}

// ---------- main ----------
/**
 * doc     DocModel from extract()
 * opts    { library: work types, r4: { rec, kind, mopNo } (template fingerprint, from the main thread),
 *           synonyms: extra labels (lists.json settings.ImportSynonyms), now: Date, file: { name, size, sha256, type },
 *           libraryVersion, roomPattern (RegExp source, decision #8: warn only; null = check off) }
 */
export function mapDoc(doc, opts = {}) {
  const t0 = Date.now(), now = opts.now || new Date(), idx = labelIndex(opts.synonyms);
  const res = { schema: SCHEMA, schemaVersion: SCHEMA_VERSION, meta: { ...(opts.file || {}), pages: doc.pages.length, extractors: ['device'], libraryVersion: opts.libraryVersion || '', layout: 'generic', ocr: !!(doc.meta.ocrPages && doc.meta.ocrPages.length), handwriting: !!doc.meta.handwriting, at: now.toISOString() }, fields: {}, workTypes: [], split: null, unmapped: [], warnings: [...(doc.meta.warnings || [])] };
  const used = new Set(), put = (id, f) => { if (!res.fields[id] || res.fields[id].status === 'not_found' || (f.status !== 'not_found' && f.confidence > res.fields[id].confidence)) res.fields[id] = f; };
  const ocrConf = b => (b && typeof b.conf === 'number' ? Math.max(0.2, Math.min(1, b.conf)) : 1);

  // 1. template fingerprint
  if (opts.r4 && opts.r4.rec) { res.meta.layout = opts.r4.kind === 'Excel intake' ? 'xl-excel' : 'gne-template'; res.r4 = opts.r4; fromRecord(res, opts.r4.rec, CONF.template, opts.r4.kind); }

  // Template files: the Rebuild 4 importer is the only source (identical results), plus two things it doesn't read:
  // the building from the work area and the planned start from "MOP Execute Date" – both marked as added.
  if (res.r4) {
    const r = opts.r4.rec, added = 'Added from the text (the template importer doesn’t read it)';
    if (!r.bldg) { const b = recognize(r.areas || '').bldg[0] || (/^\s*(B\d{1,3}[A-Z]?)\b/i.exec(r.areas || '') || [])[1]; if (b) res.fields.bldg = fv('bldg', b.toUpperCase(), { status: 'inferred', confidence: CONF.free, note: added, sources: [{ page: 1, blockId: null, bbox: null, quote: `Work Area(s): ${r.areas}` }] }); }
    if (!r.start) { const blk = doc.blocks.find(b => /MOP Execute Date:\s*\d/.test(b.text)); const d = blk && parseDateTime(blk.text.replace(/^.*MOP Execute Date:/, '')); if (d) res.fields.start = fv('start', d, { status: 'inferred', confidence: CONF.free, note: added, sources: [src(blk)] }); }
    res.workTypes = scoreWorkTypes(opts.library || [], { title: r.title, scope: r.scope, body: docTextOf(doc) });
    validate(res, now, opts);
    for (const f of FIELDS) if (!res.fields[f.id]) res.fields[f.id] = fv(f.id, ['points', 'steps', 'impacts', 'list', 'people'].includes(f.type) ? [] : '', { note: f.required ? 'Not in the file – Don’t know goes to the XL PM' : '' });
    res.meta.durationMs = Date.now() - t0;
    return res;
  }

  // 2. label anchors
  const P = pairs(doc, idx), S = sections(doc, idx);
  const take = (id, value, how, block, conf, extra = {}) => { if (block) used.add(block.id); put(id, fv(id, value, { confidence: conf * ocrConf(block), sources: block ? [src(block, extra.quote)] : [], note: extra.note || '', normalized: extra.normalized, alternatives: extra.alternatives || [] })); };
  const firstPair = id => P.find(p => p.field === id && p.value && !(isGeneric(p.label) && p.how === 'below'));
  const takeP = (id, p, value, conf, extra) => { if (p.valueBlock) used.add(p.valueBlock.id); take(id, value, p.how, p.valueBlock || p.block, conf, { quote: p.valueBlock ? `${p.label}: ${p.value}` : undefined, ...extra }); used.add(p.block.id); };
  for (const id of ['title', 'scope', 'areas', 'equip', 'subMop', 'req.name', 'req.company', 'req.phone', 'users', 'safety', 'x.isoBy', 'x.isoBy2', 'origin', 'loto.safeOff']) {
    const p = firstPair(id); if (p) takeP(id, p, p.value.replace(/\s+/g, ' ').trim(), isGeneric(p.label) && !['colon', 'right', 'cells'].includes(p.how) ? CONF.weakLabel : CONF.label);
  }
  // long text under a heading ("Scope of Work" + paragraph): the section's first paragraphs
  for (const id of ['scope', 'safety', 'users', 'areas']) {
    if (res.fields[id] && res.fields[id].status !== 'not_found' && res.fields[id].confidence >= CONF.label) continue;
    const s = S.find(x => x.field === id && x.blocks.length); if (!s) continue;
    const paras = []; for (const b of s.blocks) { if (b.kind === 'cell' || b.kind === 'heading' || matchLabel(b.text, idx)) break; paras.push(b); if (paras.join(' ').length > 600 || paras.length >= 3) break; }
    if (paras.length) { paras.forEach(b => used.add(b.id)); used.add(s.head.id); put(id, fv(id, paras.map(b => b.text).join(' '), { confidence: isGeneric(s.label) ? CONF.weakLabel : CONF.label, sources: paras.map(b => src(b)) })); }
  }
  { const p = firstPair('bldg'); if (p) { const b = recognize(p.value).bldg[0] || (/^\s*B?(\d{1,3}[A-Z]?)\s*$/i.exec(p.value) ? 'B' + p.value.trim().replace(/^B/i, '') : p.value.trim()); takeP('bldg', p, b, CONF.label); } }
  { const p = firstPair('priority'); if (p) { const v = /high|critical|\b1\b/i.test(p.value) ? 'H' : /med|moderate|\b2\b/i.test(p.value) ? 'M' : /low|\b3\b/i.test(p.value) ? 'L' : ''; if (v) takeP('priority', p, v, CONF.label); } }
  { // planned start: a date label (+ a separate time label)
    const dp = P.filter(p => p.field === 'start' && p.value).map(p => ({ p, d: parseDateTime(p.value) })).find(x => x.d);
    const tp = P.find(p => p.field === 'startTime' && p.value && parseTime(p.value));
    if (dp) { let d = dp.d; if (!/T/.test(d) && tp) d += 'T' + parseTime(tp.value); takeP('start', dp.p, d, CONF.label, { quote: dp.p.value + (tp ? ' ' + tp.value : '') }); if (tp) { used.add(tp.block.id); if (tp.valueBlock) used.add(tp.valueBlock.id); } }
    const ep = P.find(p => p.field === 'endTime' && p.value);
    const dur = P.find(p => p.field === 'duration' && p.value && parseDuration(p.value));
    if (dur) { const d = parseDuration(dur.value); takeP('duration', dur, `${d.val} ${d.unit}`, CONF.label, { normalized: d }); }
    else if (dp && ep) { const s = dp.d, e = parseDateTime(ep.value) || (parseTime(ep.value) && s.slice(0, 10) + 'T' + parseTime(ep.value)); if (s && e && /T/.test(s) && /T/.test(e)) { const h = (new Date(e) - new Date(s)) / 36e5; if (h > 0) take('duration', `${Math.round(h * 100) / 100} hours`, 'computed', ep.block, CONF.free, { normalized: { val: Math.round(h * 100) / 100, unit: 'hours' }, note: 'Worked out from the start and end times' }); } }
  }
  // sections → lists
  const secOf = id => S.filter(s => s.field === id);
  // several sections for one field (a wrapped title, a repeated heading): steps use the one that looks most like steps
  const stepScore = s => { const ls = sectionLines(s.blocks, doc); return ls.filter(l => (l.cells && /^\d{1,3}$/.test((l.cells[0] || '').trim())) || /^\s*(step\s*)?\d{1,3}[.):]\s/i.test(l.text)).length * 2 + (ls.some(l => l.cells && l.cells.some(c => /^step$/i.test((c || '').trim()))) ? 5 : 0); };
  const listFrom = id => { const out = []; let secs = secOf(id); if ((id === 'steps' || id === 'pre') && secs.length > 1) { const best = secs.map(s => ({ s, v: stepScore(s) })).sort((a, b) => b.v - a.v)[0]; secs = best.v > 0 ? [best.s] : secs.slice(-1); } for (const s of secs) { used.add(s.head.id); for (const l of sectionLines(s.blocks, doc)) { out.push({ ...l, sec: s }); used.add(l.block.id); } } return out; };
  const stepsOf = ls => ls.map(l => {
    if (l.cells) { const c = l.cells.map(x => x.trim()); const num = /^\d{1,3}$/.test(c[0] || ''), desc = num ? c[1] : c.find(x => x.length > 3) || ''; const dur = c.slice(num ? 2 : 1).find(x => parseDuration(x) || /prior|day of|before|after/i.test(x)) || ''; return desc && !/^(step|description|#|no\.?)$/i.test(desc) ? { desc: stripBullet(desc), dur } : null; }
    const t = stripBullet(l.text); if (!t || /^(step|description|duration)$/i.test(t)) return null; const d = /\s[-–(]\s*(\d+(?:\.\d+)?\s*(?:mins?|minutes?|hrs?|hours?|days?))\)?\s*$/i.exec(t);
    return { desc: d ? t.slice(0, d.index).trim() : t, dur: d ? d[1] : '' };
  }).filter(Boolean);
  for (const id of ['steps', 'pre']) { const ls = listFrom(id); if (ls.length) { const st = stepsOf(ls); if (st.length) put(id, fv(id, st.map(s => ({ ...s, src: 'file' })), { confidence: CONF.label * Math.min(...ls.map(l => ocrConf(l.block))), sources: ls.slice(0, 12).map(l => src(l.block, l.text)) })); } }
  for (const id of ['backout', 'x.rts', 'gonogo', 'tools', 'crew', 'x.alarms']) {
    const ls = listFrom(id).filter(l => !/^(step|description|#)$/i.test(l.text)); const p = firstPair(id);
    const items = ls.map(l => stripBullet(l.cells ? l.cells.filter(Boolean).slice(/^\d+$/.test(l.cells[0] || '') ? 1 : 0).join(' – ') : l.text)).filter(Boolean);
    if (!items.length && p && p.value) items.push(p.value);
    if (items.length) put(id, fv(id, items, { confidence: CONF.label * Math.min(1, ...ls.map(l => ocrConf(l.block))), sources: (ls.length ? ls : [{ block: p.block, text: p.value }]).slice(0, 12).map(l => src(l.block, l.text)) }));
  }
  // workers table (Name / Title / Company headers)
  for (const t of doc.tables) {
    const H = (t.rows[0] || []).map(norm), ni = H.findIndex(h => /^(print )?name$/.test(h)), ti = H.findIndex(h => /title|role|trade|position/.test(h)), ci = H.findIndex(h => /company|employer|firm|contractor/.test(h));
    if (ni >= 0 && (ti >= 0 || ci >= 0) && t.rows.length > 1) {
      const ppl = t.rows.slice(1).filter(r => r[ni] && !/^\s*$/.test(r[ni])).map(r => ({ name: r[ni], title: ti >= 0 ? r[ti] || '' : '', company: ci >= 0 ? r[ci] || '' : '' }));
      const head = doc.blocks.find(b => b.table && b.table.t === doc.tables.indexOf(t));
      if (ppl.length && !res.fields.workers) put('workers', fv('workers', ppl, { confidence: CONF.weakLabel, sources: head ? [src(head, ppl.map(p => p.name).join(', '))] : [], note: 'People listed in a table – check which are the qualified workers' }));
    }
  }
  // impacts (+ 6. split)
  { const ls = listFrom('impacts').concat(listFrom('mitigation').map(l => ({ ...l, mitigationOnly: true }))); const out = []; let anySplit = false;
    for (const l of ls) {
      const t = stripBullet(l.cells ? l.cells.filter(Boolean).join(' – ') : l.text); if (!t || t.length < 4 || /^(planned|potential)( impact)?s?:?$/i.test(t)) continue;
      if (l.mitigationOnly && out.length && !out[out.length - 1].mitigation) { out[out.length - 1].mitigation = t; continue; }
      const kind = /potential|possible|risk|could|may /i.test(l.sec.label + ' ' + t) ? 'Potential' : 'Planned';
      const s = splitImpact(t); anySplit = anySplit || s.split; out.push({ kind, impact: s.impact, mitigation: s.mitigation, split: s.split });
    }
    if (out.length) put('impacts', fv('impacts', out, { confidence: anySplit ? CONF.weakLabel : CONF.label, sources: ls.slice(0, 12).map(l => src(l.block, l.text)), note: anySplit ? 'We split this – check' : '' }));
  }

  // 3. recognizers over the whole text (fill what labels didn't)
  const all = doc.blocks.map(b => b.text).join('\n');
  const title = (res.fields.title && res.fields.title.value) || '', scope = (res.fields.scope && res.fields.scope.value) || '';
  if (!res.fields.title || res.fields.title.status === 'not_found') {
    const h = doc.blocks.find(b => b.kind === 'heading' && b.text.length > 8 && b.text.length < 140 && !matchLabel(b.text, idx)) || doc.blocks.find(b => /^Subject:/.test(b.text));
    if (h) take('title', h.text.replace(/^Subject:\s*(fw|fwd|re):?\s*/i, '').replace(/^Subject:\s*/, ''), 'heading', h, CONF.free, { note: 'Taken from the first heading' });
    else if (opts.file && opts.file.name) put('title', fv('title', opts.file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' '), { confidence: CONF.hint, note: 'From the file name' }));
  }
  const rec = recognize([title, scope, (res.fields.areas || {}).value || '', all].join('\n'));
  if (!res.fields.bldg && rec.bldg.length) { const b = doc.blocks.find(x => new RegExp(`\\b(B|building|bldg\\.?)\\s*${rec.bldg[0].slice(1)}\\b`, 'i').test(x.text)); put('bldg', fv('bldg', rec.bldg[0], { confidence: CONF.free, sources: b ? [src(b)] : [], alternatives: rec.bldg.slice(1) })); }
  if (!res.fields.areas && rec.rooms.length) { const b = doc.blocks.find(x => /\brooms?\b|\brm\b/i.test(x.text)); put('areas', fv('areas', rec.rooms.join('; '), { confidence: CONF.free, sources: b ? [src(b)] : [] })); }
  if (!res.fields.equip && rec.tags.length) put('equip', fv('equip', rec.tags.slice(0, 4).join(', '), { confidence: CONF.free, alternatives: rec.tags.slice(4, 10) }));
  if (!res.fields.duration) { const d = parseDuration([title, scope].join(' ')); if (d) put('duration', fv('duration', `${d.val} ${d.unit}`, { confidence: CONF.free, normalized: d })); }
  if (!res.fields.start) { const b = doc.blocks.find(x => parseDateTime(x.text) && /\b(date|scheduled|outage|shutdown|start|on)\b/i.test(x.text)); if (b) put('start', fv('start', parseDateTime(b.text), { confidence: CONF.free, sources: [src(b)], note: 'A date found in the text – check it is the work date' })); }
  if (!res.fields['req.phone']) { const m = /\b(\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4})\b/.exec(all); if (m) { const b = doc.blocks.find(x => x.text.includes(m[1])); put('req.phone', fv('req.phone', m[1], { confidence: CONF.hint, sources: b ? [src(b)] : [] })); } }

  // 4. LOTO points (safety-critical: amber at best)
  { const tbl = doc.tables.find(t => t.rows.length > 1 && (t.rows[0] || []).some(h => /isolat|lock|loto|breaker|circuit|valve|energy/i.test(h)) && (t.rows[0] || []).some(h => /equip|panel|point|circuit|valve|device|source/i.test(h)));
    let pts = tbl ? pointsFromTable(tbl) : [];
    const ptSrc = tbl ? doc.blocks.filter(b => b.table && b.table.t === doc.tables.indexOf(tbl)).slice(0, 8).map(b => src(b)) : [];
    if (!pts.length) { const ls = listFrom('loto.points'); const cand = (ls.length ? ls : doc.blocks.flatMap(b => lines(b.text).map(t => ({ text: t, block: b })))); pts = pointsFromLines(cand); pts.forEach(p => ptSrc.push(src(p._line.block, p._line.text))); pts.forEach(p => delete p._line); }
    if (pts.length && !(res.fields['loto.points'] && res.fields['loto.points'].status === 'found' && res.r4)) {
      put('loto.points', fv('loto.points', pts, { status: tbl ? 'found' : 'inferred', confidence: tbl ? CONF.label : CONF.free, sources: ptSrc, note: pts.length > 6 ? `${pts.length} points – the JLL request splits into ${Math.ceil(pts.length / 6)} linked requests` : '' }));
      const types = [...new Set(pts.map(p => p.type).filter(Boolean))];
      put('loto.energy', fv('loto.energy', pts.map(p => p.type || '?').join(', '), { status: 'inferred', confidence: CONF.free, sources: ptSrc.slice(0, 3), note: types.length ? 'Energy type worked out from the words – check each point' : 'Energy type not clear – pick it for each point' }));
      if (!res.fields['loto.needed'] || res.fields['loto.needed'].status === 'not_found') put('loto.needed', fv('loto.needed', 'Yes', { status: 'inferred', confidence: CONF.free, sources: ptSrc.slice(0, 2), note: 'Isolation points found in the file' }));
    }
  }
  // yes/no safety-critical answers: an explicit answer next to the label, a ticked box, or words in the text
  const YN = {
    'sup.hot': { yes: /\b(hot work|welding|weld|brazing|braze|torch|soldering|cutting torch|grinding)\b/i, no: /\bno hot work\b/i },
    'sup.watch': { yes: /\bfire watch\b/i, no: /\bno fire watch\b/i },
    'sup.impair': { yes: /\b(impairment|impair|fire alarm (?:system )?(?:will be )?(?:disabled|bypassed|on test|in test)|sprinkler (?:system )?(?:shut|drain|isolat)|FACP|disable (?:smoke|fire)|put (?:the )?(?:building|panel) on test)\b/i, no: /\bno (?:fire alarm |FLS |life[- ]safety )?impairment\b/i },
    'sup.cgmp': { yes: /\b(c?GMP|GxP|validated|QA approval|quality assurance|clean ?room|ISO \d)\b/i, no: /\bno (?:c?GMP|GMP impact)\b|\bnon-GMP\b/i },
    'x.cold': { yes: /\b(freezers?|cold rooms?|refrigerators?|-80|cryo\w*|walk-in cooler|incubators?|LN2)\b/i, no: /\bno (?:freezers|cold rooms)\b/i },
    'x.backfeed': { yes: /\b(back-?feed|generator|second feed|tie breaker|alternate (?:source|feed)|dual (?:feed|fed)|PV system|solar)\b/i, no: /\bno (?:other|alternate) (?:power )?source\b/i },
    'loto.needed': { yes: /\b(LOTO|lock ?out|lock-out|tag ?out|lockout)\b/i, no: /\bno (?:LOTO|lock ?out)\b|\bLOTO (?:not required|N\/A)\b/i },
    'sup.jll': { yes: /\bJLL (?:assist|support|crew|to (?:open|close|perform|lock))\b/i, no: /\bno JLL\b/i },
    'sup.siemens': { yes: /\bSiemens\b/i, no: /\bno Siemens\b/i }
  };
  for (const [id, re] of Object.entries(YN)) {
    if (res.fields[id] && res.fields[id].status !== 'not_found' && res.r4) continue;
    const p = P.find(x => x.field === id && x.value);
    if (p && /^(yes|y|no|n|n\/a|required|not required|x|☒|☐)(\b|$)/i.test(p.value.trim())) { const v = /^(yes|y|required|x|☒)/i.test(p.value.trim()) ? 'Yes' : 'No'; takeP(id, p, v, CONF.label); continue; }
    const box = doc.blocks.find(b => new RegExp(`☒\\s*(${(SYNONYMS.labels[id] || []).map(l => l.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|') || '^$'})`, 'i').test(b.text));
    if (box) { take(id, 'Yes', 'box', box, CONF.label, { note: 'Ticked in the file' }); continue; }
    const nb = doc.blocks.find(b => re.no.test(b.text)); if (nb) { take(id, 'No', 'text', nb, CONF.free, { note: 'The file says no' }); continue; }
    const yb = doc.blocks.find(b => re.yes.test(b.text)); if (yb && !res.fields[id]) take(id, 'Yes', 'text', yb, CONF.free, { note: `The file mentions “${(re.yes.exec(yb.text) || [''])[0]}”` });
  }
  { const b = doc.blocks.find(x => /\b(standby|emergency|life[- ]safety|critical) (power|branch)|\bUPS\b|\bATS\b/i.test(x.text)); if (b && !res.fields.emergencyPower) put('emergencyPower', fv('emergencyPower', [/\bUPS\b/.test(b.text) ? 'UPS' : '', /standby|emergency|life[- ]safety|critical|ATS/i.test(b.text) ? 'Standby Power' : ''].filter(Boolean), { status: 'inferred', confidence: CONF.free, sources: [src(b)] })); }

  // 5. work type
  res.workTypes = scoreWorkTypes(opts.library || [], { title: (res.fields.title || {}).value || '', scope: (res.fields.scope || {}).value || '', body: all });
  if (res.workTypes[0] && res.workTypes[0].discipline && !res.fields.discipline) put('discipline', fv('discipline', res.workTypes[0].discipline, { status: 'inferred', confidence: Math.min(CONF.weakLabel, res.workTypes[0].confidence), note: `From the work type “${res.workTypes[0].name}”` }));

  // 7. multi-system: two or more work types strong in separate sections
  { const heads = doc.blocks.filter(b => b.kind === 'heading' || /^(system|section|part)\s+\w+[:.\s-]/i.test(b.text));
    if (heads.length >= 2 && opts.library) {
      const chunks = heads.map((h, i) => { const a = doc.blocks.indexOf(h), z = i + 1 < heads.length ? doc.blocks.indexOf(heads[i + 1]) : doc.blocks.length; return { head: h, text: doc.blocks.slice(a, z).map(b => b.text).join('\n') }; }).filter(c => c.text.length > 200);
      const tops = chunks.map(c => ({ c, w: scoreWorkTypes(opts.library, { title: c.head.text, body: c.text })[0] })).filter(x => x.w && x.w.confidence >= 0.7);
      const distinct = [...new Map(tops.map(x => [x.w.id, x])).values()];
      if (distinct.length >= 2) res.split = { count: distinct.length, sections: distinct.map(x => ({ title: x.c.head.text.slice(0, 80), workType: x.w.name, page: x.c.head.page, blockId: x.c.head.id })) };
    }
  }

  // 8. validators (amber + note; never block)
  validate(res, now, opts);

  // 9. unknowns: every required field that is still missing → not_found; leftover text → unmapped
  for (const f of FIELDS) if (!res.fields[f.id]) res.fields[f.id] = fv(f.id, f.type === 'points' || f.type === 'steps' || f.type === 'impacts' || f.type === 'list' || f.type === 'people' ? [] : '', { note: f.required ? 'Not in the file – Don’t know goes to the XL PM' : '' });
  for (const f of Object.values(res.fields)) for (const s of f.sources || []) if (s.blockId) used.add(s.blockId);
  res.unmapped = doc.blocks.filter(b => !used.has(b.id) && b.text.length > 3 && !matchLabel(b.text, idx) && b.part !== 'header').slice(0, 200).map(b => ({ text: b.text.slice(0, 400), page: b.page, blockId: b.id, bbox: b.bbox || null }));
  res.meta.durationMs = Date.now() - t0;
  return res;
}

function validate(res, now, opts) {
  const F = res.fields, warn = (id, note) => { if (F[id] && F[id].status !== 'not_found') { F[id].confidence = Math.min(F[id].confidence, GREEN - 0.01); F[id].note = [F[id].note, note].filter(Boolean).join(' · '); } };
  if (F.start && F.start.value) { const d = new Date(F.start.value.length === 10 ? F.start.value + 'T12:00' : F.start.value); if (!isNaN(d) && d < now) warn('start', 'This date is in the past – is it the old MOP’s date?'); }
  if (F.areas && F.bldg && F.areas.value && F.bldg.value && opts.roomPattern) { try { const re = new RegExp(opts.roomPattern.replace('{bldg}', String(F.bldg.value).replace(/^B/i, '')), 'i'); const rooms = recognize(F.areas.value).rooms; if (rooms.length && !rooms.some(r => re.test(r))) warn('areas', `Room numbers don’t look like building ${F.bldg.value} – check`); } catch { /* bad pattern: check off */ } }
  if (F.steps && F.steps.value.length && F.duration && F.duration.normalized && F.duration.normalized.val) {
    const toH = s => { const d = parseDuration(s); return d ? (d.unit === 'days' ? d.val * 24 : d.val) : 0; };
    const sum = F.steps.value.reduce((a, s) => a + toH(s.dur), 0), tot = F.duration.normalized.unit === 'days' ? F.duration.normalized.val * 24 : F.duration.normalized.val;
    if (sum > 0 && sum > tot * 1.25) warn('steps', `Step times add up to ${Math.round(sum * 10) / 10} h, more than the ${tot} h duration`);
  }
  if (F['loto.points'] && F['loto.points'].value.length) {
    const types = new Set(F['loto.points'].value.map(p => p.type)), text = [F.scope && F.scope.value, F.title && F.title.value].join(' ');
    if (/\b(water|valve|steam|gas|CDA|piping)\b/i.test(text) && !types.has('Piping / valve')) warn('loto.points', 'The work mentions piping but no valve isolation was found');
    if (/\b(electrical|breaker|circuit|panel|power)\b/i.test(text) && !types.has('Electrical')) warn('loto.points', 'The work mentions power but no electrical isolation was found');
    if (types.has('Electrical') && F.steps && F.steps.value.length && !F.steps.value.some(s => /absence of voltage|zero (?:energy|voltage)|verify de-?energi|test (?:for|before touch)|live[- ]dead[- ]live|voltage test|tested dead/i.test(s.desc))) warn('steps', 'Electrical work: no step to test for absence of voltage at the point of work');
  }
}

/** Fingerprint path: Rebuild 4 record → fields (confidence 0.95; safety-critical capped at amber). */
function fromRecord(res, r, conf, kind) {
  const s = [{ page: 1, blockId: null, bbox: null, quote: `${kind} – read by the GNE template importer` }];
  const set = (id, v, extra = {}) => { const empty = v == null || v === '' || (Array.isArray(v) && !v.length); if (!empty) res.fields[id] = fv(id, v, { confidence: conf, sources: s, ...extra }); };
  set('title', r.title); set('scope', r.scope); set('origin', r.origin); set('bldg', r.bldg); set('areas', r.areas); set('equip', r.equip);
  set('start', r.start); if (r.durVal) set('duration', `${r.durVal} ${r.durUnit || 'hours'}`, { normalized: { val: +r.durVal, unit: r.durUnit || 'hours' } });
  set('priority', r.priority); set('subMop', r.subMop); set('subShort', r.subShort); set('discipline', r.discipline);
  set('req.name', r.req && r.req.name); set('req.company', r.req && r.req.company); set('req.phone', r.req && r.req.phone); set('inService', r.inService); set('users', r.users);
  set('safety', r.safety); set('tools', lines(r.tools)); set('crew', lines(r.crew)); set('gonogo', lines(r.gonogo)); set('backout', lines(r.backout));
  set('steps', (r.steps || []).filter(x => x.desc && x.desc.trim())); set('pre', (r.pre || []).filter(x => x.desc && x.desc.trim()));
  set('impacts', (r.impacts || []).filter(x => x.impact && x.impact.trim())); set('workers', (r.workers || []).filter(x => x.name && x.name.trim())); set('subs', r.subs || []);
  const sys = r.sys && Object.values(r.sys).some(g => g.level || g.items.length || g.other || g.notes); if (sys) set('sys', r.sys);
  const x = r.x || {}; set('x.rts', lines(x.rts)); set('x.isoBy', x.isoBy); set('x.isoBy2', x.isoBy2); set('x.alarms', lines(x.alarms));
  const sup = r.sup || {}; for (const k of ['jll', 'siemens', 'impair', 'hot', 'watch', 'cgmp']) set('sup.' + k, sup[k]);
  if (r.loto) { set('loto.needed', r.loto.needed); set('loto.points', (r.loto.points || []).filter(p => p.equip || p.point)); }
  const el = r.sys && r.sys.elec ? r.sys.elec.items.filter(i => /UPS|Standby/.test(i)) : []; set('emergencyPower', el);
}

export { matchLabel, labelIndex, pairs, sections };

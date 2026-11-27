// Apply a reviewed ExtractionResult to a request record (Tier A plan §2 U4).
// Merge order: user-entered > confirmed import > library default > suggestion.
//  - decisions[fieldId] = { action: 'use' | 'fix' | 'skip' | 'dk' | 'keep', value? } ('keep' = keep mine on a conflict)
//  - a field with no decision is not applied (it is still a suggestion)
//  - a value already in the draft (typed by the user) is never overwritten: it is a conflict ("File says X –
//    Keep mine / Use file") until the user picks
//  - fingerprint (GNE template) imports start from the Rebuild 4 record, so accepting everything gives exactly
//    what the Rebuild 4 importer gives
// Also: importAudit (what was suggested, what the user decided, the final value) and the Import Gate.
import { FIELDS, FIELD_BY_ID, isSafety } from './fields.js';

export const EXTRACTOR_VERSION = 'tier-a-1';
const DK_PATHS = new Set(['sup.siemens', 'sup.impair', 'sup.hot', 'sup.watch', 'sup.jll', 'sup.cgmp', 'loto.needed', 'loto.safeOff', 'x.backfeed', 'x.cold', 'x.eyewash', 'x.dp', 'x.isoBy', 'x.isoBy2']);
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const set = (o, p, v) => { const ks = p.split('.'); let a = o; for (const k of ks.slice(0, -1)) { if (a[k] == null || typeof a[k] !== 'object') a[k] = {}; a = a[k]; } a[ks[ks.length - 1]] = v; };
const isEmpty = v => v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.filter(x => x && (typeof x !== 'object' || Object.values(x).some(y => y && String(y).trim()))).length);
const joinLines = v => (Array.isArray(v) ? v.join('\n') : String(v || ''));
const clone = o => JSON.parse(JSON.stringify(o));
const POINT = p => ({ type: p.type || '', equip: p.equip || '', point: p.point || '', affected: p.affected || '', removal: !!p.removal, att: [], confirmed: '' });

/** What a field value looks like in the record (path → value). */
export function recordValue(id, value, normalized) {
  switch (id) {
    case 'duration': { const n = normalized && typeof normalized === 'object' ? normalized : null; const m = /([\d.]+)\s*(hours?|days?|weeks?)/i.exec(String(value)); return n ? { durVal: String(n.val), durUnit: n.unit } : m ? { durVal: m[1], durUnit: /day/i.test(m[2]) ? 'days' : /week/i.test(m[2]) ? 'weeks' : 'hours' } : {}; }
    case 'start': { const v = String(value || ''); return { start: /^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T07:00' : v.slice(0, 16) }; }
    case 'tools': case 'crew': case 'gonogo': case 'backout': return { [id]: joinLines(value) };
    case 'x.rts': case 'x.alarms': return { [id]: joinLines(value) };
    case 'steps': case 'pre': return { [id]: (value || []).map(s => ({ desc: s.desc || '', dur: s.dur || '', ...(s.src ? { src: s.src } : {}) })) };
    case 'impacts': return { impacts: (value || []).map(x => ({ kind: x.kind || 'Planned', impact: x.impact || '', mitigation: x.mitigation || '' })) };
    case 'workers': return { workers: (value || []).map(w => ({ name: w.name || '', title: w.title || '', company: w.company || '' })) };
    case 'subs': return { subs: (value || []).map(w => ({ name: w.name || '', title: w.title || '', company: w.company || '', phone: w.phone || '' })) };
    case 'loto.points': return { 'loto.points': (value || []).map(POINT) };
    case 'loto.energy': return {};
    case 'emergencyPower': return { 'sys.elec.items': value || [] };
    default: return { [FIELD_BY_ID[id] ? FIELD_BY_ID[id].path : id]: value };
  }
}

/** Fields of the result that carry a value (the review cards). */
export const offered = result => Object.entries(result.fields).filter(([, f]) => f.status !== 'not_found').map(([id]) => id);

/** Conflicts: the draft already has a different value the user typed. */
export function conflictsFor(result, base) {
  const out = [];
  for (const id of offered(result)) {
    const f = result.fields[id], want = recordValue(id, f.value, f.normalized);
    for (const [p, v] of Object.entries(want)) { if (p === 'sys.elec.items') continue; const cur = get(base, p); if (!isEmpty(cur) && JSON.stringify(cur) !== JSON.stringify(v)) out.push({ id, path: p, mine: cur, file: v }); }
  }
  return out;
}

/**
 * base: the current draft record (a fresh one for "Start from an existing MOP"); blank: a blank record (for Skip on a
 * fingerprint import). Returns { record, applied: [ids], flagged: [paths] }.
 */
export function applyResult(result, decisions, base, blank) {
  const fp = !!(result.r4 && result.r4.rec);
  const rec = fp ? Object.assign(clone(result.r4.rec), { req: { ...clone(result.r4.rec.req || {}), ...Object.fromEntries(Object.entries(base.req || {}).filter(([, v]) => v)) } }) : clone(base);
  if (fp) for (const k of ['x']) rec[k] = { ...clone(base.x || {}), ...clone(result.r4.rec.x || {}), flags: { ...((base.x || {}).flags || {}) }, auto: {}, autoEd: {} };
  rec.x = rec.x || {}; rec.x.flags = rec.x.flags || {};
  const applied = [], flagged = [];
  for (const f of FIELDS) {
    const id = f.id, d = decisions[id], fld = result.fields[id];
    if (!d) continue;
    if (d.action === 'dk') { const p = f.path; if (DK_PATHS.has(p)) { rec.x.flags[p] = true; flagged.push(p); } continue; }
    if (d.action === 'keep') continue;
    if (fp && d.action === 'use' && !(fld && /added from the text/i.test(fld.note || ''))) { applied.push(id); continue; } // already the Rebuild 4 value
    if (d.action === 'skip') { if (fp && blank) for (const p of Object.keys(recordValue(id, fld && fld.value, fld && fld.normalized))) set(rec, p, clone(get(blank, p))); continue; }
    const value = d.action === 'fix' ? d.value : fld && fld.value, norm = d.action === 'fix' ? d.normalized : fld && fld.normalized;
    if (isEmpty(value)) continue;
    for (const [p, v] of Object.entries(recordValue(id, value, norm))) {
      if (p === 'sys.elec.items') { const items = new Set([...(get(rec, p) || []), ...v]); set(rec, p, [...items]); continue; }
      if (p === 'steps' && !fp) { const cur = (get(rec, p) || []).filter(s => s.desc && s.desc.trim()), seen = new Set(cur.map(s => s.desc.trim().toLowerCase())); set(rec, p, [...cur, ...v.filter(s => !seen.has(s.desc.trim().toLowerCase()))]); continue; }
      set(rec, p, clone(v));
    }
    if (FIELD_BY_ID[id] && DK_PATHS.has(FIELD_BY_ID[id].path)) delete rec.x.flags[FIELD_BY_ID[id].path];
    applied.push(id);
  }
  if (!rec.steps || !rec.steps.length) rec.steps = [{ desc: '', dur: '' }];
  if (!rec.impacts || !rec.impacts.length) rec.impacts = [{ kind: 'Planned', impact: '', mitigation: '' }];
  return { record: rec, applied, flagged };
}

/** importAudit kept in the draft and written next to the MOP on sync (MOP-### rev N_import-audit.json). */
export function auditFor(result, decisions, { by = '', at = new Date().toISOString(), extractorVersion = EXTRACTOR_VERSION } = {}) {
  return {
    schema: 'gne-mop-import-audit', schemaVersion: 1,
    file: { name: result.meta.name || '', sha256: result.meta.sha256 || '', size: result.meta.size || 0, type: result.meta.type || '' },
    extractor: { kind: 'device', version: extractorVersion, layout: result.meta.layout, ocr: !!result.meta.ocr }, libraryVersion: result.meta.libraryVersion || '', importSchemaVersion: result.schemaVersion,
    by, at,
    fields: Object.fromEntries(Object.entries(result.fields).filter(([id, f]) => f.status !== 'not_found' || decisions[id]).map(([id, f]) => {
      const d = decisions[id] || null;
      return [id, { suggested: f.value, status: f.status, confidence: f.confidence, safetyCritical: f.safetyCritical, decision: d ? d.action : 'none', final: d ? (d.action === 'fix' ? d.value : d.action === 'use' ? f.value : d.action === 'dk' ? "Don't know" : null) : null, decidedAt: d && d.at || null }];
    })),
    workTypes: result.workTypes, unmapped: result.unmapped.length, warnings: result.warnings.map(w => w.code)
  };
}

/** Import Gate: safety-critical fields that came from the file and are not confirmed yet (ids). */
export function gatePending(review) {
  if (!review || !review.result || review.done === 'cancelled') return [];
  const r = review.result, d = review.decisions || {};
  return Object.entries(r.fields).filter(([id, f]) => isSafety(id) && f.status !== 'not_found' && !(d[id] && ['use', 'fix', 'skip', 'dk', 'keep'].includes(d[id].action))).map(([id]) => id);
}
export const GATE_MESSAGE = n => `Check the ${n} safety item${n > 1 ? 's' : ''} read from the file first (Import → Check what we found).`;

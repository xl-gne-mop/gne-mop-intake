// MOP review 11/26/26 (GNE Alliance MOP Library Import 2026.11.26, App Logic AL-xx / Schema Changes).
// Everything here is new behaviour layered on the ported Rebuild 4/5 code; the reference rule list
// (failureModes.js RULES) and sri.js are untouched. Text that comes from GNE material (add-on steps, overlays,
// emergency numbers) lives in the Drive library / lists files, never in this public code.
// Record fields: r.x.rv (request) and extra fields on each LOTO point. Print: only appended to text the MOP
// template already prints (Safety, the isolation point, return to service), so the Word layout never changes.
import { R, S, cfg, now, D, toast, clone } from '../core/state.js';
import { libById, tok, durMin, stepsTotal } from '../lib/library.js';
import { hasStep, impHas } from './failureModes.js';
import { fl } from './dontKnow.js';

/* ---------- catalogs (generic labels, no GNE data) ---------- */
export const PERMIT_TYPES = [
  ['SWA', 'Safe Work Authorization (SWA)'], ['ConfinedSpace', 'Confined space'], ['HotWork', 'Hot work'], ['HotTap', 'Hot tap'], ['LineFreeze', 'Line freeze'],
  ['FireDetectionImpairment', 'Fire detection impairment'], ['FireSuppressionImpairment', 'Fire suppression impairment'], ['MobileCrane', 'Mobile crane'],
  ['Radiography', 'Radiography'], ['Abatement', 'Abatement / hazardous materials removal'], ['EnergizedElectrical', 'Energized electrical work (not allowed – XLC)']
];
const PERMIT_LABEL = Object.fromEntries(PERMIT_TYPES);
const PERMITVISION = ['HotWork', 'HotTap', 'LineFreeze', 'FireDetectionImpairment', 'FireSuppressionImpairment', 'ConfinedSpace', 'MobileCrane'];
export const SIEMENS_ROLES = [['BAS', 'BAS / controls'], ['FLS', 'FLS – impairment permit'], ['MAC', 'MAC – FA technician on site']];
export const ARC_LABELS = ['Caution', 'Warning', 'Danger'];
export const LOTO_BY = ['JLL building engineers', 'PG&E', 'UOME electricians', 'Sub (own lock on new breakers)', 'Testing vendor (switching)'];
export const INSPECTIONS = ['None', 'City', 'Special inspector', 'Geotech'];
export const EXTRA_DISCIPLINES = ['Demolition', 'Civil', 'Structural', 'General'];

export const RV = () => ({ permitNo: '', permitTypes: [], pe: '', peNo: '', qeNo: '', dnNo: '', drawing: '', decon: '', vibration: '', offHours: '', offHoursWhy: '', siteMap: '', swp: '',
  siemensRole: [], dailyRestore: '', cse: '', excav: '', excavDeep: '', crane: '', inspection: '', ctrlArea: '', multiShift: '', energized: '', hotWhere: '', riskBy: '',
  egress: '', tests: '', occupied: '', walkDate: '', added: {} });
export const POINT_X = () => ({ room: '', voltage: '', fedFrom: '', arcLabel: '', arcCal: '', lotoBy: 'JLL building engineers', tagRef: '' });

export function ensureRv(r) {
  const d = RV(); r.x.rv = Object.assign(d, r.x.rv && typeof r.x.rv === 'object' ? r.x.rv : {});
  for (const k of ['permitTypes', 'siemensRole']) if (!Array.isArray(r.x.rv[k])) r.x.rv[k] = [];
  if (!r.x.rv.added || typeof r.x.rv.added !== 'object') r.x.rv.added = {};
  if (r.loto && Array.isArray(r.loto.points)) r.loto.points.forEach(p => { for (const [k, v] of Object.entries(POINT_X())) if (p[k] === undefined) p[k] = v; }); // lotoBy defaults to JLL (Schema Changes)
  return r;
}

/* ---------- settings from lists.json (cfg().review, built in src/config/lists.js) ---------- */
import { reviewSettings } from './review-settings.js';
export { reviewSettings };
const RS = () => cfg().review || reviewSettings({}, (o, k, d) => d);

/* ---------- triggers ---------- */
const txtOf = r => [r.title, r.scope, r.equip, r.areas].join(' ');
const stepTxt = r => r.steps.map(x => x.desc).join(' ');
const libOf = r => libById(r.x.lib && r.x.lib.id);
export function isElectrical(r) { const e = libOf(r); return r.discipline === 'Electrical' || (e && e.discipline === 'Electrical') || (r.loto.needed === 'Yes' && r.loto.points.some(p => p.type === 'Electrical')); }
const DECON_RE = /\b(lab(oratory)? waste|pumped waste|cip|clean[- ]in[- ]place|process (line|piping|waste|vent)|p-?traps?|lab equipment|waste piping|kds)\b/i;
const TEST_RE = /\b(pressure[- ]test\w*|hydro(static)?[- ]?test\w*|leak[- ]test\w*|purge\w*|purity[- ]test\w*|test report|insulation resistance|megger)\b/i;
const daysTo = r => { const s = R.startOf(r); return s ? (s - now()) / 864e5 : null; };
const hours = r => (parseFloat(r.durVal) || 0) * (r.durUnit === 'days' ? 24 : r.durUnit === 'weeks' ? 168 : 1);
export const multiDay = r => hours(r) > 24 || r.x.rv.multiShift === 'Yes';
export const permitTypesOf = r => [...new Set([...(r.x.rv.permitTypes || [])])];
export const needsPermitNo = r => permitTypesOf(r).some(k => PERMITVISION.includes(k)) || r.sup.impair === 'Yes' || (r.sup.hot === 'Yes' && r.x.rv.hotWhere !== 'Off-site shop');
export const deconNeeded = r => DECON_RE.test(txtOf(r) + ' ' + stepTxt(r));
export const testsNeeded = r => TEST_RE.test(stepTxt(r) + ' ' + r.scope);
export const egressNeeded = r => r.loto.needed === 'Yes' && (r.sys.elec.items.includes('Standby Power') || /\b(em|emergency) (panel|lighting)\b|\belp\b/i.test(txtOf(r) + ' ' + r.loto.points.map(p => p.equip).join(' ')));
export function tierFloor(r) { const v = r.x && r.x.rv; if (!v) return null; if (v.cse === 'Yes') return [3, 'confined space entry']; if (v.excavDeep === 'Yes') return [3, 'excavation deeper than 5 ft']; return null; }

/* ---------- add-ons (AL-14, AL-26, overlays) – text comes from the library file ---------- */
const ADDON_LABEL = { cse: 'confined space', excav: 'excavation', crane: 'crane pick', inspection: 'inspection hold point', ctrlArea: 'controlled area (CPMF)', multiShift: 'end-of-shift steps' };
export function addonOn(r, k) { const v = r.x.rv; return k === 'inspection' ? !!v.inspection && v.inspection !== 'None' : v[k] === 'Yes'; }
/** The add-on for flag k: the library overlay, else the work type that carries that flag (its pre-steps, steps, crew, tools). */
export function addonFor(k) {
  const lib = S.libraryFile || {}, ov = lib.overlays && lib.overlays[k];
  if (ov) return ov;
  const e = (S.library || []).find(w => w.flags && w.flags[k] === 'Yes');
  return e ? { pre: e.pre || [], steps: (e.steps || []).slice(1, -1).map(([desc, dur]) => ({ desc, dur, at: 'before' })), crew: e.crew || '', tools: e.tools || '', from: e.name } : null;
}
const lnz = t => String(t || '').split('\n').map(s => s.trim()).filter(Boolean);
const addLines = (cur, add, max) => { const a = lnz(cur); for (const l of lnz(add)) if (!a.some(x => x.toLowerCase() === l.toLowerCase())) a.push(l); return fold(a, max).join('\n'); };
/** Keep every line but fit the template: the lines past max-1 are joined onto the last line. */
export function fold(lines, max) { const a = lines.slice(); return a.length > max ? a.slice(0, max - 1).concat(a.slice(max - 1).join('; ')) : a; }
/** Pre-MOP steps: the template holds 2 job-specific rows; extra steps join the second row with their timing. */
export function foldPre(list, max = R.LIMITS.preExtra) {
  const a = list.filter(p => p.desc && p.desc.trim()).map(p => ({ desc: p.desc, dur: p.dur || '' }));
  if (a.length <= max) return a;
  const keep = a.slice(0, max - 1), rest = a.slice(max - 1);
  return keep.concat({ desc: rest.map((p, i) => (i && p.dur ? `(${p.dur}) ` : '') + p.desc).join('; '), dur: rest[0].dur });
}
export function applyAddon(r, k) {
  const a = addonFor(k); if (!a) return false;
  const pre = (a.pre || []).map(p => ({ desc: tok(p.desc, r), dur: p.dur || '' }));
  if (pre.length) r.pre = foldPre([...r.pre, ...pre.filter(p => !r.pre.some(x => x.desc === p.desc))]);
  if (r.steps.length === 1 && !r.steps[0].desc.trim()) r.steps = [];
  const wi = (() => { const i = r.steps.findIndex(x => /performs the|makes the tie-in|work proceeds|main work/i.test(x.desc)); return i < 0 ? Math.min(1, r.steps.length) : i; })();
  let before = 0;
  for (const s of a.steps || []) {
    const st = { desc: tok(s.desc, r), dur: s.dur || '' }; if (r.steps.some(x => x.desc === st.desc)) continue;
    if (r.steps.length >= R.LIMITS.steps) { toast('44 steps is the most the MOP holds.'); break; }
    if (s.at === 'after') r.steps.splice(Math.min(r.steps.length, wi + before + 1), 0, st); else if (s.at === 'end') r.steps.push(st); else { r.steps.splice(wi + before, 0, st); before++; }
  }
  if (a.crew) r.crew = addLines(r.crew, a.crew, R.LIMITS.crew);
  if (a.tools) r.tools = addLines(r.tools, a.tools, R.LIMITS.tools);
  if (a.safety) r.safety = [r.safety.trim(), ...lnz(a.safety).filter(l => !r.safety.includes(l))].filter(Boolean).join('\n');
  if (a.gonogo) r.gonogo = addLines(r.gonogo, a.gonogo, R.LIMITS.gonogo);
  r.x.rv.added[k] = true; R.normalize(r); return true;
}

/* ---------- gaps (block submit; "Don't know" silences the ones with a path) ---------- */
const G = (s, m, p, fix) => ({ s, m, p, rule: 'review', fix: fix || null });
export function reviewGaps(q) {
  const r = q.record; ensureRv(r); const v = r.x.rv, lo = r.loto.needed === 'Yes', e = libOf(r), o = [];
  const add = (cond, s, m, p, fix) => { if (cond && !(p && fl(r, p))) o.push(G(s, m, p, fix)); };
  // AL-25 occupancy (where screen)
  add(!v.occupied, 2, 'Answer: is the work area or the area next to it occupied?', 'x.rv.occupied');
  add(v.occupied === 'Yes' && !(r.sys.env.items.includes('Noise') && r.sys.env.items.includes('Dust')), 4, 'Occupied area: tick Noise and Dust under Environmental and say how they are controlled', null);
  add(v.offHours === 'Yes' && !v.offHoursWhy.trim(), 2, 'Off-hours work: say why (vibration, odor, dust, epoxy, abatement, BizOps hours, fire alarm outputs)', null);
  add(multiDay(r) && !v.multiShift, 2, 'Answer: does this MOP run over more than one shift or day?', 'x.rv.multiShift');
  // AL-07 / AL-12 LOTO
  add(isElectrical(r) && !v.energized, 3, 'Answer: will any task be done on exposed live parts?', 'x.rv.energized');
  if (lo) r.loto.points.forEach((p, i) => {
    const n = i + 1, b = `loto.points.${i}`;
    if (p.type === 'Electrical') {
      add(!p.room.trim(), 3, `Isolation point ${n}: room of the panel`, b + '.room');
      add(!p.voltage.trim(), 3, `Isolation point ${n}: voltage (e.g. 120/208V, 277/480V)`, b + '.voltage');
      add(!p.fedFrom.trim(), 3, `Isolation point ${n}: fed from (panel and breaker)`, b + '.fedFrom');
      add(!p.arcLabel, 3, `Isolation point ${n}: arc flash label (Caution, Warning or Danger)`, b + '.arcLabel');
      add(p.arcLabel === 'Warning' && !(parseFloat(p.arcCal) > 0), 3, `Isolation point ${n}: arc flash incident energy (cal/cm²) from the Warning label`, b + '.arcCal');
      add(p.arcLabel === 'Danger', 3, `Isolation point ${n}: the panel has a Danger arc flash label – no work on that panel. Change the plan with the GNE PM.`, null);
    } else add(!p.tagRef.trim(), 3, `Isolation point ${n}: valve tag, or a photo plus a drawing reference`, b + '.tagRef');
    add(!p.lotoBy, 3, `Isolation point ${n}: who places the lock`, null);
  });
  add(egressNeeded(r) && !v.egress.trim(), 4, 'Emergency power / lighting LOTO: list the rooms that lose egress lighting', 'x.rv.egress');
  // AL-06 impacts, Go/No-Go and back-out on every MOP
  add(r.impacts.some(i => i.impact.trim()) && !r.impacts.some(i => i.kind === 'Potential' && i.impact.trim()), 5, 'Add at least one Potential impact (what could go wrong) and its mitigation', null);
  add(!R.lines(r.gonogo).length && !(r.priority === 'H' || lo), 7, 'Add at least one Go / No-Go condition', null);
  add(!R.lines(r.backout).length && !(r.priority === 'H' || lo), 7, 'Add at least one back-out step', null);
  add(e && e.residualRisk && !v.riskBy.trim(), 5, 'Purge: fix the end state and name who accepts the residual risk (e.g. purity results due after the LOTO comes off)', 'x.rv.riskBy');
  // Support (AL-11, AL-18, AL-21, AL-22, AL-28)
  add(permitTypesOf(r).includes('EnergizedElectrical'), 6, 'Energized electrical work is not allowed under XLC policy: de-energize, or the GNE PM hires direct or schedules it at a campus shutdown', null);
  add(r.sup.hot === 'Yes' && !v.hotWhere, 6, 'Answer: where is the hot work done (on site or in an off-site shop)?', 'x.rv.hotWhere');
  add(r.sup.siemens === 'Yes' && !v.siemensRole.length, 6, 'Siemens: pick their role (BAS / controls, FLS impairment permit, MAC fire alarm technician)', 'x.rv.siemensRole');
  add(deconNeeded(r) && !v.decon, 6, 'Lab waste, process lines, CIP or lab equipment: is the GNE decontamination certificate received?', 'x.rv.decon');
  const t = q.tier || 0;
  add(t >= 2 && r.sup.walk !== 'Yes', 6, 'Tier 2–3: do the scope walk with the User Team Lead / Lab Manager (or tap Don’t know)', 'sup.walk');
  // Steps (AL-17, AL-19, AL-26, AL-14)
  if (lo && r.loto.points.some(p => p.type === 'Electrical')) {
    const s = r.steps.find(x => /absence of voltage|live.?dead.?live|test(s|ing)? for (zero|no) voltage/i.test(x.desc));
    add(s && !/prov\w* the tester|known (live )?source/i.test(s.desc), 7, 'Voltage test step: keep “prove the tester on a known source before and after”', null);
  }
  add(testsNeeded(r) && !v.tests.trim(), 7, 'Tests: record the medium, pressure, hold time and witness for every test (no default limits)', 'x.rv.tests');
  for (const k of Object.keys(ADDON_LABEL)) add(addonOn(r, k) && !v.added[k] && !!addonFor(k), 7, `Add the ${ADDON_LABEL[k]} steps (tap Add ${ADDON_LABEL[k]} steps)`, null, 'addon:' + k);
  return o;
}

/* ---------- notes (warnings and info, never block) ---------- */
export function reviewNotes(q) {
  const r = q.record; ensureRv(r); const v = r.x.rv, e = libOf(r), c = RS(), o = [], d = daysTo(r), lo = r.loto.needed === 'Yes';
  if (v.energized === 'Yes') o.push({ l: 'warn', m: 'No energized work under XLC policy (an EEWP needs 28 days and is not allowed). De-energize, or the GNE PM hires direct or schedules it at a campus shutdown. For metering on a live panel use the panel metering work type.', s: 3 });
  if (lo && r.loto.points.length > cfg().rules.jllMaxLines) o.push({ l: 'warn', m: `More than ${cfg().rules.jllMaxLines} LOTO points: send them to JLL as separate requests.`, s: 3 });
  if (d !== null) for (const k of permitTypesOf(r)) { const n = c.permitLead[k]; if (n && d < n) o.push({ l: 'warn', m: `${PERMIT_LABEL[k] || k} permit needs ${n} days in PermitVision; the work starts in ${Math.max(0, Math.floor(d))}.`, s: 6 }); }
  if (e && e.permitHours) {
    const tt = stepsTotal(r).min; if (tt > c.permitMaxHours * 60) o.push({ l: 'warn', m: `The steps run ${Math.round(tt / 60)} hours; a hot tap / line freeze permit is valid ${c.permitMaxHours} hours. Split the work or plan a second permit.`, s: 7 });
    o.push({ l: 'info', m: `Hot tap / line freeze: in-person job walk at least ${c.jobWalkDays} days before the work (JLL HSM verifies the permit within 48 business hours).`, s: 6 });
    if (d !== null && d < 14) o.push({ l: 'warn', m: 'Under 14 days for a hot tap / line freeze is an emergency: get the program manager to agree.', s: 2 });
  }
  if (d !== null && v.swp !== 'Yes' && d <= c.swpLeadDays) o.push({ l: 'warn', m: `Project Safe Work Plan must be approved by GNE ${c.swpLeadDays} days before start. Tell the XL PM.`, s: 6 });
  if (v.decon === 'Requested') o.push({ l: 'warn', m: 'Decontamination certificate requested: it is No-Go until GNE sends it.', s: 6 });
  if (v.hotWhere === 'Off-site shop') o.push({ l: 'info', m: 'Hot work in an off-site shop: no hot work permit or fire watch on site (spools only).', s: 6 });
  if (v.walkDate && R.lead(r, now(), cfg().rules)) { const ld = R.lead(r, now(), cfg().rules), w = new Date(v.walkDate + 'T00:00'); if (ld.jllNeeded && ld.jllLatest && w > ld.jllLatest) o.push({ l: 'warn', m: 'The scope walk is after the date the JLL request must go in. Walk it earlier.', s: 6 }); }
  if (v.multiShift === 'Yes') o.push({ l: 'info', m: 'Multi-shift MOP: repeat the pre-task brief and Go/No-Go at the start of every shift.', s: 7 });
  if (v.ctrlArea === 'Yes') o.push({ l: 'info', m: 'Controlled area: confirm the entry route, gowning and Equipment Entry Log with the CPMF area owner.', s: 1 });
  const pm = reviewPermits(r); if (pm.length) o.push({ l: 'info', m: 'Also needed: ' + pm.join('; '), s: 6 });
  const tf = tierFloor(r); if (tf) o.push({ l: 'info', m: `Tier 3 because of the ${tf[1]}.`, s: 1 });
  if (v.excav === 'Yes') o.push({ l: 'info', m: 'Excavation: USA North 811 ticket and a private locate before digging; a competent person on site.', s: 6 });
  if (v.cse === 'Yes') o.push({ l: 'info', m: 'Confined space: entry permit, 4-gas meter, entry supervisor and attendant, rescue plan.', s: 6 });
  return o.map(n => ({ ...n, rule: 'review' }));
}

/** Extra permits and notices (AL-11, AL-24) added to permitsFor. */
export function reviewPermits(r) {
  ensureRv(r); const v = r.x.rv, t = txtOf(r), p = [];
  for (const k of permitTypesOf(r)) if (k !== 'EnergizedElectrical') p.push(`PermitVision: ${PERMIT_LABEL[k] || k}`);
  if (/\b(generator|gen(set)?|loading dock|dock)\b/i.test(t)) p.push('Notify JLL and GNE (generator / dock)');
  if (/\b(automation|control panel|plc)\b/i.test(t)) p.push('Siemens / automation involved');
  if (/\b(idf|mdf|it room|patch(ing)?|network closet)\b/i.test(t)) p.push('Notify GNE IT');
  if (/\b(doors?|door operator|frames?|card reader)\b/i.test(t)) p.push('Notify GNE Security (doors)');
  if (v.pe === 'Yes') p.push('Planned Event (PE)' + (v.peNo ? ' #' + v.peNo : ''));
  if (v.siteMap === 'Updated') p.push('Site Impact Map updated');
  if (v.vibration === 'Required') p.push('Vibration monitoring');
  if (v.excav === 'Yes') p.push('USA North 811 ticket and private locate' + (v.excavDeep === 'Yes' ? '; Cal/OSHA excavation permit' : ''));
  return p;
}
export const offSiteHot = r => r.x && r.x.rv && r.x.rv.hotWhere === 'Off-site shop';

/* ---------- stage gates (AL-08 references before it goes out for approval; AL-22 decon before the work) ---------- */
// References typed in the stage form are kept in q.meta.refs (like q.meta.jllRef), so no revision is needed.
const refOf = (q, r, k) => String(((q.meta && q.meta.refs) || {})[k] || r.x.rv[k] || '').trim();
/** [key, label, current value] for the references this request needs before stage 6. */
export function refsNeeded(q, r) {
  ensureRv(r); const e = libOf(r), req = (e && e.requires) || [], o = [];
  if (needsPermitNo(r)) o.push(['permitNo', 'PermitVision permit #']);
  if (req.includes('dn')) o.push(['dnNo', 'Disruption Notice (DN) #']);
  if (req.includes('drawing')) o.push(['drawing', 'Annotated P&ID / drawing #']);
  return o.map(([k, l]) => [k, l, refOf(q, r, k)]);
}
export function reviewGate(q, n, r) {
  ensureRv(r); const v = r.x.rv, out = [], mj = (q.meta && q.meta.jllRef) || {};
  if (n === 6) {
    if (r.loto.needed === 'Yes' && !(String(mj.lotoWO || '').trim() || String((r.jllRef || {}).lotoWO || '').trim())) out.push('Enter the JLL LOTO WO #.');
    const msg = { permitNo: 'Enter the PermitVision permit #.', dnNo: 'Enter the Disruption Notice (DN) #.', drawing: 'Enter the annotated P&ID / drawing #.' };
    for (const [k, , val] of refsNeeded(q, r)) if (!val) out.push(msg[k]);
  }
  if (n === 8 && deconNeeded(r) && v.decon !== 'Received' && v.decon !== 'N/A') out.push('The GNE decontamination certificate must be received before the work.');
  return out;
}
/** Copy the stage-form references into the record for printing (outRecordR5). */
export function mergeRefs(q, r) { ensureRv(r); for (const [k, val] of Object.entries((q.meta && q.meta.refs) || {})) if (val && r.x.rv[k] !== undefined) r.x.rv[k] = val; return r; }

/* ---------- fill from the library (AL-03, AL-28, AL-32, AL-11, AL-26 flags, line limits) ---------- */
export function reviewFill(e, step, r, force) {
  ensureRv(r); const v = r.x.rv, f = [];
  if (step === 4 && e.autoItems) { const t = ' ' + txtOf(r).toLowerCase() + ' ';
    for (const a of e.autoItems) if (r.sys[a.group] && a.keywords.some(k => t.includes(k.toLowerCase())) && !r.sys[a.group].items.includes(a.item)) { r.sys[a.group].items.push(a.item); if (!r.sys[a.group].level) r.sys[a.group].level = 'M'; f.push(a.item); } }
  if (step === 6) {
    if (e.permitTypes && (force || !v.permitTypes.length)) { v.permitTypes = e.permitTypes.slice(); f.push('permit types'); }
    if (e.siemensRole && (force || !v.siemensRole.length) && r.sup.siemens !== 'No') { v.siemensRole = e.siemensRole.slice(); f.push('Siemens role'); }
    if (e.flags) for (const [k, val] of Object.entries(e.flags)) if (!v[k]) { v[k] = val; f.push(ADDON_LABEL[k] || k); }
    for (const [k, max] of [['tools', R.LIMITS.tools], ['crew', R.LIMITS.crew]]) { const l = lnz(r[k]); if (l.length > max) r[k] = fold(l, max).join('\n'); }
  }
  if (step === 7) {
    for (const [k, max] of [['gonogo', R.LIMITS.gonogo], ['backout', R.LIMITS.backout]]) { const l = lnz(r[k]); if (l.length > max) r[k] = fold(l, max).join('\n'); }
    if (e.after && e.after.length && (force || !v.added.after)) { r.x.rts = addLines(r.x.rts, e.after.map(p => tok(p.desc, r)).join('\n'), 99); v.added.after = true; f.push('after-MOP steps'); }
    if (v.dailyRestore === '' && r.sup.impair === 'Yes' && hours(r) > 24) { v.dailyRestore = 'Yes'; f.push('daily restore'); }
  }
  return f;
}
/** All the library's pre-MOP steps, folded into the template's 2 rows (fillFrom used to drop the rest). */
export const prefill = (e, r) => foldPre((e.pre || []).map(p => ({ desc: tok(p.desc, r), dur: p.dur || '' })));

/* ---------- matching (AL-02 longest keyword, AL-03 / AL-04 routing) ---------- */
export function routeScore(e, text, sc, hits) {
  const r = e.route; if (r && r.not && r.not.some(k => hasKw(text, k)) && !(r.unless || []).some(k => hasKw(text, k))) return -1;
  const longest = hits.reduce((m, k) => Math.max(m, String(k).trim().split(/\s+/).length), 0);
  return sc + (longest > 1 ? (longest - 1) * 0.4 : 0);
}
/** AL-02: a short keyword that only matched inside a longer matched phrase ("duct" in "duct detector") counts half,
 *  so the type with the longer phrase ranks first and the other stays a candidate. Returns a map fn over [{e,sc,hits}]. */
export function shadowWith() {
  let all = null;
  return (x, i, list) => {
    if (!all) all = [...new Set(list.flatMap(y => y.sc > 0 ? y.hits.map(h => String(h).toLowerCase().trim()) : []))].filter(h => h.includes(' '));
    let sc = x.sc;
    for (const h of x.hits) { const k = String(h).toLowerCase().trim(); if (all.some(H => H !== k && H.length > k.length && new RegExp('(^|\\s)' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)').test(H) && !x.hits.some(o => String(o).toLowerCase().trim() === H))) sc -= 0.5 * (1 + (k.split(' ').length - 1) * 0.6); }
    return { ...x, sc };
  };
}
const hasKw = (text, k) => { const kk = String(k).toLowerCase().trim(); return kk.length < 4 ? new RegExp('(^|[^a-z0-9])' + kk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])').test(text) : text.includes(kk); };

/* ---------- project directory (lists.json people) ---------- */
/** The directory entry for an email (pre-fills the requester's name, company and phone). */
export function personFor(email) { const e = String(email || '').trim().toLowerCase(); return e ? (cfg().people || []).find(p => p.email === e) || null : null; }

/* ---------- print (outRecordR5) ---------- */
export function reviewPrint(r) {
  ensureRv(r); const v = r.x.rv, c = RS(), add = [];
  if (r.loto.needed === 'Yes') r.loto.points.forEach(p => {
    const d = [p.room && 'Rm ' + p.room.trim(), p.voltage, p.fedFrom && 'fed from ' + p.fedFrom.trim(), p.arcLabel && 'arc flash ' + p.arcLabel + (p.arcCal ? ' ' + p.arcCal + ' cal/cm²' : ''), p.tagRef && 'ref ' + p.tagRef.trim(), p.lotoBy && p.lotoBy !== 'JLL building engineers' && 'LOTO by ' + p.lotoBy].filter(Boolean);
    if (d.length) p.point = `${p.point.trim()} (${d.join(', ')})`;
  });
  const refs = [v.permitNo && 'PermitVision permit # ' + v.permitNo.trim(), v.peNo && 'PE # ' + v.peNo.trim(), v.qeNo && 'QE # ' + v.qeNo.trim(), v.dnNo && 'DN # ' + v.dnNo.trim(), v.drawing && 'P&ID / drawing ' + v.drawing.trim()].filter(Boolean);
  if (refs.length) add.push(refs.join('; '));
  const pt = permitTypesOf(r).filter(k => k !== 'EnergizedElectrical'); if (pt.length) add.push('Permits: ' + pt.map(k => PERMIT_LABEL[k] || k).join(', '));
  if (v.siemensRole.length) add.push('Siemens: ' + v.siemensRole.map(k => (SIEMENS_ROLES.find(x => x[0] === k) || [, k])[1]).join(', '));
  if (v.decon) add.push('GNE decontamination certificate: ' + v.decon);
  if (v.cse === 'Yes') add.push('Confined space entry (permit, 4-gas meter, attendant)');
  if (v.excav === 'Yes') add.push('Excavation' + (v.excavDeep === 'Yes' ? ' deeper than 5 ft (Cal/OSHA permit)' : '') + ' – USA North 811 and private locate');
  if (v.crane === 'Yes') add.push('Crane pick – pick plan, area closed');
  if (addonOn(r, 'inspection')) add.push('Inspection hold point: ' + v.inspection);
  if (v.ctrlArea === 'Yes') add.push('Controlled area (CPMF) entry rules apply');
  if (v.vibration === 'Required') add.push('Vibration monitoring required');
  if (v.offHours === 'Yes') add.push('Off-hours work' + (v.offHoursWhy ? ': ' + v.offHoursWhy.trim() : ''));
  if (v.occupied === 'Yes') add.push('Occupied area: dust and noise controls, users notified');
  if (v.egress.trim()) add.push('Rooms losing egress lighting: ' + v.egress.trim().replace(/\n+/g, ', '));
  if (v.tests.trim()) add.push('Tests: ' + v.tests.trim().replace(/\n+/g, '; '));
  if (v.riskBy.trim()) add.push('Residual risk accepted by ' + v.riskBy.trim());
  if (v.multiShift === 'Yes') add.push('Multi-shift: pre-task brief and Go/No-Go repeated every shift');
  if (v.dailyRestore === 'Yes') add.push('Repeat steps each day; system restored at the end of each day');
  // Template v2 round 3 (JK #11): emergency, security and FLS numbers print as Emergency / On-Call rows in the contact
  // list (src/rules/emergency.js); only the nearest ER (an address) stays on this line.
  const em = [c.er && 'Nearest ER: ' + c.er].filter(Boolean);
  if (em.length) add.push(em.join('; '));
  return add;
}

// GNE MOP Template v2 filler (docs: "GNE MOP Template v2 – what changed and what the app must do", 11/26/26).
// fillMopV2(xml, ctx, plus, dom) takes the same arguments as SRI.fillMopPlus and replaces it in buildMop.
//  - Rows are found by their label text in all three body tables, never by row number. A renamed label
//    throws "MOP template v2: row … not found" instead of writing into the wrong row.
//  - Every value is written with the template's character styles: MOP Input (blue), MOP Input Company
//    (blue + bold) and MOP Input Scope (blue + italic). New runs copy only the font size of what they
//    replace; direct colour / bold / italic / highlight / strike are dropped so the style wins.
//  - Company names are bolded in steps, return-to-service lines, Go/No-Go, back-out and impact lines.
//  - Not applicable = struck through, not deleted (as on MOP-001).
// The v1 filler (sri.js fillMop / fillMopPlus) is untouched; the v1 template is refused by buildMop.

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
const XMLNS_XML = 'http://www.w3.org/XML/1998/namespace';
export const MOP_TEMPLATE_VERSION = 2;
export const STYLE = { input: 'MOPInput', company: 'MOPInputBold', scope: 'MOPInputItalic' };
export const UTIL_ITEMS = ['DI / RO Water', 'Steam / Condensate', 'Domestic Water', 'Lab Water', 'Lab Gases / CDA / Vacuum'];
// Words the template already bolds, plus the base companies (doc: "Bold company names").
export const BASE_TERMS = ['XL Construction', 'XL', 'Genentech', 'GNE', 'JLL', 'Siemens FLS', 'Siemens', 'Subcontractor', 'Sub', 'User Team Lead', 'Lab Manager', 'Lab Mgr', 'PIC'];
const SECTION = /^(\d{1,2})\. (Cont\. )?(Impact Notification|Impact Description|Personnel Contact|Safety Requirements|Required Tools|Required Personnel|Detailed Step-by-Step|Go \/ No-Go|Back-Out|MOP Author|Owner|Qualified)/;

/** 2 for the v2 template (3 body tables, the isolation-verified row), 1 otherwise. Works on the raw XML string. */
export function templateVersionOf(xml) {
  const s = String(xml || '');
  const tables = (s.match(/<w:tbl>/g) || []).length;
  return tables >= 3 && s.includes('Isolation verified (zero energy at point of work)') && s.includes('w:val="MOPInput"') ? 2 : 1;
}

// ---------- DOM helpers ----------
const kids = (n, name) => { const o = []; for (let c = n.firstChild; c; c = c.nextSibling) if (c.nodeType === 1 && c.namespaceURI === W && c.localName === name) o.push(c); return o; };
const all = (n, ns, name) => Array.from(n.getElementsByTagNameNS(ns, name));
const inSdt = t => { for (let p = t.parentNode; p && p.nodeType === 1; p = p.parentNode) if (p.namespaceURI === W && p.localName === 'sdtContent') return true; return false; };
const textOf = n => all(n, W, 't').map(t => t.textContent).join('');
const clean = s => String(s || '').replace(/[☐☒]/g, '').replace(/\s+/g, ' ').trim();
const cellText = tc => clean(textOf(tc));
const cells = tr => kids(tr, 'tc');
const paras = tc => kids(tc, 'p');
const after = (ref, node) => ref.parentNode.insertBefore(node, ref.nextSibling);
const remove = n => n && n.parentNode && n.parentNode.removeChild(n);
const lines = s => String(s || '').split(/\r?\n/).map(t => t.replace(/^\s*(\d+[.)]|[-•*])\s*/, '').trim()).filter(Boolean);
const pad3 = n => String(n).padStart(3, '0');
const p2 = n => String(n).padStart(2, '0');
const fLong = d => d ? `${p2(d.getMonth() + 1)}/${p2(d.getDate())}/${d.getFullYear()}` : '';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function fail(what) { throw new Error(`MOP template v2: row ${what} not found`); }

/** The w:sz / w:szCs of a run (or a paragraph mark), cloned, so a new run keeps the size of what it replaces. */
function sizeOf(r) {
  const rPr = r && (r.localName === 'pPr' ? kids(r, 'rPr')[0] : kids(r, 'rPr')[0]);
  if (!rPr) return null;
  const sz = kids(rPr, 'sz')[0], cs = kids(rPr, 'szCs')[0];
  return sz || cs ? { sz: sz && sz.getAttributeNS(W, 'val'), cs: cs && cs.getAttributeNS(W, 'val') } : null;
}
function el(doc, name, val) { const e = doc.createElementNS(W, 'w:' + name); if (val !== undefined) e.setAttributeNS(W, 'w:val', String(val)); return e; }

/** One run: style + optional strike + size; "\n" becomes w:br. */
function mkRun(doc, text, { style = STYLE.input, strike = false, size = null } = {}) {
  const r = el(doc, 'r'), rPr = el(doc, 'rPr');
  if (style) rPr.appendChild(el(doc, 'rStyle', style));
  if (strike) rPr.appendChild(el(doc, 'strike'));
  if (size && size.sz) rPr.appendChild(el(doc, 'sz', size.sz));
  if (size && size.cs) rPr.appendChild(el(doc, 'szCs', size.cs));
  r.appendChild(rPr);
  String(text).split('\n').forEach((part, i) => {
    if (i) r.appendChild(el(doc, 'br'));
    const t = el(doc, 't'); t.appendChild(doc.createTextNode(part)); t.setAttributeNS(XMLNS_XML, 'xml:space', 'preserve'); r.appendChild(t);
  });
  return r;
}

// ---------- rich text: company names bold, struck parts ----------
/** Build the bold-term matcher from the request (doc: Fill rules → Bold company names). */
export function companyTerms({ record = {}, project = {}, companyNames = [] } = {}) {
  const names = new Set();
  const add = n => { n = String(n || '').trim(); if (n.length >= 2) names.add(n); };
  const company = n => {
    n = String(n || '').trim(); if (!n) return; add(n);
    const words = n.split(/\s+/).filter(Boolean);
    if (words.length > 1 && !/^(the|a|an)$/i.test(words[0])) add(words[0]);
    if (words.length >= 3) add(words.map(w => w[0]).join('').toUpperCase());
  };
  BASE_TERMS.forEach(add);
  [...(project.contacts || []), ...(project.approvers || [])].forEach(p => company(p && p.company));
  company(record.req && record.req.company);
  (record.subs || []).forEach(s => company(s && s.company));
  (record.workers || []).forEach(w => company(w && w.company));
  (companyNames || []).forEach(company);
  if (record.subShort) add(record.subShort);
  return [...names].sort((a, b) => b.length - a.length);
}
export function termRegex(terms) {
  return terms.length ? new RegExp(`(?<![A-Za-z0-9])(?:${terms.map(reEsc).join('|')})(?![A-Za-z0-9])`, 'g') : null;
}
/** Split text into segments {t, bold, strike}. strike = substrings to strike (first occurrences, any number). */
export function segments(text, re, strike = []) {
  let parts = [{ t: String(text), strike: false }];
  for (const s of strike) {
    if (!s) continue;
    parts = parts.flatMap(p => {
      if (p.strike) return [p];
      const out = []; let rest = p.t, i;
      while ((i = rest.indexOf(s)) >= 0) { if (i) out.push({ t: rest.slice(0, i), strike: false }); out.push({ t: s, strike: true }); rest = rest.slice(i + s.length); }
      if (rest) out.push({ t: rest, strike: false });
      return out;
    });
  }
  if (!re) return parts.map(p => ({ ...p, bold: false }));
  return parts.flatMap(p => {
    const out = []; let last = 0; re.lastIndex = 0; let m;
    while ((m = re.exec(p.t))) { if (m.index > last) out.push({ t: p.t.slice(last, m.index), bold: false, strike: p.strike }); out.push({ t: m[0], bold: true, strike: p.strike }); last = m.index + m[0].length; }
    if (last < p.t.length) out.push({ t: p.t.slice(last), bold: false, strike: p.strike });
    return out;
  });
}
function runsFor(doc, segs, { style = STYLE.input, size = null, strike = false } = {}) {
  return segs.filter(s => s.t !== '').map(s => mkRun(doc, s.t, { style: s.bold ? STYLE.company : style, strike: strike || s.strike, size }));
}

// ---------- writing ----------
/** Clear the cell (runs in every paragraph; paragraphs kept) and write segs into its first paragraph. */
function writeCell(tc, value, opt = {}) {
  const doc = tc.ownerDocument, ps = paras(tc);
  if (!ps.length) fail('cell paragraph');
  let size = null;
  for (const p of ps) {
    unhighlight(p);
    for (let c = p.firstChild; c;) { const n = c.nextSibling; if (c.nodeType === 1 && c.localName !== 'pPr') { if (!size && c.localName === 'r') size = sizeOf(c); p.removeChild(c); } c = n; }
  }
  size = size || sizeOf(kids(ps[0], 'pPr')[0]);
  const segs = Array.isArray(value) ? value : segments(value == null ? '' : value, opt.re || null, opt.strikeParts || []);
  runsFor(doc, segs, { ...opt, size }).forEach(r => ps[0].appendChild(r));
}
/** Remove yellow highlight from a paragraph mark (v2 worker rows carry one). */
function unhighlight(p) { const pPr = kids(p, 'pPr')[0], rPr = pPr && kids(pPr, 'rPr')[0]; if (rPr) kids(rPr, 'highlight').forEach(remove); }

/** Keep the paragraph up to and including `label`; replace everything after it with the value runs. */
function afterLabel(p, label, value, opt = {}) {
  const doc = p.ownerDocument, ts = all(p, W, 't').filter(t => !inSdt(t));
  let acc = '', hit = null, size = null;
  for (const t of ts) {
    if (hit) { const r = t.parentNode; if (!size) size = sizeOf(r); remove(r); continue; }
    const s = t.textContent || '', i = (acc + s).indexOf(label);
    if (i >= 0) { const keep = s.slice(0, i + label.length - acc.length), rest = s.slice(keep.length); t.textContent = keep; t.setAttributeNS(XMLNS_XML, 'xml:space', 'preserve'); hit = t; if (rest.trim() && !size) size = sizeOf(t.parentNode); }
    acc += s;
  }
  if (!hit) return false;
  size = size || sizeOf(hit.parentNode);
  const v = value == null ? '' : value;
  const segs = Array.isArray(v) ? v : segments(v, opt.re || null, opt.strikeParts || []);
  const lead = label.endsWith(' ') ? '' : ' ';
  const runs = segs.some(s => s.t) ? runsFor(doc, [{ t: lead, bold: false, strike: false }, ...segs], { ...opt, size }) : [mkRun(doc, lead || ' ', { size })];
  let ref = hit.parentNode; for (const r of runs) { after(ref, r); ref = r; }
  return true;
}
function needLabel(p, label, value, opt) { if (!afterLabel(p, label, value, opt)) fail(label); }

/** Strike every run (keeps their style) in a node; optionally only runs outside checkbox glyphs. */
function strikeAll(node) {
  for (const r of all(node, W, 'r')) {
    if (!all(r, W, 't').length) continue;
    let rPr = kids(r, 'rPr')[0]; if (!rPr) { rPr = el(r.ownerDocument, 'rPr'); r.insertBefore(rPr, r.firstChild); }
    if (!kids(rPr, 'strike').length) { const s = el(r.ownerDocument, 'strike'); const sz = kids(rPr, 'sz')[0] || kids(rPr, 'szCs')[0]; sz ? rPr.insertBefore(s, sz) : rPr.appendChild(s); }
  }
}
function unstrikeAll(node) { for (const r of all(node, W, 'r')) { const rPr = kids(r, 'rPr')[0]; if (rPr) [...kids(rPr, 'strike'), ...kids(rPr, 'dstrike')].forEach(remove); } }

/** Set a checkbox; ticked: the glyph and its label (runs up to the next checkbox) turn blue (MOP Input). */
function tick(sdt, on) {
  const ck = all(sdt, W14, 'checked')[0]; ck.setAttributeNS(W14, 'w14:val', on ? '1' : '0');
  const content = kids(sdt, 'sdtContent')[0], t = content && all(content, W, 't')[0];
  if (t) t.textContent = on ? '☒' : '☐';
  if (!on) return;
  const runs = content ? all(content, W, 'r') : [];
  for (let n = sdt.nextSibling; n; n = n.nextSibling) { if (n.nodeType !== 1) continue; if (n.localName === 'sdt') break; if (n.localName === 'r') runs.push(n); }
  runs.forEach(blueRun);
}
function blueRun(r) {
  const doc = r.ownerDocument; let rPr = kids(r, 'rPr')[0];
  if (!rPr) { rPr = el(doc, 'rPr'); r.insertBefore(rPr, r.firstChild); }
  ['color', 'b', 'bCs', 'i', 'iCs', 'highlight'].forEach(k => kids(rPr, k).forEach(remove));
  let st = kids(rPr, 'rStyle')[0];
  if (!st) { st = el(doc, 'rStyle', STYLE.input); rPr.insertBefore(st, rPr.firstChild); } else if (st.getAttributeNS(W, 'val') !== STYLE.company) st.setAttributeNS(W, 'w:val', STYLE.input);
}
/** Checkboxes of a node with the label text that follows each one. */
function boxes(node) {
  return all(node, W, 'sdt').filter(s => all(s, W14, 'checkbox').length).map(s => {
    let lab = ''; for (let n = s.nextSibling; n; n = n.nextSibling) { if (n.nodeType !== 1) continue; if (n.localName === 'sdt') break; lab += textOf(n); }
    return { sdt: s, label: clean(lab), p: s.parentNode };
  });
}

// ---------- template map ----------
/** All rows of the body tables grouped by section ("0" = header rows, "8c" = 8. Cont.). */
export function mapTemplate(doc) {
  const body = all(doc, W, 'body')[0], tables = kids(body, 'tbl');
  if (tables.length < 3) throw new Error('MOP template out of date – sync to update');
  const sec = { 0: { header: null, rows: [] } }; let key = '0';
  tables.forEach((tbl, ti) => kids(tbl, 'tr').forEach(tr => {
    const cs = cells(tr), t0 = cs.length ? cellText(cs[0]) : '', m = cs.length === 1 && SECTION.exec(t0);
    if (m) { key = m[1] + (m[2] ? 'c' : ''); sec[key] = { header: tr, rows: [], table: ti }; return; }
    (sec[key].rows).push(tr);
  }));
  for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '8c', '9', '10', '11', '12', '13', '14', '14c']) if (!sec[k]) fail(`section ${k.replace('c', '. Cont.')}`);
  return { body, tables, sec };
}
const rowStarting = (rows, label, from = 0) => { for (let i = from; i < rows.length; i++) { const c = cells(rows[i]); if (c.length && cellText(c[0]).startsWith(label)) return rows[i]; } return null; };
const needRow = (rows, label, from) => rowStarting(rows, label, from) || fail(`"${label}"`);
const numbered = rows => rows.filter(tr => { const c = cells(tr); return c.length >= 2 && /^\d+$/.test(cellText(c[0])); });
function tableRowsAfter(rows, headerFirst) { const i = rows.findIndex(tr => cellText(cells(tr)[0] || tr) === headerFirst); if (i < 0) fail(`"${headerFirst}" heading`); return rows.slice(i + 1); }

/** Clone a row after `tr` with every cell's text removed (paragraph formatting kept). */
function cloneRowAfter(tr) {
  const n = tr.cloneNode(true);
  for (const tc of cells(n)) for (const p of paras(tc)) for (let c = p.firstChild; c;) { const nx = c.nextSibling; if (c.nodeType === 1 && c.localName !== 'pPr') p.removeChild(c); c = nx; }
  after(tr, n); return n;
}
/** Make sure there are at least `want` rows, cloning the last one. */
function ensureRows(rows, want) { const out = rows.slice(); while (out.length < want) out.push(cloneRowAfter(out[out.length - 1])); return out; }

// ---------- the fill ----------
/**
 * ctx  = { record, project, mopNo, rev, submitted, revisedOn, attachments, companyNames? }
 * plus = { approved, x, preDone[10], esign:{approvers[6], author, supervisor} } (as fillMopPlus)
 * dom  = { DOMParser, XMLSerializer }
 * R    = SRI helpers (startOf, jllNeeded); defaults to globalThis.SRI.
 */
export function fillMopV2(xml, ctx, plus, dom, R = globalThis.SRI) {
  const doc = new dom.DOMParser().parseFromString(xml, 'application/xml');
  const { body, tables, sec } = mapTemplate(doc);
  const rec = ctx.record, prj = ctx.project || { contacts: [], approvers: [], loc: '' }, x = plus.x || rec.x || {};
  const lo = rec.loto.needed === 'Yes', assist = rec.sup.jll === 'Yes', jll = lo || assist, impair = rec.sup.impair === 'Yes';
  const re = termRegex(companyTerms({ record: rec, project: prj, companyNames: ctx.companyNames || [] }));
  const rich = { re };
  const start = R && R.startOf ? R.startOf(rec) : null;

  // --- header rows (section 0) ---
  const H = sec['0'].rows, head = H[0], hc = cells(head);
  if (hc.length < 3) fail('header');
  const pri = boxes(hc[1]); [['H', 'High'], ['M', 'Medium'], ['L', 'Low']].forEach(([v, l]) => { const b = pri.find(x => x.label === l) || fail(`Priority ${l}`); tick(b.sdt, rec.priority === v); });
  const hp = paras(hc[2]);
  { const numP = hp.find(p => /#/.test(textOf(p))) || fail('"#000 rev 0"'); const rs = kids(numP, 'r').filter(r => all(r, W, 't').length);
    const valRun = rs.find(r => !/^#$/.test(textOf(r).trim())) || fail('MOP number run'); const size = sizeOf(valRun);
    rs.filter(r => r !== valRun && textOf(r).trim() !== '#').forEach(remove);
    after(valRun, mkRun(doc, `${pad3(ctx.mopNo)} rev ${ctx.rev}`, { style: STYLE.company, size })); remove(valRun); }
  { const revP = hp.find(p => /Revised/.test(textOf(p))); if (revP) { const ts = all(revP, W, 't'); ts.forEach((t, i) => { t.textContent = i ? '' : (ctx.rev && ctx.revisedOn ? `Revised ${fLong(ctx.revisedOn)}` : ''); }); } }
  const r1 = needRow(H, 'MOP Title:'), c1 = cells(r1);
  needLabel(paras(c1[0])[0], 'MOP Title:', rec.title.trim());
  { const p = paras(c1[1])[0]; // "Sub MOP #:" – "Sub" is its own run; the sub's short name replaces it.
    const subRun = kids(p, 'r').find(r => textOf(r).trim() === 'Sub');
    if (subRun && String(rec.subShort || '').trim()) all(subRun, W, 't')[0].textContent = String(rec.subShort).trim();
    needLabel(p, 'MOP #:', rec.subMop.trim()); }
  const r2 = cells(needRow(H, 'Job Location:'));
  needLabel(paras(r2[0])[0], 'Job Location:', prj.loc || '');
  needLabel(paras(r2[1])[0], 'Submission Date:', fLong(ctx.submitted));
  const r3 = cells(needRow(H, 'Work Area(s):'));
  needLabel(paras(r3[0])[0], 'Work Area(s):', `${rec.bldg} ${rec.areas.replace(/\n/g, '; ')}`.trim());
  needLabel(paras(r3[1])[0], 'MOP Execute Date:', fLong(start));
  needLabel(paras(cells(needRow(H, 'Work Scope:'))[0])[0], 'Work Scope:', `${rec.scope.trim()} (Origin: ${rec.origin}.)`, { style: STYLE.scope });

  // --- 1. Impact Notification: system groups, Utility Systems, GMP / QA ---
  const S1 = sec['1'].rows;
  const SYS = (R && R.SYS) || [];
  const groups = [...SYS.map(g => ({ name: g.name, data: rec.sys[g.k], items: g.items.map(i => i[0]) })), { name: 'Utility Systems', data: x.util || { level: '', items: [], other: '', notes: '' }, items: UTIL_ITEMS }];
  for (const g of groups) {
    const gi = S1.findIndex(tr => cellText(cells(tr)[0]) === g.name); if (gi < 0) fail(`"${g.name}"`);
    const lv = boxes(S1[gi]); [['L', 'Low Impact'], ['M', 'Medium Impact'], ['H', 'High Impact']].forEach(([v, l]) => { const b = lv.find(x => x.label === l) || fail(`${g.name} ${l}`); tick(b.sdt, g.data.level === v); });
    const ni = S1.findIndex((tr, i) => i > gi && cellText(cells(tr)[0]).startsWith('Notes:')); if (ni < 0) fail(`${g.name} Notes`);
    const bx = S1.slice(gi + 1, ni).flatMap(boxes);
    for (const it of g.items) { const b = bx.find(x => x.label === it) || fail(`${g.name} "${it}"`); tick(b.sdt, g.data.items.includes(it)); }
    const other = bx.find(x => x.label.startsWith('Other:')) || fail(`${g.name} Other`);
    const ot = String(g.data.other || '').trim(); tick(other.sdt, !!ot); afterLabel(other.p, 'Other:', ot);
    needLabel(paras(cells(S1[ni])[0])[0], 'Notes:', String(g.data.notes || '').trim());
  }
  { const qa = rec.sup.cgmp === 'Yes' ? (x.qa ? `QA ${String(x.qa).toLowerCase()}` : 'QA notice vs approval to be confirmed with GNE QA (case by case)') : 'No GMP impact';
    needLabel(paras(cells(needRow(S1, 'GMP / QA:'))[0])[0], 'GMP / QA:', `cGMP area or utility: ${rec.sup.cgmp || '—'}. ${qa}.${String(x.gmpNotes || '').trim() ? ' ' + String(x.gmpNotes).trim() : ''}`); }

  // --- 2. Impact Description + attachments ---
  const S2 = sec['2'].rows;
  [['Planned Impact', 'Planned'], ['Potential Impact', 'Potential']].forEach(([lab, kind]) => {
    const tc = cells(needRow(S2, lab))[0], ps = paras(tc);
    needLabel(ps[0], 'Systems:', '');
    const ls = rec.impacts.filter(v => v.kind === kind && v.impact.trim()).map((v, i) => `${i + 1}. ${v.impact.trim().replace(/\.$/, '')}. Mitigation: ${v.mitigation.trim()}`);
    if (!ls.length) ls.push('None identified.');
    while (ps.length < ls.length + 1) { const c = ps[ps.length - 1].cloneNode(true); for (let n = c.firstChild; n;) { const nx = n.nextSibling; if (n.localName !== 'pPr') c.removeChild(n); n = nx; } after(ps[ps.length - 1], c); ps.push(c); }
    ls.forEach((l, i) => { const p = ps[i + 1]; for (let n = p.firstChild; n;) { const nx = n.nextSibling; if (n.localName !== 'pPr') p.removeChild(n); n = nx; } runsFor(doc, segments(l, re)).forEach(r => p.appendChild(r)); });
  });
  const cats = new Set((ctx.attachments || []).map(a => a.cat)); if (rec.attSep) cats.add('Drawings');
  { const ab = boxes(needRow(S2, 'Attachments:'));
    ['Drawings', 'Diagrams', 'As-builts', 'Panel Schedules'].forEach(c => { const b = ab.find(x => x.label === c) || fail(`Attachments ${c}`); tick(b.sdt, cats.has(c)); });
    const oth = [...cats].filter(c => c === 'Photo' || c === 'Other').map(c => c === 'Photo' ? 'Photos' : 'Other'), ob = ab.find(x => x.label.startsWith('Other:')) || fail('Attachments Other');
    tick(ob.sdt, oth.length > 0); if (oth.length) afterLabel(ob.p, 'Other:', oth.join(', ')); }

  // --- 3. Personnel contacts (8 project rows + 2 subcontractor rows): plain blue, no bold ---
  const S3 = tableRowsAfter(sec['3'].rows, 'Name');
  if (S3.length < 10) fail('contact rows (10)');
  for (let i = 0; i < 8; i++) { const v = (prj.contacts || [])[i]; cells(S3[i]).slice(0, 4).forEach((tc, k) => writeCell(tc, v ? [v.name, v.title, v.company, v.phone][k] || '' : '')); }
  for (let i = 0; i < 2; i++) { const v = (rec.subs || [])[i]; const vals = v ? [v.name, v.title, v.company, v.phone] : ['', '', 'Subcontractor', '']; cells(S3[8 + i]).slice(0, 4).forEach((tc, k) => writeCell(tc, vals[k] || '')); }

  // --- 4. Safety requirements ---
  const S4 = sec['4'].rows;
  { const r = needRow(S4, '3. Drawings'), p = paras(cells(r)[0])[0], types = ['Drawings', 'Diagrams', 'As-builts', 'Panel Schedules'];
    const segs = [{ t: '3. ', bold: false, strike: false }]; types.forEach((t, i) => { if (i) segs.push({ t: ' / ', bold: false, strike: false }); segs.push({ t, bold: false, strike: !cats.has(t) }); }); segs.push({ t: ' with Impacts', bold: false, strike: false });
    writeCell(cells(r)[0], segs); void p; }
  if (!lo) strikeAll(needRow(S4, '5. Approved LOTO'));
  needLabel(paras(cells(needRow(S4, '6.'))[0])[0], '6.', lines(rec.safety).join('; '));

  // --- 5. Tools, 6. Personnel: two columns of 5 ---
  const fill10 = (rows, list) => { for (let s = 0; s < 5; s++) { const r = needRow(rows, `${s + 1}.`), c = cells(r); needLabel(paras(c[0])[0], `${s + 1}.`, list[s] || ''); needLabel(paras(c[1])[0], `${s + 6}.`, list[s + 5] || ''); } };
  fill10(sec['5'].rows, lines(rec.tools)); fill10(sec['6'].rows, lines(rec.crew));

  // --- 7. Prior steps ---
  const S7 = sec['7'].rows, pre = numbered(S7);
  if (pre.length < 10) fail('prior steps 1–10');
  const preCell = (n, k) => cells(pre[n - 1])[k];
  const reDesc = (n, text, strikeParts = []) => writeCell(preCell(n, 1), text, { re, strikeParts });
  if (!lo && !assist) { [3, 4, 8].forEach(n => strikeAll(pre[n - 1])); [5, 6, 7].forEach(n => reDesc(n, cellText(preCell(n, 1)), ['LOTO & '])); }
  else if (assist && !lo) { reDesc(3, 'XL submits JLL assist request (include MOP in submission)'); [4, 5, 6, 7].forEach(n => reDesc(n, cellText(preCell(n, 1)), ['LOTO & '])); strikeAll(pre[7]); }
  rec.pre.filter(s => s.desc.trim()).slice(0, 2).forEach((s, i) => { writeCell(preCell(9 + i, 1), s.desc.trim(), rich); writeCell(preCell(9 + i, 2), s.dur.trim()); });
  for (let i = 0; i < 10; i++) if (plus.preDone && plus.preDone[i]) writeCell(preCell(i + 1, 3), plus.preDone[i]);
  { const cr = needRow(S7, 'Scope Walk Completed'), bx = boxes(cr);
    const walk = bx.find(b => b.label.startsWith('Scope Walk')) || fail('Scope Walk'), ja = bx.find(b => b.label.startsWith('JLL Assist')) || fail('JLL Assist'), jl = bx.find(b => b.label.startsWith('JLL LOTO')) || fail('JLL LOTO');
    tick(walk.sdt, rec.sup.walk === 'Yes'); tick(ja.sdt, assist); tick(jl.sdt, lo);
    if (rec.jllRef.assistWO) afterLabel(ja.p, 'WO#:', rec.jllRef.assistWO);
    if (rec.jllRef.lotoWO) afterLabel(jl.p, 'WO#:', rec.jllRef.lotoWO);
    if (!jll) { strikeAll(ja.p); strikeAll(jl.p); } else if (!lo) strikeAll(jl.p); }
  { const lr = needRow(S7, 'JLL LOTO#:'), c = cells(lr);
    needLabel(paras(c[0])[0], 'LOTO#:', rec.jllRef.lotoNo.trim()); needLabel(paras(c[1])[0], 'Submitted by:', jll ? rec.req.name : '');
    if (!jll) strikeAll(lr); }
  { const sr = needRow(S7, 'Initial Safe-off'), p = paras(cells(sr)[0])[0];
    if (impair && !lo) { const ts = all(p, W, 't').filter(t => !inSdt(t)); ts.forEach((t, i) => { if (/Initial Safe-off\/LOTO Performed by/.test(t.textContent)) t.textContent = t.textContent.replace('Initial Safe-off/LOTO Performed by', 'Impairment Performed by'); void i; });
      needLabel(p, 'Print Name:', rec.loto.safeOff.trim()); }
    else needLabel(p, 'Print Name:', lo ? rec.loto.safeOff.trim() : 'N/A'); }
  { const ir = needRow(S7, 'Isolation verified'), c = cells(ir);
    let by = String(x.isoBy || '').trim(), by2 = String(x.isoBy2 || '').trim();
    const m = /^(.*?);\s*second check:\s*(.*)$/i.exec(by); if (m) { by = m[1].trim(); by2 = by2 || m[2].trim(); }
    needLabel(paras(c[0])[0], 'Print Name:', lo ? by : 'N/A');
    needLabel(paras(c[1])[0], 'Second check / Time:', lo ? by2 : '');
    if (!lo) strikeAll(ir); }

  // --- 8. During steps (10 on page 2, the rest on the continuation sheet) ---
  const steps = rec.steps.filter(s => s.desc.trim());
  const dur = numbered(sec['8'].rows); let cont = numbered(sec['8c'].rows);
  if (dur.length < 10) fail('during steps 1–10');
  if (steps.length > 10 + cont.length) cont = ensureRows(cont, steps.length - 10);
  [...dur.slice(0, 10), ...cont].forEach((tr, i) => { const c = cells(tr), s = steps[i]; if (i >= 10 + 34) writeCell(c[0], String(i + 1)); writeCell(c[1], s ? s.desc.trim() : '', rich); writeCell(c[2], s ? s.dur.trim() : ''); });

  // --- 9. Go / No-Go, 10. Back-out ---
  const gn = lines(rec.gonogo), go = numbered(sec['9'].rows);
  if (go.length < 4) fail('Go / No-Go 1–4');
  ensureRows(go, gn.length).forEach((tr, i) => { if (i >= 4) writeCell(cells(tr)[0], String(i + 1)); writeCell(cells(tr)[1], gn[i] || '', rich); });
  const bo = lines(rec.backout);
  let boRows = sec['10'].rows.filter(tr => /^\d\)/.test(cellText(cells(tr)[0])));
  if (boRows.length < 4) fail('back-out 1)–4)');
  for (let i = 0; i < Math.max(4, bo.length); i++) {
    if (i >= boRows.length) { const n = cloneRowAfter(boRows[boRows.length - 1]); writeCell(cells(n)[0], `${i + 1}) `); boRows.push(n); }
    needLabel(paras(cells(boRows[i])[0])[0], `${i + 1})`, bo[i] || '', rich);
  }

  // --- 11. After steps: step 2 wording, return-to-service lines from step 5 ---
  const af = numbered(sec['11'].rows);
  if (af.length < 6) fail('after steps 1–6');
  writeCell(cells(af[1])[1], lo && impair ? 'XL to notify JLL (LOTO removal) and Siemens (impairment removal) of scope completion' : lo ? 'XL to notify JLL of scope completion to remove LOTO' : impair ? 'XL to notify Siemens of scope completion to remove impairment' : 'XL to notify approval team of scope completion', rich);
  { const rts = lines(x.rts); let rows = af.slice(4);
    while (rows.length < rts.length) { const n = cloneRowAfter(rows[rows.length - 1]); rows.push(n); }
    rows.forEach((tr, i) => { const c = cells(tr); writeCell(c[0], String(5 + i)); writeCell(c[1], rts[i] ? `Return to service: ${rts[i]}` : '', rich); }); }

  // --- 12. Author / supervisor ---
  const S12 = sec['12'].rows;
  { const ar = cells(needRow(S12, 'Print Name:')); needLabel(paras(ar[0])[0], 'Print Name:', rec.author.trim() || rec.req.name);
    if (plus.esign && plus.esign.author) needLabel(paras(ar[1])[0], 'Signature:', `Signed electronically ${plus.esign.author}`); }
  { const sr = cells(needRow(S12, 'Contractor Supervisor Approval:')), sv = plus.esign && plus.esign.supervisor;
    needLabel(paras(sr[0])[0], 'Contractor Supervisor Approval:', sv ? sv.name : '');
    needLabel(paras(sr[1])[0], 'Date:', sv ? sv.date : ''); }

  // --- 13. Approvers ---
  const S13 = tableRowsAfter(sec['13'].rows, 'Print Name');
  if (S13.length < 6) fail('approver rows (6)');
  for (let i = 0; i < 6; i++) {
    const v = (prj.approvers || [])[i], c = cells(S13[i]), sig = plus.esign && plus.esign.approvers && plus.esign.approvers[i];
    const name = (v && v.name) || (sig && sig.name) || '';
    const isJll = /\bJLL\b/.test(`${v ? v.title : ''} ${v ? v.company : ''}`) || (!v && /\bJLL\b/.test(cellText(c[1])));
    [name, v ? v.title : '', v ? v.company : ''].forEach((val, k) => writeCell(c[k], val, { strike: isJll && !jll }));
    writeCell(c[3], sig ? 'Signed electronically' : ''); writeCell(c[4], sig ? sig.date : '');
  }

  // --- 14. Workers (3 on the form, the rest on the continuation sheet) ---
  const wk = rec.workers.filter(w => w.name.trim());
  const W1 = tableRowsAfter(sec['14'].rows, 'Print Name'); let W2 = tableRowsAfter(sec['14c'].rows, 'Print Name');
  if (W1.length < 3) fail('worker rows (3)');
  if (wk.length > 3 + W2.length) W2 = ensureRows(W2, wk.length - 3);
  [...W1.slice(0, 3), ...W2].forEach((tr, i) => { const w = wk[i]; cells(tr).forEach((tc, k) => writeCell(tc, w && k < 3 ? [w.name, w.title, w.company][k] || '' : '')); });

  // --- continuation sheet: dropped when ≤10 during steps and ≤3 workers ---
  if (steps.length <= 10 && wk.length <= 3) {
    const t2 = tables[2]; let prev = t2.previousSibling; while (prev && prev.nodeType !== 1) prev = prev.previousSibling;
    if (prev && prev.localName === 'p' && all(prev, W, 'br').some(b => b.getAttributeNS(W, 'type') === 'page') && !textOf(prev).trim()) remove(prev);
    remove(t2);
  }

  // --- DRAFT banner ---
  if (!plus.approved) {
    const p = el(doc, 'p'), pPr = el(doc, 'pPr'); pPr.appendChild(el(doc, 'jc', 'center')); p.appendChild(pPr);
    const r = el(doc, 'r'), rPr = el(doc, 'rPr'); rPr.appendChild(el(doc, 'b')); rPr.appendChild(el(doc, 'color', 'C00000')); rPr.appendChild(el(doc, 'sz', 28)); r.appendChild(rPr);
    const t = el(doc, 't'); t.textContent = 'DRAFT – NOT APPROVED FOR USE'; t.setAttributeNS(XMLNS_XML, 'xml:space', 'preserve'); r.appendChild(t); p.appendChild(r);
    body.insertBefore(p, tables[0]);
  }

  // --- attachment pages (same as v1) ---
  const sectPr = kids(body, 'sectPr')[0];
  const NS = `xmlns:w="${W}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;
  const put = s => body.insertBefore(doc.importNode(new dom.DOMParser().parseFromString(s, 'application/xml').documentElement, true), sectPr);
  (ctx.attachments || []).forEach((a, i) => {
    const im = a.images || [], pages = im.length > 1 ? `, ${im.length} pages` : '';
    put(`<w:p ${NS}><w:r>${i === 0 || im.length ? '<w:br w:type="page"/>' : ''}<w:t xml:space="preserve">Attachment: ${esc(a.name)} (${esc(a.cat)}${pages})${im.length ? '' : ` – ${esc(a.note || 'included in the package')}`}</w:t></w:r></w:p>`);
    im.forEach(g => put(`<w:p ${NS}><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${g.cx}" cy="${g.cy}"/><wp:docPr id="${900 + g.n}" name="Attachment ${g.n}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${900 + g.n}" name="att${g.n}.${g.ext}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${g.rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${g.cx}" cy="${g.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`));
  });

  const out = new dom.XMLSerializer().serializeToString(doc);
  return out.startsWith('<?xml') ? out : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + out;
}

export { unstrikeAll };

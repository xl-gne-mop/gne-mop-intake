// Office Open XML adapters: .docx / .docm (text only, macros never run), .pptx, .xlsx / .xlsm.
// DOM-free (src/import/anymop/xml.js) so they run in the import Worker and in Node.
import { parseXml } from '../xml.js';
import { openZip } from '../zip.js';
import { newDoc, addBlock, addTable, clean } from '../docmodel.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const kids = (n, l) => n.childNodes.filter(c => c.nodeType === 1 && c.localName === l);
const attr = (n, l) => n.getAttributeNS(W, l) ?? n.getAttribute('w:' + l);

// ---------- Word ----------
/** Text of a paragraph: runs (struck runs dropped = not applicable), tabs, breaks, checkbox glyphs. */
function paraText(p, ctx) {
  let out = '';
  const walk = n => {
    for (const c of n.childNodes) {
      if (c.nodeType !== 1) continue;
      const l = c.localName;
      if (l === 'pPr' || l === 'rPr' || l === 'sdtPr' || l === 'del' || l === 'instrText') continue;
      if (l === 'r') {
        const rPr = kids(c, 'rPr')[0];
        if (rPr && (kids(rPr, 'strike').some(s => attr(s, 'val') !== '0' && attr(s, 'val') !== 'false') || kids(rPr, 'dstrike').length)) { ctx.struck++; continue; }
        if (rPr && kids(rPr, 'vanish').length) continue;
        walk(c); continue;
      }
      if (l === 't') { out += c.textContent; continue; }
      if (l === 'tab') { out += '\t'; continue; }
      if (l === 'br' || l === 'cr') { if (attr(c, 'type') === 'page') ctx.page++; else out += '\n'; continue; }
      if (l === 'lastRenderedPageBreak') { ctx.page++; continue; }
      if (l === 'sym') { const ch = (attr(c, 'char') || '').toUpperCase(); out += /^(F0)?FE$|^2612$/.test(ch) ? '☒' : /^(F0)?A8$|^2610$/.test(ch) ? '☐' : ''; continue; }
      if (l === 'checkBox' && c.namespaceURI === W) { const d = kids(c, 'checked')[0] || kids(c, 'default')[0]; out += d && attr(d, 'val') !== '0' ? '☒' : '☐'; continue; }
      if (l === 'contentPart' || (l === 'AlternateContent' && /ink/i.test(c.textContent))) { ctx.ink = true; continue; }
      if (l === 'drawing' || l === 'pict') { ctx.images++; continue; }
      if (l === 'sdt') {
        const cb = c.getElementsByTagNameNS(W14, 'checkbox')[0];
        if (cb) { const ck = cb.getElementsByTagNameNS(W14, 'checked')[0]; out += ck && ck.getAttributeNS(W14, 'val') === '1' ? '☒' : '☐'; continue; }
        walk(c); continue;
      }
      walk(c);
    }
  };
  walk(p);
  return out.replace(/[☐☒]\s*[☐☒]/g, m => m[0]); // a glyph + its sdt checkbox count once
}
function cellText(tc, ctx) { return kids(tc, 'p').map(p => paraText(p, ctx)).concat(kids(tc, 'tbl').map(t => tableRows(t, ctx).map(r => r.join(' | ')).join('\n'))).join('\n'); }
function tableRows(tbl, ctx) {
  return kids(tbl, 'tr').map(tr => {
    const row = [];
    for (const tc of kids(tr, 'tc').concat(kids(tr, 'sdt').flatMap(s => kids(kids(s, 'sdtContent')[0] || s, 'tc')))) {
      const tcPr = kids(tc, 'tcPr')[0], vm = tcPr && kids(tcPr, 'vMerge')[0];
      if (vm && attr(vm, 'val') !== 'restart') { row.push(''); continue; } // continued vertical merge
      row.push(cellText(tc, ctx));
      const span = tcPr && kids(tcPr, 'gridSpan')[0], n = span ? +attr(span, 'val') || 1 : 1;
      for (let i = 1; i < n; i++) row.push(''); // keep column positions
    }
    return row;
  });
}
const headingStyle = p => { const pPr = kids(p, 'pPr')[0], st = pPr && kids(pPr, 'pStyle')[0], v = st ? attr(st, 'val') || '' : ''; return /^(Heading|Title|Subtitle)/i.test(v); };
const isList = p => { const pPr = kids(p, 'pPr')[0]; return !!(pPr && kids(pPr, 'numPr').length); };

export async function docxToDoc(bytes, { kind = 'docx' } = {}) {
  const z = openZip(bytes), xml = await z.text('word/document.xml'); if (!xml) throw new Error('No document text in this Word file');
  const d = newDoc(kind), dom = parseXml(xml), body = dom.getElementsByTagNameNS(W, 'body')[0];
  const ctx = { page: 1, struck: 0, ink: false, images: 0 };
  // header text first (often "MOP #" or the company)
  for (const n of z.names.filter(n => /^word\/header\d*\.xml$/.test(n)).sort()) {
    const h = parseXml(await z.text(n)); for (const p of h.getElementsByTagNameNS(W, 'p')) addBlock(d, 1, paraText(p, ctx), 'note', { part: 'header' });
  }
  const visit = n => {
    for (const c of n.childNodes) {
      if (c.nodeType !== 1) continue;
      if (c.localName === 'p') { const t = paraText(c, ctx), page = ctx.page; addBlock(d, page, t, headingStyle(c) ? 'heading' : isList(c) ? 'list' : 'para'); }
      else if (c.localName === 'tbl') addTable(d, ctx.page, tableRows(c, ctx));
      else if (c.localName === 'sdt') { const sc = kids(c, 'sdtContent')[0]; if (sc) visit(sc); }
      else if (c.localName === 'customXml' || c.localName === 'smartTag') visit(c);
    }
  };
  visit(body);
  d.pages = [...new Set(d.blocks.map(b => b.page))].sort((a, b) => a - b).map(n => ({ n, hasText: true }));
  if (!d.pages.length) d.pages.push({ n: 1, hasText: false });
  d.meta.struckRuns = ctx.struck; d.meta.images = ctx.images;
  if (ctx.ink) { d.meta.handwriting = true; d.meta.warnings.push({ code: 'handwriting', message: 'Handwriting found – read it yourself. The file is kept as an attachment.' }); }
  if (!d.blocks.length && ctx.images) d.meta.warnings.push({ code: 'imagesOnly', message: 'This Word file is only pictures. Use the scan reader, or type the MOP in.' });
  return d;
}

// ---------- PowerPoint ----------
export async function pptxToDoc(bytes) {
  const z = openZip(bytes), d = newDoc('pptx');
  const pres = parseXml(await z.text('ppt/presentation.xml') || '<p/>'), rels = parseXml(await z.text('ppt/_rels/presentation.xml.rels') || '<r/>');
  const relMap = Object.fromEntries(rels.getElementsByTagName('Relationship').map(r => [r.getAttribute('Id'), r.getAttribute('Target')]));
  let order = pres.getElementsByTagName('p:sldId').map(s => relMap[s.getAttribute('r:id')]).filter(Boolean).map(t => 'ppt/' + t.replace(/^\/?ppt\//, '').replace(/^\.\.\//, ''));
  if (!order.length) order = z.names.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => +a.match(/(\d+)\.xml/)[1] - +b.match(/(\d+)\.xml/)[1]);
  for (let i = 0; i < order.length; i++) {
    const page = i + 1, x = await z.text(order[i]); if (!x) continue;
    const s = parseXml(x);
    for (const tbl of s.getElementsByTagNameNS(A, 'tbl')) addTable(d, page, kids(tbl, 'tr').map(tr => kids(tr, 'tc').map(tc => tc.getElementsByTagNameNS(A, 'p').map(p => p.getElementsByTagNameNS(A, 't').map(t => t.textContent).join('')).join('\n'))));
    for (const sp of s.getElementsByTagName('p:sp')) {
      const isTitle = sp.getElementsByTagName('p:ph').some(ph => /title/i.test(ph.getAttribute('type') || ''));
      for (const p of sp.getElementsByTagNameNS(A, 'p')) addBlock(d, page, p.getElementsByTagNameNS(A, 't').map(t => t.textContent).join(''), isTitle ? 'heading' : 'para');
    }
    const notes = await z.text(order[i].replace('slides/slide', 'notesSlides/notesSlide'));
    if (notes) for (const p of parseXml(notes).getElementsByTagNameNS(A, 'p')) addBlock(d, page, p.getElementsByTagNameNS(A, 't').map(t => t.textContent).join(''), 'note', { part: 'notes' });
    if (!d.pages.find(p => p.n === page)) d.pages.push({ n: page, hasText: false });
  }
  d.pages.sort((a, b) => a.n - b.n);
  return d;
}

// ---------- Excel ----------
const colNum = ref => { const m = /^([A-Z]+)/.exec(ref || ''); return m ? m[1].split('').reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1 : 0; };
const DATE_FMT = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
const serialDate = v => { const ms = Math.round((+v - 25569) * 86400000); const dt = new Date(ms); return isNaN(dt) ? String(v) : dt.toISOString().replace(/T00:00:00\.000Z$/, '').replace(/:00\.000Z$/, '').replace('T', ' '); };

export async function xlsxToDoc(bytes, { kind = 'xlsx' } = {}) {
  const z = openZip(bytes), d = newDoc(kind);
  const ss = await z.text('xl/sharedStrings.xml'), strings = ss ? parseXml(ss).getElementsByTagNameNS(S, 'si').map(si => si.getElementsByTagNameNS(S, 't').map(t => t.textContent).join('')) : [];
  const st = await z.text('xl/styles.xml'); let dateStyles = new Set();
  if (st) { const sd = parseXml(st), custom = new Set(sd.getElementsByTagNameNS(S, 'numFmt').filter(f => /[dmy]/i.test((f.getAttribute('formatCode') || '').replace(/"[^"]*"|\[[^\]]*\]/g, ''))).map(f => +f.getAttribute('numFmtId')));
    const xfs = sd.getElementsByTagNameNS(S, 'cellXfs')[0]; if (xfs) kids(xfs, 'xf').forEach((xf, i) => { const id = +xf.getAttribute('numFmtId'); if (DATE_FMT.has(id) || custom.has(id)) dateStyles.add(i); }); }
  const wb = parseXml(await z.text('xl/workbook.xml')), rels = parseXml(await z.text('xl/_rels/workbook.xml.rels') || '<r/>');
  const relMap = Object.fromEntries(rels.getElementsByTagName('Relationship').map(r => [r.getAttribute('Id'), r.getAttribute('Target')]));
  const sheets = wb.getElementsByTagNameNS(S, 'sheet').filter(s => (s.getAttribute('state') || 'visible') === 'visible');
  let page = 0;
  for (const sh of sheets) {
    const target = relMap[sh.getAttribute('r:id')] || ''; const path = 'xl/' + target.replace(/^\/?xl\//, ''); const x = await z.text(path); if (!x) continue;
    page++; const sd = parseXml(x), grid = [];
    for (const row of sd.getElementsByTagNameNS(S, 'row')) {
      const r = (+row.getAttribute('r') || grid.length + 1) - 1, line = grid[r] = grid[r] || [];
      for (const c of kids(row, 'c')) {
        const t = c.getAttribute('t'), v = kids(c, 'v')[0], s = +c.getAttribute('s');
        let val = t === 'inlineStr' ? c.getElementsByTagNameNS(S, 't').map(n => n.textContent).join('') : v ? v.textContent : '';
        if (t === 's') val = strings[+val] || ''; else if (t === 'b') val = val === '1' ? 'TRUE' : 'FALSE'; else if (!t && val !== '' && dateStyles.has(s)) val = serialDate(val);
        line[colNum(c.getAttribute('r'))] = val;
      }
    }
    const rows = [...grid].map(r => (r ? Array.from(r, v => (v == null ? '' : String(v))) : [])).filter(r => r.some(Boolean));
    if (rows.length) { addBlock(d, page, sh.getAttribute('name') || `Sheet ${page}`, 'heading'); addTable(d, page, rows); }
  }
  if (!d.pages.length) d.pages.push({ n: 1, hasText: false });
  return d;
}

// ---------- CSV / text ----------
export function csvRows(text) {
  const head = text.split(/\r?\n/)[0] || '', delim = [',', ';', '\t'].map(c => [c, head.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"' && cell === '') q = true; else if (ch === delim) { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}
export function csvToDoc(bytes) { const d = newDoc('csv'); addTable(d, 1, csvRows(decodeText(bytes))); if (!d.pages.length) d.pages.push({ n: 1, hasText: false }); return d; }
export function textToDoc(bytes, kind = 'txt') { const d = newDoc(kind); decodeText(bytes).split(/\r?\n/).forEach(l => addBlock(d, 1, l, 'line')); if (!d.pages.length) d.pages.push({ n: 1, hasText: false }); return d; }
export function decodeText(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  const u = new TextDecoder('utf-8', { fatal: false }).decode(bytes); return u.replace(/^﻿/, '');
}
export { clean };

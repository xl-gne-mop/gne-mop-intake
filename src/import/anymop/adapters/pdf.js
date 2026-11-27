// PDF adapter (text PDFs; pages without a text layer go to the scan reader when it is installed).
// Works with any pdf.js document object (phone: the vendored pdf.js; Node: pdfjs-dist legacy build).
// pdf.js is always opened with isEvalSupported:false and enableScripting:false (see PDF_OPTIONS).
import { newDoc, addBlock, addTable } from '../docmodel.js';

/**
 * Tables in a text PDF: a header line with ≥ 3 cells sets the columns; following lines join the table while their
 * cells fall in those columns. A line whose first column is empty continues the row above (wrapped cell text).
 */
export function findTables(lines) {
  const HEADWORD = /^(#|no\.?|item|step|steps|description|task|activity|duration|time|time completed|initial|initials|sign(ature)?|date|name|print name|title|role|trade|company|employer|equipment|equipment name|panel|source|device|point|isolation point|circuit|breaker|valve|energy|energy type|type|hazard|affected|affected loads|loads|location|room|area|responsible|by|status|go \/ no-go|notes?|comments?|phone|qty|quantity)$/i;
  const out = [], headerLike = L => L.cells.length >= 3 && L.cells.filter(c => HEADWORD.test(c.text.trim())).length * 2 >= L.cells.length;
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i]; if (h.cells.length < 3 || h.cells.some(c => c.text.length > 40)) continue;
    const cols = h.x0s, colOf = x => { let k = 0; for (let j = 0; j < cols.length; j++) if (x >= cols[j] - 6) k = j; return k; };
    const dataHead = /^\d{1,3}$/.test(h.cells[0].text); // a table that started on the page before (no header row here)
    const rows = [h.cells.map(c => c.text)], rowLine = [0]; let j = i + 1;
    for (; j < lines.length; j++) {
      const L = lines[j], next = lines[j + 1];
      if (L.cells.length === 1 && L.cells[0].text.length > 60) break; // a paragraph ends the table
      if (rows.length >= 2 && headerLike(L)) break; // a new header row starts a new table
      if (L.cells.length === 1 && next && headerLike(next) && !/^\d{1,3}$/.test(L.cells[0].text)) break; // a heading over the next table
      const ks = L.x0s.map(colOf);
      if (L.cells.length === 1 && ks[0] === 0 && rows.length > 1 && !/^\d{1,3}$/.test(L.cells[0].text) && lines[j - 1].cells.length < 2) break;
      if (L.cells.length === 1 && ks[0] === 0 && /^[A-Z][^.]{2,40}$/.test(L.cells[0].text) && next && next.cells.length < 2) break; // a heading
      if (Math.abs(L.x0s[0] - cols[0]) > 40 && L.x0s[0] < cols[0] - 40) break; // text left of the table
      const cells = Array(cols.length).fill(''); L.cells.forEach((c, k) => { const ci = ks[k]; cells[ci] = cells[ci] ? cells[ci] + ' ' + c.text : c.text; });
      if (!cells[0] && (rows.length > 1 || dataHead)) { const last = rows[rows.length - 1]; cells.forEach((c, k) => { if (c) last[k] = last[k] ? last[k] + ' ' + c : c; }); continue; }
      if (L.cells.length < 2 && rows.length > 1 && !next) break;
      rows.push(cells); rowLine.push(j - i);
    }
    if (rows.length >= 2) { out.push({ from: i, to: j - 1, rows, rowLine }); i = j - 1; }
  }
  return out;
}

export const PDF_OPTIONS = { isEvalSupported: false, enableScripting: false, disableFontFace: true, useSystemFonts: false, stopAtErrors: false };

/** Text items of one page → lines → blocks. Cells: runs separated by a gap > 12 pt (same rule as Rebuild 4). */
export function pageLines(items, vw, vh) {
  const its = items.filter(i => i.str && i.str.trim()).map(i => ({ x: i.transform[4], y: i.transform[5], w: i.width || 0, h: Math.abs(i.transform[3]) || i.height || 10, s: i.str }));
  its.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of its) { const L = lines.find(l => Math.abs(l.y - it.y) < 3); if (L) L.items.push(it); else lines.push({ y: it.y, items: [it] }); }
  lines.sort((a, b) => b.y - a.y);
  return lines.map(L => {
    L.items.sort((a, b) => a.x - b.x);
    const cells = []; let cur = null, end = null;
    for (const it of L.items) {
      const gap = end === null ? 0 : it.x - end;
      if (cur && gap <= 12) { cur.s += gap > 1.5 && !/\s$/.test(cur.s) && !/^\s/.test(it.s) ? ' ' + it.s : it.s; cur.x1 = it.x + it.w; }
      else { cur = { s: it.s, x0: it.x, x1: it.x + it.w }; cells.push(cur); }
      end = it.x + it.w;
    }
    const x0 = Math.min(...L.items.map(i => i.x)), x1 = Math.max(...L.items.map(i => i.x + i.w)), h = Math.max(...L.items.map(i => i.h));
    return { h, text: cells.map(c => c.s.trim()).join('   '), x0s: cells.map(c => c.x0), cells: cells.map(c => ({ text: c.s.trim(), bbox: [c.x0 / vw, 1 - (L.y + h) / vh, (c.x1 - c.x0) / vw, h / vh] })), bbox: [x0 / vw, 1 - (L.y + h) / vh, (x1 - x0) / vw, (h * 1.3) / vh] };
  }).filter(l => !/^Page \d+ of \d+$/.test(l.text.trim()));
}

/**
 * pdf: a pdf.js document. opts.ocrPage(page, n) → Promise<{ lines:[{text, conf, bbox}] }|null> (scan reader; optional).
 * opts.onProgress(n, total). Returns a DocModel; doc.meta.noTextPages lists pages that had no text and no OCR.
 */
export async function pdfToDoc(pdf, { ocrPage = null, onProgress = () => {}, maxPages = 60 } = {}) {
  const d = newDoc('pdf'); d.meta.noTextPages = []; d.meta.ocrPages = [];
  const total = Math.min(pdf.numPages, maxPages), all = [];
  for (let n = 1; n <= total; n++) {
    onProgress(n, total);
    const page = await pdf.getPage(n), vp = page.getViewport({ scale: 1 }), tc = await page.getTextContent();
    const lines = pageLines(tc.items, vp.width, vp.height);
    const chars = lines.reduce((a, l) => a + l.text.length, 0);
    if (chars >= 20) { d.pages.push({ n, width: vp.width, height: vp.height, hasText: true }); lines.forEach(l => all.push({ ...l, page: n })); }
    else if (ocrPage) {
      const r = await ocrPage(page, n).catch(() => null);
      d.pages.push({ n, width: vp.width, height: vp.height, hasText: !!(r && r.lines.length), ocr: true });
      if (r) { d.meta.ocrPages.push(n); for (const l of r.lines) all.push({ page: n, text: l.text, cells: [{ text: l.text, bbox: l.bbox }], x0s: [0], h: 10, bbox: l.bbox, conf: l.conf, ocr: true }); }
      else d.meta.noTextPages.push(n);
    } else { d.pages.push({ n, width: vp.width, height: vp.height, hasText: false }); d.meta.noTextPages.push(n); }
    if (page.cleanup) page.cleanup();
  }
  // tables are found over the whole document, so a table that runs onto the next page stays one table
  const text = all.filter(l => !l.ocr), hs = text.map(l => l.h).sort((a, b) => a - b), med = hs[Math.floor(hs.length / 2)] || 10;
  const tables = findTables(text.length === all.length ? all : []);
  for (let i = 0; i < all.length; i++) {
    const t = tables.find(x => x.from === i);
    if (t) {
      addTable(d, all[i].page, t.rows); const ti = d.tables.length - 1;
      d.blocks.filter(b => b.table && b.table.t === ti).forEach(b => { const L = all[t.from + (t.rowLine[b.table.r] || 0)]; if (L) { b.bbox = L.bbox; b.page = L.page; } });
      i = t.to; continue;
    }
    const l = all[i];
    if (l.ocr) { addBlock(d, l.page, l.text, 'ocr', { bbox: l.bbox, conf: l.conf }); continue; }
    const kind = l.cells.length > 1 ? 'line' : l.h >= med * 1.15 && l.text.length < 90 ? 'heading' : 'para', prev = d.blocks[d.blocks.length - 1], pl = all[i - 1];
    // a heading that wraps onto a second line is one heading ("… Method of" / "Procedure")
    if (kind === 'heading' && prev && prev.kind === 'heading' && pl && pl.page === l.page && Math.abs(pl.h - l.h) < 0.5 && !/[:.]$/.test(prev.text) && (pl.bbox[1] + pl.bbox[3] * 1.6) >= l.bbox[1] && prev.text.length + l.text.length < 140) { prev.text += ' ' + l.text; prev.bbox = [Math.min(prev.bbox[0], l.bbox[0]), prev.bbox[1], Math.max(prev.bbox[2], l.bbox[2]), l.bbox[1] + l.bbox[3] - prev.bbox[1]]; continue; }
    addBlock(d, l.page, l.text, kind, { bbox: l.bbox, cells: l.cells.length > 1 ? l.cells : undefined });
  }
  if (pdf.numPages > maxPages) d.meta.warnings.push({ code: 'tooManyPages', message: `Only the first ${maxPages} pages were read.` });
  if (d.meta.noTextPages.length) d.meta.warnings.push({ code: 'noText', message: d.meta.noTextPages.length === total ? 'This PDF is a scan (no text). Download the scan reader (6 MB, on Wi-Fi) to read it, or type the MOP in.' : `Pages ${d.meta.noTextPages.join(', ')} are scans (no text)${ocrPage ? '' : ' – the scan reader can read them'}.` });
  return d;
}

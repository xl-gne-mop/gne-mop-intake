// DocModel: the one shape every format adapter produces (Tier A plan §2 U2).
//   pages:  [{ n, width?, height?, hasText, image? }]
//   blocks: [{ id, page, text, kind: 'heading'|'para'|'cell'|'line'|'list'|'ocr'|'note', bbox?: [x,y,w,h] (0–1 of the page),
//              conf?: 0–1 (OCR word confidence), table?: { t, r, c } }]
//   tables: [{ id, page, rows: [[cellText]] }]
//   meta:   { kind, layout?, handwriting?, attachments?: [{ name, kind }], warnings: [] }
// Extracted text is only ever shown as text (textContent), never as HTML.

export function newDoc(kind) { return { pages: [], blocks: [], tables: [], meta: { kind, warnings: [] } }; }

export const clean = s => String(s == null ? '' : s).replace(/ /g, ' ').replace(/[​-‍﻿]/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();

/** Add a block; returns its id. Empty text is skipped (returns null). */
export function addBlock(doc, page, text, kind = 'para', extra = {}) {
  const t = clean(text); if (!t) return null;
  const id = `b${doc.blocks.length + 1}`;
  doc.blocks.push({ id, page, text: t, kind, ...extra });
  if (!doc.pages.find(p => p.n === page)) doc.pages.push({ n: page, hasText: true });
  return id;
}
/** Add a table (rows of cell text); each cell also becomes a block with table coordinates. */
export function addTable(doc, page, rows) {
  const t = doc.tables.length, id = `t${t + 1}`;
  const clean2 = rows.map(r => r.map(clean));
  doc.tables.push({ id, page, rows: clean2 });
  clean2.forEach((r, ri) => r.forEach((c, ci) => { if (c) addBlock(doc, page, c, 'cell', { table: { t, r: ri, c: ci } }); }));
  return id;
}
/** Plain text of the whole document in reading order (one block per line). */
export const docText = doc => doc.blocks.map(b => b.text).join('\n');
/** Merge several DocModels (e.g. an email body and its attachments) with page numbers kept apart. */
export function mergeDocs(kind, parts) {
  const out = newDoc(kind); let pageBase = 0;
  for (const d of parts) {
    const max = Math.max(0, ...d.pages.map(p => p.n));
    d.pages.forEach(p => out.pages.push({ ...p, n: p.n + pageBase }));
    d.tables.forEach(t => out.tables.push({ ...t, id: `t${out.tables.length + 1}`, page: t.page + pageBase }));
    d.blocks.forEach(b => out.blocks.push({ ...b, id: `b${out.blocks.length + 1}`, page: b.page + pageBase }));
    out.meta.warnings.push(...(d.meta.warnings || []));
    pageBase += Math.max(1, max);
  }
  return out;
}

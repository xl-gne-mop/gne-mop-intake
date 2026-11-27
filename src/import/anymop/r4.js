// Step 1 of the mapper: template fingerprint. A file in the GNE MOP template (Word or PDF, v1 or v2) or the XL Excel
// intake goes through the Rebuild 4 importer (src/import/docx.js, src/vendor-ref/imp.js) unchanged, so it gives
// exactly the Rebuild 4 result (Tier A plan U1: F01–F03 identical). Main thread (or Node with the mini DOM).
import { docText } from './docmodel.js';
import { parseMopDocx } from '../docx.js';
import { subShortFromLines, intakeExtras } from '../read.js';

export const looksLikeGneTemplate = text => /METHOD OF PROCEDURE/i.test(text) && /Impact Notification/i.test(text) && /(Qualified and Authorized Workers|Personnel Contact List|Detailed Step-by-Step)/i.test(text);

/**
 * Returns { rec, kind, mopNo, info, warn, project?, workType? } for a template file, or null.
 * opts: { openPdf, MOPIMP } (defaults: the page's pdf.js loader is passed in by the caller; window.MOPIMP).
 */
export async function fingerprint(bytes, sniff, doc, { openPdf = null, MOPIMP = globalThis.MOPIMP } = {}) {
  const kind = sniff && sniff.kind;
  if ((kind === 'docx' || kind === 'docm') && looksLikeGneTemplate(docText(doc))) {
    const o = parseMopDocx(bytes); return { rec: o.rec, mopNo: o.mopNo, kind: 'Word MOP', info: [], warn: [] };
  }
  if (kind === 'pdf' && MOPIMP && openPdf && looksLikeGneTemplate(docText(doc))) {
    const pdf = await openPdf(bytes); try { const lines = await MOPIMP.pdfLines(pdf); const o = MOPIMP.parseMopLines(lines); subShortFromLines(o.rec, lines); return { ...o, kind: 'PDF MOP' }; } finally { if (pdf.destroy) pdf.destroy(); }
  }
  if ((kind === 'xlsx' || kind === 'xlsm') && MOPIMP) {
    try { const bk = MOPIMP.readXlsx(bytes), o = MOPIMP.parseIntakeXlsx(bk); intakeExtras(o.rec, bk); return { ...o, kind: 'Excel intake' }; } catch { return null; }
  }
  return null;
}

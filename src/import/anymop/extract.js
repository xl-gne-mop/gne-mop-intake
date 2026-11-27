// Extractor (Tier A plan §2 U1/U2): file bytes → guard → format adapter → DocModel.
//   extract(bytes, name, providers) → { ok, doc, sniff, sha256, warnings[], message?, choose?[] }
// providers (all optional): { openPdf(bytes) → pdf.js doc, ocrPage(page, n), ocrImage(bytes, mime), decodeHeic(bytes),
//                             onProgress(text) }. Missing providers degrade to a plain message, never a crash.
import { guardFile, sha256Hex, GUARD_MESSAGES, LIMITS } from './guard.js';
import { docxToDoc, pptxToDoc, xlsxToDoc, csvToDoc, textToDoc } from './adapters/office.js';
import { emlToDoc, msgToDoc } from './adapters/mail.js';
import { docToDoc, rtfToDoc } from './adapters/legacy.js';
import { pdfToDoc } from './adapters/pdf.js';
import { mergeDocs, newDoc, addBlock, docText } from './docmodel.js';

const MOP_WORDS = /\b(MOP|method of procedure|shutdown|shut down|outage|LOTO|lock ?out|tie[- ]in|isolation|impairment|back-?out|return to service)\b/gi;
export const mopScore = text => (String(text).match(MOP_WORDS) || []).length;

async function adapt(bytes, s, name, P, depth) {
  const say = t => P.onProgress && P.onProgress(t);
  switch (s.kind) {
    case 'docx': case 'docm': return { doc: await docxToDoc(bytes, { kind: s.kind }) };
    case 'xlsx': case 'xlsm': return { doc: await xlsxToDoc(bytes, { kind: s.kind }) };
    case 'pptx': return { doc: await pptxToDoc(bytes) };
    case 'csv': return { doc: csvToDoc(bytes) };
    case 'txt': return { doc: textToDoc(bytes) };
    case 'doc': try { return { doc: docToDoc(bytes) }; } catch { return { fail: GUARD_MESSAGES.oldDoc }; }
    case 'rtf': try { return { doc: rtfToDoc(bytes) }; } catch { return { fail: GUARD_MESSAGES.oldDoc }; }
    case 'xls': return { fail: GUARD_MESSAGES.oldXls };
    case 'pdf': {
      if (!P.openPdf) return { fail: 'PDF reader not loaded.' };
      const pdf = await P.openPdf(bytes);
      if (pdf.numPages > LIMITS.maxPages) return { fail: GUARD_MESSAGES.tooManyPages };
      const doc = await pdfToDoc(pdf, { ocrPage: P.ocrPage || null, onProgress: (n, t) => say(`Reading page ${n} of ${t}…`) });
      if (pdf.destroy) pdf.destroy();
      return { doc };
    }
    case 'jpeg': case 'png': case 'gif': case 'webp': case 'heic': {
      let img = bytes, mime = s.mime;
      if (s.kind === 'heic') { if (!P.decodeHeic) return { doc: photoOnly(name, 'This photo is HEIC. Your phone could not convert it – take it again as a normal photo, or keep it as an attachment.'), photo: true }; img = await P.decodeHeic(bytes); mime = 'image/jpeg'; }
      if (!P.ocrImage) return { doc: photoOnly(name, 'Photo kept as an attachment. Download the scan reader (6 MB, on Wi-Fi) to read the text in photos.'), photo: true };
      say('Reading the photo…');
      const r = await P.ocrImage(img, mime);
      const doc = newDoc(s.kind); doc.pages.push({ n: 1, hasText: !!(r && r.lines.length), ocr: true }); doc.meta.ocrPages = [1];
      for (const l of (r && r.lines) || []) addBlock(doc, 1, l.text, 'ocr', { bbox: l.bbox, conf: l.conf });
      if (r && r.handwriting) { doc.meta.handwriting = true; doc.meta.warnings.push({ code: 'handwriting', message: 'Handwriting found – read it yourself. The photo is kept as an attachment.' }); }
      return { doc, photo: true };
    }
    case 'eml': case 'msg': {
      const m = s.kind === 'eml' ? emlToDoc(bytes) : msgToDoc(bytes);
      if (depth >= 2 || !m.attachments.length) return { doc: m.doc };
      const subs = [];
      for (const a of m.attachments.slice(0, 10)) {
        const r = await extract(a.bytes, a.name, P, depth + 1);
        if (r.ok && r.doc) subs.push({ name: a.name, bytes: a.bytes, result: r, score: mopScore(docText(r.doc)) + (/mop|procedure/i.test(a.name) ? 3 : 0) });
      }
      const cands = subs.filter(x => x.score > 0 || !x.result.photo).sort((a, b) => b.score - a.score);
      if (cands.length > 1 && !P.pick) return { doc: m.doc, choose: cands.map(c => ({ name: c.name, score: c.score })), attachments: subs };
      const pick = P.pick ? cands.find(c => c.name === P.pick) || cands[0] : cands[0];
      return { doc: pick ? mergeDocs(s.kind, [pick.result.doc, m.doc]) : m.doc, attachments: subs, picked: pick && pick.name };
    }
    default: return { fail: GUARD_MESSAGES.unknown };
  }
}
function photoOnly(name, message) { const d = newDoc('photo'); d.pages.push({ n: 1, hasText: false }); d.meta.warnings.push({ code: 'photoOnly', message }); return d; }

export async function extract(bytes, name, P = {}, depth = 0) {
  const g = guardFile(bytes, name);
  if (!g.ok) return { ok: false, code: g.code, message: g.message, sniff: g.sniff, warnings: g.warnings };
  const sha256 = await sha256Hex(bytes);
  try {
    const r = await adapt(bytes, g.sniff, name, P, depth);
    if (r.fail) return { ok: false, code: 'unreadable', message: r.fail, sniff: g.sniff, sha256, warnings: g.warnings };
    r.doc.meta.warnings.unshift(...g.warnings);
    return { ok: true, doc: r.doc, sniff: g.sniff, sha256, warnings: r.doc.meta.warnings, choose: r.choose, attachments: r.attachments, picked: r.picked, photo: !!r.photo };
  } catch (e) {
    const old = ['doc', 'rtf'].includes(g.sniff.kind);
    return { ok: false, code: 'unreadable', message: old ? GUARD_MESSAGES.oldDoc : `We couldn’t read this file (${String(e && e.message || e).slice(0, 80)}). Try a PDF of it.`, sniff: g.sniff, sha256, warnings: g.warnings };
  }
}

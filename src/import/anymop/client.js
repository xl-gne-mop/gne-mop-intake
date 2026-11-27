// "Start from an existing MOP": file(s) → guard → DocModel (Worker or page) → fingerprint → mapper → result.
// Photos: up to 10 at a time (decision #3), each read with the scan reader and joined as pages.
import { sniff, LIMITS, GUARD_MESSAGES } from './guard.js';
import { extract } from './extract.js';
import { mergeDocs } from './docmodel.js';
import { mapDoc } from './mapper.js';
import { fingerprint } from './r4.js';
import { PDF_OPTIONS } from './adapters/pdf.js';
import { ocrInstalled, ocrImage, ocrPage, decodeHeic, closeOcr } from './ocr.js';
import { ocrStarted, ocrEnded } from './pilot.js';

const WORKER_KINDS = new Set(['docx', 'docm', 'xlsx', 'xlsm', 'pptx', 'csv', 'txt', 'doc', 'rtf']);
let W = null, seq = 0;
function viaWorker(bytes, name, onProgress) {
  if (!W) { try { W = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); } catch { W = false; } }
  if (!W) return null;
  return new Promise(ok => {
    const id = ++seq, h = e => { if (e.data.id !== id) return; if (e.data.progress) { onProgress(e.data.progress); return; } W.removeEventListener('message', h); ok(e.data.result); };
    W.addEventListener('message', h); W.addEventListener('error', () => ok(null), { once: true });
    W.postMessage({ id, bytes, name });
  });
}

/** providers for the page: pdf.js (vendored, hardened options) + the scan reader when installed */
export async function providers({ pdfjs, onProgress = () => {} }) {
  const ocr = await ocrInstalled().catch(() => false);
  return {
    openPdf: async bytes => { const L = await pdfjs(); return L.getDocument({ data: bytes.slice(0), ...PDF_OPTIONS }).promise; },
    ocrPage: ocr ? (page, n) => { onProgress(`Reading page ${n} (scan)…`); return ocrPage(page); } : null,
    ocrImage: ocr ? (b, mime) => ocrImage(b, mime) : null,
    decodeHeic: b => decodeHeic(b),
    onProgress, ocr
  };
}

/**
 * files: File[] (one document, or up to 10 photos). opts: { pdfjs, library, libraryVersion, synonyms, roomPattern,
 * onProgress(text), pick (attachment name when an email had more than one MOP) }.
 * Returns { ok, result?, message?, choose?, files: [{ name, bytes, sha256, type, size }] }.
 */
export async function importFiles(files, opts) {
  const say = t => opts.onProgress && opts.onProgress(t);
  const list = [...files]; if (!list.length) return { ok: false, message: 'No file chosen.' };
  const loaded = await Promise.all(list.map(async f => ({ name: f.name || 'file', bytes: new Uint8Array(await f.arrayBuffer()), type: f.type || '' })));
  const kinds = loaded.map(f => sniff(f.bytes, f.name).kind), photos = kinds.every(k => ['jpeg', 'png', 'heic', 'webp', 'gif'].includes(k));
  if (loaded.length > 1 && !photos) return { ok: false, message: 'Choose one MOP file (or up to 10 photos of one MOP).' };
  if (photos && loaded.length > LIMITS.maxPhotos) return { ok: false, message: GUARD_MESSAGES.tooManyPhotos };
  const P = await providers({ pdfjs: opts.pdfjs, onProgress: say }); if (opts.pick) P.pick = opts.pick;
  const parts = []; if (P.ocr) ocrStarted(); // a tab reload during the scan reader is counted on the next start (U6)
  try {
    for (let i = 0; i < loaded.length; i++) {
      const f = loaded[i]; say(loaded.length > 1 ? `Reading photo ${i + 1} of ${loaded.length}…` : 'Reading the file…');
      let r = WORKER_KINDS.has(kinds[i]) ? await viaWorker(f.bytes.slice().buffer, f.name, say) : null;
      if (!r) r = await extract(f.bytes, f.name, P);
      if (!r.ok) return { ok: false, message: r.message, code: r.code, files: loaded };
      if (r.choose) return { ok: false, choose: r.choose, files: loaded, message: 'This email has more than one MOP. Which one?' };
      f.sha256 = r.sha256; parts.push({ f, r });
    }
  } finally { if (P.ocr) { closeOcr(); ocrEnded(); } }
  const doc = parts.length > 1 ? mergeDocs('photos', parts.map(p => p.r.doc)) : parts[0].r.doc;
  const first = parts[0];
  const fp = parts.length === 1 ? await fingerprint(first.f.bytes, first.r.sniff, doc, { openPdf: P.openPdf }).catch(() => null) : null;
  say('Matching what we found to the form…');
  const result = mapDoc(doc, { library: opts.library, libraryVersion: opts.libraryVersion, synonyms: opts.synonyms, roomPattern: opts.roomPattern, r4: fp,
    file: { name: loaded.length > 1 ? `${loaded.length} photos` : first.f.name, size: loaded.reduce((a, f) => a + f.bytes.length, 0), sha256: first.f.sha256, type: first.r.sniff.mime || first.r.sniff.kind } });
  result.meta.photo = parts.every(p => p.r.photo); result.meta.needsOcr = parts.some(p => (p.r.doc.meta.noTextPages || []).length || p.r.warnings.some(w => w.code === 'photoOnly'));
  return { ok: true, result, files: loaded, doc };
}

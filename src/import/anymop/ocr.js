// Scan reader (decision #2): tesseract.js 6 + English LSTM data, an optional ~6 MB download offered on Wi-Fi and kept
// in Cache Storage (never precached). Pages are read one at a time (rendered ~200 DPI, at most 2000 px, grey,
// photo orientation fixed); the OCR worker restarts every 5 pages so an older iPhone doesn't reload the tab.
// Everything runs on the phone; nothing is sent anywhere.
export const OCR_CACHE = 'mop-ocr-v1';
const BASE = new URL('../../../vendor/ocr/', import.meta.url).href;
const simd = () => { try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); } catch { return false; } };
export const coreFile = () => (simd() ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js');
export const packFiles = () => ['tesseract.esm.min.js', 'worker.min.js', coreFile(), 'eng.traineddata.gz'].map(f => BASE + f);
export const PACK_LABEL = 'Download scan reader (6 MB)';

/** true / false when the phone says, null when it can't tell (iPhone doesn't). */
export function onWifi() { const c = navigator.connection; if (!c || !c.type) return null; return c.type === 'wifi' || c.type === 'ethernet'; }

export async function ocrInstalled() {
  if (!('caches' in self)) return false;
  const c = await caches.open(OCR_CACHE);
  for (const u of packFiles()) if (!(await c.match(u))) return false;
  return true;
}
/** Download the pack into Cache Storage. onProgress(doneBytes, totalBytes). */
export async function installOcr(onProgress = () => {}) {
  const c = await caches.open(OCR_CACHE), files = packFiles(); let done = 0; const total = 7.0e6;
  for (const u of files) {
    if (await c.match(u)) continue;
    const r = await fetch(u, { cache: 'reload' }); if (!r.ok) throw new Error(`Download failed (${r.status})`);
    const b = await r.blob(); done += b.size; onProgress(done, total);
    await c.put(u, new Response(b, { headers: { 'content-type': u.endsWith('.gz') ? 'application/gzip' : 'text/javascript' } }));
  }
  return true;
}
export async function removeOcr() { if ('caches' in self) await caches.delete(OCR_CACHE); }

let T = null, worker = null, pages = 0;
async function getWorker() {
  if (worker && pages < 5) return worker;
  if (worker) { await worker.terminate().catch(() => {}); worker = null; }
  if (!T) T = (await import(BASE + 'tesseract.esm.min.js')).default;
  worker = await T.createWorker('eng', 1, { workerPath: BASE + 'worker.min.js', corePath: BASE + coreFile(), langPath: BASE, gzip: true, cacheMethod: 'none', workerBlobURL: false, logger: () => {} });
  pages = 0; return worker;
}
export async function closeOcr() { if (worker) { await worker.terminate().catch(() => {}); worker = null; } }

/** Draw an image (Blob/bitmap) onto a grey canvas at most 2000 px on the long side. */
async function prepare(source) {
  const bmp = source instanceof ImageBitmap ? source : await createImageBitmap(source, { imageOrientation: 'from-image' });
  const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = cv.getContext('2d'); g.filter = 'grayscale(1) contrast(1.15)'; g.drawImage(bmp, 0, 0, w, h);
  if (bmp.close && !(source instanceof ImageBitmap)) bmp.close();
  return { canvas: cv, w, h };
}
async function recognizeCanvas({ canvas, w, h }) {
  const wk = await getWorker(); pages++;
  const img = canvas.convertToBlob ? await canvas.convertToBlob({ type: 'image/png' }) : await new Promise(ok => canvas.toBlob(ok, 'image/png'));
  const { data } = await wk.recognize(img, {}, { blocks: true });
  const lines = (data.blocks || []).flatMap(b => (b.paragraphs || []).flatMap(p => p.lines || []))
    .map(l => ({ text: (l.text || '').trim(), conf: Math.round(l.confidence) / 100, bbox: [l.bbox.x0 / w, l.bbox.y0 / h, (l.bbox.x1 - l.bbox.x0) / w, (l.bbox.y1 - l.bbox.y0) / h] }))
    .filter(l => l.text);
  const weak = lines.filter(l => l.conf < 0.35).length;
  return { lines, handwriting: weak >= 3 && weak / Math.max(1, lines.length) > 0.25 };
}
/** A photo (bytes) → lines. */
export async function ocrImage(bytes, mime = 'image/jpeg') { return recognizeCanvas(await prepare(new Blob([bytes], { type: mime }))); }
/** A pdf.js page with no text layer → render ~200 DPI → lines. */
export async function ocrPage(page) {
  const vp = page.getViewport({ scale: 200 / 72 }), scale = Math.min(1, 2000 / Math.max(vp.width, vp.height)), v2 = page.getViewport({ scale: (200 / 72) * scale });
  // pdf.js 3.11 renders into a normal canvas (not OffscreenCanvas); the page is read on the main thread's canvas
  const cv = Object.assign(document.createElement('canvas'), { width: Math.round(v2.width), height: Math.round(v2.height) });
  const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
  await page.render({ canvasContext: g, viewport: v2 }).promise;
  return recognizeCanvas({ canvas: cv, w: cv.width, h: cv.height });
}
/** HEIC: Safari decodes it natively (createImageBitmap); elsewhere there is no decoder in the pack. */
export async function decodeHeic(bytes) {
  const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/heic' }));
  const { canvas } = await prepare(bmp); const b = canvas.convertToBlob ? await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 }) : await new Promise(ok => canvas.toBlob(ok, 'image/jpeg', 0.9));
  return new Uint8Array(await b.arrayBuffer());
}

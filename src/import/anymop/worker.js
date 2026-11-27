// Module Web Worker for the zip / text / old-Office adapters (Word, Excel, PowerPoint, CSV, text, .doc, .rtf), so a big
// file never freezes the screen. PDFs, photos and emails (which can hold PDFs / photos) are read on the page because
// pdf.js and the scan reader run their own workers. The worker has no network use and never touches the page.
import { MiniDOMParser } from './xml.js';
import { extract } from './extract.js';

self.DOMParser = self.DOMParser || MiniDOMParser;
self.onmessage = async e => {
  const { id, bytes, name } = e.data || {};
  try { const r = await extract(new Uint8Array(bytes), name, { onProgress: t => self.postMessage({ id, progress: t }) }); self.postMessage({ id, result: r }); }
  catch (err) { self.postMessage({ id, result: { ok: false, code: 'unreadable', message: String(err && err.message || err) } }); }
};

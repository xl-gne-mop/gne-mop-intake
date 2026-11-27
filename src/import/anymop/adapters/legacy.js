// Old formats, best effort (decision #4): Word 97–2003 .doc (piece table) and .rtf. When the text can't be read the
// caller shows "Save as .docx or PDF and try again".
import { readCfb } from '../cfb.js';
import { newDoc, addBlock } from '../docmodel.js';

const CP1252 = new TextDecoder('windows-1252');

/** Word 97+ text from the WordDocument stream through the CLX piece table. */
export function docText(bytes) {
  const c = readCfb(bytes), wd = c.read('WordDocument'); if (!wd || wd.length < 0x1aa) throw new Error('not a Word 97 file');
  const dv = new DataView(wd.buffer, wd.byteOffset, wd.byteLength);
  if (dv.getUint16(0, true) !== 0xa5ec) throw new Error('not a Word 97 file');
  const flags = dv.getUint16(0x0a, true); if (flags & 0x0100) throw new Error('encrypted Word file');
  const table = c.read(flags & 0x0200 ? '1Table' : '0Table'); if (!table) throw new Error('no table stream');
  const fcClx = dv.getUint32(0x1a2, true), lcbClx = dv.getUint32(0x1a6, true);
  const clx = table.subarray(fcClx, fcClx + lcbClx), cdv = new DataView(clx.buffer, clx.byteOffset, clx.byteLength);
  let i = 0; while (i < clx.length && clx[i] === 0x01) i += 3 + cdv.getUint16(i + 1, true); // skip Prc
  if (clx[i] !== 0x02) throw new Error('no piece table');
  const lcb = cdv.getUint32(i + 1, true), plc = i + 5, n = Math.floor((lcb - 4) / 12);
  let out = '';
  for (let k = 0; k < n && k < 100000; k++) {
    const cp0 = cdv.getUint32(plc + k * 4, true), cp1 = cdv.getUint32(plc + (k + 1) * 4, true), len = cp1 - cp0;
    const pcd = plc + (n + 1) * 4 + k * 8, fcv = cdv.getUint32(pcd + 2, true), compressed = !!(fcv & 0x40000000), fc = fcv & 0x3fffffff;
    if (len <= 0 || len > 5e6) continue;
    out += compressed ? CP1252.decode(wd.subarray(fc / 2, fc / 2 + len)) : new TextDecoder('utf-16le').decode(wd.subarray(fc, fc + len * 2));
  }
  // field codes: keep the result (between 0x14 and 0x15), drop the instruction (0x13 … 0x14)
  out = out.replace(/\x13[^\x13\x14\x15]*\x14([^\x15]*)\x15/g, '$1').replace(/\x13[^\x15]*\x15/g, '');
  return out.replace(/\x07\x07/g, '\n').replace(/\x07/g, '\t').replace(/[\r\x0b]/g, '\n').replace(/\x0c/g, '\n\f\n').replace(/[\x00-\x08\x0e-\x1f]/g, '');
}
export function docToDoc(bytes) {
  const t = docText(bytes), d = newDoc('doc'); let page = 1;
  for (const l of t.split('\n')) { if (l === '\f') { page++; continue; } lineBlock(d, page, l); }
  if (!d.pages.length) d.pages.push({ n: 1, hasText: false });
  return d;
}
/** A tab-separated line (a table row in .doc / .rtf) keeps its cells, like a PDF line. */
function lineBlock(d, page, l) {
  const parts = l.replace(/\t+$/, '').split('\t').map(x => x.trim()).filter(Boolean);
  if (parts.length > 1) addBlock(d, page, parts.join('   '), 'line', { cells: parts.map(text => ({ text })) }); else addBlock(d, page, parts[0] || '', 'para');
}

const SKIP = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'footer', 'headerl', 'headerr', 'footerl', 'footerr', 'xmlnstbl', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'fldinst']);
/** Small RTF to text stripper. */
export function rtfText(src) {
  const s = typeof src === 'string' ? src : new TextDecoder('latin1').decode(src);
  if (!/^\{\\rtf/.test(s)) throw new Error('not RTF');
  let out = '', i = 0, uc = 1; const stack = []; let skip = 0, depth = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '{') { stack.push({ skip, uc }); depth++; i++; continue; }
    if (ch === '}') { const st = stack.pop() || { skip: 0, uc: 1 }; skip = st.skip; uc = st.uc; depth--; i++; continue; }
    if (ch === '\\') {
      const m = /^\\([a-zA-Z]+)(-?\d+)? ?|^\\'([0-9a-fA-F]{2})|^\\(.)/.exec(s.slice(i, i + 40));
      if (!m) { i++; continue; }
      i += m[0].length;
      if (m[3]) { if (!skip) out += CP1252.decode(new Uint8Array([parseInt(m[3], 16)])); continue; }
      if (m[4]) { if (m[4] === '*') skip = skip || depth; else if (!skip && m[4] === '~') out += ' '; else if (!skip && '\\{}'.includes(m[4])) out += m[4]; continue; }
      const w = m[1], arg = m[2];
      if (SKIP.has(w)) { skip = skip || depth; continue; }
      if (skip) continue;
      if (w === 'par' || w === 'line' || w === 'row' || w === 'sect') out += '\n'; else if (w === 'tab' || w === 'cell') out += '\t'; else if (w === 'page') out += '\n\f\n';
      else if (w === 'uc') uc = +arg || 1; else if (w === 'u') { out += String.fromCharCode((+arg + 65536) % 65536); i += uc; }
      continue;
    }
    if (ch === '\r' || ch === '\n') { i++; continue; }
    if (!skip) out += ch; i++;
  }
  return out;
}
export function rtfToDoc(bytes) {
  const d = newDoc('rtf'); let page = 1;
  for (const l of rtfText(bytes).split('\n')) { if (l === '\f') { page++; continue; } lineBlock(d, page, l); }
  if (!d.pages.length) d.pages.push({ n: 1, hasText: false });
  return d;
}

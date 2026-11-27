// Intake guard for "Start from an existing MOP" (Tier A plan §2 U2, decisions #3 and #4).
// Every file is sniffed by its first bytes (never trusted by name), checked against the limits, and hashed.
// Returns a plain verdict; nothing here throws for a bad file: { ok:false, code, message } instead.

export const LIMITS = { maxBytes: 25 * 1024 * 1024, maxPages: 60, maxPhotos: 10, zipMaxUncompressed: 100 * 1024 * 1024, zipMaxEntries: 2000 };

const MSG = {
  tooBig: 'This file is bigger than 25 MB. Send a smaller copy (or a PDF) and try again.',
  tooManyPages: 'This file has more than 60 pages. Send only the MOP pages and try again.',
  tooManyPhotos: 'Use up to 10 photos at a time.',
  zipBomb: 'This file is not a normal Office file (it unpacks too big). It was not opened.',
  encrypted: 'This PDF has a password. Remove the password (or print it to a new PDF) and try again.',
  unknown: 'We can’t read this kind of file. Use a PDF, Word, Excel, PowerPoint, email or photo of the MOP.',
  empty: 'This file is empty.',
  oldDoc: 'Save it as .docx or PDF and try again.',
  oldXls: 'Save it as .xlsx or PDF and try again.'
};
export const GUARD_MESSAGES = MSG;

const starts = (b, sig, at = 0) => sig.every((v, i) => b[at + i] === v);
const ascii = (b, from, len) => { let s = ''; for (let i = from; i < Math.min(b.length, from + len); i++) s += String.fromCharCode(b[i]); return s; };

/** Read the zip central directory (no decompression): entry names, sizes. Null when it isn't a zip. */
export function zipDirectory(b) {
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) { eocd = i; break; }
  if (eocd < 0) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let n = dv.getUint16(eocd + 10, true), off = dv.getUint32(eocd + 16, true);
  const entries = []; let total = 0;
  for (let k = 0; k < n && off + 46 <= b.length; k++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const size = dv.getUint32(off + 24, true), nl = dv.getUint16(off + 28, true), xl = dv.getUint16(off + 30, true), cl = dv.getUint16(off + 32, true);
    const flags = dv.getUint16(off + 8, true), name = new TextDecoder().decode(b.subarray(off + 46, off + 46 + nl));
    entries.push({ name, size, encrypted: !!(flags & 1) }); total += size; off += 46 + nl + xl + cl;
  }
  return { entries, total, count: n };
}

/**
 * Sniff a file. kind: pdf | docx | docm | xlsx | xlsm | pptx | zip | doc | xls | msg | ole | rtf | eml | csv | txt |
 * jpeg | png | heic | gif | webp | html | unknown.
 */
export function sniff(bytes, name = '') {
  const b = bytes, ext = (String(name).split('.').pop() || '').toLowerCase();
  if (!b || !b.length) return { kind: 'empty', ext };
  if (starts(b, [0x25, 0x50, 0x44, 0x46])) return { kind: 'pdf', ext, mime: 'application/pdf' };
  if (starts(b, [0xff, 0xd8, 0xff])) return { kind: 'jpeg', ext, mime: 'image/jpeg', image: true };
  if (starts(b, [0x89, 0x50, 0x4e, 0x47])) return { kind: 'png', ext, mime: 'image/png', image: true };
  if (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a') return { kind: 'gif', ext, mime: 'image/gif', image: true };
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return { kind: 'webp', ext, mime: 'image/webp', image: true };
  if (ascii(b, 4, 4) === 'ftyp' && /^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(ascii(b, 8, 4))) return { kind: 'heic', ext, mime: 'image/heic', image: true };
  if (starts(b, [0x50, 0x4b, 0x03, 0x04]) || starts(b, [0x50, 0x4b, 0x05, 0x06])) {
    const dir = zipDirectory(b), names = dir ? dir.entries.map(e => e.name) : [];
    const macros = names.some(n => /vbaProject\.bin$/i.test(n));
    if (names.includes('word/document.xml')) return { kind: macros ? 'docm' : 'docx', ext, zip: dir, macros, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
    if (names.includes('xl/workbook.xml')) return { kind: macros ? 'xlsm' : 'xlsx', ext, zip: dir, macros, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    if (names.includes('ppt/presentation.xml')) return { kind: 'pptx', ext, zip: dir, macros, mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
    return { kind: 'zip', ext, zip: dir };
  }
  if (starts(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) { // OLE2 compound file
    const k = ext === 'msg' ? 'msg' : ext === 'xls' ? 'xls' : ext === 'doc' || ext === 'dot' ? 'doc' : 'ole';
    return { kind: k, ext, mime: 'application/x-ole-storage' };
  }
  const head = ascii(b, 0, 2048);
  if (/^\{\\rtf/.test(head)) return { kind: 'rtf', ext, mime: 'application/rtf' };
  const text = !/[\x00-\x08\x0e-\x1a]/.test(head.replace(/^﻿|^ï»¿/, ''));
  if (text && /^(From:|To:|Subject:|Date:|Received:|Return-Path:|MIME-Version:|Message-ID:|X-[\w-]+:|Content-Type:)/im.test(head) && /\r?\n\r?\n/.test(head + '\n\n') && (ext === 'eml' || /^(Received|From|Return-Path|MIME-Version|Message-ID|Date|Subject|To|X-[\w-]+):/m.test(head.split(/\r?\n\r?\n/)[0]))) return { kind: 'eml', ext, mime: 'message/rfc822' };
  if (text && /<(html|!doctype html|script|body)/i.test(head)) return { kind: 'html', ext, mime: 'text/html' };
  if (text && (ext === 'csv' || ext === 'tsv')) return { kind: 'csv', ext, mime: 'text/csv' };
  if (text && (ext === 'txt' || ext === '' || ext === 'text')) return { kind: 'txt', ext, mime: 'text/plain' };
  if (text && /[,;\t]/.test(head.split(/\r?\n/)[0] || '') && (head.match(/\r?\n/g) || []).length > 1) return { kind: 'csv', ext, mime: 'text/csv' };
  return { kind: 'unknown', ext };
}

const READABLE = new Set(['pdf', 'jpeg', 'png', 'gif', 'webp', 'heic', 'docx', 'docm', 'xlsx', 'xlsm', 'pptx', 'doc', 'msg', 'rtf', 'eml', 'csv', 'txt', 'xls']);

/** Check one file. Returns { ok, code?, message?, sniff, warnings[] }. pages (if known) is checked later too. */
export function guardFile(bytes, name, { pages = 0 } = {}) {
  const s = sniff(bytes, name), warnings = [];
  if (s.kind === 'empty') return { ok: false, code: 'empty', message: MSG.empty, sniff: s, warnings };
  if (bytes.length > LIMITS.maxBytes) return { ok: false, code: 'tooBig', message: MSG.tooBig, sniff: s, warnings };
  if (pages > LIMITS.maxPages) return { ok: false, code: 'tooManyPages', message: MSG.tooManyPages, sniff: s, warnings };
  if (s.zip) {
    if (s.zip.count > LIMITS.zipMaxEntries || s.zip.entries.length > LIMITS.zipMaxEntries) return { ok: false, code: 'zipBomb', message: MSG.zipBomb, sniff: s, warnings };
    if (s.zip.total > LIMITS.zipMaxUncompressed) return { ok: false, code: 'zipBomb', message: MSG.zipBomb, sniff: s, warnings };
    if (s.zip.entries.some(e => e.encrypted)) return { ok: false, code: 'encrypted', message: 'This file has a password. Open it, remove the password, save, and try again.', sniff: s, warnings };
  }
  if (s.macros) warnings.push({ code: 'macros', message: 'This file has macros. Only its text was read; nothing in it was run.' });
  if (s.kind === 'pdf' && isEncryptedPdf(bytes)) return { ok: false, code: 'encrypted', message: MSG.encrypted, sniff: s, warnings };
  if (s.kind === 'html') return { ok: false, code: 'unknown', message: MSG.unknown, sniff: s, warnings };
  if (!READABLE.has(s.kind)) return { ok: false, code: 'unknown', message: MSG.unknown, sniff: s, warnings };
  return { ok: true, sniff: s, warnings };
}

/** /Encrypt in the trailer (or an xref stream dictionary) means the PDF needs a password or has restrictions. */
export function isEncryptedPdf(b) {
  const tail = ascii(b, Math.max(0, b.length - 4096), 4096);
  if (/\/Encrypt\s+\d+\s+\d+\s+R/.test(tail)) return true;
  // xref streams put the trailer keys in an object dictionary – look in the first 64 KB too (cheap)
  return /\/Type\s*\/XRef[^>]*\/Encrypt\s+\d+\s+\d+\s+R/.test(ascii(b, 0, Math.min(b.length, 65536)));
}

/** SHA-256 hex (crypto.subtle: phones, Workers and Node 22). */
export async function sha256Hex(bytes) {
  const h = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return Array.from(h, x => x.toString(16).padStart(2, '0')).join('');
}

// Email adapters: .eml (MIME) and .msg (Outlook, compound file). The body is context; attachments are returned so
// the dispatcher can read them too (and ask which one is the MOP when there is more than one candidate).
// HTML bodies are reduced to text here; nothing is ever put into the page as HTML.
import { readCfb } from '../cfb.js';
import { newDoc, addBlock } from '../docmodel.js';

const td = (enc, b) => { try { return new TextDecoder(enc || 'utf-8').decode(b); } catch { return new TextDecoder('utf-8').decode(b); } };
const latin1 = s => Uint8Array.from(s, c => c.charCodeAt(0) & 0xff);

export function htmlToText(h) {
  return String(h).replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d|table)>/gi, '\n').replace(/<\/t[dh]>/gi, '\t')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
}
function decodeWords(s) { // RFC 2047 encoded words in headers
  return String(s || '').replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (m, cs, enc, txt) => {
    try { const bytes = /b/i.test(enc) ? Uint8Array.from(atob(txt), c => c.charCodeAt(0)) : latin1(txt.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (x, h) => String.fromCharCode(parseInt(h, 16)))); return td(cs, bytes); } catch { return m; }
  });
}
function parseHeaders(text) {
  const h = {}; const lines = text.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/);
  for (const l of lines) { const i = l.indexOf(':'); if (i > 0) { const k = l.slice(0, i).trim().toLowerCase(); if (!(k in h)) h[k] = l.slice(i + 1).trim(); } }
  return h;
}
const param = (v, name) => { const m = new RegExp(`${name}\\*?=\\s*(?:"([^"]*)"|([^;\\s]*))`, 'i').exec(v || ''); return m ? decodeWords(m[1] ?? m[2]) : ''; };
function decodeBody(raw, cte) {
  const e = String(cte || '').toLowerCase();
  if (e === 'base64') { const clean = raw.replace(/[^A-Za-z0-9+/=]/g, ''); try { return Uint8Array.from(atob(clean), c => c.charCodeAt(0)); } catch { return new Uint8Array(0); } }
  if (e === 'quoted-printable') return latin1(raw.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16))));
  return latin1(raw);
}
/** Walk a MIME entity (as a latin1 string so bytes survive). */
function walkMime(raw, out, depth = 0) {
  if (depth > 8) return;
  const sep = /\r?\n\r?\n/.exec(raw); const headText = sep ? raw.slice(0, sep.index) : raw, body = sep ? raw.slice(sep.index + sep[0].length) : '';
  const h = parseHeaders(headText), ct = h['content-type'] || 'text/plain', type = ct.split(';')[0].trim().toLowerCase();
  if (type.startsWith('multipart/')) {
    const b = param(ct, 'boundary'); if (!b) return;
    const parts = body.split(new RegExp(`\\r?\\n?--${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?[ \\t]*\\r?\\n?`));
    parts.slice(1).forEach(p => { if (p.trim() && p.trim() !== '--') walkMime(p, out, depth + 1); });
    return out;
  }
  const disp = h['content-disposition'] || '', name = param(disp, 'filename') || param(ct, 'name');
  const bytes = decodeBody(body, h['content-transfer-encoding']);
  if (type === 'message/rfc822') { walkMime(td('latin1', bytes), out, depth + 1); return out; }
  if (name || /^attachment/i.test(disp) || !/^text\//.test(type)) { if (bytes.length) out.attachments.push({ name: name || `attachment-${out.attachments.length + 1}`, bytes, type }); return out; }
  const text = td(param(ct, 'charset') || 'utf-8', bytes);
  if (type === 'text/html') out.html.push(htmlToText(text)); else out.text.push(text);
  return out;
}

export function emlToDoc(bytes) {
  const raw = td('latin1', bytes), d = newDoc('eml');
  const sep = /\r?\n\r?\n/.exec(raw), h = parseHeaders(sep ? raw.slice(0, sep.index) : raw);
  const out = walkMime(raw, { text: [], html: [], attachments: [] }) || { text: [], html: [], attachments: [] };
  const subject = decodeWords(h.subject || ''), from = decodeWords(h.from || '');
  if (subject) addBlock(d, 1, `Subject: ${subject}`, 'heading', { part: 'email' });
  if (from) addBlock(d, 1, `From: ${from}`, 'note', { part: 'email' });
  if (h.date) addBlock(d, 1, `Date: ${h.date}`, 'note', { part: 'email' });
  (out.text.length ? out.text : out.html).join('\n').split(/\r?\n/).forEach(l => addBlock(d, 1, l, 'line', { part: 'email' }));
  if (!d.pages.length) d.pages.push({ n: 1, hasText: false });
  return { doc: d, attachments: out.attachments, subject };
}

// ---------- Outlook .msg ----------
const PROP = p => `__substg1.0_${p}`;
function msgString(c, prefix, id) {
  const u = c.read(prefix + PROP(id + '001F')); if (u) return new TextDecoder('utf-16le').decode(u).replace(/\0+$/, '');
  const a = c.read(prefix + PROP(id + '001E')); if (a) return new TextDecoder('windows-1252').decode(a).replace(/\0+$/, '');
  return '';
}
export function msgToDoc(bytes) {
  const c = readCfb(bytes), d = newDoc('msg');
  const subject = msgString(c, '', '0037'), from = msgString(c, '', '0C1A') || msgString(c, '', '0065');
  let body = msgString(c, '', '1000');
  if (!body) { const html = c.read(PROP('10130102')); if (html) body = htmlToText(new TextDecoder('utf-8').decode(html)); }
  if (subject) addBlock(d, 1, `Subject: ${subject}`, 'heading', { part: 'email' });
  if (from) addBlock(d, 1, `From: ${from}`, 'note', { part: 'email' });
  body.split(/\r?\n/).forEach(l => addBlock(d, 1, l, 'line', { part: 'email' }));
  const attachments = [];
  const storages = new Set(c.list().filter(p => /^__attach_version1\.0_#[0-9A-F]{8}\//i.test(p)).map(p => p.split('/')[0]));
  for (const s of storages) {
    const data = c.read(`${s}/${PROP('37010102')}`); if (!data || !data.length) continue;
    const name = msgString(c, s + '/', '3707') || msgString(c, s + '/', '3704') || `attachment-${attachments.length + 1}`;
    attachments.push({ name, bytes: data, type: msgString(c, s + '/', '370E') || '' });
  }
  if (!d.pages.length) d.pages.push({ n: 1, hasText: false });
  return { doc: d, attachments, subject };
}

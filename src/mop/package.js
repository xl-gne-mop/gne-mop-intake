// MOP .docx package parts beyond word/document.xml (GNE MOP Template v2, round 3 – JK 11/26/26):
//  - page count for viewers that don't calculate fields (footer cache + docProps/app.xml)
//  - running header on pages 2+ ("MOP #001 rev 0 – Title    Execute Date: …")
//  - hidden copy of the MOP data (customXml/item2.xml, JK #8 option A) with per-section fingerprints
//  - planned start / end / total duration from the during-MOP steps
// Pure functions: dom = { DOMParser, XMLSerializer } (window.* in the app, @xmldom/xmldom in tests).
// Every part is optional: a round-2 template (no header part, no data part, NUMPAGES footer) still works.

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const kids = (el, name) => { const r = []; for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && n.namespaceURI === W && n.localName === name) r.push(n); return r; };
const all = (el, ns, name) => Array.from(el.getElementsByTagNameNS(ns, name));
const p2 = n => String(n).padStart(2, '0');
const pad3 = n => String(n).padStart(3, '0');
const fLong = d => (d ? `${p2(d.getMonth() + 1)}/${p2(d.getDate())}/${d.getFullYear()}` : '');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

/** Which optional template parts a .docx has (keys = zip paths). */
export function templateParts(names) {
  const has = n => names.includes(n);
  return { header: has('word/header1.xml'), logHeader: has('word/header3.xml'), firstFooter: has('word/footer2.xml'), record: has('customXml/item2.xml') };
}

// ---------- page count ----------
// Word, LibreOffice and Google Docs recalculate "Page X of Y" themselves. Drive / phone previews and some PDF
// converters show the number saved in the file, so the app saves its estimate there. Calibrated against
// LibreOffice renders of template v2 (tests/template-v2/pages.test.mjs: 22 MOPs of 4–8 pages, all exact).
export const PAGE_EST = { charTw: 100, lineTw: 220, usableTw: 15200, cellPadTw: 216, gapTw: 40 };

/** Estimated pages of the MOP section (the change log after the section break is not counted). */
export function estimatePages(xml, dom) {
  const d = new dom.DOMParser().parseFromString(xml, 'application/xml');
  const body = all(d, W, 'body')[0];
  const sect = kids(body, 'sectPr')[0];
  const pg = sect && kids(sect, 'pgSz')[0], mar = sect && kids(sect, 'pgMar')[0];
  const num = (el, a, dflt) => (el && el.getAttributeNS(W, a) ? +el.getAttributeNS(W, a) : dflt);
  const usable = PAGE_EST.usableTw + (num(pg, 'h', 15840) - 15840) - (num(mar, 'top', 360) - 360) - (num(mar, 'bottom', 360) - 360);
  const sizeOf = p => { const s = all(p, W, 'sz').map(e => +e.getAttributeNS(W, 'val')).filter(v => v > 4); return s.length ? Math.max(...s) / 20 : 1; };
  const paraH = (p, widthTw) => {
    const ppr = kids(p, 'pPr')[0], sp = ppr && kids(ppr, 'spacing')[0];
    if (sp && sp.getAttributeNS(W, 'lineRule') === 'exact') return +sp.getAttributeNS(W, 'line') + num(sp, 'before', 0) + num(sp, 'after', 0);
    const gap = (sp ? num(sp, 'before', 0) + num(sp, 'after', 0) : 160) * (PAGE_EST.gapTw / 80);
    let h = 0;
    all(p, W, 'drawing').forEach(dr => { const ex = all(dr, WP, 'extent')[0]; if (ex) h += +ex.getAttribute('cy') / 635; });
    const k = sizeOf(p), segs = [''];
    for (const r of all(p, W, 'r')) for (let n = r.firstChild; n; n = n.nextSibling) {
      if (n.nodeType !== 1) continue;
      if (n.localName === 't') segs[segs.length - 1] += n.textContent || '';
      if (n.localName === 'br' && n.getAttributeNS(W, 'type') !== 'page') segs.push('');
    }
    const perLine = Math.max(1, Math.floor((widthTw - PAGE_EST.cellPadTw) / (PAGE_EST.charTw * k)));
    return h + segs.reduce((a, s) => a + Math.max(1, Math.ceil(s.length / perLine)), 0) * PAGE_EST.lineTw * k + gap;
  };
  let pages = 1, used = 0, repeat = 0;
  const place = h => { if (used + h > usable && used > 0) { pages++; used = repeat; } used += Math.min(h, usable); };
  const breaks = p => all(p, W, 'br').filter(b => b.getAttributeNS(W, 'type') === 'page').length;
  for (let n = body.firstChild; n; n = n.nextSibling) {
    if (n.nodeType !== 1) continue;
    if (n.localName === 'p') {
      for (let i = 0; i < breaks(n); i++) { pages++; used = 0; }
      place(paraH(n, 11520));
      const ppr = kids(n, 'pPr')[0];
      if (ppr && kids(ppr, 'sectPr').length) break;
    } else if (n.localName === 'tbl') {
      repeat = 0; let heading = true;
      for (const tr of kids(n, 'tr')) {
        const trPr = kids(tr, 'trPr')[0], th = trPr && kids(trPr, 'trHeight')[0];
        let h = th ? +th.getAttributeNS(W, 'val') : 0;
        for (const tc of kids(tr, 'tc')) {
          const tcW = all(tc, W, 'tcW')[0], w = tcW ? +tcW.getAttributeNS(W, 'w') : 2000;
          h = Math.max(h, kids(tc, 'p').reduce((a, p) => a + paraH(p, w), 0));
        }
        place(h);
        if (heading && trPr && kids(trPr, 'tblHeader').length) repeat += h; else heading = false;
      }
      repeat = 0;
    }
  }
  return pages;
}

/** Save the page count in a footer's SECTIONPAGES / NUMPAGES cached result. */
export function footerWithPages(footerXml, n) {
  return String(footerXml || '').replace(/((?:SECTIONPAGES|NUMPAGES)[^<]*<\/w:instrText><\/w:r>(?:<w:r>(?:<w:rPr>.*?<\/w:rPr>)?<w:fldChar w:fldCharType="separate"\/><\/w:r>)<w:r>(?:<w:rPr>.*?<\/w:rPr>)?<w:t>)\d+(<\/w:t>)/, `$1${n}$2`);
}
/** docProps/app.xml <Pages>: every page in the file (the MOP plus the change log page when the template has one). */
export function appWithPages(appXml, total) {
  const s = String(appXml || '');
  return /<Pages>\d*<\/Pages>/.test(s) ? s.replace(/<Pages>\d*<\/Pages>/, `<Pages>${total}</Pages>`) : s.replace('</Properties>', `<Pages>${total}</Pages></Properties>`);
}

// ---------- running header ----------
export function headerWithMop(xml, { mopNo, rev, title, start }) {
  let s = String(xml || '');
  const set = (from, to) => { s = s.replace(`>${from}</w:t>`, `>${esc(to)}</w:t>`); };
  set('000 rev 0', `${pad3(mopNo)} rev ${rev}`);
  set('MOP Title', String(title || '').trim());
  set('MM/DD/YYYY', fLong(start));
  return s;
}

// ---------- planned start / end ----------
/** Minutes from a duration text: "30 mins", "1.5 h", "1 hr 30 min", "90m", "2 hours". null if unreadable. */
export function durMinutes(t) {
  t = String(t || '').toLowerCase();
  let m = 0, hit = false;
  const h = /(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/.exec(t); if (h) { m += parseFloat(h[1]) * 60; hit = true; }
  const mi = /(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\b/.exec(t); if (mi) { m += parseFloat(mi[1]); hit = true; }
  const d = /(\d+(?:\.\d+)?)\s*(?:d|day|days)\b/.exec(t); if (d && !/prior|before|after/.test(t)) { m += parseFloat(d[1]) * 1440; hit = true; }
  return hit ? m : null;
}
const fTime = d => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
const fDur = m => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${Math.round(m % 60)} min` : ''}` : `${Math.round(m)} min`);
/** start = MOP start; end = start + the during-MOP step durations (falls back to the request duration). */
export function plannedWindow(rec, steps, start) {
  const mins = steps.map(s => durMinutes(s.dur));
  let total = mins.length && mins.every(v => v !== null) ? mins.reduce((a, b) => a + b, 0) : null;
  if (total === null && +rec.durVal > 0) total = (+rec.durVal) * (/week/i.test(rec.durUnit) ? 10080 : /day/i.test(rec.durUnit) ? 1440 : /min/i.test(rec.durUnit) ? 1 : 60);
  if (!start) return { start: '', end: '', total: total ? fDur(total) : '' };
  const end = total ? new Date(start.getTime() + total * 60000) : null;
  const sameDay = end && end.toDateString() === start.toDateString();
  return { start: `${fLong(start)} ${fTime(start)}`, end: end ? (sameDay ? fTime(end) : `${fLong(end)} ${fTime(end)}`) : '', total: total ? fDur(total) : '' };
}

// ---------- hidden copy of the MOP data (JK #8 option A) ----------
export const RECORD_NS = 'urn:xlconstruction:gne-mop:record:1';
export const RECORD_PART = 'customXml/item2.xml';
const fnv = str => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
// whitespace removed: Word / LibreOffice re-saves split, merge or re-space text runs without changing the words
const norm = t => t.replace(/\s+/g, '');
const firstLabel = t => { const r = kids(t, 'tr')[0]; return r ? all(r, W, 't').map(e => e.textContent || '').join('').replace(/\s+/g, ' ').trim().slice(0, 40) : ''; };
/** Fingerprint of the visible text: whole document and one per body table (section). */
export function fingerprints(documentXml, dom) {
  const d = new dom.DOMParser().parseFromString(documentXml, 'application/xml');
  const body = all(d, W, 'body')[0];
  return {
    all: fnv(norm(all(body, W, 't').map(e => e.textContent || '').join(''))),
    sections: kids(body, 'tbl').map(t => ({ label: firstLabel(t), hash: fnv(norm(all(t, W, 't').map(e => e.textContent || '').join(''))) }))
  };
}
/** customXml/item2.xml for a filled MOP. data = anything JSON (the app passes the record and the MOP's ids). */
export function recordXml(documentXml, data, dom, now = new Date()) {
  const payload = { schema: 1, generated: now.toISOString(), ...data, fingerprint: fingerprints(documentXml, dom) };
  const json = JSON.stringify(payload).replace(/]]>/g, ']]]]><![CDATA[>');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><mopRecord xmlns="${RECORD_NS}" schema="1" status="filled"><![CDATA[${json}]]></mopRecord>`;
}
/**
 * Read the hidden copy back. parts = { zipPath: xmlString } holding word/document.xml and every customXml/item*.xml.
 * → { found:false } (v1 MOPs, other companies' files, files converted to Google Docs)
 * → { found:true, data, edited, changedSections:[labels] }
 */
export function readEmbeddedRecord(parts, dom) {
  const key = Object.keys(parts).find(k => /^customXml\/item\d+\.xml$/.test(k) && String(parts[k]).includes(RECORD_NS) && String(parts[k]).includes('status="filled"'));
  if (!key || !parts['word/document.xml']) return { found: false };
  let data;
  try { data = JSON.parse(new dom.DOMParser().parseFromString(parts[key], 'application/xml').documentElement.textContent); } catch { return { found: false }; }
  const now = fingerprints(parts['word/document.xml'], dom), was = data.fingerprint || { all: '', sections: [] };
  const changed = now.sections.filter((s, i) => !was.sections[i] || was.sections[i].hash !== s.hash).map(s => s.label);
  if (now.sections.length !== was.sections.length) changed.push('(sections added or removed)');
  return { found: true, data, edited: now.all !== was.all, changedSections: changed };
}

// Import a MOP this app made (Template v2 round 3, JK #8 option A, 11/26/26): the .docx carries a hidden copy of
// the record (customXml/item2.xml, src/mop/package.js) with fingerprints of each section's visible text.
//  - unedited → the saved record exactly
//  - edited by hand → the saved record, with the edited sections read from the page (the label reader's values)
//  - no saved data (v1 MOPs, other companies, files converted to Google Docs) → found:false, label reading as before
// Pure: the caller passes the unzipped parts (zip path → string) and the label reader's record.
import { readEmbeddedRecord } from '../mop/package.js';

/** Which record fields each section (body table, by its first-row label) prints. Not printed anywhere = always from the data. */
const SECTION_FIELDS = [
  [/^Priority/, ['title', 'subMop', 'subShort', 'bldg', 'areas', 'scope', 'origin', 'priority', 'sys', 'x.util', 'x.gmpNotes', 'x.qa']],
  [/^2\. Impact Description/, ['impacts', 'subs', 'safety', 'tools', 'crew', 'attSep']],
  [/^7\. Detailed/, ['pre', 'sup.walk', 'loto.safeOff', 'x.isoBy', 'x.isoBy2', 'x.permits', 'jllRef']],
  [/^8\. (Cont\. )?Detailed/, ['steps']],
  [/^9\. Go \/ No-Go/, ['gonogo', 'backout']],
  [/^11\. Detailed/, ['x.rts']],
  [/^Close-out Verification/, ['author', 'workers']],
  [/^14\. Cont\./, ['workers']],
  [/^MOP Change Log/, []]
];
const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const set = (o, path, v) => { const ks = path.split('.'), last = ks.pop(); const t = ks.reduce((a, k) => (a[k] = a[k] && typeof a[k] === 'object' ? a[k] : {}), o); t[last] = v; };
const copy = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

/**
 * parts: { 'word/document.xml', 'customXml/item*.xml' … } as strings; labelRec: what the label reader got (or null).
 * → { found:false } | { found:true, rec, mopNo, edited, changedSections, info:[], warn:[] }
 */
export function importEmbedded(parts, labelRec, dom) {
  const e = readEmbeddedRecord(parts, dom);
  if (!e.found || !e.data || !e.data.record) return { found: false };
  const rec = copy(e.data.record), warn = [], info = ['Read from the data the app saved inside this MOP.'];
  if (e.edited) {
    const unknown = [];
    for (const label of e.changedSections) {
      const hit = SECTION_FIELDS.find(([re]) => re.test(label));
      if (!hit) { unknown.push(label); continue; }
      if (labelRec) for (const f of hit[1]) set(rec, f, copy(get(labelRec, f)));
    }
    if (unknown.length && labelRec) return { found: true, rec: labelRec, mopNo: mopNoOf(e.data), edited: true, changedSections: e.changedSections, info: [], warn: ['Edited after the app made it – the whole MOP was read from the page.'] };
    warn.push(`Edited after the app made it – these parts were read from the page: ${e.changedSections.join('; ')}.`);
  }
  return { found: true, rec, mopNo: mopNoOf(e.data), edited: e.edited, changedSections: e.changedSections, info, warn };
}
const mopNoOf = d => (d.mopNo ? `${String(d.mopNo).padStart(3, '0')} rev ${d.rev || 0}` : '');

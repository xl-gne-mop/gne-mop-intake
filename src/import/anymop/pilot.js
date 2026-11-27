// Pilot measurement for Import Any MOP (Tier A plan §2 U6, decision #15: wrong-and-accepted < 1 %).
// "Wrong and accepted" = a value the user accepted from the file (Use / Fix) that the XL PM later changed.
import { recordValue } from './apply.js';
import { isSafety } from './fields.js';

const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const norm = v => JSON.stringify(v, (k, x) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().toLowerCase() : k === 'att' || k === 'confirmed' || k === 'src' ? undefined : x));

/** For one request (with importAudit and its record after PM review): accepted fields and the ones changed since. */
export function wrongAndAccepted(q) {
  const a = q && q.importAudit; if (!a || !a.fields) return null;
  const rec = (q.sub || q).record, out = { accepted: 0, changed: [], layout: a.extractor && a.extractor.layout, ocr: !!(a.extractor && a.extractor.ocr), reviewMs: a.review && a.review.ms || null, device: a.review && a.review.device || '' };
  for (const [id, f] of Object.entries(a.fields)) {
    if (!['use', 'fix'].includes(f.decision)) continue;
    const accepted = f.decision === 'fix' ? f.final : f.suggested; out.accepted++;
    for (const [p, v] of Object.entries(recordValue(id, accepted))) {
      if (p === 'sys.elec.items') continue;
      const now = get(rec, p);
      if (p === 'steps' || p === 'impacts' || p === 'loto.points' || p === 'workers') { const want = (v || []).map(x => norm(x)), have = new Set((now || []).map(x => norm(x))); if (want.some(x => !have.has(x))) out.changed.push({ id, path: p, safety: isSafety(id) }); continue; }
      if (norm(now) !== norm(v)) out.changed.push({ id, path: p, safety: isSafety(id) });
    }
  }
  out.changed = out.changed.filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i);
  return out;
}

/** Aggregate over imported requests that the XL PM has reviewed (stage ≥ 6 by default). */
export function pilotSummary(requests, { minStage = 6 } = {}) {
  const rows = requests.filter(q => q && q.importAudit && (q.stage || 0) >= minStage).map(q => ({ q, w: wrongAndAccepted(q) })).filter(x => x.w);
  const accepted = rows.reduce((n, x) => n + x.w.accepted, 0), wrong = rows.reduce((n, x) => n + x.w.changed.length, 0), safetyWrong = rows.flatMap(x => x.w.changed.filter(c => c.safety).map(c => ({ ...c, mop: x.q.mopNo, id: x.q.id })));
  const byLayout = {}; for (const { w } of rows) { const k = (w.layout || 'generic') + (w.ocr ? ' + scan' : ''); const b = byLayout[k] = byLayout[k] || { mops: 0, accepted: 0, wrong: 0 }; b.mops++; b.accepted += w.accepted; b.wrong += w.changed.length; }
  const times = rows.map(x => x.w.reviewMs).filter(Boolean).sort((a, b) => a - b);
  const rate = accepted ? wrong / accepted : 0;
  return { mops: rows.length, accepted, wrong, rate, safetyWrong, byLayout, medianReviewMin: times.length ? Math.round(times[Math.floor(times.length / 2)] / 6000) / 10 : null,
    flags: [...(rate > 0.02 ? [`Wrong-and-accepted ${Math.round(rate * 1000) / 10} % is above 2 %`] : []), ...(safetyWrong.length ? [`${safetyWrong.length} safety-critical value(s) accepted from a file and later changed by the PM`] : [])],
    rows: rows.map(({ q, w }) => ({ mop: q.mopNo, id: q.id, file: q.importAudit.file && q.importAudit.file.name, layout: w.layout, ocr: w.ocr, accepted: w.accepted, changed: w.changed.map(c => c.id), reviewMs: w.reviewMs, device: w.device })) };
}

const OCR_KEY = 'mop-ocr-inflight', RELOAD_KEY = 'mop-ocr-reloads';
/** Call before the scan reader starts / after it ends; a reload in between is counted on the next start. */
export function ocrStarted() { try { localStorage.setItem(OCR_KEY, JSON.stringify({ at: Date.now(), device: deviceName() })); } catch { /* storage off */ } }
export function ocrEnded() { try { localStorage.removeItem(OCR_KEY); } catch { /* storage off */ } }
export function countOcrReloads() { try { const v = localStorage.getItem(OCR_KEY); if (!v) return readReloads(); const d = JSON.parse(v).device || 'unknown'; const r = readReloads(); r[d] = (r[d] || 0) + 1; localStorage.setItem(RELOAD_KEY, JSON.stringify(r)); localStorage.removeItem(OCR_KEY); return r; } catch { return {}; } }
export function readReloads() { try { return JSON.parse(localStorage.getItem(RELOAD_KEY) || '{}'); } catch { return {}; } }
export function deviceName() {
  const ua = (globalThis.navigator && navigator.userAgent) || '';
  const ios = /iPhone OS (\d+)_/.exec(ua), and = /Android (\d+)[^;]*; ([^;)]+)/.exec(ua);
  return ios ? `iPhone iOS ${ios[1]}` : and ? `Android ${and[1]} ${and[2].trim()}` : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'other';
}

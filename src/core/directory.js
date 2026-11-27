// Type-ahead suggestions for the intake form (11/27/26). Everything comes from what is already on the phone:
// lists.json (people directory, trade contacts, project contacts / approvers, company names) and the saved
// requests. Nothing is sent anywhere. Pure functions so they can be unit tested.
//
// Two kinds of suggestion:
//   1. Field history: any single-line field suggests the values used before in the same field
//      (workers.3.company and workers.0.company count as one field).
//   2. People: Name / Title / Company / Phone / Email fields of one person (the requester, a worker, a
//      subcontractor contact) know about each other. A company that is filled narrows the names to people of
//      that company; tapping a name fills that person's title, company, phone (and email for the requester).

const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const low = s => norm(s).toLowerCase();
const digits = s => String(s ?? '').replace(/\D/g, '');

/** Fields that never get suggestions (numbers that are unique to one request). */
export const NO_SUGGEST = /^(jllRef\.|subMop$|x\.rv\.(permitNo|peNo|qeNo|dnNo)$)/;
/** Single-name fields (a person's name with no title / company next to it). */
const NAME_ONLY = new Set(['author', 'loto.safeOff', 'x.isoBy', 'x.isoBy2']);
const MAX_LEN = 120;

/** workers.3.company -> workers.*.company */
export const fieldKey = path => String(path || '').replace(/\.\d+(?=\.|$)/g, '.*');

/** The person group a field belongs to: { base, field, fields } or null. */
export function groupOf(path) {
  const p = String(path || '');
  if (NAME_ONLY.has(p)) return { base: null, field: 'name', fields: [] };
  let m = /^req\.(name|company|phone|email)$/.exec(p);
  if (m) return { base: 'req', field: m[1], fields: ['name', 'company', 'phone', 'email'] };
  m = /^(workers\.\d+)\.(name|title|company)$/.exec(p);
  if (m) return { base: m[1], field: m[2], fields: ['name', 'title', 'company'] };
  m = /^(subs\.\d+)\.(name|title|company|phone)$/.exec(p);
  if (m) return { base: m[1], field: m[2], fields: ['name', 'title', 'company', 'phone'] };
  return null;
}

const get = (o, p) => String(p).split('.').reduce((a, k) => (a == null ? a : a[k]), o);

/** Each saved request's record (newest first), skipping the one being edited. */
function recordsOf(reqs, skipId) {
  return Object.values(reqs || {}).filter(q => q && q.id !== skipId)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .flatMap(q => [q.record, q.sub && q.sub.record].filter(Boolean));
}

/** Every leaf string of a record, keyed by fieldKey (arrays of objects only; textareas are skipped by the UI). */
function walk(o, path, out) {
  if (o == null) return;
  if (typeof o === 'string') { const v = norm(o); if (v && v.length <= MAX_LEN && !/\n/.test(o)) (out[fieldKey(path)] ||= []).push(v); return; }
  if (Array.isArray(o)) { o.forEach((x, i) => walk(x, path ? `${path}.${i}` : String(i), out)); return; }
  if (typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, path ? `${path}.${k}` : k, out);
}

/**
 * Build the suggestion source.
 * @param {object} a
 * @param {object} a.reqs      S.reqs (saved requests)
 * @param {object} a.cfg       cfg() (people, trade, projects, companyNames)
 * @param {string} [a.projectId] the project being edited (its people rank first)
 * @param {string} [a.skipId]  the request being edited (its half-typed values are not history)
 */
export function buildDirectory({ reqs = {}, cfg = {}, projectId = '', skipId = '' } = {}) {
  const people = new Map(); // low(name) -> person
  const add = (p, w, src) => {
    const name = norm(p && p.name); if (!name || name.length > MAX_LEN) return;
    const k = low(name), cur = people.get(k) || { name, title: '', company: '', phone: '', email: '', n: 0, here: false };
    // A later (stronger) source wins for every value it has; blanks never wipe a value.
    for (const f of ['title', 'company', 'phone', 'email']) { const v = norm(p[f]); if (v && (src === 'strong' || !cur[f])) cur[f] = f === 'email' ? v.toLowerCase() : v; }
    cur.n += w; people.set(k, cur);
    return cur;
  };
  const proj = (cfg.projects || []).find(p => p.id === projectId);
  // Weakest first: project roles, trade contacts, saved requests, the people directory (curated) last.
  for (const p of cfg.projects || []) for (const x of [...(p.contacts || []), ...(p.approvers || [])]) { const c = add(x, 1, 'weak'); if (c && p === proj) c.here = true; }
  for (const x of cfg.trade || []) { const c = add(x, 1, 'weak'); if (c && x.project === projectId) c.here = true; }
  const recs = recordsOf(reqs, skipId), hist = {};
  for (const r of recs.slice().reverse()) { // oldest first so the newest values win
    add(r.req, 2, 'strong');
    for (const w of r.workers || []) add(w, 2, 'strong');
    for (const s of r.subs || []) add(s, 2, 'strong');
    for (const k of NAME_ONLY) { const v = get(r, k); if (typeof v === 'string') add({ name: v }, 1, 'weak'); }
  }
  for (const r of recs) walk(r, '', hist);
  for (const x of cfg.people || []) { const c = add(x, 3, 'strong'); if (c && String(x.projects || '').split(/[,;\s]+/).includes(projectId)) c.here = true; }

  // Company names: the bold-in-steps list, every company seen on a person, the default role companies.
  const companies = new Map();
  const addCo = (c, w) => { const v = norm(c); if (!v || v.length > 60) return; const k = low(v); const cur = companies.get(k) || { v, n: 0 }; cur.n += w; companies.set(k, cur); };
  for (const c of cfg.companyNames || []) addCo(c, 1);
  for (const p of people.values()) addCo(p.company, p.n);
  for (const c of ['XL Construction', 'Genentech']) addCo(c, 1);

  const counts = {};
  for (const [k, vs] of Object.entries(hist)) { const m = new Map(); vs.forEach((v, i) => { const e = m.get(low(v)) || { v, n: 0, last: i }; e.n++; m.set(low(v), e); }); counts[k] = [...m.values()]; }
  return { people: [...people.values()], companies: [...companies.values()], hist: counts };
}

/** 2 = whole value starts with q, 1 = a word starts with q, 0 = no match. Phones match on digits. */
function score(v, q, phone) {
  if (!q) return 1;
  if (phone) { const d = digits(q); return d && digits(v).includes(d) ? (digits(v).startsWith(d) ? 2 : 1) : 0; }
  const s = low(v), t = low(q);
  if (s.startsWith(t)) return 2;
  return s.split(/[\s\-/(.,&]+/).some(w => w.startsWith(t)) ? 1 : 0;
}
const rank = (list, q, phone, key = x => x.v, boost = () => 0) => list
  .map(x => ({ x, s: score(key(x), q, phone) })).filter(o => o.s > 0)
  .sort((a, b) => b.s - a.s || boost(b.x) - boost(a.x) || (b.x.n || 0) - (a.x.n || 0) || key(a.x).localeCompare(key(b.x)))
  .map(o => o.x);

/**
 * Suggestions for one field.
 * @param {object} dir   buildDirectory() result
 * @param {string} path  the field's data-k path
 * @param {string} q     what is typed
 * @param {object} rec   the record being edited (to read the other fields of the same person)
 * @returns {Array<{ label: string, sub?: string, value: string, fill?: object }>} at most `max`;
 *          fill = { field: value } for the person's other fields (paths relative to the group).
 */
export function suggest(dir, path, q, rec, max = 5) {
  if (!dir || NO_SUGGEST.test(path)) return [];
  const query = norm(q), g = groupOf(path), out = [], seen = new Set();
  const push = s => { const k = low(s.value); if (!s.value || seen.has(k) || k === low(query) && !s.fill) return; seen.add(k); out.push(s); };
  const other = f => (g && g.base ? norm(get(rec, `${g.base}.${f}`)) : '');
  const person = n => dir.people.find(p => low(p.name) === low(n)) || null;

  if (g && g.field === 'name') {
    const co = other('company'), byCo = co ? dir.people.filter(p => low(p.company) === low(co)) : [];
    const pool = co && rank(byCo, query, false, p => p.name).length ? byCo : dir.people;
    for (const p of rank(pool, query, false, p => p.name, p => (p.here ? 1 : 0))) {
      const fill = {};
      for (const f of g.fields) if (f !== 'name' && p[f]) fill[f] = p[f];
      push({ label: p.name, sub: [p.title, p.company].filter(Boolean).join(' · '), value: p.name, fill: g.fields.length ? fill : undefined });
    }
  } else if (g && g.field === 'company') {
    const p = person(other('name'));
    if (p && p.company && score(p.company, query)) push({ label: p.company, sub: 'Works for', value: p.company });
    for (const c of rank(dir.companies, query)) push({ label: c.v, value: c.v });
  } else if (g && (g.field === 'title' || g.field === 'phone' || g.field === 'email')) {
    const f = g.field, p = person(other('name')), co = other('company'), phone = f === 'phone';
    if (p && p[f] && score(p[f], query, phone)) push({ label: p[f], sub: p.name, value: p[f] });
    const pool = dir.people.filter(x => x[f]), byCo = co ? pool.filter(x => low(x.company) === low(co)) : [];
    const vals = new Map();
    for (const x of byCo.length && f === 'title' ? byCo : pool) { const e = vals.get(low(x[f])) || { v: x[f], n: 0, who: x.name }; e.n += x.n; vals.set(low(x[f]), e); }
    for (const e of rank([...vals.values()], query, phone)) push({ label: e.v, sub: f === 'title' ? '' : e.who, value: e.v });
  }
  // Field history (person fields already hold everything typed before, so they skip it).
  if (!g) for (const h of rank(dir.hist[fieldKey(path)] || [], query, /phone$/.test(path), x => x.v, x => -x.last)) push({ label: h.v, value: h.v });
  return out.slice(0, max);
}

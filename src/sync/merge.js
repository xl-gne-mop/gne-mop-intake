// Three-way merge per field (PROMPT.md "Conflicts"): compare this phone's value (local), the value at the last
// sync (base) and the value there now (remote).
//   remote == base            -> only this phone changed it (or nobody did): write local
//   local  == base            -> only the other side changed it: keep theirs, write nothing
//   both changed, same value  -> nothing to do
//   both changed, different   -> do NOT write; raise a "Needs editor review" conflict showing both values
const norm = v => (v === undefined || v === null ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v).replace(/\r\n/g, '\n').trim());
export const same = (a, b) => norm(a) === norm(b);

/**
 * fields: list of field names to consider; local/base/remote: objects field -> value (base may be missing on the
 * first sync, then remote counts as base). Returns { write: {field: value}, take: {field: value}, conflicts: [...] }.
 */
export function merge3(fields, local, base, remote, where = '') {
  const out = { write: {}, take: {}, conflicts: [] };
  for (const f of fields) {
    const l = local[f], r = remote ? remote[f] : undefined, b = base ? base[f] : r; // a field missing from a known base was empty
    if (same(r, b)) { if (!same(l, r)) out.write[f] = l; continue; }
    if (same(l, b)) { out.take[f] = r; continue; }
    if (same(l, r)) continue;
    out.conflicts.push({ where, field: f, local: l ?? '', remote: r ?? '', base: b ?? '' });
  }
  return out;
}

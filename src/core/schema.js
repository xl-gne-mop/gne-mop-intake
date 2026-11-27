// Request schema version and the upgrade path for requests saved by older versions of the app.
// v1 (no schemaVersion): the request as it was up to 11/27/26.
// v2: + schemaVersion, + meta.audit (append-only log of every saved change; history stays the last 80 lines).
// Upgrades run in memory when a request is read (normReq); the saved copy changes only with the next real save,
// so an older app build reading the same IndexedDB still works (it ignores the new fields).
export const REQUEST_SCHEMA = 2;

export function upgradeRequest(q) {
  if (!q || typeof q !== 'object') return q;
  const v = Number(q.schemaVersion) || 1;
  if (v < 2) {
    q.meta = q.meta || {};
    // seed the audit from the history this request still has (older lines past 80 were already dropped)
    if (!Array.isArray(q.meta.audit)) q.meta.audit = (q.history || []).filter(h => h && h.what).map((h, i) => ({ id: `h${i}-${h.at}`, at: h.at, by: h.by || '', what: h.what, from: 'history' }));
  }
  if (q.meta && !Array.isArray(q.meta.audit)) q.meta.audit = [];
  q.schemaVersion = Math.max(v, REQUEST_SCHEMA); // a newer version (another phone with a newer app) is never lowered
  return q;
}

/** Both phones' audit lines, each once (by id), oldest first. Audit lines are never edited or removed. */
export function unionAudit(a = [], b = []) {
  const by = new Map();
  for (const e of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) if (e && e.id && !by.has(e.id)) by.set(e.id, e);
  return [...by.values()].sort((x, y) => String(x.at || '').localeCompare(String(y.at || '')) || String(x.id).localeCompare(String(y.id)));
}

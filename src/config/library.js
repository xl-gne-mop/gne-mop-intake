// library-v2.json work types -> the entries the Rebuild 4 match/fill code reads (kind 'std').
// Only Active types are offered at intake; drafts never are (Rebuild 5 rule).
export function libraryEntries(lib, { includeInactive = false } = {}) {
  const w = (lib && lib.workTypes) || [];
  return w.filter(e => includeInactive || !e.status || e.status === 'Active').map(e => ({ ...e }));
}

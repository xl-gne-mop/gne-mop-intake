// Build the next library-v2.json when an editor publishes a work type (pure, unit-tested).
// - libraryVersion goes up by one; the published work type replaces the old one (or is added);
// - "exported" = today; the old file is kept by phase 6 as library-v<N>-superseded-<MM-DD-YY>.json.
const pad = n => String(n).padStart(2, '0');

export function supersededName(libraryVersion, date = new Date()) {
  return `library-v${libraryVersion}-superseded-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${String(date.getFullYear()).slice(2)}.json`;
}

export function buildPublishedLibrary(current, entry, { by = '', at = new Date().toISOString() } = {}) {
  const cur = current || { schema: 'gne-mop-library', libraryVersion: '1', workTypes: [] };
  const clean = { ...entry }; delete clean.kind; delete clean.gne; delete clean.target; delete clean.bv; delete clean.sugId; delete clean.savedAt;
  const types = cur.workTypes.map(w => (w.id === clean.id ? clean : w));
  if (!types.some(w => w.id === clean.id)) types.push(clean);
  return { ...cur, libraryVersion: String((parseInt(cur.libraryVersion, 10) || 0) + 1), exported: at.slice(0, 10), source: 'MOP Intake app (published by ' + (by || 'an editor') + ')', workTypes: types };
}

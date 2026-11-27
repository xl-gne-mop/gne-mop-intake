// Company names bolded in MOP steps (Template v2, JK 11/26/26: editable).
// lists.json settings.CompanyNames = { value: [names], note }. Editors (lists.json editors, same as the library)
// add / remove / rename on the phone; the change is cached on the phone at once and queued as one outbox op
// ("lists.companies") that sync writes back into lists.json in Drive (only this setting is touched).
// Non-editors suggest a name through the library-suggestion inbox.

export const SEED_COMPANY_NAMES = ['REI', 'Rosendin', 'United', 'Decker', 'Therma', 'Axis', 'Morrow-Meadows', 'WAM', 'ATSM', 'CCT', 'Elevated'];
export const COMPANY_NOTE = 'Company names printed in bold in MOP steps (plus XL, GNE, Genentech, JLL, Siemens and every company on the request). Editors change this list in the app: Settings → Companies.';

const norm = s => String(s || '').replace(/\s+/g, ' ').trim();

/** The list from lists.json settings; the seed list when the setting is missing. */
export function companyNamesFrom(settings) {
  const v = settings && settings.CompanyNames && settings.CompanyNames.value;
  if (Array.isArray(v)) return dedupe(v);
  if (typeof v === 'string' && v.trim()) return dedupe(v.split(/[\n,;]+/));
  return SEED_COMPANY_NAMES.slice();
}
export function dedupe(list) { const seen = new Set(), out = []; for (const n of list.map(norm)) { if (!n || seen.has(n.toLowerCase())) continue; seen.add(n.toLowerCase()); out.push(n); } return out; }

/** add / remove / rename; returns { list, error }. Never changes the input. */
export function editCompanyNames(list, op) {
  const cur = dedupe(list || []), name = norm(op.name), to = norm(op.to);
  const has = n => cur.some(x => x.toLowerCase() === n.toLowerCase());
  if (op.kind === 'add') { if (!name) return { list: cur, error: 'Type a company name.' }; if (name.length > 60) return { list: cur, error: 'Keep it under 60 letters.' }; if (has(name)) return { list: cur, error: `${name} is already on the list.` }; return { list: [...cur, name] }; }
  if (op.kind === 'remove') return { list: cur.filter(x => x.toLowerCase() !== name.toLowerCase()) };
  if (op.kind === 'rename') { if (!to) return { list: cur, error: 'Type the new name.' }; if (to.toLowerCase() !== name.toLowerCase() && has(to)) return { list: cur, error: `${to} is already on the list.` }; return { list: cur.map(x => (x.toLowerCase() === name.toLowerCase() ? to : x)) }; }
  return { list: cur, error: 'Unknown change' };
}

/** lists.json with only settings.CompanyNames replaced (used by sync on the freshest Drive copy). */
export function listsWithCompanies(lists, names) {
  const s = { ...((lists && lists.settings) || {}) };
  s.CompanyNames = { value: dedupe(names), note: (s.CompanyNames && s.CompanyNames.note) || COMPANY_NOTE };
  return { ...lists, settings: s };
}

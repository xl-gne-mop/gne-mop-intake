// lists.json -> the project and settings shapes the Rebuild 4 code uses (cfg().projects, cfg().rules ...).
// Contacts / approvers: one person per line, "Name | Title | Company | Phone" (approvers without phone),
// in template order. Anything else ("TO FILL", blank) gives the Rebuild 4 default role rows with blank names.

export const CONTACT_ROLES = [['Sr. Principal Project Manager', 'Genentech'], ['Campus Manager', 'Genentech'], ['User Team Lead', 'Genentech'], ['Lab Manager', 'Genentech'], ['Sr. Project Manager', 'XL Construction'], ['Superintendent', 'XL Construction'], ['MEP Coordinator', 'XL Construction'], ['Foreman (Person-in-Charge)', 'XL Construction']];
export const APPROVER_ROLES = [['Sr. Project Manager', 'Genentech'], ['Campus Manager', 'Genentech'], ['JLL', 'Genentech'], ['User Team Lead', 'Genentech'], ['Lab Manager', 'Genentech'], ['MEP Coordinator', 'XL Construction']];
// Rebuild 4 DEFCFG (r4:168-169): values lists.json doesn't carry (JK decision D8).
export const DEFAULT_TRK = { E2: 'Project Name: GNE Alliance (4825)\nProject ID: \nProject Manager: \nSME 1: \nSME 2: \nSME 3: ', L2: 'Campus: Lower\nPlant Manager: \nSPOC: \nJLL Chief: ', P2: 'EOR: \nAOR: \nGC: XLC\nOther Vendors:', T2: 'User Team Lead (UTL): \nLab Manager: ' };

function people(cell, roles, fields) {
  const lines = String(cell ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const parsed = lines.filter(l => l.includes('|')).map(l => l.split('|').map(s => s.trim()));
  if (!parsed.length) return roles.map(([title, company]) => Object.fromEntries(fields.map(f => [f, f === 'title' ? title : f === 'company' ? company : ''])));
  const out = parsed.slice(0, roles.length).map(p => Object.fromEntries(fields.map((f, i) => [f, p[i] || ''])));
  while (out.length < roles.length) { const [title, company] = roles[out.length]; out.push(Object.fromEntries(fields.map(f => [f, f === 'title' ? title : f === 'company' ? company : '']))); }
  return out;
}

export function projectFromRow(r) {
  const next = parseInt(r.NextMOPNumber, 10);
  return {
    id: String(r.ProjectID || '').trim(), label: String(r.Label || '').trim(), job: String(r.Label || '').trim(),
    jll: r.JLLProjectName || '', cora: r.CORA || '', bldg: r.Building || '', loc: r.JobLocation || '', next: next > 0 ? next : 1,
    contacts: people(r['Contacts (8)'], CONTACT_ROLES, ['name', 'title', 'company', 'phone']),
    approvers: people(r['Approvers (6)'], APPROVER_ROLES, ['name', 'title', 'company'])
  };
}

const val = (s, k, d) => (s && s[k] && s[k].value !== undefined && s[k].value !== '' ? s[k].value : d);

/**
 * Build the Rebuild 4 cfg() object. defaultRules = SRI.DEFAULT_SETTINGS (holidays, lead days ...).
 * folderUrl = the MOP Test folder link written into the tracker's "GDrive: MOP Attachments" cell.
 */
export function cfgFromLists(lists, { defaultRules, folderUrl = '' } = {}) {
  const s = (lists && lists.settings) || {};
  const ids = val(s, 'JLLFieldIds', null);
  const rules = {
    ...defaultRules,
    mopLeadDays: +val(s, 'MOPLeadDays', defaultRules.mopLeadDays),
    jllMinWorkdays: +val(s, 'JLLMinWorkdays', defaultRules.jllMinWorkdays),
    jllMaxWorkdays: +val(s, 'JLLMaxWorkdays', defaultRules.jllMaxWorkdays),
    jllMaxLines: +val(s, 'JLLMaxLines', defaultRules.jllMaxLines),
    holidays: Array.isArray(val(s, 'Holidays', null)) ? val(s, 'Holidays', null).slice() : defaultRules.holidays.slice(),
    jllFieldIds: ids && typeof ids === 'object' ? Object.fromEntries(Object.entries(ids).filter(([, v]) => /^\d+$/.test(String(v))).map(([k, v]) => [k, String(v)])) : {},
    fwHours: +val(s, 'FireWatchHours', 4), twoPerson: +val(s, 'SecondCheckTier', 3)
  };
  return {
    rules, folder: folderUrl, printAdditions: val(s, 'PrintAdditions', 'Yes') !== 'No', additions: val(s, 'TemplateAdditions', 'Yes') !== 'No', requireMarkup: val(s, 'RequireMarkup', 'Yes') !== 'No',
    pilotDefault: val(s, 'PilotMode', 'No') === 'Yes', trk: { ...DEFAULT_TRK },
    projects: ((lists && lists.projects) || []).map(projectFromRow).filter(p => p.id),
    editors: ((lists && lists.editors) || []).map(e => String(e).trim().toLowerCase()).filter(Boolean),
    notes: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, (v && v.note) || '']))
  };
}

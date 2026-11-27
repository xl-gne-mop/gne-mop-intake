// Import field inventory (Tier A plan §2 U0). One row per intake field the importer can fill.
//   id         stable field id used in ExtractionResult.fields and expected.json
//   path       where the value goes in the request record (src/core/record.js)
//   type       text | longtext | date | enum | yesno | list | points | impacts | steps | people | system
//   required   the intake form needs it before Submit
//   safety     safety-critical (decision #1): never green, confirmed one at a time, Import Gate
//   r4         label(s) the Rebuild 4 importer reads (src/import/docx.js, imp.js)
//   tpl        what fillMopV2 fills in GNE MOP Template v2
// Risk tier is never imported (plan U3 step 5): the rules compute it from confirmed fields.

export const SAFETY_CRITICAL_IDS = ['loto.needed', 'loto.points', 'loto.energy', 'x.isoBy', 'x.isoBy2', 'sup.impair', 'sup.cgmp', 'x.cold', 'x.backfeed', 'emergencyPower', 'backout', 'x.rts', 'sup.hot', 'x.alarms', 'sup.watch'];

export const FIELDS = [
  { id: 'title', label: 'MOP title', path: 'title', type: 'text', required: true, r4: ['MOP Title:'], tpl: 'MOP Title: (row 0)' },
  { id: 'scope', label: 'Work scope', path: 'scope', type: 'longtext', required: true, r4: ['Work Scope:'], tpl: 'Work Scope: (MOP Input Scope)' },
  { id: 'origin', label: 'Origin of change', path: 'origin', type: 'enum', required: true, r4: ['(Origin: …)'], tpl: 'Work Scope "(Origin: …)"' },
  { id: 'bldg', label: 'Building', path: 'bldg', type: 'text', required: true, r4: ['Work Area(s): (first word)'], tpl: 'Work Area(s):' },
  { id: 'areas', label: 'Work areas (floor, rooms)', path: 'areas', type: 'longtext', required: true, r4: ['Work Area(s):'], tpl: 'Work Area(s):' },
  { id: 'equip', label: 'Equipment / area affected', path: 'equip', type: 'text', required: true, r4: [], tpl: 'tracker Equipment/Area' },
  { id: 'start', label: 'Planned start (date and time)', path: 'start', type: 'date', required: true, r4: ['MOP Execute Date:'], tpl: 'MOP Execute Date:' },
  { id: 'duration', label: 'Duration', path: 'durVal', type: 'text', required: true, r4: [], tpl: 'tracker Proposed Duration' },
  { id: 'priority', label: 'Priority', path: 'priority', type: 'enum', required: true, r4: ['Priority ☒ High/Medium/Low'], tpl: 'Priority checkboxes' },
  { id: 'subMop', label: 'Sub MOP #', path: 'subMop', type: 'text', required: false, r4: ['Sub MOP #:'], tpl: 'Sub MOP #:' },
  { id: 'subShort', label: 'Sub short name', path: 'subShort', type: 'text', required: false, r4: ['___ MOP #:'], tpl: '"REI MOP #:"' },
  { id: 'discipline', label: 'Discipline', path: 'discipline', type: 'enum', required: true, r4: ['(library match)'], tpl: 'tracker Category/Discipline' },
  { id: 'req.name', label: 'Requester name', path: 'req.name', type: 'text', required: true, r4: ['MOP Author Print Name:'], tpl: '12. MOP Author' },
  { id: 'req.company', label: 'Requester company', path: 'req.company', type: 'text', required: true, r4: [], tpl: '—' },
  { id: 'req.phone', label: 'Requester phone', path: 'req.phone', type: 'text', required: true, r4: [], tpl: '—' },
  { id: 'inService', label: 'System in service?', path: 'inService', type: 'enum', required: true, r4: [], tpl: 'tracker System/Area in use?' },
  { id: 'sys', label: 'Affected systems (groups, levels, items)', path: 'sys', type: 'system', required: true, r4: ['1. Impact Notification groups'], tpl: '1. Impact Notification' },
  { id: 'impacts', label: 'Impacts and mitigations', path: 'impacts', type: 'impacts', required: true, r4: ['Planned Impact …:', 'Potential Impact …:'], tpl: '2. Impact Description' },
  { id: 'users', label: 'Impacted users', path: 'users', type: 'longtext', required: false, r4: [], tpl: 'tracker Impacted Users' },
  { id: 'safety', label: 'Safety requirements (line 6)', path: 'safety', type: 'longtext', required: false, r4: ['4. Safety Requirements line 6'], tpl: '4. Safety Requirements 6.' },
  { id: 'tools', label: 'Required tools', path: 'tools', type: 'list', required: false, r4: ['5. Required Tools'], tpl: '5. Required Tools 1–10' },
  { id: 'crew', label: 'Required personnel', path: 'crew', type: 'list', required: false, r4: ['6. Required Personnel'], tpl: '6. Required Personnel 1–10' },
  { id: 'pre', label: 'Extra steps before the MOP', path: 'pre', type: 'steps', required: false, r4: ['7. prior steps 9–10'], tpl: '7. prior steps 9–10' },
  { id: 'steps', label: 'Steps during the MOP', path: 'steps', type: 'steps', required: true, r4: ['8. Detailed Step-by-Step … during'], tpl: '8. and 8. Cont.' },
  { id: 'gonogo', label: 'Go / No-Go conditions', path: 'gonogo', type: 'list', required: false, r4: ['9. Go / No-Go'], tpl: '9. Go / No-Go' },
  { id: 'workers', label: 'Qualified workers', path: 'workers', type: 'people', required: false, r4: [], tpl: '14. Qualified and Authorized Workers' },
  { id: 'subs', label: 'Subcontractor contacts', path: 'subs', type: 'people', required: false, r4: [], tpl: '3. contacts rows 9–10' },
  { id: 'sup.jll', label: 'JLL crew assist needed?', path: 'sup.jll', type: 'yesno', required: true, r4: ['☒ JLL Assist Required'], tpl: '7. JLL Assist checkbox' },
  { id: 'sup.siemens', label: 'Siemens support needed?', path: 'sup.siemens', type: 'yesno', required: true, r4: [], tpl: 'tracker Need Siemens Support?' },
  // ---- safety-critical (decision #1) ----
  { id: 'loto.needed', label: 'Does this need a LOTO?', path: 'loto.needed', type: 'yesno', required: true, safety: true, r4: ['☒ JLL LOTO Required'], tpl: '7. JLL LOTO checkbox; safety line 5' },
  { id: 'loto.points', label: 'LOTO / isolation points', path: 'loto.points', type: 'points', required: true, safety: true, r4: [], tpl: 'LOTO log rows; JLL packet line items' },
  { id: 'loto.energy', label: 'Energy type of each point', path: 'loto.points[].type', type: 'enum', required: true, safety: true, r4: [], tpl: 'JLL packet (circuits / valves)' },
  { id: 'x.isoBy', label: 'Who verifies zero energy at the point of work', path: 'x.isoBy', type: 'text', required: true, safety: true, r4: ['Isolation verified … Print Name:'], tpl: '7. Isolation verified row' },
  { id: 'x.isoBy2', label: 'Second person who checks the isolation', path: 'x.isoBy2', type: 'text', required: true, safety: true, r4: ['Second check / Time:'], tpl: '7. Second check / Time cell' },
  { id: 'sup.impair', label: 'Life-safety (FLS) impairment?', path: 'sup.impair', type: 'yesno', required: true, safety: true, r4: ['☒ Impairment Required'], tpl: '1. Life Safety Impairment Required' },
  { id: 'sup.watch', label: 'Fire watch?', path: 'sup.watch', type: 'yesno', required: true, safety: true, r4: ['☒ Fire Watch Required'], tpl: '1. Life Safety Fire Watch Required' },
  { id: 'sup.hot', label: 'Hot work?', path: 'sup.hot', type: 'yesno', required: true, safety: true, r4: ['☒ Hot Work Required'], tpl: '1. Life Safety Hot Work Required' },
  { id: 'sup.cgmp', label: 'cGMP area or utility?', path: 'sup.cgmp', type: 'yesno', required: true, safety: true, r4: ['GMP / QA:'], tpl: 'GMP / QA:' },
  { id: 'x.cold', label: 'Cold rooms / freezers on this power or cooling?', path: 'x.cold', type: 'yesno', required: false, safety: true, r4: [], tpl: 'safety line 6' },
  { id: 'x.backfeed', label: 'Any other power source (generator, UPS, tie, second feed)?', path: 'x.backfeed', type: 'yesno', required: false, safety: true, r4: [], tpl: 'safety line 6' },
  { id: 'emergencyPower', label: 'Emergency / standby / UPS power affected?', path: 'sys.elec.items', type: 'list', required: false, safety: true, r4: ['☒ Standby Power', '☒ UPS'], tpl: '1. Electrical Standby Power / UPS' },
  { id: 'x.alarms', label: 'Alarms suppressed (to restore)', path: 'x.alarms', type: 'list', required: false, safety: true, r4: [], tpl: '11. Return to service: alarms' },
  { id: 'backout', label: 'Back-out procedure', path: 'backout', type: 'list', required: true, safety: true, r4: ['10. Back-Out Procedures 1)–4)'], tpl: '10. Back-Out' },
  { id: 'x.rts', label: 'Return to service', path: 'x.rts', type: 'list', required: true, safety: true, r4: ['11. Return to service:'], tpl: '11. rows 5+' }
].map(f => ({ required: false, safety: false, ...f, safety: SAFETY_CRITICAL_IDS.includes(f.id) }));

export const FIELD_BY_ID = Object.fromEntries(FIELDS.map(f => [f.id, f]));
export const isSafety = id => SAFETY_CRITICAL_IDS.includes(id);

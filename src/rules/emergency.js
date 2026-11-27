// Emergency / on-call lines printed at the end of the MOP contact list (Template v2 round 3, JK #11 + 11/26/26:
// "include emergency contact phone numbers if they are known"). Pure: (record, cfg, tier) → rows.
// Sources are the lists.json values the app already has (Drive config, never in this public code):
//   settings.EmergencyContact, SecurityContact, FLSHotline (cfg().review) and campusInfo topics.
// Always: First Alert Team and GNE Security (the settings notes say "print on every MOP").
// By the work: SSF FLS hotline (impairment or fire / life-safety work), on-site Health & Safety (hot work or Tier 3),
// JLL LOTO work orders (LOTO or JLL assist). A line prints only when its phone number is known.

const PHONE = /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
const phoneOf = s => { const m = PHONE.exec(String(s || '')); return m ? m[0] : ''; };
const FIRE = ['Fire Alarm', 'Fire Protection', 'Smoke Control', 'Impairment Required', 'Fire Watch Required'];

/** rows: [{ name, title, company, phone, key }] in print order. */
export function emergencyLines(r, c = {}, tier = 1) {
  const rv = c.review || {}, info = c.campusInfo || [];
  const topic = re => info.find(x => re.test(String(x.topic || '')));
  const out = [];
  const add = (key, on, row) => { if (on && row && row.phone) out.push({ key, ...row }); };
  const impair = r.sup && r.sup.impair === 'Yes', hot = r.sup && r.sup.hot === 'Yes';
  const fire = impair || (r.sys && r.sys.ls && r.sys.ls.items.some(i => FIRE.includes(i)));
  const lotoJll = (r.loto && r.loto.needed === 'Yes') || (r.sup && r.sup.jll === 'Yes');

  add('emergency', true, { name: 'First Alert Team (FAT)', title: 'Emergencies & spills – 911 for emergency response', company: 'Genentech', phone: phoneOf(rv.emergency) });
  add('security', true, { name: 'GNE Security', title: 'Security', company: 'Genentech', phone: phoneOf(rv.security) });
  add('fls', fire, { name: 'SSF FLS Hotline', title: 'gSOC disregard / regard calls', company: 'Genentech', phone: phoneOf(rv.fls) || phoneOf(rv.flsHotline) });
  { const t = topic(/On-site Health & Safety/i); add('health', hot || tier >= 3, t && { name: t.contact || 'On-site Health & Safety', title: 'Injuries – 24 hours / 7 days', company: 'Genentech', phone: t.phone }); }
  { const t = topic(/^JLL\b.*LOTO work orders/i); add('jll', lotoJll, t && { name: t.contact || 'JLL', title: 'JLL – LOTO work orders', company: 'JLL', phone: t.phone }); }
  return out;
}

// lists.json settings added by the MOP review 11/26/26 (pure; used by src/config/lists.js cfgFromLists).
// val(settings, key, default) is the lists.js reader. Missing keys give the review's defaults.
export function reviewSettings(s, val) {
  const num = (k, d) => { const v = +val(s, k, d); return Number.isFinite(v) ? v : d; };
  const lead = val(s, 'PermitLeadDays', null);
  return {
    permitLead: lead && typeof lead === 'object' ? Object.fromEntries(Object.entries(lead).map(([k, v]) => [k, +v]).filter(([, v]) => Number.isFinite(v))) : {},
    jobWalkDays: num('HotTapJobWalkDays', 3), permitMaxHours: num('PermitMaxHours', 24), swpLeadDays: num('SWPLeadDays', 14), ehsLeadDays: num('EHSChecklistLeadDays', 21),
    emergency: String(val(s, 'EmergencyContact', '') || ''), security: String(val(s, 'SecurityContact', '') || ''), er: String(val(s, 'NearestER', '') || ''), fls: String(val(s, 'FLSHotline', '') || ''),
    postSteps: String(val(s, 'PostMOPSteps', '') || '')
  };
}

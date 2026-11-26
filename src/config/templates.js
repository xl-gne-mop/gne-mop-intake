// template.json files -> the window.TPL-style base64 map the Rebuild 4 export code reads (mop, trk, loto, logo, intake).
export const TPL_KEYS = { mop: 'mop', trk: 'tracker', loto: 'lotoLog', logo: 'logo', intake: 'excelIntake' };
export function tplFromTemplateJson(t) { return Object.fromEntries(Object.entries(TPL_KEYS).map(([k, j]) => [k, t && t.files && t.files[j] ? t.files[j].data : ''])); }

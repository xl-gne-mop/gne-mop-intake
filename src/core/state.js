// Shared app state and helpers, ported from Rebuild 4 (reference/rebuild-4/index.html:152-192).
// The Rebuild 4 code reads `S`, `cfg()` and `proj()` everywhere; keeping those names lets the ported
// function bodies stay as close to the reference as possible. Differences from the reference:
// - cfg() comes from lists.json (src/config/lists.js) instead of a shared settings document (D8).
// - fileUrl() returns object URLs for Blobs kept in IndexedDB (no shared asset store).
// - window.TPL / window.MOPLIB are S.tpl / S.library, loaded from the Drive config files.
import { CONTACT_ROLES, APPROVER_ROLES, DEFAULT_TRK } from '../config/lists.js';
import { appHolidays } from '../util/holidays.js';

export const R = globalThis.SRI;
/* ---------- constants ---------- */
export const STEPS = R.SECTIONS;
export const STATUSES = ['Draft', 'Submitted', 'Out for approval', 'Approved', 'Executed', 'Closed'];
export const SIDE = ['On hold', 'Cancelled'];
export const UTIL = { k: 'util', name: 'Utility Systems', items: R.UTIL_ITEMS.map(n => [n]) };
export const GROUPS = [...R.SYS, UTIL];
export const SYSTEM_CODES=['00 General','08 Laboratory Equipment','10 Industrial Water, Fuel, Sewer','11 Industrial Water','12 Domestic Potable Water (Cold and Hot)','13 Fire Sprinkler Systems','15 DIesel Fuel','16 Natural Gas','17 Sanitary Sewer','18 Storm Sewer','21 Cooling Water Supply and Return','22 Heating Water Supply and Return','23 Tower Water Supply and Return','24 Plant Steam','25 Plant Steam Condensate','28 Compressed Air and Instrument Air','40 Process and Plant Coolant','31 Refrigerated Water Supply and Return','33 Refrigerated Glycol Suppply and Return','35 Process Refrigerated Water Supply and Return','36 Process Refrigerated Glycol Supply and Return','40 Process Water, Steam','41 Deionized Water (Process)','42 Purified Water (Process)','43 Reverse Osmosis (Process)Water','44 Water for Injection (Process)','46 Clean or Pure Steam (Process)','47 Clean or Pure Steam Condensate (Process)','50.0 Mechanical / HVAC','50 Air Handler','51 Fan Coil','52 Exhaust Fans','53 Transfer Fans','54 Supply Fans','55 Make Up Air Unit','56 Miscellaneous (Radiant, Humidifiers...)','60 Process Air, Gas, Vacuum','61 Process Air','62 Nitrogen Gas','63 Oxygen Gas','64 Carbon Dioxide','65 Liquified Nitrogen','66 Process Vacuum','67 Liquid Carbon Dioxide','68 Liquid Oxygen','69 Specialty Gas (Argon, Helium, Mixtures)','70 Biochemical Manufacturing','80 Pharm. Manufacturing','90 Process Chemical, Waste','91 Process Clean-In-Place (CIP)','94 Aqueous (pH) Wastewater','95 Process Waste','96 Process Vent','98 Process Chemical (Acids, Bases, Solvents)','TBD'];
export const LOTO_CATS=['Isolation point photo','Panel schedule','Single line diagram','P&ID','As-built','Other'];
export const CAT_MAP={'Isolation point photo':'Photo','Panel schedule':'Panel Schedules','Single line diagram':'Diagrams','P&ID':'Diagrams','As-built':'As-builts','Other':'Other'};
export { CONTACT_ROLES, APPROVER_ROLES };
export const ICON_MIC = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';

/* ---------- state ---------- */
export const S = {
  library: [], lib: [], tpl: {}, cfg: null, configMsg: '', reqs: {}, sigs: {}, names: {}, uid: null, meName: '', canEdit: false, blobUrls: {}, blobs: {},
  view: 'board', id: null, draft: null, step: 0, ready: false, note: '', filter: { p: '', s: 'open', q: '' }, logTab: 0, logP: '',
  dictEl: null, dictState: 'idle', dict: null, busy: false, dirty: false, setTab: 0, projEdit: null, openPt: -1,
  hooks: { later: () => {}, saveReq: async () => true }
};
export const $ = s => document.querySelector(s);
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clone = o => JSON.parse(JSON.stringify(o));
export const uidGen = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const EMPTY_CFG = { printAdditions: true, rules: { ...R.DEFAULT_SETTINGS, holidays: appHolidays(), fwHours: 0, twoPerson: 1 }, folder: '', additions: true, requireMarkup: true, projects: [], trk: { ...DEFAULT_TRK }, editors: [], notes: {} };
export const cfg = () => S.cfg || EMPTY_CFG;
export const proj = id => cfg().projects.find(p => p.id === id) || null;
export const safeUrl = u => /^https:\/\//i.test(u || '') ? u : '';
export const pad3 = n => String(n).padStart(3, '0');
export const mopLabel = q => q.mopNo ? `MOP-${pad3(q.mopNo)} rev ${q.rev}` : 'No MOP # yet';
let toastT;
export function toast(m) { if (typeof document === 'undefined') return; let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); } t.textContent = m; clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 3400); }
export const now = () => R.siteNow();
export const fS = d => R.fShort(d), fL = d => R.fLong(d);
export const isoDay = d => R.ymd(d);
export const pdDay = s => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const fromIso = s => s ? R.siteNow(R.SITE_TZ, new Date(s)) : null;
export const fileUrl = id => S.blobUrls[id] || '';
// The reference fetched its own blob: URLs; the CSP (connect-src) doesn't allow blob:, so file bytes come
// from the Blob kept in memory (same bytes, no network). Falls back to fetch for anything else.
export const fetchFile = id => S.blobs[id] ? Promise.resolve(new Response(S.blobs[id])) : fetch(fileUrl(id));
export const D = () => S.draft.record;
export const later = () => S.hooks.later();
export const render = () => S.hooks.render && S.hooks.render();
export const saveDraft = () => (S.hooks.saveDraft ? S.hooks.saveDraft() : Promise.resolve(true));

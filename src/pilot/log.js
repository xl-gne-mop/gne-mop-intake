// Pilot mode (Rebuild 5): pilot log rows and CSV (r5:727-730, verbatim) and the time-in-app counter (r5:1061-1062).
// Pilot mode can only be on when config.js has BOTH pilot IDs (PILOT_TRACKER_ID, PILOT_SHEET_ID); sync then goes
// to the pilot copies (phase 6).
import { R, S, mopLabel, fS, fromIso } from '../core/state.js';
import { tierOf } from '../rules/tier.js';
import { flagsOf } from '../rules/dontKnow.js';
import { getSetting, setSetting } from '../store/settings.js';

const C = () => globalThis.MOP_CONFIG || {};
export const pilotIdsSet = (c = C()) => !!(c.PILOT_TRACKER_ID && c.PILOT_SHEET_ID);
export const PILOT_NEEDS_IDS = 'Pilot mode needs the pilot tracker and pilot sheet IDs in config.js (ask JK).';
/** Device switch (default from lists.json PilotMode), forced off while either pilot ID is empty. */
export async function loadPilot(defaultOn) { const v = await getSetting('pilot', null); S.pilotWanted = v === null ? !!defaultOn : !!v; S.pilotOn = S.pilotWanted && pilotIdsSet(); return S.pilotOn; }
export async function setPilot(on) { if (on && !pilotIdsSet()) return false; S.pilotWanted = !!on; S.pilotOn = !!on && pilotIdsSet(); await setSetting('pilot', !!on); return true; }

const PILOT_COLS=['MOP','Title','Requester','Tier','Submitted','Minutes in app','Days draft to submit',"Don't know",'Defaults changed','PM check','Ease','Slowest screen','Note','After-job review'];
function pilotRows(){return Object.values(S.reqs).filter(q=>q.sub&&(!S.logP||q.project===S.logP)).sort((a,b)=>(a.sub.at||'').localeCompare(b.sub.at||'')).map(q=>{const r=q.sub.record,p=q.meta.pilot,sa=p.subAt||q.firstAt||q.sub.at;
 return[mopLabel(q),r.title,r.req.name,'T'+tierOf(r).t,sa?fS(fromIso(sa)):'',Math.round((p.activeSec||0)/6)/10,q.createdAt&&sa?Math.round((new Date(sa)-new Date(q.createdAt))/864e4)/10:'',p.dk||0,p.edits||0,q.history.some(h=>/^Checks answered/.test(h.what))?'Yes':(flagsOf(r).length?'Open':'No'),p.fb.ease||'',p.fb.slow||'',p.fb.note||'',[q.meta.review.diff,q.meta.review.step,q.meta.review.time].filter(Boolean).join(' | ')]})}
const csv=rows=>rows.map(r=>r.map(v=>{const t=String(v??'');return /[",\n]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t}).join(',')).join('\r\n');

/* Time actually spent in the intake: the screen is visible and was touched in the last 2 minutes (5 s ticks). */
export function startPilotClock() {
  S.lastAct = Date.now(); ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { S.lastAct = Date.now(); }, { passive: true }));
  setInterval(() => { if (S.view === 'edit' && S.draft && document.visibilityState === 'visible' && Date.now() - S.lastAct < 120000) { const k = S.draft.meta.pmFix ? 'pmSec' : 'activeSec'; S.draft.meta.pilot[k] = (S.draft.meta.pilot[k] || 0) + 5; } }, 5000);
}

export { PILOT_COLS, pilotRows, csv };

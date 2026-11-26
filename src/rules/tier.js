// Risk tier (Tier 1 no shutdown, 2 non-critical, 3 critical). A library work type may raise, never lower, the tier.
// Ported from reference/rebuild-5/index.html (r5:312-320); bodies verbatim.
import { R, S, cfg, now } from '../core/state.js';
import { libById } from '../lib/library.js';

const TIER_NAME={1:'Tier 1 – no shutdown',2:'Tier 2 – non-critical shutdown',3:'Tier 3 – critical'};
const TIER_ADDS={1:'Short path: LOTO, Systems, Support and Steps fill from the library and are skipped when nothing is missing.',2:'Isolation points, impacts and return to service. Hold point recommended.',3:'Adds an isolation hold point, a second-person isolation check, an alarm restore list, Go/No-Go and back-out, and a peer review before it goes out for approval.'};
function tierOf(r){const e=libById(r.x.lib&&r.x.lib.id),lo=r.loto.needed==='Yes',w2=[],w3=[];
 if(lo)w2.push('LOTO');if(r.sup.jll==='Yes')w2.push('JLL assist');
 if(['hvac','elec','lab','ls','sec','tech'].some(k=>['M','H'].includes(r.sys[k].level))||['M','H'].includes(r.x.util.level))w2.push('system shutdown');
 [[r.sup.impair==='Yes','fire / life-safety impairment'],[r.sup.cgmp==='Yes','cGMP area'],[r.sys.elec.items.some(i=>i==='Standby Power'||i==='UPS'),'emergency or UPS power'],
  [r.sys.hvac.items.includes('Cold Rooms')||r.x.cold==='Yes','cold storage'],[r.priority==='H','High priority'],[lo&&(Object.values(r.sys).some(v=>v.level==='H')||r.x.util.level==='H'),'LOTO with a High impact']].forEach(([c,w])=>{if(c)w3.push(w)});
 let t=w3.length?3:w2.length?2:1,why=t===3?w3:w2;if(e&&e.tier>t){t=e.tier;why=[e.name]}
 return{t,why:[...new Set(why)]}}

export { TIER_NAME, TIER_ADDS, tierOf };

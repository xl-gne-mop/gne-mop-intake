// Close-out gate before stage 9 (locks off, alarms restored, FLS restored, fire watch ended, hot work permit closed, QA release for cGMP, users confirm).
// Ported from reference/rebuild-5/index.html (r5:453-457); bodies verbatim.
import { R, S, cfg, now } from '../core/state.js';

function closeItems(q){const r=q.sub.record,it=[];if(r.loto.needed==='Yes')it.push(['loto','All LOTO locks and tags removed and logged with JLL']);
 R.lines(r.x.alarms).forEach((l,i)=>it.push(['a'+i,'Restored: '+l]));if(r.sup.impair==='Yes')it.push(['fls','Siemens FLS restored the system; monitoring company and notified parties told']);
 if(r.sup.watch==='Yes')it.push(['watch','Fire watch ended; log filed']);if(r.sup.hot==='Yes')it.push(['hot','Hot work permit closed']);if(r.sup.cgmp==='Yes')it.push(['qa','GNE QA release recorded (if QA required one)']);
 it.push(['users','Users confirm everything is back in service']);return it}
const closeGaps=q=>closeItems(q).filter(([k])=>!q.meta.close[k]).map(x=>x[1]);
/** Template v2 round 3 (JK #5): a tick keeps who and when (the MOP close-out rows print them); still truthy for closeGaps. */
const closeTick=(prev,on,uid)=>on?(prev&&typeof prev==='object'&&prev.at?prev:{by:uid||'',at:new Date().toISOString()}):false;

export { closeItems, closeGaps, closeTick };

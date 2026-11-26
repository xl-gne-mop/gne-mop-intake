// "Don't know" answers: flagged for the XL PM; never block Submit; block stage 6 until an editor answers.
// Ported from reference/rebuild-5/index.html (r5:327-333); bodies verbatim.
import { R, S, cfg, now } from '../core/state.js';

const fl=(r,p)=>!!(r.x.flags&&r.x.flags[p]);
const FLAG_LABEL={'sup.siemens':'Siemens support needed?','sup.impair':'Life-safety impairment?','sup.hot':'Hot work?','sup.watch':'Fire watch?','sup.jll':'JLL crew assist needed?','sup.cgmp':'cGMP area?','loto.needed':'Does this need a LOTO?','loto.safeOff':'Who performs the safe-off / LOTO','x.backfeed':'Any other power source (backfeed)?','x.cold':'Cold rooms / freezers on this power or cooling?','x.eyewash':'Eyewashes / safety showers on this water?','x.dp':'Rooms that lose pressure control and what they return to','x.isoBy':'Who verifies zero energy at the point of work','x.isoBy2':'Second person who checks the isolation'};
function flagLabel(p){const m=/^loto\.points\.(\d+)\.(affected|confirmed)$/.exec(p);if(m)return `Isolation point ${+m[1]+1}: ${m[2]==='affected'?'affected loads':'loads confirmed with the GNE user'}`;return FLAG_LABEL[p]||p}
const flagStep=p=>/^loto|^x\.(backfeed|isoBy)/.test(p)?3:/^x\.(cold|eyewash|dp)/.test(p)?4:/^sup/.test(p)?6:9;
function flagsOf(r){return Object.keys(r.x.flags||{}).filter(p=>r.x.flags[p]).map(p=>({p,m:flagLabel(p),s:flagStep(p)}))}
const SRI_PATH={'Answer: Siemens support?':'sup.siemens','Answer: Life-safety impairment?':'sup.impair','Answer: Hot work?':'sup.hot','Answer: Fire watch?':'sup.watch','Answer: JLL crew assist?':'sup.jll','Answer: cGMP area?':'sup.cgmp','Answer: does this need a LOTO?':'loto.needed','Who performs the initial safe-off':'loto.safeOff'};
function gapPath(m){if(SRI_PATH[m])return SRI_PATH[m];const x=/^Isolation point (\d+): what loses service$/.exec(m);return x?`loto.points.${x[1]-1}.affected`:null}

export { fl, FLAG_LABEL, flagLabel, flagStep, flagsOf, SRI_PATH, gapPath };

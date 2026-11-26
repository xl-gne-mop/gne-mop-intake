// One-tap safety fixes (Rebuild 5, r5:436-447): insert a hold point, the voltage test, hot work steps or the alarm
// restore step in the right place. Verbatim.
import { R, S, D, toast } from '../core/state.js';
import { tok } from '../lib/library.js';
import { hasStep } from './failureModes.js';

const ABS=/absence of voltage|live.?dead.?live|test(s|ing)? for (zero|no) voltage/i,ALR=/restor\w*.{0,40}(alarm|points|monitoring|system)|alarm\w*.{0,30}(restor|clear|none active)|re-?enabl|none active/i;
const HOLD_E_T='HOLD POINT – a second person checks locks, tags and the test result at {LOTO} (photo of the meter reading). No work until XL releases';
const HOLD_P_T='HOLD POINT – a second person checks valves are closed, tagged and at zero pressure at {LOTO} (photo of the gauge). No work until XL releases';
const TEST_T='Sub tests for absence of voltage at each point of work, every phase-to-phase and phase-to-ground; prove the tester on a known source before and after';
function workIdx(r){const i=r.steps.findIndex(x=>/performs the|makes the tie-in|cuts? (in|and)|main work proceeds|work proceeds/i.test(x.desc));return i<0?Math.min(1,r.steps.filter(x=>x.desc.trim()).length):i}
function insStep(at,desc,dur){const r=D();if(r.steps.length===1&&!r.steps[0].desc.trim())r.steps=[];if(r.steps.length>=R.LIMITS.steps){toast('44 steps is the most the MOP holds.');return false}r.steps.splice(Math.max(0,Math.min(at,r.steps.length)),0,{desc:tok(desc,r),dur});return true}
function safetyFixes(r){const lo=r.loto.needed==='Yes',miss=[];
 if(lo&&!hasStep(r,/HOLD POINT/i))miss.push(['insHold','Isolation hold point']);
 if(lo&&r.loto.points.some(p=>p.type==='Electrical')&&!hasStep(r,ABS))miss.push(['insTest','Voltage test at each point of work']);
 if(r.sup.hot==='Yes'&&!hasStep(r,/hot work permit/i))miss.push(['insHot','Hot work permit, fire watch and detectors']);
 if(R.lines(r.x.alarms).length&&!hasStep(r,ALR))miss.push(['insAlarm','Restore all suppressed alarms']);
 return miss.length?`<div class="qz"><b>Safety steps missing</b><p class="small u-54eb29">Tap to add each one in the right place. You can change the wording.</p><div class="bar">${miss.map(([a,l])=>`<button class="btn sm pri" data-a="${a}">+ ${l}</button>`).join('')}</div></div>`:''}

export { ABS, ALR, HOLD_E_T, HOLD_P_T, TEST_T, workIdx, insStep, safetyFixes };

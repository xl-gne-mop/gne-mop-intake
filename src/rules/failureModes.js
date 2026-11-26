// Failure-mode checks (Rebuild 5 ruleGaps, r5:336-353) kept as a DATA-DRIVEN rule list (PROMPT.md):
// each rule says when it applies, which screen it belongs to, the message, the "Don't know" path that silences it
// and the one-tap fix (src/rules/fixes.js). Evaluated in order, the list returns exactly what the reference
// ruleGaps returns (tests/unit/failureModes.test.js checks this against the reference code).
// trig, hasStep and impHas are verbatim (r5:321-335).
import { R, cfg } from '../core/state.js';
import { libById } from '../lib/library.js';
import { tierOf } from './tier.js';
import { fl } from './dontKnow.js';

function trig(r){const e=libById(r.x.lib&&r.x.lib.id),c=(e&&e.checks)||{},lo=r.loto.needed==='Yes',pts=lo?r.loto.points:[],el=pts.some(p=>p.type==='Electrical'),txt=[r.title,r.scope,r.equip].join(' ');
 return{backfeed:el,cold:!!(c.cold||el||r.sys.hvac.items.some(i=>['Chilled Water','Cold Rooms','Temperature Control'].includes(i))||['M','H'].includes(r.sys.elec.level)),
  eyewash:!!(c.eyewash||r.x.util.items.includes('Domestic Water')||(pts.some(p=>p.type!=='Electrical')&&/\b(domestic|tempered|dcw|dhw|potable|eye ?wash|shower)\b/i.test(txt))),
  dp:!!(c.dp||(r.sys.hvac.items.some(i=>['Exhaust Air','Pressure Monitoring'].includes(i))&&(r.sys.lab.level||r.sys.hvac.items.includes('Pressure Monitoring')))),
  alarms:r.sup.siemens==='Yes'||r.sup.impair==='Yes'||r.sys.hvac.items.some(i=>/BAS|FMS/.test(i)),
  hotText:/\b(weld\w*|braz\w*|solder\w*|torch\w*|plasma cut\w*)\b/i.test(txt+' '+r.steps.map(x=>x.desc).join(' '))}}
const hasStep=(r,re)=>r.steps.some(x=>re.test(x.desc));
const impHas=(r,re)=>r.impacts.some(i=>re.test(i.impact+' '+i.mitigation));

const ABS = /absence of voltage|live.?dead.?live|test(s|ing)? for (zero|no) voltage/i;

/** Context shared by every rule: the record, settings, tier and field-check triggers. */
export function ruleContext(r) {
  return { r, c: cfg(), t: tierOf(r), tg: trig(r), lo: r.loto.needed === 'Yes' };
}

/**
 * The rules, in the reference order. when(ctx[, i]) -> true when the check is missing.
 * each(ctx) -> list to repeat the rule over (isolation points). flag: the "Don't know" path (or null).
 * fix: the one-tap fix id in src/rules/fixes.js (or null when the fix is answering the question).
 */
export const RULES = [
  { id: 'backfeed', screen: 3, flag: 'x.backfeed', fix: null, when: x => x.lo && x.tg.backfeed && !x.r.x.backfeed,
    msg: () => 'Answer: can anything else feed this equipment (generator, UPS, tie breaker, PV, second feed)?' },
  { id: 'backfeedSrc', screen: 3, flag: null, fix: null, when: x => x.lo && x.r.x.backfeed === 'Yes' && !x.r.x.backfeedSrc.trim(),
    msg: () => 'Other power source: say which one and how it is locked out' },
  { id: 'loadsConfirmed', screen: 3, flag: (x, i) => `loto.points.${i}.confirmed`, fix: null, each: x => x.lo ? x.r.loto.points : [], when: (x, i, p) => !p.confirmed,
    msg: (x, i) => `Isolation point ${i + 1}: confirm all loads with the GNE user (or tap Don't know)` },
  { id: 'zeroEnergyBy', screen: 3, flag: 'x.isoBy', fix: null, when: x => x.lo && x.c.additions && !x.r.x.isoBy.trim(),
    msg: () => "Who verifies zero energy at the point of work? (name, or tap Don't know)" },
  { id: 'secondCheck', screen: 3, flag: 'x.isoBy2', fix: null, when: x => x.lo && x.t.t >= (+x.c.rules.twoPerson || 3) && !x.r.x.isoBy2.trim(),
    msg: x => `Tier ${x.t.t}: name the second person who checks the isolation at the hold point` },
  { id: 'coldStorage', screen: 4, flag: 'x.cold', fix: null, when: x => x.tg.cold && !x.r.x.cold,
    msg: () => 'Answer: any cold rooms, freezers, fridges or incubators on this power or cooling?' },
  { id: 'eyewash', screen: 4, flag: 'x.eyewash', fix: null, when: x => x.tg.eyewash && !x.r.x.eyewash,
    msg: () => 'Answer: any eyewashes or safety showers on this water?' },
  { id: 'roomPressure', screen: 4, flag: 'x.dp', fix: null, when: x => x.tg.dp && !x.r.x.dp.trim(),
    msg: () => 'Which rooms lose pressure control, and what pressure must they return to?' },
  { id: 'coldImpact', screen: 5, flag: null, fix: 'addCold', when: x => x.r.x.cold === 'Yes' && !impHas(x.r, /temperat|freez|cold room|incubat|setpoint/i),
    msg: () => 'Cold storage: add the temperature plan as an impact (tap Add cold storage impact)' },
  { id: 'eyewashImpact', screen: 5, flag: null, fix: 'addEye', when: x => x.r.x.eyewash === 'Yes' && !impHas(x.r, /eye ?wash|shower/i),
    msg: () => 'Eyewash / shower: add how they are covered as an impact (tap Add eyewash impact)' },
  { id: 'alarmList', screen: 6, flag: null, fix: null, when: x => x.tg.alarms && !x.r.x.alarms.trim(),
    msg: () => 'List the alarms or points put on standby or disabled, one per line. Each one is restored before close-out.' },
  { id: 'hotWords', screen: 6, flag: 'sup.hot', fix: null, when: x => x.tg.hotText && x.r.sup.hot !== 'Yes',
    msg: () => 'The work mentions welding, brazing, soldering or a torch: set Hot work to Yes' },
  { id: 'hotSteps', screen: 7, flag: null, fix: 'insHot', when: x => x.r.sup.hot === 'Yes' && !hasStep(x.r, /hot work permit/i),
    msg: () => 'Hot work: add the permit, fire watch and detector steps (tap Add hot work steps)' },
  { id: 'voltageTest', screen: 7, flag: null, fix: 'insTest', when: x => x.lo && x.r.loto.points.some(p => p.type === 'Electrical') && !hasStep(x.r, ABS),
    msg: () => 'Add the absence-of-voltage test at each point of work (NFPA 70E-2024 120.6)' },
  { id: 'holdPoint', screen: 7, flag: null, fix: 'insHold', when: x => x.lo && x.t.t === 3 && !hasStep(x.r, /HOLD POINT/i),
    msg: () => 'Tier 3: add the isolation hold point (no work until verified)' },
  { id: 'goNoGo', screen: 7, flag: null, fix: null, when: x => x.t.t === 3 && x.r.priority !== 'H' && !x.lo && !R.lines(x.r.gonogo).length,
    msg: () => 'Tier 3: add at least one Go / No-Go condition' },
  { id: 'backout', screen: 7, flag: null, fix: null, when: x => x.t.t === 3 && x.r.priority !== 'H' && !x.lo && !R.lines(x.r.backout).length,
    msg: () => 'Tier 3: add at least one back-out step' }
];

/** Same output as the reference ruleGaps(q): [{s, m, p}] in order, skipping checks answered "Don't know". */
export function ruleGaps(q) {
  const x = ruleContext(q.record), o = [];
  for (const rule of RULES) {
    const list = rule.each ? rule.each(x).map((p, i) => [i, p]) : [[undefined, undefined]];
    for (const [i, p] of list) {
      if (!rule.when(x, i, p)) continue;
      const path = typeof rule.flag === 'function' ? rule.flag(x, i) : rule.flag || undefined;
      if (!path || !fl(x.r, path)) o.push({ s: rule.screen, m: rule.msg(x, i), p: path, rule: rule.id, fix: rule.fix });
    }
  }
  return o;
}

export { trig, hasStep, impHas, ABS };

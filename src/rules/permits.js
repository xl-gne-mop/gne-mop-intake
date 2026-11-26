// Permits and notices the work triggers; yearly library review flag.
// Ported from reference/rebuild-5/index.html (r5:355-356); bodies verbatim.
import { R, S, cfg, now } from '../core/state.js';
import { libById } from '../lib/library.js';

function permitsFor(r){const e=libById(r.x.lib&&r.x.lib.id),p=new Set((e&&e.permits)||[]);if(r.sup.hot==='Yes')p.add('GNE hot work permit');if(r.sup.impair==='Yes')p.add('Fire impairment notice (Siemens FLS)');if(r.sup.watch==='Yes')p.add('Fire watch');if(r.loto.needed==='Yes')p.add('JLL LOTO request');if(r.sup.cgmp==='Yes')p.add('GNE QA notice or approval (case by case)');return[...p]}
const reviewDue=e=>{const m=/^(\d\d)\/(\d\d)\/(\d\d)$/.exec(e&&e.reviewed||'');if(!m)return false;return (now()-new Date(2000+ +m[3],m[1]-1,+m[2]))/864e5>365};

export { permitsFor, reviewDue };

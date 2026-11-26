// Permits and notices the work triggers; yearly library review flag.
// Ported from reference/rebuild-5/index.html (r5:355-356); bodies verbatim.
import { R, S, cfg, now } from '../core/state.js';
import { libById } from '../lib/library.js';
import { reviewPermits, offSiteHot } from './review.js';

function permitsFor(r){const e=libById(r.x.lib&&r.x.lib.id),p=new Set((e&&e.permits)||[]);if(r.sup.hot==='Yes')p.add('GNE hot work permit');if(r.sup.impair==='Yes')p.add('Fire impairment notice (Siemens FLS)');if(r.sup.watch==='Yes')p.add('Fire watch');if(r.loto.needed==='Yes')p.add('JLL LOTO request');if(r.sup.cgmp==='Yes')p.add('GNE QA notice or approval (case by case)');
 /* MOP review 11/26/26: off-site shop hot work has no on-site permit (GS-39); permit types and notices are in allPermits */
 if(offSiteHot(r)){p.delete('GNE hot work permit');p.delete('Fire watch')}return[...p]}
/** Everything the Support screen lists: the reference permits plus the review's permit types and notices. */
const allPermits=r=>[...new Set([...permitsFor(r),...reviewPermits(r)])];
const reviewDue=e=>{const m=/^(\d\d)\/(\d\d)\/(\d\d)$/.exec(e&&e.reviewed||'');if(!m)return false;return (now()-new Date(2000+ +m[3],m[1]-1,+m[2]))/864e5>365};

export { permitsFor, allPermits, reviewDue };

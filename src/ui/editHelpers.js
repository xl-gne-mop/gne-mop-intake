// Small editing helpers from Rebuild 5 (r5:458-459): note when a library default was changed (pilot
// "defaults changed"), and clear a "Don't know" flag once the question is answered. Verbatim.
import { S, D } from '../core/state.js';

function trackEdit(p,old,v){if(old===undefined||old===null||String(old).trim()===''||String(old)===String(v))return;const r=D(),k=p.startsWith('x.')?p.split('.').slice(0,2).join('.'):p.split('.')[0];if(r.x.auto[k]&&!r.x.autoEd[k])r.x.autoEd[k]=true}
function clearFlag(p,v){const r=D();if(r.x.flags[p]&&String(v??'').trim())delete r.x.flags[p]}


export { trackEdit, clearFlag };

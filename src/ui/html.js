// Small HTML helpers shared by screens (r4:439 msgList).
import { S, STEPS, esc } from '../core/state.js';
export function msgList(v,fix){if(!v.length)return '';const L={err:'Fix',warn:'Check',info:'Note'};return `<ul class="msgs">${v.map(x=>`<li class="${x.l}"><b>${L[x.l]}</b><span>${esc(x.m)}</span>${fix&&S.view==='edit'&&x.s!=null?`<button data-a="go" data-i="${x.s}">${esc(STEPS[x.s])}</button>`:''}</li>`).join('')}</ul>`}

// Import a past MOP written in the GNE template (.docx): v1 (one table) or v2 (three tables, 11/26/26).
// Ported from reference/rebuild-4/index.html (r4:295-329); function bodies kept as close to verbatim as possible.
import { R, S, STEPS, STATUSES, SIDE, UTIL, GROUPS, SYSTEM_CODES, LOTO_CATS, CAT_MAP, CONTACT_ROLES, APPROVER_ROLES, ICON_MIC, $, esc, clone, uidGen, cfg, proj, safeUrl, pad3, mopLabel, toast, now, fS, fL, isoDay, pdDay, fromIso, fileUrl, D, later } from '../core/state.js';
import { newRecord } from '../core/record.js';
import { libMatches } from '../lib/library.js';
import { splitImpacts } from './impacts.js';
import { importEmbedded } from './embedded.js';

function parseMopDocx(u8){const parts=R.unzipSync(u8),xml=parts['word/document.xml'];if(!xml)throw new Error('Not a Word document');
 const doc=new DOMParser().parseFromString(R.strFromU8(xml),'application/xml'),W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',W14='http://schemas.microsoft.com/office/word/2010/wordml';
 /* Template v2 (11/26/26): the body has 3 tables (form, page 2 on, continuation sheet); read every row in order. */
 const body=doc.getElementsByTagNameNS(W,'body')[0],tbls=body?[...body.childNodes].filter(n=>n.localName==='tbl'):[];if(!tbls.length)throw new Error('No MOP table found');
 const rows=tbls.flatMap(t=>[...t.childNodes].filter(n=>n.localName==='tr')),cells=tr=>[...tr.childNodes].filter(n=>n.localName==='tc');
 const txt=n=>[...n.getElementsByTagNameNS(W,'t')].map(t=>t.textContent).join('').replace(/[☐☒]/g,'').replace(/\s+/g,' ').trim();
 const paras=n=>[...n.getElementsByTagNameNS(W,'p')].map(txt);
 const checks=tr=>[...tr.getElementsByTagNameNS(W,'sdt')].filter(s=>s.getElementsByTagNameNS(W14,'checkbox').length).map(s=>({on:(s.getElementsByTagNameNS(W14,'checked')[0]||{getAttributeNS:()=>''}).getAttributeNS(W14,'val')==='1',lab:txt(s.parentNode)}));
 const rec=newRecord();rec.impacts=[];rec.steps=[];rec.workers=[];const GN={'Environmental':'env','HVAC Systems':'hvac','Electrical Systems':'elec','Life Safety Systems':'ls','Laboratory Systems':'lab','Security Systems':'sec','Technology Systems':'tech','Utility Systems':'util'};
 const H=/^(\d{1,2})\. (Cont\. )?(Impact Notification|Impact Description|Personnel Contact|Safety Requirements|Required Tools|Required Personnel|Detailed Step-by-Step|Go \/ No-Go|Back-Out|MOP Author|Owner|Qualified)/;
 let sec=0,grp=null,mopNo='',tools=[],crew=[],gn=[],bo=[],rts=[];
 const strip=t=>t.replace(/^\s*(\d+[.)]|[-•*])\s*/,'').trim();
 /* "Mitigation:", an arrow, or a "Mitigations:" paragraph splits impact and mitigation (src/import/impacts.js) */
 const impLines=(c,kind)=>rec.impacts.push(...splitImpacts(paras(c).slice(1).filter(Boolean).map(l=>({kind,impact:strip(l),mitigation:''}))));
 rows.forEach((tr,ri)=>{const cs=cells(tr),ct=cs.map(txt),all=ct.join(' '),hm=H.exec(all);
  if(ri===0){const ck=checks(tr);[['High','H'],['Medium','M'],['Low','L']].forEach(([l,v])=>{if(ck.some(c=>c.on&&c.lab===l))rec.priority=v});mopNo=((/#\s*(\S+)\s*rev\s*(\S+)/i.exec(all))||[]).slice(1).join(' rev ');return}
  if(hm){sec=+hm[1];grp=null;if(sec===2){}return}
  /* Template v2 round 3: the close-out block and the change log page are not MOP content to read back */
  if(cs.length===1&&/^(Close-out Verification|MOP Change Log)/.test(ct[0])){sec=99;grp=null;return}
  if(sec===3&&ct[0]==='Emergency / On-Call'){sec=98;return}
  const lab=(c,l)=>c.startsWith(l)?c.slice(l.length).trim():null;
  ct.forEach(c=>{let v;if((v=lab(c,'MOP Title:'))!==null)rec.title=v;if((v=lab(c,'Work Scope:'))!==null)rec.scope=v.replace(/\s*\(Origin:.*\)\s*$/,'');if((v=lab(c,'Work Area(s):'))!==null)rec.areas=v;const sm=/^([A-Za-z][\w&.'-]*) MOP #:\s*(.*)$/.exec(c);if(sm){rec.subMop=sm[2].trim();if(sm[1]!=='Sub')rec.subShort=sm[1]}});
  if(sec===1){if(GN[ct[0]]){grp=GN[ct[0]];const g=grp==='util'?rec.x.util:rec.sys[grp];checks(tr).forEach(c=>{if(c.on){if(/^Low/.test(c.lab))g.level='L';if(/^Medium/.test(c.lab))g.level='M';if(/^High/.test(c.lab))g.level='H'}});return}
   if(/^GMP \/ QA:/.test(ct[0])){rec.x.gmpNotes='';return}
   if(grp){const g=grp==='util'?rec.x.util:rec.sys[grp];if(/^Notes:/.test(ct[0])){g.notes=ct[0].replace(/^Notes:\s*/,'');grp=null;return}
    checks(tr).forEach(c=>{if(!c.on)return;if(/^Other:/.test(c.lab))g.other=c.lab.replace(/^Other:\s*/,'');else g.items.push(c.lab)})}}
  if(sec===2){if(/^Planned Impact/.test(ct[0]))impLines(cs[0],'Planned');if(/^Potential Impact/.test(ct[0]))impLines(cs[0],'Potential')}
  if(sec===4&&/^6\./.test(ct[0]))rec.safety=strip(ct[0]);
  if(sec===5)ct.forEach(c=>{const t=strip(c);if(t&&/^\d+\./.test(c))tools.push(t)});
  if(sec===6)ct.forEach(c=>{const t=strip(c);if(t&&/^\d+\./.test(c))crew.push(t)});
  if(sec===7&&/^(9|10)$/.test(ct[0])&&ct[1])rec.pre.push({desc:ct[1],dur:ct[2]||''});
  if(sec===7&&/^Isolation verified/.test(ct[0])){const by=ct[0].replace(/^.*?Print Name:\s*/,'').trim(),by2=/^Second check \/ Time:/.test(ct[1]||'')?ct[1].replace(/^Second check \/ Time:\s*/,'').trim():'';if(by&&by!=='N/A')rec.x.isoBy=by;if(by2)rec.x.isoBy2=by2}
  if(sec===8&&/^\d+$/.test(ct[0])&&ct[1])rec.steps.push({desc:ct[1],dur:ct[2]||''});
  if(sec===9&&/^\d+$/.test(ct[0])&&ct[1])gn.push(ct[1]);
  if(sec===10&&/^\d\)/.test(ct[0])){const t=strip(ct[0]);if(t)bo.push(t)}
  if(sec===11&&/^\d+$/.test(ct[0])&&/^Return to service:/i.test(ct[1]||''))rts.push(ct[1].replace(/^Return to service:\s*/i,''))});
 Object.values(rec.sys).forEach(g=>{g.items=g.items.filter(Boolean)});
 rec.tools=tools.join('\n');rec.crew=crew.join('\n');rec.gonogo=gn.join('\n');rec.backout=bo.join('\n');rec.x.rts=rts.join('\n');
 if(!rec.steps.length)rec.steps=[{desc:'',dur:''}];if(!rec.impacts.length)rec.impacts=[{kind:'Planned',impact:'',mitigation:''}];
 const m=libMatches(rec);if(m[0]&&m[0].e.kind==='std'){rec.discipline=m[0].e.discipline}
 return{rec,mopNo}}

/* Template v2 round 3 (JK #8 option A): a MOP this app made carries a hidden copy of its record. Use it, re-reading
   only the sections someone edited by hand; otherwise (no saved data) the label reading above, as before. */
function readMopDocx(u8){const o=parseMopDocx(u8),parts=R.unzipSync(u8),txt={};
 for(const k of Object.keys(parts))if(k==='word/document.xml'||/^customXml\/item\d+\.xml$/.test(k))txt[k]=R.strFromU8(parts[k]);
 let e={found:false};try{e=importEmbedded(txt,o.rec,{DOMParser,XMLSerializer})}catch(err){e={found:false}}
 if(!e.found)return{...o,info:[],warn:[],embedded:false};
 return{rec:R.parseRecord(e.rec),mopNo:e.mopNo||o.mopNo,info:e.info,warn:e.warn,embedded:true,edited:e.edited}}

export { parseMopDocx, readMopDocx };

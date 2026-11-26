// Guided dictation: the parser works on TEXT (Web Speech output or the phone keyboard's dictation).
// Ported from reference/rebuild-5/index.html:368-392 (DG, NUMW, TAGP, spokenTags, canonTag, findTags, PANEL),
// with the 4 fixes JK approved (P2), each marked "P2 fix". Everything else gives the reference result.
const DG=[['What work',/\b(replac|install|remov|demo|tie|connect|disconnect|relocat|test|repair|cut|swap|upgrad|add|mov|shut|isolat|rewir|re-?rout|cap|weld|braz|program|patch|replace|freez)\w*/i],['Where (building, room)',/\b(B\d{1,3}|building|bldg|room|rm\b|level|floor|L\d\b|lab\b|roof|corridor|mezz)/i],['Which equipment (tag)',null],['Why',/\b(because|so that|so we can|to allow|due to|per |required|needed|in order to|owner|new |failed|leak|upgrade|to (replace|install|repair|fix|add|connect|relocate|remove|swap|test|tie|upgrade|support|serve|feed))/i],['How long',/(\d+(\.\d+)?|one|two|three|four|five|six|eight|ten|twelve|half)\s*-?\s*(hours?|hrs?|minutes?|mins?|days?|shifts?)\b/i],['What goes down',/\b(shut ?down|outage|out of service|lose|loss of|without|down\b|interrupt|impair|isolat|lock ?out|loto|off\b)/i]];
const NUMW={zero:0,oh:0,o:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
const TAGP='LP|HP|HLP|ELP|ULP|LLP|MDP|DP|HDP|EDP|MSB|SWBD|SWGR|MCC|ATS|UPS|GEN|XFMR|TX|PNL|AHU|EF|SF|RF|MAU|FCU|VAV|CRAC|CRAH|CH|CT|CWP|HWP|P|B|IDF|MDF|FACP|FACU|V|CV|PRV|TMV|HX|BSC|FH|CR|SP|EWS|EW|SS';
function spokenTags(text){const tk=text.split(/(\s+|,|\.(?=\s|$))/),out=[];let i=0;
 const isL=w=>/^[A-Z]$/.test(w)||/^(dash|hyphen)$/i.test(w),nw=w=>w.toLowerCase().replace(/[^a-z]/g,'');
 const words=[];let pos=0;for(const t of tk){if(t&&!/^\s+$/.test(t))words.push({w:t,at:pos,brk:/^,$|^\.$/.test(t)});pos+=t.length} /* P2 fix 1: a comma or period ends the tag (was dropped, so 'four, eight' became 48) */
 while(i<words.length){let j=i,L='';while(j<words.length&&!words[j].brk&&isL(words[j].w)){if(!/^(dash|hyphen)$/i.test(words[j].w))L+=words[j].w;j++}
  if(L.length>=1&&(L.length>=2||/^[VPB]$/.test(L))&&j<words.length){let num='',k=j,suf='';
   while(k<words.length){if(words[k].brk)break;const w=nw(words[k].w);if(/^\d+$/.test(words[k].w)){num+=words[k].w;k++;continue}if(w in NUMW){let v=NUMW[w];if(v>=20&&v%10===0&&k+1<words.length&&NUMW[nw(words[k+1].w)]<10&&NUMW[nw(words[k+1].w)]>0){v+=NUMW[nw(words[k+1].w)];k++}num+=String(v);k++;continue}break}
   if(num&&k<words.length&&/^[A-Z]$/.test(words[k].w)){suf=words[k].w;k++;if(k<words.length&&/^\d$|^(one|two|three|four|five|six|seven|eight|nine)$/i.test(words[k].w)){suf+=/^\d$/.test(words[k].w)?words[k].w:NUMW[nw(words[k].w)];k++}}
   if(num){const st=words[i].at,en=words[k-1].at+words[k-1].w.length;out.push({from:text.slice(st,en),tag:canonTag(L,num+suf)});i=k;continue}}
  i=Math.max(j,i+1)}return out}
function canonTag(L,rest){L=L.toUpperCase();const m=/^V(DIW|DCW|DHW|LCW|CDA|CHW|HHW|RO|PW|STM|N2|CO2)$/.exec(L);if(m)return `V-${m[1]}-${rest}`;return `${L}-${rest}`}
function findTags(text){const t=String(text||''),seen=new Set(),tags=[],rooms=[],bl=[];let dur=null;
 const push=(a,v)=>{if(!seen.has(v)){seen.add(v);a.push(v)}};
 spokenTags(t).forEach(x=>push(tags,x.tag));
 /* P2 fix 4: tag-looking text inside a room mention ("rooms B101 to B105") is a room, not a building */
 const roomSpans=[];{const rs=/\b(?:rooms?|rms?\.?)\s*#?\s*[A-Z]?\d{3,5}[A-Z]?(?:\s*(?:to|through|thru|-|–)\s*[A-Z]?\d{3,5}[A-Z]?)?\b/gi;let q;while((q=rs.exec(t)))roomSpans.push([q.index,q.index+q[0].length])}
 const inRoom=i=>roomSpans.some(([s,e])=>i>=s&&i<e);
 const re=new RegExp(`\\b(V-?(?:DIW|DCW|DHW|LCW|CDA|CHW|HHW|RO|PW)|${TAGP})[-\\s]?(\\d{1,4}[A-Z]{0,2}\\d{0,2})\\b`,'g');let m;
 while((m=re.exec(t))){if(inRoom(m.index))continue;if(m[1]==='B'){push(bl,'B'+m[2]);continue}if(m[1]==='P'&&!/-/.test(m[0]))continue;const p=m[1].replace(/^V-?/,'V-');push(tags,p.startsWith('V-')&&p.length>2?`${p}-${m[2]}`:`${m[1]}-${m[2]}`)}
 const rg=/\b(?:rooms?|rms?\.?)\s*#?\s*([A-Z]?\d{3,5}[A-Z]?)\s*(?:to|through|thru|-|–)\s*([A-Z]?\d{3,5}[A-Z]?)\b/gi;const inRange=new Set();while((m=rg.exec(t))){push(rooms,`Rooms ${m[1].toUpperCase()}–${m[2].toUpperCase()}`);inRange.add(m[1].toUpperCase())}
 const rr=/\b(?:rooms?|rm\.?)\s*#?\s*([A-Z]?\d{3,5}[A-Z]?)\b/gi;while((m=rr.exec(t)))if(!inRange.has(m[1].toUpperCase()))push(rooms,'Room '+m[1].toUpperCase());
 /* P2 fix 3: number words for buildings, including tens + units ("building fifty one" -> B51) */
 const WN='(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\\s-]+(?:one|two|three|four|five|six|seven|eight|nine))?|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|one|two|three|four|five|six|seven|eight|nine|ten';
 const wordNum=s=>s.toLowerCase().split(/[\s-]+/).reduce((n,w)=>n+(NUMW[w]||0),0);
 const br=new RegExp(`\\b(?:building|bldg\\.?)\\s*(\\d{1,3}[A-Z]?|${WN})\\b`,'gi');while((m=br.exec(t)))push(bl,'B'+(/^\d/.test(m[1])?m[1].toUpperCase():wordNum(m[1])));
 /* P2 fix 2: every number word counts for a duration, e.g. "thirty minutes" (the reference list stopped at twelve) */
 const dm=new RegExp(`(\\d+(?:\\.\\d+)?|\\b(?:${WN})|half an?)\\s*-?\\s*(hours?|hrs?|minutes?|mins?|days?)\\b`,'i').exec(t);
 if(dm){const n=/half/i.test(dm[1])?0.5:/^\d/.test(dm[1])?parseFloat(dm[1]):wordNum(dm[1]);const u=dm[2][0].toLowerCase();dur={val:u==='m'?Math.round(n/60*100)/100:n,unit:u==='d'?'days':'hours',text:dm[0]}}
 return{tags,rooms,bldg:bl,dur,spoken:spokenTags(t)}}
const PANEL=/^(LP|HP|HLP|ELP|ULP|LLP|MDP|DP|HDP|EDP|MSB|SWBD|SWGR|MCC|PNL|ATS|UPS)-/;

export { DG, NUMW, TAGP, PANEL, spokenTags, canonTag, findTags };

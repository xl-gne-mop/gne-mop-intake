// Outputs: MOP .docx, Impact Log tracker, LOTO log rows, JLL packet.
// Ported from reference/rebuild-4/index.html (r4:487-492; r4:496-534); function bodies kept as close to verbatim as possible.
import { R, S, STEPS, STATUSES, SIDE, UTIL, GROUPS, SYSTEM_CODES, LOTO_CATS, CAT_MAP, CONTACT_ROLES, APPROVER_ROLES, ICON_MIC, $, esc, clone, uidGen, cfg, proj, safeUrl, pad3, mopLabel, toast, now, fS, fL, isoDay, pdDay, fromIso, fileUrl, fetchFile, D, later } from '../core/state.js';
import { ensureX } from '../core/record.js';
import { tierOf, TIER_NAME } from '../rules/tier.js';
import { sigOf } from '../approve/signatures.js';
import { reviewPrint, mergeRefs } from '../rules/review.js';
import { fillMopV2, templateVersionOf } from '../mop/fillMopV2.js';
import { estimatePages, footerWithPages, appWithPages, headerWithMop, recordXml, RECORD_PART } from '../mop/package.js';
import { emergencyLines } from '../rules/emergency.js';
import { allPermits } from '../rules/permits.js';
import { gatePending, GATE_MESSAGE } from '../import/anymop/apply.js';

/* JK decision P1: the Rebuild 5 print additions are on unless lists.json PrintAdditions = No, which prints
   exactly the Rebuild 4 MOP. Both versions are verbatim (r4:487, r5:667-676); sri.js is untouched either way. */
function outRecord(q){return cfg().printAdditions===false?outRecordR4(q):outRecordR5(q)}
function outRecordR4(q){const r=clone((q.sub||q).record);const j=q.meta.jllRef||{};['assistWO','lotoWO','lotoNo'].forEach(k=>{if((j[k]||'').trim())r.jllRef[k]=j[k].trim()});return R.parseRecord(r)}
function outRecordR5(q){const r=ensureX(clone((q.sub||q).record));const j=q.meta.jllRef||{};['assistWO','lotoWO','lotoNo'].forEach(k=>{if((j[k]||'').trim())r.jllRef[k]=j[k].trim()});
 const x=r.x; // Template v2: the second checker has its own cell, so isoBy / isoBy2 stay apart (fillMopV2).
 let rts=R.lines(x.rts);const al=R.lines(x.alarms);if(al.length)rts.push('All suppressed alarms restored and clear: '+al.join('; '));
 if(r.sup.impair==='Yes'&&!rts.some(l=>/impairment/i.test(l)))rts.push('Impairment closed with Siemens FLS; monitoring company and notified parties told');
 if(rts.length>6)rts=rts.slice(0,5).concat(rts.slice(5).join('; '));x.rts=rts.join('\n');
 const t=tierOf(r),add=[`Risk ${TIER_NAME[t.t].replace('Tier','tier')}${t.why.length?' ('+t.why.join(', ')+')':''}`];
 if(x.backfeed==='Yes')add.push('Other power source: '+x.backfeedSrc.trim()+' – locked out');else if(x.backfeed==='No')add.push('No other power source (checked in the field)');
 if(x.cold==='Yes')add.push('Cold storage on the outage – temperature plan in section 2');if(x.eyewash==='Yes')add.push('Eyewash / shower coverage in section 2');if(x.dp.trim())add.push('Room pressure to restore: '+x.dp.trim());
 mergeRefs(q,r);add.push(...reviewPrint(r)); // MOP review 11/26/26: references, permits, flags, point details, emergency numbers (empty = nothing added)
 if(x.lib&&x.lib.ver)add.push(`Built from library work type "${x.lib.name}" v${x.lib.ver}`);
 r.safety=[r.safety.trim().replace(/\.?$/,r.safety.trim()?'.':''),add.join('. ')+'.'].filter(Boolean).join(' ');return R.parseRecord(r)}
function jllText(q){const sub=q.sub,rec=outRecord(q);let t=R.jllPacket(rec,proj(q.project),q.mopNo,sub?sub.rev:q.rev,now(),cfg().rules);
 const att=rec.loto.needed==='Yes'?rec.loto.points.flatMap(p=>p.att||[]):[];if(att.length)t+=`\n\nLOTO attachments: ${att.length} marked-up file${att.length>1?'s':''} (${[...new Set(att.map(a=>a.cat))].join(', ')}), printed at the end of the MOP. Attach the MOP in Quickbase.`;return t}
/** The cached MOP template is v1 (the GNE template before 11/26/26). Never print a black v1 MOP. */
class TemplateOutOfDate extends Error{constructor(){super('MOP template out of date – sync to update');this.code='template-v1'}}
const dom={DOMParser:window.DOMParser,XMLSerializer:window.XMLSerializer};
const b64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const tplParts=k=>R.unzipSync(b64(S.tpl[k]));
function imgSize(b){if(b.length>24&&b[0]===0x89&&b[1]===0x50){const v=new DataView(b.buffer,b.byteOffset);return[v.getUint32(16),v.getUint32(20)]}if(b[0]===0xff&&b[1]===0xd8){let i=2;while(i+9<b.length){if(b[i]!==0xff){i++;continue}const m=b[i+1],len=(b[i+2]<<8)|b[i+3];if(m>=0xc0&&m<=0xcf&&m!==0xc4&&m!==0xc8&&m!==0xcc)return[(b[i+7]<<8)|b[i+8],(b[i+5]<<8)|b[i+6]];i+=2+len}}return null}
/** Import Any MOP: no .docx while an imported safety-critical field is unconfirmed (the Import Gate). */
class ImportGate extends Error{constructor(n){super(GATE_MESSAGE(n));this.code='import-gate'}}
async function buildMop(q){const sub=q.sub,rec=outRecord(q),p=proj(q.project);if(!p)throw new Error('project');
 {const n=gatePending(q.meta&&q.meta.importReview).length;if(n)throw new ImportGate(n)}
 const parts={...tplParts('mop')},xml=R.strFromU8(parts['word/document.xml']),{maxW,maxH}=R.imageBox(xml);
 if(templateVersionOf(xml)!==2)throw new TemplateOutOfDate();
 let rels=R.strFromU8(parts['word/_rels/document.xml.rels']),ct=R.strFromU8(parts['[Content_Types].xml']);const atts=[];let n=0;
 const lotoAtt=rec.loto.needed==='Yes'?rec.loto.points.flatMap((pt,k)=>(pt.att||[]).map(a=>{const sh=[a.shows&&a.shows.iso?'isolation point':'',a.shows&&a.shows.loads?'affected loads':''].filter(Boolean);
  return{name:`LOTO point ${k+1}: ${[pt.equip,pt.point].filter(Boolean).join(' ')} – ${a.cat}${a.mid||a.premarked?', marked up':''}${sh.length?' to show the '+sh.join(' and '):''}`,cat:CAT_MAP[a.cat]||'Other',src:a.mid||(a.kind==='image'?a.id:'')}})):[];
 const allAtt=[...lotoAtt,...(sub.files||[]).filter(f=>!f.source).map(f=>({name:f.name,cat:f.cat,src:f.kind==='image'?f.id:''}))]; // the imported original is filed in Source/, not printed
 for(const f of allAtt){const images=[];
  if(f.src){try{const b=new Uint8Array(await (await fetchFile((f.src))).arrayBuffer()),sz=imgSize(b);if(sz){n++;let cx=maxW,cy=Math.round(maxW*sz[1]/sz[0]);if(cy>maxH){cy=maxH;cx=Math.round(maxH*sz[0]/sz[1])}
   const ext=b[0]===0x89?'png':'jpeg',rid='rIdAtt'+n,target=`media/att${n}.${ext}`;parts['word/'+target]=b;rels=rels.replace('</Relationships>',`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}"/></Relationships>`);images.push({rid,cx,cy,n,ext})}}catch(e){}}
  atts.push({name:f.name,cat:f.cat,note:f.src?'':'PDF filed in OneDrive with the MOP',images})}
 if(!/Extension="png"/i.test(ct))ct=ct.replace('<Default ','<Default Extension="png" ContentType="image/png"/><Default ');
 if(!/Extension="jpeg"/i.test(ct))ct=ct.replace('<Default ','<Default Extension="jpeg" ContentType="image/jpeg"/><Default ');
 const approved=['Approved','Executed','Closed'].includes(q.status),ld=R.lead(rec,now(),cfg().rules);
 const sg=sl=>sigOf(q,sl),names=id=>S.names[id]||'';
 const plus={additions:!!cfg().additions,approved,x:rec.x||ensureX({}).x,
  preDone:Array.from({length:10},(_,k)=>q.meta.preDone[k]?fL(pdDay(q.meta.preDone[k])):''),
  esign:{approvers:p.approvers.map((a,k)=>{const s=sg('a'+k);return s?{date:fL(fromIso(s.at)),name:names(s.uid)}:null}),author:sg('author')?fL(fromIso(sg('author').at)):null,supervisor:sg('super')?{name:names(sg('super').uid),date:fL(fromIso(sg('super').at))}:null}};
 const revisedOn=sub.rev?fromIso(sub.at):null;
 // Template v2 round 3 (JK 11/26/26): tier, work type, permits, close-out, change log, emergency / on-call lines
 const tier=tierOf(rec).t;plus.x={...plus.x,tier,lib:rec.x.lib||null,permits:{...(rec.x.permits||{}),other:mopOtherPermits(rec)}};plus.close=closeOutFor(q);
 const filled=fillMopV2(xml,{record:rec,project:p,mopNo:q.mopNo,rev:sub.rev,submitted:fromIso(q.firstAt||sub.at),revisedOn,attachments:atts,companyNames:cfg().companyNames||[],
  emergency:emergencyLines(rec,cfg(),tier),changeLog:changeLogFor(q,rec)},plus,dom,R);
 parts['word/document.xml']=R.strToU8(filled);
 { // package parts (round 3 template; each one optional): running header, page count, hidden copy of the record
  const txt=k=>parts[k]?R.strFromU8(parts[k]):null,put=(k,v)=>{if(v!=null)parts[k]=R.strToU8(v)};
  const hdr={mopNo:q.mopNo,rev:sub.rev,title:rec.title,start:R.startOf(rec)};['word/header1.xml','word/header3.xml'].forEach(k=>{if(parts[k])put(k,headerWithMop(txt(k),hdr))});
  const pages=estimatePages(filled,dom);['word/footer1.xml','word/footer2.xml'].forEach(k=>{if(parts[k])put(k,footerWithPages(txt(k),pages))});
  if(parts['docProps/app.xml'])put('docProps/app.xml',appWithPages(txt('docProps/app.xml'),pages+(/MOP Change Log/.test(filled)?1:0)));
  if(parts[RECORD_PART])put(RECORD_PART,recordXml(filled,{app:'gne-mop-intake',templateRevision:3,projectId:q.project,mopNo:q.mopNo,rev:sub.rev,status:q.status,record:clone(sub.record)},dom,now())); }
 parts['word/_rels/document.xml.rels']=R.strToU8(rels);parts['[Content_Types].xml']=R.strToU8(ct);
 const ordered={'[Content_Types].xml':parts['[Content_Types].xml']};for(const k of Object.keys(parts))if(k!=='[Content_Types].xml')ordered[k]=parts[k];
 return{bytes:R.zipSync(ordered,{level:6}),name:R.baseName(rec,q.mopNo,sub.rev)+(approved?'':'_DRAFT')+'.docx'}}
/** "Other Permits" on the MOP: the permits the work triggers, less the ones with their own line (impairment #, fire watch, hot work #, JLL LOTO). */
const OWN_LINE=/hot work permit|fire impairment notice|^fire watch$|JLL LOTO request/i;
function mopOtherPermits(r){try{return allPermits(r).filter(x=>!OWN_LINE.test(String(x)))}catch(e){return[]}}
/** Close-out by / time from the close-out checklist (ticks saved as { by: uid, at } since round 3; older ticks are true). */
function closeOutFor(q){const c=q.meta.close||{},v=k=>{const e=c[k];if(!e)return null;if(e===true)return{by:'',time:''};const d=fromIso(e.at);return{by:S.names[e.by]||'',time:d?`${fS(d)} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`:''}};
 const al=Object.keys(c).filter(k=>/^a\d+$/.test(k)||k==='fls').map(v).filter(Boolean);
 return{loto:v('loto'),alarms:al.length?al[al.length-1]:null,watch:v('watch'),hot:v('hot'),users:v('users'),qa:v('qa')}}
/** Change log rows: one per submitted revision (q.meta.revLog, since round 3); rev 0 = Initial issue. */
function changeLogFor(q,rec){const log=(q.meta.revLog||[]).map(e=>({rev:e.rev,date:fL(fromIso(e.at)),by:S.names[e.by]||'',change:e.change||''}));
 if(!log.some(e=>+e.rev===0)&&q.firstAt)log.unshift({rev:0,date:fL(fromIso(q.firstAt)),by:(rec.author||'').trim()||rec.req.name,change:'Initial issue'});
 const cur=(q.sub||q).rev||0;for(let n=1;n<=cur;n++)if(!log.some(e=>+e.rev===n))log.push({rev:n,date:'',by:'',change:''});
 return log.sort((a,b)=>a.rev-b.rev)}
function trackerVals(q){const rec=outRecord(q),sub=q.sub,row=R.impactRow(rec,q.mopNo),jll=R.jllNeeded(rec),pd=q.meta.preDone,lo=rec.loto.needed==='Yes';
 const sig=k=>!!sigOf(q,'a'+k),st=q.status;
 row[0]=sub.rev?`${pad3(q.mopNo)} rev ${sub.rev}`:q.mopNo;
 row[8]=pd[0]?'Yes':'No';row[9]=rec.sup.walk==='Yes'||pd[1]?'Yes':(rec.sup.walk||'No');row[15]=jll?(pd[2]?'Yes':'No'):'N/A';row[17]=lo?(pd[3]?'Yes':'No'):'N/A';
 const b=[sig(0),sig(1),sig(2),sig(3),sig(4),['Approved','Executed','Closed'].includes(st),!!q.meta.campus,['Executed','Closed'].includes(st)];
 return row.slice(0,20).concat(b)}
function buildTracker(list){const c=cfg(),T=tplParts('trk');let x=R.strFromU8(T['xl/worksheets/sheet2.xml']);
 const rows=list.map(trackerVals),h=rows.map(r=>Math.min(409,15*Math.max(2,...r.map(v=>String(v??'').split('\n').length))+6));
 x=R.fillSheet(x,6,'B',rows,92,dom,h);['E2','L2','P2','T2'].forEach(k=>{x=R.setCell(x,k,c.trk[k],dom)});
 let rels=R.strFromU8(T['xl/worksheets/_rels/sheet2.xml.rels']);const url=safeUrl(c.folder);
 if(url)rels=rels.replace('https://onedrive.example/REPLACE_FOLDER',url.replace(/&/g,'&amp;').replace(/"/g,'&quot;'));
 else{const id=(/Id="(rId\d+)"[^>]*REPLACE_FOLDER/.exec(rels)||[])[1];rels=rels.replace(/<Relationship [^>]*REPLACE_FOLDER[^>]*\/>/,'');if(id)x=x.replace(new RegExp(`<hyperlink [^>]*r:id="${id}"[^>]*/>`),'').replace('<hyperlinks></hyperlinks>','')}
 T['xl/worksheets/sheet2.xml']=R.strToU8(x);T['xl/worksheets/_rels/sheet2.xml.rels']=R.strToU8(rels);return R.zipSync(T,{level:6})}
function lotoVals(q){const rec=outRecord(q),stamp=fromIso(q.sub.at);return R.lotoRows(rec,proj(q.project),stamp).map(r=>{const v=r.slice();v[0]=r[0]==='TRUE';const s=R.startOf(rec);v[4]=s?{date:s}:'';return v})}
/* Smartsheet LOTO-request columns A–K for each row: one row per isolation point (the LOTO log values), or, when the
   request has no LOTO points, one row filled from the intake form instead of left blank. "Duration of LOTO" is a
   DATE column in the sheet, so it gets the planned end date; Timestamp is the submit time (MM/DD/YY h:mm AM). */
const p2=n=>String(n).padStart(2,'0');
const ssStamp=d=>d?`${p2(d.getMonth()+1)}/${p2(d.getDate())}/${p2(d.getFullYear()%100)} ${d.getHours()%12||12}:${p2(d.getMinutes())} ${d.getHours()<12?'AM':'PM'}`:'';
function smartsheetVals(q){const rec=outRecord(q),p=proj(q.project)||{},at=fromIso(q.sub.at),s=R.startOf(rec),e=R.endOf(rec);
 const loc=`${rec.bldg} – ${String(rec.areas||'').replace(/\n/g,'; ')}`;
 const rows=rec.loto.needed==='Yes'&&rec.loto.points.length?lotoVals(q):[[false,p.job||p.label||'',rec.req.name,rec.req.company,s?{date:s}:'',loc,rec.equip,'No LOTO needed',String(rec.users||rec.areas||'').trim(),'','']];
 return rows.map(v=>{const o=v.slice();o[9]=e?{date:e}:'';o[10]=ssStamp(at);return o})}
function buildLoto(list){const O=tplParts('loto');let x=R.strFromU8(O['xl/worksheets/sheet1.xml']);const rows=list.flatMap(lotoVals);
 x=R.fillSheet(x,2,'A',rows.length?rows:[[]],2,dom);O['xl/worksheets/sheet1.xml']=R.strToU8(x);return R.zipSync(O,{level:6})}

export { TemplateOutOfDate, ImportGate, outRecordR4, outRecordR5, outRecord, jllText, dom, b64, tplParts, imgSize, buildMop, trackerVals, buildTracker, lotoVals, buildLoto, smartsheetVals };

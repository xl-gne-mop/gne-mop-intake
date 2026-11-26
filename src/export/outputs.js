// Outputs: MOP .docx, Impact Log tracker, LOTO log rows, JLL packet.
// Ported from reference/rebuild-4/index.html (r4:487-492; r4:496-534); function bodies kept as close to verbatim as possible.
import { R, S, STEPS, STATUSES, SIDE, UTIL, GROUPS, SYSTEM_CODES, LOTO_CATS, CAT_MAP, CONTACT_ROLES, APPROVER_ROLES, ICON_MIC, $, esc, clone, uidGen, cfg, proj, safeUrl, pad3, mopLabel, toast, now, fS, fL, isoDay, pdDay, fromIso, fileUrl, fetchFile, D, later } from '../core/state.js';
import { ensureX } from '../core/record.js';
import { tierOf, TIER_NAME } from '../rules/tier.js';
import { sigOf } from '../approve/signatures.js';

/* JK decision P1: the Rebuild 5 print additions are on unless lists.json PrintAdditions = No, which prints
   exactly the Rebuild 4 MOP. Both versions are verbatim (r4:487, r5:667-676); sri.js is untouched either way. */
function outRecord(q){return cfg().printAdditions===false?outRecordR4(q):outRecordR5(q)}
function outRecordR4(q){const r=clone((q.sub||q).record);const j=q.meta.jllRef||{};['assistWO','lotoWO','lotoNo'].forEach(k=>{if((j[k]||'').trim())r.jllRef[k]=j[k].trim()});return R.parseRecord(r)}
function outRecordR5(q){const r=ensureX(clone((q.sub||q).record));const j=q.meta.jllRef||{};['assistWO','lotoWO','lotoNo'].forEach(k=>{if((j[k]||'').trim())r.jllRef[k]=j[k].trim()});
 const x=r.x;if(x.isoBy2.trim())x.isoBy=[x.isoBy.trim(),'second check: '+x.isoBy2.trim()].filter(Boolean).join('; ');
 let rts=R.lines(x.rts);const al=R.lines(x.alarms);if(al.length)rts.push('All suppressed alarms restored and clear: '+al.join('; '));
 if(r.sup.impair==='Yes'&&!rts.some(l=>/impairment/i.test(l)))rts.push('Impairment closed with Siemens FLS; monitoring company and notified parties told');
 if(rts.length>6)rts=rts.slice(0,5).concat(rts.slice(5).join('; '));x.rts=rts.join('\n');
 const t=tierOf(r),add=[`Risk ${TIER_NAME[t.t].replace('Tier','tier')}${t.why.length?' ('+t.why.join(', ')+')':''}`];
 if(x.backfeed==='Yes')add.push('Other power source: '+x.backfeedSrc.trim()+' – locked out');else if(x.backfeed==='No')add.push('No other power source (checked in the field)');
 if(x.cold==='Yes')add.push('Cold storage on the outage – temperature plan in section 2');if(x.eyewash==='Yes')add.push('Eyewash / shower coverage in section 2');if(x.dp.trim())add.push('Room pressure to restore: '+x.dp.trim());
 if(x.lib&&x.lib.ver)add.push(`Built from library work type "${x.lib.name}" v${x.lib.ver}`);
 r.safety=[r.safety.trim().replace(/\.?$/,r.safety.trim()?'.':''),add.join('. ')+'.'].filter(Boolean).join(' ');return R.parseRecord(r)}
function jllText(q){const sub=q.sub,rec=outRecord(q);let t=R.jllPacket(rec,proj(q.project),q.mopNo,sub?sub.rev:q.rev,now(),cfg().rules);
 const att=rec.loto.needed==='Yes'?rec.loto.points.flatMap(p=>p.att||[]):[];if(att.length)t+=`\n\nLOTO attachments: ${att.length} marked-up file${att.length>1?'s':''} (${[...new Set(att.map(a=>a.cat))].join(', ')}), printed at the end of the MOP. Attach the MOP in Quickbase.`;return t}
const dom={DOMParser:window.DOMParser,XMLSerializer:window.XMLSerializer};
const b64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const tplParts=k=>R.unzipSync(b64(S.tpl[k]));
function imgSize(b){if(b.length>24&&b[0]===0x89&&b[1]===0x50){const v=new DataView(b.buffer,b.byteOffset);return[v.getUint32(16),v.getUint32(20)]}if(b[0]===0xff&&b[1]===0xd8){let i=2;while(i+9<b.length){if(b[i]!==0xff){i++;continue}const m=b[i+1],len=(b[i+2]<<8)|b[i+3];if(m>=0xc0&&m<=0xcf&&m!==0xc4&&m!==0xc8&&m!==0xcc)return[(b[i+7]<<8)|b[i+8],(b[i+5]<<8)|b[i+6]];i+=2+len}}return null}
async function buildMop(q){const sub=q.sub,rec=outRecord(q),p=proj(q.project);if(!p)throw new Error('project');
 const parts={...tplParts('mop')},xml=R.strFromU8(parts['word/document.xml']),{maxW,maxH}=R.imageBox(xml);
 let rels=R.strFromU8(parts['word/_rels/document.xml.rels']),ct=R.strFromU8(parts['[Content_Types].xml']);const atts=[];let n=0;
 const lotoAtt=rec.loto.needed==='Yes'?rec.loto.points.flatMap((pt,k)=>(pt.att||[]).map(a=>{const sh=[a.shows&&a.shows.iso?'isolation point':'',a.shows&&a.shows.loads?'affected loads':''].filter(Boolean);
  return{name:`LOTO point ${k+1}: ${[pt.equip,pt.point].filter(Boolean).join(' ')} – ${a.cat}${a.mid||a.premarked?', marked up':''}${sh.length?' to show the '+sh.join(' and '):''}`,cat:CAT_MAP[a.cat]||'Other',src:a.mid||(a.kind==='image'?a.id:'')}})):[];
 const allAtt=[...lotoAtt,...(sub.files||[]).map(f=>({name:f.name,cat:f.cat,src:f.kind==='image'?f.id:''}))];
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
 parts['word/document.xml']=R.strToU8(R.fillMopPlus(xml,{record:rec,project:p,mopNo:q.mopNo,rev:sub.rev,submitted:fromIso(q.firstAt||sub.at),revisedOn,attachments:atts},plus,dom));
 parts['word/_rels/document.xml.rels']=R.strToU8(rels);parts['[Content_Types].xml']=R.strToU8(ct);
 const ordered={'[Content_Types].xml':parts['[Content_Types].xml']};for(const k of Object.keys(parts))if(k!=='[Content_Types].xml')ordered[k]=parts[k];
 return{bytes:R.zipSync(ordered,{level:6}),name:R.baseName(rec,q.mopNo,sub.rev)+(approved?'':'_DRAFT')+'.docx'}}
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
function buildLoto(list){const O=tplParts('loto');let x=R.strFromU8(O['xl/worksheets/sheet1.xml']);const rows=list.flatMap(lotoVals);
 x=R.fillSheet(x,2,'A',rows.length?rows:[[]],2,dom);O['xl/worksheets/sheet1.xml']=R.strToU8(x);return R.zipSync(O,{level:6})}

export { outRecordR4, outRecordR5, outRecord, jllText, dom, b64, tplParts, imgSize, buildMop, trackerVals, buildTracker, lotoVals, buildLoto };

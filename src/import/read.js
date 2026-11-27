// Imports (any user): PDF / Word MOP form and the Excel intake.
// Ported from reference/rebuild-4/index.html (r4:644-662); function bodies kept as close to verbatim as possible.
import { R, S, STEPS, STATUSES, SIDE, UTIL, GROUPS, SYSTEM_CODES, LOTO_CATS, CAT_MAP, CONTACT_ROLES, APPROVER_ROLES, ICON_MIC, $, esc, clone, uidGen, cfg, proj, safeUrl, pad3, mopLabel, toast, now, fS, fL, isoDay, pdDay, fromIso, fileUrl, D, later, render, saveDraft } from '../core/state.js';
import { ensureX } from '../core/record.js';
import { allEntries, autoPick, chooseEntry, libById } from '../lib/library.js';
import { readMopDocx } from './docx.js';
import { splitImpacts } from './impacts.js';
import { pdfjs } from '../attach/markup.js';
import { msgList } from '../ui/html.js';
import { uploadBlob } from '../core/save.js';

/* Template v2 (11/26/26): a MOP printed from v2 shows the sub's short name in place of "Sub" ("REI MOP #:"). */
function subShortFromLines(rec,lines){for(const l of lines){const m=/(?:^|\s)([A-Za-z][\w&.'-]*) MOP #:/.exec(l.text||'');if(m&&m[1]!=='Sub'&&m[1]!=='MOP'){rec.subShort=m[1];return}}}
/* Template v2 round 3 (11/26/26): lines the Rebuild 4 PDF reader (imp.js, kept byte-identical) must not see –
   the running header on pages 2+, the emergency / on-call rows, the close-out block and the change log page. */
function v2PdfLines(lines){const out=[];let skip='';const t=l=>String(l.text||'').trim();
 for(const l of lines){const x=t(l);
  if(/^MOP #\d+ rev \d+\s+–/.test(x)&&/Execute Date:/.test(x))continue;
  if(/^Change log – not included/.test(x))continue;
  if(/^MOP Change Log\b/.test(x)){skip='log';continue}
  if(/^Close-out Verification\b/.test(x)){skip='close';continue}
  if(/^Emergency \/ On-Call\b/.test(x)){skip='em';continue}
  if(skip==='close'&&/^12\.\s+MOP Author/.test(x))skip='';
  if(skip==='em'&&/^\d{1,2}\.\s+\S/.test(x))skip='';
  if(skip)continue;out.push(l)}return out}
/* Excel intake v2 (decision #18): rows the Rebuild 4 reader doesn't know – sub short name, second isolation checker. */
function intakeExtras(rec,book){const req=book&&book.Request;if(!req)return rec;const row=k=>{for(const ref of Object.keys(req)){const m=/^Z(\d+)$/.exec(ref);if(m&&String(req[ref])===k)return m[1]}return null};
 const v=k=>{const r=row(k),x=r?req['C'+r]:null;return x==null?'':String(x).trim()};const ss=v('subShort'),i2=v('x.isoBy2');if(ss)rec.subShort=ss;if(i2){rec.x=rec.x||{};rec.x.isoBy2=i2}return rec}
async function readImport(file){const name=file.name,ext=(name.split('.').pop()||'').toLowerCase(),u8=new Uint8Array(await file.arrayBuffer());
 if(ext==='xlsx'||ext==='xlsm'){const bk=window.MOPIMP.readXlsx(u8),o=window.MOPIMP.parseIntakeXlsx(bk);intakeExtras(o.rec,bk);return{...o,kind:'Excel intake',file:name,name:o.rec.title||name}}
 if(ext==='docx'){const o=readMopDocx(u8);return{rec:o.rec,kind:o.embedded?'Word MOP (app data)':'Word MOP',file:name,name:`${o.mopNo?'MOP #'+o.mopNo+' – ':''}${o.rec.title||name}`,info:[`Read MOP${o.mopNo?' #'+o.mopNo:''}: ${o.rec.steps.filter(x=>x.desc).length} during-MOP steps, ${o.rec.impacts.filter(x=>x.impact).length} impacts.`,...o.info],warn:o.embedded?o.warn:['Not in the MOP form, so answer these in the app: discipline, in service, support questions, LOTO points and attachments.']}}
 if(ext==='pdf'){const L=await pdfjs(),doc=await L.getDocument({data:u8.slice(0)}).promise,lines=v2PdfLines(await window.MOPIMP.pdfLines(doc));
  if(lines.length<10)throw new Error('This PDF has no readable text (it may be a scan). Save the MOP from Word as PDF, or use the Excel intake.');
  const o=window.MOPIMP.parseMopLines(lines);subShortFromLines(o.rec,lines);
  /* the reference parser only splits on "Mitigation:"; also split arrows and "Mitigations:" paragraphs */
  const imps=splitImpacts(o.rec.impacts);if(imps.length)o.rec.impacts=imps;if(o.warn&&o.rec.impacts.every(i=>!i.impact||i.mitigation))o.warn=o.warn.filter(w=>!/mitigation written inside/.test(w));
  return{...o,kind:'PDF MOP',file:name,name:`${o.mopNo?'MOP #'+o.mopNo+' – ':''}${o.rec.title||name}`,pdf:file}}
 throw new Error('Use a PDF or Word MOP form, or the Excel intake (.xlsx).')}
function importPanel(){const im=S.impNew;return `<div class="zone"><b class="u-789157">Import a filled MOP form or the Excel intake</b> <span class="small">(optional)</span>
 <p class="small u-54eb29">PDF or Word MOP in the GNE / XL form, or the Excel intake template. The app reads it into this draft; you review every screen before Submit.</p>
 <div class="bar"><label class="btn sm pri">Choose file<input type="file" accept=".pdf,.docx,.xlsx" data-impnew hidden></label><button class="btn sm" data-a="dlxl">Download Excel intake template</button></div>
 ${S.busyImp?'<p class="small">Reading…</p>':''}${im?`<div class="u-d2c171"><b class="u-789157">${esc(im.kind)}: ${esc(im.file)}</b>${msgList([...im.info.map(m=>({l:'info',m})),...im.warn.map(m=>({l:'warn',m}))],false)}<div class="bar"><button class="btn pri sm" data-a="useimp">Use this</button><button class="btn sm" data-a="dropimp">Cancel</button></div></div>`:''}</div>`}
async function applyImport(im){const q=S.draft,keep=clone(q.record.req),out=ensureX(R.parseRecord(clone(im.rec)));
 ['name','company','phone','email'].forEach(k=>{if(!out.req[k])out.req[k]=keep[k]||''});if(!out.bldg&&q.record.bldg)out.bldg=q.record.bldg;
 out.x.imported={file:im.file,kind:im.kind,at:new Date().toISOString()};q.record=out;
 if(im.project){const p=cfg().projects.find(x=>x.id===im.project||x.label.startsWith(im.project));if(p){q.project=p.id;if(!out.bldg)out.bldg=p.bldg}}
 /* The reference mapped one renamed work type by id; no library ids ship in the public site, so a work type can list
   its old names in the library file (formerNames). Otherwise autoPick matches it, as the reference did. */
 if(im.workType){const e=allEntries().find(x=>x.name===im.workType)||allEntries().find(x=>(x.formerNames||[]).includes(im.workType));if(e)chooseEntry(e.id,true);else autoPick()}else autoPick();
 if(im.pdf){try{const res=await uploadBlob(im.pdf,{type:'application/pdf',requestId:q.id,name:im.file});q.files.push({id:res.id,name:im.file,kind:'pdf',cat:'Other'})}catch(e){}}
 q.history.push({at:new Date().toISOString(),by:S.uid||'',what:`Imported from ${im.kind}: ${im.file}`});
 S.impNew=null;S.dirty=true;await saveDraft();S.step=9;render();toast('Imported. The Review screen lists what is still needed; later screens fill from the library where blank.')}

export { readImport, importPanel, applyImport, subShortFromLines, intakeExtras, v2PdfLines };

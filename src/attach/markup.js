// Uploads, LOTO attachments and the mark-up editor.
// Ported from reference/rebuild-4/index.html (r4:574-640); function bodies kept as close to verbatim as possible.
import { R, S, STEPS, STATUSES, SIDE, UTIL, GROUPS, SYSTEM_CODES, LOTO_CATS, CAT_MAP, CONTACT_ROLES, APPROVER_ROLES, ICON_MIC, $, esc, clone, uidGen, cfg, proj, safeUrl, pad3, mopLabel, toast, now, fS, fL, isoDay, pdDay, fromIso, fileUrl, fetchFile, D, later, render, saveDraft } from '../core/state.js';
import { uploadBlob } from '../core/save.js';

async function shrink(file){if(!/^image\//.test(file.type)||/svg|gif/.test(file.type))return file;try{const bm=await createImageBitmap(file,{imageOrientation:'from-image'});const k=Math.min(1,2400/Math.max(bm.width,bm.height));const cv=document.createElement('canvas');cv.width=Math.round(bm.width*k);cv.height=Math.round(bm.height*k);const cx=cv.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,cv.width,cv.height);cx.drawImage(bm,0,0,cv.width,cv.height);return await new Promise(ok=>cv.toBlob(b=>ok(b||file),'image/jpeg',.85))}catch(e){return file}}
async function upload(files){S.busy=true;render();for(const f of files){try{const b=await shrink(f);const isPdf=/pdf/.test(f.type)||/\.pdf$/i.test(f.name);const res=await uploadBlob(b,{type:isPdf?'application/pdf':(b.type||'image/jpeg'),requestId:S.draft.id,name:f.name});
  
  S.draft.files.push({id:res.id,name:f.name,kind:isPdf?'pdf':'image',cat:/sched/i.test(f.name)?'Panel Schedules':isPdf||/plan|dwg|draw|markup/i.test(f.name)?'Drawings':'Photo'})}
 catch(e){toast(e&&e.code==='too_large'?f.name+' is too large (20 MB limit).':e&&e.code==='unsupported_type'?f.name+': that file type is not accepted.':'Upload failed for '+f.name)}}
 S.busy=false;S.dirty=true;await saveDraft();render()}

/* ---------- LOTO attachments and mark-up editor ---------- */
function guessCat(name,isPdf,pt){if(/sched/i.test(name))return 'Panel schedule';if(/(sld|single|one.?line)/i.test(name))return 'Single line diagram';if(/(p&?id|\bpid\b)/i.test(name))return 'P&ID';if(/as.?built/i.test(name))return 'As-built';
 if(!isPdf)return 'Isolation point photo';return pt.type==='Electrical'?'Panel schedule':'P&ID'}
async function uploadLoto(k,files){const pt=D().loto.points[k];if(!pt.att)pt.att=[];const first=pt.att.length;S.busy=true;render();
 for(const f of files){try{const isPdf=/pdf/.test(f.type)||/\.pdf$/i.test(f.name);const b=isPdf?f:await shrink(f);const res=await uploadBlob(b,{type:isPdf?'application/pdf':(b.type||'image/jpeg'),requestId:S.draft.id,name:f.name});
  pt.att.push({id:res.id,name:f.name,kind:isPdf?'pdf':'image',cat:guessCat(f.name,isPdf,pt),page:1,ops:[],mid:'',premarked:false,shows:{iso:false,loads:false}})}
 catch(e){toast(e&&e.code==='too_large'?f.name+' is too large (20 MB limit).':e&&e.code==='unsupported_type'?f.name+': that file type is not accepted.':'Upload failed for '+f.name)}}
 S.busy=false;S.dirty=true;await saveDraft();render();if(pt.att.length>first)openMarkup(k,first)}
function loadScript(src){return new Promise((ok,no)=>{const sc=document.createElement('script');sc.src=src;sc.onload=ok;sc.onerror=no;document.head.append(sc)})}
// pdf.js 3.11.174 from vendor/ (the reference loaded the same version from cdnjs; the CSP allows only 'self').
const PDFJS=new URL('../../vendor/pdfjs/',import.meta.url).href;
async function pdfjs(){if(!window.pdfjsLib)await loadScript(PDFJS+'pdf.min.js');if(!window.pdfjsWorker)await loadScript(PDFJS+'pdf.worker.min.js');window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS+'pdf.worker.min.js';return window.pdfjsLib}
const MK={tool:'hl',ops:[],zoom:1,page:1,pages:1};
const TOOLS=[['hl','Highlight'],['pen','Pen'],['box','Box'],['ell','Circle'],['arrow','Arrow'],['text','Text'],['pan','Move']];
const HINT={hl:'Drag over the breaker, valve, circuit or load to highlight it.',pen:'Draw freehand in red.',box:'Drag to draw a red box.',ell:'Drag to circle the isolation point.',arrow:'Drag from the label to the point.',text:'Type the label, then tap where it goes.',pan:'Drag or scroll to move around; use + and − to zoom.'};
async function pageCanvas(n){const page=await MK.pdf.getPage(n),v1=page.getViewport({scale:1}),sc=Math.min(3,2200/Math.max(v1.width,v1.height)),vp=page.getViewport({scale:sc});
 const cv=document.createElement('canvas');cv.width=Math.round(vp.width);cv.height=Math.round(vp.height);const x=cv.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,cv.width,cv.height);await page.render({canvasContext:x,viewport:vp}).promise;return cv}
async function openMarkup(k,j){const a=D().loto.points[k].att[j];Object.assign(MK,{k,j,ops:clone(a.ops||[]),zoom:1,page:a.page||1,pages:1,cur:null,pdf:null});
 $('#mk').hidden=false;$('#mktb').innerHTML='';$('#mkhint').textContent='Opening '+a.name+'…';
 try{if(a.kind==='pdf'){const L=await pdfjs();const buf=await (await fetchFile((a.id))).arrayBuffer();MK.pdf=await L.getDocument({data:buf}).promise;MK.pages=MK.pdf.numPages;MK.base=await pageCanvas(MK.page)}
  else MK.base=await createImageBitmap(await (await fetchFile((a.id))).blob())}
 catch(e){console.error(e);$('#mk').hidden=true;toast(a.kind==='pdf'?'Could not open this PDF here. Mark it up before uploading and tick Already marked up.':'Could not open this image.');return}
 const c=$('#mkc');c.width=MK.base.width;c.height=MK.base.height;MK.L=Math.max(c.width,c.height);mkToolbar();mkSize();mkDraw()}
function mkToolbar(){const a=D().loto.points[MK.k].att[MK.j];
 $('#mktb').innerHTML='<div class="tr">'+TOOLS.map(([t,l])=>`<button data-mk="tool" data-t="${t}" class="${MK.tool===t?'on':''}" aria-pressed="${MK.tool===t}">${l}</button>`).join('')+'</div>'+
 `<div class="tr"><button class="save" data-mk="save">Save mark-ups</button><button data-mk="cancel">Cancel</button><button data-mk="undo">Undo</button><button data-mk="clear">Clear</button><button data-mk="zo" aria-label="Zoom out">−</button><button data-mk="zi" aria-label="Zoom in">+</button><input id="mktext" placeholder="Label text" aria-label="Label text" value="${esc(MK.text||'')}">${MK.pages>1?`<select data-mkpage aria-label="Page">${Array.from({length:MK.pages},(_,i)=>`<option value="${i+1}" ${MK.page===i+1?'selected':''}>Page ${i+1} of ${MK.pages}</option>`).join('')}</select>`:''}</div>`;
 $('#mkhint').textContent=`${a.cat}: ${a.name}. ${HINT[MK.tool]}`;$('#mkc').style.touchAction=MK.tool==='pan'?'pan-x pan-y':'none'}
function mkSize(){const c=$('#mkc'),w=$('#mkcv').clientWidth-20;c.style.width=Math.round(Math.max(200,w)*MK.zoom)+'px'}
function mkPath(x,p){x.beginPath();p.forEach((q,i)=>i?x.lineTo(q[0],q[1]):x.moveTo(q[0],q[1]));if(p.length===1)x.lineTo(p[0][0]+.1,p[0][1]);x.stroke()}
function drawOp(x,o){const L=MK.L;x.save();x.lineCap='round';x.lineJoin='round';x.strokeStyle='#E00000';x.lineWidth=Math.max(3,L/260);
 if(o.t==='hl'){x.globalCompositeOperation='multiply';x.strokeStyle='rgba(255,221,0,0.6)';x.lineWidth=Math.max(14,L/45);mkPath(x,o.p)}
 else if(o.t==='pen')mkPath(x,o.p);
 else if(o.t==='box'){x.strokeRect(Math.min(o.a[0],o.b[0]),Math.min(o.a[1],o.b[1]),Math.abs(o.b[0]-o.a[0]),Math.abs(o.b[1]-o.a[1]))}
 else if(o.t==='ell'){x.beginPath();x.ellipse((o.a[0]+o.b[0])/2,(o.a[1]+o.b[1])/2,Math.abs(o.b[0]-o.a[0])/2+1,Math.abs(o.b[1]-o.a[1])/2+1,0,0,Math.PI*2);x.stroke()}
 else if(o.t==='arrow'){const[ax,ay]=o.a,[bx,by]=o.b,an=Math.atan2(by-ay,bx-ax),h=Math.max(14,L/45);x.beginPath();x.moveTo(ax,ay);x.lineTo(bx,by);x.stroke();x.beginPath();x.moveTo(bx,by);x.lineTo(bx-h*Math.cos(an-.45),by-h*Math.sin(an-.45));x.lineTo(bx-h*Math.cos(an+.45),by-h*Math.sin(an+.45));x.closePath();x.fillStyle='#E00000';x.fill()}
 else if(o.t==='text'){const fs=Math.max(16,Math.round(L/40));x.font=`bold ${fs}px Arial, sans-serif`;const w=x.measureText(o.s).width,pd=fs*.3;x.fillStyle='rgba(255,255,255,0.9)';x.fillRect(o.x-pd,o.y-fs-pd*.6,w+pd*2,fs+pd*1.6);x.lineWidth=Math.max(2,L/600);x.strokeRect(o.x-pd,o.y-fs-pd*.6,w+pd*2,fs+pd*1.6);x.fillStyle='#E00000';x.fillText(o.s,o.x,o.y)}
 x.restore()}
let mkRaf=0;function mkDraw(){cancelAnimationFrame(mkRaf);mkRaf=requestAnimationFrame(()=>{const c=$('#mkc'),x=c.getContext('2d');x.globalCompositeOperation='source-over';x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(MK.base,0,0);MK.ops.forEach(o=>drawOp(x,o));if(MK.cur)drawOp(x,MK.cur)})}
function mkPt(e){const c=$('#mkc'),r=c.getBoundingClientRect();return[(e.clientX-r.left)*c.width/r.width,(e.clientY-r.top)*c.height/r.height]}
function mkClose(){$('#mk').hidden=true;MK.base=null;MK.pdf=null}
async function mkSave(){const a=D().loto.points[MK.k].att[MK.j];if(!MK.ops.length){toast('Add at least one highlight or mark first.');return}
 const btn=document.querySelector('#mktb .save');if(btn){btn.disabled=true;btn.textContent='Saving…'}
 const c=$('#mkc'),x=c.getContext('2d');x.globalCompositeOperation='source-over';x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(MK.base,0,0);MK.ops.forEach(o=>drawOp(x,o));
 const blob=await new Promise(ok=>c.toBlob(ok,'image/jpeg',.85));
 try{const res=await uploadBlob(blob,{type:'image/jpeg',requestId:S.draft.id,name:'markup-'+a.name});a.mid=res.id;a.ops=MK.ops;a.page=MK.page;if(a.cat==='Isolation point photo'&&!a.shows.iso)a.shows.iso=true;mkClose();S.dirty=true;await saveDraft();render();toast('Mark-ups saved. Tick what the attachment shows.')}
 catch(e){toast('Could not save the marked-up copy.');if(btn){btn.disabled=false;btn.textContent='Save mark-ups'}}}
/* Canvas and toolbar listeners (r4:625-640), wired once the #mk dialog is in the page. */
let mkWired=false;
function initMarkup(){if(mkWired||!$('#mkc'))return;mkWired=true;
const c=$('#mkc');
 c.addEventListener('pointerdown',e=>{if(MK.tool==='pan'||!MK.base)return;e.preventDefault();c.setPointerCapture(e.pointerId);const p=mkPt(e);
  if(MK.tool==='text'){const s=($('#mktext').value||'').trim();if(!s){toast('Type the label text first.');return}MK.text=s;MK.ops.push({t:'text',x:p[0],y:p[1],s});mkDraw();return}
  MK.cur=MK.tool==='hl'||MK.tool==='pen'?{t:MK.tool,p:[p]}:{t:MK.tool,a:p,b:p};mkDraw()});
 c.addEventListener('pointermove',e=>{if(!MK.cur)return;const p=mkPt(e);if(MK.cur.p)MK.cur.p.push(p);else MK.cur.b=p;mkDraw()});
 const end=()=>{if(!MK.cur)return;const o=MK.cur;MK.cur=null;if(o.p?o.p.length>1:Math.hypot(o.b[0]-o.a[0],o.b[1]-o.a[1])>4)MK.ops.push(o);mkDraw()};
 c.addEventListener('pointerup',end);c.addEventListener('pointercancel',end);
 $('#mktb').addEventListener('click',async e=>{const b=e.target.closest('[data-mk]');if(!b)return;const k=b.dataset.mk;
  if(k==='tool'){MK.tool=b.dataset.t;MK.text=($('#mktext')||{}).value||'';mkToolbar();return}
  if(k==='undo'){MK.ops.pop();mkDraw();return}if(k==='clear'){MK.ops=[];mkDraw();return}
  if(k==='zi'||k==='zo'){MK.zoom=Math.min(4,Math.max(1,MK.zoom*(k==='zi'?1.5:1/1.5)));mkSize();if(MK.zoom>1&&MK.tool!=='pan')toast('Use Move to scroll around while zoomed.');return}
  if(k==='cancel'){mkClose();return}if(k==='save'){mkSave();return}});
 $('#mktb').addEventListener('change',async e=>{if(e.target.dataset.mkpage===undefined)return;MK.page=+e.target.value;MK.ops=[];MK.base=await pageCanvas(MK.page);const c2=$('#mkc');c2.width=MK.base.width;c2.height=MK.base.height;MK.L=Math.max(c2.width,c2.height);mkSize();mkDraw();toast('Showing page '+MK.page+'. Mark-ups apply to this page.')});
 $('#mktb').addEventListener('input',e=>{if(e.target.id==='mktext')MK.text=e.target.value});
 window.addEventListener('resize',()=>{if(!$('#mk').hidden)mkSize()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#mk').hidden)mkClose()})}


export { initMarkup, shrink, upload, guessCat, uploadLoto, loadScript, pdfjs, MK, TOOLS, HINT, pageCanvas, openMarkup, mkToolbar, mkSize, mkPath, drawOp, mkRaf, mkPt, mkClose, mkSave, mkDraw };

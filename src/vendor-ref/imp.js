/* GNE MOP Intake — imports (any user): a filled MOP form saved as PDF (GNE / XL MOP template, text-based),
   and the Excel intake template. Both return {rec, info, warn} for a draft request; nothing is submitted.
   Needs window.SRI (blankRecord, lines). Scanned PDFs have no text layer and are refused with a clear message. */
(function (G) {
  const SRI = () => G.SRI;
  const GROUPS = { 'Environmental': 'env', 'HVAC Systems': 'hvac', 'Electrical Systems': 'elec', 'Life Safety Systems': 'ls', 'Laboratory Systems': 'lab', 'Security Systems': 'sec', 'Technology Systems': 'tech', 'Utility Systems': 'util' };
  const blank = () => { const r = SRI().blankRecord(); r.x = { util: { level: '', items: [], other: '', notes: '' }, qa: '', gmpNotes: '', isoBy: '', rts: '' }; r.impacts = []; r.steps = []; r.workers = []; return r; };
  const strip = t => String(t || '').replace(/^\s*(\d+[.)]|[-•*])\s*/, '').trim();
  const pad = n => String(n).padStart(2, '0');
  const dateIso = (m, d, y) => `${y.length === 2 ? '20' + y : y}-${pad(m)}-${pad(d)}`;

  /* ---------- PDF: text items -> lines ---------- */
  async function pdfLines(pdf) {
    const out = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n), tc = await page.getTextContent();
      const items = tc.items.filter(i => i.str && i.str.trim()).map(i => ({ x: i.transform[4], y: i.transform[5], w: i.width || 0, s: i.str }));
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      const lines = [];
      for (const it of items) { const L = lines.find(l => Math.abs(l.y - it.y) < 3); if (L) L.items.push(it); else lines.push({ y: it.y, items: [it], page: n }); }
      lines.sort((a, b) => b.y - a.y);
      for (const L of lines) {
        L.items.sort((a, b) => a.x - b.x);
        // join: gap > 12pt becomes a column break (3 spaces)
        let t = '', end = null;
        for (const it of L.items) { if (end !== null) { const gap = it.x - end; t += gap > 12 ? '   ' : gap > 1.5 && !/\s$/.test(t) && !/^\s/.test(it.s) ? ' ' : ''; } t += it.s; end = it.x + it.w; }
        L.text = t.replace(/\s+$/, '');
        if (/^Page \d+ of \d+$/.test(L.text.trim())) continue;
        out.push(L);
      }
    }
    return out;
  }
  const cols = t => t.split(/\s{3,}/).map(s => s.trim()).filter(Boolean);
  /** Pairs of [checked, label] from a line with ☐/☒ boxes. */
  function boxes(t) { const out = []; const parts = t.split(/(☐|☒)/); for (let i = 1; i < parts.length; i += 2) out.push([parts[i] === '☒', (parts[i + 1] || '').replace(/\s{3,}.*$/, '').trim() || (parts[i + 1] || '').trim()]); return out; }

  const HEAD = /^(\d{1,2})\.\s+(Cont\.\s+)?(Impact Notification|Impact Description|Personnel Contact|Safety Requirements|Required Tools|Required Personnel|Detailed Step-by-Step|Go \/ No-Go|Back-Out|MOP Author|Owner|Qualified)/;

  function parseMopLines(lines) {
    const r = blank(), info = [], warn = [];
    const T = lines.map(l => l.text.trim());
    if (!T.some(t => /METHOD OF PROCEDURE/i.test(t)) || !T.some(t => HEAD.test(t))) throw new Error('This PDF does not look like the GNE / XL MOP form.');
    let last = null, secPage = 0, sec = 0, grp = null, tableX = null, mopNo = '', impBuf = { Planned: [], Potential: [] }, impMode = null, scope = null, execDate = '';
    const tools = [], crew = [], gn = [], bo = [], rts = [];
    const lev = (g, lab, on) => { if (!on) return; if (/^Low/.test(lab)) g.level = 'L'; else if (/^Medium/.test(lab)) g.level = 'M'; else if (/^High/.test(lab)) g.level = 'H'; };
    lines.forEach((L, i) => {
      const t = T[i];
      if (/#\s*\d+\s*rev\s*\d+/i.test(t)) { const m = /#\s*(\d+)\s*rev\s*(\d+)/i.exec(t); mopNo = `${m[1]} rev ${m[2]}`; }
      if (sec === 0) { boxes(t).forEach(([on, lab]) => { if (on && /^High$/.test(lab)) r.priority = 'H'; if (on && /^Medium$/.test(lab)) r.priority = 'M'; if (on && /^Low$/.test(lab)) r.priority = 'L'; }); }
      const h = HEAD.exec(t);
      if (h) { secPage = L.page; sec = +h[1]; grp = null; tableX = null; impMode = null; if (scope !== null) { r.scope = scope.trim(); scope = null; } return; }
      // header fields
      let m;
      if ((m = /^MOP Title:\s*(.*)$/.exec(t))) { const c = cols(m[1]); r.title = c[0] || ''; const sm = /MOP #:\s*(\S*)/.exec(m[1]); if (sm) r.subMop = sm[1]; return; }
      if ((m = /^Work Area\(s\):\s*(.*)$/.exec(t))) { r.areas = cols(m[1])[0] || ''; const d = /Execute Date:\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(t); if (d) execDate = dateIso(d[1], d[2], d[3]); return; }
      if ((m = /^Job Location:\s*(.*)$/.exec(t))) { r._loc = cols(m[1])[0] || ''; return; }
      if ((m = /^Work Scope:\s*(.*)$/.exec(t))) { scope = m[1]; return; }
      if (scope !== null) { scope += ' ' + t; return; }
      if (sec === 1) {
        const name = Object.keys(GROUPS).find(k => t.startsWith(k));
        if (name) { grp = GROUPS[name]; const g = grp === 'util' ? r.x.util : r.sys[grp]; boxes(t).forEach(([on, lab]) => lev(g, lab, on)); return; }
        if (/^GMP \/ QA:/.test(t)) { r.x.gmpNotes = t.replace(/^GMP \/ QA:\s*/, ''); return; }
        if (grp) { const g = grp === 'util' ? r.x.util : r.sys[grp];
          if (/^Notes:/.test(t)) { g.notes = t.replace(/^Notes:\s*/, ''); grp = null; return; }
          boxes(t).forEach(([on, lab]) => { if (!on) return; if (/^Other:/.test(lab)) g.other = lab.replace(/^Other:\s*/, ''); else g.items.push(lab.replace(/\s+/g, ' ')); }); }
        return;
      }
      if (sec === 2) {
        if (/^Planned Impact/.test(t)) { impMode = 'Planned'; const a = t.replace(/^.*?Systems:\s*/, ''); if (a && a !== t) impBuf.Planned.push(a); return; }
        if (/^Potential Impact/.test(t)) { impMode = 'Potential'; const a = t.replace(/^.*?Systems:\s*/, ''); if (a && a !== t) impBuf.Potential.push(a); return; }
        if (/^Attachments:/.test(t)) { impMode = null; const b = boxes(t).filter(x => x[0]).map(x => x[1]); if (b.length) info.push('Attachments ticked in the file: ' + b.join(', ')); return; }
        if (impMode) impBuf[impMode].push(t); return;
      }
      if ((sec === 3 || sec === 14) && L.page !== secPage) return;
      if (sec === 3) { if (/^Name\s/.test(t)) { tableX = L.items.map(it => it.x); return; } const c = cols(L.text); if (c.length >= 3 && !/genentech|xl construction/i.test(c[2] || '') && r.subs.length < 2) r.subs.push({ name: c[0] || '', title: c[1] || '', company: c[2] || '', phone: c[3] || '' }); return; }
      if (sec === 4) { if ((m = /^6\.\s*(.+)$/.exec(t))) r.safety = m[1].trim(); return; }
      if (sec === 5 || sec === 6) { cols(L.text).forEach(x => { if (!/^\d+\./.test(x)) return; const v = strip(x); if (v) (sec === 5 ? tools : crew).push(v); }); return; }
      if (sec === 7 || sec === 8 || sec === 11) {
        if (/^Step\s/.test(t)) { const d = L.items.find(it => /^Duration/.test(it.s.trim())), tc = L.items.find(it => /^Time/.test(it.s.trim())); tableX = { dur: d ? d.x - (tc ? (tc.x - d.x) * 0.4 : 25) : 1e9, time: tc ? tc.x - 6 : 1e9 }; return; }
        if (sec === 7) { if ((m = /LOTO\s*#:\s*(\S+)/.exec(t)) && !/Submitted/.test(m[1])) r.jllRef.lotoNo = m[1]; boxes(t).forEach(([on, lab]) => { if (on && /^Scope Walk/.test(lab)) r.sup.walk = 'Yes'; const w = /WO#?:\s*(\S+)/.exec(lab); if (on && /JLL Assist/.test(lab)) { r.sup.jll = 'Yes'; if (w) r.jllRef.assistWO = w[1]; } if (on && /JLL LOTO/.test(lab)) { r.loto.needed = 'Yes'; if (w) r.jllRef.lotoWO = w[1]; } });
          if ((m = /Performed by Print Name:\s*(.*?)(\s{3,}|$)/.exec(L.text)) && m[1].trim() && !/^Signature/.test(m[1])) r.loto.safeOff = m[1].trim(); }
        if (tableX && L.items.length && !/^\d+$/.test(L.items[0].s.trim()) && last && L.page === last.page && L.items[0].x > 40 && L.items[0].x < tableX.dur) {
          const more = L.items.filter(it => it.x < tableX.dur).map(it => it.s).join(' ').trim(), md = L.items.filter(it => it.x >= tableX.dur && it.x < tableX.time).map(it => it.s).join(' ').trim();
          if (more && !/^(Procedure continues|Step\s)/.test(more)) { last.o.desc = (/-$/.test(last.o.desc) ? last.o.desc + more : last.o.desc + ' ' + more).replace(/\s+/g, ' ').trim(); if (md) last.o.dur = (last.o.dur + ' ' + md).trim(); if (last.rts) rts[rts.length - 1] = last.o.desc.replace(/^Return to service:\s*/i, ''); }
          return;
        }
        if (!tableX || !L.items.length || !/^\d+$/.test(L.items[0].s.trim())) { last = null; return; }
        const n = +L.items[0].s.trim(), rest = L.items.slice(1);
        const desc = rest.filter(it => it.x < tableX.dur).map(it => it.s).join(' ').replace(/\s+/g, ' ').trim();
        const dur = rest.filter(it => it.x >= tableX.dur && it.x < tableX.time).map(it => it.s).join(' ').trim();
        if (!desc) return;
        const o = { desc, dur }; last = null;
        if (sec === 7 && n >= 9) { r.pre.push(o); last = { o, page: L.page }; }
        if (sec === 8) { r.steps.push(o); last = { o, page: L.page }; }
        if (sec === 11 && /^Return to service:/i.test(desc)) { rts.push(desc.replace(/^Return to service:\s*/i, '')); last = { o, page: L.page, rts: true }; }
        return;
      }
      if (sec === 9) { if ((m = /^(\d+)\s+(.+)$/.exec(t)) && !/^Description/.test(t)) gn.push(cols(m[2])[0]); return; }
      if (sec === 10) { if ((m = /^\d\)\s*(.+)$/.exec(t))) bo.push(m[1].trim()); return; }
      if (sec === 12) { if ((m = /^Print Name:\s*(.*?)(\s{3,}|$)/.exec(L.text)) && m[1].trim()) r.author = m[1].trim(); return; }
      if (sec === 14) { if (/^Print Name\s/.test(t)) return; const c = cols(L.text); if (c.length >= 3 && r.workers.length < 10) r.workers.push({ name: c[0], title: c[1], company: c[2] }); }
    });
    if (scope !== null) r.scope = scope.trim();
    // impacts: split numbered paragraphs; "Mitigation:" splits impact and mitigation when present
    ['Planned', 'Potential'].forEach(kind => {
      const txt = impBuf[kind].join('\n');
      txt.split(/\n(?=\d+\.\s)|^(?=\d+\.\s)/).map(s => s.replace(/\n/g, ' ').trim()).filter(Boolean).forEach(chunk => {
        const c = strip(chunk), mm = /^(.*?)\.?\s*Mitigation:\s*(.*)$/i.exec(c);
        r.impacts.push({ kind, impact: mm ? mm[1] : c, mitigation: mm ? mm[2] : '' });
      });
    });
    if (r.impacts.some(i => !i.mitigation)) warn.push('Some impacts have the mitigation written inside the same paragraph. Split them on the Impacts screen.');
    Object.values(r.sys).forEach(g => { g.items = g.items.filter(Boolean); });
    r.tools = tools.join('\n'); r.crew = crew.join('\n'); r.gonogo = gn.filter(Boolean).join('\n'); r.backout = bo.join('\n'); r.x.rts = rts.join('\n');
    if (r.steps.length || r.loto.needed === '' && /LOTO/.test(T.join(' '))) {}
    const b = /\bB\d{1,3}[A-Z]?\b/.exec([r.title, r.areas, r._loc].join(' ')); if (b) r.bldg = b[0];
    delete r._loc;
    if (!r.steps.length) r.steps = [{ desc: '', dur: '' }]; if (!r.impacts.length) r.impacts = [{ kind: 'Planned', impact: '', mitigation: '' }]; if (!r.workers.length) r.workers = [{ name: '', title: '', company: '' }];
    info.unshift(`Read MOP${mopNo ? ' #' + mopNo : ''}: ${r.steps.filter(s => s.desc).length} during-MOP steps, ${r.pre.length} extra pre-MOP steps, ${R_lines(r.gonogo)} Go/No-Go, ${R_lines(r.backout)} back-out, ${r.impacts.filter(i => i.impact).length} impacts, ${Object.values(r.sys).filter(g => g.level).length + (r.x.util.level ? 1 : 0)} system groups, ${r.workers.filter(w => w.name).length} workers.`);
    if (execDate) info.push(`Execute date in the file: ${execDate.slice(5, 7)}/${execDate.slice(8)}/${execDate.slice(2, 4)}. Set the new planned start on the When screen.`);
    warn.push('Not in the MOP form, so answer these in the app: discipline, in service, support questions, LOTO points and attachments.');
    return { rec: r, mopNo, info, warn };
  }
  const R_lines = s => String(s || '').split('\n').filter(x => x.trim()).length;

  /* ---------- XLSX reader (no library) ---------- */
  function readXlsx(u8) {
    const S = SRI(), parts = S.unzipSync(u8), str = n => parts[n] ? S.strFromU8(parts[n]) : '';
    const dp = new DOMParser(), X = s => dp.parseFromString(s, 'application/xml');
    const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', RN = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const wb = X(str('xl/workbook.xml')), rels = X(str('xl/_rels/workbook.xml.rels'));
    const target = id => { const r = [...rels.getElementsByTagName('Relationship')].find(x => x.getAttribute('Id') === id); const t = r ? r.getAttribute('Target') : ''; return t.startsWith('/') ? t.slice(1) : 'xl/' + t; };
    const ss = [...X(str('xl/sharedStrings.xml')).getElementsByTagNameNS(NS, 'si')].map(si => [...si.getElementsByTagNameNS(NS, 't')].map(t => t.textContent).join(''));
    const book = {};
    [...wb.getElementsByTagNameNS(NS, 'sheet')].forEach(sh => {
      const doc = X(str(target(sh.getAttributeNS(RN, 'id') || sh.getAttribute('r:id')))), cells = {};
      [...doc.getElementsByTagNameNS(NS, 'c')].forEach(c => {
        const t = c.getAttribute('t'), v = c.getElementsByTagNameNS(NS, 'v')[0], ref = c.getAttribute('r');
        let val = null;
        if (t === 's') val = ss[+v?.textContent] ?? ''; else if (t === 'inlineStr') val = [...c.getElementsByTagNameNS(NS, 't')].map(x => x.textContent).join('');
        else if (t === 'b') val = v?.textContent === '1'; else if (t === 'str' || t === 'e') val = v?.textContent ?? ''; else if (v) val = +v.textContent;
        if (val !== null && val !== '') cells[ref] = val;
      });
      book[sh.getAttribute('name')] = cells;
    });
    return book;
  }
  const colN = s => s.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  const colL = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  /** Rows keyed by the hidden key column: {key: [values of columns B..]} */
  function keyed(cells, keyCol) { const out = {}; Object.keys(cells).forEach(ref => { const m = /^([A-Z]+)(\d+)$/.exec(ref); if (m[1] !== keyCol) return; const row = +m[2]; out[String(cells[ref])] = row; }); return out; }
  const sval = v => v == null ? '' : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v).trim();
  function xlDate(v) { if (typeof v === 'number') { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; } const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(sval(v)); if (m) return dateIso(m[1], m[2], m[3]); const i = /^(\d{4})-(\d{2})-(\d{2})/.exec(sval(v)); return i ? i[0] : ''; }
  function xlTime(v) { if (typeof v === 'number') { const mins = Math.round((v % 1) * 1440); return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`; } const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(sval(v)); if (!m) return ''; let h = +m[1]; if (m[3]) { h = h % 12 + (/pm/i.test(m[3]) ? 12 : 0); } return `${pad(h)}:${m[2]}`; }

  /** Excel intake template (version 1). Each data sheet has a hidden key column (Z) naming the field. */
  function parseIntakeXlsx(book) {
    const r = blank(), info = [], warn = [];
    const req = book['Request'];
    if (!req || !Object.values(keyed(req, 'Z')).length) throw new Error('This workbook is not the MOP Intake Excel template.');
    const K = keyed(req, 'Z'), v = k => K[k] ? sval(req['C' + K[k]]) : '';
    const set = (path, val) => { if (!val) return; const ks = path.split('.'); let o = r; ks.slice(0, -1).forEach(k => o = o[k]); o[ks[ks.length - 1]] = val; };
    ['req.name', 'req.company', 'req.phone', 'req.email', 'author', 'subMop', 'title', 'origin', 'scope', 'discipline', 'system', 'equip', 'inService', 'alts', 'bldg', 'areas', 'durVal', 'durUnit', 'emergJust',
     'loto.needed', 'loto.safeOff', 'x.isoBy', 'jllRef.lotoNo', 'jllRef.lotoWO', 'jllRef.assistWO', 'users', 'sup.siemens', 'sup.impair', 'sup.hot', 'sup.watch', 'sup.jll', 'sup.cgmp', 'sup.jllType', 'x.qa', 'x.gmpNotes', 'sup.walk', 'safety'].forEach(k => set(k, v(k)));
    const pr = v('priority'); if (pr) r.priority = { High: 'H', Medium: 'M', Low: 'L' }[pr] || pr.charAt(0).toUpperCase();
    if (r.x.qa === 'To confirm') r.x.qa = '';
    const d = K['start.date'] ? xlDate(req['C' + K['start.date']]) : '', tm = K['start.time'] ? xlTime(req['C' + K['start.time']]) : '';
    if (d) r.start = `${d}T${tm || '06:00'}`; if (d && !tm) warn.push('No start time in the workbook; 6:00 AM was used.');
    if (/^yes$/i.test(v('attSep'))) r.attSep = true;
    const project = v('project'), workType = v('workType');
    // Systems
    const sy = book['Systems']; if (sy) { const SK = keyed(sy, 'Z'); Object.entries(SK).forEach(([k, row]) => {
      const m = /^(env|hvac|elec|ls|lab|sec|tech|util)\.(level|other|notes|item:(.+))$/.exec(k); if (!m) return; const g = m[1] === 'util' ? r.x.util : r.sys[m[1]], val = sval(sy['C' + row]);
      if (!val) return; if (m[2] === 'level') g.level = { Low: 'L', Medium: 'M', High: 'H' }[val] || val.charAt(0).toUpperCase(); else if (m[2] === 'other') g.other = val; else if (m[2] === 'notes') g.notes = val; else if (/^(x|yes|y|✓|true)$/i.test(val)) g.items.push(m[3]); }); }
    // LOTO points, impacts, steps, people: rows keyed "loto:1", "imp:1", "pre:1", "step:1", "gn:1", "bo:1", "rts:1", "tool:1", "crew:1", "wk:1", "sub:1"
    const rowsOf = (sheet, prefix) => { const c = book[sheet]; if (!c) return []; const KK = keyed(c, 'Z'); return Object.entries(KK).filter(([k]) => k.startsWith(prefix + ':')).sort((a, b) => a[1] - b[1]).map(([, row]) => ['B', 'C', 'D', 'E', 'F', 'G'].map(L => sval(c[L + row]))); };
    rowsOf('LOTO Points', 'loto').forEach(([type, equip, point, affected, removal]) => { if (equip || point) r.loto.points.push({ type: /pip|valve/i.test(type) ? 'Piping / valve' : 'Electrical', equip, point, affected, removal: /^yes$/i.test(removal), att: [] }); });
    if (r.loto.points.length && !r.loto.needed) r.loto.needed = 'Yes';
    rowsOf('Impacts', 'imp').forEach(([kind, impact, mitigation]) => { if (impact) r.impacts.push({ kind: /pot/i.test(kind) ? 'Potential' : 'Planned', impact, mitigation }); });
    rowsOf('Steps', 'pre').forEach(([desc, dur]) => { if (desc) r.pre.push({ desc, dur }); });
    rowsOf('Steps', 'step').forEach(([desc, dur]) => { if (desc) r.steps.push({ desc, dur }); });
    r.gonogo = rowsOf('Steps', 'gn').map(x => x[0]).filter(Boolean).join('\n');
    r.backout = rowsOf('Steps', 'bo').map(x => x[0]).filter(Boolean).join('\n');
    r.x.rts = rowsOf('Steps', 'rts').map(x => x[0]).filter(Boolean).join('\n');
    r.tools = rowsOf('People', 'tool').map(x => x[0]).filter(Boolean).join('\n');
    r.crew = rowsOf('People', 'crew').map(x => x[0]).filter(Boolean).join('\n');
    rowsOf('People', 'wk').forEach(([name, title, company]) => { if (name) r.workers.push({ name, title, company }); });
    rowsOf('People', 'sub').forEach(([name, title, company, phone]) => { if (name && r.subs.length < 2) r.subs.push({ name, title, company, phone }); });
    if (!r.steps.length) r.steps = [{ desc: '', dur: '' }]; if (!r.impacts.length) r.impacts = [{ kind: 'Planned', impact: '', mitigation: '' }]; if (!r.workers.length) r.workers = [{ name: '', title: '', company: '' }];
    info.unshift(`Read the Excel intake: ${r.loto.points.length} LOTO points, ${r.impacts.filter(i => i.impact).length} impacts, ${r.steps.filter(s => s.desc).length} steps, ${r.workers.filter(w => w.name).length} workers.`);
    if (r.loto.points.length) warn.push('Add the marked-up attachments for each LOTO point on the LOTO screen (photos and drawings are not part of the workbook).');
    return { rec: r, project, workType, info, warn };
  }

  G.MOPIMP = { pdfLines, parseMopLines, readXlsx, parseIntakeXlsx, colL, colN };
})(typeof window !== 'undefined' ? window : globalThis);

// Type-ahead under the form fields (11/27/26). Shows up to 5 big buttons under the field that has focus:
// values used before in that field, or people from the directory. Tapping one fills the field; tapping a
// person's name also fills their title, company, phone (and email for the requester). Typing a known
// person's full name fills a blank Phone box too; the Phone box finds numbers by digits or by name. Works offline: the
// suggestions come only from what is on the phone (src/core/directory.js).
import { S, D, cfg, esc, later } from '../core/state.js';
import { buildDirectory, suggest, groupOf, phoneForName, NO_SUGGEST } from '../core/directory.js';

const TYPES = new Set(['text', 'tel', 'email', 'search']);
let dir = null, dirFor = '', dirCfg = null, box = null, cur = null, hideT = 0, list = [], filling = false;

const usable = t => t && t.tagName === 'INPUT' && TYPES.has(t.type) && t.dataset.k && !NO_SUGGEST.test(t.dataset.k) && S.draft && !t.disabled && !t.readOnly;
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

function directory() {
  const key = `${S.draft.id}|${S.draft.project}|${Object.keys(S.reqs).length}|${Object.values(S.reqs).map(q => q.updatedAt || '').sort().pop() || ''}`;
  if (!dir || key !== dirFor || dirCfg !== cfg()) { dirCfg = cfg(); dir = buildDirectory({ reqs: S.reqs, cfg: dirCfg, projectId: S.draft.project, skipId: S.draft.id }); dirFor = key; }
  return dir;
}

function hide() { clearTimeout(hideT); if (box) box.remove(); box = null; list = []; if (cur) cur.removeAttribute('aria-expanded'); }

function show(t) {
  const path = t.dataset.k, rec = D(), g = groupOf(path);
  list = suggest(directory(), path, t.value, rec).filter(s => {
    if (s.value.toLowerCase() !== t.value.trim().toLowerCase()) return true;
    // An exact name still shows while it would fill something new (e.g. the phone is still blank).
    return s.fill && g && g.base && Object.entries(s.fill).some(([f, v]) => String(get(rec, `${g.base}.${f}`) ?? '').trim() !== v);
  });
  if (!list.length) return hide();
  if (!box || !box.isConnected) {
    box = document.createElement('div'); box.className = 'acl'; box.id = 'acl'; box.setAttribute('role', 'listbox');
    box.setAttribute('aria-label', 'Suggestions');
  }
  box.innerHTML = list.map((s, i) => `<button type="button" role="option" class="aco" data-aci="${i}"><span>${esc(s.label)}</span>${s.sub ? `<small>${esc(s.sub)}</small>` : ''}</button>`).join('');
  if (box.previousElementSibling !== t) t.after(box);
  t.setAttribute('aria-controls', 'acl'); t.setAttribute('aria-expanded', 'true');
}

/** Put a value into a form field the same way typing does (so saving, gap checks and "Don't know" all follow). */
function setField(path, v) {
  const el = document.querySelector(`#app [data-k="${CSS.escape(path)}"]`);
  if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return; }
  const k = path.split('.'), last = k.pop(), o = k.reduce((a, x) => a[x] ?? (a[x] = {}), D()); o[last] = v; S.dirty = true; later();
}

function pick(i) {
  const s = list[i], t = cur; if (!s || !t || !t.isConnected) return hide();
  const path = t.dataset.k, g = groupOf(path);
  hide(); filling = true;
  try {
    setField(path, s.value);
    if (s.fill && g && g.base) for (const [f, v] of Object.entries(s.fill)) setField(`${g.base}.${f}`, v);
  } finally { filling = false; }
  S.prevVal = null;
}

export function wireAutocomplete(app) {
  app.addEventListener('focusin', e => { const t = e.target; if (!usable(t)) return; clearTimeout(hideT); if (cur !== t) hide(); cur = t; t.setAttribute('autocomplete', 'off'); show(t); });
  app.addEventListener('input', e => { if (!filling && e.target === cur && usable(cur)) show(cur); });
  // A known person's full name typed (no tap) fills the Phone box next to it, only while it is blank.
  app.addEventListener('change', e => {
    const t = e.target; if (filling || !usable(t)) return;
    const g = groupOf(t.dataset.k); if (!g || !g.base || g.field !== 'name' || !g.fields.includes('phone')) return;
    const at = `${g.base}.phone`, ph = phoneForName(directory(), t.value);
    if (ph && !String(get(D(), at) ?? '').trim()) { filling = true; try { setField(at, ph); } finally { filling = false; } }
  });
  // Hide a moment after the field loses focus, so a tap that lands on something below still works.
  app.addEventListener('focusout', e => { if (e.target === cur) { clearTimeout(hideT); hideT = setTimeout(() => { if (document.activeElement !== cur) { hide(); cur = null; } }, 250); } });
  app.addEventListener('keydown', e => { if (e.key === 'Escape' && box) { hide(); } });
  // pointerdown keeps the keyboard up (the field keeps focus); click does the fill (also works with a keyboard).
  app.addEventListener('pointerdown', e => { if (e.target.closest('.aco')) e.preventDefault(); });
  app.addEventListener('click', e => { const b = e.target.closest('.aco'); if (!b) return; e.preventDefault(); pick(+b.dataset.aci); });
}

/** For tests: forget the cached directory (e.g. after config or requests change). */
export function resetAutocomplete() { dir = null; dirFor = ''; dirCfg = null; hide(); cur = null; }

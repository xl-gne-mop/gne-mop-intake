// Split imported impact paragraphs into impact + mitigation (Word and PDF MOP imports).
// Real MOPs write the mitigation in the same paragraph in several ways; each one used to land inside the impact text:
//   "Loss of BAS visibility. Mitigation: GNE Facilities monitors locally"   (the GNE template's own wording)
//   "Dust in labs → HEPA containment carts"  /  "Dust in labs -> HEPA carts"
//   "New cable or port fault →"  followed by the mitigation as the next paragraph
//   "Mitigations: new cable tested before …"  a paragraph that is only the mitigation for the impacts above it
const MIT = /^(.*?)[.;,]?\s*(?:[-–—]\s*)?(?:mitigations?|path forward)\s*:\s*(.*)$/i;
const LEAD = /^(?:mitigations?|path forward)\s*:\s*(.*)$/i;
const ARROW = /\s*(?:→|⇒|->|=>)\s*/;
const tidy = s => String(s || '').replace(/\s+/g, ' ').trim();
const noDot = s => tidy(s).replace(/[.;,]$/, '');

/** items: [{ kind, impact, mitigation }] in document order (one per paragraph). Returns a new list. */
export function splitImpacts(items) {
  const out = []; let open = null; // an impact that ended with an arrow: the next paragraph is its mitigation
  for (const it of items || []) {
    const kind = it.kind, raw = String(it.impact || '').trim(); let imp = raw, mit = String(it.mitigation || '').trim(), split = false;
    if (!imp && !mit) continue;
    if (open && open.kind === kind && !mit && imp && !LEAD.test(imp)) { open.mitigation = tidy(imp); open = null; continue; }
    open = null;
    const lead = !mit && LEAD.exec(imp);
    if (lead) { // a mitigation paragraph for the impacts above it in this section
      const text = tidy(lead[1]), same = out.filter(o => o.kind === kind), none = same.filter(o => !o.mitigation);
      if (!text) continue;
      if (none.length) none.forEach(o => { o.mitigation = text; });
      else if (same.length) { const l = same[same.length - 1]; l.mitigation = `${l.mitigation} ${text}`; }
      else out.push({ kind, impact: '', mitigation: text });
      continue;
    }
    if (!mit) {
      const m = MIT.exec(imp);
      if (m && tidy(m[1])) { imp = m[1]; mit = m[2]; split = true; }
      else if (ARROW.test(imp)) { const [a, ...rest] = imp.split(ARROW); imp = a; mit = rest.map(tidy).filter(Boolean).join('; '); split = true; }
    }
    const row = { kind, impact: split ? noDot(imp) : imp, mitigation: split ? tidy(mit) : mit };
    out.push(row);
    if (!row.mitigation && split) open = row;
  }
  return out;
}

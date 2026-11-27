// Small XML parser with just enough DOM for the importers, so they run in a Web Worker (no DOMParser there)
// and in Node (the scorer). Safe by design: no DTD, no external entities, no entity expansion beyond the five
// predefined ones and numeric references; DOCTYPE / processing instructions / comments are skipped.
// Supported: childNodes, firstChild, nextSibling, parentNode, nodeType, localName, namespaceURI, tagName,
// getAttribute(NS), getElementsByTagName(NS), textContent, documentElement.

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = s => s.indexOf('&') < 0 ? s : s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e) => {
  if (e[0] !== '#') return ENT[e];
  const n = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
  return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
});

class Node {
  constructor(type) { this.nodeType = type; this.childNodes = []; this.parentNode = null; }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get nextSibling() { const p = this.parentNode; if (!p) return null; const i = p.childNodes.indexOf(this); return p.childNodes[i + 1] || null; }
  get previousSibling() { const p = this.parentNode; if (!p) return null; const i = p.childNodes.indexOf(this); return i > 0 ? p.childNodes[i - 1] : null; }
  get textContent() { return this.nodeType === 3 ? this.data : this.childNodes.map(c => c.textContent).join(''); }
}
class Text extends Node { constructor(d) { super(3); this.data = d; } get nodeValue() { return this.data; } }
class Element extends Node {
  constructor(name, ns) { super(1); this.tagName = this.nodeName = name; const i = name.indexOf(':'); this.prefix = i > 0 ? name.slice(0, i) : null; this.localName = i > 0 ? name.slice(i + 1) : name; this.namespaceURI = ns; this.attrs = []; }
  getAttribute(n) { const a = this.attrs.find(x => x.name === n); return a ? a.value : null; }
  getAttributeNS(ns, local) { const a = this.attrs.find(x => x.local === local && (x.ns === ns || (!ns && !x.ns))); return a ? a.value : null; }
  hasAttribute(n) { return this.attrs.some(x => x.name === n); }
  getElementsByTagNameNS(ns, local) { const out = []; walk(this, e => { if ((local === '*' || e.localName === local) && (ns === '*' || e.namespaceURI === ns)) out.push(e); }); return out; }
  getElementsByTagName(name) { const out = []; walk(this, e => { if (name === '*' || e.tagName === name || e.localName === name) out.push(e); }); return out; }
  get children() { return this.childNodes.filter(c => c.nodeType === 1); }
}
class Document extends Node {
  constructor() { super(9); }
  get documentElement() { return this.childNodes.find(c => c.nodeType === 1) || null; }
  getElementsByTagNameNS(ns, l) { const d = this.documentElement; if (!d) return []; const own = (l === '*' || d.localName === l) && (ns === '*' || d.namespaceURI === ns) ? [d] : []; return own.concat(d.getElementsByTagNameNS(ns, l)); }
  getElementsByTagName(n) { const d = this.documentElement; if (!d) return []; const own = n === '*' || d.tagName === n || d.localName === n ? [d] : []; return own.concat(d.getElementsByTagName(n)); }
}
function walk(n, fn) { for (const c of n.childNodes) if (c.nodeType === 1) { fn(c); walk(c, fn); } }

export const MAX_XML_CHARS = 60 * 1024 * 1024; // one part; larger parts are refused (zip-bomb guard does the rest)

/** Parse an XML string into a Document. Throws on badly broken markup. */
export function parseXml(src) {
  const s = String(src); if (s.length > MAX_XML_CHARS) throw new Error('XML part too large');
  const doc = new Document(); let cur = doc; const scopes = [{ xml: 'http://www.w3.org/XML/1998/namespace' }];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>[]*(\[[\s\S]*?\])?\s*>|<\/([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(s))) {
    if (m[7] !== undefined) { if (cur !== doc) add(cur, new Text(decode(m[7]))); continue; }
    if (m[1] !== undefined) { add(cur, new Text(m[1])); continue; }
    if (m[3]) { if (cur === doc) throw new Error('XML: unexpected close tag'); cur = cur.parentNode; scopes.pop(); continue; }
    if (m[4]) {
      const scope = { ...scopes[scopes.length - 1] }, raw = [];
      const ar = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g; let a;
      while ((a = ar.exec(m[5] || ''))) { const name = a[1], value = decode(a[3] !== undefined ? a[3] : a[4]); raw.push([name, value]); if (name === 'xmlns') scope[''] = value; else if (name.startsWith('xmlns:')) scope[name.slice(6)] = value; }
      const i = m[4].indexOf(':'), pre = i > 0 ? m[4].slice(0, i) : '';
      const el = new Element(m[4], scope[pre] || null);
      el.attrs = raw.map(([name, value]) => { const j = name.indexOf(':'), p = j > 0 ? name.slice(0, j) : ''; return { name, value, local: j > 0 ? name.slice(j + 1) : name, ns: p && p !== 'xmlns' ? scope[p] || null : null }; });
      add(cur, el);
      if (m[6] === '/') continue; // self-closing
      cur = el; scopes.push(scope);
    }
  }
  return doc;
}
function add(p, n) { n.parentNode = p; p.childNodes.push(n); }

/** Drop-in for `new DOMParser().parseFromString(s, 'application/xml')`. */
export class MiniDOMParser { parseFromString(s) { return parseXml(s); } }

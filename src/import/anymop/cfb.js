// Minimal OLE2 / Compound File Binary reader (read-only) for .msg and .doc (best effort, decision #4).
// Streams are read through the FAT and the mini FAT; loops and out-of-range sectors stop the read.

export function readCfb(b) {
  if (!(b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0)) throw new Error('not a compound file');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u16 = o => dv.getUint16(o, true), u32 = o => dv.getUint32(o, true);
  const ss = 1 << u16(30), mss = 1 << u16(32), nFat = u32(44), dirStart = u32(48), miniCutoff = u32(56), miniFatStart = u32(60), nMiniFat = u32(64), difStart = u32(68), nDif = u32(72);
  if (ss !== 512 && ss !== 4096) throw new Error('bad sector size');
  const sector = n => 512 + n * ss; const END = 0xfffffffe, FREE = 0xffffffff, MAXS = Math.ceil(b.length / ss) + 4;
  // FAT sector list from the header DIFAT (109) and DIFAT sectors
  const fatSecs = []; for (let i = 0; i < 109 && fatSecs.length < nFat; i++) { const s = u32(76 + i * 4); if (s !== FREE) fatSecs.push(s); }
  let d = difStart, guard = 0;
  while (d !== END && d !== FREE && fatSecs.length < nFat && guard++ < nDif + 2) { for (let i = 0; i < ss / 4 - 1 && fatSecs.length < nFat; i++) fatSecs.push(u32(sector(d) + i * 4)); d = u32(sector(d) + ss - 4); }
  const fat = []; for (const s of fatSecs) { const o = sector(s); if (o + ss > b.length) break; for (let i = 0; i < ss / 4; i++) fat.push(u32(o + i * 4)); }
  const chain = (start, table, max) => { const out = []; let s = start, n = 0; while (s !== END && s !== FREE && s < table.length && n++ < max) { out.push(s); s = table[s]; } return out; };
  const readChain = start => { const parts = chain(start, fat, MAXS).map(s => b.subarray(sector(s), Math.min(b.length, sector(s) + ss))); const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
  // directory
  const dirBytes = readChain(dirStart), entries = [];
  for (let o = 0; o + 128 <= dirBytes.length; o += 128) {
    const nl = dirBytes[o + 64] | (dirBytes[o + 65] << 8), type = dirBytes[o + 66];
    const ddv = new DataView(dirBytes.buffer, dirBytes.byteOffset + o, 128);
    let name = ''; for (let i = 0; i + 1 < Math.min(nl, 64) - 1; i += 2) name += String.fromCharCode(ddv.getUint16(i, true));
    entries.push({ name, type, left: ddv.getUint32(68, true), right: ddv.getUint32(72, true), child: ddv.getUint32(76, true), start: ddv.getUint32(116, true), size: ddv.getUint32(120, true) });
  }
  const root = entries[0]; if (!root || root.type !== 5) throw new Error('no root entry');
  const miniStream = readChain(root.start);
  const miniFat = []; for (const s of chain(miniFatStart, fat, nMiniFat + 2)) { const o = sector(s); for (let i = 0; i < ss / 4; i++) miniFat.push(u32(o + i * 4)); }
  const readEntry = e => {
    if (e.size < miniCutoff && e.type === 2) { const out = new Uint8Array(e.size); let o = 0; for (const s of chain(e.start, miniFat, Math.ceil(e.size / mss) + 2)) { const part = miniStream.subarray(s * mss, s * mss + mss); out.set(part.subarray(0, Math.min(part.length, e.size - o)), o); o += part.length; if (o >= e.size) break; } return out; }
    return readChain(e.start).subarray(0, e.size);
  };
  // paths: walk the red-black tree of each storage
  const paths = new Map();
  const visit = (i, prefix, seen) => { if (i === FREE || i >= entries.length || seen.has(i)) return; seen.add(i); const e = entries[i]; visit(e.left, prefix, seen); visit(e.right, prefix, seen); const p = prefix + e.name; paths.set(p, e); if (e.type === 1 || e.type === 5) visit(e.child, p + '/', seen); };
  visit(root.child, '', new Set());
  return {
    list: () => [...paths.keys()],
    has: p => paths.has(p),
    read: p => { const e = paths.get(p); return e && e.type === 2 ? readEntry(e) : null; },
    children: prefix => [...paths.keys()].filter(k => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
  };
}

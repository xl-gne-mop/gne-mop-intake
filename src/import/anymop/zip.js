// Zip reader for the import adapters: central directory + DecompressionStream('deflate-raw'), so it works on the
// phone (main thread or Worker) and in Node without a library. The guard has already capped entry count and the
// declared sizes; here every entry is also capped while it inflates (a lying header can't blow up memory).
import { zipDirectory, LIMITS } from './guard.js';

async function inflateRaw(data, cap) {
  const ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter();
  w.write(data).catch(() => {}); w.close().catch(() => {});
  const r = ds.readable.getReader(), parts = []; let n = 0;
  for (;;) { const { done, value } = await r.read(); if (done) break; n += value.length; if (n > cap) { r.cancel().catch(() => {}); throw new Error('zip entry larger than it says'); } parts.push(value); }
  const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
}

/** Returns { names: [...], read(name) -> Promise<Uint8Array|null>, text(name) -> Promise<string|null> }. */
export function openZip(b) {
  const dir = zipDirectory(b); if (!dir) throw new Error('not a zip file');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // local header offsets come from the central directory (re-read here with offsets)
  let eocd = -1; for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  const count = dv.getUint16(eocd + 10, true); let off = dv.getUint32(eocd + 16, true); const map = new Map(); let total = 0;
  for (let k = 0; k < count && off + 46 <= b.length; k++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true), usize = dv.getUint32(off + 24, true);
    const nl = dv.getUint16(off + 28, true), xl = dv.getUint16(off + 30, true), cl = dv.getUint16(off + 32, true), lho = dv.getUint32(off + 42, true);
    const name = new TextDecoder().decode(b.subarray(off + 46, off + 46 + nl));
    map.set(name, { method, csize, usize, lho }); off += 46 + nl + xl + cl;
  }
  const read = async name => {
    const e = map.get(name); if (!e) return null;
    if (e.lho + 30 > b.length || dv.getUint32(e.lho, true) !== 0x04034b50) throw new Error('bad zip entry');
    const start = e.lho + 30 + dv.getUint16(e.lho + 26, true) + dv.getUint16(e.lho + 28, true), data = b.subarray(start, start + e.csize);
    const cap = Math.min(LIMITS.zipMaxUncompressed, Math.max(e.usize * 1.05 + 1024, 1024));
    let out;
    if (e.method === 0) out = data.slice();
    else if (e.method === 8) out = await inflateRaw(data, cap);
    else throw new Error('unsupported zip compression');
    total += out.length; if (total > LIMITS.zipMaxUncompressed) throw new Error('zip too large when unpacked');
    return out;
  };
  return { names: [...map.keys()], read, text: async name => { const u = await read(name); return u ? new TextDecoder().decode(u) : null; } };
}

// Dates shown to users are MM/DD/YY; file names use MM-DD-YY (CLAUDE.md).
const pad = n => String(n).padStart(2, '0');
export const mmddyy = d => d ? `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${String(d.getFullYear()).slice(2)}` : '';
export const mmddyyFile = d => mmddyy(d).replace(/\//g, '-');
export const fromIso = s => (s ? new Date(s) : null);
export const shortStamp = iso => { const d = fromIso(iso); if (!d) return ''; const h = d.getHours(); return `${mmddyy(d)} ${h % 12 || 12}:${pad(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`; };

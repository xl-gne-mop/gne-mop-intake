// Save a file to the phone (r4:493-495 without the Claude downloads capability).
import { toast } from '../core/state.js';
export async function saveFile(filename, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); toast('Downloaded.');
}

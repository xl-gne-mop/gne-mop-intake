// A tiny Drive v3 + Sheets v4 client using the signed-in user's own token (no service account).
// Errors carry .status: 401 -> sign in again; 403/404 -> no access (the sync stops and says so).
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
export const FOLDER = 'application/vnd.google-apps.folder';
export const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export class ApiError extends Error { constructor(message, status, where) { super(message); this.status = status; this.where = where; } }
const q = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export function createGoogleApi({ getToken, fetch: fetchFn = (...a) => globalThis.fetch(...a) }) {
  async function call(url, init = {}, where = '') {
    const token = await getToken(); if (!token) throw new ApiError('Sign in to sync', 401, where);
    const r = await fetchFn(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new ApiError(`Google answered ${r.status}`, r.status, where);
    const ct = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
    return ct.includes('json') ? r.json() : r.text();
  }
  const json = (method, url, body, where) => call(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, where);

  function multipart(meta, data, mime) {
    const b = 'mopintake' + Math.random().toString(36).slice(2);
    const body = new Blob([`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: ${mime}\r\n\r\n`, data, `\r\n--${b}--`]);
    return { body, type: `multipart/related; boundary=${b}` };
  }

  return {
    /** The one child of `parent` with this exact name (folder unless mime given), or null. */
    async findChild(parent, name, mime = FOLDER) {
      const query = `'${q(parent)}' in parents and name = '${q(name)}' and mimeType = '${q(mime)}' and trashed = false`;
      const r = await call(`${DRIVE}?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,parents)&supportsAllDrives=true&includeItemsFromAllDrives=true`, {}, 'drive');
      return (r.files || [])[0] || null;
    },
    createFolder: (parent, name) => json('POST', `${DRIVE}?supportsAllDrives=true&fields=id,name,parents`, { name, mimeType: FOLDER, parents: [parent] }, 'drive'),
    async upload(parent, name, data, mime) {
      const m = multipart({ name, parents: [parent], mimeType: mime }, data, mime);
      return call(`${UPLOAD}?uploadType=multipart&supportsAllDrives=true&fields=id,name,parents,webViewLink`, { method: 'POST', headers: { 'Content-Type': m.type }, body: m.body }, 'drive');
    },
    updateMedia: (fileId, data, mime) => call(`${UPLOAD}/${encodeURIComponent(fileId)}?uploadType=media&supportsAllDrives=true&fields=id,modifiedTime`, { method: 'PATCH', headers: { 'Content-Type': mime }, body: data }, 'drive'),
    move: (fileId, addParent, removeParent) => call(`${DRIVE}/${encodeURIComponent(fileId)}?addParents=${encodeURIComponent(addParent)}&removeParents=${encodeURIComponent(removeParent)}&supportsAllDrives=true&fields=id,parents`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' }, 'drive'),
    copy: (fileId, name, parent) => json('POST', `${DRIVE}/${encodeURIComponent(fileId)}/copy?supportsAllDrives=true&fields=id,name,parents`, { name, parents: [parent] }, 'drive'),
    getMeta: (fileId, fields = 'id,name,parents,modifiedTime') => call(`${DRIVE}/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}&supportsAllDrives=true`, {}, 'drive'),
    getMedia: fileId => call(`${DRIVE}/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {}, 'drive'),
    valuesGet: (sheetId, range) => call(`${SHEETS}/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`, {}, 'tracker'),
    valuesBatchUpdate: (sheetId, data) => json('POST', `${SHEETS}/${encodeURIComponent(sheetId)}/values:batchUpdate`, { valueInputOption: 'RAW', data }, 'tracker')
  };
}

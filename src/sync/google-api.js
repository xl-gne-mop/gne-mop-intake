// A tiny Drive v3 + Sheets v4 client using the signed-in user's own token (no service account).
// Errors carry .status: 401 -> sign in again; 403/404 -> no access (the sync stops and says so).
import { timed, UPLOAD_TIMEOUT_MS } from '../util/net.js';
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
export const FOLDER = 'application/vnd.google-apps.folder';
export const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export class ApiError extends Error { constructor(message, status, where, extra = {}) { super(message); this.status = status; this.where = where; Object.assign(this, extra); } }
export const RESUMABLE_MIN = 5 * 1024 * 1024;
/** Google's reason for an error (e.g. 'userRateLimitExceeded' on a 403), or ''. Never throws. */
export async function errorReason(r) { try { const b = await r.clone().json(); return String((b && b.error && ((b.error.errors && b.error.errors[0] && b.error.errors[0].reason) || b.error.status)) || ''); } catch { return ''; } }
/** Seconds from a Retry-After header (number form), or 0. */
export const retryAfterOf = r => { const v = r && r.headers && r.headers.get && r.headers.get('retry-after'); const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const apiError = (r, where, reason) => new ApiError(`Google answered ${r.status}`, r.status, where, { reason, retryAfter: retryAfterOf(r) });
const q = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export function createGoogleApi({ getToken, fetch: fetchFn = (...a) => globalThis.fetch(...a) }) {
  async function call(url, init = {}, where = '', ms) {
    const token = await getToken(); if (!token) throw new ApiError('Sign in to sync', 401, where);
    const r = await fetchFn(url, timed({ ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } }, ms));
    if (!r.ok) throw apiError(r, where, await errorReason(r));
    const ct = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
    return ct.includes('json') ? r.json() : r.text();
  }
  const json = (method, url, body, where) => call(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, where);

  function multipart(meta, data, mime) {
    const b = 'mopintake' + [...crypto.getRandomValues(new Uint8Array(12))].map(x => x.toString(16).padStart(2, '0')).join('');
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
    /**
     * Upload a new file. appProperties (optional) tags it so a retry can find it (findByProps) – private to this
     * app, not shown in Drive. Files over 5 MB go by resumable upload when `resumable` is on (Drive's guidance:
     * multipart for 5 MB or less); if the browser can't read the upload address, the multipart upload is used.
     */
    async upload(parent, name, data, mime, appProperties = null, { resumable = false } = {}) {
      const meta = { name, parents: [parent], mimeType: mime, ...(appProperties ? { appProperties } : {}) };
      if (resumable && data && (data.size ?? data.byteLength ?? 0) > RESUMABLE_MIN) {
        const token = await getToken(); if (!token) throw new ApiError('Sign in to sync', 401, 'drive');
        const start = await fetchFn(`${UPLOAD}?uploadType=resumable&supportsAllDrives=true&fields=id,name,parents,webViewLink`, timed({ method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mime }, body: JSON.stringify(meta) }));
        if (!start.ok) throw apiError(start, 'drive', await errorReason(start));
        const at = start.headers && start.headers.get && start.headers.get('location');
        if (at && at.startsWith(UPLOAD)) return call(at, { method: 'PUT', headers: { 'Content-Type': mime }, body: data }, 'drive', UPLOAD_TIMEOUT_MS);
      }
      const m = multipart(meta, data, mime);
      return call(`${UPLOAD}?uploadType=multipart&supportsAllDrives=true&fields=id,name,parents,webViewLink`, { method: 'POST', headers: { 'Content-Type': m.type }, body: m.body }, 'drive', UPLOAD_TIMEOUT_MS);
    },
    /** The file in `parent` tagged with every one of these appProperties (not trashed), or null. */
    async findByProps(parent, props) {
      const query = [`'${q(parent)}' in parents`, 'trashed = false', ...Object.entries(props).map(([k, v]) => `appProperties has { key='${q(k)}' and value='${q(v)}' }`)].join(' and ');
      const r = await call(`${DRIVE}?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,parents,appProperties)&supportsAllDrives=true&includeItemsFromAllDrives=true`, {}, 'drive');
      return (r.files || [])[0] || null;
    },
    updateMedia: (fileId, data, mime) => call(`${UPLOAD}/${encodeURIComponent(fileId)}?uploadType=media&supportsAllDrives=true&fields=id,modifiedTime`, { method: 'PATCH', headers: { 'Content-Type': mime }, body: data }, 'drive', UPLOAD_TIMEOUT_MS),
    move: (fileId, addParent, removeParent) => call(`${DRIVE}/${encodeURIComponent(fileId)}?addParents=${encodeURIComponent(addParent)}&removeParents=${encodeURIComponent(removeParent)}&supportsAllDrives=true&fields=id,parents`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' }, 'drive'),
    copy: (fileId, name, parent) => json('POST', `${DRIVE}/${encodeURIComponent(fileId)}/copy?supportsAllDrives=true&fields=id,name,parents`, { name, parents: [parent] }, 'drive'),
    getMeta: (fileId, fields = 'id,name,parents,modifiedTime') => call(`${DRIVE}/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}&supportsAllDrives=true`, {}, 'drive'),
    getMedia: fileId => call(`${DRIVE}/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {}, 'drive', UPLOAD_TIMEOUT_MS),
    valuesGet: (sheetId, range) => call(`${SHEETS}/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`, {}, 'tracker'),
    valuesBatchUpdate: (sheetId, data) => json('POST', `${SHEETS}/${encodeURIComponent(sheetId)}/values:batchUpdate`, { valueInputOption: 'RAW', data }, 'tracker')
  };
}

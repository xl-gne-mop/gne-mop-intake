// Loads the three Drive config files (library, template, lists) at runtime and caches them on the phone.
// - Asks Drive for modifiedTime first; downloads (files.get?alt=media) only when it changed.
// - Validates the schema field before saving.
// - If Drive can't be read, keeps using the saved copy and says so ("Using saved library from MM/DD/YY").
// The token comes from the signed-in user (phase 5); fetch and cache are injectable for tests.
import { mmddyy } from '../util/dates.js';
import { timed, UPLOAD_TIMEOUT_MS } from '../util/net.js';

export const KINDS = {
  library: { schema: 'gne-mop-library', label: 'library', store: 'library' },
  template: { schema: 'gne-mop-templates', label: 'MOP template', store: 'config' },
  lists: { schema: 'gne-mop-lists', label: 'project lists', store: 'config' }
};
const DRIVE = 'https://www.googleapis.com/drive/v3/files/';

export class ConfigError extends Error {
  constructor(message, { status = 0, kind = '' } = {}) { super(message); this.status = status; this.kind = kind; }
}

/** Throws ConfigError if the downloaded file isn't the expected kind. */
export function validate(kind, data) {
  const k = KINDS[kind];
  if (!data || typeof data !== 'object' || data.schema !== k.schema) throw new ConfigError(`The ${k.label} file in Drive is not a ${k.schema} file.`, { kind });
  if (kind === 'library') {
    if (!Array.isArray(data.workTypes) || !data.workTypes.length) throw new ConfigError('The library file has no work types.', { kind });
    for (const w of data.workTypes) if (!w || !w.id || !w.name || !Array.isArray(w.steps)) throw new ConfigError(`Library work type ${w && w.id || '?'} is missing id, name or steps.`, { kind });
  }
  if (kind === 'template') {
    if (data.encoding !== 'base64' || !data.files || !data.files.mop || typeof data.files.mop.data !== 'string') throw new ConfigError('The template file has no MOP template.', { kind });
    for (const f of ['tracker', 'lotoLog', 'excelIntake']) if (!data.files[f] || typeof data.files[f].data !== 'string') throw new ConfigError(`The template file is missing ${f}.`, { kind });
  }
  if (kind === 'lists') {
    if (!Array.isArray(data.projects) || !data.settings || typeof data.settings !== 'object' || !Array.isArray(data.editors)) throw new ConfigError('The lists file needs projects, settings and editors.', { kind });
  }
  return data;
}

/** IndexedDB-backed cache: library -> 'library' store, template/lists -> 'config' store. */
export function idbCache(openStore) {
  return {
    async get(kind) { const db = await openStore(); return db.get(KINDS[kind].store, KINDS[kind].store === 'library' ? 'current' : kind).then(r => r || null); },
    async put(kind, rec) { const db = await openStore(); const key = KINDS[kind].store === 'library' ? { id: 'current' } : { key: kind }; await db.put(KINDS[kind].store, { ...key, ...rec }); }
  };
}

async function driveJson(fetchFn, url, token) {
  const r = await fetchFn(url, timed({ headers: { Authorization: `Bearer ${token}` } }, UPLOAD_TIMEOUT_MS)); // template.json is a few MB
  if (!r.ok) throw new ConfigError(`Drive answered ${r.status}`, { status: r.status });
  return r.json();
}

/**
 * Load one config file. Returns { data, modifiedTime, savedAt, fromCache, stale, message }.
 * opts: { fileId, fetch, getToken: () => token|null, cache, now }
 */
export async function loadConfigFile(kind, { fileId, fetch: fetchFn = globalThis.fetch, getToken, cache, now = () => new Date() }) {
  const cached = await cache.get(kind);
  const fallback = (why) => {
    if (!cached) throw why instanceof ConfigError ? why : new ConfigError(String(why && why.message || why), { kind });
    const when = mmddyy(new Date(cached.savedAt));
    return { ...cached, fromCache: true, stale: true, error: why && why.message, message: `Using saved ${KINDS[kind].label} from ${when}` };
  };
  const token = getToken ? await getToken() : null;
  if (!token) return cached ? { ...cached, fromCache: true, stale: false, message: '' } : fallback(new ConfigError(`Sign in to load the ${KINDS[kind].label}.`, { kind, status: 401 }));
  try {
    const meta = await driveJson(fetchFn, `${DRIVE}${encodeURIComponent(fileId)}?fields=modifiedTime,name&supportsAllDrives=true`, token);
    if (cached && cached.modifiedTime === meta.modifiedTime) return { ...cached, fromCache: true, stale: false, message: '' };
    const data = validate(kind, await driveJson(fetchFn, `${DRIVE}${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, token));
    const rec = { data, modifiedTime: meta.modifiedTime, name: meta.name || '', savedAt: now().toISOString() };
    await cache.put(kind, rec);
    return { ...rec, fromCache: false, stale: false, message: '' };
  } catch (e) { return fallback(e); }
}

/** Load all three. ids = config.CONFIG_FILES. Returns { library, template, lists, messages[] }. */
export async function loadAllConfig({ ids, ...opts }) {
  const out = { messages: [] };
  for (const kind of Object.keys(KINDS)) {
    try { out[kind] = await loadConfigFile(kind, { ...opts, fileId: ids[kind] }); if (out[kind].message) out.messages.push(out[kind].message); }
    catch (e) { out[kind] = null; out.messages.push(e.message); }
  }
  return out;
}

// Library ops (Rebuild 5 library v2, phase 6). The only writes to Drive Config are an editor's "Publish":
//   1. the current library file is kept as a copy "library-v<N>-superseded-<MM-DD-YY>.json" in Config;
//   2. the same file id gets the new JSON (so config.CONFIG_FILES.library never changes).
// A suggestion goes to "MOP Test/Library inbox/" as one JSON file. Both are safe to repeat.
// Template v2 (11/26/26): "lists.companies" writes the editors' company-name list into lists.json.
import { supersededName } from '../library/publish.js';
import { listsWithCompanies } from '../config/companies.js';
import { SyncStop } from './reconcile.js';

const JSONT = 'application/json';
const jsonBlob = o => new Blob([JSON.stringify(o, null, 2)], { type: JSONT });
const parse = v => (typeof v === 'string' ? JSON.parse(v) : v);

export async function syncLibraryOp(op, { api, config, state, now, canEdit }) {
  const key = 'lib:' + op.key, st = (await state.get(key)) || {};
  const save = () => state.put(key, st);
  if (op.kind.startsWith('library.suggest')) {
    if (st.done) return { ok: true };
    const box = (await api.findChild(config.DRIVE_ROOT_FOLDER_ID, 'Library inbox')) || (await api.createFolder(config.DRIVE_ROOT_FOLDER_ID, 'Library inbox'));
    const name = `suggestion-${op.payload.id}.json`;
    const f = (await api.findChild(box.id, name, JSONT)) || (await api.upload(box.id, name, jsonBlob(op.payload), JSONT));
    st.done = f.id; await save(); return { ok: true };
  }
  if (op.kind.startsWith('library.publish')) {
    if (st.done) return { ok: true };
    const fileId = config.CONFIG_FILES.library, next = op.payload.file;
    if (canEdit && !(await canEdit(fileId))) throw new SyncStop("You can't change the library file in Drive. Ask JK to share Config with you as Editor.", 'access');
    const cur = parse(await api.getMedia(fileId));
    if (String(cur.libraryVersion) === String(next.libraryVersion)) { st.done = true; await save(); return { ok: true }; } // already written
    if (op.payload.previousVersion && String(cur.libraryVersion) !== String(op.payload.previousVersion))
      throw new SyncStop(`Someone else published library v${cur.libraryVersion} first. Open the library, check it, and publish again.`, 'libraryConflict');
    if (!st.copied) {
      const name = supersededName(cur.libraryVersion, now());
      st.copied = ((await api.findChild(config.DRIVE_CONFIG_FOLDER_ID, name, JSONT)) || (await api.copy(fileId, name, config.DRIVE_CONFIG_FOLDER_ID))).id; await save();
    }
    await api.updateMedia(fileId, jsonBlob(next), JSONT);
    st.done = true; await save(); return { ok: true };
  }
  if (op.kind === 'lists.companies') {
    // Template v2 company names: read the newest lists.json and replace only settings.CompanyNames (safe to repeat).
    const fileId = config.CONFIG_FILES.lists;
    if (canEdit && !(await canEdit(fileId))) throw new SyncStop("You can't change the lists file in Drive. Ask JK to share Config with you as Editor.", 'access');
    const cur = parse(await api.getMedia(fileId));
    await api.updateMedia(fileId, jsonBlob(listsWithCompanies(cur, op.payload.names || [])), JSONT);
    return { ok: true };
  }
  return { ok: true, skipped: op.kind };
}

// Edit-rights preflight: before the first sync of a session, ask Drive whether this user can edit the tracker and
// the MOP Test root folder (and add files to it). Uses capabilities, not ownership: MOP Test is owned by a
// Genentech account and shared with users. A failure shows a plain message, keeps the outbox waiting, and is
// remembered for the session – nothing retries in a loop; only a tap on "Sync now" checks again.
import { timed } from '../util/net.js';
const DRIVE = 'https://www.googleapis.com/drive/v3/files/';

export function shareMessage(name, email) { return `You don't have access to ${name}. Ask JK to share it with ${email || 'your email'}.`; }

export function createPreflight({ config, fetch: fetchFn = (...a) => globalThis.fetch(...a), pilot = () => false }) {
  let result = null; // cached for the session

  async function check(fileId, fallbackName, needs, token) {
    const r = await fetchFn(`${DRIVE}${encodeURIComponent(fileId)}?fields=name,capabilities(canEdit,canAddChildren)&supportsAllDrives=true`, timed({ headers: { Authorization: `Bearer ${token}` } }));
    if (r.status === 401) return { ok: false, status: 401, name: fallbackName };
    if (!r.ok) return { ok: false, status: r.status, name: fallbackName };
    const f = await r.json(), caps = f.capabilities || {};
    return { ok: needs.every(k => caps[k] === true), status: 200, name: f.name || fallbackName, caps };
  }

  /** {ok} or {ok:false, message, status}. force = the user tapped Sync now. */
  async function run({ token, email, force = false }) {
    if (result && !force) return result;
    const trackerId = pilot() ? config.PILOT_TRACKER_ID : config.TRACKER_ID;
    const targets = [[trackerId, pilot() ? 'the pilot MOP tracker' : 'the MOP tracker', ['canEdit']], [config.DRIVE_ROOT_FOLDER_ID, 'the MOP Test folder', ['canEdit', 'canAddChildren']]];
    for (const [id, name, needs] of targets) {
      const c = await check(id, name, needs, token);
      if (c.status === 401) { result = null; return { ok: false, status: 401, message: 'Sign in to sync' }; }
      if (!c.ok) { result = { ok: false, status: c.status, message: shareMessage(c.name, email), fileId: id }; return result; }
    }
    result = { ok: true }; return result;
  }

  return { run, reset: () => { result = null; }, get last() { return result; } };
}

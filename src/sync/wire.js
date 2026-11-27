// Browser glue for the sync engine: IndexedDB outbox / syncState / requests, the user's own Google token, the
// Smartsheet relay, and the ported MOP builder. Called from syncNow() after the sign-in, preflight and access checks.
import { S, R, cfg } from '../core/state.js';
import { normReq } from '../core/record.js';
import { openStore } from '../store/db.js';
import { makeOp } from '../store/outbox.js';
import { createGoogleApi } from './google-api.js';
import { drain } from './engine.js';
import { resolveConflict as resolveIn } from './reconcile.js';
import { listRemote, openRemote } from './remote.js';
import { buildMop, trackerVals, lotoVals, smartsheetVals } from '../export/outputs.js';

const C = () => globalThis.MOP_CONFIG || {};
const stateStore = {
  async get(id) { const db = await openStore(); const r = await db.get('syncState', 'req:' + id); return r ? r.value : null; },
  async put(id, value) { const db = await openStore(); await db.put('syncState', { key: 'req:' + id, value: JSON.parse(JSON.stringify(value)) }); }
};
const outbox = {
  async list() { const db = await openStore(); return db.getAllFromIndex('outbox', 'createdAt'); },
  async remove(id) { const db = await openStore(); await db.delete('outbox', id); },
  async put(op) { const db = await openStore(); await db.put('outbox', op); }
};

/** Save what the sync learned (Request ID, a new MOP #, fields taken from Drive) without queueing another op. */
async function saveLocal(q) {
  const db = await openStore(), cur = await db.get('requests', q.id);
  let out = q;
  if (cur && cur.updatedAt !== q.updatedAt) { // edited on the phone while syncing: keep the edit, add only the ids
    out = cur; out.meta = { ...(out.meta || {}), requestId: q.meta.requestId }; out.mopNo = q.mopNo;
  }
  await db.put('requests', out); S.reqs[q.id] = normReq(JSON.parse(JSON.stringify(out)));
}

export function createDrain({ getToken, fetch: fetchFn } = {}) {
  return async function run({ smartsheet, force = false }) {
    const api = createGoogleApi({ getToken, fetch: fetchFn });
    const ss = smartsheet && smartsheet.ready() ? (path, init) => smartsheet.api(path, init) : null;
    const config = C();
    const r = await drain({
      outbox, state: stateStore, api, ss, ssReady: () => !!ss, config, cfg: cfg(), pilot: !!S.pilotOn, force,
      getReq: async id => { const db = await openStore(); return db.get('requests', id); },
      saveLocal, blob: id => S.blobs[id] || null, now: () => R.siteNow(),
      canEdit: async id => { const m = await api.getMeta(id, 'capabilities(canEdit)'); return !!(m.capabilities && m.capabilities.canEdit); },
      build: { mop: buildMop, trackerVals, lotoVals, smartsheetVals, jllNeeded: R.jllNeeded }
    });
    S.conflicts = await listConflicts();
    if (S.hooks.saved) S.hooks.saved();
    return r;
  };
}

/** Every open "Needs editor review" item on this phone: [{ requestId, key, where, field, local, remote }]. */
export async function listConflicts() {
  const db = await openStore(), out = [];
  for (const row of await db.getAll('syncState')) if (row.key.startsWith('req:')) for (const c of (row.value.conflicts || [])) if (!c.resolved) out.push({ requestId: row.key.slice(4), ...c });
  return out;
}

/** An editor's choice on a card. The next sync writes the phone's value once, or leaves theirs. */
export async function resolveConflict(requestId, key, choice) {
  const st = await stateStore.get(requestId); if (!st) return;
  const db = await openStore(), q = await db.get('requests', requestId);
  const changed = resolveIn(st, q, key, choice);
  await stateStore.put(requestId, st);
  if (changed) await saveLocal(changed);
  const op = makeOp({ requestId, stage: q ? q.stage || 0 : 0, rev: q ? q.rev || 0 : 0, kind: 'conflict.resolved:' + key });
  await outbox.put(op); // the next sync writes the phone's value (once) or simply confirms theirs
  S.conflicts = await listConflicts();
}

/** Board: everyone's requests from Smartsheet (D6), and opening one onto this phone. */
export function createRemote({ getToken, smartsheet, fetch: fetchFn }) {
  const sheetId = () => (S.pilotOn ? C().PILOT_SHEET_ID : C().SMARTSHEET_SHEET_ID);
  return {
    async list() {
      if (!smartsheet.ready()) throw new Error('Connect Smartsheet in Settings to see everyone\'s requests.');
      return listRemote({ ss: async (p, i) => { const r = await smartsheet.api(p, i); if (!r.ok) throw new Error(`Smartsheet answered ${r.status}`); return r; }, sheetId: sheetId() });
    },
    async open(entry) {
      const api = createGoogleApi({ getToken, fetch: fetchFn });
      const q = await openRemote(entry, { api, state: stateStore });
      const db = await openStore(); await db.put('requests', q); S.reqs[q.id] = normReq(JSON.parse(JSON.stringify(q)));
      return q;
    }
  };
}

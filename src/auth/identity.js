// Who is using this phone. Phase 5 writes this at Google sign-in (userinfo email + name); it stays saved so
// local work (including signing your own approval row) keeps working offline afterwards.
import { getSetting, setSetting } from '../store/settings.js';
export async function getIdentity() { return getSetting('identity', null); }
export async function setIdentity({ email, name = '' }) { const v = { email: String(email || '').trim().toLowerCase(), name: String(name || '').trim(), at: new Date().toISOString() }; await setSetting('identity', v); return v; }
export async function clearIdentity() { await setSetting('identity', null); }

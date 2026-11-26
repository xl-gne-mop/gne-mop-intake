// Small per-device settings (remembered requester, pilot switch, last backup time ...).
import { openStore } from './db.js';
export async function getSetting(key, fallback = null) { const db = await openStore(); const r = await db.get('settings', key); return r ? r.value : fallback; }
export async function setSetting(key, value) { const db = await openStore(); await db.put('settings', { key, value }); }

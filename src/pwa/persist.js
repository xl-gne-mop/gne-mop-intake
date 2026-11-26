// Ask the browser to keep our storage (not evict it under pressure). Phase 5 calls this right after sign-in.
export async function requestPersistence() {
  if (!navigator.storage || !navigator.storage.persist) return { supported: false, persisted: false };
  let persisted = await navigator.storage.persisted();
  if (!persisted) { try { persisted = await navigator.storage.persist(); } catch { persisted = false; } }
  return { supported: true, persisted };
}
export async function storageEstimate() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usage, quota };
}

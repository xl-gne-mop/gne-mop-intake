// Plain messages for storage problems on the phone (never fail silently).
export const isQuota = e => !!e && (e.name === 'QuotaExceededError' || e.code === 22 || /quota|exceeded the storage|disk is full|no space/i.test(String(e.message || e)) || isQuota(e.inner));
export class StaleError extends Error { constructor() { super('This request was changed in another window or tab. Your last change was NOT saved here. Close this window, or reload the request, then make the change again.'); this.name = 'StaleError'; } }
export function storageMessage(e) {
  if (e instanceof StaleError || (e && e.name === 'StaleError')) return e.message;
  if (isQuota(e)) return 'This phone is out of space for the app. Your last change was NOT saved. Export a backup (Settings), then free up space on the phone and try again.';
  return 'Could not save on this phone: ' + ((e && e.message) || e) + '. Your last change was NOT saved. Try again; if it keeps happening, export a backup (Settings) and tell JK.';
}

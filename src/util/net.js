// Time limits for network calls. On a weak site signal a request can stall for minutes; without a limit the sync
// stays "busy" until the app is closed. A timed-out call fails like any other network error: the work stays saved
// on the phone and the outbox tries again later.
export const API_TIMEOUT_MS = 30000;      // JSON calls (Drive metadata, Sheets, Smartsheet relay)
export const UPLOAD_TIMEOUT_MS = 180000;  // file uploads (MOP .docx, photos, PDFs) on a slow signal

/** init with an abort signal that fires after ms, unless the caller already gave one or the browser has none. */
export function timed(init = {}, ms = API_TIMEOUT_MS) {
  if (init.signal || typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') return init;
  return { ...init, signal: AbortSignal.timeout(ms) };
}

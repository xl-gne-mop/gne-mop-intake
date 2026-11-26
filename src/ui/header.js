// Header chips: offline and "N waiting" (outbox).
import { countOutbox } from '../store/outbox.js';
export async function refreshWaiting() { const n = await countOutbox(), c = document.getElementById('waitchip'); if (!c) return; c.hidden = !n; c.textContent = `${n} waiting`; }
export function refreshNet() { const c = document.getElementById('netchip'); if (c) c.hidden = navigator.onLine; }

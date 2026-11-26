// Banners at the top of the screen (update available, storage warning, pilot ...). One per id.
export function showBanner(id, text, onTap, kind = 'info') {
  const host = document.getElementById('banners'); if (!host) return;
  let b = host.querySelector(`[data-banner="${id}"]`);
  if (!b) { b = document.createElement(onTap ? 'button' : 'div'); b.dataset.banner = id; host.append(b); }
  b.className = `banner ${kind}`; b.textContent = text;
  if (onTap) { b.type = 'button'; b.onclick = onTap; }
  return b;
}
export function hideBanner(id) { document.querySelector(`#banners [data-banner="${id}"]`)?.remove(); }

// iPhone / iPad in Safari (not opened from the Home Screen): storage there can be wiped by iOS after 7 days
// without use, so field use is blocked until the app is added to the Home Screen and opened from its icon.
export function isIOS(nav = navigator) {
  const ua = nav.userAgent || '';
  return /iPhone|iPad|iPod/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
}
export function isStandalone(win = window) {
  return win.navigator.standalone === true || (win.matchMedia && win.matchMedia('(display-mode: standalone)').matches);
}
export const needsInstallGate = (win = window) => isIOS(win.navigator) && !isStandalone(win);

export function renderInstallGate(root) {
  root.innerHTML = `
  <section class="gate" role="dialog" aria-modal="true" aria-labelledby="gate-h">
    <h1 id="gate-h">Add MOP Intake to your Home Screen</h1>
    <p>On iPhone and iPad this app only works from the Home Screen. That keeps your requests and photos safe when you have no signal.</p>
    <ol class="gate-steps">
      <li><span class="gate-n">1</span><span>Tap the <b>Share</b> button <span class="gate-ico" aria-hidden="true">⬆︎</span> at the bottom of Safari.</span></li>
      <li><span class="gate-n">2</span><span>Scroll down and tap <b>Add to Home Screen</b>.</span></li>
      <li><span class="gate-n">3</span><span>Tap <b>Add</b>, then open <b>MOP Intake</b> from its new icon.</span></li>
    </ol>
    <p class="small">You only do this once. After that, always open the app from the icon.</p>
  </section>`;
}

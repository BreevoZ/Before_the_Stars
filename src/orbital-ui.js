import { drawOrbitalScene, ORBITAL_SECONDS } from './orbital-scene.js';

// This controller owns presentation time only. The purchase/state transition
// has already committed and saved before present() is called.
export function createOrbitalUI({ review, save }) {
  const el = id => document.getElementById(id), dialog = el('archives-dialog');
  const panel = el('orbital-presentation'), canvas = el('orbital-sky');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const surroundings = [...dialog.children].filter(node => node !== panel);
  let shown = false, time = ORBITAL_SECONDS, last = null;
  function paint() {
    if (!shown || !dialog.open) return;
    const width = dialog.clientWidth, height = dialog.clientHeight, ratio = Math.min(devicePixelRatio || 1, 2);
    if (!width || !height) return;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    }
    const ctx = canvas.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const frame = drawOrbitalScene(ctx, width, height, time);
    panel.style.setProperty('--scene-opacity', String(1 - frame.treeOpacity));
    panel.style.setProperty('--arrival-opacity', String(frame.arrival));
    dialog.dataset.orbital = frame.complete ? 'arrived' : 'launching';
    el('orbital-departure').hidden = time > 15 || frame.complete;
    el('orbital-arrival').hidden = time < 20;
    el('orbital-actions').hidden = !frame.complete;
    el('skip-orbital').hidden = frame.complete;
  }
  function finish() {
    time = ORBITAL_SECONDS; last = null; paint();
    el('orbital-title').focus({ preventScroll: true });
  }
  function present(animate = false) {
    shown = true; time = animate && !reduced.matches ? 0 : ORBITAL_SECONDS; last = null;
    dialog.dataset.cinematic = 'false'; el('skip-home-intro').hidden = true;
    panel.hidden = false; surroundings.forEach(node => { node.inert = true; });
    dialog.setAttribute('aria-labelledby', 'orbital-title');
    paint(); (time ? el('orbital-title') : el('skip-orbital')).focus({ preventScroll: true });
  }
  function dismiss() {
    shown = false; panel.hidden = true; last = null; delete dialog.dataset.orbital;
    dialog.setAttribute('aria-labelledby', 'archives-title');
    surroundings.forEach(node => { node.inert = false; });
  }
  el('skip-orbital').addEventListener('click', finish);
  el('replay-orbital').addEventListener('click', () => present(true));
  el('review-surface').addEventListener('click', () => { dismiss(); review(); });
  el('orbital-save').addEventListener('click', save);
  dialog.addEventListener('cancel', event => { if (shown && time < ORBITAL_SECONDS) { event.preventDefault(); finish(); } });
  dialog.addEventListener('close', () => { if (!dialog.open) dismiss(); });
  reduced.addEventListener('change', () => { if (shown && reduced.matches) finish(); });
  document.addEventListener('visibilitychange', () => { last = null; });
  new ResizeObserver(paint).observe(dialog);
  return { present, dismiss, tick(timestamp, suspended = false) {
    if (!shown || time >= ORBITAL_SECONDS || suspended || document.hidden || !dialog.open) { last = null; return; }
    const dt = last === null ? 0 : Math.max(0, Math.min(.1, (timestamp - last) / 1000)); last = timestamp;
    time = Math.min(ORBITAL_SECONDS, time + dt); paint();
    if (time >= ORBITAL_SECONDS) finish();
  } };
}

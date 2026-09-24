import { drawVoyageScene, VOYAGE_SECONDS } from './voyage-scene.js';

// Presentation never changes the wallet or unlocks a stage. The purchase has
// already been saved; refresh goes straight to VII, even during this film.
export function createVoyageUI({ tree, arrive, changed }) {
  const el = id => document.getElementById(id);
  const dialog = el('voyage-dialog'), canvas = el('voyage-canvas');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let active = false, time = 0, last = null, surroundings = [];

  function restoreTree() {
    for (const [node, inert] of surroundings) node.inert = inert;
    surroundings = [];
    tree.style.removeProperty('--voyage-tree-opacity');
    delete tree.dataset.departing;
  }
  function paint() {
    if (!active) return;
    const w = dialog.clientWidth, h = dialog.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const frame = drawVoyageScene(ctx, w, h, time);
    dialog.style.setProperty('--arrival', frame.arrival);
    dialog.style.setProperty('--actions', frame.actions);
    dialog.style.background = `rgba(9,18,24,${1 - frame.treeOpacity})`;
    canvas.style.opacity = String(1 - frame.treeOpacity);
    tree.style.setProperty('--voyage-tree-opacity', frame.treeOpacity);
    el('voyage-arrival').hidden = frame.time < 17;
    el('voyage-actions').inert = !frame.complete;
    el('voyage-actions').setAttribute('aria-hidden', String(!frame.complete));
    el('voyage-skip').hidden = frame.complete;
    el('voyage-caption').hidden = frame.time >= 17;
    dialog.dataset.phase = frame.complete ? 'arrived' : 'launching';
  }
  function exit() {
    if (!active) return;
    active = false; last = null; restoreTree();
    dialog.close(); tree.close(); arrive(); changed();
  }
  function finish() {
    time = VOYAGE_SECONDS; last = null;
    try { paint(); } catch { exit(); return; }
    el('voyage-enter').focus({ preventScroll: true });
  }
  function dismiss() {
    active = false; last = null; restoreTree(); dialog.close();
  }
  function present() {
    if (active) return;
    active = true; time = reduced.matches ? VOYAGE_SECONDS : 0; last = null;
    surroundings = [...tree.children].map(node => [node, node.inert]);
    surroundings.forEach(([node]) => { node.inert = true; });
    tree.dataset.departing = 'true'; dialog.showModal();
    try { paint(); } catch { exit(); return; }
    (reduced.matches ? el('voyage-enter') : el('voyage-skip')).focus({ preventScroll: true });
    changed();
  }
  function tick(timestamp) {
    if (!active) return;
    if (document.hidden) { last = null; return; }
    const dt = last === null ? 0 : Math.max(0, Math.min(.1, (timestamp - last) / 1000));
    last = timestamp;
    const wasComplete = time >= VOYAGE_SECONDS;
    time = Math.min(VOYAGE_SECONDS, time + dt);
    try {
      paint();
      if (!wasComplete && time >= VOYAGE_SECONDS) el('voyage-enter').focus({ preventScroll: true });
    } catch { exit(); }
  }
  el('voyage-skip').addEventListener('click', finish);
  el('voyage-enter').addEventListener('click', exit);
  dialog.addEventListener('cancel', event => { event.preventDefault(); time >= VOYAGE_SECONDS ? exit() : finish(); });
  reduced.addEventListener('change', () => { if (active && reduced.matches) finish(); });
  document.addEventListener('visibilitychange', () => { last = null; });
  return { present, dismiss, tick, get active() { return active; } };
}

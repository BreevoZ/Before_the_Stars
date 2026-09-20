import { DESTRUCTION_SECONDS, drawDestructionScene } from './destruction-scene.js';

// A presentation over an already-settled save. No simulation/reward callbacks.
export function createDestructionUI() {
  const el = id => document.getElementById(id), dialog = el('archives-dialog');
  const panel = el('destruction-presentation'), canvas = el('destruction-sky'), caption = el('destruction-caption');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let shown = false, time = 0, last = null, battle = null, origin = null, inertStates = [];
  function paint() {
    if (!shown || !dialog.open) return;
    const width = dialog.clientWidth, height = dialog.clientHeight, ratio = Math.min(devicePixelRatio || 1, 2);
    if (!width || !height) return;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    }
    const ctx = canvas.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const frame = drawDestructionScene(ctx, width, height, time, { game: battle, origin });
    dialog.style.setProperty('--destruction-tree', String(frame.treeOpacity));
    dialog.style.setProperty('--destruction-ruins', String(frame.ruins));
    dialog.style.setProperty('--destruction-actions', String(frame.actionsOpacity));
    el('skip-destruction').style.opacity = String(frame.skipOpacity);
    canvas.style.opacity = String(1 - frame.treeOpacity);
    caption.style.opacity = String(frame.captionOpacity);
    if (caption.textContent !== frame.caption) caption.textContent = frame.caption;
    panel.dataset.time = time.toFixed(3);
  }
  function dismiss() {
    if (!shown) return;
    shown = false; last = null; battle = null; panel.hidden = true;
    delete dialog.dataset.destruction; dialog.style.removeProperty('--destruction-tree'); dialog.style.removeProperty('--destruction-ruins');
    dialog.style.removeProperty('--destruction-actions');
    dialog.setAttribute('aria-labelledby', 'archives-title');
    inertStates.forEach(([node, inert]) => { node.inert = inert; }); inertStates = [];
  }
  function finish() {
    if (!shown) return;
    time = DESTRUCTION_SECONDS; dismiss();
    el('close-archives').focus({ preventScroll: true });
  }
  function present(game) {
    if (reduced.matches) return;
    // The first completion also unlocks the legacy HUD. Keep that new bar out
    // of layout until this overlay covers the battle, or the opening jumps.
    dialog.dataset.destruction = 'playing';
    const bounds = el('battlefield').getBoundingClientRect();
    origin = { x: bounds.left / innerWidth, y: bounds.top / innerHeight, width: bounds.width / innerWidth, height: bounds.height / innerHeight };
    battle = game; time = 0; last = null; shown = true; panel.hidden = false;
    dialog.dataset.cinematic = 'false'; el('skip-home-intro').hidden = true;
    dialog.setAttribute('aria-labelledby', 'destruction-title');
    inertStates = [...dialog.children].filter(node => node !== panel).map(node => [node, node.inert]);
    inertStates.forEach(([node]) => { node.inert = true; });
    paint(); el('skip-destruction').focus({ preventScroll: true });
  }
  el('skip-destruction').addEventListener('click', finish);
  dialog.addEventListener('cancel', event => { if (shown) { event.preventDefault(); finish(); } });
  dialog.addEventListener('close', () => { if (!dialog.open) dismiss(); });
  reduced.addEventListener('change', () => { if (reduced.matches) finish(); });
  document.addEventListener('visibilitychange', () => { last = null; });
  new ResizeObserver(paint).observe(dialog);
  return { present, dismiss, tick(timestamp, suspended = false) {
    if (!shown || suspended || document.hidden || !dialog.open) { last = null; return; }
    const dt = last === null ? 0 : Math.max(0, Math.min(.1, (timestamp - last) / 1000)); last = timestamp;
    time = Math.min(DESTRUCTION_SECONDS, time + dt); paint();
    if (time >= DESTRUCTION_SECONDS) finish();
  } };
}

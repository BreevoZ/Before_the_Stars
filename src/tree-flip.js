// Turning between the surface and orbital talent pages. Both pages move by the
// same offset, so the two 存续协议 discs stay on top of each other the whole way:
// the protocol is the seam the page turns across. The skies drift less than the
// pages and crossfade, so the ruins give way to the horizon (or back again).
const EASING = 'cubic-bezier(.65,0,.25,1)';
export const nodeCenter = node => { const r = node.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
export function flipPages({ leaving, entering, from, to, reduced = false, duration = 950 }) {
  if (reduced) return Promise.resolve();
  const dx = from.x - to.x, dy = from.y - to.y, drift = Math.sign(dy || 1) * Math.min(120, Math.abs(dy) / 3);
  const timing = { duration, easing: EASING }, hold = { ...timing, fill: 'forwards' };
  // The new page fades in over the old one, so its modal backdrop must not dim it first.
  entering.dialog.dataset.flipping = 'true';
  const animations = [
    entering.dialog.animate([{ opacity: 0 }, { opacity: 1 }], timing),
    entering.page.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], timing),
    entering.sky.animate([{ transform: `translateY(${drift}px)` }, { transform: 'none' }], timing),
    leaving.page.animate([{ transform: 'none' }, { transform: `translate(${-dx}px, ${-dy}px)` }], hold),
    leaving.sky.animate([{ transform: 'none' }, { transform: `translateY(${-drift}px)` }], hold),
  ];
  return Promise.all(animations.map(animation => animation.finished)).catch(() => {}).then(() => () => { delete entering.dialog.dataset.flipping; animations.forEach(animation => animation.cancel()); });
}
// A deliberate overscroll at the seam turns the page; small or mixed wheel
// movement never does, so inertial scrolling cannot flip by accident.
export function watchSeam(scroller, direction, turn, threshold = 260) {
  let total = 0, last = 0;
  scroller.addEventListener('wheel', event => {
    const atEdge = direction > 0 ? scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2 : scroller.scrollTop <= 1;
    const now = performance.now();
    if (!atEdge || Math.sign(event.deltaY) !== direction || now - last > 450) total = 0;
    last = now;
    if (!atEdge || Math.sign(event.deltaY) !== direction) return;
    total += Math.abs(event.deltaY);
    if (total >= threshold) { total = 0; turn(); }
  }, { passive: true });
}

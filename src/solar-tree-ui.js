// VII star map: the third page, built the same way as the VI tree and sharing
// its styles. 远航协议 is its root and the seam to the VI page below.
import { createBindings } from './dom-bindings.js';
import { icon } from './icons.js';
import { SOLAR_TALENTS as T, SOLAR_MAP, SOLAR_COLUMNS, purchaseSolarTalent } from './solar-colony.js';
import { FACILITIES, flightTo } from './solar-industry.js';
import { buildSolarTreeViewModel } from './solar-tree-view-model.js';
import { drawOrbitalTalentSky } from './orbital-render.js';
import { watchSeam } from './tree-flip.js';

const NS = 'http://www.w3.org/2000/svg';
// The route bar jumps to each world's large node.
const ROUTE_ROOT = { mercury: 'mercury', venus: 'venus', mars: 'harbor', belt: 'belt', jupiter: 'jupiter', saturn: 'saturn', uranus: 'uranus', neptune: 'neptune' };
const COLUMN_NAMES = { mercury: '水星', venus: '金星', mars: '火星', belt: '小行星带', jupiter: '木星', saturn: '土星', uranus: '天王星', neptune: '海王星' };
const routeOf = t => t.gold ? (t.root ? 'root' : 'main') : 'branch';
export function createSolarTree(getSession, { commit, viewChanged, flipOrbit }) {
  const el = id => document.getElementById(id), bind = createBindings(document), dialog = el('solar-talents-dialog');
  const detail = el('solar-detail'), scroll = dialog.querySelector('.orbit-tree-scroll'), reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let talent = 'dome', selected = false, pinned = false, hideTimer, skySize = null;
  dialog.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icon(node.dataset.icon); });
  // The map is as wide as the solar system: size it, and hang the seam, the legend and a title over every column.
  const map = dialog.querySelector('.orbit-tree-map'), root = T.voyage;
  map.style.width = `${SOLAR_MAP.width}px`; map.style.height = `${SOLAR_MAP.height}px`; const edges = el('solar-tree-edges'); edges.setAttribute('viewBox', `0 0 ${SOLAR_MAP.width} ${SOLAR_MAP.height}`); edges.style.width = map.style.width; edges.style.height = map.style.height;
  Object.assign(el('solar-flip-orbit').style, { left: `${root.x}px`, top: `${root.y + 92}px` }); Object.assign(el('solar-legend').style, { left: `${root.x}px`, top: `${root.y + 140}px` });
  for (const [column, x] of Object.entries(SOLAR_COLUMNS)) {
    const label = document.createElement('span'), top = Math.min(...Object.values(T).filter(t => t.column === column).map(t => t.y));
    label.className = `orbit-route solar-column-label${column === 'mars' ? ' route-home' : ' route-life'}`; label.style.left = `${x}px`; label.style.top = `${top - 118}px`;
    const main = Object.values(T).filter(t => t.column === column && t.kind !== 'planet' && !t.satellite), moons = Object.values(T).filter(t => t.column === column && t.satellite).length;
    label.innerHTML = `${COLUMN_NAMES[column]}<small>${[...main.slice(0, 4).map(t => t.name), ...(moons ? [`${moons} 颗卫星`] : [])].join(' · ') || '—'}</small>`;
    map.append(label);
  }
  for (const [key, t] of Object.entries(T)) {
    for (const parent of Object.keys(t.requires)) {
      const from = T[parent], path = document.createElementNS(NS, 'path'), end = t.y + (t.finale ? 52 : 0);
      path.id = `solar-edge-${parent}-${key}`; path.setAttribute('d', `M${from.x} ${from.y} C${from.x} ${(from.y + end) / 2} ${t.x} ${(from.y + end) / 2} ${t.x} ${end}`);
      path.setAttribute('class', parent === 'voyage' ? 'trunk' : t.finale ? 'trunk finale' : 'branch'); path.dataset.route = routeOf(t);
      const flow = path.cloneNode(); flow.id = `solar-flow-${parent}-${key}`; flow.setAttribute('class', 'orbit-flow'); flow.setAttribute('pathLength', '1');
      el('solar-tree-edges').append(path, flow);
    }
    const node = document.createElement('button'); node.id = `solar-node-${key}`; node.type = 'button';
    node.className = `orbit-node ${t.kind ?? 'ordinary'}${t.finale ? ' finale' : ''}`; node.dataset.route = routeOf(t);
    node.style.left = `${t.x}px`; node.style.top = `${t.y}px`; node.setAttribute('aria-controls', 'solar-detail');
    const shape = t.finale || t.kind === 'planet' ? '<circle class="orbit-finale-ring" cx="32" cy="32" r="31.5"/><circle class="orbit-halo" cx="32" cy="32" r="29"/><circle cx="32" cy="32" r="24"/>'
      : t.kind === 'specialist' ? '<path d="M32 2 62 32 32 62 2 32Z"/>' : t.kind === 'keystone' ? '<circle class="orbit-halo" cx="32" cy="32" r="31"/><circle cx="32" cy="32" r="26"/>' : '<path d="M32 2 58 17v30L32 62 6 47V17Z"/>';
    node.innerHTML = `<svg class="orbit-node-frame" viewBox="0 0 64 64" aria-hidden="true">${shape}</svg><span class="orbit-node-glyph">${icon(t.icon)}</span><span id="solar-rank-${key}" class="orbit-rank"></span><small class="orbit-node-price"><span id="solar-cost-${key}"></span>${icon('legacy')}</small><span id="solar-gate-${key}" class="orbit-gate"></span><span class="orbit-node-name">${t.name}</span>`;
    node.addEventListener('click', () => select(key, true)); node.addEventListener('dblclick', () => buy(key));
    node.addEventListener('pointerenter', e => { if (innerWidth > 740 && e.pointerType === 'mouse' && !pinned) select(key); });
    node.addEventListener('pointerleave', () => { if (!pinned) hideTimer = setTimeout(close, 180); });
    node.addEventListener('keydown', e => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) return; e.preventDefault();
      const axis = e.code === 'ArrowLeft' || e.code === 'ArrowRight' ? 'x' : 'y', sign = e.code === 'ArrowLeft' || e.code === 'ArrowUp' ? -1 : 1;
      const next = Object.entries(T).filter(([, n]) => (n[axis] - t[axis]) * sign > 0).sort(([, a], [, b]) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y))[0];
      if (next) { el(`solar-node-${next[0]}`).focus(); select(next[0], true); }
    });
    el('solar-tree-nodes').append(node);
  }
  function position() {
    if (!selected || !dialog.open) return;
    if (innerWidth <= 740) { detail.style.left = ''; detail.style.top = ''; return; }
    const rect = el(`solar-node-${talent}`).getBoundingClientRect(), width = detail.offsetWidth;
    detail.style.left = `${Math.max(16, Math.min(innerWidth - width - 16, rect.right + width + 30 < innerWidth ? rect.right + 20 : rect.left - width - 20))}px`;
    detail.style.top = `${Math.max(92, Math.min(innerHeight - detail.offsetHeight - 24, rect.top - 24))}px`;
  }
  function close() { clearTimeout(hideTimer); selected = false; pinned = false; detail.hidden = true; sync(); }
  function select(key, pin = false) { clearTimeout(hideTimer); talent = key; selected = true; pinned = pin; sync(); detail.hidden = false; position(); }
  detail.addEventListener('pointerenter', () => clearTimeout(hideTimer)); detail.addEventListener('pointerleave', () => { if (!pinned) hideTimer = setTimeout(close, 180); });
  el('close-solar-detail').addEventListener('click', close);
  function buy(key) {
    if (!purchaseSolarTalent(getSession(), key)) return; talent = key; commit(); select(key, true);
    const flying = T[key].facility && flightTo(getSession().orbital, FACILITIES[T[key].facility].body);
    el('solar-feedback').textContent = `${T[key].name} · ${flying ? '方舟已出发' : '已点亮'}`;
    if (!reduced.matches) { el(`solar-node-${key}`).animate([{ scale: 1 }, { scale: 1.15 }, { scale: 1 }], { duration: 450 });
      for (const p of Object.keys(T[key].requires)) el(`solar-flow-${p}-${key}`).animate([{ strokeDashoffset: 1, opacity: 0 }, { opacity: 1, offset: .12 }, { strokeDashoffset: 0, opacity: 0 }], { duration: 900, easing: 'ease-in-out' }); }
  }
  el('solar-buy').addEventListener('click', () => buy(talent));
  el('close-solar-talents').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { close(); viewChanged(); });
  dialog.addEventListener('cancel', e => { if (selected) { e.preventDefault(); close(); } });
  scroll.addEventListener('scroll', position, { passive: true });
  dialog.querySelectorAll('[data-solar-route]').forEach(button => button.addEventListener('click', () => { close(); el(`solar-node-${ROUTE_ROOT[button.dataset.solarRoute]}`).scrollIntoView({ block: 'center', inline: 'center', behavior: reduced.matches ? 'instant' : 'smooth' }); }));
  el('solar-flip-orbit').addEventListener('click', () => flipOrbit()); watchSeam(scroll, 1, () => { if (dialog.open) flipOrbit(); });
  let drag = null;
  scroll.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || e.target.closest('button')) return; drag = { x: e.clientX, y: e.clientY, left: scroll.scrollLeft, top: scroll.scrollTop }; scroll.setPointerCapture(e.pointerId); });
  scroll.addEventListener('pointermove', e => { if (drag) { scroll.scrollLeft = drag.left + drag.x - e.clientX; scroll.scrollTop = drag.top + drag.y - e.clientY; } });
  scroll.addEventListener('pointerup', () => { drag = null; }); scroll.addEventListener('pointercancel', () => { drag = null; });
  function paintSky() {
    const canvas = el('solar-tree-sky'), { width, height } = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    if (!width || !height) return; const size = `${width}:${height}:${dpr}`; if (size === skySize) return; skySize = size;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawOrbitalTalentSky(ctx, width, height);
  }
  function open(key = null) {
    if (!getSession().orbital?.talents.voyage) return;
    close(); if (!dialog.open) dialog.showModal(); sync(); paintSky();
    el(`solar-node-${key ?? 'voyage'}`).scrollIntoView({ block: key ? 'center' : 'end', inline: 'center' });
    if (key) select(key, true); viewChanged();
  }
  function sync() { bind(buildSolarTreeViewModel(getSession(), { talent, selected })); position(); }
  return { open, sync, paintSky, get isOpen() { return dialog.open; }, dialog };
}

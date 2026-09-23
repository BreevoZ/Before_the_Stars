import { Q } from './quantity.js';
import { PROTOCOL_GLYPH, LEGACY_GLYPH } from './icons.js';
import { createBindings } from './dom-bindings.js';
import { buildTalentViewModel } from './talent-view-model.js';
import { UPGRADES, TALENT_LAYER_REQUIREMENT } from './progression-config.js';
import { purchaseUpgrade } from './progression.js';
import { TALENT_TREE, purchaseTalent, layerTalents, talentPrerequisiteText } from './talents.js';
import { drawOrbitalScene } from './orbital-scene.js';

const el = id => document.getElementById(id);
const svgNS = 'http://www.w3.org/2000/svg';
// Explicit art direction for this small tree; prerequisites still come from TALENT_TREE.
// Coordinates are independent of node size, so a narrow screen never shrinks touch targets.
const glyphs = {
  spark: 'M12 2c2 6 7 8 7 13a7 7 0 01-14 0c0-3 2-5 4-7-1 5 4 6 3-6z',
  clock: 'M12 2a10 10 0 110 20 10 10 0 010-20M12 6v6l4 3',
  automation: 'M5 8h14v11H5z M9 8V5h6v3 M8 12h2m4 0h2 M9 16h6',
  growth: 'M4 20V9l6 3V6l6 4V3h4v17z M8 16h2m4 0h2',
  legacy: LEGACY_GLYPH,
  helmet: 'M5 20V8l3-5h8l3 5v12l-7 3z M5 10l7 3 7-3 M8 17h8',
  blade: 'M3 21l5-6M6 13l5 5 M9 14L19 3l2 2-9 12',
  arrow: 'M3 21L21 3M13 3h8v8M3 15l6 6',
  heavy: 'M4 20V9l4-5h8l4 5v11z M4 12h16M9 8h6M9 16h6',
};
const mapData = {
  spark: { x: 550, y: 1570, kind: 'keystone', icon: glyphs.spark },
  logistics: { x: 125, y: 1350 }, formation: { x: 265, y: 1190, kind: 'keystone' },
  evolution: { x: 125, y: 990 }, defense: { x: 265, y: 845, kind: 'specialist' },
  fireControl: { x: 125, y: 755, icon: 'M12 2v5m0 10v5M2 12h5m10 0h5M12 7a5 5 0 110 10 5 5 0 010-10' },
  campaign: { x: 125, y: 535, icon: 'M3 8h16l-4-4m4 4-4 4M21 16H5l4 4m-4-4 4-4' },
  extermination: { x: 125, y: 315, kind: 'keystone', icon: 'M5 20 19 4M5 4l14 16M2 17l5 5m10 0 5-5M4 6V2h4m8 0h4v4' },
  production: { x: 825, y: 1330 }, supply: { x: 825, y: 1120, kind: 'specialist' },
  warfare: { x: 955, y: 1110 }, salvage: { x: 955, y: 900, kind: 'specialist' },
  conservation: { x: 1030, y: 1350, kind: 'keystone' }, challenge: { x: 990, y: 1210, kind: 'specialist' },
  timeAcceleration: { x: 830, y: 690, icon: glyphs.clock },
  legacyMachine: { x: 1030, y: 780, kind: 'keystone', icon: glyphs.automation },
  legacyCapacity: { x: 930, y: 530, kind: 'specialist', icon: glyphs.heavy },
  legacyEfficiency: { x: 1050, y: 320, kind: 'specialist', icon: glyphs.clock },
  superSoldierPlan: { x: 550, y: 260, kind: 'keystone', icon: glyphs.helmet },
  elite: { x: 380, y: 170, kind: 'specialist' }, superRanged: { x: 720, y: 170, kind: 'specialist', icon: glyphs.arrow },
  bypasser: { x: 550, y: 60, kind: 'keystone', icon: PROTOCOL_GLYPH },
};
for (let layer = 1; layer <= 5; layer++) layerTalents(layer).forEach((key, slot) => {
  mapData[key] = { x: 410 + slot * 140, y: 1320 - (layer - 1) * 210,
    icon: [glyphs.blade, glyphs.arrow, glyphs.heavy][slot] };
});
export const TALENT_MAP = Object.freeze(Object.fromEntries(Object.entries(mapData).map(([key, art]) => [key,
  { ...art, icon: art.icon ?? glyphs[TALENT_TREE[key].branch] ?? glyphs.automation }])));
const GATES = Object.freeze(Object.fromEntries(Array.from({ length: 6 }, (_, index) => [index + 1, { x: 550, y: index === 5 ? 365 : 1418 - index * 210 }])));
const colors = Object.fromEntries(['root', 'automation', 'growth', 'legacy', 'units'].map(key => [key, `var(--route-${key})`]));
function pathElement(className) { const path = document.createElementNS(svgNS, 'path'); path.setAttribute('class', className); return path; }

export function createTalentMap(getSession, changed) {
  const bind = createBindings(document);
  const screen = el('archives-dialog'), map = el('talent-tree'), details = el('talent-details');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let selected = null, pinned = false, hoverSuppressed = false, hideTimer = 0, points = {}, mobile = false;
  const edges = new Map(), animations = new Set();
  const svg = document.createElementNS(svgNS, 'svg'); svg.classList.add('talent-connections'); svg.setAttribute('aria-hidden', 'true'); map.append(svg);
  for (const [branch, name] of Object.entries({ automation: '自动化', growth: '文明增益', legacy: '遗产收益' })) {
    const label = document.createElement('div'); label.id = `branch-${branch}`; label.className = 'constellation-label';
    label.dataset.branch = branch; label.innerHTML = `<span>${name}</span><small>${{ automation: '让文明自行运转', growth: '让每次重建更强', legacy: '让星火传得更远' }[branch]}</small>`; map.append(label);
  }
  for (const [key, config] of Object.entries(TALENT_TREE)) {
    const art = TALENT_MAP[key], parent = config.requiresLayer ? [`gate-${config.requiresLayer + 1}`, 1] : config.unit ? ['gate-1', 1] : Object.entries(config.requires)[0], kind = art.kind ?? 'ordinary';
    if (parent) {
      const path = pathElement(`talent-link ${parent[0] === 'spark' ? 'trunk' : 'twig'}`);
      path.id = `link-${key}`; path.dataset.parent = parent[0]; path.dataset.child = key; path.dataset.requiredLevel = parent[1]; path.style.color = colors[config.branch];
      const flow = pathElement('talent-flow'); flow.id = `flow-${key}`; flow.setAttribute('pathLength', '1'); flow.style.color = colors[config.branch];
      svg.append(path, flow); edges.set(key, { path, flow, parent: parent[0] });
    }
    const item = document.createElement('div'); item.className = `talent-star ${kind}`; item.dataset.talent = key;
    if (parent) { item.dataset.parent = parent[0]; item.dataset.requiredLevel = parent[1]; }
    item.style.setProperty('--star-color', colors[config.branch]);
    const shape = kind === 'specialist' ? '<path class="star-frame" d="M32 2 62 32 32 62 2 32Z"/>' : kind === 'keystone' ? '<circle class="star-halo" cx="32" cy="32" r="31"/><circle class="star-frame" cx="32" cy="32" r="27"/>' : '<path class="star-frame" d="M32 2 58 17v30L32 62 6 47V17Z"/>';
    item.innerHTML = `<button id="node-${key}" class="talent-node" type="button" aria-controls="talent-details" aria-expanded="false" aria-pressed="false"><svg viewBox="0 0 64 64" aria-hidden="true">${shape}<path class="star-icon" d="${art.icon}" transform="translate(20 12)"/></svg><span class="node-ranks" id="level-${key}" aria-hidden="true"></span><small class="node-cost" id="cost-${key}"></small><span class="node-name">${config.name}</span></button>${key === 'spark' ? '<span id="root-caption" class="root-caption"></span>' : ''}`;
    map.append(item);
    const button = el(`node-${key}`);
    button.addEventListener('pointerenter', event => { if (!mobile && !hoverSuppressed && event.pointerType === 'mouse' && !pinned) select(key); });
    button.addEventListener('pointerleave', () => { if (!pinned) scheduleHide(); });
    button.addEventListener('focus', () => select(key));
    button.addEventListener('click', () => select(key, true));
    button.addEventListener('keydown', event => navigate(event, key));
    const card = document.createElement('article'); card.className = 'talent-detail'; card.id = `talent-${key}`; card.hidden = true;
    const parents = talentPrerequisiteText(config);
    card.innerHTML = `<p class="talent-requires">前置：${parents}${config.unit ? ` · ${['','原始','中世纪','文艺复兴','现代','未来'][config.layer]}兵种` : ''}</p><h4>${config.name}</h4><div class="talent-comparison" id="effect-${key}"><div><small>当前</small><p id="current-${key}"></p></div><span aria-hidden="true">→</span><div><small>下一级</small><p id="next-${key}"></p></div></div><p class="archive-note" id="grant-${key}" hidden>旧版前置天赋已免费保留。</p><button id="buy-${key}" type="button" aria-describedby="effect-${key} state-${key}"></button><small id="state-${key}"></small>`;
    el('talent-detail-cards').append(card);
    const buy = () => {
      const s = getSession(), before = s.permanent.legacy;
      if (!(Object.hasOwn(UPGRADES, key) ? purchaseUpgrade : purchaseTalent)(s, key)) return;
      if (key === 'bypasser') { closeDetail(); changed(key); sync(); return; }
      changed(key); sync(); feedback(key, Q.sub(before, s.permanent.legacy));
      if (el(`buy-${key}`).disabled) el('close-talent-detail').focus({ preventScroll: true });
    };
    el(`buy-${key}`).addEventListener('click', buy);
    button.addEventListener('dblclick', event => { event.preventDefault(); buy(); });
  }
  for (const [layer, point] of Object.entries(GATES)) {
    const gate = document.createElement('div'); gate.id = `gate-${layer}`; gate.className = 'era-gate';
    gate.textContent = `${['', 'I · 原始', 'II · 中世纪', 'III · 文艺复兴', 'IV · 现代', 'V · 未来', '超级士兵计划'][layer]} · ${Number(layer) === 1 ? '点亮火种' : `前层任意 ${TALENT_LAYER_REQUIREMENT} 项`}`;
    map.append(gate);
    const parents = Number(layer) === 1 ? ['spark'] : layerTalents(Number(layer) - 1);
    for (const parent of parents) {
      const path = pathElement('talent-link trunk'); path.id = `gate-link-${parent}`; path.dataset.parent = parent; path.dataset.child = `gate-${layer}`; path.style.color = colors.units;
      svg.append(path); edges.set(`gate-link-${parent}`, { path, flow: path, parent, to: `gate-${layer}` });
    }
  }
  function scheduleHide() { clearTimeout(hideTimer); hideTimer = setTimeout(() => { if (!pinned) closeDetail(); }, 200); }
  function closeDetail(focus = false) {
    clearTimeout(hideTimer); if (focus) hoverSuppressed = true; const key = selected; selected = null; pinned = false; details.hidden = true;
    for (const button of map.querySelectorAll('.talent-node')) { button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-pressed', 'false'); }
    if (focus && key) { el(`node-${key}`).focus({ preventScroll: true }); selected = null; details.hidden = true; el(`node-${key}`).setAttribute('aria-expanded', 'false'); el(`node-${key}`).setAttribute('aria-pressed', 'false'); }
  }
  function select(key, pin = false) {
    clearTimeout(hideTimer); selected = key; pinned = pin;
    for (const name of Object.keys(TALENT_TREE)) {
      el(`node-${name}`).setAttribute('aria-pressed', String(name === key)); el(`node-${name}`).setAttribute('aria-expanded', String(name === key));
      el(`talent-${name}`).hidden = name !== key;
    }
    details.hidden = false; positionDetail();
  }
  function positionDetail() {
    if (!selected || details.hidden) return;
    if (mobile) { details.style.left = ''; details.style.top = ''; return; }
    const rect = el(`node-${selected}`).getBoundingClientRect(), width = details.offsetWidth;
    const x = rect.right + width + 20 < window.innerWidth ? rect.right + 18 : rect.left - width - 18;
    details.style.left = `${Math.max(12, Math.min(window.innerWidth - width - 12, x))}px`;
    details.style.top = `${Math.max(90, Math.min(window.innerHeight - details.offsetHeight - 18, rect.top - 30))}px`;
  }
  function navigate(event, key) {
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }, direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const origin = points[key];
    const next = Object.keys(points).filter(name => name !== key).map(name => {
      const dx = points[name].x - origin.x, dy = points[name].y - origin.y, ahead = dx * direction[0] + dy * direction[1];
      return { name, ahead, score: Math.hypot(dx, dy) + Math.abs(dx * direction[1] - dy * direction[0]) * 2 };
    }).filter(item => item.ahead > 5).sort((a, b) => a.score - b.score)[0];
    if (next) { el(`node-${next.name}`).focus({ preventScroll: true }); el(`node-${next.name}`).scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  }
  details.addEventListener('pointerenter', () => clearTimeout(hideTimer));
  details.addEventListener('pointerleave', () => { if (!pinned) scheduleHide(); });
  details.addEventListener('focusin', () => { pinned = true; clearTimeout(hideTimer); });
  el('close-talent-detail').addEventListener('click', () => closeDetail(true));
  screen.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !details.hidden) { event.preventDefault(); event.stopPropagation(); closeDetail(true); }
  });
  map.addEventListener('pointermove', () => { hoverSuppressed = false; }, { passive: true });
  map.addEventListener('click', event => { if (!event.target.closest('.talent-node')) closeDetail(); });
  el('home-scroll').addEventListener('scroll', () => { if (!pinned) closeDetail(); else positionDetail(); }, { passive: true });
  screen.addEventListener('close', () => { closeDetail(); screen.dataset.cinematic = 'false'; for (const animation of animations) animation.cancel(); animations.clear(); });
  function animate(node, frames, options) {
    if (reduced.matches || !screen.open) return;
    const animation = node.animate(frames, options); animations.add(animation);
    animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
  }
  function feedback(key, cost) {
    bind({ '#talent-feedback': `−${Q.format(cost)} Legacy · ${TALENT_TREE[key].name}已点亮` });
    animate(el(`node-${key}`), [{ transform: 'scale(1)' }, { transform: 'scale(1.16)', offset: .35 }, { transform: 'scale(1)' }], { duration: 460, easing: 'ease-out' });
    animate(el('legacy'), [{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-5px) scale(1.2)', color: 'var(--purchase-flash)' }, { transform: 'translateY(0) scale(1)' }], { duration: 500 });
    for (const [child, edge] of edges) if (child === key || (key === 'spark' && edge.parent === key)) {
      animate(edge.flow, [{ strokeDashoffset: 1, opacity: 0 }, { opacity: 1, offset: .12 }, { strokeDashoffset: 0, opacity: 0 }], { duration: 900, easing: 'ease-in-out' });
    }
    animate(el('talent-feedback'), [{ opacity: 0, transform: 'translate(-50%, 6px)' }, { opacity: 1, transform: 'translate(-50%, 0)', offset: .15 }, { opacity: 1, offset: .8 }, { opacity: 0 }], { duration: 2400 });
  }
  function layout() {
    if (!screen.open) return;
    const width = map.clientWidth, wasMobile = mobile; mobile = window.innerWidth <= 740;
    const height = 1700;
    map.style.height = `${height}px`; svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const sx = width / 1120;
    points = Object.fromEntries(Object.entries(TALENT_MAP).map(([key, art]) => [key, { x: art.x * sx, y: art.y }]));
    const gates = Object.fromEntries(Object.entries(GATES).map(([layer, point]) => [`gate-${layer}`, { x: point.x * sx, y: point.y }]));
    for (const [key, point] of Object.entries({ ...points, ...gates })) {
      const node = key.startsWith('gate-') ? el(key) : el(`node-${key}`).parentElement;
      node.style.left = `${point.x}px`; node.style.top = `${point.y}px`;
    }
    for (const [key, edge] of edges) {
      const a = points[edge.parent] ?? gates[edge.parent], b = points[key] ?? gates[edge.to];
      const mid = (a.y + b.y) / 2;
      const d = `M${a.x},${a.y} C${a.x},${mid} ${b.x},${mid} ${b.x},${b.y}`;
      edge.path.setAttribute('d', d); edge.flow.setAttribute('d', d);
    }
    for (const [branch, position] of Object.entries({ automation: [190, 1460], growth: [845, 1460], legacy: [1020, 1460] })) {
      const label = el(`branch-${branch}`); label.style.left = `${position[0] * sx}px`; label.style.top = `${position[1]}px`;
    }
    drawScene(); positionDetail();
    if (mobile && !wasMobile) { el('tree-scroll').scrollLeft = Math.max(0, points.spark.x - el('tree-scroll').clientWidth / 2); el('home-scroll').scrollTop = el('home-scroll').scrollHeight; }
  }
  function drawScene() {
    const canvas = el('home-sky'), width = screen.clientWidth, height = screen.clientHeight, ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio);
    drawOrbitalScene(ctx, width, height, 0);
  }
  new ResizeObserver(layout).observe(screen);
  new ResizeObserver(layout).observe(map);
  reduced.addEventListener('change', () => { if (reduced.matches) { screen.dataset.cinematic = 'false'; el('skip-home-intro').hidden = true; for (const animation of animations) animation.cancel(); } });
  el('talents-panel').addEventListener('animationend', event => { if (event.animationName === 'constellation-rise') { screen.dataset.cinematic = 'false'; el('skip-home-intro').hidden = true; } });
  el('skip-home-intro').addEventListener('click', () => { screen.dataset.cinematic = 'false'; el('skip-home-intro').hidden = true; });
  function open(cinematic = false) {
    screen.dataset.cinematic = String(cinematic && !reduced.matches); el('skip-home-intro').hidden = !cinematic || reduced.matches;
    closeDetail(); layout();
    // Root stays comfortably reachable on a phone; the branches grow upwards.
    el('home-scroll').scrollTop = el('home-scroll').scrollHeight;
    el('tree-scroll').scrollLeft = Math.max(0, points.spark.x - el('tree-scroll').clientWidth / 2);
    el('close-archives').focus({ preventScroll: true });
  }
  function sync() {
    const changed = bind(buildTalentViewModel(getSession()));
    if (changed) positionDetail();
  }
  return { sync, open, closeDetail };
}

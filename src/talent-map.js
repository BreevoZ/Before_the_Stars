import { createBindings } from './dom-bindings.js';
import { buildTalentViewModel } from './talent-view-model.js';
import { UPGRADES } from './progression-config.js';
import { purchaseUpgrade } from './progression.js';
import { TALENT_TREE, purchaseTalent } from './talents.js';
import { drawBase } from './bases.js';

const el = id => document.getElementById(id);
const svgNS = 'http://www.w3.org/2000/svg';
// Explicit art direction for this small tree; prerequisites still come from TALENT_TREE.
// Coordinates are independent of node size, so a narrow screen never shrinks touch targets.
export const TALENT_MAP = Object.freeze({
  autobuyer: { x: 530, y: 465, mobile: [50, 850], kind: 'keystone', icon: 'M5 8h14v11H5z M9 8V5h6v3 M8 12h2m4 0h2 M9 16h6 M2 11v5m20-5v5' },
  logistics: { x: 386, y: 382, mobile: [46, 685], icon: 'M3 6h18M3 12h18M3 18h18 M8 3v6m8 0v6M7 15v6' },
  formation: { x: 266, y: 300, mobile: [18, 725], kind: 'keystone', icon: 'M4 7l3-4 3 4v5H4z m10 0 3-4 3 4v5h-6z M9 16l3-4 3 4v5H9z' },
  evolution: { x: 200, y: 168, mobile: [17, 412], icon: 'M6 20V9m6 11V4m6 16V9 M3 12l3-3 3 3m0-5 3-3 3 3m0 5 3-3 3 3' },
  defense: { x: 95, y: 275, mobile: [14, 565], kind: 'specialist', icon: 'M4 5l8-3 8 3v7c0 5-8 10-8 10S4 17 4 12z M8 11l3 3 5-6' },
  elite: { x: 95, y: 77, mobile: [13, 255], kind: 'specialist', icon: 'M12 2l3 6 7 2-5 5v7l-5-3-5 3v-7l-5-5 7-2z' },
  production: { x: 457, y: 252, mobile: [51, 510], icon: 'M4 20V9l6 3V6l6 4V3h4v17z M8 16h2m4 0h2' },
  supply: { x: 396, y: 98, mobile: [41, 258], kind: 'specialist', icon: 'M3 7l9-4 9 4v12l-9 3-9-3z M3 7l9 4 9-4M12 11v11M7 5l10 4v5' },
  warfare: { x: 619, y: 241, mobile: [52, 377], icon: 'M5 2l4 2 10 14-3 3L5 7z M3 16l5 5m-4-1 4-4 M17 3l3 1-1 4-5 6 M9 15l-5 5' },
  salvage: { x: 671, y: 87, mobile: [47, 127], kind: 'specialist', icon: 'M5 12a7 7 0 0112-5l3 3 M20 4v6h-6 M19 12a7 7 0 01-12 5l-3-3 M4 20v-6h6' },
  conservation: { x: 801, y: 331, mobile: [82, 660], kind: 'keystone', icon: 'M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z' },
  challenge: { x: 959, y: 255, mobile: [85, 475], kind: 'specialist', icon: 'M2 20l8-15 4 7 3-5 5 13z M7 11l3 2 3-3 M10 5V2h5l-2 3' },
  continuity: { x: 877, y: 109, mobile: [82, 235], kind: 'keystone', icon: 'M8 5h8l4 7-4 7H8l-4-7z M8 12h8M12 8v8 M12 1v2m0 18v2M1 12h2m18 0h2' },
});
const colors = Object.fromEntries(['root', 'automation', 'growth', 'legacy'].map(key => [key, `var(--route-${key})`]));
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
    const art = TALENT_MAP[key], parent = Object.entries(config.requires)[0], kind = art.kind ?? 'ordinary';
    if (parent) {
      const path = pathElement(`talent-link ${parent[0] === 'autobuyer' ? 'trunk' : 'twig'}`);
      path.id = `link-${key}`; path.dataset.parent = parent[0]; path.dataset.child = key; path.dataset.requiredLevel = parent[1]; path.style.color = colors[config.branch];
      const flow = pathElement('talent-flow'); flow.id = `flow-${key}`; flow.setAttribute('pathLength', '1'); flow.style.color = colors[config.branch];
      svg.append(path, flow); edges.set(key, { path, flow, parent: parent[0] });
    }
    const item = document.createElement('div'); item.className = `talent-star ${kind}`; item.dataset.talent = key;
    if (parent) { item.dataset.parent = parent[0]; item.dataset.requiredLevel = parent[1]; }
    item.style.setProperty('--star-color', colors[config.branch]);
    const shape = kind === 'specialist' ? '<path class="star-frame" d="M32 2 62 32 32 62 2 32Z"/>' : kind === 'keystone' ? '<circle class="star-halo" cx="32" cy="32" r="31"/><circle class="star-frame" cx="32" cy="32" r="27"/>' : '<path class="star-frame" d="M32 2 58 17v30L32 62 6 47V17Z"/>';
    item.innerHTML = `<button id="node-${key}" class="talent-node" type="button" aria-controls="talent-details" aria-expanded="false" aria-pressed="false"><svg viewBox="0 0 64 64" aria-hidden="true">${shape}<path class="star-icon" d="${art.icon}" transform="translate(20 12)"/></svg><span class="node-ranks" id="level-${key}" aria-hidden="true"></span><small class="node-cost" id="cost-${key}"></small><span class="node-name">${config.name}</span></button>${key === 'autobuyer' ? '<span id="root-caption" class="root-caption"></span>' : ''}`;
    map.append(item);
    const button = el(`node-${key}`);
    button.addEventListener('pointerenter', event => { if (!mobile && !hoverSuppressed && event.pointerType === 'mouse' && !pinned) select(key); });
    button.addEventListener('pointerleave', () => { if (!pinned) scheduleHide(); });
    button.addEventListener('focus', () => select(key));
    button.addEventListener('click', () => select(key, true));
    button.addEventListener('keydown', event => navigate(event, key));
    const card = document.createElement('article'); card.className = 'talent-detail'; card.id = `talent-${key}`; card.hidden = true;
    const parents = Object.entries(config.requires).map(([name, rank]) => `${TALENT_TREE[name].name} ${rank} 级`).join('、');
    card.innerHTML = `<p class="talent-requires">${parents ? `前置：${parents}` : '根节点 · 一切从这里开始'}</p><h4>${config.name}</h4><div class="talent-comparison" id="effect-${key}"><div><small>当前</small><p id="current-${key}"></p></div><span aria-hidden="true">→</span><div><small>下一级</small><p id="next-${key}"></p></div></div><p class="archive-note" id="grant-${key}" hidden>旧版前置天赋已免费保留。</p><button id="buy-${key}" type="button" aria-describedby="effect-${key} state-${key}"></button><small id="state-${key}"></small>`;
    el('talent-detail-cards').append(card);
    el(`buy-${key}`).addEventListener('click', () => {
      const s = getSession(), before = s.permanent.legacy;
      if (!(Object.hasOwn(UPGRADES, key) ? purchaseUpgrade : purchaseTalent)(s, key)) return;
      changed(); sync(); feedback(key, before - s.permanent.legacy);
      if (el(`buy-${key}`).disabled) el('close-talent-detail').focus({ preventScroll: true });
    });
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
    bind({ '#talent-feedback': `−${cost} Legacy · ${TALENT_TREE[key].name}已点亮` });
    animate(el(`node-${key}`), [{ transform: 'scale(1)' }, { transform: 'scale(1.16)', offset: .35 }, { transform: 'scale(1)' }], { duration: 460, easing: 'ease-out' });
    animate(el('legacy'), [{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-5px) scale(1.2)', color: 'var(--purchase-flash)' }, { transform: 'translateY(0) scale(1)' }], { duration: 500 });
    for (const [child, edge] of edges) if (child === key || (key === 'autobuyer' && edge.parent === key)) {
      animate(edge.flow, [{ strokeDashoffset: 1, opacity: 0 }, { opacity: 1, offset: .12 }, { strokeDashoffset: 0, opacity: 0 }], { duration: 900, easing: 'ease-in-out' });
    }
    animate(el('talent-feedback'), [{ opacity: 0, transform: 'translate(-50%, 6px)' }, { opacity: 1, transform: 'translate(-50%, 0)', offset: .15 }, { opacity: 1, offset: .8 }, { opacity: 0 }], { duration: 2400 });
  }
  function layout() {
    if (!screen.open) return;
    const width = map.clientWidth, wasMobile = mobile; mobile = window.innerWidth <= 740;
    const height = mobile ? 955 : Math.max(360, Math.min(640, window.innerHeight - 315));
    map.style.height = `${height}px`; svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const sx = width / 1080, sy = (height - 40) / 525;
    points = Object.fromEntries(Object.entries(TALENT_MAP).map(([key, art]) => [key, mobile ? { x: width * art.mobile[0] / 100, y: art.mobile[1] } : { x: art.x * sx, y: art.y * sy + 18 }]));
    for (const [key, point] of Object.entries(points)) {
      const node = el(`node-${key}`).parentElement; node.style.left = `${point.x}px`; node.style.top = `${point.y}px`;
    }
    for (const [key, edge] of edges) {
      const a = points[edge.parent], b = points[key];
      const bend = (a.x + b.x) / 2;
      let d = `M${a.x},${a.y} C${bend},${a.y - Math.abs(a.y - b.y) * .45} ${bend},${b.y + Math.abs(a.y - b.y) * .4} ${b.x},${b.y}`;
      if (key === 'formation' && !mobile) d = `M${a.x},${a.y} C${a.x - (a.x - b.x) * .85},${a.y + 20} ${b.x - 20},${b.y + 80} ${b.x},${b.y}`;
      if (mobile && edge.parent === 'autobuyer' && TALENT_TREE[key].branch === 'growth') {
        const hub = { x: width * .69, y: points.production.y + 100 };
        d = `M${a.x},${a.y} C${a.x + width * .18},${a.y - 70} ${hub.x},${hub.y + 90} ${hub.x},${hub.y} C${hub.x},${b.y + 60} ${b.x + 50},${b.y} ${b.x},${b.y}`;
      }
      // Route siblings around each other on phones: a line must never imply
      // an unrelated node is a prerequisite simply by passing through it.
      if (mobile && ['evolution', 'supply', 'salvage', 'continuity'].includes(key)) {
        const x = width * { evolution: -.03, supply: .3, salvage: .66, continuity: 1.015 }[key];
        d = `M${a.x},${a.y} C${x},${a.y - 90} ${x},${b.y + 90} ${b.x},${b.y}`;
      }
      edge.path.setAttribute('d', d); edge.flow.setAttribute('d', d);
    }
    for (const [branch, position] of Object.entries(mobile ? { automation: [.22, 52], growth: [.51, 20], legacy: [.82, 50] } : { automation: [.2, height - 105], growth: [.51, 12], legacy: [.83, height - 90] })) {
      const label = el(`branch-${branch}`); label.style.left = `${width * position[0]}px`; label.style.top = `${position[1]}px`;
    }
    drawScene(); positionDetail();
    if (mobile && !wasMobile) el('home-scroll').scrollTop = el('home-scroll').scrollHeight;
  }
  function drawScene() {
    const canvas = el('home-sky'), width = screen.clientWidth, height = screen.clientHeight, ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio);
    const wash = ctx.createLinearGradient(0, 0, 0, height); wash.addColorStop(0, '#0c1519'); wash.addColorStop(.7, '#132322'); wash.addColorStop(1, '#192923'); ctx.fillStyle = wash; ctx.fillRect(0, 0, width, height);
    const light = ctx.createRadialGradient(width * .5, height * .75, 0, width * .5, height * .75, Math.max(width, height) * .55); light.addColorStop(0, '#64745b20'); light.addColorStop(1, '#15202000'); ctx.fillStyle = light; ctx.fillRect(0, 0, width, height);
    let seed = 57; const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 140; i++) { const x = random() * width, y = random() * height * .88, size = random() * 1.15 + .25; ctx.globalAlpha = random() * .45 + .1; ctx.fillStyle = '#c8d3b9'; ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0d1919'; ctx.beginPath(); ctx.moveTo(0, height); ctx.lineTo(0, height * .84);
    for (let x = 0; x <= width + 60; x += 60) ctx.lineTo(x, height * .88 - random() * 35); ctx.lineTo(width, height); ctx.fill();
    ctx.save(); ctx.translate(0, height - (width < 700 ? 118 : 82)); ctx.globalAlpha = .35;
    for (const [x, age, scale] of [[.12, 2, 1.2], [.32, 4, 1.1], [.65, 5, 1.6], [.88, 3, 1.2]]) drawBase(ctx, { x: width * x, team: 'player', hp: 0, maxHp: 1 }, age, 0, scale * (width < 700 ? .7 : 1));
    ctx.restore();
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
    if (mobile) el('home-scroll').scrollTop = el('home-scroll').scrollHeight;
    else el('home-scroll').scrollTop = 0;
    el('close-archives').focus({ preventScroll: true });
  }
  function sync() {
    const changed = bind(buildTalentViewModel(getSession()));
    if (changed) positionDetail();
  }
  return { sync, open, closeDetail };
}

import { createBindings } from './dom-bindings.js';
import { BODIES, ORBITAL_STRUCTURES, INTERVENTIONS, POLICIES, ORBITAL_RULES } from './orbital-config.js';
import { constructOrbital, intervene, setCivilizationPolicy } from './orbital-game.js';
import { buildOrbitalViewModel } from './orbital-view-model.js';
import { drawOrbitalColony } from './orbital-render.js';

export function createOrbitalColonyUI(getSession, { commit, archive, save, speed }) {
  const el = id => document.getElementById(id), bind = createBindings(document);
  // These fragments contain only the static, trusted local catalog. Dynamic
  // player/save content is always text through the shared binding layer.
  for (const [key, item] of Object.entries(ORBITAL_STRUCTURES)) {
    const card = document.createElement('article'); card.className = 'colony-build'; card.id = `build-${key}-card`;
    card.innerHTML = `<header><h4>${item.name}</h4><small id="build-${key}-rank"></small></header><p>${item.description}</p><small id="build-${key}-cost"></small><button id="build-${key}" type="button"><span id="build-${key}-state"></span></button>`;
    card.querySelector('button').addEventListener('click', () => { if (constructOrbital(getSession(), key)) commit(); });
    el(`colony-build-${item.site}`).append(card);
  }
  for (const c of BODIES.earth.civilizations) {
    const button = document.createElement('button'); button.type = 'button'; button.id = `observe-${c.id}`;
    button.addEventListener('click', () => { const o = getSession().orbital; if (o?.started) { o.selectedCivilization = c.id; commit(); } });
    el('colony-civilizations').append(button);
  }
  for (const [key, action] of Object.entries(INTERVENTIONS)) {
    const button = document.createElement('button'); button.id = `intervene-${key}`; button.type = 'button'; button.title = action.description;
    button.innerHTML = `<strong>${action.name}</strong><small id="intervene-${key}-cost"></small><small id="intervene-${key}-state"></small>`;
    button.addEventListener('click', () => { const s = getSession(); if (intervene(s, 'earth', s.orbital.selectedCivilization, key)) commit(); });
    el('colony-interventions').append(button);
  }
  for (const [key, spec] of Object.entries(POLICIES)) { const option = document.createElement('option'); option.value = key; option.textContent = spec.name; el('colony-policy').append(option); }
  el('colony-policy').addEventListener('change', event => {
    const s = getSession(); if (setCivilizationPolicy(s, 'earth', s.orbital.selectedCivilization, event.target.value)) commit();
  });
  el('colony-auto').addEventListener('change', event => { const o = getSession().orbital; if (o?.started && o.structures.relay) { o.autoStabilize = event.target.checked; commit(); } });
  for (const key of Object.keys(BODIES)) el(`observe-${key}`).addEventListener('click', () => {
    const o = getSession().orbital; if (o?.started && (key === 'earth' || o.structures.survey)) { o.selectedBody = key; commit(); }
  });
  for (let i = 0; i < ORBITAL_RULES.historyLimit; i++) { const li = document.createElement('li'); li.id = `orbit-log-${i}`; el('colony-log').append(li); }
  el('colony-archive').addEventListener('click', archive); el('colony-save').addEventListener('click', save); el('colony-speed').addEventListener('click', speed);
  el('colony-debug-speed').addEventListener('change', event => { const s = getSession(), speed = Number(event.target.value); if (s.debug && [1,5,10,20].includes(speed)) { s.debugSpeed = speed; commit(); } });
  const canvas = el('colony-world'), reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function paint() {
    const o = getSession().orbital; if (!o?.started || document.hidden) return;
    const { width, height } = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    if (!width || !height) return;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawOrbitalColony(ctx, width, height, o, { reducedMotion: reduced.matches });
  }
  return { sync(options) { bind(buildOrbitalViewModel(getSession(), options)); }, paint };
}

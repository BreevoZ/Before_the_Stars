import { REAL_COLONY_WARS as REAL } from './fixtures/colony-war-reference.js';
import { voyageFixture } from './orbital-colony-cases.js';
import { serializeSession, parseSession } from '../src/save.js';
import { setDebugLegacy } from '../src/debug.js';
import { updateOrbital } from '../src/orbital-game.js';
import { Q } from '../src/quantity.js';
import { simulateColonyWar, watchColonyWar, liveColonyWar, WORLDS, COLONY_WAR, colonistRate, updateColonies } from '../src/colony-war.js';
import { purchaseSolarTalent, transferState, transferCivilization, COLONY_RULES } from '../src/solar-colony.js';
import { buildSolarViewModel } from '../src/solar-view-model.js';
import { mountFixture } from './progression-cases.js';

const median = xs => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };
function batch(a, b, n = 300) { const rs = []; for (let i = 1; i <= n; i++) rs.push(simulateColonyWar(a, b, { seed: i * 7919 })); return rs; }
// A Mars with two colonists, the second landed; nothing else on it.
function marsFixture() {
  const s = voyageFixture(), o = s.orbital, run = n => { for (let i = 0; i < Math.round(n * 30); i++) updateOrbital(s, 1 / 30); };
  setDebugLegacy(s, 2 ** 36); run(65);
  for (const key of ['dome', 'transfer', 'survey', 'fleet']) purchaseSolarTalent(s, key);
  run(70);
  for (let k = 0; k < 2; k++) { const civ = o.civilizations.find(c => c.alive && !c.warId); transferCivilization(s, civ.id); }
  // Stop the moment both land, before the fuse between them runs out.
  while (o.solar.transfers.length) run(.1);
  return { s, o, run };
}
export function registerColonyWarTests(test, assert, near) {
  const rejects = (raw, why) => { let failed = false; try { parseSession(raw); } catch { failed = true; } assert(failed, why); };
  test('Colony wars: the abstract model matches headless real battles in odds, length and evolution', () => {
    const even = [...batch(1, 1), ...batch(3, 3), ...batch(5, 5)], one = [...batch(1, 2), ...batch(2, 3), ...batch(3, 4)], two = [...batch(1, 3), ...batch(2, 4), ...batch(3, 5)];
    const wins = rs => rs.filter(r => r.result === 'won').length / rs.length;
    assert(wins(even) > .35 && wins(even) < .65, `Even wars are a coin toss: ${wins(even)}`);
    assert(Math.abs(median(even.map(r => r.seconds)) / REAL.evenMedian - 1) < .3, `Even length ${median(even.map(r => r.seconds))}`);
    assert(1 - wins(one) >= REAL.oneAgeFavourite - .1, `One age favours: ${1 - wins(one)}`);
    const oneLength = median(one.map(r => r.seconds)); assert(oneLength > REAL.oneAgeMedian * .4 && oneLength < REAL.oneAgeMedian * 1.6, `One-age length ${oneLength}`);
    assert(1 - wins(two) >= REAL.twoAgeFavourite - .05 && median(two.map(r => r.seconds)) < REAL.twoAgeMedian * 3, 'Two ages decide quickly');
    const toFinal = median(batch(1, 1, 60).map(r => r.final[0])); assert(Math.abs(toFinal / REAL.toFinalAge - 1) < .15, `Age I to V ${toFinal}`);
    // Mars fights harder: the same wars end sooner there.
    const mars = []; for (let i = 1; i <= 200; i++) mars.push(simulateColonyWar(3, 3, { seed: i * 7919, damage: WORLDS.mars.damage }).seconds);
    assert(median(mars) < median(batch(3, 3, 200).map(r => r.seconds)) * .8);
  });
  test('Colony wars: idle Mars neighbours go to war, two future ages burn Mars alone, and the dome waits out its own winter', () => {
    const { s, o, run } = marsFixture(), world = o.solar.colonies.mars;
    assert(world.civs.length === 2 && world.wars.length === 0 && world.phase === 'living');
    run(WORLDS.mars.fuse + .5); assert(world.wars.length === 1 && world.civs.every(c => c.warId === world.wars[0].id), 'The fuse starts a war');
    let raw = serializeSession(s); assert(serializeSession(parseSession(raw)) === raw, 'A colony war round-trips');
    const view = buildSolarViewModel(s, { view: 'system', selected: 'mars' }); assert(!view['#solar-war-0@hidden'] && view['#solar-war-0'].includes('⚔') && view['#solar-colony-status'].includes('场战争'));
    // Evolution comes from war: both sides climb.
    for (const c of world.civs) { c.age = 1; c.progress = 0; } world.wars[0].base = [1, 1]; run(40); assert(world.wars.length === 1 && world.civs.every(c => c.age === 2));
    // Force the ending: two future ages, one base nearly gone.
    const earthPhase = o.phase, earned = o.legacyEarned; for (const c of world.civs) { c.age = 5; c.progress = 0; } world.wars[0].base[1] = 1e-6;
    const value = Math.floor(world.civs.reduce((sum, c) => sum + colonistRate(c), 0) * COLONY_WAR.nuclearSeconds);
    run(1); assert(world.phase === 'winter' && world.civs.length === 0 && world.wars.length === 0 && world.nuclear === 1);
    assert(o.phase === earthPhase, 'Earth keeps its own phase');
    assert(Q.gte(o.legacyEarned, Q.add(earned, value)), 'The annihilation pays out');
    const civ = o.civilizations.find(c => c.alive && !c.warId); assert(!civ || transferState(s, civ.id) === 'colonyWinter');
    assert(buildSolarViewModel(s, { view: 'system', selected: 'mars' })['#colony-body-status'].includes('核冬天'));
    raw = serializeSession(s); assert(serializeSession(parseSession(raw)) === raw, 'A colony winter round-trips');
    const warm = JSON.parse(raw); warm.orbital.solar.colonies.mars.civs.push({ id: 'c9-1', name: 'x', age: 1, tendency: 0, doctrine: 0, arrivedAt: 0, progress: 0, warId: null }); rejects(JSON.stringify(warm), 'Nobody lives through a colony winter');
    run(WORLDS.mars.winter + 1); assert(world.phase === 'living' && world.remaining === 0);
  });
  test('Colony wars: the watched war becomes a real battle from the abstract state and folds back when left', () => {
    const { s, o, run } = marsFixture(), world = o.solar.colonies.mars; run(WORLDS.mars.fuse + .5);
    const war = world.wars[0]; war.base = [.6, .8];
    const live = watchColonyWar(o, 'mars', war.id); assert(live && liveColonyWar(o) === live);
    assert(Math.abs(Q.toNumber(Q.div(live.game.bases.player.hp, live.game.bases.player.maxHp)) - .6) < .01);
    assert(live.game.ages.player === world.civs.find(c => c.id === war.sides[0]).age);
    const elapsed = live.game.elapsed; run(3);
    assert(live.game.elapsed > elapsed, 'The real battle runs while watched');
    near(war.base[1], Q.toNumber(Q.div(live.game.bases.enemy.hp, live.game.bases.enemy.maxHp)));
    const raw = serializeSession(s); assert(serializeSession(parseSession(raw)) === raw, 'Watching never enters the save');
    watchColonyWar(o, 'mars', null); const frozen = live.game.elapsed, surge = war.elapsed; run(3);
    assert(live.game.elapsed === frozen && war.elapsed > surge && liveColonyWar(o) === null, 'Left alone, the war is abstract again');
  });
  test('Colony wars v28: v27 residents keep their age and start at peace; broken wars are rejected', () => {
    const { s, o } = marsFixture(), old = JSON.parse(serializeSession(s));
    old.version = 27; old.orbital.version = 13; old.orbital.solar.colonies = { mars: old.orbital.solar.colonies.mars.civs.map(({ progress, warId, ...c }) => c) };
    const next = parseSession(JSON.stringify(old)), world = next.orbital.solar.colonies.mars;
    assert(world.phase === 'living' && world.civs.length === 2 && world.civs.every(c => c.progress === 0 && c.warId === null) && world.wars.length === 0);
    updateColonies(o, WORLDS.mars.fuse + .1); const raw = JSON.parse(serializeSession(s));
    const stray = structuredClone(raw); stray.orbital.solar.colonies.mars.wars[0].sides[1] = 'c9-404'; rejects(JSON.stringify(stray), 'A war names two residents');
    const orphan = structuredClone(raw); orphan.orbital.solar.colonies.mars.civs[0].warId = null; rejects(JSON.stringify(orphan), 'Residents and wars agree');
  });
  test.browser('Colony wars UI: the Mars dossier lists the war, watching shows a real battle, and leaving Mars hides it', async () => {
    const { s, run } = marsFixture(); run(WORLDS.mars.fuse + .5);
    const frame = await mountFixture(serializeSession(s), false, 'debug', { reducedMotion: true });
    try {
      const d = frame.contentDocument, w = frame.contentWindow, el = id => d.getElementById(id); let now = 0;
      el('solar-select-mars').click(); w.__testFrame(now += 100);
      assert(!el('solar-war-0').hidden && el('solar-battle-panel').hidden && el('solar-war-0').textContent.includes('观看'));
      el('solar-war-0').click(); w.__testFrame(now += 100);
      assert(!el('solar-battle-panel').hidden && el('solar-war-0').getAttribute('aria-pressed') === 'true' && el('solar-battle-hud').textContent.includes('基地'));
      el('solar-select-earth').click(); w.__testFrame(now += 100); el('solar-select-mars').click(); w.__testFrame(now += 100);
      assert(el('solar-battle-panel').hidden, 'Leaving Mars stops watching');
      assert(!d.body.dataset.fixtureError, d.body.dataset.fixtureError);
    } finally { frame.remove(); }
  });
}

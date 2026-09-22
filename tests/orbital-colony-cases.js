import { launchReady } from './orbital-cases.js';
import { purchaseTalent, updateProgression } from '../src/progression.js';
import { Q } from '../src/quantity.js';
import { parseSession, serializeSession, DEBUG_SAVE_KEY, createSaveStore } from '../src/save.js';
import { enterOrbital, constructOrbital, updateOrbital, getConstructionState, orbitalRates, orbitalIncome, orbitalLegacySpent, getInterventionState, intervene, setCivilizationPolicy } from '../src/orbital-game.js';
import { BODIES } from '../src/orbital-config.js';
import { civilizationAge } from '../src/celestial-economy.js';
import { setDebugLegacy } from '../src/debug.js';
import { buildOrbitalViewModel } from '../src/orbital-view-model.js';
import { simulateOrbital } from '../sim/orbital.js';
import { mountFixture } from './progression-cases.js';
import { drawOrbitalColony } from '../src/orbital-render.js';

export function colonyFixture({ started = true, seconds = 0 } = {}) {
  const s = launchReady(); purchaseTalent(s, 'bypasser');
  s.debug = true; s.debugSpeed = 10; setDebugLegacy(s, 0);
  if (started) enterOrbital(s);
  if (seconds) {
    const result = simulateOrbital({ maxSeconds: seconds });
    s.orbital = result.session.orbital;
    s.permanent.totalLegacy = Q.add(s.permanent.totalLegacy, s.orbital.legacyEarned);
    s.permanent.legacy = Q.sub(s.orbital.legacyEarned, orbitalLegacySpent(s.orbital));
  }
  return s;
}
const advance = (s, seconds) => { for (let i = 0; i < Math.round(seconds * 30); i++) updateProgression(s, 1 / 30); };
export function registerOrbitalColonyTests(test, assert, near) {
  const throws = fn => { let failed = false; try { fn(); } catch { failed = true; } assert(failed, 'Invalid orbital input must be rejected'); };
  test('VI: launch and enter are separate idempotent commands; presentation cannot start the economy', () => {
    const s = colonyFixture({ started:false }), raw = serializeSession(s), cycles = s.permanent.completedCycles;
    advance(s, 100); assert(serializeSession(s) === raw && !constructOrbital(s, 'solar'));
    assert(enterOrbital(s) && !enterOrbital(s)); advance(s, 5);
    near(s.orbital.elapsed, 5); near(s.game.elapsed, parseSession(raw).game.elapsed);
    assert(s.permanent.completedCycles === cycles && s.run.phase === 'orbital');
  });
  test('VI: energy generation, capacity, single paid construction and prerequisites are authoritative', () => {
    const s = colonyFixture(), o = s.orbital;
    assert(getConstructionState(s,'habitat') === 'prerequisite' && !constructOrbital(s,'habitat'));
    assert(constructOrbital(s,'solar') && !constructOrbital(s,'solar') && o.energy === 80);
    advance(s,40); assert(o.structures.solar === 1 && o.project === null && orbitalRates(o).power === 5);
    assert(constructOrbital(s,'habitat')); advance(s,60); assert(o.structures.habitat === 1);
    advance(s,150); assert(Q.eq(o.energy,400) && Q.gt(s.permanent.legacy,0));
    const wallet = s.permanent.legacy; assert(constructOrbital(s,'observer') && Q.eq(s.permanent.legacy,Q.sub(wallet,80)));
    assert(orbitalLegacySpent(o)===80); advance(s,60); assert(orbitalLegacySpent(o)===80);
    parseSession(serializeSession(s));
  });
  test('VI: paused, hidden, invalid and oversized deltas cannot inject offline production', () => {
    const s = colonyFixture({seconds:400}), raw = serializeSession(s);
    for (const dt of [0,-1,NaN,Infinity]) updateProgression(s,dt);
    updateProgression(s,.05,{paused:true}); updateProgression(s,.05,{hidden:true});
    assert(serializeSession(s) === raw); const time = s.orbital.elapsed;
    updateProgression(s,86400); near(s.orbital.elapsed,time+.05);
    const saved = serializeSession(s); assert(serializeSession(parseSession(saved)) === saved);
  });
  test('VI: three civilizations emerge deterministically, grow through eras and never pay surface-cycle rewards', () => {
    const s = colonyFixture(), total=s.permanent.totalLegacy, cycles=s.permanent.completedCycles;
    advance(s,7); assert(s.orbital.bodies.earth.civilizations.every(c=>!c.born));
    advance(s,1.1); assert(s.orbital.bodies.earth.civilizations[0].born);
    advance(s,100); assert(s.orbital.bodies.earth.civilizations.every(c=>c.born));
    assert(s.permanent.totalLegacy===total && s.permanent.completedCycles===cycles && orbitalIncome(s.orbital)===0);
    const a=colonyFixture({seconds:900}), b=colonyFixture({seconds:900});
    assert(JSON.stringify(a.orbital)===JSON.stringify(b.orbital));
    assert(a.orbital.bodies.earth.civilizations.some(c=>civilizationAge(c)>=3));
  });
  test('VI: policies and interventions change real growth, income, unrest and use normal energy/cooldown gates', () => {
    const s=colonyFixture({seconds:400}), c=s.orbital.bodies.earth.civilizations[0];
    assert(setCivilizationPolicy(s,'earth',c.id,'tribute')); const income=orbitalIncome(s.orbital);
    assert(setCivilizationPolicy(s,'earth',c.id,'balance') && orbitalIncome(s.orbital)<income);
    const energy=s.orbital.energy,progress=c.progress;
    assert(intervene(s,'earth',c.id,'uplift') && Q.eq(s.orbital.energy,Q.sub(energy,60)) && c.progress===progress+22);
    assert(c.signal.kind==='uplift' && !intervene(s,'earth',c.id,'uplift'));
    c.unrest=80; const war=orbitalIncome(s.orbital); assert(intervene(s,'earth',c.id,'peace') && c.unrest===45 && orbitalIncome(s.orbital)>war);
    const wallet=s.permanent.legacy,earned=s.orbital.legacyEarned;
    assert(intervene(s,'earth',c.id,'tribute') && Q.gt(s.permanent.legacy,wallet) && Q.eq(Q.sub(s.permanent.legacy,wallet),Q.sub(s.orbital.legacyEarned,earned)));
    assert(!intervene(s,'earth',c.id,'tribute')); s.orbital.energy=0;
    assert(getInterventionState(s,'earth','ridge','tribute')==='energy');
    assert(!intervene(s,'moon','delta','tribute') && !setCivilizationPolicy(s,'earth',c.id,'invalid'));
    parseSession(serializeSession(s));
  });
  test('VI: automatic mediation is opt-in, pays energy and respects cooldown and paused time', () => {
    const s=colonyFixture({seconds:650}), o=s.orbital,c=o.bodies.earth.civilizations[0]; c.unrest=80;c.cooldowns.peace=0;
    updateOrbital(s,1/30); assert(c.unrest>=80);o.autoStabilize=true; const energy=o.energy;
    updateOrbital(s,1/30); assert(c.unrest<65 && Q.lt(o.energy,energy) && c.cooldowns.peace===40);
    c.unrest=80;updateOrbital(s,1/30);assert(c.unrest>=80);
    const raw=serializeSession(s);updateProgression(s,.05,{paused:true});assert(serializeSession(s)===raw);
  });
  test('VI: active builds, civilization cooldowns, fractional yield and completed projects round-trip without spending twice', () => {
    for(const seconds of [0,30,400,900,1445,1600]) {
      const s=colonyFixture({seconds}), raw=serializeSession(s), restored=parseSession(raw);
      assert(serializeSession(restored)===raw);
      advance(s,5);advance(restored,5);assert(serializeSession(s)===serializeSession(restored));
    }
  });
  test('VI: old v14 arrival migrates to an unstarted home while preserving balance and settlement', () => {
    const s=colonyFixture({started:false}), record=JSON.parse(serializeSession(s)); record.version=14;delete record.orbital;
    const restored=parseSession(JSON.stringify(record));
    assert(restored.version===15 && !restored.orbital.started && Q.eq(restored.permanent.legacy,s.permanent.legacy));
    assert(restored.permanent.completedCycles===s.permanent.completedCycles && restored.run.earnedLegacy===s.run.earnedLegacy);
  });
  test('VI: corrupt structures, orders, body state, cooldowns, capacity and future versions are rejected', () => {
    const s=colonyFixture({seconds:400}), record=serializeSession(s);
    for(const edit of [r=>delete r.orbital,r=>r.orbital.version=2,r=>r.orbital.energy=-1,r=>r.orbital.energy=100000,
      r=>r.orbital.structures.solar=4,r=>r.orbital.structures.shipyard=1,r=>r.orbital.project.legacy=0,
      r=>r.orbital.bodies.earth.civilizations[0].policy='x',r=>r.orbital.bodies.earth.civilizations[0].cooldowns.peace=-1,
      r=>r.orbital.bodies.earth.civilizations[0].progress=999,r=>r.orbital.selectedBody='mars',
      r=>r.orbital.bodies.earth.civilizations.pop(),r=>r.orbital.completionAt=400,r=>r.orbital.legacyFraction=1,
      r=>r.orbital.legacyEarned='1e99',r=>r.orbital.autoStabilize=true,r=>r.orbital.started=false]) {
      const bad=JSON.parse(record);edit(bad);throws(()=>parseSession(JSON.stringify(bad)));
    }
  });
  test('VI: debug balance accounts for orbital purchases; valid backup survives invalid import', () => {
    const s=colonyFixture({seconds:900});assert(setDebugLegacy(s,'1234') && s.permanent.legacy===1234);
    assert(parseSession(serializeSession(s)).permanent.legacy===1234);
    const data=new Map(), storage={getItem:key=>data.get(key)??null,setItem:(key,v)=>data.set(key,v),removeItem:key=>data.delete(key)};
    const store=createSaveStore(()=>storage,{debug:true});store.load();assert(store.save(s).ok);advance(s,1);assert(store.save(s).ok);
    const bad={...s,orbital:{...s.orbital,energy:-1}};assert(!store.save(bad).ok);
    assert(createSaveStore(()=>storage,{debug:true}).load().ok);
    const unavailable=createSaveStore(()=>{throw new Error('no storage');});assert(!unavailable.save(s).ok);
  });
  test('VI: full zero-wallet construction routes complete in 20–30 minutes; no VII phase or second settlement', () => {
    for(const options of [{},{policy:'nurture'},{policy:'tribute'},{active:false},{legacy:10000}]) {
      const r=simulateOrbital(options); assert(r.completed && r.seconds>=1200 && r.seconds<=1800);
      assert(r.session.orbital.structures.shipyard===1 && r.session.run.phase==='orbital');
      assert(Q.gt(r.legacyEarned,0));
    }
    const s=colonyFixture({seconds:1800}), completed=s.orbital.completionAt,cycles=s.permanent.completedCycles;
    assert(!constructOrbital(s,'shipyard') && !enterOrbital(s));advance(s,50);
    assert(s.orbital.completionAt===completed && s.permanent.completedCycles===cycles);
  });
  test('VI simulation: invalid budgets, policies and time bounds are rejected', () => {
    for (const options of [{legacy:-1},{legacy:.5},{policy:'unknown'},{active:1},{maxSeconds:Infinity},{maxSeconds:-1},{maxSeconds:86401}]) throws(()=>simulateOrbital(options));
  });
  test('VI view model: income source, construction reasons, policy and lunar gates match the economy', () => {
    const s=colonyFixture(), vm=buildOrbitalViewModel(s);
    assert(vm['#orbital-game@hidden']===false);
    assert(vm['#build-solar@disabled']===false && vm['#build-habitat@disabled']===true && vm['#observe-moon@disabled']);
    const late=colonyFixture({seconds:1450}); late.orbital.selectedBody='moon';const model=buildOrbitalViewModel(late,{paused:true});
    assert(!model['#colony-complete@hidden'] && model['#colony-pause']==='继续' && model['#colony-civilization@hidden']);
    assert(model['#colony-income']===`+${orbitalIncome(late.orbital).toFixed(1)}/秒`);
  });
  test.browser('VI UI: enter, build, Space pause, modal pause, save/restore and mobile controls use the real controller', async () => {
    let frame=await mountFixture(serializeSession(colonyFixture({started:false})),false,'debug',{reducedMotion:true});
    let raw;
    try {
      const win=frame.contentWindow,doc=frame.contentDocument,el=id=>doc.getElementById(id);let now=0;
      const tick=n=>{for(let i=0;i<n;i++)win.__testFrame(now+=100);};
      assert(el('archives-dialog').open && !el('orbital-presentation').hidden);
      el('enter-orbital').click();assert(!el('archives-dialog').open && !el('orbital-game').hidden);
      el('build-solar').click();tick(12); const before=el('colony-time').textContent;
      doc.body.dispatchEvent(new win.KeyboardEvent('keydown',{code:'Space',bubbles:true}));tick(20);
      assert(el('colony-time').textContent===before && el('colony-pause').textContent==='继续');
      el('colony-pause').click();tick(50);assert(el('build-solar-rank').textContent==='1 / 3');
      el('colony-save').click();const frozen=el('colony-time').textContent;tick(20);assert(el('colony-time').textContent===frozen);
      el('manual-save').click();raw=win.__storage.getItem(DEBUG_SAVE_KEY);assert(parseSession(raw).orbital.structures.solar===1);
      el('close-save').click();
      for(const width of [320,390,1100]) {frame.style.width=`${width}px`;await new Promise(r=>setTimeout(r,30));tick(1);
        assert(doc.documentElement.scrollWidth<=width+2,'No horizontal overflow');
        assert(el('build-habitat').getBoundingClientRect().width>=44 && el('colony-pause').getBoundingClientRect().height>=40);
      }
    }finally{frame.remove();}
    frame=await mountFixture(raw,false,'debug');
    try{const doc=frame.contentDocument;assert(!doc.getElementById('orbital-game').hidden && !doc.getElementById('archives-dialog').open);
      assert(doc.getElementById('build-solar-rank').textContent==='1 / 3');
    }finally{frame.remove();}
  });
  test.browser('VI UI: a complete empty-wallet run builds the lunar port through normal buttons and saves its completion once', async () => {
    const seed=colonyFixture();seed.debugSpeed=20;
    const frame=await mountFixture(serializeSession(seed),false,'debug',{reducedMotion:true});
    try {
      const win=frame.contentWindow,doc=frame.contentDocument,el=id=>doc.getElementById(id);
      const plan=['solar','habitat','observer','battery','solar','habitat','relay','solar','battery','relay','habitat','survey','outpost','reactor','shipyard'];
      let next=0,now=0;
      for(let i=0;i<1800 && el('colony-complete').hidden;i++) {
        if(next<plan.length && !el(`build-${plan[next]}`).disabled) el(`build-${plan[next++]}`).click();
        win.__testFrame(now+=100);
      }
      assert(next===plan.length && !el('colony-complete').hidden,'The real UI must reach the completed lunar port');
      el('observe-moon').click();assert(!el('colony-lunar').hidden && el('colony-civilization').hidden);
      el('colony-save').click();el('manual-save').click();
      const saved=parseSession(win.__storage.getItem(DEBUG_SAVE_KEY));
      assert(saved.orbital.structures.shipyard===1 && saved.orbital.completionAt>=1200 && saved.orbital.completionAt<=1800);
      assert(saved.permanent.completedCycles===seed.permanent.completedCycles);
    }finally{frame.remove();}
  });
  test.browser('VI renderer: Earth, Moon, construction and reduced-motion redraw deterministically on a phone canvas', () => {
    const canvas=document.createElement('canvas');canvas.width=390;canvas.height=340;const ctx=canvas.getContext('2d');
    const s=colonyFixture({seconds:1450});
    for(const body of Object.keys(BODIES)){s.orbital.selectedBody=body;drawOrbitalColony(ctx,390,340,s.orbital,{reducedMotion:true});const before=canvas.toDataURL();
      s.orbital.elapsed+=1;drawOrbitalColony(ctx,390,340,s.orbital,{reducedMotion:true});assert(canvas.toDataURL()===before);
    }
  });
}

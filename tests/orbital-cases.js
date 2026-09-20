import { Q } from '../src/quantity.js';
import { records } from './fixtures/v10-save.js';
import { parseSession, serializeSession, SAVE_KEY } from '../src/save.js';
import { purchaseTalent, TALENTS, getTalentState } from '../src/talents.js';
import { transitionCivilization, rebuildCivilization, updateProgression, resolveBattle } from '../src/progression.js';
import { ORBITAL_SECONDS, ORBITAL_FLEET, orbitalFrame, drawOrbitalScene } from '../src/orbital-scene.js';
import { mountFixture } from './progression-cases.js';
import { runDebugCommand } from '../src/debug.js';
import { LEGACY_ECONOMY } from '../src/progression-config.js';

export function launchReady() {
  const s = parseSession(JSON.stringify(records.destruction));
  // Endgame fixture: the protocol needs the deepest expedition behind it and a
  // wallet to match. Actual purchases still use the production API.
  s.permanent.totalLegacy = Q.add(s.permanent.totalLegacy, 2 ** 21);
  s.permanent.legacy = Q.add(s.permanent.legacy, 2 ** 21);
  s.permanent.deepestChallenge = LEGACY_ECONOMY.bypasserChallenge;
  s.permanent.completedCycles = Math.max(s.permanent.completedCycles, LEGACY_ECONOMY.bypasserChallenge);
  return s;
}
export function registerOrbitalTests(test, assert) {
  test('Orbital debug budget: only debug between-run sessions receive currency; no completions or actual-run rewards are fabricated', () => {
    const s=launchReady(), before=serializeSession(s);assert(!runDebugCommand(s,'legacy') && serializeSession(s)===before);
    s.debug=true;s.debugSpeed=1;const balance=s.permanent.legacy,cycles=s.permanent.completedCycles,reward=s.run.earnedLegacy;
    assert(runDebugCommand(s,'legacy') && s.permanent.legacy===balance+2**21);
    assert(s.permanent.completedCycles===cycles && s.run.earnedLegacy===reward);parseSession(serializeSession(s));
    purchaseTalent(s,'bypasser');assert(!runDebugCommand(s,'legacy'));
  });
  test('Orbital: purchase atomically pays once and persists arrival before any animation; stale launch and rebuild are inert', () => {
    let s=launchReady(); const before=serializeSession(s), wallet=s.permanent.legacy, total=s.permanent.totalLegacy, earned=s.run.earnedLegacy, cycles=s.permanent.completedCycles;
    assert(!transitionCivilization(s,'launch','old-run') && serializeSession(s)===before);
    assert(purchaseTalent(s,'bypasser') && s.run.phase==='orbital' && s.permanent.talents.bypasser===1);
    assert(s.permanent.legacy===wallet-TALENTS.bypasser.costs[0] && s.permanent.totalLegacy===total);
    const raw=serializeSession(s); s=parseSession(raw);
    assert(s.run.earnedLegacy===earned && s.permanent.completedCycles===cycles && s.run.settled);
    assert(!purchaseTalent(s,'bypasser') && !transitionCivilization(s,'launch',s.run.runId) && !rebuildCivilization(s,s.run.runId) && !resolveBattle(s));
    for(let i=0;i<100;i++)updateProgression(s,.05);
    assert(serializeSession(s)===raw);
  });
  test('Orbital: battle, early victory, defeat, missing plan and insufficient funds cannot launch', () => {
    for(const phase of ['battle','victory','defeat']) {
      const s=launchReady();s.run.phase=phase;
      assert(!purchaseTalent(s,'bypasser') && !transitionCivilization(s,'launch',s.run.runId));
    }
    const s=launchReady();s.permanent.talents.superSoldierPlan=0;
    assert(getTalentState(s,'bypasser')==='prerequisite' && !transitionCivilization(s,'launch',s.run.runId));
    s.permanent.talents.superSoldierPlan=1;s.permanent.legacy=TALENTS.bypasser.costs[0]-1;
    assert(getTalentState(s,'bypasser')==='legacy' && !purchaseTalent(s,'bypasser'));
    s.permanent.legacy++;assert(purchaseTalent(s,'bypasser') && s.permanent.legacy===0);
  });
  test('Orbital: inconsistent arrival phase, lost settlement and missing payment cannot be imported', () => {
    const s=launchReady();purchaseTalent(s,'bypasser');const raw=serializeSession(s);
    for(const edit of [r=>r.run.phase='destruction', r=>r.permanent.talents.bypasser=0, r=>r.run.settled=false,
      r=>r.permanent.purchaseCosts.bypasser=[],r=>r.game.ages.enemy=4]) {
      const bad=JSON.parse(raw);edit(bad);let failed=false;try{parseSession(JSON.stringify(bad));}catch{failed=true;}assert(failed);
    }
  });
  test('Orbital scene: 36 staggered ships, monotonic camera/tree fade, deterministic seeking and static reduced motion', () => {
    assert(ORBITAL_FLEET.length===36 && new Set(ORBITAL_FLEET.map(s=>s.delay)).size===36);
    let previous=orbitalFrame(0);
    for(let time=0;time<=ORBITAL_SECONDS;time+=.25) {
      const f=orbitalFrame(time);assert(f.camera>=previous.camera && f.treeOpacity<=previous.treeOpacity);
      assert(JSON.stringify(f)===JSON.stringify(orbitalFrame(time)));previous=f;
    }
    assert(previous.complete && previous.camera===1 && previous.treeOpacity===0 && previous.arrival===1);
    assert(JSON.stringify(orbitalFrame(0,true))===JSON.stringify(orbitalFrame(ORBITAL_SECONDS)));
  });
  test.browser('Orbital browser: purchase saves immediately, Escape skips, review/replay never pay twice and refresh restores VI', async () => {
    let frame=await mountFixture(serializeSession(launchReady()));
    try {
      let doc=frame.contentDocument, el=id=>doc.getElementById(id);
      el('node-bypasser').click();assert(!el('buy-bypasser').disabled && el('buy-bypasser').textContent.includes(String(TALENTS.bypasser.costs[0])));
      el('buy-bypasser').click();const raw=frame.contentWindow.__storage.getItem(SAVE_KEY);
      assert(parseSession(raw).run.phase==='orbital' && !el('orbital-presentation').hidden);
      assert(el('home-scroll').inert && !el('archives-dialog').querySelector(':focus')?.closest('.talent-details'));
      el('archives-dialog').dispatchEvent(new frame.contentWindow.Event('cancel',{cancelable:true}));
      assert(el('archives-dialog').dataset.orbital==='arrived' && !el('orbital-actions').hidden);
      assert(doc.activeElement.id==='orbital-title');
      el('review-surface').click();assert(el('orbital-presentation').hidden && !el('home-scroll').inert);
      el('node-bypasser').click();assert(el('buy-bypasser').disabled && el('cost-bypasser').textContent==='完整');
      el('return-orbit').click();el('replay-orbital').click();el('skip-orbital').click();
      assert(frame.contentWindow.__storage.getItem(SAVE_KEY)===raw);
      frame.remove();frame=await mountFixture(raw);doc=frame.contentDocument;el=id=>doc.getElementById(id);
      assert(el('archives-dialog').dataset.orbital==='arrived' && el('orbital-title').textContent.includes('轨道文明'));
      assert(el('skip-orbital').hidden && frame.contentWindow.__storage.getItem(SAVE_KEY)===raw);
      el('orbital-save').click();assert(el('save-dialog').open);el('manual-save').click();
      assert(frame.contentWindow.__storage.getItem(SAVE_KEY)===raw);
    } finally { frame.remove(); }
  });
  test.browser('Orbital browser: motion preference skips camera/fleet, while canvas previews seek reproducibly at phone and desktop sizes', async () => {
    const frame=await mountFixture(serializeSession(launchReady()),false,'incremental',{reducedMotion:true});
    try {
      frame.style.width='390px';frame.style.height='844px';const doc=frame.contentDocument,el=id=>doc.getElementById(id);
      el('node-bypasser').click();el('buy-bypasser').click();
      assert(el('archives-dialog').dataset.orbital==='arrived' && el('skip-orbital').hidden);
      assert(doc.documentElement.scrollWidth<=frame.clientWidth);
      for(const [w,h] of [[390,844],[1280,800]]) {
        const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');
        drawOrbitalScene(ctx,w,h,10);const middle=canvas.toDataURL();drawOrbitalScene(ctx,w,h,24);assert(canvas.toDataURL()!==middle);
        drawOrbitalScene(ctx,w,h,10);assert(canvas.toDataURL()===middle);
        drawOrbitalScene(ctx,w,h,0,{reducedMotion:true});const reduced=canvas.toDataURL();drawOrbitalScene(ctx,w,h,24);assert(canvas.toDataURL()===reduced);
      }
    } finally { frame.remove(); }
  });
  test.browser('Orbital clock: full launch reaches VI; hidden time and save dialogs cannot advance it or the ended civilization', async () => {
    const frame=await mountFixture(serializeSession(launchReady()));
    try {
      const doc=frame.contentDocument,win=frame.contentWindow,el=id=>doc.getElementById(id);
      el('node-bypasser').click();el('buy-bypasser').click();const raw=win.__storage.getItem(SAVE_KEY);
      let hidden=false,now=0;Object.defineProperty(doc,'hidden',{configurable:true,get:()=>hidden});
      const tick=count=>{for(let i=0;i<count;i++)win.__testFrame(now+=100);};
      tick(10);const opacity=el('orbital-presentation').style.getPropertyValue('--scene-opacity');
      hidden=true;doc.dispatchEvent(new win.Event('visibilitychange'));tick(100);
      assert(el('orbital-presentation').style.getPropertyValue('--scene-opacity')===opacity);
      hidden=false;doc.dispatchEvent(new win.Event('visibilitychange'));el('save-menu').click();tick(100);
      assert(el('orbital-presentation').style.getPropertyValue('--scene-opacity')===opacity);
      el('close-save').click();tick(250);
      assert(el('archives-dialog').dataset.orbital==='arrived' && !el('orbital-actions').hidden);
      assert(win.__storage.getItem(SAVE_KEY)===raw && doc.activeElement.id==='orbital-title');
    } finally { frame.remove(); }
  });
}

import { voyageReady, voyageFixture, lunarFixture } from './orbital-colony-cases.js';
import { mountFixture } from './progression-cases.js';
import { serializeSession, parseSession, DEBUG_SAVE_KEY } from '../src/save.js';
import { purchaseOrbitalTalent } from '../src/orbital-game.js';
import { Q } from '../src/quantity.js';
import { buildSolarViewModel } from '../src/solar-view-model.js';
import { bodyPosition, BODIES } from '../src/solar-config.js';
import { solarViewport, bodyAt, DESTINATIONS, drawSolarSystem, drawBodyPortrait } from '../src/solar-render.js';
import { drawShipyard, ARK_COUNT } from '../src/shipyard-render.js';
import { voyageFrame, arkPose, drawVoyageScene, VOYAGE_SECONDS } from '../src/voyage-scene.js';
import { ANIMATION_CLIPS } from '../src/animation-clips.js';

export function registerSolarTests(test, assert, near) {
  test('Solar atlas: readiness and destinations derive from the real saved VI state without mutations', () => {
    const s=voyageReady(),raw=serializeSession(s),v=buildSolarViewModel(s,{view:'moon'});
    assert(v['#orbital-game@data-stage']==='VI' && v['#colony-system@hidden']);
    assert(v['#shipyard-status'].includes('整备完成') && v['#shipyard-voyage'].includes('签署'));
    assert(v['#shipyard-gate-ring@data-ready'] && v['#shipyard-gate-cycles@data-ready'] && v['#shipyard-gate-winter@data-ready']);
    assert(serializeSession(s)===raw);assert(purchaseOrbitalTalent(s,'voyage'));
    const vii=buildSolarViewModel(s,{view:'system',selected:'saturn'});
    assert(vii['#orbital-game@data-stage']==='VII' && !vii['#colony-system@hidden']);
    assert(vii['#colony-body-name']==='土星' && vii['#colony-body-enter@hidden']);
    assert(vii['#solar-body-note'].includes('尚未开放') && vii['#shipyard-status'].includes('已启航'));
    assert(DESTINATIONS.length===10 && new Set(DESTINATIONS.map(b=>b.id)).size===10);
    assert(buildSolarViewModel(s,{selected:'moon'})['#colony-body-enter']==='进入月面家园 ↗');
  });
  test('Solar atlas: uniform projection and shared hit positions stay in bounds at desktop and mobile sizes', () => {
    for(const [w,h] of [[1400,700],[390,350],[320,350]]) {
      const v=solarViewport(w,h);near(v.x*2+1000*v.scale,w);near(v.y*2+500*v.scale,h);
      for(const b of BODIES.filter(b=>!b.belt)) {
        const p=bodyPosition(b,0);assert(p.x>0 && p.x<1000 && p.y>0 && p.y<500);
        assert(bodyAt({elapsed:0},p.x,p.y).id===b.id);
      }
    }
  });
  test('Voyage: tree fades before departure, six docked arks stagger toward distinct destinations and actions arrive last', () => {
    assert(voyageFrame(0).treeOpacity===1 && voyageFrame(3).treeOpacity===0);
    assert(voyageFrame(6).moonRise===1 && voyageFrame(17).actions===0);
    const targets=new Set();
    for(let i=0;i<ARK_COUNT;i++) {
      const dock=arkPose(i,5,1000,700),end=arkPose(i,VOYAGE_SECONDS,1000,700);
      assert(dock.flight===0 && dock.x===dock.launchX && dock.y===dock.launchY);
      assert(end.flight===1 && end.scale<dock.scale);near(end.x,end.targetX);near(end.y,end.targetY);
      targets.add(`${end.x}:${end.y}`);
    }
    assert(targets.size===6 && arkPose(0,7,1000,700).flight>arkPose(5,7,1000,700).flight);
    assert(voyageFrame(VOYAGE_SECONDS).actions===1 && voyageFrame(0,true).complete);
    assert(ANIMATION_CLIPS.some(c=>c.id==='interplanetary-voyage' && c.kind==='voyage'));
  });
  test('Voyage: purchase is atomic before presentation and reloading cannot charge or settle it again', () => {
    const s=voyageReady(),before=s.permanent.legacy;assert(purchaseOrbitalTalent(s,'voyage'));
    const raw=serializeSession(s),back=parseSession(raw);assert(Q.lt(back.permanent.legacy,before));
    assert(back.orbital.talents.voyage===1 && !purchaseOrbitalTalent(back,'voyage'));
    assert(serializeSession(back)===raw && buildSolarViewModel(back,{view:'system'})['#orbital-game@data-stage']==='VII');
  });
  test.browser('Voyage rendering: shipyard phases, planetary portraits and launch frames differ; reduced motion is stable and read-only', () => {
    const c=document.createElement('canvas');c.width=700;c.height=500;const x=c.getContext('2d'),s=voyageReady(),raw=serializeSession(s);
    drawShipyard(x,700,500,s.orbital);const dock=c.toDataURL();drawShipyard(x,700,500,{...s.orbital,talents:{...s.orbital.talents,voyage:1}});assert(c.toDataURL()!==dock);
    const portraits=new Set();for(const b of DESTINATIONS){drawBodyPortrait(x,700,500,b,s.orbital);portraits.add(c.toDataURL());}assert(portraits.size===DESTINATIONS.length);
    drawSolarSystem(x,700,500,s.orbital,{reducedMotion:true});const quiet=c.toDataURL();drawSolarSystem(x,700,500,s.orbital,{reducedMotion:true,ambientTime:90});assert(c.toDataURL()===quiet);
    const frames=new Set();for(const t of [0,4,8,14,22]){drawVoyageScene(x,700,500,t);frames.add(c.toDataURL());}assert(frames.size===5);
    drawVoyageScene(x,700,500,0,{reducedMotion:true});const still=c.toDataURL();drawVoyageScene(x,700,500,12,{reducedMotion:true});assert(c.toDataURL()===still && serializeSession(s)===raw);
  });
  test.browser('VI tree: lunar income and wars continue; tree pause, save dialog and hidden page stop simulation without catch-up', async () => {
    const seed=lunarFixture();seed.debugSpeed=1;
    const frame=await mountFixture(serializeSession(seed),false,'debug',{reducedMotion:true});
    try {
      const w=frame.contentWindow,d=frame.contentDocument,el=id=>d.getElementById(id);let now=0;
      const tick=n=>{for(let i=0;i<n;i++)w.__testFrame(now+=100);};
      el('colony-start-war').click();el('colony-talents').click();tick(20);
      el('orbit-tree-pause').click();const time=el('colony-time').textContent,wallet=el('colony-lunar-produced').textContent;tick(20);
      assert(el('colony-time').textContent===time && el('colony-lunar-produced').textContent===wallet && el('orbit-tree-pause').getAttribute('aria-pressed')==='true');
      el('orbit-tree-pause').click();tick(120);assert(el('colony-time').textContent!==time && el('colony-lunar-produced').textContent!==wallet,`Tree did not resume: hidden=${d.hidden}, dialogs=${[...d.querySelectorAll('dialog[open]')].map(x=>x.id)}, time=${time}/${el('colony-time').textContent}, wallet=${wallet}/${el('orbit-tree-wallet').textContent}`);
      el('close-orbit-talents').click();el('colony-save').click();const savedTime=el('colony-time').textContent;tick(20);assert(el('colony-time').textContent===savedTime);
      el('manual-save').click();const saved=parseSession(w.__storage.getItem(DEBUG_SAVE_KEY));assert(saved.orbital.lunarProduced>seed.orbital.lunarProduced && saved.orbital.wars[0].game.elapsed>0);
      el('close-save').click();el('colony-talents').click();Object.defineProperty(d,'hidden',{configurable:true,value:true});d.dispatchEvent(new w.Event('visibilitychange'));tick(20);assert(el('colony-time').textContent===savedTime);
      Object.defineProperty(d,'hidden',{configurable:true,value:false});d.dispatchEvent(new w.Event('visibilitychange'));w.__testFrame(now+=3600000);assert(el('colony-time').textContent===savedTime,'No offline catch-up');
      assert(!d.body.dataset.fixtureError,d.body.dataset.fixtureError);
    } finally {frame.remove();}
  });
  test.browser('Voyage UI: committed purchase survives refresh; skip and replay release modal pause without a second charge', async () => {
    let frame=await mountFixture(serializeSession(voyageReady()),false,'debug'),raw;
    try {
      const d=frame.contentDocument,w=frame.contentWindow,el=id=>d.getElementById(id);let now=0;
      const tick=n=>{for(let i=0;i<n;i++)w.__testFrame(now+=100);};
      el('colony-talents').click();el('orbit-node-voyage').click();el('orbit-buy').click();
      assert(el('voyage-dialog').open && el('orbit-talents-dialog').open);raw=w.__storage.getItem(DEBUG_SAVE_KEY);assert(parseSession(raw).orbital.talents.voyage===1);
      el('orbit-buy').click();assert(w.__storage.getItem(DEBUG_SAVE_KEY)===raw,'Repeated clicks cannot charge twice');
      const time=el('colony-time').textContent;tick(30);assert(el('colony-time').textContent===time);
      el('voyage-skip').click();assert(el('voyage-dialog').dataset.phase==='arrived' && !el('voyage-actions').inert);
      const title=el('voyage-title').getBoundingClientRect().top;tick(20);near(el('voyage-title').getBoundingClientRect().top,title);
      el('voyage-enter').click();assert(!el('voyage-dialog').open && !el('orbit-talents-dialog').open && el('orbital-game').dataset.view==='system');
      tick(10);assert(el('colony-time').textContent!==time);
      el('solar-replay').click();el('voyage-dialog').dispatchEvent(new w.Event('cancel',{cancelable:true}));assert(el('voyage-dialog').dataset.phase==='arrived');
      el('voyage-dialog').dispatchEvent(new w.Event('cancel',{cancelable:true}));assert(!el('voyage-dialog').open);
      assert(parseSession(w.__storage.getItem(DEBUG_SAVE_KEY)).orbital.talents.voyage===1);
      assert(!d.body.dataset.fixtureError,d.body.dataset.fixtureError);
    } finally {frame.remove();}
    frame=await mountFixture(raw,false,'debug');try{assert(frame.contentDocument.getElementById('orbital-game').dataset.view==='system' && !frame.contentDocument.getElementById('voyage-dialog').open);}finally{frame.remove();}
  });
  test.browser('Voyage UI: full film and reduced-motion arrival keep fixed layout, preserve manual pause and recover from canvas failure', async () => {
    for(const reducedMotion of [false,true]) {
      const frame=await mountFixture(serializeSession(voyageFixture()),false,'debug',{reducedMotion});
      try {
        const d=frame.contentDocument,w=frame.contentWindow,el=id=>d.getElementById(id);let now=0;
        el('colony-pause').click();el('solar-replay').click();for(let i=0;i<230;i++)w.__testFrame(now+=100);
        assert(el('voyage-dialog').dataset.phase==='arrived');el('voyage-enter').click();assert(el('colony-pause').getAttribute('aria-pressed')==='true');
        el('voyage-canvas').getContext=()=>{throw Error('Test canvas failure');};el('solar-replay').click();
        assert(!el('voyage-dialog').open && !el('orbit-talents-dialog').open && el('orbital-game').dataset.view==='system');
        el('colony-pause').click();assert(el('colony-pause').getAttribute('aria-pressed')==='false');
      } finally {frame.remove();}
    }
  });
  test.browser('Solar UI: responsive catalogue, planet portraits, Earth and Moon navigation and shipyard gates work at 320/390/1100px', async () => {
    const frame=await mountFixture(serializeSession(voyageFixture()),false,'debug',{reducedMotion:true});
    try {
      const d=frame.contentDocument,w=frame.contentWindow,el=id=>d.getElementById(id);let now=0;
      for(const width of [320,390,1100]) {
        frame.style.width=`${width}px`;await new Promise(r=>setTimeout(r,35));w.__testFrame(now+=100);
        assert(d.documentElement.scrollWidth<=width+2,`System overflow at ${width}`);
        const earth=el('solar-body-portrait').toDataURL();el('solar-select-saturn').click();w.__testFrame(now+=100);
        assert(el('colony-body-name').textContent==='土星' && el('solar-body-portrait').toDataURL()!==earth);
        const chart=el('colony-system-canvas'),r=chart.getBoundingClientRect();near(chart.width/chart.height,r.width/r.height);
        el('solar-select-saturn').dispatchEvent(new w.KeyboardEvent('keydown',{code:'ArrowRight',bubbles:true}));assert(el('colony-body-name').textContent==='天王星');
        el('solar-to-earth').click();w.__testFrame(now+=100);assert(el('orbital-game').dataset.view==='earth' && !el('colony-world').hidden);
        el('colony-view-moon').click();w.__testFrame(now+=100);assert(el('orbital-game').dataset.view==='moon' && !el('colony-shipyard').hidden);
        assert(el('shipyard-status').textContent.includes('已启航') && d.documentElement.scrollWidth<=width+2);
        el('shipyard-build').click();assert(el('orbit-talents-dialog').open && el('orbit-detail').textContent.includes('船坞'));el('close-orbit-talents').click();
        el('colony-view-system').click();el('solar-select-earth').click();w.__testFrame(now+=100);
      }
      assert(!d.body.dataset.fixtureError,d.body.dataset.fixtureError);
    } finally {frame.remove();}
  });
}

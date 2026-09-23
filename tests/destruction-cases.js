import { DESTRUCTION_SECONDS, LAST_ARSENAL, destructionFrame, missilePose, drawDestructionScene, createDestructionPreview } from '../src/destruction-scene.js';
import { drawOrbitalScene } from '../src/orbital-scene.js';
import { drawBattleScene } from '../src/render.js';
import { createDebugProgression } from '../src/debug.js';
import { serializeSession, parseSession, DEBUG_SAVE_KEY } from '../src/save.js';
import { mountFixture } from './progression-cases.js';
import { rebuildCivilization } from '../src/progression.js';

export function registerDestructionTests(test, assert, near) {
  test('Destruction timeline: retaliation precedes fallout, ruins settle before stars appear, reduced motion resolves immediately', () => {
    assert(destructionFrame(2).caption.includes('基地') && destructionFrame(5).caption.includes('超级士兵'));
    assert(destructionFrame(8).caption.includes('导弹') && destructionFrame(14).caption.includes('文明'));
    let previous = destructionFrame(0);
    for (let t = 0; t <= DESTRUCTION_SECONDS; t += .25) {
      const f = destructionFrame(t);
      assert(f.expansion >= previous.expansion && f.ruins >= previous.ruins && f.treeOpacity >= previous.treeOpacity);
      assert(!f.treeOpacity || f.ruins === 1, 'Tree must wait for a settled ruin scene');
      assert(JSON.stringify(f) === JSON.stringify(destructionFrame(t))); previous = f;
    }
    assert(previous.complete && previous.treeOpacity === 1);
    assert(JSON.stringify(destructionFrame(0,true)) === JSON.stringify(previous));
    assert(destructionFrame(-5).time === 0 && destructionFrame(1e6).time === DESTRUCTION_SECONDS);
  });
  test('Destruction missiles: staggered launch, continuous ascent/descent, ground impact and deterministic backward seeking', () => {
    assert(LAST_ARSENAL.length >= 15 && new Set(LAST_ARSENAL.map(m => m.target)).size === LAST_ARSENAL.length);
    for (const missile of LAST_ARSENAL) {
      const start = missilePose(missile,missile.delay,1180,640,1280);
      const top = missilePose(missile,missile.delay+missile.duration*.5,1180,640,1280);
      const end = missilePose(missile,missile.delay+missile.duration+.001,1180,640,1280);
      assert(start.active && top.active && !end.active && top.y < start.y);
      near(end.y,640); near(end.x,1280*missile.target);
      let previous = start;
      for(let t=missile.delay; t<=missile.delay+missile.duration; t+=.01) {
        const p=missilePose(missile,t,1180,640,1280);
        assert(Math.hypot(p.x-previous.x,p.y-previous.y) < 12 && Number.isFinite(p.angle));previous=p;
      }
      assert(JSON.stringify(start)===JSON.stringify(missilePose(missile,missile.delay,1180,640,1280)));
    }
  });
  test.browser('Destruction painting: begins with the real final battle, ends on the identical home ruins, seeks without changing combat', () => {
    const game=createDestructionPreview(), before=JSON.stringify(game);
    const canvas=document.createElement('canvas'), other=document.createElement('canvas');
    canvas.width=other.width=640;canvas.height=other.height=400;
    const ctx=canvas.getContext('2d',{willReadFrequently:true}), reference=other.getContext('2d',{willReadFrequently:true});
    drawDestructionScene(ctx,640,400,0,{game});
    reference.scale(.5,.5);drawBattleScene(reference,game,{height:800});reference.resetTransform();
    assert(canvas.toDataURL()===other.toDataURL(),'Initial frame must match the battlefield painter');
    drawDestructionScene(ctx,640,400,7.5,{game});const pixels=ctx.getImageData(0,0,640,400).data, missiles=canvas.toDataURL();
    drawDestructionScene(ctx,640,400,13,{game});assert(canvas.toDataURL()!==missiles);
    drawDestructionScene(ctx,640,400,7.5,{game});
    // Chromium may change raster backends during a long Canvas command stream.
    // Permit subpixel edge/gradient rounding, not displaced objects or phases.
    const after=ctx.getImageData(0,0,640,400).data;let difference=0,changedEdges=0;
    for(let i=0;i<after.length;i++) { const delta=Math.abs(after[i]-pixels[i]);difference+=delta;if(delta>8)changedEdges++; }
    assert(difference/after.length < .75 && changedEdges/after.length < .005, 'Backward seek changed the scene');
    drawDestructionScene(ctx,640,400,DESTRUCTION_SECONDS,{game});drawOrbitalScene(reference,640,400,0);
    const finale=ctx.getImageData(0,0,640,400).data, home=reference.getImageData(0,0,640,400).data;
    let homeDifference=0;for(let i=0;i<home.length;i++)homeDifference+=Math.abs(home[i]-finale[i]);
    assert(homeDifference/home.length < .5,'End must match home, without a new backdrop at reveal');
    const end=canvas.toDataURL();drawDestructionScene(ctx,640,400,0,{game,reducedMotion:true});assert(canvas.toDataURL()===end);
    assert(JSON.stringify(game)===before,'The renderer must not spawn real units, attack or settle rewards');
  });
  test.browser('First finale: presentation pauses under a modal and hidden page, reserves tree layout, finishes once without save mutation', async () => {
    const frame=await mountFixture(serializeSession(createDebugProgression()),false,'debug'), win=frame.contentWindow, page=frame.contentDocument, el=id=>page.getElementById(id);
    try {
      page.querySelector('[data-debug-command="finale"]').click();
      const raw=win.__storage.getItem(DEBUG_SAVE_KEY), panel=el('destruction-presentation');
      assert(!panel.hidden && el('home-scroll').inert && page.activeElement.id==='skip-destruction');
      const root=el('node-spark').getBoundingClientRect(), gameTime=parseSession(raw).game.elapsed;
      let now=0;win.__testFrame(now);
      for(let i=0;i<30;i++)win.__testFrame(now+=100);
      near(Number(panel.dataset.time),3);
      el('save-menu').click();for(let i=0;i<30;i++)win.__testFrame(now+=100);
      near(Number(panel.dataset.time),3);el('close-save').click();
      Object.defineProperty(page,'hidden',{configurable:true,value:true});page.dispatchEvent(new win.Event('visibilitychange'));
      for(let i=0;i<20;i++)win.__testFrame(now+=100);near(Number(panel.dataset.time),3);
      delete page.hidden;page.dispatchEvent(new win.Event('visibilitychange'));
      win.__testFrame(now+=100000);near(Number(panel.dataset.time),3,'Hidden time must not be poured into the presentation');
      for(let i=0;i<201;i++)win.__testFrame(now+=100);
      assert(panel.hidden && !el('home-scroll').inert && page.activeElement.id==='close-archives');
      const final=el('node-spark').getBoundingClientRect();near(final.top,root.top);near(final.left,root.left);
      el('skip-destruction').click();win.__testFrame(now+=100);
      assert(win.__storage.getItem(DEBUG_SAVE_KEY)===raw && parseSession(raw).game.elapsed===gameTime);
    } finally { frame.remove(); }
  });
  test.browser('First debug finale: empty initial layout cannot poison Canvas; completion or skip permits a running rebuild',async()=>{
    for(const skip of [false,true]){
      const frame=await mountFixture(null,false,'debug');
      try{const d=frame.contentDocument,w=frame.contentWindow,el=id=>d.getElementById(id);let now=0;
        // Simulate clicking as the responsive battlefield is being laid out.
        el('battlefield').getBoundingClientRect=()=>({left:0,top:0,width:0,height:0});
        d.querySelector('[data-debug-command="finale"]').click();
        assert(!el('destruction-presentation').hidden);w.__testFrame(now);
        if(skip)el('skip-destruction').click();else for(let i=0;i<230;i++)w.__testFrame(now+=100);
        assert(el('destruction-presentation').hidden&&!el('home-scroll').inert);
        el('rebuild-civilization').click();for(let i=0;i<20;i++)w.__testFrame(now+=100);
        assert(!el('archives-dialog').open&&el('pause-battle').getAttribute('aria-pressed')==='false');
        el('save-menu').click();el('manual-save').click();const s=parseSession(w.__storage.getItem(DEBUG_SAVE_KEY));
        assert(s.game.elapsed>0&&s.run.phase==='battle'&&s.permanent.completedCycles===1&&s.permanent.legacy===1);
      }finally{frame.remove();}
    }
  });
  test.browser('First debug finale: a failed Canvas frame releases the overlay and inert controls; rebuilding resumes RAF',async()=>{
    const frame=await mountFixture(null,false,'debug');
    try{const d=frame.contentDocument,w=frame.contentWindow,el=id=>d.getElementById(id);let now=0;
      d.querySelector('[data-debug-command="finale"]').click();w.__testFrame(now);
      const ctx=el('destruction-sky').getContext('2d'),original=ctx.createLinearGradient;
      ctx.createLinearGradient=()=>{throw new Error('Injected Canvas failure');};w.__testFrame(now+=100);ctx.createLinearGradient=original;
      assert(el('destruction-presentation').hidden&&!el('home-scroll').inert&&!el('archives-dialog').hasAttribute('data-destruction'));
      el('rebuild-civilization').click();for(let i=0;i<20;i++)w.__testFrame(now+=100);
      el('save-menu').click();el('manual-save').click();const s=parseSession(w.__storage.getItem(DEBUG_SAVE_KEY));assert(s.game.elapsed>0&&s.permanent.completedCycles===1);
    }finally{frame.remove();}
  });
  test.browser('First finale: Escape reveals the home, refreshing never replays; later completions retain the short transition', async () => {
    let frame=await mountFixture(serializeSession(createDebugProgression()),false,'debug');
    try {
      const page=frame.contentDocument;page.querySelector('[data-debug-command="finale"]').click();
      page.getElementById('archives-dialog').dispatchEvent(new frame.contentWindow.Event('cancel',{cancelable:true}));
      assert(page.getElementById('destruction-presentation').hidden && page.getElementById('archives-dialog').open);
      const raw=frame.contentWindow.__storage.getItem(DEBUG_SAVE_KEY);frame.remove();
      frame=await mountFixture(raw,false,'debug');
      assert(frame.contentDocument.getElementById('destruction-presentation').hidden && !frame.contentDocument.getElementById('home-scroll').inert);
      const next=parseSession(raw);rebuildCivilization(next,next.run.runId);frame.remove();
      frame=await mountFixture(serializeSession(next),false,'debug');
      frame.contentDocument.querySelector('[data-debug-command="finale"]').click();
      assert(frame.contentDocument.getElementById('destruction-presentation').hidden);
      assert(parseSession(frame.contentWindow.__storage.getItem(DEBUG_SAVE_KEY)).permanent.completedCycles===2);
    } finally { frame.remove(); }
  });
}

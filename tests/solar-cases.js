import { voyageReady, voyageFixture, lunarFixture } from './orbital-colony-cases.js';
import { mountFixture } from './progression-cases.js';
import { serializeSession, parseSession, mapSessionQuantities, createSaveStore, DEBUG_SAVE_KEY } from '../src/save.js';
import { purchaseOrbitalTalent, getOrbitalTalentState, orbitalLegacySpent } from '../src/orbital-game.js';
import { ORBITAL_TALENTS } from '../src/orbital-config.js';
import { v23Shipyards } from './fixtures/v23-shipyard.js';
import { fromV23Record } from '../src/save-record.js';
import { setDebugLegacy } from '../src/debug.js';
import { drawLunarColony } from '../src/orbital-render.js';
import { Q } from '../src/quantity.js';
import { updateOrbital } from '../src/orbital-game.js';
import { FACILITIES, ARK_ROUTES, arrivalAt, arrived, facilityState, buildFacility, industryRate, facilityRate } from '../src/solar-industry.js';
import { SOLAR_TALENTS, solarTalentState, purchaseSolarTalent, windowOpen, windowTiming, transferState, transferCivilization, transferQuote, domeCapacity, colonyRate, colonistRate, COLONY_RULES } from '../src/solar-colony.js';
import { buildSolarTreeViewModel } from '../src/solar-tree-view-model.js';
import { buildSolarViewModel } from '../src/solar-view-model.js';
import { bodyPosition, BODIES } from '../src/solar-config.js';
import { solarViewport, bodyAt, DESTINATIONS, drawSolarSystem, drawBodyPortrait } from '../src/solar-render.js';
import { drawShipyard, ARK_COUNT } from '../src/shipyard-render.js';
import { voyageFrame, voyageGeometry, voyageIllumination, arkPose, drawVoyageScene, VOYAGE_SECONDS } from '../src/voyage-scene.js';
import { ANIMATION_CLIPS } from '../src/animation-clips.js';

export function registerSolarTests(test, assert, near) {
  const throws=fn=>{let failed=false;try{fn();}catch{failed=true;}assert(failed,'Invalid shipyard record must be rejected');};
  test('Shipyard: seven paid ranks light seven arks, persist separately, and gate departure until the fleet is complete', () => {
    const clean=voyageReady({arks:0}),before=clean.permanent.legacy;let total=0;
    for(let rank=1;rank<=ARK_COUNT;rank++) {
      assert(getOrbitalTalentState(clean,'voyage')==='prerequisite' && !purchaseOrbitalTalent(clean,'voyage'));
      assert(purchaseOrbitalTalent(clean,'shipyard'));total+=ORBITAL_TALENTS.shipyard.costs[rank-1];
      assert(clean.orbital.talents.shipyard===rank && Q.eq(clean.permanent.legacy,Q.sub(before,total)));
      const raw=serializeSession(clean),back=parseSession(raw);assert(serializeSession(back)===raw && back.orbital.talents.shipyard===rank);
      const v=buildSolarViewModel(back,{view:'moon'});assert(v['#colony-lunar-arks'].includes(`${rank} / 7`));
      assert(v['#shipyard-gate-fleet@data-ready']===(rank===7));
    }
    assert(total===4161536 && !purchaseOrbitalTalent(clean,'shipyard') && purchaseOrbitalTalent(clean,'voyage'));
    // Complete prerequisites on a separate fixture; insufficient money must not add a rank.
    const noMoney=voyageReady({arks:0});setDebugLegacy(noMoney,0);
    assert(getOrbitalTalentState(noMoney,'shipyard')==='legacy' && !purchaseOrbitalTalent(noMoney,'shipyard') && noMoney.orbital.talents.shipyard===0);
  });
  test('Shipyard v24: genuine v23 owners inherit seven arks with their original payment, wallet and departure record intact', () => {
    for(const [key,raw] of Object.entries(v23Shipyards)) {
      const record=JSON.parse(raw);mapSessionQuantities(record,Q.decode);
      const old=fromV23Record(record),next=parseSession(raw),owned=key!=='unbuilt';
      assert(next.orbital.talents.shipyard===(owned?7:0));
      assert(Q.eq(next.permanent.legacy,old.permanent.legacy) && Q.eq(orbitalLegacySpent(next.orbital),orbitalLegacySpent(old.orbital)));
      assert(next.orbital.completionAt===old.orbital.completionAt && next.orbital.talents.voyage===old.orbital.talents.voyage);
      if(owned)assert(JSON.stringify(next.orbital.payments.shipyard)==='[4194304,0,0,0,0,0,0]');
      const saved=serializeSession(next);assert(serializeSession(parseSession(saved))===saved);
      const memory=new Map([[DEBUG_SAVE_KEY,raw]]),storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
      const store=createSaveStore(()=>storage,{debug:true}),loaded=store.load();assert(loaded.ok&&loaded.migrated&&store.save(loaded.session).ok);
      assert(memory.get(`${DEBUG_SAVE_KEY}.backup`)===raw,'Keep the original v23 backup');
    }
    const bad=JSON.parse(v23Shipyards.ready);bad.orbital.talents.shipyard=7;throws(()=>parseSession(JSON.stringify(bad)));
    const migrated=JSON.parse(serializeSession(parseSession(v23Shipyards.ready)));migrated.orbital.payments.shipyard[1]='65536';throws(()=>parseSession(JSON.stringify(migrated)));
    migrated.orbital.payments.shipyard[1]='0';migrated.orbital.payments.shipyard[0]='32768';throws(()=>parseSession(JSON.stringify(migrated)));
  });
  test('Solar atlas: readiness and destinations derive from the real saved VI state without mutations', () => {
    const s=voyageReady(),raw=serializeSession(s),v=buildSolarViewModel(s,{view:'moon'});
    assert(v['#orbital-game@data-stage']==='VI' && v['#colony-system@hidden']);
    assert(v['#shipyard-status'].includes('整备完成') && v['#shipyard-voyage'].includes('签署'));
    assert(v['#shipyard-gate-ring@data-ready'] && v['#shipyard-gate-cycles@data-ready'] && v['#shipyard-gate-winter@data-ready']);
    assert(serializeSession(s)===raw);assert(purchaseOrbitalTalent(s,'voyage'));
    const vii=buildSolarViewModel(s,{view:'system',selected:'saturn'});
    assert(vii['#orbital-game@data-stage']==='VII' && !vii['#colony-system@hidden']);
    assert(vii['#colony-body-name']==='土星' && vii['#colony-body-enter@hidden']);
    assert(vii['#solar-body-note'].includes('后续开放') && vii['#shipyard-status'].includes('已启航'));
    assert(DESTINATIONS.length===10 && new Set(DESTINATIONS.map(b=>b.id)).size===10);
    assert(buildSolarViewModel(s,{selected:'moon'})['#colony-body-enter']==='进入月面家园 ↗');
  });
  test('Industry: each ark arrives on its own schedule; footholds need their ark, pay their price and produce on the ledger', () => {
    const s=voyageFixture(),o=s.orbital,run=seconds=>{for(let i=0;i<Math.round(seconds*30);i++)updateOrbital(s,1/30);};
    setDebugLegacy(s,'1e12');
    assert(ARK_ROUTES.length===ARK_COUNT&&new Set(ARK_ROUTES.map(r=>r.body)).size===ARK_COUNT);
    // Nothing has arrived at launch; the belt waits for Mars.
    for(const key of Object.keys(FACILITIES))assert(facilityState(s,key)==='transit'&&!buildFacility(s,key));
    near(arrivalAt(o,'venus'),o.completionAt+40);near(arrivalAt(o,'belt'),arrivalAt(o,'mars'));
    run(41);assert(arrived(o,'venus')&&!arrived(o,'mercury')&&facilityState(s,'venus')==='ready');
    const wallet=s.permanent.legacy,spent=orbitalLegacySpent(o);assert(buildFacility(s,'venus'));
    assert(Q.eq(s.permanent.legacy,Q.sub(wallet,FACILITIES.venus.costs[0]))&&Q.eq(orbitalLegacySpent(o),Q.add(spent,FACILITIES.venus.costs[0])));
    const earned=o.legacyEarned,produced=o.solar.produced;run(10);
    near(Q.toNumber(Q.sub(o.solar.produced,produced)),FACILITIES.venus.base*10,FACILITIES.venus.base*.05);assert(Q.gt(o.legacyEarned,earned));
    // Mercury multiplies every yield; Jupiter needs the belt first.
    run(20);assert(buildFacility(s,'mercury'));assert(facilityRate(o,'venus')===FACILITIES.venus.base*2&&industryRate(o)===FACILITIES.venus.base*2);
    run(240);assert(facilityState(s,'jupiter')==='prerequisite'&&buildFacility(s,'belt')&&buildFacility(s,'jupiter'));
    const raw=serializeSession(s),back=parseSession(raw);assert(serializeSession(back)===raw&&back.orbital.solar.facilities.jupiter===1);
    // A foothold recorded before its ark arrived, or at the wrong price, is rejected.
    const early=JSON.parse(serializeSession(voyageFixture()));early.orbital.solar.facilities.venus=1;early.orbital.solar.payments.venus=[String(FACILITIES.venus.costs[0])];
    let rejected=false;try{parseSession(JSON.stringify(early));}catch{rejected=true;}assert(rejected,'No foothold before the ark arrives');
    const cheap=JSON.parse(raw);cheap.orbital.solar.payments.venus=['1'];rejected=false;try{parseSession(JSON.stringify(cheap));}catch{rejected=true;}assert(rejected,'Payments match the price');
  });
  test('Industry v25: a v24 save gains an empty ledger; VI saves never own footholds', () => {
    const s=voyageFixture(),old=JSON.parse(serializeSession(s));old.version=24;old.orbital.version=10;delete old.orbital.solar;
    const next=parseSession(JSON.stringify(old));assert(Object.values(next.orbital.solar.facilities).every(v=>v===0)&&Q.eq(next.orbital.solar.produced,0));
    const vi=voyageReady();vi.orbital.solar.facilities.venus=1;vi.orbital.solar.payments.venus=[FACILITIES.venus.costs[0]];
    let rejected=false;try{parseSession(serializeSession(vi));}catch{rejected=true;}assert(rejected,'Industry needs 远航协议');
    const view=buildSolarViewModel(s,{view:'system',selected:'venus'});assert(!view['#solar-facility@hidden']&&view['#solar-facility-build'].includes('航行中')&&view['#solar-facility-build@disabled']);
    assert(buildSolarViewModel(s,{view:'system',selected:'saturn'})['#solar-facility@hidden']);
  });
  test('Windows: the Earth–Mars alignment opens and closes on the synodic clock, and the countdown lands on the change', () => {
    const o=voyageFixture().orbital,start=o.elapsed;let changes=0,was=windowOpen(o);
    for(let t=0;t<3000;t+=5){o.elapsed=start+t;const now=windowOpen(o);if(now!==was){changes++;was=now;}}
    assert(changes>=2,'A Mars synodic period brings both an opening and a closing');
    o.elapsed=start;const timing=windowTiming(o);o.elapsed=start+timing.seconds+.5;assert(windowOpen(o)!==timing.open,'The countdown ends where the window changes');
    o.elapsed=start+timing.seconds-.5;assert(windowOpen(o)===timing.open);
  });
  test('Transfer: an idle Earth civilization flies to the Mars dome, pays by age and window, frees its site and works on arrival', () => {
    const s=voyageFixture(),o=s.orbital,run=seconds=>{for(let i=0;i<Math.round(seconds*30);i++)updateOrbital(s,1/30);};setDebugLegacy(s,'1e13');
    assert(solarTalentState(s,'dome')==='transit'&&!purchaseSolarTalent(s,'dome'),'The dome waits for the Mars ark');
    run(95);assert(purchaseSolarTalent(s,'dome')&&purchaseSolarTalent(s,'transfer')&&solarTalentState(s,'uplift')==='planned');
    run(70);assert(o.phase==='living');const civ=o.civilizations.find(c=>c.alive&&!c.warId);assert(civ&&transferState(s,civ.id)==='ready');
    const quote=transferQuote(o,civ),wallet=s.permanent.legacy;assert(Q.eq(quote.cost,COLONY_RULES.transferBase*2**(civ.age-1)*(quote.open?1:COLONY_RULES.lateCost)));
    assert(transferCivilization(s,civ.id)&&!o.civilizations.some(c=>c.id===civ.id)&&o.solar.transfers.length===1&&Q.eq(s.permanent.legacy,Q.sub(wallet,quote.cost)));
    const second=o.civilizations.find(c=>c.alive&&!c.warId);assert(!second||transferState(s,second.id)==='fleet','One transfer ark until 转运舰队');
    const raw=serializeSession(s);assert(serializeSession(parseSession(raw))===raw);
    run(quote.seconds+1);assert(o.solar.transfers.length===0&&o.solar.colonies.mars.length===1&&colonyRate(o)===colonistRate(civ));
    const produced=o.solar.produced;run(10);assert(Q.toNumber(Q.sub(o.solar.produced,produced))>=colonyRate(o)*9);
    // Capacity: two residents per dome rank.
    assert(domeCapacity(o)===COLONY_RULES.domeCapacity);
    // Tampering: a colonist over capacity, or a transfer without payment, is rejected.
    const over=JSON.parse(serializeSession(s));over.orbital.solar.colonies.mars.push({...over.orbital.solar.colonies.mars[0],id:'c9-99'},{...over.orbital.solar.colonies.mars[0],id:'c9-98'});
    let rejected=false;try{parseSession(JSON.stringify(over));}catch{rejected=true;}assert(rejected,'Dome capacity holds');
    const unpaid=JSON.parse(serializeSession(s));unpaid.orbital.solar.payments.transfers=[];rejected=false;try{parseSession(JSON.stringify(unpaid));}catch{rejected=true;}assert(rejected,'Every transfer is paid');
  });
  test('VII tree: the root is owned, facilities are the same nodes as in the dossiers, planned nodes cannot be bought, and v25 saves gain empty colonies', () => {
    const s=voyageFixture(),o=s.orbital;setDebugLegacy(s,'1e13');
    let v=buildSolarTreeViewModel(s,{talent:'venus',selected:true});
    assert(v['#solar-node-voyage@data-state']==='max'&&v['#solar-node-venus@data-state']==='cycles'&&v['#solar-gate-venus'].startsWith('方舟'));
    for(let i=0;i<30*41;i++)updateOrbital(s,1/30);
    v=buildSolarTreeViewModel(s,{talent:'venus',selected:true});assert(v['#solar-node-venus@data-state']==='ready'&&v['#solar-buy'].includes('建立驻地'));
    assert(purchaseSolarTalent(s,'venus')&&o.solar.facilities.venus===1,'Buying the node builds the foothold');
    assert(solarTalentState(s,'starship')==='planned'&&!purchaseSolarTalent(s,'starship'));
    assert(buildSolarTreeViewModel(s,{talent:'starship',selected:true})['#solar-buy@disabled']);
    const old=JSON.parse(serializeSession(voyageFixture()));old.version=25;old.orbital.version=11;for(const k of ['talents','colonies','transfers','nextTransfer'])delete old.orbital.solar[k];
    const next=parseSession(JSON.stringify(old));assert(next.orbital.solar.colonies.mars.length===0&&next.orbital.solar.talents.dome===0);
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
  test('Voyage: tree fades before seven lights depart, moon stays in place, one sun lights both worlds and actions arrive last', () => {
    assert(voyageFrame(0).treeOpacity===1 && voyageFrame(4.5).treeOpacity===0);
    assert(voyageFrame(0).moonReveal>0 && voyageFrame(10).moonReveal===1 && voyageFrame(26).actions===0);
    assert(voyageIllumination(1,0)>voyageIllumination(-1,0) && voyageIllumination(0,-1)>voyageIllumination(0,1));
    for(const [w,h] of [[1400,800],[390,750],[320,600]]){
      const start=voyageGeometry(0,w,h),end=voyageGeometry(VOYAGE_SECONDS,w,h);
      near(start.moon.r,end.moon.r);near(start.moon.x,end.moon.x);assert(Math.abs(start.moon.y-end.moon.y)<h*.04);
      assert(start.moon.y+start.moon.r<start.earth.y-start.earth.r,'Moon stays fully above the horizon');
    }
    const targets=new Set();
    for(let i=0;i<ARK_COUNT;i++) {
      const dock=arkPose(i,5,1000,700),end=arkPose(i,VOYAGE_SECONDS,1000,700);
      assert(dock.flight===0 && dock.x===dock.launchX && dock.y===dock.launchY);
      assert(end.flight===1 && end.radius<dock.radius);near(end.x,end.targetX);near(end.y,end.targetY);
      for(let t=7;t<26;t+=.25){const a=arkPose(i,t,1000,700),b=arkPose(i,t+.001,1000,700);assert(Math.hypot(a.x-b.x,a.y-b.y)<1,'No sudden launch jump');}
      targets.add(`${end.x}:${end.y}`);
    }
    assert(targets.size===7 && arkPose(0,10,1000,700).flight>arkPose(6,10,1000,700).flight);
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
    const moons=new Set();for(let rank=0;rank<=ARK_COUNT;rank++){drawLunarColony(x,700,500,{...s.orbital,talents:{...s.orbital.talents,shipyard:rank}},{reducedMotion:true});moons.add(c.toDataURL());}assert(moons.size===8,'Each purchased ark appears on the Moon');
    const frames=new Set();for(const t of [0,4,8,14,22,30]){drawVoyageScene(x,700,500,t);frames.add(c.toDataURL());}assert(frames.size===6);
    drawVoyageScene(x,700,500,0,{reducedMotion:true});const still=c.toDataURL();drawVoyageScene(x,700,500,12,{reducedMotion:true});assert(c.toDataURL()===still && serializeSession(s)===raw);
  });
  test.browser('Shipyard UI: seven purchases update the lunar lights, gates, prices and persisted ranks without enabling early departure', async () => {
    const frame=await mountFixture(serializeSession(voyageReady({arks:0})),false,'debug',{reducedMotion:true});
    try {
      const d=frame.contentDocument,w=frame.contentWindow,el=id=>d.getElementById(id);let now=0;
      el('colony-pause').click();el('colony-view-moon').click();w.__testFrame(now+=100);
      let moon=el('colony-moon').toDataURL();
      for(let rank=1;rank<=ARK_COUNT;rank++) {
        el('shipyard-build').click();assert(el('orbit-buy').textContent.includes(Q.format(ORBITAL_TALENTS.shipyard.costs[rank-1])));
        el('orbit-buy').click();assert(parseSession(w.__storage.getItem(DEBUG_SAVE_KEY)).orbital.talents.shipyard===rank);
        el('close-orbit-talents').click();w.__testFrame(now+=100);
        assert(el('colony-lunar-arks').textContent.includes(`${rank} / 7`));
        const next=el('colony-moon').toDataURL();assert(next!==moon);moon=next;
        assert(el('shipyard-gate-fleet').dataset.ready===String(rank===7));
        assert(el('shipyard-voyage').textContent.includes(rank===7?'签署':'条件'));
      }
      el('shipyard-build').click();assert(el('orbit-buy').disabled && !el('orbit-detail').textContent.includes('undefined'));
      assert(!d.body.dataset.fixtureError,d.body.dataset.fixtureError);
    } finally {frame.remove();}
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
        el('colony-pause').click();el('solar-replay').click();for(let i=0;i<VOYAGE_SECONDS*10+10;i++)w.__testFrame(now+=100);
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

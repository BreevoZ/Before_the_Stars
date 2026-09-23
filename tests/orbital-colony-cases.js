import { Q } from '../src/quantity.js';
import { launchReady } from './orbital-cases.js';
import { purchaseTalent, updateProgression } from '../src/progression.js';
import { createOrbitalState, enterOrbital, startOrbitalWar, updateOrbital, resolveOrbitalWar, findCivilization, purchaseOrbitalTalent, getOrbitalTalentState, getInterventionState, intervene, orbitalLegacySpent } from '../src/orbital-game.js';
import { syncWarCivilizations } from '../src/orbital-war.js';
import { ORBITAL_RULES as R, ORBITAL_TALENTS as T, SITES } from '../src/orbital-config.js';
import { civilizationValue, rebirthDelay } from '../src/celestial-economy.js';
import { serializeSession, parseSession, DEBUG_SAVE_KEY, createSaveStore, mapSessionQuantities } from '../src/save.js';
import { oldOrbitalSpent } from '../src/orbital-history.js';
import { fromV15Record } from '../src/save-record.js';
import { records } from './fixtures/v15-orbital.js';
import { setDebugLegacy } from '../src/debug.js';
import { createGame, evolve, AGES, recruit, stat } from '../src/game.js';
import { buildOrbitalViewModel } from '../src/orbital-view-model.js';
import { drawOrbitalColony, drawOrbitalTalentSky } from '../src/orbital-render.js';
import { simulateOrbital } from '../sim/orbital.js';
import { mountFixture } from './progression-cases.js';

export function colonyFixture({started=true,seed=1,seconds=0,legacy=0,talents=[]}={}){
  const s=launchReady();purchaseTalent(s,'bypasser');s.orbital=createOrbitalState(seed);s.debug=true;s.debugSpeed=10;setDebugLegacy(s,legacy);
  if(started)enterOrbital(s);for(const key of talents)purchaseOrbitalTalent(s,key);
  if(seconds){const c=s.orbital.civilizations;startOrbitalWar(s,c[0].id,c[1].id);for(let i=0;i<Math.round(seconds*30);i++)updateOrbital(s,1/30);}
  return s;
}
const advance=(s,seconds)=>{for(let i=0;i<Math.round(seconds*30);i++)updateProgression(s,1/30);};
function future(war){for(const team of ['player','enemy']){war.game.experience[team]=AGES[5].experienceRequired;while(war.game.ages[team]<5)evolve(war.game,team);}}
function won(war){war.game.bases.enemy.hp=0;war.game.status='won';}
function pair(s){const idle=s.orbital.civilizations.filter(c=>c.alive&&!c.warId);return startOrbitalWar(s,idle[0]?.id,idle[1]?.id);}
export function registerOrbitalColonyTests(test,assert,near){
  const throws=fn=>{let caught=false;try{fn();}catch{caught=true;}assert(caught,'Invalid orbital input must be rejected');};
  test('Orbital war: deterministic random sites and 4–6 primitive civilizations; enter and seeds survive reload',()=>{
    const a=colonyFixture({seed:88,started:false}),raw=serializeSession(a);advance(a,10);assert(serializeSession(a)===raw&&!pair(a));
    assert(enterOrbital(a)&&!enterOrbital(a));const b=colonyFixture({seed:88}),c=colonyFixture({seed:991});
    assert(JSON.stringify(a.orbital)===JSON.stringify(b.orbital));assert(JSON.stringify(a.orbital.civilizations)!==JSON.stringify(c.orbital.civilizations));
    const civs=a.orbital.civilizations;assert(civs.length>=4&&civs.length<=6&&new Set(civs.map(c=>c.site)).size===civs.length&&civs.every(c=>c.age===1));
    assert(serializeSession(parseSession(serializeSession(a)))===serializeSession(a));
  });
  test('Orbital war: both commanders pay for recruitment, earn casualty XP and evolve in the unchanged combat engine',()=>{
    const s=colonyFixture(),o=s.orbital;assert(pair(s));assert(!startOrbitalWar(s,o.civilizations[0].id,o.civilizations[2].id));
    const war=o.wars[0];advance(s,4);assert(war.game.nextOrderId>2&&war.commanders.player.orders>0&&war.commanders.enemy.orders>0);
    advance(s,50);assert(Q.gt(war.game.experience.player,0)&&Q.gt(war.game.experience.enemy,0));
    assert(war.game.ages.player>1&&war.game.ages.enemy>1&&Q.gt(o.legacyEarned,0));
    assert(s.run.phase==='orbital'&&s.game.elapsed===0&&s.permanent.completedCycles>=5);parseSession(serializeSession(s));
  });
  test('Orbital war: idle civilizations gain no time-based technology or passive Legacy; classic defaults stay intact',()=>{
    const s=colonyFixture();advance(s,300);assert(s.orbital.civilizations.every(c=>c.age===1&&c.experience===0));assert(s.orbital.legacyEarned===0);
    const classic=createGame();assert(!classic.mode&&classic.ai.enabled&&stat(classic,'player','income')===7&&stat(classic,'enemy','baseHealth')===600);
  });
  test('Orbital war: early victories remove only the loser, retain winner assets and pay once; future age alone does not nuke',()=>{
    const s=colonyFixture();pair(s);const o=s.orbital,war=o.wars[0],ids=[...war.participants],winner=findCivilization(o,ids[0]),loser=findCivilization(o,ids[1]);
    const expected=civilizationValue(o,loser,'defeat');won(war);assert(resolveOrbitalWar(s,war.id));assert(winner.alive&&!loser.alive&&winner.warId===null&&o.phase==='living');
    assert(Q.eq(o.legacyEarned,expected));const raw=serializeSession(s);assert(!resolveOrbitalWar(s,war.id)&&serializeSession(s)===raw);
    pair(s);const next=o.wars[0];future(next);syncWarCivilizations(o,next);updateOrbital(s,1/30);assert(o.phase==='living');
  });
  test('Orbital war: both sides in V plus an actual winner atomically destroys every site and settles exactly once',()=>{
    let s=colonyFixture();pair(s);pair(s);const o=s.orbital,war=o.wars[0];future(war);syncWarCivilizations(o,war);
    const expected=Q.sum(o.civilizations.map(c=>civilizationValue(o,c,'nuclear'))),cycles=s.permanent.completedCycles;
    won(war);assert(resolveOrbitalWar(s,war.id)&&o.phase==='winter'&&o.wars.length===0&&o.civilizations.every(c=>!c.alive));
    assert(o.nuclearCycles===1&&o.settledCycle===o.cycle&&Q.eq(o.lastReward,expected)&&Q.eq(o.legacyEarned,expected));
    const raw=serializeSession(s);s=parseSession(raw);assert(!resolveOrbitalWar(s,war.id)&&serializeSession(s)===raw&&s.permanent.completedCycles===cycles);
    const oldIds=o.civilizations.map(c=>c.id);advance(s,61);assert(s.orbital.cycle===2&&s.orbital.civilizations.every(c=>c.age===1&&!oldIds.includes(c.id)));
  });
  test('Orbital war: one-sided future wins and V draws never trigger global nuclear settlement',()=>{
    for(const draw of [false,true]){const s=colonyFixture();pair(s);const war=s.orbital.wars[0];future(war);
      if(draw){war.game.bases.player.hp=0;war.game.bases.enemy.hp=0;war.game.status='draw';}
      else {war.game.ages.enemy=1;war.game.experience.enemy=0;won(war);}
      assert(resolveOrbitalWar(s,war.id)&&s.orbital.phase==='living'&&s.orbital.nuclearCycles===0);}
  });
  test('Orbital talents: inherited root, prerequisite and price gates, levels, winter reduction and source effects',()=>{
    const s=colonyFixture({legacy:10000});assert(s.orbital.talents.protocol===1&&getOrbitalTalentState(s,'protocol')==='max');
    assert(getOrbitalTalentState(s,'harvest')==='prerequisite');assert(purchaseOrbitalTalent(s,'monitor'));assert(s.permanent.legacy===9872);
    for(let i=0;i<3;i++)assert(purchaseOrbitalTalent(s,'reseed'));assert(!purchaseOrbitalTalent(s,'reseed'));near(rebirthDelay(s.orbital),60*.75**3);
    const c=s.orbital.civilizations[0],before=civilizationValue(s.orbital,c);assert(purchaseOrbitalTalent(s,'recovery'));assert(civilizationValue(s.orbital,c)===before*2);
    assert(!purchaseOrbitalTalent(s,'outpost'));parseSession(serializeSession(s));
  });
  test('Orbital intervention: live troop amplification uses the stat pipeline, costs Legacy, preserves health ratio and shot snapshots',()=>{
    const s=colonyFixture({legacy:10000,talents:['monitor','patronage']});pair(s);const war=s.orbital.wars[0],c=findCivilization(s.orbital,war.participants[0]);
    for(let i=0;i<2700&&!war.game.projectiles.some(p=>p.team==='player');i++)updateOrbital(s,1/30);
    const shot=war.game.projectiles.find(p=>p.team==='player'),enemy=war.game.units.find(u=>u.team==='enemy');assert(shot&&enemy);
    const snapshot=JSON.stringify(shot),enemyDamage=stat(war.game,enemy,'damage'),enemyHealth=enemy.hp;
    const troop=war.game.units.find(u=>u.team==='player');assert(troop);troop.hp=Q.mul(troop.hp,.5);
    const before=stat(war.game,troop,'damage'),ratio=Q.toNumber(Q.div(troop.hp,stat(war.game,troop,'health'))),wallet=s.permanent.legacy;
    assert(intervene(s,c.id,'boost'));near(Q.toNumber(Q.div(stat(war.game,troop,'damage'),before)),1.25);near(Q.toNumber(Q.div(troop.hp,stat(war.game,troop,'health'))),ratio);
    assert(Q.eq(s.permanent.legacy,Q.sub(wallet,16)));assert(JSON.stringify(shot)===snapshot&&Q.eq(stat(war.game,enemy,'damage'),enemyDamage)&&Q.eq(enemy.hp,enemyHealth));assert(stat(createGame(),{type:troop.type,team:'player'},'damage')===before);
    const raw=serializeSession(s);assert(serializeSession(parseSession(raw))===raw);
  });
  test('Orbital intervention: technology advances both AI sides; suppression removes advanced units and resets XP without producing rewards',()=>{
    const s=colonyFixture({legacy:10000,talents:['monitor','patronage','technology','regression']});pair(s);const war=s.orbital.wars[0],id=war.participants[1],c=findCivilization(s.orbital,id),income=s.orbital.legacyEarned;
    assert(intervene(s,id,'advance')&&c.age===2&&war.game.ages.enemy===2);assert(recruit(war.game,AGES[2].units[0],'enemy'));
    assert(intervene(s,id,'regress')&&c.age===1&&c.experience===0&&war.game.queues.enemy.length===0&&s.orbital.legacyEarned===income);
    assert(!intervene(s,id,'regress'));parseSession(serializeSession(s));
  });
  test('Orbital harvest: kills the selected civilization once, ends its war, retains its opponent and respawns after a bounded wait',()=>{
    const s=colonyFixture({legacy:10000,talents:['monitor','patronage','technology','harvest']});pair(s);const o=s.orbital,id=o.wars[0].participants[0],c=findCivilization(o,id),reward=civilizationValue(o,c);
    assert(intervene(s,id,'harvest')&&!intervene(s,id,'harvest')&&!c.alive&&o.wars.length===0&&Q.eq(o.legacyEarned,reward));
    for(const other of o.civilizations.filter(c=>c.alive))assert(intervene(s,other.id,'harvest'));
    advance(s,61);assert(o.civilizations.filter(c=>c.alive).length===2&&o.nuclearCycles===0);parseSession(serializeSession(s));
  });
  test('Orbital automation and pause: opt-in pairing uses normal rules; pause/hidden/finales block the same fixed clock',()=>{
    const s=colonyFixture({legacy:10000,talents:['monitor','weaving']});advance(s,1);assert(!s.orbital.wars.length);s.orbital.autoWar=true;advance(s,1);assert(s.orbital.wars.length===2);
    const raw=serializeSession(s);for(const dt of [0,-1,NaN,Infinity])updateProgression(s,dt);updateProgression(s,.05,{paused:true});updateProgression(s,.05,{hidden:true});assert(serializeSession(s)===raw);
    const time=s.orbital.elapsed;updateProgression(s,86400);near(s.orbital.elapsed,time+.05);
  });
  test('Orbital v16: full AI wars, projectiles and random source resume deterministically without reapplying bonuses',()=>{
    let s=colonyFixture({legacy:10000,talents:['monitor','patronage'],seconds:65});const c=s.orbital.civilizations.find(c=>c.warId);intervene(s,c.id,'boost');
    const raw=serializeSession(s),r=parseSession(raw);assert(serializeSession(r)===raw);
    advance(s,12);advance(r,12);assert(serializeSession(s)===serializeSession(r));assert(!raw.includes('"energy"')&&!raw.includes('"structures"'));
  });
  test('Orbital v15 migration: real arrived, in-progress and complete saves retain earned currency and refund all retired construction once',()=>{
    for(const record of Object.values(records)){const old=fromV15Record(mapSessionQuantities(structuredClone(record),Q.decode)),s=parseSession(JSON.stringify(record)),refund=oldOrbitalSpent(old.orbital);
      assert(s.version===16&&s.orbital.version===2&&s.orbital.started===old.orbital.started&&s.orbital.legacyEarned===old.orbital.legacyEarned);
      assert(Q.eq(s.permanent.legacy,Q.add(old.permanent.legacy,refund))&&Q.eq(s.permanent.totalLegacy,old.permanent.totalLegacy));
      assert(s.permanent.completedCycles===old.permanent.completedCycles&&s.orbital.talents.protocol===1);
      assert(serializeSession(parseSession(serializeSession(s)))===serializeSession(s));
    }
  });
  test('Orbital v16: corrupt wars, RNG, technology, costs, currency, references and nuclear markers are rejected',()=>{
    const raw=serializeSession(colonyFixture({seconds:30}));
    for(const edit of [r=>r.orbital.rng=-1,r=>r.orbital.wars[0].participants[1]=r.orbital.wars[0].participants[0],r=>r.orbital.phase='winter',r=>r.orbital.settledCycle=99,r=>r.orbital.nuclearCycles=1,r=>r.orbital.talents.monitor=1,r=>r.orbital.wars[0].game.gold.enemy=-1,r=>r.orbital.wars[0].game.bonuses=[],r=>r.orbital.wars[0].commanders.player.enabled=false,r=>r.orbital.civilizations[0].age=9,r=>r.orbital.interventionSpent=-1,r=>r.orbital.selectedWar='missing',r=>r.orbital.autoWar=true,r=>r.orbital.legacyFraction=1]){const bad=JSON.parse(raw);edit(bad);throws(()=>parseSession(JSON.stringify(bad)));}
  });
  test('Orbital v16: backup and debug accounting include talent and intervention spending',()=>{
    const s=colonyFixture({legacy:10000,talents:['monitor','patronage']});intervene(s,s.orbital.civilizations[0].id,'boost');assert(orbitalLegacySpent(s.orbital)===128+256+16);
    assert(setDebugLegacy(s,123)&&parseSession(serializeSession(s)).permanent.legacy===123);
    const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},store=createSaveStore(()=>storage,{debug:true});store.load();assert(store.save(s).ok);advance(s,1);assert(store.save(s).ok);
    data.set(DEBUG_SAVE_KEY,'broken');assert(!store.load().ok&&store.recover().ok);
  });
  test('Orbital simulation: real wars finish nuclear cycles, differ by seed, unlock VI and keep all options bounded',()=>{
    const a=simulateOrbital({seed:1}),b=simulateOrbital({seed:2});assert(a.cycles===4&&a.completed&&b.cycles===4&&b.completed&&a.nuclearTimes[0]!==b.nuclearTimes[0]);
    assert(a.seconds>1200&&a.seconds<2400&&b.seconds>1200&&b.seconds<2400);
    for(const options of [{legacy:-1},{legacy:.5},{seed:-1},{targetCycles:0},{maxSeconds:Infinity},{maxSeconds:86401},{buyTalents:1}])throws(()=>simulateOrbital(options));
  });
  test('Orbital view model: Legacy prices, monitor gating and tree prerequisites reflect actual state',()=>{
    const s=colonyFixture(),v=buildOrbitalViewModel(s);assert(v['#colony-start-war@disabled']===false&&v['#colony-monitor@hidden']);assert(!Object.keys(v).some(k=>/energy|power/.test(k)));
    assert(v['#orbit-node-protocol@data-state']==='max'&&v['#orbit-node-monitor@data-state']==='legacy');
  });
  test.browser('Orbital UI: pair civilizations, buy monitoring on the SVG tree, watch real combat, pause, intervene and restore',async()=>{
    let frame=await mountFixture(serializeSession(colonyFixture({legacy:10000})),false,'debug',{reducedMotion:true}),raw;
    try{const doc=frame.contentDocument,win=frame.contentWindow,el=id=>doc.getElementById(id);let now=0;const tick=n=>{for(let i=0;i<n;i++)win.__testFrame(now+=100);};
      assert(!el('orbital-game').hidden&&el('colony-monitor').hidden);el('colony-start-war').click();tick(10);
      el('colony-talents').click();assert(el('orbit-talents-dialog').open);const before=el('colony-time').textContent;tick(10);assert(el('colony-time').textContent===before);
      el('orbit-node-monitor').click();el('orbit-buy').click();assert(el('orbit-cost-monitor').textContent==='已点亮');
      el('orbit-node-patronage').dispatchEvent(new win.MouseEvent('dblclick',{bubbles:true}));assert(el('orbit-cost-patronage').textContent==='已点亮');
      el('close-orbit-talents').click();tick(20);assert(!el('colony-monitor').hidden&&!el('colony-battle').hidden&&el('colony-war-player').textContent.includes('金币'));
      el('intervene-boost').click();assert(el('colony-selected-stats').textContent.includes('1/5'));
      doc.body.dispatchEvent(new win.KeyboardEvent('keydown',{code:'Space',bubbles:true}));const frozen=el('colony-time').textContent;tick(20);assert(el('colony-time').textContent===frozen);
      el('colony-save').click();el('manual-save').click();raw=win.__storage.getItem(DEBUG_SAVE_KEY);assert(parseSession(raw).orbital.wars.length===1);
    }finally{frame.remove();}
    frame=await mountFixture(raw,false,'debug');try{const d=frame.contentDocument;assert(!d.getElementById('colony-monitor').hidden&&!d.getElementById('archives-dialog').open);assert(d.getElementById('colony-selected-stats').textContent.includes('1/5'));}finally{frame.remove();}
  });
  test.browser('Orbital UI: 320/390px worlds and scrollable full-screen talent tree stay usable; rendering supports reduced motion',async()=>{
    const seed=colonyFixture({legacy:10000,seconds:10,talents:['monitor']});pair(seed);
    const frame=await mountFixture(serializeSession(seed),false,'debug');
    try{const doc=frame.contentDocument,win=frame.contentWindow,el=id=>doc.getElementById(id);
      el('watch-war-0').click();assert(el('colony-selected-name').textContent.includes(seed.orbital.civilizations[0].name));
      const other=findCivilization(seed.orbital,seed.orbital.wars[1].participants[1]);el(`site-${other.site}`).click();assert(el('watch-war-1').getAttribute('aria-pressed')==='true'&&el('colony-first').value===other.site);
      for(const width of [320,390,1100]){frame.style.width=`${width}px`;await new Promise(r=>setTimeout(r,35));win.__testFrame(100);
        assert(doc.documentElement.scrollWidth<=width+2);assert(el('colony-start-war').getBoundingClientRect().height>=40);
        el('colony-talents').click();assert(el('orbit-tree-edges').querySelectorAll('path').length>=11);assert(el('orbit-node-protocol').getBoundingClientRect().width>=64);
        assert(el('orbit-buy').getBoundingClientRect().right<=width+2);el('close-orbit-talents').click();
      }
      const canvas=document.createElement('canvas');canvas.width=390;canvas.height=300;const ctx=canvas.getContext('2d'),s=colonyFixture({seconds:30});
      drawOrbitalColony(ctx,390,300,s.orbital,{reducedMotion:true});const raw=canvas.toDataURL();s.orbital.elapsed++;drawOrbitalColony(ctx,390,300,s.orbital,{reducedMotion:true});assert(canvas.toDataURL()===raw);drawOrbitalTalentSky(ctx,390,300);
    }finally{frame.remove();}
  });
  test.browser('Orbital UI: a genuine zero-wallet AI war causes nuclear winter, saves once and regrows new civilizations',async()=>{
    const seed=colonyFixture();seed.debugSpeed=20;
    const frame=await mountFixture(serializeSession(seed),false,'debug',{reducedMotion:true});
    try{const doc=frame.contentDocument,win=frame.contentWindow,el=id=>doc.getElementById(id);let now=0;el('colony-start-war').click();
      for(let i=0;i<1000&&el('colony-fallout').hidden;i++)win.__testFrame(now+=100);
      assert(!el('colony-fallout').hidden,'Real AI battle must reach a nuclear winner');el('colony-save').click();el('manual-save').click();const saved=parseSession(win.__storage.getItem(DEBUG_SAVE_KEY));
      assert(saved.orbital.nuclearCycles===1&&saved.orbital.civilizations.every(c=>!c.alive));el('close-save').click();for(let i=0;i<40;i++)win.__testFrame(now+=100);
      assert(el('colony-fallout').hidden&&el('colony-cycle').textContent.includes('第 2 轮'));
    }finally{frame.remove();}
  });
}

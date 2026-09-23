import { SAVE_VERSION } from '../src/progression-config.js';
import { Q } from '../src/quantity.js';
import { TRAITS } from '../src/traits.js';
import { createTraitSampler } from '../src/trait-scenarios.js';
import { createGame, updateGame, updateCommander, getRecruitState, stat, explainStat, UNITS, RULES } from '../src/game.js';
import { SUPER_WEAPONS } from '../src/game-config.js';
import { colonyFixture } from './orbital-colony-cases.js';
import { purchaseOrbitalTalent, getInterventionState, interventionCost, intervene, startOrbitalWar, resolveOrbitalWar, updateOrbital } from '../src/orbital-game.js';
import { warBonuses } from '../src/orbital-war.js';
import { ORBITAL_RULES, ORBITAL_TALENTS as T, ORBITAL_ACTIONS as A } from '../src/orbital-config.js';
import { habitatSegments, lunarRotation, lunarFacilities, drawOrbitalTalentSky, drawLunarColony, drawOrbitalColony } from '../src/orbital-render.js';
import { drawOrbitalScene, ORBITAL_SECONDS } from '../src/orbital-scene.js';
import { serializeSession, parseSession, DEBUG_SAVE_KEY } from '../src/save.js';
import { v17Orbital } from './fixtures/v17-orbital.js';
import { mountFixture } from './progression-cases.js';
const militaryPath=['monitor','patronage','technology','regression','doctrines','superSoldiers','sniper'];
export function militaryFixture({future=true,doctrine=0,elite=0}={}){
  const s=colonyFixture({legacy:10000000,talents:militaryPath}),[a,b]=s.orbital.civilizations;
  startOrbitalWar(s,a.id,b.id);
  for(const c of [a,b]){
    if(future)while(c.age<5)intervene(s,c.id,'advance');
    for(let n=0;n<doctrine;n++)intervene(s,c.id,'doctrines');
    if(elite)intervene(s,c.id,'superSoldiers');if(elite===2)intervene(s,c.id,'sniper');
  }return s;
}
const ticks=(g,n)=>{for(let i=0;i<n;i++)updateGame(g,RULES.fixedStep);};
const soldier=(g,type,team,x)=>({id:g.nextUnitId++,type,team,x,hp:stat(g,{type,team},'health'),moving:false,attackCooldown:0,attackAnimation:0,hitFlash:0});
export function registerOrbitalDoctrineTests(test,assert,near){
  const rejects=fn=>{let error=false;try{fn();}catch{error=true;}assert(error,'Invalid doctrine save must be rejected');};
  test('Orbital doctrines: five cumulative tiers charge once, enable three era traits, and isolate the selected civilization',()=>{
    for(const index of [0,1]){
      const s=militaryFixture({future:false}),o=s.orbital,w=o.wars[0],g=w.game,c=o.civilizations[index],team=['player','enemy'][index],other=index?'player':'enemy';
      const idle=o.civilizations[2];assert(getInterventionState(s,idle.id,'doctrines')==='war');
      for(let rank=1;rank<=5;rank++){
        if(rank>1){assert(getInterventionState(s,c.id,'doctrines')==='age');assert(intervene(s,c.id,'advance'));}
        const before=s.permanent.legacy,spent=o.interventionSpent;assert(interventionCost(o,c,'doctrines')===A.doctrines.costs[rank-1]);
        assert(intervene(s,c.id,'doctrines')&&c.doctrine===rank);
        assert(Q.eq(s.permanent.legacy,Q.sub(before,A.doctrines.costs[rank-1]))&&Q.eq(o.interventionSpent,Q.add(spent,A.doctrines.costs[rank-1])));
        let enabled=0;for(const t of Object.values(TRAITS)){
          const unit={type:t.units[0],team},active=UNITS[unit.type].age<=rank;
          assert(stat(g,unit,t.stat)===active&&!stat(g,{...unit,team:other},t.stat));if(active){enabled++;assert(explainStat(g,unit,t.stat).effects.at(-1).source.id===`orbit:${c.id}:doctrine`);}
        }assert(enabled===3*rank);parseSession(serializeSession(s));
      }
      const raw=serializeSession(s);assert(getInterventionState(s,c.id,'doctrines')==='max'&&!intervene(s,c.id,'doctrines')&&serializeSession(s)===raw);
      assert(intervene(s,c.id,'regress')&&c.age===4&&c.doctrine===5);parseSession(serializeSession(s));
    }
    const locked=colonyFixture({legacy:1000000});assert(getInterventionState(locked,locked.orbital.civilizations[0].id,'doctrines')==='locked');
    const poor=militaryFixture();poor.permanent.legacy=127;assert(getInterventionState(poor,poor.orbital.civilizations[0].id,'doctrines')==='legacy'&&!intervene(poor,poor.orbital.civilizations[0].id,'doctrines'));
  });
  test('Orbital traits: all fifteen behaviors activate on either AI team, while surface enemies remain unmodified',()=>{
    for(const team of ['player','enemy'])for(const t of Object.values(TRAITS)){
      const g=createTraitSampler({trait:t.id,type:t.units[0]})(0).game;
      const side=team==='player'?0:1,civs=[0,1].map(i=>({id:`test${i}`,name:'测试',profile:0,power:0,doctrine:i===side?5:0,superSoldiers:0}));
      g.bonuses=warBonuses(civs);
      if(team==='enemy')for(const u of g.units){u.team=u.team==='player'?'enemy':'player';u.x=RULES.width-u.x;}
      for(let i=0;i<420;i++){
        const targets=g.units.filter(u=>u.team!==team),positions=new Map(targets.filter(()=>t.id!=='suppression').map(u=>[u.id,u.x]));
        for(const u of targets)if(!['parry','shieldWall','forceField'].includes(t.id))u.attackCooldown=1000;
        updateGame(g,RULES.fixedStep);for(const u of g.units)if(positions.has(u.id)){u.x=positions.get(u.id);u.moving=false;}
      }
      assert(g.traitActivations?.[t.id]>0,`${team} ${t.id} must activate in combat`);
      assert(!stat(createGame(),{type:t.units[0],team:'enemy'},'traitAccess'));
    }
  });
  test('Orbital elite: unlocks are sequential and commanders buy one elite through normal economy, queue and training',()=>{
    for(const index of [0,1]){
      const s=militaryFixture(),w=s.orbital.wars[0],g=w.game,c=s.orbital.civilizations[index],team=['player','enemy'][index],ai=w.commanders[team];
      assert(getRecruitState(g,'superSoldier',team)==='disabled');assert(getInterventionState(s,c.id,'superSoldiers')==='doctrine');
      for(let i=0;i<5;i++)assert(intervene(s,c.id,'doctrines'));
      const before=g.units.length;assert(intervene(s,c.id,'superSoldiers')&&g.units.length===before);assert(stat(g,{team,type:'superSoldier'},'range')===32);
      g.gold[team]=3000;ai.cooldown=0;updateCommander(g,0,team,ai,{specialType:'superSoldier'});assert(g.queues[team].length===1&&g.queues[team][0].type==='superSoldier'&&g.queues[team][0].paid===3000&&g.gold[team]===0);
      assert(g.queues[team][0].remaining===12&&!g.units.some(u=>u.type==='superSoldier'));
      ai.cooldown=0;g.gold[team]=6000;updateCommander(g,0,team,ai,{specialType:'superSoldier'});assert(g.queues[team].filter(u=>u.type==='superSoldier').length===1);
      assert(intervene(s,c.id,'sniper'));assert(!intervene(s,c.id,'sniper'));assert(stat(g,{team,type:'superSoldier'},'damage')===SUPER_WEAPONS.sniper.damage);
      ticks(g,725);assert(g.units.some(u=>u.type==='superSoldier'&&u.team===team));
    }
    const classic=createGame();classic.ages.enemy=5;classic.gold.enemy=10000;assert(getRecruitState(classic,'superSoldier','enemy')==='player-only');
  });
  test('Orbital snapshots: enemy opener state, sniper lock and launched damage resume without replaying or multiplying',()=>{
    const s=militaryFixture({doctrine:5,elite:2}),o=s.orbital,w=o.wars[0],g=w.game;
    const gun=soldier(g,'superSoldier','enemy',850),target=soldier(g,'warMachine','player',400);target.attackCooldown=100;
    g.units=[gun,target];for(const ai of Object.values(w.commanders))ai.cooldown=100;
    updateOrbital(s,1/60);assert(gun.chargeRemaining>0&&!g.projectiles.length);
    let raw=serializeSession(s),resumed=parseSession(raw);assert(serializeSession(resumed)===raw);
    for(let i=0;i<67;i++){updateOrbital(s,1/60);updateOrbital(resumed,1/60);}assert(serializeSession(s)===serializeSession(resumed));
    const shot=g.projectiles.find(p=>p.kind==='sniper');assert(shot);const snapshot=JSON.stringify(shot),id=w.participants[1];assert(intervene(s,id,'boost')&&JSON.stringify(shot)===snapshot);
    // A primitive opener can still fight in a later-era war; its once-only state is persisted for the enemy as well.
    g.units=[soldier(g,'melee','enemy',650),soldier(g,'melee','player',520)];g.projectiles=[];g.units[1].attackCooldown=100;
    updateOrbital(s,1/60);assert(g.units[0].traits.openingStone.used);
    raw=serializeSession(s);resumed=parseSession(raw);assert(serializeSession(resumed)===raw);
    for(let i=0;i<10;i++){updateOrbital(s,1/60);updateOrbital(resumed,1/60);}assert(serializeSession(s)===serializeSession(resumed));
    const bad=JSON.parse(raw);bad.orbital.wars[0].game.units[0].traits.openingStone.used=1;rejects(()=>parseSession(JSON.stringify(bad)));
  });
  test('Orbital civilization ownership: early survivor retains doctrines, nuclear rebirth starts without gifts',()=>{
    const s=militaryFixture({future:false}),o=s.orbital,w=o.wars[0],c=o.civilizations[0];assert(intervene(s,c.id,'doctrines'));
    w.game.bases.enemy.hp=0;w.game.status='won';assert(resolveOrbitalWar(s,w.id)&&c.doctrine===1&&c.alive);
    const other=o.civilizations.find(c=>c.alive&&!c.doctrine);assert(startOrbitalWar(s,c.id,other.id));const next=o.wars[0];
    for(const civ of [c,other])while(civ.age<5)intervene(s,civ.id,'advance');
    next.game.bases.enemy.hp=0;next.game.status='won';assert(resolveOrbitalWar(s,next.id));for(let i=0;i<1220;i++)updateOrbital(s,.05);
    assert(o.phase==='living'&&o.civilizations.every(c=>c.doctrine===0&&c.superSoldiers===0));parseSession(serializeSession(s));
  });
  test('Orbital v18: actual v17 ledger and active war migrate exactly once; new purchases use new prices',()=>{
    const raw=JSON.stringify(v17Orbital),s=parseSession(raw),wire=JSON.parse(serializeSession(s));
    assert(s.version===SAVE_VERSION&&s.orbital.version===ORBITAL_RULES.version&&s.orbital.talents.recovery===3&&s.orbital.talents.lunarIndustry===1);
    // v19 grants the route free to anyone who already ran the outpost without it.
    const {transit,...paid}=wire.orbital.payments;assert(JSON.stringify(transit)==='["0"]'&&s.orbital.talents.transit===1);
    assert(JSON.stringify(paid)===JSON.stringify(v17Orbital.orbital.payments)&&JSON.stringify(wire.orbital.wars)===JSON.stringify(v17Orbital.orbital.wars));
    assert(s.orbital.civilizations.every(c=>c.doctrine===0&&c.superSoldiers===0));
    const before=s.permanent.legacy;assert(purchaseOrbitalTalent(s,'recovery')&&Q.eq(s.permanent.legacy,Q.sub(before,T.recovery.costs[3])));
    assert(JSON.stringify(v17Orbital)===raw);const saved=serializeSession(s);assert(serializeSession(parseSession(saved))===saved);
    for(const change of [o=>o.talents.recovery=8,o=>o.civilizations[0].doctrine=6,o=>o.civilizations[0].doctrine=1,o=>o.civilizations[0].superSoldiers=1,o=>delete o.civilizations[0].doctrine,o=>o.payments.recovery[3]='1']){const bad=JSON.parse(saved);change(bad.orbital);rejects(()=>parseSession(JSON.stringify(bad)));}
  });
  test('Orbital art geometry: seven exact segments close one ring; rotation is periodic and factories grow with each level',()=>{
    const segments=habitatSegments(7);assert(segments.length===7);near(segments[0].start,0);near(segments.at(-1).end,Math.PI*2);
    for(let i=1;i<7;i++)near(segments[i].start,segments[i-1].end);
    near(lunarRotation(180),lunarRotation(0));assert(lunarRotation(45)!==lunarRotation(0));
    for(let n=0;n<=4;n++)assert(lunarFacilities(n).length===3+2*n);
    for(const [key,t]of Object.entries(T))for(const p of Object.keys(t.requires))assert(p==='protocol'||T[p].branch===t.branch,`${key}: branch must not cross another route`);
    assert(new Set(Object.values(T).map(t=>t.kind??'ordinary')).size===3);
  });
  test.browser('Orbital art: static talent sky exactly matches arrival; lunar rotation and construction animate without touching saves',()=>{
    const canvas=document.createElement('canvas');canvas.width=800;canvas.height=500;const ctx=canvas.getContext('2d'),s=militaryFixture(),raw=serializeSession(s);
    drawOrbitalTalentSky(ctx,800,500);const sky=canvas.toDataURL();drawOrbitalScene(ctx,800,500,ORBITAL_SECONDS);assert(sky===canvas.toDataURL());
    drawLunarColony(ctx,800,500,s.orbital);const moon=canvas.toDataURL();drawLunarColony(ctx,800,500,{...s.orbital,elapsed:s.orbital.elapsed+45});assert(moon!==canvas.toDataURL());
    drawLunarColony(ctx,800,500,s.orbital,{reducedMotion:true});const quiet=canvas.toDataURL();drawLunarColony(ctx,800,500,{...s.orbital,elapsed:1000},{reducedMotion:true,ambientTime:100});assert(quiet===canvas.toDataURL());
    const built={...s.orbital,talents:{...s.orbital.talents,recovery:7}};drawOrbitalColony(ctx,800,500,built,{construction:.1});const ring=canvas.toDataURL();drawOrbitalColony(ctx,800,500,built,{construction:1});assert(ring!==canvas.toDataURL()&&serializeSession(s)===raw);
  });
  test.browser('Orbital doctrine UI: era ladder, paid grants and elite rifle survive save; route navigation works on mobile',async()=>{
    const s=militaryFixture();const frame=await mountFixture(serializeSession(s),false,'debug',{reducedMotion:true});let raw;
    try{const d=frame.contentDocument,w=frame.contentWindow,el=id=>d.getElementById(id);
      assert(!el('colony-doctrines').hidden);for(let i=1;i<=5;i++){el('intervene-doctrines').click();assert(el(`doctrine-tier-${i}`).classList.contains('granted'));}
      assert(el('intervene-doctrines').disabled);el('intervene-superSoldiers').click();el('intervene-sniper').click();assert(el('intervene-sniper').disabled);
      el('colony-first').value=s.orbital.civilizations[1].site;el('colony-first').dispatchEvent(new w.Event('change'));assert(!el('intervene-doctrines').disabled&&!el('doctrine-tier-1').classList.contains('granted'));
      for(const width of [320,390,1100]){frame.style.width=`${width}px`;await new Promise(r=>setTimeout(r,35));el('colony-talents').click();d.querySelector('[data-orbit-route="recovery"]').click();el('orbit-node-recovery').click();assert(el('orbit-buy').getBoundingClientRect().right<=width+1);el('close-orbit-talents').click();assert(d.documentElement.scrollWidth<=width+1);}
      el('colony-save').click();el('manual-save').click();raw=w.__storage.getItem(DEBUG_SAVE_KEY);assert(parseSession(raw).orbital.civilizations[0].superSoldiers===2);
    }finally{frame.remove();}
    const restored=await mountFixture(raw,false,'debug',{reducedMotion:true});try{const d=restored.contentDocument;assert(!d.getElementById('colony-doctrines').hidden&&!d.getElementById('intervene-doctrines').disabled);}finally{restored.remove();}
  });
}

import { SAVE_VERSION } from '../src/progression-config.js';
import { Q } from '../src/quantity.js';
import { launchReady } from './orbital-cases.js';
import { purchaseTalent, updateProgression } from '../src/progression.js';
import { getTalentState, TALENTS } from '../src/talents.js';
import { availableSpeeds } from '../src/progression-config.js';
import { createOrbitalState, enterOrbital, startOrbitalWar, updateOrbital, resolveOrbitalWar, findCivilization, purchaseOrbitalTalent, getOrbitalTalentState, getInterventionState, intervene, orbitalLegacySpent, interventionCost, setSeedTendency } from '../src/orbital-game.js';
import { syncWarCivilizations, warOdds } from '../src/orbital-war.js';
import { ORBITAL_RULES as R, ORBITAL_RULES, ORBITAL_TALENTS as T, ORBITAL_ACTIONS as ACTIONS, SITES } from '../src/orbital-config.js';
import { civilizationValue, rebirthDelay, lunarLegacyRate, bondRate, nuclearMultiplier, doomsdayMultiplier, orbitalYieldMultiplier, chronicleMultiplier } from '../src/celestial-economy.js';
import { serializeSession, parseSession, DEBUG_SAVE_KEY, createSaveStore, mapSessionQuantities } from '../src/save.js';
import { oldOrbitalSpent } from '../src/orbital-history.js';
import { fromV15Record } from '../src/save-record.js';
import { v16Orbital } from './fixtures/v16-orbital.js';
import { dayPhase, localSkyTime, siteDaylight } from '../src/celestial-clock.js';
import { icon, PROTOCOL_GLYPH } from '../src/icons.js';
import { records } from './fixtures/v15-orbital.js';
import { setDebugLegacy } from '../src/debug.js';
import { createGame, evolve, AGES, recruit, stat } from '../src/game.js';
import { buildOrbitalViewModel } from '../src/orbital-view-model.js';
import { drawOrbitalColony, drawOrbitalTalentSky, drawOrbitStars, drawLunarColony, sitePosition, habitatSegments } from '../src/orbital-render.js';
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
export function lunarFixture(){
  const s=colonyFixture({legacy:50000000,talents:['monitor','recovery','recovery','reseed','reseed']});
  for(let i=0;i<2;i++){pair(s);const w=s.orbital.wars[0];future(w);won(w);resolveOrbitalWar(s,w.id);advance(s,61);}
  // The route has to exist before anything from the moon reaches Earth.
  purchaseOrbitalTalent(s,'transit');purchaseOrbitalTalent(s,'outpost');return s;
}
export function registerOrbitalColonyTests(test,assert,near){
  const throws=fn=>{let caught=false;try{fn();}catch{caught=true;}assert(caught,'Invalid orbital input must be rejected');};
  test('Orbital clock: surface and rotating sites share one solar day, including negative local times',()=>{
    near(dayPhase(-30),.75);near(dayPhase(120),0);
    for(const site of SITES)for(const time of [0,17,59,120,501]){
      const solar=siteDaylight(time,site),point=sitePosition(site,time,{cx:0,cy:0,r:1});
      near(solar.phase,dayPhase(localSkyTime(time,site)));
      near(point.x,solar.elevation*Math.cos((.5-site.y)*Math.PI));
      const next=sitePosition(site,time+120,{cx:0,cy:0,r:1});near(next.x,point.x);near(next.y,point.y);near(next.depth,point.depth);
    }
    const a=sitePosition(SITES[0],0),b=sitePosition(SITES[0],30);assert(a.x!==b.x&&a.depth!==b.depth);
  });
  test('Orbital habitat: each purchase adds one section and retains the original doubling; protocol glyph is shared',()=>{
    const s=colonyFixture({legacy:5000000});const value=civilizationValue(s.orbital,s.orbital.civilizations[0]);
    for(let rank=1;rank<=7;rank++){assert(purchaseOrbitalTalent(s,'recovery'));assert(habitatSegments(rank).length===rank);assert(civilizationValue(s.orbital,s.orbital.civilizations[0])===value*2**rank);}
    assert(!purchaseOrbitalTalent(s,'recovery')&&T.recovery.costs.length===7);
    assert(T.protocol.icon==='protocol'&&icon(T.protocol.icon).includes(PROTOCOL_GLYPH));
  });
  test('Moon route: the outpost needs the route, the mass driver doubles output, and 远航协议 completes VI only in a nuclear winter',()=>{
    const s=colonyFixture({legacy:500000000,talents:['monitor','recovery','recovery','reseed','reseed']});
    for(let i=0;i<2;i++){pair(s);const w=s.orbital.wars[0];future(w);won(w);resolveOrbitalWar(s,w.id);advance(s,61);}
    assert(getOrbitalTalentState(s,'outpost')==='prerequisite'&&!purchaseOrbitalTalent(s,'outpost'),'No lunar income without the route');
    assert(purchaseOrbitalTalent(s,'transit')&&purchaseOrbitalTalent(s,'outpost')&&s.orbital.completionAt===null,'The route no longer ends VI');
    const rate=lunarLegacyRate(s.orbital);assert(purchaseOrbitalTalent(s,'massDriver')&&lunarLegacyRate(s.orbital)===rate*2);
    for(let i=0;i<2;i++)assert(purchaseOrbitalTalent(s,'lunarIndustry'));
    while(purchaseOrbitalTalent(s,'recovery')){}
    for(let i=0;i<2;i++){pair(s);const w=s.orbital.wars[0];future(w);won(w);resolveOrbitalWar(s,w.id);if(i===0)advance(s,61);}
    assert(purchaseOrbitalTalent(s,'shipyard')&&s.orbital.nuclearCycles===4&&s.orbital.phase==='winter');
    const winter=serializeSession(s);advance(s,61);
    assert(s.orbital.phase==='living'&&getOrbitalTalentState(s,'voyage')==='winter'&&!purchaseOrbitalTalent(s,'voyage'),'The ark leaves only in winter');
    const back=parseSession(winter);assert(getOrbitalTalentState(back,'voyage')==='ready'&&purchaseOrbitalTalent(back,'voyage')&&back.orbital.completionAt!==null);
    assert(serializeSession(parseSession(serializeSession(back)))===serializeSession(back));
  });
  test('Cycle talents: tendencies vary new civilizations, war bonds pay per second, research and ruins raise the annihilation',()=>{
    // Tendencies are drawn only after the talent, and they change the war's stat sources.
    const plain=colonyFixture({legacy:10000000,talents:['monitor','reseed']});assert(plain.orbital.civilizations.every(c=>c.tendency===0));
    const s=colonyFixture({legacy:10000000,talents:['monitor','reseed','tendency','nuclearResearch','bonds']});
    pair(s);const w=s.orbital.wars[0];future(w);won(w);resolveOrbitalWar(s,w.id);advance(s,61);
    assert(s.orbital.civilizations.every(c=>c.tendency>=1&&c.tendency<=3),'Every new seed carries a tendency');
    const [a,b]=s.orbital.civilizations;assert(pair(s));const war=s.orbital.wars[0];
    const tagged=war.game.bonuses.filter(e=>e.source.id.endsWith(':tendency'));assert(tagged.length>0);
    // War bonds: with no experience flowing, one second of war pays the bond rate.
    const rate=bondRate(s.orbital,war);assert(rate===R.bondRate*orbitalYieldMultiplier(s.orbital));
    // Research doubles the annihilation; the ruins of this cycle add half with 连锁反扑.
    const civ=s.orbital.civilizations.find(c=>c.alive);const base=civilizationValue(s.orbital,civ,'nuclear');
    assert(nuclearMultiplier(s.orbital)===2&&base>0);
    assert(purchaseOrbitalTalent(s,'chain')&&getOrbitalTalentState(s,'doomsday')!=='max');
    assert(serializeSession(parseSession(serializeSession(s)))===serializeSession(s));
    const bad=JSON.parse(serializeSession(s));bad.orbital.civilizations[0].tendency=4;throws(()=>parseSession(JSON.stringify(bad)));
    const untalented=JSON.parse(serializeSession(plain));untalented.orbital.civilizations[0].tendency=1;throws(()=>parseSession(JSON.stringify(untalented)));
  });
  test('Doomsday clock: a fast cycle doubles the annihilation, a slow one pays the base',()=>{
    const s=colonyFixture({legacy:100000000,talents:['monitor','reseed','nuclearResearch','chain','doomsday']});
    assert(doomsdayMultiplier(s.orbital)===2);s.orbital.elapsed=R.doomsdaySeconds/2;near(doomsdayMultiplier(s.orbital),1.5);
    s.orbital.elapsed=R.doomsdaySeconds*3;assert(doomsdayMultiplier(s.orbital)===1);
  });
  test('Surface diplomacy: boosts escalate ×4 with worth, airdrops pay gold into the war, a ceasefire freezes it without income',()=>{
    const s=colonyFixture({legacy:100000000,talents:['monitor','patronage','airdrop','intel','ceasefire','bonds']}),o=s.orbital;pair(s);
    const war=o.wars[0],[a,b]=war.participants.map(id=>findCivilization(o,id));
    const costs=[];for(let i=0;i<R.maximumPower;i++){const wallet=s.permanent.legacy;assert(intervene(s,a.id,'boost'));costs.push(Q.toNumber(Q.sub(wallet,s.permanent.legacy)));}
    assert(JSON.stringify(costs)===JSON.stringify([64,256,1024,4096,16384])&&getInterventionState(s,a.id,'boost')==='max');
    purchaseOrbitalTalent(s,'recovery');assert(interventionCost(o,b,'boost')===128,'The ring raises intervention prices with rewards');
    const gold=war.game.gold.enemy;assert(intervene(s,b.id,'airdrop'));assert(Q.eq(war.game.gold.enemy,Q.add(gold,AGES[b.age].startingGold*R.airdropGold))&&Q.eq(b.gold,war.game.gold.enemy)&&b.airdrops===1);
    assert(interventionCost(o,b,'airdrop')===2*ACTIONS.airdrop.baseCost*2);
    const odds=buildOrbitalViewModel(s)['#colony-war-player'];assert(/胜率 \d+%/.test(odds));
    assert(warOdds(a,b)>.9&&Math.abs(warOdds(a,b)+warOdds(b,a)-1)<1e-9,'Five boosts make a clear favourite');
    advance(s,1);const frozen=JSON.stringify(war.game),earned=o.legacyEarned;
    assert(intervene(s,a.id,'ceasefire')&&war.ceasefire===R.ceasefireSeconds&&getInterventionState(s,b.id,'ceasefire')==='truce');
    const raw=serializeSession(s);assert(serializeSession(parseSession(raw))===raw);
    advance(s,R.ceasefireSeconds/2);assert(JSON.stringify(war.game)===frozen&&Q.eq(o.legacyEarned,earned),'A frozen war neither fights nor pays');
    assert(/停火中/.test(buildOrbitalViewModel(s)['#colony-solar-time']));
    advance(s,R.ceasefireSeconds);assert(war.ceasefire===0&&JSON.stringify(war.game)!==frozen);
    const bad=JSON.parse(raw);bad.orbital.wars[0].ceasefire=R.ceasefireSeconds+1;throws(()=>parseSession(JSON.stringify(bad)));
    const plain=colonyFixture({legacy:10000,talents:['monitor']});pair(plain);
    const untalented=JSON.parse(serializeSession(plain));untalented.orbital.wars[0].ceasefire=5;throws(()=>parseSession(JSON.stringify(untalented)));
    const supplied=JSON.parse(serializeSession(plain));supplied.orbital.civilizations[0].airdrops=1;throws(()=>parseSession(JSON.stringify(supplied)));
  });
  test('v22: 轨道收割 moves under 知识封锁, earlier harvesters keep it with a free lock, and eight civilizations can fight four wars',()=>{
    const s=colonyFixture({legacy:100000,talents:['monitor','patronage']});
    const old=JSON.parse(serializeSession(s));old.version=21;old.orbital.version=7;delete old.orbital.seedTendency;
    for(const key of ['overview','quickening','chronicle','directed','fallout'])delete old.orbital.talents[key];
    old.orbital.talents.harvest=1;old.orbital.payments.harvest=['2048'];
    const migrated=parseSession(JSON.stringify(old));
    assert(migrated.version===SAVE_VERSION&&migrated.orbital.talents.regression===1&&JSON.stringify(migrated.orbital.payments.regression)==='["0"]');
    assert(Q.eq(migrated.orbital.payments.harvest[0],2048)&&migrated.orbital.talents.overview===0);
    const raw=serializeSession(migrated);assert(serializeSession(parseSession(raw))===raw);
    const fresh=colonyFixture({legacy:10000000,talents:['monitor','patronage','technology']});assert(!purchaseOrbitalTalent(fresh,'harvest'));
    assert(purchaseOrbitalTalent(fresh,'regression')&&purchaseOrbitalTalent(fresh,'harvest')&&Q.eq(fresh.orbital.payments.harvest[0],T.harvest.costs[0]));
    const full=colonyFixture({legacy:10000000,talents:['reseed','diversity','diversity','diversity','diversity']});
    full.orbital.phase='winter';full.orbital.remaining=0.001;full.orbital.settledCycle=full.orbital.cycle;full.orbital.nuclearCycles=full.orbital.cycle;full.orbital.lastCatastropheAt=0;full.orbital.winterDuration=1;
    for(const c of full.orbital.civilizations)c.alive=false;advance(full,.1);
    assert(full.orbital.civilizations.length===R.maxCivilizations&&SITES.length===R.maxCivilizations);
    while(pair(full));assert(full.orbital.wars.length===R.maxWars);
    const four=serializeSession(full);assert(serializeSession(parseSession(four))===four);
  });
  test('Surface speed in VI: 时间加速 can still be bought after the protocol; other surface talents stay sealed',()=>{
    const s=colonyFixture({legacy:100000});s.permanent.talents.timeAcceleration=0;delete s.permanent.purchaseCosts.timeAcceleration;
    s.permanent.settings.speed=Math.min(s.permanent.settings.speed,2);
    assert(getTalentState(s,'timeAcceleration')==='ready'&&getTalentState(s,'logistics')!=='ready');
    const wallet=s.permanent.legacy;assert(purchaseTalent(s,'timeAcceleration')&&Q.eq(s.permanent.legacy,Q.sub(wallet,TALENTS.timeAcceleration.costs[0])));
    assert(availableSpeeds(s.permanent).includes(3));const raw=serializeSession(s);assert(serializeSession(parseSession(raw))===raw);
  });
  test('Talent icons: every node in both star maps has its own drawn icon; only the shared protocol repeats',async()=>{
    const {TALENT_MAP}=await import('../src/talent-map.js'),{iconMarkup}=await import('../src/icons.js');
    const names=[...Object.entries(TALENT_MAP).map(([k,a])=>[`I:${k}`,a.icon]),...Object.entries(T).map(([k,t])=>[`VI:${k}`,t.icon])];
    const seen=new Map();for(const [node,name]of names){assert(iconMarkup(name)!==iconMarkup('__missing__')||name==='shield',`${node} uses an undefined icon ${name}`);
      if(name!=='protocol'){assert(!seen.has(name),`${node} reuses ${name} from ${seen.get(name)}`);seen.set(name,node);}}
  });
  test('Cycle talents II: quickened seeds start later, directed seeding picks the tendency, fallout pays through the winter, memory grows with cycles',()=>{
    const s=colonyFixture({legacy:1e8,talents:['reseed','diversity','quickening','tendency','directed','nuclearResearch','chain','fallout','quickening','chronicle']}),o=s.orbital;
    assert(setSeedTendency(s,2)&&!setSeedTendency(s,4));
    o.phase='winter';o.remaining=1e-3;o.settledCycle=o.cycle;o.nuclearCycles=o.cycle;o.lastCatastropheAt=0;o.winterDuration=1;for(const c of o.civilizations)c.alive=false;advance(s,.1);
    assert(o.phase==='living'&&o.civilizations.every(c=>c.age===3&&Q.eq(c.experience,AGES[3].experienceRequired)&&c.tendency===2));
    const raw=serializeSession(s);assert(serializeSession(parseSession(raw))===raw);
    const bad=JSON.parse(raw);bad.orbital.seedTendency=5;throws(()=>parseSession(JSON.stringify(bad)));
    assert(o.talents.chronicle===1&&o.nuclearCycles>0&&Math.abs(chronicleMultiplier(o)-(1+R.chronicleStep*o.nuclearCycles))<1e-9);
    // Fallout: the whole winter pays half the last annihilation.
    const w=colonyFixture({legacy:1e8,talents:['reseed','nuclearResearch','chain','fallout']}),wo=w.orbital;
    wo.phase='winter';wo.settledCycle=wo.cycle;wo.nuclearCycles=wo.cycle;wo.lastCatastropheAt=0;wo.winterDuration=wo.remaining=rebirthDelay(wo);wo.lastReward=10000;wo.legacyEarned=Q.add(wo.legacyEarned,10000);w.permanent.totalLegacy=Q.add(w.permanent.totalLegacy,10000);
    for(const c of wo.civilizations){c.alive=false;c.warId=null;}wo.wars=[];wo.selectedWar=null;
    const before=wo.legacyEarned;advance(w,rebirthDelay(wo)+1);near(Q.toNumber(Q.sub(wo.legacyEarned,before)),10000*R.falloutShare,2);
  });
  test('Intel: the pre-war estimate shows only with 情报网络 and favours the older, boosted side',()=>{
    const plain=colonyFixture({legacy:10000,talents:['monitor']});assert(!/情报预估/.test(buildOrbitalViewModel(plain)['#colony-war-hint']));
    const s=colonyFixture({legacy:10000,talents:['monitor','intel']});assert(/情报预估：.*\d+%.*\d+%/.test(buildOrbitalViewModel(s)['#colony-war-hint']));
    const base={age:1,power:0,tendency:0,doctrine:0,superSoldiers:0};
    assert(warOdds(base,base)===.5&&warOdds({...base,age:2},base)>.8&&warOdds({...base,power:1},{...base,age:2})>.5);
  });
  test('Lunar economy: locked production is zero, outpost and each industry rank pay the displayed rate',()=>{
    const locked=colonyFixture({legacy:10000,talents:['recovery']});advance(locked,1);assert(lunarLegacyRate(locked.orbital)===0&&locked.orbital.lunarProduced===0);
    const s=lunarFixture();let rate=R.lunarBaseIncome;assert(lunarLegacyRate(s.orbital)===rate);
    for(let rank=0;rank<=4;rank++){
      const wallet=s.permanent.legacy,total=s.permanent.totalLegacy,earned=s.orbital.legacyEarned,produced=s.orbital.lunarProduced;
      advance(s,1);assert(Q.eq(s.permanent.legacy,Q.add(wallet,rate))&&Q.eq(s.permanent.totalLegacy,Q.add(total,rate)));
      assert(Q.eq(s.orbital.legacyEarned,Q.add(earned,rate))&&Q.eq(s.orbital.lunarProduced,Q.add(produced,rate)));
      assert(buildOrbitalViewModel(s)['#colony-lunar-rate']===Q.format(rate));parseSession(serializeSession(s));
      if(rank<4){assert(purchaseOrbitalTalent(s,'lunarIndustry'));rate*=2;assert(lunarLegacyRate(s.orbital)===rate);}
    }
    // The ring multiplies surface income, never the moon's supply line.
    assert(!purchaseOrbitalTalent(s,'lunarIndustry'));for(let rank=3;rank<=7;rank++)assert(purchaseOrbitalTalent(s,'recovery')&&lunarLegacyRate(s.orbital)===R.lunarBaseIncome*2**4);
  });
  test('Lunar production: winter keeps producing, pause/hidden/invalid deltas freeze, refresh keeps fractions without offline awards',()=>{
    let s=lunarFixture();pair(s);const w=s.orbital.wars[0];future(w);won(w);resolveOrbitalWar(s,w.id);const produced=s.orbital.lunarProduced;advance(s,1);
    assert(s.orbital.phase==='winter'&&Q.eq(s.orbital.lunarProduced,Q.add(produced,R.lunarBaseIncome)));
    updateProgression(s,1/60);const raw=serializeSession(s);assert(s.orbital.lunarFraction>0);
    for(const dt of [0,-1,NaN,Infinity])updateProgression(s,dt);updateProgression(s,.05,{paused:true});updateProgression(s,.05,{hidden:true});assert(serializeSession(s)===raw);
    const r=parseSession(raw);assert(serializeSession(r)===raw);advance(s,2);advance(r,2);assert(serializeSession(s)===serializeSession(r));
  });
  test('Orbital v17: real v16 war upgrades once, preserving ledger, habitat ranks and combat, without backpay',()=>{
    const source=JSON.stringify(v16Orbital),s=parseSession(source),r=parseSession(serializeSession(s));
    assert(s.version===SAVE_VERSION&&s.orbital.version===ORBITAL_RULES.version&&s.orbital.lunarProduced===0&&s.orbital.lunarFraction===0&&s.orbital.talents.lunarIndustry===0);
    assert(s.orbital.talents.recovery===v16Orbital.orbital.talents.recovery&&s.orbital.wars.length===1);
    assert(JSON.stringify(v16Orbital)===source&&serializeSession(s)===serializeSession(r));
    // v21 adds only a stopped truce clock to each war.
    const wars=JSON.parse(serializeSession(s)).orbital.wars;assert(wars.every(w=>w.ceasefire===0)&&JSON.stringify(wars.map(({ceasefire,...w})=>w))===JSON.stringify(v16Orbital.orbital.wars));
    for(const edit of [o=>o.lunarProduced='-1',o=>o.lunarFraction=1,o=>o.talents.lunarIndustry=1,o=>o.lunarProduced='1',o=>delete o.lunarProduced,o=>o.version=2]){
      const bad=JSON.parse(serializeSession(s));edit(bad.orbital);throws(()=>parseSession(JSON.stringify(bad)));
    }
  });
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
    assert(Q.eq(s.permanent.legacy,Q.sub(wallet,64)));assert(JSON.stringify(shot)===snapshot&&Q.eq(stat(war.game,enemy,'damage'),enemyDamage)&&Q.eq(enemy.hp,enemyHealth));assert(stat(createGame(),{type:troop.type,team:'player'},'damage')===before);
    const raw=serializeSession(s);assert(serializeSession(parseSession(raw))===raw);
  });
  test('Orbital intervention: technology advances both AI sides; suppression removes advanced units and resets XP without producing rewards',()=>{
    const s=colonyFixture({legacy:10000,talents:['monitor','patronage','technology','regression']});pair(s);const war=s.orbital.wars[0],id=war.participants[1],c=findCivilization(s.orbital,id),income=s.orbital.legacyEarned;
    assert(intervene(s,id,'advance')&&c.age===2&&war.game.ages.enemy===2);assert(recruit(war.game,AGES[2].units[0],'enemy'));
    assert(intervene(s,id,'regress')&&c.age===1&&c.experience===0&&war.game.queues.enemy.length===0&&s.orbital.legacyEarned===income);
    assert(!intervene(s,id,'regress'));parseSession(serializeSession(s));
  });
  test('Orbital harvest: kills the selected civilization once, ends its war, retains its opponent and respawns after a bounded wait',()=>{
    const s=colonyFixture({legacy:100000,talents:['monitor','patronage','technology','regression','harvest']});pair(s);const o=s.orbital,id=o.wars[0].participants[0],c=findCivilization(o,id),reward=civilizationValue(o,c);
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
      assert(s.version===SAVE_VERSION&&s.orbital.version===ORBITAL_RULES.version&&s.orbital.started===old.orbital.started&&s.orbital.legacyEarned===old.orbital.legacyEarned);
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
    const s=colonyFixture({legacy:10000,talents:['monitor','patronage']});intervene(s,s.orbital.civilizations[0].id,'boost');assert(orbitalLegacySpent(s.orbital)===128+256+64);
    assert(setDebugLegacy(s,123)&&parseSession(serializeSession(s)).permanent.legacy===123);
    const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},store=createSaveStore(()=>storage,{debug:true});store.load();assert(store.save(s).ok);advance(s,1);assert(store.save(s).ok);
    data.set(DEBUG_SAVE_KEY,'broken');assert(!store.load().ok&&store.recover().ok);
  });
  test('Orbital simulation: real wars finish nuclear cycles, differ by seed, unlock VI and keep all options bounded',()=>{
    const a=simulateOrbital({seed:1}),b=simulateOrbital({seed:2});assert(a.cycles===4&&a.completed&&b.cycles===4&&b.completed&&a.nuclearTimes[0]!==b.nuclearTimes[0]);
    // Civilizations climb I→V in minutes, so four nuclear cycles take ~35–45 simulated minutes.
    assert(a.seconds>1500&&a.seconds<3000&&b.seconds>1500&&b.seconds<3000);
    for(const options of [{legacy:-1},{legacy:.5},{seed:-1},{targetCycles:0},{maxSeconds:Infinity},{maxSeconds:86401},{buyTalents:1}])throws(()=>simulateOrbital(options));
  });
  test('Orbital view model: Legacy prices, monitor gating and tree prerequisites reflect actual state',()=>{
    const s=colonyFixture(),v=buildOrbitalViewModel(s);assert(v['#colony-start-war@disabled']===false&&v['#colony-monitor@hidden']);assert(!Object.keys(v).some(k=>/energy|power/.test(k)));
    assert(v['#orbit-node-protocol@data-state']==='max'&&v['#orbit-node-monitor@data-state']==='legacy');
  });
  test.browser('Orbital sky: stars twinkle, Earth rotates, habitats and moon grow; reduced motion is stable and rendering is read-only',()=>{
    const canvas=document.createElement('canvas');canvas.width=600;canvas.height=420;const ctx=canvas.getContext('2d');
    drawOrbitStars(ctx,600,420,0);const stars=canvas.toDataURL();drawOrbitStars(ctx,600,420,2);assert(canvas.toDataURL()!==stars);
    drawOrbitStars(ctx,600,420,0,true);const quiet=canvas.toDataURL();drawOrbitStars(ctx,600,420,5,true);assert(canvas.toDataURL()===quiet);
    const s=lunarFixture(),raw=serializeSession(s);drawOrbitalTalentSky(ctx,600,420,s.orbital,{ambientTime:0});const sky=canvas.toDataURL();drawOrbitalTalentSky(ctx,600,420,s.orbital,{ambientTime:10});assert(canvas.toDataURL()===sky);
    drawLunarColony(ctx,600,420,s.orbital);const moon=canvas.toDataURL();drawLunarColony(ctx,600,420,{...s.orbital,talents:{...s.orbital.talents,lunarIndustry:4}});assert(canvas.toDataURL()!==moon);
    assert(serializeSession(s)===raw);
  });
  test.browser('Lunar UI: rate, cost, shared icons, hidden detail, purchase and pause match the saved production',async()=>{
    const frame=await mountFixture(serializeSession(lunarFixture()),false,'debug',{reducedMotion:true});
    try{const d=frame.contentDocument,w=frame.contentWindow,el=id=>d.getElementById(id);let now=0;
      assert(!el('colony-lunar').hidden&&el('colony-lunar-rate').textContent===Q.format(R.lunarBaseIncome));
      el('colony-talents').click();assert(el('orbit-detail').hidden);
      assert(el('orbit-node-protocol').querySelector('svg path').getAttribute('d')===PROTOCOL_GLYPH);
      el('close-orbit-talents').click();el('colony-lunar-upgrade').click();assert(!el('orbit-detail').hidden);
      assert(el('orbit-detail-current').textContent.includes(Q.format(R.lunarBaseIncome))&&el('orbit-detail-next').textContent.includes(Q.format(R.lunarBaseIncome*2)));
      el('orbit-buy').click();assert(el('colony-lunar-rate').textContent===Q.format(R.lunarBaseIncome*2));el('close-orbit-talents').click();
      for(let i=0;i<10;i++)w.__testFrame(now+=100);el('colony-pause').click();const wallet=el('colony-legacy').textContent;
      for(let i=0;i<10;i++)w.__testFrame(now+=100);assert(el('colony-legacy').textContent===wallet);
      el('colony-save').click();el('manual-save').click();const saved=parseSession(w.__storage.getItem(DEBUG_SAVE_KEY));assert(saved.orbital.talents.lunarIndustry===1&&saved.orbital.lunarProduced>0);
    }finally{frame.remove();}
  });
  test.browser('Orbital UI: pair civilizations, buy monitoring on the SVG tree, watch real combat, pause, intervene and restore',async()=>{
    let frame=await mountFixture(serializeSession(colonyFixture({legacy:10000})),false,'debug',{reducedMotion:true}),raw;
    try{const doc=frame.contentDocument,win=frame.contentWindow,el=id=>doc.getElementById(id);let now=0;const tick=n=>{for(let i=0;i<n;i++)win.__testFrame(now+=100);};
      assert(!el('orbital-game').hidden&&el('colony-monitor').hidden);el('colony-start-war').click();tick(10);
      el('colony-talents').click();assert(el('orbit-talents-dialog').open);const before=el('colony-time').textContent;tick(10);assert(el('colony-time').textContent===before);
      el('orbit-node-monitor').click();el('orbit-buy').click();assert(el('orbit-node-monitor').dataset.state==='max'&&el('orbit-cost-monitor').textContent==='');
      el('orbit-node-patronage').dispatchEvent(new win.MouseEvent('dblclick',{bubbles:true}));assert(el('orbit-node-patronage').dataset.state==='max');
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
        el('colony-talents').click();el('orbit-node-monitor').click();assert(el('orbit-tree-edges').querySelectorAll('path').length>=11);assert(el('orbit-node-protocol').getBoundingClientRect().width>=64);
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

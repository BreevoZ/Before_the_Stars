import { getRunBonuses } from '../src/progression-bonuses.js';
import { TALENTS, emptyTalents, getLegacyReward, getTalentState, purchaseTalent } from '../src/talents.js';
import { getLegacyProduction } from '../src/legacy-machine.js';
import { stat } from '../src/stats.js';
import { records as v9Records } from './fixtures/v9-save.js';
import { simulateRun } from '../sim/simulate.js';
import { Q } from '../src/quantity.js';
import { createGame, evolve, AGES, recruit, RULES } from '../src/game.js';
import { createProgression, resolveBattle, continueCivilization, rebuildCivilization, updateProgression, abandonCivilization } from '../src/progression.js';
import { getVictorySupplies, LEGACY_ECONOMY, SAVE_VERSION } from '../src/progression-config.js';
import { buildViewModel } from '../src/view-model.js';
import { buildCivilizationViewModel } from '../src/civilization-view-model.js';
import { serializeSession, parseSession } from '../src/save.js';
import { mountFixture } from './progression-cases.js';

function ageTo(game, age, team='player') {
  game.experience[team]=AGES[age].experienceRequired;
  while(game.ages[team]<age)evolve(game,team);
}
function finish(s,age=5) {
  ageTo(s.game,age,'enemy');s.game.status='won';s.game.bases.enemy.hp=0;resolveBattle(s);
}
function productionSession() {
  const s=createProgression();finish(s);
  s.permanent.completedCycles=s.permanent.totalLegacy=s.permanent.legacy=200000;s.permanent.automation.unlocked=true;
  for(const key of ['spark','conservation','conservation','openingStone','shieldWall','parry','legacyMachine']) {
    if(!purchaseTalent(s,key))throw Error(`Missing production prerequisite: ${key}`);
  }
  rebuildCivilization(s,s.run.runId);s.game.ai.enabled=false;
  return s;
}
function advance(s,seconds,options) {for(let i=0;i<Math.round(seconds/RULES.fixedStep);i++)updateProgression(s,RULES.fixedStep,options);}
export function registerEconomyTests(test,assert,near) {
  test('Roster: unpurchased super soldier is absent from recruitment, help and evolution previews; classic stays visible',()=>{
    const s=createProgression();ageTo(s.game,4);
    assert(!buildViewModel(s).bindings['#evolution-unlocks'].includes('超级士兵'));
    ageTo(s.game,5);let vm=buildViewModel(s).bindings;
    assert(vm['[data-unit-slot="3"]@hidden']&&vm['[data-unit-slot="3"]@disabled']&&vm['#help-unit-3@hidden']);
    assert(!recruit(s.game,'superSoldier'));
    s.run.talents.superSoldierPlan=1;vm=buildViewModel(s).bindings;assert(!vm['[data-unit-slot="3"]@hidden']);
    const classic=createGame();ageTo(classic,5);assert(!buildViewModel({game:classic}).bindings['[data-unit-slot="3"]@hidden']);
  });
  test('Victory supplies: compensate the next age once, retain current age and survive victory/save/continue without extra refunds',()=>{
    let s=createProgression();s.game.ai.enabled=false;s.game.experience.player=40;recruit(s.game,'melee');
    const gold=s.game.gold.player,refund=s.game.queues.player[0].paid;finish(s,1);
    assert(getVictorySupplies(s.game).gold===225&&getVictorySupplies(s.game).experience===60);
    assert(buildCivilizationViewModel(s)['#result-hint'].includes('+225'));
    s=parseSession(serializeSession(s));const id=s.run.battleId;
    assert(continueCivilization(s,id));near(s.game.gold.player,gold+refund+225);
    assert(s.game.experience.player===100&&s.game.ages.player===1&&s.game.ages.enemy===2&&!s.permanent.legacy);
    const raw=serializeSession(s);assert(!continueCivilization(s,id)&&serializeSession(s)===raw);
    s=parseSession(raw);assert(!continueCivilization(s,id)&&serializeSession(s)===raw);
    s.game.status='lost';assert(getVictorySupplies(s.game).gold===0);
    s.game.status='won';s.game.experience.player=9999;assert(getVictorySupplies(s.game).experience===0);
    s.game.ages.enemy=5;assert(getVictorySupplies(s.game).gold===0);
  });
  test.browser('Roster browser: future super soldier stays hidden and keyboard 4 cannot recruit before the plan',async()=>{
    const s=createProgression();s.game.ai.enabled=false;s.game.gold.player=200000;ageTo(s.game,5);
    const frame=await mountFixture(serializeSession(s));
    try {
      const doc=frame.contentDocument,card=doc.querySelector('[data-unit-slot="3"]');
      assert(card.hidden&&doc.getElementById('help-unit-3').hidden);
      doc.body.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown',{code:'Digit4',bubbles:true,cancelable:true}));
      assert(doc.getElementById('queue-count').textContent==='0 / 5');
    } finally {frame.remove();}
  });
  test('Legacy economy: reward ranks cost four times as much for half the growth, and depth carries the exponent',()=>{
    const s=productionSession();finish(s);
    const config=TALENTS.conservation;assert(config.costs.length===4&&config.costs.join()==='1,4,16,64');
    // Two ranks are already owned by the production session; buy the rest.
    while(s.permanent.talents.conservation<config.costs.length) {
      const level=s.permanent.talents.conservation,before=s.permanent.legacy;
      assert(purchaseTalent(s,'conservation')&&s.permanent.legacy===before-config.costs[level]);
    }
    assert(!purchaseTalent(s,'conservation')&&getTalentState(s,'conservation')==='max');
    assert(getLegacyReward(s.permanent.talents)===16&&getLegacyReward(s.permanent.talents,5)===512);
    assert(getLegacyReward(emptyTalents(),1)===2&&getLegacyReward(emptyTalents(),3)===8);
    const earned=s.run.earnedLegacy;assert(earned===4);rebuildCivilization(s,s.run.runId);finish(s);
    assert(s.run.earnedLegacy===16&&!resolveBattle(s));parseSession(serializeSession(s));
    assert(stat(createGame(),{kind:'civilization'},'legacy')===1);
  });
  test('Legacy machine: production is capped by its run and is only banked by a finale, so stalling or losing earns nothing',()=>{
    let s=productionSession();const production=getLegacyProduction(s.run.talents,s.game),cap=production.cap;
    assert(cap===2&&production.seconds===LEGACY_ECONOMY.fillSeconds&&production.share===LEGACY_ECONOMY.machineShares[0]);
    const balance=s.permanent.legacy;advance(s,production.seconds/2);
    assert(s.run.machineLegacy===1&&s.permanent.legacy===balance);
    const raw=serializeSession(s);s=parseSession(raw);assert(serializeSession(s)===raw);
    advance(s,600,{paused:true});advance(s,600,{hidden:true});assert(serializeSession(s)===raw);
    advance(s,production.seconds/2);assert(s.run.machineLegacy===cap&&s.permanent.legacy===balance,'Pending production stays with the run');
    // The cap is reached; a stalled battle now accrues nothing at all.
    advance(s,3000);assert(s.run.machineLegacy===cap&&s.permanent.legacyMachine.produced===0);
    finish(s,1);assert(continueCivilization(s,s.run.battleId));s.game.ai.enabled=false;advance(s,15);
    assert(s.run.machineLegacy===cap,'Continuing a conflict keeps the same run cap');
    finish(s);assert(s.permanent.legacyMachine.produced===cap&&s.permanent.legacy===balance+s.run.earnedLegacy+cap);
    // A lost civilization banks neither its finale nor its production.
    rebuildCivilization(s,s.run.runId);s.game.ai.enabled=false;advance(s,600);
    const banked=s.permanent.legacyMachine.produced,wallet=s.permanent.legacy;
    assert(s.run.machineLegacy===cap);s.game.status='lost';s.game.bases.player.hp=0;resolveBattle(s);
    assert(s.permanent.legacyMachine.produced===banked&&s.permanent.legacy===wallet);
    const lost=serializeSession(s);advance(s,60);assert(serializeSession(s)===lost);
  });
  test('Legacy machine: midpoint gate, capacity share and efficiency speed apply from the next run',()=>{
    const locked=createProgression();finish(locked);assert(getTalentState(locked,'legacyMachine')==='prerequisite');
    const s=productionSession();advance(s,60);finish(s);
    assert(purchaseTalent(s,'legacyCapacity')&&purchaseTalent(s,'legacyEfficiency'));
    assert(getLegacyProduction(s.run.talents,s.game).share===LEGACY_ECONOMY.machineShares[0]&&getLegacyProduction(s.permanent.talents).share===LEGACY_ECONOMY.machineShares[1]);
    rebuildCivilization(s,s.run.runId);s.game.ai.enabled=false;
    const production=getLegacyProduction(s.run.talents,s.game);
    assert(production.share===LEGACY_ECONOMY.machineShares[1]&&production.seconds===LEGACY_ECONOMY.fillSeconds/2&&production.cap===4);
    const balance=s.permanent.legacy;advance(s,production.seconds);assert(s.run.machineLegacy===4&&s.permanent.legacy===balance);
    finish(s);assert(s.permanent.legacy===balance+s.run.earnedLegacy+4);
    assert(parseSession(serializeSession(s)));
  });
  test('Legacy v10: every captured v9 phase retains wallet, old rewards, purchases and battle state until a new run',()=>{
    for(const [phase,old] of Object.entries(v9Records)) {
      let s=parseSession(JSON.stringify(old));assert(s.version===SAVE_VERSION&&s.run.phase===phase&&s.run.legacyRules===9);
      assert(Q.eq(s.permanent.totalLegacy,old.permanent.totalLegacy)&&Q.eq(s.run.earnedLegacy,old.run.earnedLegacy));
      assert(s.permanent.legacyMachine.progress===0&&s.permanent.legacyMachine.produced===0);
      assert(stat(s.game,{kind:'civilization'},'legacy')===4&&getLegacyReward(s.permanent.talents)===4);
      const raw=serializeSession(s);s=parseSession(raw);assert(serializeSession(s)===raw&&!resolveBattle(s));
      if(phase==='destruction') {
        const balance=s.permanent.legacy;assert(rebuildCivilization(s,s.run.runId));
        assert(s.run.legacyRules===LEGACY_ECONOMY.rules&&s.permanent.legacy===balance&&stat(s.game,{kind:'civilization'},'legacy')===4);
      }
    }
  });
  test('Legacy v10: large rewards and production use quantity arithmetic; invalid producer records are rejected',()=>{
    const s=productionSession();s.permanent.legacyMachine.produced=Q.of('1e400');
    s.permanent.totalLegacy=Q.add(s.permanent.totalLegacy,s.permanent.legacyMachine.produced);
    s.permanent.legacy=Q.add(s.permanent.legacy,s.permanent.legacyMachine.produced);
    const raw=serializeSession(s),restored=parseSession(raw);assert(serializeSession(restored)===raw);
    finish(restored);assert(purchaseTalent(restored,'conservation'));rebuildCivilization(restored,restored.run.runId);parseSession(serializeSession(restored));
    assert(buildCivilizationViewModel(restored)['#legacy-balance'].includes('e+400'));
    for(const patch of [r=>r.permanent.legacyMachine.progress=1,r=>r.permanent.legacyMachine.progress=-.1,r=>r.permanent.legacyMachine.produced='-1',r=>delete r.permanent.legacyMachine,r=>r.run.legacyRules=13]) {
      const bad=JSON.parse(raw);patch(bad);let threw=false;try{parseSession(JSON.stringify(bad));}catch{threw=true;}assert(threw);
    }
  });
  test('Legacy quantities: production and a terminal reward beyond Number range settle and save through the shared attribute stack',()=>{
    const s=productionSession();
    s.run.extraBonuses=[{target:{stat:'legacy',kind:'civilization'},type:'multiply',value:Q.of('1e400'),source:{id:'large-economy',kind:'depth',label:'大数检验'}}];
    s.game.bonuses=getRunBonuses(s.run);
    const production=getLegacyProduction(s.run.talents,s.game),reward=stat(s.game,{kind:'civilization'},'legacy');
    assert(Q.eq(reward,Q.of('4e400'))&&Q.eq(production.cap,Q.mul(reward,LEGACY_ECONOMY.machineShares[0])));
    // Cap and reward both come from the same settled attribute pipeline. At this
    // magnitude the fill lands within a rounding step of the cap, never past it.
    advance(s,production.seconds);
    assert(Q.lte(s.run.machineLegacy,production.cap)&&Q.gte(s.run.machineLegacy,Q.mul(production.cap,.999)));
    advance(s,production.seconds);assert(Q.eq(s.run.machineLegacy,production.cap),'The run cap holds exactly at any magnitude');
    finish(s);assert(Q.eq(s.run.earnedLegacy,reward)&&Q.eq(s.permanent.legacyMachine.produced,s.run.machineLegacy));
    const raw=serializeSession(s);assert(serializeSession(parseSession(raw))===raw&&!resolveBattle(s));
  });
  test('Legacy machine simulator: actual simulated battle reports production separately from finale rewards',()=>{
    const talents={spark:1,conservation:2,openingStone:1,shieldWall:1,parry:1,legacyMachine:1,legacyCapacity:3,legacyEfficiency:3,
      logistics:1,formation:1,evolution:1,defense:1,production:3,warfare:2};
    const automation={enabled:true,mode:'balanced',weights:[1,1,3],queueLimit:2,evolve:true,defense:true,maxTurrets:2};
    const won=simulateRun({talents,completedCycles:10,automation});
    // A finished civilization pays its settlement; production is capped by it.
    assert(won.outcome==='won'&&won.settlementLegacy===4&&won.producedLegacy===8&&won.legacy===12);
    const stalled=simulateRun({talents,completedCycles:10,maxSeconds:40,automation});
    assert(stalled.outcome==='timeout'&&stalled.settlementLegacy===0&&stalled.producedLegacy<won.producedLegacy);
  });
  test.browser('Legacy machine browser: HUD and star map show production; dialogs freeze it and progress survives saved refresh',async()=>{
    const s=productionSession();advance(s,30);
    let frame=await mountFixture(serializeSession(s));
    try {
      let doc=frame.contentDocument;
      assert(!doc.getElementById('legacy-production').hidden&&doc.getElementById('legacy-production').textContent==='+0.008/秒');
      doc.getElementById('archives').click();
      assert(doc.getElementById('legacy-machine-status').textContent.includes('上限 2'));
      doc.getElementById('node-legacyCapacity').click();assert(doc.getElementById('buy-legacyCapacity').disabled);
      const before=doc.getElementById('legacy-machine-status').textContent;
      for(let i=0;i<120;i++)frame.contentWindow.__testFrame(i*17);
      assert(doc.getElementById('legacy-machine-status').textContent===before);
      doc.getElementById('close-archives').click();doc.getElementById('save-menu').click();doc.getElementById('manual-save').click();
      const saved=frame.contentWindow.__storage.getItem('before-the-stars.incremental.v1');
      frame.remove();frame=await mountFixture(saved);doc=frame.contentDocument;
      assert(doc.getElementById('legacy-production').textContent==='+0.008/秒');
      doc.getElementById('archives').click();assert(doc.getElementById('legacy-machine-status').textContent.includes('上限 2'));
    } finally {frame.remove();}
  });

}

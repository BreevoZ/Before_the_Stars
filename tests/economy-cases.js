import { Q } from '../src/quantity.js';
import { createGame, evolve, AGES, recruit, RULES } from '../src/game.js';
import { createProgression, resolveBattle, continueCivilization, rebuildCivilization, updateProgression, abandonCivilization } from '../src/progression.js';
import { getVictorySupplies } from '../src/progression-config.js';
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
    const s=createProgression();s.game.ai.enabled=false;s.game.gold.player=10000;ageTo(s.game,5);
    const frame=await mountFixture(serializeSession(s));
    try {
      const doc=frame.contentDocument,card=doc.querySelector('[data-unit-slot="3"]');
      assert(card.hidden&&doc.getElementById('help-unit-3').hidden);
      doc.body.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown',{code:'Digit4',bubbles:true,cancelable:true}));
      assert(doc.getElementById('queue-count').textContent==='0 / 5');
    } finally {frame.remove();}
  });
}

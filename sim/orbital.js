import { Q } from '../src/quantity.js';
import { RULES } from '../src/game.js';
import { createOrbitalState, enterOrbital, updateOrbital, startOrbitalWar, purchaseOrbitalTalent, getInterventionState, intervene } from '../src/orbital-game.js';
// Headless observation uses real AI-vs-AI battles. Pairing / spending decisions
// are explicit test policies, never extra simulation income or time grants.
export function simulateOrbital({seed=1,legacy=0,maxSeconds=3600,buyTalents=true,interventions=false,targetCycles=4}={}){
  legacy=Q.of(legacy);if(!Number.isInteger(seed)||seed<0||seed>4294967295||Q.lt(legacy,0)||!Q.isInteger(legacy)||!Number.isFinite(maxSeconds)||maxSeconds<0||maxSeconds>86400||typeof buyTalents!=='boolean'||typeof interventions!=='boolean'||!Number.isInteger(targetCycles)||targetCycles<1||targetCycles>20)throw new Error('Invalid orbital simulation options');
  const session={run:{phase:'orbital'},permanent:{legacy,totalLegacy:legacy},orbital:createOrbitalState(seed)};enterOrbital(session);
  const milestones=[],nuclearTimes=[];let decision=0,cycles=0;
  while(session.orbital.elapsed<maxSeconds && session.orbital.nuclearCycles<targetCycles){
    const o=session.orbital;
    if(o.elapsed>=decision){decision=o.elapsed+1;
      const idle=o.civilizations.filter(c=>c.alive&&!c.warId).sort((a,b)=>a.age-b.age);for(let i=0;i+1<idle.length;i+=2)startOrbitalWar(session,idle[i].id,idle[i+1].id);
      if(buyTalents)for(const key of ['monitor','patronage','recovery','reseed','weaving','technology','regression','harvest','diversity','outpost','lunarIndustry','transit'])if(purchaseOrbitalTalent(session,key))milestones.push({talent:key,rank:o.talents[key],at:Math.round(o.elapsed)});
      if(interventions){const c=o.civilizations.find(c=>c.alive&&c.warId);if(c && c.age<5 && getInterventionState(session,c.id,'advance')==='ready')intervene(session,c.id,'advance');}
    }
    updateOrbital(session,RULES.fixedStep);
    if(o.nuclearCycles>cycles){cycles=o.nuclearCycles;nuclearTimes.push(Math.round(o.elapsed));}
  }
  if(buyTalents&&purchaseOrbitalTalent(session,'transit'))milestones.push({talent:'transit',rank:1,at:Math.round(session.orbital.elapsed)});
  return{completed:session.orbital.completionAt!==null,seconds:Math.round(session.orbital.elapsed),cycles:session.orbital.nuclearCycles,
    nuclearTimes,legacyEarned:Q.encode(session.orbital.legacyEarned),legacy:Q.encode(session.permanent.legacy),milestones,session};
}

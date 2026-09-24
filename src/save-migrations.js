import { createOldOrbitalState, oldOrbitalSpent } from './orbital-history.js';
import { createOrbitalState, enterOrbital } from './orbital-game.js';
import { ORBITAL_RULES } from './orbital-config.js';
import { createLegacyMachine } from './legacy-machine.js';
import { Q } from './quantity.js';
import { UNITS, TURRETS, getBaseHealth, projectileField } from './game.js';
import { SAVE_VERSION, SURFACE, LEGACY_ECONOMY, getChallengeModifiers } from './progression-config.js';
import { attributes } from './stats.js';
import { getV8RunBonuses } from './progression-bonuses.js';
import { createAutomation } from './automation.js';
import { HISTORICAL_TALENTS, HISTORICAL_UPGRADE_COSTS } from './save-history.js';
import { validateRecord } from './save-validation.js';
import { emptyIndustry, emptyFlights } from './solar-industry.js';
import { emptyWorld } from './colony-war.js';
import { emptyColonies, V26_SOLAR_KEYS, V28_SOLAR_KEYS } from './solar-colony.js';
import { cloneRecord, toV8Record, fromV8Record, fromV9Record, fromV10Record, fromV11Record, fromV12Record, fromV13Record, fromV14Record, fromV15Record, fromV16Record, fromV17Record, fromV18Record, fromV19Record, fromV20Record, fromV21Record, fromV22Record, fromV23Record, fromV24Record, fromV25Record, fromV26Record, fromV27Record, fromV28Record } from './save-record.js';
import { TALENTS } from './talents.js';
const teams = ['player', 'enemy'];

export function migrateV1(input) {
  const session = cloneRecord(input);
  // Validate the complete old record before introducing any defaults. Never
  // rerun settlement or starting-resource grants while upgrading a save.
  const auto = session.permanent.automation;
  session.permanent.automation = { ...createAutomation(2), unlocked: auto.unlocked, enabled: auto.enabled, target: auto.target };
  session.permanent.totalLegacy = session.permanent.completedCycles * SURFACE.legacyPerCycle;
  session.permanent.talents = Object.fromEntries(Object.keys(HISTORICAL_TALENTS[2]).map(key => [key, 0]));
  session.run.talents = { ...session.permanent.talents };
  session.run.autoTurn = 'recruit'; session.game.modifiers.bounty = 1;
  session.version = 2;
  return session;
}

export function migrateV2(input) {
  const session = cloneRecord(input);
  const p = session.permanent;
  // Preserve formerly free recruitment and budget controls without inventing
  // earned currency or retroactively charging the player's balance.
  p.talentGrants = p.automation.unlocked ? ['autobuyer', 'logistics'] : [];
  const retained = { autobuyer: Number(p.automation.unlocked), logistics: Number(p.automation.unlocked) };
  p.talents = { ...retained, ...p.talents };
  session.run.talents = { ...retained, ...session.run.talents };
  session.version = 3;
  return session;
}

export function migrateV3(input) {
  const session = cloneRecord(input);
  const p = session.permanent;
  // Old players could buy growth/legacy talents without Autobuyer. Preserve
  // these purchases and their balance by granting the newly required root.
  if (!p.talents.autobuyer && (Object.values(p.upgrades).some(level => level > 0) || Object.values(p.talents).some(level => level > 0))) {
    p.talents.autobuyer = session.run.talents.autobuyer = 1;
    p.talentGrants.push('autobuyer');
    p.automation.unlocked = true; // Remains off unless the player enables it.
  }
  session.version = 4;
  return session;
}

export function migrateV4(input) {
  const session = cloneRecord(input);
  session.permanent.talents.challenge = session.run.talents.challenge = 0;
  session.run.challengeLevel = 0;
  session.game.enemyModifiers = getChallengeModifiers(0);
  session.version = 5;
  return session;
}

export function migrateV5(input) {
  const session = cloneRecord(input);
  const g = session.game;
  g.bonuses = getV8RunBonuses(session.run);
  // v5 stored raw outgoing damage and multiplied it on impact. v6 snapshots
  // the resolved attack at launch; convert in-flight payloads exactly once.
  for (const shot of g.projectiles) {
    shot.damage *= shot.team === 'enemy' ? g.enemyModifiers.damage : 1;
    if (shot.turretType) shot.field = projectileField(attributes(g, { type: shot.turretType, team: shot.team }));
  }
  for (const field of g.fields) field.damage *= field.team === 'enemy' ? g.enemyModifiers.damage : 1;
  for (const team of teams) {
    for (const order of g.queues[team]) order.duration = UNITS[order.type].trainTime;
    for (const turret of g.turrets[team]) if (turret) turret.paid = TURRETS[turret.type].cost;
  }
  if (g.ability) g.ability.stats = { ...attributes(g, { kind: 'ability', type: g.ability.type, team: 'player' }) };
  delete g.modifiers; delete g.enemyModifiers;
  session.version = 6;
  return session;
}

export function migrateV6(input) {
  const session = cloneRecord(input);
  // Removing the old prototype HP ceiling preserves damage already taken.
  for (const team of teams) {
    const base = session.game.bases[team], maximum = getBaseHealth(session.game, team);
    if (Q.gt(base.hp, 0)) base.hp = Q.add(base.hp, Q.sub(maximum, base.maxHp));
    base.maxHp = maximum;
  }
  session.version = 7;
  return session;
}

export function migrateV7(input) { return toV8Record(input); }
export function migrateV8(input) {
  const session = fromV8Record(input), p = session.permanent;
  const ownedRoot = p.talents.autobuyer === 1;
  p.automationRetained = p.automation.unlocked;
  p.settings = { speed: 1 };
  // Remove the retired purchase, grant its replacement, and let the same
  // earned-currency ledger derive the refund. A formerly free root refunds 0.
  p.talentGrants = p.talentGrants.filter(key => key !== 'autobuyer');
  if (ownedRoot) p.talentGrants.push('spark');
  if (p.talents.elite) p.talentGrants.push('superSoldierPlan');
  for (const state of [p, session.run]) {
    const old = state.talents;
    state.talents = Object.fromEntries(Object.keys(HISTORICAL_TALENTS[9]).map(key => [key, old[key] ?? 0]));
    state.talents.spark = Number(old.autobuyer === 1);
    // Preserve a purchased elite recruiter without charging for its new gate.
    if (old.elite) state.talents.superSoldierPlan = 1;
  }
  session.version = 9;
  return { ...toV8Record(session), version: 9 };
}
export function migrateV9(input) {
  const session = fromV9Record(input);
  session.permanent.legacyMachine = createLegacyMachine();
  for (const state of [session.permanent, session.run]) state.talents = { ...Object.fromEntries(Object.keys(HISTORICAL_TALENTS[10]).map(key => [key, 0])), ...state.talents };
  // Finish the existing run under its original reward contract, including an
  // already-settled finale. The next fresh run uses exponential rewards.
  session.run.legacyRules = 9;
  session.version = 10;
  return { ...toV8Record(session), version: 10 };
}
export function migrateV10(input) {
  const session = fromV10Record(input), p = session.permanent;
  const configs = { ...HISTORICAL_TALENTS[10], production: { costs: HISTORICAL_UPGRADE_COSTS }, warfare: { costs: HISTORICAL_UPGRADE_COSTS } };
  p.purchaseCosts = Object.fromEntries(Object.entries(configs).filter(([key]) => (p.talents[key] ?? p.upgrades[key]) > 0)
    .map(([key, config]) => [key, config.costs.slice(0, p.talents[key] ?? p.upgrades[key]).map(cost => p.talentGrants.includes(key) ? 0 : cost)]));
  session.version = 11;
  return { ...toV8Record(session), version: 11 };
}
// v12 retires the doubling reward branches. Ranks that no longer exist are
// refunded through the ledger itself: dropping a payment restores its Legacy.
export function migrateV11(input) {
  const session = fromV11Record(input), p = session.permanent;
  const keep = { conservation: HISTORICAL_TALENTS[12].conservation.costs.length, legacyCapacity: HISTORICAL_TALENTS[12].legacyCapacity.costs.length,
    legacyEfficiency: HISTORICAL_TALENTS[12].legacyEfficiency.costs.length, continuity: 0 };
  // Only the permanent tree is retired. The active run keeps the exact snapshot
  // and reward contract it started under, settled finale included.
  p.talents = Object.fromEntries(Object.keys(HISTORICAL_TALENTS[12]).map(key =>
    [key, Math.min(p.talents[key] ?? 0, keep[key] ?? Infinity)]));
  for (const [key, ranks] of Object.entries(keep)) {
    if (!p.purchaseCosts[key]) continue;
    if (ranks) p.purchaseCosts[key] = p.purchaseCosts[key].slice(0, ranks);
    else delete p.purchaseCosts[key];
  }
  p.talentGrants = p.talentGrants.filter(key => Object.hasOwn(TALENTS, key));
  // Depth has to be re-proven; an already launched civilization keeps its gate.
  p.deepestChallenge = p.talents.bypasser ? LEGACY_ECONOMY.bypasserChallenge : session.run.settled ? session.run.challengeLevel : 0;
  session.run.machineLegacy = 0;
  session.version = 12;
  return { ...toV8Record(session), version: 12 };
}
// v13 doubles the reward per rank and pays a first-clear bonus. The active run
// keeps its own rules, so it never gains a bonus it did not start with.
export function migrateV12(input) {
  const session = fromV12Record(input);
  session.run.firstClear = false;
  session.version = 13;
  return { ...toV8Record(session), version: 13 };
}
export function migrateV13(input) {
  const session = fromV13Record(input);
  session.permanent.automation.ability = false;
  session.permanent.automation.campaign = false;
  for (const state of [session.permanent, session.run]) {
    // Historical active contracts retain their own tree until the next rebuild.
    if (state === session.run && state.legacyRules < LEGACY_ECONOMY.rules) continue;
    for (const key of ['fireControl', 'campaign', 'extermination']) state.talents[key] = 0;
  }
  session.version = 14;
  return { ...toV8Record(session), version: 14 };
}
export function migrateV14(input) {
  const record = cloneRecord(input);
  if (record.run.phase === 'orbital') record.orbital = createOldOrbitalState();
  record.version = 15;
  return record;
}
// Retired construction payments are refunded by removing those expenditures
// from the same ledger. Earned Legacy and surface settlement stay untouched.
export function migrateV15(input) {
  const record=cloneRecord(input);
  if(record.orbital) {
    const old=record.orbital;const refunded=oldOrbitalSpent(old);
    let seed=2166136261;for(const char of record.run.runId)seed=Math.imul(seed^char.charCodeAt(0),16777619)>>>0;
    record.orbital=createOrbitalState(seed);record.orbital.version=2;delete record.orbital.talents.lunarIndustry;delete record.orbital.lunarProduced;delete record.orbital.lunarFraction;record.orbital.legacyEarned=old.legacyEarned;
    if(old.started)enterOrbital(record);
    // Talents added by later versions are introduced by their own migrations.
    for(const key of ['doctrines','superSoldiers','sniper','massDriver','shipyard','voyage','tendency','nuclearResearch','chain','doomsday','bonds','airdrop','intel','ceasefire','overview','quickening','chronicle','directed','fallout'])delete record.orbital.talents[key];
    delete record.orbital.seedTendency;delete record.orbital.solar;
    for(const c of record.orbital.civilizations){delete c.doctrine;delete c.superSoldiers;delete c.tendency;delete c.airdrops;}
    record.orbital.log.push({time:0,text:`轨道重构：旧设施与在建费用 ${Q.format(refunded)} Legacy 已退回余额，已获得的遗产保留。`});
  }
  record.version=16;return record;
}
export function migrateV16(input) {
  const record=cloneRecord(input);
  if(record.orbital){record.orbital.version=3;record.orbital.talents.lunarIndustry=0;record.orbital.lunarProduced=0;record.orbital.lunarFraction=0;}
  record.version=17;return record;
}
export function migrateV17(input) {
  const record=cloneRecord(input);
  if(record.orbital){
    record.orbital.version=4;
    for(const key of ['doctrines','superSoldiers','sniper'])record.orbital.talents[key]=0;
    for(const c of record.orbital.civilizations){c.doctrine=0;c.superSoldiers=0;}
  }
  record.version=18;return record;
}
// v19 moves 地月航线 before the outpost and ends VI with 远航协议. Owners of
// an outpost receive the route free; a former VI completion is reopened.
export function migrateV18(input) {
  const record=cloneRecord(input);
  if(record.orbital){
    const o=record.orbital;o.version=5;
    for(const key of ['massDriver','shipyard','voyage'])o.talents[key]=0;
    if(o.talents.outpost&&!o.talents.transit){o.talents.transit=1;o.payments.transit=['0'];}
    if(o.completionAt!==null){
      o.completionAt=null;o.log.push({time:o.elapsed,text:'轨道重构：地月航线改为月球开发的前置，VI 的终点改为远航协议。'});
      while(o.log.length>ORBITAL_RULES.historyLimit)o.log.shift();
    }
  }
  record.version=19;return record;
}
// v20 adds the cycle and war-bond talents and civilization tendencies. Every
// living civilization keeps fighting as it did; only later seeds draw one.
export function migrateV19(input) {
  const record=cloneRecord(input);
  if(record.orbital){
    const o=record.orbital;o.version=6;
    for(const key of ['tendency','nuclearResearch','chain','doomsday','bonds'])o.talents[key]=0;
    for(const c of o.civilizations)c.tendency=0;
  }
  record.version=20;return record;
}
// v21 adds 资源空投, 情报网络 and 停火协议. No civilization has been supplied
// and no war is frozen; 军备扶持 simply costs more from now on.
export function migrateV20(input) {
  const record=cloneRecord(input);
  if(record.orbital){
    const o=record.orbital;o.version=7;
    for(const key of ['airdrop','intel','ceasefire'])o.talents[key]=0;
    for(const c of o.civilizations)c.airdrops=0;
    for(const w of o.wars)w.ceasefire=0;
  }
  record.version=21;return record;
}
// v22 adds 全域监视 and moves 轨道收割 under 知识封锁. A harvester without the
// lock receives it free, as v19 did for the moon route; nothing is repriced.
export function migrateV21(input) {
  const record=cloneRecord(input);
  if(record.orbital){
    const o=record.orbital;o.version=8;o.talents.overview=0;
    if(o.talents.harvest&&!o.talents.regression){o.talents.regression=1;o.payments.regression=['0'];}
  }
  record.version=22;return record;
}
// v23 adds 加速萌芽, 轮回记忆, 定向播种 and 余烬观测; seeds stay random.
export function migrateV22(input) {
  const record=cloneRecord(input);
  if(record.orbital){const o=record.orbital;o.version=9;for(const key of ['quickening','chronicle','directed','fallout'])o.talents[key]=0;o.seedTendency=0;}
  record.version=23;return record;
}
// A previously completed shipyard remains a completed fleet. Preserve its
// original payment, append six explicit grants, and never touch the wallet.
export function migrateV23(input) {
  const record=cloneRecord(input);
  if(record.orbital){const o=record.orbital;o.version=10;
    if(o.talents.shipyard){o.talents.shipyard=ORBITAL_RULES.arkCount;o.payments.shipyard=[...o.payments.shipyard,...Array(ORBITAL_RULES.arkCount-1).fill(0)];}
  }
  record.version=24;return record;
}
// v25 adds planetary industry (VII step 2). Nothing is built yet; the arks
// already launched keep flying from the original 远航协议 time.
export function migrateV24(input) {
  const record=cloneRecord(input);
  if(record.orbital){record.orbital.version=11;record.orbital.solar=emptyIndustry();}
  record.version=25;return record;
}
// v26 adds VII colonies: the tree's own talents, the Mars dome and arks in flight.
export function migrateV25(input) {
  const record=cloneRecord(input);
  if(record.orbital){record.orbital.version=12;Object.assign(record.orbital.solar,emptyColonies(V26_SOLAR_KEYS),{colonies:{mars:[]}});}
  record.version=26;return record;
}
// v27: arks leave from drydocks. The pioneer fleet now flies only to Mars; new
// ark and drydock talents start unowned, footholds already built stay built.
export function migrateV26(input) {
  const record=cloneRecord(input);
  if(record.orbital){record.orbital.version=13;const sol=record.orbital.solar;
    sol.talents=Object.fromEntries(V28_SOLAR_KEYS.map(key=>[key,sol.talents[key]??0]));Object.assign(sol,emptyFlights());}
  record.version=27;return record;
}
// v28: colony worlds. The Mars residents keep their age and start at peace;
// the planet is living, with no wars and no winter behind it.
export function migrateV27(input) {
  const record=cloneRecord(input);
  if(record.orbital){record.orbital.version=14;const sol=record.orbital.solar;
    const {uplifted,...world}=emptyWorld();sol.colonies={mars:{...world,civs:sol.colonies.mars.map(c=>({...c,progress:0,warId:null}))}};}
  record.version=28;return record;
}
// v29: uplift. 殖民地存续协议 becomes a real talent; residents are not
// negotiating, no war is seized, and nobody has been uplifted yet.
export function migrateV28(input) {
  const record=cloneRecord(input);
  if(record.orbital){record.orbital.version=15;const sol=record.orbital.solar,mars=sol.colonies.mars;sol.talents.uplift=0;
    sol.colonies={mars:{...mars,uplifted:[],civs:mars.civs.map(c=>({...c,accord:null})),wars:mars.wars.map(w=>({...w,seized:false}))}};}
  record.version=29;return record;
}
export const MIGRATIONS = Object.freeze({ 1: migrateV1, 2: migrateV2, 3: migrateV3, 4: migrateV4, 5: migrateV5, 6: migrateV6, 7: migrateV7, 8: migrateV8, 9: migrateV9, 10: migrateV10, 11: migrateV11, 12: migrateV12, 13: migrateV13, 14: migrateV14, 15: migrateV15, 16: migrateV16, 17: migrateV17, 18: migrateV18, 19: migrateV19, 20: migrateV20, 21: migrateV21, 22: migrateV22, 23: migrateV23, 24: migrateV24, 25: migrateV25, 26: migrateV26, 27: migrateV27, 28: migrateV28 });
export function migrateRecord(input) {
  let record = input;
  while (record.version < SAVE_VERSION) {
    const hydrate = { 8: fromV8Record, 9: fromV9Record, 10: fromV10Record, 11: fromV11Record, 12: fromV12Record, 13: fromV13Record, 14: fromV14Record, 15: fromV15Record, 16: fromV16Record, 17: fromV17Record, 18: fromV18Record, 19: fromV19Record, 20: fromV20Record, 21: fromV21Record, 22: fromV22Record, 23: fromV23Record, 24: fromV24Record, 25: fromV25Record, 26: fromV26Record, 27: fromV27Record, 28: fromV28Record }[record.version];
    validateRecord(hydrate ? hydrate(record) : record, record.version);
    record = MIGRATIONS[record.version](record);
  }
  return record;
}

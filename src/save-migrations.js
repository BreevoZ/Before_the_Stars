import { createLegacyMachine } from './legacy-machine.js';
import { Q } from './quantity.js';
import { UNITS, TURRETS, getBaseHealth, projectileField } from './game.js';
import { SAVE_VERSION, SURFACE, getChallengeModifiers } from './progression-config.js';
import { attributes } from './stats.js';
import { getV8RunBonuses } from './progression-bonuses.js';
import { createAutomation } from './automation.js';
import { HISTORICAL_TALENTS, HISTORICAL_UPGRADE_COSTS } from './save-history.js';
import { validateRecord } from './save-validation.js';
import { cloneRecord, toV8Record, fromV8Record, fromV9Record, fromV10Record } from './save-record.js';
import { emptyTalents } from './talents.js';
const teams = ['player', 'enemy'];

export function migrateV1(input) {
  const session = cloneRecord(input);
  // Validate the complete old record before introducing any defaults. Never
  // rerun settlement or starting-resource grants while upgrading a save.
  const auto = session.permanent.automation;
  session.permanent.automation = { ...createAutomation(), unlocked: auto.unlocked, enabled: auto.enabled, target: auto.target };
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
  for (const state of [session.permanent, session.run]) state.talents = { ...emptyTalents(), ...state.talents };
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
export const MIGRATIONS = Object.freeze({ 1: migrateV1, 2: migrateV2, 3: migrateV3, 4: migrateV4, 5: migrateV5, 6: migrateV6, 7: migrateV7, 8: migrateV8, 9: migrateV9, 10: migrateV10 });
export function migrateRecord(input) {
  let record = input;
  while (record.version < SAVE_VERSION) {
    validateRecord(record.version === 8 ? fromV8Record(record) : record.version === 9 ? fromV9Record(record) : record.version === 10 ? fromV10Record(record) : record, record.version);
    record = MIGRATIONS[record.version](record);
  }
  return record;
}

import { oldOrbitalSpent } from './orbital-history.js';
import { validateBattle } from './save-battle.js';
import { validateOrbital } from './orbital-save.js';
import { orbitalLegacySpent } from './orbital-game.js';
import { Q } from './quantity.js';
import { SAVE_VERSION, SURFACE, UPGRADE_COSTS, LEGACY_ECONOMY, AUTOMATION_TARGETS, AUTOMATION_INTERVAL, CHALLENGE, getChallengeModifiers, getBonuses, automationUnlocked, availableSpeeds } from './progression-config.js';
import { DEBUG_SPEEDS } from './debug.js';
import { TALENTS, getTalentBonuses, getLegacyReward, meetsTalentRequirements } from './talents.js';
import { stat, createBonusStack, legacyBonuses } from './stats.js';
import { getRunBonuses, getV8RunBonuses, getV9RunBonuses } from './progression-bonuses.js';
import { validAutomation } from './automation.js';
import { getRunProduction } from './legacy-machine.js';

import { check, object, num, int, bool, id, list, safeTree, limit } from './save-primitives.js';
import { HISTORICAL_TALENTS, HISTORICAL_UPGRADE_COSTS } from './save-history.js';
import { validateShape, SESSION_SHAPE, RUN_SHAPE, GAME_SHAPE } from './save-schema.js';
import { phaseMatchesResult, isCivilizationVictory } from './progression-machine.js';
import { paidLegacy } from './legacy-ledger.js';

function levels(value, costs) {
  check(object(value) && Object.keys(value).length === 2, '升级等级');
  for (const key of ['production', 'warfare']) check(int(value[key], 0, costs.length), key);
}
function talentLevels(value, upgrades, configs = TALENTS, grants = []) {
  check(object(value) && Object.keys(value).length === Object.keys(configs).length, '天赋等级');
  for (const [key, config] of Object.entries(configs)) {
    check(int(value[key], 0, config.costs.length), `天赋 ${key}`);
    if ((configs === TALENTS || config.requiresLayer) && value[key] && !grants.includes(key)) check(meetsTalentRequirements({ ...value, ...upgrades }, config), '时代层前置条件');
    if (value[key] && !grants.includes(key)) for (const [parent, required] of Object.entries(config.requires)) {
      check((value[parent] ?? upgrades[parent]) >= required, '天赋前置条件');
    }
  }
}
export function validateRecord(session, version = SAVE_VERSION) {
  const oldVersion = version === 1, previousVersion = version < 3;
  const amount = (value, min = 0, max = version < 7 ? limit : undefined) => version < 7 ? num(value, min, max)
    : Q.valid(value) && Q.gte(value, min) && (max === undefined || Q.lte(value, max));
  const wholeAmount = value => amount(value) && Q.isInteger(value);
  const configs = HISTORICAL_TALENTS[version] ?? TALENTS;
  validateShape(session, SESSION_SHAPE, 'session');
  validateShape(session.run, RUN_SHAPE, 'run');
  validateShape(session.game, GAME_SHAPE, 'game');
  check(session.version === version, '不支持的存档版本');
  check(session.debug === undefined || session.debug === true, '调试标记');
  check(session.debug === true ? DEBUG_SPEEDS.includes(session.debugSpeed) : session.debugSpeed === undefined, '调试速度');
  safeTree(session);
  const { permanent: p, run, game: g } = session;
  check(object(p) && object(run) && object(g), '缺少永久、文明或战斗状态');
  check(int(p.completedCycles) && (version < 10 ? int(p.legacy) : wholeAmount(p.legacy)), '遗产或循环数');
  const upgradeCosts = version < 11 ? HISTORICAL_UPGRADE_COSTS : UPGRADE_COSTS;
  levels(p.upgrades, upgradeCosts); levels(run.upgrades, upgradeCosts);
  const runConfigs = version < 12 ? configs
    : (run.legacyRules ?? 0) >= LEGACY_ECONOMY.rules ? configs : HISTORICAL_TALENTS[(run.legacyRules ?? 0) >= 11 ? 12 : 11];
  if (!oldVersion) { talentLevels(p.talents, p.upgrades, configs, version >= 9 ? p.talentGrants : []); talentLevels(run.talents, run.upgrades, runConfigs, version >= 9 ? p.talentGrants : []); }
  const challengeLevel = version >= 5 ? run.challengeLevel : 0;
  check(int(challengeLevel, 0, CHALLENGE.maxLevel), '挑战难度');
  check(!challengeLevel || (run.talents.challenge === 1 && p.completedCycles >= challengeLevel), '挑战未解锁');
  if (version >= 4) for (const state of [p, run]) {
    check(!Object.values(state.upgrades).some(level => level > 0) || state.talents[version < 9 ? 'autobuyer' : 'spark'] === 1, '档案需要根天赋');
  }
  if (version >= 6) {
    check(g.mode === 'incremental' && Array.isArray(g.bonuses) && !g.modifiers && !g.enemyModifiers, '属性管线');
    check(run.extraBonuses === undefined || Array.isArray(run.extraBonuses), '额外属性来源');
    createBonusStack(run.extraBonuses ?? []);
    if (version < 7) for (const effect of [...g.bonuses, ...(run.extraBonuses ?? [])]) {
      check(typeof effect.value === 'boolean' || num(effect.value, -1e9, 1e9), '旧版属性值');
    }
    check(JSON.stringify(createBonusStack(g.bonuses)) === JSON.stringify((version < 9 ? getV8RunBonuses : version === 9 ? getV9RunBonuses : getRunBonuses)(run)), '属性栈与本轮来源不一致');
  }
  const combat = version >= 6 ? g : { ...g, bonuses: legacyBonuses(g.modifiers, g.enemyModifiers) };
  const totalLegacy = oldVersion ? p.completedCycles * SURFACE.legacyPerCycle : p.totalLegacy;
  // Past runs may have had different depth/milestone sources. Validate the
  // ledger and schema bounds, not the current run's possible reward ceiling.
  const maxReward = version >= 6 ? 1e9 : oldVersion ? SURFACE.legacyPerCycle : getLegacyReward({ conservation: 3, continuity: 2 }, version >= 5 ? CHALLENGE.maxLevel : 0, 9);
  if (version < 10) check(int(totalLegacy, version >= 6 ? 0 : p.completedCycles * SURFACE.legacyPerCycle, Math.min(limit, p.completedCycles * maxReward)), '累计遗产');
  else {
    check(wholeAmount(totalLegacy), '累计遗产');
    const machine = p.legacyMachine;
    check(object(machine) && Object.keys(machine).length === 2 && num(machine.progress, 0, 1) && machine.progress < 1 && wholeAmount(machine.produced) && Q.lte(machine.produced, totalLegacy), '遗产生产记录');
    check(p.talents.legacyMachine || (machine.progress === 0 && Q.eq(machine.produced, 0)), '遗产生产机未解锁');
    check(p.completedCycles > 0 || Q.eq(totalLegacy, 0), '首次通关前的遗产');
    check(version >= 12 ? [9, 10, 11, LEGACY_ECONOMY.rules].includes(run.legacyRules) : [9, 10].includes(run.legacyRules), '遗产规则版本');
    check(run.legacyRules !== 9 || (!run.talents.legacyMachine && run.talents.conservation <= 3 && (run.talents.continuity ?? 0) <= 2), '旧轮遗产快照');
  }
  if (version >= 13) check(bool(run.firstClear) && (run.firstClear !== true || run.legacyRules >= LEGACY_ECONOMY.rules), '首通标记');
  if (version >= 12) {
    check(int(p.deepestChallenge, 0, CHALLENGE.maxLevel) && p.deepestChallenge <= p.completedCycles, '远征深度记录');
    check(!p.talents.bypasser || p.deepestChallenge >= LEGACY_ECONOMY.bypasserChallenge, '存续协议深度');
    // Production is capped by the run it belongs to, so a stalled battle can
    // never persist more Legacy than its own settlement would have paid.
    // Pending production belongs to the run until its finale banks it.
    // Production is capped by the deepest ember the player has actually cleared.
    const cap = getRunProduction({ run, permanent: p, game: g }).cap;
    check(wholeAmount(run.machineLegacy) && Q.lte(run.machineLegacy, cap), '本轮生产上限');
    check(Q.lte(run.machineLegacy, p.legacyMachine.produced), '生产入账');
  }
  if (!previousVersion) {
    list(p.talentGrants, version < 9 ? 2 : 3, '旧版功能保留');
    check(new Set(p.talentGrants).size === p.talentGrants.length && p.talentGrants.every(key =>
      (version < 9 ? ['autobuyer', 'logistics'] : ['spark', 'logistics', 'superSoldierPlan']).includes(key) && p.talents[key] === 1 && p.completedCycles > 0), '旧版功能保留');
  }
  if (version >= 11) {
    const ledger = p.purchaseCosts, levels = { ...p.talents, ...p.upgrades };
    check(object(ledger) && Object.keys(ledger).every(key => Object.hasOwn(levels, key)), '购买账本字段');
    for (const [key, level] of Object.entries(levels)) {
      const payments = ledger[key] ?? [], current = TALENTS[key]?.costs ?? UPGRADE_COSTS;
      const prices = [current, ...[10, 11, 12, 13].map(old => HISTORICAL_TALENTS[old][key]?.costs ?? (Object.hasOwn(p.upgrades, key) ? HISTORICAL_UPGRADE_COSTS : []))];
      check(Array.isArray(payments) && payments.length === level, '购买账本等级');
      for (const [rank, cost] of payments.entries()) check(wholeAmount(cost) && (p.talentGrants.includes(key)
        ? Q.eq(cost, 0) : prices.some(list => list[rank] !== undefined && Q.eq(cost, list[rank]))
          // From v21 the protocol takes the whole balance, never less than its floor.
          || key === 'bypasser' && version >= 21 && Q.gte(cost, TALENTS.bypasser.costs[0])), '购买账本价格');
    }
  }
  validateOrbital(session, version);
  const spent = version >= 11 ? paidLegacy(p) : Object.values(p.upgrades).reduce((sum, level) => sum + upgradeCosts.slice(0, level).reduce((a, b) => a + b, 0), 0)
    + (oldVersion ? 0 : Object.entries(configs).reduce((sum, [key, config]) => sum +
      (!previousVersion && p.talentGrants.includes(key) ? 0 : config.costs.slice(0, p.talents[key]).reduce((a, b) => a + b, 0)), 0));
  const adjustment = p.debugLegacyAdjustment ?? 0;
  check(p.debugLegacyAdjustment === undefined || (version >= 14 && session.debug === true && Q.valid(adjustment) && Q.isInteger(adjustment)), '调试遗产账目');
  check(Q.eq(Q.sum([p.legacy, spent, version === 15 ? oldOrbitalSpent(session.orbital) : version >= 16 ? orbitalLegacySpent(session.orbital) : 0]), Q.add(totalLegacy, adjustment)), '遗产收支不一致');
  const auto = p.automation;
  check(object(auto) && bool(auto.unlocked) && bool(auto.enabled) && AUTOMATION_TARGETS.includes(auto.target), '自动招募设置');
  check(auto.unlocked === (previousVersion ? p.completedCycles > 0 : version < 9 ? p.talents.autobuyer > 0 : automationUnlocked(p)) && (auto.unlocked || !auto.enabled), '自动招募解锁');
  if (!oldVersion) check(validAutomation(auto, p.talents, previousVersion, version), '自动购买设置或解锁条件');
  if (version >= 9) {
    check(object(p.settings) && availableSpeeds(p).includes(p.settings.speed), '游戏速度设置');
    check(bool(p.automationRetained) && (!p.automationRetained || p.talentGrants.includes('spark')), '自动招募保留标记');
  }
  if (version < 7) check(num(auto.reserve ?? 0, 0, 1e9), '旧版预留金币');
  check(id(run.runId) && int(run.battleNumber, 1, SURFACE.finalEnemyAge) && run.battleId === `${run.runId}:${run.battleNumber}`, '文明或战斗标识');
  check(run.processedBattleId === null || (id(run.processedBattleId) && run.processedBattleId.startsWith(`${run.runId}:`)), '胜利处理标记');
  check(['battle', 'victory', 'destruction', 'defeat', ...(version >= 11 ? ['orbital'] : [])].includes(run.phase) && bool(run.settled), '流程阶段');
  if (version >= 11) check((run.phase === 'orbital') === (p.talents.bypasser === 1), '轨道启航凭据');
  const reward = version >= 6 ? stat(g, { kind: 'civilization' }, 'legacy') : oldVersion ? SURFACE.legacyPerCycle : getLegacyReward(run.talents, challengeLevel, 9);
  check(version < 10 ? int(run.earnedLegacy, 0, reward) : wholeAmount(run.earnedLegacy) && Q.lte(run.earnedLegacy, reward), '本轮遗产');
  check(run.autoElapsed < AUTOMATION_INTERVAL + 1e-8, '自动招募时钟');
  if (!oldVersion) check(['recruit', 'defense'].includes(run.autoTurn), '自动购买调度');
  check(run.settled === ['destruction', 'orbital'].includes(run.phase) && Q.eq(run.earnedLegacy, run.settled ? reward : 0), '重复结算保护标记');
  check(!run.settled || p.completedCycles > 0, '已结算循环数');
  check(Q.lte(run.earnedLegacy, totalLegacy), '结算与累计遗产');
  for (const key of Object.keys(p.upgrades)) check(run.upgrades[key] <= p.upgrades[key], '本轮升级快照');
  if (run.phase === 'battle' || run.phase === 'victory') {
    check(run.upgrades.production === p.upgrades.production && run.upgrades.warfare === p.upgrades.warfare, '战斗中升级');
  }
  if (!oldVersion) for (const key of Object.keys(configs)) {
    check((run.talents[key] ?? 0) <= p.talents[key], '本轮天赋快照');
    if (['battle', 'victory'].includes(run.phase)) check((run.talents[key] ?? 0) === p.talents[key], '战斗中购买天赋');
  }
  if (version < 6) {
    check(g.mode === 'incremental' && object(g.modifiers), '战斗模式');
    const bonuses = getBonuses(run.upgrades);
    check(g.modifiers.income === bonuses.income && g.modifiers.experience === bonuses.experience, '本轮倍率');
    if (!oldVersion) check(g.modifiers.bounty === getTalentBonuses(run.talents).bounty, '本轮战利品倍率');
    if (version >= 5) {
      const expected = getChallengeModifiers(challengeLevel, run.legacyRules ?? 9);
      check(object(g.enemyModifiers) && Object.keys(g.enemyModifiers).length === Object.keys(expected).length &&
        Object.entries(expected).every(([key, value]) => g.enemyModifiers[key] === value), '敌军挑战倍率');
    }
  }
  check(phaseMatchesResult(run.phase, g.status), '流程与战斗结果不一致');
  check(run.phase === 'battle' ? run.processedBattleId !== run.battleId : run.processedBattleId === run.battleId, '战斗处理标记');
  validateBattle(g, version, combat);
  if (['destruction', 'orbital'].includes(run.phase)) check(version >= 14 ? isCivilizationVictory(session) : g.ages.enemy === SURFACE.finalEnemyAge, '终局敌人');
  if (run.phase === 'victory') check(g.ages.enemy < SURFACE.finalEnemyAge && (version < 14 || !isCivilizationVictory(session)), '普通战役终点');
  return session;
}

export const validateSession = session => validateRecord(session);

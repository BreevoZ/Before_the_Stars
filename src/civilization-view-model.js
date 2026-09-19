import { Q } from './quantity.js';
import { AGES } from './game.js';
import { describeStat } from './stat-text.js';
import { getNextChallengeLevel, isBetweenRuns } from './progression-machine.js';
import { CHALLENGE, getChallengeModifiers, challengeName, availableSpeeds, getVictorySupplies } from './progression-config.js';
import { getLegacyReward } from './talents.js';

export function buildCivilizationViewModel(session, { debug = false } = {}) {
  const view = {};
  const put = (key, value) => { view[key] = value; };
  const text = (id, value, prop = '') => put(`#${id}${prop ? `@${prop}` : ''}`, value);
  const { run, permanent: p, game } = session;
  const between = isBetweenRuns(run.phase);
  const nextChallenge = getNextChallengeLevel(session);
  const challengeLabel = run.phase === 'defeat' ? `重返${challengeName(nextChallenge)}` : `踏入${challengeName(nextChallenge)}`;
  for (const id of ['result-challenge', 'archive-challenge']) {
    text(id, nextChallenge === null, 'hidden'); text(id, challengeLabel);
  }
  text('challenge-status', !run.challengeLevel, 'hidden');
  text('challenge-status', `余烬 · ${challengeName(run.challengeLevel)} · 通关 +${getLegacyReward(run.talents, run.challengeLevel)} Legacy${run.challengeLevel === CHALLENGE.maxLevel ? ' · 最高难度' : ''}`);
  put('body@data-civilization-phase', run.phase);
  if (debug) {
    put('#debug-speed@value', String(session.debugSpeed));
    put('[data-debug-command]@disabled', run.phase !== 'battle');
  }
  text('game-speed', debug || availableSpeeds(p).length === 1, 'hidden');
  text('game-speed', `${p.settings.speed}×`);
  text('game-speed', `游戏速度 ${p.settings.speed} 倍；R 切换，最高 ${availableSpeeds(p).at(-1)} 倍`, 'aria-label');
  text('game-speed', '文明火种解锁 2×；时间加速解锁 3× · R 切换', 'title');
  text('archives-title', '文明星图');
  text('home-heading', run.phase === 'destruction' ? '文明未能幸存，星火仍在。' : '每一次重建，都离群星更近。');
  text('archive-run', `地表文明 · 第 ${run.battleNumber} 场冲突 · 本轮 ${Math.floor(run.elapsed / 60)} 分 ${Math.floor(run.elapsed % 60)} 秒`);
  text('cycles', p.completedCycles); text('legacy', p.legacy);
  text('cycle-outcome', run.phase === 'destruction' ? `战争胜利，高科技失控与内战却终结了文明。本轮 +${run.earnedLegacy} 文明遗产，已入账。` :
    run.phase === 'defeat' ? '本轮未完成终局，无遗产奖励。已有永久档案仍然保留。' : '击败未来时代的敌方基地，完成地表文明循环；仅进化至未来并不算通关。');
  text('archive-footer', !between, 'hidden');
  text('cycle-outcome', run.phase === 'battle' || run.phase === 'victory', 'hidden');
  text('rebuild-rules', !between, 'hidden'); text('rebuild-civilization', !between, 'hidden');
  text('rebuild-civilization', run.challengeLevel ? '返回初生之地' : run.phase === 'defeat' ? '从原始时代重试' : '重建文明');
  let activeBonuses = `本轮收入：${describeStat(game, 'player', 'income')}；击杀经验（基础 100）：${describeStat(game, { kind: 'reward' }, 'experience', 100)}；击杀金币（基础 100）：${describeStat(game, { kind: 'reward' }, 'bounty', 100)}；起始金币：${describeStat(game, 'player', 'startingGold')}；终局遗产：${describeStat(game, { kind: 'civilization' }, 'legacy')}。阵亡经验先按 75% 向下取整，再结算加成并逐笔向下取整。`;
  if (run.challengeLevel) activeBonuses += ` 敌军收入：${describeStat(game, 'enemy', 'income')}；基地生命：${describeStat(game, 'enemy', 'baseHealth')}。`;
  text('active-bonuses', activeBonuses);
  text('archives', p.completedCycles === 0, 'hidden');
  text('civilization-bar', p.completedCycles === 0, 'hidden');
  text('autobuyer-menu', p.completedCycles === 0, 'hidden');
  text('legacy-balance', p.legacy);
  text('autobuyer-label', !p.automation.unlocked ? '未解锁' : p.automation.enabled ? '已开启' : '已关闭');
  text('autobuyer-menu', String(p.automation.enabled), 'data-enabled');
  text('archives', `天赋树，${p.legacy} 文明遗产`, 'aria-label');
  text('result-talents', run.phase !== 'destruction' || p.completedCycles < 2 || nextChallenge !== null, 'hidden');
  text('result', run.phase === 'destruction', 'class:destruction');
  if (run.phase !== 'battle') {
    text('result-title', run.phase === 'destruction' ? '文明未能幸存' : run.phase === 'victory' ? '战役胜利' : game.status === 'draw' ? '平局' : '战败');
    text('result-detail', run.phase === 'destruction' ? `你赢得了战争，却没能保住文明。+${run.earnedLegacy} 文明遗产已计入本轮结算。` :
      run.phase === 'victory' ? `敌方${AGES[game.ages.enemy].name}基地已被摧毁。资产保留，下一场冲突等待着你。` : '本轮没有遗产奖励。永久进度仍然保留。');
    text('play-again', run.phase === 'victory' ? '继续文明进程' : run.phase === 'destruction' ? (p.completedCycles === 1 ? '查看遗产与天赋' : '重建文明') : p.completedCycles ? '查看档案与重试' : '从原始时代重试');
    if (run.challengeLevel && between) text('play-again', '返回初生之地');
    text('result-hint', false, 'hidden');
    const supplies = getVictorySupplies(game);
    text('result-hint', run.phase === 'destruction' ? (p.completedCycles === 1 ? '第一份文明遗产 · 解锁你的第一个天赋' : '重建清空本轮资源与战场 · 保留遗产、天赋与自动购买设置') : run.phase === 'victory' ? `继续时获得战役补给：+${Q.format(supplies.gold)} 金币、+${Q.format(supplies.experience)} 经验 · 未完成订单退款 · 基地满血` : '从原始时代重新尝试');
  }
  return view;
}

export function buildChallengeViewModel(session) {
  const level = getNextChallengeLevel(session);
  if (level === null) return null;
  const bonuses = getChallengeModifiers(level), multiplier = value => `×${Q.format(value)}`;
  return { level, bindings: {
    '#challenge-title': `余烬远征 · ${challengeName(level)}`,
    '#challenge-intro': `${session.run.phase === 'defeat' ? '重试当前难度' : '废墟深处，一支更强大的文明正在集结'}。以下倍率均相对于常规文明（显示保留三位小数）。`,
    '#challenge-economy': `${multiplier(bonuses.gold)} / ${multiplier(bonuses.income)}`,
    '#challenge-experience': multiplier(bonuses.experience),
    '#challenge-power': `${multiplier(bonuses.health)} / ${multiplier(bonuses.damage)}`,
    '#challenge-base': multiplier(bonuses.baseHealth),
    '#challenge-reward': `+${getLegacyReward(session.permanent.talents, level)} Legacy`,
    '#begin-challenge': `踏入${challengeName(level)}`,
  } };
}

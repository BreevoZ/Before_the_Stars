import { Q } from './quantity.js';
import { describeStat } from './stat-text.js';
import { AGES } from './game.js';
import { createProgression, updateProgression, continueCivilization, rebuildCivilization, abandonCivilization, startChallenge, getNextChallengeLevel } from './progression.js';
import { SAVE_INTERVAL, SURFACE, CHALLENGE, getChallengeModifiers } from './progression-config.js';
import { getLegacyReward } from './talents.js';
import { createTalentUI } from './talent-ui.js';
import { createSaveStore, serializeSession, parseSession, MAX_SAVE_BYTES } from './save.js';
import { createDebugProgression, supplyDebugRun, runDebugCommand, DEBUG_SPEEDS } from './debug.js';

const el = id => document.getElementById(id);
const text = (id, value) => { if (el(id).textContent !== String(value)) el(id).textContent = value; };
export const formatMultiplier = value => Q.format(value, null);

export function createCivilizationUI(onChange, { debug = false } = {}) {
  const store = createSaveStore(undefined, { debug });
  const loaded = store.load();
  const freshSession = () => debug ? createDebugProgression() : createProgression();
  let session = loaded.session ?? freshSession();
  let saveElapsed = 0;
  const dialog = el('archives-dialog'), saveDialog = el('save-dialog'), autoDialog = el('automation-dialog');
  const challengeDialog = el('challenge-dialog');
  let offeredRunId = null, challengeFromHome = false;
  const multiplier = value => `×${Q.format(value)}`;
  function openChallenge() {
    const level = getNextChallengeLevel(session);
    if (level === null) return;
    offeredRunId = session.run.runId; challengeFromHome = dialog.open;
    const bonuses = getChallengeModifiers(level);
    text('challenge-title', `文明挑战 ${level}`);
    text('challenge-intro', `${session.run.phase === 'defeat' ? '重试当前难度' : '下一轮敌军将进一步强化'}。以下倍率均相对于常规文明（显示保留三位小数）。`);
    text('challenge-economy', `${multiplier(bonuses.gold)} / ${multiplier(bonuses.income)}`);
    text('challenge-experience', multiplier(bonuses.experience));
    text('challenge-power', `${multiplier(bonuses.health)} / ${multiplier(bonuses.damage)}`);
    text('challenge-base', multiplier(bonuses.baseHealth));
    text('challenge-reward', `+${getLegacyReward(session.permanent.talents, level)} Legacy`);
    text('begin-challenge', `开始挑战 ${level}`);
    dialog.close(); autoDialog.close();
    if (!challengeDialog.open) challengeDialog.showModal();
    changed();
  }
  function report(result, success = '已保存完整文明进度。') {
    text('save-status', result.ok ? success : result.error);
    el('save-warning').hidden = Boolean(result.ok);
    if (!result.ok) text('save-warning', `存档提示：${result.error} 当前可继续试玩并导出进度；请在「存档」处理。`);
    return result.ok;
  }
  function save() { saveElapsed = 0; return report(store.save(session)); }
  function changed(resetBattle = false) { sync(); onChange(resetBattle); }
  function open({ cinematic = false } = {}) {
    if (!session.permanent.completedCycles) return;
    autoDialog.close();
    if (!dialog.open) dialog.showModal(); talentControls.open(cinematic); changed();
  }
  function openAutomation() {
    if (!session.permanent.completedCycles) return;
    dialog.close();
    if (!autoDialog.open) autoDialog.showModal(); changed();
  }
  function openSave() { if (!saveDialog.open) saveDialog.showModal(); changed(); }
  function replace(next) { session = next; saveElapsed = 0;
    dialog.close(); autoDialog.close(); challengeDialog.close(); offeredRunId = null;
    changed(true); }
  function transition(action) {
    const runId = session.run.runId;
    if (!action()) return;
    if (debug && session.run.runId !== runId) supplyDebugRun(session);
    save(); dialog.close(); autoDialog.close(); challengeDialog.close(); offeredRunId = null; changed(true);
  }
  el('restart').title = '重开本轮文明 · 永久进度保留';
  el('restart').setAttribute('aria-label', '重开本轮文明');
  el('save-menu').hidden = false;
  el('save-menu').addEventListener('click', openSave);
  el('archive-save').addEventListener('click', openSave);
  el('home-automation').addEventListener('click', () => { if (!autoDialog.open) autoDialog.showModal(); changed(); });
  el('close-save').addEventListener('click', () => saveDialog.close());
  saveDialog.addEventListener('close', () => changed());
  el('archives').addEventListener('click', open);
  el('result-talents').addEventListener('click', open);
  el('autobuyer-menu').addEventListener('click', openAutomation);
  el('automation-to-talents').addEventListener('click', open);
  el('close-automation').addEventListener('click', () => autoDialog.close());
  autoDialog.addEventListener('close', () => changed());
  el('close-archives').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => changed());
  el('result-challenge').addEventListener('click', openChallenge);
  el('archive-challenge').addEventListener('click', openChallenge);
  el('close-challenge').addEventListener('click', () => challengeDialog.close());
  challengeDialog.addEventListener('close', () => {
    const returnHome = offeredRunId !== null && challengeFromHome;
    offeredRunId = null; challengeFromHome = false;
    if (returnHome) open(); else changed();
  });
  el('begin-challenge').addEventListener('click', () => {
    const runId = offeredRunId;
    transition(() => startChallenge(session, runId));
  });
  if (debug) {
    el('debug-tools').hidden = false;
    el('clear-progress').textContent = '清空调试进度';
    el('debug-speed').value = String(session.debugSpeed);
    el('debug-speed').addEventListener('change', () => {
      const speed = Number(el('debug-speed').value);
      if (!DEBUG_SPEEDS.includes(speed)) return;
      session.debugSpeed = speed; save(); changed();
    });
    document.querySelectorAll('[data-debug-command]').forEach(button => button.addEventListener('click', () => {
      if (runDebugCommand(session, button.dataset.debugCommand)) { save(); changed(); }
    }));
  }
  const talentControls = createTalentUI(() => session, () => { save(); changed(); });
  el('rebuild-civilization').addEventListener('click', () => {
    const runId = session.run.runId;
    transition(() => rebuildCivilization(session, runId));
  });
  el('manual-save').addEventListener('click', save);
  el('export-save').addEventListener('click', () => {
    try {
      const raw = serializeSession(session); el('save-data').value = raw;
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `before-the-stars-${debug ? 'debug-' : ''}${session.run.runId}.json`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      text('save-status', '存档已导出；下方也保留可复制的完整内容。');
    } catch (error) { report({ ok: false, error: error.message }); }
  });
  el('import-file').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > MAX_SAVE_BYTES) throw new Error('存档文件过大。');
      el('save-data').value = await file.text();
      text('save-status', '文件已读取，点击「校验并导入」继续。');
    } catch (error) { text('save-status', error.message); }
  });
  el('import-save').addEventListener('click', () => {
    try {
      const next = parseSession(el('save-data').value);
      if ((next.debug === true) !== debug) throw new Error('正式存档与调试存档不能互相导入。');
      if (!window.confirm(`存档有效：${next.permanent.completedCycles} 次循环，${next.permanent.legacy} 遗产。替换当前全部增量进度？建议先导出当前存档。`)) return;
      if (report(store.replace(next), '存档已导入，战斗保持在保存时刻。')) replace(next);
    } catch (error) { text('save-status', `未导入：${error.message}`); }
  });
  el('recover-save').addEventListener('click', () => {
    if (!window.confirm('恢复上一份有效备份？当前尚未保存的增量进度将被替换。')) return;
    const result = store.recover();
    if (report(result, '已恢复有效备份。')) replace(result.session);
  });
  el('clear-progress').addEventListener('click', () => {
    if (!window.confirm(debug ? '清空调试进度及调试备份？正式增量存档保持不变。' : '清空全部增量进度及本地备份？这会永久删除循环次数、遗产、升级和当前文明，无法撤销。建议先导出存档。')) return;
    const next = freshSession();
    if (report(store.clear(next), '全部进度已清空。')) { replace(next); dialog.close(); saveDialog.close(); }
  });

  function sync() {
    const { run, permanent: p, game } = session;
    const between = ['destruction', 'defeat'].includes(run.phase);
    const nextChallenge = getNextChallengeLevel(session);
    const challengeLabel = run.phase === 'defeat' ? `重试挑战 ${nextChallenge}` : `挑战更强文明 · ${nextChallenge}`;
    for (const id of ['result-challenge', 'archive-challenge']) {
      el(id).hidden = nextChallenge === null; text(id, challengeLabel);
    }
    el('challenge-status').hidden = !run.challengeLevel;
    text('challenge-status', `文明挑战 ${run.challengeLevel} · 通关 +${getLegacyReward(run.talents, run.challengeLevel)} Legacy${run.challengeLevel === CHALLENGE.maxLevel ? ' · 最高难度' : ''}`);
    document.body.dataset.civilizationPhase = run.phase;
    if (debug) {
      el('debug-speed').value = String(session.debugSpeed);
      document.querySelectorAll('[data-debug-command]').forEach(button => { button.disabled = run.phase !== 'battle'; });
    }
    text('archives-title', '文明星图');
    text('home-heading', run.phase === 'destruction' ? '文明未能幸存，星火仍在。' : '每一次重建，都离群星更近。');
    text('archive-run', `地表文明 · 第 ${run.battleNumber} 场冲突 · 本轮 ${Math.floor(run.elapsed / 60)} 分 ${Math.floor(run.elapsed % 60)} 秒`);
    text('cycles', p.completedCycles); text('legacy', p.legacy);
    text('cycle-outcome', run.phase === 'destruction' ? `战争胜利，高科技失控与内战却终结了文明。本轮 +${run.earnedLegacy} 文明遗产，已入账。` :
      run.phase === 'defeat' ? '本轮未完成终局，无遗产奖励。已有永久档案仍然保留。' : '击败未来时代的敌方基地，完成地表文明循环；仅进化至未来并不算通关。');
    el('archive-footer').hidden = !between;
    el('cycle-outcome').hidden = run.phase === 'battle' || run.phase === 'victory';
    el('rebuild-rules').hidden = !between; el('rebuild-civilization').hidden = !between;
    text('rebuild-civilization', run.challengeLevel ? '结束挑战 · 常规重建' : run.phase === 'defeat' ? '从原始时代重试' : '重建文明');
    talentControls.sync();
    let activeBonuses = `本轮收入：${describeStat(game, 'player', 'income')}；击杀经验（基础 100）：${describeStat(game, { kind: 'reward' }, 'experience', 100)}；击杀金币（基础 100）：${describeStat(game, { kind: 'reward' }, 'bounty', 100)}；起始金币：${describeStat(game, 'player', 'startingGold')}；终局遗产：${describeStat(game, { kind: 'civilization' }, 'legacy')}。阵亡经验先按 75% 向下取整，再结算加成并逐笔向下取整。`;
    if (run.challengeLevel) activeBonuses += ` 敌军收入：${describeStat(game, 'enemy', 'income')}；基地生命：${describeStat(game, 'enemy', 'baseHealth')}。`;
    text('active-bonuses', activeBonuses);
    el('archives').hidden = p.completedCycles === 0;
    el('civilization-bar').hidden = p.completedCycles === 0;
    el('autobuyer-menu').hidden = p.completedCycles === 0;
    text('legacy-balance', p.legacy);
    text('autobuyer-label', !p.automation.unlocked ? '未解锁' : p.automation.enabled ? '已开启' : '已关闭');
    el('autobuyer-menu').dataset.enabled = String(p.automation.enabled);
    el('archives').setAttribute('aria-label', `天赋树，${p.legacy} 文明遗产`);
    el('result-talents').hidden = run.phase !== 'destruction' || p.completedCycles < 2 || nextChallenge !== null;
    el('result').classList.toggle('destruction', run.phase === 'destruction');
    if (run.phase !== 'battle') {
      text('result-title', run.phase === 'destruction' ? '文明未能幸存' : run.phase === 'victory' ? '战役胜利' : game.status === 'draw' ? '平局' : '战败');
      text('result-detail', run.phase === 'destruction' ? `你赢得了战争，却没能保住文明。+${run.earnedLegacy} 文明遗产已计入本轮结算。` :
        run.phase === 'victory' ? `敌方${AGES[game.ages.enemy].name}基地已被摧毁。资产保留，下一场冲突等待着你。` : '本轮没有遗产奖励。永久进度仍然保留。');
      text('play-again', run.phase === 'victory' ? '继续文明进程' : run.phase === 'destruction' ? (p.completedCycles === 1 ? '查看遗产与天赋' : '重建文明') : p.completedCycles ? '查看档案与重试' : '从原始时代重试');
      if (run.challengeLevel && between) text('play-again', '结束挑战 · 常规重建');
      el('result-hint').hidden = false;
      text('result-hint', run.phase === 'destruction' ? (p.completedCycles === 1 ? '第一份文明遗产 · 解锁你的第一个天赋' : '重建清空本轮资源与战场 · 保留遗产、天赋与自动购买设置') : run.phase === 'victory' ? '未完成订单按支付价格退款 · 基地恢复满血' : '从原始时代重新尝试');
    }
  }
  if (!loaded.ok) report(loaded);
  else if (loaded.migrated) report(store.save(session), '旧存档已升级，原有进度、档案等级和自动招募设置均已保留。');
  else if (!loaded.session) save();
  else text('save-status', '已恢复上次保存的完整进度，没有离线推进。');
  let shownFinaleRunId = null;
  const restoredFinale = loaded.session?.run.phase === 'destruction' ? loaded.session.run.runId : null;
  return {
    presentEnd() {
      if (session.run.phase !== 'destruction' || shownFinaleRunId === session.run.runId) return;
      shownFinaleRunId = session.run.runId;
      open({ cinematic: session.run.runId !== restoredFinale });
    },
    get session() { return session; },
    get homeOpen() { return dialog.open; },
    get paused() { return dialog.open || saveDialog.open || autoDialog.open || challengeDialog.open; },
    get modalOpen() { return dialog.open || saveDialog.open || autoDialog.open || challengeDialog.open; },
    get timeScale() { return debug ? session.debugSpeed : 1; },
    sync, save, open,
    step(dt) {
      const resolved = updateProgression(session, dt);
      saveElapsed += dt;
      if (resolved || saveElapsed >= SAVE_INTERVAL) save();
    },
    resultAction() {
      if (session.run.phase === 'victory') {
        const battleId = session.run.battleId;
        transition(() => continueCivilization(session, battleId));
      } else if ((session.run.phase === 'destruction' && session.permanent.completedCycles > 1) ||
          (session.run.phase === 'defeat' && (!session.permanent.completedCycles || session.run.challengeLevel))) {
        transition(() => rebuildCivilization(session, session.run.runId));
      } else if (['destruction', 'defeat'].includes(session.run.phase)) open();
    },
    restart() {
      if (['destruction', 'defeat'].includes(session.run.phase)) return this.resultAction();
      const runId = session.run.runId;
      if (!window.confirm(`放弃当前文明并从原始时代重开${session.run.challengeLevel ? `挑战 ${session.run.challengeLevel}` : ''}？本轮金币、经验、部队和防御将清除，不发放遗产；已有永久进度保留。`)) return;
      transition(() => abandonCivilization(session, runId));
    },
  };
}

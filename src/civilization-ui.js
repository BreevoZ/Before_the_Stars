import { getIncomeRate, AGES } from './game.js';
import { createProgression, updateProgression, continueCivilization, rebuildCivilization, abandonCivilization, purchaseUpgrade, getUpgradeState, setAutomation } from './progression.js';
import { UPGRADES, UPGRADE_COSTS, SAVE_INTERVAL } from './progression-config.js';
import { createSaveStore, serializeSession, parseSession, MAX_SAVE_BYTES } from './save.js';
import { createDebugProgression, supplyDebugRun, runDebugCommand, DEBUG_SPEEDS } from './debug.js';

const el = id => document.getElementById(id);
const text = (id, value) => { if (el(id).textContent !== String(value)) el(id).textContent = value; };
export const formatMultiplier = value => String(value);

export function createCivilizationUI(onChange, { debug = false } = {}) {
  const store = createSaveStore(undefined, { debug });
  const loaded = store.load();
  const freshSession = () => debug ? createDebugProgression() : createProgression();
  let session = loaded.session ?? freshSession();
  let saveElapsed = 0;
  const dialog = el('archives-dialog'), saveDialog = el('save-dialog');
  function report(result, success = '已保存完整文明进度。') {
    text('save-status', result.ok ? success : result.error);
    el('save-warning').hidden = Boolean(result.ok);
    if (!result.ok) text('save-warning', `存档提示：${result.error} 当前可继续试玩并导出进度；请在「存档」处理。`);
    return result.ok;
  }
  function save() { saveElapsed = 0; return report(store.save(session)); }
  function changed(resetBattle = false) { sync(); onChange(resetBattle); }
  function open() {
    if (!session.permanent.completedCycles) return;
    if (!dialog.open) dialog.showModal(); changed();
  }
  function openSave() { if (!saveDialog.open) saveDialog.showModal(); changed(); }
  function replace(next) { session = next; saveElapsed = 0;
    if (!session.permanent.completedCycles) dialog.close();
    changed(true); }
  function transition(action) {
    const runId = session.run.runId;
    if (!action()) return;
    if (debug && session.run.runId !== runId) supplyDebugRun(session);
    save(); dialog.close(); changed(true);
  }
  el('restart').title = '重开本轮文明 · 永久进度保留';
  el('restart').setAttribute('aria-label', '重开本轮文明');
  el('save-menu').hidden = false;
  el('save-menu').addEventListener('click', openSave);
  el('archive-save').addEventListener('click', openSave);
  el('close-save').addEventListener('click', () => saveDialog.close());
  saveDialog.addEventListener('close', () => changed());
  el('archives').addEventListener('click', open);
  el('close-archives').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => changed());
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
  for (const [key, config] of Object.entries(UPGRADES)) {
    const row = document.createElement('div'); row.className = 'upgrade-row';
    row.innerHTML = `<div><h4>${config.name} <span id="level-${key}"></span></h4><p id="effect-${key}"></p></div><button type="button" id="buy-${key}"></button>`;
    el('upgrade-list').append(row);
    el(`buy-${key}`).addEventListener('click', () => { if (purchaseUpgrade(session, key)) { save(); changed(); } });
  }
  function automationChanged() {
    if (setAutomation(session, el('auto-enabled').checked, el('auto-target').value)) { save(); changed(); }
  }
  el('auto-enabled').addEventListener('change', automationChanged);
  el('auto-target').addEventListener('change', automationChanged);
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
    document.body.dataset.civilizationPhase = run.phase;
    if (debug) {
      el('debug-speed').value = String(session.debugSpeed);
      document.querySelectorAll('[data-debug-command]').forEach(button => { button.disabled = run.phase !== 'battle'; });
    }
    text('archives-title', run.phase === 'destruction' ? '文明毁灭 · 遗产' : '文明档案');
    text('archive-run', `地表文明 · 第 ${run.battleNumber} 场冲突 · 本轮 ${Math.floor(run.elapsed / 60)} 分 ${Math.floor(run.elapsed % 60)} 秒`);
    text('cycles', p.completedCycles); text('legacy', p.legacy);
    text('cycle-outcome', run.phase === 'destruction' ? `战争胜利，高科技失控与内战却终结了文明。本轮 +${run.earnedLegacy} 文明遗产，已入账。` :
      run.phase === 'defeat' ? '本轮未完成终局，无遗产奖励。已有永久档案仍然保留。' : '击败未来时代的敌方基地，完成地表文明循环；仅进化至未来并不算通关。');
    el('rebuild-rules').hidden = !between; el('rebuild-civilization').hidden = !between;
    text('rebuild-civilization', run.phase === 'defeat' ? '从原始时代重试' : '重建文明');
    for (const [key, config] of Object.entries(UPGRADES)) {
      const level = p.upgrades[key], state = getUpgradeState(session, key);
      text(`level-${key}`, `${level} / ${UPGRADE_COSTS.length}`);
      text(`effect-${key}`, `${config.description} ×${formatMultiplier(config.base ** level)}${level < UPGRADE_COSTS.length ? ` → ×${formatMultiplier(config.base ** (level + 1))}` : ' · 已满级'}`);
      text(`buy-${key}`, level >= UPGRADE_COSTS.length ? '已满级' : `${UPGRADE_COSTS[level]} 遗产 · 升级`);
      el(`buy-${key}`).disabled = state !== 'ready';
      el(`buy-${key}`).title = { 'during-run': '两轮之间才能购买', legacy: '文明遗产不足', max: '已达最高等级', ready: '购买后在下轮开始时生效' }[state];
    }
    text('active-bonuses', `本轮：生产档案 ${run.upgrades.production} 级，${AGES[game.ages.player].income} × ${formatMultiplier(game.modifiers.income)} = ${formatMultiplier(getIncomeRate(game))} 金币/秒；战争档案 ${run.upgrades.warfare} 级，经验 ×${formatMultiplier(game.modifiers.experience)}。阵亡先按原规则向下取整，再乘倍率逐笔向下取整。击杀金币不变。`);
    text('automation-hint', p.automation.unlocked ? '每 0.25 秒尝试一次正常付费招募；进化后跟随对应兵种位置。暂停、隐藏页面或结算时停止。' : '首次有效循环后永久免费解锁，默认关闭。');
    el('auto-enabled').disabled = !p.automation.unlocked; el('auto-target').disabled = !p.automation.unlocked;
    el('auto-enabled').checked = p.automation.enabled; el('auto-target').value = p.automation.target;
    el('archives').hidden = p.completedCycles === 0;
    text('archives', `档案 · ${p.legacy}`);
    el('archives').setAttribute('aria-label', `文明档案，${p.legacy} 文明遗产`);
    el('result').classList.toggle('destruction', run.phase === 'destruction');
    if (run.phase !== 'battle') {
      text('result-title', run.phase === 'destruction' ? '文明未能幸存' : run.phase === 'victory' ? '战役胜利' : game.status === 'draw' ? '平局' : '战败');
      text('result-detail', run.phase === 'destruction' ? `你赢得了战争，却没能保住文明。+${run.earnedLegacy} 文明遗产已计入本轮结算。` :
        run.phase === 'victory' ? `敌方${AGES[game.ages.enemy].name}基地已被摧毁。资产保留，下一场冲突等待着你。` : '本轮没有遗产奖励。永久进度仍然保留。');
      text('play-again', run.phase === 'victory' ? '继续文明进程' : run.phase === 'destruction' ? '查看遗产与重建' : p.completedCycles ? '查看档案与重试' : '从原始时代重试');
      el('result-hint').hidden = false;
      text('result-hint', run.phase === 'destruction' ? '可立即跳过演出 · 遗产已经入账' : run.phase === 'victory' ? '未完成订单按支付价格退款 · 基地恢复满血' : '从原始时代重新尝试');
    }
  }
  if (!loaded.ok) report(loaded);
  else if (!loaded.session) save();
  else text('save-status', '已恢复上次保存的完整进度，没有离线推进。');
  return {
    get session() { return session; },
    get paused() { return dialog.open || saveDialog.open; },
    get modalOpen() { return dialog.open || saveDialog.open; },
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
      } else if (session.run.phase === 'defeat' && !session.permanent.completedCycles) {
        transition(() => rebuildCivilization(session, session.run.runId));
      } else open();
    },
    restart() {
      if (['destruction', 'defeat'].includes(session.run.phase)) return this.resultAction();
      const runId = session.run.runId;
      if (!window.confirm('放弃当前文明并从原始时代重开？本轮金币、经验、部队和防御将清除，不发放遗产；已有永久进度保留。')) return;
      transition(() => abandonCivilization(session, runId));
    },
  };
}

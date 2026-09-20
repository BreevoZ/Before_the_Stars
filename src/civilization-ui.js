import { canAutoContinue } from './automation.js';
import { getChallengeLevels } from './progression-machine.js';
import { createBindings } from './dom-bindings.js';
import { Q } from './quantity.js';
import { createOrbitalUI } from './orbital-ui.js';
import { createDestructionUI } from './destruction-ui.js';
import { buildCivilizationViewModel, buildChallengeViewModel } from './civilization-view-model.js';
import { createProgression, updateProgression, continueCivilization, rebuildCivilization, abandonCivilization, startChallenge, cycleGameSpeed } from './progression.js';
import { SAVE_INTERVAL, challengeName } from './progression-config.js';
import { createTalentUI } from './talent-ui.js';
import { createSaveStore, serializeSession, parseSession, MAX_SAVE_BYTES } from './save.js';
import { createDebugProgression, supplyDebugRun, runDebugCommand, setDebugLegacy, DEBUG_SPEEDS } from './debug.js';

const el = id => document.getElementById(id);
export { formatMultiplier } from './view-model.js';

export function createCivilizationUI(onChange, { debug = false } = {}) {
  const bind = createBindings(document);
  const text = (id, value) => bind({ [`#${id}`]: value });
  const store = createSaveStore(undefined, { debug });
  const loaded = store.load();
  const freshSession = () => debug ? createDebugProgression() : createProgression();
  let session = loaded.session ?? freshSession();
  let saveElapsed = 0;
  const dialog = el('archives-dialog'), saveDialog = el('save-dialog'), autoDialog = el('automation-dialog');
  const challengeDialog = el('challenge-dialog');
  const debugDialog = el('debug-legacy-dialog');
  let offeredRunId = null, challengeFromHome = false, selectedChallenge = null;
  function selectChallenge(level) {
    const model = buildChallengeViewModel(session, level);
    if (!model) return;
    selectedChallenge = model.level; bind(model.bindings);
  }
  for (const { level } of getChallengeLevels(session)) {
    const button = document.createElement('button');
    button.id = `challenge-level-${level}`; button.type = 'button';
    button.addEventListener('click', () => selectChallenge(level));
    el('challenge-levels').append(button);
  }
  function openChallenge() {
    const model = buildChallengeViewModel(session);
    if (!model) return;
    offeredRunId = session.run.runId; challengeFromHome = dialog.open;
    selectChallenge(model.level);
    dialog.close(); autoDialog.close();
    if (!challengeDialog.open) challengeDialog.showModal();
    changed();
  }
  function report(result, success = '已保存完整文明进度。') {
    text('save-status', result.ok ? success : result.error);
    el('save-warning').hidden = Boolean(result.ok);
    el('orbital-save-warning').hidden = Boolean(result.ok);
    if (!result.ok) text('orbital-save-warning', `尚未写入本地存档：${result.error} 请通过「存档」导出当前进度。`);
    if (!result.ok) text('save-warning', `存档提示：${result.error} 当前可继续试玩并导出进度；请在「存档」处理。`);
    return result.ok;
  }
  function save() { saveElapsed = 0; return report(store.save(session)); }
  function changed(resetBattle = false) { sync(); onChange(resetBattle); }
  function open({ cinematic = false } = {}) {
    if (!session.permanent.completedCycles) return;
    autoDialog.close();
    if (!dialog.open) dialog.showModal(); talentControls.open(cinematic); changed();
    if (session.run.phase === 'orbital') orbital.present(false);
  }
  function openAutomation() {
    if (!session.permanent.completedCycles) return;
    dialog.close();
    if (!autoDialog.open) autoDialog.showModal(); changed();
  }
  function openSave() { if (!saveDialog.open) saveDialog.showModal(); changed(); }
  function replace(next) { destruction.dismiss(); orbital.dismiss(); session = next; saveElapsed = 0; shownFinaleRunId = null;
    restoredFinale = next.run.phase === 'destruction' ? next.run.runId : null;
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
  function cycleSpeed() { if (cycleGameSpeed(session)) { save(); changed(); } }
  el('game-speed').addEventListener('click', cycleSpeed);
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
    transition(() => startChallenge(session, runId, selectedChallenge));
  });
  debugDialog.addEventListener('close', () => changed());
  el('close-debug-legacy').addEventListener('click', () => debugDialog.close());
  if (debug) {
    const openDebugLegacy = () => {
      el('debug-legacy-amount').value = String(Q.encode(session.permanent.legacy));
      text('debug-legacy-status', '');
      if (!debugDialog.open) debugDialog.showModal();
      el('debug-legacy-amount').select(); changed();
    };
    for (const id of ['debug-legacy', 'debug-balance']) el(id).addEventListener('click', openDebugLegacy);
    el('debug-legacy-form').addEventListener('submit', event => {
      event.preventDefault();
      if (!setDebugLegacy(session, el('debug-legacy-amount').value.trim())) {
        text('debug-legacy-status', '请输入非负整数，如 128 或 1e6；数量差距过大时请使用更接近现有账目的值。'); return;
      }
      const saved = save(); changed();
      text('debug-legacy-status', `当前余额 ${Q.format(session.permanent.legacy)} Legacy${saved ? ' · 已保存' : ' · 保存失败，请导出存档'}。`);
    });
    el('debug-tools').hidden = false;
    el('clear-progress').textContent = '清空调试进度';
    el('debug-speed').value = String(session.debugSpeed);
    el('debug-speed').addEventListener('change', () => {
      const speed = Number(el('debug-speed').value);
      if (!DEBUG_SPEEDS.includes(speed)) return;
      session.debugSpeed = speed; save(); changed();
    });
    document.querySelectorAll('[data-debug-command]').forEach(button => button.addEventListener('click', () => {
      if (runDebugCommand(session, button.dataset.debugCommand)) { save(); changed();
        if (button.dataset.debugCommand === 'legacy') { el('debug-legacy-amount').value = String(Q.encode(session.permanent.legacy)); text('debug-legacy-status', '启航预算已加入调试余额。'); }
      }
    }));
  }
  const talentControls = createTalentUI(() => session, key => {
    if (key === 'bypasser') shownFinaleRunId = `${session.run.runId}:orbital`;
    save(); changed();
    if (key === 'bypasser') orbital.present(true);
  });
  const orbital = createOrbitalUI({ review: () => talentControls.open(false), save: openSave });
  const destruction = createDestructionUI();
  el('return-orbit').addEventListener('click', () => orbital.present(false));
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
      if (!window.confirm(`存档有效：${next.permanent.completedCycles} 次循环，${Q.format(next.permanent.legacy)} 遗产。替换当前全部增量进度？建议先导出当前存档。`)) return;
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
    bind(buildCivilizationViewModel(session, { debug }));
    talentControls.sync();
  }
  if (!loaded.ok) report(loaded);
  else if (loaded.migrated) report(store.save(session), '旧存档已升级，原有进度、档案等级和自动招募设置均已保留。');
  else if (!loaded.session) save();
  else text('save-status', '已恢复上次保存的完整进度，没有离线推进。');
  let shownFinaleRunId = null;
  let restoredFinale = loaded.session?.run.phase === 'destruction' ? loaded.session.run.runId : null;
  return {
    presentEnd() {
      const key = `${session.run.runId}:${session.run.phase}`;
      if (!['destruction', 'orbital'].includes(session.run.phase) || shownFinaleRunId === key) return;
      shownFinaleRunId = key;
      const fresh = session.run.runId !== restoredFinale;
      const firstDestruction = fresh && session.run.phase === 'destruction' && session.permanent.completedCycles === 1;
      open({ cinematic: fresh && !firstDestruction });
      if (firstDestruction) destruction.present(session.game);
    },
    get session() { return session; },
    get homeOpen() { return dialog.open; },
    get paused() { return dialog.open || saveDialog.open || autoDialog.open || challengeDialog.open || debugDialog.open; },
    get modalOpen() { return dialog.open || saveDialog.open || autoDialog.open || challengeDialog.open || debugDialog.open; },
    get canStep() { return session.game.status === 'playing' || canAutoContinue(session); },
    get timeScale() { return debug ? session.debugSpeed : session.permanent.settings.speed; },
    sync, save, open, cycleSpeed, animate(timestamp) {
      const suspended = saveDialog.open || autoDialog.open || challengeDialog.open || debugDialog.open;
      orbital.tick(timestamp, suspended); destruction.tick(timestamp, suspended);
    },
    step(dt) {
      const before = session.game;
      const resolved = updateProgression(session, dt, { paused: this.paused, hidden: document.hidden });
      saveElapsed += dt;
      if (resolved || saveElapsed >= SAVE_INTERVAL) save();
      if (session.game !== before) changed(true);
    },
    resultAction() {
      if (session.run.phase === 'orbital') { open(); return; }
      if (session.run.phase === 'victory') {
        const battleId = session.run.battleId;
        transition(() => continueCivilization(session, battleId));
      } else if (session.run.phase === 'defeat' && session.run.challengeLevel) {
        transition(() => startChallenge(session, session.run.runId, session.run.challengeLevel));
      } else if ((session.run.phase === 'destruction' && session.permanent.completedCycles > 1) ||
          (session.run.phase === 'defeat' && !session.permanent.completedCycles)) {
        transition(() => rebuildCivilization(session, session.run.runId));
      } else if (['destruction', 'defeat'].includes(session.run.phase)) open();
    },
    restart() {
      if (session.run.phase === 'orbital') { open(); return; }
      if (['destruction', 'defeat'].includes(session.run.phase)) return this.resultAction();
      const runId = session.run.runId;
      if (!window.confirm(`放弃当前文明并从原始时代重开${session.run.challengeLevel ? `「${challengeName(session.run.challengeLevel)}」` : ''}？本轮金币、经验、部队和防御将清除，不发放遗产；已有永久进度保留。`)) return;
      transition(() => abandonCivilization(session, runId));
    },
  };
}

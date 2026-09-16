import { AGES, getRecruitState, recruit } from './game.js';
import { AUTOMATION_INTERVAL, AUTOMATION_TARGETS } from './progression-config.js';

export function updateAutomation(session, dt, { paused = false, hidden = false } = {}) {
  const { permanent, run, game } = session;
  if (paused || hidden || run.phase !== 'battle' || game.status !== 'playing' ||
      !permanent.automation.unlocked || !permanent.automation.enabled || !Number.isFinite(dt) || dt <= 0) return;
  run.autoElapsed += Math.min(dt, 0.05);
  if (run.autoElapsed + 1e-9 < AUTOMATION_INTERVAL) return;
  run.autoElapsed = Math.max(0, run.autoElapsed - AUTOMATION_INTERVAL);
  const index = AUTOMATION_TARGETS.indexOf(permanent.automation.target);
  const type = AGES[game.ages.player].units[index];
  if (getRecruitState(game, type) === 'ready') recruit(game, type);
}

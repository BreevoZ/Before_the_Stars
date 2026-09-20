import { SURFACE, CHALLENGE, TALENT_PRICES, LEGACY_ECONOMY } from './progression-config.js';
import { stat } from './stats.js';
import { Q } from './quantity.js';

export const PHASE = Object.freeze({ BATTLE: 'battle', VICTORY: 'victory', DESTRUCTION: 'destruction', DEFEAT: 'defeat', ORBITAL: 'orbital' });
export const isBetweenRuns = phase => phase === PHASE.DESTRUCTION || phase === PHASE.DEFEAT;
export function getNextChallengeLevel({ run, permanent }) {
  if (!permanent.talents.challenge || !isBetweenRuns(run.phase)) return null;
  if (run.phase === PHASE.DEFEAT && run.challengeLevel > 0) return run.challengeLevel;
  return Math.min(CHALLENGE.maxLevel, (permanent.deepestChallenge ?? 0) + 1);
}
export function getChallengeLevels(session) {
  const { run, permanent: p } = session;
  const unlocked = Math.min(CHALLENGE.maxLevel, p.completedCycles, Math.max((p.deepestChallenge ?? 0) + 1, run.challengeLevel));
  return Array.from({ length: CHALLENGE.maxLevel }, (_, index) => ({ level: index + 1,
    cleared: index < (p.deepestChallenge ?? 0), unlocked: Boolean(p.talents.challenge) && index < unlocked }));
}
export function canStartChallenge(session, level) {
  return isBetweenRuns(session.run.phase) && Number.isInteger(level) && getChallengeLevels(session).some(entry => entry.level === level && entry.unlocked);
}
export function isCivilizationVictory({ game }) {
  return game.status === 'won' && (game.ages.enemy === SURFACE.finalEnemyAge ||
    stat(game, { kind: 'civilization' }, 'earlyFinale') === true);
}

// Ordered guards are mutually exclusive. Tokens are mandatory, including for
// simulation-originated resolution, so a stale click cannot act on a new run.
export const TRANSITIONS = Object.freeze([
  { event: 'launch', from: [PHASE.DESTRUCTION], to: PHASE.ORBITAL, token: 'runId', effect: 'launch',
    guard: ({ run, game, permanent: p }) => run.settled && isCivilizationVictory({ game }) &&
      p.talents.superSoldierPlan === 1 && p.talents.bypasser === 0 && Q.gte(p.legacy, TALENT_PRICES.bypasser[0]) &&
      (p.deepestChallenge ?? 0) >= LEGACY_ECONOMY.bypasserChallenge },
  { event: 'resolve', from: [PHASE.BATTLE], to: PHASE.DEFEAT, token: 'battleId', effect: 'finishBattle',
    guard: ({ game }) => ['lost', 'draw'].includes(game.status) },
  { event: 'resolve', from: [PHASE.BATTLE], to: PHASE.VICTORY, token: 'battleId', effect: 'finishBattle',
    guard: session => session.game.status === 'won' && !isCivilizationVictory(session) },
  { event: 'resolve', from: [PHASE.BATTLE], to: PHASE.DESTRUCTION, token: 'battleId', effect: 'settle',
    guard: session => isCivilizationVictory(session) && !session.run.settled },
  { event: 'continue', from: [PHASE.VICTORY], to: PHASE.BATTLE, token: 'battleId', effect: 'continue',
    guard: ({ game, run }) => game.status === 'won' && !isCivilizationVictory({ game }) && run.processedBattleId === run.battleId },
  { event: 'rebuild', from: [PHASE.DESTRUCTION, PHASE.DEFEAT], to: PHASE.BATTLE, token: 'runId', effect: 'rebuild' },
  { event: 'challenge', from: [PHASE.DESTRUCTION, PHASE.DEFEAT], to: PHASE.BATTLE, token: 'runId', effect: 'challenge',
    guard: (session, level) => canStartChallenge(session, level) },
  { event: 'abandon', from: [PHASE.BATTLE, PHASE.VICTORY], to: PHASE.BATTLE, token: 'runId', effect: 'abandon' },
].map(rule => Object.freeze({ ...rule, from: Object.freeze(rule.from) })));

export function getTransition(session, event, token, payload) {
  const { run } = session;
  if (event === 'resolve' && run.processedBattleId === run.battleId) return null;
  return TRANSITIONS.find(rule => rule.event === event && rule.from.includes(run.phase) &&
    token === run[rule.token] && (!rule.guard || rule.guard(session, payload))) ?? null;
}

// Save validation uses the same phase vocabulary as live transitions.
export function phaseMatchesResult(phase, status) {
  return ({ [PHASE.BATTLE]: ['playing'], [PHASE.VICTORY]: ['won'],
    [PHASE.DESTRUCTION]: ['won'], [PHASE.ORBITAL]: ['won'], [PHASE.DEFEAT]: ['lost', 'draw'] })[phase]?.includes(status) ?? false;
}

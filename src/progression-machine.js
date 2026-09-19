import { SURFACE, CHALLENGE } from './progression-config.js';

export const PHASE = Object.freeze({ BATTLE: 'battle', VICTORY: 'victory', DESTRUCTION: 'destruction', DEFEAT: 'defeat' });
export const isBetweenRuns = phase => phase === PHASE.DESTRUCTION || phase === PHASE.DEFEAT;
export function getNextChallengeLevel({ run, permanent }) {
  if (!permanent.talents.challenge) return null;
  if (run.phase === PHASE.DESTRUCTION && run.settled && run.challengeLevel < CHALLENGE.maxLevel) return run.challengeLevel + 1;
  if (run.phase === PHASE.DEFEAT && run.challengeLevel > 0) return run.challengeLevel;
  return null;
}

// Ordered guards are mutually exclusive. Tokens are mandatory, including for
// simulation-originated resolution, so a stale click cannot act on a new run.
export const TRANSITIONS = Object.freeze([
  { event: 'resolve', from: [PHASE.BATTLE], to: PHASE.DEFEAT, token: 'battleId', effect: 'finishBattle',
    guard: ({ game }) => ['lost', 'draw'].includes(game.status) },
  { event: 'resolve', from: [PHASE.BATTLE], to: PHASE.VICTORY, token: 'battleId', effect: 'finishBattle',
    guard: ({ game }) => game.status === 'won' && game.ages.enemy < SURFACE.finalEnemyAge },
  { event: 'resolve', from: [PHASE.BATTLE], to: PHASE.DESTRUCTION, token: 'battleId', effect: 'settle',
    guard: ({ game, run }) => game.status === 'won' && game.ages.enemy === SURFACE.finalEnemyAge && !run.settled },
  { event: 'continue', from: [PHASE.VICTORY], to: PHASE.BATTLE, token: 'battleId', effect: 'continue',
    guard: ({ game, run }) => game.status === 'won' && game.ages.enemy < SURFACE.finalEnemyAge && run.processedBattleId === run.battleId },
  { event: 'rebuild', from: [PHASE.DESTRUCTION, PHASE.DEFEAT], to: PHASE.BATTLE, token: 'runId', effect: 'rebuild' },
  { event: 'challenge', from: [PHASE.DESTRUCTION, PHASE.DEFEAT], to: PHASE.BATTLE, token: 'runId', effect: 'challenge',
    guard: session => getNextChallengeLevel(session) !== null },
  { event: 'abandon', from: [PHASE.BATTLE, PHASE.VICTORY], to: PHASE.BATTLE, token: 'runId', effect: 'abandon' },
].map(rule => Object.freeze({ ...rule, from: Object.freeze(rule.from) })));

export function getTransition(session, event, token) {
  const { run } = session;
  if (event === 'resolve' && run.processedBattleId === run.battleId) return null;
  return TRANSITIONS.find(rule => rule.event === event && rule.from.includes(run.phase) &&
    token === run[rule.token] && (!rule.guard || rule.guard(session))) ?? null;
}

// Save validation uses the same phase vocabulary as live transitions.
export function phaseMatchesResult(phase, status) {
  return ({ [PHASE.BATTLE]: ['playing'], [PHASE.VICTORY]: ['won'],
    [PHASE.DESTRUCTION]: ['won'], [PHASE.DEFEAT]: ['lost', 'draw'] })[phase]?.includes(status) ?? false;
}

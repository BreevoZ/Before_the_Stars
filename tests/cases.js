import { registerEconomyTests } from './economy-cases.js';
import { registerEconomyPacingTests } from './economy-pacing-cases.js';
import { registerOrbitalTests } from './orbital-cases.js';
import { registerDestructionTests } from './destruction-cases.js';
import { registerTraitTests } from './trait-cases.js';
import { registerArchitectureTests } from './architecture-cases.js';
import { registerGameTests } from './game-cases.js';
import { registerAnimationTests } from './animation-cases.js';
import { registerProgressionTests } from './progression-cases.js';
import { registerTalentTests } from './talent-cases.js';
import { registerChallengeTests } from './challenge-cases.js';
import { registerTalentHomeTests } from './talent-home-cases.js';
import { registerStatTests } from './stat-cases.js';
import { registerQuantityTests } from './quantity-cases.js';

function assert(condition, message = 'Assertion failed') { if (!condition) throw new Error(message); }
function near(actual, expected, message = '') {
  assert(Math.abs(actual - expected) < 0.001, `${message} Expected ${expected}, got ${actual}`);
}

// Canvas/UI cases explicitly use test.browser; async logic cases remain eligible
// for Node. Both runners execute the same assertions without DOM mocks.
export function collectCases({ browser = false } = {}) {
  const cases = [];
  const test = (name, run) => cases.push({ name, run });
  test.browser = browser ? test : () => {};
  for (const register of [registerDestructionTests, registerEconomyPacingTests, registerOrbitalTests, registerEconomyTests, registerGameTests, registerAnimationTests, registerProgressionTests,
    registerTalentTests, registerChallengeTests, registerStatTests, registerQuantityTests, registerArchitectureTests, registerTraitTests]) register(test, assert, near);
  if (browser) registerTalentHomeTests(test, assert, near);
  return cases;
}

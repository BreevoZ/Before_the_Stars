import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { RULES, AGES, createGame } from '../src/game.js';
import { createProgression, createCivilizationRun } from '../src/progression.js';
import { getLegacyReward } from '../src/talents.js';
import { simulateRun, normalizeRunOptions } from '../sim/simulate.js';
import { expandGrid, resultsToCSV } from '../sim/grid.js';

const example = JSON.parse(readFileSync(new URL('../sim/example.json', import.meta.url), 'utf8'));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} != ${expected}`);

test('Simulation: default is a genuine unaided loss with no Legacy or battle experience', () => {
  const result = simulateRun();
  assert.equal(result.outcome, 'lost');
  assert.equal(result.legacy, 0);
  assert.equal(result.totalExperience, 0);
  assert.equal(result.battles.length, 1);
  assert.ok(result.duration > 0 && result.duration < 180);
  near(result.peakGold, RULES.startingGold + result.duration * AGES[1].income);
});

test('Simulation: a real paid Autobuyer army continues early victories and settles exactly one finale', () => {
  const result = simulateRun(example);
  assert.equal(result.outcome, 'won');
  assert.ok(result.battles.length > 1);
  result.battles.forEach((battle, i) => {
    assert.equal(battle.number, i + 1);
    assert.equal(battle.outcome, 'won');
    assert.ok(battle.duration > 0);
    if (i) assert.equal(battle.enemyStartAge, result.battles[i - 1].enemyEndAge + 1);
  });
  assert.equal(result.battles.at(-1).enemyEndAge, 5);
  near(result.duration, result.battles.reduce((sum, battle) => sum + battle.duration, 0));
  assert.ok(result.totalExperience >= AGES[5].experienceRequired);
  assert.ok(result.peakGold >= RULES.startingGold + example.talents.supply * 150);
  assert.equal(result.legacy, getLegacyReward(normalizeRunOptions(example).talents, 0));
});

test('Simulation: challenge modifiers affect actual combat; only completed runs earn scaled Legacy', () => {
  const options = { ...example, automation: { ...example.automation, weights: [1,1,3] } };
  const normal = simulateRun(options), challenge = simulateRun({ ...options, challengeLevel: 1 });
  assert.equal(challenge.outcome, 'won');
  assert.equal(challenge.legacy, normal.legacy * 2);
  assert.notEqual(challenge.duration, normal.duration);
  const failed = simulateRun({ ...example, challengeLevel: 10, completedCycles: 10 });
  assert.equal(failed.outcome, 'lost');
  assert.equal(failed.legacy, 0);
});

test('Simulation: exact fixed-step timeout reports partial battles and never awards an early victory', () => {
  const oneSecond = simulateRun({ maxSeconds: 1 });
  assert.equal(oneSecond.outcome, 'timeout');
  assert.equal(oneSecond.duration, 1);
  assert.equal(oneSecond.peakGold, RULES.startingGold + AGES[1].income);
  assert.equal(oneSecond.battles[0].outcome, 'timeout');
  const completed = simulateRun(example);
  const firstEnd = Math.round(completed.battles[0].duration / RULES.fixedStep) * RULES.fixedStep;
  const atBoundary = simulateRun({ ...example, maxSeconds: firstEnd });
  assert.equal(atBoundary.outcome, 'timeout');
  assert.equal(atBoundary.battles.length, 1);
  assert.equal(atBoundary.battles[0].outcome, 'won');
  assert.equal(atBoundary.legacy, 0);
  const duringNext = simulateRun({ ...example, maxSeconds: firstEnd + 1 });
  assert.equal(duringNext.battles.length, 2);
  assert.equal(duringNext.battles[1].outcome, 'timeout');
  near(duringNext.battles[1].duration, 1);
  assert.equal(duringNext.legacy, 0);
});

test('Simulation: settings are opt-in; it does not silently supply manual evolution or disabled recruitment', () => {
  const off = simulateRun({ ...example, automation: { enabled: false } });
  assert.equal(off.outcome, 'lost');
  assert.equal(off.totalExperience, 0);
  const basic = simulateRun({ completedCycles: 2, talents: { spark: 1 }, automation: { enabled: true }, maxSeconds: 300 });
  assert.ok(basic.totalExperience > 0);
  assert.ok(basic.battles.every(battle => battle.playerEndAge === 1));
  assert.equal(basic.legacy, 0);
});

test('Simulation: repeated runs are deterministic and cannot mutate options, shared rules or classic defaults', () => {
  const before = JSON.stringify(example), classic = createGame();
  assert.deepEqual(simulateRun(example), simulateRun(example));
  assert.equal(JSON.stringify(example), before);
  assert.deepEqual(createGame(), classic);
  const permanent = createProgression().permanent;
  permanent.upgrades.production = 2;
  const first = createCivilizationRun(permanent), second = createCivilizationRun(permanent);
  first.run.upgrades.production = 5;
  first.run.talents.supply = 3;
  assert.equal(permanent.upgrades.production, 2);
  assert.equal(second.run.talents.supply, 0);
  assert.notEqual(first.run.runId, second.run.runId);
  assert.deepEqual(first.game, second.game);
});

test('Simulation: rejects misspelled keys, invalid types/ranges, unmet prerequisites and locked settings', () => {
  const invalid = [null, [], { typo: 1 }, { talents: [] }, { talents: { typo: 1 } },
    { talents: { spark: null } }, { talents: { spark: '1' } }, { talents: { spark: 2 } },
    { talents: { spark: -1 } }, { talents: { spark: 0.5 } }, { talents: { evolution: 1 } },
    { talents: { production: 1 } }, { challengeLevel: 1 }, { challengeLevel: -1 }, { challengeLevel: 11 },
    { challengeLevel: NaN }, { challengeLevel: '0' }, { automation: null }, { automation: { typo: true } },
    { automation: { unlocked: true } }, { automation: { enabled: true } },
    { talents: { spark: 1 }, automation: { evolve: true } },
    { ...example, automation: { weights: [0, 0, 0] } }, { ...example, automation: { reserve: -1 } },
    { ...example, automation: { queueLimit: 65 } }, { ...example, automation: { eliteLimit: 4 } },
    { maxSeconds: 0 }, { maxSeconds: Infinity }, { maxSeconds: 86401 }];
  for (const options of invalid) assert.throws(() => simulateRun(options), undefined, JSON.stringify(options));
  assert.equal(normalizeRunOptions().automation.enabled, false);
});

test('Grid: Cartesian product retains nested defaults and array values without mutating its source', () => {
  const spec = { base: { ...example, maxSeconds: 1 }, grid: {
    'talents.production': [1, 3], challengeLevel: [0, 1], 'automation.weights': [[2, 2, 1], [1, 1, 3]],
  } };
  const before = JSON.stringify(spec), rows = expandGrid(spec);
  assert.equal(rows.length, 8);
  assert.equal(new Set(rows.map(row => JSON.stringify(row))).size, 8);
  assert.deepEqual(rows[7].automation.weights, [1, 1, 3]);
  assert.equal(rows[7].talents.production, 3);
  assert.equal(rows[7].talents.warfare, example.talents.warfare);
  assert.equal(rows[7].challengeLevel, 1);
  rows[0].automation.weights[0] = 9;
  assert.deepEqual(rows[1].automation.weights, [1, 1, 3]);
  assert.equal(JSON.stringify(spec), before);
  assert.deepEqual(expandGrid({ grid: {} }), [{}]);
});

test('Grid: malformed axes, oversized grids and impossible combinations fail before simulation', () => {
  for (const spec of [null, {}, { grid: [] }, { base: null, grid: {} }, { grid: { typo: [1] } },
    { grid: { challengeLevel: [] } }, { grid: { challengeLevel: 1 } },
    { grid: { challengeLevel: [0, 1] } }, { grid: { maxSeconds: Array(10001).fill(1) } },
    { grid: { 'talents.__proto__': [1] } }]) assert.throws(() => expandGrid(spec));
});

test('CSV: quoted JSON and array axes are escaped and all battle times are exported', () => {
  const result = simulateRun(example);
  const csv = resultsToCSV([{ options: example, result }], ['automation.weights']);
  assert.ok(csv.startsWith('run,automation.weights,outcome,duration_seconds,battle_count,'));
  assert.ok(csv.includes('1,"[2,2,1]",won,'));
  assert.ok(csv.includes('""enemyStartAge"":1'));
  assert.ok(csv.includes('""talents"":{'));
  assert.equal(csv.trim().split('\n').length, 2);
  assert.ok(csv.includes(`,${result.battles[0].duration},${result.battles[1].duration},,,,`));
});

test('CLI: JSON/CSV outputs are parseable, progress stays on stderr and invalid grids preserve existing files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'before-stars-sim-'));
  const root = fileURLToPath(new URL('..', import.meta.url));
  const cli = args => spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 15000 });
  try {
    const config = join(dir, 'run.json'), grid = join(dir, 'grid.json'), output = join(dir, 'result.csv');
    writeFileSync(config, '{"maxSeconds":1}');
    const single = cli(['sim/run.js', config]);
    assert.equal(single.status, 0, single.stderr);
    assert.equal(JSON.parse(single.stdout).outcome, 'timeout');
    writeFileSync(grid, JSON.stringify({ base: { maxSeconds: 1 }, grid: { 'automation.target': ['front', 'heavy'] } }));
    const batch = cli(['sim/batch.js', grid]);
    assert.equal(batch.status, 0, batch.stderr);
    assert.equal(batch.stdout.trim().split('\n').length, 3);
    assert.ok(batch.stdout.startsWith('run,automation.target,'));
    assert.match(batch.stderr, /\[2\/2\]/);
    const file = cli(['sim/batch.js', grid, '--out', output]);
    assert.equal(file.status, 0, file.stderr);
    assert.equal(file.stdout, '');
    assert.equal(readFileSync(output, 'utf8'), batch.stdout);
    writeFileSync(grid, '{"grid":{"challengeLevel":[0,1]}}');
    const invalid = cli(['sim/batch.js', grid, '--out', output]);
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /Grid row 2/);
    assert.equal(readFileSync(output, 'utf8'), batch.stdout);
    const missing = join(dir, 'missing.csv');
    assert.equal(cli(['sim/batch.js', grid, '--out', missing]).status, 1);
    assert.equal(existsSync(missing), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

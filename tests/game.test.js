import { RULES, createGame, getRecruitState, recruit, updateGame } from '../src/game.js';

const tests = [];
const test = (name, run) => tests.push({ name, run });
function assert(condition, message = 'Assertion failed') {
  if (!condition) throw new Error(message);
}
function advance(game, seconds, action = () => {}) {
  for (let i = 0; i < Math.ceil(seconds / RULES.fixedStep); i++) {
    action(game);
    updateGame(game, RULES.fixedStep);
  }
}
let nextFixtureId = 1000;
function soldier(team, x, hp = RULES.unitHealth) {
  return { id: nextFixtureId++, team, x, hp, attackCooldown: 0, attackAnimation: 0, hitFlash: 0, moving: false };
}
function isolatedGame(units = []) {
  const game = createGame();
  game.enemyCooldown = Infinity;
  game.units = units;
  return game;
}

test('New game starts with two full bases, no troops, and recruitment ready', () => {
  const game = createGame();
  assert(game.status === 'playing' && game.elapsed === 0 && game.units.length === 0);
  assert(Object.values(game.bases).every(base => base.hp === RULES.baseHealth));
  assert(getRecruitState(game) === 'ready');
});

test('Recruitment creates one soldier and cannot bypass its cooldown', () => {
  const game = createGame();
  assert(recruit(game));
  assert(!recruit(game) && game.units.length === 1);
  advance(game, RULES.playerRecruitInterval + 0.02);
  assert(recruit(game) && game.units.filter(unit => unit.team === 'player').length === 2);
});

test('Army cap and an occupied spawn prevent recruitment', () => {
  const game = createGame();
  recruit(game);
  game.recruitCooldown = 0;
  assert(getRecruitState(game) === 'blocked' && !recruit(game));
  game.units = Array.from({ length: RULES.armyLimit }, (_, i) => soldier('player', 250 + i * 34));
  assert(getRecruitState(game) === 'full' && !recruit(game));
});

test('Enemy recruits automatically, with a delayed first wave', () => {
  const game = createGame();
  advance(game, 2);
  assert(game.units.length === 0);
  advance(game, 0.5);
  assert(game.units.length === 1 && game.units[0].team === 'enemy');
  advance(game, RULES.enemyRecruitInterval);
  assert(game.units.length === 2);
});

test('Both armies advance toward the opposing base', () => {
  const game = isolatedGame([soldier('player', 300), soldier('enemy', 900)]);
  advance(game, 1);
  assert(game.units[0].x > 350 && game.units[1].x < 850);
  assert(game.units.every(unit => unit.hp === RULES.unitHealth));
});

test('Opposing units never pass through each other before engaging', () => {
  const game = isolatedGame([soldier('player', 500), soldier('enemy', 540)]);
  advance(game, 1);
  assert(game.units[0].x < game.units[1].x);
  assert(game.units.every(unit => unit.hp < RULES.unitHealth));
  assert(Math.abs(game.units[1].x - game.units[0].x - RULES.attackRange) < 0.02);
});

test('Melee attacks respect cooldown and equally matched troops die together', () => {
  const game = isolatedGame([soldier('player', 500), soldier('enemy', 532)]);
  updateGame(game, RULES.fixedStep);
  assert(game.units.every(unit => unit.hp === RULES.unitHealth - RULES.unitDamage));
  advance(game, 0.4);
  assert(game.units.every(unit => unit.hp === RULES.unitHealth - RULES.unitDamage));
  advance(game, 3.2);
  assert(game.units.length === 0, 'Both soldiers must be removed after the fatal exchange');
});

test('Friendly soldiers queue without overlapping', () => {
  const game = isolatedGame([soldier('player', 400), soldier('player', 370), soldier('enemy', 432)]);
  advance(game, 2);
  assert(game.units[0].x - game.units[1].x >= RULES.unitSpacing - 0.01);
  assert(game.units[1].hp === RULES.unitHealth, 'Rear soldier should remain outside enemy melee range');
});

test('A soldier damages an undefended base without walking through it', () => {
  const game = isolatedGame([soldier('player', RULES.enemyBaseX - RULES.baseHalfWidth - RULES.attackRange)]);
  const startX = game.units[0].x;
  advance(game, 1);
  assert(game.bases.enemy.hp < RULES.baseHealth);
  assert(game.units[0].x === startX);
});

test('An enemy in melee range takes priority over the base', () => {
  const x = RULES.enemyBaseX - RULES.baseHalfWidth - RULES.attackRange;
  const game = isolatedGame([soldier('player', x), soldier('enemy', x + 25)]);
  updateGame(game, RULES.fixedStep);
  assert(game.bases.enemy.hp === RULES.baseHealth);
  assert(game.units[1].hp === RULES.unitHealth - RULES.unitDamage);
});

test('Destroying either base produces the correct result and freezes the game', () => {
  for (const team of ['player', 'enemy']) {
    const victim = team === 'player' ? 'enemy' : 'player';
    const game = isolatedGame([soldier(team, victim === 'enemy' ? 1086 : 194)]);
    game.bases[victim].hp = RULES.unitDamage;
    updateGame(game, RULES.fixedStep);
    assert(game.status === (team === 'player' ? 'won' : 'lost'));
    assert(game.bases[victim].hp === 0);
    const snapshot = JSON.stringify(game);
    advance(game, 10);
    assert(!recruit(game) && JSON.stringify(game) === snapshot);
  }
});

test('Simultaneous base destruction is a draw, regardless of unit order', () => {
  for (const reverse of [false, true]) {
    const units = [soldier('player', 1086), soldier('enemy', 194)];
    const game = isolatedGame(reverse ? units.reverse() : units);
    game.bases.player.hp = RULES.unitDamage;
    game.bases.enemy.hp = RULES.unitDamage;
    updateGame(game, RULES.fixedStep);
    assert(game.status === 'draw');
  }
});

test('Complete match: taking no action eventually loses', () => {
  const game = createGame();
  advance(game, 120);
  assert(game.status === 'lost', `Got ${game.status} at ${game.elapsed.toFixed(1)}s`);
});

test('Complete match: consistently recruiting can win', () => {
  const game = createGame();
  advance(game, 240, recruit);
  assert(game.status === 'won', `Got ${game.status} at ${game.elapsed.toFixed(1)}s`);
});

test('A new match shares no mutable state with the previous match', () => {
  const old = createGame();
  advance(old, 120, recruit);
  const fresh = createGame();
  assert(fresh.units.length === 0 && fresh.effects.length === 0);
  assert(fresh.bases.player.hp === RULES.baseHealth && fresh.bases.enemy.hp === RULES.baseHealth);
  assert(fresh.elapsed === 0 && fresh.recruitCooldown === 0 && fresh.enemyCooldown === RULES.enemyFirstSpawn);
  assert(fresh.bases !== old.bases && fresh.units !== old.units && fresh.status === 'playing');
});

test('Invalid time deltas cannot corrupt the simulation', () => {
  const game = createGame();
  const before = JSON.stringify(game);
  for (const dt of [0, -1, Infinity, NaN]) updateGame(game, dt);
  assert(before === JSON.stringify(game));
});

test('Browser UI: canvas draws, click and Space recruit, restart clears the match', async () => {
  const frame = document.createElement('iframe');
  const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
  frame.src = '../';
  frame.title = 'Game integration test';
  document.body.append(frame);
  await loaded;
  const page = frame.contentDocument;
  const button = page.getElementById('recruit');
  button.click();
  assert(page.getElementById('player-count').textContent === '1', 'Click should spawn a unit');
  assert(button.disabled, 'Recruitment should disable during cooldown');
  page.getElementById('restart').click();
  assert(page.getElementById('player-count').textContent === '0' && !button.disabled);
  assert(page.getElementById('clock').textContent === '00:00');
  page.body.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }));
  assert(page.getElementById('player-count').textContent === '1', 'Space should spawn a unit');
  page.getElementById('restart').click();
  assert(page.getElementById('enemy-count').textContent === '0' && page.getElementById('result').hidden);
  const canvas = page.getElementById('battlefield');
  assert(canvas.width > 0 && canvas.getContext('2d').getImageData(0, 0, 1, 1).data[3] === 255, 'Canvas should be painted');
  assert(page.documentElement.scrollWidth <= frame.clientWidth, 'Page should fit its viewport');
});

let failures = 0;
for (const { name, run } of tests) {
  const item = document.createElement('li');
  try {
    await run();
    item.className = 'pass';
    item.textContent = `PASS — ${name}`;
  } catch (error) {
    failures++;
    item.className = 'fail';
    item.textContent = `FAIL — ${name}: ${error.message}`;
  }
  document.getElementById('results').append(item);
}
document.getElementById('summary').textContent = `${tests.length - failures}/${tests.length} passed; ${failures} failed`;
document.body.dataset.testStatus = failures ? 'failed' : 'passed';

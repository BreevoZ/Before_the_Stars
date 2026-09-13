// The simulation has no DOM or rendering dependencies. All timings are seconds.
export const RULES = Object.freeze({
  width: 1280,
  height: 480,
  baseHealth: 360,
  baseHalfWidth: 54,
  playerBaseX: 108,
  enemyBaseX: 1172,
  unitHealth: 60,
  unitDamage: 12,
  unitSpeed: 62,
  attackInterval: 0.8,
  attackRange: 32,
  unitSpacing: 30,
  playerRecruitInterval: 1.5,
  // Slower than a full melee duel, so reinforcements can push the front forward.
  enemyRecruitInterval: 5,
  enemyFirstSpawn: 2.4,
  armyLimit: 16,
  fixedStep: 1 / 60,
});

export function createGame() {
  return {
    status: 'playing',
    elapsed: 0,
    bases: {
      player: { team: 'player', x: RULES.playerBaseX, hp: RULES.baseHealth, hitFlash: 0 },
      enemy: { team: 'enemy', x: RULES.enemyBaseX, hp: RULES.baseHealth, hitFlash: 0 },
    },
    units: [],
    effects: [],
    nextUnitId: 1,
    recruitCooldown: 0,
    enemyCooldown: RULES.enemyFirstSpawn,
  };
}

export function getRecruitState(game) {
  if (game.status !== 'playing') return 'finished';
  if (game.recruitCooldown > 0) return 'cooldown';
  if (game.units.filter(unit => unit.team === 'player').length >= RULES.armyLimit) return 'full';
  if (!spawnIsClear(game, 'player')) return 'blocked';
  return 'ready';
}

function spawnX(team) {
  return team === 'player' ? RULES.playerBaseX + 30 : RULES.enemyBaseX - 30;
}

function spawnIsClear(game, team) {
  return !game.units.some(unit => unit.team === team && Math.abs(unit.x - spawnX(team)) < RULES.unitSpacing);
}

function spawnUnit(game, team) {
  game.units.push({
    id: game.nextUnitId++, team, x: spawnX(team), hp: RULES.unitHealth,
    attackCooldown: 0, attackAnimation: 0, hitFlash: 0, moving: false,
  });
}

export function recruit(game) {
  if (getRecruitState(game) !== 'ready') return false;
  spawnUnit(game, 'player');
  game.recruitCooldown = RULES.playerRecruitInterval;
  return true;
}

export function updateGame(game, dt) {
  if (game.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
  // Bound large inputs; the browser feeds this function fixed steps.
  dt = Math.min(dt, 0.05);
  game.elapsed += dt;
  game.recruitCooldown = Math.max(0, game.recruitCooldown - dt);
  game.enemyCooldown = Math.max(0, game.enemyCooldown - dt);
  for (const base of Object.values(game.bases)) base.hitFlash = Math.max(0, base.hitFlash - dt);
  for (const effect of game.effects) effect.life -= dt;
  game.effects = game.effects.filter(effect => effect.life > 0);

  if (game.enemyCooldown === 0 && spawnIsClear(game, 'enemy') &&
      game.units.filter(unit => unit.team === 'enemy').length < RULES.armyLimit) {
    spawnUnit(game, 'enemy');
    game.enemyCooldown = RULES.enemyRecruitInterval;
  }

  // Snapshot positions so movement and attacks don't favor an array order or team.
  const positions = new Map(game.units.map(unit => [unit.id, unit.x]));
  const hits = [];
  for (const unit of game.units) {
    unit.attackCooldown = Math.max(0, unit.attackCooldown - dt);
    unit.attackAnimation = Math.max(0, unit.attackAnimation - dt);
    unit.hitFlash = Math.max(0, unit.hitFlash - dt);
    unit.moving = false;
    const direction = unit.team === 'player' ? 1 : -1;
    const origin = positions.get(unit.id);
    const base = game.bases[unit.team === 'player' ? 'enemy' : 'player'];
    let closestEnemy = null;
    let enemyDistance = Infinity;
    let allySpace = Infinity;

    for (const other of game.units) {
      if (other.id === unit.id) continue;
      const distance = positions.get(other.id) - origin;
      if (other.team !== unit.team && Math.abs(distance) < enemyDistance) {
        closestEnemy = other;
        enemyDistance = Math.abs(distance);
      } else if (other.team === unit.team && distance * direction > 0) {
        allySpace = Math.min(allySpace, distance * direction - RULES.unitSpacing);
      }
    }

    const baseDistance = Math.abs(base.x - origin) - RULES.baseHalfWidth;
    const target = enemyDistance <= RULES.attackRange + 0.01 ? closestEnemy :
      baseDistance <= RULES.attackRange + 0.01 ? base : null;
    if (target) {
      if (unit.attackCooldown === 0) {
        hits.push({ target, attacker: unit });
        unit.attackCooldown = RULES.attackInterval;
        unit.attackAnimation = 0.25;
      }
    } else {
      // Half the closing gap avoids opposing soldiers crossing in one simulation step.
      const step = Math.max(0, Math.min(RULES.unitSpeed * dt, allySpace,
        (enemyDistance - RULES.attackRange) / 2, baseDistance - RULES.attackRange));
      unit.x += direction * step;
      unit.moving = step > 0.001;
    }
  }

  // Apply all strikes together: equally matched soldiers can defeat each other.
  for (const { target, attacker } of hits) {
    target.hp = Math.max(0, target.hp - RULES.unitDamage);
    target.hitFlash = 0.14;
    game.effects.push({ x: (attacker.x + target.x) / 2, team: attacker.team, life: 0.22 });
  }
  game.units = game.units.filter(unit => unit.hp > 0);
  const playerLost = game.bases.player.hp === 0;
  const enemyLost = game.bases.enemy.hp === 0;
  if (playerLost || enemyLost) {
    game.status = playerLost && enemyLost ? 'draw' : playerLost ? 'lost' : 'won';
  }
}

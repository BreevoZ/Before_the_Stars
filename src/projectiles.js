// Presentation only: damage, flight duration and targeting remain in game.js.
const PROFILES = Object.freeze({
  sling: { motion: 'ballistic', arc: 24, impact: 'stone', life: 0.35 },
  stone: { motion: 'ballistic', arc: 48, impact: 'stone', life: 0.4 },
  boulder: { motion: 'ballistic', arc: 85, impact: 'rubble', life: 0.65 },
  arrow: { motion: 'ballistic', arc: 10, impact: 'arrow', life: 0.7 },
  bolt: { motion: 'ballistic', arc: 4, impact: 'arrow', life: 0.6 },
  egg: { motion: 'ballistic', arc: 16, impact: 'egg', life: 0.5 },
  fireball: { motion: 'ballistic', arc: 90, impact: 'fire', life: 0.7, ground: true },
  oil: { motion: 'pour', impact: 'oil', life: 0.65, ground: true },
  bullet: { motion: 'direct', impact: 'bullet', life: 0.2 },
  cannon: { motion: 'direct', impact: 'solid', life: 0.45 },
  shell: { motion: 'direct', impact: 'explosion', life: 0.65 },
  rocket: { motion: 'powered', arc: 45, impact: 'explosion', life: 0.8 },
  plasma: { motion: 'direct', impact: 'plasma', life: 0.3 },
  'plasma-orb': { motion: 'direct', impact: 'plasma', life: 0.55 },
  rail: { motion: 'direct', impact: 'rail', life: 0.28 },
  laser: { motion: 'beam', impact: 'laser', life: 0.18 },
  ion: { motion: 'beam', impact: 'ion', life: 0.4 },
});
export function getProjectileProfile(shot) {
  const profile = PROFILES[shot.kind] ?? PROFILES.bullet;
  // The short howitzer is lobbed; tank shells and solid cannonballs are direct.
  if (shot.kind === 'shell' && shot.arc > 0) return { ...profile, motion: 'ballistic', arc: shot.arc };
  if (shot.kind === 'cannon' && shot.splash > 0) return { ...profile, impact: 'explosion', life: 0.6 };
  return profile;
}

export function getProjectilePose(shot, scale = 1, progress = 1 - shot.remaining / shot.duration) {
  const t = Math.max(0, Math.min(1, progress)), profile = getProjectileProfile(shot);
  const origin = shot.fromBaseX ?? shot.fromUnitX ?? shot.fromTurretX;
  const fromX = origin === undefined ? shot.fromX : origin + (shot.fromX - origin) * scale;
  const fromY = shot.fromY * scale, toX = shot.toX + (shot.toOffsetX ?? 0) * scale;
  const toY = (profile.ground ? -3 : shot.toY ?? -30) * scale;
  const dx = toX - fromX, dy = toY - fromY;
  let travel = t, y, tangentY;
  // A high emplacement still needs launch lift when its target is close below it.
  const arc = Math.min((shot.arc ?? profile.arc ?? 0) * scale, Math.abs(dx) * 0.35 + Math.max(0, dy) * 0.25);
  if (profile.motion === 'pour') {
    y = fromY + dy * t * t; tangentY = 2 * dy * t;
  } else if (profile.motion === 'powered') {
    // Motor acceleration with a shallow launch rise, then a downward approach.
    travel = 0.3 * t + 0.7 * t * t;
    y = fromY + dy * travel - 4 * arc * travel * (1 - travel);
    tangentY = dy - 4 * arc * (1 - 2 * travel);
  } else if (profile.motion === 'ballistic') {
    y = fromY + dy * t - 4 * arc * t * (1 - t);
    tangentY = dy - 4 * arc * (1 - 2 * t);
  } else {
    y = fromY + dy * t; tangentY = dy;
  }
  return { x: fromX + dx * travel, y, angle: Math.atan2(tangentY, dx), fromX, fromY, toX, toY, progress: t };
}

export function createProjectileImpact(shot, surface = 'soft') {
  const profile = getProjectileProfile(shot), pose = getProjectilePose(shot, 1, 1);
  return { kind: 'impact', style: profile.impact, weapon: shot.kind, x: pose.x, y: pose.y,
    anchorX: shot.targetBase ? shot.toX : undefined, angle: pose.angle, team: shot.team, surface,
    radius: shot.splash || 0, life: profile.life, duration: profile.life,
    followTargetId: profile.impact === 'arrow' ? shot.targetId : null };
}

const clamp = value => Math.max(0, Math.min(1, value));
function curve(time, keys) {
  for (let i = 1; i < keys.length; i++) {
    const [end, to] = keys[i], [start, from] = keys[i - 1];
    if (time <= end) {
      const t = clamp((time - start) / (end - start));
      return from + (to - from) * t * t * (3 - 2 * t);
    }
  }
  return keys.at(-1)[1];
}

// Aim in the mount's frame, then undo the rider's lean at the grip. The
// rider can brace and recover while the entire weapon follows one straight axis.
function mountedThrust(pose, seat, restHand, weaponAngle, travel) {
  const grip = [restHand[0] + Math.cos(weaponAngle) * travel * pose.drive,
    restHand[1] + Math.sin(weaponAngle) * travel * pose.drive];
  return { ...pose, weaponAngle,
    hand: rotatePoint([grip[0] - pose.body.x, grip[1] - pose.body.y], seat, -pose.riderLean) };
}

// Melee damage resolves when attackAnimation starts. Prepare during the final
// cooldown (or final approach for the first hit), reach contact on that frame,
// then recover at the weapon's pace.
export function getMeleeMotion(type, { remaining = 0, duration = 1, cooldown = 0, moving = false, charged = false, reduced = false, approach = 0 } = {}) {
  const active = !reduced && remaining > 0;
  const preparation = !reduced && !active && (approach > 0 || (!moving && cooldown > 0 && cooldown < 0.22));
  const progress = clamp(1 - remaining / duration), lead = clamp(approach > 0 ? approach : 1 - cooldown / 0.22);
  const drive = active ? curve(progress, [[0, 1], [0.08, 1], [0.34, 0.72], [0.8, 0], [1, 0]])
    : preparation ? curve(lead, [[0, 0], [0.35, -0.22], [1, 1]]) : 0;
  const recoil = active ? curve(progress, [[0, 0], [0.3, 1], [0.85, 0], [1, 0]]) : 0;
  if (type === 'heavy') return mountedThrust({
    drive, body: { x: drive * 2.5, y: Math.abs(drive) * 1.1 },
    neckAngle: drive * 0.2, tailLift: drive * 5 - recoil,
    jawAngle: preparation ? curve(lead, [[0, 0], [0.4, 0.46], [0.7, 0.38], [1, 0]]) : active ? recoil * 0.055 : 0,
    riderLean: drive * 0.1 - recoil * 0.025,
  }, [-8, -52], [9, -65], 0.04, 18);
  if (type === 'knight') {
    const charge = !reduced && charged;
    return mountedThrust({ drive, body: { x: drive * (charge ? 1.8 : 0.9), y: Math.abs(drive) * (charge ? 1.1 : 0.5) },
      riderLean: drive * (charge ? 0.19 : 0.11) - recoil * 0.025,
      neckAngle: drive * 0.055, capeLift: drive * (charge ? 6 : 3) + recoil * 2,
    }, [-6, -48], [14, -61], 0.08, charge ? 22 : 18);
  }
  return { drive, body: { x: drive * 8, y: Math.abs(drive) * 1.5 },
    hand: [13 + drive * 17, -33 - drive * 6], knifeAngle: -0.95 + Math.max(0, drive) * 0.95,
    guard: [-10 - drive * 2, -34 - drive * 5] };
}

export function rotatePoint([x, y], [px, py], angle) {
  const dx = x - px, dy = y - py;
  return [px + dx * Math.cos(angle) - dy * Math.sin(angle), py + dx * Math.sin(angle) + dy * Math.cos(angle)];
}

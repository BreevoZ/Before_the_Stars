// Distance drives the gait: during stance the foot moves back exactly as far
// as the animal moves forward, so a planted foot stays at one world position.
const TAU = Math.PI * 2;
const fraction = value => ((value % 1) + 1) % 1;

export function solveJoint(hip, ankle, upper, lower, bend) {
  const dx = ankle[0] - hip[0], dy = ankle[1] - hip[1];
  const distance = Math.max(0.001, Math.hypot(dx, dy));
  const cosine = Math.max(-1, Math.min(1, (upper * upper + distance * distance - lower * lower) / (2 * upper * distance)));
  const angle = Math.atan2(dy, dx) + bend * Math.acos(cosine);
  return [hip[0] + Math.cos(angle) * upper, hip[1] + Math.sin(angle) * upper];
}

function bones(joints, lengths, widths) {
  return lengths.map((length, i) => ({ from: joints[i], to: joints[i + 1], length, width: widths[i] }));
}

function horseLeg(spec, foot, body, lift) {
  const hip = [spec.x + body.x, (spec.front ? -39 : -37) + body.y];
  const fetlock = [foot[0] - (spec.front ? 3 : 4), foot[1] - 4];
  if (spec.front) {
    // The elbow points back; the carpus folds forward with the hoof tucked
    // behind it. Under load the forearm and cannon stay almost in one line.
    const reach = Math.max(30.85 - (lift / 8) * 9.35, Math.hypot(fetlock[0] - hip[0], fetlock[1] - hip[1]) - 10 + 0.02);
    const elbow = solveJoint(hip, fetlock, 10, reach, 1);
    const carpus = solveJoint(elbow, fetlock, 18, 13, -1);
    const joints = [hip, elbow, carpus, fetlock, foot];
    return { hip, elbow, carpus, fetlock, joints, bones: bones(joints, [10, 18, 13, 5], [6, 4.5, 3, 2.7]) };
  }
  // The stifle is high and forward, the hock behind it, then the long cannon
  // reaches the fetlock. Keeping those joints separate avoids a reversed knee.
  const forwardReach = Math.max(0, foot[0] - hip[0]);
  const hockBack = Math.min(10.5, 2 + forwardReach * 0.5);
  const hock = [fetlock[0] - hockBack, fetlock[1] - Math.sqrt(13 ** 2 - hockBack ** 2)];
  const stifle = solveJoint(hip, hock, 14, 19, -1);
  const joints = [hip, stifle, hock, fetlock, foot];
  return { hip, stifle, hock, fetlock, joints, bones: bones(joints, [14, 19, 13, Math.hypot(4, 4)], [7, 5, 3, 2.7]) };
}

export function getMountPose({ horse = false, distance = 0, moving = false, strike = 0, offset = 0, bodyOffset = { x: 0, y: 0 } } = {}) {
  const stride = horse ? 48 : 38, duty = horse ? 0.66 : 0.64;
  const cycle = fraction(distance / stride + offset);
  const body = { x: strike * 3 + bodyOffset.x, y: bodyOffset.y + (moving ? (horse ? -0.6 : -1) + Math.cos(cycle * TAU * 2) * (horse ? 0.45 : 0.75) : 0) };
  const specs = horse
    ? [{ far: true, front: false, x: -24, phase: 0.5 }, { far: true, front: true, x: 17, phase: 0.75 },
      { far: false, front: false, x: -20, phase: 0 }, { far: false, front: true, x: 22, phase: 0.25 }]
    : [{ far: true, front: false, x: -17, phase: 0.5 }, { far: false, front: false, x: -8, phase: 0 }];
  const legs = specs.map(spec => {
    const phase = fraction(cycle + spec.phase), planted = !moving || phase < duty;
    const halfStep = stride * duty / 2;
    let dx = 0, lift = 0;
    if (moving && planted) dx = halfStep - phase * stride;
    else if (moving) {
      const swing = (phase - duty) / (1 - duty);
      const ease = swing * swing * (3 - 2 * swing);
      // Match the stance velocity at lift-off and touchdown; the foot does not
      // snap from forward travel to a planted pose at the cycle boundary.
      dx = -halfStep + ease * halfStep * 2 - stride * (1 - duty) * swing * (1 - swing) * (1 - 2 * swing);
      lift = Math.sin(Math.PI * swing) ** 2 * (horse ? (spec.front ? 8 : 6) : 9);
    }
    const foot = [spec.x + dx, -2 - lift];
    if (horse) return { ...spec, phase, planted, foot, ...horseLeg(spec, foot, body, lift) };
    const hip = [spec.x + body.x, -31 + body.y];
    const ankle = [foot[0] - 6, foot[1] - 5];
    const upper = 20, lower = 18, knee = solveJoint(hip, ankle, upper, lower, -1);
    const joints = [hip, knee, ankle, foot];
    return { ...spec, phase, planted, hip, knee, ankle, foot, upper, lower, joints,
      bones: bones(joints, [upper, lower, Math.hypot(6, 5)], [9, 5, 4]) };
  });
  return { body, legs, sway: moving ? Math.sin(cycle * TAU) : 0, cycle, stride, duty };
}

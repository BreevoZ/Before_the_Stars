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
      lift = Math.sin(Math.PI * swing) ** 2 * (horse ? 8 : 9);
    }
    const foot = [spec.x + dx, -2 - lift];
    const hip = [spec.x + body.x, (horse ? -32 : -31) + body.y];
    const ankle = [foot[0] - (spec.front ? 1 : horse ? 4 : 6), foot[1] - (horse ? 4 : 5)];
    const upper = horse ? 19 : 20, lower = 18;
    return { ...spec, phase, planted, hip, knee: solveJoint(hip, ankle, upper, lower, spec.front ? 1 : -1), ankle, foot, upper, lower };
  });
  return { body, legs, sway: moving ? Math.sin(cycle * TAU) : 0, cycle, stride, duty };
}

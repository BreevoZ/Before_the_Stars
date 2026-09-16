import { UNITS, TURRETS, ABILITIES, RULES, createGame, updateGame } from '../src/game.js';
import { getMountPose, solveJoint } from '../src/mount-motion.js';
import { getMeleeMotion, rotatePoint } from '../src/melee-motion.js';
import { ANIMATION_CLIPS, createClipSampler, createClipPainter } from '../src/animation-clips.js';

export function registerAnimationTests(test, assert, near) {
  test('Mounts keep planted feet still in world space, with separate two- and four-leg support patterns', () => {
    for (const horse of [false, true]) {
      const stride = getMountPose({ horse }).stride;
      for (let i = 0; i < 240; i++) {
        const distance = i * stride / 240;
        const a = getMountPose({ horse, moving: true, distance });
        const b = getMountPose({ horse, moving: true, distance: distance + 0.01 });
        assert(a.legs.length === (horse ? 4 : 2));
        assert(a.legs.filter(leg => leg.planted).length >= (horse ? 2 : 1), 'A walking mount must retain ground support');
        a.legs.forEach((leg, index) => {
          assert(leg.foot[1] <= -2, 'Feet may not sink below the ground');
          if (leg.planted) near(leg.foot[1], -2);
          if (leg.planted && b.legs[index].planted && b.legs[index].phase > leg.phase) {
            for (const facing of [-1, 1]) near(facing * (distance + leg.foot[0]), facing * (distance + 0.01 + b.legs[index].foot[0]), 'Planted feet must not skate');
          }
        });
      }
    }
  });

  test('Mount joints retain bone lengths and cross lift-off, touchdown and loop boundaries continuously', () => {
    for (const horse of [false, true]) {
      const { stride, duty } = getMountPose({ horse });
      for (const moving of [false, true]) for (const strike of [0, 1]) for (let i = 0; i < 120; i++) {
        const pose = getMountPose({ horse, moving, strike, distance: stride * i / 120 });
        for (const leg of pose.legs) {
          for (const bone of leg.bones) near(Math.hypot(bone.from[0] - bone.to[0], bone.from[1] - bone.to[1]), bone.length,
            `${horse ? 'Horse' : 'Dinosaur'} bone at phase ${i / 120}`);
        }
      }
      for (const boundary of [duty * stride, stride]) {
        const legAt = distance => getMountPose({ horse, distance, moving: true }).legs.find(leg => leg.phase !== undefined && !leg.far && !leg.front);
        const a = legAt(boundary - 0.0001), b = legAt(boundary), c = legAt(boundary + 0.0001);
        assert(Math.hypot(a.foot[0] - c.foot[0], a.foot[1] - c.foot[1]) < 0.001);
        a.joints.forEach((joint, index) => assert(Math.hypot(joint[0] - c.joints[index][0], joint[1] - c.joints[index][1]) < 0.01, 'Joints must not pop at lift-off or touchdown'));
        assert(Math.abs((b.foot[0] - a.foot[0]) / 0.0001 - (c.foot[0] - b.foot[0]) / 0.0001) < 0.01, 'Foot velocity must not snap at contact');
      }
    }
  });

  test('Horse forelegs keep a straight loaded carpus and tuck correctly; hind legs have separate forward stifles and backward hocks', () => {
    const turn = (a, b, c) => (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    const length = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    let liftedForeleg = false;
    for (const moving of [false, true]) for (let frame = 0; frame < 240; frame++) {
      const pose = getMountPose({ horse: true, moving, distance: frame * 48 / 240 });
      for (const leg of pose.legs) {
        assert(leg.joints.length === 5, 'Include the proximal joint, carpus/hock, fetlock and hoof');
        if (leg.front) {
          assert(turn(leg.hip, leg.elbow, leg.carpus) < 0, 'The elbow must point backward');
          assert(turn(leg.elbow, leg.carpus, leg.fetlock) > 0, 'The foreleg carpus must not bend backward');
          const straightness = length(leg.elbow, leg.fetlock) / (18 + 13);
          if (leg.planted) assert(straightness > 0.99, 'Loaded forelegs should not stay deeply buckled');
          if (!leg.planted && leg.foot[1] < -9) {
            assert(straightness < 0.8, 'Fold the carpus when lifting the hoof');
            assert(leg.fetlock[0] < leg.carpus[0], 'A lifted front hoof tucks behind the carpus');
            liftedForeleg = true;
          }
        } else {
          assert(turn(leg.hip, leg.stifle, leg.hock) > 0, 'The stifle must fold forward');
          assert(turn(leg.stifle, leg.hock, leg.fetlock) < 0, 'The hock must fold backward');
          assert(leg.stifle[1] < leg.hock[1] && leg.hock[1] < leg.fetlock[1], 'Keep the rear joints in anatomical order');
        }
        for (const facing of [-1, 1]) {
          const [a, b, c] = (leg.front ? [leg.elbow, leg.carpus, leg.fetlock] : [leg.stifle, leg.hock, leg.fetlock])
            .map(([x, y]) => [x * facing, y]);
          assert(turn(a, b, c) * facing * (leg.front ? 1 : -1) > 0, 'Mirroring must preserve the joint bend relative to facing');
        }
      }
    }
    assert(liftedForeleg);
  });

  test('Mounted and dagger attacks prepare continuously, contact on damage, then settle without residual motion', () => {
    const numbers = value => typeof value === 'number' ? [value] : Object.values(value).flatMap(numbers);
    const closePose = (a, b) => numbers(a).forEach((value, index) => near(value, numbers(b)[index]));
    for (const type of ['heavy', 'knight', 'commando']) for (const charged of [false, true]) {
      const duration = UNITS[type].attackDuration;
      const pose = values => getMeleeMotion(type, { duration, charged, ...values });
      const idle = pose({}), contact = pose({ remaining: duration });
      assert(pose({ cooldown: 0.15 }).drive < 0, `${type}: weight must load before advancing`);
      near(contact.drive, 1, `${type}: visual contact must coincide with damage`);
      closePose(pose({ cooldown: 0.000001 }), contact);
      closePose(pose({ cooldown: 0.22 - 0.000001 }), idle);
      closePose(pose({ remaining: 0.000001 }), idle);
      closePose(pose({ remaining: duration, cooldown: 0.1, moving: true, reduced: true }), idle);
      let previous = contact.drive;
      for (let i = 1; i <= 100; i++) {
        const next = pose({ remaining: duration * (1 - i / 100) }).drive;
        assert(next <= previous + 0.00001, 'Recovery must not thrust for a second time'); previous = next;
      }
    }
    assert(getMeleeMotion('heavy', { cooldown: 0.12 }).jawAngle > 0.4, 'Open the mouth before biting');
    near(getMeleeMotion('heavy', { remaining: 0.6, duration: 0.6 }).jawAngle, 0);
    assert(getMeleeMotion('knight', { remaining: 0.5, duration: 0.5, charged: true }).riderLean
      > getMeleeMotion('knight', { remaining: 0.5, duration: 0.5 }).riderLean, 'A charge needs a stronger rider brace');
  });

  test('Attack weight shifts keep mount feet planted and preserve arm and leg lengths through preparation and recovery', () => {
    const length = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    for (const type of ['heavy', 'knight', 'commando']) for (const charged of [false, true]) for (let i = 0; i <= 120; i++) {
      const duration = UNITS[type].attackDuration;
      const attack = getMeleeMotion(type, { duration, charged,
        cooldown: i < 40 ? 0.22 * (1 - i / 40) : 0,
        remaining: i >= 40 ? duration * (1 - (i - 40) / 80) : 0 });
      if (type !== 'commando') {
        const resting = getMountPose({ horse: type === 'knight' });
        const mount = getMountPose({ horse: type === 'knight', bodyOffset: attack.body });
        mount.legs.forEach((leg, index) => {
          near(length(leg.foot, resting.legs[index].foot), 0, 'Body momentum must not move planted feet');
          for (const bone of leg.bones) near(length(bone.from, bone.to), bone.length);
        });
      } else for (const side of [-1, 1]) {
        const hip = [side * 5 + attack.body.x, -24 + attack.body.y], ankle = [side < 0 ? -9 : 14, -5];
        const knee = solveJoint(hip, ankle, 14, 13, -1);
        near(length(hip, knee), 14); near(length(knee, ankle), 13);
      }
      const shoulder = type === 'heavy' ? [-4, -64] : type === 'knight' ? [4, -64] : [5, -40];
      const upper = type === 'heavy' ? 15 : 16, lower = type === 'heavy' ? 14 : 15;
      const elbow = solveJoint(shoulder, attack.hand, upper, lower, 1);
      near(length(shoulder, elbow), upper); near(length(elbow, attack.hand), lower, `${type}: the gripping arm must not stretch`);
    }
  });

  test('Both mounted weapons extend and retract on one fixed axis, even while the rider braces for a charge', () => {
    for (const type of ['heavy', 'knight']) for (const charged of [false, true]) {
      const seat = type === 'heavy' ? [-8, -52] : [-6, -48];
      const duration = UNITS[type].attackDuration;
      const pose = input => getMeleeMotion(type, { duration, charged, ...input });
      const grip = motion => {
        const hand = rotatePoint(motion.hand, seat, motion.riderLean);
        return [hand[0] + motion.body.x, hand[1] + motion.body.y];
      };
      const resting = pose({}), start = grip(resting), angle = resting.weaponAngle;
      const axis = [Math.cos(angle), Math.sin(angle)];
      let pulledBack = false, extended = false;
      for (let frame = 0; frame <= 140; frame++) {
        const motion = pose(frame < 40 ? { cooldown: 0.22 * (1 - frame / 40) }
          : { remaining: duration * (1 - (frame - 40) / 100) });
        const hand = grip(motion), dx = hand[0] - start[0], dy = hand[1] - start[1];
        near(motion.weaponAngle, angle, 'A straight thrust must not turn into a sweeping arc');
        near(dx * -axis[1] + dy * axis[0], 0, 'Rider lean must not lift the weapon off its attack line');
        const extension = dx * axis[0] + dy * axis[1];
        pulledBack ||= extension < -3; extended ||= extension > 17;
        if (frame === 40) assert(extension > 17, `${type}: extend the spear at contact`);
        if (frame === 140) near(extension, 0, 'Retract along the same line');
      }
      assert(pulledBack && extended, `${type}: the rider must draw back and drive the weapon forward`);
    }
  });

  test('First melee contact is anticipated during approach without delaying damage or animating an empty march', () => {
    for (const type of ['heavy', 'knight', 'commando']) for (const team of ['player', 'enemy']) {
      const game = createGame(); game.ai.enabled = false;
      const direction = team === 'player' ? 1 : -1, stats = UNITS[type];
      const attacker = { id: 1, type, team, x: 640, hp: stats.health, attackCooldown: 0, attackAnimation: 0, hitFlash: 0 };
      const target = { id: 2, type: 'swordsman', team: team === 'player' ? 'enemy' : 'player', x: 640 + direction * 140,
        hp: 1e8, attackCooldown: 1000, attackAnimation: 0, hitFlash: 0 };
      game.units.push(attacker, target);
      let prepared = false, biteOpened = false, hit = false;
      near(getMeleeMotion(type, { moving: true }).drive, 0, 'An empty march must not swing a weapon');
      for (let frame = 0; frame < 300 && !hit; frame++) {
        updateGame(game, RULES.fixedStep);
        const motion = getMeleeMotion(type, { duration: stats.attackDuration, remaining: attacker.attackAnimation,
          cooldown: attacker.attackCooldown, moving: attacker.moving, approach: attacker.attackApproach });
        if (!attacker.attackAnimation) {
          prepared ||= attacker.attackApproach > 0 && motion.drive > 0.5;
          biteOpened ||= motion.jawAngle > 0.4;
        } else {
          hit = true; near(motion.drive, 1); assert(target.hp < 1e8, 'Contact must immediately resolve damage');
        }
      }
      assert(prepared && hit, `${type}: the first approach must prepare and hit`);
      if (type === 'heavy') assert(biteOpened, 'The first bite must open its jaws before contact');
    }
  });

  test('Real melee hits arrive at the contact pose on both teams and the commando uses a knife impact', () => {
    for (const type of ['heavy', 'knight', 'commando']) for (const team of ['player', 'enemy']) {
      const sample = createClipSampler(ANIMATION_CLIPS.find(clip => clip.id === `combat-unit-${type}`), team);
      let hits = 0, previous = 0;
      for (let frame = 0; frame <= 170; frame++) {
        const { game, sourceId } = sample(frame / 60), source = game.units.find(unit => unit.id === sourceId);
        if (source.attackAnimation > previous) {
          const motion = getMeleeMotion(type, { remaining: source.attackAnimation, duration: UNITS[type].attackDuration,
            cooldown: source.attackCooldown, charged: source.lastAttackCharged });
          near(motion.drive, 1);
          const style = { heavy: 'bite', knight: 'thrust', commando: 'knife' }[type];
          assert(game.effects.some(effect => effect.kind === 'impact' && effect.style === style && effect.life > 0.2), `${type}: impact must match the contact frame`);
          hits++;
        }
        previous = source.attackAnimation;
      }
      assert(hits >= 2, `${type}: verify consecutive attacks`);
    }
  });

  test('Animation catalog covers every unit, turret, weapon, ability and era; replaying earlier frames is deterministic', () => {
    for (const [kind, types] of [['unit', UNITS], ['turret', TURRETS], ['ability', ABILITIES]]) {
      for (const type of Object.keys(types)) assert(ANIMATION_CLIPS.some(clip => clip.kind === kind && clip.type === type), `${kind} ${type} missing`);
    }
    assert(ANIMATION_CLIPS.filter(clip => clip.kind === 'base').length === 5);
    assert(ANIMATION_CLIPS.some(clip => clip.kind === 'sky') && ANIMATION_CLIPS.some(clip => clip.kind === 'stars'));
    assert(ANIMATION_CLIPS.filter(clip => clip.kind === 'field').length === 2);
    for (const clip of ANIMATION_CLIPS.filter(clip => ['combat', 'ability'].includes(clip.kind))) for (const team of ['player', 'enemy']) {
      const sample = createClipSampler(clip, team);
      const initial = JSON.stringify(sample(1.2).game);
      sample(7.8);
      assert(JSON.stringify(sample(1.2).game) === initial, `${clip.id}: backwards seek must reproduce the same simulation`);
      assert(JSON.stringify(sample(0).game) === JSON.stringify(createClipSampler(clip, team)(0).game));
    }
  });

  test('Animation combat scenes run real weapon, burst, charge, field and healing behavior', () => {
    for (const clip of ANIMATION_CLIPS.filter(clip => clip.kind === 'combat')) {
      const stats = (clip.source === 'unit' ? UNITS : TURRETS)[clip.type];
      const sample = createClipSampler(clip, 'player'), shots = new Set(), impacts = new Set();
      let fields = false, charged = false, burst = false;
      for (let i = 0; i <= 150; i++) {
        const { game } = sample(i / 60);
        game.projectiles.forEach(shot => shots.add(shot.kind));
        game.effects.filter(effect => effect.kind === 'impact').forEach(effect => impacts.add(effect.style));
        fields ||= game.fields.length > 0;
        const source = clip.source === 'unit' ? game.units[0] : game.turrets.player[0];
        charged ||= source.lastAttackCharged || source.chargeRemaining > 0;
        burst ||= source.burstRemaining > 0;
      }
      if (clip.melee) assert(shots.size === 0 && sample(0.4).game.units[0].attackStyle === 'melee', `${clip.id}: close combat must use a punch without projectiles`);
      else if (stats.projectile) assert(shots.has(stats.projectile), `${clip.id}: missing real projectile`);
      assert(impacts.size > 0, `${clip.id}: missing impact`);
      if (stats.field) assert(fields, `${clip.id}: missing ground field`);
      if (stats.chargeTime || stats.chargeDamage) assert(charged, `${clip.id}: missing charge`);
      if (stats.burst) assert(burst, `${clip.id}: missing burst`);
    }
    const renewal = createClipSampler(ANIMATION_CLIPS.find(clip => clip.id === 'ability-renewal'), 'player');
    const hp = renewal(0).game.units[0].hp;
    assert(renewal(2).game.units[0].hp > hp);
  });

  test('Every animation card paints at both sizes and teams, including backward seeks and all unit actions', () => {
    const canvas = document.createElement('canvas'); document.body.append(canvas);
    try {
      for (const width of [320, 800]) {
        canvas.style.width = `${width}px`; canvas.style.height = `${width === 320 ? 220 : 400}px`;
        for (const clip of ANIMATION_CLIPS) {
          const paint = createClipPainter(canvas, clip);
          for (const team of ['player', 'enemy']) {
            for (const time of [0.4, 1.1, 5.9, 0.4]) paint(time, { team, action: 'attack' });
            if (clip.kind === 'unit') for (const action of ['march', 'idle', 'hit']) paint(0.1, { team, action, guides: true });
          }
          assert(canvas.width > 0 && Number.isFinite(canvas.getContext('2d').getTransform().a));
        }
      }
    } finally { canvas.remove(); }
  });

  test('Animation workshop filters, pauses, steps, scrubs and synchronizes its enlarged viewer without a match', async () => {
    const frame = document.createElement('iframe'); frame.title = 'Animation workshop integration test';
    const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
    frame.src = '../animations.html'; document.body.append(frame); await loaded;
    try {
      const page = frame.contentDocument, el = id => page.getElementById(id);
      const event = (id, value, type = 'change') => { el(id).value = value; el(id).dispatchEvent(new frame.contentWindow.Event(type)); };
      assert(page.querySelectorAll('.clip').length === ANIMATION_CLIPS.length);
      page.querySelector('[data-category="unit"]').click();
      assert(page.querySelectorAll('.clip:not([hidden])').length === Object.keys(UNITS).length);
      event('search', '恐龙', 'input'); assert(page.querySelectorAll('.clip:not([hidden])').length === 1);
      event('era', '5'); assert(!el('empty').hidden);
      event('era', 'all'); event('search', '', 'input');
      event('timeline', '0', 'input');
      assert(page.body.dataset.paused === 'true');
      page.querySelector('[data-control="step"]').click(); near(Number(el('timeline').value), 1 / 60);
      event('timeline', '1.5', 'input'); near(Number(el('viewer-timeline').value), 1.5);
      event('speed', '0.25'); assert(el('viewer-speed').value === '0.25');
      page.querySelector('[data-clip="unit-heavy"] button').click();
      assert(el('viewer').open && el('viewer-title').textContent === UNITS.heavy.name);
      event('viewer-team', 'enemy'); event('viewer-action', 'hit');
      assert(el('team').value === 'enemy' && el('action').value === 'hit');
      event('viewer-timeline', '0.5', 'input'); near(Number(el('timeline').value), 0.5);
      page.querySelector('#viewer [data-control="play"]').click(); assert(page.body.dataset.paused === 'false');
      page.querySelector('#viewer [data-control="step"]').click(); assert(page.body.dataset.paused === 'true');
      el('close-viewer').click(); assert(!el('viewer').open);
      assert(page.querySelector('a[href="./index.html"]') && page.querySelector('a[href="./units.html"]') && page.querySelector('a[href="./turrets.html"]'));
    } finally { frame.remove(); }
  });
}

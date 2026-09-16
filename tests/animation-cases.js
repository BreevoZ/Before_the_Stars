import { UNITS, TURRETS, ABILITIES } from '../src/game.js';
import { getMountPose } from '../src/mount-motion.js';
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
          near(Math.hypot(leg.hip[0] - leg.knee[0], leg.hip[1] - leg.knee[1]), leg.upper);
          near(Math.hypot(leg.ankle[0] - leg.knee[0], leg.ankle[1] - leg.knee[1]), leg.lower, `${horse ? 'Horse' : 'Dinosaur'} lower bone at phase ${i / 120}`);
        }
      }
      for (const boundary of [duty * stride, stride]) {
        const legAt = distance => getMountPose({ horse, distance, moving: true }).legs.find(leg => leg.phase !== undefined && !leg.far && !leg.front);
        const a = legAt(boundary - 0.0001), b = legAt(boundary), c = legAt(boundary + 0.0001);
        assert(Math.hypot(a.foot[0] - c.foot[0], a.foot[1] - c.foot[1]) < 0.001);
        assert(Math.abs((b.foot[0] - a.foot[0]) / 0.0001 - (c.foot[0] - b.foot[0]) / 0.0001) < 0.01, 'Foot velocity must not snap at contact');
      }
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
      if (stats.projectile) assert(shots.has(stats.projectile), `${clip.id}: missing real projectile`);
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
      assert(page.querySelectorAll('.clip:not([hidden])').length === 15);
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

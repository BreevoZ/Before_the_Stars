import { TALENT_TREE } from '../src/talents.js';
import { parseSession, serializeSession, SAVE_KEY, DEBUG_SAVE_KEY } from '../src/save.js';
import { createDebugProgression } from '../src/debug.js';
import { mountFixture } from './progression-cases.js';
import { challengeSeed } from './challenge-cases.js';

const resize = async (frame, width, height = 844) => { frame.style.width = `${width}px`; frame.style.height = `${height}px`; await new Promise(resolve => setTimeout(resolve, 35)); };
export function registerTalentHomeTests(test, assert, near) {
  test('Civilization home: destruction restores directly into a full-screen SVG star map without changing settlement', async () => {
    const seed = challengeSeed(false), raw = serializeSession(seed), frame = await mountFixture(raw), page = frame.contentDocument, el = id => page.getElementById(id);
    try {
      await resize(frame, 1100, 800);
      const rect = el('archives-dialog').getBoundingClientRect();
      assert(el('archives-dialog').open && el('archives-dialog').dataset.cinematic === 'false');
      near(rect.left, 0); near(rect.top, 0); near(rect.width, frame.clientWidth); near(rect.height, frame.clientHeight);
      assert(el('talent-details').hidden && page.querySelectorAll('.talent-link').length === Object.keys(TALENT_TREE).length - 1 + 16);
      for (const [key, config] of Object.entries(TALENT_TREE).filter(([,c])=>!c.unit && !c.requiresLayer)) for (const [parent, rank] of Object.entries(config.requires)) {
        const link = el(`link-${key}`);
        assert(link.tagName.toLowerCase() === 'path' && link.getAttribute('d').includes('C') && link.dataset.parent === parent && Number(link.dataset.requiredLevel) === rank);
      }
      assert(frame.contentWindow.getComputedStyle(el('talent-tree'), '::before').content === 'none');
      assert(el('home-sky').width > 0 && el('home-sky').height > 0);
      assert(frame.contentWindow.__storage.getItem(SAVE_KEY) === raw, 'Opening home must not write or settle again');
      el('close-archives').click(); assert(!el('archives-dialog').open);
      el('archives').click(); assert(el('archives-dialog').open && frame.contentWindow.__storage.getItem(SAVE_KEY) === raw);
    } finally { frame.remove(); }
  });
  test('Civilization home: node ranks/costs and SVG line state match prerequisites; purchase animates once and preserves save ledger', async () => {
    const frame = await mountFixture(serializeSession(challengeSeed(false))), page = frame.contentDocument, el = id => page.getElementById(id);
    try {
      assert(el('node-formation').dataset.state === 'ready' && el('cost-formation').textContent === '2 ✧');
      assert(el('level-conservation').textContent === '●○○○' && el('node-legacyMachine').dataset.state === 'prerequisite');
      assert(el('link-conservation').dataset.state === 'owned' && el('link-evolution').dataset.state === 'locked');
      el('node-formation').click(); assert(!el('talent-details').hidden && el('talent-formation').textContent.includes('→'));
      assert(el('current-formation').textContent === '单一兵种' && el('next-formation').textContent.includes('比例'));
      const wallet = Number(el('legacy').textContent);
      el('buy-formation').click(); el('buy-formation').click();
      assert(el('legacy').textContent === String(wallet - 2) && el('level-formation').textContent === '●');
      assert(el('link-formation').dataset.state === 'owned' && el('link-evolution').dataset.state === 'available');
      const reduced = frame.contentWindow.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!reduced) assert(el('flow-formation').getAnimations().length === 1 && el('node-formation').getAnimations().length === 1 && el('legacy').getAnimations().length === 1);
      assert(el('talent-feedback').textContent.includes('−2 Legacy') && page.activeElement.id === 'close-talent-detail');
      const s = parseSession(frame.contentWindow.__storage.getItem(SAVE_KEY));
      assert(s.permanent.legacy === wallet - 2 && s.permanent.talents.formation === 1 && s.run.earnedLegacy === 1);
    } finally { frame.remove(); }
  });
  test('Civilization home: hover, keyboard and touch reveal one floating detail; Escape closes detail before leaving home', async () => {
    const frame = await mountFixture(serializeSession(challengeSeed(false))), page = frame.contentDocument, el = id => page.getElementById(id);
    try {
      await resize(frame, 1100, 800);
      el('node-production').dispatchEvent(new frame.contentWindow.PointerEvent('pointerenter', { pointerType: 'mouse' }));
      assert(!el('talent-details').hidden && !el('talent-production').hidden);
      el('node-production').dispatchEvent(new frame.contentWindow.PointerEvent('pointerleave', { pointerType: 'mouse' }));
      await new Promise(resolve => setTimeout(resolve, 230)); assert(el('talent-details').hidden);
      el('node-evolution').focus(); assert(!el('talent-evolution').hidden);
      el('node-evolution').dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true, cancelable: true }));
      assert(page.activeElement.classList.contains('talent-node') && page.activeElement.id !== 'node-evolution');
      page.activeElement.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
      assert(el('talent-details').hidden && el('archives-dialog').open);
      el('node-legacyMachine').click(); assert(!el('talent-legacyMachine').hidden && el('talent-production').hidden && el('buy-legacyMachine').disabled);
      const bounds = el('talent-details').getBoundingClientRect();
      assert(bounds.left >= 0 && bounds.right <= frame.clientWidth && bounds.bottom <= frame.clientHeight);
      el('close-talent-detail').click(); assert(el('talent-details').hidden);
    } finally { frame.remove(); }
  });
  test('Civilization home: 320px and 390px layouts preserve distinct 56px nodes, keep root reachable, and contain the touch detail', async () => {
    const frame = await mountFixture(serializeSession(challengeSeed(false))), page = frame.contentDocument, el = id => page.getElementById(id);
    try {
      for (const width of [320, 390]) {
        await resize(frame, width);
        el('close-archives').click(); el('archives').click();
        assert(page.documentElement.scrollWidth <= frame.clientWidth && el('archives-dialog').scrollWidth <= frame.clientWidth);
        const nodes = [...page.querySelectorAll('.talent-node')].map(node => ({ id: node.id, rect: node.getBoundingClientRect() }));
        for (const { rect } of nodes) assert(rect.width >= 56 && rect.height >= 56, 'Node shrunk while panning');
        for (const a of nodes) for (const b of nodes) if (a.id < b.id) assert(a.rect.right <= b.rect.left || a.rect.left >= b.rect.right || a.rect.bottom <= b.rect.top || a.rect.top >= b.rect.bottom, `Overlapping touch targets ${a.id} / ${b.id}`);
        const mapRect = el('talent-tree').getBoundingClientRect();
        for (const path of page.querySelectorAll('.talent-link')) {
          const length = path.getTotalLength();
          for (let i = 1; i < 100; i++) {
            const point = path.getPointAtLength(length * i / 100);
            for (const node of nodes) if (![path.dataset.parent, path.dataset.child].includes(node.id.replace('node-', ''))) {
              const distance = Math.hypot(mapRect.left + point.x - (node.rect.left + node.rect.width / 2), mapRect.top + point.y - (node.rect.top + node.rect.height / 2));
              assert(distance > node.rect.width * .38, `${path.id} crosses unrelated ${node.id}`);
            }
          }
        }
        assert(el('tree-scroll').scrollWidth > el('tree-scroll').clientWidth && el('tree-scroll').scrollLeft > 0, 'Phone pans a full-size constellation centered on the root');
        const root = el('node-spark').getBoundingClientRect(), footer = el('archive-footer').getBoundingClientRect();
        assert(root.top >= page.querySelector('.home-header').getBoundingClientRect().bottom);
        assert(root.bottom < footer.top && root.top > 0);
        el('node-conservation').click();
        const detail = el('talent-details').getBoundingClientRect();
        assert(detail.left >= 0 && detail.right <= width && detail.bottom <= frame.clientHeight && el('talent-details').scrollWidth <= el('talent-details').clientWidth);
        el('close-talent-detail').click();
        el('node-challenge').dispatchEvent(new frame.contentWindow.PointerEvent('pointerenter', { pointerType: 'mouse' }));
        assert(el('talent-details').hidden, 'Narrow-screen details must not reopen from a hover underneath the close button');
      }
    } finally { frame.remove(); }
  });
  test('Civilization home: finale opens a skippable presentation after reward; reload does not replay it; rebuilding keeps legacy', async () => {
    const seed = createDebugProgression();
    let frame = await mountFixture(serializeSession(seed), false, 'debug');
    const el = id => frame.contentDocument.getElementById(id);
    try {
      frame.contentDocument.querySelector('[data-debug-command="finale"]').click();
      assert(el('archives-dialog').open && el('legacy').textContent === '1');
      const s = parseSession(frame.contentWindow.__storage.getItem(DEBUG_SAVE_KEY));
      assert(s.run.settled && s.permanent.completedCycles === 1);
      el('skip-home-intro').click(); assert(el('archives-dialog').dataset.cinematic === 'false');
      assert(frame.contentWindow.__storage.getItem(DEBUG_SAVE_KEY) === serializeSession(s));
      frame.remove(); frame = await mountFixture(serializeSession(s), false, 'debug');
      assert(el('archives-dialog').open && el('archives-dialog').dataset.cinematic === 'false' && el('legacy').textContent === '1');
      el('node-spark').click(); el('buy-spark').click(); el('rebuild-civilization').click();
      assert(!el('archives-dialog').open && el('result').hidden);
      const next = parseSession(frame.contentWindow.__storage.getItem(DEBUG_SAVE_KEY));
      assert(next.permanent.completedCycles === 1 && next.permanent.legacy === 0 && next.run.talents.spark === 1);
    } finally { frame.remove(); }
  });
  test('Civilization home: reduced-motion preference skips the cinematic and purchase transforms without suppressing feedback or rewards', async () => {
    const frame = await mountFixture(serializeSession(createDebugProgression()), false, 'debug', { reducedMotion: true });
    const el = id => frame.contentDocument.getElementById(id);
    try {
      frame.contentDocument.querySelector('[data-debug-command="finale"]').click();
      assert(el('archives-dialog').open && el('archives-dialog').dataset.cinematic === 'false' && el('skip-home-intro').hidden);
      el('node-spark').click(); el('buy-spark').click();
      assert(el('legacy').textContent === '0' && el('talent-feedback').textContent.includes('文明火种'));
      assert(el('legacy').getAnimations().length === 0 && el('node-spark').getAnimations().length === 0);
      assert([...frame.contentDocument.querySelectorAll('.talent-flow')].every(path => path.getAnimations().length === 0));
      const s = parseSession(frame.contentWindow.__storage.getItem(DEBUG_SAVE_KEY));
      assert(s.permanent.completedCycles === 1 && s.permanent.talents.spark === 1 && s.run.earnedLegacy === 1);
    } finally { frame.remove(); }
  });
  test('Civilization home: opening during a battle pauses automation, save and challenge views return safely', async () => {
    const seed = challengeSeed();
    const { rebuildCivilization } = await import('../src/progression.js'); rebuildCivilization(seed, seed.run.runId);
    seed.permanent.automation.enabled = true;
    const frame = await mountFixture(serializeSession(seed)), page = frame.contentDocument, el = id => page.getElementById(id);
    try {
      frame.contentWindow.__testFrame(0); el('archives').click(); const gold = el('gold').textContent;
      for (let i = 1; i < 100; i++) frame.contentWindow.__testFrame(i * 20);
      assert(el('gold').textContent === gold && el('queue-count').textContent === '0 / 5');
      assert(el('node-production').dataset.state === 'during-run' && el('archive-footer').hidden);
      el('home-automation').click(); assert(el('automation-dialog').open && el('archives-dialog').open);
      el('close-automation').click(); assert(el('archives-dialog').open);
      el('archive-save').click(); assert(el('save-dialog').open); el('close-save').click(); assert(el('archives-dialog').open);
    } finally { frame.remove(); }
    const end = await mountFixture(serializeSession(challengeSeed()));
    try {
      const doc = end.contentDocument; doc.getElementById('archive-challenge').click();
      assert(doc.getElementById('challenge-dialog').open && !doc.getElementById('archives-dialog').open);
      doc.getElementById('close-challenge').click(); await new Promise(resolve => setTimeout(resolve, 30));
      assert(doc.getElementById('archives-dialog').open && !doc.getElementById('challenge-dialog').open);
    } finally { end.remove(); }
  });
}

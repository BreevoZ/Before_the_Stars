import { AGES } from './game.js';
import { ANIMATION_CLIPS, CATEGORIES, CLIP_SECONDS, createClipPainter } from './animation-clips.js';

const $ = selector => document.querySelector(selector);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const settings = { team: 'player', action: 'march', guides: false };
let time = 0, paused = reducedMotion.matches, speed = 1, category = 'all', dirty = true, previous = null, enlarged = null;
const viewer = $('#viewer'), cards = [];
const observer = new IntersectionObserver(entries => {
  for (const entry of entries) { const card = cards.find(card => card.canvas === entry.target); card.visible = entry.isIntersecting; }
  dirty = true;
}, { rootMargin: '80px' });

for (const [id, label] of Object.entries(CATEGORIES)) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
  button.dataset.category = id; button.setAttribute('aria-pressed', String(id === category));
  button.addEventListener('click', () => { category = id; filter(); });
  $('#categories').append(button);
}
for (const clip of ANIMATION_CLIPS) {
  const element = document.createElement('article'); element.className = 'clip'; element.dataset.clip = clip.id;
  element.innerHTML = `<button class="preview-button" type="button" aria-label="放大查看${clip.name}"><canvas role="img" aria-label="${clip.name}动画预览"></canvas></button><div class="clip-info"><div class="clip-meta"><span>${CATEGORIES[clip.category]}</span><span>${clip.age ? AGES[clip.age].numeral + ' · ' + AGES[clip.age].shortName : '环境'}</span></div><h2>${clip.name}</h2><p>${clip.note}</p></div>`;
  const canvas = element.querySelector('canvas');
  const card = { clip, element, canvas, visible: false, paint: null };
  element.querySelector('button').addEventListener('click', () => {
    $('#viewer-title').textContent = clip.name; $('#viewer-category').textContent = CATEGORIES[clip.category];
    $('#viewer-description').textContent = clip.note;
    $('#viewer-canvas').setAttribute('aria-label', `${clip.name}放大动画预览`);
    $('#viewer-action').closest('label').hidden = clip.kind !== 'unit';
    $('#viewer-team').closest('label').hidden = !['unit', 'turret', 'combat', 'base'].includes(clip.kind);
    $('#viewer-guides').closest('label').hidden = clip.kind !== 'unit' || !['heavy', 'knight'].includes(clip.type);
    $('#viewer-team').closest('.viewer-controls').hidden = !['unit', 'turret', 'combat', 'base'].includes(clip.kind);
    viewer.showModal(); enlarged = createClipPainter($('#viewer-canvas'), clip); dirty = true;
  });
  cards.push(card); $('#clips').append(element); observer.observe(canvas);
}

function filter() {
  const query = $('#search').value.trim().toLocaleLowerCase(), era = $('#era').value;
  let count = 0;
  for (const { clip, element } of cards) {
    element.hidden = !(category === 'all' || clip.category === category) || !(era === 'all' || String(clip.age) === era) || !`${clip.name} ${clip.note}`.toLocaleLowerCase().includes(query);
    if (!element.hidden) count++;
  }
  document.querySelectorAll('[data-category]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.category === category)));
  $('#count').textContent = `${count} 个预览 · 共 ${cards.length} 个`;
  $('#empty').hidden = count > 0; dirty = true;
}
$('#search').addEventListener('input', filter); $('#era').addEventListener('change', filter);
function sync() {
  document.querySelectorAll('[data-control="play"]').forEach(button => { button.textContent = paused ? '播放' : '暂停'; button.setAttribute('aria-pressed', String(!paused)); });
  document.querySelectorAll('[data-timeline]').forEach(input => input.value = String(time));
  document.querySelectorAll('[data-time]').forEach(output => output.textContent = `${time.toFixed(2)} / ${CLIP_SECONDS.toFixed(2)} s`);
  document.body.dataset.paused = String(paused);
}
document.querySelectorAll('[data-control]').forEach(button => button.addEventListener('click', () => {
  if (button.dataset.control === 'play') { paused = !paused; if (time >= CLIP_SECONDS) time = 0; }
  if (button.dataset.control === 'step') { paused = true; time = time >= CLIP_SECONDS ? 0 : Math.min(CLIP_SECONDS, (Math.round(time * 60) + 1) / 60); }
  if (button.dataset.control === 'reset') time = 0;
  dirty = true; sync();
}));
document.querySelectorAll('[data-timeline]').forEach(input => input.addEventListener('input', () => { time = Number(input.value); paused = true; dirty = true; sync(); }));
for (const id of ['speed', 'viewer-speed']) $(`#${id}`).addEventListener('change', event => {
  speed = Number(event.target.value); $('#speed').value = $('#viewer-speed').value = String(speed);
});
for (const id of ['team', 'action', 'guides']) for (const prefix of ['', 'viewer-']) {
  $(`#${prefix}${id}`).addEventListener('change', event => {
    const property = id === 'guides' ? 'checked' : 'value';
    settings[id] = event.target[property];
    $(`#${id}`)[property] = $(`#viewer-${id}`)[property] = settings[id]; dirty = true;
  });
}
$('#close-viewer').addEventListener('click', () => viewer.close());
viewer.addEventListener('close', () => { enlarged = null; dirty = true; });
reducedMotion.addEventListener('change', () => { paused = reducedMotion.matches; sync(); dirty = true; });
document.addEventListener('visibilitychange', () => { previous = null; dirty = true; });
window.addEventListener('resize', () => dirty = true);
new ResizeObserver(() => dirty = true).observe($('#clips'));
filter(); sync();

function frame(now) {
  const dt = previous !== null && !paused && !document.hidden ? Math.min((now - previous) / 1000, 0.05) * speed : 0;
  previous = now;
  if (dt) { time = (time + dt) % CLIP_SECONDS; dirty = true; sync(); }
  if (dirty && !document.hidden) {
    if (enlarged) enlarged(time, { ...settings, reducedMotion: reducedMotion.matches });
    else for (const card of cards) {
      if (card.element.hidden || !card.visible) continue;
      card.paint ??= createClipPainter(card.canvas, card.clip);
      card.paint(time, { ...settings, reducedMotion: reducedMotion.matches });
    }
    dirty = false;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

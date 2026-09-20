import { createBindings } from './dom-bindings.js';
import { icon } from './icons.js';
import { drawCommandPortrait } from './command-portraits.js';

export function setIcon(element, name) {
  element.innerHTML = name ? icon(name) : '';
}
function portrait(holder, type, turret = false) {
  const canvas = holder.querySelector('canvas') ?? document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true'); holder.append(canvas);
  drawCommandPortrait(canvas, type, turret);
}
export function createBattleUI(root = document) {
  root.querySelectorAll('[data-unit]').forEach((card, index) => { card.dataset.unitSlot = index; });
  root.querySelectorAll('[data-turret]').forEach((card, index) => { card.dataset.turretSlot = index; });
  const help = root.querySelector('#help-roster');
  for (const [kind, title, count] of [['unit', '部队', 4], ['turret', '炮塔', 3]]) {
    const heading = document.createElement('h3'); heading.textContent = title; help.append(heading);
    for (let i = 0; i < count; i++) {
      const entry = document.createElement('div'); entry.className = 'help-unit'; entry.id = `help-${kind}-${i}`;
      entry.innerHTML = '<span class="help-unit-icon"></span><div><strong></strong><p></p></div>'; help.append(entry);
    }
  }
  return createBindings(root, null, { icon: setIcon,
    unitPortrait: (element, type) => portrait(element, type),
    turretPortrait: (element, type) => portrait(element, type, true) });
}

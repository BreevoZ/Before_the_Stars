import { AUTOMATION_TARGETS } from './progression-config.js';
import { createTalentMap } from './talent-map.js';
import { configureAutomation } from './automation.js';
import { createBindings } from './dom-bindings.js';
import { AUTOMATION_FIELDS, buildAutomationViewModel } from './automation-view-model.js';

const el = id => document.getElementById(id);
export function createTalentUI(getSession, changed) {
  const map = createTalentMap(getSession, changed);
  const bind = createBindings(document, null, { optionCount(select, count) {
    const value = select.value;
    select.replaceChildren(...Array.from({ length: count }, (_, i) => {
      const option = document.createElement('option'); option.value = String(i + 1); option.textContent = String(i + 1); return option;
    }));
    select.value = value;
  } });
  const error = createBindings(document, { '#automation-error': value => value });
  function apply(patch) {
    if (!configureAutomation(getSession(), patch)) {
      error('设置未保存：请检查数值范围、比例不能全为 0，以及所需天赋。');
      bind.invalidate(); sync(); return;
    }
    // Normalize accepted numeric edits (e.g. 01 / scientific notation).
    bind.invalidate(); error('设置已保存。'); changed();
  }
  for (const [id, [key, type]] of Object.entries(AUTOMATION_FIELDS)) el(id).addEventListener('change', () => {
    if (type === 'quantity') { apply({ [key]: el(id).value.trim() }); return; }
    apply({ [key]: type === 'number' ? (el(id).value === '' ? NaN : Number(el(id).value)) : el(id)[type] });
  });
  AUTOMATION_TARGETS.forEach((role, index) => el(`auto-weight-${role}`).addEventListener('change', () => {
    const weights = [...getSession().permanent.automation.weights], input = el(`auto-weight-${role}`);
    weights[index] = input.value === '' ? NaN : Number(input.value); apply({ weights });
  }));
  function sync() {
    map.sync();
    bind(buildAutomationViewModel(getSession(), { mobile: window.innerWidth <= 740 }));
  }
  return { sync, open: map.open };
}

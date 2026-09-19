// Small one-way binding layer. View models contain primitives; no DOM nodes,
// event handlers or HTML strings. Structural/canvas writers are explicit hooks.
export function createBindings(root, mapping = null, writers = {}) {
  const entries = new Map();
  function entry(key) {
    if (!entries.has(key)) {
      const split = key.lastIndexOf('@');
      const selector = split < 0 ? key : key.slice(0, split);
      const property = split < 0 ? 'textContent' : key.slice(split + 1);
      const elements = selector ? [...root.querySelectorAll(selector)] : [root];
      if (!elements.length) throw new Error(`Missing UI binding: ${key}`);
      entries.set(key, { elements, property, initialized: false });
    }
    return entries.get(key);
  }
  function sync(model, { force = false } = {}) {
    const values = mapping ? Object.fromEntries(Object.entries(mapping).map(([key, read]) => [key, read(model)])) : model;
    let writes = 0;
    for (const [key, raw] of Object.entries(values)) {
      const item = entry(key), { elements, property } = item;
      const value = ['textContent', 'title', 'value'].includes(property) ? String(raw ?? '') : raw;
      if (!force && item.initialized && Object.is(item.value, value)) continue;
      for (const element of elements) {
        if (writers[property]) writers[property](element, value);
        else if (property.startsWith('class:')) element.classList.toggle(property.slice(6), Boolean(value));
        else if (property.startsWith('style:')) element.style.setProperty(property.slice(6), value);
        else if (property.startsWith('aria-') || property.startsWith('data-')) {
          if (value == null) element.removeAttribute(property);
          else element.setAttribute(property, String(value));
        } else element[property] = value;
      }
      item.value = value; item.initialized = true; writes++;
    }
    return writes;
  }
  // Failed form edits must restore authoritative values even if the model did
  // not change. Normal frame updates leave in-progress input edits untouched.
  sync.invalidate = () => { for (const item of entries.values()) item.initialized = false; };
  return sync;
}

import { TALENT_TREE } from '../src/talents.js';
import { createAutomation } from '../src/automation.js';
import { SURFACE } from '../src/progression-config.js';
import { normalizeRunOptions } from './simulate.js';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const paths = new Set(['challengeLevel', 'maxSeconds', 'bonuses',
  ...Object.keys(TALENT_TREE).map(key => `talents.${key}`),
  ...Object.keys(createAutomation()).filter(key => key !== 'unlocked').map(key => `automation.${key}`)]);

// Expand and validate the entire grid before running or writing any results.
export function expandGrid(spec) {
  if (!record(spec) || Object.keys(spec).some(key => !['base', 'grid'].includes(key)) ||
      !record(spec.base === undefined ? {} : spec.base) || !record(spec.grid)) throw new TypeError('Expected { base: runOptions, grid: { "path": [values] } }');
  const axes = Object.entries(spec.grid);
  let count = 1;
  for (const [path, values] of axes) {
    if (!paths.has(path)) throw new TypeError(`Unknown grid path: ${path}`);
    if (!Array.isArray(values) || !values.length) throw new TypeError(`Grid axis ${path} must be a nonempty array`);
    count *= values.length;
    if (count > 10000) throw new RangeError('Grid exceeds 10000 runs; split it into smaller scans');
  }
  let rows = [structuredClone(spec.base ?? {})];
  for (const [path, values] of axes) rows = rows.flatMap(row => values.map(value => {
    const next = structuredClone(row), [group, key] = path.split('.');
    if (key) {
      if (next[group] !== undefined && !record(next[group])) throw new TypeError(`${group} must be an object`);
      next[group] = { ...next[group], [key]: structuredClone(value) };
    } else next[group] = structuredClone(value);
    return next;
  }));
  rows.forEach((row, index) => {
    try { normalizeRunOptions(row); }
    catch (error) { throw new Error(`Grid row ${index + 1}: ${error.message}`); }
  });
  return rows;
}

const cell = value => {
  const text = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
export function resultsToCSV(rows, gridPaths = []) {
  const headings = ['run', ...gridPaths, 'outcome', 'duration_seconds', 'battle_count',
    ...Array.from({ length: SURFACE.finalEnemyAge }, (_, i) => `battle_${i + 1}_seconds`),
    'peak_gold', 'total_experience', 'legacy', 'battles_json', 'config_json'];
  const lines = rows.map(({ options, result }, index) => [index + 1,
    ...gridPaths.map(path => path.split('.').reduce((value, key) => value?.[key], options)),
    result.outcome, result.duration, result.battles.length,
    ...Array.from({ length: SURFACE.finalEnemyAge }, (_, i) => result.battles[i]?.duration ?? ''),
    result.peakGold, result.totalExperience, result.legacy, result.battles, options]);
  return [headings, ...lines].map(row => row.map(cell).join(',')).join('\n') + '\n';
}

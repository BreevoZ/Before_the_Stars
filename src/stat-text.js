import { explainStat } from './stats.js';

const number = value => typeof value === 'boolean' ? value ? '允许' : '禁用' : String(Math.round(value * 1000) / 1000);
// UI reads provenance from the same calculation as combat, never re-derives
// an archive or challenge multiplier from a talent level.
export function describeStat(game, subject, key, base) {
  const detail = explainStat(game, subject, key, base);
  const operations = { add: '+', multiply: '×', override: '=' };
  const sources = detail.effects.filter(effect => effect.type === 'override' || effect.value !== (effect.type === 'add' ? 0 : 1));
  return [`基础 ${number(detail.base)}`, ...sources.map(effect =>
    `${effect.source.label} ${operations[effect.type]}${number(effect.value)}`), `实际 ${number(detail.value)}`].join(' · ');
}

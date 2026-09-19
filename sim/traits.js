import { readFileSync, writeFileSync } from 'node:fs';
import { simulateRun } from './simulate.js';
import { expandGrid } from './grid.js';
import { TALENTS, layerTalents } from '../src/talents.js';
import { createTraitSampler } from '../src/trait-scenarios.js';
import { Q } from '../src/quantity.js';
import { TRAITS } from '../src/traits.js';

// Paired scans use the existing parameter grid. A pair shares all era
// prerequisites and differs by exactly one talent, never by its whole path.
const spec = JSON.parse(readFileSync(new URL('./grid.example.json', import.meta.url), 'utf8'));
const grid = expandGrid(spec), rows = [];
const selected = process.argv[3]?.split(',');
if (selected?.some(id => !Object.hasOwn(TRAITS,id))) throw new Error('Unknown trait ID');
for (const [id, trait] of Object.entries(TRAITS)) {
  if (selected && !selected.includes(id)) continue;
  let peakReduction = -Infinity, activations = 0, changed = 0;
  for (const [index, original] of grid.entries()) {
    const base = structuredClone(original);
    for (let layer = 1; layer < TALENTS[id].layer; layer++) base.talents[layerTalents(layer)[0]] = 1;
    const before = simulateRun(base), after = simulateRun({ ...base, talents: { ...base.talents, [id]: 1 } });
    const reduction = before.outcome === 'won' && after.outcome === 'won' ? (before.duration - after.duration) / before.duration : null;
    if (reduction !== null) peakReduction = Math.max(peakReduction, reduction);
    const count = after.traitActivations[id] ?? 0; activations += count;
    if (before.duration !== after.duration || before.totalExperience !== after.totalExperience || before.peakGold !== after.peakGold) changed++;
    rows.push([id,index+1,before.outcome,after.outcome,before.duration,after.duration,reduction===null?'':(reduction*100).toFixed(4),count,'','']);
  }
  const clip = { trait: id, type: trait.units[0] };
  const sceneTime = id === 'suppression' ? 2 : 7;
  const sceneOff = createTraitSampler(clip, false)(sceneTime).game, sceneOn = createTraitSampler(clip)(sceneTime).game;
  const ids = new Set([...sceneOff.units, ...sceneOn.units].map(u=>u.id));
  let sceneDelta = 0, positionDelta = 0;
  for(const unitId of ids) {
    const before = sceneOff.units.find(u=>u.id===unitId), after = sceneOn.units.find(u=>u.id===unitId);
    sceneDelta += Math.abs(Q.toNumber(Q.sub(before?.hp ?? 0,after?.hp ?? 0)));
    if(before && after)positionDelta += Math.abs(before.x-after.x);
  }
  const sceneCount = sceneOn.traitActivations?.[id] ?? 0;
  rows.push([id,'scene','fixture','fixture',sceneTime,sceneTime,'',sceneCount,sceneDelta.toFixed(4),positionDelta.toFixed(4)]);
  console.error(`${trait.name}: ${activations} triggers, ${changed}/${grid.length} changed, scene ΔHP ${sceneDelta.toFixed(2)} ${positionDelta.toFixed(2)} distance (${sceneCount} triggers), max reduction ${(peakReduction*100).toFixed(2)}%`);
  if (!sceneCount || (!sceneDelta && !positionDelta) || peakReduction > .25) process.exitCode = 1;
}
const csv = ['talent,grid_row,before,after,before_seconds,after_seconds,reduction_percent,triggers,scene_health_delta,scene_position_delta', ...rows.map(row=>row.join(','))].join('\n')+'\n';
if(process.argv[2]) writeFileSync(process.argv[2],csv); else process.stdout.write(csv);

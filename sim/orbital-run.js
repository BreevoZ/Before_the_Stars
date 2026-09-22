import { simulateOrbital } from './orbital.js';
for (const options of [{}, { policy: 'nurture' }, { policy: 'tribute' }, { active: false }, { legacy: 10000 }]) {
  const { session, ...result } = simulateOrbital(options); console.log(JSON.stringify({ options, ...result }));
}

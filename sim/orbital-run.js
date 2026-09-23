import { simulateOrbital } from './orbital.js';
for (const seed of [1,2,3,42,2026]) {const {session,...result}=simulateOrbital({seed});console.log(JSON.stringify({seed,...result}));}

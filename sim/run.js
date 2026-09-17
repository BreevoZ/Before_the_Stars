import { readFileSync } from 'node:fs';
import { simulateRun } from './simulate.js';

try {
  const args = process.argv.slice(2);
  if (args.length > 1) throw new Error('Usage: node sim/run.js [config.json]');
  if (args[0] === '--help') console.log('Usage: node sim/run.js [config.json]\nWithout a file: sim/example.json. Output: JSON; time in simulation seconds.');
  else {
    const path = args[0] ?? new URL('./example.json', import.meta.url);
    console.log(JSON.stringify(simulateRun(JSON.parse(readFileSync(path, 'utf8'))), null, 2));
  }
} catch (error) {
  console.error(`Simulation failed: ${error.message}`);
  process.exitCode = 1;
}

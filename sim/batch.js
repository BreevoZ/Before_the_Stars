import { readFileSync, writeFileSync } from 'node:fs';
import { simulateRun } from './simulate.js';
import { expandGrid, resultsToCSV } from './grid.js';

try {
  const args = process.argv.slice(2);
  if (args[0] === '--help') {
    console.log('Usage: node sim/batch.js [grid.json] [--out results.csv]\nDefault grid: sim/grid.example.json. CSV goes to stdout unless --out is given.');
  } else {
    const path = args.length && !args[0].startsWith('--') ? args.shift() : new URL('./grid.example.json', import.meta.url);
    let output;
    if (args.length) {
      if (args.length !== 2 || args[0] !== '--out' || args[1].startsWith('--')) throw new Error('Usage: node sim/batch.js [grid.json] [--out results.csv]');
      output = args[1];
    }
    const spec = JSON.parse(readFileSync(path, 'utf8'));
    const configs = expandGrid(spec);
    const rows = configs.map((options, index) => {
      const result = simulateRun(options);
      console.error(`[${index + 1}/${configs.length}] ${result.outcome} · ${result.duration}s · Legacy ${result.legacy}`);
      return { options, result };
    });
    const csv = resultsToCSV(rows, Object.keys(spec.grid));
    if (output) writeFileSync(output, csv);
    else process.stdout.write(csv);
  }
} catch (error) {
  console.error(`Batch failed: ${error.message}`);
  process.exitCode = 1;
}

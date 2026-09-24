import { collectCases } from './cases.js';

const filter = new URLSearchParams(location.search).get('filter');
const tests = collectCases({ browser: true }).filter(test => !filter || test.name.toLowerCase().includes(filter.toLowerCase()));
let failures = 0;
for (const { name, run } of tests) {
  const item = document.createElement('li');
  try {
    await run(); item.className = 'pass'; item.textContent = `PASS — ${name}`;
  } catch (error) {
    failures++; item.dataset.stack = error.stack; item.className = 'fail'; item.textContent = `FAIL — ${name}: ${error.message}`;
  }
  document.getElementById('results').append(item);
}
document.getElementById('summary').textContent = `${tests.length - failures}/${tests.length} passed; ${failures} failed`;
document.body.dataset.testStatus = failures ? 'failed' : 'passed';

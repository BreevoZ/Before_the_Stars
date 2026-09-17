import test from 'node:test';
import { collectCases } from './cases.js';

for (const { name, run } of collectCases()) test(name, run);

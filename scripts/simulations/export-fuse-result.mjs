import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import path from 'node:path';
import { readVerified } from './import-fuse-demo.mjs';

const { values } = parseArgs({ options: { input: { type: 'string' }, output: { type: 'string' }, case: { type: 'string' } }, strict: true });
if (!values.input || !values.output || !['fpp', 'fluxmatcher'].includes(values.case)) throw new Error('Usage: node scripts/simulations/export-fuse-result.mjs --case fpp|fluxmatcher --input <source JSON> --output <new safe-result.json>');
const input = path.resolve(values.input), output = path.resolve(values.output);
if (input.toLowerCase() === output.toLowerCase()) throw new Error('Output must not overwrite source evidence');
const sha = createHash('sha256').update(await readFile(input)).digest('hex');
const result = await readVerified(input, values.case === 'fpp' ? 'fpp-stationary' : 'diiid-fluxmatcher', `fuse-${values.case}-${sha.slice(0, 16)}`);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
console.log(`Exported ${result.id}; source artifacts verified. Import this JSON into /simulations. No scientific/device qualification is implied.`);

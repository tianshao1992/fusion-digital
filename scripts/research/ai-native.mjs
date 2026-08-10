import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
const sourceDir = resolve(repoRoot, 'research', 'ai-native', 'sources');
const publicData = resolve(repoRoot, 'public', 'data', 'fusion-ai-native-landscape.json');

function findPython() {
  const candidates = [];
  if (process.env.PYTHON) candidates.push({ command: process.env.PYTHON, prefix: [] });
  candidates.push(
    { command: 'python3', prefix: [] },
    { command: 'python', prefix: [] },
    { command: 'py', prefix: ['-3'] },
  );

  for (const candidate of candidates) {
    const probe = spawnSync(candidate.command, [...candidate.prefix, '--version'], {
      cwd: repoRoot,
      encoding: 'utf8',
      windowsHide: true,
    });
    if (probe.status === 0) return candidate;
  }

  throw new Error('Python 3 was not found. Install Python 3 or set the PYTHON environment variable.');
}

const python = findPython();

function runPython(args, { allowFailure = false } = {}) {
  const result = spawnSync(python.command, [...python.prefix, ...args], {
    cwd: repoRoot,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (!allowFailure && result.status !== 0) process.exit(result.status ?? 1);
  return result.status ?? 1;
}

function audit() {
  runPython([resolve(scriptDir, 'audit_landscape.py'), publicData]);
}

function rebuild() {
  runPython([
    resolve(scriptDir, 'build_landscape.py'),
    '--research-dir', sourceDir,
    '--site-dir', repoRoot,
  ]);
  audit();
}

function report() {
  const docxProbe = spawnSync(python.command, [...python.prefix, '-c', 'import docx'], {
    cwd: repoRoot,
    stdio: 'ignore',
    windowsHide: true,
  });
  if (docxProbe.status !== 0) {
    console.error('python-docx is required. Run: python -m pip install -r requirements-research.txt');
    process.exit(1);
  }
  runPython([
    resolve(scriptDir, 'build_ai_native_report.py'),
    '--data', publicData,
    '--figures-dir', resolve(repoRoot, 'public', 'figures'),
    '--output', resolve(repoRoot, 'public', 'fusion-ai-native-research-report.docx'),
  ]);
}

const command = process.argv[2] ?? 'rebuild';
if (command === 'rebuild') rebuild();
else if (command === 'audit') audit();
else if (command === 'report') report();
else {
  console.error('Usage: node scripts/research/ai-native.mjs <rebuild|audit|report>');
  process.exit(2);
}

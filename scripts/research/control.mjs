import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
const researchDir = resolve(repoRoot, 'research', 'control');

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
  throw new Error('Python 3 was not found. Install Python 3 or set PYTHON.');
}

const python = findPython();

function run(script, args = []) {
  const result = spawnSync(python.command, [...python.prefix, resolve(scriptDir, script), ...args], {
    cwd: repoRoot,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function rebuild() {
  run('build_control_landscape.py', ['--research-dir', researchDir, '--site-dir', repoRoot]);
  audit();
}

function audit() {
  run('audit_control_landscape.py', [
    '--landscape', resolve(repoRoot, 'public', 'data', 'fusion-control-landscape.json'),
    '--devices', resolve(repoRoot, 'public', 'data', 'fusion-control-device-profiles.json'),
    '--csv', resolve(repoRoot, 'public', 'fusion-control-paper-code-index.csv'),
  ]);
}

function report() {
  const probe = spawnSync(python.command, [...python.prefix, '-c', 'import docx'], {
    cwd: repoRoot,
    stdio: 'ignore',
    windowsHide: true,
  });
  if (probe.status !== 0) {
    console.error('python-docx is required. Run: python -m pip install -r requirements-research.txt');
    process.exit(1);
  }
  run('build_control_report.py', [
    '--landscape', resolve(repoRoot, 'public', 'data', 'fusion-control-landscape.json'),
    '--devices', resolve(repoRoot, 'public', 'data', 'fusion-control-device-profiles.json'),
    '--notes-dir', resolve(researchDir, 'sources'),
    '--figures-dir', resolve(repoRoot, 'public', 'figures'),
    '--output', resolve(repoRoot, 'public', 'fusion-integrated-control-research-report.docx'),
  ]);
}

const command = process.argv[2] ?? 'rebuild';
if (command === 'rebuild') rebuild();
else if (command === 'audit') audit();
else if (command === 'report') report();
else {
  console.error('Usage: node scripts/research/control.mjs <rebuild|audit|report>');
  process.exit(2);
}

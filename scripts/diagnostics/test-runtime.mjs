import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.platform === 'win32') {
  const wslRoot = '/mnt/'+root[0].toLowerCase()+root.slice(2).replaceAll('\\', '/').replace(/\/$/, '');
  const python = process.env.DIAGNOSTIC_WSL_PYTHON ?? `${wslRoot}/work/diagnostics/.venv-wsl/bin/python`;
  run('wsl.exe', [
    '-d', process.env.DIAGNOSTIC_WSL_DISTRO ?? 'Ubuntu', '--',
    python, `${wslRoot}/tests/synthetic-diagnostics-math.test.py`,
  ]);
} else {
  const python = process.env.DIAGNOSTIC_PYTHON ?? path.join(root, 'work/diagnostics/.venv-wsl/bin/python');
  run(python, [path.join(root, 'tests/synthetic-diagnostics-math.test.py')]);
}

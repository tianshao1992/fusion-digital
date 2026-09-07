import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(process.execPath, ['--experimental-strip-types', path.join(root, 'scripts/diagnostics/prepare-inputs.mts')]);
if (process.platform === 'win32') {
  const wslRoot = '/mnt/'+root[0].toLowerCase()+root.slice(2).replaceAll('\\', '/').replace(/\/$/, '');
  run('wsl.exe', ['-d', process.env.DIAGNOSTIC_WSL_DISTRO ?? 'Ubuntu', '--', `${wslRoot}/work/diagnostics/.venv-wsl/bin/python`, `${wslRoot}/scripts/diagnostics/run_cherab.py`]);
} else {
  run(path.join(root, 'work/diagnostics/.venv-wsl/bin/python'), [path.join(root, 'scripts/diagnostics/run_cherab.py')]);
}

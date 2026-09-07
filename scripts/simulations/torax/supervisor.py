"""Linux-owned process group supervision. The WSL launcher is not the job owner."""
import json
import os
from pathlib import Path
import signal
import subprocess
import time


def group_has_live_process(group):
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit():
            continue
        try:
            fields = (entry / 'stat').read_text().rsplit(')', 1)[1].split()
            if int(fields[2]) == group and fields[0] not in ['Z', 'X']:
                return True
        except (FileNotFoundError, ProcessLookupError, PermissionError):
            continue
    return False


def write_json(path, value):
    path = Path(path)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')
    temporary.replace(path)


def supervise(command, directory, timeout, env=None):
    directory = Path(directory)
    start = time.monotonic()
    status = {'schema': 'engine-job.v1', 'id': directory.name, 'state': 'starting',
              'pid': None, 'exitCode': None, 'elapsedSeconds': 0, 'processStopped': False}

    def emit(state):
        status.update(state=state, elapsedSeconds=time.monotonic() - start)
        write_json(directory / 'status.json', status)
        with (directory / 'events.jsonl').open('a') as events:
            events.write(json.dumps(status) + '\n')

    emit('starting')
    if (directory / 'cancel').exists():
        status['processStopped'] = True
        emit('cancelled')
        return status
    with (directory / 'execution.log').open('w') as log:
        child = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT,
                                 env=env, start_new_session=True)
        status['pid'] = child.pid
        emit('running')
        outcome = None
        try:
            while child.poll() is None:
                if (directory / 'cancel').exists():
                    outcome = 'cancelled'
                    break
                if time.monotonic() - start >= timeout:
                    outcome = 'timed-out'
                    break
                time.sleep(.2)
        finally:
            # Always reap our child, including when interrupted inside Linux.
            if child.poll() is None:
                os.killpg(child.pid, signal.SIGTERM)
                try:
                    child.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid, signal.SIGKILL)
                    child.wait()
            # A descendant may outlive the direct child; kill the owned group.
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        deadline = time.monotonic() + 5
        while group_has_live_process(child.pid) and time.monotonic() < deadline:
            time.sleep(.05)
        stopped = not group_has_live_process(child.pid)
        status.update(exitCode=child.returncode, processStopped=stopped)
        emit((outcome or ('succeeded' if child.returncode == 0 else 'failed')) if stopped else 'reconciliation-required')
    return status

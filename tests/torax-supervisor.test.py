"""Run inside WSL: validates process ownership without loading the physics engine."""
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import threading
import time
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts/simulations/torax'))
from supervisor import supervise, group_has_live_process


@unittest.skipUnless(sys.platform.startswith('linux') and Path('/proc').is_dir(),
                     'TORAX supervisor owns Linux process groups and runs under WSL/Linux')
class SupervisorTest(unittest.TestCase):
    def test_success_and_failure(self):
        for code, expected in [(0, 'succeeded'), (7, 'failed')]:
            with tempfile.TemporaryDirectory() as directory:
                s = supervise([sys.executable, '-c', f'raise SystemExit({code})'], directory, 10)
                self.assertEqual(s['state'], expected)
                self.assertTrue(s['processStopped'])
                self.assertEqual(s['exitCode'], code)

    def test_timeout_stops_group_including_descendant(self):
        with tempfile.TemporaryDirectory() as directory:
            command = 'import subprocess,sys,time; subprocess.Popen([sys.executable,"-c","import time; time.sleep(60)"]); time.sleep(60)'
            s = supervise([sys.executable, '-c', command], directory, .5)
            self.assertEqual(s['state'], 'timed-out')
            self.assertTrue(s['processStopped'])
            self.assertFalse(group_has_live_process(s['pid']))

    def test_cancellation_before_and_during_execution(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, 'cancel').touch()
            s = supervise([sys.executable, '-c', 'raise Exception()'], directory, 10)
            self.assertEqual(s['state'], 'cancelled')
            self.assertIsNone(s['pid'])
        with tempfile.TemporaryDirectory() as directory:
            timer = threading.Timer(.5, lambda: Path(directory, 'cancel').touch())
            timer.start()
            s = supervise([sys.executable, '-c', 'import time; time.sleep(60)'], directory, 10)
            timer.join()
            self.assertEqual(s['state'], 'cancelled')
            self.assertFalse(group_has_live_process(s['pid']))
            events = [json.loads(v)['state'] for v in Path(directory, 'events.jsonl').read_text().splitlines()]
            self.assertEqual(events, ['starting', 'running', 'cancelled'])

    def test_sigterm_stops_and_reaps_worker_group(self):
        with tempfile.TemporaryDirectory() as directory:
            helper = r'''
import subprocess
import sys
import time
sys.path.insert(0, sys.argv[1])
from supervisor import supervise
worker = ('import subprocess,sys,time; '
          'subprocess.Popen([sys.executable,"-c","import time; time.sleep(60)"]); '
          'time.sleep(60)')
supervise([sys.executable, '-c', worker], sys.argv[2], 30)
'''
            supervisor_directory = str(Path(__file__).resolve().parents[1] / 'scripts/simulations/torax')
            owner = subprocess.Popen([sys.executable, '-c', helper, supervisor_directory, directory])
            status_path = Path(directory, 'status.json')
            status = None
            try:
                deadline = time.monotonic() + 10
                while time.monotonic() < deadline:
                    if status_path.exists():
                        try:
                            status = json.loads(status_path.read_text())
                        except (json.JSONDecodeError, FileNotFoundError):
                            pass
                        if status and status['state'] == 'running':
                            break
                    time.sleep(.05)
                self.assertIsNotNone(status)
                self.assertEqual(status['state'], 'running')
                os.kill(owner.pid, signal.SIGTERM)
                self.assertEqual(owner.wait(timeout=15), 0)
                status = json.loads(status_path.read_text())
                self.assertEqual(status['state'], 'cancelled')
                self.assertTrue(status['processStopped'])
                self.assertFalse(group_has_live_process(status['pid']))
                events = [json.loads(value)['state'] for value in Path(directory, 'events.jsonl').read_text().splitlines()]
                self.assertEqual(events, ['starting', 'running', 'cancelled'])
            finally:
                if owner.poll() is None:
                    owner.kill()
                    owner.wait()
                if status and status.get('pid') and group_has_live_process(status['pid']):
                    try:
                        os.killpg(status['pid'], signal.SIGKILL)
                    except ProcessLookupError:
                        pass


if __name__ == '__main__':
    unittest.main()

"""Launch one CAD conversion worker behind hard memory, time and disk guards."""

from __future__ import annotations

import argparse
import ctypes
import json
import math
import os
import subprocess
import sys
import time
from pathlib import Path

import psutil

from source_audit import (
    PrivateStepAuditError,
    load_private_step_audit,
    safe_format_facts,
    scan_stream,
    validate_private_step_audit,
    validate_private_step_audit_schema,
)


HARD_MAX_SOURCE_BYTES = 2_500_000_000
HARD_MAX_RSS_GIB = 64.0
HARD_MAX_TIMEOUT_MINUTES = 360.0
HARD_MAX_SCRATCH_GIB = 500.0
HARD_MIN_AVAILABLE_GIB = 12.0
WORKER_ENVIRONMENT_KEY = "FUSIONDIGITAL_EXL50U_BOUNDED_WORKER"
INTERNAL_GATE_ARGUMENT = "--_fusiondigital-windows-job-gate"
INTERNAL_GATE_ENVIRONMENT_KEY = "FUSIONDIGITAL_EXL50U_WINDOWS_JOB_GATE"
INTERNAL_COMMAND_ENVIRONMENT_KEY = "FUSIONDIGITAL_EXL50U_WORKER_COMMAND"
WATCHDOG_INTERVAL_SECONDS = 0.5
LOW_AVAILABLE_GRACE_SECONDS = 2.0


def _run_windows_job_gate() -> int:
    """Wait until the parent has assigned this process to its hard-limit job."""

    if os.name != "nt" or os.environ.get(INTERNAL_GATE_ENVIRONMENT_KEY) != "1":
        return 125
    try:
        command = json.loads(os.environ[INTERNAL_COMMAND_ENVIRONMENT_KEY])
    except (KeyError, json.JSONDecodeError):
        return 125
    if (
        not isinstance(command, list)
        or len(command) < 2
        or any(not isinstance(part, str) or not part for part in command)
    ):
        return 125
    expected_worker = Path(__file__).with_name("build_system_shard.py").resolve()
    try:
        executable_matches = Path(command[0]).resolve() == Path(sys.executable).resolve()
        worker_matches = Path(command[1]).resolve() == expected_worker
    except OSError:
        return 125
    if (
        not executable_matches
        or not worker_matches
        or os.environ.get(WORKER_ENVIRONMENT_KEY) != "1"
    ):
        return 125
    if sys.stdin.buffer.readline(16) != b"START\n":
        return 125

    environment = os.environ.copy()
    environment.pop(INTERNAL_GATE_ENVIRONMENT_KEY, None)
    environment.pop(INTERNAL_COMMAND_ENVIRONMENT_KEY, None)
    completed = subprocess.run(command, env=environment, stdin=subprocess.DEVNULL, check=False)
    return completed.returncode


def _windows_kernel32():
    from ctypes import wintypes

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.CreateJobObjectW.argtypes = (ctypes.c_void_p, wintypes.LPCWSTR)
    kernel32.CreateJobObjectW.restype = wintypes.HANDLE
    kernel32.SetInformationJobObject.argtypes = (
        wintypes.HANDLE,
        ctypes.c_int,
        ctypes.c_void_p,
        wintypes.DWORD,
    )
    kernel32.SetInformationJobObject.restype = wintypes.BOOL
    kernel32.QueryInformationJobObject.argtypes = (
        wintypes.HANDLE,
        ctypes.c_int,
        ctypes.c_void_p,
        wintypes.DWORD,
        ctypes.POINTER(wintypes.DWORD),
    )
    kernel32.QueryInformationJobObject.restype = wintypes.BOOL
    kernel32.OpenProcess.argtypes = (wintypes.DWORD, wintypes.BOOL, wintypes.DWORD)
    kernel32.OpenProcess.restype = wintypes.HANDLE
    kernel32.AssignProcessToJobObject.argtypes = (wintypes.HANDLE, wintypes.HANDLE)
    kernel32.AssignProcessToJobObject.restype = wintypes.BOOL
    kernel32.CloseHandle.argtypes = (wintypes.HANDLE,)
    kernel32.CloseHandle.restype = wintypes.BOOL
    return kernel32


class _IoCounters(ctypes.Structure):
    _fields_ = [
        ("ReadOperationCount", ctypes.c_uint64),
        ("WriteOperationCount", ctypes.c_uint64),
        ("OtherOperationCount", ctypes.c_uint64),
        ("ReadTransferCount", ctypes.c_uint64),
        ("WriteTransferCount", ctypes.c_uint64),
        ("OtherTransferCount", ctypes.c_uint64),
    ]


class _JobBasicLimitInformation(ctypes.Structure):
    _fields_ = [
        ("PerProcessUserTimeLimit", ctypes.c_int64),
        ("PerJobUserTimeLimit", ctypes.c_int64),
        ("LimitFlags", ctypes.c_uint32),
        ("MinimumWorkingSetSize", ctypes.c_size_t),
        ("MaximumWorkingSetSize", ctypes.c_size_t),
        ("ActiveProcessLimit", ctypes.c_uint32),
        ("Affinity", ctypes.c_size_t),
        ("PriorityClass", ctypes.c_uint32),
        ("SchedulingClass", ctypes.c_uint32),
    ]


class _JobExtendedLimitInformation(ctypes.Structure):
    _fields_ = [
        ("BasicLimitInformation", _JobBasicLimitInformation),
        ("IoInfo", _IoCounters),
        ("ProcessMemoryLimit", ctypes.c_size_t),
        ("JobMemoryLimit", ctypes.c_size_t),
        ("PeakProcessMemoryUsed", ctypes.c_size_t),
        ("PeakJobMemoryUsed", ctypes.c_size_t),
    ]


JOB_OBJECT_EXTENDED_LIMIT_INFORMATION = 9
JOB_OBJECT_LIMIT_JOB_MEMORY = 0x00000200
JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000
PROCESS_TERMINATE = 0x0001
PROCESS_SET_QUOTA = 0x0100


def _raise_windows_error(message: str, error: int | None = None) -> None:
    error = ctypes.get_last_error() if error is None else error
    raise OSError(error, f"{message}: {ctypes.FormatError(error).strip()}")


def create_windows_memory_job(maximum_bytes: int) -> tuple[object, object]:
    """Create a kill-on-close job with an aggregate committed-memory ceiling."""

    kernel32 = _windows_kernel32()
    handle = kernel32.CreateJobObjectW(None, None)
    if not handle:
        _raise_windows_error("CreateJobObjectW failed")
    information = _JobExtendedLimitInformation()
    information.BasicLimitInformation.LimitFlags = (
        JOB_OBJECT_LIMIT_JOB_MEMORY | JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    )
    information.JobMemoryLimit = maximum_bytes
    if not kernel32.SetInformationJobObject(
        handle,
        JOB_OBJECT_EXTENDED_LIMIT_INFORMATION,
        ctypes.byref(information),
        ctypes.sizeof(information),
    ):
        error = ctypes.get_last_error()
        kernel32.CloseHandle(handle)
        _raise_windows_error("SetInformationJobObject failed", error)
    return kernel32, handle


def assign_process_to_windows_job(kernel32: object, job_handle: object, pid: int) -> None:
    process_handle = kernel32.OpenProcess(PROCESS_TERMINATE | PROCESS_SET_QUOTA, False, pid)
    if not process_handle:
        _raise_windows_error("OpenProcess failed before Job Object assignment")
    try:
        if not kernel32.AssignProcessToJobObject(job_handle, process_handle):
            _raise_windows_error("AssignProcessToJobObject failed")
    finally:
        kernel32.CloseHandle(process_handle)


def query_windows_job_peak_bytes(kernel32: object, job_handle: object) -> int | None:
    information = _JobExtendedLimitInformation()
    returned = ctypes.c_ulong()
    if not kernel32.QueryInformationJobObject(
        job_handle,
        JOB_OBJECT_EXTENDED_LIMIT_INFORMATION,
        ctypes.byref(information),
        ctypes.sizeof(information),
        ctypes.byref(returned),
    ):
        return None
    return int(information.PeakJobMemoryUsed)


def _posix_address_space_limit(maximum_bytes: int):
    """Return a pre-exec hook that installs an inherited hard address-space cap."""

    try:
        import resource
    except ImportError as error:  # pragma: no cover - platform dependent
        raise RuntimeError("this platform has no supported hard memory limiter") from error

    if not hasattr(resource, "RLIMIT_AS"):
        raise RuntimeError("this platform has no RLIMIT_AS hard memory limiter")

    def install_limit() -> None:
        resource.setrlimit(resource.RLIMIT_AS, (maximum_bytes, maximum_bytes))

    return install_limit


def gib(value: int) -> float:
    return value / (1024 ** 3)


def scratch_bytes(root: Path) -> int:
    if not root.exists():
        return 0
    total = 0
    for directory, _, filenames in os.walk(root):
        base = Path(directory)
        for filename in filenames:
            try:
                total += (base / filename).stat().st_size
            except FileNotFoundError:
                continue
    return total


def process_tree_rss(process: psutil.Process) -> int:
    total = 0
    try:
        candidates = (process, *process.children(recursive=True))
    except (psutil.AccessDenied, psutil.NoSuchProcess):
        return 0
    for candidate in candidates:
        try:
            total += candidate.memory_info().rss
        except (psutil.AccessDenied, psutil.NoSuchProcess):
            continue
    return total


def terminate_tree(process: psutil.Process) -> None:
    try:
        children = process.children(recursive=True)
    except (psutil.AccessDenied, psutil.NoSuchProcess):
        children = []
    for candidate in reversed(children):
        try:
            candidate.kill()
        except (psutil.AccessDenied, psutil.NoSuchProcess):
            pass
    try:
        process.kill()
    except (psutil.AccessDenied, psutil.NoSuchProcess):
        pass
    psutil.wait_procs([*children, process], timeout=15)


def main() -> None:
    if sys.argv[1:] == [INTERNAL_GATE_ARGUMENT]:
        raise SystemExit(_run_windows_job_gate())

    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("audit", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("scratch", type=Path)
    parser.add_argument("--system-id", required=True)
    parser.add_argument("--role", choices=("preview", "high"), required=True)
    parser.add_argument(
        "--maximum-rss-gib",
        type=float,
        default=48.0,
        help="aggregate hard memory ceiling and diagnostic RSS ceiling (default: 48 GiB)",
    )
    parser.add_argument("--timeout-minutes", type=float, default=180.0)
    parser.add_argument("--maximum-scratch-gib", type=float, default=200.0)
    parser.add_argument("--minimum-available-gib", type=float, default=HARD_MIN_AVAILABLE_GIB)
    args = parser.parse_args()

    if (
        not math.isfinite(args.maximum_rss_gib)
        or not 0 < args.maximum_rss_gib <= HARD_MAX_RSS_GIB
    ):
        raise SystemExit(f"maximum-rss-gib must be in (0, {HARD_MAX_RSS_GIB}]")
    if (
        not math.isfinite(args.timeout_minutes)
        or not 0 < args.timeout_minutes <= HARD_MAX_TIMEOUT_MINUTES
    ):
        raise SystemExit(f"timeout-minutes must be in (0, {HARD_MAX_TIMEOUT_MINUTES}]")
    if (
        not math.isfinite(args.maximum_scratch_gib)
        or not 0 < args.maximum_scratch_gib <= HARD_MAX_SCRATCH_GIB
    ):
        raise SystemExit(f"maximum-scratch-gib must be in (0, {HARD_MAX_SCRATCH_GIB}]")
    if (
        not math.isfinite(args.minimum_available_gib)
        or args.minimum_available_gib < HARD_MIN_AVAILABLE_GIB
    ):
        raise SystemExit(f"minimum-available-gib cannot be below {HARD_MIN_AVAILABLE_GIB}")

    source = args.source.resolve(strict=True)
    audit_path = args.audit.resolve(strict=True)
    if not source.is_file() or source.stat().st_size > HARD_MAX_SOURCE_BYTES:
        raise SystemExit("bounded runner accepts only an approved system-level STEP export")
    try:
        audit = load_private_step_audit(audit_path)
        validate_private_step_audit_schema(
            audit,
            expected_public_system_id=args.system_id,
        )
        with source.open("rb") as stream:
            source_sha256, source_counts = scan_stream(stream)
        validate_private_step_audit(
            audit,
            expected_public_system_id=args.system_id,
            actual_source_bytes=source.stat().st_size,
            actual_source_sha256=source_sha256,
            actual_format=safe_format_facts(source),
            actual_counts=source_counts,
        )
    except PrivateStepAuditError as error:
        raise SystemExit(f"private source audit validation failed: {error}") from error

    worker = Path(__file__).with_name("build_system_shard.py")
    command = [
        sys.executable,
        str(worker),
        str(source),
        str(args.output.resolve()),
        str(args.scratch.resolve()),
        "--system-id",
        args.system_id,
        "--role",
        args.role,
        "--audit",
        str(audit_path),
    ]
    environment = os.environ.copy()
    environment[WORKER_ENVIRONMENT_KEY] = "1"
    environment["PYTHONUNBUFFERED"] = "1"
    maximum_memory_bytes = int(args.maximum_rss_gib * (1024 ** 3))
    job_kernel32 = None
    job_handle = None
    job_peak_bytes: int | None = None

    if os.name == "nt":
        try:
            job_kernel32, job_handle = create_windows_memory_job(maximum_memory_bytes)
        except OSError as error:
            raise SystemExit(f"hard Windows memory guard could not be created: {error}") from error

        gate_environment = environment.copy()
        gate_environment[INTERNAL_GATE_ENVIRONMENT_KEY] = "1"
        gate_environment[INTERNAL_COMMAND_ENVIRONMENT_KEY] = json.dumps(command)
        try:
            child = subprocess.Popen(
                [sys.executable, str(Path(__file__).resolve()), INTERNAL_GATE_ARGUMENT],
                env=gate_environment,
                stdin=subprocess.PIPE,
            )
        except Exception:
            job_kernel32.CloseHandle(job_handle)
            raise
        try:
            process = psutil.Process(child.pid)
            assign_process_to_windows_job(job_kernel32, job_handle, child.pid)
            if child.stdin is None:
                raise RuntimeError("Windows Job Object gate has no control pipe")
            child.stdin.write(b"START\n")
            child.stdin.flush()
            child.stdin.close()
        except Exception as error:
            try:
                terminate_tree(psutil.Process(child.pid))
            except psutil.NoSuchProcess:
                pass
            job_kernel32.CloseHandle(job_handle)
            raise SystemExit(
                f"bounded CAD worker was not released because its hard Job Object guard failed: {error}"
            ) from error
    else:
        try:
            install_address_space_limit = _posix_address_space_limit(maximum_memory_bytes)
        except RuntimeError as error:
            raise SystemExit(f"hard memory guard is unavailable: {error}") from error
        try:
            child = subprocess.Popen(
                command,
                env=environment,
                preexec_fn=install_address_space_limit,
            )
        except (OSError, subprocess.SubprocessError) as error:
            raise SystemExit(f"hard address-space guard could not be installed: {error}") from error
        process = psutil.Process(child.pid)

    started = time.monotonic()
    low_available_samples = 0
    low_available_sample_limit = max(
        1,
        math.ceil(LOW_AVAILABLE_GRACE_SECONDS / WATCHDOG_INTERVAL_SECONDS),
    )
    last_disk_check = 0.0
    violation: str | None = None
    try:
        while child.poll() is None:
            rss = process_tree_rss(process)
            if gib(rss) > args.maximum_rss_gib:
                violation = f"worker RSS exceeded {args.maximum_rss_gib:g} GiB"
                break
            available = gib(psutil.virtual_memory().available)
            low_available_samples = (
                low_available_samples + 1 if available < args.minimum_available_gib else 0
            )
            if low_available_samples >= low_available_sample_limit:
                violation = (
                    f"system available memory remained below {args.minimum_available_gib:g} GiB"
                )
                break
            elapsed = time.monotonic() - started
            if elapsed > args.timeout_minutes * 60:
                violation = f"worker exceeded the {args.timeout_minutes:g}-minute timeout"
                break
            if elapsed - last_disk_check >= 5:
                last_disk_check = elapsed
                if gib(scratch_bytes(args.scratch.resolve())) > args.maximum_scratch_gib:
                    violation = f"scratch data exceeded {args.maximum_scratch_gib:g} GiB"
                    break
            time.sleep(WATCHDOG_INTERVAL_SECONDS)

        if violation is not None:
            terminate_tree(process)
        if job_kernel32 is not None and job_handle is not None:
            job_peak_bytes = query_windows_job_peak_bytes(job_kernel32, job_handle)
    finally:
        if job_kernel32 is not None and job_handle is not None:
            job_kernel32.CloseHandle(job_handle)

    if violation is not None:
        raise SystemExit(f"bounded CAD build stopped safely: {violation}; scratch evidence was retained")
    if child.returncode != 0:
        peak = f"; observed Job Object peak {gib(job_peak_bytes):.2f} GiB" if job_peak_bytes else ""
        raise SystemExit(
            f"bounded CAD worker exited with code {child.returncode}; "
            f"hard memory ceiling was {args.maximum_rss_gib:g} GiB{peak}"
        )


if __name__ == "__main__":
    main()

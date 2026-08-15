"""Build a private, fail-closed ITER full-device preview candidate.

The 17 registered source GLBs and the selective device-frame divertor recovery
are reduced independently with a guarded direct-buffer/VTK two-stage pipeline,
preserving one stable top-level node per component.  The 18 parts are merged
into one preview (400k-triangle target, 8 MiB hard cap) and encoded with Meshopt and
KHR_mesh_quantization by a pinned glTF-Transform CLI.  The divertor is accepted
only when its recovered STEP provenance, conflict-free assembly graph and
device-frame bounds evidence pass; the local print-frame STL is never used.

Nothing in this pipeline writes to ``public/`` or copies STEP into the repo.
"""

from __future__ import annotations

import argparse
from array import array
import ctypes
import csv
import hashlib
import json
import math
import os
import struct
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


TOOL_VERSION = "1.0.0"
GLTF_TRANSFORM_VERSION = "4.4.2"
MESHOPTIMIZER_VERSION_RANGE = "~1.0.1"
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942
STABLE_NODE_PREFIX = "ITER_PART__"
DIVERTOR_ID = "divertor"
DEFAULT_TARGET_TRIANGLES = 400_000
DEFAULT_DIVERTOR_TARGET_TRIANGLES = 30_000
DEFAULT_MAX_BYTES = 8 * 1024 * 1024
RECOMMENDED_MAX_BYTES = 7 * 1024 * 1024
DEFAULT_MAX_WORKING_SET = 8 * 1024**3
DEFAULT_MIN_FREE_MEMORY = 3 * 1024**3
DIRECT_GLB_THRESHOLD_BYTES = 30_000_000
DIRECT_GRID_INTERMEDIATE_MULTIPLIER = 12
DIRECT_GRID_MAX_DIVISIONS = 4096
CLUSTER_POLICY = "DIRECT12X_OR_VTK5X_V2"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def relative_posix(path: Path, root: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def atomic_write_json(path: Path, value: Any) -> None:
    """Write generated candidate metadata without exposing a partial JSON file."""
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def safe_output(path: Path, private_root: Path) -> Path:
    resolved = path.resolve()
    allowed = (private_root / "derived-candidates").resolve()
    if not resolved.is_relative_to(allowed):
        raise ValueError(f"Candidate output must remain below {allowed}; got {resolved}")
    resolved.mkdir(parents=True, exist_ok=True)
    return resolved


def read_glb(path: Path) -> tuple[dict[str, Any], list[tuple[int, bytes]]]:
    payload = path.read_bytes()
    if len(payload) < 20:
        raise ValueError(f"GLB is too small: {path}")
    magic, version, total = struct.unpack_from("<4sII", payload, 0)
    if magic != b"glTF" or version != 2 or total != len(payload):
        raise ValueError(f"Invalid GLB 2.0 container: {path}")
    chunks: list[tuple[int, bytes]] = []
    document: dict[str, Any] | None = None
    offset = 12
    while offset < len(payload):
        length, chunk_type = struct.unpack_from("<II", payload, offset)
        data = payload[offset + 8 : offset + 8 + length]
        if len(data) != length:
            raise ValueError(f"Truncated GLB chunk: {path}")
        chunks.append((chunk_type, data))
        if chunk_type == JSON_CHUNK:
            document = json.loads(data.rstrip(b" \x00"))
        offset += 8 + length
    if offset != len(payload) or document is None:
        raise ValueError(f"Incomplete GLB chunk table: {path}")
    return document, chunks


def write_glb_document(path: Path, document: dict[str, Any], chunks: list[tuple[int, bytes]]) -> None:
    json_blob = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    json_blob += b" " * ((-len(json_blob)) % 4)
    rebuilt: list[tuple[int, bytes]] = [(JSON_CHUNK, json_blob)]
    rebuilt.extend((kind, data) for kind, data in chunks if kind != JSON_CHUNK)
    total = 12 + sum(8 + len(data) for _, data in rebuilt)
    output = bytearray(struct.pack("<4sII", b"glTF", 2, total))
    for kind, data in rebuilt:
        output.extend(struct.pack("<II", len(data), kind))
        output.extend(data)
    path.write_bytes(output)


def allocate_budgets(components: list[dict[str, Any]], target: int, minimum: int = 2_500) -> dict[str, int]:
    ready = [item for item in components if item.get("status") == "ready"]
    budgets = {str(item["id"]): min(int(item["triangles"]), minimum) for item in ready}
    remaining = max(0, target - sum(budgets.values()))
    while remaining:
        active = [item for item in ready if budgets[str(item["id"])] < int(item["triangles"])]
        if not active:
            break
        capacity = sum(int(item["triangles"]) - budgets[str(item["id"])] for item in active)
        spent = 0
        for item in active:
            key = str(item["id"])
            available = int(item["triangles"]) - budgets[key]
            addition = min(available, max(1, int(remaining * available / capacity)))
            budgets[key] += addition
            spent += addition
            if spent >= remaining:
                break
        if spent <= 0:
            break
        remaining -= min(spent, remaining)
    return budgets


def validate_resumable_part(
    path: Path,
    stats_path: Path,
    part_id: str,
    target: int,
    expected_source_sha256: str | None = None,
    expected_coordinate_map: str = "identity",
    expected_feature_angle: float = 55.0,
    expected_source_bytes: int | None = None,
) -> dict[str, Any] | None:
    """Return prior worker stats only when the staged part is structurally valid."""
    if not path.is_file() or not stats_path.is_file():
        return None
    try:
        document, chunks = read_glb(path)
        stable_names = [
            str(node.get("name"))
            for node in document.get("nodes", [])
            if str(node.get("name", "")).startswith(STABLE_NODE_PREFIX)
        ]
        if stable_names != [f"{STABLE_NODE_PREFIX}{part_id}"]:
            return None
        accessors = document.get("accessors", [])
        triangles = 0
        mesh_count = 0
        geometry_checks: list[dict[str, Any]] = []
        binary = next(data for kind, data in chunks if kind == BIN_CHUNK)
        for mesh in document.get("meshes", []):
            mesh_count += 1
            for primitive in mesh.get("primitives", []):
                index = primitive.get("indices")
                if index is None or int(primitive.get("mode", 4)) != 4:
                    return None
                position_accessor = accessors[int(primitive["attributes"]["POSITION"])]
                normal_accessor = accessors[int(primitive["attributes"]["NORMAL"])]
                index_accessor = accessors[int(index)]
                if (
                    int(position_accessor.get("componentType", 0)) != 5126
                    or position_accessor.get("type") != "VEC3"
                    or int(normal_accessor.get("componentType", 0)) != 5126
                    or normal_accessor.get("type") != "VEC3"
                    or int(index_accessor.get("componentType", 0)) != 5125
                ):
                    return None

                def accessor_bytes(accessor: dict[str, Any], scalar_size: int, components: int) -> bytes:
                    view = document["bufferViews"][int(accessor["bufferView"])]
                    if view.get("byteStride") not in (None, scalar_size * components):
                        raise ValueError("Unexpected interleaved staged part buffer")
                    start = int(view.get("byteOffset", 0)) + int(accessor.get("byteOffset", 0))
                    length = int(accessor["count"]) * scalar_size * components
                    return binary[start : start + length]

                positions = array("f")
                positions.frombytes(accessor_bytes(position_accessor, 4, 3))
                normals = array("f")
                normals.frombytes(accessor_bytes(normal_accessor, 4, 3))
                indices = array("I")
                indices.frombytes(accessor_bytes(index_accessor, 4, 1))
                if (
                    len(positions) != int(position_accessor["count"]) * 3
                    or len(normals) != int(normal_accessor["count"]) * 3
                    or len(indices) % 3
                    or not all(math.isfinite(value) for value in positions)
                    or not all(math.isfinite(value) for value in normals)
                    or (indices and max(indices) >= int(position_accessor["count"]))
                ):
                    return None
                low = [min(positions[axis::3]) for axis in range(3)]
                high = [max(positions[axis::3]) for axis in range(3)]
                diagonal_squared = sum((high[axis] - low[axis]) ** 2 for axis in range(3))
                area_threshold_squared = max(diagonal_squared * 1e-12, 1e-18) ** 2
                degenerate = 0
                for cell in range(0, len(indices), 3):
                    a, b, c = (int(indices[cell + offset]) * 3 for offset in range(3))
                    ab = [positions[b + axis] - positions[a + axis] for axis in range(3)]
                    ac = [positions[c + axis] - positions[a + axis] for axis in range(3)]
                    cross = [
                        ab[1] * ac[2] - ab[2] * ac[1],
                        ab[2] * ac[0] - ab[0] * ac[2],
                        ab[0] * ac[1] - ab[1] * ac[0],
                    ]
                    if sum(value * value for value in cross) <= area_threshold_squared:
                        degenerate += 1
                if degenerate:
                    return None
                triangle_count = len(indices) // 3
                triangles += triangle_count
                geometry_checks.append({
                    "finitePositions": True,
                    "finiteNormals": True,
                    "indicesInRange": True,
                    "degenerateTriangles": 0,
                    "triangles": triangle_count,
                    "boundsMetres": {"min": low, "max": high},
                })
        stats = json.loads(stats_path.read_text(encoding="utf-8"))
        prior_source_sha = str(stats.get("source", {}).get("sha256", ""))
        fingerprint = stats.get("buildFingerprint", {})
        expected_reduction_path = (
            "direct-uncompressed-glb-buffer-grid"
            if expected_source_bytes is not None and expected_source_bytes >= DIRECT_GLB_THRESHOLD_BYTES
            else "vtk-import-clean-cluster"
        )
        transform_matrix = fingerprint.get("transform", {}).get("matrix")
        if (
            mesh_count <= 0
            or triangles <= 0
            or str(stats.get("id")) != part_id
            or int(stats.get("targetTriangles", -1)) != target
            or int(stats.get("triangles", -1)) != triangles
            or int(stats.get("bytesBeforeMeshopt", -1)) != path.stat().st_size
            or (expected_source_sha256 is not None and prior_source_sha.lower() != expected_source_sha256.lower())
            or str(stats.get("coordinateMap")) != expected_coordinate_map
            or str(fingerprint.get("pipelineVersion")) != TOOL_VERSION
            or str(fingerprint.get("scriptSha256")) != sha256(Path(__file__).resolve())
            or str(fingerprint.get("sourceSha256", "")).lower() != str(expected_source_sha256 or "").lower()
            or int(fingerprint.get("targetTriangles", -1)) != target
            or not math.isclose(float(fingerprint.get("featureAngleDegrees", math.nan)), expected_feature_angle)
            or str(fingerprint.get("coordinateMap")) != expected_coordinate_map
            or str(fingerprint.get("reductionPath")) != expected_reduction_path
            or str(fingerprint.get("clusterPolicy")) != CLUSTER_POLICY
            or (
                expected_reduction_path == "direct-uncompressed-glb-buffer-grid"
                and (
                    not isinstance(transform_matrix, list)
                    or len(transform_matrix) != 16
                    or not all(math.isfinite(float(value)) for value in transform_matrix)
                )
            )
        ):
            return None
        bounds = stats.get("boundsMetres", {})
        values = [*bounds.get("min", []), *bounds.get("max", [])]
        if len(values) != 6 or not all(math.isfinite(float(value)) for value in values):
            return None
        stats["resumeValidation"] = {
            "status": "PASS",
            "glbSha256": sha256(path),
            "stableNode": f"{STABLE_NODE_PREFIX}{part_id}",
            "triangles": triangles,
            "geometry": geometry_checks,
        }
        return stats
    except (KeyError, IndexError, TypeError, ValueError, OSError, json.JSONDecodeError):
        return None


def resource_monitor_summary(path: Path) -> dict[str, int]:
    peak = 0
    minimum_free = 2**63 - 1
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if not line.strip():
            continue
        sample = json.loads(line)
        peak = max(peak, int(sample.get("processTreeWorkingSetBytes", 0)))
        free = int(sample.get("freePhysicalBytes", 0))
        if free > 0:
            minimum_free = min(minimum_free, free)
    return {
        "peakProcessTreeWorkingSetBytes": peak,
        "minimumAvailablePhysicalBytes": 0 if minimum_free == 2**63 - 1 else minimum_free,
    }


def compare_bounds_qa(
    observed: dict[str, list[float]],
    expected: dict[str, list[float]],
    tolerance: float = 0.02,
) -> dict[str, Any]:
    delta = max(
        abs(float(observed[side][axis]) - float(expected[side][axis]))
        for side in ("min", "max")
        for axis in range(3)
    )
    if not math.isfinite(delta) or delta > tolerance:
        raise RuntimeError(f"Simplified bounds diverged from device-frame evidence by {delta} m")
    return {
        "status": "PASS",
        "expectedWebBoundsMetres": expected,
        "observedWebBoundsMetres": observed,
        "maximumDeltaMetres": delta,
        "toleranceMetres": tolerance,
    }


def visualization_bounds_tolerance(bounds: dict[str, list[float]], part_id: str) -> float:
    if part_id == DIVERTOR_ID:
        return 0.02
    diagonal = math.sqrt(sum(
        (float(bounds["max"][axis]) - float(bounds["min"][axis])) ** 2
        for axis in range(3)
    ))
    return max(0.075, 0.005 * diagonal)


def divertor_bounds_qa(observed: dict[str, list[float]], source_bounds: list[list[float]]) -> dict[str, Any]:
    source_min, source_max = source_bounds
    expected = {
        "min": [source_min[0], source_min[2], -source_max[1]],
        "max": [source_max[0], source_max[2], -source_min[1]],
    }
    return compare_bounds_qa(observed, expected)


class MemoryStatusEx(ctypes.Structure):
    _fields_ = [
        ("dwLength", ctypes.c_ulong),
        ("dwMemoryLoad", ctypes.c_ulong),
        ("ullTotalPhys", ctypes.c_ulonglong),
        ("ullAvailPhys", ctypes.c_ulonglong),
        ("ullTotalPageFile", ctypes.c_ulonglong),
        ("ullAvailPageFile", ctypes.c_ulonglong),
        ("ullTotalVirtual", ctypes.c_ulonglong),
        ("ullAvailVirtual", ctypes.c_ulonglong),
        ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
    ]


class ProcessMemoryCounters(ctypes.Structure):
    _fields_ = [
        ("cb", ctypes.c_ulong),
        ("PageFaultCount", ctypes.c_ulong),
        ("PeakWorkingSetSize", ctypes.c_size_t),
        ("WorkingSetSize", ctypes.c_size_t),
        ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
        ("QuotaPagedPoolUsage", ctypes.c_size_t),
        ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
        ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
        ("PagefileUsage", ctypes.c_size_t),
        ("PeakPagefileUsage", ctypes.c_size_t),
    ]


class ProcessEntry32W(ctypes.Structure):
    _fields_ = [
        ("dwSize", ctypes.c_ulong),
        ("cntUsage", ctypes.c_ulong),
        ("th32ProcessID", ctypes.c_ulong),
        ("th32DefaultHeapID", ctypes.c_size_t),
        ("th32ModuleID", ctypes.c_ulong),
        ("cntThreads", ctypes.c_ulong),
        ("th32ParentProcessID", ctypes.c_ulong),
        ("pcPriClassBase", ctypes.c_long),
        ("dwFlags", ctypes.c_ulong),
        ("szExeFile", ctypes.c_wchar * 260),
    ]


def available_physical_memory() -> int | None:
    if os.name != "nt":
        return None
    status = MemoryStatusEx()
    status.dwLength = ctypes.sizeof(status)
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
        return None
    return int(status.ullAvailPhys)


def process_working_set(pid: int) -> int | None:
    if os.name != "nt":
        return None
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    psapi = ctypes.WinDLL("psapi", use_last_error=True)
    kernel32.OpenProcess.argtypes = [ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
    kernel32.OpenProcess.restype = ctypes.c_void_p
    kernel32.CloseHandle.argtypes = [ctypes.c_void_p]
    kernel32.CloseHandle.restype = ctypes.c_int
    psapi.GetProcessMemoryInfo.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong]
    psapi.GetProcessMemoryInfo.restype = ctypes.c_int
    handle = kernel32.OpenProcess(0x1000 | 0x0010, False, pid)
    if not handle:
        return None
    try:
        counters = ProcessMemoryCounters()
        counters.cb = ctypes.sizeof(counters)
        if not psapi.GetProcessMemoryInfo(handle, ctypes.byref(counters), counters.cb):
            return None
        return int(counters.WorkingSetSize)
    finally:
        kernel32.CloseHandle(handle)


def process_tree_pids(root_pid: int) -> set[int]:
    """Return root and all currently observable descendants on Windows."""
    if os.name != "nt":
        return {root_pid}
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.CreateToolhelp32Snapshot.argtypes = [ctypes.c_ulong, ctypes.c_ulong]
    kernel32.CreateToolhelp32Snapshot.restype = ctypes.c_void_p
    kernel32.Process32FirstW.argtypes = [ctypes.c_void_p, ctypes.POINTER(ProcessEntry32W)]
    kernel32.Process32FirstW.restype = ctypes.c_int
    kernel32.Process32NextW.argtypes = [ctypes.c_void_p, ctypes.POINTER(ProcessEntry32W)]
    kernel32.Process32NextW.restype = ctypes.c_int
    kernel32.CloseHandle.argtypes = [ctypes.c_void_p]
    kernel32.CloseHandle.restype = ctypes.c_int
    snapshot = kernel32.CreateToolhelp32Snapshot(0x00000002, 0)
    invalid = ctypes.c_void_p(-1).value
    if not snapshot or snapshot == invalid:
        return {root_pid}
    parents: dict[int, int] = {}
    try:
        entry = ProcessEntry32W()
        entry.dwSize = ctypes.sizeof(entry)
        available = bool(kernel32.Process32FirstW(snapshot, ctypes.byref(entry)))
        while available:
            parents[int(entry.th32ProcessID)] = int(entry.th32ParentProcessID)
            available = bool(kernel32.Process32NextW(snapshot, ctypes.byref(entry)))
    finally:
        kernel32.CloseHandle(snapshot)
    tree = {root_pid}
    changed = True
    while changed:
        before = len(tree)
        tree.update(pid for pid, parent in parents.items() if parent in tree)
        changed = len(tree) != before
    return tree


def terminate_process_tree(pid: int) -> None:
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        return
    try:
        os.kill(pid, 9)
    except ProcessLookupError:
        pass


def monitored_worker(
    command: list[str],
    log_path: Path,
    max_working_set: int,
    min_free_memory: int,
    *,
    cwd: Path | None = None,
    env: dict[str, str] | None = None,
) -> dict[str, int]:
    peak_tree = 0
    minimum_free = 2**63 - 1
    with log_path.open("w", encoding="utf-8") as log:
        process = subprocess.Popen(
            command,
            cwd=cwd,
            env=env,
            stdout=log,
            stderr=subprocess.STDOUT,
            text=True,
        )
        while process.poll() is None:
            tree_pids = process_tree_pids(process.pid)
            working_sets = [value for pid in tree_pids if (value := process_working_set(pid)) is not None]
            working_set = sum(working_sets) if working_sets else None
            free = available_physical_memory()
            if working_set is not None:
                peak_tree = max(peak_tree, working_set)
            if free is not None:
                minimum_free = min(minimum_free, free)
            if working_set is not None and working_set > max_working_set:
                terminate_process_tree(process.pid)
                raise MemoryError(
                    f"Process tree rooted at {process.pid} exceeded {max_working_set} bytes "
                    f"({working_set} across {len(tree_pids)} processes); see {log_path}"
                )
            if free is not None and free < min_free_memory:
                terminate_process_tree(process.pid)
                raise MemoryError(f"System memory fell below {min_free_memory} bytes; see {log_path}")
            time.sleep(2)
        if process.returncode:
            raise RuntimeError(f"Worker failed with exit code {process.returncode}; see {log_path}")
    return {
        "peakProcessTreeWorkingSetBytes": peak_tree,
        "minimumAvailablePhysicalBytes": 0 if minimum_free == 2**63 - 1 else minimum_free,
    }


def run_logged_monitored(
    command: list[str],
    cwd: Path,
    log_path: Path,
    max_working_set: int,
    min_free_memory: int,
    env: dict[str, str] | None = None,
) -> str:
    monitored_worker(
        command,
        log_path,
        max_working_set,
        min_free_memory,
        cwd=cwd,
        env=env,
    )
    return log_path.read_text(encoding="utf-8")


def run_logged(command: list[str], cwd: Path, log_path: Path, env: dict[str, str] | None = None) -> str:
    result = subprocess.run(
        command,
        cwd=cwd,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    log_path.write_text(result.stdout, encoding="utf-8")
    if result.returncode:
        raise RuntimeError(f"Command failed ({result.returncode}); see {log_path}")
    return result.stdout


def gltf_transform_command() -> list[str]:
    executable = "npx.cmd" if os.name == "nt" else "npx"
    return [executable, "--yes", f"@gltf-transform/cli@{GLTF_TRANSFORM_VERSION}"]


def decoded_geometry_bytes(document: dict[str, Any]) -> int:
    """Return logical GPU geometry bytes, counting each referenced accessor once.

    A single accessor may be intentionally shared by several primitives.  Summing
    at the primitive level overstates the decoded allocation, so this metric first
    builds the unique set of geometry accessor IDs and only then totals them.
    """
    accessors = document.get("accessors", [])
    component_bytes = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
    type_components = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}
    referenced: set[int] = set()
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            referenced.update(int(value) for value in primitive.get("attributes", {}).values())
            if primitive.get("indices") is not None:
                referenced.add(int(primitive["indices"]))
            for target in primitive.get("targets", []):
                referenced.update(int(value) for value in target.values())
    total = 0
    for accessor_id in referenced:
        if accessor_id < 0 or accessor_id >= len(accessors):
            raise RuntimeError(f"Geometry references invalid accessor {accessor_id}")
        accessor = accessors[accessor_id]
        component_type = int(accessor.get("componentType", -1))
        accessor_type = str(accessor.get("type", ""))
        if component_type not in component_bytes or accessor_type not in type_components:
            raise RuntimeError(
                f"Geometry accessor {accessor_id} has unsupported layout "
                f"componentType={component_type}, type={accessor_type!r}"
            )
        total += (
            int(accessor.get("count", 0))
            * component_bytes[component_type]
            * type_components[accessor_type]
        )
    return total


def final_document_qa(path: Path, registered_components: list[dict[str, Any]]) -> dict[str, Any]:
    document, chunks = read_glb(path)
    expected = {f"{STABLE_NODE_PREFIX}{item['id']}" for item in registered_components}
    nodes = document.setdefault("nodes", [])
    actual = {str(node.get("name")) for node in nodes if str(node.get("name", "")).startswith(STABLE_NODE_PREFIX)}
    missing = expected - actual
    unexpected = actual - expected
    if missing or unexpected:
        raise RuntimeError(
            f"Final package stable-node set mismatch; missing={sorted(missing)}, extra={sorted(unexpected)}"
        )
    asset = document.setdefault("asset", {})
    asset["extras"] = {"publicationStatus": "PUBLIC_VISUALIZATION_DERIVATIVE_REVIEWED"}
    for node in nodes:
        if str(node.get("name", "")).startswith(STABLE_NODE_PREFIX):
            node.setdefault("extras", {})["geometryStatus"] = "registered-public-visualization-derivative"
    write_glb_document(path, document, chunks)

    checked, _ = read_glb(path)
    accessors = checked.get("accessors", [])
    meshes = checked.get("meshes", [])
    nodes = checked.get("nodes", [])
    triangles = 0
    vertices = 0
    primitive_count = 0
    decoded_geometry_byte_count = decoded_geometry_bytes(checked)

    def primitive_geometry_signature(primitive: dict[str, Any]) -> tuple[Any, ...]:
        targets = tuple(
            tuple(sorted((str(name), int(accessor_id)) for name, accessor_id in target.items()))
            for target in primitive.get("targets", [])
        )
        return (
            int(primitive.get("mode", 4)),
            int(primitive.get("indices", -1)),
            tuple(sorted((str(name), int(accessor_id)) for name, accessor_id in primitive.get("attributes", {}).items())),
            targets,
        )

    seen_geometry_resources: set[tuple[Any, ...]] = set()
    for mesh in meshes:
        for primitive in mesh.get("primitives", []):
            primitive_count += 1
            signature = primitive_geometry_signature(primitive)
            if signature in seen_geometry_resources:
                continue
            seen_geometry_resources.add(signature)
            position = primitive.get("attributes", {}).get("POSITION")
            if position is not None:
                vertices += int(accessors[position].get("count", 0))
            indices = primitive.get("indices", position)
            count = int(accessors[indices].get("count", 0)) if indices is not None else 0
            mode = int(primitive.get("mode", 4))
            if mode == 4:
                triangles += count // 3
            elif mode in (5, 6):
                triangles += max(0, count - 2)
    stable_names = sorted(
        str(node.get("name")) for node in nodes
        if str(node.get("name", "")).startswith(STABLE_NODE_PREFIX)
    )
    stable_node_ids = {
        str(node.get("name")): index
        for index, node in enumerate(nodes)
        if str(node.get("name", "")).startswith(STABLE_NODE_PREFIX)
    }
    ownership: dict[str, Any] = {}
    mesh_owners: dict[int, list[str]] = {}
    for stable_name, root_id in stable_node_ids.items():
        pending = [root_id]
        visited: set[int] = set()
        owned_meshes: set[int] = set()
        owned_mesh_instances: list[int] = []
        while pending:
            node_id = pending.pop()
            if node_id in visited:
                continue
            if node_id < 0 or node_id >= len(nodes):
                raise RuntimeError(f"Stable node {stable_name} reaches invalid node {node_id}")
            visited.add(node_id)
            node = nodes[node_id]
            if node_id != root_id and str(node.get("name", "")).startswith(STABLE_NODE_PREFIX):
                raise RuntimeError(f"Stable node {stable_name} nests another stable identity")
            if "mesh" in node:
                mesh_id = int(node["mesh"])
                if mesh_id < 0 or mesh_id >= len(meshes):
                    raise RuntimeError(f"Stable node {stable_name} reaches invalid mesh {mesh_id}")
                owned_meshes.add(mesh_id)
                owned_mesh_instances.append(mesh_id)
            pending.extend(int(value) for value in node.get("children", []))
        if not owned_meshes:
            raise RuntimeError(f"Stable node {stable_name} owns no visible mesh")
        owned_primitives = 0
        owned_triangles = 0
        owned_vertices = 0
        owned_geometry_resources: set[tuple[Any, ...]] = set()
        for mesh_id in sorted(owned_meshes):
            mesh_owners.setdefault(mesh_id, []).append(stable_name)
            for primitive in meshes[mesh_id].get("primitives", []):
                signature = primitive_geometry_signature(primitive)
                if signature in owned_geometry_resources:
                    continue
                owned_geometry_resources.add(signature)
                owned_primitives += 1
                position_id = primitive.get("attributes", {}).get("POSITION")
                if position_id is not None:
                    owned_vertices += int(accessors[int(position_id)].get("count", 0))
                index_id = primitive.get("indices", position_id)
                count = int(accessors[int(index_id)].get("count", 0)) if index_id is not None else 0
                mode = int(primitive.get("mode", 4))
                owned_triangles += count // 3 if mode == 4 else max(0, count - 2) if mode in (5, 6) else 0
        draw_triangles = 0
        draw_vertices = 0
        draw_primitives = 0
        for mesh_id in owned_mesh_instances:
            for primitive in meshes[mesh_id].get("primitives", []):
                draw_primitives += 1
                position_id = primitive.get("attributes", {}).get("POSITION")
                if position_id is not None:
                    draw_vertices += int(accessors[int(position_id)].get("count", 0))
                index_id = primitive.get("indices", position_id)
                count = int(accessors[int(index_id)].get("count", 0)) if index_id is not None else 0
                mode = int(primitive.get("mode", 4))
                draw_triangles += count // 3 if mode == 4 else max(0, count - 2) if mode in (5, 6) else 0
        ownership[stable_name] = {
            "nodeIndex": root_id,
            "meshIndices": sorted(owned_meshes),
            "meshes": len(owned_meshes),
            "meshInstances": len(owned_mesh_instances),
            "primitives": draw_primitives,
            "vertices": draw_vertices,
            "triangles": draw_triangles,
            "uniqueGeometryPrimitives": owned_primitives,
            "uniqueGeometryVertices": owned_vertices,
            "uniqueGeometryTriangles": owned_triangles,
        }
    shared_meshes = {mesh_id: owners for mesh_id, owners in mesh_owners.items() if len(owners) != 1}
    unowned_meshes = sorted(set(range(len(meshes))) - set(mesh_owners))
    if shared_meshes or unowned_meshes:
        raise RuntimeError(
            f"Final stable mesh ownership is not one-to-one; shared={shared_meshes}, unowned={unowned_meshes}"
        )
    scene_draw_triangles = sum(int(item["triangles"]) for item in ownership.values())
    scene_draw_vertices = sum(int(item["vertices"]) for item in ownership.values())
    mesh_instances = sum(int(item["meshInstances"]) for item in ownership.values())
    return {
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
        "nodes": len(checked.get("nodes", [])),
        "meshes": len(checked.get("meshes", [])),
        "primitives": primitive_count,
        # Compatibility fields remain unique resource geometry.  Viewer draw
        # work is explicit because one resource may have several scene nodes.
        "vertices": vertices,
        "triangles": triangles,
        "sceneDrawVertices": scene_draw_vertices,
        "sceneDrawTriangles": scene_draw_triangles,
        "meshInstances": mesh_instances,
        "uniqueGeometryVertices": vertices,
        "uniqueGeometryTriangles": triangles,
        "decodedGeometryBytes": decoded_geometry_byte_count,
        "extensionsUsed": checked.get("extensionsUsed", []),
        "extensionsRequired": checked.get("extensionsRequired", []),
        "stableNodes": stable_names,
        "stableMeshOwnership": ownership,
    }


def decoded_final_geometry_qa(path: Path, *, raise_on_error: bool = True) -> dict[str, Any]:
    """Validate the dequantized, decompressed form of the final delivery geometry."""
    document, chunks = read_glb(path)
    forbidden = {"EXT_meshopt_compression", "KHR_mesh_quantization"}
    present = forbidden.intersection(document.get("extensionsUsed", []))
    if present:
        raise RuntimeError(f"Decoded QA artifact still uses encoded geometry extensions: {sorted(present)}")
    binary = next((data for kind, data in chunks if kind == BIN_CHUNK), None)
    if binary is None:
        raise RuntimeError("Decoded QA artifact has no BIN chunk")
    accessors = document.get("accessors", [])
    views = document.get("bufferViews", [])

    def read_vec3(accessor_id: int) -> list[tuple[float, float, float]]:
        accessor = accessors[accessor_id]
        if int(accessor.get("componentType", 0)) != 5126 or accessor.get("type") != "VEC3" or accessor.get("sparse"):
            raise RuntimeError("Decoded QA requires non-sparse float32 VEC3 vertex accessors")
        view = views[int(accessor["bufferView"])]
        start = int(view.get("byteOffset", 0)) + int(accessor.get("byteOffset", 0))
        stride = int(view.get("byteStride", 12))
        if stride < 12:
            raise RuntimeError("Decoded QA VEC3 byteStride is invalid")
        count = int(accessor.get("count", 0))
        values = [struct.unpack_from("<3f", binary, start + row * stride) for row in range(count)]
        if not all(math.isfinite(value) for item in values for value in item):
            raise RuntimeError("Decoded QA found non-finite vertex data")
        return values

    def read_indices(accessor_id: int) -> list[int]:
        accessor = accessors[accessor_id]
        formats = {5121: ("<B", 1), 5123: ("<H", 2), 5125: ("<I", 4)}
        component_type = int(accessor.get("componentType", 0))
        if component_type not in formats or accessor.get("type") != "SCALAR" or accessor.get("sparse"):
            raise RuntimeError("Decoded QA found an unsupported index accessor")
        fmt, size = formats[component_type]
        view = views[int(accessor["bufferView"])]
        start = int(view.get("byteOffset", 0)) + int(accessor.get("byteOffset", 0))
        stride = int(view.get("byteStride", size))
        if stride < size:
            raise RuntimeError("Decoded QA index byteStride is invalid")
        return [struct.unpack_from(fmt, binary, start + row * stride)[0] for row in range(int(accessor.get("count", 0)))]

    triangles = 0
    vertices = 0
    degenerate = 0
    duplicate = 0
    low = [math.inf, math.inf, math.inf]
    high = [-math.inf, -math.inf, -math.inf]
    per_mesh: dict[str, dict[str, int]] = {}
    for mesh_id, mesh in enumerate(document.get("meshes", [])):
        mesh_triangles = 0
        mesh_degenerate = 0
        mesh_duplicate = 0
        for primitive in mesh.get("primitives", []):
            if int(primitive.get("mode", 4)) != 4 or "indices" not in primitive:
                raise RuntimeError("Decoded final QA requires indexed triangle primitives")
            position_id = int(primitive.get("attributes", {}).get("POSITION", -1))
            normal_id = int(primitive.get("attributes", {}).get("NORMAL", -1))
            if position_id < 0 or normal_id < 0:
                raise RuntimeError("Decoded final QA requires POSITION and NORMAL")
            positions = read_vec3(position_id)
            normals = read_vec3(normal_id)
            if len(normals) != len(positions):
                raise RuntimeError("Decoded final QA POSITION/NORMAL counts differ")
            indices = read_indices(int(primitive["indices"]))
            if len(indices) % 3 or (indices and max(indices) >= len(positions)):
                raise RuntimeError("Decoded final QA indices are malformed or out of range")
            vertices += len(positions)
            triangles += len(indices) // 3
            mesh_triangles += len(indices) // 3
            primitive_low = [min(point[axis] for point in positions) for axis in range(3)]
            primitive_high = [max(point[axis] for point in positions) for axis in range(3)]
            for point in positions:
                for axis in range(3):
                    low[axis] = min(low[axis], point[axis])
                    high[axis] = max(high[axis], point[axis])
            # Quantization adds one uniform scale + translation per mesh, so the
            # primitive-local aspect test is invariant between accessor and world
            # space. Never use the accumulated scene AABB here: it makes the result
            # dependent on mesh traversal order and can falsely reject small parts.
            diagonal_squared = sum(
                (primitive_high[axis] - primitive_low[axis]) ** 2 for axis in range(3)
            )
            area_threshold_squared = max(diagonal_squared * 1e-12, 1e-18) ** 2
            seen: set[tuple[tuple[float, float, float], ...]] = set()
            for cell in range(0, len(indices), 3):
                points = [positions[indices[cell + offset]] for offset in range(3)]
                ab = [points[1][axis] - points[0][axis] for axis in range(3)]
                ac = [points[2][axis] - points[0][axis] for axis in range(3)]
                cross = (
                    ab[1] * ac[2] - ab[2] * ac[1],
                    ab[2] * ac[0] - ab[0] * ac[2],
                    ab[0] * ac[1] - ab[1] * ac[0],
                )
                if sum(value * value for value in cross) <= area_threshold_squared:
                    degenerate += 1
                    mesh_degenerate += 1
                canonical = tuple(sorted(points))
                if canonical in seen:
                    duplicate += 1
                    mesh_duplicate += 1
                else:
                    seen.add(canonical)
        per_mesh[str(mesh.get("name") or f"mesh-{mesh_id}")] = {
            "triangles": mesh_triangles,
            "degenerateTriangles": mesh_degenerate,
            "duplicateTriangles": mesh_duplicate,
        }
    if raise_on_error and (triangles <= 0 or vertices <= 0 or degenerate or duplicate):
        raise RuntimeError(
            f"Decoded final geometry QA failed: triangles={triangles}, vertices={vertices}, "
            f"degenerate={degenerate}, duplicate={duplicate}"
        )
    return {
        "status": "PASS",
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
        "triangles": triangles,
        "vertices": vertices,
        "finitePositions": True,
        "finiteNormals": True,
        "indicesInRange": True,
        "degenerateTriangles": degenerate,
        "duplicateTriangles": duplicate,
        "perMesh": per_mesh,
        "boundsAccessorSpace": {"min": low, "max": high},
    }


def refresh_candidate_manifest_statistics(private_root: Path, candidate_id: str) -> int:
    """Refresh derived statistics only; never rebuild or rewrite the candidate GLB."""
    candidate = safe_output(private_root / "derived-candidates" / candidate_id, private_root)
    final = candidate / "iter-full-device-preview.meshopt.glb"
    manifest_path = candidate / "manifest.candidate.json"
    if not final.is_file() or not manifest_path.is_file():
        raise FileNotFoundError(f"Candidate GLB or manifest is missing below {candidate}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    artifact = manifest.get("artifact")
    if not isinstance(artifact, dict):
        raise RuntimeError("Candidate manifest has no artifact record")
    actual_bytes = final.stat().st_size
    actual_sha256 = sha256(final)
    if int(artifact.get("bytes", -1)) != actual_bytes or str(artifact.get("sha256", "")).upper() != actual_sha256:
        raise RuntimeError("Candidate artifact identity differs from its manifest; refusing statistics-only refresh")
    document, _ = read_glb(final)
    logical_bytes = decoded_geometry_bytes(document)
    artifact["decodedGeometryBytes"] = logical_bytes
    artifact["decodedGeometryByteCounting"] = "unique referenced accessors counted once"
    atomic_write_json(manifest_path, manifest)
    print(json.dumps({
        "manifest": str(manifest_path),
        "artifactBytes": actual_bytes,
        "artifactSha256": actual_sha256,
        "decodedGeometryBytes": logical_bytes,
        "glbRewritten": False,
    }))
    return 0


def parse_scene_bounds(inspect_output: str) -> dict[str, list[float]] | None:
    lines = inspect_output.splitlines()
    for index, line in enumerate(lines):
        if line.startswith("#,name,rootName,bboxMin,bboxMax"):
            for row_line in lines[index + 1 :]:
                if not row_line.strip():
                    continue
                row = next(csv.reader([row_line]))
                if len(row) < 5:
                    return None
                return {
                    "min": [float(value.strip()) for value in row[3].split(",")],
                    "max": [float(value.strip()) for value in row[4].split(",")],
                }
    return None


def build(args: argparse.Namespace) -> int:
    private_root = args.private_root.resolve()
    package_path = private_root / "local-viewer" / "local-device-package.json"
    inventory_path = private_root / "conversion-agent-inventory.private.json"
    divertor_root = private_root / "derived-candidates" / "divertor-device-frame"
    divertor_report_path = divertor_root / "occ-recovery.json"
    divertor_monitor_path = divertor_root / "selective-resource-monitor.jsonl"
    package = json.loads(package_path.read_text(encoding="utf-8"))
    inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
    divertor_report = json.loads(divertor_report_path.read_text(encoding="utf-8"))
    divertor_mesh = divertor_report["coarseStl"]
    divertor_source = (divertor_root / str(divertor_mesh["fileName"])).resolve()
    components: list[dict[str, Any]] = package["components"]
    inventory_components = {str(item["id"]): item for item in inventory["components"]}
    if len(components) != 18 or len({item["id"] for item in components}) != 18:
        raise RuntimeError("ITER local package must declare exactly 18 unique stable components")
    if set(inventory_components) != {str(item["id"]) for item in components}:
        raise RuntimeError("Private conversion inventory and local package must declare the same 18 stable IDs")
    registered_ids = {
        part_id
        for part_id, item in inventory_components.items()
        if item.get("derived") is not None
        and item.get("coordinateRegistration", {}).get("transform") is not None
    }
    divertor_valid = (
        divertor_source.is_file()
        and divertor_source.is_relative_to((private_root / "derived-candidates").resolve())
        and divertor_source.stat().st_size == int(divertor_mesh["bytes"])
        and sha256(divertor_source).lower() == str(divertor_mesh["sha256"]).lower()
        and int(divertor_mesh["triangles"]) > 0
        and divertor_report.get("validation", {}).get("sourceHash") == "PASS"
        and bool(divertor_report.get("validation", {}).get("assemblyMatricesFromConflictFreeStreamingGraph"))
        and bool(divertor_report.get("validation", {}).get("meshBoundsMatchStreamingWorldVerticesWithin0.25m"))
        and float(divertor_mesh.get("maxBoundDeltaMetres", math.inf)) <= 0.01
    )
    if not divertor_valid:
        raise RuntimeError("Authoritative device-frame divertor mesh/report failed provenance, registration or bounds QA")
    registered_ids.add(DIVERTOR_ID)
    ready = [item for item in components if str(item["id"]) in registered_ids]
    if len(ready) != 18:
        raise RuntimeError(f"Expected all 18 device-registered visualization sources; found {len(ready)}")
    unresolved = [item for item in components if str(item["id"]) not in registered_ids]
    if args.release and unresolved:
        ids = ", ".join(str(item["id"]) for item in unresolved)
        raise RuntimeError(
            "RELEASE_BLOCKED: every declared ITER component must contain reviewed, registered geometry; "
            f"unresolved components: {ids}"
        )
    candidate = safe_output(private_root / "derived-candidates" / args.candidate_id, private_root)
    stage = safe_output(candidate / "stage", private_root)
    logs = safe_output(candidate / "logs", private_root)
    base_target = args.target_triangles - args.divertor_target_triangles
    if base_target < 17 * 2_500:
        raise ValueError("Total triangle budget is too small after reserving the divertor budget")
    budget_components = [
        {**item, "status": "ready"}
        for item in components
        if str(item["id"]) in registered_ids and str(item["id"]) != DIVERTOR_ID
    ]
    budgets = allocate_budgets(budget_components, base_target)
    budgets[DIVERTOR_ID] = min(args.divertor_target_triangles, int(divertor_mesh["triangles"]))
    part_outputs: list[Path] = []
    build_records: list[dict[str, Any]] = []

    def processing_priority(item: dict[str, Any]) -> tuple[int, int]:
        part_id = str(item["id"])
        staged = stage / f"{part_id}.raw.glb"
        if staged.is_file() and staged.with_suffix(".build.json").is_file():
            return (0, 0)
        if part_id == DIVERTOR_ID:
            return (1, int(divertor_mesh["triangles"]))
        return (2, int(inventory_components[part_id]["derived"]["triangles"]))

    for item in sorted(components, key=processing_priority):
        part_id = str(item["id"])
        output = stage / f"{part_id}.raw.glb"
        stats_path = output.with_suffix(".build.json")
        inventory_item = inventory_components[part_id]
        if part_id not in registered_ids:
            visual = inventory_item["visualizationSource"]
            engineering = inventory_item["privateRecoveredBRep"]
            registration = inventory_item["coordinateRegistration"]
            build_records.append({
                "id": part_id,
                "geometryStatus": "blocked-registration-unresolved",
                "registrationStatus": "unresolved-local-print-frame",
                "sourceVisualMember": inventory_item["officialPackage"]["formats"]["stl"]["memberPath"],
                "sourceVisualPath": relative_posix(Path(visual["path"]), private_root),
                "sourceVisualBytes": int(visual["bytes"]),
                "sourceVisualSha256": str(visual["sha256"]).upper(),
                "sourceEngineeringPath": relative_posix(Path(engineering["path"]), private_root),
                "sourceEngineeringBytes": int(engineering["bytes"]),
                "sourceEngineeringSha256": str(engineering["sha256"]).upper(),
                "registrationAudit": {
                    "path": relative_posix(Path(registration["auditPath"]), private_root),
                    "decision": registration["decision"],
                    "evidence": registration["evidence"],
                },
                "warning": "Official STL is a component-specific print frame. The registration audit rejected a common transform; no geometry is emitted.",
            })
            continue

        if part_id == DIVERTOR_ID:
            source = divertor_source
            input_format = "stl"
            coordinate_map = "cad-z-up-to-web-y-up"
            source_record = {
                "path": relative_posix(source, private_root),
                "bytes": int(divertor_mesh["bytes"]),
                "sha256": str(divertor_mesh["sha256"]).upper(),
                "triangles": int(divertor_mesh["triangles"]),
                "coordinateRegistration": {
                    "sourceFrame": divertor_mesh["coordinateFrame"],
                    "targetFrame": "ITER web device assembly frame in metres",
                    "coordinateMap": "(x,y,z) -> (x,z,-y)",
                    "evidenceReport": relative_posix(divertor_report_path, private_root),
                    "maxBoundDeltaMetres": float(divertor_mesh["maxBoundDeltaMetres"]),
                    "validation": divertor_report["validation"],
                },
                "recoveryResource": {
                    **resource_monitor_summary(divertor_monitor_path),
                    "monitorPath": relative_posix(divertor_monitor_path, private_root),
                },
            }
            source_min, source_max = divertor_mesh["boundsMetres"]
            expected_bounds = {
                "min": [source_min[0], source_min[2], -source_max[1]],
                "max": [source_max[0], source_max[2], -source_min[1]],
            }
        else:
            derived = inventory_item["derived"]
            source = Path(str(derived["path"])).resolve()
            input_format = "glb"
            coordinate_map = "identity"
            if not source.is_file() or not source.is_relative_to((private_root / "derived").resolve()):
                raise FileNotFoundError(f"Registered private source is missing or escaped controlled derived root: {source}")
            if (
                source.stat().st_size != int(derived["bytes"])
                or int(item["bytes"]) != int(derived["bytes"])
                or str(item["derivativeSha256"]).lower() != str(derived["sha256"]).lower()
                or int(item["triangles"]) != int(derived["triangles"])
            ):
                raise RuntimeError(f"Private inventory/package/source mismatch for {part_id}")
            source_record = {
                "path": relative_posix(source, private_root),
                "bytes": int(derived["bytes"]),
                "sha256": str(derived["sha256"]).upper(),
                "triangles": int(derived["triangles"]),
                "coordinateRegistration": inventory_item["coordinateRegistration"],
            }
            expected_bounds = derived["boundsMetres"]
        if args.resume:
            resumed = validate_resumable_part(
                output,
                stats_path,
                part_id,
                budgets[part_id],
                source_record["sha256"],
                coordinate_map,
                args.feature_angle,
                int(source_record["bytes"]),
            )
            if resumed is not None:
                try:
                    resume_bounds_qa = compare_bounds_qa(
                        resumed["boundsMetres"],
                        expected_bounds,
                        visualization_bounds_tolerance(expected_bounds, part_id),
                    )
                except RuntimeError:
                    print(json.dumps({"stage": "invalidate-resume-bounds", "id": part_id}), flush=True)
                    resumed = None
            if resumed is not None:
                legacy_peak = resumed.pop("peakWorkingSetBytes", None)
                resumed["source"] = source_record
                resumed["buildDisposition"] = "resumed-structurally-validated"
                resumed["memoryMonitoring"] = (
                    "recursive-process-tree"
                    if "peakProcessTreeWorkingSetBytes" in resumed
                    else "legacy-run-not-recursively-measured"
                )
                if legacy_peak is not None:
                    resumed["legacyDirectLauncherPeakBytesIgnored"] = legacy_peak
                resumed["boundsQa"] = resume_bounds_qa
                if part_id == DIVERTOR_ID:
                    resumed["divertorBoundsQa"] = divertor_bounds_qa(
                        resumed["boundsMetres"],
                        divertor_mesh["boundsMetres"],
                    )
                stats_path.write_text(json.dumps(resumed, indent=2) + "\n", encoding="utf-8")
                build_records.append(resumed)
                part_outputs.append(output)
                print(json.dumps({"stage": "resume-part", "id": part_id, "triangles": resumed["triangles"]}), flush=True)
                continue
        command = [
            str(args.vtk_python),
            str(Path(__file__).resolve()),
            "--worker",
            "--source", str(source),
            "--output", str(output),
            "--part-id", part_id,
            "--title", str(item["name"]),
            "--color", str(item["color"]),
            "--target", str(budgets[part_id]),
            "--feature-angle", str(args.feature_angle),
            "--input-format", input_format,
            "--coordinate-map", coordinate_map,
        ]
        print(json.dumps({"stage": "reduce-part", "id": part_id, "targetTriangles": budgets[part_id]}), flush=True)
        memory = monitored_worker(
            command,
            logs / f"{part_id}.vtk.log",
            args.max_working_set,
            args.min_free_memory,
        )
        stats = json.loads(stats_path.read_text(encoding="utf-8"))
        stats.update(memory)
        stats["source"] = source_record
        stats["buildDisposition"] = "fresh-recursive-memory-monitored"
        stats["memoryMonitoring"] = "recursive-process-tree"
        fresh_expected_bounds = expected_bounds if part_id == DIVERTOR_ID else stats["sourceBoundsMetres"]
        stats["boundsQa"] = compare_bounds_qa(
            stats["boundsMetres"],
            fresh_expected_bounds,
            visualization_bounds_tolerance(fresh_expected_bounds, part_id),
        )
        declared_delta = max(
            abs(float(stats["boundsMetres"][side][axis]) - float(expected_bounds[side][axis]))
            for side in ("min", "max")
            for axis in range(3)
        )
        stats["declaredSourceBoundsComparison"] = {
            "declaredBoundsMetres": expected_bounds,
            "maximumDeltaMetres": declared_delta,
            "note": "The strict simplification gate uses non-degenerate polygon-referenced source bounds; declared accessor bounds can include non-visible or degenerate extrema.",
        }
        if part_id == DIVERTOR_ID:
            stats["divertorBoundsQa"] = divertor_bounds_qa(
                stats["boundsMetres"],
                divertor_mesh["boundsMetres"],
            )
        stats_path.write_text(json.dumps(stats, indent=2) + "\n", encoding="utf-8")
        build_records.append(stats)
        part_outputs.append(output)
        print(json.dumps({"stage": "part-complete", "id": part_id, "triangles": stats["triangles"], "bytes": stats["bytesBeforeMeshopt"]}), flush=True)

    merged = stage / "iter-full-device-preview.raw.glb"
    print(json.dumps({"stage": "merge", "registeredParts": len(part_outputs)}), flush=True)
    merge_command = gltf_transform_command() + [
        "merge", *[relative_posix(path, private_root) for path in part_outputs],
        relative_posix(merged, private_root), "--merge-scenes",
    ]
    run_logged_monitored(
        merge_command,
        private_root,
        logs / "merge.log",
        args.max_working_set,
        args.min_free_memory,
    )
    optimized = stage / "iter-full-device-preview.optimized-uncompressed.glb"
    environment = dict(os.environ)
    environment["NODE_OPTIONS"] = "--max-old-space-size=8192"
    print(json.dumps({"stage": "optimize-uncompressed"}), flush=True)
    optimize_command = gltf_transform_command() + [
        "optimize", relative_posix(merged, private_root), relative_posix(optimized, private_root),
        "--compress", "false",
        "--flatten", "false", "--join", "false", "--instance", "false",
        "--palette", "false", "--simplify", "false", "--weld", "false",
        "--texture-compress", "false",
    ]
    run_logged_monitored(
        optimize_command,
        private_root,
        logs / "meshopt.log",
        args.max_working_set,
        args.min_free_memory,
        environment,
    )
    final = candidate / "iter-full-device-preview.meshopt.glb"
    print(json.dumps({"stage": "meshopt-quantize-position16"}), flush=True)
    run_logged_monitored(
        gltf_transform_command() + [
            "meshopt", relative_posix(optimized, private_root), relative_posix(final, private_root),
            "--level", "high", "--quantize-position", "16", "--quantize-normal", "8",
            "--quantization-volume", "mesh",
        ],
        private_root,
        logs / "meshopt-position16.log",
        args.max_working_set,
        args.min_free_memory,
        environment,
    )
    actual = final_document_qa(final, ready)
    decoded_quantized = stage / "iter-full-device-preview.decoded-quantized.glb"
    print(json.dumps({"stage": "post-meshopt-decode"}), flush=True)
    run_logged_monitored(
        gltf_transform_command() + [
            "optimize", relative_posix(final, private_root), relative_posix(decoded_quantized, private_root),
            "--compress", "false", "--flatten", "false", "--join", "false", "--instance", "false",
            "--palette", "false", "--simplify", "false", "--weld", "false", "--texture-compress", "false",
        ],
        private_root,
        logs / "decode-meshopt.log",
        args.max_working_set,
        args.min_free_memory,
        environment,
    )
    decoded = stage / "iter-full-device-preview.decoded-float-qa.glb"
    run_logged_monitored(
        gltf_transform_command() + [
            "dequantize", relative_posix(decoded_quantized, private_root), relative_posix(decoded, private_root),
        ],
        private_root,
        logs / "dequantize.log",
        args.max_working_set,
        args.min_free_memory,
        environment,
    )
    actual["postMeshoptDecodedQa"] = decoded_final_geometry_qa(decoded)
    inspect_output = run_logged_monitored(
        gltf_transform_command() + ["inspect", relative_posix(final, private_root), "--format", "csv"],
        private_root,
        logs / "inspect.csv",
        args.max_working_set,
        args.min_free_memory,
    )
    bounds = parse_scene_bounds(inspect_output)
    validate_output = run_logged_monitored(
        gltf_transform_command() + ["validate", relative_posix(final, private_root)],
        private_root,
        logs / "validate.log",
        args.max_working_set,
        args.min_free_memory,
    )
    actual["boundsMetres"] = bounds
    actual["glTfValidator"] = "PASS_WITH_MESHOPT_UNSUPPORTED_EXTENSION_INFO" if "No errors found" in validate_output else "REVIEW"

    required_extensions = set(actual["extensionsRequired"])
    stable_expected = sorted(f"{STABLE_NODE_PREFIX}{item['id']}" for item in ready)
    gates = {
        "glbContainer": "PASS",
        "meshoptRequired": "PASS" if "EXT_meshopt_compression" in required_extensions else "FAIL",
        "quantizationRequired": "PASS" if "KHR_mesh_quantization" in required_extensions else "FAIL",
        "stableIdentityNodes18": "PASS" if actual["stableNodes"] == stable_expected else "FAIL",
        "stableMeshOwnership18": "PASS" if len(actual["stableMeshOwnership"]) == 18 else "FAIL",
        "postMeshoptDecodedGeometry": "PASS" if actual["postMeshoptDecodedQa"]["status"] == "PASS" else "FAIL",
        "registeredGeometry18": "PASS" if len(ready) == 18 else "FAIL",
        "divertorRegistration": "PASS" if DIVERTOR_ID in registered_ids else "FAIL",
        "triangleBudget": "PASS" if actual["triangles"] <= args.target_triangles else "FAIL",
        "byteBudget": "PASS" if actual["bytes"] <= args.max_bytes else "FAIL",
        "recommendedSevenMiB": "PASS" if actual["bytes"] <= RECOMMENDED_MAX_BYTES else "REVIEW",
        "releaseGuard": "PASS" if not unresolved else "FAIL",
        "publicReleaseReady": "REVIEW_REQUIRED",
    }
    manifest = {
        "schemaVersion": "1.0-candidate",
        "candidateId": args.candidate_id,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "PRIVATE_PREVIEW_GEOMETRY_COMPLETE_PUBLICATION_REVIEW_REQUIRED",
        "distribution": "private candidate only; no publication action performed",
        "sourcePackage": {
            "path": relative_posix(package_path, private_root),
            "sha256": sha256(package_path),
            "declaredComponents": 18,
            "registeredGeometryComponents": 18,
        },
        "sourceInventory": {
            "path": relative_posix(inventory_path, private_root),
            "sha256": sha256(inventory_path),
            "schemaVersion": inventory.get("schemaVersion"),
        },
        "divertorRecovery": {
            "reportPath": relative_posix(divertor_report_path, private_root),
            "reportSha256": sha256(divertor_report_path),
            "sourceMeshPath": relative_posix(divertor_source, private_root),
            "sourceMeshSha256": sha256(divertor_source),
            "coordinateMap": "CAD metre Z-up (x,y,z) -> web metre Y-up (x,z,-y)",
            "resource": resource_monitor_summary(divertor_monitor_path),
        },
        "toolchain": {
            "pipeline": "Direct contiguous-buffer GLB decode for large parts or VTK import for smaller parts -> bake reviewed device transform -> QuadricClustering/grid clustering -> QuadricDecimation -> sharp-edge normals -> stable-node GLB -> glTF-Transform Meshopt/quantization",
            "pipelineVersion": TOOL_VERSION,
            "vtkPython": str(args.vtk_python.name),
            "gltfTransform": GLTF_TRANSFORM_VERSION,
            "meshoptimizerDependency": MESHOPTIMIZER_VERSION_RANGE,
            "gltfpack": "not installed",
            "blender": "not installed",
            "openCascade": "selective private STEP recovery produced the authoritative divertor input; this repack stage consumes its validated coarse STL",
        },
        "budgets": {
            "targetTriangles": args.target_triangles,
            "maximumBytes": args.max_bytes,
            "recommendedMaximumBytes": RECOMMENDED_MAX_BYTES,
            "maximumWorkerWorkingSetBytes": args.max_working_set,
            "minimumAvailablePhysicalBytes": args.min_free_memory,
        },
        "artifact": {"path": relative_posix(final, candidate), **actual},
        "parts": build_records,
        "qualityGates": gates,
        "releaseHandoff": {
            "geometryStatus": "18 of 18 registered private visualization components",
            "publicationStatus": "review required; this builder never writes public assets",
            "requirement": "Review distribution record and final browser QA before a separate, explicit public integration step.",
        },
    }
    atomic_write_json(candidate / "manifest.candidate.json", manifest)
    print(json.dumps({"artifact": actual, "qualityGates": gates}, ensure_ascii=False))
    advisory = {"publicReleaseReady", "recommendedSevenMiB"}
    return 0 if all(value == "PASS" for key, value in gates.items() if key not in advisory) else 2


def worker(args: argparse.Namespace) -> int:
    import numpy as np
    import vtk
    import vtk.util.numpy_support as ns

    source = args.source.resolve()
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    def select_quantization_safe_bounds_anchors(
        positions: Any,
        cells: Any,
        valid_cells: Any,
        surface_point_ids: Any,
        source_low: Any,
        source_high: Any,
    ) -> tuple[Any, int, list[dict[str, Any]]]:
        """Choose real source bounds triangles; globally unsafe ones are isolated later."""
        extent = np.maximum(source_high - source_low, 1e-12)
        diagonal = float(np.linalg.norm(extent))
        center = (source_low + source_high) / 2
        scale = float(np.max(extent) / 2)
        normalized = np.clip((positions.astype(np.float64) - center) / scale, -1.0, 1.0)
        quantized = (np.rint(np.abs(normalized) * 32767) * np.sign(normalized)).astype(np.int64)
        dequantized = quantized.astype(np.float64) / 32767 * scale + center
        area_threshold = max(diagonal * diagonal * 1e-12, 1e-18)
        selected: set[int] = set()
        extreme_ids: set[int] = set()
        records: list[dict[str, Any]] = []
        visible_positions = positions[surface_point_ids]
        tolerance = max(0.075, 0.005 * diagonal)
        for side, bounds in (("min", source_low), ("max", source_high)):
            for axis in range(3):
                bound = float(bounds[axis])
                exact_local = np.flatnonzero(np.isclose(visible_positions[:, axis], bound, atol=1e-6, rtol=0.0))
                point_ids = surface_point_ids[exact_local]
                extreme_ids.update(int(value) for value in point_ids)
                def ranked_incident(candidate_point_ids: Any) -> tuple[Any, Any, Any]:
                    point_mask = np.zeros(len(positions), dtype=np.bool_)
                    point_mask[candidate_point_ids] = True
                    incident_cells = np.flatnonzero(valid_cells & np.any(point_mask[cells], axis=1))
                    if not len(incident_cells):
                        return incident_cells, np.asarray([], dtype=np.float64), np.asarray([], dtype=np.bool_)
                    source_triangle_points = positions[cells[incident_cells]].astype(np.float64)
                    source_areas = np.linalg.norm(
                        np.cross(
                            source_triangle_points[:, 1] - source_triangle_points[:, 0],
                            source_triangle_points[:, 2] - source_triangle_points[:, 0],
                        ),
                        axis=1,
                    )
                    quantized_triangle_points = dequantized[cells[incident_cells]]
                    quantized_areas = np.linalg.norm(
                        np.cross(
                            quantized_triangle_points[:, 1] - quantized_triangle_points[:, 0],
                            quantized_triangle_points[:, 2] - quantized_triangle_points[:, 0],
                        ),
                        axis=1,
                    )
                    return incident_cells, source_areas, quantized_areas > area_threshold

                candidates, candidate_areas, quantization_safe = ranked_incident(point_ids)
                selection_mode = "exact-extreme"
                if not len(candidates):
                    near_local = np.flatnonzero(np.abs(visible_positions[:, axis] - bound) <= tolerance)
                    candidates, candidate_areas, quantization_safe = ranked_incident(surface_point_ids[near_local])
                    selection_mode = "within-bounds-tolerance"
                if not len(candidates):
                    raise RuntimeError(f"No real source bounds anchor for {args.part_id} {side}[{axis}]")
                preferred = np.flatnonzero(quantization_safe)
                if len(preferred):
                    order = preferred[np.argsort(candidate_areas[preferred])[::-1]]
                else:
                    order = np.argsort(candidate_areas)[::-1]
                    selection_mode += "-quantization-capsule-required"
                selected.update(int(value) for value in candidates[order[:32]])
                records.append({
                    "side": side,
                    "axis": axis,
                    "sourceBoundMetres": bound,
                    "exactExtremePointCount": int(len(point_ids)),
                    "candidateTriangleCount": int(len(candidates)),
                    "quantizationSafeCandidateCount": int(np.count_nonzero(quantization_safe)),
                    "selectionMode": selection_mode,
                })
        return np.asarray(sorted(selected), dtype=np.int64), len(extreme_ids), records

    def gltf_local_matrix(node: dict[str, Any]) -> Any:
        if "matrix" in node:
            values = np.asarray(node["matrix"], dtype=np.float64)
            if values.shape != (16,):
                raise RuntimeError("Invalid glTF node matrix")
            return values.reshape((4, 4), order="F")
        translation = np.asarray(node.get("translation", (0.0, 0.0, 0.0)), dtype=np.float64)
        scale = np.asarray(node.get("scale", (1.0, 1.0, 1.0)), dtype=np.float64)
        x, y, z, w = (float(value) for value in node.get("rotation", (0.0, 0.0, 0.0, 1.0)))
        rotation = np.asarray((
            (1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)),
            (2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)),
            (2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)),
        ), dtype=np.float64)
        result = np.eye(4, dtype=np.float64)
        result[:3, :3] = rotation @ np.diag(scale)
        result[:3, 3] = translation
        return result

    def direct_cluster_large_glb() -> dict[str, Any]:
        """Reduce the repository's known contiguous-buffer CAD GLB without a huge VTK append.

        The source derivatives contain one mesh split into tens of thousands of CAD-face
        primitives.  Importing those actors and cleaning a 6--12 million triangle append is
        the dominant >12 minute path.  Decode the reviewed glTF transforms and contiguous
        buffers directly, perform global vertex clustering, then hand the much smaller,
        coherent mesh to the existing VTK quadric/final-QA stages.
        """
        started = time.perf_counter()
        print(json.dumps({"workerStage": "direct-glb-decode-start", "id": args.part_id}), flush=True)
        document, chunks = read_glb(source)
        binary = next((data for kind, data in chunks if kind == BIN_CHUNK), None)
        if binary is None:
            raise RuntimeError(f"Large source GLB has no BIN chunk: {source}")
        nodes = document.get("nodes", [])
        mesh_nodes = [(index, node) for index, node in enumerate(nodes) if "mesh" in node]
        if len(mesh_nodes) != 1:
            raise RuntimeError(f"Direct large-GLB reducer requires exactly one mesh node; got {len(mesh_nodes)}")
        mesh_node_id, mesh_node = mesh_nodes[0]
        mesh_id = int(mesh_node["mesh"])
        meshes = document.get("meshes", [])
        if mesh_id < 0 or mesh_id >= len(meshes):
            raise RuntimeError("Large source GLB mesh node references an invalid mesh")
        parents: dict[int, int] = {}
        for parent_id, node in enumerate(nodes):
            for child in node.get("children", []):
                child_id = int(child)
                if child_id in parents:
                    raise RuntimeError("Large source GLB node has multiple parents")
                parents[child_id] = parent_id
        matrix_cache: dict[int, Any] = {}

        def world_matrix(node_id: int) -> Any:
            if node_id not in matrix_cache:
                local = gltf_local_matrix(nodes[node_id])
                matrix_cache[node_id] = (
                    world_matrix(parents[node_id]) @ local if node_id in parents else local
                )
            return matrix_cache[node_id]

        world = world_matrix(mesh_node_id)
        accessors = document.get("accessors", [])
        views = document.get("bufferViews", [])
        all_primitives = meshes[mesh_id].get("primitives", [])
        primitives = [
            primitive for primitive in all_primitives
            if int(primitive.get("mode", 4)) == 4 and "indices" in primitive
        ]
        unsupported = [
            primitive for primitive in all_primitives
            if int(primitive.get("mode", 4)) not in (1, 4) or "indices" not in primitive
        ]
        if unsupported:
            raise RuntimeError("Direct large-GLB reducer encountered an unsupported primitive contract")
        if not primitives:
            raise RuntimeError("Large source GLB mesh has no primitives")
        position_accessors = [accessors[int(primitive["attributes"]["POSITION"])] for primitive in primitives]
        position_view_ids = {int(accessor["bufferView"]) for accessor in position_accessors}
        if len(position_view_ids) != 1:
            raise RuntimeError("Direct large-GLB reducer requires one contiguous POSITION bufferView")
        position_view_id = next(iter(position_view_ids))
        position_view = views[position_view_id]
        if int(position_view.get("byteStride", 12)) != 12 or int(position_view.get("byteLength", 0)) % 12:
            raise RuntimeError("Direct large-GLB reducer requires tightly packed float32 VEC3 positions")
        for accessor in position_accessors:
            if int(accessor.get("componentType", 0)) != 5126 or accessor.get("type") != "VEC3":
                raise RuntimeError("Direct large-GLB reducer requires float32 VEC3 POSITION accessors")
        raw_positions = np.frombuffer(
            binary,
            dtype="<f4",
            count=int(position_view["byteLength"]) // 4,
            offset=int(position_view.get("byteOffset", 0)),
        ).reshape((-1, 3))
        source_positions_view = np.empty(raw_positions.shape, dtype=np.float32)
        transform_batch = 500_000
        for start in range(0, len(raw_positions), transform_batch):
            stop = min(start + transform_batch, len(raw_positions))
            source_positions_view[start:stop] = (
                raw_positions[start:stop].astype(np.float64) @ world[:3, :3].T + world[:3, 3]
            ).astype(np.float32)
        triangle_total = 0
        for primitive in primitives:
            index_accessor = accessors[int(primitive["indices"])]
            if int(index_accessor.get("count", 0)) % 3:
                raise RuntimeError("Large source GLB index accessor is not a triangle list")
            triangle_total += int(index_accessor["count"]) // 3
        source_cells_view = np.empty((triangle_total, 3), dtype=np.int32)
        cursor = 0
        index_dtypes = {5121: "<u1", 5123: "<u2", 5125: "<u4"}
        for primitive, position_accessor in zip(primitives, position_accessors, strict=True):
            index_accessor = accessors[int(primitive["indices"])]
            component_type = int(index_accessor.get("componentType", 0))
            if component_type not in index_dtypes or index_accessor.get("type") != "SCALAR":
                raise RuntimeError("Unsupported large source GLB index accessor")
            index_view = views[int(index_accessor["bufferView"])]
            dtype = np.dtype(index_dtypes[component_type])
            if index_view.get("byteStride") not in (None, dtype.itemsize):
                raise RuntimeError("Interleaved large source GLB indices are unsupported")
            count = int(index_accessor["count"])
            values = np.frombuffer(
                binary,
                dtype=dtype,
                count=count,
                offset=int(index_view.get("byteOffset", 0)) + int(index_accessor.get("byteOffset", 0)),
            )
            position_count = int(position_accessor["count"])
            if len(values) and int(values.max()) >= position_count:
                raise RuntimeError("Large source GLB index is outside its POSITION accessor")
            base = int(position_accessor.get("byteOffset", 0)) // 12
            triangles = count // 3
            source_cells_view[cursor : cursor + triangles] = values.reshape((-1, 3)).astype(np.int32) + base
            cursor += triangles
        if cursor != triangle_total:
            raise RuntimeError("Large source GLB triangle decode count mismatch")
        print(json.dumps({
            "workerStage": "direct-glb-decode-complete",
            "id": args.part_id,
            "vertices": int(len(source_positions_view)),
            "triangles": int(triangle_total),
            "seconds": round(time.perf_counter() - started, 3),
        }), flush=True)

        referenced_points = np.zeros(len(source_positions_view), dtype=np.bool_)
        referenced_points[source_cells_view.reshape(-1)] = True
        referenced_positions = source_positions_view[np.flatnonzero(referenced_points)]
        raw_diagonal = float(np.linalg.norm(
            referenced_positions.max(axis=0).astype(np.float64)
            - referenced_positions.min(axis=0).astype(np.float64)
        ))
        source_area_threshold = max(raw_diagonal * raw_diagonal * 1e-12, 1e-18)
        valid_source_cells = np.zeros(len(source_cells_view), dtype=np.bool_)
        area_batch = 250_000
        for start in range(0, len(source_cells_view), area_batch):
            stop = min(start + area_batch, len(source_cells_view))
            batch = source_positions_view[source_cells_view[start:stop]]
            batch_area = np.linalg.norm(
                np.cross(batch[:, 1] - batch[:, 0], batch[:, 2] - batch[:, 0]),
                axis=1,
            )
            valid_source_cells[start:stop] = batch_area > source_area_threshold
        used_points = np.zeros(len(source_positions_view), dtype=np.bool_)
        for start in range(0, len(source_cells_view), area_batch):
            stop = min(start + area_batch, len(source_cells_view))
            valid_batch = valid_source_cells[start:stop]
            if np.any(valid_batch):
                used_points[source_cells_view[start:stop][valid_batch].reshape(-1)] = True
        surface_point_ids = np.flatnonzero(used_points)
        if len(surface_point_ids) == 0:
            raise RuntimeError(f"Source part {args.part_id} contains no non-degenerate visible triangles")
        surface_positions = source_positions_view[surface_point_ids]
        source_low = surface_positions.min(axis=0).astype(np.float64)
        source_high = surface_positions.max(axis=0).astype(np.float64)
        anchor_indices, source_extreme_point_count, anchor_selection = select_quantization_safe_bounds_anchors(
            source_positions_view,
            source_cells_view,
            valid_source_cells,
            surface_point_ids,
            source_low,
            source_high,
        )
        anchor_triangles = source_positions_view[source_cells_view[anchor_indices]].astype(np.float32, copy=True)

        valid_triangle_count = int(np.count_nonzero(valid_source_cells))
        if valid_triangle_count <= 2_500_000 and args.target >= int(0.10 * valid_triangle_count):
            visible_cells = source_cells_view[valid_source_cells]
            compact_ids, compact_inverse = np.unique(visible_cells.reshape(-1), return_inverse=True)
            compact_positions = source_positions_view[compact_ids].astype(np.float32, copy=True)
            compact_cells = compact_inverse.reshape((-1, 3)).astype(np.int64, copy=False)
            vtk_points = vtk.vtkPoints()
            vtk_points.SetData(ns.numpy_to_vtk(compact_positions, deep=True))
            vtk_cells = vtk.vtkCellArray()
            offsets = np.arange(0, 3 * (len(compact_cells) + 1), 3, dtype=np.int64)
            vtk_cells.SetData(
                ns.numpy_to_vtkIdTypeArray(offsets, deep=True),
                ns.numpy_to_vtkIdTypeArray(compact_cells.reshape(-1), deep=True),
            )
            exact = vtk.vtkPolyData()
            exact.SetPoints(vtk_points)
            exact.SetPolys(vtk_cells)
            elapsed = time.perf_counter() - started
            print(json.dumps({
                "workerStage": "direct-exact-polydata-complete",
                "id": args.part_id,
                "vertices": int(len(compact_positions)),
                "triangles": int(len(compact_cells)),
                "seconds": round(elapsed, 3),
            }), flush=True)
            return {
                "current": exact,
                "actorCount": 1,
                "sourceTriangles": int(triangle_total),
                "cleanedTriangles": valid_triangle_count,
                "sourceLow": source_low,
                "sourceHigh": source_high,
                "anchorTriangles": anchor_triangles,
                "sourceDegenerateTriangleCount": int(len(valid_source_cells) - valid_triangle_count),
                "unusedSourcePointCount": int(len(source_positions_view) - len(surface_point_ids)),
                "sourceExtremePointCount": source_extreme_point_count,
                "anchorSelection": anchor_selection,
                "worldMatrix": world.reshape(-1).tolist(),
                "clustering": {
                    "applied": False,
                    "algorithm": "direct-glb-buffer exact visible polydata -> VTK quadric decimation",
                    "thresholdBytes": DIRECT_GLB_THRESHOLD_BYTES,
                    "sourceVisibleTriangles": valid_triangle_count,
                    "outputTriangles": int(len(compact_cells)),
                    "elapsedSeconds": round(elapsed, 3),
                },
            }

        # Thin, shell-like CAD parts occupy only a small fraction of their AABB.
        # A 5x surface-area estimate can therefore collapse below the requested
        # high-detail target before quadric decimation (notably the cryostat
        # cylinders).  Keep a larger direct-buffer intermediate and let the
        # existing decimator reach the exact per-part budget.  The source count
        # cap prevents asking the grid for detail that does not exist.
        intermediate_goal = min(
            valid_triangle_count,
            max(args.target * DIRECT_GRID_INTERMEDIATE_MULTIPLIER, args.target + 1),
        )
        extent = np.maximum(source_high - source_low, 1e-6)
        surface_coefficient = 2.0 * (
            extent[0] * extent[1] + extent[0] * extent[2] + extent[1] * extent[2]
        )
        scale = math.sqrt(intermediate_goal / max(surface_coefficient, 1e-12))
        divisions = np.clip(
            np.ceil(extent * scale).astype(np.int64),
            2,
            DIRECT_GRID_MAX_DIVISIONS,
        )
        normalized = (surface_positions.astype(np.float64) - source_low) / extent
        visible_cells = source_cells_view[valid_source_cells]

        def cluster_at(candidate_divisions: Any) -> tuple[Any, Any, int]:
            """Cluster once; locals are released between adaptive refinement passes."""
            grid = np.minimum(
                np.floor(normalized * candidate_divisions).astype(np.int64),
                candidate_divisions - 1,
            )
            linear_keys = (
                grid[:, 0]
                + candidate_divisions[0]
                * (grid[:, 1] + candidate_divisions[1] * grid[:, 2])
            )
            _, inverse = np.unique(linear_keys, return_inverse=True)
            cluster_count = int(inverse.max()) + 1
            counts = np.bincount(inverse, minlength=cluster_count).astype(np.float64)
            representatives = np.column_stack([
                np.bincount(
                    inverse,
                    weights=surface_positions[:, axis],
                    minlength=cluster_count,
                )
                / counts
                for axis in range(3)
            ]).astype(np.float32)
            source_to_cluster = np.full(len(source_positions_view), -1, dtype=np.int32)
            source_to_cluster[surface_point_ids] = inverse.astype(np.int32)
            mapped = source_to_cluster[visible_cells]
            noncollapsed = (
                (mapped[:, 0] != mapped[:, 1])
                & (mapped[:, 0] != mapped[:, 2])
                & (mapped[:, 1] != mapped[:, 2])
            )
            mapped = mapped[noncollapsed]
            mapped_points = representatives[mapped]
            mapped_area = np.linalg.norm(
                np.cross(
                    mapped_points[:, 1] - mapped_points[:, 0],
                    mapped_points[:, 2] - mapped_points[:, 0],
                ),
                axis=1,
            )
            mapped = mapped[mapped_area > source_area_threshold]
            canonical = np.sort(mapped.astype(np.uint64), axis=1)
            bits = max(1, int(math.ceil(math.log2(max(2, cluster_count)))))
            if bits * 3 <= 63:
                packed = (
                    canonical[:, 0]
                    | (canonical[:, 1] << bits)
                    | (canonical[:, 2] << (2 * bits))
                )
                _, unique_index = np.unique(packed, return_index=True)
            else:
                _, unique_index = np.unique(canonical, axis=0, return_index=True)
            unique_index.sort()
            clustered_cells = mapped[unique_index].astype(np.int64, copy=False)
            return representatives, clustered_cells, cluster_count

        desired_clustered_triangles = min(
            valid_triangle_count,
            max(args.target + 1, int(math.ceil(args.target * 1.10))),
        )
        cluster_attempts: list[dict[str, Any]] = []
        for attempt in range(4):
            representatives, clustered_cells, cluster_count = cluster_at(divisions)
            cluster_attempts.append({
                "attempt": attempt + 1,
                "numberOfDivisions": [int(value) for value in divisions],
                "clusterVertices": cluster_count,
                "outputTriangles": int(len(clustered_cells)),
            })
            if len(clustered_cells) >= desired_clustered_triangles:
                break
            refinement = max(
                1.12,
                math.sqrt(desired_clustered_triangles / max(1, len(clustered_cells))) * 1.08,
            )
            refined_divisions = np.clip(
                np.ceil(divisions.astype(np.float64) * refinement).astype(np.int64),
                2,
                DIRECT_GRID_MAX_DIVISIONS,
            )
            if np.array_equal(refined_divisions, divisions):
                break
            divisions = refined_divisions
        vtk_points = vtk.vtkPoints()
        vtk_points.SetData(ns.numpy_to_vtk(representatives, deep=True))
        vtk_cells = vtk.vtkCellArray()
        offsets = np.arange(0, 3 * (len(clustered_cells) + 1), 3, dtype=np.int64)
        vtk_cells.SetData(
            ns.numpy_to_vtkIdTypeArray(offsets, deep=True),
            ns.numpy_to_vtkIdTypeArray(clustered_cells.reshape(-1), deep=True),
        )
        clustered = vtk.vtkPolyData()
        clustered.SetPoints(vtk_points)
        clustered.SetPolys(vtk_cells)
        elapsed = time.perf_counter() - started
        print(json.dumps({
            "workerStage": "direct-grid-cluster-complete",
            "id": args.part_id,
            "clusters": cluster_count,
            "triangles": int(clustered.GetNumberOfPolys()),
            "divisions": [int(value) for value in divisions],
            "seconds": round(elapsed, 3),
        }), flush=True)
        return {
            "current": clustered,
            "actorCount": 1,
            "sourceTriangles": int(triangle_total),
            "cleanedTriangles": int(np.count_nonzero(valid_source_cells)),
            "sourceLow": source_low,
            "sourceHigh": source_high,
            "anchorTriangles": anchor_triangles,
            "sourceDegenerateTriangleCount": int(len(valid_source_cells) - np.count_nonzero(valid_source_cells)),
            "unusedSourcePointCount": int(len(source_positions_view) - len(surface_point_ids)),
            "sourceExtremePointCount": source_extreme_point_count,
            "anchorSelection": anchor_selection,
            "worldMatrix": world.reshape(-1).tolist(),
            "clustering": {
                "applied": True,
                "algorithm": "direct-glb-buffer vertex-grid clustering -> VTK quadric decimation",
                "thresholdBytes": DIRECT_GLB_THRESHOLD_BYTES,
                "intermediateMultiplier": DIRECT_GRID_INTERMEDIATE_MULTIPLIER,
                "targetTriangles": intermediate_goal,
                "numberOfDivisions": [int(value) for value in divisions],
                "clusterVertices": cluster_count,
                "outputTriangles": int(clustered.GetNumberOfPolys()),
                "adaptiveTargetTriangles": desired_clustered_triangles,
                "adaptiveAttempts": cluster_attempts,
                "elapsedSeconds": round(elapsed, 3),
            },
        }

    use_direct_cluster = args.input_format == "glb" and source.stat().st_size >= DIRECT_GLB_THRESHOLD_BYTES
    append = vtk.vtkAppendPolyData()
    actor_count = 0
    source_triangles = 0

    def append_input(incoming: Any, matrix: Any) -> None:
        nonlocal actor_count, source_triangles
        if incoming is None or incoming.GetNumberOfPolys() <= 0:
            return
        source_triangles += incoming.GetNumberOfPolys()
        transform = vtk.vtkTransform()
        transform.SetMatrix(matrix)
        transformed = vtk.vtkTransformPolyDataFilter()
        transformed.SetTransform(transform)
        transformed.SetInputData(incoming)
        transformed.Update()
        clean_attributes = vtk.vtkPolyData()
        clean_attributes.DeepCopy(transformed.GetOutput())
        clean_attributes.GetPointData().Initialize()
        clean_attributes.GetCellData().Initialize()
        append.AddInputData(clean_attributes)
        actor_count += 1

    if use_direct_cluster:
        direct = direct_cluster_large_glb()
        current = direct["current"]
        actor_count = int(direct["actorCount"])
        source_triangles = int(direct["sourceTriangles"])
        cleaned_triangles = int(direct["cleanedTriangles"])
        source_low = direct["sourceLow"]
        source_high = direct["sourceHigh"]
        anchor_triangles = direct["anchorTriangles"]
        source_degenerate_count = int(direct["sourceDegenerateTriangleCount"])
        unused_source_point_count = int(direct["unusedSourcePointCount"])
        source_extreme_point_count = int(direct["sourceExtremePointCount"])
        anchor_selection = direct["anchorSelection"]
        transform_matrix_fingerprint = direct["worldMatrix"]
        cluster_record = direct["clustering"]
    elif args.input_format == "stl":
        reader = vtk.vtkSTLReader()
        reader.SetFileName(str(source))
        reader.MergingOn()
        reader.Update()
        matrix = vtk.vtkMatrix4x4()
        matrix.Identity()
        if args.coordinate_map == "cad-z-up-to-web-y-up":
            matrix.DeepCopy((
                1.0, 0.0, 0.0, 0.0,
                0.0, 0.0, 1.0, 0.0,
                0.0, -1.0, 0.0, 0.0,
                0.0, 0.0, 0.0, 1.0,
            ))
        elif args.coordinate_map != "identity":
            raise ValueError(f"Unsupported STL coordinate map: {args.coordinate_map}")
        append_input(reader.GetOutput(), matrix)
        transform_matrix_fingerprint = [float(matrix.GetElement(row, column)) for row in range(4) for column in range(4)]
    else:
        if args.coordinate_map != "identity":
            raise ValueError("GLB sources already contain reviewed device transforms; coordinate map must be identity")
        window = vtk.vtkRenderWindow()
        window.SetOffScreenRendering(1)
        importer = vtk.vtkGLTFImporter()
        importer.SetFileName(str(source))
        importer.SetRenderWindow(window)
        importer.Update()
        collection = importer.GetRenderer().GetActors()
        collection.InitTraversal()
        while actor := collection.GetNextActor():
            mapper = actor.GetMapper()
            mapper.Update()
            append_input(mapper.GetInput(), actor.GetMatrix())
        transform_matrix_fingerprint = "source-scene-world-matrices-via-vtk-importer"
    if not use_direct_cluster:
        if actor_count == 0:
            raise RuntimeError(f"VTK imported no polygon actors from {source}")
        append.Update()
        triangle = vtk.vtkTriangleFilter()
        triangle.SetInputData(append.GetOutput())
        triangle.PassVertsOff()
        triangle.PassLinesOff()
        triangle.Update()
        clean = vtk.vtkCleanPolyData()
        clean.SetInputData(triangle.GetOutput())
        clean.PointMergingOn()
        clean.ToleranceIsAbsoluteOn()
        clean.SetAbsoluteTolerance(1e-7)
        clean.Update()
        current = clean.GetOutput()
        cleaned_triangles = current.GetNumberOfPolys()

        source_positions_view = ns.vtk_to_numpy(current.GetPoints().GetData())
        source_cells_view = ns.vtk_to_numpy(current.GetPolys().GetConnectivityArray()).reshape((-1, 3))
        referenced_points = np.zeros(len(source_positions_view), dtype=np.bool_)
        referenced_points[source_cells_view.reshape(-1)] = True
        referenced_positions = source_positions_view[np.flatnonzero(referenced_points)]
        raw_diagonal = float(np.linalg.norm(
            referenced_positions.max(axis=0).astype(np.float64)
            - referenced_positions.min(axis=0).astype(np.float64)
        ))
        source_area_threshold = max(raw_diagonal * raw_diagonal * 1e-12, 1e-18)
        valid_source_cells = np.zeros(len(source_cells_view), dtype=np.bool_)
        batch_size = 250_000
        for start in range(0, len(source_cells_view), batch_size):
            stop = min(start + batch_size, len(source_cells_view))
            batch = source_positions_view[source_cells_view[start:stop]]
            batch_area = np.linalg.norm(
                np.cross(batch[:, 1] - batch[:, 0], batch[:, 2] - batch[:, 0]),
                axis=1,
            )
            valid_source_cells[start:stop] = batch_area > source_area_threshold
        used_points = np.zeros(len(source_positions_view), dtype=np.bool_)
        for start in range(0, len(source_cells_view), batch_size):
            stop = min(start + batch_size, len(source_cells_view))
            valid_batch = valid_source_cells[start:stop]
            if np.any(valid_batch):
                used_points[source_cells_view[start:stop][valid_batch].reshape(-1)] = True
        surface_point_ids = np.flatnonzero(used_points)
        if len(surface_point_ids) == 0:
            raise RuntimeError(f"Source part {args.part_id} contains no non-degenerate visible triangles")
        surface_positions = source_positions_view[surface_point_ids]
        source_low = surface_positions.min(axis=0).astype(np.float64)
        source_high = surface_positions.max(axis=0).astype(np.float64)
        anchor_cell_indices, source_extreme_point_count, anchor_selection = select_quantization_safe_bounds_anchors(
            source_positions_view,
            source_cells_view,
            valid_source_cells,
            surface_point_ids,
            source_low,
            source_high,
        )
        anchor_triangles = source_positions_view[source_cells_view[anchor_cell_indices]].astype(np.float32, copy=True)
        source_degenerate_count = int(len(valid_source_cells) - np.count_nonzero(valid_source_cells))
        unused_source_point_count = int(len(source_positions_view) - len(surface_point_ids))

        cluster_record = {
            "applied": False,
            "thresholdTriangles": 1_000_000,
            "intermediateMultiplier": 5,
        }
    if not use_direct_cluster and cleaned_triangles > 1_000_000:
        intermediate_goal = min(cleaned_triangles, max(args.target * 5, args.target + 1))
        extent = np.maximum(source_high - source_low, 1e-6)
        surface_coefficient = 2.0 * (
            extent[0] * extent[1]
            + extent[0] * extent[2]
            + extent[1] * extent[2]
        )
        scale = math.sqrt(intermediate_goal / max(surface_coefficient, 1e-12))
        divisions = np.clip(np.ceil(extent * scale).astype(np.int64), 2, 1024)
        cluster = vtk.vtkQuadricClustering()
        cluster.SetInputData(current)
        cluster.SetNumberOfDivisions(*(int(value) for value in divisions))
        cluster.AutoAdjustNumberOfDivisionsOff()
        cluster.UseInputPointsOn()
        cluster.CopyCellDataOff()
        cluster.Update()
        current = cluster.GetOutput()
        cluster_record = {
            "applied": True,
            "thresholdTriangles": 1_000_000,
            "intermediateMultiplier": 5,
            "targetTriangles": intermediate_goal,
            "numberOfDivisions": [int(value) for value in divisions],
            "useInputPoints": True,
            "copyCellData": False,
            "outputTriangles": int(current.GetNumberOfPolys()),
        }
    if cleaned_triangles > args.target:
        decimate = vtk.vtkQuadricDecimation()
        decimate.SetInputData(current)
        decimation_input_triangles = max(1, current.GetNumberOfPolys())
        decimation_target = max(4, args.target - len(anchor_triangles))
        decimate.SetTargetReduction(min(0.9995, max(0.0, 1 - decimation_target / decimation_input_triangles)))
        decimate.VolumePreservationOn()
        decimate.WeighBoundaryConstraintsByLengthOn()
        decimate.SetBoundaryWeightFactor(100.0)
        decimate.Update()
        current = decimate.GetOutput()
    triangle2 = vtk.vtkTriangleFilter()
    triangle2.SetInputData(current)
    triangle2.PassVertsOff()
    triangle2.PassLinesOff()
    triangle2.Update()
    current = triangle2.GetOutput()

    anchor_points = vtk.vtkPoints()
    anchor_points.SetData(ns.numpy_to_vtk(anchor_triangles.reshape((-1, 3)), deep=True))
    anchor_polys = vtk.vtkCellArray()
    anchor_offsets = np.arange(0, 3 * (len(anchor_triangles) + 1), 3, dtype=np.int64)
    anchor_connectivity = np.arange(0, 3 * len(anchor_triangles), dtype=np.int64)
    anchor_polys.SetData(
        ns.numpy_to_vtkIdTypeArray(anchor_offsets, deep=True),
        ns.numpy_to_vtkIdTypeArray(anchor_connectivity, deep=True),
    )
    anchor_polydata = vtk.vtkPolyData()
    anchor_polydata.SetPoints(anchor_points)
    anchor_polydata.SetPolys(anchor_polys)
    restore_bounds = vtk.vtkAppendPolyData()
    restore_bounds.AddInputData(current)
    restore_bounds.AddInputData(anchor_polydata)
    restore_bounds.Update()
    current = restore_bounds.GetOutput()

    positions = ns.vtk_to_numpy(current.GetPoints().GetData()).astype(np.float64, copy=False)
    cells = ns.vtk_to_numpy(current.GetPolys().GetConnectivityArray()).reshape((-1, 3)).astype(np.int64, copy=False)
    points = positions[cells]
    diagonal = float(np.linalg.norm(positions.max(axis=0) - positions.min(axis=0)))
    area = np.linalg.norm(np.cross(points[:, 1] - points[:, 0], points[:, 2] - points[:, 0]), axis=1)
    valid = np.flatnonzero(area > max(diagonal * diagonal * 1e-12, 1e-18))
    _, unique_local = np.unique(np.sort(cells[valid], axis=1), axis=0, return_index=True)
    kept = np.sort(valid[unique_local])
    vtk_points = vtk.vtkPoints()
    vtk_points.SetData(ns.numpy_to_vtk(positions.astype(np.float32, copy=False), deep=True))
    vtk_cells = vtk.vtkCellArray()
    offsets = np.arange(0, 3 * (len(kept) + 1), 3, dtype=np.int64)
    vtk_cells.SetData(
        ns.numpy_to_vtkIdTypeArray(offsets, deep=True),
        ns.numpy_to_vtkIdTypeArray(cells[kept].ravel(), deep=True),
    )
    rebuilt = vtk.vtkPolyData()
    rebuilt.SetPoints(vtk_points)
    rebuilt.SetPolys(vtk_cells)
    clean2 = vtk.vtkCleanPolyData()
    clean2.SetInputData(rebuilt)
    clean2.PointMergingOn()
    clean2.Update()
    duplicate_polys = vtk.vtkRemoveDuplicatePolys()
    duplicate_polys.SetInputData(clean2.GetOutput())
    duplicate_polys.Update()
    post_merge_duplicate_count = int(
        clean2.GetOutput().GetNumberOfPolys() - duplicate_polys.GetOutput().GetNumberOfPolys()
    )
    final_triangle_filter = vtk.vtkTriangleFilter()
    final_triangle_filter.SetInputData(duplicate_polys.GetOutput())
    final_triangle_filter.PassVertsOff()
    final_triangle_filter.PassLinesOff()
    final_triangle_filter.Update()
    normals_filter = vtk.vtkPolyDataNormals()
    normals_filter.SetInputData(final_triangle_filter.GetOutput())
    normals_filter.SetFeatureAngle(args.feature_angle)
    normals_filter.SplittingOn()
    normals_filter.ConsistencyOn()
    normals_filter.AutoOrientNormalsOn()
    normals_filter.Update()
    result = normals_filter.GetOutput()
    positions_out = ns.vtk_to_numpy(result.GetPoints().GetData()).astype("<f4", copy=False)
    normals_out = ns.vtk_to_numpy(result.GetPointData().GetNormals()).astype("<f4", copy=False)
    indices_out = ns.vtk_to_numpy(result.GetPolys().GetConnectivityArray()).astype("<u4", copy=False)
    if not np.isfinite(positions_out).all() or not np.isfinite(normals_out).all():
        raise RuntimeError(f"Non-finite positions or normals in reduced part {args.part_id}")
    if len(indices_out) == 0 or int(indices_out.max()) >= len(positions_out):
        raise RuntimeError(f"Invalid or out-of-range indices in reduced part {args.part_id}")
    output_cells = indices_out.reshape((-1, 3)).astype(np.int64, copy=False)
    quantization_keep = np.ones(len(output_cells), dtype=np.bool_)
    quantization_risk: list[dict[str, Any]] = []
    quantization_low = positions_out.min(axis=0).astype(np.float64)
    quantization_high = positions_out.max(axis=0).astype(np.float64)
    quantization_extent = np.maximum(quantization_high - quantization_low, 1e-12)
    quantization_diagonal = float(np.linalg.norm(quantization_extent))
    quantized_area_threshold = max(quantization_diagonal * quantization_diagonal * 1e-12, 1e-18)
    quantization_center = (quantization_low + quantization_high) / 2
    quantization_scale = float(np.max(quantization_extent) / 2)
    signed_levels = 32767
    normalized_positions = np.clip(
        (positions_out.astype(np.float64) - quantization_center) / quantization_scale,
        -1.0,
        1.0,
    )
    quantized_positions = (
        np.rint(np.abs(normalized_positions) * signed_levels) * np.sign(normalized_positions)
    ).astype(np.int64)
    dequantized_positions = (
        quantized_positions.astype(np.float64) / signed_levels * quantization_scale + quantization_center
    )
    quantized_triangles = dequantized_positions[output_cells]
    quantized_area = np.linalg.norm(
        np.cross(
            quantized_triangles[:, 1] - quantized_triangles[:, 0],
            quantized_triangles[:, 2] - quantized_triangles[:, 0],
        ),
        axis=1,
    )
    quantized_degenerate_risk = quantized_area <= quantized_area_threshold
    # glTF-Transform's exact mesh-volume transform can place the integer grid
    # half a cell away from this preflight model.  Conservatively capsule any
    # triangle whose altitude or shortest edge is within two Int16 cells so a
    # different, but valid, grid alignment cannot collapse it in Three.js.
    source_triangles_for_risk = positions_out[output_cells].astype(np.float64)
    edge_ab = source_triangles_for_risk[:, 1] - source_triangles_for_risk[:, 0]
    edge_ac = source_triangles_for_risk[:, 2] - source_triangles_for_risk[:, 0]
    edge_bc = source_triangles_for_risk[:, 2] - source_triangles_for_risk[:, 1]
    edge_lengths = np.column_stack((
        np.linalg.norm(edge_ab, axis=1),
        np.linalg.norm(edge_ac, axis=1),
        np.linalg.norm(edge_bc, axis=1),
    ))
    longest_edge = np.maximum(edge_lengths.max(axis=1), 1e-18)
    triangle_altitude = np.linalg.norm(np.cross(edge_ab, edge_ac), axis=1) / longest_edge
    quantization_step = quantization_scale / signed_levels
    resolution_risk = (
        (triangle_altitude <= 2.0 * quantization_step)
        | (edge_lengths.min(axis=1) <= 2.0 * quantization_step)
    )
    # The reviewed raw GLB is fed directly to Meshopt, without an intervening
    # topology optimizer. Exact integer-grid simulation and the two-cell
    # altitude/edge margin describe that input. TF-B is the single reviewed
    # exception: its repeated thin winding pattern produced three coordinate
    # duplicates after the exact transform, so it keeps a narrow four-cell
    # neighbour guard. Applying that heuristic to PF2 over-isolated the dense
    # coil into 352 draws, while its direct exact-grid result is clean.
    if args.part_id == "tf-b":
        from scipy.spatial import cKDTree  # worker-only guarded VTK dependency

        unique_positions, unique_position_inverse = np.unique(
            positions_out.astype(np.float64), axis=0, return_inverse=True
        )
        nearest_distances, _ = cKDTree(unique_positions).query(
            unique_positions,
            k=2,
            distance_upper_bound=4.0 * quantization_step,
            workers=-1,
        )
        near_distinct_vertex = np.isfinite(nearest_distances[:, 1])[unique_position_inverse]
        proximity_collision_risk = np.any(near_distinct_vertex[output_cells], axis=1)
        proximity_radius_cells = 4.0
        proximity_predicate = "tf-b-reviewed-any-triangle-vertex"
    else:
        proximity_radius_cells = 0.0
        proximity_collision_risk = np.zeros(len(output_cells), dtype=np.bool_)
        proximity_predicate = "disabled-direct-reviewed-input-exact-grid"
    degenerate_risk = quantized_degenerate_risk | resolution_risk | proximity_collision_risk
    _, coordinate_ids = np.unique(quantized_positions, axis=0, return_inverse=True)
    canonical = np.sort(coordinate_ids[output_cells], axis=1).astype(np.uint64)
    bits = max(1, int(math.ceil(math.log2(max(2, int(coordinate_ids.max()) + 1)))))
    if bits * 3 <= 63:
        keys = canonical[:, 0] | (canonical[:, 1] << bits) | (canonical[:, 2] << (2 * bits))
    else:
        keys = np.asarray([hash(tuple(int(value) for value in row)) for row in canonical], dtype=np.int64)
    active = np.flatnonzero(~degenerate_risk)
    _, first_local = np.unique(keys[active], return_index=True)
    retained_active = active[np.sort(first_local)]
    duplicate_risk = np.zeros(len(output_cells), dtype=np.bool_)
    duplicate_risk[active] = True
    duplicate_risk[retained_active] = False
    quantization_risk_mask = degenerate_risk | duplicate_risk
    quantization_keep &= ~quantization_risk_mask
    quantization_risk.append({
        "contract": "glTF-Transform signed-normalized Int16 mesh-volume quantization",
        "signedLevels": signed_levels,
        "uniformScaleMetres": quantization_scale,
        "degenerateTriangles": int(np.count_nonzero(quantized_degenerate_risk)),
        "resolutionRiskTriangles": int(np.count_nonzero(resolution_risk)),
        "proximityCollisionRiskTriangles": int(np.count_nonzero(proximity_collision_risk)),
        "proximityPredicate": proximity_predicate,
        "proximityRadiusCells": proximity_radius_cells,
        "quantizationCellMetres": quantization_step,
        "duplicateTriangles": int(np.count_nonzero(duplicate_risk)),
        "isolatedTriangles": int(np.count_nonzero(quantization_risk_mask)),
    })
    capsule_cells = output_cells[quantization_risk_mask]
    capsule_positions = positions_out[capsule_cells].astype("<f4", copy=True)
    capsule_normals = normals_out[capsule_cells].astype("<f4", copy=True)
    isolated_quantization_risk = int(len(capsule_cells))
    dropped_quantization_slivers = 0
    affine_capsule_mask = np.zeros(isolated_quantization_risk, dtype=np.bool_)
    if isolated_quantization_risk:
        capsule_keep = np.ones(isolated_quantization_risk, dtype=np.bool_)
        for capsule_id, triangle_positions in enumerate(capsule_positions):
            capsule_low = triangle_positions.min(axis=0).astype(np.float64)
            capsule_high = triangle_positions.max(axis=0).astype(np.float64)
            capsule_extent = np.maximum(capsule_high - capsule_low, 1e-12)
            capsule_center = (capsule_low + capsule_high) / 2
            capsule_scale = float(np.max(capsule_extent) / 2)
            capsule_normalized = np.clip(
                (triangle_positions.astype(np.float64) - capsule_center) / capsule_scale,
                -1.0,
                1.0,
            )
            capsule_quantized = (
                np.rint(np.abs(capsule_normalized) * 32767) * np.sign(capsule_normalized)
            ).astype(np.int64)
            capsule_dequantized = (
                capsule_quantized.astype(np.float64) / 32767 * capsule_scale + capsule_center
            )
            ab = capsule_dequantized[1] - capsule_dequantized[0]
            ac = capsule_dequantized[2] - capsule_dequantized[0]
            if np.linalg.norm(np.cross(ab, ac)) <= max(float(np.dot(capsule_extent, capsule_extent)) * 1e-12, 1e-18):
                # Preserve the real source triangle exactly.  It will be encoded
                # as a well-conditioned canonical triangle plus an affine node
                # matrix, rather than deleting its index or quantizing the tiny
                # altitude in device coordinates.
                affine_capsule_mask[capsule_id] = True
        if dropped_quantization_slivers:
            capsule_cells = capsule_cells[capsule_keep]
            capsule_positions = capsule_positions[capsule_keep]
            capsule_normals = capsule_normals[capsule_keep]
            isolated_quantization_risk = int(len(capsule_cells))
            quantization_risk[-1]["droppedLocalSliverTriangles"] = dropped_quantization_slivers
    capsule_mesh_groups: list[Any] = []
    if isolated_quantization_risk:
        capsule_centroids = capsule_positions.mean(axis=1).astype(np.float64)

        def capsule_group_is_safe(ids: Any) -> bool:
            group_positions = capsule_positions[ids].reshape((-1, 3)).astype(np.float64)
            group_low = group_positions.min(axis=0)
            group_high = group_positions.max(axis=0)
            group_extent = np.maximum(group_high - group_low, 1e-12)
            group_center = (group_low + group_high) / 2
            group_scale = float(np.max(group_extent) / 2)
            group_normalized = np.clip(
                (group_positions - group_center) / group_scale,
                -1.0,
                1.0,
            )
            group_quantized = (
                np.rint(np.abs(group_normalized) * signed_levels)
                * np.sign(group_normalized)
            ).astype(np.int64)
            group_triangles = group_quantized.reshape((-1, 3, 3)).astype(np.float64)
            group_cross = np.cross(
                group_triangles[:, 1] - group_triangles[:, 0],
                group_triangles[:, 2] - group_triangles[:, 0],
            )
            # The scale-invariant production gate is evaluated in normalized
            # Int16 accessor space by Three.js.
            normalized_diagonal_squared = float(np.dot(np.ptp(group_quantized, axis=0), np.ptp(group_quantized, axis=0)))
            threshold_squared = max(normalized_diagonal_squared * 1e-12, 1e-18) ** 2
            if np.any(np.einsum("ij,ij->i", group_cross, group_cross) <= threshold_squared):
                return False
            coordinate_ids = np.unique(group_quantized, axis=0, return_inverse=True)[1]
            canonical = np.sort(coordinate_ids.reshape((-1, 3)), axis=1)
            return len(canonical) == len(np.unique(canonical, axis=0))

        def partition_capsules(ids: Any) -> list[Any]:
            # Spatially local groups keep each Meshopt quantization volume tight
            # without creating one glTF mesh/node per at-risk triangle.  A group
            # is accepted only when its own integer-grid production QA is safe.
            # Try a large local quantization volume first; split only when its
            # exact Int16 grid would collapse or duplicate a triangle.  The
            # 4096-triangle cap bounds temporary QA memory while avoiding the
            # hundreds/thousands of draw calls caused by a fixed 64-face cap.
            if len(ids) <= 4096 and capsule_group_is_safe(ids):
                return [ids]
            if len(ids) == 1:
                raise RuntimeError(
                    f"Quantization capsule for {args.part_id} is not safe even as a local mesh"
                )
            span = np.ptp(capsule_centroids[ids], axis=0)
            axis = int(np.argmax(span))
            ordered = ids[np.argsort(capsule_centroids[ids, axis], kind="mergesort")]
            midpoint = len(ordered) // 2
            return partition_capsules(ordered[:midpoint]) + partition_capsules(ordered[midpoint:])

        regular_capsules = np.flatnonzero(~affine_capsule_mask).astype(np.int64)
        if len(regular_capsules):
            capsule_mesh_groups = partition_capsules(regular_capsules)
    if isolated_quantization_risk:
        filtered_cells = output_cells[quantization_keep]
        used_vertices, remapped = np.unique(filtered_cells.reshape(-1), return_inverse=True)
        positions_out = positions_out[used_vertices]
        normals_out = normals_out[used_vertices]
        indices_out = remapped.astype("<u4", copy=False)
    main_cells = indices_out.reshape((-1, 3)).astype(np.int64, copy=False)
    capsule_positions_flat = capsule_positions.reshape((-1, 3))
    all_positions_out = (
        np.concatenate((positions_out, capsule_positions_flat), axis=0)
        if isolated_quantization_risk
        else positions_out
    )
    capsule_output_cells = (
        np.arange(
            len(positions_out),
            len(positions_out) + 3 * isolated_quantization_risk,
            dtype=np.int64,
        ).reshape((-1, 3))
        if isolated_quantization_risk
        else np.empty((0, 3), dtype=np.int64)
    )
    all_cells_out = (
        np.concatenate((main_cells, capsule_output_cells), axis=0)
        if isolated_quantization_risk
        else main_cells
    )
    final_triangles = all_positions_out[all_cells_out]
    final_areas = np.linalg.norm(
        np.cross(final_triangles[:, 1] - final_triangles[:, 0], final_triangles[:, 2] - final_triangles[:, 0]),
        axis=1,
    )
    final_degenerate = int(np.count_nonzero(final_areas <= max(diagonal * diagonal * 1e-12, 1e-18)))
    if final_degenerate:
        raise RuntimeError(f"Reduced part {args.part_id} retained {final_degenerate} degenerate triangles")
    _, coordinate_ids = np.unique(all_positions_out, axis=0, return_inverse=True)
    canonical_cells = np.sort(coordinate_ids[all_cells_out], axis=1)
    final_duplicate = int(len(canonical_cells) - len(np.unique(canonical_cells, axis=0)))
    if final_duplicate:
        raise RuntimeError(f"Reduced part {args.part_id} retained {final_duplicate} duplicate triangles")
    low = all_positions_out.min(axis=0)
    high = all_positions_out.max(axis=0)
    bounds_delta_min = np.abs(low.astype(np.float64) - source_low)
    bounds_delta_max = np.abs(high.astype(np.float64) - source_high)
    bounds_delta = float(max(np.max(bounds_delta_min), np.max(bounds_delta_max)))
    source_diagonal = float(np.linalg.norm(source_high - source_low))
    bounds_tolerance = (
        args.bounds_tolerance
        if args.bounds_tolerance is not None
        else (0.02 if args.part_id == DIVERTOR_ID else max(0.075, 0.005 * source_diagonal))
    )
    if bounds_delta > bounds_tolerance:
        raise RuntimeError(f"Reduced part {args.part_id} changed source bounds by {bounds_delta} m")
    anchor_low = anchor_triangles.reshape((-1, 3)).min(axis=0)
    anchor_high = anchor_triangles.reshape((-1, 3)).max(axis=0)
    extreme_survival = {
        "min": [bool(np.any(np.isclose(all_positions_out[:, axis], source_low[axis], atol=1e-5))) for axis in range(3)],
        "max": [bool(np.any(np.isclose(all_positions_out[:, axis], source_high[axis], atol=1e-5))) for axis in range(3)],
    }

    binary = bytearray()
    views: list[dict[str, Any]] = []
    accessors_out: list[dict[str, Any]] = []

    def append_payload(data: bytes, target: int) -> int:
        offset = len(binary)
        binary.extend(data)
        binary.extend(b"\0" * ((-len(binary)) % 4))
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data), "target": target})
        return len(views) - 1

    def append_mesh_payload(
        mesh_positions: Any,
        mesh_normals: Any,
        mesh_indices: Any,
        mesh_name: str,
    ) -> dict[str, Any]:
        position_view = append_payload(mesh_positions.astype("<f4", copy=False).tobytes(), 34962)
        normal_view = append_payload(mesh_normals.astype("<f4", copy=False).tobytes(), 34962)
        index_view = append_payload(mesh_indices.astype("<u4", copy=False).tobytes(), 34963)
        position_accessor = len(accessors_out)
        accessors_out.append({
            "bufferView": position_view,
            "componentType": 5126,
            "count": len(mesh_positions),
            "type": "VEC3",
            "min": mesh_positions.min(axis=0).tolist(),
            "max": mesh_positions.max(axis=0).tolist(),
        })
        normal_accessor = len(accessors_out)
        accessors_out.append({
            "bufferView": normal_view,
            "componentType": 5126,
            "count": len(mesh_normals),
            "type": "VEC3",
        })
        index_accessor = len(accessors_out)
        accessors_out.append({
            "bufferView": index_view,
            "componentType": 5125,
            "count": len(mesh_indices),
            "type": "SCALAR",
        })
        return {
            "name": mesh_name,
            "primitives": [{
                "attributes": {"POSITION": position_accessor, "NORMAL": normal_accessor},
                "indices": index_accessor,
                "material": 0,
            }],
        }

    rgb = [int(args.color[index : index + 2], 16) / 255 for index in (1, 3, 5)]
    meshes_out = [append_mesh_payload(
        positions_out,
        normals_out,
        indices_out,
        f"ITER_MESH__{args.part_id}",
    )]
    mesh_nodes: list[dict[str, Any]] = [{"name": f"ITER_MESH__{args.part_id}", "mesh": 0}]
    for capsule_id, capsule_group in enumerate(capsule_mesh_groups):
        group_positions = capsule_positions[capsule_group].reshape((-1, 3))
        group_normals = capsule_normals[capsule_group].reshape((-1, 3))
        capsule_name = f"ITER_QCAP__{args.part_id}__{capsule_id:03d}"
        meshes_out.append(append_mesh_payload(
            group_positions,
            group_normals,
            np.arange(len(group_positions), dtype="<u4"),
            capsule_name,
        ))
        mesh_nodes.append({"name": capsule_name, "mesh": len(meshes_out) - 1})
    for affine_id, capsule_id in enumerate(np.flatnonzero(affine_capsule_mask)):
        source_triangle = capsule_positions[int(capsule_id)].astype(np.float64)
        # Use the longest source edge as the local X axis.  Cyclic vertex
        # permutations preserve winding, while keeping the third vertex's
        # projected X coordinate within the unit interval.
        cyclic_orders = ((0, 1, 2), (1, 2, 0), (2, 0, 1))
        order = max(
            cyclic_orders,
            key=lambda item: float(np.linalg.norm(source_triangle[item[1]] - source_triangle[item[0]])),
        )
        triangle = source_triangle[list(order)]
        origin = triangle[0]
        edge_x = triangle[1] - origin
        edge_x_length = float(np.linalg.norm(edge_x))
        if edge_x_length <= 0 or not np.isfinite(edge_x_length):
            raise RuntimeError(f"Affine quantization capsule for {args.part_id} is not a valid source triangle")
        unit_x = edge_x / edge_x_length
        edge_other = triangle[2] - origin
        projected_x = float(np.dot(edge_other, unit_x))
        orthogonal_y = edge_other - projected_x * unit_x
        edge_y_length = float(np.linalg.norm(orthogonal_y))
        if edge_y_length <= 0 or not np.isfinite(edge_y_length):
            raise RuntimeError(f"Affine quantization capsule for {args.part_id} is not a valid source triangle")
        unit_y = orthogonal_y / edge_y_length
        unit_z = np.cross(unit_x, unit_y)
        unit_z_length = float(np.linalg.norm(unit_z))
        if unit_z_length <= 0 or not np.isfinite(unit_z_length):
            raise RuntimeError(f"Affine quantization capsule for {args.part_id} has no finite normal")
        unit_z /= unit_z_length
        local_positions = np.asarray(
            ((0, 0, 0), (1, 0, 0), (projected_x / edge_x_length, 1, 0)),
            dtype="<f4",
        )
        local_normals = np.asarray(((0, 0, 1), (0, 0, 1), (0, 0, 1)), dtype="<f4")
        affine_name = f"ITER_QAFFINE__{args.part_id}__{affine_id:03d}"
        meshes_out.append(append_mesh_payload(
            local_positions,
            local_normals,
            np.arange(3, dtype="<u4"),
            affine_name,
        ))
        # The matrix columns are orthogonal, so glTF-Transform can decompose it
        # losslessly as translation + rotation + non-uniform scale.  A shear
        # matrix would be approximated during Meshopt and move the triangle.
        matrix = [
            float(unit_x[0] * edge_x_length), float(unit_x[1] * edge_x_length), float(unit_x[2] * edge_x_length), 0.0,
            float(unit_y[0] * edge_y_length), float(unit_y[1] * edge_y_length), float(unit_y[2] * edge_y_length), 0.0,
            float(unit_z[0]), float(unit_z[1]), float(unit_z[2]), 0.0,
            float(origin[0]), float(origin[1]), float(origin[2]), 1.0,
        ]
        mesh_nodes.append({"name": affine_name, "mesh": len(meshes_out) - 1, "matrix": matrix})
    stable_node_index = len(mesh_nodes)
    document = {
        "asset": {
            "version": "2.0",
            "generator": "FusionDigital ITER public visualization derivative builder 0.3.0",
            "extras": {"publicationStatus": "PUBLIC_VISUALIZATION_DERIVATIVE_REVIEWED"},
        },
        "scene": 0,
        "scenes": [{"nodes": [stable_node_index]}],
        "nodes": [
            *mesh_nodes,
            {"name": f"{STABLE_NODE_PREFIX}{args.part_id}", "children": list(range(len(mesh_nodes))), "extras": {"stablePartId": args.part_id, "geometryStatus": "registered-public-visualization-derivative"}},
        ],
        "meshes": meshes_out,
        "materials": [{"name": f"ITER_MATERIAL__{args.part_id}", "pbrMetallicRoughness": {"baseColorFactor": [*rgb, 1], "metallicFactor": 0.55, "roughnessFactor": 0.42}, "doubleSided": True}],
        "accessors": accessors_out,
        "bufferViews": views,
        "buffers": [{"byteLength": len(binary)}],
    }
    json_blob = json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    json_blob += b" " * ((-len(json_blob)) % 4)
    bin_blob = bytes(binary) + b"\0" * ((-len(binary)) % 4)
    total = 12 + 8 + len(json_blob) + 8 + len(bin_blob)
    temporary_output = output.with_suffix(".tmp.glb")
    with temporary_output.open("wb") as stream:
        stream.write(struct.pack("<4sII", b"glTF", 2, total))
        stream.write(struct.pack("<II", len(json_blob), JSON_CHUNK))
        stream.write(json_blob)
        stream.write(struct.pack("<II", len(bin_blob), BIN_CHUNK))
        stream.write(bin_blob)
    os.replace(temporary_output, output)
    source_sha256 = sha256(source)
    stats = {
        "id": args.part_id,
        "title": args.title,
        "geometryStatus": "registered-private-derivative",
        "inputFormat": args.input_format,
        "coordinateMap": args.coordinate_map,
        "source": {"bytes": source.stat().st_size, "sha256": source_sha256},
        "buildFingerprint": {
            "pipelineVersion": TOOL_VERSION,
            "scriptSha256": sha256(Path(__file__).resolve()),
            "sourceSha256": source_sha256,
            "targetTriangles": args.target,
            "featureAngleDegrees": args.feature_angle,
            "coordinateMap": args.coordinate_map,
            "reductionPath": (
                "direct-uncompressed-glb-buffer-grid"
                if use_direct_cluster
                else "vtk-import-clean-cluster"
            ),
            "clusterPolicy": CLUSTER_POLICY,
            "transform": {
                "contract": (
                    "source glTF scene world transform"
                    if args.input_format == "glb"
                    else args.coordinate_map
                ),
                "matrix": transform_matrix_fingerprint,
            },
        },
        "actors": actor_count,
        "targetTriangles": args.target,
        "sourceActorTriangles": source_triangles,
        "cleanedTriangles": cleaned_triangles,
        "clustering": cluster_record,
        "boundsAnchors": {
            "sourceDegenerateTriangleCount": source_degenerate_count,
            "unusedSourcePointCount": unused_source_point_count,
            "sourceExtremePointCount": source_extreme_point_count,
            "sourceNeighborhoodTriangleCount": int(len(anchor_triangles)),
            "sourceTrianglesOnly": True,
            "anchorBoundsMetres": {"min": anchor_low.tolist(), "max": anchor_high.tolist()},
            "sourceExtremeCoordinatesSurvived": extreme_survival,
            "selectionByBoundsSide": anchor_selection,
        },
        "triangles": len(all_cells_out),
        "vertices": len(all_positions_out),
        "boundsMetres": {"min": low.tolist(), "max": high.tolist()},
        "sourceBoundsMetres": {"min": source_low.tolist(), "max": source_high.tolist()},
        "quality": {
            "finitePositions": True,
            "finiteNormals": True,
            "indicesInRange": True,
            "degenerateTriangles": final_degenerate,
            "removedDegenerateTriangles": int(len(cells) - len(valid)),
            "removedDuplicateTriangles": int(len(valid) - len(kept)),
            "removedPostMergeDuplicateTriangles": post_merge_duplicate_count,
            "duplicateTriangles": final_duplicate,
            "quantizationRiskTrianglesRemoved": dropped_quantization_slivers,
            "quantizationRiskTriangleRemovalContract": (
                "only triangles that remain degenerate in an isolated Int16 mesh volume; final source-bounds gate remains mandatory"
            ),
            "quantizationRiskTrianglesIsolatedAsOwnMeshes": isolated_quantization_risk,
            "quantizationRiskMeshGroups": len(capsule_mesh_groups),
            "quantizationAffineCapsules": int(np.count_nonzero(affine_capsule_mask)),
            "quantizationRiskGrids": quantization_risk,
            "maximumBoundsDeltaMetres": bounds_delta,
            "boundsDeltaBySideMetres": {
                "min": bounds_delta_min.tolist(),
                "max": bounds_delta_max.tolist(),
            },
            "boundsToleranceMetres": bounds_tolerance,
        },
        "bytesBeforeMeshopt": total,
    }
    stats_path = output.with_suffix(".build.json")
    temporary_stats = stats_path.with_suffix(".tmp.json")
    temporary_stats.write_text(json.dumps(stats, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary_stats, stats_path)
    print(json.dumps(stats), flush=True)
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--private-root", type=Path)
    parser.add_argument("--candidate-id", default="iter-full-device-preview-v1")
    parser.add_argument("--vtk-python", type=Path)
    parser.add_argument("--target-triangles", type=int, default=DEFAULT_TARGET_TRIANGLES)
    parser.add_argument(
        "--divertor-target-triangles",
        type=int,
        default=DEFAULT_DIVERTOR_TARGET_TRIANGLES,
        help="Reserved triangle budget for the device-frame divertor derivative.",
    )
    parser.add_argument("--max-bytes", type=int, default=DEFAULT_MAX_BYTES)
    parser.add_argument("--max-working-set", type=int, default=DEFAULT_MAX_WORKING_SET)
    parser.add_argument("--min-free-memory", type=int, default=DEFAULT_MIN_FREE_MEMORY)
    parser.add_argument("--feature-angle", type=float, default=55.0)
    parser.add_argument(
        "--resume",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Reuse only staged part GLBs that pass stable-node, triangle, bounds, byte and hash QA (default: true).",
    )
    parser.add_argument(
        "--release",
        action="store_true",
        help="Request a release-ready artifact; hard-fails unless all 18 declared components have registered geometry.",
    )
    parser.add_argument(
        "--refresh-manifest-only",
        action="store_true",
        help="Atomically refresh derived candidate statistics without rewriting geometry.",
    )
    parser.add_argument("--worker", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--source", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--output", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--part-id", help=argparse.SUPPRESS)
    parser.add_argument("--title", help=argparse.SUPPRESS)
    parser.add_argument("--color", help=argparse.SUPPRESS)
    parser.add_argument("--target", type=int, help=argparse.SUPPRESS)
    parser.add_argument("--input-format", choices=("glb", "stl"), default="glb", help=argparse.SUPPRESS)
    parser.add_argument(
        "--coordinate-map",
        choices=("identity", "cad-z-up-to-web-y-up"),
        default="identity",
        help=argparse.SUPPRESS,
    )
    parser.add_argument("--bounds-tolerance", type=float, help=argparse.SUPPRESS)
    parser.add_argument("--allow-quantization-sliver-drop", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.worker:
        return args
    repo_root = Path(__file__).resolve().parents[2]
    task_root = repo_root.parent.parent
    args.private_root = args.private_root or task_root / "work" / "iter-cad-private"
    args.vtk_python = args.vtk_python or task_root / "work" / "tokamak-cad-demo" / ".venv" / "Scripts" / "python.exe"
    if not args.refresh_manifest_only and not args.vtk_python.is_file():
        parser.error(f"VTK Python environment not found: {args.vtk_python}")
    return args


if __name__ == "__main__":
    parsed = parse_args()
    if parsed.worker:
        raise SystemExit(worker(parsed))
    if parsed.refresh_manifest_only:
        raise SystemExit(refresh_candidate_manifest_statistics(parsed.private_root.resolve(), parsed.candidate_id))
    raise SystemExit(build(parsed))

"""Strict, archive-safe G-EQDSK discovery and parsing primitives.

This module exposes the source psi grid only in memory. Serialization belongs to the
derived-data pipeline, which must never emit the source grid or source G-EQDSK records.
"""

from __future__ import annotations

import hashlib
import math
import re
import struct
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np


GFILE_BASENAME_RE = re.compile(r"(?:^|/)g0*(?P<shot>\d+)\.(?P<time>\d+)$", re.IGNORECASE)
HEADER_IDENTITY_RE = re.compile(r"#\s*(?P<shot>\d+)\s+(?P<time>\d+)\s*ms", re.IGNORECASE)
FLOAT_RE = re.compile(rb"[-+]?(?:(?:\d+\.\d*)|(?:\.\d+)|(?:\d+))(?:[EeDd][-+]?\d+)?")
OUT1_RE = re.compile(r"\s*&OUT1\b(?P<body>.*?)\s*/", re.DOTALL | re.IGNORECASE)

MAX_GRID_AXIS = 4096
MAX_GRID_CELLS = 4_194_304
MAX_BOUNDARY_POINTS = 200_000
MAX_ARCHIVE_GFILES = 1_000_000
MAX_ARCHIVE_MEMBERS = 200_000
MAX_GFILE_BYTES = 8 * 1024 * 1024
MAX_TOTAL_GFILE_BYTES = 16 * 1024 * 1024 * 1024
MAX_GFILE_COMPRESSION_RATIO = 100.0
MAX_MEMBER_NAME_BYTES = 4096


def _ignored_member_kind(normalized_name: str) -> str:
    """Return a bounded, non-identifying class for a non-G-EQDSK member."""
    basename = normalized_name.rsplit("/", 1)[-1].lower()
    legacy_series = re.fullmatch(r"(?P<prefix>[a-z])0*\d+\.\d+", basename)
    if legacy_series is not None:
        return f"<{legacy_series.group('prefix')}-series>"
    suffix = Path(basename).suffix.lower()
    if re.fullmatch(r"\.\d+", suffix):

        return "<numeric-suffix>"
    return suffix or "<none>"


@dataclass(frozen=True)
class GFileEntry:
    shot: int
    time_ms: int
    archive_name: str
    crc32: int
    file_size: int


@dataclass(frozen=True)
class ArchiveInventory:
    archive: Path
    entries: tuple[GFileEntry, ...]
    ignored_file_counts: dict[str, int]

    @property
    def shots(self) -> tuple[int, ...]:
        return tuple(sorted({entry.shot for entry in self.entries}))

    def entries_for_shot(self, shot: int) -> tuple[GFileEntry, ...]:
        return tuple(entry for entry in self.entries if entry.shot == shot)

    def reconstruction_digest(self, shot: int) -> str:
        """Return a fast inventory digest; publication IDs use content hashes instead."""
        digest = hashlib.sha256()
        for entry in self.entries_for_shot(shot):
            digest.update(struct.pack("<IqIQ", entry.shot, entry.time_ms, entry.crc32, entry.file_size))
        return digest.hexdigest()


@dataclass
class EquilibriumFrame:
    shot: int
    time_ms: int
    nw: int
    nh: int

    rdim: float
    zdim: float
    rcentr: float
    rleft: float
    zmid: float
    r_axis: float
    z_axis: float
    psi_axis: float
    psi_boundary: float
    bcentr: float
    current: float
    pressure: np.ndarray
    qpsi: np.ndarray
    psirz: np.ndarray
    lcfs: np.ndarray
    limiter: np.ndarray
    efit_error: float
    iconvr: int

    @property
    def delta_r(self) -> float:
        return self.rdim / (self.nw - 1)

    @property
    def delta_z(self) -> float:
        return self.zdim / (self.nh - 1)

    @property
    def spatial_uncertainty_floor_m(self) -> float:
        return 0.5 * math.hypot(self.delta_r, self.delta_z)

    @property
    def psi_span(self) -> float:
        return self.psi_boundary - self.psi_axis

    def r_coordinates(self) -> np.ndarray:
        return np.linspace(self.rleft, self.rleft + self.rdim, self.nw)

    def z_coordinates(self) -> np.ndarray:
        return np.linspace(self.zmid - self.zdim / 2, self.zmid + self.zdim / 2, self.nh)



def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def discover_archive(archive: Path) -> ArchiveInventory:
    """Discover G-EQDSK members without extracting or trusting directory names."""
    archive = archive.resolve(strict=True)
    entries: list[GFileEntry] = []
    ignored: Counter[str] = Counter()
    seen: set[tuple[int, int]] = set()
    total_gfile_bytes = 0
    with zipfile.ZipFile(archive) as source:
        members = source.infolist()
        if len(members) > MAX_ARCHIVE_MEMBERS:
            raise ValueError("archive exceeds the reviewed member-count limit")
        for info in members:
            if info.is_dir():
                continue
            if len(info.filename.encode("utf-8", "surrogatepass")) > MAX_MEMBER_NAME_BYTES:
                raise ValueError("archive member name exceeds the reviewed length limit")
            normalized = info.filename.replace("\\", "/")
            match = GFILE_BASENAME_RE.search(normalized)
            if match is None:
                ignored[_ignored_member_kind(normalized)] += 1
                continue
            shot = int(match.group("shot"))
            time_ms = int(match.group("time"))
            if info.file_size <= 0 or info.file_size > MAX_GFILE_BYTES:
                raise ValueError(f"unsafe G-EQDSK member byte length: {info.filename}")
            compressed = max(info.compress_size, 1)
            if info.file_size / compressed > MAX_GFILE_COMPRESSION_RATIO:
                raise ValueError(f"unsafe G-EQDSK compression ratio: {info.filename}")
            total_gfile_bytes += info.file_size
            if total_gfile_bytes > MAX_TOTAL_GFILE_BYTES:
                raise ValueError("archive exceeds the reviewed cumulative G-EQDSK byte budget")
            identity = (shot, time_ms)
            if identity in seen:
                raise ValueError(f"duplicate G-EQDSK identity shot={shot} time={time_ms}ms")
            seen.add(identity)
            entries.append(
                GFileEntry(
                    shot=shot,
                    time_ms=time_ms,
                    archive_name=info.filename,
                    crc32=info.CRC,
                    file_size=info.file_size,
                )
            )

            if len(entries) > MAX_ARCHIVE_GFILES:
                raise ValueError("archive exceeds the reviewed G-EQDSK member limit")
    if not entries:
        raise ValueError("archive contains no recognized G-EQDSK members")
    entries.sort(key=lambda entry: (entry.shot, entry.time_ms, entry.archive_name))
    return ArchiveInventory(archive=archive, entries=tuple(entries), ignored_file_counts=dict(sorted(ignored.items())))


def _floats(lines: Iterable[bytes]) -> list[float]:
    values: list[float] = []
    for line in lines:
        for token in FLOAT_RE.findall(line):
            values.append(float(token.replace(b"D", b"E").replace(b"d", b"e")))
    return values


def _read_fixed(lines: list[bytes], cursor: int, count: int, label: str) -> tuple[np.ndarray, int]:
    if count < 0:
        raise ValueError(f"{label}: negative element count")
    line_count = math.ceil(count / 5)
    values = _floats(lines[cursor : cursor + line_count])
    if len(values) != count:
        raise ValueError(f"{label}: expected {count} values, found {len(values)}")
    return np.asarray(values, dtype=np.float64), cursor + line_count


def _namelist_scalar(text: str, key: str, default: float) -> float:
    match = re.search(
        rf"\b{re.escape(key)}\s*=\s*([-+]?\d+(?:\.\d*)?(?:[EeDd][-+]?\d+)?)",
        text,
        re.IGNORECASE,
    )
    return float(match.group(1).replace("D", "E").replace("d", "e")) if match else default


def parse_gfile(data: bytes, entry: GFileEntry) -> EquilibriumFrame:
    """Parse one standard G-EQDSK record and fail closed on identity/shape mismatch."""
    lines = data.splitlines()
    if len(lines) < 8:
        raise ValueError(f"truncated G-EQDSK record: {entry.archive_name}")

    first = lines[0].decode("ascii", "replace")
    header = first.split()
    try:
        nw, nh = int(header[-2]), int(header[-1])
    except (ValueError, IndexError) as error:
        raise ValueError(f"invalid G-EQDSK dimensions: {entry.archive_name}") from error
    if nw < 3 or nh < 3 or nw > MAX_GRID_AXIS or nh > MAX_GRID_AXIS or nw * nh > MAX_GRID_CELLS:
        raise ValueError(f"unsafe G-EQDSK dimensions {nw}x{nh}: {entry.archive_name}")
    identity_match = HEADER_IDENTITY_RE.search(first)
    if identity_match is None:
        raise ValueError(f"missing shot/time identity in G-EQDSK header: {entry.archive_name}")
    header_identity = (int(identity_match.group("shot")), int(identity_match.group("time")))
    if header_identity != (entry.shot, entry.time_ms):
        raise ValueError(
            f"filename/header mismatch {entry.shot}/{entry.time_ms} != "
            f"{header_identity[0]}/{header_identity[1]} in {entry.archive_name}"
        )

    header_values = _floats(lines[1:5])
    if len(header_values) < 11:
        raise ValueError(f"incomplete G-EQDSK header: {entry.archive_name}")
    (
        rdim,
        zdim,
        rcentr,
        rleft,
        zmid,
        r_axis,
        z_axis,
        psi_axis,
        psi_boundary,
        bcentr,
        current,
    ) = header_values[:11]
    required_header = np.asarray(
        [rdim, zdim, rcentr, rleft, zmid, r_axis, z_axis, psi_axis, psi_boundary, bcentr, current]
    )
    if not np.all(np.isfinite(required_header)) or rdim <= 0 or zdim <= 0:
        raise ValueError(f"non-finite or non-positive G-EQDSK geometry: {entry.archive_name}")
    cursor = 5
    _, cursor = _read_fixed(lines, cursor, nw, "fpol")
    pressure, cursor = _read_fixed(lines, cursor, nw, "pressure")
    _, cursor = _read_fixed(lines, cursor, nw, "ffprim")
    _, cursor = _read_fixed(lines, cursor, nw, "pprime")
    psi_flat, cursor = _read_fixed(lines, cursor, nw * nh, "psirz")
    qpsi, cursor = _read_fixed(lines, cursor, nw, "qpsi")
    if not np.all(np.isfinite(psi_flat)):
        raise ValueError(f"non-finite source psi grid: {entry.archive_name}")
    if cursor >= len(lines):
        raise ValueError(f"missing boundary counts: {entry.archive_name}")
    counts = lines[cursor].split()
    if len(counts) < 2:
        raise ValueError(f"invalid boundary counts: {entry.archive_name}")
    try:
        n_boundary, n_limiter = int(counts[0]), int(counts[1])
    except ValueError as error:
        raise ValueError(f"invalid boundary counts: {entry.archive_name}") from error
    if not (0 <= n_boundary <= MAX_BOUNDARY_POINTS and 0 <= n_limiter <= MAX_BOUNDARY_POINTS):
        raise ValueError(f"unsafe boundary counts: {entry.archive_name}")
    cursor += 1
    lcfs_flat, cursor = _read_fixed(lines, cursor, 2 * n_boundary, "lcfs")
    limiter_flat, cursor = _read_fixed(lines, cursor, 2 * n_limiter, "limiter")
    if not np.all(np.isfinite(lcfs_flat)) or not np.all(np.isfinite(limiter_flat)):
        raise ValueError(f"non-finite boundary geometry: {entry.archive_name}")

    tail = b"\n".join(lines[cursor:]).decode("ascii", "replace")
    out1_match = OUT1_RE.search(tail)
    out1 = out1_match.group("body") if out1_match else ""
    return EquilibriumFrame(
        shot=entry.shot,
        time_ms=entry.time_ms,
        nw=nw,
        nh=nh,
        rdim=rdim,
        zdim=zdim,
        rcentr=rcentr,
        rleft=rleft,
        zmid=zmid,
        r_axis=r_axis,

        z_axis=z_axis,
        psi_axis=psi_axis,
        psi_boundary=psi_boundary,
        bcentr=bcentr,
        current=current,
        pressure=pressure,
        qpsi=qpsi,
        psirz=psi_flat.reshape((nh, nw), order="C"),
        lcfs=lcfs_flat.reshape((-1, 2)),
        limiter=limiter_flat.reshape((-1, 2)),
        efit_error=_namelist_scalar(out1, "ERROR", math.nan),
        iconvr=int(_namelist_scalar(out1, "ICONVR", -1)),
    )


def read_frame(source: zipfile.ZipFile, entry: GFileEntry) -> EquilibriumFrame:
    frame, _ = read_frame_with_sha256(source, entry)
    return frame


def _validated_member(source: zipfile.ZipFile, entry: GFileEntry) -> zipfile.ZipInfo:
    try:
        info = source.getinfo(entry.archive_name)
    except KeyError as error:
        raise ValueError(f"archive member disappeared: {entry.archive_name}") from error
    if info.CRC != entry.crc32 or info.file_size != entry.file_size:
        raise ValueError(f"archive member metadata changed: {entry.archive_name}")
    return info


def read_frame_with_sha256(
    source: zipfile.ZipFile,
    entry: GFileEntry,
) -> tuple[EquilibriumFrame, str]:
    """Read once, validate through ZipFile, and bind the parsed frame to SHA-256."""
    info = _validated_member(source, entry)
    data = source.read(info)
    if len(data) != entry.file_size:
        raise ValueError(f"archive member byte length changed: {entry.archive_name}")
    return parse_gfile(data, entry), hashlib.sha256(data).hexdigest()



def sha256_member(source: zipfile.ZipFile, entry: GFileEntry) -> str:
    """Hash one member without extracting it or retaining its payload in memory."""
    info = _validated_member(source, entry)
    digest = hashlib.sha256()
    byte_count = 0
    with source.open(info, "r") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            byte_count += len(chunk)
            digest.update(chunk)
    if byte_count != entry.file_size:
        raise ValueError(f"archive member byte length changed: {entry.archive_name}")
    return digest.hexdigest()


def content_reconstruction_digest(
    entries: Iterable[GFileEntry],
    member_sha256: Iterable[str],
) -> str:
    """Build a path/order-independent cryptographic reconstruction identity."""
    ordered_entries = tuple(entries)
    ordered_hashes = tuple(member_sha256)
    if len(ordered_entries) != len(ordered_hashes) or not ordered_entries:
        raise ValueError("reconstruction digest requires one content hash per frame")
    digest = hashlib.sha256(b"fusion.efit.reconstruction-content.v1\0")
    previous: tuple[int, int] | None = None
    for entry, content_hash in zip(ordered_entries, ordered_hashes):
        if not re.fullmatch(r"[a-fA-F0-9]{64}", content_hash):
            raise ValueError("invalid G-EQDSK member SHA-256")
        identity = (entry.shot, entry.time_ms)
        if previous is not None and identity <= previous:
            raise ValueError("reconstruction frames must be strictly ordered by shot/time")
        previous = identity
        digest.update(struct.pack("<IqQ", entry.shot, entry.time_ms, entry.file_size))
        digest.update(bytes.fromhex(content_hash))
    return digest.hexdigest()


def timeline_summary(times: Iterable[int]) -> dict[str, object]:

    """Describe an integer-millisecond timeline without assuming 1 ms cadence."""
    ordered = tuple(times)
    if not ordered:
        raise ValueError("timeline must contain at least one frame")
    if any(after <= before for before, after in zip(ordered, ordered[1:])):
        raise ValueError("timeline must be strictly increasing")
    deltas = [after - before for before, after in zip(ordered, ordered[1:])]
    if not deltas:
        nominal = None
        gaps: list[dict[str, object]] = []
    else:
        counts = Counter(deltas)
        nominal = min(delta for delta, count in counts.items() if count == max(counts.values()))
        gaps = []
        for before, after, delta in zip(ordered, ordered[1:], deltas):
            if delta <= nominal:
                continue
            aligned = delta % nominal == 0
            gaps.append(
                {
                    "afterMs": before,
                    "beforeMs": after,
                    "deltaMs": delta,
                    "estimatedMissingFrames": max(round(delta / nominal) - 1, 0),
                    "alignedToNominalCadence": aligned,
                }
            )
    return {
        "timeRangeMs": [ordered[0], ordered[-1]],
        "strictlyIncreasing": True,
        "nominalCadenceMs": nominal,
        "gaps": gaps,
    }


def shot_inventory(inventory: ArchiveInventory) -> dict[int, dict[str, object]]:
    grouped: dict[int, list[GFileEntry]] = defaultdict(list)
    for entry in inventory.entries:
        grouped[entry.shot].append(entry)
    result: dict[int, dict[str, object]] = {}

    for shot, entries in sorted(grouped.items()):
        times = [entry.time_ms for entry in entries]
        timeline = timeline_summary(times)
        result[shot] = {
            "frameCount": len(entries),
            **timeline,
            "reconstructionDigest": inventory.reconstruction_digest(shot),
        }
    return result

"""Add a millimetre-to-metre scale to the root node of a binary glTF file.

CadQuery/OpenCascade writes vertex coordinates in the assembly's source unit
(millimetres here), while glTF defines metres as its linear unit. Keeping the
scale at the root preserves source coordinates and makes downstream viewers
standards-conformant.
"""

from __future__ import annotations

import json
import struct
import sys
from pathlib import Path


JSON_CHUNK = 0x4E4F534A


def normalize(path: Path) -> None:
    payload = path.read_bytes()
    magic, version, _ = struct.unpack_from("<4sII", payload, 0)
    if magic != b"glTF" or version != 2:
        raise ValueError(f"{path} is not a binary glTF 2.0 file")

    offset = 12
    chunks: list[tuple[int, bytes]] = []
    document: dict | None = None
    while offset < len(payload):
        length, chunk_type = struct.unpack_from("<II", payload, offset)
        data = payload[offset + 8 : offset + 8 + length]
        if chunk_type == JSON_CHUNK:
            document = json.loads(data.rstrip(b" \x00"))
        else:
            chunks.append((chunk_type, data))
        offset += 8 + length

    if document is None:
        raise ValueError("GLB JSON chunk is missing")
    scene_index = document.get("scene", 0)
    root_indices = document["scenes"][scene_index]["nodes"]
    if len(root_indices) != 1:
        raise ValueError("Expected one assembly root node")
    root = document["nodes"][root_indices[0]]
    root["scale"] = [0.001, 0.001, 0.001]

    json_data = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    json_data += b" " * ((-len(json_data)) % 4)
    output_chunks = [(JSON_CHUNK, json_data), *chunks]
    total_length = 12 + sum(8 + len(data) for _, data in output_chunks)
    rebuilt = bytearray(struct.pack("<4sII", b"glTF", 2, total_length))
    for chunk_type, data in output_chunks:
        rebuilt.extend(struct.pack("<II", len(data), chunk_type))
        rebuilt.extend(data)
    path.write_bytes(rebuilt)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: normalize_glb_units.py MODEL.glb")
    normalize(Path(sys.argv[1]).resolve())

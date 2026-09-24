"""Validate every generated line-only frame and its exact audited source identity."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path


def sha(data):
    return hashlib.sha256(data).hexdigest()


def verify(directory: Path, audit_path: Path):
    index_raw = (directory / "index.json").read_bytes()
    index = json.loads(index_raw)
    audit = {shot["shot"]: shot for shot in json.loads(audit_path.read_text(encoding="utf-8-sig"))["shots"]}
    assert index["schemaVersion"] == "fusion.efit.fieldlines.v1"
    assert index["coordinates"] == "R-phi-Z:m-rad-m"
    assert index["seedPsiN"] == [.25, .5, .75, .9, .97]
    assert index["phiDegrees"] == 300
    assert index["model"] == "axisymmetric-equilibrium"
    assert sorted(shot["shot"] for shot in index["shots"]) == [21066, 21138]
    all_files = {"index.json"}
    metrics = []
    forbidden = [b":/", b":\\", b"192.168.", b"equilibrium-occ", b"psi_zr", b"b_field_r", b"grid&dim"]
    assert not any(word in index_raw for word in forbidden), "private or raw grid information in index"
    for shot in index["shots"]:
        source = audit[shot["shot"]]
        assert shot["sourceSha256"] == source["source_sha256"]
        assert shot["sourceFrameCount"] == source["frames"] == len(shot["frames"])
        assert shot["frames"][0]["timeMs"] == round(source["time_s"][0] * 1000, 6)
        assert shot["frames"][-1]["timeMs"] == round(source["time_s"][-1] * 1000, 6)
        assert shot["nominalStepMs"] == 1
        frames = []
        for part in shot["chunks"]:
            name = part["file"]
            assert Path(name).name == name and name.endswith(".jsonl.gz")
            assert name not in all_files
            all_files.add(name)
            compressed = (directory / name).read_bytes()
            assert len(compressed) == part["byteLength"] and sha(compressed) == part["sha256"]
            assert len(compressed) < 4_000_000
            raw = gzip.decompress(compressed)
            assert len(raw) < 8_000_000 and not any(word in raw for word in forbidden)
            payloads = [json.loads(line) for line in raw.splitlines()]
            assert len(payloads) == part["frameCount"] <= 16
            assert part["firstIndex"] == len(frames)
            frames.extend(payloads)
        assert len(frames) == source["frames"]
        gap_records = []
        total_points = valid = unavailable = 0
        max_drift = 0
        for k, (frame, summary) in enumerate(zip(frames, shot["frames"])):
            assert frame["shot"] == shot["shot"]
            assert frame["index"] == frame["sourceIndex"] == summary["index"] == summary["sourceIndex"] == k
            assert frame["timeMs"] == summary["timeMs"]
            if k:
                dt = frame["timeMs"] - frames[k - 1]["timeMs"]
                assert dt >= 0.99999
                if dt > 1.5:
                    gap_records.append({"afterSourceIndex": k - 1, "fromMs": frames[k - 1]["timeMs"],
                                        "toMs": frame["timeMs"], "gapMs": round(dt, 6)})
            assert frame["state"] == summary["state"]
            assert len(frame["lines"]) == summary["lineCount"]
            if frame["state"] == "unavailable":
                unavailable += 1
                assert not frame["lines"] and frame["reason"] == summary["reason"]
                continue
            valid += 1
            assert frame["state"] == "valid" and len(frame["lines"]) == 5
            assert len(frame["axisRz"]) == 2
            assert len(frame["boundaryRz"]) >= 6 and len(frame["boundaryRz"]) % 2 == 0
            assert summary["maxPsiNDrift"] == max(line["maxPsiNDrift"] for line in frame["lines"])
            for line, pn in zip(frame["lines"], index["seedPsiN"]):
                assert line["psiN"] == pn
                assert 0 <= line["maxPsiNDrift"] <= 1e-4
                max_drift = max(max_drift, line["maxPsiNDrift"])
                points = line["points"]
                assert len(points) == 511 * 3
                total_points += len(points) // 3
                assert all(isinstance(x, (int, float)) and math.isfinite(x) for x in points)
                assert all(.2 <= r <= 2.2 for r in points[::3])
                assert all(abs(phi) <= 20 for phi in points[1::3])
                assert all(abs(z) <= 1.901 for z in points[2::3])
                assert abs(points[255 * 3 + 1] - 5 * math.pi / 3) < 1e-6
                assert len(line["termination"]) == len(line["arcLengthM"]) == 2
                assert all(reason in ("toroidal-turn-limit", "display-arclength-limit") for reason in line["termination"])
                assert all(0 < length <= 10.001 for length in line["arcLengthM"])
        assert gap_records == shot["gaps"]
        assert len(gap_records) == len(source["gaps"])
        metrics.append({"shot": shot["shot"], "validFrames": valid, "unavailableFrames": unavailable,
                        "sourceFrames": len(frames), "gaps": len(gap_records), "vertices": total_points,
                        "maxPsiNDrift": max_drift})
    assert {path.name for path in directory.iterdir()} == all_files
    return {"status": "passed", "indexSha256": sha(index_raw), "files": len(all_files), "shots": metrics}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("audit", type=Path)
    args = parser.parse_args()
    result = verify(args.directory, args.audit)
    destination = args.directory.parent / (args.directory.name + "-verification.json")
    destination.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result), flush=True)

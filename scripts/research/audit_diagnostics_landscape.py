#!/usr/bin/env python3
"""Strict structural and semantic audit for the FusionDigital diagnostics atlas."""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse


TASKS = {f"DG{i}" for i in range(12)}
EVIDENCE = {f"E{i}" for i in range(5)}
DEPLOYMENT = {f"D{i}" for i in range(1, 6)}
TECHNIQUES = {"MAGNETIC", "MICROWAVE", "LASER", "OPTICAL", "NUCLEAR_PARTICLE", "PROBE_SAMPLING", "ENGINEERING_SENSOR", "COMPUTATIONAL"}
CODE = {"official-direct", "official-enabling", "community-reproduction", "controlled-access", "commercial", "not-public"}
REQUIRED = ["id", "projectId", "primaryTask", "relatedTasks", "techniqueFamilies", "title", "technique", "problem", "measurementPrinciple", "quantities", "temporalScale", "spatialScale", "hardware", "calibration", "inference", "devices", "validation", "evidenceLevel", "deploymentLevel", "limitations", "twinRelevance", "papers", "code", "asOf"]
NON_CODE_HOSTS = {
    "arxiv.org", "doi.org", "www.doi.org", "www.ipp.mpg.de", "www.ga.com",
    "www.epfl.ch", "mastupgrade.com", "www.jt60sa.org", "scientific-publications.ukaea.uk",
    "conferences.iaea.org", "www.clpu.es",
}
KNOWN_SEMANTICS = {
    "DSI-032": ("DG11", "E3", "D2"),
    "DSI-035": ("DG8", "E2", "D2"),
    "DG6-033": ("DG9", "E1", "D2"),
    "DG4-020": ("DG5", "E3", "D3"),
    "DSI-014": ("DG10", "E3", "D2"),
    "DSI-034": ("DG10", "E3", "D2"),
    "PDT-019": ("DG8", "E2", "D2"),
    "DSI-024": ("DG10", "E3", "D3"),
}


def is_https(value: str | None) -> bool:
    if not value:
        return False
    parsed = urlparse(value)
    return parsed.scheme == "https" and bool(parsed.netloc)


def norm_doi(value: str | None) -> str:
    return re.sub(r"^(?:doi:\s*|https?://(?:dx\.)?doi\.org/)", "", (value or "").strip().lower()).rstrip(" ./")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--landscape", type=Path, required=True)
    parser.add_argument("--devices", type=Path, required=True)
    parser.add_argument("--csv", type=Path, required=True)
    args = parser.parse_args()
    errors: list[str] = []
    warnings: list[str] = []
    landscape = json.loads(args.landscape.read_text(encoding="utf-8"))
    device_payload = json.loads(args.devices.read_text(encoding="utf-8"))
    works = landscape.get("entries", [])
    devices = device_payload.get("devices", [])

    if landscape.get("domainName") != "聚变诊断":
        errors.append("domainName must be 聚变诊断")
    if set(landscape.get("taskMeta", {})) != TASKS:
        errors.append("taskMeta must contain exactly DG0-DG11")
    if landscape.get("statistics", {}).get("total") != len(works):
        errors.append("landscape statistics.total does not match entries")
    if device_payload.get("statistics", {}).get("total") != len(devices):
        errors.append("device statistics.total does not match devices")

    ids = [item.get("id") for item in works]
    projects = [item.get("projectId") for item in works]
    if len(ids) != len(set(ids)):
        errors.append("duplicate work IDs")
    if len(projects) != len(set(projects)):
        errors.append("duplicate projectIds after canonical merge")
    by_id = {item.get("id"): item for item in works}

    primary_counts: Counter[str] = Counter()
    association_counts: Counter[str] = Counter()
    paper_keys: set[str] = set()
    code_urls: set[str] = set()
    for item in works:
        wid = item.get("id", "<missing>")
        for field in REQUIRED:
            if field not in item or item[field] in (None, "", []):
                errors.append(f"{wid}: missing/non-empty required field {field}")
        primary = item.get("primaryTask")
        if primary not in TASKS:
            errors.append(f"{wid}: invalid primaryTask {primary}")
        else:
            primary_counts[primary] += 1
        related = item.get("relatedTasks", [])
        if primary in related:
            errors.append(f"{wid}: primaryTask repeated in relatedTasks")
        if any(task not in TASKS for task in related):
            errors.append(f"{wid}: invalid relatedTasks")
        if len(related) != len(set(related)):
            errors.append(f"{wid}: duplicate relatedTasks")
        for task in [primary, *related]:
            if task in TASKS:
                association_counts[task] += 1
        families = item.get("techniqueFamilies", [])
        if any(family not in TECHNIQUES for family in families):
            errors.append(f"{wid}: invalid techniqueFamilies {families}")
        if item.get("evidenceLevel") not in EVIDENCE:
            errors.append(f"{wid}: invalid evidenceLevel")
        if item.get("deploymentLevel") not in DEPLOYMENT:
            errors.append(f"{wid}: invalid deploymentLevel")
        if item.get("deploymentLevel") == "D5":
            basis = " ".join(str(item.get(key, "")) for key in ("validation", "limitations", "twinRelevance")).lower()
            if not any(token in basis for token in ("治理", "审批", "批准", "quality assurance", "protection group", "生命周期", "安全关键")):
                errors.append(f"{wid}: D5 lacks explicit governance/approval evidence")
        if item.get("evidenceLevel") == "E4":
            basis = " ".join(str(item.get(key, "")) for key in ("validation", "limitations", "twinRelevance")).lower()
            if not any(token in basis for token in ("实时", "在线", "常规", "装置", "real-time", "online", "routine")):
                warnings.append(f"{wid}: E4 basis does not explicitly mention device/online/real-time use")
        for device in item.get("devices", []):
            if not device.get("name"):
                errors.append(f"{wid}: device reference lacks name")
        for paper in item.get("papers", []):
            if not paper.get("title"):
                errors.append(f"{wid}: paper lacks title")
            if not isinstance(paper.get("year"), int) or paper["year"] < 1950 or paper["year"] > 2026:
                errors.append(f"{wid}: invalid paper year {paper.get('year')}")
            if not is_https(paper.get("url")):
                errors.append(f"{wid}: paper URL must be HTTPS: {paper.get('url')}")
            doi = norm_doi(paper.get("doi"))
            if doi and "doi.org" in (paper.get("url") or "") and doi not in norm_doi(paper.get("url")):
                errors.append(f"{wid}: DOI/URL mismatch")
            paper_keys.add(doi or paper.get("url") or paper.get("title"))
        for artifact in item.get("code", []):
            status = artifact.get("status")
            if status not in CODE:
                errors.append(f"{wid}: invalid code status {status}")
            url = artifact.get("url")
            if status == "not-public" and url is not None:
                errors.append(f"{wid}: not-public code URL must be null")
            if url is not None and not is_https(url):
                errors.append(f"{wid}: code URL must be HTTPS: {url}")
            if url:
                host = urlparse(url).netloc.lower()
                artifact_type = str(artifact.get("artifactType") or "").lower()
                if host in NON_CODE_HOSTS and artifact_type not in {"dataset", "documentation", "data-interface", "commercial-software"}:
                    errors.append(f"{wid}: code URL points to a paper/facility page rather than a software or data artifact: {url}")
                code_urls.add(url)

    for wid, expected in KNOWN_SEMANTICS.items():
        item = by_id.get(wid)
        if not item:
            errors.append(f"missing required audited work {wid}")
            continue
        actual = (item.get("primaryTask"), item.get("evidenceLevel"), item.get("deploymentLevel"))
        if actual != expected:
            errors.append(f"{wid}: expected task/evidence/deployment {expected}, got {actual}")
    tsm = by_id.get("DSI-035", {})
    tsm_basis = " ".join(str(tsm.get(key, "")) for key in ("title", "titleEn", "problem", "measurementPrinciple", "validation"))
    if "Tokamak Systems Monitor" not in tsm_basis or "Thomson" in tsm_basis:
        errors.append("DSI-035 must describe ITER Tokamak Systems Monitor engineering-health monitoring, not Thomson scattering")

    for task in sorted(TASKS, key=lambda value: int(value[2:])):
        if primary_counts[task] == 0:
            errors.append(f"no primary work for {task}")
    stats = landscape.get("statistics", {})
    if stats.get("uniqueProjects") != len(set(projects)):
        errors.append("uniqueProjects statistic mismatch")
    if stats.get("uniquePapers") != len(paper_keys):
        errors.append("uniquePapers statistic mismatch")
    if stats.get("uniqueCodeAssets") != len(code_urls):
        errors.append("uniqueCodeAssets statistic mismatch")
    if stats.get("primaryTasks") != dict(sorted(primary_counts.items())):
        errors.append("primaryTasks statistics mismatch")
    if stats.get("taskAssociations") != dict(sorted(association_counts.items())):
        errors.append("taskAssociations statistics mismatch")

    device_ids = [item.get("id") for item in devices]
    if len(device_ids) != len(set(device_ids)):
        errors.append("duplicate device IDs")
    required_names = {
        "ITER": ("ITER",), "JET": ("JET",), "DIII-D": ("DIII-D",),
        "EAST": ("EAST",), "KSTAR": ("KSTAR",), "ASDEX": ("ASDEX",),
        "TCV": ("TCV",), "WEST": ("WEST",),
        "MAST-U": ("MAST-U", "MAST Upgrade"), "NSTX-U": ("NSTX-U",),
        "JT-60": ("JT-60",), "HL-2": ("HL-2",), "J-TEXT": ("J-TEXT",),
        "SPARC": ("SPARC",), "EXL-50U": ("EXL-50U",), "EHL-2": ("EHL-2",),
    }
    for label, aliases in required_names.items():
        if not any(
            any(alias.lower() in item.get("name", "").lower() for alias in aliases)
            for item in devices
        ):
            errors.append(f"missing required device profile matching {label}")
    for item in devices:
        did = item.get("id", "<missing-device>")
        for field in ("id", "name", "status", "diagnosticSummary", "primaryTasks", "diagnosticSystems", "sensors", "papers", "limitations", "asOf"):
            if item.get(field) in (None, "", []):
                errors.append(f"{did}: missing/non-empty device field {field}")
        if not item.get("representativeWorks") and not item.get("representativeWorkSummaries"):
            errors.append(f"{did}: needs representativeWorks or evidence-backed representativeWorkSummaries")
        for work_id in item.get("representativeWorks", []):
            if work_id not in by_id:
                errors.append(f"{did}: unknown representative work {work_id}")
        for paper in item.get("papers", []):
            if not isinstance(paper.get("year"), int) or paper["year"] < 1950 or paper["year"] > 2026:
                errors.append(f"{did}: invalid paper year")
            if not is_https(paper.get("url")):
                errors.append(f"{did}: paper URL must be HTTPS")
        for artifact in item.get("code", []):
            if artifact.get("status") == "not-public" and artifact.get("url") is not None:
                errors.append(f"{did}: not-public code URL must be null")
            url = artifact.get("url")
            if url:
                host = urlparse(url).netloc.lower()
                artifact_type = str(artifact.get("artifactType") or "").lower()
                if host in NON_CODE_HOSTS and artifact_type not in {"dataset", "documentation", "data-interface", "commercial-software"}:
                    errors.append(f"{did}: code URL points to a paper/facility page rather than a software or data artifact: {url}")

    exl = next((item for item in devices if item.get("name") == "EXL-50U"), None)
    if exl:
        exl_basis = " ".join(str(exl.get(key, "")) for key in ("type", "status", "diagnosticSummary", "limitations"))
        if "中心螺线管" not in exl_basis or "EXL-50 是无中心螺线管" not in exl_basis:
            errors.append("EXL-50U profile must distinguish solenoid-free EXL-50 from EXL-50U with central-solenoid assistance")

    device_by_name = {item.get("name"): item for item in devices}
    enabling_expectations = {
        ("ITER", "IMAS-Python"),
        ("DIII-D", "OMAS"),
        ("TCV", "MARTe2"),
        ("NSTX-U", "MDSplus"),
        ("J-TEXT", "MDSplus/EPICS/HDF5"),
    }
    for device_name, artifact_name in enabling_expectations:
        profile = device_by_name.get(device_name, {})
        artifact = next((item for item in profile.get("code", []) if item.get("name") == artifact_name), None)
        if not artifact or artifact.get("status") != "official-enabling":
            errors.append(f"{device_name}: generic framework {artifact_name} must be official-enabling, not a direct facility implementation")

    with args.csv.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    if len(rows) != len(works):
        errors.append(f"CSV row count {len(rows)} != work count {len(works)}")
    if {row.get("id") for row in rows} != set(ids):
        errors.append("CSV IDs do not match landscape")

    result = {
        "works": len(works), "devices": len(devices), "papers": len(paper_keys), "codeAssets": len(code_urls),
        "primaryTasks": dict(sorted(primary_counts.items())), "taskAssociations": dict(sorted(association_counts.items())),
        "warnings": warnings, "errors": errors,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

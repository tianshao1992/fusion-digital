from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse


TASKS = {f"T{index}" for index in range(10)}
EVIDENCE = {f"E{index}" for index in range(5)}
DEPLOYMENT = {f"D{index}" for index in range(1, 6)}
CODE_STATUS = {"official-direct", "official-enabling", "commercial-enabling", "community-reproduction", "not-public"}
REQUIRED = {
    "id", "projectId", "titleZh", "year", "organization", "primaryTask", "relatedTasks", "problem", "method",
    "controlArchitecture", "timescale", "sensors", "actuators", "devices", "validation", "results",
    "evidenceLevel", "deploymentLevel", "maturity", "limitations", "twinRelevance", "papers", "code", "tags",
}

D5_GOVERNANCE_TOKENS = (
    "经治理批准", "治理批准", "正式批准", "正式质量保证", "运行前正式质量保证",
    "formal quality assurance", "safety qualification", "qualified safety", "安全资格", "认证批准",
)

PLACEHOLDER_AUTHORS = {"", "未完整列出", "见原始来源"}
PLACEHOLDER_VENUES = {"", "原始论文 / 官方来源", "primary-source"}
CONCEPT_STATUS_TOKENS = ("概念", "规划", "工程设计/研发")


def valid_url(value: str | None) -> bool:
    if not value:
        return False
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def canonical_doi(value: str | None, url: str | None = None) -> str | None:
    raw = (value or "").strip()
    if not raw and url:
        match = re.search(r"https?://(?:dx\.)?doi\.org/(?P<doi>10\.[^?#\s]+)", url, flags=re.IGNORECASE)
        raw = match.group("doi") if match else ""
    raw = re.sub(r"^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)", "", raw, flags=re.IGNORECASE).strip()
    return raw.lower() or None


def check_expected(item: dict, expected: dict[str, object], errors: list[str]) -> None:
    item_id = item.get("id", "<unknown>")
    for field, value in expected.items():
        if field == "relatedContains":
            missing = sorted(set(value) - set(item.get("relatedTasks", [])))
            if missing:
                errors.append(f"{item_id}: relatedTasks missing {', '.join(missing)}")
        elif item.get(field) != value:
            errors.append(f"{item_id}: expected {field}={value!r}; found {item.get(field)!r}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--landscape", type=Path, required=True)
    parser.add_argument("--devices", type=Path, required=True)
    parser.add_argument("--csv", type=Path, required=True)
    args = parser.parse_args()

    errors: list[str] = []
    warnings: list[str] = []
    landscape = json.loads(args.landscape.read_text(encoding="utf-8"))
    devices_payload = json.loads(args.devices.read_text(encoding="utf-8"))
    entries = landscape.get("entries", [])
    devices = devices_payload.get("devices", [])

    if len(entries) < 80:
        errors.append(f"Expected at least 80 control works; found {len(entries)}")
    if len(devices) < 16:
        errors.append(f"Expected at least 16 device/PCS profiles; found {len(devices)}")

    ids: set[str] = set()
    project_ids: set[str] = set()
    associated = Counter()
    paper_keys: set[str] = set()
    source_type_missing = 0
    for item in entries:
        missing = sorted(field for field in REQUIRED if field not in item)
        if missing:
            errors.append(f"{item.get('id', '<unknown>')}: missing {', '.join(missing)}")
        item_id = item.get("id")
        if item_id in ids:
            errors.append(f"Duplicate work id: {item_id}")
        ids.add(item_id)
        project_id = item.get("projectId")
        if not project_id or project_id in project_ids:
            errors.append(f"Invalid/duplicate projectId: {project_id!r}")
        project_ids.add(project_id)
        if not isinstance(item.get("year"), int) or item.get("year", 0) <= 0:
            errors.append(f"{item_id}: year must be a positive integer")
        primary = item.get("primaryTask")
        if primary not in TASKS:
            errors.append(f"{item_id}: invalid primaryTask {primary}")
        for task in [primary, *item.get("relatedTasks", [])]:
            if task not in TASKS:
                errors.append(f"{item_id}: invalid related task {task}")
            else:
                associated[task] += 1
        if item.get("evidenceLevel") not in EVIDENCE:
            errors.append(f"{item_id}: invalid evidenceLevel {item.get('evidenceLevel')}")
        if item.get("deploymentLevel") not in DEPLOYMENT:
            errors.append(f"{item_id}: invalid deploymentLevel {item.get('deploymentLevel')}")
        if item.get("deploymentLevel") == "D5":
            proof = " ".join(str(item.get(key, "")) for key in ("validation", "results", "maturity")).lower()
            if not any(token in proof for token in D5_GOVERNANCE_TOKENS):
                errors.append(f"{item_id}: D5 lacks explicit governance/approval or formal safety-quality evidence")
        if not item.get("papers"):
            errors.append(f"{item_id}: no primary paper/source")
        for paper in item.get("papers", []):
            if not valid_url(paper.get("url")):
                errors.append(f"{item_id}: invalid paper URL {paper.get('url')!r}")
            key = (paper.get("doi") or paper.get("url") or "").lower()
            if key:
                paper_keys.add(key)
            if not paper.get("sourceType"):
                source_type_missing += 1
            if not isinstance(paper.get("year"), int) or paper.get("year", 0) <= 0:
                errors.append(f"{item_id}: paper year must be > 0 for {paper.get('title')!r}")
            if "doi.org" in (paper.get("url") or "").lower() and not canonical_doi(paper.get("doi"), paper.get("url")):
                errors.append(f"{item_id}: DOI URL lacks normalized doi for {paper.get('title')!r}")
        for code in item.get("code", []):
            if code.get("status") not in CODE_STATUS:
                errors.append(f"{item_id}: invalid code status {code.get('status')}")
            if code.get("url") and not valid_url(code["url"]):
                errors.append(f"{item_id}: invalid code URL {code['url']!r}")
            if code.get("status") == "official-direct" and not code.get("url"):
                errors.append(f"{item_id}: official-direct code requires a URL")
            if code.get("status") == "not-public" and code.get("url"):
                errors.append(f"{item_id}: not-public code URL must be null, not a paper/poster/project link")
        if len(item.get("limitations", "")) < 20:
            warnings.append(f"{item_id}: unusually short limitations")

    missing_tasks = sorted(TASKS - set(associated))
    if missing_tasks:
        errors.append(f"No research associations for tasks: {', '.join(missing_tasks)}")
    if len(paper_keys) < 65:
        errors.append(f"Expected at least 65 unique primary sources; found {len(paper_keys)}")
    if source_type_missing:
        warnings.append(f"{source_type_missing} paper records lack sourceType")

    by_id = {item["id"]: item for item in entries}
    expected_items = {
        "CPT-010": {"primaryTask": "T4"},
        "CPT-030": {"deploymentLevel": "D4"},
        "CPT-031": {"primaryTask": "T0", "relatedContains": {"T5", "T7"}},
        "CPT-038": {"primaryTask": "T5", "relatedContains": {"T3"}},
        "CPT-043": {"primaryTask": "T0"},
        "CPT-046": {"primaryTask": "T9"},
        "CPT-047": {"primaryTask": "T7"},
        "CPT-049": {"evidenceLevel": "E2", "deploymentLevel": "D2"},
        "PCS-034": {"evidenceLevel": "E3", "deploymentLevel": "D4"},
        "PCS-035": {"evidenceLevel": "E3", "deploymentLevel": "D4"},
        "PCS-039": {"primaryTask": "T0", "evidenceLevel": "E4", "deploymentLevel": "D4", "relatedContains": {"T2", "T9"}},
        "PCS-040": {"relatedContains": {"T2", "T7"}},
    }
    for item_id, expected in expected_items.items():
        if item_id not in by_id:
            errors.append(f"Missing required audited work: {item_id}")
        else:
            check_expected(by_id[item_id], expected, errors)

    d5_ids = sorted(item["id"] for item in entries if item.get("deploymentLevel") == "D5")
    if d5_ids != ["CPT-045"]:
        errors.append(f"Expected CPT-045 as the sole D5 entry; found {d5_ids}")

    by_project = {item["projectId"]: item for item in entries}
    mast = by_project.get("mast-u-super-x-exhaust-control")
    if not mast:
        errors.append("Missing merged MAST-U Super-X project")
    else:
        if canonical_doi(mast["papers"][0].get("doi"), mast["papers"][0].get("url")) != "10.1038/s41560-025-01824-7":
            errors.append("MAST-U Super-X project must place the formal Nature Energy paper first")
        if not any("preprint" in paper.get("sourceType", "").lower() or "arxiv.org" in paper.get("url", "").lower() for paper in mast["papers"]):
            errors.append("MAST-U Super-X project must retain the author preprint")
    samone = by_project.get("samone-supervisory-control")
    if not samone:
        errors.append("Missing merged SAMONE project")
    else:
        check_expected(samone, {"primaryTask": "T8", "relatedContains": {"T7", "T9"}}, errors)

    ptefit = by_id.get("PCS-039")
    if ptefit and not any("preprint" in paper.get("sourceType", "").lower() for paper in ptefit.get("papers", [])):
        errors.append("PCS-039: PTEFIT evidence must remain explicitly typed as preprint")
    pcs5 = by_id.get("PCS-005")
    if pcs5:
        meq = next((code for code in pcs5.get("code", []) if code.get("name") == "MEQ"), None)
        if not meq or meq.get("status") != "official-enabling":
            errors.append("PCS-005: MEQ must be classified as official-enabling")
    for item in entries:
        for code in item.get("code", []):
            if code.get("name", "").lower() == "freegsnke" and code.get("status") != "official-enabling":
                errors.append(f"{item['id']}: FreeGSNKE must be official-enabling, not a direct implementation")
            if code.get("name", "").lower() == "plasma-profile-predictor":
                direct = any(token in code.get("relationship", "") for token in ("直接训练/评估", "直接训练"))
                expected_status = "official-direct" if direct else "official-enabling"
                if code.get("status") != expected_status:
                    errors.append(f"{item['id']}: plasma-profile-predictor relationship/status mismatch")

    device_ids: set[str] = set()
    for device in devices:
        device_id = device.get("id")
        if not device_id or device_id in device_ids:
            errors.append(f"Invalid/duplicate device id: {device_id!r}")
        device_ids.add(device_id)
        if not device.get("name") or not device.get("pcsArchitecture"):
            errors.append(f"{device_id}: missing name or PCS architecture")
        if not device.get("papers"):
            errors.append(f"{device_id}: no primary paper/source")
        if not device.get("representativeWorks"):
            errors.append(f"{device_id}: representativeWorks must not be empty")
        for paper in device.get("papers", []):
            if not valid_url(paper.get("url")):
                errors.append(f"{device_id}: invalid device paper URL {paper.get('url')!r}")
            if not isinstance(paper.get("year"), int) or paper.get("year", 0) <= 0:
                errors.append(f"{device_id}: device paper year must be > 0 for {paper.get('title')!r}")
            if "doi.org" in (paper.get("url") or "").lower() and not canonical_doi(paper.get("doi"), paper.get("url")):
                errors.append(f"{device_id}: DOI URL lacks normalized doi for {paper.get('title')!r}")
            if paper.get("authors") in PLACEHOLDER_AUTHORS:
                warnings.append(f"{device_id}: device paper authors still incomplete for {paper.get('title')!r}")
            if paper.get("venue") in PLACEHOLDER_VENUES:
                warnings.append(f"{device_id}: device paper venue still incomplete for {paper.get('title')!r}")
        for task in device.get("primaryTasks", []):
            if task not in TASKS:
                errors.append(f"{device_id}: invalid task {task}")
        for code in device.get("code", []):
            if code.get("status") not in CODE_STATUS:
                errors.append(f"{device_id}: invalid device code status {code.get('status')}")
            if code.get("url") and not valid_url(code.get("url")):
                errors.append(f"{device_id}: invalid device code URL {code.get('url')!r}")
            if code.get("status") == "official-direct" and not code.get("url"):
                errors.append(f"{device_id}: official-direct device code requires a URL")
            if code.get("status") == "not-public" and code.get("url"):
                errors.append(f"{device_id}: not-public device code URL must be null")
        status = str(device.get("status", ""))
        is_concept = any(token in status for token in CONCEPT_STATUS_TOKENS)
        if not is_concept and (not device.get("sensors") or not device.get("actuators")):
            errors.append(f"{device_id}: non-concept device requires linked sensors and actuators")

    devices_by_name = {device.get("name"): device for device in devices}
    exl = devices_by_name.get("EXL-50 / EXL-50U")
    if not exl:
        errors.append("Missing EXL-50 / EXL-50U device profile")
    else:
        if not {"T0", "T2", "T9"}.issubset(exl.get("primaryTasks", [])):
            errors.append("EXL-50 / EXL-50U profile must link PCS-039 tasks T0/T2/T9")
        if not any("PTEFIT" in work for work in exl.get("representativeWorks", [])):
            errors.append("EXL-50 / EXL-50U profile must link the PTEFIT work")
    ehl = devices_by_name.get("EHL-2")
    if not ehl:
        errors.append("Missing EHL-2 device profile")
    else:
        if not {"T2", "T7", "T9"}.issubset(ehl.get("primaryTasks", [])):
            errors.append("EHL-2 profile must carry T2/T7/T9 planning tasks")
        if not any("EHL-2" in work or "Proton-Boron" in work for work in ehl.get("representativeWorks", [])):
            errors.append("EHL-2 profile must link PCS-040/official roadmap evidence")

    with args.csv.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    if len(rows) != len(entries):
        errors.append(f"CSV rows {len(rows)} != landscape entries {len(entries)}")
    if {row.get("id") for row in rows} != ids:
        errors.append("CSV ids do not match landscape ids")

    stats = landscape.get("statistics", {})
    if stats.get("total") != len(entries):
        errors.append("statistics.total does not match entry count")
    if devices_payload.get("statistics", {}).get("total") != len(devices):
        errors.append("device statistics.total does not match device count")

    print(
        f"Control audit: {len(entries)} works, {len(paper_keys)} unique primary sources, "
        f"{len(devices)} device profiles, {sum(associated.values())} task associations."
    )
    print("Task coverage:", ", ".join(f"{task}={associated[task]}" for task in sorted(TASKS)))
    for warning in warnings:
        print(f"WARNING: {warning}")
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())

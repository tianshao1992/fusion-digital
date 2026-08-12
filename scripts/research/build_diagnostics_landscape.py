#!/usr/bin/env python3
"""Build the canonical FusionDigital diagnostics landscape from reviewed sources."""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit


TASK_META = {
    "DG0": {"label": "诊断系统工程、计量与健康", "en": "SYSTEMS ENGINEERING, METROLOGY & HEALTH", "role": "cross-cutting"},
    "DG1": {"label": "磁平衡、电流与位形", "en": "MAGNETIC EQUILIBRIUM, CURRENT & CONFIGURATION", "role": "measurement"},
    "DG2": {"label": "电子密度与电子温度", "en": "ELECTRON DENSITY & TEMPERATURE", "role": "measurement"},
    "DG3": {"label": "离子状态、流动、组分与中性粒子", "en": "ION STATE, FLOW, COMPOSITION & NEUTRALS", "role": "measurement"},
    "DG4": {"label": "辐射、杂质与功率损失", "en": "RADIATION, IMPURITIES & POWER LOSS", "role": "measurement"},
    "DG5": {"label": "聚变产物、中子、伽马与高能粒子", "en": "FUSION PRODUCTS, NEUTRONS, GAMMA RAYS & ENERGETIC PARTICLES", "role": "measurement"},
    "DG6": {"label": "MHD、波动与湍流", "en": "MHD, WAVES & TURBULENCE", "role": "measurement"},
    "DG7": {"label": "边界、SOL、偏滤器与等离子体面对部件", "en": "EDGE, SOL, DIVERTOR & PLASMA-FACING COMPONENTS", "role": "measurement"},
    "DG8": {"label": "工程设备与电厂状态监测", "en": "ENGINEERING EQUIPMENT & PLANT CONDITION", "role": "measurement"},
    "DG9": {"label": "合成诊断与仪器前向模型", "en": "SYNTHETIC DIAGNOSTICS & FORWARD MODELS", "role": "cross-cutting"},
    "DG10": {"label": "集成反演、层析与数据同化", "en": "INTEGRATED INVERSION, TOMOGRAPHY & DATA ASSIMILATION", "role": "cross-cutting"},
    "DG11": {"label": "实时诊断、AI 与决策接口", "en": "REAL-TIME DIAGNOSTICS, AI & DECISION INTERFACES", "role": "cross-cutting"},
}

TASK_ALIASES = {
    **{key: key for key in TASK_META},
    "磁诊断": "DG1", "磁平衡": "DG1", "平衡与电流剖面": "DG1",
    "电子密度与温度": "DG2", "电子态": "DG2",
    "离子与组分": "DG3", "离子状态": "DG3",
    "辐射与杂质": "DG4", "辐射": "DG4",
    "中子与快离子": "DG5", "聚变产物": "DG5", "快离子": "DG5",
    "MHD与湍流": "DG6", "波动与湍流": "DG6",
    "边界与PFC": "DG7", "边界/SOL/偏滤器/PFC": "DG7",
    "工程诊断": "DG8", "电厂状态监测": "DG8",
    "合成诊断": "DG9", "前向模型": "DG9",
    "集成反演": "DG10", "层析与数据同化": "DG10",
    "实时诊断": "DG11", "智能诊断": "DG11", "AI": "DG11",
    "计量与标定": "DG0", "诊断系统工程": "DG0",
}

TECHNIQUE_FAMILIES = {
    "MAGNETIC", "MICROWAVE", "LASER", "OPTICAL", "NUCLEAR_PARTICLE",
    "PROBE_SAMPLING", "ENGINEERING_SENSOR", "COMPUTATIONAL",
}
CODE_STATUSES = {
    "official-direct", "official-enabling", "community-reproduction",
    "controlled-access", "commercial", "not-public",
}
EVIDENCE = {f"E{i}" for i in range(5)}
DEPLOYMENT = {f"D{i}" for i in range(1, 6)}


def pick(obj: dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        if key in obj and obj[key] not in (None, "", []):
            return obj[key]
    return default


def text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        return "；".join(text(item) for item in value if text(item))
    if isinstance(value, dict):
        return "；".join(f"{k}: {text(v)}" for k, v in value.items() if text(v))
    return re.sub(r"\s+", " ", str(value)).strip()


def string_list(value: Any) -> list[str]:
    if value is None:
        return []
    values = value if isinstance(value, list) else [value]
    out: list[str] = []
    for item in values:
        if isinstance(item, dict):
            item_text = pick(item, "name", "label", "quantity", "title", default=text(item))
        else:
            item_text = item
        normalized = text(item_text)
        if normalized and normalized not in out:
            out.append(normalized)
    return out


def normalize_url(value: Any) -> str | None:
    raw = text(value)
    if not raw:
        return None
    if raw.lower().startswith("doi:"):
        raw = f"https://doi.org/{raw[4:].strip()}"
    if re.fullmatch(r"10\.\d{4,9}/\S+", raw, flags=re.I):
        raw = f"https://doi.org/{raw}"
    if not raw.startswith("https://"):
        return raw
    parts = urlsplit(raw)
    path = re.sub(r"/$", "", parts.path)
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, parts.query, ""))


def canonical_doi(value: Any) -> str | None:
    raw = text(value).lower()
    raw = re.sub(r"^(?:doi:\s*|https?://(?:dx\.)?doi\.org/)", "", raw)
    return raw.rstrip(" .") or None


def task_id(value: Any, *, required: bool = True) -> str | None:
    raw = text(value)
    if raw in TASK_ALIASES:
        return TASK_ALIASES[raw]
    match = re.search(r"DG(?:1[01]|[0-9])", raw.upper())
    if match and match.group(0) in TASK_META:
        return match.group(0)
    if required:
        raise ValueError(f"Unknown diagnostics task: {value!r}")
    return None


def normalize_paper(raw: dict[str, Any]) -> dict[str, Any]:
    doi = canonical_doi(pick(raw, "doi", "DOI"))
    url = normalize_url(pick(raw, "url", "link", "sourceUrl"))
    if doi and not url:
        url = f"https://doi.org/{doi}"
    year_raw = pick(raw, "year", "publicationYear", default=0)
    try:
        year = int(year_raw)
    except (TypeError, ValueError):
        year = 0
    return {
        "title": text(pick(raw, "title", "name")),
        "authors": text(pick(raw, "authors", "author", default="未完整列出")),
        "year": year,
        "venue": text(pick(raw, "venue", "journal", "conference", default="原始论文 / 官方来源")),
        "doi": doi,
        "url": url,
        "sourceType": text(pick(raw, "sourceType", "source_type", "type", default="未标注")),
    }


def normalize_code(raw: dict[str, Any]) -> dict[str, Any]:
    status_value = pick(raw, "status", "openness", "codeStatus", "publicAccess")
    access_raw = text(pick(raw, "access", default="")).lower()
    relation_raw = text(pick(raw, "relation", default="")).lower()
    if status_value in (None, ""):
        if access_raw in {"not-public", "private", "unavailable"}:
            status_value = "not-public"
        elif access_raw in {"controlled", "controlled-access", "on-request", "restricted"}:
            status_value = "controlled-access"
        elif access_raw in {"commercial", "proprietary", "licensed"}:
            status_value = "commercial"
        elif access_raw in {"public", "open", "open-source"}:
            if relation_raw in {"enabling", "official-enabling", "official-framework"}:
                status_value = "official-enabling"
            elif relation_raw in {"community-reproduction", "community"}:
                status_value = "community-reproduction"
            else:
                status_value = "official-direct"
        else:
            status_value = "not-public"
    status_raw = text(status_value).lower()
    status_aliases = {
        "official open repository": "official-direct",
        "official-public": "official-direct",
        "official public": "official-direct",
        "official-framework": "official-enabling",
        "official framework": "official-enabling",
        "open source": "official-direct",
        "commercial-software": "commercial",
        "proprietary": "commercial",
        "restricted": "controlled-access",
        "restricted/not publicly released": "not-public",
        "not public": "not-public",
    }
    status = status_aliases.get(status_raw, status_raw)
    if status not in CODE_STATUSES:
        status = "not-public"
    url = normalize_url(pick(raw, "url", "repositoryUrl", "repository", "link"))
    if status == "not-public":
        url = None
    return {
        "name": text(pick(raw, "name", "title", default="未公开实现")),
        "url": url,
        "status": status,
        "artifactType": text(pick(raw, "artifactType", "artifact_type", "type", default="source-code" if url else "implementation")),
        "access": text(pick(raw, "access", default="open" if url and status not in {"commercial", "controlled-access"} else "restricted")),
        "relation": text(pick(raw, "relationship", "note", "relation", default="与该工作相关的软件或实现")),
    }


def normalize_device_ref(raw: Any) -> dict[str, str]:
    if isinstance(raw, str):
        return {"name": text(raw), "fit": "未单独说明", "validation": "见工作验证说明"}
    return {
        "name": text(pick(raw, "name", "device", "facility")),
        "fit": text(pick(raw, "fit", "application", "scope", default="未单独说明")),
        "validation": text(pick(raw, "validation", "evidence", "result", default="见工作验证说明")),
    }


def envelope_items(data: Any, keys: tuple[str, ...]) -> list[dict[str, Any]]:
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if isinstance(data, dict):
        for key in keys:
            value = data.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
    raise ValueError(f"No list found under {keys}")


def normalize_work(raw: dict[str, Any], as_of: str) -> dict[str, Any]:
    primary = task_id(pick(raw, "primaryTask", "primary_task", "taskId", "task_class", "domain"))
    related: list[str] = []
    for item in string_list(pick(raw, "relatedTasks", "related_tasks", "taskAssociations", default=[])):
        tid = task_id(item, required=False)
        if tid and tid != primary and tid not in related:
            related.append(tid)
    raw_technique = pick(raw, "technique", "method", "diagnostic", default="见测量原理")
    families = []
    for family in string_list(pick(raw, "techniqueFamilies", "technique_families", "modalities", default=[])):
        normalized = family.upper().replace("-", "_").replace(" ", "_")
        if normalized in TECHNIQUE_FAMILIES and normalized not in families:
            families.append(normalized)
    if not families:
        if isinstance(raw_technique, dict):
            candidate = text(pick(raw_technique, "family", "type")).upper().replace("-", "_").replace(" ", "_")
            if candidate in TECHNIQUE_FAMILIES:
                families = [candidate]
        if not families:
            families = ["COMPUTATIONAL"] if primary in {"DG9", "DG10", "DG11"} else ["OPTICAL"]
    raw_devices = pick(raw, "devices", "facilities", "applicableDevices", default=[])
    devices = [normalize_device_ref(item) for item in (raw_devices if isinstance(raw_devices, list) else [raw_devices])]
    devices = [item for item in devices if item["name"]]
    papers_raw = pick(raw, "papers", "references", "sources", default=[])
    papers_raw = papers_raw if isinstance(papers_raw, list) else [papers_raw]
    papers = [normalize_paper(item) for item in papers_raw if isinstance(item, dict)]
    code_raw = pick(raw, "code", "software", "repositories", "tools", default=[])
    code_raw = code_raw if isinstance(code_raw, list) else [code_raw]
    code = [normalize_code(item) for item in code_raw if isinstance(item, dict)]
    record_id = text(pick(raw, "id", "workId"))
    project_id = text(pick(raw, "projectId", "project_id", default=record_id)).lower().replace(" ", "-")
    raw_title = pick(raw, "title", "title_zh", "name")
    if isinstance(raw_title, dict):
        title_zh = text(pick(raw_title, "zh", "cn", "title", default=text(raw_title)))
        title_en = text(pick(raw_title, "en", "english", default=pick(raw, "titleEn", "title_en", "englishTitle")))
    else:
        title_zh = text(raw_title)
        title_en = text(pick(raw, "titleEn", "title_en", "englishTitle"))
    return {
        "id": record_id,
        "projectId": project_id,
        "primaryTask": primary,
        "relatedTasks": related,
        "techniqueFamilies": families,
        "title": title_zh,
        "titleEn": title_en,
        "technique": text(raw_technique),
        "problem": text(pick(raw, "problem", "objective")),
        "measurementPrinciple": text(pick(raw, "measurementPrinciple", "measurement_principle", "principle", "method")),
        "quantities": string_list(pick(raw, "quantities", "measuredQuantities", "outputs", default=[])),
        "region": string_list(pick(raw, "region", "regions", "plasmaRegion", default=[])),
        "temporalScale": text(pick(raw, "temporalScale", "timeScale", "timescale", "temporalResolution", default="因装置、采集和分析链而异；原始来源未给出统一数值。")),
        "spatialScale": text(pick(raw, "spatialScale", "spatialResolution", "coverage", default="由视线、几何和反演设定；原始来源未给出统一数值。")),
        "hardware": string_list(pick(raw, "hardware", "hardware/sensors", "sensors", "instrumentation", default=[])),
        "calibration": text(pick(raw, "calibration", "metrology", "quality", default="原始来源未单独说明完整标定链。")),
        "inference": text(pick(raw, "inference", "analysis", "reconstruction", default="按原始工作提供的分析链获得测量产品。")),
        "devices": devices,
        "validation": text(pick(raw, "validation", "validationLevel", "validation_level", "keyResults", "key_results")),
        "evidenceLevel": text(pick(raw, "evidenceLevel", "evidence_level", default="E0")).upper(),
        "deploymentLevel": text(pick(raw, "deploymentLevel", "deployment_level", default="D1")).upper(),
        "limitations": text(pick(raw, "limitations", "gaps")),
        "twinRelevance": text(pick(raw, "twinRelevance", "digitalTwinSignificance", "digital_twin_significance")),
        "papers": papers,
        "code": code,
        "organizations": string_list(pick(raw, "organizations", "institutions", "organization", default=[])),
        "tags": string_list(pick(raw, "tags", "keywords", default=[])),
        "asOf": text(pick(raw, "asOf", "as_of", default=as_of)),
    }


def ordered_unique(values: list[Any], key) -> list[Any]:
    seen: set[Any] = set()
    result = []
    for value in values:
        marker = key(value)
        if marker in seen:
            continue
        seen.add(marker)
        result.append(value)
    return result


def merge_work(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    score = lambda item: sum(len(text(item.get(k))) for k in ("problem", "measurementPrinciple", "validation", "limitations", "twinRelevance"))
    base, other = (left, right) if score(left) >= score(right) else (right, left)
    merged = dict(base)
    for field in ("relatedTasks", "techniqueFamilies", "quantities", "region", "hardware", "organizations", "tags"):
        merged[field] = ordered_unique(list(base[field]) + list(other[field]), key=lambda value: value)
    merged["devices"] = ordered_unique(list(base["devices"]) + list(other["devices"]), key=lambda value: value["name"].lower())
    merged["papers"] = ordered_unique(list(base["papers"]) + list(other["papers"]), key=lambda value: value.get("doi") or value.get("url") or value.get("title"))
    merged["code"] = ordered_unique(list(base["code"]) + list(other["code"]), key=lambda value: (value.get("name"), value.get("url"), value.get("relation")))
    merged["evidenceLevel"] = max(left["evidenceLevel"], right["evidenceLevel"], key=lambda value: int(value[1:]))
    merged["deploymentLevel"] = max(left["deploymentLevel"], right["deploymentLevel"], key=lambda value: int(value[1:]))
    for field in ("title", "titleEn", "technique", "problem", "measurementPrinciple", "calibration", "inference", "validation", "limitations", "twinRelevance"):
        if len(text(other.get(field))) > len(text(merged.get(field))):
            merged[field] = other[field]
    return merged


def normalize_device_profile(raw: dict[str, Any], as_of: str) -> dict[str, Any]:
    papers_raw = pick(raw, "representativePapers", "papers", "sources", default=[])
    papers_raw = papers_raw if isinstance(papers_raw, list) else [papers_raw]
    papers = [normalize_paper(item) for item in papers_raw if isinstance(item, dict)]
    code_raw = pick(raw, "publicCodeAndData", "code", "software", default=[])
    code_raw = code_raw if isinstance(code_raw, list) else [code_raw]
    code = [normalize_code(item) for item in code_raw if isinstance(item, dict)]
    tasks = []
    for item in string_list(pick(raw, "primaryTasks", "tasks", "diagnosticTasks", "controlTasks", default=[])):
        tid = task_id(item, required=False)
        if tid and tid not in tasks:
            tasks.append(tid)
    return {
        "id": text(pick(raw, "id", "deviceId")),
        "name": text(pick(raw, "name", "facility")),
        "type": text(pick(raw, "type", "deviceType", default="托卡马克")),
        "countryOrRegion": text(pick(raw, "countryOrRegion", "country", "region", default="未标注")),
        "operator": text(pick(raw, "operator", "organization", default="未标注")),
        "status": text(pick(raw, "status", "constructionStatus", default="未标注")),
        "diagnosticSummary": text(pick(raw, "diagnosticSummary", "summary", "evidenceBoundary")),
        "primaryTasks": tasks,
        "representativeWorks": string_list(pick(raw, "representativeWorks", "workIds", default=[])),
        "representativeWorkSummaries": string_list(pick(raw, "representativeWorkSummaries", "workSummaries", default=[])),
        "diagnosticSystems": string_list(pick(raw, "diagnosticSystems", "systems", "diagnosticSuite", default=[])),
        "sensors": string_list(pick(raw, "sensors", "measurements", default=[])),
        "realTimeInterfaces": string_list(pick(raw, "realTimeInterfaces", "realtime", "pcsInterfaces", default=[])),
        "dataPlatform": string_list(pick(raw, "dataPlatform", "dataPlatforms", "data", default=[])),
        "papers": papers,
        "code": code,
        "limitations": string_list(pick(raw, "limitations", "gaps", "evidenceBoundary", default=[])),
        "asOf": text(pick(raw, "asOf", "as_of", default=as_of)),
    }


def json_dump(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def paper_key(paper: dict[str, Any]) -> str:
    return paper.get("doi") or paper.get("url") or paper.get("title", "").lower()


def statistics(works: list[dict[str, Any]], devices: list[dict[str, Any]]) -> dict[str, Any]:
    papers = ordered_unique([paper for work in works for paper in work["papers"]], key=paper_key)
    code = ordered_unique([artifact for work in works for artifact in work["code"] if artifact.get("url")], key=lambda item: item["url"])
    primary = Counter(item["primaryTask"] for item in works)
    associations = Counter(task for item in works for task in [item["primaryTask"], *item["relatedTasks"]])
    evidence = Counter(item["evidenceLevel"] for item in works)
    deployment = Counter(item["deploymentLevel"] for item in works)
    return {
        "total": len(works),
        "uniqueProjects": len({item["projectId"] for item in works}),
        "uniquePapers": len(papers),
        "uniqueCodeAssets": len(code),
        "devices": len(devices),
        "primaryTasks": dict(sorted(primary.items())),
        "taskAssociations": dict(sorted(associations.items())),
        "evidence": dict(sorted(evidence.items())),
        "deployment": dict(sorted(deployment.items())),
    }


def write_csv(path: Path, works: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = ["id", "projectId", "primaryTask", "relatedTasks", "techniqueFamilies", "title", "technique", "devices", "evidenceLevel", "deploymentLevel", "paperTitles", "paperUrls", "codeNames", "codeUrls", "limitations"]
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for work in works:
            writer.writerow({
                "id": work["id"], "projectId": work["projectId"], "primaryTask": work["primaryTask"],
                "relatedTasks": " | ".join(work["relatedTasks"]), "techniqueFamilies": " | ".join(work["techniqueFamilies"]),
                "title": work["title"], "technique": work["technique"],
                "devices": " | ".join(item["name"] for item in work["devices"]),
                "evidenceLevel": work["evidenceLevel"], "deploymentLevel": work["deploymentLevel"],
                "paperTitles": " | ".join(item["title"] for item in work["papers"]),
                "paperUrls": " | ".join(item["url"] or "" for item in work["papers"]),
                "codeNames": " | ".join(f"{item['name']} [{item['status']}]" for item in work["code"]),
                "codeUrls": " | ".join(item["url"] or "" for item in work["code"]),
                "limitations": work["limitations"],
            })


def bib_key(paper: dict[str, Any], index: int) -> str:
    surname = re.sub(r"[^A-Za-z0-9]", "", paper.get("authors", "").split(",")[0].split()[-1]) or "FusionDiag"
    return f"{surname}{paper.get('year') or 'nd'}Diag{index:03d}"


def bib_escape(value: Any) -> str:
    return text(value).replace("{", "\\{").replace("}", "\\}")


def write_bib(path: Path, works: list[dict[str, Any]]) -> None:
    papers = ordered_unique([paper for work in works for paper in work["papers"]], key=paper_key)
    blocks = []
    for index, paper in enumerate(papers, 1):
        fields = [f"  title = {{{bib_escape(paper['title'])}}}", f"  author = {{{bib_escape(paper['authors'])}}}", f"  year = {{{paper['year']}}}", f"  journal = {{{bib_escape(paper['venue'])}}}"]
        if paper.get("doi"):
            fields.append(f"  doi = {{{paper['doi']}}}")
        if paper.get("url"):
            fields.append(f"  url = {{{paper['url']}}}")
        blocks.append(f"@article{{{bib_key(paper, index)},\n" + ",\n".join(fields) + "\n}")
    path.write_text("\n\n".join(blocks) + "\n", encoding="utf-8")


def write_ts(path: Path, works: list[dict[str, Any]], devices: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    task_json = json.dumps(TASK_META, ensure_ascii=False, indent=2)
    works_json = json.dumps(works, ensure_ascii=False, indent=2)
    devices_json = json.dumps(devices, ensure_ascii=False, indent=2)
    source = f"""// Generated by scripts/research/build_diagnostics_landscape.py. Do not edit by hand.\n\nexport type DiagnosticsTaskId = {' | '.join(repr(key) for key in TASK_META)};\nexport type DiagnosticsEvidenceLevel = 'E0' | 'E1' | 'E2' | 'E3' | 'E4';\nexport type DiagnosticsDeploymentLevel = 'D1' | 'D2' | 'D3' | 'D4' | 'D5';\nexport type DiagnosticsTechniqueFamily = {' | '.join(repr(key) for key in sorted(TECHNIQUE_FAMILIES))};\nexport type DiagnosticsCodeStatus = {' | '.join(repr(key) for key in sorted(CODE_STATUSES))};\n\nexport const diagnosticsTaskMeta = {task_json} as const;\nexport const diagnosticsResearchItems = {works_json} as const;\nexport const diagnosticsDeviceProfiles = {devices_json} as const;\n"""
    path.write_text(source, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--research-dir", type=Path, required=True)
    parser.add_argument("--site-dir", type=Path, required=True)
    args = parser.parse_args()
    research_dir = args.research_dir.resolve()
    site_dir = args.site_dir.resolve()
    manifest = json.loads((research_dir / "manifest.json").read_text(encoding="utf-8"))
    as_of = text(manifest["editionDate"])
    source_dir = research_dir / "sources"

    by_project: dict[str, dict[str, Any]] = {}
    for filename in manifest["workSources"]:
        data = json.loads((source_dir / filename).read_text(encoding="utf-8"))
        for raw in envelope_items(data, ("works", "entries", "items", "records")):
            work = normalize_work(raw, as_of)
            if not work["projectId"]:
                raise ValueError(f"Work {work['id']!r} lacks projectId")
            by_project[work["projectId"]] = merge_work(by_project[work["projectId"]], work) if work["projectId"] in by_project else work
    works = sorted(by_project.values(), key=lambda item: (int(item["primaryTask"][2:]), item["id"]))

    device_data = json.loads((source_dir / manifest["deviceSource"]).read_text(encoding="utf-8"))
    devices = [normalize_device_profile(raw, as_of) for raw in envelope_items(device_data, ("devices", "entries", "items", "records"))]
    known_work_ids = {item["id"] for item in works}

    device_aliases = {
        "asdexupgrade": "aug", "asdexu": "aug", "aug": "aug",
        "mastupgrade": "mastu", "mastu": "mastu",
        "jt60superadvanced": "jt60sa", "jt60sa": "jt60sa", "jt60u": "jt60u",
        "hl2a": "hl2a", "hl2m": "hl2m", "w7x": "w7x",
        "diiid": "diiid", "nstxu": "nstxu", "jtext": "jtext",
    }

    def canonical_device_token(value: str) -> str:
        token = re.sub(r"[^a-z0-9]", "", value.lower())
        return device_aliases.get(token, token)

    def device_tokens(name: str) -> list[str]:
        return [canonical_device_token(token) for token in re.split(r"[/、,]", name) if canonical_device_token(token)]

    for device in devices:
        supplied = list(device["representativeWorks"])
        summaries = list(device["representativeWorkSummaries"])
        summaries.extend(value for value in supplied if value not in known_work_ids and value not in summaries)
        valid = [value for value in supplied if value in known_work_ids]
        tokens = device_tokens(device["name"])
        candidates = []
        for work in works:
            names = [canonical_device_token(ref["name"]) for ref in work["devices"]]
            if any(token and any(token in name or name in token for name in names) for token in tokens):
                candidates.append(work)
        candidates.sort(key=lambda item: (-int(item["evidenceLevel"][1:]), -int(item["deploymentLevel"][1:]), int(item["primaryTask"][2:]), item["id"]))
        seen_tasks = {next((work["primaryTask"] for work in works if work["id"] == value), "") for value in valid}
        for work in candidates:
            if work["id"] in valid:
                continue
            if work["primaryTask"] not in seen_tasks or len(valid) < 6:
                valid.append(work["id"])
                seen_tasks.add(work["primaryTask"])
            if len(valid) >= 12:
                break
        device["representativeWorks"] = valid
        device["representativeWorkSummaries"] = summaries
    devices = sorted(devices, key=lambda item: item["name"].lower())
    stats = statistics(works, devices)

    landscape = {
        "schemaVersion": "1.0",
        "asOf": as_of,
        "domainName": "聚变诊断",
        "domainNameEn": "Fusion Diagnostics",
        "namingBoundary": "合成诊断与智能方法是聚变诊断的子域和赋能层，不替代真实仪器、计量、反演及设备状态监测。",
        "taskMeta": TASK_META,
        "techniqueFamilies": sorted(TECHNIQUE_FAMILIES),
        "evidenceScale": {"E0": "需求/概念", "E1": "数值/合成验证", "E2": "实验室/原型/标定", "E3": "装置数据/安装调试/交叉验证", "E4": "装置在线/实时/常规使用"},
        "deploymentScale": {"D1": "概念/需求", "D2": "软件或实验室原型", "D3": "安装/联调/回放/影子/HIL", "D4": "常规装置工作流", "D5": "经治理批准的安全/保护关键用途"},
        "statistics": stats,
        "entries": works,
    }
    device_payload = {"schemaVersion": "1.0", "asOf": as_of, "statistics": {"total": len(devices)}, "devices": devices}

    json_dump(site_dir / "public/data/fusion-diagnostics-landscape.json", landscape)
    json_dump(site_dir / "public/data/fusion-diagnostics-device-profiles.json", device_payload)
    write_csv(site_dir / "public/fusion-diagnostics-paper-code-index.csv", works)
    write_bib(site_dir / "public/fusion-diagnostics-references.bib", works)
    write_ts(site_dir / "app/diagnostics/diagnosticsResearch.ts", works, devices)
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

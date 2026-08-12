from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any


DOMAIN_ORDER = [
    "physics",
    "engineering",
    "control",
    "diagnostics",
    "energy",
    "auxiliary",
    "data",
    "hmi",
    "integration",
]

DOMAIN_ALIASES = {
    "physics": "physics",
    "物理": "physics",
    "物理模拟": "physics",
    "工程": "engineering",
    "engineering": "engineering",
    "工程仿真": "engineering",
    "控制": "control",
    "control": "control",
    "集成控制": "control",
    "诊断": "diagnostics",
    "diagnostics": "diagnostics",
    "智能诊断": "diagnostics",
    "能量转化": "energy",
    "energy": "energy",
    "energy conversion": "energy",
    "辅机": "auxiliary",
    "auxiliary": "auxiliary",
    "辅机模拟": "auxiliary",
    "数据": "data",
    "data": "data",
    "数据基座": "data",
    "人机交互": "hmi",
    "hmi": "hmi",
    "human-machine interaction": "hmi",
    "总体集成": "integration",
    "integration": "integration",
    "whole-plant integration": "integration",
}

CODE_STATUS_ALIASES = {
    "official-direct": "official-direct",
    "official-enabling": "official-enabling",
    "commercial-enabling": "commercial-enabling",
    "commercial": "commercial-enabling",
    "commercial-software": "commercial-enabling",
    "community-reproduction": "community-reproduction",
    "not-public": "not-public",
    "unavailable": "not-public",
    "未公开": "not-public",
}

EVIDENCE_RANK = {"E0": 0, "E1": 1, "E2": 2, "E3": 3, "E4": 4}
DEPLOYMENT_RANK = {"D1": 1, "D2": 2, "D3": 3, "D4": 4, "D5": 5}


def load_entries(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        return payload
    for key in ("entries", "items", "records", "works"):
        if isinstance(payload.get(key), list):
            return payload[key]
    raise ValueError(f"Unsupported JSON structure: {path}")


def derive_evidence_level(entry: dict[str, Any]) -> str:
    declared = str(entry.get("evidenceLevel", "")).upper()
    if declared in EVIDENCE_RANK:
        return declared
    text = " ".join(
        str(entry.get(key, ""))
        for key in ("evidence", "maturity", "limitations", "approach")
    ).lower()
    if any(token in text for token in ("closed-loop", "装置闭环", "闭环实验", "直接控制", "actuator")):
        return "E4"
    if any(token in text for token in ("hardware-in-the-loop", "hardware in the loop", "hil", "影子模式", "实时部署", "控制系统部署")):
        return "E3"
    if any(token in text for token in ("实验数据", "装置数据", "放电数据", "shots", "shot data", "离线验证")):
        return "E2"
    if any(token in text for token in ("仿真", "模拟数据", "数值验证", "合成数据", "concept design", "概念设计")):
        return "E1"
    return "E0"


def normalized_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def stringify(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, list):
        parts = [stringify(item) for item in value]
        return "；".join(part for part in parts if part)
    if isinstance(value, dict):
        preferred = []
        for key in ("status", "basis", "availability", "formats", "ai_readiness", "claim", "level"):
            if key in value and value[key] not in (None, "", []):
                preferred.append(stringify(value[key]))
        if preferred:
            return "；".join(part for part in preferred if part)
        return "；".join(f"{key}：{stringify(item)}" for key, item in value.items() if item not in (None, "", []))
    return str(value)


def normalize_domain(value: Any, *, entry_id: Any, field_name: str) -> str:
    raw_domain = str(value or "").strip()
    domain = DOMAIN_ALIASES.get(raw_domain, DOMAIN_ALIASES.get(raw_domain.lower()))
    if domain not in DOMAIN_ORDER:
        raise ValueError(f"Unknown {field_name} {raw_domain!r} in {entry_id}")
    return domain


def normalize_entry(entry: dict[str, Any]) -> dict[str, Any]:
    entry_id = str(entry["id"])
    legacy_domain = normalize_domain(
        entry.get("domain") or entry.get("primaryDomain"),
        entry_id=entry_id,
        field_name="domain",
    )
    primary_domain = normalize_domain(
        entry.get("primaryDomain") or entry.get("domain"),
        entry_id=entry_id,
        field_name="primaryDomain",
    )
    related_domains: list[str] = []
    raw_related_domains = normalized_list(entry.get("relatedDomains"))
    if legacy_domain != primary_domain:
        raw_related_domains.insert(0, legacy_domain)
    for related in raw_related_domains:
        normalized = normalize_domain(related, entry_id=entry_id, field_name="relatedDomains")
        if normalized != primary_domain and normalized not in related_domains:
            related_domains.append(normalized)

    project_id = str(entry.get("projectId") or entry_id).strip()
    if not project_id:
        project_id = entry_id

    code_records = []
    for code in normalized_list(entry.get("code")):
        if isinstance(code, str):
            code = {"name": code, "url": None, "status": "not-public", "relationship": "未提供对应实现链接。"}
        status = CODE_STATUS_ALIASES.get(str(code.get("status", "not-public")).lower(), "not-public")
        record = {
            "name": str(code.get("name") or "对应实现未公开"),
            "url": code.get("url") or None,
            "status": status,
            "relationship": str(code.get("relationship") or "未说明与论文的对应关系。"),
        }
        if code.get("artifactType") not in (None, ""):
            record["artifactType"] = str(code["artifactType"])
        if code.get("access") not in (None, ""):
            record["access"] = str(code["access"])
        code_records.append(record)
    if not code_records:
        code_records = [
            {
                "name": "对应实现未公开",
                "url": None,
                "status": "not-public",
                "relationship": "检索范围内未发现可确认与该研究直接对应的公开仓库。",
            }
        ]

    papers = []
    for paper in normalized_list(entry.get("papers")):
        if not isinstance(paper, dict) or not paper.get("url"):
            continue
        record = {
            "title": str(paper.get("title") or entry.get("title") or "原始论文"),
            "year": int(paper.get("year") or entry.get("year") or date.today().year),
            "venue": str(paper.get("venue") or "原始来源"),
            "url": str(paper["url"]),
        }
        if paper.get("sourceType") not in (None, ""):
            record["sourceType"] = str(paper["sourceType"])
        papers.append(record)
    if not papers:
        for source in normalized_list(entry.get("evidence")):
            if isinstance(source, dict) and source.get("url"):
                record = {
                    "title": stringify(source.get("claim")) or f"{entry.get('title')}：官方证据来源",
                    "year": int(entry.get("year") or date.today().year),
                    "venue": "官方项目 / 机构来源（非同行评审论文）",
                    "url": str(source["url"]),
                    "sourceType": str(source.get("sourceType") or "official-source"),
                }
                papers.append(record)
    if not papers:
        raise ValueError(f"No primary paper/source URL for {entry.get('id')}")

    return {
        "id": entry_id,
        "projectId": project_id,
        "domain": primary_domain,
        "primaryDomain": primary_domain,
        "relatedDomains": related_domains,
        "title": str(entry["title"]),
        "year": int(entry["year"]),
        "organization": stringify(entry.get("organization")) or "未注明",
        "problem": stringify(entry.get("problem")) or "未注明",
        "approach": stringify(entry.get("approach")) or "未注明",
        "devices": [str(value) for value in normalized_list(entry.get("devices"))] or ["未限定 / 未注明"],
        "evidenceLevel": derive_evidence_level(entry),
        "evidence": stringify(entry.get("evidence")) or "尚无足够公开验证信息。",
        "papers": papers,
        "code": code_records,
        "data": stringify(entry.get("data")) or "未说明或未公开。",
        "maturity": stringify(entry.get("maturity")) or "研究原型。",
        "limitations": stringify(entry.get("limitations")) or "公开材料不足，需独立复核适用域与误差。",
        "tags": [str(value) for value in normalized_list(entry.get("tags"))],
        **({"parentProjectId": str(entry["parentProjectId"])} if entry.get("parentProjectId") else {}),
        **({"deploymentLevel": str(entry["deploymentLevel"]).upper()} if entry.get("deploymentLevel") else {}),
        **({"applicabilityLevel": entry["applicabilityLevel"]} if entry.get("applicabilityLevel") else {}),
    }


def merge_unique_records(records: list[dict[str, Any]], identity: str) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    for record in records:
        key = str(record.get(identity) or "").strip()
        if not key:
            key = json.dumps(record, ensure_ascii=False, sort_keys=True)
        if key in seen:
            continue
        seen.add(key)
        merged.append(record)
    return merged


def merge_project_entries(project_entries: list[dict[str, Any]]) -> dict[str, Any]:
    referenced_parent_ids = {
        item["parentProjectId"] for item in project_entries if item.get("parentProjectId")
    }
    canonical = min(
        project_entries,
        key=lambda item: (
            0 if item["id"] in referenced_parent_ids else 1,
            0 if not item.get("parentProjectId") else 1,
            -EVIDENCE_RANK[item["evidenceLevel"]],
            -DEPLOYMENT_RANK.get(item.get("deploymentLevel", ""), 0),
            -item["year"],
            item["id"],
        ),
    )
    merged = dict(canonical)

    domain_associations: list[str] = []
    for item in project_entries:
        for domain in (item["primaryDomain"], *item["relatedDomains"]):
            if domain not in domain_associations:
                domain_associations.append(domain)
    merged["domain"] = canonical["primaryDomain"]
    merged["primaryDomain"] = canonical["primaryDomain"]
    merged["relatedDomains"] = [
        domain for domain in domain_associations if domain != merged["primaryDomain"]
    ]

    merged["devices"] = list(dict.fromkeys(
        device for item in project_entries for device in item["devices"]
    ))
    merged["tags"] = list(dict.fromkeys(
        tag for item in project_entries for tag in item["tags"]
    ))
    merged["papers"] = merge_unique_records(
        [paper for item in project_entries for paper in item["papers"]], "url"
    )
    merged["code"] = merge_unique_records(
        [code for item in project_entries for code in item["code"]], "url"
    )
    merged["evidenceLevel"] = max(
        (item["evidenceLevel"] for item in project_entries), key=EVIDENCE_RANK.__getitem__
    )
    deployment_levels = [
        item["deploymentLevel"] for item in project_entries if item.get("deploymentLevel")
    ]
    if deployment_levels:
        merged["deploymentLevel"] = max(
            deployment_levels, key=lambda level: DEPLOYMENT_RANK.get(level, 0)
        )
    return merged


def deduplicate(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_project: dict[str, list[dict[str, Any]]] = {}
    project_by_id: dict[str, str] = {}
    for entry in entries:
        normalized = normalize_entry(entry)
        previous_project = project_by_id.get(normalized["id"])
        if previous_project and previous_project != normalized["projectId"]:
            raise ValueError(
                f"Duplicate id {normalized['id']} assigned to multiple projects: "
                f"{previous_project}, {normalized['projectId']}"
            )
        project_by_id[normalized["id"]] = normalized["projectId"]
        by_project.setdefault(normalized["projectId"], []).append(normalized)
    unique_projects = [merge_project_entries(group) for group in by_project.values()]
    return sorted(
        unique_projects,
        key=lambda item: (
            DOMAIN_ORDER.index(item["primaryDomain"]),
            -EVIDENCE_RANK[item["evidenceLevel"]],
            -item["year"],
            item["title"],
        ),
    )


def write_typescript(path: Path, entries: list[dict[str, Any]]) -> None:
    metadata = """export type AIDomain = 'physics' | 'engineering' | 'control' | 'diagnostics' | 'energy' | 'auxiliary' | 'data' | 'hmi' | 'integration';
export type AICodeStatus = 'official-direct' | 'official-enabling' | 'commercial-enabling' | 'community-reproduction' | 'not-public';
export type AIEvidenceLevel = 'E0' | 'E1' | 'E2' | 'E3' | 'E4';
export type AIDeploymentLevel = 'D1' | 'D2' | 'D3' | 'D4' | 'D5';

export interface AIResearchItem {
  id: string;
  projectId?: string;
  parentProjectId?: string;
  domain: AIDomain;
  primaryDomain?: AIDomain;
  relatedDomains?: AIDomain[];
  title: string;
  year: number;
  organization: string;
  problem: string;
  approach: string;
  devices: string[];
  evidenceLevel: AIEvidenceLevel;
  evidence: string;
  papers: { title: string; year: number; venue: string; url: string; sourceType?: string }[];
  code: { name: string; url: string | null; status: AICodeStatus; relationship: string; artifactType?: string; access?: string }[];
  data: string;
  maturity: string;
  limitations: string;
  tags: string[];
  deploymentLevel?: AIDeploymentLevel;
  applicabilityLevel?: string;
}

export const domainMeta: Record<AIDomain, { index: string; label: string; short: string; en: string; color: string }> = {
  physics: { index: '01', label: '物理模拟', short: '物理', en: 'PHYSICS', color: '#ff8738' },
  engineering: { index: '02', label: '工程仿真', short: '工程', en: 'ENGINEERING', color: '#f5b65d' },
  control: { index: '03', label: '集成控制', short: '控制', en: 'INTEGRATED CONTROL', color: '#65e6d2' },
  diagnostics: { index: '04', label: '诊断感知', short: '诊断', en: 'DIAGNOSTICS & SENSING', color: '#68c7ff' },
  energy: { index: '05', label: '能量转化', short: '能量', en: 'ENERGY CONVERSION', color: '#ffd166' },
  auxiliary: { index: '06', label: '辅机模拟', short: '辅机', en: 'AUXILIARY SYSTEMS', color: '#9fe0c2' },
  data: { index: '07', label: '数据基座', short: '数据', en: 'DATA FOUNDATION', color: '#9da7ff' },
  hmi: { index: '08', label: '人机交互', short: '人机', en: 'HUMAN–MACHINE', color: '#c69cff' },
  integration: { index: '09', label: '总体集成', short: '集成', en: 'WHOLE-PLANT', color: '#ef7fd0' },
};

export const codeStatusMeta: Record<AICodeStatus, { label: string; description: string }> = {
  'official-direct': { label: '官方对应实现', description: '论文作者或项目方公开、与该工作直接对应的代码或权重。' },
  'official-enabling': { label: '官方使能工具', description: '官方仓库可支撑复现流程，但不是论文模型的完整对应实现。' },
  'commercial-enabling': { label: '商业使能软件', description: '商业或专有软件支撑该工作；不代表论文模型、配置与训练资产已公开。' },
  'community-reproduction': { label: '社区复现', description: '第三方复现或相近实现，必须与论文原始实现区分。' },
  'not-public': { label: '未公开', description: '未发现可确认的公开对应代码，或仅存在闭源/内部实现。' },
};

export const deploymentMeta: Record<AIDeploymentLevel, { label: string; description: string }> = {
  D1: { label: '概念 / 路线', description: '概念、需求或技术路线层级，尚未形成可复核原型。' },
  D2: { label: '离线研究原型', description: '形成离线算法或研究原型，尚未进入装置运行链。' },
  D3: { label: '装置试点', description: '基于装置数据验证，或进入实时、影子、HIL及运行试点。' },
  D4: { label: '正式运行', description: '进入正式工作流、生产服务或装置常规使用。' },
  D5: { label: '安全关键 / 电厂持续运行', description: '承担安全关键在线功能或电厂级持续运行，并有相应批准、治理与全生命周期保障。' },
};

export const evidenceMeta: Record<AIEvidenceLevel, { label: string; description: string }> = {
  E0: { label: '概念 / 方法', description: '提出方法、架构或计划，尚无充分数值或装置证据。' },
  E1: { label: '仿真验证', description: '在高保真、综合或合成数据环境中验证。' },
  E2: { label: '装置离线数据', description: '使用真实装置历史数据开展训练或独立测试。' },
  E3: { label: '实时 / HIL / 影子', description: '进入实时系统、硬件在环或影子运行，但未直接闭环控制装置。' },
  E4: { label: '装置闭环实验', description: '在真实聚变装置中闭环影响执行器或实验轨迹。' },
};

"""
    serialized = json.dumps(entries, ensure_ascii=False, indent=2)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(metadata + f"export const aiResearchItems: AIResearchItem[] = {serialized};\n", encoding="utf-8")


def write_csv(path: Path, entries: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "id", "projectId", "parentProjectId", "domain", "primaryDomain", "relatedDomains",
                "deploymentLevel", "title", "year", "organization", "problem", "approach",
                "devices", "evidenceLevel", "evidence", "paper_titles", "paper_urls",
                "paper_source_types", "code_names", "code_urls", "code_statuses",
                "code_artifact_types", "code_access", "data", "maturity", "limitations", "tags",
            ],
        )
        writer.writeheader()
        for entry in entries:
            writer.writerow(
                {
                    **{key: entry.get(key, "") for key in writer.fieldnames},
                    "relatedDomains": " | ".join(entry.get("relatedDomains", [])),
                    "devices": " | ".join(entry["devices"]),
                    "paper_titles": " | ".join(paper["title"] for paper in entry["papers"]),
                    "paper_urls": " | ".join(paper["url"] for paper in entry["papers"]),
                    "paper_source_types": " | ".join(paper.get("sourceType", "") for paper in entry["papers"]),
                    "code_names": " | ".join(code["name"] for code in entry["code"]),
                    "code_urls": " | ".join(code["url"] or "" for code in entry["code"]),
                    "code_statuses": " | ".join(code["status"] for code in entry["code"]),
                    "code_artifact_types": " | ".join(code.get("artifactType", "") for code in entry["code"]),
                    "code_access": " | ".join(code.get("access", "") for code in entry["code"]),
                    "tags": " | ".join(entry["tags"]),
                }
            )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--research-dir", type=Path, required=True)
    parser.add_argument("--site-dir", type=Path, required=True)
    parser.add_argument(
        "--as-of",
        help="ISO edition date. Defaults to research/ai-native/manifest.json, then today.",
    )
    parser.add_argument(
        "--outputs-dir",
        type=Path,
        help="Optional directory for archival Chinese-named JSON/CSV copies.",
    )
    args = parser.parse_args()

    manifest_path = args.research_dir.parent / "manifest.json"
    manifest: dict[str, Any] = {}
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        source_names = manifest.get("sources")
        if not isinstance(source_names, list) or not source_names:
            raise ValueError(f"Manifest must contain a non-empty sources list: {manifest_path}")
    else:
        source_names = [
            "core_control_diagnostics.json",
            "engineering_energy_aux.json",
            "data_hmi_integration.json",
            "root_curated.json",
        ]

    research_root = args.research_dir.resolve()
    source_paths: list[Path] = []
    for source_name in source_names:
        source_path = (args.research_dir / str(source_name)).resolve()
        if not source_path.is_relative_to(research_root):
            raise ValueError(f"Source escapes research directory: {source_name}")
        source_paths.append(source_path)

    as_of = str(args.as_of or manifest.get("asOf") or date.today().isoformat())
    date.fromisoformat(as_of)
    raw_entries: list[dict[str, Any]] = []
    for path in source_paths:
        raw_entries.extend(load_entries(path))
    entries = deduplicate(raw_entries)

    payload = {
        "schemaVersion": "1.1",
        "asOf": as_of,
        "scope": "Fusion AI-native research landscape across nine FusionDigital knowledge domains",
        "evidenceLevels": {
            "E0": "概念/方法",
            "E1": "仿真/合成数据",
            "E2": "真实装置离线数据",
            "E3": "实时系统/影子/HIL",
            "E4": "真实装置闭环实验",
        },
        "entries": entries,
        "statistics": {
            "total": len(entries),
            "uniqueProjects": len({entry["projectId"] for entry in entries}),
            "domains": dict(Counter(entry["primaryDomain"] for entry in entries)),
            "domainAssociations": dict(Counter(
                domain
                for entry in entries
                for domain in (entry["primaryDomain"], *entry["relatedDomains"])
            )),
            "evidence": dict(Counter(entry["evidenceLevel"] for entry in entries)),
            "code": dict(Counter(code["status"] for entry in entries for code in entry["code"])),
        },
    }

    public_json = args.site_dir / "public" / "data" / "fusion-ai-native-landscape.json"
    public_json.parent.mkdir(parents=True, exist_ok=True)
    public_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    write_typescript(args.site_dir / "app" / "ai" / "aiResearch.ts", entries)
    write_csv(args.site_dir / "public" / "fusion-ai-native-paper-code-index.csv", entries)

    if args.outputs_dir:
        args.outputs_dir.mkdir(parents=True, exist_ok=True)
        output_json = args.outputs_dir / "聚变智能原生研究图谱.json"
        output_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        write_csv(args.outputs_dir / "聚变智能原生论文与代码索引.csv", entries)

    print(json.dumps(payload["statistics"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

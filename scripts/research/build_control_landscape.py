from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any


TASK_META = {
    "T0": {"label": "状态估计与实时诊断", "en": "STATE ESTIMATION & REAL-TIME DIAGNOSTICS", "role": "cross-cutting"},
    "T1": {"label": "启动、电流与磁通控制", "en": "START-UP, CURRENT & FLUX CONTROL", "role": "control-task"},
    "T2": {"label": "位置、位形与边界控制", "en": "POSITION, SHAPE & BOUNDARY CONTROL", "role": "control-task"},
    "T3": {"label": "剖面与场景控制", "en": "PROFILE & SCENARIO CONTROL", "role": "control-task"},
    "T4": {"label": "稳定性与约束模式控制", "en": "STABILITY & CONFINEMENT CONTROL", "role": "control-task"},
    "T5": {"label": "排热、粒子与等离子体-壁控制", "en": "EXHAUST, PARTICLE & PLASMA-WALL CONTROL", "role": "control-task"},
    "T6": {"label": "性能、功率与燃烧控制", "en": "PERFORMANCE, POWER & BURN CONTROL", "role": "control-task"},
    "T7": {"label": "失稳避免、安全终止与保护接口", "en": "DISRUPTION AVOIDANCE, TERMINATION & PROTECTION", "role": "control-task"},
    "T8": {"label": "多执行器协调与集成控制", "en": "MULTI-ACTUATOR & INTEGRATED CONTROL", "role": "control-task"},
    "T9": {"label": "PCS、脉冲编排与验证基础设施", "en": "PCS, PULSE ORCHESTRATION & V&V", "role": "cross-cutting"},
}

EVIDENCE_META = {
    "E0": "概念、要求或无定量结果的方法建议。",
    "E1": "数值、合成数据或控制器—模型闭环验证。",
    "E2": "历史放电回放、真实装置离线数据或独立模型比较。",
    "E3": "实时、SIL/HIL、影子运行或在线建议，但未直接闭环影响装置。",
    "E4": "真实聚变装置闭环实验；不自动等于安全关键部署。",
}

DEPLOYMENT_META = {
    "D1": "研究代码、概念或算法原型。",
    "D2": "装置离线工作流、控制设计或场景开发工具。",
    "D3": "实时基础设施、SIL/HIL、回放或影子试点。",
    "D4": "装置正式实验工作流中的常规在线或闭环使用。",
    "D5": "经治理批准的保护/安全关键用途；必须有明确原始证据。",
}

CODE_STATUS = {
    "official-direct",
    "official-enabling",
    "commercial-enabling",
    "community-reproduction",
    "not-public",
}

D5_GOVERNANCE_TOKENS = (
    "经治理批准", "治理批准", "正式批准", "正式质量保证", "运行前正式质量保证",
    "formal quality assurance", "safety qualification", "qualified safety", "安全资格", "认证批准",
)

TASK_KEYWORDS = [
    ("T7", ("失稳避免", "安全终止", "破裂", "disruption", "vde", "保护接口", "机器保护", "异常预测", "异常处置", "machineprotection", "缓解触发")),
    ("T5", ("排热", "热负荷", "脱靶", "偏滤器", "辐射控制", "辐射功率", "plasma-wall", "heatload", "detachment", "粒子与", "钨积累")),
    ("T4", ("不稳定性", "稳定性与约束", "mhd", "ntm", "rwm", "elm", "锯齿", "sawtooth", "误差场", "alfv")),
    ("T0", ("状态估计", "平衡重建", "实时诊断", "observer", "estimation", "rtefit", "rt-efit", "软测量")),
    ("T2", ("位形", "形状", "边界", "垂直稳定", "位置控制", "strikepoint", "x点", "isoflux")),
    ("T3", ("剖面", "场景控制", "密度控制", "温度控制", "安全因子", "qprofile", "currentprofile", "rotationprofile")),
    ("T6", ("燃烧", "聚变功率", "融合功率", "功率", "性能控制", "储能", "中子率", "powercontrol", "burncontrol", "betacontrol", "β控制")),
    ("T8", ("多执行器", "执行器分配", "执行器管理", "控制集成", "集成控制", "actuatormanager", "actuatorallocation", "协调控制", "supervisor", "权限仲裁", "多变量")),
    ("T1", ("启动", "击穿", "电流爬升", "磁通管理", "环电压", "breakdown", "ramp-up", "currentramp")),
    ("T9", ("pcs", "实时系统", "controlsystem", "控制系统", "框架", "基础设施", "编排", "验证", "codac", "marte")),
]

TASK_ALIASES = {
    "启动、等离子体电流与磁通管理": "T1",
    "垂直稳定、位置、边界与先进偏滤器位形": "T2",
    "平衡重建、剖面观测器与状态估计服务": "T0",
    "电流/安全因子、温度、密度、旋转与压力剖面控制": "T3",
    "燃烧、非感应场景与多执行器协调": "T6",
    # Protection/power source categories that cannot be classified reliably by
    # a substring such as “控制” or “异常”.  Keep these explicit so a new,
    # unknown primary category cannot silently become T9.
    "锁模控制": "T4",
    "异常监督控制": "T7",
    "热事件检测": "T0",
    "密度/粒子控制": "T5",
    "约束模式识别": "T0",
    "异常处理验证": "T9",
    "异常处理架构": "T7",
    # PCS/framework source categories.  These are intentionally explicit:
    # task-specific models remain under their physical task, while platforms,
    # lifecycle tooling and interoperability stay under T9.
    "生产级PCS": "T9",
    "控制集成方法": "T8",
    "多装置软件复用": "T9",
    "控制验证平台": "T9",
    "PCS演进基线": "T9",
    "实时物理模型": "T0",
    "监督控制": "T8",
    "生产级DCS/PCS": "T9",
    "保护与PCS协同": "T7",
    "PCS现代化": "T9",
    "长脉冲控制": "T8",
    "生产级PCS现代化": "T9",
    "控制开发工具": "T9",
    "长脉冲PCS现代化": "T9",
    "下一代PCS设计": "T9",
    "控制生命周期工程": "T9",
    "装置控制基础设施": "T9",
    "装置级集成控制": "T8",
    "PCS开发与初步验证": "T9",
    "实时数据与控制框架": "T9",
    "在建装置PCS原型": "T9",
    "公开控制设计代码": "T1",
    "官方开源使能框架": "T9",
    "数据与实时集成": "T9",
    "语义互操作": "T9",
    "公开控制设计模型": "T1",
    "论文直接开源实现": "T0",
    "预印本级装置算法证据": "T0",
    "概念/建设阶段需求": "T9",
}


DEVICE_ALIASES = {
    "DIII-D": {"diiid"},
    "TCV": {"tcv"},
    "ASDEX Upgrade": {"asdexupgrade", "aug"},
    "JET": {"jet"},
    "EAST": {"east"},
    "KSTAR": {"kstar"},
    "WEST": {"west"},
    "JT-60SA": {"jt60sa"},
    "ITER": {"iter"},
    "NSTX-U": {"nstxu", "nstxupgrade"},
    "MAST-U": {"mastu", "mastupgrade"},
    "SPARC": {"sparc"},
    "ARC": {"arc"},
    "HL-2A": {"hl2a"},
    "HL-2M": {"hl2m"},
    "J-TEXT": {"jtext"},
    "EXL-50 / EXL-50U": {"exl50", "exl50u", "exl50exl50u"},
    "EHL-2": {"ehl2"},
    "CFETR": {"cfetr", "cfetr设计"},
    "RFX-mod / RFX-mod2": {"rfxmod", "rfxmod2", "rfxmodrfxmod2"},
}


# Some device-profile sources describe concrete I/O in prose while the linked
# framework paper does not expose structured sensor/actuator arrays.  Preserve
# those source-backed interfaces explicitly instead of inventing empty fields.
DEVICE_INTERFACE_DEFAULTS = {
    "HL-2A": {
        "sensors": ["实时破裂预测特征（磁、密度与辐射等；完整通道清单未公开）"],
        "actuators": ["MGI/SMBI缓解触发"],
    },
    "HL-2M": {
        "sensors": ["磁探针与磁通环", "线圈与电源状态"],
        "actuators": ["PF线圈电源", "快速垂直稳定电源"],
    },
    "J-TEXT": {
        "sensors": ["磁、密度、辐射与MHD实时信号"],
        "actuators": ["线圈与电源", "气体及实验专用执行器接口"],
    },
    "RFX-mod / RFX-mod2": {
        "sensors": ["高速磁I/O", "RAPTOR状态与剖面观测量"],
        "actuators": ["多输入多输出磁控制线圈（装置专用控制矩阵）"],
    },
    "SPARC": {
        "sensors": ["规划中的磁、平衡、辐射、PFC与机器状态量"],
        "actuators": ["规划中的线圈、加热/加料与终止接口（待投运验证）"],
    },
}


PROJECT_ID_OVERRIDES = {
    "CTL-CORE-015": "mast-u-super-x-exhaust-control",
    "CPT-032": "mast-u-super-x-exhaust-control",
    "CPT-020": "samone-supervisory-control",
    "PCS-008": "samone-supervisory-control",
}

PRIMARY_TASK_OVERRIDES = {
    "CTL-CORE-015": "T5",
    "CPT-032": "T5",
    # SAMONE is primarily the T8 supervisory/actuator-management layer; its
    # off-normal handling and PCS hosting remain explicit related tasks.
    "CPT-020": "T8",
    "PCS-008": "T8",
}

RELATED_TASK_OVERRIDES = {
    "CTL-CORE-015": ["T2"],
    "CPT-032": ["T2"],
    "CPT-020": ["T7", "T9"],
    "PCS-008": ["T7", "T9"],
    "PCS-039": ["T2", "T9"],
    "PCS-040": ["T2", "T7"],
}

TITLE_OVERRIDES = {
    "CTL-CORE-015": (
        "MAST-U Super-X 偏滤器瞬态排热闭环控制",
        "Demonstration of Super-X divertor exhaust control for transient heat-load management",
    ),
    "CPT-032": (
        "MAST-U Super-X 偏滤器瞬态排热闭环控制",
        "Demonstration of Super-X divertor exhaust control for transient heat-load management",
    ),
    "CPT-020": (
        "TCV SAMONE 实时异常监督与执行器管理",
        "SAMONE real-time off-normal supervision and actuator management on TCV",
    ),
    "PCS-008": (
        "TCV SAMONE 实时异常监督与执行器管理",
        "SAMONE real-time off-normal supervision and actuator management on TCV",
    ),
}


# Six device references are not duplicated verbatim in the work catalogue.
# Their metadata is fixed here so rebuilding remains deterministic and does not
# depend on Crossref availability.  All other device papers are enriched from
# the normalized work-paper index below.
DEVICE_PAPER_METADATA = {
    "https://www.cambridge.org/core/services/aop-cambridge-core/content/view/b472b3a64ef71da1899b9efb65d7c390/s0022377826101706a.pdf/overview_of_the_physics_basis_for_the_arc_fusion_power_plant.pdf": {
        "title": "Overview of the physics basis for the ARC fusion power plant",
        "authors": "J. C. Hillesheim, A. J. Creely, T. H. Eich, N. T. Howard, N. Leuthold et al.",
        "year": 2026,
        "venue": "Journal of Plasma Physics 92, E69",
        "doi": "10.1017/S0022377826101706",
        "sourceType": "peer-reviewed journal article",
    },
    "https://pure.mpg.de/pubman/faces/viewitemoverviewpage.jsp?itemid=item_2132788": {
        "title": "Fenix—ASDEX Upgrade's flight simulator",
        "authors": "W. Treutterer, E. Fable, A. Gräter, F. Janky, O. Kudlacek et al.",
        "year": 2019,
        "venue": "Fusion Engineering and Design 146, 1073–1076",
        "doi": "10.1016/j.fusengdes.2019.02.008",
        "sourceType": "peer-reviewed journal article",
    },
    "https://doi.org/10.1016/j.fusengdes.2021.112876": {
        "title": "Preliminary design of real-time plasma control system for CFETR",
        "authors": "Q. Yuan, H. Guo, L. Yan, Z. Huang, J. Huang, B. Xiao, Y. Zheng, R. Zhang and Z. Luo",
        "year": 2021,
        "venue": "Fusion Engineering and Design 173, 112876",
        "doi": "10.1016/j.fusengdes.2021.112876",
        "sourceType": "peer-reviewed journal article",
    },
    "https://pst.hfcas.ac.cn/article/cstr/32219.14.2058-6272/ad9e8f": {
        "title": "Strategy and experimental progress of the EXL-50U spherical torus in support of the EHL-2 project",
        "authors": "Y. Shi, X. Song, D. Guo, X. Jiang, X. Gu et al. and the EXL-50U Team",
        "year": 2025,
        "venue": "Plasma Science and Technology 27, 024003",
        "doi": "10.1088/2058-6272/ad9e8f",
        "sourceType": "peer-reviewed journal article",
    },
    "https://doi.org/10.1016/j.fusengdes.2022.113223": {
        "title": "Real-time disruption prediction and mitigation on HL-2A",
        "authors": "Z. Yang, F. Xia, X. Song, Z. Gao, Y. Li, X. Gong, Y. Dong, Y. Zhang, C. Chen et al.",
        "year": 2022,
        "venue": "Fusion Engineering and Design 182, 113223",
        "doi": "10.1016/j.fusengdes.2022.113223",
        "sourceType": "peer-reviewed journal article",
    },
    "https://doi.org/10.1109/tns.2016.2518709": {
        "title": "JRTF: A flexible software framework for real-time control in magnetic confinement nuclear fusion experiments",
        "authors": "M. Zhang, G. Z. Zheng, W. Zheng, Z. Chen, T. Yuan and C. Yang",
        "year": 2016,
        "venue": "IEEE Transactions on Nuclear Science 63, 1070–1075",
        "doi": "10.1109/TNS.2016.2518709",
        "sourceType": "peer-reviewed journal article",
    },
}


def as_list(value: Any) -> list[Any]:
    if value in (None, ""):
        return []
    return value if isinstance(value, list) else [value]


def text(value: Any) -> str:
    if value in (None, ""):
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, list):
        return "；".join(part for item in value if (part := text(item)))
    if isinstance(value, dict):
        preferred = ["name", "fit", "validation", "status", "basis", "description", "claim"]
        parts = [text(value.get(key)) for key in preferred if value.get(key) not in (None, "", [])]
        if parts:
            return "：".join(parts)
        return "；".join(f"{key}：{text(item)}" for key, item in value.items() if item not in (None, "", []))
    return str(value)


def unique_strings(values: list[Any]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        item = text(value)
        if item and item not in seen:
            seen.add(item)
            result.append(item)
    return result


def load_records(path: Path, keys: tuple[str, ...]) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        return payload
    for key in keys:
        if isinstance(payload.get(key), list):
            return payload[key]
    raise ValueError(f"Unsupported JSON envelope: {path}")


def task_from_text(value: Any, *, fallback: str = "") -> str:
    raw = text(value).strip()
    upper = raw.upper()
    if upper in TASK_META:
        return upper
    if raw in TASK_ALIASES:
        return TASK_ALIASES[raw]
    compact = re.sub(r"\s+", "", raw.lower())
    for task, tokens in TASK_KEYWORDS:
        if any(token in compact for token in tokens):
            return task
    return fallback


def tasks_mentioned(value: Any) -> list[str]:
    compact = re.sub(r"\s+", "", text(value).lower())
    return [task for task, tokens in TASK_KEYWORDS if any(token in compact for token in tokens)]


def normalize_task_list(values: Any, primary: str) -> list[str]:
    result: list[str] = []
    for raw in as_list(values):
        task = task_from_text(raw, fallback="")
        if task in TASK_META and task != primary and task not in result:
            result.append(task)
    return result


def normalize_devices(value: Any) -> list[str]:
    devices: list[str] = []
    for item in as_list(value):
        if isinstance(item, dict):
            name = text(item.get("name") or item.get("device") or item.get("id"))
            details = unique_strings([item.get("fit"), item.get("validation"), item.get("role")])
            rendered = f"{name}：{'；'.join(details)}" if name and details else name
        else:
            rendered = text(item)
        if rendered and rendered not in devices:
            devices.append(rendered)
    return devices or ["未限定 / 未注明"]


def normalized_url(value: Any) -> str:
    return text(value).strip().rstrip("/").lower()


def canonical_doi(value: Any, url: Any = None) -> str | None:
    raw = text(value).strip()
    if not raw:
        match = re.search(r"https?://(?:dx\.)?doi\.org/(?P<doi>10\.[^?#\s]+)", text(url), flags=re.IGNORECASE)
        raw = match.group("doi") if match else ""
    raw = re.sub(r"^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)", "", raw, flags=re.IGNORECASE).strip()
    return raw or None


def paper_key(paper: dict[str, Any]) -> str:
    return paper_keys(paper)[0]


def paper_keys(paper: dict[str, Any]) -> list[str]:
    """Return DOI and URL identities so profiles can match either form."""
    keys: list[str] = []
    doi = canonical_doi(paper.get("doi"), paper.get("url"))
    url = normalized_url(paper.get("url"))
    if doi:
        keys.append(f"doi:{doi.lower()}")
    if url:
        keys.append(f"url:{url}")
    return keys or [f"title:{title_key(paper.get('title'))}"]


def title_key(value: Any) -> str:
    return re.sub(r"[^a-z0-9\u3400-\u4dbf\u4e00-\u9fff]+", "", text(value).lower())


def metadata_score(paper: dict[str, Any]) -> int:
    score = 0
    if int(paper.get("year") or 0) > 0:
        score += 3
    if text(paper.get("authors")) not in {"", "未完整列出", "见原始来源"}:
        score += 3
    if text(paper.get("venue")) not in {"", "原始论文 / 官方来源", "peer-reviewed", "primary-source"}:
        score += 2
    if canonical_doi(paper.get("doi"), paper.get("url")):
        score += 2
    if text(paper.get("sourceType")) not in {"", "primary-source"}:
        score += 1
    return score


def paper_priority(paper: dict[str, Any]) -> tuple[int, int, str]:
    """Order formal publications before preprints while retaining both."""
    source_type = text(paper.get("sourceType")).lower()
    is_preprint = "preprint" in source_type or "arxiv" in normalized_url(paper.get("url"))
    is_peer_reviewed = "peer-reviewed" in source_type and not is_preprint
    return (0 if is_peer_reviewed else 1 if not is_preprint else 2, -int(paper.get("year") or 0), title_key(paper.get("title")))


def normalize_papers(entry: dict[str, Any]) -> list[dict[str, Any]]:
    papers: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in as_list(entry.get("papers") or entry.get("publications") or entry.get("sources")):
        if not isinstance(raw, dict):
            continue
        url = text(raw.get("url") or raw.get("link"))
        title = text(raw.get("title") or raw.get("name") or entry.get("title_zh") or entry.get("title"))
        if not url or not title:
            continue
        doi = canonical_doi(raw.get("doi"), url)
        key = f"doi:{doi.lower()}" if doi else f"url:{normalized_url(url)}"
        if key in seen:
            continue
        seen.add(key)
        year_value = raw.get("year") or entry.get("year") or 0
        try:
            year = int(year_value)
        except (TypeError, ValueError):
            year = 0
        papers.append({
            "title": title,
            "authors": text(raw.get("authors")) or "未完整列出",
            "year": year,
            "venue": text(raw.get("venue") or raw.get("journal") or raw.get("type")) or "原始论文 / 官方来源",
            "doi": doi,
            "url": url,
            "sourceType": text(raw.get("sourceType") or raw.get("source_type") or raw.get("type")) or "primary-source",
        })
    return papers


def code_status(raw: dict[str, Any]) -> str:
    name = text(raw.get("name")).lower()
    declared = text(raw.get("status")).lower()
    openness = text(raw.get("openness") or raw.get("access") or raw.get("publicAccess")).lower()
    relationship = text(raw.get("relationship")).lower()
    combined = f"{declared} {openness} {relationship}"
    if name == "freegsnke":
        return "official-enabling"
    if name == "plasma-profile-predictor":
        if any(token in relationship for token in ("直接训练/评估", "直接训练", "direct implementation")):
            return "official-direct"
        return "official-enabling"
    if declared in CODE_STATUS:
        return declared
    if any(token in combined for token in ("paper-direct", "official-direct", "论文对应", "direct implementation")):
        return "official-direct"
    if any(token in combined for token in ("commercial", "proprietary", "闭源", "商业")):
        return "commercial-enabling"
    if any(token in combined for token in ("paper-direct", "official-direct", "direct implementation", "直接对应", "论文直接", "作者团队公开")):
        return "official-direct"
    if any(token in combined for token in ("official-framework", "official open", "official-enabling", "官方框架", "使能")):
        return "official-enabling"
    if any(token in combined for token in ("community", "third-party", "第三方")):
        return "community-reproduction"
    return "not-public"


def normalize_code(entry: dict[str, Any]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in as_list(entry.get("code") or entry.get("software") or entry.get("repositories")):
        if isinstance(raw, str):
            raw = {"name": raw}
        if not isinstance(raw, dict):
            continue
        name = text(raw.get("name")) or "对应实现未公开"
        url = text(raw.get("url") or raw.get("repositoryUrl") or raw.get("repository_url")) or None
        key = (url or name).lower()
        if key in seen:
            continue
        seen.add(key)
        status = code_status(raw)
        if status == "official-direct" and not url:
            status = "not-public"
        if status == "not-public":
            # The URL field is reserved for an actual code/software artifact.
            # Papers, device pages and project posters belong in `papers`; keep
            # the explanatory relationship but do not present them as code.
            url = None
        access = text(raw.get("access") or raw.get("openness") or raw.get("publicAccess"))
        declared_status = text(raw.get("status")).lower()
        if not access and declared_status in {"controlled-access", "restricted"}:
            access = "restricted"
        if not access and declared_status in {"commercial", "commercial-software"}:
            access = "proprietary"
        records.append({
            "name": name,
            "url": url,
            "status": status,
            "relationship": text(raw.get("relationship") or raw.get("note")) or "未说明与论文/装置实现的直接对应关系。",
            "artifactType": text(raw.get("artifactType") or raw.get("artifact_type")) or ("commercial-software" if status == "commercial-enabling" else "software"),
            "access": access or ("public" if status in {"official-direct", "official-enabling", "community-reproduction"} else "not-public"),
            "license": text(raw.get("license")) or "未标注",
        })
    if not records:
        records.append({
            "name": "对应实现未公开",
            "url": None,
            "status": "not-public",
            "relationship": "检索范围内未发现可确认与该工作直接对应的公开仓库。",
            "artifactType": "software",
            "access": "not-public",
            "license": "未公开",
        })
    return records


def normalized_level(value: Any, prefix: str, allowed: set[str]) -> str | None:
    raw = text(value).upper().strip()
    match = re.search(rf"{prefix}[0-9]", raw)
    level = match.group(0) if match else raw
    return level if level in allowed else None


def normalize_work(entry: dict[str, Any], source_file: str) -> dict[str, Any]:
    entry_id = text(entry.get("id"))
    if not entry_id:
        raise ValueError(f"Missing id in {source_file}")
    category = entry.get("primaryTask") or entry.get("primary_task") or entry.get("task_class") or entry.get("category")
    primary = task_from_text(category, fallback="")
    if primary not in TASK_META:
        raise ValueError(
            f"Unmapped primary control category {text(category)!r} in {source_file}:{entry_id}; "
            "use a canonical T0-T9 id or add an explicit TASK_ALIASES entry"
        )
    primary = PRIMARY_TASK_OVERRIDES.get(entry_id, primary)
    title_focus = text(entry.get("titleZh") or entry.get("title_zh") or entry.get("title"))
    if "多执行器协调" in text(category) and "燃烧控制" not in title_focus and any(token in title_focus.lower() for token in ("执行器分配", "执行器管理", "actuator allocation", "actuator management")):
        primary = "T8"
    related_raw = entry.get("relatedTasks") or entry.get("related_tasks") or entry.get("secondaryTasks") or []
    related = normalize_task_list(related_raw, primary)
    # PCS records frequently expose their task relationships as module names.
    for raw in as_list(entry.get("controlModules")):
        task = task_from_text(raw, fallback="")
        if task in TASK_META and task != primary and task not in related:
            related.append(task)
    relationship_text = " ".join(
        [title_focus, text(entry.get("relatedTasks") or entry.get("related_tasks")), text(entry.get("tags"))]
    )
    for inferred in tasks_mentioned(relationship_text):
        if inferred != primary and inferred not in related:
            related.append(inferred)
    for forced in RELATED_TASK_OVERRIDES.get(entry_id, []):
        if forced != primary and forced not in related:
            related.append(forced)

    evidence = normalized_level(entry.get("evidenceLevel") or entry.get("evidence_level"), "E", set(EVIDENCE_META)) or "E0"
    deployment = normalized_level(entry.get("deploymentLevel") or entry.get("deployment_level"), "D", set(DEPLOYMENT_META))
    if deployment == "D5":
        proof = " ".join(text(entry.get(key)).lower() for key in ("validation", "validation_level", "deployment", "key_results", "results"))
        if not any(token in proof for token in D5_GOVERNANCE_TOKENS):
            deployment = "D4"
    if not deployment:
        deployment = {"E0": "D1", "E1": "D2", "E2": "D2", "E3": "D3", "E4": "D4"}[evidence]

    raw_title = entry.get("title")
    nested_title_zh = text(raw_title.get("zh")) if isinstance(raw_title, dict) else ""
    nested_title_en = text(raw_title.get("en")) if isinstance(raw_title, dict) else ""
    override_title_zh, override_title_en = TITLE_OVERRIDES.get(entry_id, ("", ""))
    papers = normalize_papers(entry)
    year_value = entry.get("year") or max((paper.get("year") or 0 for paper in papers), default=0)
    architecture = text(entry.get("controlArchitecture") or entry.get("control_architecture") or entry.get("architecture"))
    io_description = text(entry.get("io") or entry.get("interfaces"))
    if io_description and io_description not in architecture:
        architecture = f"{architecture} 接口与 I/O：{io_description}" if architecture else f"接口与 I/O：{io_description}"
    result = {
        "id": entry_id,
        "projectId": PROJECT_ID_OVERRIDES.get(entry_id, text(entry.get("projectId") or entry.get("project_id") or entry_id)),
        "titleZh": override_title_zh or text(entry.get("titleZh") or entry.get("title_zh")) or nested_title_zh or text(raw_title),
        "titleEn": override_title_en or text(entry.get("titleEn") or entry.get("title_en")) or nested_title_en or None,
        "year": int(year_value or 0),
        "organization": text(entry.get("organization") or entry.get("organizations")) or "论文作者与装置团队（见原始来源）",
        "primaryTask": primary,
        "relatedTasks": related,
        "categoryLabel": text(category) or TASK_META[primary]["label"],
        "problem": text(entry.get("problem")) or "公开来源未单独概括。",
        "method": text(entry.get("method") or entry.get("approach") or entry.get("architecture")) or "公开来源未单独概括。",
        "controlArchitecture": architecture or "未完整公开。",
        "timescale": text(entry.get("timescale") or entry.get("time_scale") or entry.get("cycle") or entry.get("timing")) or "未公开统一周期。",
        "sensors": unique_strings(as_list(entry.get("sensors") or entry.get("measurements"))),
        "actuators": unique_strings(as_list(entry.get("actuators"))),
        "devices": normalize_devices(entry.get("devices")),
        "validation": text(entry.get("validation") or entry.get("validation_level")) or "公开来源未单独说明。",
        "results": text(entry.get("results") or entry.get("key_results") or entry.get("deployment")) or "公开来源未单独概括。",
        "evidenceLevel": evidence,
        "deploymentLevel": deployment,
        "maturity": text(entry.get("maturity") or entry.get("deployment")) or f"{deployment}；需结合条目证据说明理解。",
        "limitations": text(entry.get("limitations") or entry.get("claimBoundary") or entry.get("claim_boundary")) or "公开信息不足，适用域、失效模式与误差需独立复核。",
        "twinRelevance": text(entry.get("twinRelevance") or entry.get("digital_twin_significance") or entry.get("digitalTwinRelevance")) or "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
        "papers": papers,
        "code": normalize_code(entry),
        "tags": unique_strings(as_list(entry.get("tags"))),
        "sourceFile": source_file,
    }
    if not result["titleZh"]:
        raise ValueError(f"Missing title in {source_file}:{entry_id}")
    if not result["papers"]:
        raise ValueError(f"No primary paper/source URL in {source_file}:{entry_id}")
    return result


def merge_lists(left: list[Any], right: list[Any], key: str | None = None) -> list[Any]:
    result = list(left)
    seen = {text(item.get(key)) if key and isinstance(item, dict) else text(item) for item in result}
    for item in right:
        identity = text(item.get(key)) if key and isinstance(item, dict) else text(item)
        if identity and identity not in seen:
            seen.add(identity)
            result.append(item)
    return result


def merge_duplicate(existing: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    for field in ("relatedTasks", "sensors", "actuators", "devices", "tags"):
        existing[field] = merge_lists(existing[field], incoming[field])
    existing["papers"] = merge_lists(existing["papers"], incoming["papers"], "url")
    existing["papers"] = sorted(existing["papers"], key=paper_priority)
    existing["code"] = merge_lists(existing["code"], incoming["code"], "url")
    for field in ("problem", "method", "controlArchitecture", "validation", "results", "limitations", "twinRelevance"):
        if len(incoming[field]) > len(existing[field]):
            existing[field] = incoming[field]
    existing["evidenceLevel"] = max((existing["evidenceLevel"], incoming["evidenceLevel"]), key=lambda value: int(value[1]))
    existing["deploymentLevel"] = max((existing["deploymentLevel"], incoming["deploymentLevel"]), key=lambda value: int(value[1]))
    existing["year"] = max(existing["year"], incoming["year"])
    return existing


def normalize_device(entry: dict[str, Any]) -> dict[str, Any]:
    device_id = text(entry.get("id") or entry.get("name")).lower().replace(" ", "-")
    papers = normalize_papers({"papers": entry.get("papers") or entry.get("publications") or entry.get("representativePapers") or entry.get("sources"), "year": entry.get("year"), "title": entry.get("name")})
    code = normalize_code({"code": entry.get("code") or entry.get("software") or entry.get("publicCodeAndData")})
    primary_tasks = []
    for raw in as_list(entry.get("primaryTasks") or entry.get("primary_tasks") or entry.get("controlTasks") or entry.get("control_modules")):
        matches = tasks_mentioned(raw)
        if not matches:
            matches = [task_from_text(raw, fallback="")]
        for task in matches:
            if task in TASK_META and task not in primary_tasks:
                primary_tasks.append(task)
    if "T9" not in primary_tasks:
        primary_tasks.append("T9")
    works = []
    for work in as_list(entry.get("representativeWorks") or entry.get("representative_works")):
        works.append(text(work.get("title") or work.get("name")) if isinstance(work, dict) else text(work))
    return {
        "id": device_id,
        "name": text(entry.get("name")),
        "country": text(entry.get("country") or entry.get("countryOrRegion")) or "未注明",
        "organization": text(entry.get("organization") or entry.get("operator")) or "未注明",
        "status": text(entry.get("status")) or "以装置官方最新信息为准",
        "pcsArchitecture": text(entry.get("pcsArchitecture") or entry.get("pcs_architecture") or entry.get("architecture") or entry.get("pcsStack")) or "公开资料未完整披露。",
        "timing": text(entry.get("timing") or entry.get("cycle") or entry.get("cycleAndIO")) or "多速率；未发现统一公开周期。",
        "primaryTasks": primary_tasks,
        "sensors": unique_strings(as_list(entry.get("sensors"))),
        "actuators": unique_strings(as_list(entry.get("actuators"))),
        "representativeWorks": [item for item in works if item],
        "papers": papers,
        "code": code,
        "maturity": text(entry.get("maturity")) or "需按具体控制功能逐项判定。",
        "gaps": text(entry.get("gaps") or entry.get("limitations")) or "公开信息不足；需装置团队复核。",
        "sources": [text(item) for item in as_list(entry.get("sources")) if text(item)],
    }


def device_tokens(value: Any) -> set[str]:
    name = text(value)
    if name in DEVICE_ALIASES:
        return set(DEVICE_ALIASES[name])
    base = re.split(r"[：:]", name, maxsplit=1)[0]
    tokens = {
        title_key(part)
        for part in re.split(r"[/,，、;；]", base)
        if title_key(part)
    }
    return tokens or ({title_key(base)} if title_key(base) else set())


def work_mentions_device(work: dict[str, Any], profile_name: str) -> bool:
    wanted = device_tokens(profile_name)
    observed: set[str] = set()
    for raw in work.get("devices", []):
        observed.update(device_tokens(raw))
    return bool(wanted & observed)


def infer_year(paper: dict[str, Any]) -> int:
    year = int(paper.get("year") or 0)
    if year:
        return year
    candidates = " ".join((text(paper.get("doi")), text(paper.get("url"))))
    years = [int(value) for value in re.findall(r"(?:19|20)\d{2}", candidates)]
    return next((value for value in years if 1950 <= value <= 2100), 0)


def build_paper_indexes(works: list[dict[str, Any]]) -> tuple[
    dict[str, dict[str, Any]],
    dict[str, dict[str, Any]],
    dict[str, list[dict[str, Any]]],
    dict[str, list[dict[str, Any]]],
]:
    by_key: dict[str, dict[str, Any]] = {}
    by_title: dict[str, dict[str, Any]] = {}
    works_by_key: dict[str, list[dict[str, Any]]] = {}
    works_by_title: dict[str, list[dict[str, Any]]] = {}
    for work in works:
        for paper in work["papers"]:
            keys = paper_keys(paper)
            title = title_key(paper.get("title"))
            for key in keys:
                if key not in by_key or metadata_score(paper) > metadata_score(by_key[key]):
                    by_key[key] = paper
            if title and (title not in by_title or metadata_score(paper) > metadata_score(by_title[title])):
                by_title[title] = paper
            for key in keys:
                works_by_key.setdefault(key, []).append(work)
            if title:
                works_by_title.setdefault(title, []).append(work)
    return by_key, by_title, works_by_key, works_by_title


def enrich_device_profile(
    device: dict[str, Any],
    works: list[dict[str, Any]],
    paper_by_key: dict[str, dict[str, Any]],
    paper_by_title: dict[str, dict[str, Any]],
    works_by_paper_key: dict[str, list[dict[str, Any]]],
    works_by_title: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    direct_works: list[dict[str, Any]] = []
    direct_ids: set[str] = set()
    enriched_papers: list[dict[str, Any]] = []

    for paper in device["papers"]:
        keys = paper_keys(paper)
        title = title_key(paper.get("title"))
        indexed = next((paper_by_key[key] for key in keys if key in paper_by_key), None) or paper_by_title.get(title)
        override = DEVICE_PAPER_METADATA.get(normalized_url(paper.get("url")))
        enriched = dict(paper)
        for source in (indexed, override):
            if not source:
                continue
            if text(source.get("title")):
                enriched["title"] = text(source["title"])
            if int(enriched.get("year") or 0) == 0 and int(source.get("year") or 0) > 0:
                enriched["year"] = int(source["year"])
            if text(enriched.get("authors")) in {"", "未完整列出", "见原始来源"} and text(source.get("authors")):
                enriched["authors"] = text(source["authors"])
            if text(enriched.get("venue")) in {"", "原始论文 / 官方来源", "primary-source"} and text(source.get("venue")):
                enriched["venue"] = text(source["venue"])
            if not enriched.get("doi") and source.get("doi"):
                enriched["doi"] = canonical_doi(source.get("doi"), enriched.get("url"))
            if text(enriched.get("sourceType")) in {"", "primary-source"} and text(source.get("sourceType")):
                enriched["sourceType"] = text(source["sourceType"])
        enriched["doi"] = canonical_doi(enriched.get("doi"), enriched.get("url"))
        enriched["year"] = infer_year(enriched)
        enriched_papers.append(enriched)

        candidates = [
            *(work for key in keys for work in works_by_paper_key.get(key, [])),
            *works_by_title.get(title, []),
        ]
        for work in candidates:
            if work["id"] not in direct_ids:
                direct_ids.add(work["id"])
                direct_works.append(work)

    device_works = [work for work in works if work_mentions_device(work, device["name"])]
    linked_works = list(direct_works)
    linked_ids = {work["id"] for work in linked_works}
    for work in device_works:
        if work["id"] not in linked_ids:
            linked_ids.add(work["id"])
            linked_works.append(work)

    representative = unique_strings([
        *device.get("representativeWorks", []),
        *(work["titleZh"] for work in direct_works),
        *(paper["title"] for paper in enriched_papers),
    ])
    sensors = unique_strings([
        *device.get("sensors", []),
        *(sensor for work in linked_works for sensor in work.get("sensors", [])),
    ])
    actuators = unique_strings([
        *device.get("actuators", []),
        *(actuator for work in linked_works for actuator in work.get("actuators", [])),
    ])
    primary_tasks = list(device.get("primaryTasks", []))
    for work in linked_works:
        for task in [work["primaryTask"], *work.get("relatedTasks", [])]:
            if task in TASK_META and task not in primary_tasks:
                primary_tasks.append(task)

    device["papers"] = enriched_papers
    device["representativeWorks"] = representative[:12]
    # Device-wide aggregation can become unwieldy on mature machines; retain a
    # deterministic, representative interface set while preserving the source
    # work catalogue as the complete trace.
    device["sensors"] = sensors[:24]
    device["actuators"] = actuators[:24]
    defaults = DEVICE_INTERFACE_DEFAULTS.get(device["name"], {})
    if not device["sensors"]:
        device["sensors"] = unique_strings(as_list(defaults.get("sensors")))
    if not device["actuators"]:
        device["actuators"] = unique_strings(as_list(defaults.get("actuators")))
    device["primaryTasks"] = sorted(primary_tasks, key=lambda value: int(value[1:]))
    return device


def typescript_module(works: list[dict[str, Any]], devices: list[dict[str, Any]]) -> str:
    tasks_json = json.dumps(TASK_META, ensure_ascii=False, indent=2)
    works_json = json.dumps(works, ensure_ascii=False, indent=2)
    devices_json = json.dumps(devices, ensure_ascii=False, indent=2)
    return f"""export type ControlTaskId = {' | '.join(repr(key) for key in TASK_META)};
export type ControlEvidenceLevel = 'E0' | 'E1' | 'E2' | 'E3' | 'E4';
export type ControlDeploymentLevel = 'D1' | 'D2' | 'D3' | 'D4' | 'D5';
export type ControlCodeStatus = 'official-direct' | 'official-enabling' | 'commercial-enabling' | 'community-reproduction' | 'not-public';

export interface ControlPaper {{ title: string; authors: string; year: number; venue: string; doi: string | null; url: string; sourceType: string }}
export interface ControlCode {{ name: string; url: string | null; status: ControlCodeStatus; relationship: string; artifactType: string; access: string; license: string }}
export interface ControlResearchItem {{
  id: string; projectId: string; titleZh: string; titleEn: string | null; year: number; organization: string;
  primaryTask: ControlTaskId; relatedTasks: ControlTaskId[]; categoryLabel: string; problem: string; method: string;
  controlArchitecture: string; timescale: string; sensors: string[]; actuators: string[]; devices: string[];
  validation: string; results: string; evidenceLevel: ControlEvidenceLevel; deploymentLevel: ControlDeploymentLevel;
  maturity: string; limitations: string; twinRelevance: string; papers: ControlPaper[]; code: ControlCode[]; tags: string[]; sourceFile: string;
}}
export interface ControlDeviceProfile {{
  id: string; name: string; country: string; organization: string; status: string; pcsArchitecture: string; timing: string;
  primaryTasks: ControlTaskId[]; sensors: string[]; actuators: string[]; representativeWorks: string[];
  papers: ControlPaper[]; code: ControlCode[]; maturity: string; gaps: string; sources: string[];
}}

export const controlTaskMeta = {tasks_json} as const;
export const controlResearchItems: ControlResearchItem[] = {works_json};
export const controlDeviceProfiles: ControlDeviceProfile[] = {devices_json};
"""


def write_csv(path: Path, works: list[dict[str, Any]]) -> None:
    fields = [
        "id", "titleZh", "titleEn", "year", "primaryTask", "relatedTasks", "devices", "evidenceLevel", "deploymentLevel",
        "problem", "method", "timescale", "validation", "results", "limitations", "twinRelevance", "paperTitles", "paperUrls", "codeNames", "codeUrls", "codeStatus",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for item in works:
            writer.writerow({
                **{field: item.get(field, "") for field in fields},
                "relatedTasks": " | ".join(item["relatedTasks"]),
                "devices": " | ".join(item["devices"]),
                "paperTitles": " | ".join(paper["title"] for paper in item["papers"]),
                "paperUrls": " | ".join(paper["url"] for paper in item["papers"]),
                "codeNames": " | ".join(code["name"] for code in item["code"]),
                "codeUrls": " | ".join(code["url"] or "" for code in item["code"]),
                "codeStatus": " | ".join(code["status"] for code in item["code"]),
            })


def bibtex_key(paper: dict[str, Any], index: int) -> str:
    lead = re.sub(r"[^A-Za-z0-9]", "", paper.get("authors", "").split(",")[0]) or "FusionControl"
    return f"{lead}{paper.get('year') or 0}Control{index}"


def write_bib(path: Path, works: list[dict[str, Any]], devices: list[dict[str, Any]]) -> None:
    papers: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in [*works, *devices]:
        for paper in item["papers"]:
            key = (paper.get("doi") or paper["url"]).lower()
            if key not in seen:
                seen.add(key)
                papers.append(paper)
    blocks = []
    for index, paper in enumerate(papers, 1):
        kind = "article" if paper.get("doi") or "journal" in paper.get("sourceType", "").lower() else "misc"
        fields = {
            "title": paper["title"], "author": paper.get("authors", "未完整列出"), "year": paper.get("year", 0),
            "journal": paper.get("venue", "") if kind == "article" else "", "doi": paper.get("doi") or "", "url": paper["url"],
        }
        lines = [f"@{kind}{{{bibtex_key(paper, index)},"]
        for key, value in fields.items():
            if value not in (None, "", 0):
                safe = str(value).replace("{", "\\{").replace("}", "\\}")
                lines.append(f"  {key} = {{{safe}}},")
        lines.append("}")
        blocks.append("\n".join(lines))
    path.write_text("\n\n".join(blocks) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--research-dir", type=Path, required=True)
    parser.add_argument("--site-dir", type=Path, required=True)
    args = parser.parse_args()

    manifest = json.loads((args.research_dir / "manifest.json").read_text(encoding="utf-8"))
    source_dir = args.research_dir / "sources"
    by_id: dict[str, dict[str, Any]] = {}
    for filename in manifest["workSources"]:
        for raw in load_records(source_dir / filename, ("works", "entries", "records", "items")):
            item = normalize_work(raw, filename)
            identity = item["projectId"]
            if identity in by_id:
                by_id[identity] = merge_duplicate(by_id[identity], item)
            else:
                by_id[identity] = item
    works = sorted(by_id.values(), key=lambda item: (int(item["primaryTask"][1:]), -item["year"], item["id"]))

    raw_devices = load_records(source_dir / manifest["deviceSource"], ("devices", "profiles", "entries", "items"))
    paper_indexes = build_paper_indexes(works)
    devices = sorted(
        (
            enrich_device_profile(normalize_device(item), works, *paper_indexes)
            for item in raw_devices
        ),
        key=lambda item: item["name"],
    )

    primary_counts = Counter(item["primaryTask"] for item in works)
    association_counts = Counter(task for item in works for task in [item["primaryTask"], *item["relatedTasks"]])
    evidence_counts = Counter(item["evidenceLevel"] for item in works)
    deployment_counts = Counter(item["deploymentLevel"] for item in works)
    direct_code = sum(any(code["status"] == "official-direct" for code in item["code"]) for item in works)
    public_code = sum(any(code["url"] and code["status"] != "not-public" for code in item["code"]) for item in works)
    unique_papers = {paper_key(paper) for item in works for paper in item["papers"]}

    landscape = {
        "schemaVersion": "1.0",
        "asOf": manifest["editionDate"],
        "scope": "托卡马克集成控制：按 T0–T9 控制任务与装置/PCS 双索引组织，严格区分仿真、装置离线、实时与闭环证据。",
        "taskMeta": TASK_META,
        "evidenceMeta": EVIDENCE_META,
        "deploymentMeta": DEPLOYMENT_META,
        "statistics": {
            "total": len(works),
            "uniquePapers": len(unique_papers),
            "devices": len(devices),
            "directCodeWorks": direct_code,
            "publicCodeWorks": public_code,
            "primaryTasks": dict(sorted(primary_counts.items())),
            "taskAssociations": dict(sorted(association_counts.items())),
            "evidence": dict(sorted(evidence_counts.items())),
            "deployment": dict(sorted(deployment_counts.items())),
        },
        "entries": works,
    }
    device_payload = {
        "schemaVersion": "1.0",
        "asOf": manifest["editionDate"],
        "statistics": {"total": len(devices)},
        "devices": devices,
    }

    public_data = args.site_dir / "public" / "data"
    public_data.mkdir(parents=True, exist_ok=True)
    (public_data / "fusion-control-landscape.json").write_text(json.dumps(landscape, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (public_data / "fusion-control-device-profiles.json").write_text(json.dumps(device_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_csv(args.site_dir / "public" / "fusion-control-paper-code-index.csv", works)
    write_bib(args.site_dir / "public" / "fusion-control-references.bib", works, devices)

    app_dir = args.site_dir / "app" / "control"
    app_dir.mkdir(parents=True, exist_ok=True)
    (app_dir / "controlResearch.ts").write_text(typescript_module(works, devices), encoding="utf-8")
    print(f"Generated {len(works)} control works, {len(unique_papers)} unique sources and {len(devices)} device profiles.")


if __name__ == "__main__":
    main()

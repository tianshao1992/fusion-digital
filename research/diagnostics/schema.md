# Canonical diagnostics record contract

Builders accept source-envelope differences, but every normalized work must expose the following contract.

```json
{
  "id": "DG-...",
  "projectId": "stable-project-key",
  "primaryTask": "DG0",
  "relatedTasks": ["DG9"],
  "techniqueFamilies": ["OPTICAL", "COMPUTATIONAL"],
  "title": "中文标题",
  "titleEn": "English title",
  "technique": "诊断或方法名称",
  "problem": "要解决的测量/决策问题",
  "measurementPrinciple": "从物理量到原始信号的机理",
  "quantities": ["measurement product with units where available"],
  "region": ["core", "edge", "divertor", "plant"],
  "temporalScale": "采样、时间分辨率或典型响应尺度",
  "spatialScale": "视线、体素、径向/二维/三维空间分辨与覆盖",
  "hardware": ["sensor, optical train, acquisition"],
  "calibration": "标定、漂移与可追溯性方法",
  "inference": "反演、重建、滤波或 AI 方法",
  "devices": [{"name": "DIII-D", "fit": "...", "validation": "..."}],
  "validation": "验证设计、基准和结果",
  "evidenceLevel": "E3",
  "deploymentLevel": "D4",
  "limitations": "适用域与未验证边界",
  "twinRelevance": "进入数字孪生的状态、质量、时钟、配置和证据接口",
  "papers": [{"title": "...", "authors": "...", "year": 2024, "venue": "...", "doi": "...", "url": "https://...", "sourceType": "journal"}],
  "code": [{"name": "...", "url": "https://...", "status": "official-direct", "artifactType": "source-code", "access": "open", "relation": "direct implementation"}],
  "organizations": ["..."],
  "tags": ["..."],
  "asOf": "2026-08-12"
}
```

Device profiles must provide stable IDs, facility type/status, diagnostic systems, sensors, real-time interfaces, data platform, representative work IDs, primary task IDs, papers/code, limitations and `asOf`. A device profile is an evidence index, not a claim that every listed diagnostic is simultaneously available in every campaign.

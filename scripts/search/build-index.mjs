import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { facilities } from "../../app/facilities/data.ts";
import { tools as physicsTools, references as physicsReferences } from "../../app/data.ts";
import { integratedGroups } from "../../app/integrated-data.ts";
import aiLandscape from "../../public/data/fusion-ai-native-landscape.json" with { type: "json" };
import controlLandscape from "../../public/data/fusion-control-landscape.json" with { type: "json" };
import controlDevices from "../../public/data/fusion-control-device-profiles.json" with { type: "json" };
import diagnosticsLandscape from "../../public/data/fusion-diagnostics-landscape.json" with { type: "json" };
import diagnosticsDevices from "../../public/data/fusion-diagnostics-device-profiles.json" with { type: "json" };
import engineeringTools from "../../public/data/tokamak-engineering-tool-catalog.json" with { type: "json" };

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const output = resolve(root, "public/data/fusion-knowledge-index.json");
const entries = new Map();

const text = (...values) => values.flat(Infinity).filter(Boolean).map((value) => {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object") return Object.values(value).filter((part) => typeof part === "string").join("；");
  return "";
}).filter(Boolean).join("\n");

const unique = (...values) => [...new Set(values.flat(Infinity).filter(Boolean).map(String))];
const safeUrl = (value) => typeof value === "string" && /^https?:\/\//i.test(value) ? value : null;
const canonicalUrl = (value) => {
  const url = safeUrl(value);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    if (parsed.hostname === "doi.org") parsed.pathname = parsed.pathname.toLowerCase();
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
};
const slug = (value) => String(value).normalize("NFKC").toLowerCase().replace(/https?:\/\//g, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 96);
const source = (label, url, kind = "source", detail) => ({ label: text(label).slice(0, 320), url: canonicalUrl(url), kind, ...(detail ? { detail: text(detail).slice(0, 500) } : {}) });
const cleanSources = (sources) => {
  const seen = new Set();
  return sources.filter((item) => item?.url).filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  }).slice(0, 12);
};

function add(input) {
  const item = {
    id: input.id,
    entityType: input.entityType,
    domains: unique(input.domains).sort(),
    title: text(input.title).replace(/\s+/g, " ").trim().slice(0, 500),
    summary: text(input.summary).replace(/\s+/g, " ").trim().slice(0, 5000),
    year: Number.isFinite(Number(input.year)) ? Number(input.year) : null,
    organization: text(input.organization).replace(/\s+/g, " ").trim().slice(0, 500) || null,
    devices: unique(input.devices).slice(0, 80),
    tags: unique(input.tags).slice(0, 80),
    evidenceLevel: input.evidenceLevel || null,
    deploymentLevel: input.deploymentLevel || null,
    route: input.route || "/search",
    sources: cleanSources(input.sources || []),
  };
  if (!item.title || !item.summary) return;
  item.searchText = text(item.title, item.summary, item.organization, item.devices, item.tags, item.sources.map((item) => item.label)).normalize("NFKC").toLowerCase();
  entries.set(item.id, item);
}

function upsertDevice(name, patch) {
  if (!name) return;
  const id = `device:${slug(name)}`;
  const previous = entries.get(id);
  if (!previous) return add({ id, entityType: "device", title: name, ...patch });
  add({
    ...previous,
    ...patch,
    id,
    entityType: "device",
    title: previous.title,
    domains: unique(previous.domains, patch.domains),
    summary: text(previous.summary, patch.summary),
    devices: unique(previous.devices, patch.devices),
    tags: unique(previous.tags, patch.tags),
    sources: cleanSources([...(previous.sources || []), ...(patch.sources || [])]),
    organization: previous.organization || patch.organization,
    year: Math.max(previous.year || 0, patch.year || 0) || null,
    route: previous.route || patch.route,
  });
}

const papers = new Map();
function addPaper(paper, domains, parentTitle, route, devices = []) {
  if (!paper?.title) return;
  const url = canonicalUrl(paper.url || (paper.doi ? `https://doi.org/${paper.doi}` : null));
  const key = url || `${paper.title}:${paper.year || ""}`;
  const id = `paper:${slug(key)}`;
  const previous = papers.get(id);
  const next = {
    id,
    entityType: "paper",
    domains: unique(previous?.domains || [], domains),
    title: paper.title,
    summary: text(paper.authors, paper.venue, paper.sourceType, `收录于 FusionDigital 工作：${parentTitle}`),
    year: paper.year,
    organization: paper.venue || null,
    devices: unique(previous?.devices || [], devices),
    tags: unique(previous?.tags || [], ["论文", paper.doi ? `DOI ${paper.doi}` : null]),
    route,
    sources: cleanSources([...(previous?.sources || []), source(paper.title, url, "paper", paper.venue)]),
  };
  papers.set(id, next);
}

const codeItems = new Map();
function addCode(code, domains, parentTitle, route, devices = []) {
  if (!code?.name) return;
  const url = canonicalUrl(code.url);
  const key = url || `${code.name}:${parentTitle}`;
  const id = `code:${slug(key)}`;
  const previous = codeItems.get(id);
  codeItems.set(id, {
    id,
    entityType: "code",
    domains: unique(previous?.domains || [], domains),
    title: code.name,
    summary: text(code.relationship, code.status, code.access, code.license, `关联工作：${parentTitle}`),
    organization: null,
    devices: unique(previous?.devices || [], devices),
    tags: unique(previous?.tags || [], ["代码库", code.status, code.artifactType]),
    route,
    sources: cleanSources([...(previous?.sources || []), source(code.name, url, "code", code.relationship)]),
  });
}

for (const item of aiLandscape.entries) {
  const domains = unique("ai-native", item.domain, item.primaryDomain, item.relatedDomains);
  const sources = [
    ...(item.papers || []).map((paper) => source(paper.title, paper.url, "paper", paper.venue)),
    ...(item.code || []).map((code) => source(code.name, code.url, "code", code.relationship)),
  ];
  add({
    id: `ai-work:${item.id}`,
    entityType: "work",
    domains,
    title: item.title,
    summary: text(item.problem, item.approach, item.evidence, item.data, item.maturity, item.limitations),
    year: item.year,
    organization: item.organization,
    devices: item.devices,
    tags: unique(item.tags, "智能原生"),
    evidenceLevel: item.evidenceLevel,
    deploymentLevel: item.deploymentLevel,
    route: `/ai?work=${encodeURIComponent(item.id)}`,
    sources,
  });
  for (const paper of item.papers || []) addPaper(paper, domains, item.title, "/ai", item.devices);
  for (const code of item.code || []) addCode(code, domains, item.title, "/ai", item.devices);
}

for (const item of controlLandscape.entries) {
  const domains = ["control"];
  const sources = [
    ...(item.papers || []).map((paper) => source(paper.title, paper.url, "paper", paper.sourceType)),
    ...(item.code || []).map((code) => source(code.name, code.url, "code", code.relationship)),
  ];
  add({
    id: `control-work:${item.id}`,
    entityType: "work",
    domains,
    title: item.titleZh || item.titleEn,
    summary: text(item.titleEn, item.problem, item.method, item.controlArchitecture, item.timescale, item.validation, item.results, item.maturity, item.limitations, item.twinRelevance),
    year: item.year,
    organization: item.organization,
    devices: item.devices,
    tags: unique(item.tags, item.primaryTask, item.relatedTasks, item.categoryLabel),
    evidenceLevel: item.evidenceLevel,
    deploymentLevel: item.deploymentLevel,
    route: `/control?work=${encodeURIComponent(item.id)}`,
    sources,
  });
  for (const paper of item.papers || []) addPaper(paper, domains, item.titleZh, "/control", item.devices);
  for (const code of item.code || []) addCode(code, domains, item.titleZh, "/control", item.devices);
}

for (const item of diagnosticsLandscape.entries) {
  const domains = ["diagnostics"];
  const deviceNames = (item.devices || []).map((device) => typeof device === "string" ? device : device.name);
  const sources = [
    ...(item.papers || []).map((paper) => source(paper.title, paper.url, "paper", paper.sourceType)),
    ...(item.code || []).map((code) => source(code.name, code.url, "code", code.relationship)),
  ];
  add({
    id: `diagnostics-work:${item.id}`,
    entityType: "work",
    domains,
    title: item.title || item.titleEn,
    summary: text(item.titleEn, item.technique, item.problem, item.measurementPrinciple, item.quantities, item.region, item.calibration, item.inference, item.validation, item.limitations, item.twinRelevance),
    year: item.asOf ? Number(String(item.asOf).slice(0, 4)) : null,
    organization: item.organizations,
    devices: deviceNames,
    tags: unique(item.tags, item.primaryTask, item.relatedTasks, item.techniqueFamilies),
    evidenceLevel: item.evidenceLevel,
    deploymentLevel: item.deploymentLevel,
    route: `/diagnostics?work=${encodeURIComponent(item.id)}`,
    sources,
  });
  for (const paper of item.papers || []) addPaper(paper, domains, item.title, "/diagnostics", deviceNames);
  for (const code of item.code || []) addCode(code, domains, item.title, "/diagnostics", deviceNames);
}

for (const tool of physicsTools) {
  add({
    id: `physics-tool:${slug(tool.name)}`,
    entityType: "tool",
    domains: ["physics"],
    title: tool.name,
    summary: text(tool.scope, tool.validation, tool.stack, tool.access, tool.fidelity, tool.realtime),
    devices: String(tool.devices || "").split(/[、，,；;]/).map((value) => value.trim()),
    tags: [tool.domain, tool.access, tool.fidelity, tool.realtime],
    route: "/physics#atlas",
    sources: [source(`${tool.name} 官方或主要来源`, tool.url, "tool")],
  });
}
for (const reference of physicsReferences) addPaper({ title: reference.title, year: reference.year, venue: reference.org, url: reference.url }, ["physics"], "物理模拟与集成模拟资料库", "/physics");

for (const tool of engineeringTools) {
  add({
    id: `engineering-tool:${slug(tool.tool_or_platform)}`,
    entityType: "tool",
    domains: ["engineering"],
    title: tool.tool_or_platform,
    summary: text(tool.category, tool.license_and_stack, tool.scope_and_validation, tool.limitations_and_twin_gap),
    tags: [tool.category, tool.license_class, tool.evidence_cutoff],
    route: "/engineering#tools",
    sources: [source(`${tool.tool_or_platform} 官方或主要来源`, tool.url, "tool")],
  });
}

for (const group of integratedGroups) for (const framework of group.items) {
  add({
    id: `framework:${slug(framework.name)}`,
    entityType: "framework",
    domains: ["integration"],
    title: framework.name,
    summary: text(group.group, group.purpose, framework.role, framework.strengths, framework.limits, framework.twinGap),
    tags: [group.group, "集成模拟", "数字孪生"],
    route: "/physics#integrated",
    sources: [source(`${framework.name} 官方或主要来源`, framework.url, "tool")],
  });
}

for (const facility of facilities) {
  upsertDevice(facility.name, {
    domains: ["facilities"],
    summary: text(facility.summary, facility.milestone, facility.twinValue, facility.status, facility.phase),
    year: Number(String(facility.updated).slice(0, 4)),
    organization: facility.country,
    devices: [facility.name],
    tags: [facility.type, facility.status, facility.phase],
    route: `/facilities?device=${encodeURIComponent(facility.name)}`,
    sources: [source(facility.source, facility.url, "facility"), source("补充来源", facility.secondSource, "facility"), source("补充来源", facility.thirdSource, "facility")],
  });
}

for (const device of controlDevices.devices) {
  upsertDevice(device.name, {
    domains: ["control", "facilities"],
    summary: text(device.status, device.pcsArchitecture, device.timing, device.representativeWorks, device.maturity, device.gaps),
    organization: text(device.country, device.organization),
    devices: [device.name],
    tags: unique(device.primaryTasks, "控制装置画像"),
    route: `/control?device=${encodeURIComponent(device.id)}`,
    sources: [
      ...(device.papers || []).map((paper) => source(paper.title, paper.url, "paper", paper.sourceType)),
      ...(device.code || []).map((code) => source(code.name, code.url, "code", code.relationship)),
      ...(device.sources || []).map((url) => source("装置控制来源", url, "source")),
    ],
  });
  for (const paper of device.papers || []) addPaper(paper, ["control"], `${device.name} 控制画像`, "/control", [device.name]);
  for (const code of device.code || []) addCode(code, ["control"], `${device.name} 控制画像`, "/control", [device.name]);
}

for (const device of diagnosticsDevices.devices) {
  upsertDevice(device.name, {
    domains: ["diagnostics", "facilities"],
    summary: text(device.status, device.diagnosticSummary, device.representativeWorkSummaries, device.diagnosticSystems, device.realTimeInterfaces, device.dataPlatform, device.limitations),
    organization: text(device.countryOrRegion, device.operator),
    devices: [device.name],
    tags: unique(device.primaryTasks, device.type, "诊断装置画像"),
    route: `/diagnostics?device=${encodeURIComponent(device.id)}`,
    sources: [
      ...(device.papers || []).map((paper) => source(paper.title, paper.url, "paper", paper.sourceType)),
      ...(device.code || []).map((code) => source(code.name, code.url, "code", code.relationship)),
    ],
  });
  for (const paper of device.papers || []) addPaper(paper, ["diagnostics"], `${device.name} 诊断画像`, "/diagnostics", [device.name]);
  for (const code of device.code || []) addCode(code, ["diagnostics"], `${device.name} 诊断画像`, "/diagnostics", [device.name]);
}

for (const paper of papers.values()) add(paper);
for (const code of codeItems.values()) add(code);

const sorted = [...entries.values()].sort((a, b) => a.entityType.localeCompare(b.entityType) || a.title.localeCompare(b.title, "zh-CN"));
const byType = Object.fromEntries([...new Set(sorted.map((item) => item.entityType))].sort().map((type) => [type, sorted.filter((item) => item.entityType === type).length]));
const byDomain = Object.fromEntries([...new Set(sorted.flatMap((item) => item.domains))].sort().map((domain) => [domain, sorted.filter((item) => item.domains.includes(domain)).length]));
const payload = {
  schemaVersion: "1.0.0",
  generatedAt: new Date().toISOString(),
  sourcePolicy: "FusionDigital curated public research datasets; every public answer must cite one or more source URLs from the retrieved entries.",
  statistics: { total: sorted.length, byType, byDomain },
  entries: sorted,
};
await writeFile(output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Wrote ${sorted.length} entries to ${output}`);

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const publicData = path.join(root, 'public', 'data');
const output = path.join(publicData, 'fusion-knowledge-graph.json');
const asOf = '2026-08-12';

const sources = [
  'fusion-ai-native-landscape.json',
  'fusion-control-landscape.json',
  'fusion-control-device-profiles.json',
  'fusion-diagnostics-landscape.json',
  'fusion-diagnostics-device-profiles.json',
  'tokamak-engineering-tool-catalog.json',
  'app/data.ts (physics tool inventory; generator-maintained projection)',
  'app/facilities/data.ts (facility observatory; generator-maintained projection)',
];

const [ai, control, controlDevices, diagnostics, diagnosticDevices, engineering] = await Promise.all(
  sources.slice(0, 6).map(async (name) => JSON.parse(await readFile(path.join(publicData, name), 'utf8'))),
);

const nodes = new Map();
const edges = new Map();
const slug = (value) => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 110) || 'unknown';
const canonicalDevice = (value) => {
  const cleaned = String(value ?? '').split(/[：:；;]/, 1)[0].replace(/^(also used for|planned\/partial)\s+/i, '').trim();
  const aliases = [
    [/wendelstein\s*7[- ]x|w7[- ]x/i, 'Wendelstein 7-X'], [/mast\s*upgrade|mast-u/i, 'MAST Upgrade'],
    [/exl[- ]?50u/i, 'EXL-50U'], [/exl[- ]?50/i, 'EXL-50'], [/jt[- ]?60sa/i, 'JT-60SA'],
    [/diii[- ]?d/i, 'DIII-D'], [/nstx[- ]?u/i, 'NSTX-U'], [/asdex\s*upgrade|\baug\b/i, 'ASDEX Upgrade'],
    [/alcator\s*c[- ]mod/i, 'Alcator C-Mod'], [/\biter\b/i, 'ITER'], [/\beast\b/i, 'EAST'], [/\btcv\b/i, 'TCV'],
    [/\bkstar\b/i, 'KSTAR'], [/\bsparc\b/i, 'SPARC'], [/\bjet\b/i, 'JET'], [/\bwest\b/i, 'WEST'],
    [/\bdtt\b/i, 'DTT'], [/\bbest\b/i, 'BEST'], [/\behl[- ]?2\b/i, 'EHL-2'], [/\barc\b/i, 'ARC'],
  ];
  return aliases.find(([pattern]) => pattern.test(cleaned))?.[1] ?? cleaned.slice(0, 76);
};

function addNode(node) {
  if (!node?.id || !node?.label) return node?.id;
  const previous = nodes.get(node.id);
  nodes.set(node.id, previous ? {
    ...previous,
    ...node,
    description: previous.description?.length >= (node.description?.length ?? 0) ? previous.description : node.description,
    tags: [...new Set([...(previous.tags ?? []), ...(node.tags ?? [])])],
    sourceDomains: [...new Set([...(previous.sourceDomains ?? [previous.domain]), ...(node.sourceDomains ?? [node.domain])])],
  } : { ...node, tags: [...new Set(node.tags ?? [])], degree: 0 });
  if (!previous) nodes.get(node.id).sourceDomains = [...new Set(node.sourceDomains ?? [node.domain])];
  return node.id;
}

function addEdge(source, target, relation, domain, evidence = {}) {
  if (!source || !target || source === target || !nodes.has(source) || !nodes.has(target)) return;
  const id = `edge:${slug(source)}:${relation}:${slug(target)}`;
  if (!edges.has(id)) edges.set(id, { id, source, target, relation, domain, ...evidence });
}

function deviceNode(name, domain, description = '') {
  const label = canonicalDevice(typeof name === 'object' ? name.name : name);
  if (!label) return '';
  return addNode({ id: `device:${slug(label)}`, type: 'device', domain: domain === 'facility' ? 'facility' : domain, label, description, tags: ['fusion-device'] });
}

function orgNode(name, domain) {
  const label = String(name ?? '').trim().slice(0, 120);
  if (!label) return '';
  return addNode({ id: `organization:${slug(label)}`, type: 'organization', domain, label, tags: ['organization'] });
}

function paperNode(paper, domain) {
  if (!paper?.title) return '';
  const key = paper.doi || paper.url || paper.title;
  return addNode({ id: `paper:${slug(key)}`, type: 'paper', domain, label: paper.title, subtitle: [paper.venue, paper.year].filter(Boolean).join(' · '), description: paper.authors, url: paper.url, year: Number(paper.year) || undefined, tags: ['publication', paper.sourceType].filter(Boolean) });
}

function codeNode(code, domain) {
  if (!code?.name) return '';
  const key = code.url || `${code.name}:${code.status ?? ''}`;
  return addNode({ id: `code:${slug(key)}`, type: 'code', domain, label: code.name, subtitle: code.status, description: code.relationship ?? code.relation, url: code.url ?? undefined, tags: ['code', code.status, code.access, code.license].filter(Boolean) });
}

function workNode(item, domain, fields = {}) {
  return addNode({
    id: `research:${domain}:${slug(item.id ?? item.projectId ?? item.title ?? item.titleZh)}`,
    type: 'research', domain, label: item.title ?? item.titleZh ?? item.titleEn,
    subtitle: [item.organization, item.year].filter(Boolean).join(' · '),
    description: item.problem ?? item.validation ?? item.summary,
    year: Number(item.year) || undefined, evidenceLevel: item.evidenceLevel, deploymentLevel: item.deploymentLevel,
    tags: [...(item.tags ?? []), fields.task].filter(Boolean),
  });
}

function attachArtifacts(work, item, domain) {
  for (const paper of item.papers ?? []) {
    const id = paperNode(paper, domain);
    addEdge(work, id, 'SUPPORTED_BY', domain, { evidenceNodeId: id, evidenceUrl: paper.url, evidenceLabel: paper.title });
  }
  for (const code of item.code ?? []) {
    const id = codeNode(code, domain);
    addEdge(work, id, 'HAS_CODE', domain, { evidenceUrl: code.url ?? undefined, evidenceLabel: code.relationship ?? code.relation });
  }
  for (const device of item.devices ?? []) addEdge(work, deviceNode(device, domain), 'VALIDATED_ON', domain);
  const organization = orgNode(item.organization, domain);
  if (organization) addEdge(organization, work, 'CONTRIBUTED_TO', domain);
  for (const organizationName of item.organizations ?? []) addEdge(orgNode(organizationName, domain), work, 'CONTRIBUTED_TO', domain);
}

for (const item of ai.entries) {
  const domain = 'ai';
  const work = workNode(item, domain);
  attachArtifacts(work, item, domain);
  const domainTask = addNode({ id: `task:ai:${slug(item.primaryDomain ?? item.domain)}`, type: 'task', domain, label: `AI × ${item.primaryDomain ?? item.domain}`, description: 'AI 原生研究知识域映射', tags: ['ai-domain'] });
  addEdge(work, domainTask, 'APPLIES_TO', domain);
}

for (const [taskId, meta] of Object.entries(control.taskMeta ?? {})) addNode({ id: `task:control:${slug(taskId)}`, type: 'task', domain: 'control', label: `${taskId} · ${meta.label}`, subtitle: meta.en, tags: ['control-task'] });
for (const item of control.entries) {
  const work = workNode(item, 'control', { task: item.primaryTask });
  attachArtifacts(work, item, 'control');
  for (const task of [item.primaryTask, ...(item.relatedTasks ?? [])]) addEdge(work, `task:control:${slug(task)}`, task === item.primaryTask ? 'PRIMARY_TASK' : 'RELATED_TASK', 'control');
}

for (const [taskId, meta] of Object.entries(diagnostics.taskMeta ?? {})) addNode({ id: `task:diagnostics:${slug(taskId)}`, type: 'task', domain: 'diagnostics', label: `${taskId} · ${meta.label}`, subtitle: meta.en, tags: ['diagnostic-task'] });
for (const item of diagnostics.entries) {
  const work = workNode(item, 'diagnostics', { task: item.primaryTask });
  attachArtifacts(work, item, 'diagnostics');
  for (const task of [item.primaryTask, ...(item.relatedTasks ?? [])]) addEdge(work, `task:diagnostics:${slug(task)}`, task === item.primaryTask ? 'PRIMARY_TASK' : 'RELATED_TASK', 'diagnostics');
}

for (const profile of controlDevices.devices) {
  const device = deviceNode(profile.name, 'facility', `${profile.country} · ${profile.status}. ${profile.pcsArchitecture}`);
  for (const paper of profile.papers ?? []) addEdge(device, paperNode(paper, 'control'), 'DOCUMENTED_BY', 'control', { evidenceUrl: paper.url, evidenceLabel: paper.title });
  for (const code of profile.code ?? []) addEdge(device, codeNode(code, 'control'), 'USES_CODE', 'control', { evidenceUrl: code.url ?? undefined });
  addEdge(orgNode(profile.organization, 'facility'), device, 'OPERATES', 'facility');
}

for (const profile of diagnosticDevices.devices) {
  const device = deviceNode(profile.name, 'facility', `${profile.countryOrRegion} · ${profile.status}. ${profile.diagnosticSummary}`);
  for (const paper of profile.papers ?? []) addEdge(device, paperNode(paper, 'diagnostics'), 'DOCUMENTED_BY', 'diagnostics', { evidenceUrl: paper.url, evidenceLabel: paper.title });
  for (const code of profile.code ?? []) addEdge(device, codeNode(code, 'diagnostics'), 'USES_CODE', 'diagnostics', { evidenceUrl: code.url ?? undefined });
  addEdge(orgNode(profile.operator, 'facility'), device, 'OPERATES', 'facility');
}

for (const tool of engineering) {
  const id = addNode({ id: `tool:engineering:${slug(tool.tool_or_platform)}`, type: 'tool', domain: 'engineering', label: tool.tool_or_platform, subtitle: tool.category, description: tool.scope_and_validation, url: tool.url, tags: [tool.license_class, tool.license_and_stack] });
  const task = addNode({ id: `task:engineering:${slug(tool.category)}`, type: 'task', domain: 'engineering', label: tool.category, tags: ['engineering-domain'] });
  addEdge(id, task, 'APPLIES_TO', 'engineering', { evidenceUrl: tool.url, evidenceLabel: tool.scope_and_validation });
}

// Physics and facility projections are intentionally compact, stable entries. The full records remain canonical in app/data.ts and app/facilities/data.ts.
const physicsTools = [
  ['DINA','平衡、重建与控制','https://www.iter.org/node/20687/release-imas-infrastructure-and-physics-models-open-source',['ITER','TCV','DIII-D','JET','JT-60SA','MAST Upgrade']],
  ['MEQ','平衡、重建与控制','https://conferences.iaea.org/event/450/contributions/40867/',['ITER','EXL-50U']],
  ['EFIT','平衡、重建与控制','https://github.com/PrincetonUniversity/EFIT-AI',['DIII-D','EAST','KSTAR','NSTX-U']],
  ['TRANSP','集成输运与场景','https://transp.pppl.gov/',['ITER','JET','DIII-D','SPARC']],
  ['JINTRAC','集成输运与场景','https://scientific-publications.ukaea.uk/jintrac/',['JET','ITER']],
  ['TORAX','集成输运与场景','https://github.com/google-deepmind/torax',['ITER','SPARC']],
  ['JOREK','MHD、稳定性与破裂','https://jorek.eu/',['JET','ITER','DIII-D','MAST Upgrade']],
  ['M3D-C1','MHD、稳定性与破裂','https://github.com/PrincetonUniversity/m3dc1',['DIII-D','NSTX-U','ITER']],
  ['BOUT++','边界、SOL与偏滤器','https://github.com/boutproject/BOUT-dev',['MAST Upgrade','DIII-D','ITER']],
  ['SOLPS-ITER','边界、SOL与偏滤器','https://www.iter.org/node/20687/release-imas-infrastructure-and-physics-models-open-source',['ITER','JET','EAST']],
  ['ASCOT5','加热、电流驱动与快离子','https://ascot4fusion.github.io/ascot5/',['JET','ITER','DIII-D','Wendelstein 7-X']],
  ['DREAM','失控电子与缓解','https://github.com/chalmersplasmatheory/DREAM',['JET','DIII-D','ITER']],
  ['OpenMC','中子学与辐射输运','https://openmc.org/',['ITER','SPARC','STEP']],
  ['FESTIM','氚与等离子体面对部件','https://github.com/festim-dev/FESTIM',['ITER','JET','WEST']],
  ['PROCESS','系统工程与整厂优化','https://github.com/ukaea/PROCESS',['STEP','DEMO','ARC']],
  ['IMAS','数据、工作流与合成诊断','https://imas-data-dictionary.readthedocs.io/',['ITER','JET','WEST','TCV']],
];
for (const [name, domainLabel, url, devices] of physicsTools) {
  const id = addNode({ id: `tool:physics:${slug(name)}`, type: 'tool', domain: 'physics', label: name, subtitle: domainLabel, url, tags: ['physics-code'] });
  const task = addNode({ id: `task:physics:${slug(domainLabel)}`, type: 'task', domain: 'physics', label: domainLabel, tags: ['physics-domain'] });
  addEdge(id, task, 'APPLIES_TO', 'physics', { evidenceUrl: url });
  for (const name of devices) addEdge(id, deviceNode(name, 'facility'), 'USED_FOR', 'physics', { evidenceUrl: url });
}

const facilitySeed = [
  ['EXL-50U','中国 · 新奥','运行中的球形环研究装置','https://conferences.iaea.org/event/392/papers/35644/files/13873-OV2999-EXL-50UOverview-YJShi.pdf'],
  ['EHL-2','中国 · 新奥','设计推进中的高场球形环平台','https://en.ennresearch.com/researchfield/Compactfusion/EHL_2/'],
  ['ITER','法国 · 国际','装配中的大型燃烧等离子体托卡马克','https://www.iter.org/project/tokamak-assembly'],
  ['SPARC','美国','建设中的高场紧凑托卡马克','https://www.cfs.energy/sparc'],
  ['BEST','中国','建设中的紧凑燃烧等离子体托卡马克','https://english.hf.cas.cn/'],
  ['DTT','意大利','建设中的偏滤器试验托卡马克','https://www.dtt-project.it/'],
  ['JT-60SA','日本 · 欧盟','运行准备中的大型超导托卡马克','https://www.jt60sa.org/'],
  ['STEP','英国','初步设计中的聚变原型电厂','https://step.ukaea.uk/'],
  ['EAST','中国','运行中的全超导长脉冲托卡马克','https://english.hf.cas.cn/r/ResearchPrograms/PlasmaPhysics/'],
  ['KSTAR','韩国','运行中的全超导长脉冲托卡马克','https://www.kfe.re.kr/'],
  ['Wendelstein 7-X','德国','运行中的优化仿星器','https://www.ipp.mpg.de/w7x'],
  ['MAST Upgrade','英国','运行中的球形托卡马克','https://ccfe.ukaea.uk/programmes/mast-upgrade/'],
  ['DIII-D','美国','运行中的先进托卡马克国家用户设施','https://www.ga.com/magnetic-fusion/diii-d'],
  ['JET','英国 · 欧洲','退役与知识保全阶段的大型D-T托卡马克','https://euro-fusion.org/devices/jet/'],
];
for (const [name, region, description, url] of facilitySeed) addNode({ id: `device:${slug(name)}`, type: 'device', domain: 'facility', label: name, subtitle: region, description, url, tags: ['facility-observatory'] });

for (const edge of edges.values()) {
  nodes.get(edge.source).degree += 1;
  nodes.get(edge.target).degree += 1;
}

const orderedNodes = [...nodes.values()].sort((a, b) => a.type.localeCompare(b.type) || b.degree - a.degree || a.label.localeCompare(b.label, 'zh-CN'));
const orderedEdges = [...edges.values()].sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target) || a.relation.localeCompare(b.relation));
const nodeTypes = ['research','paper','code','device','tool','task','organization'];
const domains = ['physics','engineering','control','diagnostics','ai','facility'];
const snapshot = {
  schemaVersion: '1.0',
  generatedAt: new Date().toISOString(),
  asOf,
  provenance: { generator: 'scripts/research/build-knowledge-graph.mjs', sources, policy: 'Every public relation is traceable to a curated source record or an explicitly labelled maintained projection; no LLM-only relation is published.' },
  statistics: {
    nodes: orderedNodes.length,
    edges: orderedEdges.length,
    byType: Object.fromEntries(nodeTypes.map((type) => [type, orderedNodes.filter((node) => node.type === type).length])),
    byDomain: Object.fromEntries(domains.map((domain) => [domain, orderedNodes.filter((node) => node.domain === domain).length])),
  },
  nodes: orderedNodes,
  edges: orderedEdges,
};

await mkdir(publicData, { recursive: true });
await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
console.log(`Knowledge graph: ${snapshot.statistics.nodes} nodes, ${snapshot.statistics.edges} edges -> ${path.relative(root, output)}`);

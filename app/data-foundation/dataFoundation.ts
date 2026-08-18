export type DataCategory =
  | 'semantic-standard'
  | 'archive-access'
  | 'open-data'
  | 'workflow-library'
  | 'reference-database'
  | 'governance-report';

export type DataLayer =
  | 'acquisition'
  | 'source-archive'
  | 'federated-access'
  | 'semantic-exchange'
  | 'curated-product'
  | 'catalogue-lineage'
  | 'workflow-serving'
  | 'publication-reference';

export type AccessClass = 'open' | 'open-conditional' | 'licensed' | 'registered' | 'controlled' | 'consortium' | 'facility-internal';
export type MaturityClass = 'operational' | 'production' | 'research' | 'emerging' | 'legacy';

export type DataSource = {
  label: string;
  labelEn: string;
  type: 'official-docs' | 'official-repository' | 'data-portal' | 'journal-paper' | 'technical-report' | 'standard';
  url: string;
};

export type DataFoundationRecord = {
  id: string;
  name: string;
  category: DataCategory;
  layers: DataLayer[];
  organization: string;
  organizationEn: string;
  region: string;
  regionEn: string;
  year: number;
  scope: string;
  scopeEn: string;
  objects: string;
  objectsEn: string;
  interfaces: string[];
  technologies: string[];
  devices: string[];
  access: AccessClass;
  maturity: MaturityClass;
  boundary: string;
  boundaryEn: string;
  interoperability: number;
  lifecycleReach: number;
  sources: DataSource[];
};

export const dataCategoryMeta: Record<DataCategory, { zh: string; en: string; color: string }> = {
  'semantic-standard': { zh: '语义标准', en: 'Semantic standard', color: '#68d7c3' },
  'archive-access': { zh: '采集与档案', en: 'Acquisition & archive', color: '#f0a45f' },
  'open-data': { zh: '开放数据与目录', en: 'Open data & catalogue', color: '#85b7ef' },
  'workflow-library': { zh: '工作流与数据代码', en: 'Workflow & data code', color: '#b5a0ee' },
  'reference-database': { zh: '专业参考数据库', en: 'Reference database', color: '#ef7f79' },
  'governance-report': { zh: '治理与技术报告', en: 'Governance & technical report', color: '#9fb579' },
};

export const dataLayerMeta: Record<DataLayer, { no: string; zh: string; en: string; short: string; shortEn: string }> = {
  acquisition: { no: 'L0', zh: '采集与控制源', en: 'Acquisition sources', short: '采集', shortEn: 'Acquire' },
  'source-archive': { no: 'L1', zh: '权威源档案与锁定快照', en: 'Authoritative source archive & locked snapshot', short: '源档案/快照', shortEn: 'Source/snapshot' },
  'federated-access': { no: 'L2', zh: '统一访问与联邦查询', en: 'Unified and federated access', short: '统一访问', shortEn: 'Access' },
  'semantic-exchange': { no: 'L3', zh: '语义交换与装置映射', en: 'Semantic exchange and machine mapping', short: '语义交换', shortEn: 'Semantics' },
  'curated-product': { no: 'L4', zh: '校准、重构与派生产品', en: 'Calibrated, reconstructed and derived products', short: '派生产品', shortEn: 'Products' },
  'catalogue-lineage': { no: 'L5', zh: '元数据、目录与血缘', en: 'Metadata, catalogue and lineage', short: '目录血缘', shortEn: 'Catalogue' },
  'workflow-serving': { no: 'L6', zh: '工作流、分析与服务', en: 'Workflow, analysis and serving', short: '工作流', shortEn: 'Workflow' },
  'publication-reference': { no: 'L7', zh: '快照发布与参考数据库', en: 'Snapshot publication and reference databases', short: '发布参考', shortEn: 'Publish' },
};

export const accessMeta: Record<AccessClass, { zh: string; en: string }> = {
  open: { zh: '公开', en: 'Open' },
  'open-conditional': { zh: '公开但有科学使用条款', en: 'Open with scientific-use conditions' },
  licensed: { zh: '许可/购买访问', en: 'Licensed / purchased access' },
  registered: { zh: '注册访问', en: 'Registered access' },
  controlled: { zh: '受控访问', en: 'Controlled access' },
  consortium: { zh: '成员/联盟访问', en: 'Consortium access' },
  'facility-internal': { zh: '装置内部', en: 'Facility-internal' },
};

export const maturityMeta: Record<MaturityClass, { zh: string; en: string }> = {
  operational: { zh: '装置运行基础设施', en: 'Operational facility infrastructure' },
  production: { zh: '生产级公共软件/服务', en: 'Production public software/service' },
  research: { zh: '研究级', en: 'Research-grade' },
  emerging: { zh: '新兴/快速演进', en: 'Emerging / fast-moving' },
  legacy: { zh: '历史系统/有限维护', en: 'Legacy / limited maintenance' },
};

export const fusionDataCharacteristics = [
  {
    id: 'shot-event',
    zh: '炮次与事件驱动',
    en: 'Shot- and event-centric',
    detail: '放电编号只是入口；预充、击穿、电流爬升、平台期、破裂、实验后分析和机器状态必须落在同一事件时间轴。',
    detailEn: 'A pulse number is only the entry point. Pre-fill, breakdown, current ramp, flat-top, disruption, post-shot analysis and machine state must share one event timeline.',
    implication: '统一 shot / run / event 身份与绝对、相对时间。',
    implicationEn: 'Unify shot, run and event identities with absolute and relative time.',
  },
  {
    id: 'multirate',
    zh: '跨十二量级时间尺度',
    en: 'Twelve-order temporal span',
    detail: '快速磁测、保护与控制可达微秒—毫秒，诊断与脉冲分析覆盖秒—小时，材料与资产记录延伸到年—寿期。',
    detailEn: 'Fast magnetics, protection and control span microseconds to milliseconds; diagnostics and pulse analysis span seconds to hours; material and asset records extend over years and plant life.',
    implication: '实时热路径、实验后路径和生命周期档案分层建设。',
    implicationEn: 'Separate the real-time hot path, post-shot path and lifecycle archive.',
  },
  {
    id: 'multimodal',
    zh: '高度多模态',
    en: 'Deeply multimodal',
    detail: '波形、剖面、谱、图像、视频、平衡拓扑、粒子、网格、CAD、日志、设定和文档同时存在。',
    detailEn: 'Waveforms, profiles, spectra, images, video, equilibrium topology, particles, meshes, CAD, logs, settings and documents coexist.',
    implication: '元数据目录与负载存储分离，按对象选择列式、数组、对象或图存储。',
    implicationEn: 'Separate metadata from payloads and choose columnar, array, object or graph storage by data object.',
  },
  {
    id: 'machine-semantics',
    zh: '装置语义强依赖',
    en: 'Machine-dependent semantics',
    detail: '同名信号可能具有不同坐标、极性、单位、采样、诊断几何与物理含义；跨装置比较不能只做字段重命名。',
    detailEn: 'Signals with similar names can differ in coordinates, polarity, units, sampling, diagnostic geometry and physical meaning; cross-machine use is not a rename operation.',
    implication: '冻结坐标约定、单位、几何与 Machine Description，并显式维护映射。',
    implicationEn: 'Version coordinate conventions, units, geometry and the Machine Description, with explicit mappings.',
  },
  {
    id: 'configuration',
    zh: '配置决定可解释性',
    en: 'Configuration defines interpretability',
    detail: 'as-designed、as-built、as-commissioned 与 as-operated 的线圈、电源、壁、诊断和标定持续变化。',
    detailEn: 'Coils, power supplies, walls, diagnostics and calibrations evolve across as-designed, as-built, as-commissioned and as-operated states.',
    implication: '所有数据和模型运行绑定有效配置区间与标定版本。',
    implicationEn: 'Bind every dataset and model run to a valid configuration interval and calibration version.',
  },
  {
    id: 'raw-derived',
    zh: '原始与派生必须分层',
    en: 'Raw and derived data must remain distinct',
    detail: 'EFIT、层析、剖面拟合和特征产品依赖算法、先验和版本；它们不是对原始信号的覆盖更新。',
    detailEn: 'EFIT, tomography, profile fits and feature products depend on algorithms, priors and versions; they are not in-place updates to raw signals.',
    implication: '保留源系统修订历史并生成策略强制锁定快照；校准、重构、仿真与合成数据使用独立命名空间。',
    implicationEn: 'Preserve source-system revisions and create policy-enforced locked snapshots; use separate namespaces for calibrated, reconstructed, simulated and synthetic data.',
  },
  {
    id: 'quality-uq',
    zh: '质量与不确定度是一等数据',
    en: 'Quality and uncertainty are first-class data',
    detail: '缺数、饱和、漂移、时钟偏差、插值、反演条件数和模型适用域会直接改变科学结论。',
    detailEn: 'Missingness, saturation, drift, clock offset, interpolation, inversion conditioning and model applicability directly affect scientific conclusions.',
    implication: '数值、质量标记、不确定度和处理记录共同发布。',
    implicationEn: 'Publish values together with quality flags, uncertainty and processing records.',
  },
  {
    id: 'volume-locality',
    zh: '大数组与数据局部性',
    en: 'Large arrays and data locality',
    detail: '长脉冲、高速成像、阵列诊断和三维网格使“把全部数据下载到客户端”不可持续。',
    detailEn: 'Long pulses, high-speed imaging, diagnostic arrays and 3-D meshes make full client-side downloads unsustainable.',
    implication: '分块、压缩、范围读取、近数据计算和分层缓存成为基础能力。',
    implicationEn: 'Chunking, compression, range reads, compute-to-data and tiered caching become foundational capabilities.',
  },
  {
    id: 'mixed-access',
    zh: '开放度与安全等级混合',
    en: 'Mixed openness and security levels',
    detail: '公开论文数据、联盟档案、装置运行数据、工程资产和安全相关配置具有不同授权边界。',
    detailEn: 'Public research data, consortium archives, facility operations, engineering assets and safety-related configurations have different authorization boundaries.',
    implication: '目录可发现不等于负载可下载；身份、用途、审计与导出策略必须解耦。',
    implicationEn: 'Catalogue discovery does not imply payload download; identity, purpose, audit and export policy must be separate.',
  },
  {
    id: 'reproducibility',
    zh: '可复现依赖完整血缘',
    en: 'Reproducibility depends on complete lineage',
    detail: '同一炮号在不同代码、配置、数据库版本和处理参数下会产生不同“真值”。',
    detailEn: 'The same pulse can yield different accepted results under different codes, configurations, database versions and processing parameters.',
    implication: '记录输入 ID/hash、代码提交、容器、配置、随机种子、输出与责任人。',
    implicationEn: 'Record input IDs/hashes, code commit, container, configuration, random seed, outputs and responsible owner.',
  },
  {
    id: 'ml-leakage',
    zh: '机器学习极易发生信息泄漏',
    en: 'Machine-learning leakage is easy',
    detail: '随机切分相邻时间点会把同一炮、同一实验日或同一壁状态同时放入训练与测试。',
    detailEn: 'Randomly splitting adjacent samples can put the same pulse, experimental day or wall state into both training and test sets.',
    implication: '按炮、实验批次、时间和装置隔离，保存稳定的基准切分与负例。',
    implicationEn: 'Split by pulse, campaign, time and facility, preserving stable benchmark partitions and negative cases.',
  },
  {
    id: 'authority',
    zh: '数据服务不等于控制授权',
    en: 'Data service is not control authority',
    detail: '网页、知识图谱、对象存储和大模型可以解释或建议，但不能成为 PCS 或安全联锁的隐式写通道。',
    detailEn: 'Web applications, knowledge graphs, object stores and language models may explain or advise, but must not become implicit write paths to the PCS or safety interlocks.',
    implication: '控制网独立；跨域默认只读，经认证实时服务另行设计和验收。',
    implicationEn: 'Keep the control network independent; cross-domain access is read-only by default, with separately engineered and qualified real-time services.',
  },
] as const;

const src = (
  label: string,
  labelEn: string,
  type: DataSource['type'],
  url: string,
): DataSource => ({ label, labelEn, type, url });

export const dataFoundationRecords: DataFoundationRecord[] = [
  {
    id: 'imas-data-dictionary', name: 'IMAS Data Dictionary', category: 'semantic-standard',
    layers: ['semantic-exchange', 'catalogue-lineage'], organization: 'ITER 组织', organizationEn: 'ITER Organization', region: '国际', regionEn: 'International', year: 2026,
    scope: '以机器无关的 Interface Data Structures（IDS）统一实验与仿真数据的结构、命名、单位和坐标语义。',
    scopeEn: 'Defines machine-agnostic Interface Data Structures (IDSs) for the structure, naming, units and coordinate semantics of experimental and simulated data.',
    objects: '平衡、磁测、剖面、源项、壁、线圈、控制、工作流元数据等 IDS。', objectsEn: 'Equilibrium, magnetics, profiles, sources, wall, coils, control and workflow metadata IDSs.',
    interfaces: ['XML schema', 'IDS', 'COCOS metadata'], technologies: ['Python package', 'XML/XSD', 'Sphinx'], devices: ['ITER', 'WEST', 'JET', 'MAST-U', 'STEP'], access: 'open', maturity: 'production',
    boundary: '它是公共语义模型，不替代装置原始档案、实时传输协议或质量审核；Data Dictionary 版本必须随数据保存。',
    boundaryEn: 'It is a common semantic model, not a replacement for facility raw archives, real-time transport or quality review; the Data Dictionary version must travel with the data.', interoperability: 5, lifecycleReach: 5,
    sources: [
      src('官方数据字典仓库', 'Official Data Dictionary repository', 'official-repository', 'https://github.com/iterorganization/IMAS-Data-Dictionary'),
      src('IMAS 数据字典文档', 'IMAS Data Dictionary documentation', 'official-docs', 'https://imas-data-dictionary.readthedocs.io/en/latest/'),
    ],
  },
  {
    id: 'imas-python', name: 'IMAS-Python', category: 'semantic-standard', layers: ['semantic-exchange', 'workflow-serving'], organization: 'ITER 组织', organizationEn: 'ITER Organization', region: '国际', regionEn: 'International', year: 2026,
    scope: 'IMAS 的开源 Python 接口，提供 IDS 创建、验证、读写、版本转换和多后端访问。', scopeEn: 'Open-source Python interface for creating, validating, reading, writing and converting IDS data across supported backends.',
    objects: '按 Data Dictionary 版本约束的 IDS 数据条目。', objectsEn: 'IDS entries constrained by a specific Data Dictionary version.', interfaces: ['IMAS API', 'HDF5 backend', 'NetCDF backend'], technologies: ['Python', 'C/C++ bindings'], devices: ['ITER', 'WEST', 'JET', 'MAST-U', 'STEP'], access: 'open', maturity: 'production',
    boundary: 'API 可用不代表数据已正确映射；装置信号、坐标、标定与质量规则仍需各装置负责。', boundaryEn: 'An available API does not prove a correct mapping; each facility remains responsible for signal semantics, coordinates, calibration and quality rules.', interoperability: 5, lifecycleReach: 4,
    sources: [src('官方仓库', 'Official repository', 'official-repository', 'https://github.com/iterorganization/IMAS-Python'), src('官方文档', 'Official documentation', 'official-docs', 'https://imas-python.readthedocs.io/')],
  },
  {
    id: 'scientific-storage-formats', name: 'HDF5 / Zarr / Apache Parquet', category: 'archive-access', layers: ['source-archive', 'federated-access', 'publication-reference'], organization: 'The HDF Group / Zarr community / Apache Software Foundation', organizationEn: 'The HDF Group / Zarr community / Apache Software Foundation', region: '国际', regionEn: 'International', year: 2026,
    scope: '分别提供分层科学文件、分块 N 维数组与列式分析数据的物理表示，可支撑 IMAS Data Entry、大对象和批量元数据产品。', scopeEn: 'Physical representations for hierarchical scientific files, chunked N-dimensional arrays and columnar analytical data, supporting IMAS Data Entries, large objects and bulk metadata products.',
    objects: 'group/dataset/attribute、chunked arrays、columnar tables、compression 和 schema metadata。', objectsEn: 'Groups, datasets, attributes, chunked arrays, columnar tables, compression and schema metadata.', interfaces: ['HDF5 API/VFL', 'Zarr specification', 'Apache Parquet format'], technologies: ['HDF5', 'Zarr', 'Parquet'], devices: ['Cross-facility scientific storage'], access: 'open', maturity: 'production',
    boundary: '它们回答“怎样存储”，不回答“数据在聚变物理上是什么意思”，也不天然提供不可变性；IMAS 语义、质量、权限、血缘以及 Object Lock/WORM 保留策略必须另行管理。', boundaryEn: 'They answer how data are stored, not what they mean in fusion physics, and do not inherently provide immutability; IMAS semantics, quality, authorization, provenance and Object-Lock/WORM retention remain separate responsibilities.', interoperability: 3, lifecycleReach: 4,
    sources: [src('HDF5 官方数据模型', 'Official HDF5 data model', 'official-docs', 'https://www.hdfgroup.org/solutions/hdf5/'), src('Zarr 官方规范', 'Official Zarr specification', 'standard', 'https://zarr-specs.readthedocs.io/en/latest/'), src('Apache Parquet 官方文档', 'Official Apache Parquet documentation', 'official-docs', 'https://parquet.apache.org/docs/')],
  },
  {
    id: 'omas', name: 'OMAS', category: 'semantic-standard', layers: ['semantic-exchange', 'workflow-serving'], organization: 'General Atomics Fusion Theory', organizationEn: 'General Atomics Fusion Theory', region: '美国', regionEn: 'United States', year: 2026,
    scope: 'Ordered Multidimensional Array Structure：在 Python 中实现 IMAS 兼容数据结构，并连接多种实验数据库与文件格式。', scopeEn: 'Ordered Multidimensional Array Structure: a Python implementation of IMAS-compatible data structures with connectors to multiple facility archives and file formats.',
    objects: '分层数组、装置映射、平衡/剖面/波形和代码输入输出。', objectsEn: 'Hierarchical arrays, machine mappings, equilibria, profiles, waveforms and code inputs/outputs.', interfaces: ['IMAS/IDS paths', 'HDF5', 'JSON', 'MDSplus connectors'], technologies: ['Python'], devices: ['DIII-D', 'NSTX-U', 'C-Mod', 'TCV', 'ITER'], access: 'open', maturity: 'production',
    boundary: 'OMAS 提供一致性检查和映射框架，但公开连接器的覆盖、版本和装置验证程度不一。', boundaryEn: 'OMAS provides consistency checks and a mapping framework, but connector coverage, versions and facility validation vary.', interoperability: 5, lifecycleReach: 3,
    sources: [src('官方仓库', 'Official repository', 'official-repository', 'https://github.com/gafusion/omas'), src('OMFIT/OMAS 映射课程', 'OMFIT/OMAS mapping courseware', 'official-docs', 'https://omfit.io/usage.html')],
  },
  {
    id: 'imasdd-jl', name: 'IMASdd.jl', category: 'semantic-standard', layers: ['semantic-exchange', 'workflow-serving'], organization: 'Project Torrey Pines', organizationEn: 'Project Torrey Pines', region: '国际', regionEn: 'International', year: 2026,
    scope: 'Julia 生态中的 IMAS Data Dictionary 对象模型，用于 FUSE 等多物理工作流的数据交换。', scopeEn: 'Julia object model for the IMAS Data Dictionary, used for data exchange in multi-physics workflows such as FUSE.',
    objects: 'IDS 对象、HDF5/JSON 数据与装置描述。', objectsEn: 'IDS objects, HDF5/JSON data and machine descriptions.', interfaces: ['IMAS paths', 'HDF5', 'JSON'], technologies: ['Julia'], devices: ['FUSE studies', 'ITER-oriented workflows'], access: 'open', maturity: 'research',
    boundary: '它是社区实现；与 ITER 官方访问层、Data Dictionary 版本和数值约定的一致性需在具体工作流中验证。', boundaryEn: 'It is a community implementation; compatibility with the official ITER access layer, Data Dictionary version and numerical conventions must be verified per workflow.', interoperability: 4, lifecycleReach: 4,
    sources: [src('官方项目仓库', 'Project repository', 'official-repository', 'https://github.com/ProjectTorreyPines/IMASdd.jl')],
  },
  {
    id: 'mdsplus', name: 'MDSplus', category: 'archive-access', layers: ['acquisition', 'source-archive', 'federated-access'], organization: 'MDSplus 项目', organizationEn: 'MDSplus Project', region: '国际', regionEn: 'International', year: 2026,
    scope: '面向复杂科学实验的采集、分层自描述存储与数据管理系统，是多台聚变装置的炮次档案基础。', scopeEn: 'Acquisition, self-describing hierarchical storage and data-management system for complex experiments; a core pulse archive at many fusion facilities.',
    objects: '树节点、波形、事件、分段连续数据、表达式与设备配置。', objectsEn: 'Tree nodes, waveforms, events, segmented continuous data, expressions and device configuration.', interfaces: ['Tree API', 'TDI expressions', 'Events', 'Segments'], technologies: ['C/C++', 'Java', 'Python', 'TCP/IP'], devices: ['DIII-D', 'C-Mod', 'NSTX-U', 'EAST', 'KSTAR', 'JET'], access: 'open', maturity: 'operational',
    boundary: '树结构通常具有强装置语义；MDSplus 允许写入、删除和可选版本控制，WRITE_ONCE 也不是独立 WORM 保证。进入不可变证据链前仍需权限隔离、锁定快照和独立哈希清单。', boundaryEn: 'Trees remain facility-specific. MDSplus permits writes and deletion with optional versioning, and WRITE_ONCE is not an independent WORM guarantee. Authorization isolation, a locked snapshot and an independent hash manifest are still required before evidence publication.', interoperability: 3, lifecycleReach: 3,
    sources: [src('官方文档', 'Official documentation', 'official-docs', 'https://www.mdsplus.org/index.php/Documentation'), src('官方数据版本说明', 'Official data-versioning guidance', 'official-docs', 'https://mdsplus.org/index.php/Documentation%3ATutorial%3AUsing_Data_Versioning'), src('官方源码', 'Official source code', 'official-repository', 'https://github.com/MDSplus/mdsplus')],
  },
  {
    id: 'uda', name: 'UDA / pyUDA', category: 'archive-access', layers: ['federated-access', 'semantic-exchange'], organization: '英国原子能管理局', organizationEn: 'UK Atomic Energy Authority', region: '英国', regionEn: 'United Kingdom', year: 2026,
    scope: '插件驱动的 Universal Data Access 客户端/服务端抽象，以统一数据对象访问不同后端，并用于 IMAS 相关数据交换。', scopeEn: 'Plugin-driven Universal Data Access client/server abstraction that exposes heterogeneous backends through a unified data object and supports IMAS-oriented exchange.',
    objects: '波形、数组、树结构、文件和插件返回对象。', objectsEn: 'Waveforms, arrays, hierarchical structures, files and plugin-returned objects.', interfaces: ['C++ API', 'Python pyUDA', 'HTTP wrapper', 'Cap’n Proto'], technologies: ['C++', 'C', 'Python'], devices: ['JET', 'MAST-U', 'ITER workshops'], access: 'open', maturity: 'production',
    boundary: 'UDA 是传输与抽象层；后端授权、元数据完整性和装置映射仍由数据提供方定义。', boundaryEn: 'UDA is a transport and abstraction layer; backend authorization, metadata completeness and machine mapping remain provider responsibilities.', interoperability: 4, lifecycleReach: 3,
    sources: [src('官方仓库', 'Official repository', 'official-repository', 'https://github.com/ukaea/UDA'), src('官方文档', 'Official documentation', 'official-docs', 'https://ukaea.github.io/UDA/')],
  },
  {
    id: 'w7x-archivedb', name: 'W7-X ArchiveDB', category: 'archive-access', layers: ['acquisition', 'source-archive', 'federated-access'], organization: '马克斯·普朗克等离子体物理研究所', organizationEn: 'Max Planck Institute for Plasma Physics', region: '德国', regionEn: 'Germany', year: 2020,
    scope: '为 Wendelstein 7-X 长脉冲连续采集设计的科学与技术数据档案，覆盖实验数据和连续机器数据。', scopeEn: 'Scientific and technical archive designed for Wendelstein 7-X long-pulse continuous acquisition, spanning experiment and continuous machine data.',
    objects: '连续波形、事件、机器运行数据与分析结果。', objectsEn: 'Continuous waveforms, events, machine-operation data and analysis products.', interfaces: ['Archive Web API', 'CoDaC services'], technologies: ['Distributed archive', 'Web services'], devices: ['Wendelstein 7-X'], access: 'controlled', maturity: 'operational',
    boundary: '其连续档案架构源于 W7-X 长脉冲要求；外部访问范围与 API 权限由 IPP 管理。', boundaryEn: 'Its continuous-archive architecture follows W7-X long-pulse requirements; external scope and API authorization are governed by IPP.', interoperability: 3, lifecycleReach: 4,
    sources: [src('ArchiveDB 原始论文入口', 'ArchiveDB primary paper entry', 'journal-paper', 'https://www.ipp.mpg.de/publication-search/4618303'), src('W7-X 连续采集技术报告', 'W7-X continuous acquisition report', 'technical-report', 'https://www.ipp.mpg.de/4204776/BoA_2.pdf')],
  },
  {
    id: 'fair-mast', name: 'FAIR-MAST', category: 'open-data', layers: ['source-archive', 'catalogue-lineage', 'workflow-serving', 'publication-reference'], organization: '英国原子能管理局', organizationEn: 'UK Atomic Energy Authority', region: '英国', regionEn: 'United Kingdom', year: 2025,
    scope: '面向 MAST 实验数据的 FAIR 数据管理与开放服务，使用关系元数据、Parquet/Zarr 对象和 REST/GraphQL 查询。', scopeEn: 'FAIR data-management and open-data service for MAST experiment data using relational metadata, Parquet/Zarr objects and REST/GraphQL queries.',
    objects: '炮次元数据、诊断信号、数组产品、标注与可下载对象。', objectsEn: 'Pulse metadata, diagnostic signals, array products, annotations and downloadable objects.', interfaces: ['REST', 'GraphQL', 'Parquet', 'Zarr'], technologies: ['Python', 'FastAPI', 'PostgreSQL', 'S3'], devices: ['MAST'], access: 'open', maturity: 'production',
    boundary: '公开服务覆盖经过策展的数据子集；原始档案的全部信号、权限和语义并不自动继承到开放层。', boundaryEn: 'The open service covers curated subsets; the complete raw archive, authorization model and semantics do not automatically transfer to the public layer.', interoperability: 4, lifecycleReach: 3,
    sources: [src('官方仓库', 'Official repository', 'official-repository', 'https://github.com/ukaea/fair-mast'), src('SoftwareX 平台论文', 'SoftwareX platform paper', 'journal-paper', 'https://doi.org/10.1016/j.softx.2024.101869')],
  },
  {
    id: 'toksearch', name: 'TokSearch', category: 'workflow-library', layers: ['federated-access', 'curated-product', 'workflow-serving'], organization: 'General Atomics Fusion Data Platform', organizationEn: 'General Atomics Fusion Data Platform', region: '美国', regionEn: 'United States', year: 2026,
    scope: '并行检索、处理和过滤任意维度聚变实验数据的 Python 包，面向多炮批处理与机器学习数据管线。', scopeEn: 'Python package for parallel retrieval, processing and filtering of arbitrary-dimensional fusion experimental data, targeting multi-shot processing and ML pipelines.',
    objects: '多炮信号、派生特征、过滤结果和分布式管线。', objectsEn: 'Multi-shot signals, derived features, filtered datasets and distributed pipelines.', interfaces: ['Python DataFrame-like pipeline', 'MDSplus adapters', 'Spark/Ray execution'], technologies: ['Python', 'Apache Spark', 'Ray'], devices: ['DIII-D', 'fusion-archive adapters'], access: 'open', maturity: 'production',
    boundary: '并行抽取提高吞吐，但不会解决信号语义、训练切分、标签偏差或跨装置质量一致性。', boundaryEn: 'Parallel extraction improves throughput but does not resolve signal semantics, train/test leakage, label bias or cross-facility quality consistency.', interoperability: 3, lifecycleReach: 2,
    sources: [src('官方文档', 'Official documentation', 'official-docs', 'https://ga-fdp.github.io/toksearch/2.2.X/'), src('官方仓库', 'Official repository', 'official-repository', 'https://github.com/GA-FDP/toksearch'), src('原始技术报告', 'Primary technical report', 'technical-report', 'https://www.osti.gov/servlets/purl/1436502')],
  },
  {
    id: 'omfit', name: 'OMFIT', category: 'workflow-library', layers: ['federated-access', 'semantic-exchange', 'curated-product', 'workflow-serving'], organization: 'OMFIT 协作组 / General Atomics', organizationEn: 'OMFIT collaboration / General Atomics', region: '国际', regionEn: 'International', year: 2026,
    scope: '把文件、数据、脚本和物理代码组织为 OMFIT-tree 的集成建模与实验分析框架，并连接 MDSplus、OMAS/IMAS。', scopeEn: 'Integrated modelling and experimental-analysis framework that organizes files, data, scripts and physics codes in an OMFIT tree, with MDSplus and OMAS/IMAS integration.',
    objects: '分层对象、实验数据、代码输入输出、脚本和可复现项目快照。', objectsEn: 'Hierarchical objects, experimental data, code inputs/outputs, scripts and reproducible project snapshots.', interfaces: ['OMFIT-tree', 'MDSplus', 'OMAS/IMAS', 'file adapters'], technologies: ['Python', 'Tk/GUI', 'HPC adapters'], devices: ['DIII-D', 'NSTX-U', 'C-Mod', 'ITER studies'], access: 'registered', maturity: 'operational',
    boundary: '框架源码访问受用户协议约束；项目可复现仍依赖外部代码版本、数据库权限和用户保存的配置。', boundaryEn: 'Framework source access is governed by a user agreement; reproducibility still depends on external code versions, database permissions and saved configuration.', interoperability: 4, lifecycleReach: 3,
    sources: [src('官方主页', 'Official project site', 'official-docs', 'https://omfit.io/'), src('数据管理文档', 'Data-management documentation', 'official-docs', 'https://omfit.io/knowledge.html'), src('原始 Nuclear Fusion 论文', 'Primary Nuclear Fusion paper', 'journal-paper', 'https://doi.org/10.1088/0029-5515/55/8/083008')],
  },
  {
    id: 'fusion-data-platform', name: 'Fusion Data Platform (FDP)', category: 'workflow-library', layers: ['federated-access', 'curated-product', 'workflow-serving'], organization: 'PPPL / Fusion Data Platform', organizationEn: 'PPPL / Fusion Data Platform', region: '美国', regionEn: 'United States', year: 2017,
    scope: '面向 NSTX-U 等装置的数据检索和分析框架，代表了早期把装置档案抽象为可编程数据处理平台的路线。', scopeEn: 'Data-retrieval and analysis framework for facilities including NSTX-U, representing an earlier programmable abstraction over facility archives.',
    objects: '炮次信号、分析对象与批处理任务。', objectsEn: 'Pulse signals, analysis objects and batch-processing tasks.', interfaces: ['Python API', 'MDSplus'], technologies: ['Python'], devices: ['NSTX-U'], access: 'open', maturity: 'legacy',
    boundary: '文档与依赖体现历史环境，不能直接视为现代生产基线；其数据抽象思想由 TokSearch、FAIR-MAST 等后续路线继续发展。', boundaryEn: 'Documentation and dependencies reflect a historical environment and should not be treated as a modern production baseline; later systems continue its abstraction ideas.', interoperability: 2, lifecycleReach: 2,
    sources: [src('官方仓库', 'Official repository', 'official-repository', 'https://github.com/Fusion-Data-Platform/fdp'), src('官方文档', 'Official documentation', 'official-docs', 'https://fdp.readthedocs.io/')],
  },
  {
    id: 'openstep', name: 'OpenSTEP SPP-001', category: 'open-data', layers: ['semantic-exchange', 'curated-product', 'catalogue-lineage', 'publication-reference'], organization: '英国原子能管理局', organizationEn: 'UK Atomic Energy Authority', region: '英国', regionEn: 'United Kingdom', year: 2025,
    scope: 'STEP 原型电厂 SPP-001 的策展仿真数据发布，以 IMAS HDF5 和 NetCDF 条目提供平衡、剖面、源项与壁数据。', scopeEn: 'Curated simulation-data release for the STEP prototype power plant SPP-001, providing equilibrium, profiles, sources and wall data as IMAS HDF5 and NetCDF entries.',
    objects: '自由/固定边界平衡、core_profiles、core_sources、core_transport、wall。', objectsEn: 'Free/fixed-boundary equilibrium, core_profiles, core_sources, core_transport and wall IDSs.', interfaces: ['IMAS DD3', 'HDF5', 'NetCDF', 'COCOS metadata'], technologies: ['IMAS-Python', 'Jupyter'], devices: ['STEP SPP-001 design'], access: 'open', maturity: 'research',
    boundary: '这是特定设计成熟度与场景的仿真快照，不代表当前 STEP 设计，也不是实验验证数据。', boundaryEn: 'This is a simulation snapshot for a stated design maturity and scenario; it is neither the current STEP design nor experimental validation data.', interoperability: 5, lifecycleReach: 4,
    sources: [src('官方数据仓库', 'Official data repository', 'official-repository', 'https://github.com/ukaea/OpenSTEP'), src('数据集 DOI', 'Dataset DOI', 'data-portal', 'https://doi.org/10.14468/07jt-s540')],
  },
  {
    id: 'eurofusion-fair-catalogue', name: 'EUROfusion FAIR Data Catalogue', category: 'open-data', layers: ['catalogue-lineage', 'publication-reference'], organization: 'EUROfusion / CEA-IRFM', organizationEn: 'EUROfusion / CEA-IRFM', region: '欧洲', regionEn: 'Europe', year: 2023,
    scope: '面向欧洲聚变实验的集中元数据目录路线：用 IMAS 提升互操作性，并把来源、生命周期、持久标识和论文关联纳入 FAIR 治理。', scopeEn: 'Central metadata-catalogue route for European fusion experiments, using IMAS for interoperability and capturing provenance, lifecycle, persistent identifiers and publication links.',
    objects: '实验元数据、数据集身份、来源、注释和出版物关联。', objectsEn: 'Experiment metadata, dataset identity, provenance, annotations and publication links.', interfaces: ['IMAS', 'Persistent identifiers', 'Metadata catalogue'], technologies: ['Catalogue services'], devices: ['WEST', 'European facilities'], access: 'consortium', maturity: 'research',
    boundary: '集中目录提升可发现性，但目录中的元数据不等于所有实验负载都公开；访问权仍由装置和联盟政策决定。', boundaryEn: 'A central catalogue improves discovery but does not make every experimental payload public; access remains governed by facility and consortium policy.', interoperability: 5, lifecycleReach: 4,
    sources: [src('CEA 官方 FAIR 数据说明', 'CEA official FAIR-data article', 'official-docs', 'https://www.cea.fr/drf/Pages/Actualites/En-direct-des-labos/2022/les-donnees-de-west-sont-fair.aspx')],
  },
  {
    id: 'cmod-public-data', name: 'Alcator C-Mod Public Data', category: 'open-data', layers: ['source-archive', 'federated-access', 'publication-reference'], organization: 'MIT Plasma Science and Fusion Center', organizationEn: 'MIT Plasma Science and Fusion Center', region: '美国', regionEn: 'United States', year: 2026,
    scope: 'C-Mod 的公共数据入口和 MDSplus 访问说明，为公开炮次数据、树结构和分析工具提供装置级范例。', scopeEn: 'Public C-Mod data entry point and MDSplus access guidance, providing a facility-level example of open pulse data, tree structures and analysis tools.',
    objects: 'MDSplus 炮次树、诊断波形与分析数据。', objectsEn: 'MDSplus pulse trees, diagnostic waveforms and analysis data.', interfaces: ['MDSplus', 'Remote data access'], technologies: ['MDSplus clients'], devices: ['Alcator C-Mod'], access: 'open', maturity: 'operational',
    boundary: '公共访问并不消除信号解释、质量、标定和引用装置文档的责任。', boundaryEn: 'Public access does not remove the need to interpret signals, quality and calibration or to cite facility documentation.', interoperability: 2, lifecycleReach: 2,
    sources: [src('MIT PSFC 官方数据页', 'MIT PSFC official data page', 'data-portal', 'https://www1.psfc.mit.edu/research/alcator/data/index.html')],
  },
  {
    id: 'diiid-data-management', name: 'DIII-D Data Management', category: 'governance-report', layers: ['source-archive', 'federated-access', 'catalogue-lineage'], organization: 'General Atomics DIII-D National Fusion Facility', organizationEn: 'General Atomics DIII-D National Fusion Facility', region: '美国', regionEn: 'United States', year: 2026,
    scope: 'DIII-D 的数据管理计划与计算入口，定义实验数据、分析环境、访问和长期管理责任。', scopeEn: 'DIII-D data-management plan and computing entry points defining responsibilities for experimental data, analysis environments, access and long-term stewardship.',
    objects: '炮次数据、分析结果、软件、元数据和项目记录。', objectsEn: 'Pulse data, analysis products, software, metadata and project records.', interfaces: ['MDSplus', 'Facility computing services'], technologies: ['MDSplus', 'HPC/interactive services'], devices: ['DIII-D'], access: 'controlled', maturity: 'operational',
    boundary: '装置计算服务和数据访问面向获批用户；公开计划描述治理责任，不等于开放全部数据负载。', boundaryEn: 'Facility computing and data services are for authorized users; a public plan describes stewardship but does not open every payload.', interoperability: 2, lifecycleReach: 4,
    sources: [src('官方数据管理计划', 'Official Data Management Plan', 'official-docs', 'https://fusion.gat.com/global/diii-d/dmp'), src('官方计算入口', 'Official computing entry point', 'official-docs', 'https://fusion.gat.com/global/computing')],
  },
  {
    id: 'itpa-disruption-database', name: 'ITPA Disruption Database', category: 'open-data', layers: ['source-archive', 'catalogue-lineage', 'publication-reference'], organization: 'ITPA MHD / General Atomics', organizationEn: 'ITPA MHD / General Atomics', region: '国际', regionEn: 'International', year: 2026,
    scope: '跨装置破裂数据库，将 MDSplus 波形与 SQL 关系元数据结合，用于破裂特征、缓解和机器学习研究。', scopeEn: 'Cross-facility disruption database combining MDSplus waveforms with SQL relational metadata for disruption characterization, mitigation and machine-learning studies.',
    objects: '破裂炮次、波形、事件标签、标量元数据和装置映射。', objectsEn: 'Disruption pulses, waveforms, event labels, scalar metadata and facility mappings.', interfaces: ['MDSplus', 'SQL', 'Web portal'], technologies: ['MDSplus', 'Relational database'], devices: ['JET', 'DIII-D', 'C-Mod', 'ASDEX Upgrade', 'TCV', 'KSTAR and contributors'], access: 'registered', maturity: 'research',
    boundary: '跨装置标签和信号选择不天然同质；任何预测基准都必须审计装置覆盖、时间泄漏、缺失值和事件定义。', boundaryEn: 'Cross-facility labels and signal selections are not inherently homogeneous; prediction benchmarks must audit facility coverage, temporal leakage, missingness and event definitions.', interoperability: 4, lifecycleReach: 2,
    sources: [src('官方数据库入口与 FAQ', 'Official database portal and FAQ', 'data-portal', 'https://fusion.gat.com/itpa-ddb/Home/')],
  },
  {
    id: 'disruptionpy', name: 'DisruptionPy', category: 'workflow-library', layers: ['federated-access', 'curated-product', 'catalogue-lineage', 'workflow-serving'], organization: 'MIT Plasma Science and Fusion Center', organizationEn: 'MIT Plasma Science and Fusion Center', region: '美国', regionEn: 'United States', year: 2026,
    scope: '以物理特征方法、装置数据库适配器和可复现配置构建破裂分析数据集的开源 Python 框架。', scopeEn: 'Open-source Python framework for building disruption-analysis datasets from physics feature methods, facility database adapters and reproducible configuration.',
    objects: '炮次列表、原始信号、物理特征、质量标记和表格数据集。', objectsEn: 'Pulse lists, raw signals, physics features, quality flags and tabular datasets.', interfaces: ['Facility-specific database adapters', 'Python API', 'DataFrame output'], technologies: ['Python', 'SQLAlchemy', 'MDSplus adapters'], devices: ['Alcator C-Mod', 'DIII-D', 'EAST', 'HBT-EP', 'MAST'], access: 'open', maturity: 'research',
    boundary: '开源的是处理框架，不是底层实验数据；各装置服务器仍按各自政策授权。统一软件接口也不保证统一标签、校准或特征有效域。', boundaryEn: 'The processing framework is open source, not the underlying experimental data; each facility server retains its own authorization policy. A common software interface also does not guarantee common labels, calibration or feature validity.', interoperability: 4, lifecycleReach: 2,
    sources: [src('官方仓库', 'Official repository', 'official-repository', 'https://github.com/MIT-PSFC/disruption-py'), src('JOSS 软件论文', 'JOSS software paper', 'journal-paper', 'https://doi.org/10.21105/joss.09364')],
  },
  {
    id: 'disruptionbench', name: 'DisruptionBench', category: 'workflow-library', layers: ['curated-product', 'catalogue-lineage', 'publication-reference'], organization: 'MIT Plasma Science and Fusion Center', organizationEn: 'MIT Plasma Science and Fusion Center', region: '美国', regionEn: 'United States', year: 2026,
    scope: '面向跨装置破裂预测的可复现评测代码，约束用户自备数据的预处理、划分、指标和模型比较。', scopeEn: 'Reproducible evaluation code for cross-facility disruption prediction, constraining preprocessing, partitions, metrics and model comparison over user-supplied data.',
    objects: '评测配置、数据接口、切分逻辑、模型输入合同和评测结果；仓库不附带底层实验数据。', objectsEn: 'Evaluation configuration, data interfaces, partition logic, model-input contracts and results; the repository does not ship the underlying experimental data.', interfaces: ['Python benchmark API', 'User-supplied datasets'], technologies: ['Python', 'PyTorch'], devices: ['User-provided facility data'], access: 'open', maturity: 'legacy',
    boundary: '“公开”仅指代码仓库。仓库已于 2025 年 7 月归档且要求用户自行提供数据；底层装置数据的授权、标签质量和可比性必须单独审核，不能外推到实时保护。', boundaryEn: '“Open” applies only to the code repository. It was archived in July 2025 and requires users to supply their own data; authorization, label quality and comparability of facility data require separate review and cannot be extrapolated to real-time protection.', interoperability: 4, lifecycleReach: 2,
    sources: [src('官方仓库', 'Official repository', 'official-repository', 'https://github.com/MIT-PSFC/DisruptionBench')],
  },
  {
    id: 'west-imas-data', name: 'WEST native IMAS data route', category: 'governance-report', layers: ['semantic-exchange', 'curated-product', 'catalogue-lineage'], organization: 'CEA-IRFM', organizationEn: 'CEA-IRFM', region: '法国', regionEn: 'France', year: 2023,
    scope: 'WEST 以 IMAS 原生访问和处理装置数据，并把完整壁面三维网格、材料和几何属性写入标准数据结构。', scopeEn: 'WEST uses IMAS natively for facility data access and processing, including a full 3-D wall surface mesh with material and geometric properties.',
    objects: '装置数据、三维壁面节点/三角形、材料和合成诊断几何。', objectsEn: 'Facility data, 3-D wall nodes/triangles, materials and synthetic-diagnostic geometry.', interfaces: ['IMAS IDS', '3-D wall geometry'], technologies: ['IMAS', 'CAD defeaturing', 'meshing'], devices: ['WEST'], access: 'controlled', maturity: 'operational',
    boundary: '报告证明可行性和装置采用，不代表所有 WEST 数据或几何均公开；几何简化与材料版本必须可追溯。', boundaryEn: 'The report demonstrates feasibility and facility adoption, not public access to all WEST data or geometry; geometry simplification and material versions must remain traceable.', interoperability: 5, lifecycleReach: 4,
    sources: [src('CEA-IRFM 2020–2023 进展报告', 'CEA-IRFM 2020–2023 progress report', 'technical-report', 'https://irfm.cea.fr/wp-content/uploads/2024/09/IRFM-RA-2020-23-EN-web-2.pdf')],
  },
  {
    id: 'open-adas', name: 'OPEN-ADAS', category: 'reference-database', layers: ['publication-reference', 'workflow-serving'], organization: 'ADAS 项目 / IAEA', organizationEn: 'ADAS Project / IAEA', region: '国际', regionEn: 'International', year: 2026,
    scope: '公开检索和下载部分 ADAS 原子数据及读取例程，服务光谱、杂质、束发射和碰撞辐射分析。', scopeEn: 'Public search and guided download of selected ADAS atomic data and readers for spectroscopy, impurities, beam emission and collisional-radiative analysis.',
    objects: 'ADF01/04/07/08/09/11/12/13/15/21/22/38/39/48 等原子数据类。', objectsEn: 'Atomic data classes including ADF01/04/07/08/09/11/12/13/15/21/22/38/39/48.', interfaces: ['ADF formats', 'Download/search portal', 'Reader routines'], technologies: ['Structured text data', 'Fortran/Python readers'], devices: ['Cross-device diagnostic analysis'], access: 'open-conditional', maturity: 'production',
    boundary: 'OPEN-ADAS 只提供精选子集，下载文件限个人使用；商业使用、网页嵌入或再分发需书面许可。系数适用条件和版本仍须由专业人员确认。', boundaryEn: 'OPEN-ADAS provides a selected subset and limits downloaded files to personal use; commercial use, website embedding or redistribution requires written permission. Coefficient applicability and version still require specialist review.', interoperability: 3, lifecycleReach: 3,
    sources: [src('官方数据库', 'Official database', 'data-portal', 'https://open.adas.ac.uk/'), src('数据范围说明', 'Scope and data-class description', 'official-docs', 'https://open.adas.ac.uk/about-open-adas'), src('使用条款', 'Terms and conditions', 'official-docs', 'https://open.adas.ac.uk/terms-and-conditions')],
  },
  {
    id: 'fendl', name: 'FENDL', category: 'reference-database', layers: ['publication-reference', 'workflow-serving'], organization: '国际原子能机构核数据司', organizationEn: 'IAEA Nuclear Data Section', region: '国际', regionEn: 'International', year: 2024,
    scope: 'Fusion Evaluated Nuclear Data Library：经评估和基准验证的聚变中子、光子、活化、衰变与剂量数据集合。', scopeEn: 'Fusion Evaluated Nuclear Data Library: evaluated and benchmarked neutron, photon, activation, decay and dosimetry data for fusion technology.',
    objects: 'ENDF 评价、处理库、协方差、积分实验基准与反应截面。', objectsEn: 'ENDF evaluations, processed libraries, covariance data, integral benchmarks and reaction cross sections.', interfaces: ['ENDF-6', 'ACE and processed libraries'], technologies: ['Nuclear-data processing'], devices: ['ITER design', 'fusion neutronics'], access: 'open', maturity: 'production',
    boundary: '核数据库版本、温度处理、截面库和输运代码共同影响结果；FENDL 不能替代具体模型的验证与不确定度传播。', boundaryEn: 'Library version, temperature processing, cross-section representation and transport code all affect results; FENDL does not replace model validation and uncertainty propagation.', interoperability: 4, lifecycleReach: 5,
    sources: [src('IAEA FENDL 官方入口', 'IAEA FENDL official portal', 'data-portal', 'https://www-nds.iaea.org/fendl/'), src('FENDL 参考说明', 'FENDL reference description', 'technical-report', 'https://www-nds.iaea.org/fendl3/bg-infos.html')],
  },
  {
    id: 'iaea-amdis', name: 'IAEA AMDIS / ALADDIN', category: 'reference-database', layers: ['publication-reference'], organization: '国际原子能机构原子与分子数据处', organizationEn: 'IAEA Atomic and Molecular Data Unit', region: '国际', regionEn: 'International', year: 2026,
    scope: '面向聚变等离子体的原子、分子与等离子体—表面相互作用数据网络和检索入口。', scopeEn: 'Atomic, molecular and plasma–surface interaction data networks and retrieval services for fusion-plasma applications.',
    objects: '碰撞截面、反应速率、粒子—表面数据、书目和评价数据。', objectsEn: 'Collision cross sections, reaction rates, particle–surface data, bibliographic and evaluated data.', interfaces: ['Web retrieval', 'Structured nuclear/atomic records'], technologies: ['Curated scientific databases'], devices: ['Cross-device modelling and diagnostics'], access: 'open', maturity: 'production',
    boundary: '不同子库具有不同评价状态、覆盖和格式；使用前需核对反应、能区、温度和数据来源。', boundaryEn: 'Sublibraries differ in evaluation status, coverage and format; users must verify reaction, energy range, temperature and provenance.', interoperability: 3, lifecycleReach: 4,
    sources: [src('IAEA AMDIS 官方入口', 'IAEA AMDIS official portal', 'data-portal', 'https://amdis.iaea.org/'), src('IAEA 核数据与聚变数据库概览', 'IAEA overview of nuclear and fusion databases', 'technical-report', 'https://www-nds.iaea.org/nrdc/nrdc_2024/present/nds.pdf')],
  },
  {
    id: 'exfor', name: 'EXFOR', category: 'reference-database', layers: ['publication-reference'], organization: '国际核反应数据中心网络 / IAEA', organizationEn: 'International Network of Nuclear Reaction Data Centres / IAEA', region: '国际', regionEn: 'International', year: 2026,
    scope: '实验核反应数据交换库，可为聚变中子学、材料活化和核数据评价提供原始实验依据。', scopeEn: 'Exchange library of experimental nuclear-reaction data supporting fusion neutronics, materials activation and nuclear-data evaluation.',
    objects: '实验截面、角分布、谱、实验条件和文献元数据。', objectsEn: 'Experimental cross sections, angular distributions, spectra, experimental conditions and bibliographic metadata.', interfaces: ['EXFOR exchange format', 'Web/API retrieval'], technologies: ['Curated nuclear-data exchange'], devices: ['Fusion neutronics and materials programmes'], access: 'open', maturity: 'production',
    boundary: 'EXFOR 收录原始实验数据，不等同于已评估设计库；工程分析通常应使用经评价并验证的 FENDL 等库。', boundaryEn: 'EXFOR contains experimental records, not an evaluated design library; engineering analysis normally requires evaluated and validated libraries such as FENDL.', interoperability: 3, lifecycleReach: 4,
    sources: [src('IAEA EXFOR 官方入口', 'IAEA EXFOR official portal', 'data-portal', 'https://www-nds.iaea.org/exfor/')],
  },
  {
    id: 'iter-software-infrastructure', name: 'ITER IMAS software infrastructure & provenance', category: 'governance-report', layers: ['semantic-exchange', 'catalogue-lineage', 'workflow-serving'], organization: 'ITER 组织', organizationEn: 'ITER Organization', region: '国际', regionEn: 'International', year: 2025,
    scope: 'ITER 官方软件基础设施报告把 Data Dictionary 版本、输入输出、配置、质量、使用和运行血缘作为可复现实验/模拟的组成部分。', scopeEn: 'ITER software-infrastructure reporting treats Data Dictionary version, inputs/outputs, configuration, quality, usage and run lineage as parts of reproducible experimental and simulation records.',
    objects: '工作流运行、代码参数、数据版本、质量、用途与来源关系。', objectsEn: 'Workflow runs, code parameters, data versions, quality, usage and provenance relationships.', interfaces: ['IMAS workflow metadata', 'Provenance records'], technologies: ['IMAS ecosystem'], devices: ['ITER', 'IMAS adopters'], access: 'open', maturity: 'research',
    boundary: '记录血缘是必要条件而非科学验证本身；结果仍需数值 V&V、实验校核、适用域与责任审核。', boundaryEn: 'Recorded lineage is necessary but not equivalent to scientific validation; results still require numerical V&V, experimental comparison, applicability and accountable review.', interoperability: 5, lifecycleReach: 5,
    sources: [src('ITER 官方 IMAS 软件基础设施报告', 'ITER official IMAS software-infrastructure report', 'technical-report', 'https://www.iter.org/sites/default/files/media/2025-07/l-2_hoenen.pdf'), src('IMAS 开源发布说明', 'IMAS open-source release', 'official-docs', 'https://www.iter.org/node/20687/release-imas-infrastructure-and-physics-models-open-source')],
  },
  {
    id: 'imas-codex', name: 'IMAS Codex', category: 'workflow-library', layers: ['semantic-exchange', 'catalogue-lineage', 'workflow-serving'], organization: 'ITER 组织', organizationEn: 'ITER Organization', region: '国际', regionEn: 'International', year: 2026,
    scope: '以 MCP、图索引和语义搜索向 AI 助手提供 IMAS Data Dictionary 与受控装置数据探索能力。', scopeEn: 'MCP, graph indexing and semantic search for AI-assisted exploration of the IMAS Data Dictionary and controlled facility data.',
    objects: 'IDS 路径、文档、语义索引、装置图和数据探索配置。', objectsEn: 'IDS paths, documentation, semantic indexes, facility graphs and data-exploration profiles.', interfaces: ['MCP', 'Neo4j', 'IMAS DD', 'Streamable HTTP/stdio'], technologies: ['Python', 'Neo4j', 'embeddings'], devices: ['ITER', 'TCV graph package', 'facility-specific profiles'], access: 'open', maturity: 'emerging',
    boundary: '这是快速演进的辅助层；必须使用只读模式、装置隔离包和权限控制，LLM 输出不得改写权威数据或成为控制判据。', boundaryEn: 'This is a fast-moving assistance layer. Use read-only mode, facility-scoped graph packages and authorization; LLM output must not overwrite authoritative data or become a control criterion.', interoperability: 5, lifecycleReach: 3,
    sources: [src('ITER 官方仓库', 'ITER official repository', 'official-repository', 'https://github.com/iterorganization/IMAS-Codex')],
  },
  {
    id: 'fair4fusion', name: 'FAIR4Fusion Blueprint', category: 'governance-report', layers: ['semantic-exchange', 'catalogue-lineage', 'publication-reference'], organization: 'EU FAIR4Fusion consortium', organizationEn: 'EU FAIR4Fusion consortium', region: '欧洲', regionEn: 'Europe', year: 2022,
    scope: '提出“站点元数据摄取—中央服务—检索与访问”的联邦参考架构，以 IMAS 作为共同本体并保留站点治理权。', scopeEn: 'Federated reference architecture spanning site metadata ingestion, central services, and search/access, using IMAS as a shared ontology while retaining site governance.',
    objects: '实验/仿真数据集、元数据、许可、PID、来源和访问策略。', objectsEn: 'Experimental/simulation datasets, metadata, licences, PIDs, provenance and access policies.', interfaces: ['IMAS', 'Metadata catalogue', 'PID', 'Federated access'], technologies: ['Metadata ingestion', 'Central catalogue'], devices: ['European fusion facilities'], access: 'open', maturity: 'research',
    boundary: '这是已结题项目的参考架构和示范，不是欧洲所有装置已全面部署的生产平台；FAIR 也不等于匿名开放。', boundaryEn: 'This is a completed project blueprint and demonstrator, not a fully deployed production platform for every European facility; FAIR does not imply anonymous openness.', interoperability: 5, lifecycleReach: 5,
    sources: [src('EU CORDIS 项目结果', 'EU CORDIS project results', 'official-docs', 'https://cordis.europa.eu/project/id/847612/results'), src('FAIR4Fusion Blueprint', 'FAIR4Fusion Blueprint', 'technical-report', 'https://zenodo.org/records/6759119')],
  },
  {
    id: 'fusionprov', name: 'fusionprov / W3C PROV', category: 'governance-report', layers: ['catalogue-lineage', 'publication-reference'], organization: 'FAIR4Fusion / W3C', organizationEn: 'FAIR4Fusion / W3C', region: '国际', regionEn: 'International', year: 2022,
    scope: '用 W3C PROV 的 Entity–Activity–Agent 模型表达信号、分析任务、代码、输入输出和责任主体之间的可机读血缘。', scopeEn: 'Machine-readable lineage for signals, analysis tasks, code, inputs/outputs and accountable actors using the W3C PROV Entity–Activity–Agent model.',
    objects: '数据实体、处理活动、软件/人员代理与派生/使用关系。', objectsEn: 'Data entities, processing activities, software/human agents and derivation/use relationships.', interfaces: ['PROV-DM', 'PROV-O', 'RDF', 'JSON/XML'], technologies: ['Semantic web', 'Python prototype'], devices: ['Cross-facility workflows'], access: 'open', maturity: 'research',
    boundary: '血缘回答“如何得到”，并不证明物理正确；必须真正采集代码版本、参数、容器、校准和输入 URI。', boundaryEn: 'Provenance answers how a result was produced, not whether it is physically correct; code version, parameters, container, calibration and input URIs must actually be captured.', interoperability: 5, lifecycleReach: 5,
    sources: [src('W3C PROV 标准', 'W3C PROV standard', 'standard', 'https://www.w3.org/TR/prov-overview/'), src('fusionprov 代码', 'fusionprov source code', 'official-repository', 'https://gitlab.com/fair-for-fusion/fusionprov')],
  },
  {
    id: 'iter-codac', name: 'ITER CODAC Core System / PCDH', category: 'archive-access', layers: ['acquisition', 'source-archive', 'catalogue-lineage'], organization: 'ITER 组织', organizationEn: 'ITER Organization', region: '国际', regionEn: 'International', year: 2026,
    scope: 'ITER 装置控制与数据采集体系，规范 process variables、告警、事件、配置和快慢控制接口，并建设中央归档。', scopeEn: 'ITER control and data-acquisition ecosystem governing process variables, alarms, events, configuration and fast/slow control interfaces with central archiving.',
    objects: 'PV、告警、事件、控制配置、实时/原始科学数据和归档机器数据。', objectsEn: 'PVs, alarms, events, control configuration, real-time/raw scientific data and archived plant data.', interfaces: ['EPICS 7 CA/PVA', 'pvData', 'PLC/fast-controller interfaces', 'PCDH'], technologies: ['EPICS', 'Phoebus', 'Real-time framework'], devices: ['ITER'], access: 'controlled', maturity: 'operational',
    boundary: 'CODAC/EPICS 服务运行平面；PV 到 IMAS IDS 的映射必须确定、版本化并保留时间同步、校准和质量位。网页与 AI 不进入安全控制写路径。', boundaryEn: 'CODAC/EPICS serves the operational plane. PV-to-IMAS mappings must be deterministic and versioned with timing, calibration and quality. Web and AI systems do not enter safety-control write paths.', interoperability: 3, lifecycleReach: 5,
    sources: [src('ITER CODAC 官方页', 'ITER CODAC official page', 'official-docs', 'https://www.iter.org/machine/supporting-systems/codac/codac-core-system'), src('CODAC Core System Overview 7.5', 'CODAC Core System Overview 7.5', 'technical-report', 'https://www.iter.org/sites/default/files/media/2026-03/codac_core_system_overview_34sdz5_v7_5.pdf')],
  },
  {
    id: 'epics-7', name: 'EPICS 7 / pvAccess / pvData', category: 'archive-access', layers: ['acquisition', 'federated-access'], organization: 'EPICS Collaboration', organizationEn: 'EPICS Collaboration', region: '国际', regionEn: 'International', year: 2026,
    scope: '大科学装置广泛采用的分布式控制数据协议与软件栈，提供 PV、时间戳、告警和结构化 normative types。', scopeEn: 'Distributed control-data protocol and software stack widely used by large scientific facilities, providing PVs, timestamps, alarms and structured normative types.',
    objects: '标量/数组 PV、alarm、timestamp、NTScalar/NTNDArray 等结构化对象。', objectsEn: 'Scalar/array PVs, alarms, timestamps and structured objects such as NTScalar and NTNDArray.', interfaces: ['Channel Access', 'pvAccess', 'pvData'], technologies: ['C/C++', 'Java', 'Python clients'], devices: ['ITER CODAC', 'KSTAR and many facilities'], access: 'open', maturity: 'production',
    boundary: 'PV namespace 通常是装置私有的运行语义；高性能传输不自动提供炮次上下文、IMAS 物理对象或长期可复现性。', boundaryEn: 'PV namespaces usually encode facility-private operational semantics. Efficient transport does not automatically provide pulse context, IMAS physics objects or long-term reproducibility.', interoperability: 2, lifecycleReach: 3,
    sources: [src('EPICS Base 官方仓库', 'EPICS Base official repository', 'official-repository', 'https://github.com/epics-base/epics-base'), src('pvAccess 协议', 'pvAccess protocol', 'standard', 'https://docs.epics-controls.org/en/latest/pv-access/protocol.html')],
  },
  {
    id: 'epics-archiver', name: 'EPICS Archiver Appliance', category: 'archive-access', layers: ['acquisition', 'source-archive', 'federated-access'], organization: 'EPICS Archiver Appliance project', organizationEn: 'EPICS Archiver Appliance project', region: '国际', regionEn: 'International', year: 2026,
    scope: '面向大规模工程/控制 PV 的分层时序归档，支持订阅、降采样和 HTTP 检索。', scopeEn: 'Tiered time-series archive for large engineering/control PV populations, with subscriptions, downsampling and HTTP retrieval.',
    objects: 'PV 值、时间戳、alarm/status 和结构化 PVA 数据。', objectsEn: 'PV values, timestamps, alarm/status and structured PVA data.', interfaces: ['CA/PVA', 'HTTP retrieval', 'JSON/CSV/MAT/RAW/Parquet'], technologies: ['Java', 'time-series storage'], devices: ['EPICS-based facilities'], access: 'open', maturity: 'production',
    boundary: '适合工程趋势和控制归档，但管理接口允许删除 PV，分层迁移也可降采样/转换；只有原样导出并经 WORM/Object Lock、哈希清单和审计锁定的快照才能作为不可变证据。', boundaryEn: 'Suitable for engineering trends and control archives, but administration can delete PVs and tier migration may downsample or transform data. Only an exact export locked by WORM/Object Lock, a hash manifest and audit controls can serve as immutable evidence.', interoperability: 2, lifecycleReach: 4,
    sources: [src('官方文档', 'Official documentation', 'official-docs', 'https://epicsarchiver.readthedocs.io/en/latest/'), src('官方管理文档', 'Official administration documentation', 'official-docs', 'https://epicsarchiver.readthedocs.io/en/latest/sysadmin/admin.html'), src('官方仓库', 'Official repository', 'official-repository', 'https://github.com/archiver-appliance/epicsarchiverap')],
  },
  {
    id: 'iaea-fusion-data-lake', name: 'IAEA Fusion Data Lake', category: 'open-data', layers: ['federated-access', 'catalogue-lineage', 'publication-reference'], organization: '国际原子能机构', organizationEn: 'International Atomic Energy Agency', region: '国际', regionEn: 'International', year: 2026,
    scope: '面向多装置的中央可查询目录、分布式数据联邦和中期中央存储，用于 AI 与跨装置研究。', scopeEn: 'Multi-facility initiative combining a centrally searchable catalogue, distributed federation and medium-term central storage for AI and cross-facility research.',
    objects: '装置、炮次、诊断信号目录、策展数据集与联邦位置。', objectsEn: 'Facilities, pulses, diagnostic-signal catalogues, curated datasets and federated locations.', interfaces: ['Central catalogue', 'Federated repositories'], technologies: ['Catalogue and data-lake services'], devices: ['MAST', 'C-Mod', 'LHD', 'HL-2A and expanding'], access: 'controlled', maturity: 'emerging',
    boundary: '截至核验日仍处概念验证扩展阶段，不是已经汇聚全球全部原始数据的生产湖；源端权限和质量政策继续有效。', boundaryEn: 'As of the evidence cut-off it remains an expanding proof of concept, not a production lake containing all global raw data; source authorization and quality policies still apply.', interoperability: 4, lifecycleReach: 3,
    sources: [src('IAEA 项目官方页', 'IAEA official project page', 'official-docs', 'https://nucleus.iaea.org/sites/ai4atoms/ai4fusion/SitePages/IAEA-Fusion-Data-Lake-Project.aspx')],
  },
  {
    id: 'doe-fusion-data-platform', name: 'DOE Fusion Data Platform / GA-FDP', category: 'workflow-library', layers: ['federated-access', 'curated-product', 'catalogue-lineage', 'workflow-serving'], organization: 'US DOE / General Atomics', organizationEn: 'US DOE / General Atomics', region: '美国', regionEn: 'United States', year: 2026,
    scope: '把 TokSearch、元数据、标签、版本和工作流组织为面向多装置与模拟的可扩展聚变数据平台。', scopeEn: 'Scalable fusion-data platform organizing TokSearch, metadata, labels, versions and workflows across facility and simulation data.',
    objects: '原始/处理数据、元数据、标签、工作流和来源。', objectsEn: 'Raw/processed data, metadata, labels, workflows and provenance.', interfaces: ['TokSearch', 'MetaHub', 'workflow services'], technologies: ['Python', 'distributed processing', 'metadata services'], devices: ['DIII-D first; multi-facility target'], access: 'controlled', maturity: 'emerging',
    boundary: '软件和文档公开不等于 DIII-D 或其他装置数据匿名开放；装置用户协议仍是访问前提。', boundaryEn: 'Open software and documentation do not make DIII-D or other facility data anonymously accessible; facility user agreements remain authoritative.', interoperability: 4, lifecycleReach: 4,
    sources: [src('GA-FDP 官方文档', 'GA-FDP official documentation', 'official-docs', 'https://ga-fdp.github.io/'), src('GA-FDP 官方组织', 'GA-FDP official repositories', 'official-repository', 'https://github.com/GA-FDP')],
  },
  {
    id: 'iaea-ffdb', name: 'IAEA Fusion Facility Database (FFDB)', category: 'reference-database', layers: ['catalogue-lineage', 'publication-reference'], organization: '国际原子能机构', organizationEn: 'International Atomic Energy Agency', region: '国际', regionEn: 'International', year: 2025,
    scope: '全球公私营磁约束、惯性和替代聚变概念设施的公开元数据、技术参数与统计地图。', scopeEn: 'Public metadata, technical parameters and statistical maps for magnetic, inertial and alternative fusion facilities worldwide.',
    objects: '设施身份、国家、机构、状态和 0-D 技术参数。', objectsEn: 'Facility identity, country, organization, status and zero-dimensional technical parameters.', interfaces: ['Interactive map', 'Dashboard'], technologies: ['Web catalogue'], devices: ['Global fusion facilities'], access: 'open', maturity: 'production',
    boundary: '这是设施情报与参数目录，不是炮次、诊断信号或工程配置数据库。', boundaryEn: 'This is a facility-information and parameter catalogue, not a pulse, diagnostic-signal or engineering-configuration database.', interoperability: 3, lifecycleReach: 5,
    sources: [src('IAEA FFDB 官方入口', 'IAEA FFDB official portal', 'data-portal', 'https://nucleus.iaea.org/sites/fusion-portal/SitePages/FFDB.aspx?web=1')],
  },
  {
    id: 'ciclop', name: 'CICLOP Database', category: 'reference-database', layers: ['curated-product', 'catalogue-lineage', 'publication-reference'], organization: '国际原子能机构长脉冲协作', organizationEn: 'IAEA long-pulse collaboration', region: '国际', regionEn: 'International', year: 2026,
    scope: '跨 tokamak 与 stellarator 的精选长脉冲数据库，记录工程/物理限制、性能窗口和可比标量。', scopeEn: 'Curated long-pulse database across tokamaks and stellarators, capturing engineering/physics limitations, performance windows and comparable scalars.',
    objects: '长脉冲记录、标量、装置条件和限制说明。', objectsEn: 'Long-pulse records, scalars, facility conditions and limitation notes.', interfaces: ['IAEA workbook/portal'], technologies: ['Curated tabular database'], devices: ['DIII-D', 'EAST', 'JET', 'KSTAR', 'WEST', 'W7-X and others'], access: 'open', maturity: 'research',
    boundary: '它是精选跨装置标量专题库，不包含完整诊断波形或装置档案。', boundaryEn: 'It is a curated cross-facility scalar database, not a complete diagnostic-waveform or facility archive.', interoperability: 4, lifecycleReach: 2,
    sources: [src('IAEA CICLOP 官方页', 'IAEA CICLOP official page', 'data-portal', 'https://nucleus.iaea.org/sites/fusion-portal/ciclop/SitePages/Home.aspx')],
  },
  {
    id: 'ishpdb', name: 'International Stellarator / Heliotron Profile Database', category: 'reference-database', layers: ['curated-product', 'catalogue-lineage', 'publication-reference'], organization: '国际 stellarator/heliotron 协作', organizationEn: 'International stellarator/heliotron collaboration', region: '国际', regionEn: 'International', year: 2026,
    scope: '面向 stellarator/heliotron 的剖面、约束、输运与高性能专题数据库。', scopeEn: 'Profile, confinement, transport and high-performance topical database for stellarator and heliotron experiments.',
    objects: 'profile、confinement、transport、高 beta/high Ti/H-mode 与 benchmark 数据。', objectsEn: 'Profiles, confinement, transport, high-beta/high-Ti/H-mode and benchmark data.', interfaces: ['ITER UFILE', 'Web portal'], technologies: ['Curated scientific database'], devices: ['LHD', 'W7-AS', 'TJ-II and contributors'], access: 'open-conditional', maturity: 'legacy',
    boundary: '公开可访问不等于无条件再发表；部分配置和使用受协作规则约束，页面和格式也体现历史遗产。', boundaryEn: 'Accessible does not imply unrestricted republication; some configuration and use are governed by collaboration rules, and the portal/format reflect legacy infrastructure.', interoperability: 3, lifecycleReach: 2,
    sources: [src('ISHPDB 官方公共入口', 'ISHPDB official public portal', 'data-portal', 'https://ishpdb.ipp-hgw.mpg.de/ishpdb_public_home_content.html')],
  },
  {
    id: 'itpa-confinement-pedestal', name: 'ITPA Global H-mode Confinement / Pedestal Databases', category: 'reference-database', layers: ['curated-product', 'catalogue-lineage', 'publication-reference'], organization: 'ITPA Transport & Confinement Topical Group', organizationEn: 'ITPA Transport & Confinement Topical Group', region: '国际', regionEn: 'International', year: 2026,
    scope: '面向跨装置能量约束、核心/台基参数和标度律研究的策展标量数据库与历史参考集。', scopeEn: 'Curated scalar databases and historical reference sets for cross-facility energy-confinement, core/pedestal and scaling-law studies.',
    objects: '全局约束时间、功率、几何、等离子体标量、核心/台基参数和数据选择标记。', objectsEn: 'Global confinement time, power, geometry, plasma scalars, core/pedestal parameters and data-selection flags.', interfaces: ['Curated tabular database', 'ITPA reports'], technologies: ['Relational/tabular scientific database'], devices: ['JET', 'DIII-D', 'AUG', 'C-Mod', 'JT-60U and contributors'], access: 'consortium', maturity: 'legacy',
    boundary: '这是用于标度研究的精选标量集合，不是现代全信号 API 或原始炮次档案；公开报告未确认当前数据库服务或公开下载方式，因此按协作组访问保守标注。', boundaryEn: 'This is a curated scalar collection for scaling studies, not a modern full-signal API or raw pulse archive. The public report does not establish a current public service or download route, so access is conservatively labelled as collaboration-based.', interoperability: 3, lifecycleReach: 2,
    sources: [src('EUROfusion/JET 数据库进展报告', 'EUROfusion/JET database progress report', 'technical-report', 'https://scipub.euro-fusion.org/archives/jet-archive/recent-progress-on-the-development-and-analysis-of-the-itpa-global-h-mode-confinement-database')],
  },
  {
    id: 'lhd-open-data', name: 'LHD Data Repository / AWS Open Data', category: 'open-data', layers: ['source-archive', 'federated-access', 'publication-reference'], organization: '日本核聚变科学研究所', organizationEn: 'National Institute for Fusion Science', region: '日本', regionEn: 'Japan', year: 2026,
    scope: 'LHD 诊断原始档案、分析结果和炮次摘要的开放仓库与公共对象存储镜像。', scopeEn: 'Open repository and public object-store mirror for LHD diagnostic raw archives, analysis products and pulse summaries.',
    objects: '诊断 raw archive、分析结果、shot summary 和集群文件。', objectsEn: 'Diagnostic raw archives, analysis products, shot summaries and clustered files.', interfaces: ['Web repository', 'Amazon S3'], technologies: ['Object storage', 'facility archive'], devices: ['LHD'], access: 'open-conditional', maturity: 'operational',
    boundary: '公开下载仍受科学使用协议、诊断 caveat、分析 proposal 和贡献者署名要求约束。', boundaryEn: 'Open download remains subject to scientific-use rules, diagnostic caveats, analysis proposals and contributor-credit requirements.', interoperability: 2, lifecycleReach: 3,
    sources: [src('LHD 官方开放数据页', 'LHD official open-data page', 'data-portal', 'https://w3.lhd.nifs.ac.jp/LHD_Opendata.htm'), src('权利与使用条款', 'Rights and terms of use', 'official-docs', 'https://www-lhd.nifs.ac.jp/pub/RightsTerms.html')],
  },
  {
    id: 'matdb4fusion', name: 'MatDB4Fusion', category: 'reference-database', layers: ['catalogue-lineage', 'publication-reference'], organization: '国际聚变材料协作 / IAEA', organizationEn: 'International fusion-materials collaboration / IAEA', region: '国际', regionEn: 'International', year: 2026,
    scope: '拟建设的聚变材料属性、试验、辐照数据与数据缺口协作平台。', scopeEn: 'Planned collaborative platform for fusion-material properties, tests, irradiation data and identified data gaps.',
    objects: '材料属性、试验条件、辐照历史、标准和数据缺口。', objectsEn: 'Material properties, test conditions, irradiation histories, standards and data gaps.', interfaces: ['Planned materials data model'], technologies: ['Database under development'], devices: ['Fusion device and materials programmes'], access: 'controlled', maturity: 'emerging',
    boundary: '截至核验日仍在建设，不能展示为已经完备、可下载的生产数据库；材料数据还涉及出口、知识产权与试验质量分级。', boundaryEn: 'It remains under development at the evidence cut-off and must not be presented as a complete downloadable production database; materials data also carry export, IP and test-quality constraints.', interoperability: 3, lifecycleReach: 5,
    sources: [src('IAEA MatDB4Fusion 会议材料', 'IAEA MatDB4Fusion conference material', 'technical-report', 'https://conferences.iaea.org/event/425/contributions/37854/')],
  },
  {
    id: 'fair-dcat-datacite', name: 'FAIR / DCAT 3 / DataCite Metadata', category: 'semantic-standard', layers: ['catalogue-lineage', 'publication-reference'], organization: 'GO FAIR / W3C / DataCite', organizationEn: 'GO FAIR / W3C / DataCite', region: '国际', regionEn: 'International', year: 2026,
    scope: '为数据集、分发、数据服务、版本、许可、贡献者和 PID 提供跨领域发现与引用元数据。', scopeEn: 'Cross-domain discovery and citation metadata for datasets, distributions, data services, versions, licences, contributors and persistent identifiers.',
    objects: 'dataset、distribution、data service、series、PID 和关联关系。', objectsEn: 'Datasets, distributions, data services, series, PIDs and typed relationships.', interfaces: ['DCAT RDF/JSON-LD', 'DataCite DOI metadata'], technologies: ['Semantic web', 'PID services'], devices: ['Cross-facility publication'], access: 'open', maturity: 'production',
    boundary: '目录元数据不能替代 IDS 节点语义；FAIR 不要求匿名开放，PID 应分配给稳定发布版本而非每个采样点。', boundaryEn: 'Catalogue metadata does not replace IDS-level semantics. FAIR does not require anonymous openness, and PIDs belong to stable releases rather than individual samples.', interoperability: 5, lifecycleReach: 5,
    sources: [src('FAIR Principles 原始论文', 'Original FAIR Principles paper', 'journal-paper', 'https://doi.org/10.1038/sdata.2016.18'), src('W3C DCAT 3', 'W3C DCAT 3', 'standard', 'https://www.w3.org/TR/vocab-dcat-3/'), src('DataCite Metadata Schema', 'DataCite Metadata Schema', 'standard', 'https://schema.datacite.org/meta/kernel-4/')],
  },
  {
    id: 'cocos', name: 'COCOS', category: 'semantic-standard', layers: ['semantic-exchange', 'curated-product'], organization: 'CRPP / fusion equilibrium community', organizationEn: 'CRPP / fusion equilibrium community', region: '国际', regionEn: 'International', year: 2012,
    scope: '明确托卡马克 R、Z、phi、极向磁通、q、Ip、B0 与 2π 归一化的坐标和符号约定。', scopeEn: 'Explicit conventions for tokamak R, Z, phi, poloidal flux, q, Ip, B0 and 2π normalization.',
    objects: '平衡、磁场、磁通、q 与电流的符号/坐标元数据。', objectsEn: 'Sign and coordinate metadata for equilibrium, magnetic field, flux, q and current.', interfaces: ['COCOS index', 'Analytic transformations'], technologies: ['Convention and conversion utilities'], devices: ['Tokamak equilibrium workflows'], access: 'open', maturity: 'production',
    boundary: 'COCOS 只解决坐标/符号与归一化歧义，不是完整 schema；还需 SI 单位、网格、时间基准和变换历史。', boundaryEn: 'COCOS addresses coordinate/sign and normalization ambiguity, not the complete schema; SI units, grids, timebase and transformation history remain necessary.', interoperability: 5, lifecycleReach: 3,
    sources: [src('COCOS 官方资源页', 'COCOS official resource page', 'official-docs', 'https://crppwww.epfl.ch/~sauter/cocos/'), src('原始 CPC 论文', 'Primary CPC paper', 'journal-paper', 'https://doi.org/10.1016/j.cpc.2012.09.010')],
  },
  {
    id: 'asme-vvuq', name: 'ASME VVUQ', category: 'governance-report', layers: ['curated-product', 'catalogue-lineage', 'publication-reference'], organization: 'American Society of Mechanical Engineers', organizationEn: 'American Society of Mechanical Engineers', region: '国际', regionEn: 'International', year: 2026,
    scope: '以 context of use 为核心，组织计算模型的代码验证、解验证、确认与不确定度量化证据。', scopeEn: 'Context-of-use-centred evidence framework for code verification, solution verification, validation and uncertainty quantification of computational models.',
    objects: '模型、计算、验证试验、数值/输入/模型形式不确定度、适用域和审批证据。', objectsEn: 'Models, calculations, validation experiments, numerical/input/model-form uncertainty, applicability domains and approval evidence.', interfaces: ['ASME VVUQ terminology and standards'], technologies: ['Evidence and assurance process'], devices: ['Cross-domain model assurance'], access: 'licensed', maturity: 'production',
    boundary: 'ASME 标准目录可公开查看，但多数标准正文需许可或购买；它们也不替代具体聚变模型的领域验证。', boundaryEn: 'The ASME standards catalogue is public, but most full standards require a licence or purchase; they also do not replace domain validation for a specific fusion model.', interoperability: 4, lifecycleReach: 5,
    sources: [src('ASME VVUQ 标准入口', 'ASME VVUQ standards', 'standard', 'https://www.asme.org/codes-standards/vvuq-standards')],
  },
  {
    id: 'jcgm-gum', name: 'JCGM GUM / VIM', category: 'governance-report', layers: ['curated-product', 'catalogue-lineage', 'publication-reference'], organization: 'JCGM / BIPM', organizationEn: 'JCGM / BIPM', region: '国际', regionEn: 'International', year: 2026,
    scope: '规范 measurand、测量结果、标准不确定度、协方差、覆盖区间与计量溯源的表达和传播。', scopeEn: 'Guidance for expressing and propagating measurands, measurement results, standard uncertainty, covariance, coverage intervals and metrological traceability.',
    objects: '诊断测量、校准链、不确定度预算、协方差、覆盖区间与计量词汇。', objectsEn: 'Diagnostic measurements, calibration chains, uncertainty budgets, covariance, coverage intervals and metrology vocabulary.', interfaces: ['JCGM 100/101', 'VIM'], technologies: ['Measurement uncertainty and traceability'], devices: ['Fusion diagnostics and metrology'], access: 'open', maturity: 'production',
    boundary: 'GUM/VIM 是通用计量框架，不规定具体聚变诊断的 measurand 或误差模型；这些仍须由诊断负责人验证并版本化。', boundaryEn: 'GUM/VIM is a general metrology framework and does not define the measurand or error model for a specific fusion diagnostic; those remain the responsibility of the diagnostic owner and must be versioned.', interoperability: 4, lifecycleReach: 5,
    sources: [src('JCGM 官方出版物', 'JCGM official publications', 'standard', 'https://www.bipm.org/en/committees/jc/jcgm/publications')],
  },
  {
    id: 'jet-data-warehouse', name: 'JET JPF / PPF / Data Warehouse', category: 'archive-access', layers: ['acquisition', 'source-archive', 'federated-access', 'curated-product'], organization: 'EUROfusion / UKAEA', organizationEn: 'EUROfusion / UKAEA', region: '欧洲', regionEn: 'Europe', year: 2026,
    scope: 'JET 原始 JPF、实验后 PPF 与数据仓库组成的成熟装置档案和分析体系。', scopeEn: 'Mature JET facility archive and analysis ecosystem spanning raw JPF, post-processed PPF and the data warehouse.', objects: '原始炮文件、后处理函数、重构量、分析产品与元数据。', objectsEn: 'Raw pulse files, post-processing functions, reconstructed quantities, analysis products and metadata.', interfaces: ['JET RDA', 'MDSplus', 'EUROfusion computing'], technologies: ['Facility-specific archives'], devices: ['JET'], access: 'consortium', maturity: 'operational', boundary: 'JET 主档案面向获批协作者；UKAEA Published Data 只是论文支撑子集，不能等同于全库开放。', boundaryEn: 'The main JET archive is for authorized collaborators. UKAEA Published Data is a paper-supporting subset, not the complete archive.', interoperability: 2, lifecycleReach: 4,
    sources: [src('JET 数据存取系统原始报告', 'Primary JET data storage and retrieval report', 'technical-report', 'https://scipub.euro-fusion.org/archives/jet-archive/new-data-storage-and-retrieval-systems-for-jet-data'), src('UKAEA 已发表数据入口', 'UKAEA Published Data portal', 'data-portal', 'https://opendata.ukaea.uk/published-data/')],
  },
  {
    id: 'nstxu-mdsplus', name: 'NSTX-U MDSplus & Web Tools', category: 'archive-access', layers: ['source-archive', 'federated-access', 'curated-product'], organization: 'Princeton Plasma Physics Laboratory', organizationEn: 'Princeton Plasma Physics Laboratory', region: '美国', regionEn: 'United States', year: 2026,
    scope: 'NSTX/NSTX-U 物理诊断、工程系统、EFIT 与分析产品的 MDSplus 档案及网页工具。', scopeEn: 'NSTX/NSTX-U MDSplus archive and web tools for physics diagnostics, engineering systems, EFIT and analysis products.', objects: '诊断/工程树、EFIT、日志、TRANSP 搜索和派生数据。', objectsEn: 'Diagnostic/engineering trees, EFIT, logs, TRANSP search and derived data.', interfaces: ['MDSplus', 'Python/MATLAB/IDL/C/Fortran', 'Web tools'], technologies: ['MDSplus', 'Facility web applications'], devices: ['NSTX', 'NSTX-U'], access: 'controlled', maturity: 'operational', boundary: '官方教程明确连接需要授权；网页工具存在不代表全库匿名公开。', boundaryEn: 'Official guidance requires authorized connections; the existence of web tools does not make the full archive anonymously public.', interoperability: 2, lifecycleReach: 3,
    sources: [src('NSTX-U MDSplus 官方说明', 'NSTX-U official MDSplus guidance', 'official-docs', 'https://nstx.pppl.gov/software-tools/MDSplus/index.html'), src('NSTX-U Web Tools', 'NSTX-U Web Tools', 'official-docs', 'https://nstx.pppl.gov/software-tools/WebTools/index.html')],
  },
  {
    id: 'east-archive', name: 'EAST archive / Collaboration Zone', category: 'archive-access', layers: ['acquisition', 'source-archive', 'federated-access'], organization: '中国科学院等离子体物理研究所', organizationEn: 'Institute of Plasma Physics, Chinese Academy of Sciences', region: '中国', regionEn: 'China', year: 2022,
    scope: 'EAST 本地 MDSplus 原始/分析树与面向合作的数据镜像、元数据和近实时服务。', scopeEn: 'EAST local MDSplus raw/analysis trees with collaboration-oriented mirroring, metadata and near-real-time services.', objects: '炮次树、原始/分析信号、标量元数据和合作镜像。', objectsEn: 'Pulse trees, raw/analysis signals, scalar metadata and collaboration mirrors.', interfaces: ['MDSplus', 'MySQL metadata', 'collaboration transfer'], technologies: ['MDSplus', 'database and messaging services'], devices: ['EAST'], access: 'controlled', maturity: 'operational', boundary: '数据共享服务面向合作用户；公开官网不构成匿名全量下载授权。', boundaryEn: 'Data-sharing services target collaborators; a public website is not authorization for anonymous full-archive download.', interoperability: 2, lifecycleReach: 3,
    sources: [src('EAST 官方用户服务入口', 'EAST official user-services portal', 'data-portal', 'https://east.ipp.ac.cn/'), src('DOE/ESnet 聚变数据报告', 'DOE/ESnet fusion-data report', 'technical-report', 'https://science.osti.gov/-/media/fes/pdf/2022/EsNet_Report.pdf')],
  },
  {
    id: 'kstar-kdis', name: 'KSTAR KDIS', category: 'archive-access', layers: ['acquisition', 'source-archive', 'catalogue-lineage', 'workflow-serving'], organization: '韩国聚变能源研究院', organizationEn: 'Korea Institute of Fusion Energy', region: '韩国', regionEn: 'Republic of Korea', year: 2026,
    scope: '组合 EPICS 工程量、MDSplus 高频诊断、shot summary、日志和 PCS 参数的装置数据集成系统。', scopeEn: 'Facility data-integration system combining EPICS engineering variables, MDSplus high-rate diagnostics, shot summaries, logs and PCS parameters.', objects: 'PV、诊断波形、炮次摘要、实验日志、PCS 参数和实时流。', objectsEn: 'PVs, diagnostic waveforms, pulse summaries, experiment logs, PCS parameters and real-time streams.', interfaces: ['EPICS', 'MDSplus', 'PostgreSQL/KDIS Web'], technologies: ['EPICS', 'MDSplus', 'relational database'], devices: ['KSTAR'], access: 'facility-internal', maturity: 'operational', boundary: '公开资料描述架构，但部分技术文档有专有标记；不可镜像内容或声称公共访问。', boundaryEn: 'Public material describes the architecture, while some technical documents are marked proprietary; content must not be mirrored or presented as public access.', interoperability: 2, lifecycleReach: 4,
    sources: [src('KFE 官方技术资料', 'KFE official technical material', 'technical-report', 'https://www.kfe.re.kr/boardDownload.es?bid=0010&list_no=10627&seq=2')],
  },
  {
    id: 'jt60sa-experiment-db', name: 'JT-60SA SCSDAS / eDAS', category: 'archive-access', layers: ['acquisition', 'source-archive', 'federated-access', 'curated-product'], organization: 'QST / Fusion for Energy', organizationEn: 'QST / Fusion for Energy', region: '日本/欧洲', regionEn: 'Japan / Europe', year: 2026,
    scope: 'JT-60SA 的放电、装置监测、原始/平衡/分析数据和实验团队访问基础设施。', scopeEn: 'JT-60SA infrastructure for discharge, plant-monitoring, raw, equilibrium and analysis data with experiment-team access.', objects: '放电数据、连续机器监测、平衡与分析产品。', objectsEn: 'Discharge data, continuous machine monitoring, equilibrium and analysis products.', interfaces: ['eDAS', 'facility database libraries'], technologies: ['Facility-specific databases'], devices: ['JT-60SA'], access: 'controlled', maturity: 'operational', boundary: '服务面向 Experiment Team 和授权账号，目前不是匿名开放数据门户。', boundaryEn: 'Services are for the Experiment Team and authorized accounts, not an anonymous open-data portal.', interoperability: 2, lifecycleReach: 4,
    sources: [src('JT-60SA 控制系统官方页', 'JT-60SA official control-system page', 'official-docs', 'https://www.jt60sa.org/wp/control-system/'), src('QST 数据系统报告', 'QST data-system report', 'technical-report', 'https://www.qst.go.jp/uploaded/attachment/15340.pdf')],
  },
  {
    id: 'tcv-archive', name: 'TCV MDSplus archive', category: 'archive-access', layers: ['acquisition', 'source-archive', 'curated-product'], organization: 'EPFL Swiss Plasma Center', organizationEn: 'EPFL Swiss Plasma Center', region: '瑞士', regionEn: 'Switzerland', year: 2026,
    scope: 'TCV 测量、实时控制、原始/处理数据及 profile/equilibrium 的装置档案。', scopeEn: 'TCV facility archive for measurements, real-time control, raw/processed data, profiles and equilibrium products.', objects: 'MDSplus 树、PCS 数据、剖面、平衡和论文配套数据。', objectsEn: 'MDSplus trees, PCS data, profiles, equilibria and publication-supporting datasets.', interfaces: ['MDSplus', 'facility PCS'], technologies: ['MDSplus', 'facility analysis'], devices: ['TCV'], access: 'controlled', maturity: 'operational', boundary: '装置主档案面向团队/合作访问；独立 Zenodo 论文数据子集不能推导为全库开放。', boundaryEn: 'The main archive is for team/collaboration access; individual Zenodo publication datasets do not make the full archive open.', interoperability: 2, lifecycleReach: 3,
    sources: [src('EPFL 数据基础设施报告', 'EPFL data-infrastructure report', 'technical-report', 'https://infoscience.epfl.ch/bitstreams/8fdd7020-e59c-4f89-9ff0-f7717ed6e66e/download')],
  },
  {
    id: 'aug-shotfile', name: 'ASDEX Upgrade Shotfile / RDA', category: 'archive-access', layers: ['source-archive', 'federated-access', 'curated-product'], organization: '马克斯·普朗克等离子体物理研究所', organizationEn: 'Max Planck Institute for Plasma Physics', region: '德国', regionEn: 'Germany', year: 2026,
    scope: 'AUG shotfile 诊断与平衡工具箱的装置档案和远程访问体系。', scopeEn: 'ASDEX Upgrade shotfile facility archive and remote-access environment for diagnostics and equilibrium toolboxes.', objects: 'shotfile 波形、诊断和 equilibrium products。', objectsEn: 'Shotfile waveforms, diagnostics and equilibrium products.', interfaces: ['RCA/RDA', 'MDSplus mapping'], technologies: ['Shotfile archive'], devices: ['ASDEX Upgrade'], access: 'controlled', maturity: 'operational', boundary: 'IPP 数据访问通常按个人授权，向第三方转交受限；不能把远程接口误写成公共库。', boundaryEn: 'IPP data access is normally granted personally and redistribution is restricted; a remote interface is not a public archive.', interoperability: 2, lifecycleReach: 3,
    sources: [src('IPP 官方发表与数据规则', 'IPP official publication and data rules', 'official-docs', 'https://www.ipp.mpg.de/4992160/pubrules.pdf')],
  },
  {
    id: 'nif-data-repository', name: 'NIF Data Repository / Archive Viewer', category: 'archive-access', layers: ['acquisition', 'source-archive', 'catalogue-lineage', 'workflow-serving'], organization: 'Lawrence Livermore National Laboratory', organizationEn: 'Lawrence Livermore National Laboratory', region: '美国', regionEn: 'United States', year: 2026,
    scope: '为 NIF 惯性约束聚变实验保存激光、靶物理、装置配置、标定以及原始/处理/分析数据，并通过 Archive Viewer 提供授权访问。', scopeEn: 'Authorized repository and Archive Viewer for NIF inertial-fusion laser, target-physics, facility-configuration, calibration, raw, processed and analysis data.',
    objects: '标量、向量、图像、诊断数据、靶与装置配置、标定和分析产品。', objectsEn: 'Scalars, vectors, images, diagnostic data, target and facility configuration, calibration and analysis products.', interfaces: ['Archive Viewer', 'tabular/ZIP export', 'WebDAV'], technologies: ['Facility repository', 'role-based access'], devices: ['National Ignition Facility'], access: 'facility-internal', maturity: 'operational',
    boundary: '这是国家安全设施的严格授权档案，不能与公共开放科学库并列宣传；项目负责人和访问控制列表决定数据可见范围。', boundaryEn: 'This is a strictly authorized archive at a national-security facility and must not be presented as an open-science repository; programme leadership and access-control lists determine visibility.', interoperability: 2, lifecycleReach: 4,
    sources: [src('NIF User Guide：数据工具', 'NIF User Guide: data tools', 'official-docs', 'https://nifuserguide.llnl.gov/home/8-data-handling/81-user-tools'), src('NIF User Guide：数据访问', 'NIF User Guide: data access', 'official-docs', 'https://nifuserguide.llnl.gov/home/8-data-handling/87-data-access')],
  },
  {
    id: 'tokamark', name: 'TokaMark', category: 'open-data', layers: ['curated-product', 'catalogue-lineage', 'publication-reference'], organization: 'UKAEA / IBM / STFC', organizationEn: 'UKAEA / IBM / STFC', region: '英国', regionEn: 'United Kingdom', year: 2026,
    scope: 'MAST 多模态时序、二维数据和视频的聚变基础模型与机器学习基准数据集。', scopeEn: 'Multimodal MAST time-series, two-dimensional and video benchmark dataset for fusion foundation-model research.', objects: '时序、二维阵列、视频、14 类任务和基线模型输入。', objectsEn: 'Time series, 2-D arrays, video, fourteen task classes and baseline-model inputs.', interfaces: ['Hugging Face dataset', 'benchmark manifests'], technologies: ['Python', 'ML datasets'], devices: ['MAST'], access: 'open', maturity: 'emerging', boundary: '这是单装置研究基准，不证明跨装置泛化、物理一致性或实时控制资格。', boundaryEn: 'This is a single-facility research benchmark, not evidence of cross-facility generalization, physics consistency or real-time control qualification.', interoperability: 3, lifecycleReach: 2,
    sources: [src('官方数据集', 'Official dataset', 'data-portal', 'https://huggingface.co/datasets/UKAEA-IBM-STFC/tokamark-dataset'), src('原始预印本', 'Primary preprint', 'journal-paper', 'https://arxiv.org/abs/2602.10132')],
  },
  {
    id: 'toktagger', name: 'TokTagger', category: 'workflow-library', layers: ['curated-product', 'catalogue-lineage', 'workflow-serving'], organization: '英国原子能管理局', organizationEn: 'UK Atomic Energy Authority', region: '英国', regionEn: 'United Kingdom', year: 2026,
    scope: '用于聚变时序和炮事件的人机协同标注，支持 REST、人工标签和模型辅助。', scopeEn: 'Human-in-the-loop annotation of fusion time series and pulse events with REST access, manual labels and model assistance.', objects: '事件区间、标签、注释、模型建议和审阅状态。', objectsEn: 'Event intervals, labels, annotations, model suggestions and review state.', interfaces: ['REST API', 'machine-readable annotations'], technologies: ['React', 'Python'], devices: ['Facility-agnostic annotation workflows'], access: 'open', maturity: 'emerging', boundary: '当前仍是 beta/研究工具；标签必须保留定义、审阅人、一致性和版本，不能把模型建议当真值。', boundaryEn: 'It remains a beta/research tool. Labels need definitions, reviewer identity, agreement and versioning; model suggestions are not ground truth.', interoperability: 3, lifecycleReach: 2,
    sources: [src('官方仓库', 'Official repository', 'official-repository', 'https://github.com/ukaea/toktagger')],
  },
  {
    id: 'gkdb', name: 'GKDB', category: 'reference-database', layers: ['semantic-exchange', 'curated-product', 'catalogue-lineage'], organization: 'EUROfusion gyrokinetic community', organizationEn: 'EUROfusion gyrokinetic community', region: '欧洲', regionEn: 'Europe', year: 2026,
    scope: '贴合 IMAS gyrokinetics 约定的陀螺动理学模拟数据库原型。', scopeEn: 'Prototype gyrokinetic simulation database aligned with IMAS gyrokinetics conventions.', objects: '模拟输入、参数、输出、元数据和 benchmark。', objectsEn: 'Simulation inputs, parameters, outputs, metadata and benchmarks.', interfaces: ['PostgreSQL', 'JSONB', 'OMAS connection'], technologies: ['PostgreSQL', 'Docker'], devices: ['Gyrokinetic simulation studies'], access: 'open', maturity: 'emerging', boundary: '当前为 alpha 原型，覆盖 gyrokinetics 专题而非全领域仿真，不能标为成熟生产数据库。', boundaryEn: 'It is an alpha prototype focused on gyrokinetics, not a complete simulation database or mature production service.', interoperability: 4, lifecycleReach: 2,
    sources: [src('官方项目仓库', 'Project repository', 'official-repository', 'https://gitlab.com/gkdb/gkdb'), src('IAEA 项目海报', 'IAEA project poster', 'technical-report', 'https://conferences.iaea.org/event/335/contributions/28984/attachments/15722/26540/Poster_IAEA_2023_GF_LR.pdf')],
  },
  {
    id: 'mgkdb', name: 'MGKDB', category: 'reference-database', layers: ['semantic-exchange', 'curated-product', 'catalogue-lineage'], organization: 'Multi-code gyrokinetic database collaboration', organizationEn: 'Multi-code gyrokinetic database collaboration', region: '国际', regionEn: 'International', year: 2026,
    scope: '使用 IMAS/OMAS gyrokinetics schema 管理 GENE、CGYRO、TGLF、GS2 等多代码输入输出与元数据。', scopeEn: 'Manages inputs, outputs and metadata from GENE, CGYRO, TGLF and GS2 using the IMAS/OMAS gyrokinetics schema.', objects: '多代码模拟元数据、输入、输出和查询集合。', objectsEn: 'Multi-code simulation metadata, inputs, outputs and query collections.', interfaces: ['MongoDB', 'IMAS/OMAS gyrokinetics schema'], technologies: ['Python', 'MongoDB'], devices: ['Gyrokinetic simulation studies'], access: 'controlled', maturity: 'research', boundary: '客户端与源代码公开，但真实 NERSC 数据库需要 NERSC 账号和单独凭据；代码公开不等于数据库开放，入库覆盖和长期服务仍处研究阶段。', boundaryEn: 'The client and source code are open, but the live NERSC database requires a NERSC account and separate credentials. Open code is not open database access; ingestion coverage and long-term service remain research-grade.', interoperability: 4, lifecycleReach: 2,
    sources: [src('官方仓库', 'Official repository', 'official-repository', 'https://github.com/Sophelio/MGKDB'), src('原始论文', 'Primary paper', 'journal-paper', 'https://doi.org/10.1063/5.0087403')],
  },
  {
    id: 'common-metadata-framework', name: 'Common Metadata Framework (CMF)', category: 'workflow-library', layers: ['catalogue-lineage', 'workflow-serving'], organization: 'Hewlett Packard Enterprise / DOE FDP', organizationEn: 'Hewlett Packard Enterprise / DOE FDP', region: '美国', regionEn: 'United States', year: 2026,
    scope: '记录数据、代码、模型、指标、流水线阶段和实验的版本/谱系，并由 FDP 用于数据工程。', scopeEn: 'Tracks versions and lineage for data, code, models, metrics, pipeline stages and experiments, with adoption in Fusion Data Platform workflows.', objects: 'run、stage、artifact、metric、Git/DVC 版本和 lineage。', objectsEn: 'Runs, stages, artifacts, metrics, Git/DVC versions and lineage.', interfaces: ['Python CLI/SDK', 'DVC artifact store', 'relational metadata'], technologies: ['Python', 'DVC', 'metadata database'], devices: ['FDP workflows'], access: 'open', maturity: 'production', boundary: '框架需要业务埋点、权限、保留和运维；不替代对象存储、不可变审计或科学质量审核。', boundaryEn: 'The framework requires instrumentation, authorization, retention and operations; it does not replace object storage, immutable audit or scientific quality review.', interoperability: 3, lifecycleReach: 4,
    sources: [src('CMF 官方架构文档', 'CMF official architecture documentation', 'official-docs', 'https://hewlettpackard.github.io/cmf/architecture/')],
  },
];

export const dataFoundationRoute = [
  { id: 'L0', zh: '事实源与采集', en: 'Source systems & acquisition', tools: 'DAQ · PCS · EPICS · MDSplus', deliverable: '带绝对/相对时间与硬件身份的原始事件包', deliverableEn: 'Raw event package with absolute/relative time and hardware identity' },
  { id: 'L1', zh: '权威源档案与锁定快照', en: 'Authoritative source archive & locked snapshot', tools: 'MDSplus/EPICS source → WRITE_ONCE + ACL → Object Lock/WORM + SHA-256 manifest', deliverable: '原样导出、保留锁、独立哈希清单、审计和恢复验证均可核对的 L0 快照', deliverableEn: 'Exact L0 snapshot with retention lock, independent hash manifest, audit trail and verified recovery' },
  { id: 'L2', zh: '统一访问与对时', en: 'Unified access & time alignment', tools: 'UDA · adapters · range/chunk access', deliverable: '跨后端查询、质量标记与时钟关系', deliverableEn: 'Cross-backend query, quality flags and clock relationships' },
  { id: 'L3', zh: '语义交换与映射', en: 'Semantic exchange & mapping', tools: 'IMAS DD · IMAS-Python · OMAS', deliverable: '冻结装置描述、坐标、单位与版本化映射', deliverableEn: 'Versioned mappings for machine description, coordinates and units' },
  { id: 'L4', zh: '策展科学产品', en: 'Curated scientific products', tools: 'EFIT · inversion · synthetic diagnostics', deliverable: '校准、重构、仿真、合成各自独立且有 UQ', deliverableEn: 'Separate calibrated, reconstructed, simulated and synthetic products with UQ' },
  { id: 'L5', zh: '目录、血缘与权限', en: 'Catalogue, lineage & authorization', tools: 'PostgreSQL · PID · provenance · RBAC', deliverable: '一炮一链、模型卡、访问策略与责任人', deliverableEn: 'Shot-level lineage, model cards, access policy and accountable owners' },
  { id: 'L6', zh: '工作流与近数据计算', en: 'Workflow & compute-to-data', tools: 'OMFIT · TokSearch · HPC · notebooks', deliverable: '可重放任务、稳定切分、缓存与资源预算', deliverableEn: 'Replayable jobs, stable partitions, caching and resource budgets' },
  { id: 'L7', zh: '版本快照与证据发布', en: 'Versioned snapshots & evidence publication', tools: 'FAIR catalogue · DOI · open/controlled export', deliverable: '可引用数据集、验证记录和许可边界', deliverableEn: 'Citable datasets, validation records and licensing boundaries' },
] as const;

export const dataFoundationCutoff = '2026-08-19';

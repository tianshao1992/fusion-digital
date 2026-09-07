# FusionDigital 集成设计与仿真平台开发规划

状态：开发评审稿 v0.2。日期：2026-09-06。本文档包是规划交付，不代表功能已实现或部署。本版补充IMAS/传统技术栈与Docker接入设计。

## 决策摘要

将“集成设计与仿真”建设为 FusionDigital 的通用工作台，一级导航显示“仿真设计”，与“全球装置”“数字样机”“聚变数据”并列。它首先服务 **01 物理模拟** 与 **02 工程设计/工程仿真**，共用研究、设计版本、运行、数据产品和证据管理。FUSE 是第一个可替换计算引擎；前端按科学能力和用户任务组织，平台协议不依赖 Julia、FUSE actor 或 IMAS 内存对象。

当前知识目录的稳定 ID 是 `physics`、`engineering`，第二模块现有中文名为“工程仿真”。保留 ID、编号和 `/physics`、`/engineering` 路径，在计算工作台明确显示“02 工程设计与仿真”。未来若统一改名，单独修改双语内容、搜索与知识投影，不能产生两个 engineering 模块。集成设计关联两领域，不增加第十一个知识模块，也不替代 09 总体集成。

推荐建设顺序：**领域与合同 → 双 producer 离线工作台 → 通用异步执行 → 物理—工程耦合与 EXL-50U 验证扩展 → 第二生产引擎资格验证**。首期独立 producer 证明接口与 UI 可替换，应在首个在线 FUSE 版本验收前完成；后期第二生产引擎还需通过专业基准和资格测试，两者不混淆。

兼容策略：**IMAS优先作为聚变语义与交换标准；Docker/OCI作为首期默认执行包装；中性的任务、数据和引擎合同作为统一接入面**。保留Slurm/Apptainer、原生程序和商业软件worker路径。镜像、数学模型、权重/材料、输入与运行结果独立版本化，容器化不自动证明互操作或科学资格。

## 文档地图

| 文件 | 负责解决的问题 |
| --- | --- |
| [01-architecture.md](01-architecture.md) | 领域归属、系统分层、仓库与服务边界、科学耦合机制、架构决策 |
| [02-product-and-frontend.md](02-product-and-frontend.md) | 导航、页面、交互旅程、可视化复用、前端改造清单 |
| [03-data-and-versioning.md](03-data-and-versioning.md) | 数据对象、科学语义、存储、提交与血缘、多维版本、兼容与恢复 |
| [04-engines-and-api.md](04-engines-and-api.md) | API、运行状态、worker 协议、插件与格式协商、FUSE/Python 演进 |
| [05-delivery-and-acceptance.md](05-delivery-and-acceptance.md) | 阶段、人力假设、工程票据、依赖、验收、EXL-50U 入口、实施起点 |
| [06-imas-and-legacy-interoperability.md](06-imas-and-legacy-interoperability.md) | IMAS DD/库/backend差异、FUSE扩展、传统文件/程序、兼容测试 |
| [07-container-and-runtime.md](07-container-and-runtime.md) | Docker默认接入包、模型与镜像分离、batch/warm服务、HPC、资源隔离 |

## 用户要求与开发落点

| 要求 | 本方案决策 | 对应工作包 |
| --- | --- | --- |
| 归属第一物理和第二工程模块 | 领域多对多归属；集成设计 Study 连接两领域；引擎独立注册 | SIM-001、002、006、022 |
| 新增并列一级工作台 | `/simulations` 为统一入口，物理/工程为任务视图；FUSE 为实现选择 | SIM-006～010 |
| 前后端缺计算交互 | 独立 Simulation Gateway、运行状态/事件、异步 worker、对象存储 | SIM-012～020 |
| 专门设计数据模块和科学机制 | Scientific Data Catalog、版本化数据产品、CouplingSpec、VVUQ、设计基线 | SIM-003～005、014、021～025 |
| FUSE 可替换、可 Python 化 | 能力/模型/引擎/执行后端/数据/展示六类接口，第二实现合同测试 | SIM-004、011、018、026 |
| 大型项目版本与合并管理 | 独立科学平台代码边界、发布组合清单、上游固定引用、不可变运行锁 | SIM-005、012、027～030 |
| IMAS与传统聚变栈兼容 | 版本化IMAS Bridge、原生数据保留、字段级互读/迁移资格 | INT-001～008，细化既有SIM票据 |
| 不同引擎以Docker统一接入 | 默认DockerBackend，统一EnginePackage/任务合同，保留其他backend | RUN-001～006，细化既有SIM票据 |

## 本轮实时证据与既有文档的关系

核验的仓库：`D:\Code\FusionDigital`。本地 `master` 为 `a2812d60c4b99d0ecb7dd7251e8c421014c5021c`；本轮 fetch 后 Codeup `master` 与 GitHub `main` 都为 `7eb3c69a4cc928e153491f2b7fb0611fd0f3b3f0`，本地落后 30 个提交。工作树有用户修改；本次只新增本目录的规划文件。实施前应重新 fetch，并从届时一致的远端 SHA 建立隔离 worktree。

交付前再次只读核验，两远端跟踪引用已同步前进至 `65c9d2a29b6eabd62c86228dc419a1c64e30976c`。相对审阅基线的新增提交只涉及 EXL-50U 三维标识位置、viewer 调用和对应测试；领域目录、仿真/API边界、开放可视化合同没有变化。本方案保留 `7eb3c69…` 作为明确审阅快照，不把移动分支当文档永久基准。

| 证据 | 当前意义 |
| --- | --- |
| `origin/master:app/data/knowledge-modules.ts` | 01 physics / 02 engineering 的稳定目录身份 |
| `origin/master:app/components/SiteNav.tsx` | 当前一级导航和响应式溢出机制，无仿真工作台入口 |
| `origin/master:app/api/` | 有账户、研究候选、研究运行等 API；尚无科学运行 API |
| `origin/master:docs/ARCHITECTURE.md` | 当前聚变数据已转为审核后的 EXL-50U 固定快照，旧 mock 说明已过时 |
| `origin/master:docs/VISUALIZATION_PLATFORM.md` | 已有开放可视化 V1 合同和策略路由；远程渲染集群仍属后续工作 |
| `origin/master:app/visualization/{contract,context,routing}.ts` | 复用 visualization-artifact.v2 和上下文 v2，不另建引擎专用展示协议 |
| [平台技术路线](../../PLATFORM_TECHNICAL_ROADMAP.md) | 科学计算平面、RunManifest、PostgreSQL/对象存储、三平面边界 |
| [预放电集成评审](../../FUSIONCONTROL_PRE_SHOT_INTEGRATION_REVIEW.md) | 本地未跟踪规划稿；提供异步运行、SSE、控制模型接入背景 |
| [FusionControl 演进路线](../../FUSIONCONTROL_DIGITAL_TWIN_EVOLUTION_ROADMAP.md) | 本地未跟踪规划稿；提供数字线程、VVUQ 和控制保障职责 |

远端独有文件在当前旧 checkout 可能不存在，可使用 `git show 7eb3c69a4cc928e153491f2b7fb0611fd0f3b3f0:<path>` 核对。本文没有把未跟踪规划稿描述为已合入远端的功能。

本文对上一轮建议作以下细化：通用入口从 `/simulations/fuse` 上移到 `/simulations`；领域能力和引擎分开；复用新可视化合同；运行成功、科学有效和公开发布采用独立状态；首版即设置第二引擎验证门。旧路线图中的具体“黄金炮”只作历史候选，EXL-50U 基准必须重新确认同炮输入和独立验证数据。

## 可直接执行的首个开发范围

先做 SIM-001～011：建立领域/合同/数据投影的规范样例，新增仿真工作台和离线运行详情，接入一份来源核验后的 FUSE demo 产物和一个明确标记 `SYNTHETIC` 的独立合同测试引擎。首版同时呈现物理、工程两类能力目录；实际没有输出或尚未接入的工程能力保持可见但不可运行，并显示原因。

开发评审通过后的下一阶段才创建 Gateway 和真实任务提交。本文中的服务、API、版本策略和票据均为拟实现设计；不会因文档写出接口就标记能力可用。

## 官方技术依据

这些资料用于限定技术含义，具体库版本在实施时通过兼容测试后锁定，不能使用本文中的 `latest/dev` 文档 URL 作为运行时版本锁。

- [FUSE 官方概念与架构](https://fuse.help/dev/)：`dd`、`ini`、`act` 和物理/工程 actors 是 FUSE 的内部结构；平台在适配边界使用它们。
- [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html)：语言无关 HTTP 接口描述；采用兼容的 3.1.x 工具链并固定版本。
- [W3C PROV](https://www.w3.org/TR/prov-overview/)：实体、活动和责任主体的血缘表达。先映射关系模型，不要求先部署图数据库。
- [OpenMDAO Sellar 耦合案例](https://openmdao.org/newdocs/versions/latest/basic_user_guide/multidisciplinary_optimization/sellar.html)：参考跨学科反馈、非线性求解和优化的分层；是否采用该库由第二阶段耦合试验决定。

## 文档交付校验

已完成产品/前端、科学数据、引擎执行三个方向的交叉审查，并修正候选设计身份、投影后发绑定、存储位置与内容hash分离、幂等预检顺序、取消重试互斥和收集恢复路径。补充IMAS库/源码与传统执行环境核验，新增INT/RUN细化项；它们不是新增排期承诺或完成记录。8份Markdown的内部链接、代码围栏、JSON示意语法，以及30个SIM、20个ACC、8个INT、6个RUN编号已做自动检查。Mermaid为架构源图，本轮未进行浏览器渲染验证；未执行产品构建、求解器/容器运行、IMAS互读或部署。

来源核对日期：2026-09-06。其余科学机制的采用边界见 [数据与版本](03-data-and-versioning.md) 和 [引擎接口](04-engines-and-api.md)。

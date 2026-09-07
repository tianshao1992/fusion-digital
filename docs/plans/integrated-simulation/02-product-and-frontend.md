# 仿真设计工作台与前端开发规格

## 1. 导航与信息架构

一级入口采用“仿真设计 / Simulation & Design”，路径 `/simulations`。现有“数字样机”负责装置结构与空间探索，“全球装置”提供装置上下文，“聚变数据”提供审核数据，“仿真设计”负责研究、配置、计算、比较和决策。01 物理模拟和02 工程设计与仿真的知识页面各提供带领域筛选的入口，并展示已接入能力与案例引用。

| 页面 | 路由 | 内容与操作 | 首批范围 |
| --- | --- | --- | --- |
| 工作台首页 | `/simulations` | 研究、最近运行、领域能力、已发布案例、创建研究 | 是 |
| 设计研究 | `/simulations/studies/[studyId]` | 问题、装置/设计版本、物理/工程目标、场景、候选、运行、证据 | 轻量版 |
| 分析配置 | `/simulations/studies/[studyId]/analyses/[analysisId]` | 能力、输入、工作流、模型、预检、提交 | P2 完整实现 |
| 运行详情 | `/simulations/runs/[runId]` | 概览、结果、计算过程、诊断、版本与证据 | 离线先实现 |
| 版本化比较 | `/simulations/comparisons/[comparisonId]` | 源记录、对齐方法、残差/不确定度、结果与局限 | P2/P3 |
| 模型与能力目录 | `/simulations/models` | 能力、数学模型、适用域、资格、可选实现 | 首期内嵌目录，后独立页 |
| 引擎详情 | `/simulations/engines/[engineId]` | release、adapter、依赖、运行档位、能力资格 | 高级视图 |

不创建必经的 `/simulations/fuse` 页面。上一轮提及的该路径尚未实现，无迁移成本；若后续已有外部链接，可设兼容跳转到 `engines/fuse-julia` 或带 FUSE 模板的研究创建入口。

研究可关联一个装置、概念设计或部件，不强制填写炮号。Shot 是可选上下文；稳态设计、工程载荷步、频率域分析与参数扫描各有自己的坐标轴。

## 2. 首屏与布局

```text
全站导航：全球装置 | 数字样机 | 聚变数据 | 仿真设计 | …
研究 / 设计版本 / 分析版本       01 物理 · 02 工程       保存 / 校验 / 运行
┌─────────────────┬──────────────────────────┬───────────────────┐
│ 研究和设计树      │ 配置 | 结果 | 比较 | 过程   │ 当前对象检查器      │
│ 装置/部件        │                          │ 定义 / 单位 / 来源  │
│ 几何/材料/网格   │ 3D / R–Z / 剖面 / 场      │ 模型 / 适用域 / 质量│
│ 初态/工况/载荷   │                          │ 版本 / 血缘 / 证据  │
│ 物理/工程分析    ├──────────────────────────┤                   │
│ 目标/约束/候选   │ 曲线 / 残差 / 裕量 / 表格  │                   │
│ 运行/证据        │ 时间 / 半径 / 频率 / 迭代  │                   │
└─────────────────┴──────────────────────────┴───────────────────┘
```

左栏建议 280–320px、右栏约 300–360px，均可收起。小屏改为“研究/主工作区/检查器”单面板切换；导航、参数输入和表格仍可键盘操作。延续全站主题和双语，无独立 FUSE 品牌风格。图表使用领域名称，完整引擎参数在高级区，不让使用者先理解 Julia 类型。

结果视图由 manifest 的 output profile 决定。常驻状态区域分别显示“作业状态”“科学评估”“审核/发布”。物理收敛迭代与资源进度不是同一个百分比；没有可解释进度时显示阶段、已耗时间及最近事件。

## 3. 首批核心旅程

### 3.1 物理研究

1. 从物理模块、装置页或聚变数据记录进入，携带领域 ID、装置 revision 和授权数据引用。
2. 创建研究，声明用途：示例学习、离线回放、预测研究或验证。已存结果回放、前向平衡和逆问题重构分别声明；重构需要诊断观测/误差模型及逆问题证据，不能由回放模板自动获得该能力。
3. 选择能力与模型，绑定初态、剖面、边界、源和工况；系统列出缺失量、格式转换和适用域。
4. 预检后冻结分析版本，显示解析后的计算方案与预计资源档位；用户主动提交。
5. 浏览运行及结果，检查实际存在的标量、平衡、剖面、残差和不确定度。
6. 选择同炮独立诊断或另一个实现建立 ComparisonRecord，保留对齐和比较方法。

公开快照缺少求解必需的数据时，只允许创建待补数据的草稿或浏览已有结果。前端显示具体缺失对象，不从公开一维信号推造二维平衡或材料模型。

### 3.2 工程设计

1. 从02模块或数字样机选定装置/部件版本，建立 DesignBaselineRevision。
2. 绑定材料、网格、约束、载荷工况与事件历史；设计变量可包括尺寸、厚度、材料选项、线圈或冷却方案。
3. 选择工程能力，区分给定载荷分析与物理运行驱动的载荷分析。
4. 运行响应模型，显示力/温度/应力/裕量等实际输出，并提供节点/单元/表面积分位置说明。
5. 查看力、力矩、能量映射守恒及网格/时间步敏感性，比较候选并形成设计决策。

一期对齐既有路线中的正常脉冲与给定事件包络：电磁/结构和热/热应力可并行分析，组合载荷需统一几何与事件时基。不能由静态平衡推断破裂时刻；给定事件工况在 UI 中必须写明“规定输入”。

### 3.3 集成设计与多目标研究

同一 Study 中增加物理与工程分析，连接版本化端口。配置页先提供经过测试的串行模板；后期再开放 CouplingGroup 的可审阅图形编辑。用户能看见输入依赖、映射误差与循环收敛政策。

扫描/优化页展示候选、有效性、目标、约束、不确定度和计算成本。点选 Pareto 点进入精确 candidate/run；被排除或失败候选仍可检查原因。接受设计时产生新基线，原研究不被改写。

## 4. 配置表单和交互合同

能力 JSON Schema 定义科学参数、量纲和 required fields；UI schema 只定义分组、帮助文本、顺序和控件提示。引擎高级参数另有 namespaced schema，由 EngineBinding 提供。平台基础页面不维护 `if engine == FUSE` 的科学含义分支。

表单分为：研究目的、设计上下文、输入数据、模型方案、输出需求、评估判据、资源档位。工程模板额外要求材料/网格/载荷/边界；物理模板按能力要求剖面/平衡/源/物种，不对所有模型强制同一清单。

标量参数显示值+单位，选择范围与默认值来自固定 descriptor revision。默认值要标记其来源；设计者选择不同单位时记录转换活动，输入值与规范值都可追溯。禁止以空字符串/零值代替未知。

预检返回定位到字段/端口的 diagnostics：错误、警告、信息；错误阻止依赖任务提交。可接受的 OOD 探索性运行须由能力政策允许且显式记录理由，结果标 `exploratory`，不能自动继承已验证资格。安全/结构性错误不能用“继续”绕过。

草稿保存使用 revision/ETag 乐观并发；冲突展示差异，避免后一页面覆盖前一页面。尚未有后端时，P1 不显示假保存/假提交按钮；可展示明确的本地演示编辑模式，但输入不会被表述为已保存的研究版本。

## 5. 运行页与数据面板

| 视图 | 必需数据 | 不具备时的行为 |
| --- | --- | --- |
| 物理指标 | Quantity+值+单位+有效性 | 显示 unavailable 及原因 |
| R–Z/LCFS/磁通面 | 明确二维/轮廓数据、坐标、归一化和装置映射 | 保留说明，不由截图或标量造场 |
| 径向剖面 | 变量、rho 定义、物种、轴与误差 | 不把不同 rho 坐标静默叠加 |
| 工程三维场 | mesh digest、关联位置、分量、参考系和时间/载荷步 | 只有几何时展示结构，不能冒充有结果场 |
| 载荷/功率流 | 端口量、正负方向、面积/体积/积分定义 | 禁止自动把 W、W/m²、W/m³ 相加 |
| 计算过程 | 通用工作流与步骤事件；可选 engine trace | 无 actor trace 时仍完整工作 |
| 收敛/诊断 | 残差定义、阈值、迭代/时间坐标 | 未提供时标“未报告”，非默认通过 |
| 证据 | 来源、版本、hash、映射/评估引用 | 完整性不足时限制导出/发布用途 |

图表导出必须保留单位、来源身份、run/assessment revision 与显示处理说明。`surrogate/reduced/linear-MHD` 属模型类别或保真度 profile；`raw/calibrated/reconstructed/simulated/synthetic` 属来源 authority，两者分别显示。

## 6. 与当前可视化基座组合

新建通用 `ScientificResultDataSource`，对外提供 `describe`、`listQuantities`、`readSlice`、`getVisualizationRefs`、`getQuality`、`abort`。具体输入形式固定在 contract 中，不允许任意 SQL/TDI/路径。

首批实现 `StaticResultSource`，后续 `GatewayResultSource`。二者返回同样的科学描述和授权制品引用。选择轴和字段的 view state 与数据源分开，保留 latest-request-wins、AbortController、有限预取和资源释放。

已封存科学输出 → ProjectionRecipe → `visualization-artifact.v2` → 现有 router。独立 ProjectionBinding 连接 ResultManifest/DataProduct 与展示制品，不回写旧 ResultManifest，也不复制 `deliveries/complexity`。先由服务端根据对象 ACL 选择可访问 delivery，再由客户端按实测预算和意图选择 renderer；runtime “可用”不等同用户“有权访问”。

现有 `coordinates.units` 是展示几何单位，不能承载全部科学变量的单位。现有 context v2 通过 source record/artifact 关联装置及坐标上下文，并传递部件、字段、时步和意图；它目前没有独立 deviceRevision/coordinateFrame 字段，扩展时显式版本化。

远程 CAE 使用新的通用 viewer + session broker，替换旧 `ParaViewEmbed` 中 shot/context v1 和固定应力字段示例。session broker 在后续阶段真实实现；P1 不假设已有 ParaView GPU 服务。

## 7. 前端改动清单

以下是未来开发路径，本轮未创建这些产品文件。

| 区域 | 具体改动 |
| --- | --- |
| `app/components/SiteNav.tsx` | `simulations` active/一级入口，沿用 overflow、键盘导航、移动菜单 |
| `app/i18n/messages.ts` 等双语源 | 新工作台、来源/状态、科学词汇、空态；模块名迁移另列票据 |
| `app/physics/page.tsx`、`app/engineering/page.tsx` | 能力目录、示例/资格、带域过滤入口 |
| `app/simulations/` | 页面、StudyWorkspace、AnalysisEditor、RunWorkspace、EvidenceInspector |
| `app/simulations/data/` | ScientificResultDataSource、静态/Gateway source、切片请求和缓存 |
| `app/visualization/` | 复用 v2，增加 run-result binding 校验与授权 delivery 输入 |
| `TokamakCadViewer` / `EfitThreeOverlay` | 复用场景与显式配准，提炼结果叠加 adapter，避免扩张 viewer 巨型组件 |
| `ScientificChart` | 字段描述、质量掩码、不确定度、跨图游标和可追溯导出 |
| `app/fusion-data/` / 数字样机 / 装置页 | 受控引用式跳转；不改实验记录身份和权限 |
| `app/api/simulations/` | BFF allowlist 路由、会话与内部主体映射、状态/事件代理 |
| `tests/` | 导航、双语、来源切换、单位/轴、空态、静态回放、授权降级 |

新增核心组件按功能拆分：StudyContextBar、DesignTree、CapabilityPicker、InputBindingPanel、ModelPlanPanel、PreflightPanel、RunStatus、ResultViewport、QuantityChart、ComparisonWorkspace、EvidenceInspector。参数表单与 viewer 可独立加载；不为了演示每个组件同时显示所有面板。

## 8. 异常、大数据与权限状态

| 条件 | 必须表现 |
| --- | --- |
| 引擎下线 | 历史结果可读，重新运行显示替代方案及兼容限制 |
| 输入无权限 | 与数据不存在区分，但不泄露未授权对象元数据 |
| 缺单位/网格/时基 | 定位缺项，阻止依赖分析；其他独立分析仍可编辑 |
| 部分结果/未收敛 | 保留诊断、实际完成区间和失败原因 |
| 收集进行中 | 区分 staged 与 sealed 资产，不显示完整完成 |
| SSE 断线 | 显示状态 stale，补事件后恢复；不取消计算 |
| hash 不匹配 | 拒绝使用该资产，隔离缓存，不回退旧炮或假曲线 |
| 无匹配时间样本 | 空段和质量原因；默认不跨缺口插值 |
| 源坐标/时基不同 | 先并排；选择版本化映射后才做差 |
| 浏览器预算不足 | 受控切片/LOD、远程或元数据视图；不可无限下载 |
| 公网匿名模式 | 仅已发布投影；计算写 API 由服务端和部署构建共同关闭 |

浏览器首屏先读 manifest 与摘要，数组按变量/范围/分辨率加载。LTTB、包络或重采样属于显示处理，要记录方法；科研分析回到科学数据产品，不在降采样图上计算最终验收残差。

## 9. 首版边界与验收

已核对 `D:\Code\Fuse\demo\fpp_stationary_demo.jl` 与 finalizer：当前导出 metrics、provenance、digest/log，不含完整可用的 R–Z/剖面结果包。首版先显示这些真实制品中实际存在的内容；SIM-021 完成受控 exporter 后才解锁真实平衡/剖面。

布局测试可以使用明确 `SYNTHETIC` 的网格或解析数据，其数据集、列表和标签须与真实 FUSE 结果区分。不能以该 fixture 验证 EXL-50U 物理或工程精度。

P1 完成需要：两个不同 producer 的合同结果在同一个运行页打开；移除 FUSE 后仍可浏览、静态并排和导出已存结果；不需要在线 solver；单位/轴/缺失可见；物理和工程两领域入口可达；来源身份与三个状态体系始终可读。P1 并排浏览不生成科学差值结论或 ComparisonRecord；版本化对齐、残差/UQ和比较页由P2/P3实现。

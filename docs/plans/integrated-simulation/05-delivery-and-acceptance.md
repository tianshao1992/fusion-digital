# 开发拆分、验收与实施安排

## 1. 范围和人力假设

本次交付是完整开发规划，未修改 Web/后端业务代码、创建新服务仓库或运行计算。以下工期是排期参考，假设前端1人、后端/平台2人、科学软件1人、测试/运维1人，并有物理和工程负责人持续参与。专业数据、算力或人员不到位时，调整阶段范围；不以日历到期代替科学验收。

目标分为两个独立轨道：平台工程先证明能正确接入和运行；EXL-50U 专业轨道证明指定模型在指定用途有效。前者完成不自动代表后者完成。已有总体路线的 EXL-50U 12周示范，是单场景族证据目标；本方案工作台支撑其中 P1-5，不承诺一期建成全工况全耦合平台。

## 2. 阶段与退出条件

| 阶段 | 参考窗口（自启动累计） | 交付 | 退出条件 |
| --- | --- | --- | --- |
| P0 领域与合同 | 第1–2周 | 领域/Study/Design、科学语义、版本与接口、固定样例 | TS/Python 共用测试向量，01/02归属和接口责任明确 |
| P1 离线工作台 | 第2–5周 | 新导航、目录、只读研究/运行页、真实 FUSE 标量证据、独立 producer | 无 solver 也能回放；两个 producer 同页；来源/缺失/评估明确 |
| P2 异步计算 | 第4–12周 | Gateway、目录、对象存储、任务/租约、REST/SSE、单 worker | 真实 FUSE 端到端；取消/断线/重投递/失败产物/权限测试通过 |
| P3 集成设计与验证 | 第10–20周，依赖数据 | structured exporter、载荷映射、比较、CouplingGroup、VVUQ | 受控物理→工程链和参考反馈组通过；指定 EXL 用途单独评审 |
| P4 可替换性扩展 | 随具体引擎立项 | 第二生产引擎或 Python 实现资格、HPC/大型场 | capability级资格+回退；按实测需求启用平台扩展 |

早期“双 producer”是公共接口测试；后期“第二生产引擎”是专业资格，两者不可混淆。初期参考 Python producer 可以输出解析/合成数据，不声称提供新的 EXL-50U 高保真能力。

关键依赖：SIM-001～005 → 静态 importer/result source → 运行详情 → 科学目录/resolve → worker闭环 → structured exporter/比较 → 载荷映射/耦合与资格。前端和后台可基于固定样例并行，数据语义不能由各端自行发明。

## 3. 工程票据

角色：ARCH架构、FE前端、BE后端、DATA科学数据、ENG科学引擎、PHY物理、ME工程、QA测试、OPS运维。人日为有效工程工作粗估，存在共享工作与不确定性，不能直接把区间相加当承诺工期。

| ID | 工作与交付 | Owner | 依赖 | 粗估人日 | 完成标准 |
| --- | --- | --- | --- | --- | --- |
| SIM-001 | 领域/模块/引擎 ADR；01/02归属矩阵 | ARCH+PHY+ME | 无 | 2–3 | 稳定ID、集成设计、09模块边界清晰 |
| SIM-002 | Study/Design/Scenario/Capability/Model schemas | ARCH+BE | 001 | 4–6 | 无Shot工程场景和物理场景都可表达 |
| SIM-003 | Quantity/Axis/Frame/Mesh/Material/DataProduct profiles | DATA+PHY+ME | 001 | 5–8 | 单位/COCOS/位置/物种/张量及负例 |
| SIM-004 | EngineBinding/ports/adapter/格式兼容合同 | ENG+BE | 002、003 | 4–6 | 不引用FUSE私有类型的公共接口 |
| SIM-005 | 版本/哈希/RunSpec/Manifest/发布组合规范 | ARCH+DATA | 002～004 | 4–6 | digest跨语言一致、aliases冻结、状态与封存分开 |
| SIM-006 | 新一级导航、路由、双语工作台壳 | FE | 001、002 | 3–5 | 与数字样机等并列；01/02上下文入口 |
| SIM-007 | ScientificResultDataSource+静态source+切片状态 | FE+DATA | 003、005 | 4–6 | 无引擎私有分支、轴/缺失/取消请求正确 |
| SIM-008 | 运行概览/真实指标/收敛/血缘面板 | FE | 006、007 | 4–6 | 作业/科学/治理三轴；非收敛可见 |
| SIM-009 | scientific→visualization v2绑定和viewer接入 | FE+DATA | 005、007 | 4–6 | 来源/转换hash可核对；权限先于路由 |
| SIM-010 | FUSE既有产物导入和脱敏summary exporter | ENG+DATA | 003、005 | 3–5 | 检测hash错误；未知证据不补造；保留失败/partial |
| SIM-011 | 独立Python参考producer与跨语言合同套件 | ENG+QA | 003～005、007 | 3–5 | 两producer同页，SYNTHETIC与真实run分列 |
| SIM-012 | 内部科学平台repo/包结构/开发环境 | BE+OPS | 004、005 | 3–5 | API/worker独立包，镜像与依赖固定；Web不带Julia |
| SIM-013 | 主体映射、项目ACL、配额和审计 | BE+OPS | 012 | 4–6 | 资源级鉴权、越权/匿名写拒绝 |
| SIM-014 | Data Catalog/ArtifactStore/导入/封存/读取授权 | DATA+BE | 003、005、012、013 | 6–9 | staging→commit及orphan恢复；对象可迁移 |
| SIM-015 | Study编辑、resolve、预检、RunSpec接受与幂等 | BE+FE | 002、004、005、013、014 | 5–8 | ETag/幂等冲突/预检过期/版本冻结 |
| SIM-016 | PostgreSQL任务/outbox/租约/fencing/runtime backend | BE+OPS | 012、015 | 6–9 | 丢回执不重复启动；旧worker不能写终态 |
| SIM-017 | SSE/状态投影/事件游标/轮询回退 | BE+FE | 016 | 3–5 | 重复/乱序/游标过期/断线恢复 |
| SIM-018 | 固定版本FUSE Julia worker接入 | ENG+OPS | 004、012、014、016 | 5–8 | 真实受控case执行、输入只读、输出合同完整 |
| SIM-019 | 取消/超时/恢复/重试/失败收集 | BE+ENG+QA | 016、018 | 5–8 | 取消完成竞态、OOM/断网/lost故障测试 |
| SIM-020 | 前后端真实端到端闭环 | FE+BE+QA | 008、013～019 | 4–6 | submit→worker→sealed result→UI，非假状态 |
| SIM-021 | FUSE平衡/剖面structured exporter | ENG+PHY+DATA | 003、010、018 | 5–9 | 与原生数值对照；rho/COCOS/二维顺序测试 |
| SIM-022 | 工程工况/载荷/网格映射与守恒 | ME+DATA+ENG | 003、014、021或独立权威源 | 6–10 | 力/力矩/能量映射，几何revision失效处理 |
| SIM-023 | WorkflowRevision/CouplingGroup执行 | ENG+BE | 004、016、022 | 6–10 | 参考反馈算例收敛/发散；迭代与物理时间分开 |
| SIM-024 | ComparisonRecord和候选/设计差异界面 | DATA+FE | 003、008、014、020 | 4–7 | 输入/对齐/方法固定；科学残差不基于图形抽稀 |
| SIM-025 | VVUQ套件和EXL同炮基准门 | PHY+ME+DATA+QA | 014、021、024 | 6–12+数据等待 | calibration/validation/holdout分离，指定用途资格 |
| SIM-026 | 第二生产实现/Python核的资格试点 | ENG+PHY/ME+QA | 011、020、025相关判据 | 5–10+模型实现 | 单能力差分/解析/边界验证，新QualificationRecord |
| SIM-027 | CI契约/兼容矩阵/镜像与发布组合 | QA+OPS | 005、011、012 | 4–6 | 无浮动运行引用；升级/回退在受支持窗口测试 |
| SIM-028 | 运行监测、数据保留、备份恢复演练 | OPS+DATA | 014、019、027 | 4–7 | 元数据+对象+镜像引用可恢复；日志受控 |
| SIM-029 | 评审和公开投影发布管线 | BE+DATA+FE | 009、013、024、025按用途 | 4–7 | 白名单投影、脱敏、撤销；匿名构建不开放计算 |
| SIM-030 | 文档/模块显示名迁移/移交运行手册 | ARCH+FE+OPS | 006、020、027 | 2–4 | 全站01/02一致、无“已部署”误报、Cursor上手步骤 |

SIM-025 的专业证据获取不承诺固定人日；表中只估平台接入和套件工作。SIM-022 可以从独立工程权威载荷开始，不因 FUSE exporter 尚未完成而阻塞工程工作流。P2上线验收必须包含SIM-027所需的兼容测试和SIM-028必要恢复能力，不等到所有科学功能完成后再补。

后续细化见[IMAS/传统栈INT-001～008](06-imas-and-legacy-interoperability.md)及[容器运行RUN-001～006](07-container-and-runtime.md)。它们映射既有SIM任务，不重复计算人日；兼容跨度确定后重新估算受影响票据。P0冻结目标DD/字段及运行包合同，P1做最小跨库/传统文件包试验，P2以DockerBackend完成真实执行及原生—容器数值对照。真实HPC与商业软件适配按具体资源需求另行启动。

## 4. 前两个 Sprint 的具体安排

### Sprint 1：第1–2周

ARCH/专业负责人冻结01/02能力目录、两个场景和必需端口；DATA完成最小 quantity/轴/坐标/缺失profile；BE完成RunSpec/Attempt/Result/Assessment草案及状态转换表；ENG分析FUSE产物、创建受控导入转换与Python参考producer；FE用相同fixture搭建一级入口和运行页骨架。

同时核对FUSE实际DD/schema与扩展，选择首个Julia↔Python交换fieldset；冻结EnginePackage、只读输入/输出目录及runtime形式。用原生文件包reference producer检验传统接口，不要求先把所有旧代码容器化或改写。

Sprint退出检查：物理场景与无Shot工程场景都能被合同表达；TS/Python对正负样例结论一致；页面能读真实已导出指标并明确缺失网格；所有设计决策记录到ADR；评审锁定0.1合同，不强行宣告1.0稳定。

### Sprint 2：第3–4周

FE完成静态结果源、三轴状态、证据检查器及可用科学视图；DATA/ENG完成可重复的导入、投影绑定和错误样例；BE/OPS创建内部平台包结构、开发数据库/对象存储和研究/目录基础API；QA建立合同、来源切换与异常用例。若资源充足，FE接目录读取，运行提交仍以真实后端就绪为开启条件。

Sprint退出检查：两个producer在同一通用运行页渲染；删除/禁用FUSE runtime仍能看历史结果；展示场数据只来自完整fixture/真实exporter；未实现提交按钮不会产生假运行；下阶段Gateway任务拆分可直接开工。

## 5. 验收矩阵

| 验收ID | 测试情境 | 必须观察到的结果 |
| --- | --- | --- |
| ACC-01 | physics与engineering同时注册，FUSE关联两域 | 领域/能力/引擎多对多，不出现FUSE一级知识模块 |
| ACC-02 | 无炮号工程设计、稳态物理、时域分析 | 各自轴语义正确，未伪造时间或Shot |
| ACC-03 | 同profile两个producer；禁用FUSE | 通用页/中性数据仍可用；没有引擎专用科学分支 |
| ACC-04 | 变换错误：W/m²→W、rho混用、张量顺序/网格错 | 端口拒绝或显式映射后校验，不静默连接 |
| ACC-05 | 缺数组块/NaN/未导出/未收敛 | mask/null/reason可见，无零填充或“通过”回退 |
| ACC-06 | 相同/不同payload复用幂等key | 同请求同run；不同请求409，无额外作业 |
| ACC-07 | runtime启动后回执丢失、投递重复 | job按attemptId查重；最多一个规范结果提交 |
| ACC-08 | worker断线、租约过期、旧worker恢复 | fencing阻止旧写入；确认运行时后恢复/替代 |
| ACC-09 | 用户取消与结果完成同时发生 | CAS产生唯一因果终态；未知存活不冒称已取消 |
| ACC-10 | 重连SSE、事件重复/乱序、游标过期 | 去重/补齐或snapshot恢复；页面断线不取消计算 |
| ACC-11 | 对象写后DB失败、DB登记后事件投递失败 | orphan隔离/outbox重放；无dangling canonical引用 |
| ACC-12 | exit=0但数值未收敛/未做实验验证 | 作业成功与科学/用途状态独立可见 |
| ACC-13 | 几何或材料revision改变 | 受影响网格/载荷映射/资格显示失效，不自动复用 |
| ACC-14 | 源run→投影v2→renderer | source/recipe/digest链一致；权限先于预算路由 |
| ACC-15 | 对象存储迁移/切换DataAdapter | 逻辑引用与原始内容身份保持，hash/读取权限正确 |
| ACC-16 | 标量设计扫描与反馈耦合参考算例 | 子run可追溯；可行性/失败/收敛分别记录 |
| ACC-17 | Julia/Python实现对比 | 逐量容差、守恒/边界错误有报告；资格不自动继承 |
| ACC-18 | 私有项目、匿名模式、过期读取授权 | 不可越权读取/提交；受控重新授权不重算 |
| ACC-19 | 恢复数据库+对象/镜像备份 | 冻结run完整可读，环境满足条件时可复算 |
| ACC-20 | 契约升级/旧引擎退役/应用回退 | 支持窗口可读；不覆盖旧结果/盲降级数据库 |

科学验收阈值在测试前由PHY/ME冻结。不得事后放宽到“能通过”，也不能以npm check、solver退出码或Notebook PASSED代替这些验收。

## 6. 测试层与初始性能目标

合同层测试包含schema、跨字段语义、负例、canonical hash与向前兼容；适配层测试固定文件包和错误分类；执行层注入重复、断网、OOM、超时、取消、丢回执和存储故障；前端测试source切换、轴、缺失、双语和权限状态；科学层以解析/制造解、收敛、守恒、差分和独立实验数据评估。

日常CI不启动全部大型solver。小型参考producer和固定制品覆盖大部分门禁；有变更时运行指定引擎smoke，科学回归在有资源和合法依赖的受控环境进行，输出结构化报告。正式Web发布仍执行仓库现有必需check和部署门禁。

初始性能目标仅是待测设计预算：manifest/首屏摘要优先控制在压缩后512KiB以内；切片按解码内存预算限制而非只看压缩大小；首个有用指标在指定验收机器/网络上目标3秒内可用。确定样例、客户端和网络后记录p50/p95、内存峰值、下载字节与图表卡顿；不能将这些预算称为当前实测性能。

容量首先限制每项目并发、总CPU/GPU时间、内存、输出总字节、任务超时和worker池。大规模UQ/优化还需study总预算、最大child数和stop policy。队列满时返回可解释状态而非让Web请求阻塞。

## 7. EXL-50U 专业接入门

先由数据/物理/工程共同选定同炮场景与用途。公开快照中的一维信号和浏览器几何是展示资源，不自动满足求解输入。必须按能力列出真实几何/线圈/材料/二维磁通/剖面/电流分量/诊断所需字段；缺哪个阻断哪个能力，不补默认事实。

最低证据链：具体装置/工况版本 → 同炮输入快照 → 版本化映射 → 受控回放或前向预测 → 合成诊断/工程载荷 → 独立残差和守恒 → ScientificAssessment → 设计候选或公开投影。回放、前向求解与逆问题重构的输入和资格分别记录。

calibration、validation与holdout数据集按炮/工况分组，避免同一炮的相邻样本同时进入训练和验证造成泄漏。设计包络和预测误差分开；给定CQ/VDE/TQ等事件历史是规定工况，不被描述为引擎已能预测其发生时刻。

FUSE只是首个候选，不是EXL接入门的前置锁定。其他更适合某能力的引擎可以使用同一合同；输入/映射/专业验证仍需独立通过。

## 8. 合并、分支和发布实施步骤

1. 再次核验FusionDigital远端URL、Codeup master和GitHub main；一致时从该精确SHA建立 `codex/simulation-platform-foundation` 隔离worktree。本轮本地checkout落后持续更新的远端，不能直接在旧HEAD上大规模改造。
2. 在新worktree中审查最新AGENTS和已有可视化/部署门禁，将本目录规划作为小型文档变更纳入评审。旧工作树未跟踪规划稿按需人工选择纳入，不整批复制output/tmp/history。
3. Web按窄范围PR推进：合同消费者/fixtures → 导航+只读运行页 → 数据源+可视化绑定 → BFF。每项提交可独立验证和回退。
4. 内部科学平台初始化独立仓库和CI，合同规范从单一 `contracts/` 发布；Web固定bundle digest消费。外部FUSE保持独立上游引用，私有输入和商业依赖不进入公共代码镜像。
5. 科学服务先在开发/测试环境完成真实端到端、故障和恢复验收，再启用研究环境计算。公开站只接审核投影，部署另按现有发布合同执行。

建议PR粒度为一个可审阅行为或合同变更，避免“把整个FUSE和全部后端一次合并”。Git只负责源码与小型规范；大型制品的迁移、hash检查和访问策略由数据管线负责。不得将其他仓库commit强塞为FusionDigital同SHA要求；科学发布组合清单负责跨仓库兼容。

## 9. Cursor 开发组织

未来多根工作区包含：FusionDigital隔离worktree、内部科学平台repo、可选固定FUSE源码checkout。每根目录有自己的依赖和AGENTS；FUSE upstream用于调试定位，改造通过adapter或明确fork发布。

建议提供任务：Web dev、Gateway dev、reference worker、FUSE worker、contract tests、offline importer、单run replay。调试链从浏览器requestId追到runId/attemptId，再到worker日志与制品；Python/Julia分别附加调试器。CI使用与本地相同的固定合同和输入包，避免“Cursor里能跑”成为唯一环境说明。

本地配置只保存非机密默认值，认证/存储配置用环境和本机secret管理。run产物落受控数据目录，不写入源码树。用一个静态结果启动前端调试，应无需安装Julia；调试Julia引擎时应无需启动全部Web发布基础设施。

## 10. 评审输入与决策记录

本轮已经给出默认技术路径，开发可从P0/P1继续。实施过程中逐项落实下列事实，不要求用户先回答一整套技术问卷：实际团队与专业owner、首批同炮/工程载荷数据、已有内部身份和存储/算力条件、第二生产能力候选、专业阈值和结果用途。

在这些事实未具备前，可完成全部中性合同、双producer离线工作台和参考运行链；不能提前宣布EXL科学资格、真实工程场或生产计算授权已经完成。每项新决策以ADR revision或QualificationRecord落地，避免仅留在对话中。

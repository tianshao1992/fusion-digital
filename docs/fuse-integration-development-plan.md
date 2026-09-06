# FUSE 主体集成：分阶段开发与验收计划

更新：2026-09-07。产品入口 `/simulations`。本计划不以一次 DIII-D demo 的成功代表 FUSE 全部功能已实现、全部数值收敛或装置验证。

## 1. 模块定位与边界

- **01 物理模拟**：平衡、输运、源项、电流、台基、稳定性、诊断、SOL、动态演化。
- **02 工程设计**：构型、PF/被动结构、磁体能力、结构模型、第一壁/偏滤器、中子/包层、热循环和成本。
- **共享计算基础设施**：研究、版本、RunSpec、Attempt、资源、制品、科学投影和证据。FUSE 是可替换引擎，不作为业务数据库或前端框架。
- 原生 Julia、未来 Python 重实现、Docker 和 HPC 后端均通过版本化适配器接入。相同容器启动方式不等于相同物理、单位、数据约定或模型资格。

固定 FUSE 1.2.0 / `9ef2f99af73497706a097d99a2aaac2f08405370`，FuseExamples / `a77970e85356a429178232d119b3b747878c1e32`。源码清单共 **71 个 Actor 类型、18 个家族**，包含调度器、Replay、NoOp 和外部接口，不能作为“71 个已验证求解器”的宣传口径。完整机器可读清单见 `app/simulations/engine-catalog.ts`。

## 2. 分层架构

```text
FusionDigital 仿真工作台
  ├─ 参数与能力：版本化 RunSpec、模型约束、物理/工程域
  └─ 科学结果：只读摘要 → 按需加载与哈希核验 → 场/剖面/通量/数表
                   ↑ 经审核的公开投影（发布步骤，非 worker 自动写入）
本地执行器 / 后续独立鉴权网关
  ├─ EngineAdapter：describe / validate / resolve / collect
  ├─ RuntimeBackend：launch / observe / terminate / reconcile
  ├─ RunSpec → 不可变 Attempt → 原生 dd、配置、日志、检查、manifest
  └─ ResultProjector：原生领域格式 → 白名单科学投影
```

当前生产合同是 `public-anonymous`。**不在现有生产站加入匿名任务提交、Docker socket 或本机 HTTP 回调**。现有 `/api/research/runs` 是知识研究与审核流水线，不是科学计算任务表，不予复用。本轮最小控制平面是本地 CLI；网页导出 RunSpec 之后，用户在受控工作区执行。

后续远程任务必须另设服务身份、真实认证、研究/制品授权、额度、幂等和审计。不得信任公网直接传入的身份头。Docker 镜像必须固定 digest，参数只能映射白名单 launch plan；禁止请求指定任意 executable、shell、挂载、network 或资产上游。

## 3. 数据与版本管理

| 对象 | 身份与不可变性 | 当前/后续职责 |
| --- | --- | --- |
| Facility record | 来源、装置、shot/time、访问许可 | 与模拟结果独立，不能用仿真改写装置观测 |
| Study / Draft | 可编辑版本，未执行 | 设计意图、扫描、模型选择 |
| RunSpec | 严格白名单 + 确定 JSON + SHA-256 | 绑定源码、配方、模型、求解器与资源；不是任意脚本 |
| Attempt | 新唯一 ID、单次启动、独立状态 | 重试是新 Attempt；取消/失败不伪装为成功结果 |
| Environment lock | Project/Manifest、path 依赖源码、权重和输入 SHA-256 | 校验 Manifest 真实路径属于所选工作区；运行前后检查漂移 |
| Native artifacts | 输入/生效/结果参数、初始/求解/最终 HDF5、日志 | 私有/本地保存，不默认发布所有 IDS 或训练权重 |
| Result manifest | 必需制品、哈希、数值检查、阶段证据 | 计算退出、采集完成、科学判据分开 |
| Browser projection | `fuse-physics.v1/v2`，严格字段/单位/尺寸校验 | 内容寻址 gzip、同源受信清单、按运行身份加载 |
| Comparison record | 两个不可变 run 引用 + 坐标/单位/时间语义 | 不以插值、残差排名或输入拟合替代装置验证 |

`simulation-result.v1` 是公共结果信封，`fuse-demo.v1` 保留旧归档，`fuse-physics-run.v1` 标记新增完整物理结果。v2 科学投影新增初始化参考、平衡来源、完整函数评估历史和物理通量；保留 v1 读取，不重写既有归档。

IMAS 兼容通过原生 dd 与显式投影实现。`imas2hdf(... freeze=false, strict=false)` 属 OMAS HDF5/FUSE 扩展数据，并非声明已完成官方 IMAS Access Layer/DD 全量合规。保留 COCOS 11、SI 单位、R/Z 数组方向、独立时间与径向坐标。后续 IMAS/MDSplus/传统 Fortran/C++/CAE 适配单独实现，不能把 Web JSON 作为这些系统的替代标准。

生产发布不发布整个 Julia depot、模型权重、native HDF5、访问凭据或受限历史。FUSE Apache-2.0 不等于第三方求解器、权重和实验数据全部可再分发；每个新增外部依赖单独核验许可。

## 4. 阶段与完成判据

| 阶段 | 开发内容 | 算例与验收 | 不能继承的资格 |
| --- | --- | --- | --- |
| M1 执行基础 | RunSpec、独立本地 supervisor、状态/取消/超时、环境与制品锁 | 启动失败、正常/非零退出、取消、超时、状态写失败、日志保护等轻量故障测试 + 真 Julia 取消 | 不是多租户远程集群或长期后台队列 |
| M2 DIII-D 核心 | 官方 L-mode TGLFNN/GKNN/QLNN 各自独立初态；default 耦合稳态 | 原生往返、有限网格/正 Te/ne、固定平衡不变、完整源/输运剖面、通量与迭代历史 | 不等于高保真非线性湍流或实验验证 |
| M3 扩展物理 | L/H/default 与 FRESCO/TEQUILA、新经典模型、台基、独立 HCD、电流、SOL/壁、诊断、短时动态 | 每个 actor/model/case 独立字段与守恒/网格/时间步检查；缺前置条件明确 skip | 单次 Stationary 不覆盖所有子模型、H-mode 或动态控制 |
| M4 工程 | FPP 固定几何磁通/解析应力 → PF 与被动/垂直稳定性 → 包层、热系统、成本 | 几何不变、压力/电磁边界、网格一致性、热/电收支、材料与成本假设 | 1D 解析应力不是 3D FEM；DIII-D 不能验证电站 TBR |
| M5 外部引擎 | CHEASE、TGLF/NEO/QLGYRO、RABBIT/TORBEAM/MARS、可选热网络/NN | 独立 Linux/HPC runtime、许可、真实二进制/模型版本、资源/失败协议、专用收敛测试 | 本机 `using FUSE` 不证明这些程序可用 |
| M6 装置验证 | 授权 DIII-D 数据包、不确定度、训练/调参/测试分离；再 EXL-50U | 观测与模拟独立身份；校准/验证协议与可追溯指标 | 初始化参考对照不是装置精度认证 |
| M7 发布闭环 | 类型/契约/浏览器/全仓检查 → 双远端 → 香港 + Sites 同 SHA | 生产合同、SSH、双域名 TLS、可信 DNS、三网 HTTP、共享资产字节/哈希和正式 pair gate | 本地通过/提交成功不代表已上线 |

每阶段单独审查、测试、提交；外部运行时/实验授权/生产通道未具备时，保持相关能力 pending，不用占位成功状态推进总进度。

## 5. 首批计算的准确科学口径

### L-mode 三代理

固定输入 `D3D_machine.json` + `D3D_standard_Lmode.json`。后者无可靠 shot 元数据，不补放电号。每次从初始化数据独立起跑；固定输入平衡，绝不把图标为本次重求的平衡。

按固定 notebook 使用 `rho_transport=0.1:0.05:0.85`、最大 300 次、`:simple_dfsane`、step size 1、温度/密度/旋转匹配、不演化台基。TGLFNN/GKNN 使用 `sat3_em_d3d_azf-1_withnegD`，QLNN 使用 `QLNN/sat3`。Notebook 关闭 NN 训练边界警告，因此 **OOD 未评估**。

直接读取 `actor.error` 和 `map(norm, actor.err_history)`，不再从日志稀疏采样。函数评估序号不是物理时间或外层迭代；最优选定残差可以与历史最后一点不同。此版 FUSE 的 `:simple_dfsane` 将 `xtol` 映射为 `NonlinearSolve.solve(abstol=...)`；原生终止范数/retcode 未保存，不可直接拿该参数与图中的 L2 范数比较或编造终止原因。既有归档中的“step tolerance”注释已勘误，数值与不可变原始字节不改写。

通量来自 FUSE 的 `flux_match_targets/flux_match_fluxes`。目标使用积分源/磁面面积和源网格最近点。动量通量按 FUSE/GACODE 实现为 `kg/s²`，与该版 IMASdd 字段元数据 `kg/m/s²` 不同；保留实现数值并显示说明，不自行乘除 R。

### default 耦合

使用 `D3D_machine.json` + `D3D_eq_ods.json` 的离线平衡。后者有 pulse 133221 元数据，但 case 生成的核心剖面、3×1 MW/80 keV NBI 和 3 MW EC 是参数化配置，不能称为该放电观测。

真实调用 `ActorStationaryPlasma`：每轮 Sources → Pedestal → Transport → Current → Sawteeth → Equilibrium。保留外层剖面变化历史与逐轮内层历史。最后一次输运残差发生在电流/平衡更新之前；因此在最终平衡上另跑 FluxCalculator 作后耦合通量检查，前端不得把旧残差当成后检查残差。达到最大次数后上游可告警并正常返回，必须另判数值状态。

### 工程扩展

不能将 `WholeFacility(update_plasma=false,update_build=false)` 称为纯只读、完全固定设计：仍可能优化 OH 能力、PF 电流、Li6，并重建被动回路。先从收敛 FPP 原生快照的独立副本执行明确的 FluxSwing/Stresses 配方，再逐项放开优化范围。

## 6. 本地操作

```powershell
npm run simulation:run -- run --spec examples/simulations/diiid-lmode-tglfnn.json
npm run simulation:run -- run --spec examples/simulations/diiid-lmode-gknn.json
npm run simulation:run -- run --spec examples/simulations/diiid-lmode-qlnn.json
npm run simulation:run -- run --spec examples/simulations/diiid-default-stationary.json
npm run simulation:run -- status --run-id ACTUAL_RUN_ID
npm run simulation:run -- cancel --run-id ACTUAL_RUN_ID
# 核验成功后，显式审核和发布投影；不是 worker 自动行为
npm run simulation:publish-diiid -- D:\Code\Fuse\results\ACTUAL_RUN_ID
npm run simulation:publish-diagnostics -- D:\Code\Fuse\results\ACTUAL_STATIONARY_RUN_ID
npm run simulation:engineering
npm run simulation:publish-engineering -- D:\Code\Fuse\results\ACTUAL_ENGINEERING_RUN_ID
```

默认环境 `D:\Code\Fuse`；Windows Julia 1.12.7，最多 8 线程，单工作区租约。异常遗留租约必须核实拥有者与进程状态，不自动删锁、自动杀磁盘记录 PID 或自动重跑。原生记录完整保留，未提供跨机器任务恢复或无人值守持久队列。

## 7. 发布阻断处理

当前香港 SSH 22 连接被服务端/网络关闭，无法取得 active release；不能按本地构建成功宣布上线，也不能绕开顺序先单独更新 Sites 或改变 DNS。待恢复授权 SSH 通道后，在精确提交上重新执行 AGENTS.md 与 RELEASE.md 的全部发布步骤。缺实际境内电信/联通/移动 HTTP 探针时不得以 DNS 检查替代。

本文件是开发与资格计划。具体已执行结果、失败 Attempt、测试数字和提交/部署证据以同轮验收记录为准；未完成的 M3–M6 不能标记为全功能开发完成。

2026-09-07：M1/M2 和 M4 首个工程子流程的真实结果、容差勘误及失败重试见 [阶段验收](fuse-stage-acceptance-2026-09-07.md)。Windows 运行前可使用 `scripts/simulations/prepare-models.ps1` 补齐固定模型，不通过改变物理配置绕过缺依赖问题。

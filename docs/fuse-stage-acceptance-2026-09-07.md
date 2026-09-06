# FUSE 主体功能分阶段集成与实算验收

日期：2026-09-07（北京时间；运行 ID 使用 UTC）。

## 结论与范围

本批完成执行基础 M1、DIII-D 核心离线链 M2，并完成 M4 工程阶段的首个固定 FPP 磁通/解析应力子流程，接入 `/simulations` 的物理模拟和工程仿真域。**不是整个 FUSE 全模型、外部求解器或装置验证完成，也不是生产部署完成。**

总体架构、数据/版本管理及后续 M3–M7 见 [开发计划](fuse-integration-development-plan.md)。完整源码目录包含 71 个 Actor 类型、18 个家族；清单仅表示源码存在，不能当成全部运行资格。

公开站保持 `public-anonymous`：浏览器配置 RunSpec、查看/对照/导出已审核结果；独立本地 CLI 执行 Julia。没有匿名计算提交接口、Docker socket、公开队列或无人值守持久调度。Docker/HPC、正式 IMAS AL、EXL-50U 适配仍需后续阶段。

## 固定基线

- FUSE 1.2.0：`9ef2f99af73497706a097d99a2aaac2f08405370`。
- FuseExamples：`a77970e85356a429178232d119b3b747878c1e32`。
- Julia 1.12.7 / IMAS.jl 7.3.0 / TurbulentTransport 1.2.17，8 CPU 线程。
- 环境 Manifest SHA-256：`17ca30e07c0e44e426abca50a37b829bf4fe797d3c06dfae5ec104cbb0fbe32e`。
- 本机工作区 `D:\Code\Fuse`；依赖 path 必须真实解析到该工作区，执行前后校验输入/依赖摘要和固定源码。模型权重不进入公开包。

## DIII-D 实算结果

| 流程 | 新运行 ID | 计算阶段秒数 | 内层选定解 L2 残差 | 函数评估 |
| --- | --- | ---: | ---: | ---: |
| L-mode / TGLFNN | fuse-diiid-20260906171323467-88aa0279 | 145.7942524 | 0.0013607392091884612 | 56 |
| L-mode / GKNN | fuse-diiid-20260906171840962-ede653fa | 146.6926461 | 0.001662867898334227 | 144 |
| L-mode / QLNN | fuse-diiid-20260906172206806-43f08464 | 164.3354423 | 0.006229018356195579 | 410 |
| default / TGLFNN 耦合 | fuse-diiid-20260906174722551-3ffd17fc | 185.0194556 | 0.0011195207398753276（最后一轮） | 47 / 86 / 47 / 53，共 233 |

秒数是驱动计时的计算/导出阶段，不包括外部进程启动等全部端到端开销。

每个 L-mode 算例从独立初始化状态运行，保留输入重建平衡；发布 129×129 平衡、96 组可用剖面、4 个通量通道、初始化参考和完整评估历史。**没有本次重新求平衡，也没有原始诊断误差棒或确认的放电号。** 三种模型的标量对照是描述性比较，不是残差排名模型优劣。

default 真实运行 Sources → EPED → FluxMatcher/TGLFNN → QED → SawteethSource → FRESCO。外层误差：

`0.19677964058428257 → 0.11244520317949405 → 0.05495951435650875 → 0.018912946031259315`

第 4 轮达到示例阈值 `0.05`，上限 5 轮。此量是电流/压力剖面更新的组合指标，**不是实验预测误差小于 5%**。发布 129×129 平衡、108 组剖面、3 个通量通道和各轮内层历史；最终平衡上的 FluxCalculator 后检查与此前内层残差分开显示。

检查通过：有限网格、正电子温度/密度、原生 HDF5 回读与完整投影比对；L-mode 额外校验固定平衡不变。`deviceValidated=false`、`oodAssessed=false`。耦合运行 15/15 个 manifest 制品摘要经独立只读复核吻合。未建立守恒误差统一阈值、全量适用域或实验准确度认证。

### 容差勘误：保留证据，不改写旧结果

四个新 DIII-D 原始投影 `fluxMatch.derivation` 曾把 `xtol` 写成 step tolerance。固定源码复核后更正：FUSE `flux_matcher_actor.jl:351–360` 将它传给 `NonlinearSolve.solve(abstol=...)`；SimpleNonlinearSolve 2.12.0 / NonlinearSolveBase 2.30.3 的该路径默认使用残差 **L∞** 终止条件，归档 `norm(err_history)` 是 **L2**。

界面/新驱动说明已修正。原始 JSON/gzip、数值、run ID 和摘要不改写，下载时本勘误仍适用。未保存 retcode 与终止 L∞ 值，不能仅因 L2 大于 xtol 判失败，也不能据正常退出宣称严格收敛已证实。

## FPP 工程子流程

独立运行：`fuse-engineering-20260906174625825-09a374ef`，计算阶段 `43.0227064 s`。

父运行：`fuse-fpp-20260907-003257-48a4fa67`；父 manifest SHA-256：`7bc4af2942c024b1033bc6e25da6cb1d43f7cf9fb946388a84e3ad0ba9f19433`。父结果不修改，工程数据使用独立 `fuse-engineering.v1` 身份。

从固定 HDF5/act 快照运行 FluxSwing（OH 使用配置的临界电流裕量），再独立运行 101/201/401 解析采样的 Stresses。没有 TF nose / center plug。三份 HDF5 回读应力、位移、径向网格逐项一致，几何不变，13/13 个 manifest 制品摘要复核通过。

| 工程指标 | 结果 |
| --- | ---: |
| 最大平顶能力估计 | 26930.8734 s |
| 升流 / 平顶 / PF 磁通 | 86.1277 / 195.9010 / −17.5657 Wb |
| OH / TF 磁场 | 20.3359 / 11.5696 T |
| OH / TF 电流密度 | 43.6684 / 31.4979 MA/m² |
| 401 点 TF / OH 峰值 Von Mises | 1211.8582 / 1745.3898 MPa |
| TF / OH 最大绝对径向位移 | 3.38337 / 4.76410 mm |

峰值达到 GPa 量级，页面提示需要独立材料与许用应力评估；不据此宣布结构安全或违反具体规范。101/201/401 是**解析采样密度，不是 FEM 网格**；轴向应力依赖采样环向应力均值，密度改变会影响等效应力。OH 通断按部件峰值选择，不是逐点包络。没有疲劳、三维应力集中、热—结构或材料资格验证；平顶能力也不是完整电厂可运行时长。

## 数据、前端与复现入口

- `simulation-result.v1` 信封区分旧 demo 和 `fuse-physics-run.v1`；旧记录全部保留。
- 三类 bundle 清单按 run/parent manifest、原始/压缩 SHA-256 绑定物理、工程与逐轮诊断结果。
- 同源、无凭据、有解压/长度上限、严格字段/单位校验；会话导入不能指定远程资产 URL 或取得内置结果信任。
- 物理前端：R/Z 等比例平衡、磁通色场、独立径向剖面、参考/预测、源/输运通量、全部函数评估、逐轮诊断、数表、JSON/CSV/SVG 控件。
- 工程前端：选择 FPP → 02 工程仿真，查看几何、材料层/线圈、独立应力/位移记录与采样敏感性。
- native HDF5/输入/生效/结果配置/日志留在本机 `results/<run-id>`；不发布全部 IMAS IDS，不声称官方 IMAS Access Layer 全量合规。

```powershell
# 在 FusionDigital checkout；固定模型下载并校验大小/摘要
.\scripts\simulations\prepare-models.ps1 -Workspace D:\Code\Fuse
npm run simulation:run -- run --spec examples/simulations/diiid-default-stationary.json
npm run simulation:run -- status --run-id ACTUAL_RUN_ID
npm run simulation:run -- cancel --run-id ACTUAL_RUN_ID
npm run simulation:publish-diiid -- D:\Code\Fuse\results\ACTUAL_RUN_ID
npm run simulation:publish-diagnostics -- D:\Code\Fuse\results\ACTUAL_RUN_ID
npm run simulation:engineering
npm run simulation:publish-engineering -- D:\Code\Fuse\results\ACTUAL_ENGINEERING_RUN_ID
```

重新计算使用新 ID；发布脚本拒绝覆盖。工程当前是固定快照流程，尚无通用可编辑工程 RunSpec。克隆前端仓库本身不等于具备完整 Julia 环境、原生 HDF5 或全部计算依赖。

## 失败记录与修复

- `fuse-diiid-20260906170052985-85c32490`：真实取消，未发布。
- `fuse-diiid-20260906170205017-79ee5438` / `20260906170745600-036b5321`：导出缺少可选 source/model 名称；修为明确的 Unnamed 标签，不填造物理数据。失败目录保留。
- `fuse-diiid-20260906172550083-8b7a9a97`：Windows relpath 反斜杠造成 LFS 下载 URL 404，不是数值不收敛。固定版本 `sat1_em_d3d.bson` 补齐并验证 3,473,903 字节 / SHA-256 `eabf4b0133b7b6312f17a01abb1208b0f2b7661746f71843ea80e3fdc43a9fd1`；新运行保持工况/模型不变。
- `fuse-engineering-20260906173933340-4f472feb`：父 act 集合不支持 global_time；移除错误调用，Actor step 自身从 dd 同步时刻，新运行通过。
- 浏览器发现兄弟组件重复 key，已加组件前缀；深色科学曲线已适配主题颜色。
- 新结果曾超过 Sites 含预留量的包体门禁；仅开启 SSR 局部绑定名压缩，保留表达式、RSC/搜索完整性与科学资产，不提高上限。

## 软件验收与发布状态

工作副本的 TypeScript、限定 ESLint、39 项契约/执行/科学数据测试和 2 项中英文 SSR 测试通过。浏览器检查桌面、390 px 请求视口、英文工程页、深色、工程 101 点数表和耦合第 2 轮（86 次评估），无页面横向溢出。内置浏览器未建立下载落盘完成证据，不能将点击当作下载通过。

最终精确提交的 `npm run check`、资产锁校验、双远端同步及发布证据另写仓库外，避免将旧构建通过结果冒充最终提交验收。

香港 SSH `47.75.119.239:22` 本轮仍返回 connection closed，无法读取 active release。按 Sites skill 和项目发布顺序，**暂停生产发布和 Sites 更新**，不修改 DNS，不使用 Sites 单端更新替代上线。恢复后须验证双域名 TLS、可信 DNS、三网 HTTP 和共享资产，再运行正式 pair gate。

后续未完成：M3 扩展物理/短时动态；M4 剩余工程（PF/被动/垂稳、包层/热系统/成本）；M5 外部 Linux/HPC 求解器与许可；M6 授权实验/EXL-50U 验证；M7 双端上线。按计划逐个 recipe/model 验证，不打“FUSE 全部通过”标签。

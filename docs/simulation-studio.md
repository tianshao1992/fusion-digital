# 仿真模拟工作台：FUSE 科学结果可视化

## 产品定位

入口 `/simulations` 与数字样机、全球装置、聚变数据并列。物理模拟（01）和工程设计（02）共用研究与结果工作台；FUSE 是第一个计算引擎适配器，不是被永久绑定的平台架构。

当前是**真实离线计算结果的公开只读回放**。网页不执行 Julia、Docker 或任意命令，不增加匿名写 API。工况草稿 `executionReady=false`，修改草稿不会修改归档或启动计算。

## 本轮科学结果

默认运行 `fuse-fpp-20260907-003257-48a4fa67`：

- FUSE 1.2.0，源码 `9ef2f99af73497706a097d99a2aaac2f08405370`。
- Julia 1.12.7、8 线程，IMAS.jl 7.3.0，计算阶段约 165.796 s。
- 67 × 129 个矩形 R–Z 网格点，保留全部 ψ 值，单位 Wb，COCOS 11。
- 9 级真实闭合磁通面、LCFS、磁轴、第一壁；截面按 R/Z 米制等比例显示。
- 118 组实际可用剖面：电子/离子温度与密度、安全因子、压强、平行/环向/自举/欧姆电流，以及各加热、粒子、辐射、交换等源项。
- 28 个生成设计层、11 个线圈，显示材料、厚度、截面及原生电流时间样本。
- 13 个标量；聚变功率约 449.326 MW、Q 约 8.652。
- 3 次报告迭代，误差 `0.014866684776063779, 0.0770547761715284, 0.031351701114853504`，最终低于示例阈值 0.05。
- 原始记录 SHA-256：`7bc4af2942c024b1033bc6e25da6cb1d43f7cf9fb946388a84e3ad0ba9f19433`。
- 原始科学 JSON SHA-256：`606e01b106f020846d110c6f92b7ad9645a77368ab006fb29976a8cada25f2a2`。

同时保留早期 FPP 标量归档与 DIII-D FluxMatcher 代理模型归档，后者有 3 / 11 / 138 个日志观测点。没有空间数据的运行明确显示缺失，不套用默认 FPP 的图。

“完整可视化”指本轮实际导出的科学变量、场和设计截面都能被查看、追溯或下载，**不是全部 IMAS IDS 的通用查看器**。完整原生 HDF5、初始化前输入、运行后配置、日志和 manifest 保存在本机运行目录，不随网页公开。

## 界面与科学口径

- 主工作区：紧凑工况选择、六项标量、磁平衡截面、六组主要剖面。
- 磁平衡支持第一壁/磁通面/ψN 色场切换、最近网格点读数和 SVG 下载。色场为限量采样预览，JSON 保留全部网格值；不平滑或伪造数值。
- 变量浏览器按核心/平衡、源项分组，显示每个变量自身的径向网格、单位、时间和 IDS 路径；支持缩放、重置、精确数表、原始单位 CSV。
- 全量 JSON 下载包括原生单位的所有已导出变量与几何。图表上的 keV、kPa、MA/m²、MW 等显示缩放不改写原始值。
- ρtor,N 与 ψN 不是同一个坐标；平行电流与环向电流不能混加。源 index=1 是聚合量，不可重复叠加；负损失保留符号。
- 平衡、核心及源项各自时间独立显示；不同时间会警告，不做静默对齐。
- 核心输运模型为 `none`：核心剖面是耦合设计点结果，不是高保真湍流输运预测。
- 工程截面是参数化设计几何，非 CAD/FEA/CFD/中子学响应；几何类型 5 的轮廓是等面积近似。
- 执行成功、示例数值判据、模型适用域、装置验证分开；未建立 EXL-50U 资格。
- 缺失/非有限样本为 null 或未提供，不补零。线圈初始占位时间/电流可为 null，表格显示“—”。

## 数据和版本管理

```text
固定 FUSE 基线 + 不可变驱动快照
  → 原生 dd HDF5 + 输入/结果/运行 manifest
  → 制品 SHA-256 核验 + 严格字段白名单
  → simulation-result.v1 / fuse-demo.v1 摘要
  → fuse-physics.v1 科学投影（按需加载的内容寻址 gzip）
  → 浏览器数值/结构/体积/运行身份校验
  → 图表、数表、CSV、JSON
```

`physics-bundles.json` 把运行 ID、源 manifest 摘要、原始 JSON 摘要、压缩包摘要/字节数及网格尺寸关联。浏览器只接受内置清单的同源内容寻址路径。会话导入不能自行声明 URL 或继承可信内置场数据。

公开压缩包约 227 KiB，原始投影约 1.23 MB。加载设压缩 6 MB、解压 20 MB 硬上限；流式限量读取，切换运行取消未完成请求。静态服务可能以 HTTP Content-Encoding 自动解压：两种模式都核验原始 JSON 的精确 SHA-256，暴露压缩字节时额外核验压缩摘要。未知字段会被拒绝，防止额外本机元数据进入公开包。

本轮没有增加数据库、服务端计算连接或身份边界。未来的 Study → 冻结 RunSpec → Run/Attempt → ResultManifest、异步网关、资源额度、镜像摘要、原生制品层和科学资格层应保持独立。Docker 统一隔离与运行方式，不自动统一单位、IDS、坐标、模型资格或许可证。其他引擎、Python 实现通过新增适配器及结果 profile 接入。

## 复现和开发

保护原工作区的开发位置：`D:\Code\FusionDigital-worktrees\simulation-studio`，分支 `codex/simulation-studio`。可用 Cursor 打开该目录。

```powershell
npm ci
npm run dev -- --port 5177
# 使用开发服务实际报告的 localhost 地址
```

重新计算（要求已有 D:\Code\Fuse 固定环境）：

```powershell
& ./scripts/simulations/run-fpp-visualization.ps1
# 将下一行替换为上一步实际产生的新目录
node --import tsx scripts/simulations/publish-physics.mts D:\Code\Fuse\results\NEW_RUN
```

驱动先验证基线，创建新目录，复制 Julia 驱动快照再执行，不覆盖旧运行。发布投影脚本校验所有相邻制品，拒绝覆盖已存在的内容寻址文件；它只选择科学投影，不发布 HDF5 或日志。更新默认归档/清单后，精确暂存新公开文件再刷新资产锁，审查差异后提交。保留旧记录是否进入默认清单应作为显式产品决定。

核心文件：

| 文件 | 职责 |
| --- | --- |
| app/simulations/SimulationStudio.tsx | 导航、领域、结果/草稿/导入 |
| PhysicsWorkbench.tsx | 磁平衡、完整剖面、设计几何交互 |
| physics.ts | 科学投影与浏览器加载/校验边界 |
| contract.ts、comparison.ts | 摘要、草稿及描述性对照 |
| SimulationPanels.tsx、RunEvidence.tsx | 配置、输出、证据与指引 |
| scripts/simulations/run-fpp-visualization.* | 固定环境真实计算及原生导出 |
| scripts/simulations/publish-physics.mts | 严格校验与公开投影生成 |
| tests/simulation-physics.test.mts | 数据身份、矩阵/单位、缺失与加载测试 |

## 验收与发布

本轮已通过 25 项仿真契约/数据测试、2 项中英文服务端渲染测试、全仓 TypeScript 类型检查和完整 npm run check。浏览器实际确认磁平衡/六组剖面、源项原始数表、设计层/线圈、英文无中文泄漏、深色主题，以及 390 px 视口无页面横向溢出。已发现并修复 gzip 传输差异。内置浏览器的 CSV 下载事件未返回完成确认，不能把点击操作当作落盘验收；需在支持下载的常规浏览器补充验证。最终部署证据以本轮仓库外 release 记录为准，不以这段文档替代。

Sites 原有资产包余量很小，本轮只压紧 SSR 空白，不更改标识符/表达式，不压缩 RSC，不提高上限、不删除科学资产。香港仍使用 public-anonymous 构建。

正式发布必须遵守 AGENTS.md、docs/RELEASE.md 与香港部署手册：精确提交全量检查、Codeup/GitHub 同 SHA、香港与 Sites 同 SHA、资产逐字节一致、TLS/DNS/三网访问实测。任一未核实不得宣布上线完成；不修改生产 DNS。

# FusionDigital 集成控制研究底稿

本目录是 `/control` 页面、结构化论文/代码索引和《聚变集成控制与 PCS 技术图谱研究报告》的可复现事实源。

## 双索引

- **控制任务索引**：T0 状态估计、T1 启动/电流/磁通、T2 位置/位形/边界、T3 剖面/场景、T4 稳定性/约束模式、T5 排热/粒子/壁、T6 性能/功率/燃烧、T7 失稳避免/保护接口、T8 多执行器集成、T9 PCS/编排/V&V。
- **装置与 PCS 索引**：记录装置、实时架构、关键控制任务、原始论文、官方代码/使能框架、成熟度与缺口。

T0 与 T9 是横切能力，T1–T8 是控制任务。一个工作只有一个主任务，但可以关联多个任务。

## 证据口径

- `E0` 概念/需求；`E1` 数值或合成验证；`E2` 真实装置离线数据；`E3` 实时、SIL/HIL 或影子运行；`E4` 真实装置闭环。
- `D1` 研究原型；`D2` 装置离线工作流；`D3` 实时/HIL/影子试点；`D4` 装置正式运行；`D5` 经治理批准的安全关键用途。
- 代码关系严格区分论文直接实现、官方使能框架、商业使能软件与未公开实现。

## 生成命令

```powershell
npm run research:control
npm run research:control:audit
npm run research:control:report
```

生成文件包括：

- `public/data/fusion-control-landscape.json`
- `public/data/fusion-control-device-profiles.json`
- `public/fusion-control-paper-code-index.csv`
- `public/fusion-control-references.bib`
- `app/control/controlResearch.ts`
- `public/fusion-integrated-control-research-report.docx`

事实变化应先修改 `sources/`，再重新生成；不要直接手工编辑生成产物。

# FusionDigital 聚变诊断研究底稿

本目录是“聚变诊断”知识域的可追溯事实源。一级域使用“聚变诊断”，而不是“智能诊断”或“合成诊断”：智能方法是跨诊断链的赋能技术；合成诊断是把物理状态映射为仪器可观测量的关键子域，但两者都不能覆盖真实仪器、标定、反演、数据质量和电厂设备状态监测的全部责任。

## 主分类 DG0-DG11

| ID | 中文 | English | 边界 |
|---|---|---|---|
| DG0 | 诊断系统工程、计量与健康 | Diagnostic systems engineering, metrology and health | 需求、几何、标定、时间同步、数据质量、辐照/热/真空适配、可维护性与诊断自身健康；横切所有测量链。 |
| DG1 | 磁平衡、电流与位形 | Magnetic equilibrium, current and configuration | 磁探针、磁通环、Rogowski、抗磁、MSE/偏振及平衡/电流剖面重建。 |
| DG2 | 电子密度与电子温度 | Electron density and temperature | 干涉/偏振、反射计、Thomson scattering、ECE/ECEI 等电子状态测量。 |
| DG3 | 离子状态、流动、组分与中性粒子 | Ion state, flow, composition and neutrals | CXRS/CER、XICS、可见/VUV 光谱、NPA、燃料比与中性粒子信息。 |
| DG4 | 辐射、杂质与功率损失 | Radiation, impurities and power loss | Bolometry、SXR/HXR、谱学、Zeff、杂质源与总/局部辐射功率。 |
| DG5 | 聚变产物、中子、伽马与高能粒子 | Fusion products, neutrons, gamma rays and energetic particles | 中子率/谱/成像、伽马、FIDA/CTS、快离子和逃逸粒子。 |
| DG6 | MHD、波动与湍流 | MHD, waves and turbulence | Mirnov、BES、DBS、相关反射、PCI、ECEI、GPI 等时空波动与模式识别。 |
| DG7 | 边界、SOL、偏滤器与等离子体面对部件 | Edge, SOL, divertor and plasma-facing components | Langmuir/往复探针、红外/可见成像、偏滤器谱学、热流、侵蚀沉积、尘埃与壁状态。 |
| DG8 | 工程设备与电厂状态监测 | Engineering equipment and plant condition monitoring | 磁体、结构、热、低温、真空、氚/燃料循环、远程维护和能量转换设备的状态测量。 |
| DG9 | 合成诊断与仪器前向模型 | Synthetic diagnostics and diagnostic forward models | 从物理/工程状态到仪器信号的几何、响应、噪声与采样模型；服务设计、解释、校准和 VVUQ。 |
| DG10 | 集成反演、层析与数据同化 | Integrated inversion, tomography and data assimilation | 从多诊断信号到带不确定度状态的联合反演、Bayesian/GP/滤波、层析和一致性约束。 |
| DG11 | 实时诊断、AI 与决策接口 | Real-time diagnostics, AI and decision interfaces | 实时特征/状态、异常与漂移检测、代理反演、质量门、PCS/保护/HMI 接口；AI 不得绕过授权和安全门。 |

一项工作只有一个 `primaryTask`，但可有多个 `relatedTasks`。网站和报告按主任务统计唯一工作，并在相关章节列出交叉关联，避免重复计数。

## 次级技术族

- `MAGNETIC`：磁/感应式测量。
- `MICROWAVE`：微波、毫米波与太赫兹。
- `LASER`：激光、散射、干涉与偏振。
- `OPTICAL`：可见、红外、X 射线及光谱/成像。
- `NUCLEAR_PARTICLE`：中子、伽马、带电粒子与中性粒子。
- `PROBE_SAMPLING`：探针、采样、压力与残余气体分析。
- `ENGINEERING_SENSOR`：温度、力、位移、应变、振动、声学、光纤等工程传感。
- `COMPUTATIONAL`：前向模型、反演、数据同化、状态估计与 AI。

## 证据与部署是两条独立轴

- `E0`：需求、概念或架构，没有足够动态结果。
- `E1`：数值/合成数据验证或设计分析。
- `E2`：实验室、标定台、原型或受控部件验证。
- `E3`：真实装置数据的离线分析、安装/调试或与独立诊断交叉验证。
- `E4`：真实装置在线/实时或常规实验使用；不自动代表安全资格。

- `D1`：概念/需求。
- `D2`：软件、数值或实验室原型。
- `D3`：安装、联调、回放、影子或 HIL。
- `D4`：常规装置运行或正式工作流。
- `D5`：有明确审批、配置责任、测试与生命周期证据的安全/保护关键用途；默认不得由 E4 推断。

## 代码与软件关系

`status` 仅允许 `official-direct`、`official-enabling`、`community-reproduction`、`controlled-access`、`commercial`、`not-public`。`not-public` 的 `url` 必须为 `null`，论文、海报或产品说明不得伪装成源码链接。每个软件对象还必须说明它是直接实现、前向模型、反演器、数据框架、商业求解器还是复现实例。

## 维护流程

1. 在 `sources/` 更新结构化工作和装置档案，并保留原始 DOI/官方 URL。
2. 运行诊断 landscape builder，生成网页 JSON/TS、CSV 和 BibTeX。
3. 运行严格审计，检查唯一 ID、主分类、年份、URL、代码关系、证据/部署矛盾和装置反向关联。
4. 先生成并逐页审查 Word 报告；报告定稿后再更新 `/diagnostics` 页面。
5. 事实变更需保留 `asOf`，并在局限字段中写清未公开、尚未装机、仅设计或仅离线验证的边界。

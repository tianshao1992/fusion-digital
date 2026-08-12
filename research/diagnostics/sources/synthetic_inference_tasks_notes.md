# 聚变诊断专题调研笔记：DG0 / DG9 / DG10 / DG11

> 数据集：`synthetic_inference_tasks.json`
>
> 证据截止：2026-08-12
> 证据政策：只使用论文原文或 DOI、研究机构/装置官方技术页、官方文档、作者或机构维护的代码仓库。对没有可核验公共仓库的工作明确写为 `not-public` 且 `url: null`，没有用同名第三方实现替代原工作。

## 1. 范围、口径与结论

本分册覆盖四个主类：

- **DG0 系统工程 / 计量 / 健康**：诊断数据从传感器到可审计证据所依赖的数据结构、时间基准、几何、校准、数据访问、实时采集、运行状态与治理。
- **DG9 合成诊断**：以物理状态、机器几何和仪器响应为输入，生成与真实通道同构的合成信号；重点是 forward operator，而不是求一个“更像实验”的漂亮图。
- **DG10 集成反演 / 层析 / 数据同化**：由多个诊断观测和模型共同估计不可直接测量的等离子体状态、校准参数及不确定度。
- **DG11 实时诊断 / AI / 决策接口**：把状态估计、虚拟传感器、异常检测和风险预测送入实时控制或运维流程，同时明确其权限边界。

数据集收录 **35 个唯一工作/工具链**：DG0 8 个、DG9 14 个、DG10 10 个、DG11 3 个。它不是“所有发表过的诊断算法”的罗列，而是一组能解释端到端链条、具有一手证据且可区分软件关系的代表性资产。本版将 TRIPPy 与 Diag2Diag 按其主要科学职责归入 DG10；实时/AI 仅作为相关任务，避免把反演或重建方法一概归为 DG11。

最重要的三点结论是：

1. **诊断数字孪生的最小闭环不是“传感器 → 数值”，而是“真实状态 → 仪器前向响应 → 原始数据 → 校准与质量控制 → 联合反演 → 状态后验 → 重投影残差”。**
2. **合成诊断只能是诊断体系中的一个子域。**它解决的是观测算子和可测性问题；不能替代硬件、计量、数据采集、反演、资产健康或安全治理。
3. **现有 IDA 和实时 AI 距离电厂级数字孪生的主要差距不是算法数量，而是数据契约、模型误差、相关不确定度、运行域监测、降级策略和独立 V&V。**

## 2. 为什么“合成诊断”应是子域，而不是一级总称

“聚变诊断”在工程上是一条完整测量链：

```text
物理/工程真实量
  → 与探针、光子、中子、微波或激光的相互作用
  → 光学/粒子输运与几何遮挡
  → 探测器和模拟前端
  → ADC、时钟、触发、网络与归档
  → 校准、坏道、漂移和质量标志
  → 前向模型/反演/数据融合
  → 状态估计、控制与运维决策
```

合成诊断只覆盖其中的“真实状态到测量数据”方向。典型形式为：

[
y = H(x, g, c, 	heta_m) + epsilon
]

其中 (x) 是等离子体或工程状态，(g) 是机器与诊断几何，(c) 是校准参数，(	heta_m) 是原子、核、辐射输运等模型参数，(epsilon) 是随机噪声。CHERAB、FIDASIM、SOFT、ECRad、REFMUL、DRESS 等分别实现不同的 (H)。

如果把整个知识域命名为“合成诊断”，会产生五类概念错误：

1. **把传感器实体消失掉。**合成相机不会描述镜面污染、辐照损伤、增益老化、接地回路、触发丢失或维护状态。
2. **把计量和可视化混为一谈。**一幅合成图可能视觉逼真，但没有单位、不确定度、校准有效期与证书链，不能成为实验或电厂证据。
3. **把前向问题与逆问题混为一谈。**前向算子可唯一计算并不意味着状态可唯一反演；许多诊断仍有零空间和强先验依赖。
4. **把离线物理分析误当成实时服务。**高保真 FDTD、Monte Carlo 或全轨道模型通常不满足实时 WCET、内存和故障恢复要求。
5. **把研究验证误当成保护资格。**即使与若干放电吻合，也不等于经过独立 V&V、配置管理、网络安全和失效安全评估。

因此建议一级知识域使用 **“聚变诊断”** 或四字标题 **“感知诊断”**；下设：

- 诊断系统工程与计量（DG0）
- 磁平衡、电子态、离子/组分、辐射/杂质、聚变产物/MHD/边界/工程状态（DG1–DG8）
- 合成诊断（DG9）
- 集成反演与同化（DG10）
- 实时诊断、AI 与决策接口（DG11）

若首页需要替换原“智能诊断”，推荐使用 **“感知诊断”**。它比“合成诊断”更能覆盖传感、计量、数据融合、状态估计和健康管理，也不会暗示全部诊断都由 AI 完成。

## 3. 四类资产如何拼成端到端链条

### 3.1 DG0：数据与证据底座

**IMAS** 提供跨代码数据语义，**MDSplus** 提供脉冲树和时序证据，**UDA** 把站点数据源抽象为统一访问层，**OMAS** 降低 IMAS 原型接入门槛。它们互补，不能相互替代：

- IMAS 回答“这个字段在物理上是什么”；
- MDSplus 回答“这一炮的原始/处理数据和配置在哪里”；
- UDA 回答“如何从异构后端取到它”；
- OMAS 回答“如何在普通 Python 环境中按 IMAS 结构处理它”。

**Calcam** 代表常被忽略的几何计量：像素到三维射线不是静态常数，它与 CAD 版本、端口机械位置、热变形和维护事件有关。**MARTe2–MDSplus** 代表实时链与脉冲档案的一体化，避免实时配置和离线回放使用两套事实。**ITER Plant I&C/CODAC 与 RNC 校准治理**则说明，走向聚变堆后必须把时间权威、运行状态、网络分区、接口控制文件、参考源和交叉校准写进系统工程，而不只是把研究代码容器化。

FAIR4Fusion 的价值在责任与治理：谁产生数据、能否开放、何时失效、如何引用、修改后是否可追溯。它是 enabling，不是可直接承担装置运行的数据平台。

### 3.2 DG9：高保真观测算子

可以把合成诊断按观测物理分成五簇：

1. **光学/光谱与几何**：CHERAB–Raysect、CHERAB-TS、ToFu、TRIPPy、XICSRT。
2. **微波**：ECRad、REFMUL。
3. **快离子/聚变产物**：FIDASIM、ASCOT5 诊断响应、DRESS/pydress、ScintSuite/FILDSIM。
4. **逃逸电子**：SOFT。
5. **束发射与湍流观测**：RENATE、XGC1 synthetic BES。

它们的共同工程接口应至少包含：

- 输入状态及其坐标和单位；
- 机器/诊断几何版本；
- 仪器响应和校准版本；
- 噪声与数据质量模型；
- 输出通道定义、时间窗和空间/频率响应；
- 数值误差、模型适用域和代码版本；
- 可执行的解析、单元、积分和装置回放测试。

不能把 ASCOT5、XGC1、DREAM 这类物理求解器直接标成“诊断代码”。当它们只生成快离子分布或湍流场时，其代码关系是 **enabling**；只有把物理场变成真实 FILD、BES、相机或光谱通道的实现才是 **official-direct**。本数据集据此区分。

### 3.3 DG10：从信号到状态分布

Minerva、AUG IDA、JET 微波联合反演、BEAST 展示了概率化集成分析的成熟路线；Tomotok 是较轻量的二维层析基线；快离子速度空间层析和 BITE/Aurora 展示了“跨诊断 + 物理模型 + 不确定度”的复杂反问题；InDiCA 则试图把数据容器、单位、坐标、血缘和 operator 工程化。

数字孪生不应只保存 MAP 或最小二乘结果，而应至少保存：

- 后验样本、低秩协方差或可查询的不确定度近似；
- 使用了哪些原始通道、哪些被剔除及原因；
- 先验、正则化和模型版本；
- 前向重投影及逐通道残差；
- 可辨识性/零空间说明；
- 模型证据或比较结果；
- 处理延迟和结果有效时间。

“所有诊断都同意”不能作为唯一正确性指标，因为多个诊断可能共享同一错误平衡、原子数据库、时间轴或几何。共享偏差会制造虚假的一致性。

### 3.4 DG11：实时链、虚拟传感器和 AI 权限

RAPTOR 是物理约束实时状态估计器，FRNN 是跨装置破裂风险模型，DisruptionPy 是数据与特征流水线，Diag2Diag 是多模态虚拟传感器，ITER Tokamak Systems Monitor（TSM）异常检测是工程系统资产健康侧车服务。五者在架构上角色不同：

- **状态观测器**：允许进入控制输入候选，但必须有残差门控和降级模式；
- **风险预测器**：输出概率/评分，必须重新校准并绑定运行域；
- **数据流水线**：不应被描述为预测器；
- **虚拟传感器**：只能输出“估计值 + 来源 + 置信/质量位”，不能覆盖原始测量；
- **健康监视器**：可触发检查或维护，不能默认获得机器保护权限。

任何 AI 输出进入控制或保护前，都需要明确的 authority gate：

```text
模型输出
 → 数据质量与 OOD 检查
 → 物理/工程约束
 → 时效性与延迟检查
 → 独立规则或保护系统仲裁
 → 建议 / 监督控制 / 闭环控制（分级授权）
```

## 4. 数字孪生诊断数据契约

建议用下列 12 组对象作为最小契约。它们可映射到 IMAS IDS、MDSplus 节点、对象存储和事件总线，但语义必须独立于具体后端。

### 4.1 Identity：对象身份

- facility、device、shot/run、scenario、phase；
- diagnostic、subsystem、channel、hardware serial；
- producer、owner、access classification；
- stable UUID 与人类可读名称。

### 4.2 Time：时间权威

- 原始时钟域、UTC/PTP/TCN 或装置时间；
- 采样时间、触发时间、窗口中心与曝光时间；
- 时钟偏移、漂移、重采样算法及误差；
- 数据到达时间、处理完成时间和“有效到”时间；
- 放电事件及事件版本。

只存一个浮点时间数组不够，因为跨系统微秒误差会在 MHD、BES、控制和快速保护中改变因果关系。

### 4.3 Geometry and Coordinates：几何与坐标

- CAD/mesh/coil/equilibrium 版本；
- 传感器位姿、内外参、视线、孔径和遮挡；
- 坐标系、手性、基准、单位、变换链；
- 磁通坐标映射所用平衡及其时间；
- 几何参数的协方差和有效期。

### 4.4 Measurement：测量值

- raw ADC / photon count / frame / spectrum；
- calibration-ready intermediate；
- calibrated engineering/physics quantity；
- unit、dimension、sampling、dynamic range、saturation；
- compression 与量化信息。

原始数据必须可追溯；不能只保存最终 Te、ne 或 emissivity。

### 4.5 Calibration：校准

- calibration ID、方法、参考标准和证书；
- 参与硬件、环境条件、有效期；
- 校准系数、矩阵、插值方法及协方差；
- before/after maintenance 关系；
- in-situ、cross-calibration 或模型辅助校准的类别；
- 审批人和变更原因。

### 4.6 Quality and Health：质量与健康

质量位应细分而不是单个 good/bad：

- missing、late、saturated、clipped、dropout、clock-unsynced；
- out-of-calibration、geometry-stale、background-invalid；
- detector-hot/dead、optics-contaminated、actuator-state-unknown；
- model-OOD、posterior-nonconverged、constraint-violated；
- manual override 和原因。

### 4.7 Uncertainty：不确定度

- 随机噪声、系统偏差、校准、几何、时间、模型和数值分量；
- channel-to-channel、diagnostic-to-diagnostic 和 time-correlated 结构；
- covariance、samples、ensemble 或 low-rank 表示；
- coverage/置信水平和分布假设；
- uncertainty budget 的来源与版本。

只给每点独立 error bar 会破坏 IDA，尤其是共享绝对校准和共同平衡误差。

### 4.8 Model and Observation Operator：模型与观测算子

- code repository、commit、release、container digest；
- build flags、compiler、hardware、random seed；
- model class、parameters、atomic/nuclear database version；
- validity domain、approximations、known limitations；
- input/output schema 与 differentiability；
- verification test suite 与 benchmark ID。

### 4.9 Inference Product：反演产品

- algorithm、prior、likelihood、regularisation；
- initialisation、convergence、effective sample size；
- posterior representation；
- identifiability/null-space；
- posterior predictive / reprojection residual；
- excluded channels and reason；
- validity time and latency。

### 4.10 Provenance：血缘

采用不可变有向图记录：

```text
raw → calibration → preprocessing → forward model
    → inference → derived quantity → decision recommendation
```

每条边含代码/配置/人工操作和时间。手工 Excel 或 notebook 修正也必须成为显式活动。

### 4.11 Operations and Authority：运行与权限

- diagnostic plant state、CODAC/PCS state；
- service heartbeat、latency、resource use；
- output authority：display / analysis / advisory / supervisory / closed-loop / protection；
- fallback、last-good value、timeout 和 inhibit；
- cybersecurity identity、signature and audit log。

### 4.12 V&V Evidence：验证证据

- requirement ID、test case、dataset、expected result；
- analytical verification、code-to-code benchmark、synthetic closure；
- calibration/bench test、device replay、prospective shot；
- acceptance thresholds、reviewer、date and result；
- open anomaly/waiver and expiry。

## 5. VVUQ 成熟度阶梯

建议把每一个“诊断—前向模型—反演—实时服务”按九级证据逐步推进，而不是用单一“已验证”标签。

1. **物理与单位检查**：守恒、量纲、极限行为、坐标手性。
2. **解析基准**：简单几何、均匀介质、已知谱线或运动学。
3. **数值核验**：网格/光子数/步长收敛，随机种子，CPU/GPU 一致性。
4. **代码间基准**：与独立实现比较；必须避免共用同一错误模块。
5. **合成闭合**：已知真值 → 合成数据 → 同一反演；报告偏差和覆盖率。
6. **组件台架与校准**：光源、中子源、靶、电子学注入和硬件在环。
7. **历史放电回放**：跨工况、跨维护周期、跨硬件版本；冻结测试集。
8. **前瞻影子运行**：在分析前冻结模型，实时运行但不控制，记录延迟/OOD/故障。
9. **受控运行与治理批准**：权限分级、故障注入、回退、独立审查；只有满足装置规则的系统才可进入闭环或保护。

现有 35 项中，大量工作停在 4–7 级。ITER TSM 工程系统健康监测仍主要在预运行原型与案例验证阶段；FRNN 虽有跨装置离线证据和实时接口研究，也没有等同于机器保护资格；RAPTOR 已进入实时环境，但其状态仍受模型失配约束。

## 6. 当前关键 VVUQ 缺口

### 6.1 模型差异被当成测量噪声

许多贝叶斯反演假设残差 y-H(x) 服从零均值、协方差为 Σ 的高斯分布。真实误差往往包含有结构的模型差异：原子率系数偏差、墙反射、光学污染、几何漂移、未建模非轴对称性。这些偏差不会随着样本数量增加而消失。需要显式 discrepancy model、层次模型和跨工况校准。

### 6.2 相关误差被丢弃

多通道共用同一绝对校准、同一磁平衡、同一激光能量或同一前置放大器。若当成独立误差，联合反演会产生虚假高精度。数据契约必须允许块协方差、低秩相关项或后验样本。

### 6.3 几何没有随装置演化

诊断几何常从初始 CAD 手工导出后长期不变。维护、热循环、位移、镜面更换和遮挡改变观测算子。Calcam 类资产必须与 PLM/CAD、测量日期和设备序列号联动，并把几何不确定度传到状态后验。

### 6.4 “验证数据”与训练数据泄漏

AI 和代理模型容易在同一炮、相邻时间窗口或相同实验日随机拆分，导致乐观性能。需要按 shot、campaign、hardware epoch、scenario 和 device 分层的冻结基准，并报告校准、提前量—误报曲线和最坏工况。

### 6.5 只验证输出，不验证覆盖率

预测均值接近数据不代表不确定度可信。必须检查 posterior predictive coverage、PIT/reliability、残差自相关、跨通道残差结构和 OOD 下的退化。

### 6.6 缺少实时端到端证据

离线推理耗时不等于实时 WCET。还需测量采集、网络、队列、推理、约束检查和发布总延迟，以及抖动、丢包、重启、时钟失锁、GPU 降频和模型加载失败。结果若过期，应明确 invalid，而不是沿用 last value。

### 6.7 软件开放不等于实验可复现

FIDASIM、ECRad、SOFT、ToFu、Tomotok 等公开代码显著改善方法复用，但装置数据、几何、校准和运行配置常受权限限制。可复现包应至少发布脱敏的合成基准、最小机器描述、期望结果和容差。

### 6.8 保护与控制权限模糊

实时 AI 经常被描述为“可用于控制”，但未说明它是显示、建议、监督控制还是保护触发。数字孪生必须在接口层携带 authority，禁止未批准服务直接写保护或高速控制通道。

## 7. 距离数字孪生的差距矩阵

| 能力 | 现有代表 | 已具备 | 主要缺口 |
|---|---|---|---|
| 数据语义 | IMAS/OMAS | 跨代码结构、单位与 IDS | 在线质量、校准证书、事件/权限语义不强制 |
| 脉冲证据 | MDSplus/UDA | 原始与派生数据访问、回放 | 跨站点语义、不可变血缘、SLA |
| 几何注册 | Calcam/ToFu/CHERAB | CAD、视线、合成视图 | 时变形变、几何协方差、PLM 联动 |
| 高保真观测算子 | FIDASIM/ECRad/REFMUL/SOFT | 物理上可信的通道级 forward model | 运行速度、模型差异、统一 API 与装置配置 |
| 联合状态估计 | Minerva/AUG IDA/BITE | 后验、干扰参数、多诊断融合 | 实时性、公开实现、相关误差和 OOD |
| 实时状态 | RAPTOR | 模型预测 + 观测同化 | 故障注入、降级、跨装置治理 |
| AI 风险/虚拟传感器 | FRNN/Diag2Diag | 多模态和跨装置潜力 | 概率校准、幻觉细节、运行域与权限门 |
| 资产健康 | ITER TSM anomaly | 回旋管脉冲与磁体电源的模块化工程健康监视原型 | ITER 真机长期故障库、专家反馈闭环、保护隔离 |
| 计量与认证 | ITER RNC/CODAC | 参考源、交叉校准、标准接口 | 燃烧等离子体投运证据、核环境老化模型 |

## 8. 建议的实施路线

### 阶段 A：先建立证据链，不追求“大一统求解器”

1. 选择 3–5 个关键诊断：磁平衡、TS/ECE、辐射、快离子/中子、工程健康。
2. 定义上述数据契约并映射到 IMAS + MDSplus/UDA。
3. 保存 raw、calibrated、quality、geometry、uncertainty 和 provenance 六类最小产品。
4. 为每个诊断建立最小合成闭合测试和历史放电回放基准。
5. 统一 source/shot/time/coordinate/model IDs。

### 阶段 B：引入可复用观测算子

1. 光学用 CHERAB/ToFu/Calcam，ECE 用 ECRad，快离子用 FIDASIM/ASCOT5，聚变中子源谱用 DRESS。
2. 每个模型封装同一 `simulate(state, geometry, calibration, context) -> measurement` 接口。
3. 输出不仅含合成值，还含响应矩阵/权重函数、数值误差和适用域。
4. 先以离线容器和冻结版本运行，再训练带物理约束的代理；代理必须能回退到高保真模型。

### 阶段 C：集成反演和状态服务

1. 从可观测性最好、物理耦合清晰的 Te/ne 联合反演开始。
2. 引入校准、几何和背景为 nuisance parameters。
3. 每次反演自动生成 posterior predictive、逐通道残差和 coverage 指标。
4. 逐步加入杂质、辐射、平衡和快离子；不要一次把所有状态塞进不可辨识大模型。
5. 提供有明确有效时间和协方差的状态 API。

### 阶段 D：实时影子与受限控制接口

1. 将 RAPTOR 类状态观测器接入 MARTe2/PCS 的只读影子路径。
2. 接入质量位、OOD、延迟和 last-good/invalid 规则。
3. FRNN/Diag2Diag 等 AI 先作为 advisory，不覆盖权威诊断。
4. 通过历史回放、硬件在环、故障注入和前瞻 campaign 形成证据。
5. 只有在独立审查后，才允许进入监督控制；机器保护保持独立确定性边界。

## 9. 代码关系与公开性说明

本数据集把“代码关系”和“访问状态”拆为两个正交维度：

- **official-direct**：论文作者、项目团队或机构维护，并直接实现该工作。例如 FIDASIM、ECRad、SOFT、ToFu、Tomotok、DisruptionPy。
- **enabling**：官方且可信，但只提供上游物理场、运行时或通用基础。例如 Raysect 对 CHERAB、ASCOT5 对 W7-X FILD 合成链、MARTe2 对 RAPTOR。
- **access = not-public**：没有核验到作者/机构的公共生产仓库，URL 必须为 null。例如 Minerva、AUG IDA、BITE 完整工作流、REFMUL、RENATE、ITER TSM 的 tsmadkit/tsmadalg。其 `relation` 仍标为 `official-direct` 或 `enabling`，避免把“是否公开”误当成“是否直接实现”。

开源仓库存在不代表代码已获得装置或安全认证；反过来，未公开也不代表没有高成熟度装置部署。公开性、证据成熟度和部署成熟度是三个正交维度。

## 10. 数据集使用注意

- `evidenceLevel` 与 `deploymentLevel` 是保守调研分级，不是法规认证。
- `devices` 中的 “design/planned/studies” 不能误写成真机部署。
- 论文中没有公开代码时，不能把通用 SciPy/PyTorch 或社区复刻标成该工作的代码。
- forward model 的父物理代码若没有仪器响应，只能标为 enabling。
- 合成数据验证是 E1/E2 证据，不能代替台架、校准源或真实装置验证。
- 任何网页展示应将论文、代码、装置、验证方式、局限和更新时间同时显示，避免把“有论文”简化为“已可用于电厂”。

## 11. 机器审计结果

2026-08-12 对 JSON 执行了结构审计：

- JSON 解析：PASS；
- 记录数：35；
- 必填字段缺失或 null：0；
- 重复 `id`：0；
- 重复 `projectId`：0；
- `primaryTask` 枚举错误：0；
- `technique.family` 枚举错误：0；
- E0–E4 / D1–D5 枚举错误：0；
- 论文/官方文档 URL：53；
- 其中补齐 `authors + venue` 的论文：37；
- 非空代码 URL：33；
- 代码关系：`official-direct` 38 项、`enabling` 10 项；
- `access = not-public` 代码项：15，全部满足 `url: null`；
- 所有非空 URL 均通过绝对 URI 语法检查。

URL 审计的含义是结构和代表性官方入口已核验，不承诺第三方网络在未来持续可达。归档时仍应抓取 DOI 元数据、仓库 commit/tag 与网页快照。

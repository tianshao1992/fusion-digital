# 聚变诊断：装置视角与工程/电厂设备诊断调研笔记

更新日期：2026-08-12

范围：装置档案、物理诊断与 PCS/数据平台接口、工程设备/整厂状态诊断。
证据政策：只采用装置机构官方页面/手册、国际组织正式材料、同行评审原始论文、设施团队原始技术报告和官方代码/数据仓库。新闻稿仅用于当期状态或官方 commissioning 记录，不作为算法精度、统计可靠性或安全资格的替代证据。

## 一、结论先行

### 1. “聚变诊断”适合作为知识域总名，“合成诊断”应是子域

真实聚变诊断至少包含五个彼此不可替代的层次：传感器和视线；采集、时钟与标定；反演和状态估计；与 PCS/保护/实验分析的接口；诊断自身的健康、维护和证据。合成诊断只处理“给定 plasma/plant 状态，仪器应看到什么”，是 DG9，不涵盖真实硬件、计量溯源、坏道和运维。因此把首页“智能诊断”改成“聚变诊断”最准确；AI 是 DG11 中的增强手段，不应成为诊断定义本身。

### 2. 装置成熟度不能用一条轴概括

本调研把证据 E0–E4 与部署 D1–D5 分开。ITER、SPARC、EHL-2 的物理目标很高，但诊断仍以设计、原型和资格试验为主；JET、DIII-D、AUG、TCV、EAST、KSTAR、WEST、W7-X、LHD 则有不同程度的装置运行证据。D5 只用于有原始文件证明的安全关键/法规授权用途；本数据集没有仅凭“保护”“安全联锁”几个字就授予 D5。

### 3. 诊断的真正产品不是一条信号，而是“带证据的测量对象”

至少要绑定：装置/端口/视线几何；sensor serial number；前端、增益和滤波；绝对/相对标定与有效期；时钟与延迟；单位和坐标；raw/reduced/analyzed 层级；质量位；反演版本；不确定度；责任人；关联论文、测试、维护和异常。若只把 MDSplus node 或数据库列复制进数字孪生，得到的是数据镜像，不是可决策的诊断孪生。

### 4. 电厂诊断的公开成熟度明显落后于 plasma diagnostics

磁体/低温、PFC 温度、氚流程和远程维护已有装置或高质量样机证据；真空与水泄漏有原型；结构位移/应变正从高保真 FE 走向 ROM；而 BOP 汽轮机、发电机、换热器、储能和全厂 condition monitoring 在融合公开文献里仍以系统设计为主。不能把常规火电/核电的成熟技术直接写成“已在聚变电厂验证”，因为目前没有运行中的聚变发电厂。

## 二、分类与装置索引方法

主分类采用固定 ID：DG0 系统工程/计量/健康，DG1 磁平衡，DG2 电子态，DG3 离子/组分，DG4 辐射/杂质，DG5 聚变产物/高能粒子，DG6 MHD/湍流，DG7 边界/PFC，DG8 工程设备/电厂状态，DG9 合成诊断，DG10 集成反演，DG11 实时诊断/AI/决策接口。

装置档案不是诊断清单堆叠。每台装置回答八个问题：

1. 什么任务决定诊断组合；
2. 直接测量什么，哪些量由反演得到；
3. 哪些系统真实运行，哪些只是设计或 commissioning；
4. 哪些参数进入 PCS、保护或机器联锁；
5. 数据存在哪里，raw/reduced/analyzed 如何区分；
6. 标定、不确定度和诊断健康如何表达；
7. 论文、代码、数据的公开状态是什么；
8. 哪些能力不能迁移到电厂。

## 三、装置组别观察

### 3.1 燃烧等离子体/未来高场装置：ITER、SPARC、EHL-2

ITER 的官方工程基础把诊断分成磁、光学、bolometric、中子/粒子、光谱与边界系统，并明确 PCS 会使用其中相当一部分。它还把氚包容、真空完整性、事故压力、活化和远程维护写入诊断设计边界。这意味着 ITER 不是“四十套现成研究诊断的放大版”，而是一套核环境测量基础设施。公开资料可以确认磁诊断约 2000 个、19 类传感器，中子相机/通量/活化/伽马等任务，以及 DRGA 原型；不能确认 ITER plasma 上的精度、可用率或长期漂移。

SPARC 的 2024 年 Review of Scientific Instruments 专题是公开度较高的未来装置案例。early-campaign overview 给出约五十套目标诊断和统一工程验证哲学；X-ray paper 明确 SXR tomography、HXR runaway 和 XICS；neutron paper明确约 15 个 flux monitors、两套 activation、spectrometric camera 和 MPR。所有这些仍是设计、样机和制造证据，不是 SPARC plasma measurement。报告中的“10 ms、约 7 cm、<2%”等应写成目标/设计结果，不能写成已验收运行指标。

EHL-2 的公开材料主要是 physics design 和项目进度，尚无完整 diagnostic baseline、ICD、代码或数据。可从高场球形环、30 keV 级离子目标和 p-11B 任务推导磁/剖面/组分/硬 X 射线/带电聚变产物/PFC/工程诊断需求，但这只能标 E0–E1/D1。下一步合作应索取端口分配、量程/精度/带宽/延迟、辐射热磁环境、标定和维护方案，而不是在网站先填一个“已具备”列表。

### 3.2 多诊断与控制耦合标杆：DIII-D、AUG、TCV

DIII-D 的强项是五十余套诊断与成熟 PCS：MSE/EFIT、Thomson/ECE/CER、BES/ECEI、FIDA/中子和边界成像可在同一装置迭代。其公开代码以 OMAS 等使能层和个别论文仓库为主，原始 shot、标定和生产分支需设施权限。Diag2Diag 很适合作为 DG11 案例，但它没有 MHz Thomson ground truth；合成剖面必须由真实低频 Thomson、物理关系和事件行为持续挑战。

AUG 的特色是成熟的分布式诊断工程。2014 DAQ 论文记录约 150 个数据采集系统与约 20 个实时诊断；2008 rtDiag 论文解释 DMA、实时 OS、MPI、时间戳和 DCS 信号链。AUG 证明诊断可以分布自治又集中配置，但 shotfile、DCC、专用卡和历史 OS 也形成跨装置迁移障碍。

TCV 官方诊断页面给出四十余套系统、两百余磁探针/磁通环、十四弦 FIR、百余 Thomson polychromator 和低于 0.5 ms 的特定实时分析链。RADCAM/MANTIS、MPX/ECE/FIR/Thomson 可服务 RAPTOR/RAPDENS。此数字只代表特定链路，不应扩展为“所有 TCV diagnostics latency”。TCV 的快速维护和端口灵活性也显著优于未来电厂。

### 3.3 长脉冲/壁状态标杆：EAST、KSTAR、WEST

EAST 把 plasma diagnostics 和 engineering TDS 连接得较完整。POINT/P-EFIT、ECE/ECEI、FIDA、中子与钨偏滤器诊断服务稳态物理；线圈出口氦/氮温度经 PXI/Lake Shore、MySQL/MDSplus 到低温系统和联锁。对于数字孪生，后者特别重要：真实资产状态必须与放电、标定和事件一起归档。

KSTAR 的首等离子体 DAQ 论文明确 11 类初始诊断、EPICS 中央集成、专用 timing 和 MDSplus 归档。后续系统显著增加，因此早期论文只用于确认架构而非当前清单。production configuration、数据和标定不公开，应标 collaboration access。

WEST 把 IR/FBG/WMS 做成工程—物理交界标杆。IR 图像不仅解释 plasma-wall interaction，还能触发 RF 退让；FBG 在超过 2600 炮中建立温度数据库；IR synthetic diagnostic 显式处理发射率和反射。该链路提醒我们：相机图像、CAD 视线、表面材料、热模型和控制命令必须共用版本。

### 3.4 偏滤器、球形环和 MHD 专题装置：MAST-U、NSTX-U、J-TEXT、HL-2M、EXL-50U

MAST-U 的 2023 磁诊断论文报告 flux-loop calibration 中位不确定度约 1.7%、pickup coils 约 6.3%，这是少见的明确 calibration uncertainty 证据。bolometer 系统同时暴露电噪声和探测器失效，并用 synthetic diagnostic 评估二维反演，这种“成功 + 失效 + UQ”比单纯列设备更适合报告。

NSTX-U 的 Data Management Plan 明确 raw、reduced、analyzed 三层，MDSplus 保存物理诊断与工程树，EPICS archiver 保存 engineering operations，CAMDATA 保存高速视频，published data 可进入 Princeton Data Commons。它展示开放平台不等于所有数据匿名开放，也不等于每个 reduced signal 已经 validated；diagnostician 责任仍关键。

J-TEXT 的 Web stack 用 REST API 统一状态、命令和诊断数据，连接 HDF5、MDSplus 和 EPICS；timing system 支撑 15+ 类、700+ 通道。它适合做可维护小型 diagnostic service 的工程参照，但短脉冲架构到长脉冲/电厂仍需重构。

HL-2M 公开的首等离子体材料确认 16 套基础系统，发展目标约七十套；Cherenkov probe 已有 2022 秋季装置数据，而双环 TOF 中子与 HIBP 等材料成熟度不同。报告必须逐系统标 E1–E4，不能把五年计划当成同一时点 installed capability。

EXL-50 综述是 EXL-50U 诊断候选继承基线的重要一手证据，列出磁、可见/IR、微波与 HCN FIR 干涉、Thomson、Hα/杂质光谱、杂散 EC 波、ECE、AXUV、SXR/HXR 和 Langmuir probes。但必须明确区分：EXL-50 是无中心螺线管装置，EXL-50U 安装了中心螺线管，并已有 ECRH 非感应启动、中心螺线管辅助爬升及 FOCS 涡流实测论文。两台装置的每套硬件、几何、标定和信号版本均须项目方确认，不能把 EXL-50 清单直接写成 EXL-50U 已安装能力。高能电子主导使单流体平衡、ECE 和 HXR 的解释不同于普通热等离子体，这是合作中必须保留的物理限定。

### 3.5 非托卡马克长稳态与开放数据参照：W7-X、LHD

W7-X 官方称约 45 套诊断，并强调同一参数由不同原理冗余测量。三维磁构型让视线与磁面映射复杂，但其 ArchiveDB、Web live monitoring 和自动 thermal-event detection 对长脉冲数字孪生非常有价值。W7-X 不运行 D-T，不能替代燃烧环境资格。

LHD 是本组中数据开放边界最清晰的案例。官方 repository 可按 shot 或 diagnostic 检索，给出 Retrieve 工具、数据格式、联系人、rights/terms 和 DOI。条款同时要求发表前联系仪器人员、保留 caveats 和署名/致谢。数字孪生社区应借鉴这种“开放 + 责任 + 限定语”，而非只追求免登录下载。

## 四、工程与电厂状态诊断的八条主线

### 4.1 磁体与低温

ITER、JT-60SA、EAST、W7-X 都说明 magnet monitoring 必须把 differential voltage、current、temperature、pressure、mass flow、valve/breaker state 和 QPC 联系起来。JT-60SA commissioning 通过受控加热、九对探测器触发和 pyrobreaker 试验验证端到端链路，是 E3/D3 的高质量证据；它仍不是多年可靠性或 D5 证明。

### 4.2 PFC 温度、热流与寿命

IR 看表面，FBG/thermocouple 看材料内部/局部，cooling calorimetry 看能量守恒。三者必须交叉。WEST 的 IR/WMS、WEST FBG 和 EAST 高热流 mock-up 形成从台架到装置的证据梯度。单独 IR 会受发射率、反射、遮挡影响；单独 FBG 会受温度—应变交叉和封装影响；单独冷却水温升空间分辨不足。

### 4.3 力、位移、应变、应力与振动

用户计划中的“力、位移、应变、应力、温度”验证链非常合理。直接力测量通常难布置，可由应变/位移 + 标定结构模型反演；应力大多是模型量，不应称传感器直接量。TEXTOR/T-10 给出运行中位移/振动直接证据，EAST FBG 给出组件/台架证据，实时 ROM 给出模型服务路线。建议把传感器、商业 EM/FEA 和 ROM 分成三层验收。

### 4.4 真空与泄漏

ITER DRGA 用多类质量谱/光学规重叠测 D/T、He 和 impurities；Kr-water tracer 与 OH*/Xe spectroscopy 解决水内漏定位。取样线路、泵速、壁记忆和背景是测量算子的一部分，不能把 analyzer 时间戳直接当源时间。

### 4.5 氚与燃料循环

JET AGHS 是少数有 kg-scale tritium handling 和真实 D-T campaign 的公开运行证据。GC、mass spectrometer、ionization chamber 与物料转移记录构成 accountancy；DEMO Raman 是面向实时化的原型。未来孪生核心是带不确定度的守恒账本，而非单一浓度仪表盘。

### 4.6 腐蚀、化学与排放

JET EDS 因 halogen ingress 生成酸并发生点蚀，经过根因分析、替换、passivation、commissioning 和再运行，是完整资产闭环。ITER cooling-water blowdown 需监测温度、pH、hydrocarbon、chloride、sulphate 和 tritium；当前是设计/建设要求，不是运行表现。

### 4.7 远程维护与在役检查

ITER IVVS、MPD、diagnostic rack connector 和 RACE mock-up 说明 as-maintained CAD、视觉计量、机器人关节/力矩、工具状态和操作步骤必须共同版本化。远程维护本质上也是诊断：确认部件位置、损伤、污染、可达性和维护结果。

### 4.8 能量转换与 BOP

公开 EU-DEMO 文献已比较 PHTS、储能、steam turbine 和循环效率，但 fusion-specific condition monitoring 证据不足。应明确标 E0/D1。未来可借鉴常规电厂的轴振、轴承温度/油液、泵阀、换热器热性能、发电机电气/局放、水化学，但必须重新验证脉冲热源、氚渗透、核边界和聚变可用率约束。

## 五、面向新奥第一阶段合作的最小闭环

建议把第一阶段限定为三类可验收对象，而不是建设“全装置工程孪生”：

1. 电磁—结构链：线圈/等离子体电流、边界/位形 → EM load → displacement/strain/stress；真实力若没有直接传感，必须标“模型反演”。
2. 热管理链：热源/热流 → PFC/结构温度 → 冷却水温压流量 → 热平衡与 hotspot；IR、thermocouple/FBG 和 calorimetry 互相校核。
3. 代理模型链：商业软件高保真样本 → ROM/surrogate → 历史数据回放 → OOD/残差/不确定度 → shadow service；未完成真机校核前不直接闭环控制。

应向合作方索取：CAD/网格/材料/接触和边界条件；线圈/母线/真空室/支撑配置；传感器位置、方向、serial number、采样、标定与安装工艺；放电和工程事件；仿真 solver/version/tolerance；测点—单元映射；试验验收阈值；异常与坏道样本；许可证和成果使用权。

## 六、必须保留的证据边界

- ITER：设计/样机/资格试验不等于 ITER plasma validation。
- SPARC：约五十套 diagnostics 和中子/X 射线性能是设计/制造目标，尚无 plasma data。
- EHL-2：没有公开完整 diagnostic baseline，不得写成已安装。
- EXL-50U：与无中心螺线管 EXL-50 明确分开；EXL-50 清单只能作候选继承基线，EXL-50U 中心螺线管、FOCS 等新增/变更项及全部升级状态需项目配置确认。
- JT-60SA：JT-60U 历史能力、JT-60SA 规划、已安装和 commissioning 必须分开。
- HL-2M：约七十套是发展计划；首等离子体确认约十六套；各后续系统成熟度不同。
- WEST：WMS 真机反馈是 E4/D4，但不是核安全授权；IR 温度含模型误差。
- EAST：TDS 触发联锁是装置工程证据，不等于第三方安全完整性认证。
- LHD/NSTX-U：公开/共享有明确条款和数据级别；“能访问”不等于“已验证”或“可自由再发布”。
- BOP：目前没有运行聚变电厂，所有 fusion-specific condition-monitoring 结论都必须标为需求、设计或迁移路线。

## 七、核心一手来源导航

- ITER Engineering Basis Handbook: https://www.iter.org/sites/default/files/media/2026-01/vol.1_ch.04_role_and_distinctive_feature_dv4qgd_v2_0.pdf
- ITER cooling water: https://www.iter.org/machine/supporting-systems/cooling-water
- DIII-D official facility: https://science.osti.gov/fes/Facilities/User-Facilities/DIII-D
- TCV diagnostics: https://www.epfl.ch/research/domains/swiss-plasma-center/tcv-diagnostics/
- W7-X diagnostics: https://www.ipp.mpg.de/3812950/diagnostik
- LHD repository: https://www-lhd.nifs.ac.jp/pub/Repository_en.html
- NSTX-U data plan: https://sites.google.com/a/pppl.gov/nstx-u/research/data-management-plan
- JT-60SA research plan: https://www.jt60sa.org/pdfs/JT-60SA_Res_Plan.pdf
- EXL-50 overview: https://doi.org/10.1088/1741-4326/adf239
- EHL-2 FEC record: https://conferences.iaea.org/event/392/contributions/35908/
- SPARC early diagnostics: https://doi.org/10.1063/5.0218254
- AUG DAQ: https://doi.org/10.1016/j.fusengdes.2014.04.030
- J-TEXT Web DAQ: https://doi.org/10.1016/j.fusengdes.2019.111450
- WEST FBG: https://doi.org/10.1016/j.fusengdes.2021.112528
- JET tritium analytical GC: https://doi.org/10.1016/S0920-3796(99)00090-3

## 八、数据文件

- `device_profiles.json`：18 个装置档案，含主要系统、传感器、实时接口、数据平台、论文、代码/数据状态与限制。
- `plant_diagnostics_tasks.json`：20 个 DG8 工程/整厂诊断工作，覆盖磁体、低温、PFC、结构、真空、水/氚泄漏、燃料循环、远程维护和 BOP。

## 九、结构化关联与后续补全

20 条工程工作已对齐 canonical work schema：每条具有稳定 `projectId`、唯一主任务、八类受控 `techniqueFamilies`、测量机理、量值、硬件、标定、反演、装置验证、证据/部署双轴、代码关系和 `asOf`。`not-public` 软件对象不保留伪源码链接；论文页、产品页和装置主页不冒充代码仓库。

装置档案中的 `representativeWorks` 只存当前数据集中真实存在的 `PDT-*` ID；原文字概述移至 `representativeWorkSummaries`。当前尚无本数据集结构化工作 ID 的装置为：DIII-D、KSTAR、ASDEX Upgrade、TCV、MAST Upgrade、HL-2A / HL-2M（HL-3）、J-TEXT、LHD、EXL-50U、EHL-2。这不表示它们没有诊断工作，只表示相应工作应从 plasma、合成诊断/反演或后续装置专题数据集中建立稳定 ID 后再反向关联，不能预造悬空 ID。

# 托卡马克装置级集成控制、PCS 架构与软件生态调研底稿

> 版本：2026-08-11。本文是控制专题报告的可合并研究底稿，目标不是给某套软件做宣传，而是把“装置已经在线闭环”“只在模型或硬件在环验证”“只是通用使能框架”“只有规划目标”四类事实分开。结构化明细见 `pcs_frameworks.json` 与 `device_control_profiles.json`。

## 1. 调研范围、证据规则与阅读方法

本调研覆盖 DIII-D、TCV、ASDEX Upgrade、JET、EAST、KSTAR、WEST、JT-60SA、ITER、NSTX-U、MAST-U、SPARC、ARC、HL-2A、HL-2M、J-TEXT、EXL-50/EXL-50U、EHL-2、CFETR、RFX-mod/RFX-mod2 等装置或项目，并追踪 DINA、MEQ、RAPTOR、MARTe2、EPICS、IMAS、OMAS、MDSplus、PCSSP、GSPulse 等代码/框架。技术结论只依赖同行评议原始论文、会议原文、装置或机构官方页面、官方仓库；新闻稿只用于证明机构声称和项目事件，不替代性能论文。预印本可以记录“有这项工作”，但不能升级为已经同行评议、已经独立复现或已经生产部署。

为了避免常见的“数字孪生式过度声称”，采用五级证据：E0 是概念/需求，没有闭环仿真或装置证据；E1 是模型、软件在环或合成场景；E2 是历史回放、硬件在环或设备 commission；E3 是装置在线影子运行但不直接控制目标量；E4 才是装置闭环实验或生产运行。成熟度不是代码质量排名，也不是安全完整性等级。一项 E4 的研究控制器依然可能没有冗余、正式需求追踪、故障覆盖、网络安全或核级软件资格；一项 E2 的 ITER 平台可能具有很强的系统工程纪律，却因为 ITER 尚未运行而不能获得真机闭环证据。

与主报告的治理口径对齐：装置生产 PCS 或真机闭环通常最高只能记为 D4；D5 必须有明确原始证据证明其经过治理批准用于保护/安全关键用途。本数据集没有找到足以授予 D5 的公开证据，因此没有任何 D5 条目。E0—E4 和 M0—M4 只用于技术证据/装置成熟度，不与 D 级安全治理资格混用。

同样，开源性划分为五类：`paper-direct` 是论文团队公开了与论文直接对应的实现；`official-framework` 是官方开源的使能底座，但不包含装置控制律；`controlled-access` 是合作或协议下可获取，不能公共克隆；`commercial` 是商业软件/实时操作系统；`not-public` 是没有找到可核验的公开源码。必须拒绝“某装置用了 EPICS，所以其 PCS 开源”“TCV 用 MARTe2，所以 TCV 全部控制代码开源”“DINA-IMAS 已公开，所以所有历史 DINA 分支都开源”这类错误推论。

本文中的“周期”也严格分层。采样周期、算法执行时间、任务调度周期、网络传输、传感器积分、执行器命令更新、执行器物理响应和保护动作完成时间不是同一个量。例如 JET WALLS 论文中所有软件模块执行低于 1 ms，并不等于红外相机看见热点到 RF 功率真正下降的端到端过程低于 1 ms；EXL PTEFIT 预印本中约 0.268 ms 是作者给出的计算测试，不包括 ADC、时间同步、数据搬运、PCS 调度与线圈/电源响应。报告中凡缺少端到端定义就保留“多速率/未披露”，不虚构一个整齐数字。

## 2. PCS 到底是什么：七层责任模型

托卡马克 PCS 不是一个单独 PID，也不是把平衡代码接到线圈电源就完成。可用七层理解：第一层是传感、时钟与 I/O，包括磁探针、磁通环、干涉仪、ECE/MSE/Thomson、辐射计、红外、设备状态、ADC/DAC、触发和全装置时钟；第二层是实时数据质量、标定和状态估计，例如坏道屏蔽、单位/坐标变换、rtEFIT、LIUQE、RAPTOR；第三层是控制律，包括垂直稳定、等离子体电流、位置/形状、密度、剖面、MHD、辐射和热负荷；第四层是执行器分配，把多个控制请求在 PF、气阀、NBI、ECH/ECCD、ICRH/LH、杂质注入之间分配并处理饱和、速率限制和优先级；第五层是放电监督、场景和异常管理，决定控制模式、phase 转换、软着陆或硬终止；第六层是机器保护、设备联锁与人员/核安全，它们与研究优化控制可能交换状态和请求，但必须保留独立职责；第七层是数据、配置、版本、仿真与证据链，使每次放电能够重放、解释、追踪到软件和模型版本。

这一分层解释了为什么 CODAC、PCS、机器保护不能混为一谈。ITER 官方架构明确把机器保护和人员/核安全与 CODAC 解耦；CODAC 基于 EPICS 7 管理约 220 个 plant I&C 系统、主机、快速控制器、PLC、HMI、报警和归档，但这不意味着 EPICS 网络 PV 应直接承担微秒级垂直稳定。快速环可以在本地实时节点执行，通过经过验证的接口与 CODAC/PCS 交换模式和状态。数字孪生则要横跨这些层，在不破坏实时确定性与安全独立性的前提下提供模型、数据和证据，而不是用一个“超级总线”吞并所有责任域。

## 3. 关键架构谱系

### 3.1 GA PCS：通用骨架、装置分支与“可复用但不等价”

DIII-D PCS 是最有影响力的装置控制谱系之一。[2020 状态综述](https://doi.org/10.1016/j.fusengdes.2019.111368)和[2024 升级论文](https://doi.org/10.1109/TPS.2024.3415768)描述了多实时节点、category/phase 算法组织、波形/配置服务、rtEFIT/isoflux、监视与执行器接口。历史上每约 60 μs 一组采样是一个常被引用的基准，RWM 专链的优化可进入十余微秒量级，但不同任务本来就是多速率。GA 的[官方 plasma-control 页面](https://www.ga.com/plasma-control)说明该技术在多装置应用；[多装置实施论文](https://doi.org/10.1016/j.fusengdes.2010.04.040)记录 NSTX、MAST、EAST、KSTAR 等分支。

这里最重要的工程结论不是“拿到 GA PCS 就完成迁移”，而是平台层与装置层必须分离。可复用的是调度、phase、配置、诊断接口模式、测试与部署流程；不可直接复用的是线圈/电源拓扑、磁标定、状态量定义、执行器极性和限幅、安全逻辑、网络驱动、真机时延、操作程序与保护边界。MAST-U 有 11 组气阀和强耦合 PF 执行器，NSTX-U 是球形托卡马克并经历 64 位实时 Linux 与串行 I/O 升级，EAST 又面向超导长脉冲。它们共享血缘，不是相同二进制、相同控制律或相同可用率。

DIII-D 的另一项可迁移资产是 PCS—Plant 闭环共仿真：生产控制代码接 GSevolve 或电路/装置模型，让离线、软件在环和硬件在环尽量使用相同接口。[集成等离子体控制论文](https://doi.org/10.13182/FST05-A1075)强调模型驱动设计—仿真—PCS 实码验证—实验迭代。数字孪生路线应继承这种“同一控制制品在多个证据环境执行”的思想，同时补齐模型版本、参数来源、不确定度、故障注入覆盖与验收判据。

### 3.2 TCV：Simulink 到 MARTe2 的模型驱动生产链

TCV 是公开证据中最完整的现代全机实时架构样例之一。[2024 开放综述](https://doi.org/10.1016/j.fusengdes.2024.114640)明确说明：算法在 MATLAB/Simulink 中开发、测试和生成代码，MARTe2 作为全机实时运行内核，MDSplus 管理配置和放电数据；双主实时节点接收 192 路、前端最高 1 MS/s 的信号，主控制按 10 kHz 运行，硬件测试展示 50 kHz 潜力，LIUQE 平衡重建约 1 ms。系统承载 LIUQE/MEQ、RT-MHD、RAPTOR/RAPDENS、SAMONE、气体 MIMO、EC 定位与事件处理。

TCV 的价值在于把“物理算法表达”和“确定性运行”解耦。Simulink 方便控制设计和离线测试，代码生成避免人工重写；MARTe2 通过 GAM、DataSource、Broker、Scheduler 和状态/线程配置把算法接到真实 I/O。这种模式非常适合数字孪生：同一算法可以在离线 plant、历史回放、实时 shadow 和真机闭环中执行。但它有真实成本：MATLAB/Simulink/代码生成许可证、生成代码资格、I/O 驱动、CPU 隔离、最坏执行时间、配置审计、MDSplus 树和站点部署都必须治理。MARTe2 开源不等于 TCV 的 Simulink 工程、装置参数和全部诊断插件开源。

TCV 的 [MEQ 官方仓库](https://gitlab.epfl.ch/spc/public/meq/meq)是少见的论文直接开源资产，含 LIUQE、FBT、FGE/FGS 等 MATLAB/C 组件，Apache-2.0；它可成为磁控制服务的参考基线。RAPTOR 则必须谨慎：[官方项目页](https://crppwww.epfl.ch/~sauter/raptor/)说明主代码/项目仓库需要签署 CLA 并获 GitLab 权限，因此应标为 controlled-access，不可写成无条件开源。TCV 正在研究用 DDS 等现代网络替代老旧反射内存，这也提示未来 PCS 需要对传输时延、抖动、丢包、发现机制和网络隔离做配置级验证，不能因为协议宣称“实时”就跳过测量。

### 3.3 ASDEX Upgrade：配置驱动 DCS 与 flight simulator

[ASDEX Upgrade DCS 论文](https://doi.org/10.1016/j.fusengdes.2014.01.001)展示另一种成熟范式：分布式、模块化、配置驱动的放电控制，把实时诊断、反馈、执行器负载管理、segment/phase 调度和异常处理组合成生产任务图，并在 Linux、VxWorks、Solaris 等历史/实时环境运行。它不是单一“磁控制器”，而是全放电的协调执行系统。

Fenix flight simulator 把 ASTRA、SPIDER、Simulink/控制组件和 DCS 接起来，在真实放电前运行控制程序。它与航空 flight simulator 类似：价值在于发现接口、时序、配置、phase 转换和执行器冲突，而不只是画出物理曲线。局限同样重要：能实时运行的 plant 常是约化模型；如果诊断饱和、网络拥塞、线圈电源死区、热保护阈值和设备故障没有被真实建模，仿真会提供虚假置信。完整 AUG DCS/Fenix 生产资产没有公共仓库，合作时应优先索取接口说明、模型覆盖矩阵和测试报告，而不是只要一份源代码压缩包。

### 3.4 JET：控制、实时保护与终止链的职责分离

[JET plasma control](https://doi.org/10.1016/S0920-3796(00)00125-3)形成 PPCC、RTCC、RTDN/RTPS 等多代系统；WALLS 监视等离子体—壁相互作用，VTM 执行终止，保护架构在[2019 Nuclear Fusion 论文](https://doi.org/10.1088/1741-4326/ab1a79)中系统描述。JET 的重要经验是：优化控制、监视、保护判定和最终执行动作可分层，但状态、时间戳、有效性和触发原因必须贯通。WALLS 模块低于 1 ms 的执行指标必须与相机采样、网络、RTPS、VTM 和执行器物理响应分开。

MARTe/MARTe2 在 JET 有 RTCC 和 PCS 升级原型/局部系统证据。IAEA 2021 RTCC 会议原文和 2024 PCS 升级材料说明迁移工作，但不能据此写成“JET 全部 PCS 已迁移 MARTe2”。JET 已结束实验运行，今天引用它时应说“历史生产验证、仍可复用的方法/数据”，不能暗示装置当前在线。其生产 RTPS/RTCC/WALLS/VTM 源码也未公开，MARTe2 仓库只是使能框架。

### 3.5 EAST 与 KSTAR：超导长脉冲平台的本地化演进

EAST 早期 PCS 与 GA 体系有明确血缘，[2008 论文](https://doi.org/10.1016/j.fusengdes.2007.12.028)、[稳态升级论文](https://doi.org/10.1016/j.fusengdes.2018.02.079)和 [PCS-SDP](https://doi.org/10.1016/j.fusengdes.2021.112314)记录了多代演进。中国科学院等离子体所[官方 LingShu 报道](https://ipp.cas.cn/xwdt/kydt/202308/t20230827_374112.html)称其采用双冗余集群、定制实时 Linux、共享内存/网络、模块化多进程、状态机和版本/日志管理，并给出 99.99% 可靠性和抖动小于 5 μs。报告可以准确转述“机构称/内部测试”，但没有第三方认证测试计划、任务负载、统计周期和故障假设，不能升级为核级可靠性结论。LingShu 的生产代码未公开。

KSTAR 也经历从 GA PCS 血缘到本地长脉冲升级的过程。2018/2020 Fusion Engineering and Design 论文记录硬件、DAQ、磁/密度/加热/气体集成及长期运行经验。2026 年 ITER [官方报道](https://www.iter.org/node/20687/kstar-iters-plasma-control-system-successfully-takes-charge)称 ITER iPCS 已在 KSTAR 部署并操作，这是很有价值的真机事件，却还缺同行评议技术论文中完整的功能覆盖、端到端时序、失效模式和验收列表。因此应写“iPCS 在 KSTAR 真机部署/操作”，不写“ITER PCS 已完成 ITER 条件验证”。KSTAR 等离子体、诊断、执行器和保护条件与 ITER 燃烧等离子体仍有本质差异。

### 3.6 ITER：功能架构、PCSSP、CODAC 与 IMAS 的边界

[ITER PCS 架构论文](https://doi.org/10.1016/j.fusengdes.2014.02.079)采用分层/联邦式功能组织，compact controller 将竞争同一命令信号的功能聚合，由 mode selector 互斥/协调。[PCSSP 论文](https://doi.org/10.1016/j.fusengdes.2015.01.009)构建 MATLAB/Simulink 的模型—wrapper—top model 平台，把 plant、诊断、执行器、控制器和异常模块组合，用于批量仿真和需求验证；[2024 MBSE 论文](https://doi.org/10.1016/j.fusengdes.2024.114464)进一步把需求、功能、模型、测试、版本和部署追踪起来。官方 [PCSSP 仓库](https://github.com/iterorganization/PCSSP)开放，使平台代码可审计；但它依赖商业 MATLAB/Simulink，也不包含全部 ITER plant 模型和受限参数。

ITER [CODAC Core System](https://www.iter.org/machine/supporting-systems/codac/codac-core-system)截至官方页面所示发布 7.4.0，基于 RHEL x86-64、EPICS 7、PVAccess/Channel Access、SNL、日志、Autosave 和 Control System Studio，面向注册贡献者分发。[CODAC 架构页](https://www.iter.org/machine/supporting-systems/codac/architecture)明确 Plant System Host、Fast Controller、PLC/第三方控制器和约 220 个 plant I&C，并把机器保护与人员/核安全从 CODAC 解耦。EPICS Base 本身开源，但完整 CODAC 发行版有 ITER 专用组件和分发条件；CODAC 也不是 iPCS 快速控制律的同义词。

ITER 2025 年[官方开放 IMAS 基础设施与物理模型](https://www.iter.org/node/20687/release-imas-infrastructure-and-physics-models-open-source)，[IMAS Data Dictionary](https://github.com/iterorganization/IMAS-Data-Dictionary)、[IMAS-Python](https://github.com/iterorganization/IMAS-Python)和 DINA-IMAS 等仓库成为控制—模拟—实验语义互操作的重要资产。IMAS/OMAS 的价值是单位、结构、坐标和元数据的公共合同；它们一般运行在离线/近线工作流，不是微秒硬实时调度器。把 IDS/ODS 传进 PCS 前，还要定义固定内存布局、版本兼容、延迟和失效回退。

## 4. 装置视图：成熟系统、升级系统与尚无公开证据的项目

### 4.1 NSTX-U 与 MAST-U

NSTX 的[实时控制论文](https://doi.org/10.1016/j.fusengdes.2004.04.012)和[形状控制论文](https://doi.org/10.1088/0029-5515/46/1/002)描述 GA PCS、PSRTC、rtEFIT/isoflux 与 MDSplus；NSTX-U 升级转向 64 位 Concurrent RedHawk Linux 和现代光纤串行 I/O。2025 [GSevolve 控制开发论文](https://doi.org/10.1016/j.fusengdes.2025.115302)利用实验复现和模拟改进位置/形状控制。必须说明：NSTX 历史数字不能自动代表 NSTX-U 恢复后的配置；2025 模拟/复现也不意味着每项改进已在新阶段闭环投运。

MAST-U [PCS 论文](https://doi.org/10.1016/j.fusengdes.2020.111764)记录 GA PCS 分支、category/phase、装置专用虚拟电路、FIESTA 设计以及多 PF 线圈和 11 组气阀的强耦合接口。Super-X 与脱靶研究使边界形状、气体、加热和壁约束必须联合考虑。代码与站点模型未公开，合作价值在于球形托卡马克执行器协调和先进偏滤器场景，而不是“直接复制 DIII-D 算法”。

### 4.2 WEST 与壁热负荷反馈

WEST 从 Tore Supra 的分散控制迁移到集中 PCS，目标是钨环境和长脉冲集成。红外 Wall Monitoring System 检测热点，经共享内存送 PCS 调节五套 RF 天线。公开原始预印本报告 C4 阶段 63 次激活、97% 成功和 0.2% 误报，这为“诊断—状态—控制—执行器—壁响应”的数字孪生闭环提供了好案例，但样本与阈值强相关。未来复现必须保存相机标定、视场、坏像素、PFC 几何、热惯性、RF 天线对应关系、人工确认和未触发样本，不能只保存一个报警标签。

### 4.3 JT-60SA

JT-60SA [官方控制系统页面](https://www.jt60sa.org/wp/control-system/)区分中央控制、实时等离子体控制、设备控制和保护/联锁。2023 [控制仿真工具论文](https://doi.org/10.1016/j.fusengdes.2023.113631)用于磁控制场景与系统开发。由于装置处于分阶段 commissioning/实验状态，成熟度必须逐功能报告：中央状态机和设备集成可有实际证据，但高性能磁/动理学控制可能仍处在仿真或逐步验收，不能用“装置已首等离子体”笼统覆盖全部 PCS。

### 4.4 HL-2A、HL-2M 与 J-TEXT

HL-2A [实时破裂预测与缓解论文](https://doi.org/10.1016/j.fusengdes.2022.113223)报告在线处理 382 炮并触发 MGI/SMBI，是“AI/信号处理进入控制与缓解链”的装置证据。它的边界也很清楚：训练分布、破裂类型、阈值、漏报/误报、执行器可用性和提前量决定效果；代码和数据未公开，不能当作跨装置即插即用模型。

HL-2M [2023 PCS 论文](https://doi.org/10.1016/j.fusengdes.2023.113763)描述基于 DIII-D PCS 的三节点实时 Linux 集群、D-TACQ2106、反射内存，设计慢环 1 ms、快速垂直环 200 μs。论文主要证据是平台与初步仿真，并明确需要进一步真机实验，因此本底稿标为 E1/M1，而不是因为装置已有实验就把新 PCS 全部标成生产级。

J-TEXT [JRTF 论文](https://doi.org/10.1016/j.fusengdes.2018.02.060)展示实时采集、处理、共享与控制输出框架，并与中央时序、EPICS 设备层和数据系统协同。JRTF 可承载实时算法，但 EPICS 的 IOC/PV 网络主要证明设备层互操作，不自动证明快速反馈周期。完整 JRTF、站点驱动和控制插件没有公共仓库。

### 4.5 SPARC 与 ARC

SPARC 2024 APS-DPP [原始会议材料](https://meetings-archive.aps.org/dpp/2024/np12/105/)描述自研 neutrino 实时框架、无锁进程/节点通信、平衡重建、形状/垂直控制、功率平衡、辐射/PFC 监视、破裂预警和 soft/hard landing，并使用 COMET 做 HOOTL/HITL。它说明系统工程工作已经很深入，但 SPARC 尚无等离子体闭环；会议摘要也没有完整的最坏执行时间和测试覆盖表。报告必须写“在建装置 PCS 原型/HIL”，不能写“生产运行”。

[GSPulse_public](https://github.com/jwai-cfs/GSPulse_public)是有价值的论文直接公开资产：JAX 可微自由边界 Grad–Shafranov 求解器支持脉冲轨迹优化和反馈仿真，并与 NSTX-U/MAST-U 对照、用于 SPARC 设计。它仍是离线设计/模拟工具，不是安全确定性的实时内核。自动微分使梯度优化方便，却不会自动补足 3D MHD、运输、执行器死区、诊断噪声和网络故障。

ARC 是聚变电厂概念。公开物理基础可以推导燃烧功率、磁/剖面、氚/燃料循环、热功率、PFC、停堆和维护控制需求，但没有可核验生产 PCS 架构。SPARC 的控制、模型和数据会降低风险，却不等于 ARC 电厂级控制验证；后者还需要安全分级、高可用、可维护、纵深防御、网络安全、资产健康和能量转换/负荷协同。

### 4.6 EXL-50/EXL-50U 与 EHL-2

EXL-50 的[同行评议装置综述](https://doi.org/10.1088/1741-4326/adf239)证明装置物理实验和相关能力；PTEFIT [2026 预印本](https://arxiv.org/abs/2601.12378)报告快速平衡重建、约 0.268 ms 测试和反馈探索。三件事必须分开：装置物理论文是同行评议；PTEFIT 在审计日仍按预印本处理；完整 PCS 的 OS、调度、I/O、时钟、保护、版本和代码没有公开证据。故可以说“存在快速重建和反馈研究”，不能说“EXL-50U 已有公开完整数字孪生 PCS”。

EHL-2 的证据主要是[新奥聚变路线图](https://doi.org/10.1063/5.0199112)和 [IAEA FEC 2025 海报](https://conferences.iaea.org/event/392/contributions/35908/attachments/19881/36142/FEC2025_EHL2_poster-Xie-V4.pdf)。它们可证明项目目标与设计方向，不能证明 PCS 已实现、达到某周期或在真机闭环。最稳健的合作方式是把公开空白转为内部需求清单：PCS/机器保护/人员安全边界；线圈/电源/加热/加料 ICD；信号清单和质量位；实时网络与时间同步；模型在环/HIL 验收矩阵；软件与模型版本；运行数据和异常事件治理。最新建设状态应由新奥项目文件确认，不能从旧路线图日期推断。

## 5. 软件与代码生态：能拿到什么，拿不到什么

### 5.1 论文直接实现

MEQ 是最清晰的磁控制开源基线，代码、许可证和 TCV 生产证据相互对应。PCSSP 是 ITER 控制仿真平台的论文直接实现，但需要 MATLAB/Simulink，公开仓库不含全部 ITER 模型。GSPulse_public 是可微脉冲设计实现，目前应同时保留预印本/同行评议状态字段。DINA-IMAS 的公开是重要变化：不能再笼统说“DINA 全部闭源”，但也不能反向说“所有 DINA 分支都开源”；官方仓库只证明特定 IMAS 接口化实现公开，历史 DINA-CH、装置分支和参数可能仍受限制。

### 5.2 官方开源使能框架

[MARTe2](https://vcis-gitlab.f4e.europa.eu/aneto/MARTe2)是 C++ 确定性运行框架；GAM 封装算法、DataSource 封装 I/O、Broker 搬运数据、Scheduler 定义执行，配置描述状态和线程。TCV 全机生产运行提供强证据，JET/RFX 的使用边界要按论文分别描述。确定性不是仓库属性，而是“算法 WCET + 内存 + OS + CPU 隔离 + 驱动 + 网络 + 配置 + 负载”的系统属性。

[EPICS Base](https://github.com/epics-base/epics-base)负责 IOC、record、CA/PVA、状态机和设备生态，适合 plant I&C、慢控制、HMI、报警和归档。它可以与快速控制器协同，但网络 PV 不能未经测试直接进入垂直稳定回路。ITER CODAC 是在 EPICS 上的工程发行与标准，不等于裸 EPICS。

[MDSplus](https://github.com/MDSplus/mdsplus)以 tree/pulse 管理配置和 shot 数据，并通过 event、segment 和站点适配支持实时/近线应用。[MDSplus—MARTe2 集成论文](https://doi.org/10.1016/j.fusengdes.2020.111892)说明实时 DataSource 与归档协同，但最紧的实时环不应无条件依赖远程树写入。数据树可以保存任意字段，却不会自动保证时间对齐、单位、标定、质量位和 provenance。

IMAS Data Dictionary/IMAS-Python 与 [OMAS](https://github.com/gafusion/omas)解决语义交换：equilibrium、core_profiles、pulse_schedule、pf_active、controllers 等对象能在代码和装置间映射。OMAS 是 GA Fusion 的公共数据适配层，不是 DIII-D PCS 开源；IMAS 是 ITER 生态接口，不是实时执行内核。数字孪生应把 IMAS/OMAS 用作“证据/模型交换合同”，实时环则使用经过冻结和延迟验证的紧凑接口。

### 5.3 受控访问、商业与未公开

RAPTOR 官方页明确访问协议；GA PCS 通过合作维护；ITER CODAC 完整发行面向注册贡献者。这些并非“不可合作”，而是许可、版本、责任和再分发必须在项目立项时处理。商业依赖包括 MATLAB/Simulink/Embedded Coder、Concurrent RedHawk 等，需统计席位、生成代码权、长期支持、目标架构和可替代路径。

JET RTPS/RTCC/WALLS/VTM、AUG DCS/Fenix、EAST LingShu、KSTAR PCS、WEST PCS/WMS、JT-60SA 生产配置、HL-2A/HL-2M、JRTF、SPARC neutrino/COMET、EXL PTEFIT 均没有找到可核验的完整公共生产仓库。未公开不代表技术差，也不代表无法合作；它表示报告不能向读者承诺“点击即可复现”。合作谈判要把接口、测试模型、回放数据、二进制/容器、现场支持、改动权、审计权和成果许可逐项列清。

## 6. 验证体系：从算法曲线到装置闭环还差哪些证据

建议采用九级验证链。第一级是数值单元测试：方程、离散化、坐标和单位；第二级是组件接口测试：输入维度、质量位、范围、缺失值；第三级是离线参考对照：与高保真模型、平衡代码或解析解比较；第四级是历史放电回放，确保算法在真实噪声、坏道和分布漂移下稳定；第五级是闭环软件在环，控制器接约化 plant，测试稳态、扰动和饱和；第六级是硬件在环，把真实实时OS、CPU、I/O、网络、时钟和执行器仿真接入；第七级是装置影子运行，算法读取实时数据但不控制，量化延迟、可用率和建议偏差；第八级是受限真机闭环，从低风险炮、限权执行器和人工授权开始；第九级是场景扩展与持续监测，覆盖不同位形、功率、诊断故障、设备退化、软件升级和异常事件。

每一级都应记录模型/代码 commit、编译器、依赖、容器/OS、硬件、配置、输入数据版本、随机种子、时间同步、阈值、验收指标和失败案例。HIL 不能只展示“正常波形像真机”，还要注入时间戳跳变、网络丢包、ADC 饱和、坏道、执行器卡死/速率限制、CPU 抢占、模型参数漂移、保护触发和 phase 切换。对 AI/代理模型还要记录训练集装置/炮次、标签生成、数据泄漏、置信度校准、域外检测和回退控制器。

控制性能指标也要按任务定义。位形控制看边界间隙、形状矩误差、垂直位移、线圈电流/电压余量；密度/剖面看跟踪误差、扰动恢复、执行器使用和观测不确定度；MHD 看稳定裕度、模式幅度和错误触发；热负荷看温度/热通量峰值、空间定位误差、执行器响应和PFC损伤代理；集成控制看多目标权重、执行器冲突、约束违反、阶段切换和失效降级；PCS 平台看 WCET、抖动、丢帧、重启、配置一致性和数据完整性；保护看覆盖、虚假触发、漏触发、检测提前量和最终动作成功。不要用一个“准确率”概括所有层。

## 7. 集成模拟距离数字孪生的主要差距

第一，许多控制模拟是“一次性离线模型”，数字孪生需要与真实装置持续同步。同步不是每炮后拷贝一组参数，而是明确哪些状态由传感器更新、哪些由估计器更新、时间戳和质量位如何处理、参数漂移怎样识别、模型版本如何切换、旧结果如何重现。

第二，模型覆盖常集中于轴对称平衡、电路和少量动理学状态。电厂级孪生还要连接 3D MHD、运输、加热/电流驱动、等离子体—壁相互作用、热结构、电磁力、冷却、燃料循环、真空、超导磁体、低温、电源、能量转换、维护和安全分析。连接不是把所有高保真代码同时实时运行，而是建立分层模型族：高保真离线校核、缩阶在线状态估计、代理模型实时控制、经验/逻辑故障模型和保守安全边界，并记录彼此的适用域和误差。

第三，许多框架有接口但缺统一语义。MDSplus tree、EPICS PV、IMAS IDS、OMAS ODS、PCS 内部共享内存、商业仿真变量可能描述同一物理量，却在单位、坐标、正方向、采样、有效性和版本上不一致。数字线程需要一个可执行的数据合同：稳定标识符、单位、参考坐标、时间基准、质量位、标定版本、来源、用途限制和访问控制。IMAS/OMAS 可以承载公共语义，硬实时接口仍要生成固定结构和兼容测试。

第四，模型验证常被“曲线看起来一致”代替。数字孪生必须给每个模型建立 context of use：用于前馈轨迹、反馈状态估计、异常预警、工程载荷、维护预测还是安全论证。用途不同，允许误差、覆盖工况和独立性要求不同。用于操作建议的模型可以由操作员复核；直接驱动执行器的模型需要实时、故障和回退验证；进入核安全论证的模型则需要更严格的配置、独立审查和软件资格。

第五，现有研究 PCS 通常以实验性能为目标，电厂需要经济性和可用率。未来控制目标不只是把等离子体保持在目标形状，还要考虑执行器寿命、热循环、氚库存、磁体/电源余量、维护窗口、发电负荷与安全裕度。多目标优化必须有权限和约束：AI/优化器可以提建议，但安全 gate、保护链和最终执行权限要可解释、可审计、可回退。

第六，软件生命周期和供应链不足。受控 PCS、商业 OS、研究代码、个人脚本和快速变化的 AI 模型会共存。数字孪生需要 SBOM、许可证、依赖锁定、代码评审、自动测试、模型注册、签名发布、灰度/影子部署、回滚、长期归档和网络安全边界。开源代码并不自动可维护；闭源代码也不自动不可信，关键是能否取得接口、测试证据、版本承诺和审计权。

第七，人的角色经常缺席。真实放电由物理、控制、诊断、运行、工程、保护和安全团队共同决策。孪生界面必须显示状态来源、置信区间、约束、触发原因、建议影响和回退方案；保留操作员确认和电子日志；把专家修正回流到模型而不是只留在聊天记录。人机交互也是控制系统的一部分。

## 8. 面向 FusionDigital 的建议路线

近期从 DINA、MEQ 切入是合理的，但应把目标定义为“可验证磁控制服务”，而不是先做一个无边界的全装置孪生。第一步建立统一输入合同：线圈/电源、被动结构、几何、磁标定、参考位形、时间基准和质量位；用 MEQ/LIUQE 做平衡与磁响应，用 DINA/DINA-IMAS 做非线性自由边界和场景。对每个装置建立参数包和版本，不把代码分支与装置配置混在一起。

第二步形成控制验证流水线：解析/标准案例、跨代码对照、历史炮回放、闭环 SIL、实时目标编译、HIL、影子运行和受限真机。采用 PCSSP 的模块组合思想、DIII-D/ASDEX Upgrade 的 flight-simulator 方法和 TCV 的 Simulink—MARTe2部署链。若不用 Simulink，也应保持“算法中立表示—代码生成/封装—实时运行—同接口回放”的结构。

第三步把 PCS 平台和模型服务解耦。MARTe2 可作为候选实时执行框架，EPICS/CODAC 思想负责设备 I&C，MDSplus 管 shot/config，IMAS/OMAS 管跨代码语义；但最终选型需基于新奥现有控制系统、实时OS、网络、硬件和团队能力做基准测试。每个边界都要定义超时、质量位、默认值和降级动作。

第四步逐任务扩展：从电流/位置/形状、垂直稳定到密度/加料，再到温度/电流/密度剖面、MHD、不稳定性、辐射与偏滤器热负荷，最后做执行器分配和场景监督。每增加一个任务，不只添加控制器，也增加状态观测、plant模型、执行器模型、异常模式、测试数据和验收指标。

第五步连接工程孪生。电磁场/电磁力与热管理代理模型应把线圈/等离子体工况映射为力、位移、应变、应力和温度，并用传感器数据校准。在线层运行可信缩阶/代理模型，高保真商业软件负责离线标定和异常复核。代理模型必须输出适用域和不确定度，超域时退回保守规则或请求高保真分析。

第六步建设证据库而不只是模型库。每个工作条目关联问题、装置、架构、周期、I/O、控制模块、验证、论文、代码、限制、证据等级和部署状态；每次报告自动检查空 URL、预印本、官方声明和过度声称。本文三个文件正是这一数据模型的初稿。

第七步面向电厂扩展总体价值：低成本应表述为全寿期成本可控，既包括减少昂贵试错，也包括执行器/部件寿命与维护优化；高效率是等离子体性能、辅助功率、热转换和运行计划协同；高可靠是状态可观测、故障预测、降级控制和可维护性；强安全是独立保护、可追溯证据和人机授权。数字孪生的价值不是替代保护或专家，而是让模型、数据、控制与工程决策形成持续校准的证据闭环。

## 9. 装置合作时应索取的最小资料包

对任何合作装置，建议索取：一，控制任务和 phase/mode 列表；二，信号与执行器 ICD，包括单位、坐标、采样、延迟、质量位和上下限；三，实时硬件、OS、网络、时钟、CPU/线程配置；四，算法组件、依赖、许可证、构建和发布方式；五，磁/电路/执行器/诊断 plant 模型；六，历史放电和异常数据、标定版本；七，SIL/HIL/影子/闭环测试用例和验收阈值；八，机器保护、设备联锁、人员/核安全与 PCS 的职责矩阵；九，配置和数据归档规则；十，软件问题、变更和回滚流程。

对受控代码，不必把“拿到源码”作为唯一目标。可以谈判提供稳定 API、容器/二进制、测试 harness、有限装置模型、参考波形、接口模拟器和现场联合验证；同时明确能否修改、能否二次分发、成果归属、漏洞修复和长期维护。对开源框架，则要核验实际许可证、release/commit、维护活跃度、CI、平台支持和安全响应，避免把“能下载”误当作“可生产使用”。

## 10. 审计结论与高风险表述清单

本底稿的 URL 采用 DOI、论文主页、官方装置页或官方仓库；没有把搜索结果页作为核心证据。最终机器审计得到 283 个 URL 出现、83 个唯一 URL，URI 语法无效 0、空 URL 字段 0；“未公开代码”项链接到证明该系统存在的论文/机构页，并明确注明该链接不是代码仓库。两份 JSON 均可解析，40 个工作 ID 与 20 个装置 ID 无重复，必填字段缺失 0，代码状态全部属于 `paper-direct / official-framework / controlled-access / commercial / not-public` 枚举。浏览复核纠正了 co-simulation、Fenix、EAST、SAMONE、KSTAR、NSTX-U、MAST-U、WEST 等多处 DOI/题名；HTTP 页面未来仍可能重定向或受机构访问策略影响，故“语法通过”不等同于永久可达。

以下表述必须在主报告中保留限定语：EAST LingShu 的 99.99% 可靠性与小于 5 μs 抖动是机构官方声称/内部测试语境，不是第三方核级认证；KSTAR 的 iPCS 事件证明真机部署/操作，不证明 ITER 条件完成验证；JET 的 MARTe2 证据主要是局部系统和升级工作，不证明全 PCS 迁移；HL-2M 2023 新 PCS 论文以初步仿真为主，不能标 E4；SPARC 尚无等离子体，neutrino/COMET 是开发/HIL；ARC、CFETR、EHL-2 没有生产 PCS；EXL PTEFIT 是预印本且未发现公共代码，0.268 ms 不是端到端认证周期；RAPTOR 需 CLA/授权，不能标无条件开源；DINA-IMAS 公开不代表全部 DINA 分支开放；MARTe2、EPICS、MDSplus、IMAS、OMAS 是使能框架/语义层，不等于装置专用控制代码。

最后，装置级控制研究的共同趋势可以概括为：从单环到多目标协调，从固定算法到模型驱动和状态观测，从专用裸机到组件化实时框架，从放电后分析到影子/闭环在线模型，从代码交付到需求—模型—测试—数据—版本证据链。但距离聚变电厂数字孪生仍有明显差距：燃烧等离子体与工程系统联合模型不完整，安全独立性与 AI 权限未形成通行范式，数据语义和配置治理不统一，商业/受控软件阻碍可复现，研究装置的闭环成功尚未转化为全寿期高可用与可维护证据。FusionDigital 的路线应以这些差距为工作分解，而不是用“已有集成模拟”替代“已有数字孪生”。

## 11. 主要来源索引

- DIII-D PCS：[2020](https://doi.org/10.1016/j.fusengdes.2019.111368)、[2024](https://doi.org/10.1109/TPS.2024.3415768)、[GA 官方](https://www.ga.com/plasma-control)。
- TCV：[2024 全机综述](https://doi.org/10.1016/j.fusengdes.2024.114640)、[2017 分布式系统](https://doi.org/10.1088/1741-4326/aa6120)、[MEQ](https://gitlab.epfl.ch/spc/public/meq/meq)、[RAPTOR](https://crppwww.epfl.ch/~sauter/raptor/)。
- ASDEX Upgrade：[DCS](https://doi.org/10.1016/j.fusengdes.2014.01.001)。
- JET：[控制](https://doi.org/10.1016/S0920-3796(00)00125-3)、[保护](https://doi.org/10.1088/1741-4326/ab1a79)、[WALLS](https://doi.org/10.1016/j.fusengdes.2013.10.010)。
- EAST：[PCS](https://doi.org/10.1016/j.fusengdes.2007.12.028)、[稳态升级](https://doi.org/10.1016/j.fusengdes.2018.02.079)、[LingShu 官方报道](https://ipp.cas.cn/xwdt/kydt/202308/t20230827_374112.html)。
- KSTAR：[升级](https://doi.org/10.1016/j.fusengdes.2018.02.066)、[iPCS 官方事件](https://www.iter.org/node/20687/kstar-iters-plasma-control-system-successfully-takes-charge)。
- ITER：[PCS 架构](https://doi.org/10.1016/j.fusengdes.2014.02.079)、[PCSSP](https://doi.org/10.1016/j.fusengdes.2015.01.009)、[MBSE](https://doi.org/10.1016/j.fusengdes.2024.114464)、[CODAC](https://www.iter.org/machine/supporting-systems/codac/codac-core-system)、[IMAS 开放](https://www.iter.org/node/20687/release-imas-infrastructure-and-physics-models-open-source)。
- NSTX-U：[升级](https://bp-pub.pppl.gov/pub_report/2014/PPPL-5045-abs.html)、[GSevolve 2025](https://doi.org/10.1016/j.fusengdes.2025.115302)。
- MAST-U：[PCS](https://doi.org/10.1016/j.fusengdes.2020.111764)。
- HL-2M：[新 PCS](https://doi.org/10.1016/j.fusengdes.2023.113763)；J-TEXT：[JRTF](https://doi.org/10.1016/j.fusengdes.2018.02.060)。
- SPARC：[PCS 会议原文](https://meetings-archive.aps.org/dpp/2024/np12/105/)、[GSPulse](https://github.com/jwai-cfs/GSPulse_public)。
- EXL/EHL：[EXL-50 综述](https://doi.org/10.1088/1741-4326/adf239)、[PTEFIT 预印本](https://arxiv.org/abs/2601.12378)、[ENN 路线图](https://doi.org/10.1063/5.0199112)、[EHL-2 FEC 海报](https://conferences.iaea.org/event/392/contributions/35908/attachments/19881/36142/FEC2025_EHL2_poster-Xie-V4.pdf)。
- 框架：[MARTe2](https://vcis-gitlab.f4e.europa.eu/aneto/MARTe2)、[EPICS Base](https://github.com/epics-base/epics-base)、[MDSplus](https://github.com/MDSplus/mdsplus)、[IMAS-Python](https://github.com/iterorganization/IMAS-Python)、[OMAS](https://github.com/gafusion/omas)、[DINA-IMAS](https://github.com/iterorganization/DINA-IMAS)。

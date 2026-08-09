export type IntegratedFramework = {
  name: string; role: string; strengths: string; limits: string; twinGap: string; url: string;
};

export const integratedGroups: {group:string; purpose:string; items:IntegratedFramework[]}[] = [
  {group:'数据模型与工作流底座',purpose:'统一语义、组织组件和计算资源，但不自动保证物理自洽。',items:[
    {name:'IMAS',role:'ITER 机器无关数据字典、IDS、访问层与应用生态',strengths:'实验/模拟同构；跨语言；元数据与谱系；2025 年开放发布',limits:'不规定耦合算法、收敛、实时调度或安全回退',twinGap:'补实时数据质量、状态估计、资产配置和连续 V&V',url:'https://www.iter.org/node/20687/release-imas-infrastructure-and-physics-models-open-source'},
    {name:'OMFIT / OMAS',role:'实验分析、数据访问、远程运行和物理工作流',strengths:'科学家生产力高；模块丰富；贴近 DIII-D/AToM 实践',limits:'模块质量、许可、隐含状态和依赖并不完全统一',twinGap:'关键模块需无状态服务化、固定回放与签名发布',url:'https://omfit.io/'},
    {name:'IPS',role:'HPC 批处理环境中的遗留代码松耦合与资源编排',strengths:'少改代码即可接入；多层并行；集合计算和失败隔离',limits:'文件/阶段式交换、I/O 和隐式更新顺序',twinGap:'定位为离线证据工厂；另建流式在线运行层',url:'https://ips-framework.readthedocs.io/en/latest/'},
    {name:'ETS / PAF / MUSCLE3',role:'IMAS IDS 驱动的模块化 1.5D 核心输运',strengths:'组件可替换；社区数据契约；常驻 actor 与点对点消息',limits:'约 60 个程序和大量通道带来配置与调试复杂度',twinGap:'选择快速 actor 进入在线层，并补同化、UQ 和服务等级',url:'https://wpcd-workflows.readthedocs.io/en/latest/ets.html'}]},
  {group:'脉冲与等离子体集成套件',purpose:'积累最深的装置证据；主要面向离线解释和预测。',items:[
    {name:'TRANSP / PTRANSP',role:'核心输运、源项、快离子和功率平衡的综合脉冲分析',strengths:'跨装置历史深；解释/预测两用；NUBEAM 等源项成熟',limits:'配置复杂、专家/许可依赖；核心覆盖不等于全堆',twinGap:'作为后验权威与代理训练工厂，不直接承担硬实时',url:'https://transp.pppl.gov/'},
    {name:'JINTRAC / HFPS',role:'JETTO 核心、杂质、源项和 EDGE2D-EIRENE 边界链',strengths:'核心—边界覆盖；JET D-T 与 ITER 场景证据；IMAS 适配',limits:'计算和配置成本高；耦合边界与收敛依赖专家',twinGap:'压缩为在线快速状态与风险模型，持续由全脉冲链复核',url:'https://www.iter.org/sites/default/files/media/2025-07/l-3_wiesen.pdf'},
    {name:'ASTRA / CRONOS',role:'模块化 1D 输运、平衡和源项场景模拟',strengths:'快速灵活；长期装置应用；方法公开和跨代码基准丰富',limits:'版本、发行和自动测试依赖研究网络；边界/工程有限',twinGap:'冻结可审计版本并服务化快速核，继承历史验证集',url:'https://doi.org/10.1088/0029-5515/50/4/043001'},
    {name:'METIS',role:'0D 缩放输运 + 1D 电流扩散的快速场景模型',strengths:'速度快；扫描与控制耦合友好；可连接 CREATE-NL+',limits:'缩放模型在新区域外推风险大；事件和壁物理有限',twinGap:'与 DINA/MEQ 组成快速预测，并由 JINTRAC/TRANSP 校准',url:'https://www.sciencedirect.com/science/article/pii/S0920379623002156'},
    {name:'TOPICS / TASK',role:'JT-60 系列核心输运、平衡、波与速度分布集成链',strengths:'装置专用经验深；场景与跨代码比较资产丰富',limits:'开放获取、文档和国际接口工程相对有限',twinGap:'通过 IMAS/项目契约输出状态与证据，保留本地成熟链',url:'https://www.jt60sa.org/wp/wp-content/uploads/2021/02/JT-60SA_Res_Plan-5.pdf'},
    {name:'CORSICA',role:'自由边界、1D 输运、稳定性和合成诊断',strengths:'较早与 Simulink 控制模型联动；适合形状—剖面研究',limits:'混合语言、旧开发环境、许可和现代维护成本',twinGap:'继承控制协同方法，不建议作为新平台核心',url:'https://digital.library.unt.edu/ark:/67531/metadc679552/'},
    {name:'IPS-FASTRAN / OMFIT STEP',role:'输运、平衡、pedestal、稳定性和优化工作流',strengths:'理论驱动；多保真；HPC 集合与设计优化能力强',limits:'模块许可/机构依赖；离线计算；自洽范围仍有限',twinGap:'显式保存残差、模型选择和 UQ，再生成在线模型',url:'https://meetings-archive.aps.org/dpp/2024/cm11/10/'},
    {name:'FyTok / TORAX',role:'本体驱动或 JAX 可微的新一代可编程输运框架',strengths:'现代 Python/JAX；可微、加速和 ML/优化友好',limits:'装置验证和长期维护积累仍浅',twinGap:'先通过固定装置基准、梯度检查和超域测试',url:'https://www.sciencedirect.com/science/article/pii/S2352711024003935'}]},
  {group:'全装置与工程高保真',purpose:'为闭合关系、代理、危险边界和不确定度提供离线证据。',items:[
    {name:'FACETS',role:'核心—边缘—壁并行耦合',strengths:'系统研究跨区域、跨网格和并行时间推进',limits:'项目年代较早；“全装置”仍主要是等离子体域',twinGap:'继承接口守恒和耦合基准，而非直接复活软件栈',url:'https://arxiv.org/abs/1004.1611'},
    {name:'WDMApp / EFFIS',role:'XGC 与 GENE/GEM 的高保真核心—边界回旋动理学耦合',strengths:'并发 exascale 数据流；区域耦合物理保真高',limits:'算力和部署成本极高；访问受控；不适合在线',twinGap:'将结果系统压缩成输运闭合、代理和适用域',url:'https://wdmapp.readthedocs.io/en/latest/'},
    {name:'MOOSE / SALAMANDER',role:'聚变核工程多物理、多尺度和质量保证框架',strengths:'强耦合求解、自动微分、测试；连接 Cardinal/TMAP8',limits:'聚变材料、液态金属 MHD 和实验确认仍在成熟',twinGap:'连接部件传感、服役历史和可部署 ROM',url:'https://salamander.inl.gov/'},
    {name:'FMI / SSP / Modelica / preCICE',role:'供应商中立系统模型与分区多物理接口',strengths:'封装遗留/商业模型；系统动态和 HIL 生态成熟',limits:'标准接口不保证主算法稳定、守恒或实时确定性',twinGap:'制定聚变接口剖面、时钟、误差、回滚和安全等级',url:'https://modelica.org/association/'}]},
  {group:'整厂设计与工业孪生平台',purpose:'闭合设计、配置和运行部署；需要科学框架提供聚变物理。',items:[
    {name:'PROCESS',role:'聚变电厂 0D/1D 约束、性能与成本优化',strengths:'快速、开源、约束覆盖广，适合筛选和敏感性',limits:'缩放与低维模型；名义点设计不代表实际资产',twinGap:'由高保真与运行数据更新参数分布和长期计划',url:'https://ukaea.github.io/PROCESS/'},
    {name:'FUSE',role:'IMAS 本体 actor 驱动的多保真等离子体—工程—整厂设计',strengths:'Julia、开源、优化/自动微分、模块化和时变能力',limits:'框架年轻；独立验证和稳定接口仍在积累',twinGap:'补传感同化、确定性服务、资产状态和模型发布治理',url:'https://fuse.help/'},
    {name:'bluemira / UK STEP workflow',role:'参数化几何、CAD、平衡、系统代码与工程设计闭环',strengths:'把点设计转为几何和跨专业决策；项目实践真实',limits:'设计流程仍有离散人工环节；几何不等于可制造',twinGap:'连接 PLM、制造偏差、检修配置和运行状态',url:'https://bluemira.readthedocs.io/'},
    {name:'Ansys / Simcenter / 3DEXPERIENCE',role:'系统仿真、ROM、IIoT、PLM、部署和生命周期管理',strengths:'工业工程与资产连接成熟；支持实时/HIL和企业治理',limits:'商业锁定；聚变核心物理和公开验证需自建',twinGap:'作为工程/生命周期层，以开放接口联邦科学模型',url:'https://www.ansys.com/en-gb/products/digital-twin/ansys-twin-builder'},
    {name:'COMSOL / MATLAB-Simulink / Altair',role:'部件多物理、控制/估计、ROM和系统级实时部署',strengths:'原型与控制测试效率高；工具和模型库成熟',limits:'高保真 HPC 或聚变本体并非统一强项；许可依赖',twinGap:'用于明确子系统和测试台，不承担唯一主数据与物理真值',url:'https://www.mathworks.com/discovery/digital-twin.html'}]}
];

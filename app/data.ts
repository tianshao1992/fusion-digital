export type Tool = {
  name: string; domain: string; access: string; fidelity: string; realtime: string;
  stack: string; scope: string; validation: string; devices: string; url: string;
};

const D = (domain:string, access:string, fidelity:string, realtime:string, stack:string, scope:string, validation:string, devices:string, url:string, names:string[]):Tool[] =>
  names.map(name => ({name,domain,access,fidelity,realtime,stack,scope,validation,devices,url}));

export const tools: Tool[] = [
 ...D('平衡、重建与控制','开源/公开版并存','低—中','可实时','Fortran/C++/Python/Matlab','Grad–Shafranov 平衡、线圈与导体响应、形状/电流控制','解析解、跨代码、放电重建与闭环实验','ITER、TCV、DIII-D、JET、JT-60SA、MAST-U','https://www.iter.org/node/20687/release-imas-infrastructure-and-physics-models-open-source',['DINA','MEQ','EFIT','FreeGS','FreeGSNKE','CREATE-NL','FIESTA','TokaMaker','GSevolve','LIUQE','EQUINOX','CHEASE','HELENA']),
 ...D('集成输运与场景','多为机构授权；部分开源','中','部分可实时/快于实时','Fortran/C/C++/Python/Julia','1.5D 输运、源项、加热、电流扩散、场景集成','历史放电回放、预测/解释对比、跨代码、回归测试','ITER、JET、DIII-D、AUG、KSTAR、SPARC、STEP','https://transp.pppl.gov/',['TRANSP','JINTRAC','ASTRA','CRONOS','RAPTOR','METIS','ETS','TASK','TOPICS','CORSICA','TGYRO','T3D','FUSE']),
 ...D('湍流与新经典输运','开源与机构授权混合','高—极高','通常离线；约化模型可快','Fortran/C++/CUDA/Python/Julia','回旋动理学、粒子/热/动量通量、新经典输运','制造解、线性基准、跨代码、装置多通道验证','AUG、DIII-D、JET、W7-X、SPARC','https://pyrokinetics.readthedocs.io/',['GENE','CGYRO','GS2','GKW','stella','GX','XGC','GTC','ORB5','GYSELA','EUTERPE','TGLF','QuaLiKiz','NEO','SFINCS','DKES','KNOSOS']),
 ...D('MHD、稳定性与破裂','开源与受限混合','中—极高','多为离线；线性/约化可快','Fortran/C++/Python/MPI','ELM、撕裂模、垂直位移、RMP、破裂与壁响应','解析增长率、跨代码挑战、事件波形/结构比较','JET、ITER、DIII-D、KSTAR、AUG、MAST-U','https://jorek.eu/',['JOREK','M3D-C1','NIMROD','BOUT++','MARS-F','MISHKA','ELITE','NOVA-K','CASTOR3D','MEGA','FAR3D']),
 ...D('边界、SOL、偏滤器与壁相互作用','开源与机构授权混合','中—极高','多为离线','Fortran/C++/Python/MPI/GPU','二维流体—中性粒子、三维边界湍流、杂质迁移与溅射','基准题、功率/密度剖面、光谱与靶板测量比较','ITER、JET、W7-X、DIII-D、MAST-U、EAST','https://github.com/boutproject/BOUT-dev',['SOLPS-ITER','EDGE2D-EIRENE','UEDGE','SOLEDGE3X-EIRENE','EMC3-EIRENE','Hermes-3','GBS','TOKAM3X','GRILLIX','EIRENE','DIVIMP','ERO2.0','GITR']),
 ...D('加热、电流驱动与快离子','开源与机构授权混合','中—高','多为离线','Fortran/C/C++/Python/HDF5','NBI、RF 波、射线/全波、轨道跟踪、损失与壁载荷','解析极限、ASCOT4/5 回归、诊断与损失探测器比较','JET、ITER、DIII-D、AUG、W7-X、SPARC','https://ascot4fusion.github.io/ascot5/',['ASCOT5','LOCUST','NUBEAM','GENRAY','TORAY','TORBEAM','GRAY','TRAVIS','LUKE','TORIC','AORSA']),
 ...D('失控电子与缓解','开源为主','中—高','离线/快速扫描','C++/Python/Fortran','电流淬灭、失控电子、杂质注入与破裂后演化','与 CODE/GO/NORSE 交叉验证、理论极限、实验贝叶斯验证','JET、DIII-D、AUG、ITER 情景','https://github.com/chalmersplasmatheory/DREAM',['DREAM','GO','NORSE','SMITER']),
 ...D('三维平衡与仿星器优化','开源与机构授权混合','中—高','离线','Fortran/C++/Python/JAX','三维 MHD 平衡、岛链、线圈/边界优化','解析极限、跨 VMEC/DESC/SPEC、W7-X 磁测与剖面','W7-X、LHD、HSX、仿星器概念','https://github.com/PlasmaControl/DESC',['VMEC','DESC','SPEC','PIES','HINT','GVEC','STELLOPT','SIMSOPT','FOCUS','REGCOIL','COILOPT++']),
 ...D('中子学、活化与辐射输运','开源与商业/出口受限混合','高','离线 HPC','C++/Fortran/Python/CAD','中子/光子蒙卡、DAGMC 几何、屏蔽、剂量、核热与活化','临界/屏蔽基准、FNG/OKTAVIAN、跨代码、实验数据库','ITER、JET、STEP、DEMO、各类包层试验','https://openmc.org/',['OpenMC','MCNP','Serpent','TRIPOLI-4','DAGMC','FISPACT-II','ALARA']),
 ...D('氚、材料与等离子体面对部件','开源与商业混合','微观—部件','离线','Python/FEniCS/C++/Fortran','氚扩散/俘获、辐照缺陷、溅射沉积、原子/电子结构','制造解、解析扩散、实验解吸/渗透、跨尺度传参','ITER、JET、WEST、包层与材料实验台','https://github.com/festim-dev/FESTIM',['FESTIM','TMAP8','Xolotl','LAMMPS','Quantum ESPRESSO','VASP']),
 ...D('工程多物理与安全分析','开源与商业混合','部件—系统','离线/准实时','C++/Fortran/Python/FEM/CFD','热流体、结构、电磁、液态金属 MHD、事故与系统瞬态','网格收敛、标准基准、试验回路、设计规范与独立审查','ITER、STEP、DEMO、包层与冷却回路','https://openfoam.org/',['OpenFOAM','FreeMHD','ANSYS Fluent/CFX','ANSYS Mechanical','COMSOL','Abaqus','STAR-CCM+','CalculiX','Code_Aster','Elmer','MOOSE/Cardinal','RELAP5-3D','MELCOR Fusion','Modelica/PBM']),
 ...D('系统工程与整厂优化','开源与机构内部混合','系统级','交互式—离线','Python/Fortran/Julia/优化器','0D/1D 功率平衡、成本、可用率、尺寸、RAMI 与多目标优化','历史设计复算、单元测试、约束闭合、敏感性与专家评审','STEP、ARIES、DEMO、私营聚变电厂概念','https://github.com/ukaea/PROCESS',['PROCESS','SYCOMORE','ARIES Systems Code','pyFECONs','BLUEPRINT/BlueMira']),
 ...D('数据、工作流与合成诊断','开源与机构基础设施混合','跨保真度','支持在线/离线','Python/Fortran/C++/Java/HPC','数据本体、耦合编排、可复现流水线、合成诊断与 UQ','模式校验、CI、参考数据、端到端回归和数据谱系','ITER、JET、DIII-D、EUROfusion、W7-X','https://imas-data-dictionary.readthedocs.io/',['IMAS','OMFIT','OMAS','IPS','CHERAB','Raysect','Pyrokinetics','duqtools','Dakota','EasyVVUQ']),
 ...D('惯性约束与其他路线（概览）','开源与国家实验室受限混合','高—极高','离线 HPC','C++/Fortran/AMR/GPU','辐射流体、激光/靶丸、MHD、脉冲功率','激波/辐射基准、靶丸实验、跨代码与不确定度研究','NIF、Z、OMEGA 及概念研究','https://flash-x.org/',['HYDRA','LASNEX','xRAGE','FLASH-X','MULTI-IFE','MACH2']),
];

export const references = [
 {id:'R1',title:'Release of IMAS infrastructure and physics models as open source',org:'ITER Organization',year:'2025',url:'https://www.iter.org/node/20687/release-imas-infrastructure-and-physics-models-open-source'},
 {id:'R2',title:'Integrated Modelling of ITER scenarios',org:'ITER International School',year:'2025',url:'https://www.iter.org/sites/default/files/media/2025-07/i-2_pinches.pdf'},
 {id:'R3',title:'Fusion Energy Sciences & Technology Roadmap',org:'U.S. DOE',year:'2026',url:'https://science.osti.gov/-/media/fes/pdf/2026/Fusion-ST-RoadmapUpdateV122Singles.pdf'},
 {id:'R4',title:'An integrated digital framework for fusion power plant design',org:'Royal Society Open Science',year:'2019',url:'https://doi.org/10.1098/rsos.181847'},
 {id:'R5',title:'FUSE: A framework for integrated fusion engineering',org:'arXiv',year:'2024',url:'https://arxiv.org/abs/2409.05894'},
 {id:'R6',title:'MEQ: a tool suite for tokamak equilibrium and control',org:'IAEA FEC',year:'2026',url:'https://conferences.iaea.org/event/450/contributions/40867/'},
 {id:'R7',title:'TRANSP: a code for integrated transport analysis',org:'Computer Physics Communications',year:'2025',url:'https://arxiv.org/abs/2406.07781'},
 {id:'R8',title:'The JOREK non-linear extended MHD code and applications',org:'Nuclear Fusion',year:'2021',url:'https://arxiv.org/abs/2011.09120'},
 {id:'R9',title:'DREAM: a fluid-kinetic framework for runaway electrons',org:'Computer Physics Communications',year:'2021',url:'https://arxiv.org/abs/2103.16457'},
 {id:'R10',title:'ASCOT5: orbit-following Monte Carlo code',org:'Computer Physics Communications',year:'2019',url:'https://arxiv.org/abs/1908.02482'},
 {id:'R11',title:'Validation in fusion research',org:'Physics of Plasmas',year:'2008',url:'https://arxiv.org/abs/0801.2787'},
 {id:'R12',title:'NASA-STD-7009B: Models and Simulations',org:'NASA',year:'2024',url:'https://standards.nasa.gov/standard/nasa/nasa-std-7009'},
 {id:'R13',title:'Conceptual design workflow for the STEP prototype powerplant',org:'UKAEA',year:'2024',url:'https://scientific-publications.ukaea.uk/papers/conceptual-design-workflow-for-the-step-prototype-powerplant/'},
 {id:'R14',title:'PROCESS systems code',org:'UKAEA GitHub',year:'2026',url:'https://github.com/ukaea/PROCESS'},
 {id:'R15',title:'EUROfusion integrated modelling workflows',org:'EUROfusion',year:'2026',url:'https://wpcd-workflows.github.io/introduction.html'},
 {id:'R16',title:'SPARC profile prediction with CGYRO/PORTALS',org:'arXiv',year:'2024',url:'https://arxiv.org/abs/2403.15633'},
 {id:'R17',title:'Hermes-3: multi-component plasma model',org:'arXiv',year:'2023',url:'https://arxiv.org/abs/2303.12131'},
 {id:'R18',title:'FESTIM verification and validation',org:'Nuclear Fusion',year:'2024',url:'https://doi.org/10.1088/1741-4326/ad3d86'},
 {id:'R19',title:'FISPACT-II validation',org:'UKAEA',year:'2026',url:'https://fispact.ukaea.uk/en/validation/'},
 {id:'R20',title:'TCV plasma control',org:'EPFL Swiss Plasma Center',year:'2026',url:'https://www.epfl.ch/research/domains/swiss-plasma-center/tcv-plasma-control/'},
 {id:'R21',title:'FACETS parallel fusion-component coupling framework',org:'Euromicro / arXiv',year:'2010',url:'https://arxiv.org/abs/1004.1611'},
 {id:'R22',title:'Integrated Plasma Simulator documentation',org:'SWIM / ORNL',year:'2026',url:'https://ips-framework.readthedocs.io/en/latest/'},
 {id:'R23',title:'Whole Device Model Application documentation',org:'DOE Exascale Computing Project',year:'2026',url:'https://wdmapp.readthedocs.io/en/latest/'},
 {id:'R24',title:'European Transport Simulator workflows',org:'EUROfusion',year:'2026',url:'https://wpcd-workflows.readthedocs.io/en/latest/ets.html'},
 {id:'R25',title:'MOOSE / SALAMANDER fusion multiphysics',org:'Idaho National Laboratory',year:'2026',url:'https://salamander.inl.gov/'},
 {id:'R26',title:'Digital Twin implementation based on ISO 23247',org:'NIST AMS 400-2',year:'2021',url:'https://doi.org/10.6028/NIST.AMS.400-2'},
 {id:'R27',title:'FMI and SSP open co-simulation standards',org:'Modelica Association',year:'2026',url:'https://modelica.org/association/'},
];

export const domains = ['全部', ...Array.from(new Set(tools.map(t => t.domain)))];

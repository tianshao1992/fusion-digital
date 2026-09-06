import { FUSE_COMMIT } from './run-spec';
// Static inventory of src/actors at this commit; presence is NOT execution coverage.
export const fuseCatalog = {
  engineId:'fuse', version:'1.2.0', commit:FUSE_COMMIT,
  families: [
    {id:'equilibrium',domain:'physics',zh:'磁平衡',en:'Equilibrium',actors:['ActorCHEASE','ActorEGGO','ActorEquilibrium','ActorFRESCO','ActorTEQUILA'],note:'FRESCO / TEQUILA; CHEASE requires a separate Linux runtime.'},
    {id:'transport',domain:'physics',zh:'核心与新经典输运',en:'Core & neoclassical transport',actors:['ActorAnalyticTurbulence','ActorCoreTransport','ActorEPEDprofiles','ActorFINN','ActorFluxCalculator','ActorFluxMatcher','ActorModeID','ActorNeoclassical','ActorQLGYRO','ActorTGLF','ActorTJLFEP'],note:'Surrogates, reduced models and external solvers have separate qualifications.'},
    {id:'hcd',domain:'physics',zh:'加热、电流驱动与加料',en:'Heating, current drive & fueling',actors:['ActorNeutralFueling','ActorPAM','ActorRABBIT','ActorSawteethSource','ActorSimpleEC','ActorSimpleIC','ActorSimpleLH','ActorSimpleNB','ActorSimplePL','ActorSources','ActorTORBEAM'],note:'Simple models do not validate TORBEAM / RABBIT / PAM.'},
    {id:'current',domain:'physics',zh:'电流与电阻扩散',en:'Current & resistive diffusion',actors:['ActorCurrent','ActorQED','ActorSteadyStateCurrent'],note:'Stationary and dynamic current cases require distinct evidence.'},
    {id:'pedestal',domain:'physics',zh:'台基与边界',en:'Pedestal & boundary',actors:['ActorAnalyticPedestal','ActorEPED','ActorPedestal','ActorWPED'],note:'L-mode fixed boundary does not validate H-mode pedestal prediction.'},
    {id:'stability',domain:'physics',zh:'稳定性与运行限值',en:'Stability & limits',actors:['ActorMars','ActorPlasmaLimits','ActorTroyonBetaNN','ActorVerticalStability'],note:'MARS requires external tools; not nonlinear MHD evolution.'},
    {id:'diagnostics',domain:'physics',zh:'诊断与剖面拟合',en:'Diagnostics & profile fitting',actors:['ActorFitProfiles','ActorInterferometer','ActorMagnetics'],note:'Requires authorized observations and diagnostic geometry.'},
    {id:'sol',domain:'physics',zh:'刮削层',en:'Scrape-off layer',actors:['ActorSOL','ActorSOLBox','ActorSOLPSNN'],note:'SOLPSNN is a trained surrogate, not a native SOLPS solver.'},
    {id:'wall_loading',domain:'engineering',zh:'第一壁热负荷',en:'Wall loading',actors:['ActorCoreRadHeatFlux','ActorParticleHeatFlux'],note:'Requires radiation/particle sources and wall geometry.'},
    {id:'divertors',domain:'engineering',zh:'偏滤器',en:'Divertors',actors:['ActorDivertors'],note:'Reduced engineering models, not a general CFD mesh solver.'},
    {id:'build',domain:'engineering',zh:'构型、磁通与结构',en:'Build, flux swing & structure',actors:['ActorCXbuild','ActorFluxSwing','ActorHFSsizing','ActorLFSsizing','ActorStresses'],note:'Stresses is a 1D cylindrical analytical model, not 3D FEM.'},
    {id:'pf',domain:'engineering',zh:'PF 与被动结构',en:'PF & passive structures',actors:['ActorPFactive','ActorPFdesign','ActorPassiveStructures'],note:'Inverse coil-current design and geometry optimization are distinct.'},
    {id:'nuclear',domain:'engineering',zh:'中子学与包层',en:'Neutronics & blanket',actors:['ActorBlanket','ActorNeutronics'],note:'Requires a fusion-plant case; DIII-D cannot validate power-plant TBR.'},
    {id:'balance_plant',domain:'engineering',zh:'热循环与厂用系统',en:'Thermal cycle & plant systems',actors:['ActorBalanceOfPlant','ActorPowerNeeds','ActorThermalPlant','ActorThermalSystemModels'],note:'FPP case and optional thermal-network dependencies required.'},
    {id:'costing',domain:'engineering',zh:'经济性',en:'Costing',actors:['ActorCosting','ActorCostingARIES','ActorCostingSheffield'],note:'Conceptual economic models; not financial feasibility certification.'},
    {id:'compound',domain:'shared',zh:'耦合工作流',en:'Coupled workflows',actors:['ActorDynamicPlasma','ActorStationaryPlasma','ActorWholeFacility'],note:'Composed workflows; all sub-models are not automatically exercised.'},
    {id:'control',domain:'shared',zh:'控制',en:'Control',actors:['ActorControllerIp'],note:'Offline control does not establish a hardware-in-loop qualification.'},
    {id:'infrastructure',domain:'shared',zh:'回放与外部接口',en:'Replay & external interfaces',actors:['ActorNoOperation','ActorReplay','ActorZMQ'],note:'NoOp / replay / communication are not physics solvers.'},
  ],
} as const;

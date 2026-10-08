import './power-conversion.css';

type Copy = readonly [string, string];
type Route = {
  id: string;
  title: Copy;
  input: Copy;
  family: Copy;
  steps: Copy[];
  note: Copy;
  detail: Copy;
};

const routes: Route[] = [
  {
    id: 'rankine', title: ['蒸汽朗肯循环', 'Steam Rankine cycle'],
    input: ['可回收热量', 'Recoverable heat'], family: ['热循环', 'Thermal cycle'],
    steps: [['换热 / 蒸汽', 'Heat / steam'], ['汽轮机', 'Turbine'], ['发电机', 'Generator']],
    note: ['成熟热机原理 · 聚变集成待验证', 'Established cycle · fusion integration unproven'],
    detail: ['热量经换热器产生蒸汽，驱动汽轮机与发电机；蒸汽经冷凝、给水泵返回。冷端向环境排热，不在电力输出链上。', 'Heat produces steam to drive a turbine and generator. Condensation and a feed pump close the fluid loop. The cold side rejects heat to the environment, separately from electrical output.'],
  },
  {
    id: 'brayton', title: ['氦气 / 超临界 CO₂', 'Helium / supercritical CO₂'],
    input: ['可回收热量', 'Recoverable heat'], family: ['布雷顿热循环', 'Brayton thermal cycle'],
    steps: [['换热 / 工质', 'Heat / fluid'], ['涡轮机械', 'Turbomachinery'], ['发电机', 'Generator']],
    note: ['闭式循环 · 受温度与材料约束', 'Closed cycle · temperature & materials limits'],
    detail: ['闭式工质循环为压缩、吸热、膨胀做功、冷却，再回到压缩机，可配置回热器。它仍是热发电路线；氦气与超临界 CO₂ 的工况和设备要求不同，不能直接互换。', 'A closed fluid loop compresses, absorbs heat, expands through a turbine and cools before returning to the compressor; recuperation is possible. This is still thermal conversion. Helium and supercritical CO₂ require different operating conditions and equipment.'],
  },
  {
    id: 'direct', title: ['带电粒子直接转换', 'Charged-particle conversion'],
    input: ['可引出的带电粒子', 'Extractable charged particles'], family: ['非热机路径', 'Non-heat-engine route'],
    steps: [['粒子引导', 'Particle transport'], ['直接转换', 'Direct conversion'], ['电力电子', 'Power electronics']],
    note: ['依赖粒子可达性与约束构型', 'Requires accessible particles & compatible confinement'],
    detail: ['利用电场或电磁相互作用回收带电粒子的能量。需要可引出、可收集的粒子分布与兼容的装置构型；不能假定任意托卡马克可直接接入。回收能量与维持等离子体自加热也需共同平衡。', 'Electric fields or electromagnetic interactions recover charged-particle energy. This needs an extractable, collectable particle distribution and a compatible device topology; it is not a plug-in option for any tokamak. Extraction must also be balanced against plasma self-heating.'],
  },
  {
    id: 'mhd', title: ['MHD 磁流体发电', 'MHD power conversion'],
    input: ['导电工质能量', 'Conducting-fluid energy'], family: ['探索性路径', 'Exploratory route'],
    steps: [['导电流体', 'Conducting fluid'], ['磁场通道', 'Magnetic channel'], ['电力电子', 'Power electronics']],
    note: ['需适配导电工质与取能结构', 'Requires compatible fluid & extraction hardware'],
    detail: ['导电工质在磁场中运动，通过电磁相互作用取能。这里指能量转换装置，不是把约束等离子体直接接到发电机；导电率、材料与循环损耗仍需验证。', 'Motion of an electrically conducting fluid through a magnetic field enables electromagnetic energy extraction. This is a conversion system, not a direct connection from confined plasma to a generator. Conductivity, materials and cycle losses need validation.'],
  },
  {
    id: 'solid-state', title: ['辐射 / 固态转换', 'Radiative / solid-state conversion'],
    input: ['热辐射 / 热量', 'Thermal radiation / heat'], family: ['探索性路径', 'Exploratory route'],
    steps: [['热源 / 辐射源', 'Heat / emitter'], ['转换单元', 'Converter'], ['电力电子', 'Power electronics']],
    note: ['热光伏 · 热电 · 热电子等候选', 'TPV · thermoelectric · thermionic candidates'],
    detail: ['热光伏接收匹配的热辐射，热电利用温差，热电子利用热电子发射；三者机制不同，图中仅以热光伏设备作为代表。适合作为特定热源、温区下的候选方案，不意味着已实现聚变电厂级应用。', 'Thermophotovoltaics receive suitable thermal radiation, thermoelectrics use temperature differences, and thermionics use thermally emitted electrons. The illustration represents TPV only. These are candidates for specific heat sources and temperature ranges, not demonstrated fusion-plant systems.'],
  },
];

// Pixel bounds were checked against the generated atlas; rows are not uniform.
const atlasRows = [[0, 276], [276, 299], [575, 342], [917, 293], [1210, 326]];

export default function PowerConversionMap({ en }: { en: boolean }) {
  const t = (copy: Copy) => copy[en ? 1 : 0];
  return <div className="pcMap">
    <div className="pcMapIntro"><span>{en ? 'ONE ENERGY SOURCE. MULTIPLE PATHWAYS.' : '一种能源，多种转换可能。'}</span><small>{en ? 'Alternative routes, selected for the device' : '依装置选择的候选路线，并非同时接入'}</small></div>
    <div className="pcNetwork" role="group" aria-label={en ? 'Candidate fusion power-conversion pathways' : '聚变能量转换候选路径'}>
      <figure className="pcSource" data-from="plasma" data-to="engineering">
        <span className="pcOverline">FUSION ENERGY</span>
        <img src="/images/story/fusion-energy-source.png" width="1536" height="1024" loading="lazy" alt={en ? 'Conceptual cutaway of a fusion device; not an engineering model' : '聚变装置剖面概念图，非工程模型'}/>
        <figcaption><strong>{en ? 'Fusion energy' : '聚变能量'}</strong><span>{en ? 'Plasma × device × energy system' : '等离子体 × 装置 × 能源系统'}</span></figcaption>
      </figure>
      <ol className="pcRoutes">
        {routes.map((route, i) => <li className="pcRoute" key={route.id} data-route={route.id} data-from="engineering" data-to="electricity">
          <div className="pcRouteHeading"><span className="pcRouteNumber">0{i + 1}</span><div><small>{t(route.family)} · {t(route.input)}</small><h3>{t(route.title)}</h3><p className="pcRouteNote">{t(route.note)}</p></div></div>
          <div className="pcRouteEquipment">
            <div className="pcEquipmentCrop" aria-hidden="true"><svg viewBox={`0 ${atlasRows[i][0]} 1024 ${atlasRows[i][1]}`}><image href="/images/story/power-conversion-atlas.png" width="1024" height="1536"/></svg></div>
            <ol className="pcChain" aria-label={en ? `${t(route.title)} energy flow` : `${t(route.title)}能量流向`}>{route.steps.map(step => <li key={step[1]}>{t(step)}</li>)}</ol>
            {i < 2 && <span className="pcFluidReturn">{en ? (i === 0 ? '↶ Condense · pump · heat addition' : '↶ Cool · compress · heat addition') : (i === 0 ? '↶ 冷凝 · 给水 · 吸热' : '↶ 冷却 · 压缩 · 吸热')}</span>}
          </div>
        </li>)}
      </ol>
      <figure className="pcElectricity" data-from="electricity" data-to="grid">
        <img className="pcGridEquipment" src="/images/story/electric-grid.png" width="1024" height="1536" loading="lazy" alt={en ? 'Concept illustration of a step-up transformer, switchgear and transmission pylons' : '升压变压器、开关设备与输电铁塔的概念插画'}/>
        <figcaption>
          <span className="pcOverline">ELECTRICITY & GRID</span>
          <strong>{en ? 'Connect to the grid' : '连接电网'}</strong>
          <span>{en ? 'Condition · protect · step up' : '调节 · 保护 · 升压'}</span>
          <span className="pcGrid"><span aria-hidden="true">⇄</span> {en ? 'Grid exchange' : '电网交换'}</span>
        </figcaption>
      </figure>
    </div>
    <div className="pcSupportLoops">
      <div className="pcHeatLoop" data-from="conversion" data-to="heat-sink"><span aria-hidden="true">↘</span><p><strong>{en ? 'Heat rejection & cooling' : '排热与冷却'}</strong><span>{en ? 'A separate heat sink, not an electrical stage' : '独立冷端支路，不串接在电力输出链上'}</span></p></div>
      <div className="pcAuxLoop" data-from="electricity" data-to="auxiliary-systems"><span aria-hidden="true">↶</span><p><strong>{en ? 'Plant power recirculation' : '厂用电回流'}</strong><span>{en ? 'Heating · magnets · pumps · control' : '加热 · 磁体 · 泵 · 控制'}</span></p></div>
    </div>
    <div className="pcCaption"><span>{en ? 'CONCEPT EQUIPMENT · NOT AN ENGINEERING DESIGN' : '设备概念示意 · 非工程设计'}</span><span>{en ? 'Net electricity = gross generation − plant consumption' : '净电功率 = 总发电功率 − 厂用功耗'}</span></div>
    <details className="pcDetails"><summary>{en ? 'Principles & conditions' : '路线原理与适用边界'}</summary><div className="pcDetailsGrid">{routes.map(route => <article key={route.id}><h4>{t(route.title)}</h4><p>{t(route.detail)}</p></article>)}</div><p className="pcReferences">{en ? 'Research basis: ' : '研究依据：'}<a href="https://scipub.euro-fusion.org/wp-content/uploads/eurofusion/WPBOPPR1620364_accepted_merged-1.pdf" target="_blank" rel="noreferrer">{en ? 'Thermal cycles' : '热循环'}</a> · <a href="https://wx1.ans.org/pubs/journals/fst/a_729" target="_blank" rel="noreferrer">{en ? 'Particle conversion' : '粒子直接转换'}</a> · <a href="https://digital.library.unt.edu/ark:/67531/metadc1071264/" target="_blank" rel="noreferrer">MHD</a> · <a href="https://www.jspf.or.jp/PFR/PFR_articles/pfr2012/pfr2012_07-1405050.html" target="_blank" rel="noreferrer">{en ? 'Thermionic conversion' : '热电子'}</a> · <a href="https://arxiv.org/abs/1904.07804" target="_blank" rel="noreferrer">{en ? 'Radiative conversion' : '辐射转换'}</a></p></details>
  </div>;
}

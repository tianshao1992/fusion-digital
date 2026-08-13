import type { Metadata } from 'next';
import SiteFooter from '../components/SiteFooter';
import SiteNav from '../components/SiteNav';
import MultiDeviceWorkspace from './MultiDeviceWorkspace';
import './prototype.css';

export const metadata: Metadata = {
  title: '数字样机与 CAD·CAE 工作台',
  description: 'FusionDigital 多装置数字样机工作台：统一组织 Paramak、EXL-50U 与 ITER 的装置目录、许可边界、几何版本与 CAE 结果接口。',
};

const coverage = [
  ['已包含', '参数化等离子体体积', '空间关系示意'],
  ['已包含', 'TF 线圈阵列', '360° 主体阵列'],
  ['已包含', 'PF 线圈与壳体', '四组参数化线圈'],
  ['已包含', '六层径向构造', '拓扑与装配交互'],
  ['已包含', '下偏滤器区域', '参数化区域占位'],
  ['未包含', '中央螺线管 / 真空室', '待真实装置包替换'],
  ['未包含', '低温恒温器 / 热屏蔽', '待真实装置包替换'],
  ['未包含', '端口 / 诊断 / 厂房辅机', '待系统级装置包接入'],
] as const;

const lifecycle = [
  ['01', '权威源模型', 'PDM / PLM 管理原生 CAD、材料、基线和审批状态。'],
  ['02', '网页派生包', '脱敏、轻量化、分层与稳定 ID 映射，生成 GLB 和 DeviceManifest。'],
  ['03', '交互与组态', '装配树、拾取、显隐、隔离、剖切、属性与版本比较。'],
  ['04', 'CAE 场结果', '按网格、时间步、物理量和单位关联电磁、结构及热流体结果。'],
  ['05', '证据与决策', '把模型、工况、求解器、验证数据和审批结论固化为可追溯证据。'],
] as const;

const caeLanes = [
  ['电磁', 'B / J / Lorentz force', '磁场、电流密度与电磁力矢量'],
  ['结构', 'U / strain / stress', '位移、应变、应力与安全裕量'],
  ['热管理', 'T / q / HTC', '温度、热流密度与换热边界'],
  ['验证', 'sensor ↔ simulation', '力、位移、应变、应力、温度传感器对齐'],
] as const;

export default function DigitalPrototypePage() {
  return <main className="prototypePage">
    <SiteNav active="prototype" />

    <header className="prototypeHero">
      <div className="prototypeHeroCopy">
        <p>CAD / CAE DIGITAL PROTOTYPE WORKSPACE</p>
        <h1>聚变装置的数字样机，<span>不止是一张可旋转的三维图。</span></h1>
        <div className="prototypeLead">它是连接装置构型、稳定部件 ID、版本基线、工程属性、CAE 场结果与验证证据的空间索引。现在使用同一设备包契约组织 EXL‑50U、ITER 与 Paramak，并严格按装置独立声明许可和工程权威性。</div>
        <div className="prototypeHeroActions"><a href="#prototype-workspace">进入多装置工作台</a><a href="#package-contract">查看装置包合同</a></div>
      </div>
      <aside className="prototypeMission" aria-label="工作台当前状态">
        <div><span>DEVICE CATALOG</span><b>EXL‑50U / ITER / PARAMAK</b></div>
        <div><span>ONLINE GEOMETRY</span><b>PARAMAK / PUBLIC</b></div>
        <div><span>CONTROLLED SOURCE</span><b>EXL‑50U / LOCAL</b></div>
        <div><span>RESTRICTED SOURCE</span><b>ITER / LOCAL ONLY</b></div>
        <p>LICENCE-AWARE DEVICE CATALOG<br/>FAIL-CLOSED ASSET DELIVERY</p>
      </aside>
    </header>

    <section className="prototypeCoverage" aria-labelledby="coverage-title">
      <div className="prototypeSectionIntro"><p>01 / MODEL COVERAGE</p><h2 id="coverage-title">“主体装置”在这里有明确边界。</h2><div>下表描述当前可在线加载的 Paramak 演示包。EXL‑50U 与 ITER 使用各自独立的覆盖清单与授权状态；视觉完整感不能替代工程完整性。</div></div>
      <div className="prototypeCoverageGrid">{coverage.map(([state, system, note]) => <article className={state === '已包含' ? 'included' : 'missing'} key={system}><span>{state}</span><h3>{system}</h3><p>{note}</p></article>)}</div>
    </section>

    <MultiDeviceWorkspace />

    <section className="prototypeArchitecture" id="package-contract">
      <div className="prototypeSectionIntro"><p>02 / DIGITAL ASSET THREAD</p><h2>从模型版本到结果分析，一条可审计的数据主线。</h2><div>查看器只消费浏览器派生包；权威 CAD、原始网格、材料参数和受控 CAE 结果仍留在工程数据区。两者通过稳定部件 ID、装置基线与哈希互相校验。</div></div>
      <div className="prototypeLifecycle">{lifecycle.map(([id, title, copy]) => <article key={id}><span>{id}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
      <div className="prototypeTrustBand"><span>AUTHORITATIVE CAD</span><i>受控派生</i><span>DEVICE MANIFEST</span><i>稳定 ID 对齐</i><span>CAE FIELD PACKAGE</span><i>V&amp;V 证据门</i><span>ENGINEERING DECISION</span></div>
    </section>

    <section className="prototypeCae">
      <div className="prototypeSectionIntro"><p>03 / CAE RESULT ENTRY</p><h2>三维几何是入口，场结果与实验验证才形成工程闭环。</h2><div>下一步将以统一 ResultManifest 描述求解器、模型基线、载荷工况、网格、变量、单位、时间步和验证数据，并通过部件 ID 把结果加载到同一工作台。</div></div>
      <div className="prototypeCaeGrid">{caeLanes.map(([name, variables, copy], index) => <article key={name}><span>0{index + 1}</span><h3>{name}</h3><b>{variables}</b><p>{copy}</p><button type="button" disabled aria-label={`${name}结果入口规划中`}>RESULT ADAPTER / PLANNED</button></article>)}</div>
    </section>

    <section className="prototypeSwap" id="asset-policy">
      <div><p>04 / EXL‑50U ADAPTATION</p><h2>替换装置，而不是重写查看器。</h2></div>
      <ol>
        <li><b>批准与脱敏</b><span>从受控 CAD 基线导出获批的网页派生范围。</span></li>
        <li><b>几何治理</b><span>清理装配、建立稳定部件 ID、坐标单位与多级细节。</span></li>
        <li><b>生成装置包</b><span>输出 GLB、缩略图、DeviceManifest、哈希与许可声明。</span></li>
        <li><b>连接 CAE / 实验</b><span>按同一部件 ID 关联模型、场结果和传感器验证数据。</span></li>
        <li><b>分级发布</b><span>公开脱敏包与登录后的工程包使用相同界面、不同数据边界。</span></li>
      </ol>
      <div className="prototypeSwapLinks"><a href="/models/device-catalog.json">查看浏览器安全设备目录 ↗</a><a href="/models/paramak-full-device/model-manifest.json">查看 Paramak DeviceManifest ↗</a><a href="/models/device-manifest.schema.json">查看装置包 Schema ↗</a></div>
    </section>
    <SiteFooter />
  </main>;
}

import type { Metadata } from 'next';
import SiteFooter from '../components/SiteFooter';
import SiteNav from '../components/SiteNav';
import MultiDeviceWorkspace from './MultiDeviceWorkspace';
import { parseDeviceCatalog } from './deviceCatalog';
import deviceCatalogJson from '../../public/models/device-catalog.json';
import './prototype.css';
import './turntable.css';

export const metadata: Metadata = {
  title: '数字样机与 EFIT 工作台',
  description: 'FusionDigital 多装置数字样机工作台：装置切换、三维结构、部件交互、EFIT 位形与放电时序。',
};

export default function DigitalPrototypePage() {
  const deviceCatalog = parseDeviceCatalog(deviceCatalogJson);
  return <main className="prototypePage">
    <SiteNav active="prototype" />

    <header className="prototypeHero prototypeHero--compact">
      <div className="prototypeHeroCopy">
        <p>DIGITAL PROTOTYPE / 3D + EFIT</p>
        <h1>数字样机工作台</h1>
        <div className="prototypeLead">切换装置、浏览三维结构、控制部件与剖切面，并联动查看 EFIT 位形和放电时序。</div>
        <div className="prototypeHeroActions"><a href="#prototype-workspace">进入工作台</a><a href="/platform#contracts">查看接入合同</a></div>
      </div>
      <div className="prototypeHeroStatus" aria-label="当前工作台能力">
        <span><b>03</b>装置入口</span>
        <span><b>10</b>EFIT 炮号</span>
        <span><b>2 LOD</b>EXL‑50U 三维</span>
      </div>
    </header>

    <MultiDeviceWorkspace catalog={deviceCatalog} />

    <section className="prototypePlatformLink" aria-labelledby="prototype-platform-title">
      <div><p>PLATFORM INTEGRATION</p><h2 id="prototype-platform-title">接入新装置、实验数据或 CAE 结果</h2></div>
      <p>装置、坐标、炮号、模型、运行和结果使用统一的版本化合同；工程权威源与网页派生资产保持分离。</p>
      <a href="/platform#contracts">平台架构与技术路线 <span>→</span></a>
    </section>

    <SiteFooter />
  </main>;
}

import SiteFooter from '../components/SiteFooter';
import SiteNav from '../components/SiteNav';
import StaticLocaleContent from '../components/StaticLocaleContent';
import MultiDeviceWorkspace from './MultiDeviceWorkspace';
import { parseDeviceCatalog } from './deviceCatalog';
import deviceCatalogJson from '../../public/models/device-catalog.json';
import './prototype.css';
import './workspace-layout.css';
import './turntable.css';

const deviceCatalog = parseDeviceCatalog(deviceCatalogJson);

function DigitalPrototypeContent({ en }: { en: boolean }) {
  return <main className="prototypePage">
    <SiteNav active="prototype" />
    <header className="prototypeHero prototypeHero--compact">
      <div className="prototypeHeroCopy">
        <p>DIGITAL PROTOTYPE WORKSPACE</p>
        <h1>{en ? 'Explore the device. Understand the physics.' : '走进装置，理解物理。'}</h1>
        <div className="prototypeLead">{en
          ? 'Explore device geometry, equilibrium reconstruction and diagnostic views in one workspace. Each device retains its source, model status and access boundaries; these views do not operate a physical device.'
          : '在同一工作台中查看装置几何、平衡重建与诊断视图。每台装置保留来源、模型状态和访问边界；这些视图不操作真实装置。'}</div>
        <div className="prototypeHeroActions">
          <a href="#prototype-workspace">{en ? 'Open the workspace' : '进入工作台'} ↘</a>
          <a href="/explore">{en ? 'Explore knowledge & tools' : '探索知识与工具'} ↗</a>
        </div>
      </div>
    </header>
    <MultiDeviceWorkspace catalog={deviceCatalog} />
    <SiteFooter />
  </main>;
}

export default function DigitalPrototypePage() {
  return <StaticLocaleContent zh={<DigitalPrototypeContent en={false} />} en={<DigitalPrototypeContent en />} />;
}

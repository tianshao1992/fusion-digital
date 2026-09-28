import Link from 'next/link';
import SiteNav from '../../components/SiteNav';
import SiteFooter from '../../components/SiteFooter';
import StaticLocaleContent from '../../components/StaticLocaleContent';
import { FusionControlCase, FusionLearningLoop } from '../../components/home/FusionLanding';
import '../../portal.css';
import '../../home.css';

function CaseContent({ en }: { en: boolean }) {
  return <main className="portalPage editorialHome fusionHome fdDetailPage">
    <SiteNav active="control" />
    <header className="fdDetailHeader"><Link href="/">{en ? '← Home' : '← 返回首页'}</Link><p className="fdEyebrow">EXL-50U / CONTROL IN PRACTICE</p><h1>{en ? 'From digital twins to real-world control.' : '从数字孪生，走向真实控制。'}</h1><p>{en ? 'Experimental progress, data provenance and the learning loop behind the controller.' : '实验进展、统计依据，以及控制器背后的持续学习过程。'}</p></header>
    <FusionControlCase en={en} />
    <FusionLearningLoop en={en} />
    <div className="fdDetailNext"><a className="fdButton" href="/digital-prototype">{en ? 'Explore the device' : '探索数字样机'} ↗</a><a className="fdTextLink" href="/control">{en ? 'Control research' : '集成控制研究'} ↗</a></div>
    <SiteFooter />
  </main>;
}

export default function Exl50uCasePage() {
  return <StaticLocaleContent zh={<CaseContent en={false} />} en={<CaseContent en />} />;
}

import Link from 'next/link';
import SiteNav from '../components/SiteNav';
import SiteFooter from '../components/SiteFooter';
import StaticLocaleContent from '../components/StaticLocaleContent';
import { FusionPrinciples, FusionArchitecture } from '../components/home/FusionLanding';
import '../portal.css';
import '../home.css';

function VisionContent({ en }: { en: boolean }) {
  return <main className="portalPage editorialHome fusionHome fdDetailPage">
    <SiteNav />
    <header className="fdDetailHeader"><Link href="/">{en ? '← Home' : '← 返回首页'}</Link><p className="fdEyebrow">OUR APPROACH</p><h1>{en ? 'Intelligence, grounded in evidence.' : '让智能，建立在证据之上。'}</h1><p>{en ? 'Learn within constraints. Extend capability through validation. Evolve with every experiment.' : '在约束内学习，在验证中拓展能力，在运行中持续进化。'}</p></header>
    <FusionPrinciples en={en} />
    <FusionArchitecture en={en} />
    <div className="fdDetailNext"><a className="fdButton" href="/control/exl50u">{en ? 'See the EXL-50U case' : '查看 EXL-50U 应用案例'} ↗</a><a className="fdTextLink" href="/platform">{en ? 'Platform architecture & roadmap' : '平台架构与技术路线'} ↗</a></div>
    <SiteFooter />
  </main>;
}

export default function VisionPage() {
  return <StaticLocaleContent zh={<VisionContent en={false} />} en={<VisionContent en />} />;
}

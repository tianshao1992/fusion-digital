import SiteFooter from './components/SiteFooter';
import SiteNav from './components/SiteNav';
import StaticLocaleContent from './components/StaticLocaleContent';
import { FusionHero } from './components/home/FusionHero';
import HomeLegacyRedirect from './components/home/HomeLegacyRedirect';
import { capabilities } from './components/home/home-content';
import './portal.css';
import './home.css';

function HomeContent({ en }: { en: boolean }) {
  return <main className="portalPage editorialHome fusionHome fdCompactHome">
    <SiteNav active="home" />
    <HomeLegacyRedirect />
    <FusionHero en={en} />
    <section className="fdQuickStart" id="capabilities" aria-labelledby="capabilities-title">
      <div className="fdQuickHeading"><h2 id="capabilities-title">{en ? 'Choose your workspace.' : '从这里，开始探索。'}</h2><a href="/explore">{en ? 'All research fields' : '全部研究领域'} ↗</a></div>
      <div className="fdQuickGrid">{capabilities.map(item => <a href={item.href} key={item.id}><span className="fdQuickNumber">{item.id}</span><span><strong>{item.title[en ? 1 : 0]}</strong><small>{item.short[en ? 1 : 0]}</small></span><span className="fdQuickArrow" aria-hidden="true">↗</span></a>)}</div>
    </section>
    <section className="fdCaseTeaser" aria-label={en ? 'EXL-50U control case' : 'EXL-50U 控制案例'}>
      <div><span className="fdEyebrow">IN OPERATION / EXL-50U</span><h2>{en ? 'From learning to operation.' : '从学习，走向真实运行。'}</h2></div>
      <div className="fdTeaserMetric"><strong>750+</strong><span>{en ? 'Team-reported successful takeovers' : '团队提供的累计成功接管次数'}<small>{en ? 'Provisional · proposed cutoff 30 Sep 2026 · unverified' : '暂定口径 · 拟截至 2026.09.30 · 待核验'}</small></span></div>
      <a className="fdTextLink" href="/control/exl50u">{en ? 'Explore the case' : '查看完整案例'} ↗</a>
    </section>
    <SiteFooter />
  </main>;
}

export default function Home() {
  return <StaticLocaleContent zh={<HomeContent en={false} />} en={<HomeContent en />} />;
}

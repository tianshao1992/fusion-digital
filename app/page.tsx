import SiteFooter from './components/SiteFooter';
import SiteNav from './components/SiteNav';
import StaticLocaleContent from './components/StaticLocaleContent';
import { FusionHero } from './components/home/FusionHero';
import { FusionArchitecture, FusionControlCase, FusionLearningLoop, FusionPrinciples } from './components/home/FusionLanding';
import HomeLegacyRedirect from './components/home/HomeLegacyRedirect';
import { capabilities } from './components/home/home-content';
import './portal.css';
import './home.css';

function HomeContent({ en }: { en: boolean }) {
  return <main className="portalPage editorialHome fusionHome fdCompactHome">
    <SiteNav active="home" />
    <HomeLegacyRedirect />
    <FusionHero en={en} />
    <FusionPrinciples en={en} />
    <FusionArchitecture en={en} />
    <FusionControlCase en={en} compact />
    <FusionLearningLoop en={en} />
    <section className="fdQuickStart" id="capabilities" aria-labelledby="capabilities-title">
      <div className="fdQuickHeading"><h2 id="capabilities-title">{en ? 'Choose your workspace.' : '从这里，开始探索。'}</h2><a href="/explore">{en ? 'All research fields' : '全部研究领域'}</a></div>
      <div className="fdQuickGrid">{capabilities.map(item => <a href={item.href} key={item.id}><span className="fdQuickNumber">{item.id}</span><span><strong>{item.title[en ? 1 : 0]}</strong><small>{item.short[en ? 1 : 0]}</small></span></a>)}</div>
    </section>
    <SiteFooter />
  </main>;
}

export default function Home() {
  return <StaticLocaleContent zh={<HomeContent en={false} />} en={<HomeContent en />} />;
}

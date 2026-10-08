import SiteNav from './components/SiteNav';
import StaticLocaleContent from './components/StaticLocaleContent';
import FusionStory from './components/home/FusionStory';
import HomeLegacyRedirect from './components/home/HomeLegacyRedirect';
import './portal.css';

function HomeContent({ en }: { en: boolean }) {
  return <main className="portalPage storyHome">
    <SiteNav active="home" />
    <HomeLegacyRedirect />
    <FusionStory en={en} />
  </main>;
}

export default function Home() {
  return <StaticLocaleContent zh={<HomeContent en={false} />} en={<HomeContent en />} />;
}
